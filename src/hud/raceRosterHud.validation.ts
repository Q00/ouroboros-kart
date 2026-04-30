import { MULTIPLAYER_CONNECTION_PHASES } from "../network/multiplayerConnectionState";
import {
  createRaceHudRacerStatus,
  type RaceHudConnectionContext,
  type RaceHudRacerParticipant
} from "./raceRosterHud";

const hostParticipant: RaceHudRacerParticipant = {
  racerId: "human_1",
  slotIndex: 0,
  controller: "human",
  peerId: "host-peer",
  isHost: true
};

const guestParticipant: RaceHudRacerParticipant = {
  racerId: "human_2",
  slotIndex: 1,
  controller: "human",
  peerId: "guest-peer",
  isHost: false
};

const aiParticipant: RaceHudRacerParticipant = {
  racerId: "ai_1",
  slotIndex: 2,
  controller: "ai",
  peerId: null,
  isHost: false
};

function runRaceRosterHudValidation(): void {
  validateConnectedHostAndGuestLabels();
  validateWaitingGuestLabel();
  validateAiLabel();

  console.info("raceRosterHud.validation passed");
}

function validateConnectedHostAndGuestLabels(): void {
  const context = createContext({
    localRacerId: "human_1",
    localPeerId: "host-peer",
    remotePeerId: "guest-peer",
    phase: MULTIPLAYER_CONNECTION_PHASES.CONNECTED,
    dataChannelOpen: true
  });
  const hostStatus = createRaceHudRacerStatus(hostParticipant, context);
  const guestStatus = createRaceHudRacerStatus(guestParticipant, context);

  assertEqual(hostStatus.roleLabel, "YOU", "local host role");
  assertEqual(hostStatus.statusLabel, "HOST ONLINE", "local host status");
  assertEqual(hostStatus.tone, "local", "local host tone");
  assertEqual(guestStatus.roleLabel, "GUEST", "remote guest role");
  assertEqual(guestStatus.statusLabel, "GUEST ONLINE", "remote guest status");
  assertEqual(guestStatus.tone, "connected", "remote guest tone");
}

function validateWaitingGuestLabel(): void {
  const context = createContext({
    localRacerId: "human_1",
    localPeerId: "host-peer",
    remotePeerId: null,
    phase: MULTIPLAYER_CONNECTION_PHASES.HOST,
    dataChannelOpen: false
  });
  const guestStatus = createRaceHudRacerStatus(guestParticipant, context);

  assertEqual(guestStatus.roleLabel, "GUEST", "waiting guest role");
  assertEqual(guestStatus.statusLabel, "GUEST WAITING", "waiting guest status");
  assertEqual(guestStatus.tone, "pending", "waiting guest tone");
}

function validateAiLabel(): void {
  const context = createContext({
    localRacerId: "human_1",
    localPeerId: "host-peer",
    remotePeerId: "guest-peer",
    phase: MULTIPLAYER_CONNECTION_PHASES.CONNECTED,
    dataChannelOpen: true
  });
  const aiStatus = createRaceHudRacerStatus(aiParticipant, context);

  assertEqual(aiStatus.roleLabel, "AI", "AI role");
  assertEqual(aiStatus.statusLabel, "AI DRIVER", "AI status");
  assertEqual(aiStatus.tone, "ai", "AI tone");
}

function createContext(
  overrides: RaceHudConnectionContext
): RaceHudConnectionContext {
  return overrides;
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

runRaceRosterHudValidation();
