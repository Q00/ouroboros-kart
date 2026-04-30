import {
  createRaceSessionFromStartRoster,
  type RaceSession,
  type RaceSessionRacerState
} from "../race/raceSession";
import type { RacerInputState } from "../race/raceState";
import { createRaceStartRoster } from "../race/raceStartRoster";
import {
  RemoteKartInputSnapshotBuffer,
  createKartInputSnapshot,
  serializeKartInputSnapshot,
  type KartInputSnapshot
} from "./kartInputSnapshot";
import {
  RemoteKartInputDeltaQueue,
  createKartRemoteInputDeltaPacket,
  type KartRemoteInputDeltaPacket,
  type KartRemoteInputDeltaState
} from "./remoteInputDelta";
import {
  applyLatestReadyRemoteKartInput,
  applyReadyRemoteKartInputDeltas
} from "./remoteKartInputApplier";

const HOST_PEER_ID = "host-peer";
const GUEST_PEER_ID = "guest-peer";
const HOST_RACER_ID = "human_1";
const GUEST_RACER_ID = "human_2";

function main(): void {
  validateRemoteInputIsAppliedBeforeRaceTick();
  validateRemoteInputDeltaIsQueuedUntilHostTick();
  validateFutureRemoteInputDeltaWaitsForReadyTick();
  validateRemoteInputDeltaUseItemPulseSurvivesSameTickRelease();
  validateHostInputIsAppliedOnGuestClient();
  validateFutureRemoteInputWaitsForReadyTick();
  validateLocalLoopbackInputIsSkipped();
}

function validateRemoteInputIsAppliedBeforeRaceTick(): void {
  const raceSession = createMultiplayerRaceSession();
  const guestRacer = requireRacer(raceSession, GUEST_RACER_ID);
  const buffer = createGuestInputBuffer();

  acceptSnapshot(
    buffer,
    createSnapshot({
      peerId: GUEST_PEER_ID,
      racerId: GUEST_RACER_ID,
      sequence: 0,
      tickIndex: raceSession.nextTickIndex,
      input: {
        throttle: 0.25,
        steer: -0.4,
        useItem: true
      }
    })
  );
  acceptSnapshot(
    buffer,
    createSnapshot({
      peerId: GUEST_PEER_ID,
      racerId: GUEST_RACER_ID,
      sequence: 1,
      tickIndex: raceSession.nextTickIndex,
      input: {
        throttle: 1,
        steer: 0.65,
        useItem: false
      }
    })
  );

  const result = applyLatestReadyRemoteKartInput({
    raceSession,
    buffer,
    localPeerId: HOST_PEER_ID,
    maxTickIndex: raceSession.nextTickIndex
  });

  if (!result.applied) {
    throw new Error(`remote input should be applied: ${result.reason}`);
  }

  assertEqual(result.drainedSnapshotCount, 2, "all ready snapshots are drained");
  assertEqual(result.appliedInput.throttle, 1, "latest throttle is applied");
  assertEqual(result.appliedInput.steer, 0.65, "latest steering is applied");
  assertEqual(
    result.appliedInput.useItem,
    true,
    "item-use pulse is preserved across drained snapshots"
  );
  assertEqual(guestRacer.input.throttle, 1, "guest racer receives throttle");
  assertEqual(guestRacer.input.steer, 0.65, "guest racer receives steering");
  assertEqual(
    guestRacer.input.useItem,
    true,
    "guest racer receives item-use pulse"
  );

  const speedBeforeTick = guestRacer.speed;
  raceSession.tick(1 / 60);

  assert(guestRacer.speed > speedBeforeTick, "remote throttle drives simulation");
  assertEqual(guestRacer.updateCount, 1, "guest racer is advanced by tick");
}

function validateRemoteInputDeltaIsQueuedUntilHostTick(): void {
  const raceSession = createMultiplayerRaceSession();
  const guestRacer = requireRacer(raceSession, GUEST_RACER_ID);
  const queue = createGuestDeltaQueue();

  acceptDelta(
    queue,
    createDelta({
      sequence: 0,
      tickIndex: raceSession.nextTickIndex,
      delta: {
        throttle: 1,
        steer: 0.5
      }
    })
  );

  assertEqual(
    guestRacer.input.throttle,
    0,
    "queued delta does not mutate racer input before host tick"
  );

  const result = applyReadyRemoteKartInputDeltas({
    raceSession,
    queue,
    localPeerId: HOST_PEER_ID,
    maxTickIndex: raceSession.nextTickIndex
  });

  if (!result.applied) {
    throw new Error(`remote input delta should apply: ${result.reason}`);
  }

  assertEqual(result.drainedDeltaCount, 1, "ready delta is drained");
  assertEqual(result.appliedInput.throttle, 1, "delta throttle is applied");
  assertEqual(result.appliedInput.steer, 0.5, "delta steering is applied");
  assertEqual(guestRacer.input.throttle, 1, "guest racer receives delta throttle");
  assertEqual(guestRacer.input.steer, 0.5, "guest racer receives delta steering");

  const speedBeforeTick = guestRacer.speed;
  raceSession.tick(1 / 60, {
    controllerPaths: createHostControllerPaths(raceSession)
  });

  assert(guestRacer.speed > speedBeforeTick, "delta input drives host physics");
  assertEqual(guestRacer.updateCount, 1, "remote racer advances on host tick");
}

function validateFutureRemoteInputDeltaWaitsForReadyTick(): void {
  const raceSession = createMultiplayerRaceSession();
  const guestRacer = requireRacer(raceSession, GUEST_RACER_ID);
  const queue = createGuestDeltaQueue();

  acceptDelta(
    queue,
    createDelta({
      sequence: 0,
      tickIndex: raceSession.nextTickIndex + 3,
      delta: {
        throttle: 1
      }
    })
  );

  const earlyResult = applyReadyRemoteKartInputDeltas({
    raceSession,
    queue,
    localPeerId: HOST_PEER_ID,
    maxTickIndex: raceSession.nextTickIndex
  });

  if (earlyResult.applied) {
    throw new Error("future remote input delta should not apply early");
  }

  assertEqual(
    earlyResult.reason,
    "no-ready-delta",
    "future delta reports no ready delta"
  );
  assertEqual(queue.bufferedCount, 1, "future delta remains queued");
  assertEqual(guestRacer.input.throttle, 0, "guest input is unchanged early");

  const readyResult = applyReadyRemoteKartInputDeltas({
    raceSession,
    queue,
    localPeerId: HOST_PEER_ID,
    maxTickIndex: raceSession.nextTickIndex + 3
  });

  if (!readyResult.applied) {
    throw new Error(`future delta applies once ready: ${readyResult.reason}`);
  }

  assertEqual(guestRacer.input.throttle, 1, "ready delta updates racer");
}

function validateRemoteInputDeltaUseItemPulseSurvivesSameTickRelease(): void {
  const raceSession = createMultiplayerRaceSession();
  const guestRacer = requireRacer(raceSession, GUEST_RACER_ID);
  const queue = createGuestDeltaQueue();
  const readyTick = raceSession.nextTickIndex;

  acceptDelta(
    queue,
    createDelta({
      sequence: 0,
      tickIndex: readyTick,
      delta: {
        useItem: true
      }
    })
  );
  acceptDelta(
    queue,
    createDelta({
      sequence: 1,
      tickIndex: readyTick,
      delta: {
        useItem: false
      }
    })
  );

  const pulseResult = applyReadyRemoteKartInputDeltas({
    raceSession,
    queue,
    localPeerId: HOST_PEER_ID,
    maxTickIndex: readyTick
  });

  if (!pulseResult.applied) {
    throw new Error(`same-tick item pulse should apply: ${pulseResult.reason}`);
  }

  assertEqual(
    pulseResult.appliedInput.useItem,
    true,
    "same-tick press and release still emits one item pulse"
  );
  assertEqual(guestRacer.input.useItem, true, "racer receives item pulse");

  const resetResult = applyReadyRemoteKartInputDeltas({
    raceSession,
    queue,
    localPeerId: HOST_PEER_ID,
    maxTickIndex: readyTick + 1
  });

  if (!resetResult.applied) {
    throw new Error(`item pulse should reset on the next tick: ${resetResult.reason}`);
  }

  assertEqual(
    resetResult.drainedDeltaCount,
    0,
    "item pulse reset does not require another delta"
  );
  assertEqual(resetResult.appliedInput.useItem, false, "item pulse clears");
  assertEqual(guestRacer.input.useItem, false, "racer item input clears");
}

function validateHostInputIsAppliedOnGuestClient(): void {
  const raceSession = createMultiplayerRaceSession();
  const hostRacer = requireRacer(raceSession, HOST_RACER_ID);
  const buffer = createHostInputBuffer();

  acceptSnapshot(
    buffer,
    createSnapshot({
      peerId: HOST_PEER_ID,
      racerId: HOST_RACER_ID,
      sequence: 0,
      tickIndex: raceSession.nextTickIndex,
      input: {
        throttle: 0.75,
        steer: -0.5,
        drift: true
      }
    })
  );

  const result = applyLatestReadyRemoteKartInput({
    raceSession,
    buffer,
    localPeerId: GUEST_PEER_ID,
    maxTickIndex: raceSession.nextTickIndex
  });

  if (!result.applied) {
    throw new Error(`host input should apply on guest client: ${result.reason}`);
  }

  assertEqual(result.snapshot.racerId, HOST_RACER_ID, "host racer input is applied");
  assertEqual(hostRacer.input.throttle, 0.75, "guest client receives host throttle");
  assertEqual(hostRacer.input.steer, -0.5, "guest client receives host steering");
  assertEqual(hostRacer.input.drift, true, "guest client receives host drift");
}

function validateFutureRemoteInputWaitsForReadyTick(): void {
  const raceSession = createMultiplayerRaceSession();
  const guestRacer = requireRacer(raceSession, GUEST_RACER_ID);
  const buffer = createGuestInputBuffer();

  acceptSnapshot(
    buffer,
    createSnapshot({
      peerId: GUEST_PEER_ID,
      racerId: GUEST_RACER_ID,
      sequence: 0,
      tickIndex: raceSession.nextTickIndex + 4,
      input: {
        throttle: 1,
        steer: -1
      }
    })
  );

  const earlyResult = applyLatestReadyRemoteKartInput({
    raceSession,
    buffer,
    localPeerId: HOST_PEER_ID,
    maxTickIndex: raceSession.nextTickIndex
  });

  if (earlyResult.applied) {
    throw new Error("future remote input should not apply early");
  }

  assertEqual(
    earlyResult.reason,
    "no-ready-snapshot",
    "future input reports no ready snapshot"
  );
  assertEqual(buffer.bufferedCount, 1, "future input remains buffered");
  assertEqual(guestRacer.input.throttle, 0, "guest input is unchanged early");

  const readyResult = applyLatestReadyRemoteKartInput({
    raceSession,
    buffer,
    localPeerId: HOST_PEER_ID,
    maxTickIndex: raceSession.nextTickIndex + 4
  });

  if (!readyResult.applied) {
    throw new Error(`future remote input applies once ready: ${readyResult.reason}`);
  }

  assertEqual(guestRacer.input.throttle, 1, "ready input updates racer");
}

function validateLocalLoopbackInputIsSkipped(): void {
  const raceSession = createMultiplayerRaceSession();
  const hostRacer = requireRacer(raceSession, HOST_RACER_ID);
  const buffer = new RemoteKartInputSnapshotBuffer({
    expectedPeerId: HOST_PEER_ID,
    expectedRacerId: HOST_RACER_ID
  });

  acceptSnapshot(
    buffer,
    createSnapshot({
      peerId: HOST_PEER_ID,
      racerId: HOST_RACER_ID,
      sequence: 0,
      tickIndex: raceSession.nextTickIndex,
      input: {
        throttle: 1
      }
    })
  );

  const result = applyLatestReadyRemoteKartInput({
    raceSession,
    buffer,
    localPeerId: HOST_PEER_ID,
    maxTickIndex: raceSession.nextTickIndex
  });

  if (result.applied) {
    throw new Error("loopback input should be skipped");
  }

  assertEqual(result.reason, "local-loopback", "loopback reason is reported");
  assertEqual(hostRacer.input.throttle, 0, "host input is not overwritten");
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

function createGuestInputBuffer(): RemoteKartInputSnapshotBuffer {
  return new RemoteKartInputSnapshotBuffer({
    expectedPeerId: GUEST_PEER_ID,
    expectedRacerId: GUEST_RACER_ID
  });
}

function createHostInputBuffer(): RemoteKartInputSnapshotBuffer {
  return new RemoteKartInputSnapshotBuffer({
    expectedPeerId: HOST_PEER_ID,
    expectedRacerId: HOST_RACER_ID
  });
}

function createGuestDeltaQueue(): RemoteKartInputDeltaQueue {
  return new RemoteKartInputDeltaQueue({
    expectedPeerId: GUEST_PEER_ID,
    expectedRacerId: GUEST_RACER_ID
  });
}

function acceptSnapshot(
  buffer: RemoteKartInputSnapshotBuffer,
  snapshot: KartInputSnapshot
): void {
  const result = buffer.accept(serializeKartInputSnapshot(snapshot));

  assert(result.accepted, "snapshot should be accepted into remote buffer");
}

function acceptDelta(
  queue: RemoteKartInputDeltaQueue,
  packet: KartRemoteInputDeltaPacket
): void {
  const result = queue.accept(packet);

  assert(result.accepted, "delta should be accepted into remote queue");
}

function createSnapshot(options: {
  readonly peerId: string;
  readonly racerId: string;
  readonly sequence: number;
  readonly tickIndex: number;
  readonly input: Partial<RacerInputState>;
}): KartInputSnapshot {
  return createKartInputSnapshot({
    peerId: options.peerId,
    racerId: options.racerId,
    sequence: options.sequence,
    tickIndex: options.tickIndex,
    elapsedSeconds: options.tickIndex / 60,
    capturedAt: 1000 + options.sequence,
    input: createInput(options.input)
  });
}

function createDelta(options: {
  readonly sequence: number;
  readonly tickIndex: number;
  readonly delta: KartRemoteInputDeltaState;
}): KartRemoteInputDeltaPacket {
  return createKartRemoteInputDeltaPacket({
    peerId: GUEST_PEER_ID,
    racerId: GUEST_RACER_ID,
    sequence: options.sequence,
    timestamp: 1000 + options.sequence,
    sentAt: 1000 + options.sequence,
    tickIndex: options.tickIndex,
    elapsedSeconds: options.tickIndex / 60,
    delta: options.delta
  });
}

function createHostControllerPaths(
  raceSession: RaceSession
): ReadonlyMap<string, "local-input" | "remote-input" | "ai-driver"> {
  const paths = new Map<string, "local-input" | "remote-input" | "ai-driver">();

  for (const racer of raceSession.racerStates) {
    if (racer.controller === "ai") {
      paths.set(racer.id, "ai-driver");
    } else if (racer.id === HOST_RACER_ID) {
      paths.set(racer.id, "local-input");
    } else {
      paths.set(racer.id, "remote-input");
    }
  }

  return paths;
}

function createInput(input: Partial<RacerInputState>): RacerInputState {
  return {
    throttle: input.throttle ?? 0,
    brake: input.brake ?? 0,
    steer: input.steer ?? 0,
    drift: input.drift ?? false,
    useItem: input.useItem ?? false
  };
}

function requireRacer(
  raceSession: RaceSession,
  racerId: string
): RaceSessionRacerState {
  const racer = raceSession.getRacerState(racerId);

  if (racer === undefined) {
    throw new Error(`Expected racer to exist: ${racerId}.`);
  }

  return racer;
}

function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

main();
