import type {
  SignalingPeerId,
  SignalingRoomPeer,
  SignalingRoomSnapshot,
} from "./signaling";

export type WebRtcRacePeerRole = "host" | "client";
export type WebRtcRacePeerReadiness = "waiting-for-client" | "ready";

export interface WebRtcRacePeerPlan {
  readonly roomId: string;
  readonly localPeerId: SignalingPeerId;
  readonly localRole: WebRtcRacePeerRole;
  readonly remotePeerId: SignalingPeerId | null;
  readonly remoteRole: WebRtcRacePeerRole | null;
  readonly createsOffer: boolean;
  readonly readiness: WebRtcRacePeerReadiness;
}

export class WebRtcRacePeerRoleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WebRtcRacePeerRoleError";
  }
}

export function createWebRtcRacePeerPlan(
  snapshot: SignalingRoomSnapshot,
  localPeerId: SignalingPeerId,
): WebRtcRacePeerPlan {
  const normalizedLocalPeerId = requireNonEmptyPeerId(localPeerId, "localPeerId");
  const hostPeer = requireSnapshotHostPeer(snapshot);
  const clientPeer = getSnapshotClientPeer(snapshot);

  if (hostPeer.peerId === normalizedLocalPeerId) {
    if (clientPeer === null) {
      return {
        roomId: snapshot.roomId,
        localPeerId: normalizedLocalPeerId,
        localRole: "host",
        remotePeerId: null,
        remoteRole: null,
        createsOffer: false,
        readiness: "waiting-for-client",
      };
    }

    return {
      roomId: snapshot.roomId,
      localPeerId: normalizedLocalPeerId,
      localRole: "host",
      remotePeerId: clientPeer.peerId,
      remoteRole: "client",
      createsOffer: true,
      readiness: "ready",
    };
  }

  if (clientPeer?.peerId === normalizedLocalPeerId) {
    return {
      roomId: snapshot.roomId,
      localPeerId: normalizedLocalPeerId,
      localRole: "client",
      remotePeerId: hostPeer.peerId,
      remoteRole: "host",
      createsOffer: false,
      readiness: "ready",
    };
  }

  throw new WebRtcRacePeerRoleError(
    `Local peer ${normalizedLocalPeerId} is not a member of room ${snapshot.roomId}.`,
  );
}

export function canAcceptWebRtcOfferForPeer(
  plan: WebRtcRacePeerPlan,
  senderId: SignalingPeerId,
  recipientId: SignalingPeerId | undefined,
): boolean {
  return (
    plan.localRole === "client" &&
    plan.remotePeerId === senderId &&
    (recipientId === undefined || recipientId === plan.localPeerId)
  );
}

function requireSnapshotHostPeer(
  snapshot: SignalingRoomSnapshot,
): SignalingRoomPeer {
  const hostPeer = snapshot.peers.find(
    (peer) => peer.role === "host" && peer.peerId === snapshot.hostPeerId,
  );

  if (hostPeer === undefined) {
    throw new WebRtcRacePeerRoleError(
      `Room ${snapshot.roomId} does not include its declared host peer.`,
    );
  }

  return hostPeer;
}

function getSnapshotClientPeer(
  snapshot: SignalingRoomSnapshot,
): SignalingRoomPeer | null {
  const clientPeers = snapshot.peers.filter((peer) => peer.role === "guest");

  if (clientPeers.length > 1) {
    throw new WebRtcRacePeerRoleError(
      `Room ${snapshot.roomId} has more than one WebRTC client peer.`,
    );
  }

  const clientPeer = clientPeers[0] ?? null;

  if (snapshot.guestPeerId === undefined) {
    return clientPeer;
  }

  if (clientPeer === null || clientPeer.peerId !== snapshot.guestPeerId) {
    throw new WebRtcRacePeerRoleError(
      `Room ${snapshot.roomId} does not include its declared client peer.`,
    );
  }

  return clientPeer;
}

function requireNonEmptyPeerId(value: string, key: string): string {
  if (value.trim().length === 0) {
    throw new WebRtcRacePeerRoleError(`Peer role field must be non-empty: ${key}.`);
  }

  return value;
}
