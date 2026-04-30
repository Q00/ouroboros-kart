import {
  createRaceSessionFromStartRoster,
  type RaceSession
} from "../race/raceSession";
import { createRaceStartRoster } from "../race/raceStartRoster";
import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  getKartGameplayPayloadType
} from "./kartInputSnapshot";
import {
  dispatchKartGameplayMessage,
  deserializeKartGameplayMessage,
  serializeKartGameplayMessage
} from "./gameplayMessage";
import {
  LocalKartOwnedTransformSnapshotEmitter,
  RemoteKartOwnedTransformSmoother,
  createKartOwnedTransformSnapshot,
  deserializeKartOwnedTransformSnapshot,
  isKartOwnedTransformSnapshotPayload,
  serializeKartOwnedTransformSnapshot,
  type KartOwnedTransformSnapshot
} from "./kartOwnedTransformSnapshot";
import { createKartRacerTransformFromRaceState } from "./kartTransformSnapshot";

const HOST_PEER_ID = "host-peer";
const GUEST_PEER_ID = "guest-peer";
const HOST_RACER_ID = "human_1";
const GUEST_RACER_ID = "human_2";

function main(): void {
  validateOwnedTransformRoundTrip();
  validateLocalEmitterSequencesAndTimestamps();
  validateRemoteOwnedTransformSmootherInterpolatesAndPredictsOpponentState();
  validateRemoteOwnedTransformSmootherFallsBackWhenPredictionIsStale();
  validateRemoteOwnedTransformSmootherRejectsUnexpectedOrStalePackets();
  validateGameplayDispatchRoutesOwnedTransforms();
}

function validateOwnedTransformRoundTrip(): void {
  const raceSession = createMultiplayerRaceSession();
  const racer = requireRacer(raceSession, HOST_RACER_ID);
  const snapshot = createKartOwnedTransformSnapshot({
    peerId: HOST_PEER_ID,
    racerId: HOST_RACER_ID,
    sequence: 3,
    tickIndex: 44,
    elapsedSeconds: 0.75,
    capturedAt: 1200,
    transform: createKartRacerTransformFromRaceState(racer)
  });
  const payload = serializeKartOwnedTransformSnapshot(snapshot);
  const parsed = deserializeKartOwnedTransformSnapshot(payload);

  assertEqual(
    snapshot.type,
    KART_GAMEPLAY_MESSAGE_TYPES.OWNED_TRANSFORM_SNAPSHOT,
    "owned transform type"
  );
  assertEqual(parsed.peerId, HOST_PEER_ID, "peer id round trips");
  assertEqual(parsed.racerId, HOST_RACER_ID, "racer id round trips");
  assertEqual(parsed.sequence, 3, "sequence round trips");
  assertEqual(parsed.tickIndex, 44, "tick index round trips");
  assertEqual(parsed.capturedAt, 1200, "captured timestamp round trips");
  assertEqual(
    parsed.transform.racerId,
    HOST_RACER_ID,
    "owned transform carries the local racer transform"
  );
  assert(isKartOwnedTransformSnapshotPayload(payload), "valid payload is detected");
  assertEqual(
    getKartGameplayPayloadType(payload),
    KART_GAMEPLAY_MESSAGE_TYPES.OWNED_TRANSFORM_SNAPSHOT,
    "gameplay type peeking identifies owned transform packets"
  );
  assertThrows(
    () =>
      createKartOwnedTransformSnapshot({
        ...snapshot,
        racerId: GUEST_RACER_ID
      }),
    "mismatched owner racer is rejected"
  );
}

function validateLocalEmitterSequencesAndTimestamps(): void {
  const raceSession = createMultiplayerRaceSession();
  const racer = requireRacer(raceSession, GUEST_RACER_ID);
  const payloads: string[] = [];
  const snapshots: KartOwnedTransformSnapshot[] = [];
  const emitter = new LocalKartOwnedTransformSnapshotEmitter({
    peerId: GUEST_PEER_ID,
    racerId: GUEST_RACER_ID,
    now: () => 2500,
    send: (payload, snapshot) => {
      payloads.push(payload);
      snapshots.push(snapshot);
      return true;
    }
  });

  raceSession.setHumanInput(GUEST_RACER_ID, {
    throttle: 1,
    steer: 0.35
  });
  const firstTick = raceSession.tick(1 / 60);
  const first = emitter.emit(
    {
      tickIndex: firstTick.tickIndex,
      elapsedSeconds: firstTick.elapsedSeconds
    },
    racer
  );
  const secondTick = raceSession.tick(1 / 60);
  const second = emitter.emit(
    {
      tickIndex: secondTick.tickIndex,
      elapsedSeconds: secondTick.elapsedSeconds
    },
    racer
  );

  assert(first !== null, "first owned transform is emitted");
  assert(second !== null, "second owned transform is emitted");
  assertEqual(payloads.length, 2, "one owned transform payload is sent per tick");
  assertEqual(snapshots[0]?.sequence, 0, "first sequence starts at zero");
  assertEqual(snapshots[1]?.sequence, 1, "second sequence increments");
  assertEqual(snapshots[1]?.capturedAt, 2500, "captured timestamp is included");
  assert(
    snapshots[1]?.transform.updateCount === racer.updateCount,
    "latest owned transform mirrors the local racer update count"
  );
}

function validateRemoteOwnedTransformSmootherInterpolatesAndPredictsOpponentState(): void {
  const smoother = new RemoteKartOwnedTransformSmoother({
    expectedPeerId: GUEST_PEER_ID,
    expectedRacerId: GUEST_RACER_ID,
    interpolationDelaySeconds: 0.1,
    maxPredictionSeconds: 0.12
  });

  acceptOwnedSnapshot(
    smoother,
    createOwnedTransformSnapshot({
      sequence: 0,
      tickIndex: 0,
      elapsedSeconds: 0,
      positionX: 0,
      velocityX: 10,
      headingRadians: 0,
      boostSeconds: 0.4
    }),
    1000
  );
  acceptOwnedSnapshot(
    smoother,
    createOwnedTransformSnapshot({
      sequence: 1,
      tickIndex: 6,
      elapsedSeconds: 0.1,
      positionX: 1,
      velocityX: 10,
      headingRadians: Math.PI / 2,
      boostSeconds: 0.3
    }),
    1100
  );

  const interpolated = smoother.sample(1150);

  assert(interpolated !== null, "interpolated opponent state is available");
  assertEqual(
    interpolated.racerId,
    GUEST_RACER_ID,
    "interpolated state keeps opponent racer id"
  );
  assertClose(interpolated.position.x, 0.5, 0.000001, "position interpolates");
  assertClose(
    interpolated.headingRadians,
    Math.PI / 4,
    0.000001,
    "heading interpolates across snapshots"
  );
  assertEqual(interpolated.interpolated, true, "state is flagged interpolated");
  assertEqual(interpolated.extrapolated, false, "state is not predicted yet");

  const predicted = smoother.sample(1400);

  assert(predicted !== null, "predicted opponent state is available");
  assertClose(
    predicted.position.x,
    2.2,
    0.000001,
    "prediction advances position with the capped velocity horizon"
  );
  assertClose(
    predicted.boostSeconds,
    0.1,
    0.000001,
    "timed effects decay across the full presentation horizon"
  );
  assertEqual(predicted.interpolated, false, "predicted state is not interpolated");
  assertEqual(predicted.extrapolated, true, "state is flagged predicted");
  assertEqual(predicted.stale, false, "short prediction gap is not stale");
}

function validateRemoteOwnedTransformSmootherFallsBackWhenPredictionIsStale(): void {
  const smoother = new RemoteKartOwnedTransformSmoother({
    expectedPeerId: GUEST_PEER_ID,
    expectedRacerId: GUEST_RACER_ID,
    interpolationDelaySeconds: 0.1,
    maxPredictionSeconds: 0.12,
    staleFallbackSeconds: 0.25
  });

  acceptOwnedSnapshot(
    smoother,
    createOwnedTransformSnapshot({
      sequence: 0,
      tickIndex: 0,
      elapsedSeconds: 0,
      positionX: 0,
      velocityX: 10,
      headingRadians: 0
    }),
    1000
  );
  acceptOwnedSnapshot(
    smoother,
    createOwnedTransformSnapshot({
      sequence: 1,
      tickIndex: 6,
      elapsedSeconds: 0.1,
      positionX: 1,
      velocityX: 10,
      headingRadians: Math.PI / 2
    }),
    1100
  );

  const shortGap = smoother.sample(1400);
  const stale = smoother.sample(1500);

  assert(shortGap !== null, "short prediction gap state is available");
  assert(stale !== null, "stale fallback state is available");
  assertClose(
    shortGap.position.x,
    2.2,
    0.000001,
    "short prediction gap advances by the capped horizon"
  );
  assertEqual(shortGap.extrapolated, true, "short prediction gap is predicted");
  assertEqual(shortGap.stale, false, "short prediction gap is not stale");
  assertClose(
    stale.position.x,
    shortGap.position.x,
    0.000001,
    "stale owned fallback freezes at the capped prediction point"
  );
  assertClose(stale.velocity.x, 0, 0.000001, "stale owned fallback clears velocity");
  assertClose(stale.speed, 0, 0.000001, "stale owned fallback clears speed");
  assertEqual(stale.interpolated, false, "stale owned fallback is not interpolation");
  assertEqual(stale.extrapolated, false, "stale owned fallback stops prediction");
  assertEqual(stale.stale, true, "stale owned fallback is marked stale");
}

function validateRemoteOwnedTransformSmootherRejectsUnexpectedOrStalePackets(): void {
  const smoother = new RemoteKartOwnedTransformSmoother({
    expectedPeerId: GUEST_PEER_ID,
    expectedRacerId: GUEST_RACER_ID,
    maxBufferedSnapshots: 1
  });

  const wrongPeer = smoother.accept(
    createOwnedTransformSnapshot({
      peerId: HOST_PEER_ID,
      racerId: HOST_RACER_ID,
      sequence: 0,
      tickIndex: 0,
      elapsedSeconds: 0,
      positionX: 0,
      velocityX: 0,
      headingRadians: 0
    }),
    1000
  );

  if (wrongPeer.accepted) {
    throw new Error("unexpected peer should be rejected");
  }

  assertEqual(
    wrongPeer.reason,
    "unexpected-peer",
    "unexpected owned transform peer is rejected"
  );

  acceptOwnedSnapshot(
    smoother,
    createOwnedTransformSnapshot({
      sequence: 1,
      tickIndex: 1,
      elapsedSeconds: 0.1,
      positionX: 1,
      velocityX: 5,
      headingRadians: 0
    }),
    1100
  );
  acceptOwnedSnapshot(
    smoother,
    createOwnedTransformSnapshot({
      sequence: 2,
      tickIndex: 2,
      elapsedSeconds: 0.2,
      positionX: 2,
      velocityX: 5,
      headingRadians: 0
    }),
    1200
  );

  assertEqual(
    smoother.bufferedCount,
    1,
    "owned transform buffer trims old snapshots"
  );
  assertEqual(smoother.droppedCount, 1, "dropped snapshot count is tracked");

  const stale = smoother.accept(
    createOwnedTransformSnapshot({
      sequence: 1,
      tickIndex: 1,
      elapsedSeconds: 0.1,
      positionX: 1,
      velocityX: 5,
      headingRadians: 0
    }),
    1300
  );

  if (stale.accepted) {
    throw new Error("stale owned transform should be rejected");
  }

  assertEqual(stale.reason, "stale-sequence", "stale sequence is rejected");
}

function validateGameplayDispatchRoutesOwnedTransforms(): void {
  const raceSession = createMultiplayerRaceSession();
  const racer = requireRacer(raceSession, HOST_RACER_ID);
  const snapshot = createKartOwnedTransformSnapshot({
    peerId: HOST_PEER_ID,
    racerId: HOST_RACER_ID,
    sequence: 5,
    tickIndex: 60,
    elapsedSeconds: 1,
    capturedAt: 3000,
    transform: createKartRacerTransformFromRaceState(racer)
  });
  const message = deserializeKartGameplayMessage(
    serializeKartGameplayMessage(snapshot)
  );
  const routed: string[] = [];
  const result = dispatchKartGameplayMessage(message, {
    onOwnedTransformSnapshot: (ownedTransform) => {
      routed.push(`${ownedTransform.peerId}:${ownedTransform.sequence}`);
    }
  });

  assert(result.dispatched, "owned transform is routed by gameplay dispatcher");
  assertEqual(
    routed[0],
    "host-peer:5",
    "owned transform handler receives sequence metadata"
  );
}

function createMultiplayerRaceSession(): RaceSession {
  return createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: HOST_PEER_ID,
        displayName: "Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: GUEST_PEER_ID,
        displayName: "Guest",
        slotIndex: 1,
        isHost: false
      }
    ])
  );
}

function requireRacer(
  raceSession: RaceSession,
  racerId: string
): RaceSession["racerStates"][number] {
  const racer = raceSession.getRacerState(racerId);

  if (racer === undefined) {
    throw new Error(`Missing racer: ${racerId}.`);
  }

  return racer;
}

function acceptOwnedSnapshot(
  smoother: RemoteKartOwnedTransformSmoother,
  snapshot: KartOwnedTransformSnapshot,
  receivedAt: number
): void {
  const result = smoother.accept(snapshot, receivedAt);

  assert(result.accepted, "owned transform should be accepted into smoother");
}

function createOwnedTransformSnapshot(options: {
  readonly peerId?: string;
  readonly racerId?: string;
  readonly sequence: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly positionX: number;
  readonly velocityX: number;
  readonly headingRadians: number;
  readonly boostSeconds?: number;
}): KartOwnedTransformSnapshot {
  const raceSession = createMultiplayerRaceSession();
  const racer = requireRacer(raceSession, options.racerId ?? GUEST_RACER_ID);
  const headingRadians = options.headingRadians;

  return createKartOwnedTransformSnapshot({
    peerId: options.peerId ?? GUEST_PEER_ID,
    racerId: options.racerId ?? GUEST_RACER_ID,
    sequence: options.sequence,
    tickIndex: options.tickIndex,
    elapsedSeconds: options.elapsedSeconds,
    capturedAt: 1000 + options.sequence,
    transform: {
      ...createKartRacerTransformFromRaceState(racer),
      position: {
        x: options.positionX,
        y: 0,
        z: 0
      },
      velocity: {
        x: options.velocityX,
        y: 0,
        z: 0
      },
      forward: {
        x: Math.sin(headingRadians),
        y: 0,
        z: Math.cos(headingRadians)
      },
      headingRadians,
      speed: Math.abs(options.velocityX),
      boostSeconds: options.boostSeconds ?? 0,
      updateCount: options.sequence
    }
  });
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertClose(
  actual: number,
  expected: number,
  epsilon: number,
  message: string
): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertThrows(action: () => void, message: string): void {
  let threw = false;

  try {
    action();
  } catch {
    threw = true;
  }

  if (!threw) {
    throw new Error(message);
  }
}

main();
