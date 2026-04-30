import { RACE_CAPACITY } from "../config/gameConfig";
import type { RacePhase } from "../race/raceState";
import type {
  ActiveRaceItemState,
  RaceBananaHitEvent,
  RaceBoostActivationEvent,
  RaceItemPickupCollectionEvent,
  RaceItemPickupState,
  RaceProgressSnapshot,
  RaceSessionRacerState,
  RaceShellHitEvent
} from "../race/raceSession";
import {
  createKartActiveItemSnapshotFromRaceState,
  createKartBananaHitSnapshotFromRaceEvent,
  createKartBoostActivationSnapshotFromRaceEvent,
  createKartItemPickupCollectionSnapshotFromRaceEvent,
  createKartItemPickupSnapshotFromRaceState,
  createKartRacerTransformFromRaceState,
  createKartShellHitSnapshotFromRaceEvent,
  createKartTransformSnapshot,
  type KartActiveItemSnapshot,
  type KartBananaHitSnapshot,
  type KartBoostActivationSnapshot,
  type KartItemPickupCollectionSnapshot,
  type KartItemPickupSnapshot,
  type KartRacerTransform,
  type KartShellHitSnapshot,
  type KartTransformSnapshot
} from "./kartTransformSnapshot";
import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  KART_GAMEPLAY_PROTOCOL,
  KART_GAMEPLAY_VERSION
} from "./kartInputSnapshot";

export const MAX_RACE_STATE_SNAPSHOT_PAYLOAD_BYTES = 32 * 1024;
export const MAX_REMOTE_RACE_STATE_SNAPSHOT_BUFFER_SIZE = 8;

export interface KartRaceStateSnapshot {
  readonly protocol: typeof KART_GAMEPLAY_PROTOCOL;
  readonly version: typeof KART_GAMEPLAY_VERSION;
  readonly type: typeof KART_GAMEPLAY_MESSAGE_TYPES.RACE_STATE_SNAPSHOT;
  readonly hostPeerId: string;
  readonly sequence: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly capturedAt: number;
  readonly phase: RacePhase;
  readonly lapCount: number;
  readonly racers: readonly RaceProgressSnapshot[];
  readonly racerTransforms: readonly KartRacerTransform[];
  readonly itemPickups: readonly KartItemPickupSnapshot[];
  readonly itemPickupCollections: readonly KartItemPickupCollectionSnapshot[];
  readonly boostActivations: readonly KartBoostActivationSnapshot[];
  readonly shellHits: readonly KartShellHitSnapshot[];
  readonly bananaHits: readonly KartBananaHitSnapshot[];
  readonly activeItems: readonly KartActiveItemSnapshot[];
}

export interface KartRaceStateSnapshotCreateOptions {
  readonly hostPeerId: string;
  readonly sequence: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly capturedAt: number;
  readonly phase: RacePhase;
  readonly lapCount: number;
  readonly racers: readonly RaceProgressSnapshot[];
  readonly racerTransforms?: readonly KartRacerTransform[];
  readonly itemPickups?: readonly KartItemPickupSnapshot[];
  readonly itemPickupCollections?: readonly KartItemPickupCollectionSnapshot[];
  readonly boostActivations?: readonly KartBoostActivationSnapshot[];
  readonly shellHits?: readonly KartShellHitSnapshot[];
  readonly bananaHits?: readonly KartBananaHitSnapshot[];
  readonly activeItems?: readonly KartActiveItemSnapshot[];
}

export interface LocalKartRaceStateSnapshotEmitterOptions {
  readonly hostPeerId: string;
  readonly send: (payload: string, snapshot: KartRaceStateSnapshot) => boolean;
  readonly now?: () => number;
}

export interface LocalKartRaceStateSnapshotTick {
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
}

export interface RemoteKartRaceStateSnapshotSynchronizerOptions {
  readonly expectedHostPeerId?: string;
  readonly maxBufferedSnapshots?: number;
  readonly maxPayloadBytes?: number;
  readonly now?: () => number;
}

export type RemoteKartRaceStateSnapshotRejectionReason =
  | "payload-too-large"
  | "invalid-snapshot"
  | "unexpected-host"
  | "duplicate-sequence"
  | "stale-sequence";

export type RemoteKartRaceStateSnapshotAcceptResult =
  | {
      readonly accepted: true;
      readonly snapshot: KartRaceStateSnapshot;
      readonly bufferedCount: number;
      readonly droppedSnapshots: readonly KartRaceStateSnapshot[];
    }
  | {
      readonly accepted: false;
      readonly reason: RemoteKartRaceStateSnapshotRejectionReason;
      readonly message: string;
      readonly bufferedCount: number;
      readonly rejectedCount: number;
    };

interface ReceivedKartRaceStateSnapshot {
  readonly snapshot: KartRaceStateSnapshot;
  readonly receivedAt: number;
}

export class KartRaceStateSnapshotError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "KartRaceStateSnapshotError";
  }
}

export class LocalKartRaceStateSnapshotEmitter {
  private readonly hostPeerId: string;
  private readonly send: (payload: string, snapshot: KartRaceStateSnapshot) => boolean;
  private readonly now: () => number;
  private nextSequence = 0;

  public constructor(options: LocalKartRaceStateSnapshotEmitterOptions) {
    this.hostPeerId = requireNonEmptyText(options.hostPeerId, "hostPeerId");
    this.send = options.send;
    this.now = options.now ?? Date.now;
  }

  public emit(
    tick: LocalKartRaceStateSnapshotTick,
    phase: RacePhase,
    lapCount: number,
    racers: readonly RaceProgressSnapshot[],
    racerStates: readonly RaceSessionRacerState[] = [],
    itemPickups: readonly RaceItemPickupState[] = [],
    itemPickupCollections: readonly RaceItemPickupCollectionEvent[] = [],
    boostActivations: readonly RaceBoostActivationEvent[] = [],
    shellHits: readonly RaceShellHitEvent[] = [],
    bananaHits: readonly RaceBananaHitEvent[] = [],
    activeItems: readonly ActiveRaceItemState[] = []
  ): KartRaceStateSnapshot | null {
    const snapshot = createKartRaceStateSnapshot({
      hostPeerId: this.hostPeerId,
      sequence: this.nextSequence,
      tickIndex: tick.tickIndex,
      elapsedSeconds: tick.elapsedSeconds,
      capturedAt: this.now(),
      phase,
      lapCount,
      racers,
      racerTransforms: racerStates.map(createKartRacerTransformFromRaceState),
      itemPickups: itemPickups.map(createKartItemPickupSnapshotFromRaceState),
      itemPickupCollections: itemPickupCollections.map(
        createKartItemPickupCollectionSnapshotFromRaceEvent
      ),
      boostActivations: boostActivations.map(
        createKartBoostActivationSnapshotFromRaceEvent
      ),
      shellHits: shellHits.map(createKartShellHitSnapshotFromRaceEvent),
      bananaHits: bananaHits.map(createKartBananaHitSnapshotFromRaceEvent),
      activeItems: activeItems.map(createKartActiveItemSnapshotFromRaceState)
    });
    const payload = serializeKartRaceStateSnapshot(snapshot);

    this.nextSequence += 1;

    if (!this.send(payload, snapshot)) {
      return null;
    }

    return snapshot;
  }
}

export class RemoteKartRaceStateSnapshotSynchronizer {
  private readonly expectedHostPeerId: string | undefined;
  private readonly maxBufferedSnapshots: number;
  private readonly maxPayloadBytes: number;
  private readonly now: () => number;
  private readonly snapshots: ReceivedKartRaceStateSnapshot[] = [];
  private lastDroppedSequence = -1;
  private rejectedSnapshots = 0;
  private droppedSnapshots = 0;

  public constructor(
    options: RemoteKartRaceStateSnapshotSynchronizerOptions = {}
  ) {
    this.expectedHostPeerId =
      options.expectedHostPeerId === undefined
        ? undefined
        : requireNonEmptyText(options.expectedHostPeerId, "expectedHostPeerId");
    this.maxBufferedSnapshots = requirePositiveWholeNumber(
      options.maxBufferedSnapshots ?? MAX_REMOTE_RACE_STATE_SNAPSHOT_BUFFER_SIZE,
      "maxBufferedSnapshots"
    );
    this.maxPayloadBytes = requirePositiveWholeNumber(
      options.maxPayloadBytes ?? MAX_RACE_STATE_SNAPSHOT_PAYLOAD_BYTES,
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

  public get latestSnapshot(): KartRaceStateSnapshot | null {
    return this.snapshots[this.snapshots.length - 1]?.snapshot ?? null;
  }

  public accept(
    input: unknown,
    receivedAt: number = this.now()
  ): RemoteKartRaceStateSnapshotAcceptResult {
    let snapshot: KartRaceStateSnapshot;

    if (typeof input === "string") {
      if (getUtf8ByteLength(input) > this.maxPayloadBytes) {
        return this.reject(
          "payload-too-large",
          "Remote race-state snapshot payload exceeds the packet size limit."
        );
      }

      try {
        snapshot = deserializeKartRaceStateSnapshot(input);
      } catch (error) {
        return this.reject(
          "invalid-snapshot",
          getErrorMessage(
            error,
            "Remote race-state snapshot payload is invalid."
          )
        );
      }
    } else {
      try {
        snapshot = createKartRaceStateSnapshot(
          input as KartRaceStateSnapshotCreateOptions
        );
      } catch (error) {
        return this.reject(
          "invalid-snapshot",
          getErrorMessage(error, "Remote race-state snapshot is invalid.")
        );
      }
    }

    if (
      this.expectedHostPeerId !== undefined &&
      snapshot.hostPeerId !== this.expectedHostPeerId
    ) {
      return this.reject(
        "unexpected-host",
        `Remote race-state snapshot host mismatch: ${snapshot.hostPeerId}.`
      );
    }

    if (snapshot.sequence <= this.lastDroppedSequence) {
      return this.reject(
        "stale-sequence",
        `Remote race-state snapshot sequence ${snapshot.sequence} has already been dropped.`
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
        `Remote race-state snapshot sequence ${snapshot.sequence} is already buffered.`
      );
    }

    this.snapshots.push({
      snapshot,
      receivedAt: requireFiniteNonNegativeNumber(receivedAt, "receivedAt")
    });
    this.snapshots.sort(compareReceivedSnapshotsByElapsedSeconds);

    const droppedSnapshots = this.trimBufferedSnapshots();

    return {
      accepted: true,
      snapshot,
      bufferedCount: this.snapshots.length,
      droppedSnapshots
    };
  }

  public clear(): void {
    this.snapshots.length = 0;
    this.lastDroppedSequence = -1;
    this.rejectedSnapshots = 0;
    this.droppedSnapshots = 0;
  }

  private reject(
    reason: RemoteKartRaceStateSnapshotRejectionReason,
    message: string
  ): RemoteKartRaceStateSnapshotAcceptResult {
    this.rejectedSnapshots += 1;

    return {
      accepted: false,
      reason,
      message,
      bufferedCount: this.snapshots.length,
      rejectedCount: this.rejectedSnapshots
    };
  }

  private trimBufferedSnapshots(): readonly KartRaceStateSnapshot[] {
    const droppedSnapshots: KartRaceStateSnapshot[] = [];

    while (this.snapshots.length > this.maxBufferedSnapshots) {
      const droppedSnapshot = this.snapshots.shift();

      if (droppedSnapshot !== undefined) {
        droppedSnapshots.push(droppedSnapshot.snapshot);
      }
    }

    this.droppedSnapshots += droppedSnapshots.length;

    for (const snapshot of droppedSnapshots) {
      this.lastDroppedSequence = Math.max(
        this.lastDroppedSequence,
        snapshot.sequence
      );
    }

    return droppedSnapshots;
  }
}

export function createKartRaceStateSnapshot(
  options: KartRaceStateSnapshotCreateOptions
): KartRaceStateSnapshot {
  const lapCount = requireWholeNumber(options.lapCount, "lapCount");
  const racers = options.racers.map((racer) =>
    createRaceProgressSnapshot(racer, lapCount)
  );
  const synchronizedState = createKartTransformSnapshot({
    hostPeerId: options.hostPeerId,
    sequence: options.sequence,
    tickIndex: options.tickIndex,
    elapsedSeconds: options.elapsedSeconds,
    capturedAt: options.capturedAt,
    racers: options.racerTransforms ?? [],
    itemPickups: options.itemPickups ?? [],
    itemPickupCollections: options.itemPickupCollections ?? [],
    boostActivations: options.boostActivations ?? [],
    shellHits: options.shellHits ?? [],
    bananaHits: options.bananaHits ?? [],
    activeItems: options.activeItems ?? []
  });

  assertRacerSnapshotList(racers);
  assertSynchronizedRacerStateMatchesProgress(
    racers,
    synchronizedState.racers
  );

  return {
    protocol: KART_GAMEPLAY_PROTOCOL,
    version: KART_GAMEPLAY_VERSION,
    type: KART_GAMEPLAY_MESSAGE_TYPES.RACE_STATE_SNAPSHOT,
    hostPeerId: requireNonEmptyText(options.hostPeerId, "hostPeerId"),
    sequence: requireWholeNumber(options.sequence, "sequence"),
    tickIndex: requireWholeNumber(options.tickIndex, "tickIndex"),
    elapsedSeconds: requireFiniteNonNegativeNumber(
      options.elapsedSeconds,
      "elapsedSeconds"
    ),
    capturedAt: requireFiniteNonNegativeNumber(options.capturedAt, "capturedAt"),
    phase: requireRacePhase(options.phase, "phase"),
    lapCount,
    racers,
    racerTransforms: synchronizedState.racers,
    itemPickups: synchronizedState.itemPickups,
    itemPickupCollections: synchronizedState.itemPickupCollections,
    boostActivations: synchronizedState.boostActivations,
    shellHits: synchronizedState.shellHits,
    bananaHits: synchronizedState.bananaHits,
    activeItems: synchronizedState.activeItems
  };
}

export function createKartTransformSnapshotFromRaceStateSnapshot(
  snapshot: KartRaceStateSnapshot
): KartTransformSnapshot {
  return createKartTransformSnapshot({
    hostPeerId: snapshot.hostPeerId,
    sequence: snapshot.sequence,
    tickIndex: snapshot.tickIndex,
    elapsedSeconds: snapshot.elapsedSeconds,
    capturedAt: snapshot.capturedAt,
    racers: snapshot.racerTransforms,
    itemPickups: snapshot.itemPickups,
    itemPickupCollections: snapshot.itemPickupCollections,
    boostActivations: snapshot.boostActivations,
    shellHits: snapshot.shellHits,
    bananaHits: snapshot.bananaHits,
    activeItems: snapshot.activeItems
  });
}

export function serializeKartRaceStateSnapshot(
  snapshot: KartRaceStateSnapshot
): string {
  return JSON.stringify(createKartRaceStateSnapshot(snapshot));
}

export function deserializeKartRaceStateSnapshot(
  payload: unknown
): KartRaceStateSnapshot {
  if (typeof payload !== "string") {
    throw new KartRaceStateSnapshotError("Race-state snapshot payload must be a string.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new KartRaceStateSnapshotError(
      "Race-state snapshot payload is not valid JSON."
    );
  }

  if (!isRecord(parsed)) {
    throw new KartRaceStateSnapshotError(
      "Race-state snapshot payload must be an object."
    );
  }

  if (parsed.protocol !== KART_GAMEPLAY_PROTOCOL) {
    throw new KartRaceStateSnapshotError("Race-state snapshot protocol mismatch.");
  }

  if (parsed.version !== KART_GAMEPLAY_VERSION) {
    throw new KartRaceStateSnapshotError("Race-state snapshot version mismatch.");
  }

  if (parsed.type !== KART_GAMEPLAY_MESSAGE_TYPES.RACE_STATE_SNAPSHOT) {
    throw new KartRaceStateSnapshotError("Race-state snapshot type mismatch.");
  }

  return createKartRaceStateSnapshot({
    hostPeerId: requireStringField(parsed, "hostPeerId"),
    sequence: requireNumberField(parsed, "sequence"),
    tickIndex: requireNumberField(parsed, "tickIndex"),
    elapsedSeconds: requireNumberField(parsed, "elapsedSeconds"),
    capturedAt: requireNumberField(parsed, "capturedAt"),
    phase: requireStringField(parsed, "phase") as RacePhase,
    lapCount: requireNumberField(parsed, "lapCount"),
    racers: requireRaceProgressSnapshotsField(parsed, "racers"),
    racerTransforms: requireOptionalSnapshotArrayField(
      parsed,
      "racerTransforms"
    ) as readonly KartRacerTransform[],
    itemPickups: requireOptionalSnapshotArrayField(
      parsed,
      "itemPickups"
    ) as readonly KartItemPickupSnapshot[],
    itemPickupCollections: requireOptionalSnapshotArrayField(
      parsed,
      "itemPickupCollections"
    ) as readonly KartItemPickupCollectionSnapshot[],
    boostActivations: requireOptionalSnapshotArrayField(
      parsed,
      "boostActivations"
    ) as readonly KartBoostActivationSnapshot[],
    shellHits: requireOptionalSnapshotArrayField(
      parsed,
      "shellHits"
    ) as readonly KartShellHitSnapshot[],
    bananaHits: requireOptionalSnapshotArrayField(
      parsed,
      "bananaHits"
    ) as readonly KartBananaHitSnapshot[],
    activeItems: requireOptionalSnapshotArrayField(
      parsed,
      "activeItems"
    ) as readonly KartActiveItemSnapshot[]
  });
}

export function isKartRaceStateSnapshotPayload(
  payload: unknown
): payload is string {
  if (typeof payload !== "string") {
    return false;
  }

  try {
    deserializeKartRaceStateSnapshot(payload);
    return true;
  } catch {
    return false;
  }
}

function createRaceProgressSnapshot(
  racer: RaceProgressSnapshot,
  expectedLapCount: number
): RaceProgressSnapshot {
  const lapCount = requireWholeNumber(racer.lapCount, "racer.lapCount");

  if (lapCount !== expectedLapCount) {
    throw new KartRaceStateSnapshotError(
      "Race-state racer lap count must match the snapshot lap count."
    );
  }

  const lap = requireWholeNumber(racer.lap, "racer.lap");
  const checkpointCount = requireWholeNumber(
    racer.checkpointCount,
    "racer.checkpointCount"
  );
  const checkpointIndex = requireWholeNumber(
    racer.checkpointIndex,
    "racer.checkpointIndex"
  );
  const trackLength = requireFiniteNonNegativeNumber(
    racer.trackLength,
    "racer.trackLength"
  );
  const totalDistance = requireFiniteNonNegativeNumber(
    racer.totalDistance,
    "racer.totalDistance"
  );
  const finished = requireBoolean(racer.finished, "racer.finished");
  const finishPlace = normalizeNullableWholeNumber(
    racer.finishPlace,
    "racer.finishPlace"
  );
  const finishTimeSeconds = normalizeNullableFiniteNonNegativeNumber(
    racer.finishTimeSeconds,
    "racer.finishTimeSeconds"
  );

  if (lap > lapCount) {
    throw new KartRaceStateSnapshotError(
      "Race-state racer lap cannot exceed lap count."
    );
  }

  if (checkpointCount > 0 && checkpointIndex >= checkpointCount) {
    throw new KartRaceStateSnapshotError(
      "Race-state racer checkpoint index must be less than checkpoint count."
    );
  }

  if (finished && finishPlace === null) {
    throw new KartRaceStateSnapshotError(
      "Race-state finished racer must include a finish place."
    );
  }

  if (totalDistance < trackLength && lapCount > 1) {
    throw new KartRaceStateSnapshotError(
      "Race-state total distance is inconsistent with track length."
    );
  }

  return {
    racerId: requireNonEmptyText(racer.racerId, "racer.racerId"),
    slotIndex: requireWholeNumber(racer.slotIndex, "racer.slotIndex"),
    displayName: requireNonEmptyText(racer.displayName, "racer.displayName"),
    controller: requireRacerController(racer.controller, "racer.controller"),
    rank: requirePositiveWholeNumber(racer.rank, "racer.rank"),
    lap,
    lapCount,
    checkpointIndex,
    checkpointCount,
    trackProgress: requireFiniteNonNegativeNumber(
      racer.trackProgress,
      "racer.trackProgress"
    ),
    trackLength,
    completedDistance: requireFiniteNonNegativeNumber(
      racer.completedDistance,
      "racer.completedDistance"
    ),
    totalDistance,
    currentLapProgressRatio: requireRatio(
      racer.currentLapProgressRatio,
      "racer.currentLapProgressRatio"
    ),
    completionRatio: requireRatio(racer.completionRatio, "racer.completionRatio"),
    finished,
    finishPlace,
    finishTimeSeconds
  };
}

function requireRaceProgressSnapshotsField(
  record: Readonly<Record<string, unknown>>,
  key: string
): readonly RaceProgressSnapshot[] {
  const value = record[key];

  if (!Array.isArray(value)) {
    throw new KartRaceStateSnapshotError(
      `Race-state snapshot field must be an array: ${key}.`
    );
  }

  return value.map((entry) => requireRaceProgressSnapshot(entry, key));
}

function requireRaceProgressSnapshot(
  value: unknown,
  key: string
): RaceProgressSnapshot {
  if (!isRecord(value)) {
    throw new KartRaceStateSnapshotError(
      `Race-state snapshot array entry must be an object: ${key}.`
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

function assertRacerSnapshotList(racers: readonly RaceProgressSnapshot[]): void {
  if (racers.length === 0 || racers.length > RACE_CAPACITY) {
    throw new KartRaceStateSnapshotError(
      `Race-state snapshot must include 1-${RACE_CAPACITY} racers.`
    );
  }

  const racerIds = new Set<string>();
  const slotIndexes = new Set<number>();
  const ranks = new Set<number>();

  for (const racer of racers) {
    if (racerIds.has(racer.racerId)) {
      throw new KartRaceStateSnapshotError(
        `Race-state snapshot contains duplicate racer id: ${racer.racerId}.`
      );
    }

    if (slotIndexes.has(racer.slotIndex)) {
      throw new KartRaceStateSnapshotError(
        `Race-state snapshot contains duplicate slot index: ${racer.slotIndex}.`
      );
    }

    if (ranks.has(racer.rank)) {
      throw new KartRaceStateSnapshotError(
        `Race-state snapshot contains duplicate rank: ${racer.rank}.`
      );
    }

    racerIds.add(racer.racerId);
    slotIndexes.add(racer.slotIndex);
    ranks.add(racer.rank);
  }
}

function assertSynchronizedRacerStateMatchesProgress(
  racers: readonly RaceProgressSnapshot[],
  racerTransforms: readonly KartRacerTransform[]
): void {
  if (racerTransforms.length === 0) {
    return;
  }

  if (racerTransforms.length !== racers.length) {
    throw new KartRaceStateSnapshotError(
      "Race-state transform count must match race progress count."
    );
  }

  const progressRacerIds = new Set(racers.map((racer) => racer.racerId));
  const progressSlotIndexes = new Set(racers.map((racer) => racer.slotIndex));

  for (const transform of racerTransforms) {
    if (!progressRacerIds.has(transform.racerId)) {
      throw new KartRaceStateSnapshotError(
        `Race-state transform has no matching race progress: ${transform.racerId}.`
      );
    }

    if (!progressSlotIndexes.has(transform.slotIndex)) {
      throw new KartRaceStateSnapshotError(
        `Race-state transform has no matching racer slot: ${transform.slotIndex}.`
      );
    }
  }
}

function requireOptionalSnapshotArrayField(
  record: Readonly<Record<string, unknown>>,
  key: string
): readonly unknown[] {
  const value = record[key];

  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new KartRaceStateSnapshotError(
      `Race-state snapshot field must be an array: ${key}.`
    );
  }

  return value;
}

function requireStringField(
  record: Readonly<Record<string, unknown>>,
  key: string
): string {
  const value = record[key];

  if (typeof value !== "string") {
    throw new KartRaceStateSnapshotError(
      `Race-state snapshot field must be a string: ${key}.`
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
    throw new KartRaceStateSnapshotError(
      `Race-state snapshot field must be a number: ${key}.`
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
    throw new KartRaceStateSnapshotError(
      `Race-state snapshot field must be a number or null: ${key}.`
    );
  }

  return value;
}

function requireRacePhase(value: string, key: string): RacePhase {
  if (
    value !== "setup" &&
    value !== "countdown" &&
    value !== "running" &&
    value !== "final-lap" &&
    value !== "finished"
  ) {
    throw new KartRaceStateSnapshotError(
      `Race-state snapshot field must be a known phase: ${key}.`
    );
  }

  return value;
}

function requireRacerController(
  value: string,
  key: string
): RaceProgressSnapshot["controller"] {
  if (value !== "human" && value !== "ai") {
    throw new KartRaceStateSnapshotError(
      `Race-state snapshot field must be a known racer controller: ${key}.`
    );
  }

  return value;
}

function requireNonEmptyText(value: string, key: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new KartRaceStateSnapshotError(
      `Race-state snapshot field must be non-empty: ${key}.`
    );
  }

  return normalized;
}

function requireWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new KartRaceStateSnapshotError(
      `Race-state snapshot field must be a non-negative whole number: ${key}.`
    );
  }

  return value;
}

function requirePositiveWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new KartRaceStateSnapshotError(
      `Race-state snapshot field must be a positive whole number: ${key}.`
    );
  }

  return value;
}

function requireFiniteNonNegativeNumber(value: number, key: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new KartRaceStateSnapshotError(
      `Race-state snapshot field must be a finite non-negative number: ${key}.`
    );
  }

  return value;
}

function normalizeNullableWholeNumber(value: number | null, key: string): number | null {
  return value === null ? null : requireWholeNumber(value, key);
}

function normalizeNullableFiniteNonNegativeNumber(
  value: number | null,
  key: string
): number | null {
  return value === null ? null : requireFiniteNonNegativeNumber(value, key);
}

function requireRatio(value: number, key: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new KartRaceStateSnapshotError(
      `Race-state snapshot field must be a ratio from 0 to 1: ${key}.`
    );
  }

  return value;
}

function requireBoolean(value: unknown, key: string): boolean {
  if (typeof value !== "boolean") {
    throw new KartRaceStateSnapshotError(
      `Race-state snapshot field must be a boolean: ${key}.`
    );
  }

  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareReceivedSnapshotsByElapsedSeconds(
  left: ReceivedKartRaceStateSnapshot,
  right: ReceivedKartRaceStateSnapshot
): number {
  if (left.snapshot.elapsedSeconds !== right.snapshot.elapsedSeconds) {
    return left.snapshot.elapsedSeconds - right.snapshot.elapsedSeconds;
  }

  return left.snapshot.sequence - right.snapshot.sequence;
}

function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
