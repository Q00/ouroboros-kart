import { RACE_CAPACITY } from "../config/gameConfig";
import { createRaceSessionFromStartRoster } from "../race/raceSession";
import { createMultiplayerRaceStartRoster } from "../race/raceStartRoster";
import {
  SIGNALING_ROOM_CAPACITY,
  type SignalingRoomPeer,
  type SignalingRoomSnapshot
} from "./signaling";
import {
  GUEST_HUMAN_RACER_SLOT_INDEX,
  HOST_HUMAN_RACER_SLOT_INDEX,
  HumanPeerRaceSlotMappingError,
  createHumanPeerRaceSlotAssignmentsFromRoomSnapshot,
  createHumanRaceStartRacersFromRoomSnapshot
} from "./racePeerSlotMapping";

const HOST_PEER_ID = "host-peer";
const GUEST_PEER_ID = "guest-peer";
const ROOM_ID = "ROOM42";

export function validateHumanPeerRaceSlotMapping(): void {
  const fullRoom = createRoomSnapshot({ includeGuest: true, reversePeerOrder: true });
  const assignments =
    createHumanPeerRaceSlotAssignmentsFromRoomSnapshot(fullRoom);

  assertEqual(assignments.length, 2, "full room assigns two human peers");
  assertEqual(
    assignments[0]?.peerId,
    HOST_PEER_ID,
    "host assignment is first and deterministic"
  );
  assertEqual(
    assignments[0]?.slotIndex,
    HOST_HUMAN_RACER_SLOT_INDEX,
    "host maps to human racer slot 0"
  );
  assertEqual(
    assignments[1]?.peerId,
    GUEST_PEER_ID,
    "guest assignment is second and deterministic"
  );
  assertEqual(
    assignments[1]?.slotIndex,
    GUEST_HUMAN_RACER_SLOT_INDEX,
    "guest maps to human racer slot 1"
  );

  const raceStartHumans = createHumanRaceStartRacersFromRoomSnapshot(fullRoom);
  const roster = createMultiplayerRaceStartRoster(raceStartHumans);
  const raceSession = createRaceSessionFromStartRoster(roster);
  const hostRacer = raceSession.getRacerStateBySlot(HOST_HUMAN_RACER_SLOT_INDEX);
  const guestRacer = raceSession.getRacerStateBySlot(GUEST_HUMAN_RACER_SLOT_INDEX);

  assertEqual(roster.racers.length, RACE_CAPACITY, "race setup keeps four racers");
  assertEqual(roster.humanRacerCount, 2, "race setup uses two human racers");
  assertEqual(roster.aiRacerCount, 2, "race setup fills remaining slots with AI");
  assertEqual(
    hostRacer?.peerId,
    HOST_PEER_ID,
    "host peer id is injected into racer slot 0"
  );
  assertEqual(
    hostRacer?.id,
    "human_1",
    "host receives stable slot-0 racer id"
  );
  assertEqual(
    guestRacer?.peerId,
    GUEST_PEER_ID,
    "guest peer id is injected into racer slot 1"
  );
  assertEqual(
    guestRacer?.id,
    "human_2",
    "guest receives stable slot-1 racer id"
  );
  assertEqual(
    raceSession.getRacerStateBySlot(2)?.controller,
    "ai",
    "AI remains assigned to racer slot 2"
  );
  assertEqual(
    raceSession.getRacerStateBySlot(3)?.controller,
    "ai",
    "AI remains assigned to racer slot 3"
  );

  assertThrowsSlotMappingError(
    () => createHumanRaceStartRacersFromRoomSnapshot(createRoomSnapshot({ includeGuest: false })),
    "strict multiplayer setup rejects host-only room snapshots"
  );

  const hostOnlyHumans = createHumanRaceStartRacersFromRoomSnapshot(
    createRoomSnapshot({ includeGuest: false }),
    { allowSingleHuman: true }
  );
  const allowedFullRoomHumans = createHumanRaceStartRacersFromRoomSnapshot(
    fullRoom,
    { allowSingleHuman: true }
  );

  assertEqual(hostOnlyHumans.length, 1, "explicit single-human setup is preserved");
  assertEqual(
    hostOnlyHumans[0]?.slotIndex,
    HOST_HUMAN_RACER_SLOT_INDEX,
    "single-human setup still uses host slot"
  );
  assertEqual(
    allowedFullRoomHumans.length,
    2,
    "single-human allowance still accepts complete multiplayer room"
  );

  assertThrowsSlotMappingError(
    () =>
      createHumanRaceStartRacersFromRoomSnapshot({
        ...fullRoom,
        guestPeerId: "missing-guest"
      }),
    "declared guest peer must be present before race setup"
  );
}

function createRoomSnapshot(options: {
  readonly includeGuest: boolean;
  readonly reversePeerOrder?: boolean;
}): SignalingRoomSnapshot {
  const now = 1_000;
  const hostPeer: SignalingRoomPeer = {
    peerId: HOST_PEER_ID,
    displayName: "Host",
    role: "host",
    joinedAt: now
  };
  const guestPeer: SignalingRoomPeer = {
    peerId: GUEST_PEER_ID,
    displayName: "Guest",
    role: "guest",
    joinedAt: now + 1
  };
  const peers = options.includeGuest
    ? options.reversePeerOrder === true
      ? [guestPeer, hostPeer]
      : [hostPeer, guestPeer]
    : [hostPeer];

  if (options.includeGuest) {
    return {
      roomId: ROOM_ID,
      capacity: SIGNALING_ROOM_CAPACITY,
      peerCount: peers.length,
      isOpen: false,
      createdAt: now,
      updatedAt: now + 1,
      hostPeerId: HOST_PEER_ID,
      guestPeerId: GUEST_PEER_ID,
      peers
    };
  }

  return {
    roomId: ROOM_ID,
    capacity: SIGNALING_ROOM_CAPACITY,
    peerCount: peers.length,
    isOpen: true,
    createdAt: now,
    updatedAt: now,
    hostPeerId: HOST_PEER_ID,
    peers
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, received ${String(actual)}.`
    );
  }
}

function assertThrowsSlotMappingError(action: () => void, message: string): void {
  try {
    action();
  } catch (error) {
    if (error instanceof HumanPeerRaceSlotMappingError) {
      return;
    }

    throw error;
  }

  throw new Error(message);
}

void Promise.resolve()
  .then(() => {
    validateHumanPeerRaceSlotMapping();
    console.info("Human peer race slot mapping validation passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
