import { WebSocket, WebSocketServer, type RawData } from "ws";
import {
  MAX_SIGNALING_CLOCK_SKEW_MS,
  MAX_SIGNALING_MESSAGE_AGE_MS,
  SIGNALING_MESSAGE_TYPES,
  SIGNALING_ROOM_CAPACITY,
  SIGNALING_SERVER_PEER_ID,
  createPeerJoinedMessage,
  createPeerLeftMessage,
  createRoomCreatedMessage,
  createRoomJoinedMessage,
  createRoomJoinRejectedMessage,
  createRoomLeftMessage,
  createRoomStateMessage,
  createSignalingErrorMessage,
  deserializeSignalingMessage,
  isWebRtcSignalingMessage,
  serializeSignalingMessage,
  type RoomCreateSignalingMessage,
  type RoomJoinSignalingMessage,
  type RoomLeaveSignalingMessage,
  type RoomStateRequestSignalingMessage,
  type SignalingCreateOptions,
  type SignalingErrorReason,
  type SignalingMessage,
  type SignalingPeerId,
  type SignalingRoomId,
  type SignalingRoomPeer,
  type SignalingRoomPeerRole,
  type SignalingRoomSnapshot,
  type WebRtcSignalingMessage,
} from "../src/network/signaling.js";

const DEFAULT_SIGNALING_PORT = 8787;
const SERVER_CONTROL_ROOM_ID = "server";
const CLIENT_HEARTBEAT_INTERVAL_MS = 15_000;
const HOST_DISCONNECTED_CLOSE_CODE = 4001;
const HOST_DISCONNECTED_CLOSE_REASON = "Host disconnected";
const PEER_RECONNECTED_CLOSE_CODE = 4002;
const PEER_RECONNECTED_CLOSE_REASON = "Peer reconnected";

interface ConnectedPeer {
  readonly peerId: SignalingPeerId;
  readonly displayName: string;
  readonly role: SignalingRoomPeerRole;
  readonly joinedAt: number;
  readonly socket: WebSocket;
}

interface RoomState {
  readonly roomId: SignalingRoomId;
  host: ConnectedPeer;
  readonly createdAt: number;
  updatedAt: number;
  guest?: ConnectedPeer;
}

interface SocketState {
  peerId?: SignalingPeerId;
  roomId?: SignalingRoomId;
  role?: SignalingRoomPeerRole;
  isAlive: boolean;
  hasDisconnected: boolean;
}

interface LeaveRoomOptions {
  readonly departingSocket?: WebSocket;
  readonly acknowledgeDepartingPeer?: boolean;
}

interface SocketDisconnectOptions {
  readonly closeMode?: "close" | "none" | "terminate";
}

const rooms = new Map<SignalingRoomId, RoomState>();
const activeSockets = new Set<WebSocket>();
const socketStates = new WeakMap<WebSocket, SocketState>();
const port = readPort(process.env.KART_SIGNALING_PORT ?? process.env.PORT);
const server = new WebSocketServer({ port });
let shuttingDown = false;

server.on("connection", (socket) => {
  const state: SocketState = { isAlive: true, hasDisconnected: false };
  activeSockets.add(socket);
  socketStates.set(socket, state);

  socket.on("pong", () => {
    if (state.hasDisconnected) {
      return;
    }

    state.isAlive = true;
  });

  socket.on("message", (data) => {
    if (state.hasDisconnected) {
      return;
    }

    state.isAlive = true;
    handleRawMessage(socket, state, data);
  });

  socket.on("close", () => {
    disconnectSocket(socket, state, { closeMode: "none" });
  });

  socket.on("error", () => {
    disconnectSocket(socket, state, { closeMode: "terminate" });
  });
});

console.info(`[kart-signaling] listening on ws://localhost:${port}`);

const heartbeatTimer = setInterval(() => {
  for (const socket of Array.from(activeSockets)) {
    const state = socketStates.get(socket);

    if (state === undefined) {
      activeSockets.delete(socket);
      continue;
    }

    if (!state.isAlive) {
      disconnectSocket(socket, state, { closeMode: "terminate" });
      continue;
    }

    state.isAlive = false;

    try {
      socket.ping();
    } catch {
      disconnectSocket(socket, state, { closeMode: "terminate" });
    }
  }
}, CLIENT_HEARTBEAT_INTERVAL_MS);

heartbeatTimer.unref();

server.on("close", () => {
  cleanupSignalingServerState();
});

process.once("SIGINT", shutdownSignalingServer);
process.once("SIGTERM", shutdownSignalingServer);

function handleRawMessage(
  socket: WebSocket,
  state: SocketState,
  data: RawData,
): void {
  let message: SignalingMessage;

  try {
    message = deserializeSignalingMessage(rawDataToPayload(data));
  } catch {
    sendSignalingError(
      socket,
      SERVER_CONTROL_ROOM_ID,
      undefined,
      "invalid-message",
      "Invalid signaling message.",
    );
    return;
  }

  const freshnessError = getSignalingMessageFreshnessError(message);

  if (freshnessError !== null) {
    sendSignalingError(
      socket,
      message.roomId,
      message.senderId,
      "stale-message",
      freshnessError,
      true,
    );
    return;
  }

  if (message.type === SIGNALING_MESSAGE_TYPES.ROOM_CREATE) {
    handleCreateRoom(socket, state, message);
    return;
  }

  if (message.type === SIGNALING_MESSAGE_TYPES.ROOM_JOIN) {
    handleJoinRoom(socket, state, message);
    return;
  }

  if (message.type === SIGNALING_MESSAGE_TYPES.ROOM_LEAVE) {
    handleLeaveRoom(socket, state, message);
    return;
  }

  if (message.type === SIGNALING_MESSAGE_TYPES.ROOM_STATE_REQUEST) {
    handleRoomStateRequest(socket, state, message);
    return;
  }

  if (isWebRtcSignalingMessage(message)) {
    relayWebRtcSignal(socket, state, message);
    return;
  }

  sendSignalingError(
    socket,
    message.roomId,
    message.senderId,
    "invalid-message",
    `Clients may not send ${message.type} messages.`,
  );
}

function handleCreateRoom(
  socket: WebSocket,
  state: SocketState,
  message: RoomCreateSignalingMessage,
): void {
  if (state.roomId !== undefined) {
    const existingRoom = rooms.get(state.roomId);
    const existingPeer =
      existingRoom === undefined || state.peerId === undefined
        ? null
        : getRoomPeerById(existingRoom, state.peerId);

    if (
      existingRoom !== undefined &&
      state.roomId === message.roomId &&
      state.peerId === message.senderId &&
      existingPeer?.role === "host" &&
      existingPeer.socket === socket
    ) {
      send(
        socket,
        createRoomCreatedMessage(
          createServerRoute(existingRoom.roomId, message.senderId),
          createRoomSnapshot(existingRoom),
        ),
      );
      return;
    }

    sendSignalingError(
      socket,
      message.roomId,
      message.senderId,
      "already-in-room",
      "This peer is already in a signaling room.",
    );
    return;
  }

  const existingRoom = rooms.get(message.roomId);

  if (existingRoom !== undefined) {
    if (existingRoom.host.peerId === message.senderId) {
      replaceConnectedPeerSocket(
        existingRoom,
        existingRoom.host,
        socket,
        state,
        message.displayName,
      );
      send(
        socket,
        createRoomCreatedMessage(
          createServerRoute(existingRoom.roomId, message.senderId),
          createRoomSnapshot(existingRoom),
        ),
      );
      return;
    }

    sendSignalingError(
      socket,
      message.roomId,
      message.senderId,
      "room-exists",
      `Room ${message.roomId} already exists.`,
    );
    return;
  }

  const now = Date.now();
  const host = createConnectedPeer(
    message.senderId,
    message.displayName ?? "Host",
    "host",
    socket,
    now,
  );
  const room: RoomState = {
    roomId: message.roomId,
    host,
    createdAt: now,
    updatedAt: now,
  };

  validateRoomState(room);
  rooms.set(room.roomId, room);
  assignSocketState(state, room.roomId, host);

  send(
    socket,
    createRoomCreatedMessage(
      createServerRoute(room.roomId, host.peerId),
      createRoomSnapshot(room),
    ),
  );
}

function handleJoinRoom(
  socket: WebSocket,
  state: SocketState,
  message: RoomJoinSignalingMessage,
): void {
  if (state.roomId !== undefined) {
    const existingRoom = rooms.get(state.roomId);
    const existingPeer =
      existingRoom === undefined || state.peerId === undefined
        ? null
        : getRoomPeerById(existingRoom, state.peerId);

    if (
      existingRoom !== undefined &&
      state.roomId === message.roomId &&
      state.peerId === message.senderId &&
      existingPeer?.role === "guest" &&
      existingPeer.socket === socket
    ) {
      send(
        socket,
        createRoomJoinedMessage(
          createServerRoute(existingRoom.roomId, message.senderId),
          createRoomSnapshot(existingRoom),
        ),
      );
      return;
    }

    rejectJoin(
      socket,
      message,
      "already-in-room",
      "This peer is already in a signaling room.",
    );
    return;
  }

  const room = rooms.get(message.roomId);

  if (room === undefined) {
    rejectJoin(socket, message, "room-not-found", `Room ${message.roomId} was not found.`);
    return;
  }

  if (room.host.peerId === message.senderId) {
    rejectJoin(socket, message, "duplicate-peer", `Peer ${message.senderId} is already in this room.`);
    return;
  }

  if (room.guest?.peerId === message.senderId) {
    const previousGuestSocket = room.guest.socket;

    const replacementGuest = replaceConnectedPeerSocket(
      room,
      room.guest,
      socket,
      state,
      message.displayName,
    );
    const snapshot = createRoomSnapshot(room);

    send(
      socket,
      createRoomJoinedMessage(createServerRoute(room.roomId, message.senderId), snapshot),
    );

    if (previousGuestSocket !== socket) {
      broadcastToRoomPeers(room, (recipient) =>
        createPeerJoinedMessage(
          createServerRoute(room.roomId, recipient.peerId),
          toRoomPeer(replacementGuest),
          snapshot,
        ),
        { excludePeerId: message.senderId },
      );
    }

    return;
  }

  if (room.guest !== undefined) {
    rejectJoin(socket, message, "room-full", `Room ${message.roomId} already has two players.`);
    return;
  }

  const now = Date.now();
  const guest = createConnectedPeer(
    message.senderId,
    message.displayName ?? "Player 2",
    "guest",
    socket,
    now,
  );
  room.guest = guest;
  room.updatedAt = now;
  validateRoomState(room);
  assignSocketState(state, room.roomId, guest);

  const snapshot = createRoomSnapshot(room);

  send(
    guest.socket,
    createRoomJoinedMessage(createServerRoute(room.roomId, guest.peerId), snapshot),
  );
  broadcastToRoomPeers(room, (recipient) =>
    createPeerJoinedMessage(
      createServerRoute(room.roomId, recipient.peerId),
      toRoomPeer(guest),
      snapshot,
    ),
    { excludePeerId: guest.peerId },
  );
}

function handleLeaveRoom(
  socket: WebSocket,
  state: SocketState,
  message: RoomLeaveSignalingMessage,
): void {
  if (
    state.roomId === undefined ||
    state.peerId === undefined ||
    state.peerId !== message.senderId ||
    state.roomId !== message.roomId
  ) {
    sendSignalingError(
      socket,
      message.roomId,
      message.senderId,
      "not-in-room",
      "Peer must be in this room before leaving it.",
    );
    return;
  }

  const room = rooms.get(message.roomId);
  const departingPeer =
    room === undefined ? null : getRoomPeerById(room, message.senderId);

  if (departingPeer !== null && departingPeer.socket !== socket) {
    clearSocketState(state);
    sendSignalingError(
      socket,
      message.roomId,
      message.senderId,
      "stale-message",
      "This socket has been replaced by a newer connection.",
      true,
    );
    return;
  }

  leaveRoom(state, {
    acknowledgeDepartingPeer: true,
    departingSocket: socket,
  });
}

function handleRoomStateRequest(
  socket: WebSocket,
  state: SocketState,
  message: RoomStateRequestSignalingMessage,
): void {
  const room = rooms.get(message.roomId);

  if (room === undefined) {
    send(
      socket,
      createRoomStateMessage(
        createServerRoute(message.roomId, message.senderId),
        false,
      ),
    );
    return;
  }

  if (!isSocketRoomMember(state, room, message.senderId, socket)) {
    const peer = getRoomPeerById(room, message.senderId);
    const isReplacedPeerSocket =
      state.roomId === room.roomId &&
      state.peerId === message.senderId &&
      peer !== null &&
      peer.socket !== socket;

    if (isReplacedPeerSocket) {
      clearSocketState(state);
      sendSignalingError(
        socket,
        message.roomId,
        message.senderId,
        "stale-message",
        "This socket has been replaced by a newer connection.",
        true,
      );
      return;
    }

    sendSignalingError(
      socket,
      message.roomId,
      message.senderId,
      "not-in-room",
      "Peer must be in this room before requesting its peer list.",
    );
    return;
  }

  send(
    socket,
    createRoomStateMessage(
      createServerRoute(message.roomId, message.senderId),
      true,
      createRoomSnapshot(room),
    ),
  );
}

function relayWebRtcSignal(
  socket: WebSocket,
  state: SocketState,
  message: WebRtcSignalingMessage,
): void {
  if (
    state.roomId === undefined ||
    state.peerId === undefined ||
    state.peerId !== message.senderId ||
    state.roomId !== message.roomId
  ) {
    sendSignalingError(
      socket,
      message.roomId,
      message.senderId,
      "not-in-room",
      "Peer must create or join this room before sending WebRTC signaling.",
    );
    return;
  }

  const room = rooms.get(message.roomId);

  if (room === undefined) {
    clearSocketState(state);
    sendSignalingError(
      socket,
      message.roomId,
      message.senderId,
      "not-in-room",
      "Peer must be in an active room before sending WebRTC signaling.",
    );
    return;
  }

  const sender = getRoomPeerById(room, message.senderId);

  if (sender !== null && sender.socket !== socket) {
    clearSocketState(state);
    sendSignalingError(
      socket,
      message.roomId,
      message.senderId,
      "stale-message",
      "This socket has been replaced by a newer connection.",
      true,
    );
    return;
  }

  if (sender === null) {
    clearSocketState(state);
    sendSignalingError(
      socket,
      message.roomId,
      message.senderId,
      "not-in-room",
      "Peer must be an active member of this room before sending WebRTC signaling.",
    );
    return;
  }

  const payloadValidationError = getWebRtcPayloadValidationError(message);

  if (payloadValidationError !== null) {
    sendSignalingError(
      socket,
      message.roomId,
      message.senderId,
      "invalid-message",
      payloadValidationError,
    );
    return;
  }

  const recipient = getRecipientPeer(room, message, sender);

  if (recipient === null) {
    sendSignalingError(
      socket,
      message.roomId,
      message.senderId,
      "peer-not-found",
      "No connected peer is available for this signaling message.",
    );
    return;
  }

  const routeValidationError = getWebRtcRouteValidationError(
    message,
    sender,
    recipient,
  );

  if (routeValidationError !== null) {
    sendSignalingError(
      socket,
      message.roomId,
      message.senderId,
      "invalid-message",
      routeValidationError,
    );
    return;
  }

  send(recipient.socket, message);
}

function rejectJoin(
  socket: WebSocket,
  message: RoomJoinSignalingMessage,
  reason: "room-not-found" | "room-full" | "duplicate-peer" | "already-in-room",
  rejectionMessage: string,
): void {
  send(
    socket,
    createRoomJoinRejectedMessage(
      createServerRoute(message.roomId, message.senderId),
      reason,
      rejectionMessage,
    ),
  );
}

function disconnectSocket(
  socket: WebSocket,
  state: SocketState,
  options: SocketDisconnectOptions = {},
): void {
  const closeMode = options.closeMode ?? "close";

  if (state.hasDisconnected) {
    activeSockets.delete(socket);
    socketStates.delete(socket);
    closeDisconnectedSocket(socket, closeMode);
    return;
  }

  state.hasDisconnected = true;
  activeSockets.delete(socket);
  leaveRoom(state, { departingSocket: socket });
  clearSocketState(state);
  socketStates.delete(socket);
  closeDisconnectedSocket(socket, closeMode);
}

function leaveRoom(
  state: SocketState,
  options: LeaveRoomOptions = {},
): void {
  if (state.roomId === undefined || state.peerId === undefined) {
    return;
  }

  const room = rooms.get(state.roomId);

  if (room === undefined) {
    clearSocketState(state);
    return;
  }

  const departingPeer = getRoomPeerById(room, state.peerId);

  if (
    departingPeer === null ||
    (options.departingSocket !== undefined &&
      departingPeer.socket !== options.departingSocket)
  ) {
    clearSocketState(state);
    return;
  }

  if (departingPeer.role === "host") {
    const hostPeerId = room.host.peerId;
    rooms.delete(room.roomId);
    clearSocketState(state);

    if (options.acknowledgeDepartingPeer === true) {
      send(
        departingPeer.socket,
        createRoomLeftMessage(
          createServerRoute(room.roomId, hostPeerId),
          hostPeerId,
        ),
      );
    }

    if (room.guest !== undefined) {
      clearPeerSocketState(room.guest.socket);
      broadcastToRoomPeers(room, (recipient) =>
        createPeerLeftMessage(
          createServerRoute(room.roomId, recipient.peerId),
          room.host.peerId,
        ),
        { excludePeerId: room.host.peerId },
      );
      closeSocket(
        room.guest.socket,
        HOST_DISCONNECTED_CLOSE_CODE,
        HOST_DISCONNECTED_CLOSE_REASON,
      );
    }

    return;
  }

  if (departingPeer.role === "guest" && room.guest?.peerId === state.peerId) {
    const guestPeerId = departingPeer.peerId;
    delete room.guest;
    room.updatedAt = Date.now();
    validateRoomState(room);
    clearSocketState(state);

    if (!isPeerSocketActive(room.host)) {
      rooms.delete(room.roomId);
      return;
    }

    const snapshot = createRoomSnapshot(room);

    if (options.acknowledgeDepartingPeer === true) {
      send(
        departingPeer.socket,
        createRoomLeftMessage(
          createServerRoute(room.roomId, guestPeerId),
          guestPeerId,
          snapshot,
        ),
      );
    }

    broadcastToRoomPeers(room, (recipient) =>
      createPeerLeftMessage(
        createServerRoute(room.roomId, recipient.peerId),
        guestPeerId,
        snapshot,
      ),
      { excludePeerId: guestPeerId },
    );
  }
}

function getRecipientPeer(
  room: RoomState,
  message: WebRtcSignalingMessage,
  sender: ConnectedPeer,
): ConnectedPeer | null {
  if (message.recipientId !== undefined) {
    if (room.host.peerId === message.recipientId && room.host.peerId !== sender.peerId) {
      return room.host;
    }

    if (room.guest?.peerId === message.recipientId && room.guest.peerId !== sender.peerId) {
      return room.guest;
    }

    return null;
  }

  if (sender.role === "host") {
    return room.guest ?? null;
  }

  if (sender.role === "guest") {
    return room.host;
  }

  return null;
}

function getWebRtcPayloadValidationError(
  message: WebRtcSignalingMessage,
): string | null {
  if (message.type === SIGNALING_MESSAGE_TYPES.SDP_OFFER) {
    if (message.description.type !== "offer") {
      return "SDP offer message must include an offer description.";
    }

    if (!isValidSdpPayload(message.description.sdp)) {
      return "SDP offer must include a valid SDP payload.";
    }

    return null;
  }

  if (message.type === SIGNALING_MESSAGE_TYPES.SDP_ANSWER) {
    if (message.description.type !== "answer") {
      return "SDP answer message must include an answer description.";
    }

    if (!isValidSdpPayload(message.description.sdp)) {
      return "SDP answer must include a valid SDP payload.";
    }

    return null;
  }

  if (message.candidate === null) {
    return null;
  }

  const candidateText = message.candidate.candidate.trim();

  if (candidateText.length > 0 && !candidateText.startsWith("candidate:")) {
    return "ICE candidate payload must include a valid candidate string.";
  }

  if (message.candidate.sdpMid === "") {
    return "ICE candidate sdpMid must be non-empty when provided.";
  }

  if (message.candidate.usernameFragment === "") {
    return "ICE candidate usernameFragment must be non-empty when provided.";
  }

  return null;
}

function getWebRtcRouteValidationError(
  message: WebRtcSignalingMessage,
  sender: ConnectedPeer,
  recipient: ConnectedPeer,
): string | null {
  if (
    message.type === SIGNALING_MESSAGE_TYPES.SDP_OFFER &&
    (sender.role !== "host" || recipient.role !== "guest")
  ) {
    return "Only the room host may send SDP offers to the room guest.";
  }

  if (
    message.type === SIGNALING_MESSAGE_TYPES.SDP_ANSWER &&
    (sender.role !== "guest" || recipient.role !== "host")
  ) {
    return "Only the room guest may send SDP answers to the room host.";
  }

  return null;
}

function isValidSdpPayload(sdp: string): boolean {
  return sdp.trimStart().startsWith("v=0");
}

function isSocketRoomMember(
  state: SocketState,
  room: RoomState,
  peerId: SignalingPeerId,
  socket: WebSocket,
): boolean {
  const peer = getRoomPeerById(room, peerId);

  return (
    state.roomId === room.roomId &&
    state.peerId === peerId &&
    peer !== null &&
    peer.socket === socket
  );
}

function getRoomPeerById(
  room: RoomState,
  peerId: SignalingPeerId,
): ConnectedPeer | null {
  if (room.host.peerId === peerId) {
    return room.host;
  }

  if (room.guest?.peerId === peerId) {
    return room.guest;
  }

  return null;
}

function getRoomPeers(room: RoomState): readonly ConnectedPeer[] {
  const peers = [room.host];

  if (room.guest !== undefined) {
    peers.push(room.guest);
  }

  return peers;
}

function broadcastToRoomPeers(
  room: RoomState,
  createMessage: (recipient: ConnectedPeer) => SignalingMessage,
  options: { readonly excludePeerId?: SignalingPeerId } = {},
): void {
  for (const peer of getRoomPeers(room)) {
    if (peer.peerId === options.excludePeerId) {
      continue;
    }

    send(peer.socket, createMessage(peer));
  }
}

function createConnectedPeer(
  peerId: SignalingPeerId,
  displayName: string,
  role: SignalingRoomPeerRole,
  socket: WebSocket,
  joinedAt = Date.now(),
): ConnectedPeer {
  return {
    peerId,
    displayName,
    role,
    joinedAt,
    socket,
  };
}

function replaceConnectedPeerSocket(
  room: RoomState,
  peer: ConnectedPeer,
  socket: WebSocket,
  state: SocketState,
  displayName?: string,
): ConnectedPeer {
  const previousSocket = peer.socket;
  const replacement = createConnectedPeer(
    peer.peerId,
    displayName ?? peer.displayName,
    peer.role,
    socket,
    peer.joinedAt,
  );

  clearPeerSocketState(previousSocket);

  if (peer.role === "host") {
    room.host = replacement;
  } else {
    room.guest = replacement;
  }

  room.updatedAt = Date.now();
  validateRoomState(room);
  assignSocketState(state, room.roomId, replacement);

  if (previousSocket !== socket) {
    closeSocket(
      previousSocket,
      PEER_RECONNECTED_CLOSE_CODE,
      PEER_RECONNECTED_CLOSE_REASON,
    );
  }

  return replacement;
}

function createRoomSnapshot(room: RoomState): SignalingRoomSnapshot {
  validateRoomState(room);
  const peers = [toRoomPeer(room.host)];

  if (room.guest !== undefined) {
    peers.push(toRoomPeer(room.guest));
    return {
      roomId: room.roomId,
      capacity: SIGNALING_ROOM_CAPACITY,
      peerCount: peers.length,
      isOpen: false,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      hostPeerId: room.host.peerId,
      guestPeerId: room.guest.peerId,
      peers,
    };
  }

  return {
    roomId: room.roomId,
    capacity: SIGNALING_ROOM_CAPACITY,
    peerCount: peers.length,
    isOpen: true,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    hostPeerId: room.host.peerId,
    peers,
  };
}

function toRoomPeer(peer: ConnectedPeer): SignalingRoomPeer {
  return {
    peerId: peer.peerId,
    displayName: peer.displayName,
    role: peer.role,
    joinedAt: peer.joinedAt,
  };
}

function assignSocketState(
  state: SocketState,
  roomId: SignalingRoomId,
  peer: ConnectedPeer,
): void {
  state.peerId = peer.peerId;
  state.roomId = roomId;
  state.role = peer.role;
}

function clearPeerSocketState(socket: WebSocket): void {
  const state = socketStates.get(socket);

  if (state !== undefined) {
    clearSocketState(state);
  }
}

function clearSocketState(state: SocketState): void {
  delete state.peerId;
  delete state.roomId;
  delete state.role;
}

function validateRoomState(room: RoomState): void {
  if (room.roomId.trim().length === 0) {
    throw new Error("Signaling room id must be non-empty.");
  }

  if (room.createdAt < 0 || room.updatedAt < room.createdAt) {
    throw new Error("Signaling room metadata timestamps are inconsistent.");
  }

  if (room.host.role !== "host") {
    throw new Error("Signaling room host must have host role.");
  }

  if (room.guest !== undefined) {
    if (room.guest.role !== "guest") {
      throw new Error("Signaling room guest must have guest role.");
    }

    if (room.guest.peerId === room.host.peerId) {
      throw new Error("Signaling room peers must have unique ids.");
    }

    if (room.guest.joinedAt < room.createdAt) {
      throw new Error("Signaling room guest cannot join before room creation.");
    }
  }

  if (room.host.joinedAt < room.createdAt) {
    throw new Error("Signaling room host cannot join before room creation.");
  }
}

function sendSignalingError(
  socket: WebSocket,
  roomId: SignalingRoomId,
  recipientId: SignalingPeerId | undefined,
  reason: SignalingErrorReason,
  message: string,
  retryable?: boolean,
): void {
  send(
    socket,
    createSignalingErrorMessage(
      createServerRoute(roomId, recipientId),
      reason,
      message,
      retryable,
    ),
  );
}

function getSignalingMessageFreshnessError(message: SignalingMessage): string | null {
  const now = Date.now();

  if (message.sentAt > now + MAX_SIGNALING_CLOCK_SKEW_MS) {
    return "Signaling message timestamp is too far in the future.";
  }

  if (now - message.sentAt > MAX_SIGNALING_MESSAGE_AGE_MS) {
    return "Signaling message is stale and should be retried.";
  }

  return null;
}

function createServerRoute(
  roomId: SignalingRoomId,
  recipientId: SignalingPeerId | undefined,
): SignalingCreateOptions {
  const route: SignalingCreateOptions = {
    roomId,
    senderId: SIGNALING_SERVER_PEER_ID,
  };

  if (recipientId !== undefined) {
    return {
      ...route,
      recipientId,
    };
  }

  return route;
}

function send(socket: WebSocket, message: SignalingMessage): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(serializeSignalingMessage(message));
}

function closeSocket(socket: WebSocket, code: number, reason: string): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.close(code, reason);
}

function closeDisconnectedSocket(
  socket: WebSocket,
  closeMode: NonNullable<SocketDisconnectOptions["closeMode"]>,
): void {
  if (closeMode === "none") {
    return;
  }

  if (closeMode === "terminate") {
    terminateSocket(socket);
    return;
  }

  if (
    socket.readyState === WebSocket.OPEN ||
    socket.readyState === WebSocket.CONNECTING
  ) {
    socket.close();
  }
}

function terminateSocket(socket: WebSocket): void {
  if (socket.readyState === WebSocket.CLOSED) {
    return;
  }

  socket.terminate();
}

function shutdownSignalingServer(): void {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  cleanupSignalingServerState();

  for (const socket of Array.from(activeSockets)) {
    const state = socketStates.get(socket);

    if (state !== undefined) {
      state.hasDisconnected = true;
      clearSocketState(state);
      socketStates.delete(socket);
    }

    terminateSocket(socket);
  }

  activeSockets.clear();
  rooms.clear();

  server.close((error) => {
    if (error !== undefined) {
      console.error(`[kart-signaling] shutdown failed: ${error.message}`);
      process.exitCode = 1;
    }
  });
}

function cleanupSignalingServerState(): void {
  clearInterval(heartbeatTimer);
}

function isPeerSocketActive(peer: ConnectedPeer): boolean {
  return (
    activeSockets.has(peer.socket) &&
    peer.socket.readyState === WebSocket.OPEN
  );
}

function rawDataToPayload(data: RawData): string | Uint8Array {
  if (typeof data === "string") {
    return data;
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  return data;
}

function readPort(value: string | undefined): number {
  if (value === undefined || value.trim().length === 0) {
    return DEFAULT_SIGNALING_PORT;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid signaling server port: ${value}`);
  }

  return parsed;
}
