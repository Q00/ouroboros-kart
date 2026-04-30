import {
  canAcceptWebRtcOfferForPeer,
  createWebRtcRacePeerPlan,
  WebRtcRacePeerRoleError,
} from "./webrtcRacePeerRole";
import {
  SIGNALING_ROOM_CAPACITY,
  type SignalingRoomPeer,
  type SignalingRoomSnapshot,
} from "./signaling";

const HOST_PEER_ID = "host-peer";
const CLIENT_PEER_ID = "client-peer";
const ROOM_ID = "ROOM42";

export function validateWebRtcRacePeerRolePlanning(): void {
  const waitingHostPlan = createWebRtcRacePeerPlan(
    createRoomSnapshot({ includeClient: false }),
    HOST_PEER_ID,
  );

  assertEqual(waitingHostPlan.localRole, "host", "host role is derived from snapshot host");
  assertEqual(
    waitingHostPlan.readiness,
    "waiting-for-client",
    "host waits before second peer joins",
  );
  assertEqual(waitingHostPlan.remotePeerId, null, "waiting host has no remote peer");
  assertEqual(waitingHostPlan.createsOffer, false, "waiting host does not create an offer");

  const hostPlan = createWebRtcRacePeerPlan(
    createRoomSnapshot({ includeClient: true }),
    HOST_PEER_ID,
  );

  assertEqual(hostPlan.localRole, "host", "host keeps host role in full room");
  assertEqual(hostPlan.remotePeerId, CLIENT_PEER_ID, "host targets client peer");
  assertEqual(hostPlan.remoteRole, "client", "host remote role is client");
  assertEqual(hostPlan.createsOffer, true, "only host creates the WebRTC offer");
  assertEqual(hostPlan.readiness, "ready", "two-peer host plan is ready");

  const clientPlan = createWebRtcRacePeerPlan(
    createRoomSnapshot({ includeClient: true }),
    CLIENT_PEER_ID,
  );

  assertEqual(clientPlan.localRole, "client", "guest maps to WebRTC client role");
  assertEqual(clientPlan.remotePeerId, HOST_PEER_ID, "client targets host peer");
  assertEqual(clientPlan.remoteRole, "host", "client remote role is host");
  assertEqual(clientPlan.createsOffer, false, "client never creates the WebRTC offer");
  assert(
    canAcceptWebRtcOfferForPeer(clientPlan, HOST_PEER_ID, CLIENT_PEER_ID),
    "client accepts host offer addressed to itself",
  );
  assert(
    canAcceptWebRtcOfferForPeer(clientPlan, HOST_PEER_ID, undefined),
    "client accepts host offer with implicit room routing",
  );
  assert(
    !canAcceptWebRtcOfferForPeer(clientPlan, "intruder-peer", CLIENT_PEER_ID),
    "client rejects offers from non-host peers",
  );
  assert(
    !canAcceptWebRtcOfferForPeer(hostPlan, CLIENT_PEER_ID, HOST_PEER_ID),
    "host rejects inbound offers",
  );

  assertThrowsRoleError(() => {
    createWebRtcRacePeerPlan(createRoomSnapshot({ includeClient: true }), "spectator-peer");
  }, "spectator peers are rejected");

  assertThrowsRoleError(() => {
    createWebRtcRacePeerPlan(
      {
        ...createRoomSnapshot({ includeClient: true }),
        guestPeerId: "missing-client",
      },
      HOST_PEER_ID,
    );
  }, "declared guest peer must match snapshot peers");
}

function createRoomSnapshot(options: {
  readonly includeClient: boolean;
}): SignalingRoomSnapshot {
  const now = 1_000;
  const hostPeer: SignalingRoomPeer = {
    peerId: HOST_PEER_ID,
    displayName: "Host",
    role: "host",
    joinedAt: now,
  };
  const clientPeer: SignalingRoomPeer = {
    peerId: CLIENT_PEER_ID,
    displayName: "Client",
    role: "guest",
    joinedAt: now + 1,
  };
  const peers: readonly SignalingRoomPeer[] = options.includeClient
    ? [hostPeer, clientPeer]
    : [hostPeer];

  if (options.includeClient) {
    return {
      roomId: ROOM_ID,
      capacity: SIGNALING_ROOM_CAPACITY,
      peerCount: peers.length,
      isOpen: false,
      createdAt: now,
      updatedAt: now + 1,
      hostPeerId: HOST_PEER_ID,
      guestPeerId: CLIENT_PEER_ID,
      peers,
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
    peers,
  };
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrowsRoleError(action: () => void, message: string): void {
  try {
    action();
  } catch (error) {
    if (error instanceof WebRtcRacePeerRoleError) {
      return;
    }

    throw error;
  }

  throw new Error(message);
}

void Promise.resolve()
  .then(() => {
    validateWebRtcRacePeerRolePlanning();
    console.info("WebRTC race peer role validation passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
