import type { RaceProgressSnapshot, RaceSessionRacerState } from "../race/raceSession";
import {
  createKartRacerTransform,
  createKartRacerTransformFromRaceState,
  type KartRacerTransform
} from "./kartTransformSnapshot";
import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  KART_GAMEPLAY_PROTOCOL,
  KART_GAMEPLAY_VERSION
} from "./kartInputSnapshot";

export const MAX_AUTHORITATIVE_PLAYER_SNAPSHOT_PAYLOAD_BYTES = 4 * 1024;
export const DEFAULT_AUTHORITATIVE_PLAYER_SNAPSHOT_RATE_HZ = 30;
export const MAX_REMOTE_AUTHORITATIVE_PLAYER_SNAPSHOT_BUFFER_SIZE = 12;
export const DEFAULT_AUTHORITATIVE_PLAYER_RECONCILIATION_SECONDS = 0.12;
const AUTHORITATIVE_PLAYER_SNAPSHOT_TICK_EPSILON = 1e-9;
const AUTHORITATIVE_PLAYER_RECONCILIATION_SETTLE_DISTANCE = 0.02;
const AUTHORITATIVE_PLAYER_RECONCILIATION_SETTLE_HEADING_RADIANS = 0.01;

export interface KartAuthoritativeHostTick {
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
}

export interface KartAuthoritativePlayerState {
  readonly peerId: string;
  readonly racerId: string;
  readonly slotIndex: number;
  readonly displayName: string;
  readonly controller: "human";
  readonly progress: RaceProgressSnapshot;
  readonly transform: KartRacerTransform;
}

export interface KartAuthoritativePlayerSnapshot {
  readonly protocol: typeof KART_GAMEPLAY_PROTOCOL;
  readonly version: typeof KART_GAMEPLAY_VERSION;
  readonly type: typeof KART_GAMEPLAY_MESSAGE_TYPES.AUTHORITATIVE_PLAYER_SNAPSHOT;
  readonly hostPeerId: string;
  readonly peerId: string;
  readonly racerId: string;
  readonly sequence: number;
  readonly hostTick: KartAuthoritativeHostTick;
  readonly acknowledgedPeerInputSequence: number | null;
  readonly capturedAt: number;
  readonly playerState: KartAuthoritativePlayerState;
}

export interface KartAuthoritativePlayerSnapshotCreateOptions {
  readonly hostPeerId: string;
  readonly peerId: string;
  readonly racerId: string;
  readonly sequence: number;
  readonly hostTick: KartAuthoritativeHostTick;
  readonly acknowledgedPeerInputSequence: number | null;
  readonly capturedAt: number;
  readonly playerState: KartAuthoritativePlayerState;
}

export interface LocalKartAuthoritativePlayerSnapshotEmitterOptions {
  readonly hostPeerId: string;
  readonly peerId: string;
  readonly racerId: string;
  readonly send: (
    payload: string,
    snapshot: KartAuthoritativePlayerSnapshot
  ) => boolean;
  readonly now?: () => number;
}

export interface RemoteKartAuthoritativePlayerSnapshotSynchronizerOptions {
  readonly expectedHostPeerId?: string;
  readonly expectedPeerId?: string;
  readonly expectedRacerId?: string;
  readonly maxBufferedSnapshots?: number;
  readonly maxPayloadBytes?: number;
  readonly now?: () => number;
}

export interface RemoteKartAuthoritativePlayerReconcilerOptions {
  readonly smoothingSeconds?: number;
  readonly settleDistance?: number;
  readonly settleHeadingRadians?: number;
}

export interface FixedKartAuthoritativePlayerSnapshotClockOptions {
  readonly tickRateHz?: number;
}

export interface RemoteKartAuthoritativePlayerSnapshotMetadata {
  readonly sequence: number;
  readonly peerId: string;
  readonly racerId: string;
  readonly hostTick: KartAuthoritativeHostTick;
  readonly acknowledgedPeerInputSequence: number | null;
  readonly capturedAt: number;
  readonly receivedAt: number;
}

export interface RemoteKartAuthoritativePlayerReconciliationState {
  readonly sequence: number;
  readonly racerId: string;
  readonly slotIndex: number;
  readonly remainingSeconds: number;
  readonly positionErrorMagnitude: number;
  readonly headingErrorRadians: number;
}

export interface RemoteKartAuthoritativePlayerReconciliationResult {
  readonly transform: KartRacerTransform;
  readonly active: boolean;
  readonly completed: boolean;
  readonly remainingSeconds: number;
  readonly positionErrorMagnitude: number;
  readonly headingErrorRadians: number;
}

export type RemoteKartAuthoritativePlayerSnapshotRejectionReason =
  | "payload-too-large"
  | "invalid-snapshot"
  | "unexpected-host"
  | "unexpected-peer"
  | "unexpected-racer"
  | "out-of-order-sequence"
  | "duplicate-sequence"
  | "stale-sequence";

export type RemoteKartAuthoritativePlayerSnapshotAcceptResult =
  | {
      readonly accepted: true;
      readonly snapshot: KartAuthoritativePlayerSnapshot;
      readonly metadata: RemoteKartAuthoritativePlayerSnapshotMetadata;
      readonly bufferedCount: number;
      readonly droppedSnapshots: readonly KartAuthoritativePlayerSnapshot[];
      readonly droppedMetadata: readonly RemoteKartAuthoritativePlayerSnapshotMetadata[];
    }
  | {
      readonly accepted: false;
      readonly reason: RemoteKartAuthoritativePlayerSnapshotRejectionReason;
      readonly message: string;
      readonly bufferedCount: number;
      readonly rejectedCount: number;
    };

interface ReceivedKartAuthoritativePlayerSnapshot {
  readonly snapshot: KartAuthoritativePlayerSnapshot;
  readonly metadata: RemoteKartAuthoritativePlayerSnapshotMetadata;
}

interface PendingAuthoritativePlayerCorrection {
  readonly sequence: number;
  readonly racerId: string;
  readonly slotIndex: number;
  readonly positionError: KartRacerTransform["position"];
  readonly velocityError: KartRacerTransform["velocity"];
  readonly speedError: number;
  readonly headingErrorRadians: number;
  readonly remainingSeconds: number;
}

export class KartAuthoritativePlayerSnapshotError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "KartAuthoritativePlayerSnapshotError";
  }
}

export class RemoteKartAuthoritativePlayerReconciler {
  private readonly smoothingSeconds: number;
  private readonly settleDistance: number;
  private readonly settleHeadingRadians: number;
  private pendingCorrection: PendingAuthoritativePlayerCorrection | null = null;

  public constructor(
    options: RemoteKartAuthoritativePlayerReconcilerOptions = {}
  ) {
    this.smoothingSeconds = requireFiniteNonNegativeNumber(
      options.smoothingSeconds ??
        DEFAULT_AUTHORITATIVE_PLAYER_RECONCILIATION_SECONDS,
      "smoothingSeconds"
    );
    this.settleDistance = requireFiniteNonNegativeNumber(
      options.settleDistance ??
        AUTHORITATIVE_PLAYER_RECONCILIATION_SETTLE_DISTANCE,
      "settleDistance"
    );
    this.settleHeadingRadians = requireFiniteNonNegativeNumber(
      options.settleHeadingRadians ??
        AUTHORITATIVE_PLAYER_RECONCILIATION_SETTLE_HEADING_RADIANS,
      "settleHeadingRadians"
    );
  }

  public get active(): boolean {
    return this.pendingCorrection !== null;
  }

  public get state(): RemoteKartAuthoritativePlayerReconciliationState | null {
    return this.pendingCorrection === null
      ? null
      : createReconciliationState(this.pendingCorrection);
  }

  public accept(
    snapshot: KartAuthoritativePlayerSnapshot,
    currentTransform: KartRacerTransform
  ): RemoteKartAuthoritativePlayerReconciliationState | null {
    const authoritativeTransform = snapshot.playerState.transform;
    const current = createKartRacerTransform(currentTransform);

    if (
      authoritativeTransform.racerId !== current.racerId ||
      authoritativeTransform.slotIndex !== current.slotIndex
    ) {
      return null;
    }

    const positionError = subtractVector(
      authoritativeTransform.position,
      current.position
    );
    const headingErrorRadians = shortestAngleDelta(
      current.headingRadians,
      authoritativeTransform.headingRadians
    );
    const positionErrorMagnitude = getPlanarVectorMagnitude(positionError);

    if (
      positionErrorMagnitude <= this.settleDistance &&
      Math.abs(headingErrorRadians) <= this.settleHeadingRadians
    ) {
      this.pendingCorrection = null;
      return null;
    }

    this.pendingCorrection = {
      sequence: snapshot.sequence,
      racerId: current.racerId,
      slotIndex: current.slotIndex,
      positionError,
      velocityError: subtractVector(
        authoritativeTransform.velocity,
        current.velocity
      ),
      speedError: authoritativeTransform.speed - current.speed,
      headingErrorRadians,
      remainingSeconds: this.smoothingSeconds
    };

    return createReconciliationState(this.pendingCorrection);
  }

  public apply(
    currentTransform: KartRacerTransform,
    deltaSeconds: number
  ): RemoteKartAuthoritativePlayerReconciliationResult {
    const current = createKartRacerTransform(currentTransform);
    const correction = this.pendingCorrection;

    if (
      correction === null ||
      correction.racerId !== current.racerId ||
      correction.slotIndex !== current.slotIndex
    ) {
      return createInactiveReconciliationResult(current);
    }

    const elapsedSeconds = requireFiniteNonNegativeNumber(
      deltaSeconds,
      "deltaSeconds"
    );
    const correctionRatio =
      correction.remainingSeconds <= Number.EPSILON
        ? 1
        : clamp(elapsedSeconds / correction.remainingSeconds, 0, 1);
    const nextPositionError = scaleVector(
      correction.positionError,
      1 - correctionRatio
    );
    const nextVelocityError = scaleVector(
      correction.velocityError,
      1 - correctionRatio
    );
    const nextHeadingErrorRadians =
      correction.headingErrorRadians * (1 - correctionRatio);
    const nextSpeedError = correction.speedError * (1 - correctionRatio);
    const headingRadians = normalizeAngle(
      current.headingRadians + correction.headingErrorRadians * correctionRatio
    );
    const transform = createKartRacerTransform({
      ...current,
      position: addVector(
        current.position,
        scaleVector(correction.positionError, correctionRatio)
      ),
      velocity: addVector(
        current.velocity,
        scaleVector(correction.velocityError, correctionRatio)
      ),
      forward: forwardFromHeading(headingRadians),
      headingRadians,
      speed: Math.max(0, current.speed + correction.speedError * correctionRatio)
    });
    const remainingSeconds = Math.max(
      0,
      correction.remainingSeconds - elapsedSeconds
    );
    const completed =
      remainingSeconds <= Number.EPSILON ||
      (getPlanarVectorMagnitude(nextPositionError) <= this.settleDistance &&
        Math.abs(nextHeadingErrorRadians) <= this.settleHeadingRadians);

    if (completed) {
      this.pendingCorrection = null;
    } else {
      this.pendingCorrection = {
        ...correction,
        positionError: nextPositionError,
        velocityError: nextVelocityError,
        speedError: nextSpeedError,
        headingErrorRadians: nextHeadingErrorRadians,
        remainingSeconds
      };
    }

    return {
      transform,
      active: true,
      completed,
      remainingSeconds,
      positionErrorMagnitude: getPlanarVectorMagnitude(nextPositionError),
      headingErrorRadians: nextHeadingErrorRadians
    };
  }

  public clear(): void {
    this.pendingCorrection = null;
  }
}

export class FixedKartAuthoritativePlayerSnapshotClock {
  private readonly tickRateHz: number;
  private readonly tickIntervalSeconds: number;
  private nextTickIndex = 1;
  private nextTickElapsedSeconds: number;

  public constructor(
    options: FixedKartAuthoritativePlayerSnapshotClockOptions = {}
  ) {
    this.tickRateHz = requirePositiveWholeNumber(
      options.tickRateHz ?? DEFAULT_AUTHORITATIVE_PLAYER_SNAPSHOT_RATE_HZ,
      "tickRateHz"
    );
    this.tickIntervalSeconds = 1 / this.tickRateHz;
    this.nextTickElapsedSeconds = this.tickIntervalSeconds;
  }

  public get intervalSeconds(): number {
    return this.tickIntervalSeconds;
  }

  public reset(): void {
    this.nextTickIndex = 1;
    this.nextTickElapsedSeconds = this.tickIntervalSeconds;
  }

  public consumeDueTick(elapsedSeconds: number): KartAuthoritativeHostTick | null {
    const currentElapsedSeconds = requireFiniteNonNegativeNumber(
      elapsedSeconds,
      "elapsedSeconds"
    );
    let dueTick: KartAuthoritativeHostTick | null = null;

    while (
      this.nextTickElapsedSeconds <=
      currentElapsedSeconds + AUTHORITATIVE_PLAYER_SNAPSHOT_TICK_EPSILON
    ) {
      dueTick = {
        tickIndex: this.nextTickIndex,
        elapsedSeconds: this.nextTickElapsedSeconds
      };
      this.nextTickIndex += 1;
      this.nextTickElapsedSeconds += this.tickIntervalSeconds;
    }

    return dueTick === null ? null : createKartAuthoritativeHostTick(dueTick);
  }
}

export class LocalKartAuthoritativePlayerSnapshotEmitter {
  private readonly hostPeerId: string;
  private readonly peerId: string;
  private readonly racerId: string;
  private readonly send: (
    payload: string,
    snapshot: KartAuthoritativePlayerSnapshot
  ) => boolean;
  private readonly now: () => number;
  private nextSequence = 0;

  public constructor(options: LocalKartAuthoritativePlayerSnapshotEmitterOptions) {
    this.hostPeerId = requireNonEmptyText(options.hostPeerId, "hostPeerId");
    this.peerId = requireNonEmptyText(options.peerId, "peerId");
    this.racerId = requireNonEmptyText(options.racerId, "racerId");
    this.send = options.send;
    this.now = options.now ?? Date.now;
  }

  public emit(
    hostTick: KartAuthoritativeHostTick,
    acknowledgedPeerInputSequence: number | null,
    playerState: KartAuthoritativePlayerState
  ): KartAuthoritativePlayerSnapshot | null {
    const snapshot = createKartAuthoritativePlayerSnapshot({
      hostPeerId: this.hostPeerId,
      peerId: this.peerId,
      racerId: this.racerId,
      sequence: this.nextSequence,
      hostTick,
      acknowledgedPeerInputSequence,
      capturedAt: this.now(),
      playerState
    });
    const payload = serializeKartAuthoritativePlayerSnapshot(snapshot);

    this.nextSequence += 1;

    if (!this.send(payload, snapshot)) {
      return null;
    }

    return snapshot;
  }
}

export class RemoteKartAuthoritativePlayerSnapshotSynchronizer {
  private readonly expectedHostPeerId: string | undefined;
  private readonly expectedPeerId: string | undefined;
  private readonly expectedRacerId: string | undefined;
  private readonly maxBufferedSnapshots: number;
  private readonly maxPayloadBytes: number;
  private readonly now: () => number;
  private readonly snapshots: ReceivedKartAuthoritativePlayerSnapshot[] = [];
  private lastAcceptedSequence = -1;
  private lastDroppedSequence = -1;
  private rejectedSnapshots = 0;
  private droppedSnapshots = 0;

  public constructor(
    options: RemoteKartAuthoritativePlayerSnapshotSynchronizerOptions = {}
  ) {
    this.expectedHostPeerId =
      options.expectedHostPeerId === undefined
        ? undefined
        : requireNonEmptyText(options.expectedHostPeerId, "expectedHostPeerId");
    this.expectedPeerId =
      options.expectedPeerId === undefined
        ? undefined
        : requireNonEmptyText(options.expectedPeerId, "expectedPeerId");
    this.expectedRacerId =
      options.expectedRacerId === undefined
        ? undefined
        : requireNonEmptyText(options.expectedRacerId, "expectedRacerId");
    this.maxBufferedSnapshots = requirePositiveWholeNumber(
      options.maxBufferedSnapshots ??
        MAX_REMOTE_AUTHORITATIVE_PLAYER_SNAPSHOT_BUFFER_SIZE,
      "maxBufferedSnapshots"
    );
    this.maxPayloadBytes = requirePositiveWholeNumber(
      options.maxPayloadBytes ?? MAX_AUTHORITATIVE_PLAYER_SNAPSHOT_PAYLOAD_BYTES,
      "maxPayloadBytes"
    );
    this.now = options.now ?? Date.now;
  }

  public get bufferedCount(): number {
    return this.snapshots.length;
  }

  public get rejectedCount(): number {
    return this.rejectedSnapshots;
  }

  public get droppedCount(): number {
    return this.droppedSnapshots;
  }

  public get latestSnapshot(): KartAuthoritativePlayerSnapshot | null {
    return this.snapshots[this.snapshots.length - 1]?.snapshot ?? null;
  }

  public get latestMetadata(): RemoteKartAuthoritativePlayerSnapshotMetadata | null {
    return this.snapshots[this.snapshots.length - 1]?.metadata ?? null;
  }

  public get metadataBuffer(): readonly RemoteKartAuthoritativePlayerSnapshotMetadata[] {
    return this.snapshots.map((entry) => entry.metadata);
  }

  public accept(
    input: unknown,
    receivedAt: number = this.now()
  ): RemoteKartAuthoritativePlayerSnapshotAcceptResult {
    let snapshot: KartAuthoritativePlayerSnapshot;

    if (typeof input === "string") {
      if (getUtf8ByteLength(input) > this.maxPayloadBytes) {
        return this.reject(
          "payload-too-large",
          "Remote authoritative player snapshot payload exceeds the packet size limit."
        );
      }

      try {
        snapshot = deserializeKartAuthoritativePlayerSnapshot(input);
      } catch (error) {
        return this.reject(
          "invalid-snapshot",
          getErrorMessage(
            error,
            "Remote authoritative player snapshot payload is invalid."
          )
        );
      }
    } else {
      try {
        snapshot = createKartAuthoritativePlayerSnapshot(
          input as KartAuthoritativePlayerSnapshotCreateOptions
        );
      } catch (error) {
        return this.reject(
          "invalid-snapshot",
          getErrorMessage(
            error,
            "Remote authoritative player snapshot is invalid."
          )
        );
      }
    }

    if (
      this.expectedHostPeerId !== undefined &&
      snapshot.hostPeerId !== this.expectedHostPeerId
    ) {
      return this.reject(
        "unexpected-host",
        `Remote authoritative player snapshot host mismatch: ${snapshot.hostPeerId}.`
      );
    }

    if (
      this.expectedPeerId !== undefined &&
      snapshot.peerId !== this.expectedPeerId
    ) {
      return this.reject(
        "unexpected-peer",
        `Remote authoritative player snapshot peer mismatch: ${snapshot.peerId}.`
      );
    }

    if (
      this.expectedRacerId !== undefined &&
      snapshot.racerId !== this.expectedRacerId
    ) {
      return this.reject(
        "unexpected-racer",
        `Remote authoritative player snapshot racer mismatch: ${snapshot.racerId}.`
      );
    }

    if (snapshot.sequence <= this.lastDroppedSequence) {
      return this.reject(
        "stale-sequence",
        `Remote authoritative player snapshot sequence ${snapshot.sequence} has already been dropped.`
      );
    }

    if (
      this.snapshots.some(
        (bufferedSnapshot) =>
          bufferedSnapshot.snapshot.sequence === snapshot.sequence
      )
    ) {
      return this.reject(
        "duplicate-sequence",
        `Remote authoritative player snapshot sequence ${snapshot.sequence} is already buffered.`
      );
    }

    if (snapshot.sequence < this.lastAcceptedSequence) {
      return this.reject(
        "out-of-order-sequence",
        `Remote authoritative player snapshot sequence ${snapshot.sequence} arrived after sequence ${this.lastAcceptedSequence}.`
      );
    }

    const metadata = createRemoteKartAuthoritativePlayerSnapshotMetadata(
      snapshot,
      requireFiniteNonNegativeNumber(receivedAt, "receivedAt")
    );

    this.snapshots.push({
      snapshot,
      metadata
    });
    this.lastAcceptedSequence = Math.max(
      this.lastAcceptedSequence,
      snapshot.sequence
    );
    this.snapshots.sort(compareReceivedAuthoritativePlayerSnapshots);

    const droppedEntries = this.trimBufferedSnapshots();

    return {
      accepted: true,
      snapshot,
      metadata,
      bufferedCount: this.snapshots.length,
      droppedSnapshots: droppedEntries.map((entry) => entry.snapshot),
      droppedMetadata: droppedEntries.map((entry) => entry.metadata)
    };
  }

  public clear(): void {
    this.snapshots.length = 0;
    this.lastAcceptedSequence = -1;
    this.lastDroppedSequence = -1;
    this.rejectedSnapshots = 0;
    this.droppedSnapshots = 0;
  }

  private reject(
    reason: RemoteKartAuthoritativePlayerSnapshotRejectionReason,
    message: string
  ): RemoteKartAuthoritativePlayerSnapshotAcceptResult {
    this.rejectedSnapshots += 1;

    return {
      accepted: false,
      reason,
      message,
      bufferedCount: this.snapshots.length,
      rejectedCount: this.rejectedSnapshots
    };
  }

  private trimBufferedSnapshots(): readonly ReceivedKartAuthoritativePlayerSnapshot[] {
    const droppedEntries: ReceivedKartAuthoritativePlayerSnapshot[] = [];

    while (this.snapshots.length > this.maxBufferedSnapshots) {
      const droppedEntry = this.snapshots.shift();

      if (droppedEntry !== undefined) {
        droppedEntries.push(droppedEntry);
      }
    }

    this.droppedSnapshots += droppedEntries.length;

    for (const entry of droppedEntries) {
      this.lastDroppedSequence = Math.max(
        this.lastDroppedSequence,
        entry.snapshot.sequence
      );
    }

    return droppedEntries;
  }
}

export function createKartAuthoritativePlayerSnapshot(
  options: KartAuthoritativePlayerSnapshotCreateOptions
): KartAuthoritativePlayerSnapshot {
  const hostPeerId = requireNonEmptyText(options.hostPeerId, "hostPeerId");
  const peerId = requireNonEmptyText(options.peerId, "peerId");
  const racerId = requireNonEmptyText(options.racerId, "racerId");
  const playerState = createKartAuthoritativePlayerState(options.playerState);

  if (playerState.peerId !== peerId) {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player snapshot peer id must match player state."
    );
  }

  if (playerState.racerId !== racerId) {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player snapshot racer id must match player state."
    );
  }

  return {
    protocol: KART_GAMEPLAY_PROTOCOL,
    version: KART_GAMEPLAY_VERSION,
    type: KART_GAMEPLAY_MESSAGE_TYPES.AUTHORITATIVE_PLAYER_SNAPSHOT,
    hostPeerId,
    peerId,
    racerId,
    sequence: requireWholeNumber(options.sequence, "sequence"),
    hostTick: createKartAuthoritativeHostTick(options.hostTick),
    acknowledgedPeerInputSequence: requireNullableWholeNumber(
      options.acknowledgedPeerInputSequence,
      "acknowledgedPeerInputSequence"
    ),
    capturedAt: requireFiniteNonNegativeNumber(options.capturedAt, "capturedAt"),
    playerState
  };
}

export function createKartAuthoritativePlayerState(
  state: KartAuthoritativePlayerState
): KartAuthoritativePlayerState {
  const peerId = requireNonEmptyText(state.peerId, "playerState.peerId");
  const racerId = requireNonEmptyText(state.racerId, "playerState.racerId");
  const slotIndex = requireWholeNumber(state.slotIndex, "playerState.slotIndex");
  const displayName = requireNonEmptyText(
    state.displayName,
    "playerState.displayName"
  );
  const controller = requirePlayerController(
    state.controller,
    "playerState.controller"
  );
  const progress = createAuthoritativeRaceProgressSnapshot(state.progress);
  const transform = createKartRacerTransform(state.transform);

  if (progress.racerId !== racerId) {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player progress racer id must match player state."
    );
  }

  if (progress.slotIndex !== slotIndex) {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player progress slot index must match player state."
    );
  }

  if (progress.displayName !== displayName) {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player progress display name must match player state."
    );
  }

  if (progress.controller !== controller) {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player progress controller must match player state."
    );
  }

  if (transform.racerId !== racerId) {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player transform racer id must match player state."
    );
  }

  if (transform.slotIndex !== slotIndex) {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player transform slot index must match player state."
    );
  }

  return {
    peerId,
    racerId,
    slotIndex,
    displayName,
    controller,
    progress,
    transform
  };
}

export function createKartAuthoritativePlayerStateFromRaceState(
  racer: RaceSessionRacerState,
  progress: RaceProgressSnapshot
): KartAuthoritativePlayerState {
  if (racer.peerId === null) {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player snapshots require a human racer peer id."
    );
  }

  return createKartAuthoritativePlayerState({
    peerId: racer.peerId,
    racerId: racer.id,
    slotIndex: racer.slotIndex,
    displayName: racer.displayName,
    controller: requirePlayerController(racer.controller, "racer.controller"),
    progress,
    transform: createKartRacerTransformFromRaceState(racer)
  });
}

export function serializeKartAuthoritativePlayerSnapshot(
  snapshot: KartAuthoritativePlayerSnapshot
): string {
  return JSON.stringify(createKartAuthoritativePlayerSnapshot(snapshot));
}

export function deserializeKartAuthoritativePlayerSnapshot(
  payload: unknown
): KartAuthoritativePlayerSnapshot {
  if (typeof payload !== "string") {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player snapshot payload must be a string."
    );
  }

  if (getUtf8ByteLength(payload) > MAX_AUTHORITATIVE_PLAYER_SNAPSHOT_PAYLOAD_BYTES) {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player snapshot payload exceeds the packet size limit."
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player snapshot payload is not valid JSON."
    );
  }

  if (!isRecord(parsed)) {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player snapshot payload must be an object."
    );
  }

  if (parsed.protocol !== KART_GAMEPLAY_PROTOCOL) {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player snapshot protocol mismatch."
    );
  }

  if (parsed.version !== KART_GAMEPLAY_VERSION) {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player snapshot version mismatch."
    );
  }

  if (parsed.type !== KART_GAMEPLAY_MESSAGE_TYPES.AUTHORITATIVE_PLAYER_SNAPSHOT) {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player snapshot type mismatch."
    );
  }

  return createKartAuthoritativePlayerSnapshot({
    hostPeerId: requireStringField(parsed, "hostPeerId"),
    peerId: requireStringField(parsed, "peerId"),
    racerId: requireStringField(parsed, "racerId"),
    sequence: requireNumberField(parsed, "sequence"),
    hostTick: requireHostTickField(parsed, "hostTick"),
    acknowledgedPeerInputSequence: requireNullableNumberField(
      parsed,
      "acknowledgedPeerInputSequence"
    ),
    capturedAt: requireNumberField(parsed, "capturedAt"),
    playerState: requirePlayerStateField(parsed, "playerState")
  });
}

export function isKartAuthoritativePlayerSnapshotPayload(
  payload: unknown
): payload is string {
  if (typeof payload !== "string") {
    return false;
  }

  try {
    deserializeKartAuthoritativePlayerSnapshot(payload);
    return true;
  } catch {
    return false;
  }
}

function createKartAuthoritativeHostTick(
  hostTick: KartAuthoritativeHostTick
): KartAuthoritativeHostTick {
  return {
    tickIndex: requireWholeNumber(hostTick.tickIndex, "hostTick.tickIndex"),
    elapsedSeconds: requireFiniteNonNegativeNumber(
      hostTick.elapsedSeconds,
      "hostTick.elapsedSeconds"
    )
  };
}

function createRemoteKartAuthoritativePlayerSnapshotMetadata(
  snapshot: KartAuthoritativePlayerSnapshot,
  receivedAt: number
): RemoteKartAuthoritativePlayerSnapshotMetadata {
  return {
    sequence: snapshot.sequence,
    peerId: snapshot.peerId,
    racerId: snapshot.racerId,
    hostTick: createKartAuthoritativeHostTick(snapshot.hostTick),
    acknowledgedPeerInputSequence: requireNullableWholeNumber(
      snapshot.acknowledgedPeerInputSequence,
      "acknowledgedPeerInputSequence"
    ),
    capturedAt: requireFiniteNonNegativeNumber(snapshot.capturedAt, "capturedAt"),
    receivedAt: requireFiniteNonNegativeNumber(receivedAt, "receivedAt")
  };
}

function compareReceivedAuthoritativePlayerSnapshots(
  left: ReceivedKartAuthoritativePlayerSnapshot,
  right: ReceivedKartAuthoritativePlayerSnapshot
): number {
  return (
    left.metadata.hostTick.elapsedSeconds -
      right.metadata.hostTick.elapsedSeconds ||
    left.metadata.hostTick.tickIndex - right.metadata.hostTick.tickIndex ||
    left.snapshot.sequence - right.snapshot.sequence
  );
}

function createAuthoritativeRaceProgressSnapshot(
  progress: RaceProgressSnapshot
): RaceProgressSnapshot {
  const lap = requireWholeNumber(progress.lap, "progress.lap");
  const lapCount = requirePositiveWholeNumber(
    progress.lapCount,
    "progress.lapCount"
  );
  const checkpointIndex = requireWholeNumber(
    progress.checkpointIndex,
    "progress.checkpointIndex"
  );
  const checkpointCount = requireWholeNumber(
    progress.checkpointCount,
    "progress.checkpointCount"
  );
  const finished = requireBoolean(progress.finished, "progress.finished");
  const finishPlace = requireNullableWholeNumber(
    progress.finishPlace,
    "progress.finishPlace"
  );
  const finishTimeSeconds = requireNullableFiniteNonNegativeNumber(
    progress.finishTimeSeconds,
    "progress.finishTimeSeconds"
  );

  if (lap > lapCount) {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player progress lap cannot exceed lap count."
    );
  }

  if (checkpointCount > 0 && checkpointIndex >= checkpointCount) {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player progress checkpoint index must be less than checkpoint count."
    );
  }

  if (finished && finishPlace === null) {
    throw new KartAuthoritativePlayerSnapshotError(
      "Authoritative player progress finished racers require a finish place."
    );
  }

  return {
    racerId: requireNonEmptyText(progress.racerId, "progress.racerId"),
    slotIndex: requireWholeNumber(progress.slotIndex, "progress.slotIndex"),
    displayName: requireNonEmptyText(
      progress.displayName,
      "progress.displayName"
    ),
    controller: requirePlayerController(progress.controller, "progress.controller"),
    rank: requirePositiveWholeNumber(progress.rank, "progress.rank"),
    lap,
    lapCount,
    checkpointIndex,
    checkpointCount,
    trackProgress: requireFiniteNonNegativeNumber(
      progress.trackProgress,
      "progress.trackProgress"
    ),
    trackLength: requireFiniteNonNegativeNumber(
      progress.trackLength,
      "progress.trackLength"
    ),
    completedDistance: requireFiniteNonNegativeNumber(
      progress.completedDistance,
      "progress.completedDistance"
    ),
    totalDistance: requireFiniteNonNegativeNumber(
      progress.totalDistance,
      "progress.totalDistance"
    ),
    currentLapProgressRatio: requireRatio(
      progress.currentLapProgressRatio,
      "progress.currentLapProgressRatio"
    ),
    completionRatio: requireRatio(
      progress.completionRatio,
      "progress.completionRatio"
    ),
    finished,
    finishPlace,
    finishTimeSeconds
  };
}

function requireHostTickField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartAuthoritativeHostTick {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartAuthoritativePlayerSnapshotError(
      `Authoritative player snapshot field must be an object: ${key}.`
    );
  }

  return {
    tickIndex: requireNumberField(value, "tickIndex"),
    elapsedSeconds: requireNumberField(value, "elapsedSeconds")
  };
}

function requirePlayerStateField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartAuthoritativePlayerState {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartAuthoritativePlayerSnapshotError(
      `Authoritative player snapshot field must be an object: ${key}.`
    );
  }

  return {
    peerId: requireStringField(value, "peerId"),
    racerId: requireStringField(value, "racerId"),
    slotIndex: requireNumberField(value, "slotIndex"),
    displayName: requireStringField(value, "displayName"),
    controller: requireStringField(value, "controller") as "human",
    progress: requireRaceProgressField(value, "progress"),
    transform: requireKartRacerTransformField(value, "transform")
  };
}

function requireRaceProgressField(
  record: Readonly<Record<string, unknown>>,
  key: string
): RaceProgressSnapshot {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartAuthoritativePlayerSnapshotError(
      `Authoritative player state field must be an object: ${key}.`
    );
  }

  return {
    racerId: requireStringField(value, "racerId"),
    slotIndex: requireNumberField(value, "slotIndex"),
    displayName: requireStringField(value, "displayName"),
    controller: requireStringField(value, "controller") as RaceProgressSnapshot["controller"],
    rank: requireNumberField(value, "rank"),
    lap: requireNumberField(value, "lap"),
    lapCount: requireNumberField(value, "lapCount"),
    checkpointIndex: requireNumberField(value, "checkpointIndex"),
    checkpointCount: requireNumberField(value, "checkpointCount"),
    trackProgress: requireNumberField(value, "trackProgress"),
    trackLength: requireNumberField(value, "trackLength"),
    completedDistance: requireNumberField(value, "completedDistance"),
    totalDistance: requireNumberField(value, "totalDistance"),
    currentLapProgressRatio: requireNumberField(value, "currentLapProgressRatio"),
    completionRatio: requireNumberField(value, "completionRatio"),
    finished: requireBooleanField(value, "finished"),
    finishPlace: requireNullableNumberField(value, "finishPlace"),
    finishTimeSeconds: requireNullableNumberField(value, "finishTimeSeconds")
  };
}

function requireKartRacerTransformField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartRacerTransform {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartAuthoritativePlayerSnapshotError(
      `Authoritative player state field must be an object: ${key}.`
    );
  }

  return value as unknown as KartRacerTransform;
}

function createReconciliationState(
  correction: PendingAuthoritativePlayerCorrection
): RemoteKartAuthoritativePlayerReconciliationState {
  return {
    sequence: correction.sequence,
    racerId: correction.racerId,
    slotIndex: correction.slotIndex,
    remainingSeconds: correction.remainingSeconds,
    positionErrorMagnitude: getPlanarVectorMagnitude(correction.positionError),
    headingErrorRadians: correction.headingErrorRadians
  };
}

function createInactiveReconciliationResult(
  transform: KartRacerTransform
): RemoteKartAuthoritativePlayerReconciliationResult {
  return {
    transform,
    active: false,
    completed: false,
    remainingSeconds: 0,
    positionErrorMagnitude: 0,
    headingErrorRadians: 0
  };
}

function subtractVector(
  left: KartRacerTransform["position"],
  right: KartRacerTransform["position"]
): KartRacerTransform["position"] {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z
  };
}

function addVector(
  left: KartRacerTransform["position"],
  right: KartRacerTransform["position"]
): KartRacerTransform["position"] {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z
  };
}

function scaleVector(
  vector: KartRacerTransform["position"],
  scale: number
): KartRacerTransform["position"] {
  return {
    x: vector.x * scale,
    y: vector.y * scale,
    z: vector.z * scale
  };
}

function getPlanarVectorMagnitude(vector: KartRacerTransform["position"]): number {
  return Math.hypot(vector.x, vector.z);
}

function shortestAngleDelta(previous: number, next: number): number {
  return normalizeAngle(next - previous);
}

function normalizeAngle(angle: number): number {
  let normalized = angle;

  while (normalized > Math.PI) {
    normalized -= Math.PI * 2;
  }

  while (normalized < -Math.PI) {
    normalized += Math.PI * 2;
  }

  return normalized;
}

function forwardFromHeading(headingRadians: number): KartRacerTransform["forward"] {
  return {
    x: Math.sin(headingRadians),
    y: 0,
    z: Math.cos(headingRadians)
  };
}

function requireStringField(
  record: Readonly<Record<string, unknown>>,
  key: string
): string {
  const value = record[key];

  if (typeof value !== "string") {
    throw new KartAuthoritativePlayerSnapshotError(
      `Authoritative player snapshot field must be a string: ${key}.`
    );
  }

  return value;
}

function requireNumberField(
  record: Readonly<Record<string, unknown>>,
  key: string
): number {
  const value = record[key];

  if (typeof value !== "number") {
    throw new KartAuthoritativePlayerSnapshotError(
      `Authoritative player snapshot field must be a number: ${key}.`
    );
  }

  return value;
}

function requireBooleanField(
  record: Readonly<Record<string, unknown>>,
  key: string
): boolean {
  return requireBoolean(record[key], key);
}

function requireNullableNumberField(
  record: Readonly<Record<string, unknown>>,
  key: string
): number | null {
  const value = record[key];

  if (value === null) {
    return null;
  }

  if (typeof value !== "number") {
    throw new KartAuthoritativePlayerSnapshotError(
      `Authoritative player snapshot field must be a number or null: ${key}.`
    );
  }

  return value;
}

function requireNonEmptyText(value: string, key: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new KartAuthoritativePlayerSnapshotError(
      `Authoritative player snapshot field must be non-empty: ${key}.`
    );
  }

  return normalized;
}

function requirePlayerController(value: string, key: string): "human" {
  if (value !== "human") {
    throw new KartAuthoritativePlayerSnapshotError(
      `Authoritative player snapshot field must be human controlled: ${key}.`
    );
  }

  return value;
}

function requireWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new KartAuthoritativePlayerSnapshotError(
      `Authoritative player snapshot field must be a non-negative whole number: ${key}.`
    );
  }

  return value;
}

function requirePositiveWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new KartAuthoritativePlayerSnapshotError(
      `Authoritative player snapshot field must be a positive whole number: ${key}.`
    );
  }

  return value;
}

function requireNullableWholeNumber(value: number | null, key: string): number | null {
  return value === null ? null : requireWholeNumber(value, key);
}

function requireFiniteNonNegativeNumber(value: number, key: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new KartAuthoritativePlayerSnapshotError(
      `Authoritative player snapshot field must be finite and non-negative: ${key}.`
    );
  }

  return value;
}

function requireNullableFiniteNonNegativeNumber(
  value: number | null,
  key: string
): number | null {
  return value === null ? null : requireFiniteNonNegativeNumber(value, key);
}

function requireBoolean(value: unknown, key: string): boolean {
  if (typeof value !== "boolean") {
    throw new KartAuthoritativePlayerSnapshotError(
      `Authoritative player snapshot field must be a boolean: ${key}.`
    );
  }

  return value;
}

function requireRatio(value: number, key: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new KartAuthoritativePlayerSnapshotError(
      `Authoritative player snapshot field must be a ratio from 0 to 1: ${key}.`
    );
  }

  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
