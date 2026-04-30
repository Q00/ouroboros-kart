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
  createKartTransformSnapshotFromRaceStateSnapshot,
  createKartRaceStateSnapshot,
  deserializeKartRaceStateSnapshot,
  isKartRaceStateSnapshotPayload,
  LocalKartRaceStateSnapshotEmitter,
  RemoteKartRaceStateSnapshotSynchronizer,
  type KartRaceStateSnapshot
} from "./kartRaceStateMessage";
import { RemoteKartTransformSmoother } from "./kartTransformSnapshot";

const HOST_PEER_ID = "host-peer";
const GUEST_PEER_ID = "guest-peer";
const HOST_RACER_ID = "human_1";

function main(): void {
  validateRaceStateSnapshotStreamsAuthoritativeGameplayState();
  validateRaceStateSynchronizerRejectsUnexpectedDuplicateAndStaleSnapshots();
  validateRaceStateSnapshotCanHydrateTransformSmoother();
}

function validateRaceStateSnapshotStreamsAuthoritativeGameplayState(): void {
  const raceSession = createMultiplayerRaceSession();
  const hostRacer = requireRacer(raceSession, HOST_RACER_ID);
  const payloads: string[] = [];
  const emitter = new LocalKartRaceStateSnapshotEmitter({
    hostPeerId: HOST_PEER_ID,
    now: () => 2400,
    send: (payload) => {
      payloads.push(payload);
      return true;
    }
  });

  hostRacer.heldItem = "shell";
  raceSession.tick(1 / 60);
  const emitted = emitter.emit(
    {
      tickIndex: 1,
      elapsedSeconds: 1 / 60
    },
    raceSession.phase,
    raceSession.trackMetadata.lapCount,
    raceSession.raceProgress,
    raceSession.racerStates,
    raceSession.itemPickupStates,
    [],
    [],
    [],
    [],
    raceSession.activeItemStates
  );

  assert(emitted !== null, "race-state snapshot is emitted");
  assertEqual(payloads.length, 1, "one race-state payload is sent");
  assertEqual(
    emitted.type,
    KART_GAMEPLAY_MESSAGE_TYPES.RACE_STATE_SNAPSHOT,
    "race-state snapshot has the expected gameplay type"
  );
  assertEqual(emitted.racers.length, 4, "all race progress entries stream");
  assertEqual(
    emitted.racerTransforms.length,
    4,
    "all racer transforms stream with race progress"
  );
  assertEqual(
    emitted.racerTransforms.find((racer) => racer.racerId === HOST_RACER_ID)
      ?.heldItem,
    "shell",
    "held item state streams with the racer transform"
  );
  assertEqual(
    emitted.itemPickups.length,
    raceSession.itemPickupStates.length,
    "item pickup cooldown state streams with race state"
  );
  const payload = payloads[0];

  assert(payload !== undefined, "serialized race-state payload is available");
  assert(isKartRaceStateSnapshotPayload(payload), "valid payload is detected");
  assertEqual(
    getKartGameplayPayloadType(payload),
    KART_GAMEPLAY_MESSAGE_TYPES.RACE_STATE_SNAPSHOT,
    "gameplay type peeking identifies race-state packets"
  );

  const parsed = deserializeKartRaceStateSnapshot(payload);

  assertEqual(parsed.sequence, 0, "race-state sequence starts at zero");
  assertEqual(
    parsed.racerTransforms[0]?.racerId,
    emitted.racerTransforms[0]?.racerId,
    "serialized payload keeps synchronized transforms"
  );
}

function validateRaceStateSynchronizerRejectsUnexpectedDuplicateAndStaleSnapshots(): void {
  const synchronizer = new RemoteKartRaceStateSnapshotSynchronizer({
    expectedHostPeerId: HOST_PEER_ID,
    maxBufferedSnapshots: 1
  });
  const first = createSnapshot(0);
  const wrongHost = synchronizer.accept({
    ...first,
    hostPeerId: GUEST_PEER_ID
  });

  if (wrongHost.accepted) {
    throw new Error("unexpected host should be rejected");
  }

  assertEqual(
    wrongHost.reason,
    "unexpected-host",
    "unexpected host race-state snapshot is rejected"
  );

  const acceptedFirst = synchronizer.accept(first, 1000);

  assert(acceptedFirst.accepted, "first race-state snapshot accepts");

  const duplicate = synchronizer.accept(first, 1010);

  if (duplicate.accepted) {
    throw new Error("duplicate sequence should be rejected");
  }

  assertEqual(
    duplicate.reason,
    "duplicate-sequence",
    "duplicate race-state sequence is rejected"
  );

  const second = synchronizer.accept(createSnapshot(1), 1020);

  assert(second.accepted, "second race-state snapshot accepts");
  assertEqual(
    synchronizer.bufferedCount,
    1,
    "race-state synchronizer trims old snapshots"
  );
  assertEqual(
    synchronizer.droppedCount,
    1,
    "race-state synchronizer tracks dropped snapshots"
  );

  const stale = synchronizer.accept(first, 1030);

  if (stale.accepted) {
    throw new Error("stale sequence should be rejected");
  }

  assertEqual(
    stale.reason,
    "stale-sequence",
    "stale race-state sequence is rejected after drop"
  );
}

function validateRaceStateSnapshotCanHydrateTransformSmoother(): void {
  const smoother = new RemoteKartTransformSmoother({
    expectedHostPeerId: HOST_PEER_ID,
    interpolationDelaySeconds: 0,
    maxExtrapolationSeconds: 0.12
  });
  const firstTransform = createKartTransformSnapshotFromRaceStateSnapshot(
    createSnapshot(0, 0)
  );
  const secondTransform = createKartTransformSnapshotFromRaceStateSnapshot(
    createSnapshot(1, 3)
  );

  assertEqual(
    firstTransform.racers.length,
    4,
    "race-state snapshot converts to a full transform snapshot"
  );
  assert(
    smoother.accept(JSON.stringify(firstTransform), 1000).accepted,
    "first converted transform snapshot accepts"
  );
  assert(
    smoother.accept(JSON.stringify(secondTransform), 1100).accepted,
    "second converted transform snapshot accepts"
  );

  const sampled = smoother.sample(1150).get(HOST_RACER_ID);

  assert(sampled !== undefined, "converted race-state transforms are sampled");
  assert(
    sampled.position.x > 0,
    "sampled transform advances from synchronized race-state positions"
  );
}

function createSnapshot(
  sequence: number,
  hostPositionX = 0
): KartRaceStateSnapshot {
  const raceSession = createMultiplayerRaceSession();
  const hostRacer = requireRacer(raceSession, HOST_RACER_ID);

  hostRacer.position = {
    ...hostRacer.position,
    x: hostPositionX
  };
  hostRacer.velocity = {
    ...hostRacer.velocity,
    x: 30
  };

  const emitted = new LocalKartRaceStateSnapshotEmitter({
    hostPeerId: HOST_PEER_ID,
    now: () => 1200 + sequence * 16,
    send: () => true
  }).emit(
    {
      tickIndex: sequence,
      elapsedSeconds: sequence / 60
    },
    raceSession.phase,
    raceSession.trackMetadata.lapCount,
    raceSession.raceProgress,
    raceSession.racerStates,
    raceSession.itemPickupStates,
    [],
    [],
    [],
    [],
    raceSession.activeItemStates
  );

  assert(emitted !== null, "test race-state snapshot is emitted");

  return createKartRaceStateSnapshot({
    ...emitted,
    sequence
  });
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
    throw new Error(`Missing racer: ${racerId}`);
  }

  return racer;
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

main();
