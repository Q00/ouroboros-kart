import {
  createRaceSessionFromStartRoster,
  type RaceProgressSnapshot
} from "../race/raceSession";
import { createRaceStartRoster } from "../race/raceStartRoster";
import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  getKartGameplayPayloadType
} from "./kartInputSnapshot";
import {
  FixedKartAuthoritativePlayerSnapshotClock,
  LocalKartAuthoritativePlayerSnapshotEmitter,
  RemoteKartAuthoritativePlayerReconciler,
  RemoteKartAuthoritativePlayerSnapshotSynchronizer,
  createKartAuthoritativePlayerSnapshot,
  createKartAuthoritativePlayerStateFromRaceState,
  deserializeKartAuthoritativePlayerSnapshot,
  isKartAuthoritativePlayerSnapshotPayload,
  serializeKartAuthoritativePlayerSnapshot,
  type KartAuthoritativePlayerSnapshot
} from "./kartAuthoritativePlayerSnapshot";
import { createKartRacerTransformFromRaceState } from "./kartTransformSnapshot";

const HOST_PEER_ID = "host-peer";
const GUEST_PEER_ID = "guest-peer";
const GUEST_RACER_ID = "human_2";

function main(): void {
  validateFixedNetworkTickClock();
  validateAuthoritativePlayerSnapshotRoundTrip();
  validateFixedNetworkTickCaptureSerializesPlayerState();
  validateLocalEmitterSequencesAndAcknowledgesPeerInput();
  validateRemoteSynchronizerRecordsHostTickAndInputAckMetadata();
  validateRemoteSynchronizerRejectsOutOfOrderPlayerSnapshots();
  validateRemoteReconcilerEasesAuthoritativeTransformCorrections();
  validateAuthoritativePlayerSnapshotRejectsMismatchedState();
}

function validateFixedNetworkTickClock(): void {
  const clock = new FixedKartAuthoritativePlayerSnapshotClock({
    tickRateHz: 20
  });

  assertEqual(
    clock.consumeDueTick(0.049),
    null,
    "network clock waits until fixed tick boundary"
  );

  const firstTick = clock.consumeDueTick(0.05);

  assert(firstTick !== null, "network clock emits at fixed tick boundary");
  assertEqual(firstTick.tickIndex, 1, "first fixed network tick index");
  assertAlmostEqual(
    firstTick.elapsedSeconds,
    0.05,
    "first fixed network tick elapsed seconds"
  );

  const catchUpTick = clock.consumeDueTick(0.151);

  assert(
    catchUpTick !== null,
    "network clock emits the latest due tick after a render hitch"
  );
  assertEqual(catchUpTick.tickIndex, 3, "network clock skips stale due ticks");
  assertAlmostEqual(
    catchUpTick.elapsedSeconds,
    0.15,
    "network clock keeps fixed elapsed boundaries after catch-up"
  );
  assertEqual(
    clock.consumeDueTick(0.16),
    null,
    "network clock does not emit again before the next fixed boundary"
  );

  clock.reset();

  const resetTick = clock.consumeDueTick(0.05);

  assert(resetTick !== null, "network clock emits after reset");
  assertEqual(resetTick.tickIndex, 1, "network clock reset restores first tick");
}

function validateAuthoritativePlayerSnapshotRoundTrip(): void {
  const raceSession = createMultiplayerRaceSession();
  const guestRacer = requireRacer(raceSession, GUEST_RACER_ID);
  const guestProgress = requireRaceProgress(raceSession.raceProgress, GUEST_RACER_ID);
  const snapshot = createKartAuthoritativePlayerSnapshot({
    hostPeerId: HOST_PEER_ID,
    peerId: GUEST_PEER_ID,
    racerId: GUEST_RACER_ID,
    sequence: 7,
    hostTick: {
      tickIndex: 180,
      elapsedSeconds: 3
    },
    acknowledgedPeerInputSequence: 42,
    capturedAt: 9000,
    playerState: createKartAuthoritativePlayerStateFromRaceState(
      guestRacer,
      guestProgress
    )
  });
  const payload = serializeKartAuthoritativePlayerSnapshot(snapshot);
  const parsed = deserializeKartAuthoritativePlayerSnapshot(payload);

  assertEqual(
    parsed.type,
    KART_GAMEPLAY_MESSAGE_TYPES.AUTHORITATIVE_PLAYER_SNAPSHOT,
    "authoritative player snapshot type"
  );
  assertEqual(parsed.hostPeerId, HOST_PEER_ID, "host peer id round trips");
  assertEqual(parsed.peerId, GUEST_PEER_ID, "player peer id round trips");
  assertEqual(parsed.racerId, GUEST_RACER_ID, "racer id round trips");
  assertEqual(parsed.hostTick.tickIndex, 180, "host tick index round trips");
  assertEqual(
    parsed.hostTick.elapsedSeconds,
    3,
    "host elapsed seconds round trips"
  );
  assertEqual(
    parsed.acknowledgedPeerInputSequence,
    42,
    "acknowledged peer input sequence round trips"
  );
  assertEqual(
    parsed.playerState.transform.racerId,
    GUEST_RACER_ID,
    "authoritative transform state is present"
  );
  assertEqual(
    parsed.playerState.progress.rank,
    guestProgress.rank,
    "authoritative race progress state is present"
  );
  assert(isKartAuthoritativePlayerSnapshotPayload(payload), "valid payload is detected");
  assertEqual(
    getKartGameplayPayloadType(payload),
    KART_GAMEPLAY_MESSAGE_TYPES.AUTHORITATIVE_PLAYER_SNAPSHOT,
    "gameplay type peeking identifies authoritative player packets"
  );
}

function validateFixedNetworkTickCaptureSerializesPlayerState(): void {
  const raceSession = createMultiplayerRaceSession();
  const guestRacer = requireRacer(raceSession, GUEST_RACER_ID);
  const guestProgress = requireRaceProgress(raceSession.raceProgress, GUEST_RACER_ID);
  const clock = new FixedKartAuthoritativePlayerSnapshotClock({
    tickRateHz: 30
  });
  const payloads: string[] = [];
  const snapshots: KartAuthoritativePlayerSnapshot[] = [];
  const emitter = new LocalKartAuthoritativePlayerSnapshotEmitter({
    hostPeerId: HOST_PEER_ID,
    peerId: GUEST_PEER_ID,
    racerId: GUEST_RACER_ID,
    now: () => 14000,
    send: (payload, snapshot) => {
      payloads.push(payload);
      snapshots.push(snapshot);
      return true;
    }
  });
  const hostTick = clock.consumeDueTick(1 / 30);

  assert(hostTick !== null, "fixed network tick is due for capture");

  const snapshot = emitter.emit(
    hostTick,
    9,
    createKartAuthoritativePlayerStateFromRaceState(
      guestRacer,
      guestProgress
    )
  );

  assert(snapshot !== null, "authoritative player snapshot is emitted on tick");
  assertEqual(payloads.length, 1, "snapshot capture serializes one payload");
  assertEqual(
    payloads[0],
    serializeKartAuthoritativePlayerSnapshot(snapshot),
    "serialized payload matches captured authoritative player snapshot"
  );
  assertEqual(
    snapshots[0]?.hostTick.tickIndex,
    hostTick.tickIndex,
    "captured snapshot uses the fixed host network tick"
  );
  assertEqual(
    snapshots[0]?.acknowledgedPeerInputSequence,
    9,
    "captured snapshot includes latest applied peer input sequence"
  );
  assertEqual(
    snapshots[0]?.playerState.peerId,
    GUEST_PEER_ID,
    "captured snapshot is scoped to the remote human player"
  );
}

function validateLocalEmitterSequencesAndAcknowledgesPeerInput(): void {
  const raceSession = createMultiplayerRaceSession();
  const guestRacer = requireRacer(raceSession, GUEST_RACER_ID);
  const guestProgress = requireRaceProgress(raceSession.raceProgress, GUEST_RACER_ID);
  const payloads: string[] = [];
  const snapshots: KartAuthoritativePlayerSnapshot[] = [];
  const emitter = new LocalKartAuthoritativePlayerSnapshotEmitter({
    hostPeerId: HOST_PEER_ID,
    peerId: GUEST_PEER_ID,
    racerId: GUEST_RACER_ID,
    now: () => 12000,
    send: (payload, snapshot) => {
      payloads.push(payload);
      snapshots.push(snapshot);
      return true;
    }
  });
  const playerState = createKartAuthoritativePlayerStateFromRaceState(
    guestRacer,
    guestProgress
  );
  const first = emitter.emit(
    {
      tickIndex: 1,
      elapsedSeconds: 1 / 60
    },
    null,
    playerState
  );
  const second = emitter.emit(
    {
      tickIndex: 2,
      elapsedSeconds: 2 / 60
    },
    4,
    playerState
  );

  assert(first !== null, "first authoritative player snapshot is emitted");
  assert(second !== null, "second authoritative player snapshot is emitted");
  assertEqual(payloads.length, 2, "one payload is sent per authoritative update");
  assertEqual(snapshots[0]?.sequence, 0, "first sequence starts at zero");
  assertEqual(snapshots[1]?.sequence, 1, "second sequence increments");
  assertEqual(
    snapshots[0]?.acknowledgedPeerInputSequence,
    null,
    "missing peer input acknowledgement can be represented"
  );
  assertEqual(
    snapshots[1]?.acknowledgedPeerInputSequence,
    4,
    "latest applied peer input sequence is acknowledged"
  );
  assertEqual(snapshots[1]?.capturedAt, 12000, "captured timestamp is included");
}

function validateRemoteSynchronizerRecordsHostTickAndInputAckMetadata(): void {
  const synchronizer = new RemoteKartAuthoritativePlayerSnapshotSynchronizer({
    expectedHostPeerId: HOST_PEER_ID,
    expectedPeerId: GUEST_PEER_ID,
    expectedRacerId: GUEST_RACER_ID,
    maxBufferedSnapshots: 2
  });
  const firstSnapshot = createRemoteAuthoritativePlayerSnapshot(0, 12, null);
  const acceptedFirst = synchronizer.accept(
    serializeKartAuthoritativePlayerSnapshot(firstSnapshot),
    5000
  );

  assert(acceptedFirst.accepted, "first remote authoritative snapshot accepts");
  assertEqual(
    acceptedFirst.metadata.hostTick.tickIndex,
    12,
    "accepted metadata records the host tick index"
  );
  assertAlmostEqual(
    acceptedFirst.metadata.hostTick.elapsedSeconds,
    0.2,
    "accepted metadata records the host tick elapsed seconds"
  );
  assertEqual(
    acceptedFirst.metadata.acknowledgedPeerInputSequence,
    null,
    "accepted metadata records a missing input acknowledgement"
  );
  assertEqual(
    acceptedFirst.metadata.receivedAt,
    5000,
    "accepted metadata records the peer receive timestamp"
  );
  assertEqual(
    acceptedFirst.metadata.capturedAt,
    firstSnapshot.capturedAt,
    "accepted metadata records the host capture timestamp"
  );

  const secondSnapshot = createRemoteAuthoritativePlayerSnapshot(1, 13, 7);
  const acceptedSecond = synchronizer.accept(secondSnapshot, 5033);

  assert(acceptedSecond.accepted, "second remote authoritative snapshot accepts");
  assertEqual(
    acceptedSecond.metadata.acknowledgedPeerInputSequence,
    7,
    "accepted metadata records the acknowledged input sequence"
  );
  assertEqual(
    synchronizer.latestMetadata?.sequence,
    1,
    "latest metadata tracks the newest accepted snapshot"
  );
  assertEqual(
    synchronizer.metadataBuffer.length,
    2,
    "metadata buffer retains accepted reconciliation records"
  );

  const duplicate = synchronizer.accept(secondSnapshot, 5040);

  if (duplicate.accepted) {
    throw new Error("duplicate authoritative player snapshot should be rejected");
  }

  assertEqual(
    duplicate.reason,
    "duplicate-sequence",
    "duplicate authoritative player sequence is rejected"
  );

  const wrongHost = synchronizer.accept(
    {
      ...createRemoteAuthoritativePlayerSnapshot(2, 14, 8),
      hostPeerId: "wrong-host"
    },
    5060
  );

  if (wrongHost.accepted) {
    throw new Error("unexpected host authoritative player snapshot should be rejected");
  }

  assertEqual(
    wrongHost.reason,
    "unexpected-host",
    "unexpected authoritative player host is rejected"
  );

  const acceptedThird = synchronizer.accept(
    createRemoteAuthoritativePlayerSnapshot(2, 14, 8),
    5066
  );

  assert(acceptedThird.accepted, "third remote authoritative snapshot accepts");
  assertEqual(
    acceptedThird.droppedMetadata[0]?.sequence,
    0,
    "trimmed metadata keeps the dropped input acknowledgement record"
  );
  assertEqual(
    synchronizer.metadataBuffer[0]?.sequence,
    1,
    "metadata buffer trims old reconciliation records"
  );
  assertEqual(
    synchronizer.droppedCount,
    1,
    "remote synchronizer tracks dropped authoritative player snapshots"
  );

  const stale = synchronizer.accept(firstSnapshot, 5099);

  if (stale.accepted) {
    throw new Error("stale authoritative player snapshot should be rejected");
  }

  assertEqual(
    stale.reason,
    "stale-sequence",
    "stale authoritative player sequence is rejected after drop"
  );
}

function validateRemoteSynchronizerRejectsOutOfOrderPlayerSnapshots(): void {
  const synchronizer = new RemoteKartAuthoritativePlayerSnapshotSynchronizer({
    expectedHostPeerId: HOST_PEER_ID,
    expectedPeerId: GUEST_PEER_ID,
    expectedRacerId: GUEST_RACER_ID,
    maxBufferedSnapshots: 4
  });
  const newerSnapshot = createRemoteAuthoritativePlayerSnapshot(2, 14, 8);
  const acceptedNewer = synchronizer.accept(newerSnapshot, 7000);

  assert(acceptedNewer.accepted, "newer authoritative player snapshot accepts");
  assertEqual(
    acceptedNewer.metadata.sequence,
    2,
    "accepted metadata records the newer sequence"
  );
  assertEqual(
    acceptedNewer.metadata.capturedAt,
    newerSnapshot.capturedAt,
    "accepted metadata keeps the host timestamp"
  );
  assertEqual(
    acceptedNewer.metadata.receivedAt,
    7000,
    "accepted metadata keeps the local receive timestamp"
  );

  const lateOlderSnapshot = createRemoteAuthoritativePlayerSnapshot(1, 13, 7);
  const rejectedOlder = synchronizer.accept(lateOlderSnapshot, 7010);

  if (rejectedOlder.accepted) {
    throw new Error("out-of-order authoritative player snapshot should be rejected");
  }

  assertEqual(
    rejectedOlder.reason,
    "out-of-order-sequence",
    "older authoritative player sequence is rejected after a newer packet"
  );
  assertEqual(
    rejectedOlder.bufferedCount,
    1,
    "out-of-order packet does not enter the remote player buffer"
  );
  assertEqual(
    synchronizer.latestSnapshot?.sequence,
    2,
    "latest snapshot remains the newest accepted sequence"
  );
  assertEqual(
    synchronizer.metadataBuffer.length,
    1,
    "metadata buffer keeps only accepted player snapshots"
  );

  const nextSnapshot = createRemoteAuthoritativePlayerSnapshot(3, 15, 9);
  const acceptedNext = synchronizer.accept(nextSnapshot, 7020);

  assert(acceptedNext.accepted, "next in-order player snapshot accepts");
  assertEqual(
    synchronizer.metadataBuffer.map((metadata) => metadata.sequence).join(","),
    "2,3",
    "remote player buffer keeps accepted sequences in order"
  );
}

function validateRemoteReconcilerEasesAuthoritativeTransformCorrections(): void {
  const localSession = createMultiplayerRaceSession();
  const localGuest = requireRacer(localSession, GUEST_RACER_ID);
  const authoritativeSession = createMultiplayerRaceSession();
  const authoritativeGuest = requireRacer(authoritativeSession, GUEST_RACER_ID);
  const authoritativeHeading = Math.PI / 2;

  localGuest.position = { x: 0, y: 0.45, z: 0 };
  localGuest.velocity = { x: 0, y: 0, z: 0 };
  localGuest.headingRadians = 0;
  localGuest.forward = { x: 0, y: 0, z: 1 };
  localGuest.speed = 0;

  authoritativeGuest.position = { x: 12, y: 0.45, z: 0 };
  authoritativeGuest.velocity = { x: 24, y: 0, z: 0 };
  authoritativeGuest.headingRadians = authoritativeHeading;
  authoritativeGuest.forward = {
    x: Math.sin(authoritativeHeading),
    y: 0,
    z: Math.cos(authoritativeHeading)
  };
  authoritativeGuest.speed = 24;

  const authoritativeProgress = requireRaceProgress(
    authoritativeSession.raceProgress,
    GUEST_RACER_ID
  );
  const snapshot = createKartAuthoritativePlayerSnapshot({
    hostPeerId: HOST_PEER_ID,
    peerId: GUEST_PEER_ID,
    racerId: GUEST_RACER_ID,
    sequence: 9,
    hostTick: {
      tickIndex: 90,
      elapsedSeconds: 1.5
    },
    acknowledgedPeerInputSequence: 18,
    capturedAt: 14000,
    playerState: createKartAuthoritativePlayerStateFromRaceState(
      authoritativeGuest,
      authoritativeProgress
    )
  });
  const reconciler = new RemoteKartAuthoritativePlayerReconciler({
    smoothingSeconds: 0.12
  });
  const acceptedState = reconciler.accept(
    snapshot,
    createKartRacerTransformFromRaceState(localGuest)
  );

  assert(acceptedState !== null, "authoritative correction starts smoothing");
  assertEqual(acceptedState.sequence, 9, "correction records host sequence");
  assert(
    acceptedState.positionErrorMagnitude > 11.9,
    "correction records the prediction error"
  );

  const firstStep = reconciler.apply(
    createKartRacerTransformFromRaceState(localGuest),
    1 / 60
  );

  assert(firstStep.active, "first reconciliation step is active");
  assert(!firstStep.completed, "first step does not snap to the target");
  assert(
    firstStep.transform.position.x > localGuest.position.x &&
      firstStep.transform.position.x < authoritativeGuest.position.x,
    "position correction is eased between predicted and authoritative states"
  );
  assert(
    firstStep.transform.headingRadians > localGuest.headingRadians &&
      firstStep.transform.headingRadians < authoritativeHeading,
    "heading correction is eased between predicted and authoritative states"
  );

  localGuest.position = firstStep.transform.position;
  localGuest.velocity = firstStep.transform.velocity;
  localGuest.headingRadians = firstStep.transform.headingRadians;
  localGuest.forward = firstStep.transform.forward;
  localGuest.speed = firstStep.transform.speed;

  const finalStep = reconciler.apply(
    createKartRacerTransformFromRaceState(localGuest),
    0.12
  );

  assert(finalStep.completed, "correction finishes after the smoothing window");
  assertAlmostEqual(
    finalStep.transform.position.x,
    authoritativeGuest.position.x,
    "position converges to authoritative transform",
    0.000001
  );
  assertAlmostEqual(
    finalStep.transform.headingRadians,
    authoritativeHeading,
    "heading converges to authoritative rotation",
    0.000001
  );
}

function validateAuthoritativePlayerSnapshotRejectsMismatchedState(): void {
  const raceSession = createMultiplayerRaceSession();
  const guestRacer = requireRacer(raceSession, GUEST_RACER_ID);
  const guestProgress = requireRaceProgress(raceSession.raceProgress, GUEST_RACER_ID);
  const playerState = createKartAuthoritativePlayerStateFromRaceState(
    guestRacer,
    guestProgress
  );

  assertThrows(
    () =>
      createKartAuthoritativePlayerSnapshot({
        hostPeerId: HOST_PEER_ID,
        peerId: "wrong-peer",
        racerId: GUEST_RACER_ID,
        sequence: 1,
        hostTick: {
          tickIndex: 1,
          elapsedSeconds: 1 / 60
        },
        acknowledgedPeerInputSequence: 0,
        capturedAt: 1000,
        playerState
      }),
    "top-level peer id must match player state"
  );
  assertThrows(
    () =>
      createKartAuthoritativePlayerSnapshot({
        hostPeerId: HOST_PEER_ID,
        peerId: GUEST_PEER_ID,
        racerId: GUEST_RACER_ID,
        sequence: 1,
        hostTick: {
          tickIndex: 1,
          elapsedSeconds: 1 / 60
        },
        acknowledgedPeerInputSequence: -1,
        capturedAt: 1000,
        playerState
      }),
    "negative acknowledged input sequence is rejected"
  );
  assertThrows(
    () =>
      createKartAuthoritativePlayerSnapshot({
        hostPeerId: HOST_PEER_ID,
        peerId: GUEST_PEER_ID,
        racerId: GUEST_RACER_ID,
        sequence: 1,
        hostTick: {
          tickIndex: 1,
          elapsedSeconds: 1 / 60
        },
        acknowledgedPeerInputSequence: 0,
        capturedAt: 1000,
        playerState: {
          ...playerState,
          progress: {
            ...playerState.progress,
            checkpointIndex: playerState.progress.checkpointCount
          }
        }
      }),
    "invalid player progress state is rejected"
  );
}

function createRemoteAuthoritativePlayerSnapshot(
  sequence: number,
  hostTickIndex: number,
  acknowledgedPeerInputSequence: number | null
): KartAuthoritativePlayerSnapshot {
  const raceSession = createMultiplayerRaceSession();
  const guestRacer = requireRacer(raceSession, GUEST_RACER_ID);
  const guestProgress = requireRaceProgress(
    raceSession.raceProgress,
    GUEST_RACER_ID
  );

  return createKartAuthoritativePlayerSnapshot({
    hostPeerId: HOST_PEER_ID,
    peerId: GUEST_PEER_ID,
    racerId: GUEST_RACER_ID,
    sequence,
    hostTick: {
      tickIndex: hostTickIndex,
      elapsedSeconds: hostTickIndex / 60
    },
    acknowledgedPeerInputSequence,
    capturedAt: 10000 + sequence * 16,
    playerState: createKartAuthoritativePlayerStateFromRaceState(
      guestRacer,
      guestProgress
    )
  });
}

function createMultiplayerRaceSession() {
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
  raceSession: ReturnType<typeof createMultiplayerRaceSession>,
  racerId: string
) {
  const racer = raceSession.racerStates.find((entry) => entry.id === racerId);

  if (racer === undefined) {
    throw new Error(`Missing racer: ${racerId}`);
  }

  return racer;
}

function requireRaceProgress(
  snapshots: readonly RaceProgressSnapshot[],
  racerId: string
): RaceProgressSnapshot {
  const snapshot = snapshots.find((entry) => entry.racerId === racerId);

  if (snapshot === undefined) {
    throw new Error(`Missing race progress: ${racerId}`);
  }

  return snapshot;
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

function assertAlmostEqual(
  actual: number,
  expected: number,
  message: string,
  epsilon = 1e-9
): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertThrows(action: () => void, message: string): void {
  try {
    action();
  } catch {
    return;
  }

  throw new Error(message);
}

main();
