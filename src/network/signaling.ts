export const SIGNALING_PROTOCOL = "kart-webrtc-signaling";
export const SIGNALING_VERSION = 1;
export const MAX_SIGNALING_MESSAGE_BYTES = 128 * 1024;
export const MAX_SIGNALING_MESSAGE_AGE_MS = 30_000;
export const MAX_SIGNALING_CLOCK_SKEW_MS = 10_000;
export const SIGNALING_SERVER_PEER_ID = "signaling-server";
export const SIGNALING_ROOM_CAPACITY = 2 as const;

export const SIGNALING_MESSAGE_TYPES = {
  ROOM_CREATE: "room-create",
  ROOM_CREATED: "room-created",
  ROOM_JOIN: "room-join",
  ROOM_JOINED: "room-joined",
  ROOM_JOIN_REJECTED: "room-join-rejected",
  ROOM_LEAVE: "room-leave",
  ROOM_LEFT: "room-left",
  ROOM_STATE_REQUEST: "room-state-request",
  ROOM_STATE: "room-state",
  PEER_JOINED: "peer-joined",
  PEER_LEFT: "peer-left",
  SIGNALING_ERROR: "signaling-error",
  SDP_OFFER: "sdp-offer",
  SDP_ANSWER: "sdp-answer",
  ICE_CANDIDATE: "ice-candidate",
} as const;

export type SignalingMessageType =
  (typeof SIGNALING_MESSAGE_TYPES)[keyof typeof SIGNALING_MESSAGE_TYPES];

export type SignalingPeerId = string;
export type SignalingRoomId = string;
export type SdpDescriptionType = "offer" | "answer";
export type SignalingRoomPeerRole = "host" | "guest";
export type RoomJoinRejectionReason =
  | "room-not-found"
  | "room-full"
  | "duplicate-peer"
  | "already-in-room";
export type SignalingErrorReason =
  | "invalid-message"
  | "room-exists"
  | "already-in-room"
  | "not-in-room"
  | "peer-not-found"
  | "stale-message";

export interface SignalingRoomPeer {
  readonly peerId: SignalingPeerId;
  readonly displayName: string;
  readonly role: SignalingRoomPeerRole;
  readonly joinedAt: number;
}

export interface SignalingRoomSnapshot {
  readonly roomId: SignalingRoomId;
  readonly capacity: typeof SIGNALING_ROOM_CAPACITY;
  readonly peerCount: number;
  readonly isOpen: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly hostPeerId: SignalingPeerId;
  readonly guestPeerId?: SignalingPeerId;
  readonly peers: readonly SignalingRoomPeer[];
}

export interface SerializableSessionDescription {
  readonly type: SdpDescriptionType;
  readonly sdp: string;
}

export interface SerializableIceCandidate {
  readonly candidate: string;
  readonly sdpMid?: string | null;
  readonly sdpMLineIndex?: number | null;
  readonly usernameFragment?: string | null;
}

export interface SignalingRoute {
  readonly roomId: SignalingRoomId;
  readonly senderId: SignalingPeerId;
  readonly recipientId?: SignalingPeerId;
}

export interface SignalingCreateOptions extends SignalingRoute {
  readonly messageId?: string;
  readonly sentAt?: number;
}

interface SignalingEnvelopeBase {
  readonly protocol: typeof SIGNALING_PROTOCOL;
  readonly version: typeof SIGNALING_VERSION;
  readonly roomId: SignalingRoomId;
  readonly senderId: SignalingPeerId;
  readonly recipientId?: SignalingPeerId;
  readonly messageId: string;
  readonly sentAt: number;
}

export interface RoomCreateSignalingMessage extends SignalingEnvelopeBase {
  readonly type: typeof SIGNALING_MESSAGE_TYPES.ROOM_CREATE;
  readonly displayName?: string;
}

export interface RoomCreatedSignalingMessage extends SignalingEnvelopeBase {
  readonly type: typeof SIGNALING_MESSAGE_TYPES.ROOM_CREATED;
  readonly snapshot: SignalingRoomSnapshot;
}

export interface RoomJoinSignalingMessage extends SignalingEnvelopeBase {
  readonly type: typeof SIGNALING_MESSAGE_TYPES.ROOM_JOIN;
  readonly displayName?: string;
}

export interface RoomJoinedSignalingMessage extends SignalingEnvelopeBase {
  readonly type: typeof SIGNALING_MESSAGE_TYPES.ROOM_JOINED;
  readonly snapshot: SignalingRoomSnapshot;
}

export interface RoomJoinRejectedSignalingMessage extends SignalingEnvelopeBase {
  readonly type: typeof SIGNALING_MESSAGE_TYPES.ROOM_JOIN_REJECTED;
  readonly reason: RoomJoinRejectionReason;
  readonly message: string;
  readonly retryable: boolean;
  readonly snapshot?: SignalingRoomSnapshot;
}

export interface RoomLeaveSignalingMessage extends SignalingEnvelopeBase {
  readonly type: typeof SIGNALING_MESSAGE_TYPES.ROOM_LEAVE;
}

export interface RoomLeftSignalingMessage extends SignalingEnvelopeBase {
  readonly type: typeof SIGNALING_MESSAGE_TYPES.ROOM_LEFT;
  readonly peerId: SignalingPeerId;
  readonly snapshot?: SignalingRoomSnapshot;
}

export interface RoomStateRequestSignalingMessage extends SignalingEnvelopeBase {
  readonly type: typeof SIGNALING_MESSAGE_TYPES.ROOM_STATE_REQUEST;
}

export interface RoomStateSignalingMessage extends SignalingEnvelopeBase {
  readonly type: typeof SIGNALING_MESSAGE_TYPES.ROOM_STATE;
  readonly exists: boolean;
  readonly snapshot?: SignalingRoomSnapshot;
}

export interface PeerJoinedSignalingMessage extends SignalingEnvelopeBase {
  readonly type: typeof SIGNALING_MESSAGE_TYPES.PEER_JOINED;
  readonly peer: SignalingRoomPeer;
  readonly snapshot: SignalingRoomSnapshot;
}

export interface PeerLeftSignalingMessage extends SignalingEnvelopeBase {
  readonly type: typeof SIGNALING_MESSAGE_TYPES.PEER_LEFT;
  readonly peerId: SignalingPeerId;
  readonly snapshot?: SignalingRoomSnapshot;
}

export interface SignalingErrorMessage extends SignalingEnvelopeBase {
  readonly type: typeof SIGNALING_MESSAGE_TYPES.SIGNALING_ERROR;
  readonly reason: SignalingErrorReason;
  readonly message: string;
  readonly retryable: boolean;
}

export interface SdpOfferSignalingMessage extends SignalingEnvelopeBase {
  readonly type: typeof SIGNALING_MESSAGE_TYPES.SDP_OFFER;
  readonly description: SerializableSessionDescription & { readonly type: "offer" };
}

export interface SdpAnswerSignalingMessage extends SignalingEnvelopeBase {
  readonly type: typeof SIGNALING_MESSAGE_TYPES.SDP_ANSWER;
  readonly description: SerializableSessionDescription & { readonly type: "answer" };
}

export interface IceCandidateSignalingMessage extends SignalingEnvelopeBase {
  readonly type: typeof SIGNALING_MESSAGE_TYPES.ICE_CANDIDATE;
  readonly candidate: SerializableIceCandidate | null;
}

export type SdpSignalingMessage =
  | SdpOfferSignalingMessage
  | SdpAnswerSignalingMessage;

export type WebRtcSignalingMessage =
  | SdpOfferSignalingMessage
  | SdpAnswerSignalingMessage
  | IceCandidateSignalingMessage;

export type RoomSignalingMessage =
  | RoomCreateSignalingMessage
  | RoomCreatedSignalingMessage
  | RoomJoinSignalingMessage
  | RoomJoinedSignalingMessage
  | RoomJoinRejectedSignalingMessage
  | RoomLeaveSignalingMessage
  | RoomLeftSignalingMessage
  | RoomStateRequestSignalingMessage
  | RoomStateSignalingMessage
  | PeerJoinedSignalingMessage
  | PeerLeftSignalingMessage
  | SignalingErrorMessage;

export type SignalingMessage = WebRtcSignalingMessage | RoomSignalingMessage;

export class SignalingMessageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SignalingMessageError";
  }
}

export function createRoomCreateMessage(
  route: SignalingCreateOptions,
  displayName?: string,
): RoomCreateSignalingMessage {
  const message: Mutable<RoomCreateSignalingMessage> = {
    ...createEnvelope(route),
    type: SIGNALING_MESSAGE_TYPES.ROOM_CREATE,
  };

  if (displayName !== undefined) {
    message.displayName = requireNonEmptyText(displayName, "displayName");
  }

  return message;
}

export function createRoomCreatedMessage(
  route: SignalingCreateOptions,
  snapshot: unknown,
): RoomCreatedSignalingMessage {
  return {
    ...createEnvelope(route),
    type: SIGNALING_MESSAGE_TYPES.ROOM_CREATED,
    snapshot: serializeRoomSnapshot(snapshot),
  };
}

export function createRoomJoinMessage(
  route: SignalingCreateOptions,
  displayName?: string,
): RoomJoinSignalingMessage {
  const message: Mutable<RoomJoinSignalingMessage> = {
    ...createEnvelope(route),
    type: SIGNALING_MESSAGE_TYPES.ROOM_JOIN,
  };

  if (displayName !== undefined) {
    message.displayName = requireNonEmptyText(displayName, "displayName");
  }

  return message;
}

export function createRoomJoinedMessage(
  route: SignalingCreateOptions,
  snapshot: unknown,
): RoomJoinedSignalingMessage {
  return {
    ...createEnvelope(route),
    type: SIGNALING_MESSAGE_TYPES.ROOM_JOINED,
    snapshot: serializeRoomSnapshot(snapshot),
  };
}

export function createRoomJoinRejectedMessage(
  route: SignalingCreateOptions,
  reason: RoomJoinRejectionReason,
  message: string,
  snapshot?: unknown,
  retryable = isRetryableRoomJoinRejectionReason(reason),
): RoomJoinRejectedSignalingMessage {
  const rejectedMessage: Mutable<RoomJoinRejectedSignalingMessage> = {
    ...createEnvelope(route),
    type: SIGNALING_MESSAGE_TYPES.ROOM_JOIN_REJECTED,
    reason: serializeRoomJoinRejectionReason(reason),
    message: requireNonEmptyText(message, "message"),
    retryable,
  };

  if (snapshot !== undefined) {
    rejectedMessage.snapshot = serializeRoomSnapshot(snapshot);
  }

  return rejectedMessage;
}

export function createRoomLeaveMessage(
  route: SignalingCreateOptions,
): RoomLeaveSignalingMessage {
  return {
    ...createEnvelope(route),
    type: SIGNALING_MESSAGE_TYPES.ROOM_LEAVE,
  };
}

export function createRoomLeftMessage(
  route: SignalingCreateOptions,
  peerId: SignalingPeerId,
  snapshot?: unknown,
): RoomLeftSignalingMessage {
  const message: Mutable<RoomLeftSignalingMessage> = {
    ...createEnvelope(route),
    type: SIGNALING_MESSAGE_TYPES.ROOM_LEFT,
    peerId: requireNonEmptyId(peerId, "peerId"),
  };

  if (snapshot !== undefined) {
    message.snapshot = serializeRoomSnapshot(snapshot);
  }

  return message;
}

export function createRoomStateRequestMessage(
  route: SignalingCreateOptions,
): RoomStateRequestSignalingMessage {
  return {
    ...createEnvelope(route),
    type: SIGNALING_MESSAGE_TYPES.ROOM_STATE_REQUEST,
  };
}

export function createRoomStateMessage(
  route: SignalingCreateOptions,
  exists: boolean,
  snapshot?: unknown,
): RoomStateSignalingMessage {
  if (exists !== (snapshot !== undefined)) {
    throw new SignalingMessageError(
      "Room state exists flag must match snapshot presence.",
    );
  }

  const message: Mutable<RoomStateSignalingMessage> = {
    ...createEnvelope(route),
    type: SIGNALING_MESSAGE_TYPES.ROOM_STATE,
    exists,
  };

  if (snapshot !== undefined) {
    message.snapshot = serializeRoomSnapshot(snapshot);
  }

  return message;
}

export function createPeerJoinedMessage(
  route: SignalingCreateOptions,
  peer: unknown,
  snapshot: unknown,
): PeerJoinedSignalingMessage {
  return {
    ...createEnvelope(route),
    type: SIGNALING_MESSAGE_TYPES.PEER_JOINED,
    peer: serializeRoomPeer(peer),
    snapshot: serializeRoomSnapshot(snapshot),
  };
}

export function createPeerLeftMessage(
  route: SignalingCreateOptions,
  peerId: SignalingPeerId,
  snapshot?: unknown,
): PeerLeftSignalingMessage {
  const message: Mutable<PeerLeftSignalingMessage> = {
    ...createEnvelope(route),
    type: SIGNALING_MESSAGE_TYPES.PEER_LEFT,
    peerId: requireNonEmptyId(peerId, "peerId"),
  };

  if (snapshot !== undefined) {
    message.snapshot = serializeRoomSnapshot(snapshot);
  }

  return message;
}

export function createSignalingErrorMessage(
  route: SignalingCreateOptions,
  reason: SignalingErrorReason,
  message: string,
  retryable = isRetryableSignalingErrorReason(reason),
): SignalingErrorMessage {
  return {
    ...createEnvelope(route),
    type: SIGNALING_MESSAGE_TYPES.SIGNALING_ERROR,
    reason: serializeSignalingErrorReason(reason),
    message: requireNonEmptyText(message, "message"),
    retryable,
  };
}

export function createSdpOfferMessage(
  route: SignalingCreateOptions,
  description: unknown,
): SdpOfferSignalingMessage {
  return {
    ...createEnvelope(route),
    type: SIGNALING_MESSAGE_TYPES.SDP_OFFER,
    description: serializeSessionDescription(description, "offer") as SerializableSessionDescription & {
      readonly type: "offer";
    },
  };
}

export function createSdpAnswerMessage(
  route: SignalingCreateOptions,
  description: unknown,
): SdpAnswerSignalingMessage {
  return {
    ...createEnvelope(route),
    type: SIGNALING_MESSAGE_TYPES.SDP_ANSWER,
    description: serializeSessionDescription(description, "answer") as SerializableSessionDescription & {
      readonly type: "answer";
    },
  };
}

export function createIceCandidateMessage(
  route: SignalingCreateOptions,
  candidate: unknown,
): IceCandidateSignalingMessage {
  return {
    ...createEnvelope(route),
    type: SIGNALING_MESSAGE_TYPES.ICE_CANDIDATE,
    candidate: serializeIceCandidate(candidate),
  };
}

export function serializeSignalingMessage(message: SignalingMessage): string {
  const serialized = JSON.stringify(parseSignalingMessage(message));

  if (new TextEncoder().encode(serialized).byteLength > MAX_SIGNALING_MESSAGE_BYTES) {
    throw new SignalingMessageError("Signaling message exceeds maximum serialized size.");
  }

  return serialized;
}

export function deserializeSignalingMessage(raw: string | ArrayBuffer | Uint8Array): SignalingMessage {
  const text = decodeSignalingPayload(raw);

  if (new TextEncoder().encode(text).byteLength > MAX_SIGNALING_MESSAGE_BYTES) {
    throw new SignalingMessageError("Signaling message exceeds maximum serialized size.");
  }

  try {
    return parseSignalingMessage(JSON.parse(text));
  } catch (error) {
    if (error instanceof SignalingMessageError) {
      throw error;
    }

    throw new SignalingMessageError("Signaling message is not valid JSON.");
  }
}

export function parseSignalingMessage(value: unknown): SignalingMessage {
  const record = asRecord(value, "Signaling message must be a JSON object.");
  const type = requireString(record, "type");
  const envelope = parseEnvelope(record);

  switch (type) {
    case SIGNALING_MESSAGE_TYPES.ROOM_CREATE: {
      const message: Mutable<RoomCreateSignalingMessage> = {
        ...envelope,
        type,
      };
      const displayName = readOptionalNonEmptyText(record, "displayName");

      if (displayName !== undefined) {
        message.displayName = displayName;
      }

      return message;
    }
    case SIGNALING_MESSAGE_TYPES.ROOM_CREATED:
      return {
        ...envelope,
        type,
        snapshot: serializeRoomSnapshot(record.snapshot),
      };
    case SIGNALING_MESSAGE_TYPES.ROOM_JOIN: {
      const message: Mutable<RoomJoinSignalingMessage> = {
        ...envelope,
        type,
      };
      const displayName = readOptionalNonEmptyText(record, "displayName");

      if (displayName !== undefined) {
        message.displayName = displayName;
      }

      return message;
    }
    case SIGNALING_MESSAGE_TYPES.ROOM_JOINED:
      return {
        ...envelope,
        type,
        snapshot: serializeRoomSnapshot(record.snapshot),
      };
    case SIGNALING_MESSAGE_TYPES.ROOM_JOIN_REJECTED: {
      const reason = serializeRoomJoinRejectionReason(record.reason);
      const rejectedMessage: Mutable<RoomJoinRejectedSignalingMessage> = {
        ...envelope,
        type,
        reason,
        message: requireString(record, "message"),
        retryable:
          readOptionalBoolean(record, "retryable") ??
          isRetryableRoomJoinRejectionReason(reason),
      };

      if (hasOwn(record, "snapshot")) {
        rejectedMessage.snapshot = serializeRoomSnapshot(record.snapshot);
      }

      return rejectedMessage;
    }
    case SIGNALING_MESSAGE_TYPES.ROOM_LEAVE:
      return {
        ...envelope,
        type,
      };
    case SIGNALING_MESSAGE_TYPES.ROOM_LEFT: {
      const roomLeftMessage: Mutable<RoomLeftSignalingMessage> = {
        ...envelope,
        type,
        peerId: requireNonEmptyId(record.peerId, "peerId"),
      };

      if (hasOwn(record, "snapshot")) {
        roomLeftMessage.snapshot = serializeRoomSnapshot(record.snapshot);
      }

      return roomLeftMessage;
    }
    case SIGNALING_MESSAGE_TYPES.ROOM_STATE_REQUEST:
      return {
        ...envelope,
        type,
      };
    case SIGNALING_MESSAGE_TYPES.ROOM_STATE: {
      const roomStateMessage: Mutable<RoomStateSignalingMessage> = {
        ...envelope,
        type,
        exists: requireBoolean(record, "exists"),
      };

      if (hasOwn(record, "snapshot")) {
        roomStateMessage.snapshot = serializeRoomSnapshot(record.snapshot);
      }

      if (roomStateMessage.exists !== (roomStateMessage.snapshot !== undefined)) {
        throw new SignalingMessageError(
          "Room state exists flag must match snapshot presence.",
        );
      }

      return roomStateMessage;
    }
    case SIGNALING_MESSAGE_TYPES.PEER_JOINED:
      return {
        ...envelope,
        type,
        peer: serializeRoomPeer(record.peer),
        snapshot: serializeRoomSnapshot(record.snapshot),
      };
    case SIGNALING_MESSAGE_TYPES.PEER_LEFT: {
      const peerLeftMessage: Mutable<PeerLeftSignalingMessage> = {
        ...envelope,
        type,
        peerId: requireNonEmptyId(record.peerId, "peerId"),
      };

      if (hasOwn(record, "snapshot")) {
        peerLeftMessage.snapshot = serializeRoomSnapshot(record.snapshot);
      }

      return peerLeftMessage;
    }
    case SIGNALING_MESSAGE_TYPES.SIGNALING_ERROR:
    {
      const reason = serializeSignalingErrorReason(record.reason);
      return {
        ...envelope,
        type,
        reason,
        message: requireString(record, "message"),
        retryable:
          readOptionalBoolean(record, "retryable") ??
          isRetryableSignalingErrorReason(reason),
      };
    }
    case SIGNALING_MESSAGE_TYPES.SDP_OFFER:
      return {
        ...envelope,
        type,
        description: serializeSessionDescription(record.description, "offer") as SerializableSessionDescription & {
          readonly type: "offer";
        },
      };
    case SIGNALING_MESSAGE_TYPES.SDP_ANSWER:
      return {
        ...envelope,
        type,
        description: serializeSessionDescription(record.description, "answer") as SerializableSessionDescription & {
          readonly type: "answer";
        },
      };
    case SIGNALING_MESSAGE_TYPES.ICE_CANDIDATE:
      requireProperty(record, "candidate");
      return {
        ...envelope,
        type,
        candidate: serializeIceCandidate(record.candidate),
      };
    default:
      throw new SignalingMessageError(`Unsupported signaling message type: ${type}`);
  }
}

export function serializeSessionDescription(
  description: unknown,
  expectedType?: SdpDescriptionType,
): SerializableSessionDescription {
  const record = asRecord(unwrapJsonValue(description), "Session description must be a JSON object.");
  const type = requireString(record, "type");
  const sdp = requireString(record, "sdp");

  if (type !== "offer" && type !== "answer") {
    throw new SignalingMessageError(`Unsupported SDP description type: ${type}`);
  }

  if (expectedType !== undefined && type !== expectedType) {
    throw new SignalingMessageError(`Expected SDP ${expectedType}, received ${type}.`);
  }

  if (sdp.trim().length === 0) {
    throw new SignalingMessageError("SDP description must include a non-empty sdp string.");
  }

  return { type, sdp };
}

export function serializeIceCandidate(candidate: unknown): SerializableIceCandidate | null {
  if (candidate === null) {
    return null;
  }

  const record = asRecord(unwrapJsonValue(candidate), "ICE candidate must be a JSON object or null.");
  const serialized: Mutable<SerializableIceCandidate> = {
    candidate: requireString(record, "candidate"),
  };

  if (hasOwn(record, "sdpMid")) {
    serialized.sdpMid = requireNullableString(record, "sdpMid");
  }

  if (hasOwn(record, "sdpMLineIndex")) {
    serialized.sdpMLineIndex = requireNullableInteger(record, "sdpMLineIndex");
  }

  if (hasOwn(record, "usernameFragment")) {
    serialized.usernameFragment = requireNullableString(record, "usernameFragment");
  }

  return serialized;
}

export function serializeRoomPeer(peer: unknown): SignalingRoomPeer {
  const record = asRecord(peer, "Room peer must be a JSON object.");
  const role = requireString(record, "role");

  if (role !== "host" && role !== "guest") {
    throw new SignalingMessageError(`Unsupported room peer role: ${role}`);
  }

  return {
    peerId: requireNonEmptyId(record.peerId, "peerId"),
    displayName: requireNonEmptyText(record.displayName, "displayName"),
    role,
    joinedAt: requireTimestamp(record.joinedAt, "joinedAt"),
  };
}

export function serializeRoomSnapshot(snapshot: unknown): SignalingRoomSnapshot {
  const record = asRecord(snapshot, "Room snapshot must be a JSON object.");
  const capacity = record.capacity;

  if (capacity !== SIGNALING_ROOM_CAPACITY) {
    throw new SignalingMessageError(
      `Room snapshot capacity must be ${SIGNALING_ROOM_CAPACITY}.`,
    );
  }

  if (!Array.isArray(record.peers)) {
    throw new SignalingMessageError("Room snapshot peers must be an array.");
  }

  const peers = record.peers.map((peer) => serializeRoomPeer(peer));
  const hostPeerId = requireNonEmptyId(record.hostPeerId, "hostPeerId");
  const guestPeerId = hasOwn(record, "guestPeerId")
    ? requireNonEmptyId(record.guestPeerId, "guestPeerId")
    : undefined;

  if (peers.length < 1 || peers.length > SIGNALING_ROOM_CAPACITY) {
    throw new SignalingMessageError(
      `Room snapshot must contain 1-${SIGNALING_ROOM_CAPACITY} peers.`,
    );
  }

  const peerJoinTimes = peers.map((peer) => peer.joinedAt);
  const derivedCreatedAt = Math.min(...peerJoinTimes);
  const derivedUpdatedAt = Math.max(derivedCreatedAt, ...peerJoinTimes);
  const peerCount = hasOwn(record, "peerCount")
    ? requireNonNegativeInteger(record, "peerCount")
    : peers.length;
  const isOpen = hasOwn(record, "isOpen")
    ? requireBoolean(record, "isOpen")
    : peers.length < SIGNALING_ROOM_CAPACITY;
  const createdAt = hasOwn(record, "createdAt")
    ? requireTimestamp(record.createdAt, "createdAt")
    : derivedCreatedAt;
  const updatedAt = hasOwn(record, "updatedAt")
    ? requireTimestamp(record.updatedAt, "updatedAt")
    : derivedUpdatedAt;

  if (peerCount !== peers.length) {
    throw new SignalingMessageError("Room snapshot peerCount must match peers length.");
  }

  if (isOpen !== (peers.length < SIGNALING_ROOM_CAPACITY)) {
    throw new SignalingMessageError("Room snapshot isOpen must match capacity.");
  }

  if (updatedAt < createdAt) {
    throw new SignalingMessageError("Room snapshot updatedAt must not precede createdAt.");
  }

  const peerIds = new Set(peers.map((peer) => peer.peerId));

  if (peerIds.size !== peers.length) {
    throw new SignalingMessageError("Room snapshot peer ids must be unique.");
  }

  const hostPeers = peers.filter((peer) => peer.role === "host");
  const guestPeers = peers.filter((peer) => peer.role === "guest");

  if (
    hostPeers.length !== 1 ||
    hostPeers[0]?.peerId !== hostPeerId
  ) {
    throw new SignalingMessageError("Room snapshot must include the host peer.");
  }

  if (guestPeerId === undefined && guestPeers.length > 0) {
    throw new SignalingMessageError("Room snapshot guest peer requires guestPeerId.");
  }

  if (
    guestPeerId !== undefined &&
    !guestPeers.some((peer) => peer.peerId === guestPeerId)
  ) {
    throw new SignalingMessageError("Room snapshot guestPeerId must reference a peer.");
  }

  const serialized: Mutable<SignalingRoomSnapshot> = {
    roomId: requireNonEmptyId(record.roomId, "roomId"),
    capacity: SIGNALING_ROOM_CAPACITY,
    peerCount,
    isOpen,
    createdAt,
    updatedAt,
    hostPeerId,
    peers,
  };

  if (guestPeerId !== undefined) {
    serialized.guestPeerId = guestPeerId;
  }

  return serialized;
}

export function isSignalingMessage(value: unknown): value is SignalingMessage {
  try {
    parseSignalingMessage(value);
    return true;
  } catch {
    return false;
  }
}

export function isSdpSignalingMessage(value: SignalingMessage): value is SdpSignalingMessage {
  return (
    value.type === SIGNALING_MESSAGE_TYPES.SDP_OFFER ||
    value.type === SIGNALING_MESSAGE_TYPES.SDP_ANSWER
  );
}

export function isWebRtcSignalingMessage(value: SignalingMessage): value is WebRtcSignalingMessage {
  return (
    value.type === SIGNALING_MESSAGE_TYPES.SDP_OFFER ||
    value.type === SIGNALING_MESSAGE_TYPES.SDP_ANSWER ||
    value.type === SIGNALING_MESSAGE_TYPES.ICE_CANDIDATE
  );
}

export function isRetryableRoomJoinRejectionReason(
  reason: RoomJoinRejectionReason,
): boolean {
  return (
    reason === "room-not-found" ||
    reason === "room-full" ||
    reason === "duplicate-peer"
  );
}

export function isRetryableSignalingErrorReason(
  reason: SignalingErrorReason,
): boolean {
  return (
    reason === "room-exists" ||
    reason === "not-in-room" ||
    reason === "peer-not-found" ||
    reason === "stale-message"
  );
}

function createEnvelope(options: SignalingCreateOptions): SignalingEnvelopeBase {
  const envelope: Mutable<SignalingEnvelopeBase> = {
    protocol: SIGNALING_PROTOCOL,
    version: SIGNALING_VERSION,
    roomId: requireNonEmptyId(options.roomId, "roomId"),
    senderId: requireNonEmptyId(options.senderId, "senderId"),
    messageId: requireNonEmptyId(options.messageId ?? createMessageId(), "messageId"),
    sentAt: requireTimestamp(options.sentAt ?? Date.now(), "sentAt"),
  };

  if (options.recipientId !== undefined) {
    envelope.recipientId = requireNonEmptyId(options.recipientId, "recipientId");
  }

  return envelope;
}

function parseEnvelope(record: Record<string, unknown>): SignalingEnvelopeBase {
  const protocol = requireString(record, "protocol");
  const version = record.version;

  if (protocol !== SIGNALING_PROTOCOL) {
    throw new SignalingMessageError(`Unsupported signaling protocol: ${protocol}`);
  }

  if (version !== SIGNALING_VERSION) {
    throw new SignalingMessageError(`Unsupported signaling version: ${String(version)}`);
  }

  const envelope: Mutable<SignalingEnvelopeBase> = {
    protocol: SIGNALING_PROTOCOL,
    version: SIGNALING_VERSION,
    roomId: requireNonEmptyId(record.roomId, "roomId"),
    senderId: requireNonEmptyId(record.senderId, "senderId"),
    messageId: requireNonEmptyId(record.messageId, "messageId"),
    sentAt: requireTimestamp(record.sentAt, "sentAt"),
  };

  if (hasOwn(record, "recipientId")) {
    envelope.recipientId = requireNonEmptyId(record.recipientId, "recipientId");
  }

  return envelope;
}

function decodeSignalingPayload(raw: string | ArrayBuffer | Uint8Array): string {
  if (typeof raw === "string") {
    return raw;
  }

  if (raw instanceof Uint8Array) {
    return new TextDecoder().decode(raw);
  }

  return new TextDecoder().decode(new Uint8Array(raw));
}

function unwrapJsonValue(value: unknown): unknown {
  if (isRecord(value) && typeof value.toJSON === "function") {
    return value.toJSON();
  }

  return value;
}

function asRecord(value: unknown, errorMessage: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new SignalingMessageError(errorMessage);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireProperty(record: Record<string, unknown>, key: string): void {
  if (!hasOwn(record, key)) {
    throw new SignalingMessageError(`Missing required signaling field: ${key}`);
  }
}

function requireString(record: Record<string, unknown>, key: string): string {
  requireProperty(record, key);

  const value = record[key];
  if (typeof value !== "string") {
    throw new SignalingMessageError(`Signaling field must be a string: ${key}`);
  }

  return value;
}

function requireBoolean(record: Record<string, unknown>, key: string): boolean {
  requireProperty(record, key);

  const value = record[key];
  if (typeof value !== "boolean") {
    throw new SignalingMessageError(`Signaling field must be a boolean: ${key}`);
  }

  return value;
}

function readOptionalBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean | undefined {
  if (!hasOwn(record, key) || record[key] === undefined) {
    return undefined;
  }

  return requireBoolean(record, key);
}

function requireNonEmptyText(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SignalingMessageError(`Signaling field must be a non-empty string: ${key}`);
  }

  return value.trim();
}

function readOptionalNonEmptyText(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  if (!hasOwn(record, key) || record[key] === undefined) {
    return undefined;
  }

  return requireNonEmptyText(record[key], key);
}

function requireNullableString(record: Record<string, unknown>, key: string): string | null {
  requireProperty(record, key);

  const value = record[key];
  if (value === null || typeof value === "string") {
    return value;
  }

  throw new SignalingMessageError(`Signaling field must be a string or null: ${key}`);
}

function requireNullableInteger(record: Record<string, unknown>, key: string): number | null {
  requireProperty(record, key);

  const value = record[key];
  if (value === null) {
    return null;
  }

  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  throw new SignalingMessageError(`Signaling field must be a non-negative integer or null: ${key}`);
}

function requireNonNegativeInteger(record: Record<string, unknown>, key: string): number {
  requireProperty(record, key);

  const value = record[key];
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  throw new SignalingMessageError(`Signaling field must be a non-negative integer: ${key}`);
}

function requireNonEmptyId(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SignalingMessageError(`Signaling field must be a non-empty string: ${key}`);
  }

  return value;
}

function requireTimestamp(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new SignalingMessageError(`Signaling field must be a non-negative timestamp: ${key}`);
  }

  return value;
}

function serializeRoomJoinRejectionReason(value: unknown): RoomJoinRejectionReason {
  if (
    value === "room-not-found" ||
    value === "room-full" ||
    value === "duplicate-peer" ||
    value === "already-in-room"
  ) {
    return value;
  }

  throw new SignalingMessageError(`Unsupported room join rejection reason: ${String(value)}`);
}

function serializeSignalingErrorReason(value: unknown): SignalingErrorReason {
  if (
    value === "invalid-message" ||
    value === "room-exists" ||
    value === "already-in-room" ||
    value === "not-in-room" ||
    value === "peer-not-found" ||
    value === "stale-message"
  ) {
    return value;
  }

  throw new SignalingMessageError(`Unsupported signaling error reason: ${String(value)}`);
}

function createMessageId(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);

  if (randomUUID !== undefined) {
    return randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};
