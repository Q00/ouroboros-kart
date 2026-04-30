import {
  MULTIPLAYER_CONNECTION_PHASES,
  MultiplayerConnectionStateModel,
} from "./multiplayerConnectionState";
import { createMultiplayerFeedbackModel } from "./multiplayerFeedback";

export function validateMultiplayerFeedbackModel(): void {
  let clock = 2_000;
  const model = new MultiplayerConnectionStateModel({
    now: () => {
      clock += 100;
      return clock;
    },
  });

  const hosting = model.dispatch({
    type: "start-host",
    roomId: "ROOM42",
    localPeerId: "host-peer",
    displayName: "Host",
  });
  const hostingFeedback = createMultiplayerFeedbackModel(hosting, {
    now: clock + 2_500,
  });

  assertEqual(hostingFeedback.title, "Room ready", "host feedback title");
  assertEqual(hostingFeedback.severity, "pending", "host feedback severity");
  assertIncludes(hostingFeedback.metadata, "Room ROOM42", "host room metadata");
  assertIncludes(hostingFeedback.metadata, "Host", "host role metadata");
  assertEqual(
    hostingFeedback.updatedAgeSeconds,
    2,
    "host feedback age is rounded down",
  );

  model.dispatch({
    type: "remote-peer-joined",
    remotePeerId: "guest-peer-abcdef",
  });
  const connected = model.dispatch({
    type: "connected",
    transport: "data-channel",
    remotePeerId: "guest-peer-abcdef",
    message: "WebRTC data channel open",
  });
  const connectedFeedback = createMultiplayerFeedbackModel(connected, {
    latencyMs: 84,
  });

  assertEqual(
    connectedFeedback.title,
    "Multiplayer connected",
    "connected feedback title",
  );
  assertEqual(
    connectedFeedback.severity,
    "success",
    "healthy latency stays successful",
  );
  assertIncludes(
    connectedFeedback.metadata,
    "Data channel",
    "connected feedback transport metadata",
  );
  assertIncludes(
    connectedFeedback.metadata,
    "Peer guest-pe",
    "connected feedback peer metadata is abbreviated",
  );
  assertIncludes(
    connectedFeedback.metadata,
    "RTT 84 ms",
    "connected feedback latency metadata",
  );

  const slowFeedback = createMultiplayerFeedbackModel(connected, {
    latencyMs: 181,
  });

  assertEqual(
    slowFeedback.severity,
    "warning",
    "latency above target warns the player",
  );

  const disconnected = model.dispatch({
    type: "disconnected",
    reason: "WebRTC data channel closed",
  });
  const disconnectedFeedback = createMultiplayerFeedbackModel(disconnected, {
    canRetryLastSession: true,
    lastSessionRole: "host",
  });

  assertEqual(
    disconnected.phase,
    MULTIPLAYER_CONNECTION_PHASES.DISCONNECTED,
    "test reached disconnected state",
  );
  assertEqual(
    disconnectedFeedback.severity,
    "warning",
    "disconnect feedback warns",
  );
  assertEqual(
    disconnectedFeedback.recoveryLabel,
    "Retry Host",
    "host disconnect offers host retry",
  );

  const failed = model.dispatch({
    type: "error",
    reason: "Signaling server unavailable",
  });
  const failedFeedback = createMultiplayerFeedbackModel(failed, {
    canRetryLastSession: true,
    lastSessionRole: "join",
  });

  assertEqual(failedFeedback.severity, "danger", "errors are danger severity");
  assertEqual(
    failedFeedback.recoveryLabel,
    "Retry Join",
    "join error offers join retry",
  );
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function assertIncludes(
  values: readonly string[],
  expected: string,
  message: string,
): void {
  if (!values.includes(expected)) {
    throw new Error(`${message}: expected ${expected} in ${values.join(", ")}.`);
  }
}

void Promise.resolve()
  .then(() => {
    validateMultiplayerFeedbackModel();
    console.info("Multiplayer feedback validation passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
