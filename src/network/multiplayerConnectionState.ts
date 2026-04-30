export const MULTIPLAYER_CONNECTION_PHASES = {
  IDLE: "idle",
  HOST: "host",
  JOIN: "join",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  FAILED: "failed",
  CLOSED: "closed",
  ERROR: "error",
} as const;

export type MultiplayerConnectionPhase =
  (typeof MULTIPLAYER_CONNECTION_PHASES)[keyof typeof MULTIPLAYER_CONNECTION_PHASES];

export type MultiplayerConnectionRole = "host" | "join";
export type MultiplayerConnectionTransport =
  | "signaling"
  | "webrtc"
  | "data-channel";
export type MultiplayerConnectionReportState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed";

export interface MultiplayerConnectionState {
  readonly phase: MultiplayerConnectionPhase;
  readonly role: MultiplayerConnectionRole | null;
  readonly roomId: string | null;
  readonly localPeerId: string | null;
  readonly remotePeerId: string | null;
  readonly displayName: string | null;
  readonly transport: MultiplayerConnectionTransport | null;
  readonly message: string;
  readonly reason: string | null;
  readonly revision: number;
  readonly updatedAt: number;
}

export interface MultiplayerConnectionStateReport {
  readonly state: MultiplayerConnectionReportState;
  readonly phase: MultiplayerConnectionPhase;
  readonly role: MultiplayerConnectionRole | null;
  readonly roomId: string | null;
  readonly localPeerId: string | null;
  readonly remotePeerId: string | null;
  readonly transport: MultiplayerConnectionTransport | null;
  readonly message: string;
  readonly reason: string | null;
  readonly revision: number;
  readonly updatedAt: number;
}

export type MultiplayerConnectionEvent =
  | {
      readonly type: "start-host";
      readonly roomId: string;
      readonly localPeerId: string;
      readonly displayName?: string;
      readonly message?: string;
    }
  | {
      readonly type: "start-join";
      readonly roomId: string;
      readonly localPeerId: string;
      readonly displayName?: string;
      readonly message?: string;
    }
  | {
      readonly type: "host-ready";
      readonly roomId?: string;
      readonly message?: string;
    }
  | {
      readonly type: "join-accepted";
      readonly roomId: string;
      readonly remotePeerId: string;
      readonly message?: string;
    }
  | {
      readonly type: "remote-peer-joined";
      readonly remotePeerId: string;
      readonly message?: string;
    }
  | {
      readonly type: "connecting";
      readonly transport?: MultiplayerConnectionTransport;
      readonly remotePeerId?: string;
      readonly message?: string;
    }
  | {
      readonly type: "connected";
      readonly transport?: MultiplayerConnectionTransport;
      readonly remotePeerId?: string;
      readonly message?: string;
    }
  | {
      readonly type: "disconnected";
      readonly reason: string;
      readonly message?: string;
    }
  | {
      readonly type: "failed";
      readonly reason: string;
      readonly message?: string;
    }
  | {
      readonly type: "closed";
      readonly reason?: string;
      readonly message?: string;
    }
  | {
      readonly type: "error";
      readonly reason: string;
      readonly message?: string;
    }
  | {
      readonly type: "reset";
      readonly message?: string;
    };

export interface MultiplayerConnectionStateChange {
  readonly previousState: MultiplayerConnectionState;
  readonly state: MultiplayerConnectionState;
  readonly event: MultiplayerConnectionEvent | null;
  readonly report: MultiplayerConnectionStateReport;
}

export type MultiplayerConnectionStateListener = (
  change: MultiplayerConnectionStateChange,
) => void;

export type MultiplayerConnectionReportListener = (
  report: MultiplayerConnectionStateReport,
  change: MultiplayerConnectionStateChange,
) => void;

export interface MultiplayerConnectionSubscriptionOptions {
  readonly emitCurrent?: boolean;
}

export interface MultiplayerConnectionStateModelOptions {
  readonly now?: () => number;
  readonly initialState?: MultiplayerConnectionState;
  readonly onStateChange?: MultiplayerConnectionStateListener;
  readonly onReport?: MultiplayerConnectionReportListener;
}

export class MultiplayerConnectionStateError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MultiplayerConnectionStateError";
  }
}

export class MultiplayerConnectionStateModel {
  private readonly now: () => number;
  private readonly stateListeners = new Set<MultiplayerConnectionStateListener>();
  private readonly reportListeners = new Set<MultiplayerConnectionReportListener>();
  private currentState: MultiplayerConnectionState;

  public constructor(options: MultiplayerConnectionStateModelOptions = {}) {
    this.now = options.now ?? Date.now;
    this.currentState =
      options.initialState ?? createInitialMultiplayerConnectionState(this.now());

    if (options.onStateChange !== undefined) {
      this.stateListeners.add(options.onStateChange);
    }

    if (options.onReport !== undefined) {
      this.reportListeners.add(options.onReport);
    }
  }

  public get state(): MultiplayerConnectionState {
    return this.currentState;
  }

  public get report(): MultiplayerConnectionStateReport {
    return createMultiplayerConnectionStateReport(this.currentState);
  }

  public dispatch(event: MultiplayerConnectionEvent): MultiplayerConnectionState {
    const previousState = this.currentState;
    this.currentState = transitionMultiplayerConnectionState(
      this.currentState,
      event,
      this.now(),
    );
    this.emitChange(previousState, this.currentState, event);
    return this.currentState;
  }

  public reset(message?: string): MultiplayerConnectionState {
    return this.dispatch(
      message === undefined ? { type: "reset" } : { type: "reset", message },
    );
  }

  public subscribe(
    listener: MultiplayerConnectionStateListener,
    options: MultiplayerConnectionSubscriptionOptions = {},
  ): () => void {
    this.stateListeners.add(listener);

    if (options.emitCurrent === true) {
      listener(this.createCurrentChange());
    }

    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public onStateChange(
    listener: MultiplayerConnectionStateListener,
    options: MultiplayerConnectionSubscriptionOptions = {},
  ): () => void {
    return this.subscribe(listener, options);
  }

  public onReport(
    listener: MultiplayerConnectionReportListener,
    options: MultiplayerConnectionSubscriptionOptions = {},
  ): () => void {
    this.reportListeners.add(listener);

    if (options.emitCurrent === true) {
      const change = this.createCurrentChange();
      listener(change.report, change);
    }

    return () => {
      this.reportListeners.delete(listener);
    };
  }

  private emitChange(
    previousState: MultiplayerConnectionState,
    state: MultiplayerConnectionState,
    event: MultiplayerConnectionEvent,
  ): void {
    const change: MultiplayerConnectionStateChange = {
      previousState,
      state,
      event,
      report: createMultiplayerConnectionStateReport(state),
    };

    for (const listener of this.stateListeners) {
      listener(change);
    }

    for (const listener of this.reportListeners) {
      listener(change.report, change);
    }
  }

  private createCurrentChange(): MultiplayerConnectionStateChange {
    return {
      previousState: this.currentState,
      state: this.currentState,
      event: null,
      report: createMultiplayerConnectionStateReport(this.currentState),
    };
  }
}

export function createInitialMultiplayerConnectionState(
  updatedAt = 0,
  revision = 0,
): MultiplayerConnectionState {
  return {
    phase: MULTIPLAYER_CONNECTION_PHASES.IDLE,
    role: null,
    roomId: null,
    localPeerId: null,
    remotePeerId: null,
    displayName: null,
    transport: null,
    message: "Offline",
    reason: null,
    revision,
    updatedAt,
  };
}

export function transitionMultiplayerConnectionState(
  current: MultiplayerConnectionState,
  event: MultiplayerConnectionEvent,
  updatedAt = Date.now(),
): MultiplayerConnectionState {
  const revision = current.revision + 1;

  switch (event.type) {
    case "reset":
      return {
        ...createInitialMultiplayerConnectionState(updatedAt, revision),
        message: event.message ?? "Offline",
      };
    case "start-host": {
      const roomId = requireNonEmptyText(event.roomId, "roomId");

      return {
        phase: MULTIPLAYER_CONNECTION_PHASES.HOST,
        role: "host",
        roomId,
        localPeerId: requireNonEmptyText(event.localPeerId, "localPeerId"),
        remotePeerId: null,
        displayName: normalizeOptionalText(event.displayName),
        transport: "signaling",
        message: event.message ?? `Creating room ${roomId}`,
        reason: null,
        revision,
        updatedAt,
      };
    }
    case "start-join": {
      const roomId = requireNonEmptyText(event.roomId, "roomId");

      return {
        phase: MULTIPLAYER_CONNECTION_PHASES.JOIN,
        role: "join",
        roomId,
        localPeerId: requireNonEmptyText(event.localPeerId, "localPeerId"),
        remotePeerId: null,
        displayName: normalizeOptionalText(event.displayName),
        transport: "signaling",
        message: event.message ?? `Joining room ${roomId}`,
        reason: null,
        revision,
        updatedAt,
      };
    }
    case "host-ready": {
      const roomId =
        event.roomId === undefined
          ? requireExistingText(current.roomId, "roomId")
          : requireNonEmptyText(event.roomId, "roomId");

      return {
        ...current,
        phase: MULTIPLAYER_CONNECTION_PHASES.HOST,
        role: "host",
        roomId,
        remotePeerId: null,
        transport: "signaling",
        message: event.message ?? `Room ${roomId} ready`,
        reason: null,
        revision,
        updatedAt,
      };
    }
    case "join-accepted": {
      const roomId = requireNonEmptyText(event.roomId, "roomId");
      const remotePeerId = requireNonEmptyText(
        event.remotePeerId,
        "remotePeerId",
      );

      return {
        ...current,
        phase: MULTIPLAYER_CONNECTION_PHASES.CONNECTING,
        role: "join",
        roomId,
        remotePeerId,
        transport: "webrtc",
        message: event.message ?? `Joined room ${roomId}`,
        reason: null,
        revision,
        updatedAt,
      };
    }
    case "remote-peer-joined": {
      const remotePeerId = requireNonEmptyText(event.remotePeerId, "remotePeerId");

      return {
        ...current,
        phase: MULTIPLAYER_CONNECTION_PHASES.CONNECTING,
        role: current.role ?? "host",
        remotePeerId,
        transport: "webrtc",
        message: event.message ?? "Remote peer joined",
        reason: null,
        revision,
        updatedAt,
      };
    }
    case "connecting":
      return {
        ...current,
        phase: MULTIPLAYER_CONNECTION_PHASES.CONNECTING,
        remotePeerId:
          event.remotePeerId === undefined
            ? current.remotePeerId
            : requireNonEmptyText(event.remotePeerId, "remotePeerId"),
        transport: event.transport ?? current.transport ?? "webrtc",
        message: event.message ?? "Connecting",
        reason: null,
        revision,
        updatedAt,
      };
    case "connected":
      return {
        ...current,
        phase: MULTIPLAYER_CONNECTION_PHASES.CONNECTED,
        remotePeerId:
          event.remotePeerId === undefined
            ? current.remotePeerId
            : requireNonEmptyText(event.remotePeerId, "remotePeerId"),
        transport: event.transport ?? current.transport ?? "data-channel",
        message: event.message ?? "Connected",
        reason: null,
        revision,
        updatedAt,
      };
    case "disconnected": {
      const reason = requireNonEmptyText(event.reason, "reason");

      return {
        ...current,
        phase: MULTIPLAYER_CONNECTION_PHASES.DISCONNECTED,
        transport: null,
        message: event.message ?? reason,
        reason,
        revision,
        updatedAt,
      };
    }
    case "error": {
      const reason = requireNonEmptyText(event.reason, "reason");

      return {
        ...current,
        phase: MULTIPLAYER_CONNECTION_PHASES.ERROR,
        transport: null,
        message: event.message ?? reason,
        reason,
        revision,
        updatedAt,
      };
    }
    case "failed": {
      const reason = requireNonEmptyText(event.reason, "reason");

      return {
        ...current,
        phase: MULTIPLAYER_CONNECTION_PHASES.FAILED,
        transport: null,
        message: event.message ?? reason,
        reason,
        revision,
        updatedAt,
      };
    }
    case "closed": {
      const reason =
        event.reason === undefined
          ? null
          : requireNonEmptyText(event.reason, "reason");

      return {
        ...current,
        phase: MULTIPLAYER_CONNECTION_PHASES.CLOSED,
        transport: null,
        message: event.message ?? reason ?? "Connection closed",
        reason,
        revision,
        updatedAt,
      };
    }
  }
}

export function createMultiplayerConnectionStateReport(
  state: MultiplayerConnectionState,
): MultiplayerConnectionStateReport {
  return {
    state: getMultiplayerConnectionReportState(state),
    phase: state.phase,
    role: state.role,
    roomId: state.roomId,
    localPeerId: state.localPeerId,
    remotePeerId: state.remotePeerId,
    transport: state.transport,
    message: state.message,
    reason: state.reason,
    revision: state.revision,
    updatedAt: state.updatedAt,
  };
}

export function getMultiplayerConnectionReportState(
  state: MultiplayerConnectionState,
): MultiplayerConnectionReportState {
  switch (state.phase) {
    case MULTIPLAYER_CONNECTION_PHASES.HOST:
    case MULTIPLAYER_CONNECTION_PHASES.JOIN:
    case MULTIPLAYER_CONNECTION_PHASES.CONNECTING:
      return "connecting";
    case MULTIPLAYER_CONNECTION_PHASES.CONNECTED:
      return "connected";
    case MULTIPLAYER_CONNECTION_PHASES.DISCONNECTED:
      return "disconnected";
    case MULTIPLAYER_CONNECTION_PHASES.ERROR:
    case MULTIPLAYER_CONNECTION_PHASES.FAILED:
      return "failed";
    case MULTIPLAYER_CONNECTION_PHASES.IDLE:
    case MULTIPLAYER_CONNECTION_PHASES.CLOSED:
      return "closed";
  }
}

export function isMultiplayerConnectionActive(
  state: MultiplayerConnectionState,
): boolean {
  return (
    state.phase === MULTIPLAYER_CONNECTION_PHASES.HOST ||
    state.phase === MULTIPLAYER_CONNECTION_PHASES.JOIN ||
    state.phase === MULTIPLAYER_CONNECTION_PHASES.CONNECTING ||
    state.phase === MULTIPLAYER_CONNECTION_PHASES.CONNECTED
  );
}

export function isMultiplayerConnectionTerminal(
  state: MultiplayerConnectionState,
): boolean {
  return (
    state.phase === MULTIPLAYER_CONNECTION_PHASES.DISCONNECTED ||
    state.phase === MULTIPLAYER_CONNECTION_PHASES.ERROR ||
    state.phase === MULTIPLAYER_CONNECTION_PHASES.FAILED ||
    state.phase === MULTIPLAYER_CONNECTION_PHASES.CLOSED
  );
}

function requireExistingText(value: string | null, key: string): string {
  if (value === null) {
    throw new MultiplayerConnectionStateError(
      `Connection state is missing required field: ${key}`,
    );
  }

  return requireNonEmptyText(value, key);
}

function requireNonEmptyText(value: string, key: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new MultiplayerConnectionStateError(
      `Connection state field must be non-empty: ${key}`,
    );
  }

  return normalized;
}

function normalizeOptionalText(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  return requireNonEmptyText(value, "displayName");
}
