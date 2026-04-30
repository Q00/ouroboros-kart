import type { RacerInputState } from "../race/raceState";
import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  KART_GAMEPLAY_PROTOCOL,
  KART_GAMEPLAY_VERSION
} from "./kartInputSnapshot";

export const MAX_REMOTE_INPUT_DELTA_PAYLOAD_BYTES = 1024;
export const MAX_REMOTE_INPUT_DELTA_BUFFER_SIZE = 16;

export interface KartRemoteInputDeltaState {
  readonly throttle?: number;
  readonly brake?: number;
  readonly steer?: number;
  readonly drift?: boolean;
  readonly useItem?: boolean;
}

export interface KartRemoteInputDeltaPacket {
  readonly protocol: typeof KART_GAMEPLAY_PROTOCOL;
  readonly version: typeof KART_GAMEPLAY_VERSION;
  readonly type: typeof KART_GAMEPLAY_MESSAGE_TYPES.REMOTE_INPUT_DELTA;
  readonly peerId: string;
  readonly racerId: string;
  readonly sequence: number;
  readonly timestamp: number;
  readonly sentAt: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly delta: KartRemoteInputDeltaState;
}

export interface KartRemoteInputDeltaPacketCreateOptions {
  readonly peerId: string;
  readonly racerId: string;
  readonly sequence: number;
  readonly timestamp: number;
  readonly sentAt?: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly delta: KartRemoteInputDeltaState;
}

export interface LocalKartRemoteInputDeltaEmitterOptions {
  readonly peerId: string;
  readonly racerId: string;
  readonly send: (
    payload: string,
    packet: KartRemoteInputDeltaPacket
  ) => boolean;
  readonly now?: () => number;
}

export interface LocalKartRemoteInputDeltaTick {
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
}

export interface RemoteKartInputDeltaQueueOptions {
  readonly expectedPeerId: string;
  readonly expectedRacerId: string;
  readonly maxBufferedDeltas?: number;
}

export type RemoteKartInputDeltaQueueRejectionReason =
  | "unexpected-peer"
  | "unexpected-racer"
  | "duplicate-sequence"
  | "stale-sequence";

export type RemoteKartInputDeltaQueueAcceptResult =
  | {
      readonly accepted: true;
      readonly packet: KartRemoteInputDeltaPacket;
      readonly bufferedCount: number;
    }
  | {
      readonly accepted: false;
      readonly reason: RemoteKartInputDeltaQueueRejectionReason;
      readonly message: string;
      readonly bufferedCount: number;
      readonly rejectedCount: number;
    };

export interface RemoteKartInputDeltaDrainResult {
  readonly appliedInput: RacerInputState | null;
  readonly latestPacket: KartRemoteInputDeltaPacket | null;
  readonly drainedDeltas: readonly KartRemoteInputDeltaPacket[];
  readonly drainedDeltaCount: number;
  readonly bufferedCount: number;
}

const DEFAULT_REMOTE_INPUT_BASE: RacerInputState = {
  throttle: 0,
  brake: 0,
  steer: 0,
  drift: false,
  useItem: false
};

type MutableRemoteInputDeltaState = {
  -readonly [Key in keyof KartRemoteInputDeltaState]: KartRemoteInputDeltaState[Key];
};

export class KartRemoteInputDeltaError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "KartRemoteInputDeltaError";
  }
}

export class LocalKartRemoteInputDeltaEmitter {
  private readonly peerId: string;
  private readonly racerId: string;
  private readonly send: (
    payload: string,
    packet: KartRemoteInputDeltaPacket
  ) => boolean;
  private readonly now: () => number;
  private lastInput: RacerInputState = DEFAULT_REMOTE_INPUT_BASE;
  private readonly nextSequenceByPeerId = new Map<string, number>();

  public constructor(options: LocalKartRemoteInputDeltaEmitterOptions) {
    this.peerId = requireNonEmptyText(options.peerId, "peerId");
    this.racerId = requireNonEmptyText(options.racerId, "racerId");
    this.send = options.send;
    this.now = options.now ?? Date.now;
  }

  public emit(
    tick: LocalKartRemoteInputDeltaTick,
    input: RacerInputState
  ): KartRemoteInputDeltaPacket | null {
    const normalizedInput = normalizeRacerInputState(input);
    const delta = createKartRemoteInputDeltaState(
      this.lastInput,
      normalizedInput
    );

    if (!hasKartRemoteInputDeltaStateChanges(delta)) {
      return null;
    }

    const sequence = this.getNextSequenceForPeer(this.peerId);
    const sentAt = this.now();
    const packet = createKartRemoteInputDeltaPacket({
      peerId: this.peerId,
      racerId: this.racerId,
      sequence,
      timestamp: sentAt,
      sentAt,
      tickIndex: tick.tickIndex,
      elapsedSeconds: tick.elapsedSeconds,
      delta
    });
    const payload = serializeKartRemoteInputDeltaPacket(packet);

    if (!this.send(payload, packet)) {
      return null;
    }

    this.commitSentSequenceForPeer(this.peerId, sequence);
    this.lastInput = normalizedInput;

    return packet;
  }

  private getNextSequenceForPeer(peerId: string): number {
    return this.nextSequenceByPeerId.get(peerId) ?? 0;
  }

  private commitSentSequenceForPeer(peerId: string, sequence: number): void {
    this.nextSequenceByPeerId.set(peerId, sequence + 1);
  }
}

export class RemoteKartInputDeltaQueue {
  private readonly expectedPeerId: string;
  private readonly expectedRacerId: string;
  private readonly maxBufferedDeltas: number;
  private readonly packets: KartRemoteInputDeltaPacket[] = [];
  private currentInput: RacerInputState = DEFAULT_REMOTE_INPUT_BASE;
  private lastAppliedInput: RacerInputState | null = null;
  private lastDrainedSequence = -1;
  private rejectedDeltas = 0;

  public constructor(options: RemoteKartInputDeltaQueueOptions) {
    this.expectedPeerId = requireNonEmptyText(
      options.expectedPeerId,
      "expectedPeerId"
    );
    this.expectedRacerId = requireNonEmptyText(
      options.expectedRacerId,
      "expectedRacerId"
    );
    this.maxBufferedDeltas = requirePositiveWholeNumber(
      options.maxBufferedDeltas ?? MAX_REMOTE_INPUT_DELTA_BUFFER_SIZE,
      "maxBufferedDeltas"
    );
  }

  public get peerId(): string {
    return this.expectedPeerId;
  }

  public get racerId(): string {
    return this.expectedRacerId;
  }

  public get bufferedCount(): number {
    return this.packets.length;
  }

  public get rejectedCount(): number {
    return this.rejectedDeltas;
  }

  public accept(
    packet: KartRemoteInputDeltaPacket
  ): RemoteKartInputDeltaQueueAcceptResult {
    if (packet.peerId !== this.expectedPeerId) {
      return this.reject(
        "unexpected-peer",
        `Remote input delta peer mismatch: ${packet.peerId}.`
      );
    }

    if (packet.racerId !== this.expectedRacerId) {
      return this.reject(
        "unexpected-racer",
        `Remote input delta racer mismatch: ${packet.racerId}.`
      );
    }

    if (packet.sequence <= this.lastDrainedSequence) {
      return this.reject(
        "stale-sequence",
        `Remote input delta sequence ${packet.sequence} has already been drained.`
      );
    }

    if (
      this.packets.some(
        (bufferedPacket) => bufferedPacket.sequence === packet.sequence
      )
    ) {
      return this.reject(
        "duplicate-sequence",
        `Remote input delta sequence ${packet.sequence} is already buffered.`
      );
    }

    this.packets.push(packet);
    this.packets.sort(compareRemoteInputDeltasBySequence);
    this.trimBufferedPackets();

    return {
      accepted: true,
      packet,
      bufferedCount: this.packets.length
    };
  }

  public drainReady(
    maxTickIndex = Number.POSITIVE_INFINITY
  ): RemoteKartInputDeltaDrainResult {
    const readyPackets: KartRemoteInputDeltaPacket[] = [];
    const pendingPackets: KartRemoteInputDeltaPacket[] = [];

    for (const packet of this.packets) {
      if (packet.tickIndex <= maxTickIndex) {
        readyPackets.push(packet);
      } else {
        pendingPackets.push(packet);
      }
    }

    readyPackets.sort(compareRemoteInputDeltasBySequence);
    pendingPackets.sort(compareRemoteInputDeltasBySequence);
    this.packets.length = 0;
    this.packets.push(...pendingPackets);

    const drainedDeltas: KartRemoteInputDeltaPacket[] = [];
    let hasUseItemPulse = false;

    for (const packet of readyPackets) {
      if (packet.sequence <= this.lastDrainedSequence) {
        continue;
      }

      this.currentInput = applyKartRemoteInputDelta(
        this.currentInput,
        packet.delta
      );
      hasUseItemPulse = hasUseItemPulse || packet.delta.useItem === true;
      this.lastDrainedSequence = Math.max(
        this.lastDrainedSequence,
        packet.sequence
      );
      drainedDeltas.push(packet);
    }

    const appliedInput =
      drainedDeltas.length > 0 || this.needsPulseReset()
        ? this.createAppliedInput(hasUseItemPulse)
        : null;

    if (appliedInput !== null) {
      this.lastAppliedInput = appliedInput;
    }

    return {
      appliedInput,
      latestPacket: drainedDeltas[drainedDeltas.length - 1] ?? null,
      drainedDeltas,
      drainedDeltaCount: drainedDeltas.length,
      bufferedCount: this.packets.length
    };
  }

  public clear(): void {
    this.packets.length = 0;
    this.currentInput = DEFAULT_REMOTE_INPUT_BASE;
    this.lastAppliedInput = null;
    this.lastDrainedSequence = -1;
    this.rejectedDeltas = 0;
  }

  private reject(
    reason: RemoteKartInputDeltaQueueRejectionReason,
    message: string
  ): RemoteKartInputDeltaQueueAcceptResult {
    this.rejectedDeltas += 1;

    return {
      accepted: false,
      reason,
      message,
      bufferedCount: this.packets.length,
      rejectedCount: this.rejectedDeltas
    };
  }

  private trimBufferedPackets(): void {
    while (this.packets.length > this.maxBufferedDeltas) {
      const droppedPacket = this.packets.shift();

      if (droppedPacket !== undefined) {
        this.lastDrainedSequence = Math.max(
          this.lastDrainedSequence,
          droppedPacket.sequence
        );
      }
    }
  }

  private needsPulseReset(): boolean {
    return (
      this.lastAppliedInput !== null &&
      this.lastAppliedInput.useItem &&
      !this.currentInput.useItem
    );
  }

  private createAppliedInput(hasUseItemPulse: boolean): RacerInputState {
    return {
      ...this.currentInput,
      useItem: this.currentInput.useItem || hasUseItemPulse
    };
  }
}

export function createKartRemoteInputDeltaPacket(
  options: KartRemoteInputDeltaPacketCreateOptions
): KartRemoteInputDeltaPacket {
  return {
    protocol: KART_GAMEPLAY_PROTOCOL,
    version: KART_GAMEPLAY_VERSION,
    type: KART_GAMEPLAY_MESSAGE_TYPES.REMOTE_INPUT_DELTA,
    peerId: requireNonEmptyText(options.peerId, "peerId"),
    racerId: requireNonEmptyText(options.racerId, "racerId"),
    sequence: requireWholeNumber(options.sequence, "sequence"),
    timestamp: requireFiniteNonNegativeNumber(options.timestamp, "timestamp"),
    sentAt: requireFiniteNonNegativeNumber(
      options.sentAt ?? options.timestamp,
      "sentAt"
    ),
    tickIndex: requireWholeNumber(options.tickIndex, "tickIndex"),
    elapsedSeconds: requireFiniteNonNegativeNumber(
      options.elapsedSeconds,
      "elapsedSeconds"
    ),
    delta: normalizeRemoteInputDeltaState(options.delta)
  };
}

export function createKartRemoteInputDeltaState(
  previousInput: RacerInputState | null,
  currentInput: RacerInputState
): KartRemoteInputDeltaState {
  const current = normalizeRacerInputState(currentInput);
  const previous =
    previousInput === null
      ? DEFAULT_REMOTE_INPUT_BASE
      : normalizeRacerInputState(previousInput);
  const delta: MutableRemoteInputDeltaState = {};

  if (current.throttle !== previous.throttle) {
    delta.throttle = current.throttle;
  }

  if (current.brake !== previous.brake) {
    delta.brake = current.brake;
  }

  if (current.steer !== previous.steer) {
    delta.steer = current.steer;
  }

  if (current.drift !== previous.drift) {
    delta.drift = current.drift;
  }

  if (current.useItem !== previous.useItem) {
    delta.useItem = current.useItem;
  }

  return delta;
}

export function hasKartRemoteInputDeltaStateChanges(
  delta: KartRemoteInputDeltaState
): boolean {
  return (
    delta.throttle !== undefined ||
    delta.brake !== undefined ||
    delta.steer !== undefined ||
    delta.drift !== undefined ||
    delta.useItem !== undefined
  );
}

export function applyKartRemoteInputDelta(
  baseInput: RacerInputState,
  delta: KartRemoteInputDeltaState
): RacerInputState {
  return normalizeRacerInputState({
    ...baseInput,
    ...normalizeRemoteInputDeltaState(delta)
  });
}

export function serializeKartRemoteInputDeltaPacket(
  packet: KartRemoteInputDeltaPacket
): string {
  return JSON.stringify(createKartRemoteInputDeltaPacket(packet));
}

export function deserializeKartRemoteInputDeltaPacket(
  payload: unknown
): KartRemoteInputDeltaPacket {
  if (typeof payload !== "string") {
    throw new KartRemoteInputDeltaError("Remote input delta payload must be a string.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new KartRemoteInputDeltaError(
      "Remote input delta payload is not valid JSON."
    );
  }

  if (!isRecord(parsed)) {
    throw new KartRemoteInputDeltaError(
      "Remote input delta payload must be an object."
    );
  }

  if (parsed.protocol !== KART_GAMEPLAY_PROTOCOL) {
    throw new KartRemoteInputDeltaError("Remote input delta protocol mismatch.");
  }

  if (parsed.version !== KART_GAMEPLAY_VERSION) {
    throw new KartRemoteInputDeltaError("Remote input delta version mismatch.");
  }

  if (parsed.type !== KART_GAMEPLAY_MESSAGE_TYPES.REMOTE_INPUT_DELTA) {
    throw new KartRemoteInputDeltaError("Remote input delta type mismatch.");
  }

  const sentAt = getOptionalNumberField(parsed, "sentAt");

  return createKartRemoteInputDeltaPacket({
    peerId: requireStringField(parsed, "peerId"),
    racerId: requireStringField(parsed, "racerId"),
    sequence: requireNumberField(parsed, "sequence"),
    timestamp: requireNumberField(parsed, "timestamp"),
    ...(sentAt === undefined ? {} : { sentAt }),
    tickIndex: requireNumberField(parsed, "tickIndex"),
    elapsedSeconds: requireNumberField(parsed, "elapsedSeconds"),
    delta: requireRemoteInputDeltaStateField(parsed, "delta")
  });
}

export function isKartRemoteInputDeltaPacketPayload(
  payload: unknown
): payload is string {
  if (typeof payload !== "string") {
    return false;
  }

  try {
    deserializeKartRemoteInputDeltaPacket(payload);
    return true;
  } catch {
    return false;
  }
}

function normalizeRemoteInputDeltaState(
  delta: unknown
): KartRemoteInputDeltaState {
  if (!isRecord(delta)) {
    throw new KartRemoteInputDeltaError(
      "Remote input delta field must be an object: delta."
    );
  }

  const normalized: MutableRemoteInputDeltaState = {};

  if (hasOwnField(delta, "throttle")) {
    normalized.throttle = clampFiniteNumber(
      requireNumberField(delta, "throttle"),
      0,
      1,
      "delta.throttle"
    );
  }

  if (hasOwnField(delta, "brake")) {
    normalized.brake = clampFiniteNumber(
      requireNumberField(delta, "brake"),
      0,
      1,
      "delta.brake"
    );
  }

  if (hasOwnField(delta, "steer")) {
    normalized.steer = clampFiniteNumber(
      requireNumberField(delta, "steer"),
      -1,
      1,
      "delta.steer"
    );
  }

  if (hasOwnField(delta, "drift")) {
    normalized.drift = requireBooleanField(delta, "drift");
  }

  if (hasOwnField(delta, "useItem")) {
    normalized.useItem = requireBooleanField(delta, "useItem");
  }

  return normalized;
}

function requireRemoteInputDeltaStateField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartRemoteInputDeltaState {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartRemoteInputDeltaError(
      `Remote input delta field must be an object: ${key}.`
    );
  }

  return normalizeRemoteInputDeltaState(value);
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

function requireStringField(
  record: Readonly<Record<string, unknown>>,
  key: string
): string {
  const value = record[key];

  if (typeof value !== "string") {
    throw new KartRemoteInputDeltaError(
      `Remote input delta field must be a string: ${key}.`
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
    throw new KartRemoteInputDeltaError(
      `Remote input delta field must be a number: ${key}.`
    );
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
    throw new KartRemoteInputDeltaError(
      `Remote input delta field must be non-empty: ${key}.`
    );
  }

  return normalized;
}

function requireWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new KartRemoteInputDeltaError(
      `Remote input delta field must be a whole non-negative number: ${key}.`
    );
  }

  return value;
}

function requirePositiveWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new KartRemoteInputDeltaError(
      `Remote input delta field must be a positive whole number: ${key}.`
    );
  }

  return value;
}

function requireFiniteNonNegativeNumber(value: number, key: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new KartRemoteInputDeltaError(
      `Remote input delta field must be finite and non-negative: ${key}.`
    );
  }

  return value;
}

function requireBoolean(value: unknown, key: string): boolean {
  if (typeof value !== "boolean") {
    throw new KartRemoteInputDeltaError(
      `Remote input delta field must be a boolean: ${key}.`
    );
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
    throw new KartRemoteInputDeltaError(
      `Remote input delta field must be finite: ${key}.`
    );
  }

  return Math.min(Math.max(value, min), max);
}

function hasOwnField(
  record: Readonly<Record<string, unknown>>,
  key: string
): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareRemoteInputDeltasBySequence(
  left: KartRemoteInputDeltaPacket,
  right: KartRemoteInputDeltaPacket
): number {
  return left.sequence - right.sequence;
}
