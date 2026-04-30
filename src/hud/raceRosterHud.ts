import {
  MULTIPLAYER_CONNECTION_PHASES,
  type MultiplayerConnectionPhase
} from "../network/multiplayerConnectionState";

export type RaceHudRacerController = "human" | "ai";
export type RaceHudRacerPeerRole = "host" | "guest";
export type RaceHudRacerRoleLabel = "YOU" | "HOST" | "GUEST" | "AI";
export type RaceHudRacerStatusTone =
  | "local"
  | "connected"
  | "pending"
  | "offline"
  | "ai";

export interface RaceHudRacerParticipant {
  readonly racerId: string;
  readonly slotIndex: number;
  readonly controller: RaceHudRacerController;
  readonly peerId: string | null;
  readonly isHost: boolean;
}

export interface RaceHudConnectionContext {
  readonly localRacerId: string | null;
  readonly localPeerId: string | null;
  readonly remotePeerId: string | null;
  readonly phase: MultiplayerConnectionPhase;
  readonly dataChannelOpen: boolean;
}

export interface RaceHudRacerStatus {
  readonly roleLabel: RaceHudRacerRoleLabel;
  readonly statusLabel: string;
  readonly tone: RaceHudRacerStatusTone;
  readonly isLocal: boolean;
  readonly isHuman: boolean;
  readonly isConnected: boolean;
  readonly peerRole: RaceHudRacerPeerRole | null;
}

interface HumanConnectionStatus {
  readonly label: "ONLINE" | "CONNECTING" | "WAITING" | "OFFLINE";
  readonly tone: Exclude<RaceHudRacerStatusTone, "ai">;
  readonly isConnected: boolean;
}

export function createRaceHudRacerStatus(
  participant: RaceHudRacerParticipant,
  context: RaceHudConnectionContext
): RaceHudRacerStatus {
  if (participant.controller === "ai") {
    return {
      roleLabel: "AI",
      statusLabel: "AI DRIVER",
      tone: "ai",
      isLocal: false,
      isHuman: false,
      isConnected: false,
      peerRole: null
    };
  }

  const peerRole = getHumanPeerRole(participant);
  const isLocal = isLocalHumanParticipant(participant, context);
  const connection = getHumanConnectionStatus(isLocal, context);

  return {
    roleLabel: isLocal ? "YOU" : getPeerRoleLabel(peerRole),
    statusLabel: `${formatPeerRole(peerRole)} ${connection.label}`,
    tone: isLocal && connection.isConnected ? "local" : connection.tone,
    isLocal,
    isHuman: true,
    isConnected: connection.isConnected,
    peerRole
  };
}

function isLocalHumanParticipant(
  participant: RaceHudRacerParticipant,
  context: RaceHudConnectionContext
): boolean {
  if (
    context.localRacerId !== null &&
    participant.racerId === context.localRacerId
  ) {
    return true;
  }

  return (
    participant.peerId !== null &&
    context.localPeerId !== null &&
    participant.peerId === context.localPeerId
  );
}

function getHumanConnectionStatus(
  isLocal: boolean,
  context: RaceHudConnectionContext
): HumanConnectionStatus {
  if (
    context.phase === MULTIPLAYER_CONNECTION_PHASES.CONNECTED &&
    context.dataChannelOpen
  ) {
    return {
      label: "ONLINE",
      tone: "connected",
      isConnected: true
    };
  }

  switch (context.phase) {
    case MULTIPLAYER_CONNECTION_PHASES.HOST:
      return {
        label: !isLocal && context.remotePeerId === null ? "WAITING" : "CONNECTING",
        tone: "pending",
        isConnected: false
      };
    case MULTIPLAYER_CONNECTION_PHASES.JOIN:
    case MULTIPLAYER_CONNECTION_PHASES.CONNECTING:
      return {
        label: "CONNECTING",
        tone: "pending",
        isConnected: false
      };
    case MULTIPLAYER_CONNECTION_PHASES.CONNECTED:
      return {
        label: "CONNECTING",
        tone: "pending",
        isConnected: false
      };
    case MULTIPLAYER_CONNECTION_PHASES.IDLE:
    case MULTIPLAYER_CONNECTION_PHASES.DISCONNECTED:
    case MULTIPLAYER_CONNECTION_PHASES.FAILED:
    case MULTIPLAYER_CONNECTION_PHASES.CLOSED:
    case MULTIPLAYER_CONNECTION_PHASES.ERROR:
      return {
        label: "OFFLINE",
        tone: "offline",
        isConnected: false
      };
  }
}

function getHumanPeerRole(
  participant: RaceHudRacerParticipant
): RaceHudRacerPeerRole {
  return participant.isHost || participant.slotIndex === 0 ? "host" : "guest";
}

function getPeerRoleLabel(role: RaceHudRacerPeerRole): "HOST" | "GUEST" {
  return role === "host" ? "HOST" : "GUEST";
}

function formatPeerRole(role: RaceHudRacerPeerRole): "HOST" | "GUEST" {
  return role === "host" ? "HOST" : "GUEST";
}
