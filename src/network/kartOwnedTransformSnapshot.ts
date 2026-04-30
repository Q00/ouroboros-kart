import type { RaceSessionRacerState } from "../race/raceSession";
import {
  createKartRacerTransform,
  createKartRacerTransformFromRaceState,
  type KartRacerTransform,
  type SmoothedKartTransform
} from "./kartTransformSnapshot";
import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  KART_GAMEPLAY_PROTOCOL,
  KART_GAMEPLAY_VERSION
} from "./kartInputSnapshot";

export const MAX_OWNED_TRANSFORM_SNAPSHOT_BUFFERED_BYTES = 4 * 1024;
export const MAX_OWNED_TRANSFORM_SNAPSHOT_PAYLOAD_BYTES = 3 * 1024;
export const MAX_REMOTE_OWNED_TRANSFORM_SNAPSHOT_BUFFER_SIZE = 12;
export const REMOTE_OWNED_TRANSFORM_INTERPOLATION_DELAY_SECONDS = 0.08;
export const REMOTE_OWNED_TRANSFORM_MAX_PREDICTION_SECONDS = 0.12;
export const REMOTE_OWNED_TRANSFORM_STALE_FALLBACK_SECONDS = 0.35;

export interface KartOwnedTransformSnapshot {
  readonly protocol: typeof KART_GAMEPLAY_PROTOCOL;
  readonly version: typeof KART_GAMEPLAY_VERSION;
  readonly type: typeof KART_GAMEPLAY_MESSAGE_TYPES.OWNED_TRANSFORM_SNAPSHOT;
  readonly peerId: string;
  readonly racerId: string;
  readonly sequence: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly capturedAt: number;
  readonly transform: KartRacerTransform;
}

export interface KartOwnedTransformSnapshotCreateOptions {
  readonly peerId: string;
  readonly racerId: string;
  readonly sequence: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly capturedAt: number;
  readonly transform: KartRacerTransform;
}

export interface LocalKartOwnedTransformSnapshotEmitterOptions {
  readonly peerId: string;
  readonly racerId: string;
  readonly send: (payload: string, snapshot: KartOwnedTransformSnapshot) => boolean;
  readonly now?: () => number;
}

export interface LocalKartOwnedTransformSnapshotTick {
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
}

export interface RemoteKartOwnedTransformSmootherOptions {
  readonly expectedPeerId?: string;
  readonly expectedRacerId?: string;
  readonly interpolationDelaySeconds?: number;
  readonly maxPredictionSeconds?: number;
  readonly staleFallbackSeconds?: number;
  readonly maxBufferedSnapshots?: number;
  readonly now?: () => number;
}

export type RemoteKartOwnedTransformSnapshotRejectionReason =
  | "invalid-snapshot"
  | "unexpected-peer"
  | "unexpected-racer"
  | "duplicate-sequence"
  | "stale-sequence";

export type RemoteKartOwnedTransformSnapshotAcceptResult =
  | {
      readonly accepted: true;
      readonly snapshot: KartOwnedTransformSnapshot;
      readonly bufferedCount: number;
      readonly droppedSnapshots: readonly KartOwnedTransformSnapshot[];
    }
  | {
      readonly accepted: false;
      readonly reason: RemoteKartOwnedTransformSnapshotRejectionReason;
      readonly message: string;
      readonly bufferedCount: number;
      readonly rejectedCount: number;
    };

interface ReceivedKartOwnedTransformSnapshot {
  readonly snapshot: KartOwnedTransformSnapshot;
  readonly receivedAt: number;
}

export class KartOwnedTransformSnapshotError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "KartOwnedTransformSnapshotError";
  }
}

export class LocalKartOwnedTransformSnapshotEmitter {
  private readonly peerId: string;
  private readonly racerId: string;
  private readonly send: (
    payload: string,
    snapshot: KartOwnedTransformSnapshot
  ) => boolean;
  private readonly now: () => number;
  private nextSequence = 0;

  public constructor(options: LocalKartOwnedTransformSnapshotEmitterOptions) {
    this.peerId = requireNonEmptyText(options.peerId, "peerId");
    this.racerId = requireNonEmptyText(options.racerId, "racerId");
    this.send = options.send;
    this.now = options.now ?? Date.now;
  }

  public emit(
    tick: LocalKartOwnedTransformSnapshotTick,
    racer: RaceSessionRacerState
  ): KartOwnedTransformSnapshot | null {
    const snapshot = createKartOwnedTransformSnapshot({
      peerId: this.peerId,
      racerId: this.racerId,
      sequence: this.nextSequence,
      tickIndex: tick.tickIndex,
      elapsedSeconds: tick.elapsedSeconds,
      capturedAt: this.now(),
      transform: createKartRacerTransformFromRaceState(racer)
    });
    const payload = serializeKartOwnedTransformSnapshot(snapshot);

    this.nextSequence += 1;

    if (!this.send(payload, snapshot)) {
      return null;
    }

    return snapshot;
  }
}

export class RemoteKartOwnedTransformSmoother {
  private readonly expectedPeerId: string | undefined;
  private readonly expectedRacerId: string | undefined;
  private readonly interpolationDelaySeconds: number;
  private readonly maxPredictionSeconds: number;
  private readonly staleFallbackSeconds: number;
  private readonly maxBufferedSnapshots: number;
  private readonly now: () => number;
  private readonly snapshots: ReceivedKartOwnedTransformSnapshot[] = [];
  private lastDroppedSequence = -1;
  private rejectedSnapshots = 0;
  private droppedSnapshots = 0;

  public constructor(options: RemoteKartOwnedTransformSmootherOptions = {}) {
    this.expectedPeerId =
      options.expectedPeerId === undefined
        ? undefined
        : requireNonEmptyText(options.expectedPeerId, "expectedPeerId");
    this.expectedRacerId =
      options.expectedRacerId === undefined
        ? undefined
        : requireNonEmptyText(options.expectedRacerId, "expectedRacerId");
    this.interpolationDelaySeconds = requireFiniteNonNegativeNumber(
      options.interpolationDelaySeconds ??
        REMOTE_OWNED_TRANSFORM_INTERPOLATION_DELAY_SECONDS,
      "interpolationDelaySeconds"
    );
    this.maxPredictionSeconds = requireFiniteNonNegativeNumber(
      options.maxPredictionSeconds ??
        REMOTE_OWNED_TRANSFORM_MAX_PREDICTION_SECONDS,
      "maxPredictionSeconds"
    );
    this.staleFallbackSeconds = Math.max(
      this.maxPredictionSeconds,
      requireFiniteNonNegativeNumber(
        options.staleFallbackSeconds ??
          REMOTE_OWNED_TRANSFORM_STALE_FALLBACK_SECONDS,
        "staleFallbackSeconds"
      )
    );
    this.maxBufferedSnapshots = requirePositiveWholeNumber(
      options.maxBufferedSnapshots ??
        MAX_REMOTE_OWNED_TRANSFORM_SNAPSHOT_BUFFER_SIZE,
      "maxBufferedSnapshots"
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

  public accept(
    snapshot: KartOwnedTransformSnapshot,
    receivedAt: number = this.now()
  ): RemoteKartOwnedTransformSnapshotAcceptResult {
    let normalizedSnapshot: KartOwnedTransformSnapshot;

    try {
      normalizedSnapshot = createKartOwnedTransformSnapshot(snapshot);
    } catch (error) {
      return this.reject(
        "invalid-snapshot",
        getErrorMessage(error, "Remote owned transform snapshot is invalid.")
      );
    }

    if (
      this.expectedPeerId !== undefined &&
      normalizedSnapshot.peerId !== this.expectedPeerId
    ) {
      return this.reject(
        "unexpected-peer",
        `Remote owned transform snapshot peer mismatch: ${normalizedSnapshot.peerId}.`
      );
    }

    if (
      this.expectedRacerId !== undefined &&
      normalizedSnapshot.racerId !== this.expectedRacerId
    ) {
      return this.reject(
        "unexpected-racer",
        `Remote owned transform snapshot racer mismatch: ${normalizedSnapshot.racerId}.`
      );
    }

    if (normalizedSnapshot.sequence <= this.lastDroppedSequence) {
      return this.reject(
        "stale-sequence",
        `Remote owned transform snapshot sequence ${normalizedSnapshot.sequence} has already been dropped.`
      );
    }

    if (
      this.snapshots.some(
        (bufferedSnapshot) =>
          bufferedSnapshot.snapshot.sequence === normalizedSnapshot.sequence
      )
    ) {
      return this.reject(
        "duplicate-sequence",
        `Remote owned transform snapshot sequence ${normalizedSnapshot.sequence} is already buffered.`
      );
    }

    this.snapshots.push({
      snapshot: normalizedSnapshot,
      receivedAt: requireFiniteNonNegativeNumber(receivedAt, "receivedAt")
    });
    this.snapshots.sort(compareReceivedSnapshotsByElapsedSeconds);

    const droppedSnapshots = this.trimBufferedSnapshots();

    return {
      accepted: true,
      snapshot: normalizedSnapshot,
      bufferedCount: this.snapshots.length,
      droppedSnapshots
    };
  }

  public sample(now: number = this.now()): SmoothedKartTransform | null {
    if (this.snapshots.length === 0) {
      return null;
    }

    const latestSnapshot = this.snapshots[this.snapshots.length - 1];

    if (latestSnapshot === undefined) {
      return null;
    }

    const sampleNow = requireFiniteNonNegativeNumber(now, "now");
    const targetElapsedSeconds = this.createPresentationTargetElapsedSeconds(
      sampleNow,
      latestSnapshot
    );
    const bracket = this.findSnapshotBracket(targetElapsedSeconds);

    if (bracket.previous !== null && bracket.next !== null) {
      return interpolateOwnedTransform(
        bracket.previous.snapshot,
        bracket.next.snapshot,
        createInterpolationRatio(
          targetElapsedSeconds,
          bracket.previous.snapshot.elapsedSeconds,
          bracket.next.snapshot.elapsedSeconds
        )
      );
    }

    if (bracket.next !== null) {
      return createSmoothedOwnedTransform(
        bracket.next.snapshot.transform,
        false,
        false
      );
    }

    if (bracket.previous !== null) {
      const predictionSeconds = Math.max(
        0,
        targetElapsedSeconds - bracket.previous.snapshot.elapsedSeconds
      );
      const predictedTransform = predictOwnedTransform(
        bracket.previous.snapshot,
        this.findPreviousSnapshot(bracket.previous.snapshot.sequence)?.snapshot ??
          null,
        Math.min(predictionSeconds, this.maxPredictionSeconds),
        predictionSeconds
      );

      return predictionSeconds > this.staleFallbackSeconds
        ? createStaleFallbackTransform(predictedTransform)
        : predictedTransform;
    }

    const firstSnapshot = this.snapshots[0];

    return firstSnapshot === undefined
      ? null
      : createSmoothedOwnedTransform(firstSnapshot.snapshot.transform, false, false);
  }

  public clear(): void {
    this.snapshots.length = 0;
    this.lastDroppedSequence = -1;
    this.rejectedSnapshots = 0;
    this.droppedSnapshots = 0;
  }

  private reject(
    reason: RemoteKartOwnedTransformSnapshotRejectionReason,
    message: string
  ): RemoteKartOwnedTransformSnapshotAcceptResult {
    this.rejectedSnapshots += 1;

    return {
      accepted: false,
      reason,
      message,
      bufferedCount: this.snapshots.length,
      rejectedCount: this.rejectedSnapshots
    };
  }

  private trimBufferedSnapshots(): readonly KartOwnedTransformSnapshot[] {
    const droppedSnapshots: KartOwnedTransformSnapshot[] = [];

    while (this.snapshots.length > this.maxBufferedSnapshots) {
      const droppedSnapshot = this.snapshots.shift();

      if (droppedSnapshot !== undefined) {
        droppedSnapshots.push(droppedSnapshot.snapshot);
      }
    }

    this.droppedSnapshots += droppedSnapshots.length;

    if (droppedSnapshots.length > 0) {
      this.lastDroppedSequence = Math.max(
        this.lastDroppedSequence,
        ...droppedSnapshots.map((snapshot) => snapshot.sequence)
      );
    }

    return droppedSnapshots;
  }

  private createPresentationTargetElapsedSeconds(
    now: number,
    latestSnapshot: ReceivedKartOwnedTransformSnapshot
  ): number {
    return Math.max(
      0,
      latestSnapshot.snapshot.elapsedSeconds +
        (now - latestSnapshot.receivedAt) / 1000 -
        this.interpolationDelaySeconds
    );
  }

  private findSnapshotBracket(targetElapsedSeconds: number): {
    readonly previous: ReceivedKartOwnedTransformSnapshot | null;
    readonly next: ReceivedKartOwnedTransformSnapshot | null;
  } {
    let previous: ReceivedKartOwnedTransformSnapshot | null = null;

    for (const snapshot of this.snapshots) {
      if (snapshot.snapshot.elapsedSeconds >= targetElapsedSeconds) {
        return {
          previous,
          next: snapshot
        };
      }

      previous = snapshot;
    }

    return {
      previous,
      next: null
    };
  }

  private findPreviousSnapshot(
    sequence: number
  ): ReceivedKartOwnedTransformSnapshot | null {
    let previous: ReceivedKartOwnedTransformSnapshot | null = null;

    for (const snapshot of this.snapshots) {
      if (snapshot.snapshot.sequence >= sequence) {
        return previous;
      }

      previous = snapshot;
    }

    return previous;
  }
}

export function createKartOwnedTransformSnapshot(
  options: KartOwnedTransformSnapshotCreateOptions
): KartOwnedTransformSnapshot {
  const racerId = requireNonEmptyText(options.racerId, "racerId");
  const transform = createKartRacerTransform(options.transform);

  if (transform.racerId !== racerId) {
    throw new KartOwnedTransformSnapshotError(
      `Owned transform racer mismatch: ${transform.racerId}.`
    );
  }

  return {
    protocol: KART_GAMEPLAY_PROTOCOL,
    version: KART_GAMEPLAY_VERSION,
    type: KART_GAMEPLAY_MESSAGE_TYPES.OWNED_TRANSFORM_SNAPSHOT,
    peerId: requireNonEmptyText(options.peerId, "peerId"),
    racerId,
    sequence: requireWholeNumber(options.sequence, "sequence"),
    tickIndex: requireWholeNumber(options.tickIndex, "tickIndex"),
    elapsedSeconds: requireFiniteNonNegativeNumber(
      options.elapsedSeconds,
      "elapsedSeconds"
    ),
    capturedAt: requireFiniteNonNegativeNumber(options.capturedAt, "capturedAt"),
    transform
  };
}

export function serializeKartOwnedTransformSnapshot(
  snapshot: KartOwnedTransformSnapshot
): string {
  return JSON.stringify(createKartOwnedTransformSnapshot(snapshot));
}

export function deserializeKartOwnedTransformSnapshot(
  payload: unknown
): KartOwnedTransformSnapshot {
  if (typeof payload !== "string") {
    throw new KartOwnedTransformSnapshotError(
      "Owned transform snapshot payload must be a string."
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new KartOwnedTransformSnapshotError(
      "Owned transform snapshot payload is not valid JSON."
    );
  }

  if (!isRecord(parsed)) {
    throw new KartOwnedTransformSnapshotError(
      "Owned transform snapshot payload must be an object."
    );
  }

  if (parsed.protocol !== KART_GAMEPLAY_PROTOCOL) {
    throw new KartOwnedTransformSnapshotError(
      "Owned transform snapshot protocol mismatch."
    );
  }

  if (parsed.version !== KART_GAMEPLAY_VERSION) {
    throw new KartOwnedTransformSnapshotError(
      "Owned transform snapshot version mismatch."
    );
  }

  if (parsed.type !== KART_GAMEPLAY_MESSAGE_TYPES.OWNED_TRANSFORM_SNAPSHOT) {
    throw new KartOwnedTransformSnapshotError(
      "Owned transform snapshot type mismatch."
    );
  }

  return createKartOwnedTransformSnapshot({
    peerId: requireStringField(parsed, "peerId"),
    racerId: requireStringField(parsed, "racerId"),
    sequence: requireNumberField(parsed, "sequence"),
    tickIndex: requireNumberField(parsed, "tickIndex"),
    elapsedSeconds: requireNumberField(parsed, "elapsedSeconds"),
    capturedAt: requireNumberField(parsed, "capturedAt"),
    transform: requireKartRacerTransformField(parsed, "transform")
  });
}

export function isKartOwnedTransformSnapshotPayload(
  payload: unknown
): payload is string {
  if (typeof payload !== "string") {
    return false;
  }

  try {
    deserializeKartOwnedTransformSnapshot(payload);
    return true;
  } catch {
    return false;
  }
}

function requireKartRacerTransformField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartRacerTransform {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartOwnedTransformSnapshotError(
      `Owned transform snapshot field must be an object: ${key}.`
    );
  }

  return {
    racerId: requireStringField(value, "racerId"),
    slotIndex: requireNumberField(value, "slotIndex"),
    position: requireVector3Field(value, "position"),
    velocity: requireVector3Field(value, "velocity"),
    forward: requireVector3Field(value, "forward"),
    headingRadians: requireNumberField(value, "headingRadians"),
    speed: requireNumberField(value, "speed"),
    heldItem: requireNullableHeldItemField(value, "heldItem"),
    boostSeconds: requireNumberField(value, "boostSeconds"),
    shieldSeconds: requireNumberField(value, "shieldSeconds"),
    stunSeconds: requireNumberField(value, "stunSeconds"),
    spinoutSeconds: requireNumberField(value, "spinoutSeconds"),
    spinoutAngularVelocity: requireNumberField(value, "spinoutAngularVelocity"),
    itemHitImmunitySeconds: requireNumberField(value, "itemHitImmunitySeconds"),
    hitFeedbackSeconds: requireNumberField(value, "hitFeedbackSeconds"),
    lastHitItemType: requireNullableHitItemField(value, "lastHitItemType"),
    itemUseCooldownSeconds: requireNumberField(value, "itemUseCooldownSeconds"),
    updateCount: requireNumberField(value, "updateCount")
  } satisfies KartRacerTransform;
}

function requireVector3Field(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartRacerTransform["position"] {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartOwnedTransformSnapshotError(
      `Owned transform snapshot vector field must be an object: ${key}.`
    );
  }

  return {
    x: requireNumberField(value, "x"),
    y: requireNumberField(value, "y"),
    z: requireNumberField(value, "z")
  };
}

function requireStringField(
  record: Readonly<Record<string, unknown>>,
  key: string
): string {
  const value = record[key];

  if (typeof value !== "string") {
    throw new KartOwnedTransformSnapshotError(
      `Owned transform snapshot field must be a string: ${key}.`
    );
  }

  return value;
}

function requireNullableHeldItemField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartRacerTransform["heldItem"] {
  const value = record[key];

  if (value === null) {
    return null;
  }

  if (value !== "boost" && value !== "shell" && value !== "banana") {
    throw new KartOwnedTransformSnapshotError(
      `Owned transform snapshot field must be an item type or null: ${key}.`
    );
  }

  return value;
}

function requireNullableHitItemField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartRacerTransform["lastHitItemType"] {
  const value = record[key];

  if (value === null) {
    return null;
  }

  if (value !== "shell" && value !== "banana") {
    throw new KartOwnedTransformSnapshotError(
      `Owned transform snapshot field must be a hit item type or null: ${key}.`
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
    throw new KartOwnedTransformSnapshotError(
      `Owned transform snapshot field must be a number: ${key}.`
    );
  }

  return value;
}

function requireNonEmptyText(value: string, key: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new KartOwnedTransformSnapshotError(
      `Owned transform snapshot field must be non-empty: ${key}.`
    );
  }

  return normalized;
}

function requireWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new KartOwnedTransformSnapshotError(
      `Owned transform snapshot field must be a non-negative integer: ${key}.`
    );
  }

  return value;
}

function requirePositiveWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new KartOwnedTransformSnapshotError(
      `Owned transform snapshot field must be a positive integer: ${key}.`
    );
  }

  return value;
}

function requireFiniteNonNegativeNumber(value: number, key: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new KartOwnedTransformSnapshotError(
      `Owned transform snapshot field must be finite and non-negative: ${key}.`
    );
  }

  return value;
}

function compareReceivedSnapshotsByElapsedSeconds(
  left: ReceivedKartOwnedTransformSnapshot,
  right: ReceivedKartOwnedTransformSnapshot
): number {
  if (left.snapshot.elapsedSeconds !== right.snapshot.elapsedSeconds) {
    return left.snapshot.elapsedSeconds - right.snapshot.elapsedSeconds;
  }

  return left.snapshot.sequence - right.snapshot.sequence;
}

function interpolateOwnedTransform(
  previous: KartOwnedTransformSnapshot,
  next: KartOwnedTransformSnapshot,
  ratio: number
): SmoothedKartTransform {
  const previousTransform = previous.transform;
  const nextTransform = next.transform;
  const headingRadians = interpolateHeading(
    previousTransform.headingRadians,
    nextTransform.headingRadians,
    ratio
  );

  return {
    racerId: previousTransform.racerId,
    slotIndex: previousTransform.slotIndex,
    position: interpolateVector(
      previousTransform.position,
      nextTransform.position,
      ratio
    ),
    velocity: interpolateVector(
      previousTransform.velocity,
      nextTransform.velocity,
      ratio
    ),
    forward: forwardFromHeading(headingRadians),
    headingRadians,
    speed: interpolateNumber(previousTransform.speed, nextTransform.speed, ratio),
    heldItem: nextTransform.heldItem,
    boostSeconds: interpolateTimerSeconds(
      previousTransform.boostSeconds,
      nextTransform.boostSeconds,
      ratio
    ),
    shieldSeconds: interpolateTimerSeconds(
      previousTransform.shieldSeconds,
      nextTransform.shieldSeconds,
      ratio
    ),
    stunSeconds: interpolateTimerSeconds(
      previousTransform.stunSeconds,
      nextTransform.stunSeconds,
      ratio
    ),
    spinoutSeconds: interpolateTimerSeconds(
      previousTransform.spinoutSeconds,
      nextTransform.spinoutSeconds,
      ratio
    ),
    spinoutAngularVelocity: interpolateNumber(
      previousTransform.spinoutAngularVelocity,
      nextTransform.spinoutAngularVelocity,
      ratio
    ),
    itemHitImmunitySeconds: interpolateTimerSeconds(
      previousTransform.itemHitImmunitySeconds,
      nextTransform.itemHitImmunitySeconds,
      ratio
    ),
    hitFeedbackSeconds: interpolateTimerSeconds(
      previousTransform.hitFeedbackSeconds,
      nextTransform.hitFeedbackSeconds,
      ratio
    ),
    lastHitItemType:
      nextTransform.lastHitItemType ?? previousTransform.lastHitItemType,
    itemUseCooldownSeconds: interpolateTimerSeconds(
      previousTransform.itemUseCooldownSeconds,
      nextTransform.itemUseCooldownSeconds,
      ratio
    ),
    updateCount:
      ratio < 0.5 ? previousTransform.updateCount : nextTransform.updateCount,
    interpolated: ratio > 0 && ratio < 1,
    extrapolated: false,
    stale: false
  };
}

function predictOwnedTransform(
  latest: KartOwnedTransformSnapshot,
  previous: KartOwnedTransformSnapshot | null,
  cappedPredictionSeconds: number,
  presentationSeconds: number
): SmoothedKartTransform {
  const latestTransform = latest.transform;
  const previousTransform = previous?.transform;
  const angularVelocity =
    previousTransform === undefined
      ? 0
      : calculateAngularVelocity(
          previousTransform.headingRadians,
          latestTransform.headingRadians,
          Math.max(
            latest.elapsedSeconds - (previous?.elapsedSeconds ?? latest.elapsedSeconds),
            Number.EPSILON
          )
        );
  const headingRadians = normalizeAngle(
    latestTransform.headingRadians + angularVelocity * cappedPredictionSeconds
  );

  return {
    ...createSmoothedOwnedTransform(
      latestTransform,
      false,
      cappedPredictionSeconds > 0,
      presentationSeconds
    ),
    position: addVector(
      latestTransform.position,
      scaleVector(latestTransform.velocity, cappedPredictionSeconds)
    ),
    forward: forwardFromHeading(headingRadians),
    headingRadians
  };
}

function createSmoothedOwnedTransform(
  transform: KartRacerTransform,
  interpolated: boolean,
  extrapolated: boolean,
  presentationSeconds = 0
): SmoothedKartTransform {
  return {
    racerId: transform.racerId,
    slotIndex: transform.slotIndex,
    position: transform.position,
    velocity: transform.velocity,
    forward: transform.forward,
    headingRadians: transform.headingRadians,
    speed: transform.speed,
    heldItem: transform.heldItem,
    boostSeconds: decayTimerSeconds(transform.boostSeconds, presentationSeconds),
    shieldSeconds: decayTimerSeconds(
      transform.shieldSeconds,
      presentationSeconds
    ),
    stunSeconds: decayTimerSeconds(transform.stunSeconds, presentationSeconds),
    spinoutSeconds: decayTimerSeconds(
      transform.spinoutSeconds,
      presentationSeconds
    ),
    spinoutAngularVelocity:
      transform.spinoutSeconds > presentationSeconds
        ? transform.spinoutAngularVelocity
        : 0,
    itemHitImmunitySeconds: decayTimerSeconds(
      transform.itemHitImmunitySeconds,
      presentationSeconds
    ),
    hitFeedbackSeconds: decayTimerSeconds(
      transform.hitFeedbackSeconds,
      presentationSeconds
    ),
    lastHitItemType:
      transform.hitFeedbackSeconds > presentationSeconds ||
      transform.itemHitImmunitySeconds > presentationSeconds ||
      transform.spinoutSeconds > presentationSeconds ||
      transform.stunSeconds > presentationSeconds
        ? transform.lastHitItemType
        : null,
    itemUseCooldownSeconds: decayTimerSeconds(
      transform.itemUseCooldownSeconds,
      presentationSeconds
    ),
    updateCount: transform.updateCount,
    interpolated,
    extrapolated,
    stale: false
  };
}

function createStaleFallbackTransform(
  transform: SmoothedKartTransform
): SmoothedKartTransform {
  return {
    ...transform,
    velocity: { x: 0, y: 0, z: 0 },
    speed: 0,
    interpolated: false,
    extrapolated: false,
    stale: true
  };
}

function createInterpolationRatio(
  target: number,
  previous: number,
  next: number
): number {
  const duration = next - previous;

  if (duration <= Number.EPSILON) {
    return 0;
  }

  return Math.min(Math.max((target - previous) / duration, 0), 1);
}

function interpolateVector(
  previous: KartRacerTransform["position"],
  next: KartRacerTransform["position"],
  ratio: number
): KartRacerTransform["position"] {
  return {
    x: interpolateNumber(previous.x, next.x, ratio),
    y: interpolateNumber(previous.y, next.y, ratio),
    z: interpolateNumber(previous.z, next.z, ratio)
  };
}

function interpolateNumber(previous: number, next: number, ratio: number): number {
  return previous + (next - previous) * ratio;
}

function interpolateTimerSeconds(
  previous: number,
  next: number,
  ratio: number
): number {
  if (previous <= 0 && next > 0) {
    return next;
  }

  return Math.max(0, interpolateNumber(previous, next, ratio));
}

function decayTimerSeconds(seconds: number, elapsedSeconds: number): number {
  return Math.max(0, seconds - Math.max(0, elapsedSeconds));
}

function interpolateHeading(
  previous: number,
  next: number,
  ratio: number
): number {
  return normalizeAngle(previous + shortestAngleDelta(previous, next) * ratio);
}

function calculateAngularVelocity(
  previousHeading: number,
  nextHeading: number,
  deltaSeconds: number
): number {
  return shortestAngleDelta(previousHeading, nextHeading) / deltaSeconds;
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

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
