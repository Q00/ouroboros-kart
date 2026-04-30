import {
  MULTIPLAYER_CONNECTION_PHASES,
  type MultiplayerConnectionRole,
  type MultiplayerConnectionState,
} from "./multiplayerConnectionState";

export type MultiplayerFeedbackSeverity =
  | "idle"
  | "pending"
  | "success"
  | "warning"
  | "danger";

export interface MultiplayerFeedbackOptions {
  readonly canRetryLastSession?: boolean;
  readonly lastSessionRole?: MultiplayerConnectionRole | null;
  readonly latencyMs?: number | null;
  readonly now?: number;
}

export interface MultiplayerFeedbackModel {
  readonly title: string;
  readonly detail: string;
  readonly severity: MultiplayerFeedbackSeverity;
  readonly metadata: readonly string[];
  readonly recoveryLabel: string | null;
  readonly isConnected: boolean;
  readonly isTerminal: boolean;
  readonly updatedAgeSeconds: number | null;
}

export function createMultiplayerFeedbackModel(
  state: MultiplayerConnectionState,
  options: MultiplayerFeedbackOptions = {},
): MultiplayerFeedbackModel {
  const isConnected = state.phase === MULTIPLAYER_CONNECTION_PHASES.CONNECTED;
  const isTerminal =
    state.phase === MULTIPLAYER_CONNECTION_PHASES.DISCONNECTED ||
    state.phase === MULTIPLAYER_CONNECTION_PHASES.ERROR ||
    state.phase === MULTIPLAYER_CONNECTION_PHASES.FAILED ||
    state.phase === MULTIPLAYER_CONNECTION_PHASES.CLOSED;
  const lastSessionRole = options.lastSessionRole ?? state.role;

  return {
    title: getFeedbackTitle(state),
    detail: getFeedbackDetail(state),
    severity: getFeedbackSeverity(state, options.latencyMs ?? null),
    metadata: createFeedbackMetadata(state, options.latencyMs ?? null),
    recoveryLabel:
      isTerminal && options.canRetryLastSession === true
        ? getRecoveryLabel(lastSessionRole)
        : null,
    isConnected,
    isTerminal,
    updatedAgeSeconds: getUpdatedAgeSeconds(state, options.now),
  };
}

function getFeedbackTitle(state: MultiplayerConnectionState): string {
  switch (state.phase) {
    case MULTIPLAYER_CONNECTION_PHASES.IDLE:
      return "Multiplayer offline";
    case MULTIPLAYER_CONNECTION_PHASES.HOST:
      return state.remotePeerId === null ? "Room ready" : "Hosting race";
    case MULTIPLAYER_CONNECTION_PHASES.JOIN:
      return "Joining room";
    case MULTIPLAYER_CONNECTION_PHASES.CONNECTING:
      return "Connecting peer";
    case MULTIPLAYER_CONNECTION_PHASES.CONNECTED:
      return "Multiplayer connected";
    case MULTIPLAYER_CONNECTION_PHASES.DISCONNECTED:
      return "Peer disconnected";
    case MULTIPLAYER_CONNECTION_PHASES.FAILED:
      return "Connection failed";
    case MULTIPLAYER_CONNECTION_PHASES.CLOSED:
      return "Multiplayer closed";
    case MULTIPLAYER_CONNECTION_PHASES.ERROR:
      return "Connection error";
  }
}

function getFeedbackDetail(state: MultiplayerConnectionState): string {
  if (state.phase === MULTIPLAYER_CONNECTION_PHASES.CONNECTED) {
    return state.message.length > 0
      ? state.message
      : "Data channel ready for racing";
  }

  if (state.phase === MULTIPLAYER_CONNECTION_PHASES.HOST) {
    return state.remotePeerId === null
      ? "Share the room code and wait for a racer."
      : state.message;
  }

  if (
    state.phase === MULTIPLAYER_CONNECTION_PHASES.DISCONNECTED ||
    state.phase === MULTIPLAYER_CONNECTION_PHASES.ERROR ||
    state.phase === MULTIPLAYER_CONNECTION_PHASES.FAILED ||
    state.phase === MULTIPLAYER_CONNECTION_PHASES.CLOSED
  ) {
    return state.message.length > 0
      ? state.message
      : (state.reason ?? state.message);
  }

  return state.message;
}

function getFeedbackSeverity(
  state: MultiplayerConnectionState,
  latencyMs: number | null,
): MultiplayerFeedbackSeverity {
  if (
    state.phase === MULTIPLAYER_CONNECTION_PHASES.ERROR ||
    state.phase === MULTIPLAYER_CONNECTION_PHASES.FAILED
  ) {
    return "danger";
  }

  if (state.phase === MULTIPLAYER_CONNECTION_PHASES.DISCONNECTED) {
    return "warning";
  }

  if (state.phase === MULTIPLAYER_CONNECTION_PHASES.CLOSED) {
    return "idle";
  }

  if (state.phase === MULTIPLAYER_CONNECTION_PHASES.CONNECTED) {
    return latencyMs !== null && latencyMs > 150 ? "warning" : "success";
  }

  if (state.phase === MULTIPLAYER_CONNECTION_PHASES.IDLE) {
    return "idle";
  }

  return "pending";
}

function createFeedbackMetadata(
  state: MultiplayerConnectionState,
  latencyMs: number | null,
): readonly string[] {
  const metadata: string[] = [];

  if (state.roomId !== null) {
    metadata.push(`Room ${state.roomId}`);
  }

  if (state.role !== null) {
    metadata.push(state.role === "host" ? "Host" : "Guest");
  }

  if (state.transport !== null) {
    metadata.push(getTransportLabel(state.transport));
  }

  if (state.remotePeerId !== null) {
    metadata.push(`Peer ${abbreviatePeerId(state.remotePeerId)}`);
  }

  if (latencyMs !== null && Number.isFinite(latencyMs)) {
    metadata.push(`RTT ${Math.max(0, Math.round(latencyMs))} ms`);
  }

  return metadata;
}

function getTransportLabel(
  transport: NonNullable<MultiplayerConnectionState["transport"]>,
): string {
  switch (transport) {
    case "signaling":
      return "Signaling";
    case "webrtc":
      return "WebRTC";
    case "data-channel":
      return "Data channel";
  }
}

function getRecoveryLabel(
  role: MultiplayerConnectionRole | null,
): string | null {
  if (role === "host") {
    return "Retry Host";
  }

  if (role === "join") {
    return "Retry Join";
  }

  return "Retry";
}

function getUpdatedAgeSeconds(
  state: MultiplayerConnectionState,
  now: number | undefined,
): number | null {
  if (now === undefined || !Number.isFinite(now) || state.updatedAt <= 0) {
    return null;
  }

  return Math.max(0, Math.floor((now - state.updatedAt) / 1000));
}

function abbreviatePeerId(peerId: string): string {
  return peerId.length <= 8 ? peerId : peerId.slice(0, 8);
}
