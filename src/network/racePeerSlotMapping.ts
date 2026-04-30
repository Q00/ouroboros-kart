import { HUMAN_RACER_SLOT_COUNT } from "../config/gameConfig";
import type { HumanRaceStartRacerInput } from "../race/raceStartRoster";
import type {
  SignalingPeerId,
  SignalingRoomPeer,
  SignalingRoomSnapshot
} from "./signaling";

export const HOST_HUMAN_RACER_SLOT_INDEX = 0 as const;
export const GUEST_HUMAN_RACER_SLOT_INDEX = 1 as const;

export interface HumanPeerRaceSlotAssignment {
  readonly peerId: SignalingPeerId;
  readonly displayName: string;
  readonly slotIndex: number;
  readonly isHost: boolean;
}

export interface HumanPeerRaceSlotMappingOptions {
  readonly allowSingleHuman?: boolean;
}

export class HumanPeerRaceSlotMappingError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "HumanPeerRaceSlotMappingError";
  }
}

export function createHumanPeerRaceSlotAssignmentsFromRoomSnapshot(
  snapshot: SignalingRoomSnapshot,
  options: HumanPeerRaceSlotMappingOptions = {}
): readonly HumanPeerRaceSlotAssignment[] {
  assertTwoHumanSlotsAvailable();

  const hostPeer = requireHostPeer(snapshot);
  const guestPeer = resolveGuestPeer(snapshot);
  const assignments: HumanPeerRaceSlotAssignment[] = [
    createAssignment(hostPeer, HOST_HUMAN_RACER_SLOT_INDEX, true)
  ];

  if (guestPeer !== null) {
    assignments.push(
      createAssignment(guestPeer, GUEST_HUMAN_RACER_SLOT_INDEX, false)
    );
  } else if (options.allowSingleHuman !== true) {
    throw new HumanPeerRaceSlotMappingError(
      `Room ${snapshot.roomId} must include both host and guest peers before race setup.`
    );
  }

  assertHumanPeerRaceSlotAssignments(assignments, options);
  return assignments;
}

export function createHumanRaceStartRacersFromRoomSnapshot(
  snapshot: SignalingRoomSnapshot,
  options: HumanPeerRaceSlotMappingOptions = {}
): readonly HumanRaceStartRacerInput[] {
  return createHumanPeerRaceSlotAssignmentsFromRoomSnapshot(
    snapshot,
    options
  ).map((assignment) => ({
    peerId: assignment.peerId,
    displayName: assignment.displayName,
    slotIndex: assignment.slotIndex,
    isHost: assignment.isHost
  }));
}

function assertTwoHumanSlotsAvailable(): void {
  if (HUMAN_RACER_SLOT_COUNT < 2) {
    throw new HumanPeerRaceSlotMappingError(
      "Race setup requires at least two configured human racer slots."
    );
  }
}

function requireHostPeer(
  snapshot: SignalingRoomSnapshot
): SignalingRoomPeer {
  const hostPeer = snapshot.peers.find(
    (peer) => peer.peerId === snapshot.hostPeerId
  );

  if (hostPeer === undefined || hostPeer.role !== "host") {
    throw new HumanPeerRaceSlotMappingError(
      `Room ${snapshot.roomId} does not include its declared host peer.`
    );
  }

  return hostPeer;
}

function resolveGuestPeer(
  snapshot: SignalingRoomSnapshot
): SignalingRoomPeer | null {
  const guestPeers = snapshot.peers.filter((peer) => peer.role === "guest");

  if (guestPeers.length > 1) {
    throw new HumanPeerRaceSlotMappingError(
      `Room ${snapshot.roomId} has more than one guest peer.`
    );
  }

  if (snapshot.guestPeerId === undefined) {
    return guestPeers[0] ?? null;
  }

  const declaredGuestPeer = snapshot.peers.find(
    (peer) => peer.peerId === snapshot.guestPeerId
  );

  if (declaredGuestPeer === undefined || declaredGuestPeer.role !== "guest") {
    throw new HumanPeerRaceSlotMappingError(
      `Room ${snapshot.roomId} does not include its declared guest peer.`
    );
  }

  if (
    guestPeers.length === 1 &&
    guestPeers[0]?.peerId !== declaredGuestPeer.peerId
  ) {
    throw new HumanPeerRaceSlotMappingError(
      `Room ${snapshot.roomId} guest peer role does not match guestPeerId.`
    );
  }

  return declaredGuestPeer;
}

function createAssignment(
  peer: SignalingRoomPeer,
  slotIndex: number,
  isHost: boolean
): HumanPeerRaceSlotAssignment {
  return {
    peerId: peer.peerId,
    displayName: peer.displayName,
    slotIndex,
    isHost
  };
}

function assertHumanPeerRaceSlotAssignments(
  assignments: readonly HumanPeerRaceSlotAssignment[],
  options: HumanPeerRaceSlotMappingOptions
): void {
  const minimumHumanCount = options.allowSingleHuman === true ? 1 : 2;

  if (assignments.length < minimumHumanCount || assignments.length > 2) {
    throw new HumanPeerRaceSlotMappingError(
      `Expected ${minimumHumanCount}-2 human peer slot assignment(s), found ${assignments.length}.`
    );
  }

  const peerIds = new Set<SignalingPeerId>();
  const slotIndexes = new Set<number>();

  for (const assignment of assignments) {
    if (
      assignment.slotIndex < 0 ||
      assignment.slotIndex >= HUMAN_RACER_SLOT_COUNT
    ) {
      throw new HumanPeerRaceSlotMappingError(
        `Human peer ${assignment.peerId} was assigned invalid racer slot ${assignment.slotIndex}.`
      );
    }

    if (peerIds.has(assignment.peerId)) {
      throw new HumanPeerRaceSlotMappingError(
        `Duplicate human peer in race slot mapping: ${assignment.peerId}.`
      );
    }

    if (slotIndexes.has(assignment.slotIndex)) {
      throw new HumanPeerRaceSlotMappingError(
        `Duplicate human racer slot in peer mapping: ${assignment.slotIndex}.`
      );
    }

    peerIds.add(assignment.peerId);
    slotIndexes.add(assignment.slotIndex);
  }

  const hostAssignment = assignments.find((assignment) => assignment.isHost);
  const guestAssignment = assignments.find((assignment) => !assignment.isHost);

  if (hostAssignment?.slotIndex !== HOST_HUMAN_RACER_SLOT_INDEX) {
    throw new HumanPeerRaceSlotMappingError(
      `Host peer must be assigned racer slot ${HOST_HUMAN_RACER_SLOT_INDEX}.`
    );
  }

  if (
    guestAssignment !== undefined &&
    guestAssignment.slotIndex !== GUEST_HUMAN_RACER_SLOT_INDEX
  ) {
    throw new HumanPeerRaceSlotMappingError(
      `Guest peer must be assigned racer slot ${GUEST_HUMAN_RACER_SLOT_INDEX}.`
    );
  }

  if (options.allowSingleHuman !== true && guestAssignment === undefined) {
    throw new HumanPeerRaceSlotMappingError(
      "Guest peer slot assignment is required."
    );
  }
}
