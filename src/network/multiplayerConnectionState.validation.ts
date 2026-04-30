import {
  MULTIPLAYER_CONNECTION_PHASES,
  MultiplayerConnectionStateError,
  MultiplayerConnectionStateModel,
  createMultiplayerConnectionStateReport,
  isMultiplayerConnectionActive,
  isMultiplayerConnectionTerminal,
  type MultiplayerConnectionReportState,
  type MultiplayerConnectionStateChange,
  type MultiplayerConnectionStateReport,
} from "./multiplayerConnectionState";

export function validateMultiplayerConnectionStateTransitions(): void {
  let clock = 1_000;
  const changes: MultiplayerConnectionStateChange[] = [];
  const reports: MultiplayerConnectionStateReport[] = [];
  const model = new MultiplayerConnectionStateModel({
    now: () => {
      clock += 16;
      return clock;
    },
    onStateChange: (change) => {
      changes.push(change);
    },
    onReport: (report) => {
      reports.push(report);
    },
  });

  assertEqual(model.state.phase, "idle", "connection state starts idle");
  assertEqual(model.state.role, null, "idle state has no role");
  assertEqual(model.report.state, "closed", "idle reports as closed to observers");

  const hosting = model.dispatch({
    type: "start-host",
    roomId: "ROOM42",
    localPeerId: "host-peer",
    displayName: "Host",
  });

  assertEqual(hosting.phase, MULTIPLAYER_CONNECTION_PHASES.HOST, "host starts");
  assertEqual(hosting.role, "host", "host role is tracked");
  assertEqual(hosting.roomId, "ROOM42", "host room is tracked");
  assertEqual(hosting.localPeerId, "host-peer", "host peer id is tracked");
  assert(isMultiplayerConnectionActive(hosting), "host state is active");
  assertEqual(
    createMultiplayerConnectionStateReport(hosting).state,
    "connecting",
    "host state reports as connecting",
  );

  const hostReady = model.dispatch({ type: "host-ready" });

  assertEqual(
    hostReady.phase,
    MULTIPLAYER_CONNECTION_PHASES.HOST,
    "host-ready keeps the host state",
  );
  assertEqual(hostReady.message, "Room ROOM42 ready", "host-ready has status text");
  assertEqual(hostReady.remotePeerId, null, "host waits without a remote peer");

  const hostConnecting = model.dispatch({
    type: "remote-peer-joined",
    remotePeerId: "guest-peer",
  });

  assertEqual(
    hostConnecting.phase,
    MULTIPLAYER_CONNECTION_PHASES.CONNECTING,
    "host moves to connecting when guest joins",
  );
  assertEqual(
    hostConnecting.remotePeerId,
    "guest-peer",
    "host tracks connected guest peer id",
  );
  assertEqual(hostConnecting.transport, "webrtc", "host begins WebRTC transport");

  model.dispatch({
    type: "connecting",
    transport: "webrtc",
    message: "Exchanging ICE",
  });
  const connected = model.dispatch({
    type: "connected",
    transport: "data-channel",
    message: "Data channel open",
  });

  assertEqual(
    connected.phase,
    MULTIPLAYER_CONNECTION_PHASES.CONNECTED,
    "connected state is tracked",
  );
  assertEqual(connected.transport, "data-channel", "connected uses data channel");
  assertEqual(model.report.state, "connected", "connected report state is emitted");

  const disconnected = model.dispatch({
    type: "disconnected",
    reason: "Peer disconnected",
  });

  assertEqual(
    disconnected.phase,
    MULTIPLAYER_CONNECTION_PHASES.DISCONNECTED,
    "disconnected state is terminal",
  );
  assertEqual(disconnected.reason, "Peer disconnected", "disconnect reason is tracked");
  assert(isMultiplayerConnectionTerminal(disconnected), "disconnect is terminal");

  const reset = model.reset();

  assertEqual(reset.phase, MULTIPLAYER_CONNECTION_PHASES.IDLE, "reset returns idle");
  assertEqual(reset.role, null, "reset clears role");
  assertEqual(reset.remotePeerId, null, "reset clears remote peer");
  assertEqual(model.report.state, "closed", "reset reports closed");

  const joining = model.dispatch({
    type: "start-join",
    roomId: "ROOM42",
    localPeerId: "guest-peer",
    displayName: "Player 2",
  });

  assertEqual(joining.phase, MULTIPLAYER_CONNECTION_PHASES.JOIN, "join starts");
  assertEqual(joining.role, "join", "join role is tracked");
  assertEqual(joining.transport, "signaling", "join starts over signaling");

  const joinConnecting = model.dispatch({
    type: "join-accepted",
    roomId: "ROOM42",
    remotePeerId: "host-peer",
  });

  assertEqual(
    joinConnecting.phase,
    MULTIPLAYER_CONNECTION_PHASES.CONNECTING,
    "join accepted moves to connecting",
  );
  assertEqual(joinConnecting.role, "join", "join role is preserved");
  assertEqual(
    joinConnecting.remotePeerId,
    "host-peer",
    "join tracks host peer id",
  );

  const failed = model.dispatch({
    type: "error",
    reason: "Signaling server unavailable",
  });

  assertEqual(failed.phase, MULTIPLAYER_CONNECTION_PHASES.ERROR, "error is tracked");
  assertEqual(
    failed.reason,
    "Signaling server unavailable",
    "error reason is tracked",
  );
  assertEqual(
    createMultiplayerConnectionStateReport(failed).state,
    "failed",
    "errors report failed state",
  );
  assert(isMultiplayerConnectionTerminal(failed), "error is terminal");

  const explicitFailed = model.dispatch({
    type: "failed",
    reason: "ICE failed",
  });

  assertEqual(
    explicitFailed.phase,
    MULTIPLAYER_CONNECTION_PHASES.FAILED,
    "failed event is tracked",
  );
  assertEqual(model.report.state, "failed", "failed event reports failed");
  assert(isMultiplayerConnectionTerminal(explicitFailed), "failed is terminal");

  const closed = model.dispatch({
    type: "closed",
    reason: "Player left lobby",
  });

  assertEqual(
    closed.phase,
    MULTIPLAYER_CONNECTION_PHASES.CLOSED,
    "closed event is tracked",
  );
  assertEqual(closed.reason, "Player left lobby", "closed reason is tracked");
  assertEqual(model.report.state, "closed", "closed event reports closed");
  assert(isMultiplayerConnectionTerminal(closed), "closed is terminal");

  assertReportStatesInclude(
    reports,
    ["connecting", "connected", "disconnected", "failed", "closed"],
    "state reports include all observable connection states",
  );
  assertEqual(
    changes.length,
    reports.length,
    "state-change and report hooks fire once per dispatch",
  );
  assertEqual(
    changes[0]?.previousState.phase,
    MULTIPLAYER_CONNECTION_PHASES.IDLE,
    "state-change hook receives previous state",
  );
  assertEqual(
    changes[0]?.event?.type,
    "start-host",
    "state-change hook receives source event",
  );

  const replayedReports: MultiplayerConnectionReportState[] = [];
  const unsubscribe = model.onReport(
    (report) => {
      replayedReports.push(report.state);
    },
    { emitCurrent: true },
  );

  assertEqual(
    replayedReports[0],
    "closed",
    "report subscription can replay current state",
  );

  model.dispatch({
    type: "connecting",
    message: "Reconnecting for hook validation",
  });
  assertEqual(
    replayedReports[1],
    "connecting",
    "report subscription observes future state",
  );
  unsubscribe();
  model.dispatch({ type: "connected" });
  assertEqual(
    replayedReports.length,
    2,
    "report subscription unsubscribe stops future events",
  );

  assertThrowsStateError(() => {
    model.dispatch({
      type: "start-host",
      roomId: " ",
      localPeerId: "host-peer",
    });
  }, "empty room ids are rejected");
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

function assertThrowsStateError(action: () => void, message: string): void {
  try {
    action();
  } catch (error) {
    if (error instanceof MultiplayerConnectionStateError) {
      return;
    }

    throw error;
  }

  throw new Error(message);
}

function assertReportStatesInclude(
  reports: readonly MultiplayerConnectionStateReport[],
  expectedStates: readonly MultiplayerConnectionReportState[],
  message: string,
): void {
  const observed = new Set(reports.map((report) => report.state));

  for (const expectedState of expectedStates) {
    if (!observed.has(expectedState)) {
      throw new Error(
        `${message}: missing ${expectedState}; observed ${[...observed].join(", ")}.`,
      );
    }
  }
}

void Promise.resolve()
  .then(() => {
    validateMultiplayerConnectionStateTransitions();
    console.info("Multiplayer connection state validation passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
