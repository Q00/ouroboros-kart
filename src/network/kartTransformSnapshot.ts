import type { Vector3 } from "../config/aiRacers";
import {
  queryTrackSurfaceAtPoint,
  type TrackRoadGeometry
} from "../config/tracks";
import { COMBAT_ITEM_REGISTRY } from "../race/raceSession";
import type {
  ActiveRaceItemState,
  RaceBananaHitEvent,
  CombatItemType,
  RaceBoostActivationEvent,
  RaceItemHitEffectData,
  RaceItemPickupCollectionEvent,
  RaceItemPickupState,
  RaceShellHitEvent,
  RaceSessionRacerState
} from "../race/raceSession";
import {
  applyRacerItemHitEffect,
  createInitialRacerItemEffectState,
  updateRacerItemEffectTimers
} from "../race/racerItemEffects";
import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  KART_GAMEPLAY_PROTOCOL,
  KART_GAMEPLAY_VERSION
} from "./kartInputSnapshot";

export const MAX_TRANSFORM_SNAPSHOT_BUFFERED_BYTES = 8 * 1024;
export const MAX_TRANSFORM_SNAPSHOT_PAYLOAD_BYTES = 6 * 1024;
export const MAX_REMOTE_TRANSFORM_SNAPSHOT_BUFFER_SIZE = 18;
export const REMOTE_TRANSFORM_INTERPOLATION_DELAY_SECONDS = 0.1;
export const REMOTE_TRANSFORM_RENDER_DELAY_SECONDS =
  REMOTE_TRANSFORM_INTERPOLATION_DELAY_SECONDS;
export const REMOTE_TRANSFORM_MAX_EXTRAPOLATION_SECONDS = 0.12;
export const REMOTE_TRANSFORM_STALE_FALLBACK_SECONDS = 0.35;
const REMOTE_ITEM_HIT_EVENT_RETENTION_SECONDS = Math.max(
  COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.ttlSeconds,
  COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.ttlSeconds
);

export interface KartRacerTransform {
  readonly racerId: string;
  readonly slotIndex: number;
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly forward: Vector3;
  readonly headingRadians: number;
  readonly speed: number;
  readonly heldItem: CombatItemType | null;
  readonly boostSeconds: number;
  readonly shieldSeconds: number;
  readonly stunSeconds: number;
  readonly spinoutSeconds: number;
  readonly spinoutAngularVelocity: number;
  readonly itemHitImmunitySeconds: number;
  readonly hitFeedbackSeconds: number;
  readonly lastHitItemType: Exclude<CombatItemType, "boost"> | null;
  readonly itemUseCooldownSeconds: number;
  readonly updateCount: number;
}

export interface KartItemPickupSnapshot {
  readonly pickupId: string;
  readonly itemType: CombatItemType;
  readonly cooldownSeconds: number;
  readonly active?: boolean;
  readonly respawnDeadlineElapsedSeconds?: number | null;
}

export interface KartItemPickupCollectionSnapshot {
  readonly eventId: string;
  readonly pickupId: string;
  readonly racerId: string;
  readonly itemType: CombatItemType;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly cooldownSeconds: number;
  readonly respawnDeadlineElapsedSeconds: number;
}

export interface KartBoostActivationSnapshot {
  readonly eventId: string;
  readonly racerId: string;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly durationSeconds: number;
  readonly expiresAtElapsedSeconds: number;
  readonly cooldownSeconds: number;
}

export interface KartShellHitSnapshot {
  readonly eventId: string;
  readonly itemType: "shell";
  readonly shellId: string;
  readonly sourceRacerId: string;
  readonly sourceSlotIndex: number;
  readonly targetRacerId: string;
  readonly targetSlotIndex: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly impact: {
    readonly position: Vector3;
    readonly normal: Vector3;
    readonly shellPosition: Vector3;
    readonly shellVelocity: Vector3;
    readonly shellRadius: number;
    readonly targetHitboxCenter: Vector3;
    readonly penetrationDepth: number;
    readonly relativeSpeed: number;
  };
  readonly effect: RaceItemHitEffectData;
}

export interface KartBananaHitSnapshot {
  readonly eventId: string;
  readonly itemType: "banana";
  readonly bananaId: string;
  readonly sourceRacerId: string;
  readonly sourceSlotIndex: number;
  readonly targetRacerId: string;
  readonly targetSlotIndex: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly impact: KartShellHitSnapshot["impact"];
  readonly effect: RaceItemHitEffectData;
}

type KartItemHitSnapshot = KartShellHitSnapshot | KartBananaHitSnapshot;

export type KartActiveItemType = Exclude<CombatItemType, "boost">;

export interface KartActiveItemSnapshot {
  readonly itemId: string;
  readonly networkId: string;
  readonly type: KartActiveItemType;
  readonly ownerId: string;
  readonly ownerRacerId: string;
  readonly ownerSlotIndex: number | null;
  readonly activeState: "active";
  readonly removed: false;
  readonly initialPosition: Vector3;
  readonly position: Vector3;
  readonly direction: Vector3;
  readonly velocity: Vector3;
  readonly lifetimeSeconds: number;
  readonly radius: number;
  readonly armedSeconds: number;
  readonly ttlSeconds: number;
  readonly ageSeconds: number;
  readonly orientationRadians: number | null;
}

export interface KartTransformSnapshot {
  readonly protocol: typeof KART_GAMEPLAY_PROTOCOL;
  readonly version: typeof KART_GAMEPLAY_VERSION;
  readonly type: typeof KART_GAMEPLAY_MESSAGE_TYPES.TRANSFORM_SNAPSHOT;
  readonly hostPeerId: string;
  readonly sequence: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly capturedAt: number;
  readonly racers: readonly KartRacerTransform[];
  readonly itemPickups: readonly KartItemPickupSnapshot[];
  readonly itemPickupCollections: readonly KartItemPickupCollectionSnapshot[];
  readonly boostActivations: readonly KartBoostActivationSnapshot[];
  readonly shellHits: readonly KartShellHitSnapshot[];
  readonly bananaHits: readonly KartBananaHitSnapshot[];
  readonly activeItems: readonly KartActiveItemSnapshot[];
}

export interface KartTransformSnapshotCreateOptions {
  readonly hostPeerId: string;
  readonly sequence: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly capturedAt: number;
  readonly racers: readonly KartRacerTransform[];
  readonly itemPickups?: readonly KartItemPickupSnapshot[];
  readonly itemPickupCollections?: readonly KartItemPickupCollectionSnapshot[];
  readonly boostActivations?: readonly KartBoostActivationSnapshot[];
  readonly shellHits?: readonly KartShellHitSnapshot[];
  readonly bananaHits?: readonly KartBananaHitSnapshot[];
  readonly activeItems?: readonly KartActiveItemSnapshot[];
}

type KartActiveItemSnapshotInput = Omit<
  KartActiveItemSnapshot,
  | "networkId"
  | "ownerId"
  | "ownerSlotIndex"
  | "activeState"
  | "removed"
  | "initialPosition"
  | "direction"
  | "lifetimeSeconds"
> & {
  readonly networkId?: KartActiveItemSnapshot["networkId"] | undefined;
  readonly ownerId?: KartActiveItemSnapshot["ownerId"] | undefined;
  readonly ownerSlotIndex?: KartActiveItemSnapshot["ownerSlotIndex"] | undefined;
  readonly activeState?: KartActiveItemSnapshot["activeState"] | undefined;
  readonly removed?: KartActiveItemSnapshot["removed"] | undefined;
  readonly initialPosition?: KartActiveItemSnapshot["initialPosition"] | undefined;
  readonly direction?: KartActiveItemSnapshot["direction"] | undefined;
  readonly lifetimeSeconds?: KartActiveItemSnapshot["lifetimeSeconds"] | undefined;
};

export interface LocalKartTransformSnapshotEmitterOptions {
  readonly hostPeerId: string;
  readonly send: (payload: string, snapshot: KartTransformSnapshot) => boolean;
  readonly now?: () => number;
}

export interface LocalKartTransformSnapshotTick {
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
}

export interface RemoteKartTransformSmootherOptions {
  readonly expectedHostPeerId?: string;
  readonly renderDelaySeconds?: number;
  readonly interpolationDelaySeconds?: number;
  readonly maxExtrapolationSeconds?: number;
  readonly staleFallbackSeconds?: number;
  readonly maxBufferedSnapshots?: number;
  readonly maxPayloadBytes?: number;
  readonly courseConstraint?: RemoteKartTransformCourseConstraint | null;
  readonly now?: () => number;
}

export interface RemoteKartTransformCourseConstraint {
  readonly road: TrackRoadGeometry;
  readonly racerRadius: number;
}

export interface SmoothedKartTransform {
  readonly racerId: string;
  readonly slotIndex: number;
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly forward: Vector3;
  readonly headingRadians: number;
  readonly speed: number;
  readonly heldItem: CombatItemType | null;
  readonly boostSeconds: number;
  readonly shieldSeconds: number;
  readonly stunSeconds: number;
  readonly spinoutSeconds: number;
  readonly spinoutAngularVelocity: number;
  readonly itemHitImmunitySeconds: number;
  readonly hitFeedbackSeconds: number;
  readonly lastHitItemType: Exclude<CombatItemType, "boost"> | null;
  readonly itemUseCooldownSeconds: number;
  readonly updateCount: number;
  readonly interpolated: boolean;
  readonly extrapolated: boolean;
  readonly stale: boolean;
}

export type RemoteKartTransformSnapshotRejectionReason =
  | "non-string-payload"
  | "payload-too-large"
  | "invalid-payload"
  | "unexpected-host"
  | "duplicate-sequence"
  | "stale-sequence";

export type RemoteKartTransformSnapshotAcceptResult =
  | {
      readonly accepted: true;
      readonly snapshot: KartTransformSnapshot;
      readonly bufferedCount: number;
      readonly droppedSnapshots: readonly KartTransformSnapshot[];
    }
  | {
      readonly accepted: false;
      readonly reason: RemoteKartTransformSnapshotRejectionReason;
      readonly message: string;
      readonly bufferedCount: number;
      readonly rejectedCount: number;
    };

interface ReceivedKartTransformSnapshot {
  readonly snapshot: KartTransformSnapshot;
  readonly receivedAt: number;
}

const COMBAT_ITEM_TYPES = [
  "boost",
  "shell",
  "banana"
] as const satisfies readonly CombatItemType[];

export class KartTransformSnapshotError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "KartTransformSnapshotError";
  }
}

export class LocalKartTransformSnapshotEmitter {
  private readonly hostPeerId: string;
  private readonly send: (
    payload: string,
    snapshot: KartTransformSnapshot
  ) => boolean;
  private readonly now: () => number;
  private nextSequence = 0;

  public constructor(options: LocalKartTransformSnapshotEmitterOptions) {
    this.hostPeerId = requireNonEmptyText(options.hostPeerId, "hostPeerId");
    this.send = options.send;
    this.now = options.now ?? Date.now;
  }

  public emit(
    tick: LocalKartTransformSnapshotTick,
    racers: readonly RaceSessionRacerState[],
    itemPickups: readonly RaceItemPickupState[] = [],
    itemPickupCollections: readonly RaceItemPickupCollectionEvent[] = [],
    boostActivations: readonly RaceBoostActivationEvent[] = [],
    shellHits: readonly RaceShellHitEvent[] = [],
    bananaHits: readonly RaceBananaHitEvent[] = [],
    activeItems: readonly ActiveRaceItemState[] = []
  ): KartTransformSnapshot | null {
    const snapshot = createKartTransformSnapshot({
      hostPeerId: this.hostPeerId,
      sequence: this.nextSequence,
      tickIndex: tick.tickIndex,
      elapsedSeconds: tick.elapsedSeconds,
      capturedAt: this.now(),
      racers: racers.map(createKartRacerTransformFromRaceState),
      itemPickups: itemPickups.map(createKartItemPickupSnapshotFromRaceState),
      itemPickupCollections: itemPickupCollections.map(
        createKartItemPickupCollectionSnapshotFromRaceEvent
      ),
      boostActivations: boostActivations.map(
        createKartBoostActivationSnapshotFromRaceEvent
      ),
      shellHits: shellHits.map(createKartShellHitSnapshotFromRaceEvent),
      bananaHits: bananaHits.map(createKartBananaHitSnapshotFromRaceEvent),
      activeItems: activeItems.map(
        createKartActiveItemSnapshotFromRaceState
      )
    });
    const payload = serializeKartTransformSnapshot(snapshot);

    this.nextSequence += 1;

    if (!this.send(payload, snapshot)) {
      return null;
    }

    return snapshot;
  }
}

export class RemoteKartTransformSmoother {
  private readonly expectedHostPeerId: string | undefined;
  private readonly interpolationDelaySeconds: number;
  private readonly maxExtrapolationSeconds: number;
  private readonly staleFallbackSeconds: number;
  private readonly maxBufferedSnapshots: number;
  private readonly maxPayloadBytes: number;
  private readonly courseConstraint: RemoteKartTransformCourseConstraint | null;
  private readonly now: () => number;
  private readonly snapshots: ReceivedKartTransformSnapshot[] = [];
  private readonly boostActivationsById = new Map<
    string,
    KartBoostActivationSnapshot
  >();
  private readonly itemHitsById = new Map<string, KartItemHitSnapshot>();
  private lastDroppedSequence = -1;
  private rejectedSnapshots = 0;
  private droppedSnapshots = 0;

  public constructor(options: RemoteKartTransformSmootherOptions = {}) {
    this.expectedHostPeerId =
      options.expectedHostPeerId === undefined
        ? undefined
        : requireNonEmptyText(options.expectedHostPeerId, "expectedHostPeerId");
    this.interpolationDelaySeconds = requireFiniteNonNegativeNumber(
      options.renderDelaySeconds ??
        options.interpolationDelaySeconds ??
        REMOTE_TRANSFORM_RENDER_DELAY_SECONDS,
      options.renderDelaySeconds === undefined
        ? "interpolationDelaySeconds"
        : "renderDelaySeconds"
    );
    this.maxExtrapolationSeconds = requireFiniteNonNegativeNumber(
      options.maxExtrapolationSeconds ??
        REMOTE_TRANSFORM_MAX_EXTRAPOLATION_SECONDS,
      "maxExtrapolationSeconds"
    );
    this.staleFallbackSeconds = Math.max(
      this.maxExtrapolationSeconds,
      requireFiniteNonNegativeNumber(
        options.staleFallbackSeconds ??
          REMOTE_TRANSFORM_STALE_FALLBACK_SECONDS,
        "staleFallbackSeconds"
      )
    );
    this.maxBufferedSnapshots = requirePositiveWholeNumber(
      options.maxBufferedSnapshots ?? MAX_REMOTE_TRANSFORM_SNAPSHOT_BUFFER_SIZE,
      "maxBufferedSnapshots"
    );
    this.maxPayloadBytes = requirePositiveWholeNumber(
      options.maxPayloadBytes ?? MAX_TRANSFORM_SNAPSHOT_PAYLOAD_BYTES,
      "maxPayloadBytes"
    );
    this.courseConstraint =
      options.courseConstraint === undefined ||
      options.courseConstraint === null
        ? null
        : normalizeCourseConstraint(options.courseConstraint);
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

  public get renderDelaySeconds(): number {
    return this.interpolationDelaySeconds;
  }

  public get latestItemPickupCollections(): readonly KartItemPickupCollectionSnapshot[] {
    return this.snapshots[this.snapshots.length - 1]?.snapshot
      .itemPickupCollections ?? [];
  }

  public get latestBoostActivations(): readonly KartBoostActivationSnapshot[] {
    return [...this.boostActivationsById.values()].sort(
      compareBoostActivationsByElapsedSeconds
    );
  }

  public accept(
    payload: unknown,
    receivedAt: number = this.now()
  ): RemoteKartTransformSnapshotAcceptResult {
    if (typeof payload !== "string") {
      return this.reject(
        "non-string-payload",
        "Remote transform snapshot payload must be a string."
      );
    }

    if (getUtf8ByteLength(payload) > this.maxPayloadBytes) {
      return this.reject(
        "payload-too-large",
        "Remote transform snapshot payload exceeds the packet size limit."
      );
    }

    let snapshot: KartTransformSnapshot;

    try {
      snapshot = deserializeKartTransformSnapshot(payload);
    } catch (error) {
      return this.reject(
        "invalid-payload",
        getErrorMessage(error, "Remote transform snapshot payload is invalid.")
      );
    }

    if (
      this.expectedHostPeerId !== undefined &&
      snapshot.hostPeerId !== this.expectedHostPeerId
    ) {
      return this.reject(
        "unexpected-host",
        `Remote transform snapshot host mismatch: ${snapshot.hostPeerId}.`
      );
    }

    snapshot = constrainKartTransformSnapshot(snapshot, this.courseConstraint);

    if (snapshot.sequence <= this.lastDroppedSequence) {
      return this.reject(
        "stale-sequence",
        `Remote transform snapshot sequence ${snapshot.sequence} has already been dropped.`
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
        `Remote transform snapshot sequence ${snapshot.sequence} is already buffered.`
      );
    }

    const normalizedReceivedAt = requireFiniteNonNegativeNumber(
      receivedAt,
      "receivedAt"
    );
    this.snapshots.push({
      snapshot,
      receivedAt: normalizedReceivedAt
    });
    this.snapshots.sort(compareReceivedSnapshotsByElapsedSeconds);

    const droppedSnapshots = this.trimBufferedSnapshots();
    this.recordBoostActivations(snapshot.boostActivations);
    this.pruneBoostActivationCache(snapshot.elapsedSeconds);
    this.recordItemHits(snapshot.shellHits, snapshot.bananaHits);
    this.pruneItemHitCache(snapshot.elapsedSeconds);

    return {
      accepted: true,
      snapshot,
      bufferedCount: this.snapshots.length,
      droppedSnapshots
    };
  }

  public sample(
    now: number = this.now()
  ): ReadonlyMap<string, SmoothedKartTransform> {
    if (this.snapshots.length === 0) {
      return new Map();
    }

    const latestSnapshot = this.snapshots[this.snapshots.length - 1];

    if (latestSnapshot === undefined) {
      return new Map();
    }

    const sampleNow = requireFiniteNonNegativeNumber(now, "now");
    const targetElapsedSeconds = this.createPresentationTargetElapsedSeconds(
      sampleNow,
      latestSnapshot
    );
    const bracket = this.findSnapshotBracket(targetElapsedSeconds);

    if (bracket.next !== null && bracket.previous !== null) {
      return this.synchronizePresentationTransforms(
        interpolateSnapshotTransforms(
          bracket.previous.snapshot,
          bracket.next.snapshot,
          createInterpolationRatio(
            targetElapsedSeconds,
            bracket.previous.snapshot.elapsedSeconds,
            bracket.next.snapshot.elapsedSeconds
          )
        ),
        targetElapsedSeconds
      );
    }

    if (bracket.next !== null) {
      return this.synchronizePresentationTransforms(
        snapshotTransformsToMap(bracket.next.snapshot, false, false),
        targetElapsedSeconds
      );
    }

    if (bracket.previous !== null) {
      const extrapolationSeconds = Math.max(
        0,
        targetElapsedSeconds - bracket.previous.snapshot.elapsedSeconds
      );
      const cappedExtrapolationSeconds = Math.min(
        extrapolationSeconds,
        this.maxExtrapolationSeconds
      );
      const extrapolatedTransforms = extrapolateSnapshotTransforms(
        bracket.previous.snapshot,
        this.findPreviousSnapshot(bracket.previous.snapshot.sequence)?.snapshot ??
          null,
        cappedExtrapolationSeconds,
        extrapolationSeconds
      );
      const presentationTransforms =
        extrapolationSeconds > this.staleFallbackSeconds
          ? createStaleFallbackTransforms(extrapolatedTransforms)
          : extrapolatedTransforms;

      return this.synchronizePresentationTransforms(
        presentationTransforms,
        targetElapsedSeconds
      );
    }

    const firstSnapshot = this.snapshots[0];

    return firstSnapshot === undefined
      ? new Map()
      : this.synchronizePresentationTransforms(
          snapshotTransformsToMap(firstSnapshot.snapshot, false, false),
          targetElapsedSeconds
        );
  }

  public sampleItemPickups(
    now: number = this.now()
  ): readonly KartItemPickupSnapshot[] {
    const latestSnapshot = this.snapshots[this.snapshots.length - 1];

    if (latestSnapshot === undefined) {
      return [];
    }

    const elapsedSeconds =
      Math.max(
        0,
        requireFiniteNonNegativeNumber(now, "now") - latestSnapshot.receivedAt
      ) / 1000;

    return latestSnapshot.snapshot.itemPickups.map((pickup) => {
      const cooldownSeconds = decayTimerSeconds(
        pickup.cooldownSeconds,
        elapsedSeconds
      );
      const active = cooldownSeconds <= 0 ? true : pickup.active ?? false;
      const respawnDeadlineElapsedSeconds =
        cooldownSeconds <= 0
          ? null
          : pickup.respawnDeadlineElapsedSeconds ?? null;

      return {
        ...pickup,
        active,
        cooldownSeconds,
        respawnDeadlineElapsedSeconds
      };
    });
  }

  public sampleActiveItems(
    now: number = this.now()
  ): readonly KartActiveItemSnapshot[] {
    const latestSnapshot = this.snapshots[this.snapshots.length - 1];

    if (latestSnapshot === undefined) {
      return [];
    }

    const sampleNow = requireFiniteNonNegativeNumber(now, "now");
    const targetElapsedSeconds = this.createPresentationTargetElapsedSeconds(
      sampleNow,
      latestSnapshot
    );
    const sourceSnapshot =
      this.findActiveItemPresentationSnapshot(targetElapsedSeconds);

    if (sourceSnapshot === null) {
      return [];
    }

    const elapsedSeconds = Math.max(
      0,
      targetElapsedSeconds - sourceSnapshot.snapshot.elapsedSeconds
    );
    const extrapolationSeconds = Math.min(
      elapsedSeconds,
      this.maxExtrapolationSeconds
    );
    const itemHits = this.collectItemHits();

    return sourceSnapshot.snapshot.activeItems
      .filter(
        (item) =>
          !hasStartedItemHitForActiveItem(
            item,
            itemHits,
            targetElapsedSeconds
          )
      )
      .map((item) =>
        createKartActiveItemSnapshot({
          ...item,
          position: addVector(
            item.position,
            scaleVector(item.velocity, extrapolationSeconds)
          ),
          armedSeconds: decayTimerSeconds(
            item.armedSeconds,
            elapsedSeconds
          ),
          ttlSeconds:
            item.type === "banana"
              ? item.ttlSeconds
              : decayTimerSeconds(item.ttlSeconds, elapsedSeconds),
          ageSeconds: item.ageSeconds + elapsedSeconds
        })
      )
      .filter((item) => item.type === "banana" || item.ttlSeconds > 0);
  }

  public clear(): void {
    this.snapshots.length = 0;
    this.boostActivationsById.clear();
    this.itemHitsById.clear();
    this.lastDroppedSequence = -1;
    this.rejectedSnapshots = 0;
    this.droppedSnapshots = 0;
  }

  private createPresentationTargetElapsedSeconds(
    now: number,
    latestSnapshot: ReceivedKartTransformSnapshot
  ): number {
    return (
      latestSnapshot.snapshot.elapsedSeconds +
      Math.max(0, now - latestSnapshot.receivedAt) / 1000 -
      this.interpolationDelaySeconds
    );
  }

  private synchronizePresentationTransforms(
    transforms: ReadonlyMap<string, SmoothedKartTransform>,
    targetElapsedSeconds: number
  ): ReadonlyMap<string, SmoothedKartTransform> {
    return this.constrainSampledTransforms(
      applySynchronizedItemHitEvents(
        applySynchronizedBoostActivations(
          transforms,
          this.collectBoostActivations(),
          targetElapsedSeconds
        ),
        this.collectItemHits(),
        targetElapsedSeconds
      )
    );
  }

  private collectBoostActivations(): readonly KartBoostActivationSnapshot[] {
    return [...this.boostActivationsById.values()].sort(
      compareBoostActivationsByElapsedSeconds
    );
  }

  private collectItemHits(): readonly KartItemHitSnapshot[] {
    return [...this.itemHitsById.values()].sort(
      compareItemHitsByElapsedSeconds
    );
  }

  private recordBoostActivations(
    activations: readonly KartBoostActivationSnapshot[]
  ): void {
    for (const activation of activations) {
      this.boostActivationsById.set(activation.eventId, activation);
    }
  }

  private recordItemHits(
    shellHits: readonly KartShellHitSnapshot[],
    bananaHits: readonly KartBananaHitSnapshot[]
  ): void {
    for (const hit of shellHits) {
      this.itemHitsById.set(hit.eventId, hit);
    }

    for (const hit of bananaHits) {
      this.itemHitsById.set(hit.eventId, hit);
    }
  }

  private pruneBoostActivationCache(latestElapsedSeconds: number): void {
    const retentionSeconds =
      this.interpolationDelaySeconds + this.maxExtrapolationSeconds;

    for (const [eventId, activation] of this.boostActivationsById) {
      if (
        activation.expiresAtElapsedSeconds + retentionSeconds <
        latestElapsedSeconds
      ) {
        this.boostActivationsById.delete(eventId);
      }
    }
  }

  private pruneItemHitCache(latestElapsedSeconds: number): void {
    const retentionSeconds =
      REMOTE_ITEM_HIT_EVENT_RETENTION_SECONDS +
      this.interpolationDelaySeconds +
      this.maxExtrapolationSeconds;

    for (const [eventId, hit] of this.itemHitsById) {
      if (hit.elapsedSeconds + retentionSeconds < latestElapsedSeconds) {
        this.itemHitsById.delete(eventId);
      }
    }
  }

  private reject(
    reason: RemoteKartTransformSnapshotRejectionReason,
    message: string
  ): RemoteKartTransformSnapshotAcceptResult {
    this.rejectedSnapshots += 1;

    return {
      accepted: false,
      reason,
      message,
      bufferedCount: this.snapshots.length,
      rejectedCount: this.rejectedSnapshots
    };
  }

  private trimBufferedSnapshots(): readonly KartTransformSnapshot[] {
    const droppedSnapshots: KartTransformSnapshot[] = [];

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

  private findSnapshotBracket(targetElapsedSeconds: number): {
    readonly previous: ReceivedKartTransformSnapshot | null;
    readonly next: ReceivedKartTransformSnapshot | null;
  } {
    let previous: ReceivedKartTransformSnapshot | null = null;

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
  ): ReceivedKartTransformSnapshot | null {
    let previous: ReceivedKartTransformSnapshot | null = null;

    for (const snapshot of this.snapshots) {
      if (snapshot.snapshot.sequence >= sequence) {
        return previous;
      }

      previous = snapshot;
    }

    return previous;
  }

  private findActiveItemPresentationSnapshot(
    targetElapsedSeconds: number
  ): ReceivedKartTransformSnapshot | null {
    const bracket = this.findSnapshotBracket(targetElapsedSeconds);

    return bracket.previous ?? bracket.next;
  }

  private constrainSampledTransforms(
    transforms: ReadonlyMap<string, SmoothedKartTransform>
  ): ReadonlyMap<string, SmoothedKartTransform> {
    return constrainSmoothedTransformMap(transforms, this.courseConstraint);
  }
}

export function createKartRacerTransformFromRaceState(
  racer: RaceSessionRacerState
): KartRacerTransform {
  return createKartRacerTransform({
    racerId: racer.id,
    slotIndex: racer.slotIndex,
    position: racer.position,
    velocity: racer.velocity,
    forward: racer.forward,
    headingRadians: racer.headingRadians,
    speed: racer.speed,
    heldItem: racer.heldItem,
    boostSeconds: racer.boostSeconds,
    shieldSeconds: racer.shieldSeconds,
    stunSeconds: racer.stunSeconds,
    spinoutSeconds: racer.spinoutSeconds,
    spinoutAngularVelocity: racer.spinoutAngularVelocity,
    itemHitImmunitySeconds: racer.itemHitImmunitySeconds,
    hitFeedbackSeconds: racer.hitFeedbackSeconds,
    lastHitItemType: racer.lastHitItemType,
    itemUseCooldownSeconds: racer.itemUseCooldownSeconds,
    updateCount: racer.updateCount
  });
}

export function createKartItemPickupSnapshotFromRaceState(
  pickup: RaceItemPickupState
): KartItemPickupSnapshot {
  return createKartItemPickupSnapshot({
    pickupId: pickup.id,
    itemType: pickup.itemType,
    cooldownSeconds: pickup.cooldownSeconds,
    active: pickup.active,
    respawnDeadlineElapsedSeconds: pickup.respawnDeadlineElapsedSeconds
  });
}

export function createKartItemPickupCollectionSnapshotFromRaceEvent(
  event: RaceItemPickupCollectionEvent
): KartItemPickupCollectionSnapshot {
  return createKartItemPickupCollectionSnapshot({
    eventId: event.eventId,
    pickupId: event.pickupId,
    racerId: event.racerId,
    itemType: event.itemType,
    tickIndex: event.tickIndex,
    elapsedSeconds: event.elapsedSeconds,
    cooldownSeconds: event.cooldownSeconds,
    respawnDeadlineElapsedSeconds: event.respawnDeadlineElapsedSeconds
  });
}

export function createKartBoostActivationSnapshotFromRaceEvent(
  event: RaceBoostActivationEvent
): KartBoostActivationSnapshot {
  return createKartBoostActivationSnapshot({
    eventId: event.eventId,
    racerId: event.racerId,
    tickIndex: event.tickIndex,
    elapsedSeconds: event.elapsedSeconds,
    durationSeconds: event.durationSeconds,
    expiresAtElapsedSeconds: event.expiresAtElapsedSeconds,
    cooldownSeconds: event.cooldownSeconds
  });
}

export function createKartShellHitSnapshotFromRaceEvent(
  event: RaceShellHitEvent
): KartShellHitSnapshot {
  return createKartShellHitSnapshot({
    eventId: event.eventId,
    itemType: event.itemType,
    shellId: event.shellId,
    sourceRacerId: event.sourceRacerId,
    sourceSlotIndex: event.sourceSlotIndex,
    targetRacerId: event.targetRacerId,
    targetSlotIndex: event.targetSlotIndex,
    tickIndex: event.tickIndex,
    elapsedSeconds: event.elapsedSeconds,
    impact: event.impact,
    effect: event.effect
  });
}

export function createKartBananaHitSnapshotFromRaceEvent(
  event: RaceBananaHitEvent
): KartBananaHitSnapshot {
  return createKartBananaHitSnapshot({
    eventId: event.eventId,
    itemType: event.itemType,
    bananaId: event.bananaId,
    sourceRacerId: event.sourceRacerId,
    sourceSlotIndex: event.sourceSlotIndex,
    targetRacerId: event.targetRacerId,
    targetSlotIndex: event.targetSlotIndex,
    tickIndex: event.tickIndex,
    elapsedSeconds: event.elapsedSeconds,
    impact: event.impact,
    effect: event.effect
  });
}

export function createKartActiveItemSnapshotFromRaceState(
  item: ActiveRaceItemState
): KartActiveItemSnapshot {
  return createKartActiveItemSnapshot({
    itemId: item.id,
    networkId: item.networkId,
    type: item.type,
    ownerId: item.ownerId,
    ownerRacerId: item.ownerRacerId,
    ownerSlotIndex: item.owner.slotIndex,
    activeState: item.activeState,
    removed: item.removed,
    initialPosition: item.initialPosition,
    position: item.position,
    direction:
      item.type === "shell" ? item.direction : { x: 0, y: 0, z: 0 },
    velocity: item.velocity,
    lifetimeSeconds: item.lifetimeSeconds,
    radius: item.radius,
    armedSeconds: item.armedSeconds,
    ttlSeconds: item.ttlSeconds,
    ageSeconds: item.ageSeconds,
    orientationRadians:
      item.type === "banana" ? item.orientationRadians : null
  });
}

export function createKartTransformSnapshot(
  options: KartTransformSnapshotCreateOptions
): KartTransformSnapshot {
  const racers = options.racers.map(createKartRacerTransform);
  const itemPickups = (options.itemPickups ?? []).map(createKartItemPickupSnapshot);
  const itemPickupCollections = (options.itemPickupCollections ?? []).map(
    createKartItemPickupCollectionSnapshot
  );
  const boostActivations = (options.boostActivations ?? []).map(
    createKartBoostActivationSnapshot
  );
  const shellHits = (options.shellHits ?? []).map(createKartShellHitSnapshot);
  const bananaHits = (options.bananaHits ?? []).map(createKartBananaHitSnapshot);
  const activeItems = (options.activeItems ?? []).map(
    createKartActiveItemSnapshot
  );

  assertUniqueRacerIds(racers);
  assertUniquePickupCollectionEventIds(itemPickupCollections);
  assertUniqueBoostActivationEventIds(boostActivations);
  assertUniqueShellHitEventIds(shellHits);
  assertUniqueBananaHitEventIds(bananaHits);
  assertUniqueActiveItemIds(activeItems);

  return {
    protocol: KART_GAMEPLAY_PROTOCOL,
    version: KART_GAMEPLAY_VERSION,
    type: KART_GAMEPLAY_MESSAGE_TYPES.TRANSFORM_SNAPSHOT,
    hostPeerId: requireNonEmptyText(options.hostPeerId, "hostPeerId"),
    sequence: requireWholeNumber(options.sequence, "sequence"),
    tickIndex: requireWholeNumber(options.tickIndex, "tickIndex"),
    elapsedSeconds: requireFiniteNonNegativeNumber(
      options.elapsedSeconds,
      "elapsedSeconds"
    ),
    capturedAt: requireFiniteNonNegativeNumber(options.capturedAt, "capturedAt"),
    racers,
    itemPickups,
    itemPickupCollections,
    boostActivations,
    shellHits,
    bananaHits,
    activeItems
  };
}

export function serializeKartTransformSnapshot(
  snapshot: KartTransformSnapshot
): string {
  return JSON.stringify(createKartTransformSnapshot(snapshot));
}

export function deserializeKartTransformSnapshot(
  payload: unknown
): KartTransformSnapshot {
  if (typeof payload !== "string") {
    throw new KartTransformSnapshotError(
      "Transform snapshot payload must be a string."
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new KartTransformSnapshotError(
      "Transform snapshot payload is not valid JSON."
    );
  }

  if (!isRecord(parsed)) {
    throw new KartTransformSnapshotError(
      "Transform snapshot payload must be an object."
    );
  }

  if (parsed.protocol !== KART_GAMEPLAY_PROTOCOL) {
    throw new KartTransformSnapshotError(
      "Transform snapshot protocol mismatch."
    );
  }

  if (parsed.version !== KART_GAMEPLAY_VERSION) {
    throw new KartTransformSnapshotError("Transform snapshot version mismatch.");
  }

  if (parsed.type !== KART_GAMEPLAY_MESSAGE_TYPES.TRANSFORM_SNAPSHOT) {
    throw new KartTransformSnapshotError("Transform snapshot type mismatch.");
  }

  return createKartTransformSnapshot({
    hostPeerId: requireStringField(parsed, "hostPeerId"),
    sequence: requireNumberField(parsed, "sequence"),
    tickIndex: requireNumberField(parsed, "tickIndex"),
    elapsedSeconds: requireNumberField(parsed, "elapsedSeconds"),
    capturedAt: requireNumberField(parsed, "capturedAt"),
    racers: requireRacerTransformsField(parsed, "racers"),
    itemPickups: requireOptionalItemPickupSnapshotsField(parsed, "itemPickups"),
    itemPickupCollections: requireOptionalItemPickupCollectionSnapshotsField(
      parsed,
      "itemPickupCollections"
    ),
    boostActivations: requireOptionalBoostActivationSnapshotsField(
      parsed,
      "boostActivations"
    ),
    shellHits: requireOptionalShellHitSnapshotsField(parsed, "shellHits"),
    bananaHits: requireOptionalBananaHitSnapshotsField(parsed, "bananaHits"),
    activeItems: requireOptionalActiveItemSnapshotsField(
      parsed,
      "activeItems"
    )
  });
}

export function isKartTransformSnapshotPayload(
  payload: unknown
): payload is string {
  if (typeof payload !== "string") {
    return false;
  }

  try {
    deserializeKartTransformSnapshot(payload);
    return true;
  } catch {
    return false;
  }
}

export function createKartRacerTransform(
  transform: KartRacerTransform
): KartRacerTransform {
  return {
    racerId: requireNonEmptyText(transform.racerId, "racerId"),
    slotIndex: requireWholeNumber(transform.slotIndex, "slotIndex"),
    position: normalizeVector3(transform.position, "position"),
    velocity: normalizeVector3(transform.velocity, "velocity"),
    forward: normalizeVector3(transform.forward, "forward"),
    headingRadians: requireFiniteNumber(
      transform.headingRadians,
      "headingRadians"
    ),
    speed: requireFiniteNonNegativeNumber(transform.speed, "speed"),
    heldItem: normalizeCombatItem(transform.heldItem, "heldItem"),
    boostSeconds: requireFiniteNonNegativeNumber(
      transform.boostSeconds,
      "boostSeconds"
    ),
    shieldSeconds: requireFiniteNonNegativeNumber(
      transform.shieldSeconds,
      "shieldSeconds"
    ),
    stunSeconds: requireFiniteNonNegativeNumber(
      transform.stunSeconds,
      "stunSeconds"
    ),
    spinoutSeconds: requireFiniteNonNegativeNumber(
      transform.spinoutSeconds,
      "spinoutSeconds"
    ),
    spinoutAngularVelocity: requireFiniteNumber(
      transform.spinoutAngularVelocity,
      "spinoutAngularVelocity"
    ),
    itemHitImmunitySeconds: requireFiniteNonNegativeNumber(
      transform.itemHitImmunitySeconds,
      "itemHitImmunitySeconds"
    ),
    hitFeedbackSeconds: requireFiniteNonNegativeNumber(
      transform.hitFeedbackSeconds,
      "hitFeedbackSeconds"
    ),
    lastHitItemType: normalizeItemHitType(
      transform.lastHitItemType,
      "lastHitItemType"
    ),
    itemUseCooldownSeconds: requireFiniteNonNegativeNumber(
      transform.itemUseCooldownSeconds,
      "itemUseCooldownSeconds"
    ),
    updateCount: requireWholeNumber(transform.updateCount, "updateCount")
  };
}

function createKartItemPickupSnapshot(
  pickup: KartItemPickupSnapshot
): KartItemPickupSnapshot {
  const cooldownSeconds = requireFiniteNonNegativeNumber(
    pickup.cooldownSeconds,
    "cooldownSeconds"
  );
  const active = pickup.active ?? cooldownSeconds <= 0;
  const respawnDeadlineElapsedSeconds =
    active && cooldownSeconds <= 0
      ? null
      : requireOptionalNullableNumberField(
          pickup as unknown as Readonly<Record<string, unknown>>,
          "respawnDeadlineElapsedSeconds",
          null
        );

  return {
    pickupId: requireNonEmptyText(pickup.pickupId, "pickupId"),
    itemType: normalizeRequiredCombatItem(pickup.itemType, "itemType"),
    cooldownSeconds,
    active,
    respawnDeadlineElapsedSeconds
  };
}

function createKartItemPickupCollectionSnapshot(
  event: KartItemPickupCollectionSnapshot
): KartItemPickupCollectionSnapshot {
  const elapsedSeconds = requireFiniteNonNegativeNumber(
    event.elapsedSeconds,
    "elapsedSeconds"
  );
  const cooldownSeconds = requireFiniteNonNegativeNumber(
    event.cooldownSeconds,
    "cooldownSeconds"
  );
  const respawnDeadlineElapsedSeconds = requireFiniteNonNegativeNumber(
    event.respawnDeadlineElapsedSeconds,
    "respawnDeadlineElapsedSeconds"
  );

  return {
    eventId: requireNonEmptyText(event.eventId, "eventId"),
    pickupId: requireNonEmptyText(event.pickupId, "pickupId"),
    racerId: requireNonEmptyText(event.racerId, "racerId"),
    itemType: normalizeRequiredCombatItem(event.itemType, "itemType"),
    tickIndex: requireWholeNumber(event.tickIndex, "tickIndex"),
    elapsedSeconds,
    cooldownSeconds,
    respawnDeadlineElapsedSeconds
  };
}

function createKartBoostActivationSnapshot(
  event: KartBoostActivationSnapshot
): KartBoostActivationSnapshot {
  const elapsedSeconds = requireFiniteNonNegativeNumber(
    event.elapsedSeconds,
    "elapsedSeconds"
  );
  const expiresAtElapsedSeconds = requireFiniteNonNegativeNumber(
    event.expiresAtElapsedSeconds,
    "expiresAtElapsedSeconds"
  );

  if (expiresAtElapsedSeconds < elapsedSeconds) {
    throw new KartTransformSnapshotError(
      "Boost activation expiry cannot be earlier than activation elapsed time."
    );
  }

  return {
    eventId: requireNonEmptyText(event.eventId, "eventId"),
    racerId: requireNonEmptyText(event.racerId, "racerId"),
    tickIndex: requireWholeNumber(event.tickIndex, "tickIndex"),
    elapsedSeconds,
    durationSeconds: requireFiniteNonNegativeNumber(
      event.durationSeconds,
      "durationSeconds"
    ),
    expiresAtElapsedSeconds,
    cooldownSeconds: requireFiniteNonNegativeNumber(
      event.cooldownSeconds,
      "cooldownSeconds"
    )
  };
}

function createKartShellHitSnapshot(
  event: KartShellHitSnapshot
): KartShellHitSnapshot {
  return {
    eventId: requireNonEmptyText(event.eventId, "eventId"),
    itemType: requireShellItemType(event.itemType, "itemType"),
    shellId: requireNonEmptyText(event.shellId, "shellId"),
    sourceRacerId: requireNonEmptyText(event.sourceRacerId, "sourceRacerId"),
    sourceSlotIndex: requireWholeNumber(
      event.sourceSlotIndex,
      "sourceSlotIndex"
    ),
    targetRacerId: requireNonEmptyText(event.targetRacerId, "targetRacerId"),
    targetSlotIndex: requireWholeNumber(
      event.targetSlotIndex,
      "targetSlotIndex"
    ),
    tickIndex: requireWholeNumber(event.tickIndex, "tickIndex"),
    elapsedSeconds: requireFiniteNonNegativeNumber(
      event.elapsedSeconds,
      "elapsedSeconds"
    ),
    impact: createKartItemHitImpactSnapshot(event.impact),
    effect: createKartItemHitEffectSnapshot(event.effect, "shell")
  };
}

function createKartBananaHitSnapshot(
  event: KartBananaHitSnapshot
): KartBananaHitSnapshot {
  return {
    eventId: requireNonEmptyText(event.eventId, "eventId"),
    itemType: requireBananaItemType(event.itemType, "itemType"),
    bananaId: requireNonEmptyText(event.bananaId, "bananaId"),
    sourceRacerId: requireNonEmptyText(event.sourceRacerId, "sourceRacerId"),
    sourceSlotIndex: requireWholeNumber(
      event.sourceSlotIndex,
      "sourceSlotIndex"
    ),
    targetRacerId: requireNonEmptyText(event.targetRacerId, "targetRacerId"),
    targetSlotIndex: requireWholeNumber(
      event.targetSlotIndex,
      "targetSlotIndex"
    ),
    tickIndex: requireWholeNumber(event.tickIndex, "tickIndex"),
    elapsedSeconds: requireFiniteNonNegativeNumber(
      event.elapsedSeconds,
      "elapsedSeconds"
    ),
    impact: createKartItemHitImpactSnapshot(event.impact),
    effect: createKartItemHitEffectSnapshot(event.effect, "banana")
  };
}

function createKartItemHitImpactSnapshot(
  impact: KartShellHitSnapshot["impact"]
): KartShellHitSnapshot["impact"] {
  return {
    position: normalizeVector3(impact.position, "impact.position"),
    normal: normalizeVector3(impact.normal, "impact.normal"),
    shellPosition: normalizeVector3(
      impact.shellPosition,
      "impact.shellPosition"
    ),
    shellVelocity: normalizeVector3(
      impact.shellVelocity,
      "impact.shellVelocity"
    ),
    shellRadius: requireFiniteNonNegativeNumber(
      impact.shellRadius,
      "impact.shellRadius"
    ),
    targetHitboxCenter: normalizeVector3(
      impact.targetHitboxCenter,
      "impact.targetHitboxCenter"
    ),
    penetrationDepth: requireFiniteNonNegativeNumber(
      impact.penetrationDepth,
      "impact.penetrationDepth"
    ),
    relativeSpeed: requireFiniteNonNegativeNumber(
      impact.relativeSpeed,
      "impact.relativeSpeed"
    )
  };
}

function createKartItemHitEffectSnapshot(
  effect: RaceItemHitEffectData,
  expectedItemType: Exclude<CombatItemType, "boost">
): RaceItemHitEffectData {
  return {
    itemType: requireItemHitEffectType(
      effect.itemType,
      expectedItemType,
      "effect.itemType"
    ),
    stunSeconds: requireFiniteNonNegativeNumber(
      effect.stunSeconds,
      "effect.stunSeconds"
    ),
    spinoutSeconds: requireFiniteNonNegativeNumber(
      effect.spinoutSeconds,
      "effect.spinoutSeconds"
    ),
    spinoutAngularVelocity: requireFiniteNumber(
      effect.spinoutAngularVelocity,
      "effect.spinoutAngularVelocity"
    ),
    hitImmunitySeconds: requireFiniteNonNegativeNumber(
      effect.hitImmunitySeconds,
      "effect.hitImmunitySeconds"
    ),
    hitFeedbackSeconds: requireFiniteNonNegativeNumber(
      effect.hitFeedbackSeconds,
      "effect.hitFeedbackSeconds"
    ),
    speedFactor: requireFiniteNonNegativeNumber(
      effect.speedFactor,
      "effect.speedFactor"
    ),
    speedBeforeHit: requireFiniteNonNegativeNumber(
      effect.speedBeforeHit,
      "effect.speedBeforeHit"
    ),
    speedAfterHit: requireFiniteNonNegativeNumber(
      effect.speedAfterHit,
      "effect.speedAfterHit"
    ),
    headingDeltaRadians: requireFiniteNumber(
      effect.headingDeltaRadians,
      "effect.headingDeltaRadians"
    ),
    blockedByShield: effect.blockedByShield === true,
    shieldSecondsBeforeHit: requireFiniteNonNegativeNumber(
      effect.shieldSecondsBeforeHit ?? 0,
      "effect.shieldSecondsBeforeHit"
    ),
    shieldSecondsAfterHit: requireFiniteNonNegativeNumber(
      effect.shieldSecondsAfterHit ?? 0,
      "effect.shieldSecondsAfterHit"
    )
  };
}

function createKartActiveItemSnapshot(
  item: KartActiveItemSnapshotInput
): KartActiveItemSnapshot {
  const itemId = requireNonEmptyText(item.itemId, "itemId");
  const type = normalizeActiveItemType(item.type, "type");
  const ownerRacerId = requireNonEmptyText(item.ownerRacerId, "ownerRacerId");
  const position = normalizeVector3(item.position, "position");
  const velocity = normalizeVector3(item.velocity, "velocity");
  const ageSeconds = requireFiniteNonNegativeNumber(
    item.ageSeconds,
    "ageSeconds"
  );
  const ttlSeconds = requireFiniteNonNegativeNumber(
    item.ttlSeconds,
    "ttlSeconds"
  );
  const direction =
    item.direction === undefined
      ? createDefaultActiveItemDirection(type, velocity)
      : normalizeVector3(item.direction, "direction");

  if (item.activeState !== undefined && item.activeState !== "active") {
    throw new KartTransformSnapshotError(
      "Transform active item snapshot activeState must be active."
    );
  }

  if (item.removed !== undefined && item.removed !== false) {
    throw new KartTransformSnapshotError(
      "Transform active item snapshot removed flag must be false."
    );
  }

  return {
    itemId,
    networkId:
      item.networkId === undefined
        ? itemId
        : requireNonEmptyText(item.networkId, "networkId"),
    type,
    ownerId:
      item.ownerId === undefined
        ? ownerRacerId
        : requireNonEmptyText(item.ownerId, "ownerId"),
    ownerRacerId,
    ownerSlotIndex:
      item.ownerSlotIndex === undefined || item.ownerSlotIndex === null
        ? null
        : requireWholeNumber(item.ownerSlotIndex, "ownerSlotIndex"),
    activeState: "active",
    removed: false,
    initialPosition:
      item.initialPosition === undefined
        ? estimateActiveItemInitialPosition(position, velocity, ageSeconds)
        : normalizeVector3(item.initialPosition, "initialPosition"),
    position,
    direction,
    velocity,
    lifetimeSeconds: requireFiniteNonNegativeNumber(
      item.lifetimeSeconds ?? ageSeconds + ttlSeconds,
      "lifetimeSeconds"
    ),
    radius: requireFiniteNonNegativeNumber(item.radius, "radius"),
    armedSeconds: requireFiniteNonNegativeNumber(
      item.armedSeconds,
      "armedSeconds"
    ),
    ttlSeconds,
    ageSeconds,
    orientationRadians:
      item.orientationRadians === null
        ? null
        : requireFiniteNumber(
            item.orientationRadians,
            "orientationRadians"
          )
  };
}

function requireRacerTransformsField(
  record: Readonly<Record<string, unknown>>,
  key: string
): readonly KartRacerTransform[] {
  const value = record[key];

  if (!Array.isArray(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be an array: ${key}.`
    );
  }

  return value.map((entry) => requireRacerTransform(entry, key));
}

function requireOptionalItemPickupSnapshotsField(
  record: Readonly<Record<string, unknown>>,
  key: string
): readonly KartItemPickupSnapshot[] {
  const value = record[key];

  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be an array: ${key}.`
    );
  }

  return value.map((entry) => requireItemPickupSnapshot(entry, key));
}

function requireOptionalItemPickupCollectionSnapshotsField(
  record: Readonly<Record<string, unknown>>,
  key: string
): readonly KartItemPickupCollectionSnapshot[] {
  const value = record[key];

  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be an array: ${key}.`
    );
  }

  return value.map((entry) => requireItemPickupCollectionSnapshot(entry, key));
}

function requireOptionalBoostActivationSnapshotsField(
  record: Readonly<Record<string, unknown>>,
  key: string
): readonly KartBoostActivationSnapshot[] {
  const value = record[key];

  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be an array: ${key}.`
    );
  }

  return value.map((entry) => requireBoostActivationSnapshot(entry, key));
}

function requireOptionalShellHitSnapshotsField(
  record: Readonly<Record<string, unknown>>,
  key: string
): readonly KartShellHitSnapshot[] {
  const value = record[key];

  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be an array: ${key}.`
    );
  }

  return value.map((entry) => requireShellHitSnapshot(entry, key));
}

function requireOptionalBananaHitSnapshotsField(
  record: Readonly<Record<string, unknown>>,
  key: string
): readonly KartBananaHitSnapshot[] {
  const value = record[key];

  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be an array: ${key}.`
    );
  }

  return value.map((entry) => requireBananaHitSnapshot(entry, key));
}

function requireOptionalActiveItemSnapshotsField(
  record: Readonly<Record<string, unknown>>,
  key: string
): readonly KartActiveItemSnapshot[] {
  const value = record[key];

  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be an array: ${key}.`
    );
  }

  return value.map((entry) => requireActiveItemSnapshot(entry, key));
}

function requireRacerTransform(
  value: unknown,
  key: string
): KartRacerTransform {
  if (!isRecord(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot array entry must be an object: ${key}.`
    );
  }

  return createKartRacerTransform({
    racerId: requireStringField(value, "racerId"),
    slotIndex: requireNumberField(value, "slotIndex"),
    position: requireVector3Field(value, "position"),
    velocity: requireVector3Field(value, "velocity"),
    forward: requireVector3Field(value, "forward"),
    headingRadians: requireNumberField(value, "headingRadians"),
    speed: requireNumberField(value, "speed"),
    heldItem: requireCombatItemField(value, "heldItem"),
    boostSeconds: requireNumberField(value, "boostSeconds"),
    shieldSeconds: requireOptionalNumberField(value, "shieldSeconds", 0),
    stunSeconds: requireNumberField(value, "stunSeconds"),
    spinoutSeconds: requireNumberField(value, "spinoutSeconds"),
    spinoutAngularVelocity: requireNumberField(
      value,
      "spinoutAngularVelocity"
    ),
    itemHitImmunitySeconds: requireNumberField(
      value,
      "itemHitImmunitySeconds"
    ),
    hitFeedbackSeconds: requireNumberField(value, "hitFeedbackSeconds"),
    lastHitItemType: requireItemHitTypeField(value, "lastHitItemType"),
    itemUseCooldownSeconds: requireNumberField(
      value,
      "itemUseCooldownSeconds"
    ),
    updateCount: requireNumberField(value, "updateCount")
  });
}

function requireItemPickupSnapshot(
  value: unknown,
  key: string
): KartItemPickupSnapshot {
  if (!isRecord(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot array entry must be an object: ${key}.`
    );
  }

  return createKartItemPickupSnapshot({
    pickupId: requireStringField(value, "pickupId"),
    itemType: requireCombatItemTypeField(value, "itemType"),
    cooldownSeconds: requireNumberField(value, "cooldownSeconds"),
    active: requireOptionalBooleanField(
      value,
      "active",
      requireNumberField(value, "cooldownSeconds") <= 0
    ),
    respawnDeadlineElapsedSeconds: requireOptionalNullableNumberField(
      value,
      "respawnDeadlineElapsedSeconds",
      null
    )
  });
}

function requireItemPickupCollectionSnapshot(
  value: unknown,
  key: string
): KartItemPickupCollectionSnapshot {
  if (!isRecord(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot array entry must be an object: ${key}.`
    );
  }

  const elapsedSeconds = requireNumberField(value, "elapsedSeconds");
  const cooldownSeconds = requireNumberField(value, "cooldownSeconds");

  return createKartItemPickupCollectionSnapshot({
    eventId: requireStringField(value, "eventId"),
    pickupId: requireStringField(value, "pickupId"),
    racerId: requireStringField(value, "racerId"),
    itemType: requireCombatItemTypeField(value, "itemType"),
    tickIndex: requireNumberField(value, "tickIndex"),
    elapsedSeconds,
    cooldownSeconds,
    respawnDeadlineElapsedSeconds: requireOptionalNumberField(
      value,
      "respawnDeadlineElapsedSeconds",
      elapsedSeconds + cooldownSeconds
    )
  });
}

function requireBoostActivationSnapshot(
  value: unknown,
  key: string
): KartBoostActivationSnapshot {
  if (!isRecord(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot array entry must be an object: ${key}.`
    );
  }

  return createKartBoostActivationSnapshot({
    eventId: requireStringField(value, "eventId"),
    racerId: requireStringField(value, "racerId"),
    tickIndex: requireNumberField(value, "tickIndex"),
    elapsedSeconds: requireNumberField(value, "elapsedSeconds"),
    durationSeconds: requireNumberField(value, "durationSeconds"),
    expiresAtElapsedSeconds: requireNumberField(
      value,
      "expiresAtElapsedSeconds"
    ),
    cooldownSeconds: requireNumberField(value, "cooldownSeconds")
  });
}

function requireShellHitSnapshot(
  value: unknown,
  key: string
): KartShellHitSnapshot {
  if (!isRecord(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot array entry must be an object: ${key}.`
    );
  }

  return createKartShellHitSnapshot({
    eventId: requireStringField(value, "eventId"),
    itemType: requireShellItemTypeField(value, "itemType"),
    shellId: requireStringField(value, "shellId"),
    sourceRacerId: requireStringField(value, "sourceRacerId"),
    sourceSlotIndex: requireNumberField(value, "sourceSlotIndex"),
    targetRacerId: requireStringField(value, "targetRacerId"),
    targetSlotIndex: requireNumberField(value, "targetSlotIndex"),
    tickIndex: requireNumberField(value, "tickIndex"),
    elapsedSeconds: requireNumberField(value, "elapsedSeconds"),
    impact: requireShellHitImpactField(value, "impact"),
    effect: requireShellHitEffectField(value, "effect")
  });
}

function requireBananaHitSnapshot(
  value: unknown,
  key: string
): KartBananaHitSnapshot {
  if (!isRecord(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot array entry must be an object: ${key}.`
    );
  }

  return createKartBananaHitSnapshot({
    eventId: requireStringField(value, "eventId"),
    itemType: requireBananaItemTypeField(value, "itemType"),
    bananaId: requireStringField(value, "bananaId"),
    sourceRacerId: requireStringField(value, "sourceRacerId"),
    sourceSlotIndex: requireNumberField(value, "sourceSlotIndex"),
    targetRacerId: requireStringField(value, "targetRacerId"),
    targetSlotIndex: requireNumberField(value, "targetSlotIndex"),
    tickIndex: requireNumberField(value, "tickIndex"),
    elapsedSeconds: requireNumberField(value, "elapsedSeconds"),
    impact: requireShellHitImpactField(value, "impact"),
    effect: requireBananaHitEffectField(value, "effect")
  });
}

function requireActiveItemSnapshot(
  value: unknown,
  key: string
): KartActiveItemSnapshot {
  if (!isRecord(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot array entry must be an object: ${key}.`
    );
  }

  return createKartActiveItemSnapshot({
    itemId: requireStringField(value, "itemId"),
    type: requireActiveItemTypeField(value, "type"),
    ownerRacerId: requireStringField(value, "ownerRacerId"),
    ownerSlotIndex: requireOptionalNullableNumberField(
      value,
      "ownerSlotIndex",
      null
    ),
    initialPosition: requireOptionalVector3Field(value, "initialPosition"),
    position: requireVector3Field(value, "position"),
    direction: requireOptionalVector3Field(value, "direction"),
    velocity: requireVector3Field(value, "velocity"),
    lifetimeSeconds: requireOptionalNumberField(
      value,
      "lifetimeSeconds",
      requireNumberField(value, "ttlSeconds") + requireNumberField(value, "ageSeconds")
    ),
    radius: requireNumberField(value, "radius"),
    armedSeconds: requireNumberField(value, "armedSeconds"),
    ttlSeconds: requireNumberField(value, "ttlSeconds"),
    ageSeconds: requireNumberField(value, "ageSeconds"),
    orientationRadians: requireNullableNumberField(value, "orientationRadians")
  });
}

function requireShellHitImpactField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartShellHitSnapshot["impact"] {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be a shell-hit impact object: ${key}.`
    );
  }

  return {
    position: requireVector3Field(value, "position"),
    normal: requireVector3Field(value, "normal"),
    shellPosition: requireVector3Field(value, "shellPosition"),
    shellVelocity: requireVector3Field(value, "shellVelocity"),
    shellRadius: requireNumberField(value, "shellRadius"),
    targetHitboxCenter: requireVector3Field(value, "targetHitboxCenter"),
    penetrationDepth: requireNumberField(value, "penetrationDepth"),
    relativeSpeed: requireNumberField(value, "relativeSpeed")
  };
}

function requireShellHitEffectField(
  record: Readonly<Record<string, unknown>>,
  key: string
): RaceItemHitEffectData {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be a shell-hit effect object: ${key}.`
    );
  }

  return createKartItemHitEffectSnapshot({
    itemType: requireShellItemTypeField(value, "itemType"),
    stunSeconds: requireNumberField(value, "stunSeconds"),
    spinoutSeconds: requireNumberField(value, "spinoutSeconds"),
    spinoutAngularVelocity: requireNumberField(
      value,
      "spinoutAngularVelocity"
    ),
    hitImmunitySeconds: requireNumberField(value, "hitImmunitySeconds"),
    hitFeedbackSeconds: requireNumberField(value, "hitFeedbackSeconds"),
    speedFactor: requireNumberField(value, "speedFactor"),
    speedBeforeHit: requireNumberField(value, "speedBeforeHit"),
    speedAfterHit: requireNumberField(value, "speedAfterHit"),
    headingDeltaRadians: requireNumberField(value, "headingDeltaRadians"),
    blockedByShield: requireOptionalBooleanField(
      value,
      "blockedByShield",
      false
    ),
    shieldSecondsBeforeHit: requireOptionalNumberField(
      value,
      "shieldSecondsBeforeHit",
      0
    ),
    shieldSecondsAfterHit: requireOptionalNumberField(
      value,
      "shieldSecondsAfterHit",
      0
    )
  }, "shell");
}

function requireBananaHitEffectField(
  record: Readonly<Record<string, unknown>>,
  key: string
): RaceItemHitEffectData {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be a banana-hit effect object: ${key}.`
    );
  }

  return createKartItemHitEffectSnapshot({
    itemType: requireBananaItemTypeField(value, "itemType"),
    stunSeconds: requireNumberField(value, "stunSeconds"),
    spinoutSeconds: requireNumberField(value, "spinoutSeconds"),
    spinoutAngularVelocity: requireNumberField(
      value,
      "spinoutAngularVelocity"
    ),
    hitImmunitySeconds: requireNumberField(value, "hitImmunitySeconds"),
    hitFeedbackSeconds: requireNumberField(value, "hitFeedbackSeconds"),
    speedFactor: requireNumberField(value, "speedFactor"),
    speedBeforeHit: requireNumberField(value, "speedBeforeHit"),
    speedAfterHit: requireNumberField(value, "speedAfterHit"),
    headingDeltaRadians: requireNumberField(value, "headingDeltaRadians"),
    blockedByShield: requireOptionalBooleanField(
      value,
      "blockedByShield",
      false
    ),
    shieldSecondsBeforeHit: requireOptionalNumberField(
      value,
      "shieldSecondsBeforeHit",
      0
    ),
    shieldSecondsAfterHit: requireOptionalNumberField(
      value,
      "shieldSecondsAfterHit",
      0
    )
  }, "banana");
}

function requireVector3Field(
  record: Readonly<Record<string, unknown>>,
  key: string
): Vector3 {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be a vector object: ${key}.`
    );
  }

  return {
    x: requireNumberField(value, "x"),
    y: requireNumberField(value, "y"),
    z: requireNumberField(value, "z")
  };
}

function requireOptionalVector3Field(
  record: Readonly<Record<string, unknown>>,
  key: string
): Vector3 | undefined {
  return record[key] === undefined ? undefined : requireVector3Field(record, key);
}

function normalizeVector3(vector: Vector3, key: string): Vector3 {
  return {
    x: requireFiniteNumber(vector.x, `${key}.x`),
    y: requireFiniteNumber(vector.y, `${key}.y`),
    z: requireFiniteNumber(vector.z, `${key}.z`)
  };
}

function createDefaultActiveItemDirection(
  itemType: KartActiveItemType,
  velocity: Vector3
): Vector3 {
  const speed = Math.hypot(velocity.x, velocity.z);

  if (speed > Number.EPSILON) {
    return {
      x: velocity.x / speed,
      y: 0,
      z: velocity.z / speed
    };
  }

  return itemType === "shell" ? { x: 0, y: 0, z: 1 } : { x: 0, y: 0, z: 0 };
}

function estimateActiveItemInitialPosition(
  position: Vector3,
  velocity: Vector3,
  ageSeconds: number
): Vector3 {
  return addVector(position, scaleVector(velocity, -Math.max(0, ageSeconds)));
}

function interpolateSnapshotTransforms(
  previous: KartTransformSnapshot,
  next: KartTransformSnapshot,
  ratio: number
): ReadonlyMap<string, SmoothedKartTransform> {
  const transforms = new Map<string, SmoothedKartTransform>();
  const nextTransforms = new Map(
    next.racers.map((transform) => [transform.racerId, transform])
  );

  for (const previousTransform of previous.racers) {
    const nextTransform = nextTransforms.get(previousTransform.racerId);

    if (nextTransform === undefined) {
      transforms.set(
        previousTransform.racerId,
        createSmoothedTransform(previousTransform, false, false)
      );
      continue;
    }

    transforms.set(previousTransform.racerId, {
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
      forward: forwardFromHeading(
        interpolateHeading(
          previousTransform.headingRadians,
          nextTransform.headingRadians,
          ratio
        )
      ),
      headingRadians: interpolateHeading(
        previousTransform.headingRadians,
        nextTransform.headingRadians,
        ratio
      ),
      speed: interpolateNumber(
        previousTransform.speed,
        nextTransform.speed,
        ratio
      ),
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
    });
  }

  for (const nextTransform of next.racers) {
    if (!transforms.has(nextTransform.racerId)) {
      transforms.set(
        nextTransform.racerId,
        createSmoothedTransform(nextTransform, false, false)
      );
    }
  }

  return transforms;
}

function extrapolateSnapshotTransforms(
  latest: KartTransformSnapshot,
  previous: KartTransformSnapshot | null,
  extrapolationSeconds: number,
  presentationSeconds: number
): ReadonlyMap<string, SmoothedKartTransform> {
  const transforms = new Map<string, SmoothedKartTransform>();
  const previousTransforms =
    previous === null
      ? new Map<string, KartRacerTransform>()
      : new Map(
          previous.racers.map((transform) => [transform.racerId, transform])
        );

  for (const latestTransform of latest.racers) {
    const previousTransform = previousTransforms.get(latestTransform.racerId);
    const previousElapsedSeconds =
      previous?.elapsedSeconds ?? latest.elapsedSeconds;
    const angularVelocity =
      previousTransform === undefined
        ? 0
        : calculateAngularVelocity(
            previousTransform.headingRadians,
            latestTransform.headingRadians,
            Math.max(
              latest.elapsedSeconds - previousElapsedSeconds,
              Number.EPSILON
            )
          );
    const headingRadians = normalizeAngle(
      latestTransform.headingRadians + angularVelocity * extrapolationSeconds
    );

    transforms.set(latestTransform.racerId, {
      ...createSmoothedTransform(
        latestTransform,
        false,
        extrapolationSeconds > 0,
        presentationSeconds
      ),
      position: addVector(
        latestTransform.position,
        scaleVector(latestTransform.velocity, extrapolationSeconds)
      ),
      forward: forwardFromHeading(headingRadians),
      headingRadians
    });
  }

  return transforms;
}

function snapshotTransformsToMap(
  snapshot: KartTransformSnapshot,
  interpolated: boolean,
  extrapolated: boolean
): ReadonlyMap<string, SmoothedKartTransform> {
  const transforms = new Map<string, SmoothedKartTransform>();

  for (const transform of snapshot.racers) {
    transforms.set(
      transform.racerId,
      createSmoothedTransform(transform, interpolated, extrapolated)
    );
  }

  return transforms;
}

function createSmoothedTransform(
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

function createStaleFallbackTransforms(
  transforms: ReadonlyMap<string, SmoothedKartTransform>
): ReadonlyMap<string, SmoothedKartTransform> {
  const staleTransforms = new Map<string, SmoothedKartTransform>();

  for (const [racerId, transform] of transforms) {
    staleTransforms.set(racerId, createStaleFallbackTransform(transform));
  }

  return staleTransforms;
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

function normalizeCourseConstraint(
  constraint: RemoteKartTransformCourseConstraint
): RemoteKartTransformCourseConstraint {
  if (
    constraint.road.closedLoop !== true ||
    constraint.road.centerline.length === 0
  ) {
    throw new KartTransformSnapshotError(
      "Remote transform course constraint requires closed-loop road geometry."
    );
  }

  return {
    road: constraint.road,
    racerRadius: requireFiniteNonNegativeNumber(
      constraint.racerRadius,
      "courseConstraint.racerRadius"
    )
  };
}

function constrainKartTransformSnapshot(
  snapshot: KartTransformSnapshot,
  constraint: RemoteKartTransformCourseConstraint | null
): KartTransformSnapshot {
  if (constraint === null) {
    return snapshot;
  }

  return createKartTransformSnapshot({
    ...snapshot,
    racers: snapshot.racers.map((transform) =>
      constrainKartRacerTransform(transform, constraint)
    )
  });
}

function constrainKartRacerTransform(
  transform: KartRacerTransform,
  constraint: RemoteKartTransformCourseConstraint
): KartRacerTransform {
  const position = constrainPositionToCourse(transform.position, constraint);

  return position === transform.position
    ? transform
    : {
        ...transform,
        position
      };
}

function constrainSmoothedTransformMap(
  transforms: ReadonlyMap<string, SmoothedKartTransform>,
  constraint: RemoteKartTransformCourseConstraint | null
): ReadonlyMap<string, SmoothedKartTransform> {
  if (constraint === null) {
    return transforms;
  }

  const constrainedTransforms = new Map<string, SmoothedKartTransform>();

  for (const [racerId, transform] of transforms) {
    const position = constrainPositionToCourse(transform.position, constraint);

    constrainedTransforms.set(
      racerId,
      position === transform.position
        ? transform
        : {
            ...transform,
            position
          }
    );
  }

  return constrainedTransforms;
}

function constrainPositionToCourse(
  position: Vector3,
  constraint: RemoteKartTransformCourseConstraint
): Vector3 {
  const surface = queryTrackSurfaceAtPoint(
    constraint.road,
    position,
    constraint.racerRadius
  );

  if (surface.withinCourseBoundary) {
    return position;
  }

  const maximumCenterlineDistance = Math.max(
    constraint.road.courseBoundary.courseHalfWidth - constraint.racerRadius,
    0
  );
  const correctionNormal = normalizePlanarOffset(
    position.x - surface.nearestPoint.x,
    position.z - surface.nearestPoint.z
  );

  return {
    x:
      surface.nearestPoint.x +
      correctionNormal.x * maximumCenterlineDistance,
    y: surface.nearestPoint.y,
    z:
      surface.nearestPoint.z +
      correctionNormal.z * maximumCenterlineDistance
  };
}

function normalizePlanarOffset(
  x: number,
  z: number
): { readonly x: number; readonly z: number } {
  const length = Math.hypot(x, z);

  if (length <= Number.EPSILON) {
    return { x: 0, z: 0 };
  }

  return {
    x: x / length,
    z: z / length
  };
}

function applySynchronizedBoostActivations(
  transforms: ReadonlyMap<string, SmoothedKartTransform>,
  activations: readonly KartBoostActivationSnapshot[],
  targetElapsedSeconds: number
): ReadonlyMap<string, SmoothedKartTransform> {
  if (activations.length === 0) {
    return transforms;
  }

  const synchronizedTransforms = new Map(transforms);

  for (const [racerId, transform] of transforms) {
    const latestActivation = findLatestStartedBoostActivation(
      activations,
      racerId,
      targetElapsedSeconds
    );

    if (latestActivation !== null) {
      const elapsedSinceActivation =
        targetElapsedSeconds - latestActivation.elapsedSeconds;
      const boostSeconds = Math.max(
        0,
        latestActivation.expiresAtElapsedSeconds - targetElapsedSeconds
      );
      const itemUseCooldownSeconds = decayTimerSeconds(
        latestActivation.cooldownSeconds,
        elapsedSinceActivation
      );

      synchronizedTransforms.set(racerId, {
        ...transform,
        heldItem: boostSeconds > 0 ? null : transform.heldItem,
        boostSeconds,
        itemUseCooldownSeconds: Math.max(
          transform.itemUseCooldownSeconds,
          itemUseCooldownSeconds
        )
      });
      continue;
    }

    if (hasFutureBoostActivation(activations, racerId, targetElapsedSeconds)) {
      synchronizedTransforms.set(racerId, {
        ...transform,
        boostSeconds: 0
      });
    }
  }

  return synchronizedTransforms;
}

function findLatestStartedBoostActivation(
  activations: readonly KartBoostActivationSnapshot[],
  racerId: string,
  targetElapsedSeconds: number
): KartBoostActivationSnapshot | null {
  let latestActivation: KartBoostActivationSnapshot | null = null;

  for (const activation of activations) {
    if (
      activation.racerId !== racerId ||
      activation.elapsedSeconds > targetElapsedSeconds
    ) {
      continue;
    }

    if (
      latestActivation === null ||
      activation.elapsedSeconds >= latestActivation.elapsedSeconds
    ) {
      latestActivation = activation;
    }
  }

  return latestActivation;
}

function hasFutureBoostActivation(
  activations: readonly KartBoostActivationSnapshot[],
  racerId: string,
  targetElapsedSeconds: number
): boolean {
  return activations.some(
    (activation) =>
      activation.racerId === racerId &&
      activation.elapsedSeconds > targetElapsedSeconds
  );
}

function applySynchronizedItemHitEvents(
  transforms: ReadonlyMap<string, SmoothedKartTransform>,
  hits: readonly KartItemHitSnapshot[],
  targetElapsedSeconds: number
): ReadonlyMap<string, SmoothedKartTransform> {
  if (hits.length === 0) {
    return transforms;
  }

  const synchronizedTransforms = new Map(transforms);

  for (const [racerId, transform] of transforms) {
    const racerHits = findItemHitsForRacer(
      hits,
      racerId
    );
    const startedHits = racerHits.filter(
      (hit) => hit.elapsedSeconds <= targetElapsedSeconds
    );

    if (startedHits.length > 0) {
      synchronizedTransforms.set(
        racerId,
        createSynchronizedItemHitTransform(
          transform,
          startedHits,
          targetElapsedSeconds
        )
      );
      continue;
    }

    if (racerHits.length > 0) {
      synchronizedTransforms.set(racerId, clearItemHitTransform(transform));
    }
  }

  return synchronizedTransforms;
}

function findItemHitsForRacer(
  hits: readonly KartItemHitSnapshot[],
  racerId: string
): readonly KartItemHitSnapshot[] {
  return hits.filter((hit) => hit.targetRacerId === racerId);
}

function createSynchronizedItemHitTransform(
  transform: SmoothedKartTransform,
  hits: readonly KartItemHitSnapshot[],
  targetElapsedSeconds: number
): SmoothedKartTransform {
  const state = createInitialRacerItemEffectState();
  let hasShieldBlock = false;
  let cursorElapsedSeconds = hits[0]?.elapsedSeconds ?? targetElapsedSeconds;

  for (const hit of hits) {
    updateRacerItemEffectTimers(
      state,
      Math.max(0, hit.elapsedSeconds - cursorElapsedSeconds)
    );

    if (hit.effect.blockedByShield === true) {
      hasShieldBlock = true;
      state.shieldSeconds = Math.max(
        state.shieldSeconds,
        hit.effect.shieldSecondsBeforeHit ?? 0
      );
    }

    applyRacerItemHitEffect(
      state,
      hit.effect,
      `${hit.itemType}:${getItemHitActiveItemId(hit)}`
    );
    cursorElapsedSeconds = hit.elapsedSeconds;
  }

  updateRacerItemEffectTimers(
    state,
    Math.max(0, targetElapsedSeconds - cursorElapsedSeconds)
  );

  return {
    ...transform,
    stunSeconds: state.stunSeconds,
    spinoutSeconds: state.spinoutSeconds,
    spinoutAngularVelocity: state.spinoutAngularVelocity,
    shieldSeconds: hasShieldBlock
      ? state.shieldSeconds
      : transform.shieldSeconds,
    itemHitImmunitySeconds: state.itemHitImmunitySeconds,
    hitFeedbackSeconds: state.hitFeedbackSeconds,
    lastHitItemType: state.lastHitItemType
  };
}

function clearItemHitTransform(
  transform: SmoothedKartTransform
): SmoothedKartTransform {
  if (
    transform.stunSeconds <= 0 &&
    transform.spinoutSeconds <= 0 &&
    transform.itemHitImmunitySeconds <= 0 &&
    transform.hitFeedbackSeconds <= 0 &&
    transform.lastHitItemType === null
  ) {
    return transform;
  }

  return {
    ...transform,
    stunSeconds: 0,
    spinoutSeconds: 0,
    spinoutAngularVelocity: 0,
    itemHitImmunitySeconds: 0,
    hitFeedbackSeconds: 0,
    lastHitItemType: null
  };
}

function hasStartedItemHitForActiveItem(
  item: KartActiveItemSnapshot,
  hits: readonly KartItemHitSnapshot[],
  targetElapsedSeconds: number
): boolean {
  return hits.some(
    (hit) =>
      hit.elapsedSeconds <= targetElapsedSeconds &&
      getItemHitActiveItemId(hit) === item.itemId
  );
}

function getItemHitActiveItemId(hit: KartItemHitSnapshot): string {
  return hit.itemType === "shell" ? hit.shellId : hit.bananaId;
}

function createInterpolationRatio(
  target: number,
  previous: number,
  next: number
): number {
  if (next <= previous) {
    return 0;
  }

  return clamp((target - previous) / (next - previous), 0, 1);
}

function interpolateVector(
  previous: Vector3,
  next: Vector3,
  ratio: number
): Vector3 {
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

function forwardFromHeading(headingRadians: number): Vector3 {
  return {
    x: Math.sin(headingRadians),
    y: 0,
    z: Math.cos(headingRadians)
  };
}

function addVector(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z
  };
}

function scaleVector(vector: Vector3, scale: number): Vector3 {
  return {
    x: vector.x * scale,
    y: vector.y * scale,
    z: vector.z * scale
  };
}

function compareReceivedSnapshotsByElapsedSeconds(
  left: ReceivedKartTransformSnapshot,
  right: ReceivedKartTransformSnapshot
): number {
  return (
    left.snapshot.elapsedSeconds - right.snapshot.elapsedSeconds ||
    left.snapshot.sequence - right.snapshot.sequence
  );
}

function compareBoostActivationsByElapsedSeconds(
  left: KartBoostActivationSnapshot,
  right: KartBoostActivationSnapshot
): number {
  return (
    left.elapsedSeconds - right.elapsedSeconds ||
    left.tickIndex - right.tickIndex ||
    left.eventId.localeCompare(right.eventId)
  );
}

function compareItemHitsByElapsedSeconds(
  left: KartItemHitSnapshot,
  right: KartItemHitSnapshot
): number {
  return (
    left.elapsedSeconds - right.elapsedSeconds ||
    left.tickIndex - right.tickIndex ||
    left.eventId.localeCompare(right.eventId)
  );
}

function assertUniqueRacerIds(racers: readonly KartRacerTransform[]): void {
  const racerIds = new Set<string>();

  for (const racer of racers) {
    if (racerIds.has(racer.racerId)) {
      throw new KartTransformSnapshotError(
        `Transform snapshot has duplicate racer id: ${racer.racerId}.`
      );
    }

    racerIds.add(racer.racerId);
  }
}

function assertUniquePickupCollectionEventIds(
  events: readonly KartItemPickupCollectionSnapshot[]
): void {
  const eventIds = new Set<string>();

  for (const event of events) {
    if (eventIds.has(event.eventId)) {
      throw new KartTransformSnapshotError(
        `Transform snapshot has duplicate pickup collection event id: ${event.eventId}.`
      );
    }

    eventIds.add(event.eventId);
  }
}

function assertUniqueBoostActivationEventIds(
  events: readonly KartBoostActivationSnapshot[]
): void {
  const eventIds = new Set<string>();

  for (const event of events) {
    if (eventIds.has(event.eventId)) {
      throw new KartTransformSnapshotError(
        `Transform snapshot has duplicate boost activation event id: ${event.eventId}.`
      );
    }

    eventIds.add(event.eventId);
  }
}

function assertUniqueShellHitEventIds(
  events: readonly KartShellHitSnapshot[]
): void {
  const eventIds = new Set<string>();

  for (const event of events) {
    if (eventIds.has(event.eventId)) {
      throw new KartTransformSnapshotError(
        `Transform snapshot has duplicate shell-hit event id: ${event.eventId}.`
      );
    }

    eventIds.add(event.eventId);
  }
}

function assertUniqueBananaHitEventIds(
  events: readonly KartBananaHitSnapshot[]
): void {
  const eventIds = new Set<string>();

  for (const event of events) {
    if (eventIds.has(event.eventId)) {
      throw new KartTransformSnapshotError(
        `Transform snapshot has duplicate banana-hit event id: ${event.eventId}.`
      );
    }

    eventIds.add(event.eventId);
  }
}

function assertUniqueActiveItemIds(
  items: readonly KartActiveItemSnapshot[]
): void {
  const itemIds = new Set<string>();

  for (const item of items) {
    if (itemIds.has(item.itemId)) {
      throw new KartTransformSnapshotError(
        `Transform snapshot has duplicate active item id: ${item.itemId}.`
      );
    }

    itemIds.add(item.itemId);
  }
}

function requireStringField(
  record: Readonly<Record<string, unknown>>,
  key: string
): string {
  const value = record[key];

  if (typeof value !== "string") {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be a string: ${key}.`
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
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be a number: ${key}.`
    );
  }

  return value;
}

function requireOptionalNumberField(
  record: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number
): number {
  return record[key] === undefined ? fallback : requireNumberField(record, key);
}

function requireOptionalNullableNumberField(
  record: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number | null
): number | null {
  if (record[key] === undefined) {
    return fallback;
  }

  return requireNullableNumberField(record, key);
}

function requireOptionalBooleanField(
  record: Readonly<Record<string, unknown>>,
  key: string,
  fallback: boolean
): boolean {
  const value = record[key];

  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be a boolean: ${key}.`
    );
  }

  return value;
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
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be a number or null: ${key}.`
    );
  }

  return value;
}

function requireCombatItemField(
  record: Readonly<Record<string, unknown>>,
  key: string
): CombatItemType | null {
  return normalizeCombatItem(record[key], key);
}

function requireCombatItemTypeField(
  record: Readonly<Record<string, unknown>>,
  key: string
): CombatItemType {
  return normalizeRequiredCombatItem(record[key], key);
}

function requireItemHitTypeField(
  record: Readonly<Record<string, unknown>>,
  key: string
): Exclude<CombatItemType, "boost"> | null {
  return normalizeItemHitType(record[key], key);
}

function requireActiveItemTypeField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartActiveItemType {
  return normalizeActiveItemType(record[key], key);
}

function requireShellItemTypeField(
  record: Readonly<Record<string, unknown>>,
  key: string
): "shell" {
  return requireShellItemType(record[key], key);
}

function requireBananaItemTypeField(
  record: Readonly<Record<string, unknown>>,
  key: string
): "banana" {
  return requireBananaItemType(record[key], key);
}

function requireShellItemType(value: unknown, key: string): "shell" {
  if (value !== "shell") {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be a shell item: ${key}.`
    );
  }

  return value;
}

function requireBananaItemType(value: unknown, key: string): "banana" {
  if (value !== "banana") {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be a banana item: ${key}.`
    );
  }

  return value;
}

function requireItemHitEffectType(
  value: unknown,
  expectedItemType: Exclude<CombatItemType, "boost">,
  key: string
): Exclude<CombatItemType, "boost"> {
  const itemType =
    expectedItemType === "shell"
      ? requireShellItemType(value, key)
      : requireBananaItemType(value, key);

  return itemType;
}

function normalizeCombatItem(value: unknown, key: string): CombatItemType | null {
  if (value === null) {
    return null;
  }

  if (typeof value === "string" && isCombatItemType(value)) {
    return value;
  }

  throw new KartTransformSnapshotError(
    `Transform snapshot field must be a combat item or null: ${key}.`
  );
}

function normalizeItemHitType(
  value: unknown,
  key: string
): Exclude<CombatItemType, "boost"> | null {
  if (value === null) {
    return null;
  }

  if (value === "shell" || value === "banana") {
    return value;
  }

  throw new KartTransformSnapshotError(
    `Transform snapshot field must be a combat hit item or null: ${key}.`
  );
}

function normalizeRequiredCombatItem(value: unknown, key: string): CombatItemType {
  const itemType = normalizeCombatItem(value, key);

  if (itemType === null) {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be a combat item: ${key}.`
    );
  }

  return itemType;
}

function normalizeActiveItemType(
  value: unknown,
  key: string
): KartActiveItemType {
  const itemType = normalizeRequiredCombatItem(value, key);

  if (itemType === "boost") {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be an active world item: ${key}.`
    );
  }

  return itemType;
}

function isCombatItemType(value: string): value is CombatItemType {
  return COMBAT_ITEM_TYPES.some((itemType) => itemType === value);
}

function requireNonEmptyText(value: string, key: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be non-empty: ${key}.`
    );
  }

  return normalized;
}

function requireWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be a whole non-negative number: ${key}.`
    );
  }

  return value;
}

function requirePositiveWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new KartTransformSnapshotError(
      `Transform snapshot option must be a positive whole number: ${key}.`
    );
  }

  return value;
}

function requireFiniteNonNegativeNumber(value: number, key: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be finite and non-negative: ${key}.`
    );
  }

  return value;
}

function requireFiniteNumber(value: number, key: string): number {
  if (!Number.isFinite(value)) {
    throw new KartTransformSnapshotError(
      `Transform snapshot field must be finite: ${key}.`
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

function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
