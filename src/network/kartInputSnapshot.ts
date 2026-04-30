import type { RacerInputState } from "../race/raceState";

export const KART_GAMEPLAY_PROTOCOL = "kart-gameplay";
export const KART_GAMEPLAY_VERSION = 1;
export const MAX_INPUT_SNAPSHOT_BUFFERED_BYTES = 8 * 1024;
export const MAX_INPUT_SNAPSHOT_PAYLOAD_BYTES = 2 * 1024;
export const MAX_REMOTE_INPUT_SNAPSHOT_BUFFER_SIZE = 9;
export const INPUT_USE_ITEM_REPLAY_SNAPSHOT_COUNT = 4;

export const KART_GAMEPLAY_MESSAGE_TYPES = {
  INPUT_SNAPSHOT: "input-snapshot",
  REMOTE_INPUT_DELTA: "remote-input-delta",
  TRANSFORM_SNAPSHOT: "transform-snapshot",
  OWNED_TRANSFORM_SNAPSHOT: "owned-transform-snapshot",
  AUTHORITATIVE_PLAYER_SNAPSHOT: "authoritative-player-snapshot",
  ITEM_USE_EVENT: "item-use-event",
  ITEM_COLLISION_OUTCOME_EVENT: "item-collision-outcome-event",
  EFFECT_EVENT: "effect-event",
  RACE_STATE_SNAPSHOT: "race-state-snapshot",
  BANANA_SPAWN_EVENT: "banana-spawn-event",
  BANANA_COLLISION_EVENT: "banana-collision-event",
  BANANA_REMOVAL_EVENT: "banana-removal-event"
} as const;

export type KartGameplayMessageType =
  (typeof KART_GAMEPLAY_MESSAGE_TYPES)[keyof typeof KART_GAMEPLAY_MESSAGE_TYPES];

export interface KartInputSnapshot {
  readonly protocol: typeof KART_GAMEPLAY_PROTOCOL;
  readonly version: typeof KART_GAMEPLAY_VERSION;
  readonly type: typeof KART_GAMEPLAY_MESSAGE_TYPES.INPUT_SNAPSHOT;
  readonly peerId: string;
  readonly racerId: string;
  readonly sequence: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly capturedAt: number;
  readonly sentAt: number;
  readonly input: RacerInputState;
}

export interface KartInputSnapshotCreateOptions {
  readonly peerId: string;
  readonly racerId: string;
  readonly sequence: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly capturedAt: number;
  readonly sentAt?: number;
  readonly input: RacerInputState;
}

export interface LocalKartInputSnapshotEmitterOptions {
  readonly peerId: string;
  readonly racerId: string;
  readonly send: (payload: string, snapshot: KartInputSnapshot) => boolean;
  readonly now?: () => number;
}

export interface LocalKartInputSnapshotTick {
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
}

export interface RemoteKartInputSnapshotBufferOptions {
  readonly expectedPeerId?: string;
  readonly expectedRacerId?: string;
  readonly maxBufferedSnapshots?: number;
  readonly maxPayloadBytes?: number;
}

export type RemoteKartInputSnapshotRejectionReason =
  | "non-string-payload"
  | "payload-too-large"
  | "invalid-payload"
  | "unexpected-peer"
  | "unexpected-racer"
  | "duplicate-sequence"
  | "stale-sequence";

export type RemoteKartInputSnapshotAcceptResult =
  | {
      readonly accepted: true;
      readonly snapshot: KartInputSnapshot;
      readonly bufferedCount: number;
      readonly droppedSnapshots: readonly KartInputSnapshot[];
    }
  | {
      readonly accepted: false;
      readonly reason: RemoteKartInputSnapshotRejectionReason;
      readonly message: string;
      readonly bufferedCount: number;
      readonly rejectedCount: number;
    };

export class KartInputSnapshotError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "KartInputSnapshotError";
  }
}

export class LocalKartInputSnapshotEmitter {
  private readonly peerId: string;
  private readonly racerId: string;
  private readonly send: (payload: string, snapshot: KartInputSnapshot) => boolean;
  private readonly now: () => number;
  private readonly nextSequenceByPeerId = new Map<string, number>();
  private pendingUseItemReplaySnapshots = 0;

  public constructor(options: LocalKartInputSnapshotEmitterOptions) {
    this.peerId = requireNonEmptyText(options.peerId, "peerId");
    this.racerId = requireNonEmptyText(options.racerId, "racerId");
    this.send = options.send;
    this.now = options.now ?? Date.now;
  }

  public emit(
    tick: LocalKartInputSnapshotTick,
    input: RacerInputState
  ): KartInputSnapshot | null {
    const networkInput = this.createNetworkInput(input);
    const sequence = this.getNextSequenceForPeer(this.peerId);
    const sentAt = this.now();
    const snapshot = createKartInputSnapshot({
      peerId: this.peerId,
      racerId: this.racerId,
      sequence,
      tickIndex: tick.tickIndex,
      elapsedSeconds: tick.elapsedSeconds,
      capturedAt: sentAt,
      sentAt,
      input: networkInput
    });
    const payload = serializeKartInputSnapshot(snapshot);

    if (!this.send(payload, snapshot)) {
      return null;
    }

    this.commitSentSequenceForPeer(this.peerId, sequence);
    this.consumeNetworkInputReplay(networkInput);

    return snapshot;
  }

  private getNextSequenceForPeer(peerId: string): number {
    return this.nextSequenceByPeerId.get(peerId) ?? 0;
  }

  private commitSentSequenceForPeer(peerId: string, sequence: number): void {
    this.nextSequenceByPeerId.set(peerId, sequence + 1);
  }

  private createNetworkInput(input: RacerInputState): RacerInputState {
    if (input.useItem) {
      this.pendingUseItemReplaySnapshots = Math.max(
        this.pendingUseItemReplaySnapshots,
        INPUT_USE_ITEM_REPLAY_SNAPSHOT_COUNT
      );
    }

    if (this.pendingUseItemReplaySnapshots <= 0) {
      return input;
    }

    return {
      ...input,
      useItem: true
    };
  }

  private consumeNetworkInputReplay(input: RacerInputState): void {
    if (input.useItem && this.pendingUseItemReplaySnapshots > 0) {
      this.pendingUseItemReplaySnapshots -= 1;
    }
  }
}

export class RemoteKartInputSnapshotBuffer {
  private readonly expectedPeerId: string | undefined;
  private readonly expectedRacerId: string | undefined;
  private readonly maxBufferedSnapshots: number;
  private readonly maxPayloadBytes: number;
  private readonly snapshots: KartInputSnapshot[] = [];
  private lastDrainedSequence = -1;
  private rejectedSnapshots = 0;
  private droppedSnapshots = 0;

  public constructor(options: RemoteKartInputSnapshotBufferOptions = {}) {
    this.expectedPeerId =
      options.expectedPeerId === undefined
        ? undefined
        : requireNonEmptyText(options.expectedPeerId, "expectedPeerId");
    this.expectedRacerId =
      options.expectedRacerId === undefined
        ? undefined
        : requireNonEmptyText(options.expectedRacerId, "expectedRacerId");
    this.maxBufferedSnapshots = requirePositiveWholeNumber(
      options.maxBufferedSnapshots ?? MAX_REMOTE_INPUT_SNAPSHOT_BUFFER_SIZE,
      "maxBufferedSnapshots"
    );
    this.maxPayloadBytes = requirePositiveWholeNumber(
      options.maxPayloadBytes ?? MAX_INPUT_SNAPSHOT_PAYLOAD_BYTES,
      "maxPayloadBytes"
    );
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

  public accept(payload: unknown): RemoteKartInputSnapshotAcceptResult {
    if (typeof payload !== "string") {
      return this.reject(
        "non-string-payload",
        "Remote input snapshot payload must be a string."
      );
    }

    if (getUtf8ByteLength(payload) > this.maxPayloadBytes) {
      return this.reject(
        "payload-too-large",
        "Remote input snapshot payload exceeds the packet size limit."
      );
    }

    let snapshot: KartInputSnapshot;

    try {
      snapshot = deserializeKartInputSnapshot(payload);
    } catch (error) {
      return this.reject(
        "invalid-payload",
        getErrorMessage(error, "Remote input snapshot payload is invalid.")
      );
    }

    if (
      this.expectedPeerId !== undefined &&
      snapshot.peerId !== this.expectedPeerId
    ) {
      return this.reject(
        "unexpected-peer",
        `Remote input snapshot peer mismatch: ${snapshot.peerId}.`
      );
    }

    if (
      this.expectedRacerId !== undefined &&
      snapshot.racerId !== this.expectedRacerId
    ) {
      return this.reject(
        "unexpected-racer",
        `Remote input snapshot racer mismatch: ${snapshot.racerId}.`
      );
    }

    if (snapshot.sequence <= this.lastDrainedSequence) {
      return this.reject(
        "stale-sequence",
        `Remote input snapshot sequence ${snapshot.sequence} has already been drained.`
      );
    }

    if (
      this.snapshots.some(
        (bufferedSnapshot) => bufferedSnapshot.sequence === snapshot.sequence
      )
    ) {
      return this.reject(
        "duplicate-sequence",
        `Remote input snapshot sequence ${snapshot.sequence} is already buffered.`
      );
    }

    this.snapshots.push(snapshot);
    this.snapshots.sort(compareSnapshotsBySequence);

    const droppedSnapshots = this.trimBufferedSnapshots();

    return {
      accepted: true,
      snapshot,
      bufferedCount: this.snapshots.length,
      droppedSnapshots
    };
  }

  public drainReady(maxTickIndex = Number.POSITIVE_INFINITY): readonly KartInputSnapshot[] {
    const readySnapshots: KartInputSnapshot[] = [];
    const pendingSnapshots: KartInputSnapshot[] = [];

    for (const snapshot of this.snapshots) {
      if (snapshot.tickIndex <= maxTickIndex) {
        readySnapshots.push(snapshot);
      } else {
        pendingSnapshots.push(snapshot);
      }
    }

    this.snapshots.length = 0;
    this.snapshots.push(...pendingSnapshots);

    if (readySnapshots.length > 0) {
      this.lastDrainedSequence = Math.max(
        this.lastDrainedSequence,
        readySnapshots[readySnapshots.length - 1]?.sequence ?? this.lastDrainedSequence
      );
    }

    return readySnapshots;
  }

  public consumeLatestReady(maxTickIndex = Number.POSITIVE_INFINITY): KartInputSnapshot | null {
    const readySnapshots = this.drainReady(maxTickIndex);

    return readySnapshots[readySnapshots.length - 1] ?? null;
  }

  public clear(): void {
    this.snapshots.length = 0;
    this.lastDrainedSequence = -1;
    this.rejectedSnapshots = 0;
    this.droppedSnapshots = 0;
  }

  private reject(
    reason: RemoteKartInputSnapshotRejectionReason,
    message: string
  ): RemoteKartInputSnapshotAcceptResult {
    this.rejectedSnapshots += 1;

    return {
      accepted: false,
      reason,
      message,
      bufferedCount: this.snapshots.length,
      rejectedCount: this.rejectedSnapshots
    };
  }

  private trimBufferedSnapshots(): readonly KartInputSnapshot[] {
    const droppedSnapshots: KartInputSnapshot[] = [];

    while (this.snapshots.length > this.maxBufferedSnapshots) {
      const droppedSnapshot = this.snapshots.shift();

      if (droppedSnapshot !== undefined) {
        droppedSnapshots.push(droppedSnapshot);
      }
    }

    this.droppedSnapshots += droppedSnapshots.length;

    if (droppedSnapshots.length > 0) {
      this.lastDrainedSequence = Math.max(
        this.lastDrainedSequence,
        droppedSnapshots[droppedSnapshots.length - 1]?.sequence ?? this.lastDrainedSequence
      );
    }

    return droppedSnapshots;
  }
}

export function createKartInputSnapshot(
  options: KartInputSnapshotCreateOptions
): KartInputSnapshot {
  return {
    protocol: KART_GAMEPLAY_PROTOCOL,
    version: KART_GAMEPLAY_VERSION,
    type: KART_GAMEPLAY_MESSAGE_TYPES.INPUT_SNAPSHOT,
    peerId: requireNonEmptyText(options.peerId, "peerId"),
    racerId: requireNonEmptyText(options.racerId, "racerId"),
    sequence: requireWholeNumber(options.sequence, "sequence"),
    tickIndex: requireWholeNumber(options.tickIndex, "tickIndex"),
    elapsedSeconds: requireFiniteNonNegativeNumber(
      options.elapsedSeconds,
      "elapsedSeconds"
    ),
    capturedAt: requireFiniteNonNegativeNumber(options.capturedAt, "capturedAt"),
    sentAt: requireFiniteNonNegativeNumber(
      options.sentAt ?? options.capturedAt,
      "sentAt"
    ),
    input: normalizeRacerInputState(options.input)
  };
}

export function serializeKartInputSnapshot(snapshot: KartInputSnapshot): string {
  return JSON.stringify(createKartInputSnapshot(snapshot));
}

export function deserializeKartInputSnapshot(payload: unknown): KartInputSnapshot {
  if (typeof payload !== "string") {
    throw new KartInputSnapshotError("Input snapshot payload must be a string.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new KartInputSnapshotError("Input snapshot payload is not valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new KartInputSnapshotError("Input snapshot payload must be an object.");
  }

  if (parsed.protocol !== KART_GAMEPLAY_PROTOCOL) {
    throw new KartInputSnapshotError("Input snapshot protocol mismatch.");
  }

  if (parsed.version !== KART_GAMEPLAY_VERSION) {
    throw new KartInputSnapshotError("Input snapshot version mismatch.");
  }

  if (parsed.type !== KART_GAMEPLAY_MESSAGE_TYPES.INPUT_SNAPSHOT) {
    throw new KartInputSnapshotError("Input snapshot type mismatch.");
  }

  const sentAt = getOptionalNumberField(parsed, "sentAt");

  return createKartInputSnapshot({
    peerId: requireStringField(parsed, "peerId"),
    racerId: requireStringField(parsed, "racerId"),
    sequence: requireNumberField(parsed, "sequence"),
    tickIndex: requireNumberField(parsed, "tickIndex"),
    elapsedSeconds: requireNumberField(parsed, "elapsedSeconds"),
    capturedAt: requireNumberField(parsed, "capturedAt"),
    ...(sentAt === undefined ? {} : { sentAt }),
    input: requireRacerInputField(parsed, "input")
  });
}

export function isKartInputSnapshotPayload(
  payload: unknown
): payload is string {
  if (typeof payload !== "string") {
    return false;
  }

  try {
    deserializeKartInputSnapshot(payload);
    return true;
  } catch {
    return false;
  }
}

export function getKartGameplayPayloadType(
  payload: unknown
): KartGameplayMessageType | null {
  if (typeof payload !== "string") {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  if (
    parsed.protocol !== KART_GAMEPLAY_PROTOCOL ||
    parsed.version !== KART_GAMEPLAY_VERSION
  ) {
    return null;
  }

  return isKartGameplayMessageType(parsed.type) ? parsed.type : null;
}

function normalizeRacerInputState(input: RacerInputState): RacerInputState {
  return {
    throttle: clampFiniteNumber(input.throttle, 0, 1, "input.throttle"),
    brake: clampFiniteNumber(input.brake, 0, 1, "input.brake"),
    steer: clampFiniteNumber(input.steer, -1, 1, "input.steer"),
    drift: requireBoolean(input.drift, "input.drift"),
    useItem: requireBoolean(input.useItem, "input.useItem")
  };
}

function compareSnapshotsBySequence(
  left: KartInputSnapshot,
  right: KartInputSnapshot
): number {
  return left.sequence - right.sequence;
}

function isKartGameplayMessageType(
  value: unknown
): value is KartGameplayMessageType {
  return (
    typeof value === "string" &&
    (Object.values(KART_GAMEPLAY_MESSAGE_TYPES) as readonly string[]).includes(value)
  );
}

function requireRacerInputField(
  record: Readonly<Record<string, unknown>>,
  key: string
): RacerInputState {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartInputSnapshotError(`Input snapshot field must be an object: ${key}.`);
  }

  return {
    throttle: requireNumberField(value, "throttle"),
    brake: requireNumberField(value, "brake"),
    steer: requireNumberField(value, "steer"),
    drift: requireBooleanField(value, "drift"),
    useItem: requireBooleanField(value, "useItem")
  };
}

function requireStringField(
  record: Readonly<Record<string, unknown>>,
  key: string
): string {
  const value = record[key];

  if (typeof value !== "string") {
    throw new KartInputSnapshotError(`Input snapshot field must be a string: ${key}.`);
  }

  return value;
}

function requireNumberField(
  record: Readonly<Record<string, unknown>>,
  key: string
): number {
  const value = record[key];

  if (typeof value !== "number") {
    throw new KartInputSnapshotError(`Input snapshot field must be a number: ${key}.`);
  }

  return value;
}

function getOptionalNumberField(
  record: Readonly<Record<string, unknown>>,
  key: string
): number | undefined {
  if (!hasOwnField(record, key)) {
    return undefined;
  }

  return requireNumberField(record, key);
}

function requireBooleanField(
  record: Readonly<Record<string, unknown>>,
  key: string
): boolean {
  return requireBoolean(record[key], key);
}

function requireNonEmptyText(value: string, key: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new KartInputSnapshotError(`Input snapshot field must be non-empty: ${key}.`);
  }

  return normalized;
}

function requireWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new KartInputSnapshotError(
      `Input snapshot field must be a whole non-negative number: ${key}.`
    );
  }

  return value;
}

function requirePositiveWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new KartInputSnapshotError(
      `Input snapshot option must be a positive whole number: ${key}.`
    );
  }

  return value;
}

function requireFiniteNonNegativeNumber(value: number, key: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new KartInputSnapshotError(
      `Input snapshot field must be finite and non-negative: ${key}.`
    );
  }

  return value;
}

function requireBoolean(value: unknown, key: string): boolean {
  if (typeof value !== "boolean") {
    throw new KartInputSnapshotError(`Input snapshot field must be a boolean: ${key}.`);
  }

  return value;
}

function clampFiniteNumber(
  value: number,
  min: number,
  max: number,
  key: string
): number {
  if (!Number.isFinite(value)) {
    throw new KartInputSnapshotError(`Input snapshot field must be finite: ${key}.`);
  }

  return Math.min(Math.max(value, min), max);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwnField(
  record: Readonly<Record<string, unknown>>,
  key: string
): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
