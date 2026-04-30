import {
  createAiController,
  toRacerInputState,
  type AiController,
  type AiControllerCommand,
  type AiKartState,
  type AiTrackState,
  type AiWaypointState
} from "../ai/aiController";
import type { DrivingStats, Vector3 } from "../config/aiRacers";
import { RACE_CAPACITY } from "../config/gameConfig";
import {
  DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING,
  DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING,
  createBananaSpinoutGameplayTuning,
  createShellSpinoutGameplayTuning,
  type BananaSpinoutGameplayTuning,
  type ShellSpinoutGameplayTuning
} from "../config/gameplayTuning";
import {
  DEFAULT_TRACK_DEFINITION,
  DEFAULT_TRACK_GAMEPLAY_METADATA,
  DEFAULT_TRACK_ITEM_BOX_PLACEMENTS,
  DEFAULT_TRACK_WAYPOINTS,
  assertTrackMetadataIntegrity,
  createTrackGameplayMetadata,
  getNearestTrackRoadProjection,
  queryTrackGameplaySurfaceAtPoint,
  queryTrackSurfaceAtPoint,
  type TrackBounds,
  type TrackGameplayMetadata,
  type TrackItemBoxPlacement,
  type TrackLapMarker,
  type TrackRoadGeometry,
  type TrackSurfaceQueryResult
} from "../config/tracks";
import {
  INITIAL_RACE_STATE,
  createRaceParticipantStateIndex,
  createRacerProgressState,
  createRaceStateFromStartRoster,
  type RacerInputState,
  type RacerPlacementState,
  type RacerProgressState,
  type RaceParticipantState,
  type RaceParticipantStateIndex,
  type RacePhase,
  type RaceState,
  type RegisteredRacer
} from "./raceState";
import {
  applyRacerBoostItemEffect,
  applyRacerItemHitEffect,
  applyRacerSpinoutItemEffect,
  clearRacerTimedItemEffect,
  createInitialRacerItemEffectState,
  createRacerItemEffectDefinitions,
  isRacerItemRecovering,
  updateRacerItemEffectTimers,
  type RacerItemEffectDurationTable,
  type RacerItemEffectState
} from "./racerItemEffects";
import {
  createRacerTargetRegistry,
  type RacerTarget,
  type RacerTargetEligibilityMetadata,
  type RacerTargetRegistry,
  type RacerTargetRegistryCreateOptions
} from "./racerTargetRegistry";
import type { RaceStartRoster } from "./raceStartRoster";
import {
  DEFAULT_KART_COLLISION_DIMENSIONS,
  createKartCollisionBounds,
  createKartCollisionDimensions,
  detectKartCollisionBoundsOverlap,
  hasKartCollisionBoundsCircleOverlap,
  type KartCollisionBounds,
  type KartCollisionDimensions,
  type KartCollisionDimensionsInput
} from "../physics/kartCollisionBounds";
import {
  createKartPhysicsState,
  syncKartPhysicsState,
  type KartPhysicsCollisionMetadata,
  type KartPhysicsState
} from "../physics/kartPhysicsState";
import {
  DEFAULT_OBSTACLE_HALF_HEIGHT,
  DEFAULT_TRACK_COLLISION_LAYER,
  detectKartBoundsTrackObstacleContacts,
  detectKartBoundsTrackBoundaryContacts,
  type TrackCollisionLayer,
  type TrackObstacleCollider,
  type TrackObstacleColliderKind
} from "../physics/trackColliders";

export interface RaceSessionRacerState extends RacerItemEffectState {
  readonly racer: RegisteredRacer;
  readonly id: string;
  readonly slotIndex: number;
  readonly controller: RegisteredRacer["controller"];
  readonly displayName: string;
  readonly peerId: string | null;
  readonly isHost: boolean;
  readonly color: string;
  input: RacerInputState;
  progress: RacerProgressState;
  position: Vector3;
  velocity: Vector3;
  knockbackVelocity: Vector3;
  forward: Vector3;
  headingRadians: number;
  readonly body: KartPhysicsState["body"];
  physics: KartPhysicsState;
  collision: KartPhysicsCollisionMetadata;
  readonly collisionDimensions: KartCollisionDimensions;
  collisionBounds: KartCollisionBounds;
  speed: number;
  grounded: boolean;
  heldItem: RaceItemInventoryState["heldItem"];
  collisionControlSeconds: number;
  itemUseCooldownSeconds: RaceItemInventoryState["itemUseCooldownSeconds"];
  rank: number;
  finishPlace: number | null;
  finishTimeSeconds: number | null;
  pendingFinishTimeSeconds: number | null;
  placement: RacerPlacementState;
  updateCount: number;
}

export type CombatItemType = "boost" | "shell" | "banana";
export const COMBAT_ITEM_TYPES = [
  "boost",
  "shell",
  "banana"
] as const satisfies readonly CombatItemType[];

export type CombatItemCategory = "mobility" | "projectile" | "trap";
export type CombatItemRarity = "common" | "uncommon" | "rare";
export type CombatItemBehaviorType = "instant" | "projectile" | "dropped-trap";
export type CombatItemDistributionRole =
  | "common"
  | "defensive"
  | "offensive"
  | "high-impact";

export interface RaceItemInventoryState {
  heldItem: CombatItemType | null;
  itemUseCooldownSeconds: number;
}

export interface CombatItemMetadata<Item extends CombatItemType = CombatItemType> {
  readonly id: Item;
  readonly displayName: string;
  readonly description: string;
  readonly category: CombatItemCategory;
  readonly rarity: CombatItemRarity;
  readonly behaviorType: CombatItemBehaviorType;
  readonly inventoryIconRef: string;
}

export interface BoostRuntimeConfig {
  readonly durationSeconds: number;
  readonly speedMultiplier: number;
  readonly accelerationBonus: number;
  readonly useCooldownSeconds: number;
}

export interface ShellRuntimeConfig {
  readonly speed: number;
  readonly radius: number;
  readonly ttlSeconds: number;
  readonly armSeconds: number;
  readonly hitStunSeconds: number;
  readonly hitSpeedFactor: number;
  readonly spinoutSeconds: number;
  readonly spinoutRadians: number;
  readonly hitImmunitySeconds: number;
  readonly hitFeedbackSeconds: number;
  readonly useCooldownSeconds: number;
}

export interface BananaRuntimeConfig {
  readonly radius: number;
  readonly ttlSeconds: number;
  readonly armSeconds: number;
  readonly hitStunSeconds: number;
  readonly hitSpeedFactor: number;
  readonly spinRadians: number;
  readonly spinoutSeconds: number;
  readonly spinoutRadians: number;
  readonly hitImmunitySeconds: number;
  readonly hitFeedbackSeconds: number;
  readonly useCooldownSeconds: number;
}

export interface CombatItemRuntimeConfigByType {
  readonly boost: BoostRuntimeConfig;
  readonly shell: ShellRuntimeConfig;
  readonly banana: BananaRuntimeConfig;
}

export interface CombatItemDistributionEntry {
  readonly itemType: CombatItemType;
  readonly role: CombatItemDistributionRole;
  readonly weight: number;
}

export interface CombatItemCatchUpInput {
  readonly racerRank: number;
  readonly racerCount: number;
  readonly completedDistance: number;
  readonly leaderCompletedDistance: number;
  readonly trackLength: number;
}

export interface CombatItemSelectionWeight {
  readonly itemType: CombatItemType;
  readonly baseWeight: number;
  readonly catchUpMultiplier: number;
  readonly weight: number;
}

export interface CombatItemCatchUpState {
  readonly racerRank: number;
  readonly racerCount: number;
  readonly distanceBehindLeader: number;
  readonly positionScore: number;
  readonly distanceScore: number;
  readonly catchUpScore: number;
  readonly weights: readonly CombatItemSelectionWeight[];
}

export interface CombatItemCatchUpTuning {
  readonly fullEffectDistanceTrackFraction: number;
  readonly frontRunnerItemMultipliers: Readonly<Record<CombatItemType, number>>;
  readonly trailingItemMultipliers: Readonly<Record<CombatItemType, number>>;
}

export const COMBAT_ITEM_CATCH_UP_TUNING = {
  fullEffectDistanceTrackFraction: 0.32,
  frontRunnerItemMultipliers: {
    boost: 0.82,
    shell: 0.9,
    banana: 1.22
  },
  trailingItemMultipliers: {
    boost: 2.35,
    shell: 2.05,
    banana: 0.68
  }
} as const satisfies CombatItemCatchUpTuning;

export const ITEM_DISTRIBUTION_BALANCE_TUNING = {
  roleShareRanges: {
    common: { min: 0.34, max: 0.5 },
    defensive: { min: 0.2, max: 0.35 },
    offensive: { min: 0.16, max: 0.3 },
    "high-impact": { min: 0.05, max: 0.14 }
  },
  itemShareRanges: {
    boost: { min: 0.34, max: 0.5 },
    banana: { min: 0.2, max: 0.35 },
    shell: { min: 0.22, max: 0.38 }
  }
} as const;

export const DEFAULT_COMBAT_ITEM_DISTRIBUTION_TABLE = [
  {
    itemType: "boost",
    role: "common",
    weight: 42
  },
  {
    itemType: "banana",
    role: "defensive",
    weight: 28
  },
  {
    itemType: "shell",
    role: "offensive",
    weight: 22
  },
  {
    itemType: "shell",
    role: "high-impact",
    weight: 8
  }
] as const satisfies readonly CombatItemDistributionEntry[];

export function getCombatItemDistributionTotalWeight(
  table: readonly CombatItemDistributionEntry[] =
    DEFAULT_COMBAT_ITEM_DISTRIBUTION_TABLE
): number {
  return table.reduce((total, entry) => total + entry.weight, 0);
}

export function getCombatItemDistributionRoleWeight(
  role: CombatItemDistributionRole,
  table: readonly CombatItemDistributionEntry[] =
    DEFAULT_COMBAT_ITEM_DISTRIBUTION_TABLE
): number {
  return table
    .filter((entry) => entry.role === role)
    .reduce((total, entry) => total + entry.weight, 0);
}

export function getCombatItemDistributionItemWeight(
  itemType: CombatItemType,
  table: readonly CombatItemDistributionEntry[] =
    DEFAULT_COMBAT_ITEM_DISTRIBUTION_TABLE
): number {
  return table
    .filter((entry) => entry.itemType === itemType)
    .reduce((total, entry) => total + entry.weight, 0);
}

export function createCombatItemCatchUpState(
  input: CombatItemCatchUpInput,
  tuning: CombatItemCatchUpTuning = COMBAT_ITEM_CATCH_UP_TUNING
): CombatItemCatchUpState {
  const racerCount = Math.max(1, Math.floor(input.racerCount));
  const racerRank = clamp(
    Math.floor(input.racerRank),
    1,
    Math.max(1, racerCount)
  );
  const completedDistance = getFiniteNonNegativeNumber(
    input.completedDistance,
    0
  );
  const leaderCompletedDistance = Math.max(
    completedDistance,
    getFiniteNonNegativeNumber(input.leaderCompletedDistance, completedDistance)
  );
  const trackLength = getFinitePositiveNumber(input.trackLength, 1);
  const distanceBehindLeader = Math.max(
    0,
    leaderCompletedDistance - completedDistance
  );
  const positionScore =
    racerCount <= 1 ? 0 : clamp((racerRank - 1) / (racerCount - 1), 0, 1);
  const distanceFullEffectMeters =
    trackLength *
    getFinitePositiveNumber(tuning.fullEffectDistanceTrackFraction, 1);
  const distanceScore = clamp(
    distanceBehindLeader / distanceFullEffectMeters,
    0,
    1
  );
  const catchUpScore = Math.max(positionScore, distanceScore);

  return {
    racerRank,
    racerCount,
    distanceBehindLeader,
    positionScore,
    distanceScore,
    catchUpScore,
    weights: createCatchUpCombatItemWeightsFromScore(catchUpScore, tuning)
  };
}

export function createCatchUpCombatItemWeights(
  input: CombatItemCatchUpInput,
  tuning: CombatItemCatchUpTuning = COMBAT_ITEM_CATCH_UP_TUNING
): readonly CombatItemSelectionWeight[] {
  return createCombatItemCatchUpState(input, tuning).weights;
}

export function selectWeightedCombatItemType(
  weights: readonly CombatItemSelectionWeight[],
  rollRatio: number
): CombatItemType {
  const validWeights = weights.filter((entry) => entry.weight > 0);
  const totalWeight = validWeights.reduce(
    (total, entry) => total + entry.weight,
    0
  );

  if (totalWeight <= 0 || validWeights.length === 0) {
    throw new Error("Expected at least one positive combat item weight.");
  }

  const targetWeight = clamp(rollRatio, 0, 1 - Number.EPSILON) * totalWeight;
  let cumulativeWeight = 0;

  for (const entry of validWeights) {
    cumulativeWeight += entry.weight;

    if (targetWeight < cumulativeWeight) {
      return entry.itemType;
    }
  }

  const fallbackWeight = validWeights[validWeights.length - 1];

  if (fallbackWeight === undefined) {
    throw new Error("Expected a final combat item weight.");
  }

  return fallbackWeight.itemType;
}

function createCatchUpCombatItemWeightsFromScore(
  catchUpScore: number,
  tuning: CombatItemCatchUpTuning
): readonly CombatItemSelectionWeight[] {
  const score = clamp(catchUpScore, 0, 1);

  return COMBAT_ITEM_TYPES.map((itemType) => {
    const baseWeight = COMBAT_ITEM_REGISTRY[itemType].pickupWeight;
    const catchUpMultiplier = interpolateNumber(
      tuning.frontRunnerItemMultipliers[itemType],
      tuning.trailingItemMultipliers[itemType],
      score
    );

    return {
      itemType,
      baseWeight,
      catchUpMultiplier,
      weight: Math.max(0, baseWeight * catchUpMultiplier)
    };
  });
}

export type CombatItemRegistry = {
  readonly [Item in CombatItemType]: {
    readonly id: Item;
    readonly type: Item;
    readonly metadata: CombatItemMetadata<Item>;
    readonly rarity: CombatItemRarity;
    readonly behaviorType: CombatItemBehaviorType;
    readonly pickupWeight: number;
    readonly inventoryIcon: string;
    readonly inventoryIconKey: string;
    readonly inventoryIconRef: string;
    readonly inventoryKey: string;
    readonly respawnSeconds: number;
    readonly defaultRuntimeConfig: CombatItemRuntimeConfigByType[Item];
  };
};

export const ITEM_PICKUP_CADENCE_TUNING = {
  pickupRadius: 2.35,
  minBoxesPerLap: RACE_CAPACITY * 2,
  maxTrackGapFraction: 0.18,
  minRespawnSeconds: 2.5,
  maxRespawnSeconds: 4.5,
  respawnSecondsByType: {
    boost: 3.4,
    shell: 4.4,
    banana: 3.7
  }
} as const;

export const COMBAT_ITEM_REGISTRY = {
  boost: {
    id: "boost",
    type: "boost",
    metadata: {
      id: "boost",
      displayName: "Boost",
      description: "Short speed burst for catching up on straights.",
      category: "mobility",
      rarity: "common",
      behaviorType: "instant",
      inventoryIconRef: "combat-item-boost"
    },
    rarity: "common",
    behaviorType: "instant",
    pickupWeight: getCombatItemDistributionItemWeight("boost"),
    inventoryIcon: "B",
    inventoryIconKey: "combat-item-boost",
    inventoryIconRef: "combat-item-boost",
    inventoryKey: "boost",
    respawnSeconds: ITEM_PICKUP_CADENCE_TUNING.respawnSecondsByType.boost,
    defaultRuntimeConfig: {
      durationSeconds: 1.3,
      speedMultiplier: 1.38,
      accelerationBonus: 22,
      useCooldownSeconds: 0.35
    }
  },
  shell: {
    id: "shell",
    type: "shell",
    metadata: {
      id: "shell",
      displayName: "Shell",
      description: "Forward projectile that stuns the first racer it hits.",
      category: "projectile",
      rarity: "uncommon",
      behaviorType: "projectile",
      inventoryIconRef: "combat-item-shell"
    },
    rarity: "uncommon",
    behaviorType: "projectile",
    pickupWeight: getCombatItemDistributionItemWeight("shell"),
    inventoryIcon: "S",
    inventoryIconKey: "combat-item-shell",
    inventoryIconRef: "combat-item-shell",
    inventoryKey: "shell",
    respawnSeconds: ITEM_PICKUP_CADENCE_TUNING.respawnSecondsByType.shell,
    defaultRuntimeConfig: {
      speed: 48,
      radius: 0.82,
      ttlSeconds: 2.35,
      armSeconds: 0.1,
      hitStunSeconds: 0.68,
      hitSpeedFactor: 0.3,
      spinoutSeconds: DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds,
      spinoutRadians: DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutRadians,
      hitImmunitySeconds: 1.75,
      hitFeedbackSeconds: 0.58,
      useCooldownSeconds: 0.48
    }
  },
  banana: {
    id: "banana",
    type: "banana",
    metadata: {
      id: "banana",
      displayName: "Banana",
      description: "Rear trap that spins and slows a following racer.",
      category: "trap",
      rarity: "uncommon",
      behaviorType: "dropped-trap",
      inventoryIconRef: "combat-item-banana"
    },
    rarity: "uncommon",
    behaviorType: "dropped-trap",
    pickupWeight: getCombatItemDistributionItemWeight("banana"),
    inventoryIcon: "N",
    inventoryIconKey: "combat-item-banana",
    inventoryIconRef: "combat-item-banana",
    inventoryKey: "banana",
    respawnSeconds: ITEM_PICKUP_CADENCE_TUNING.respawnSecondsByType.banana,
    defaultRuntimeConfig: {
      radius: 1.25,
      ttlSeconds: 16.5,
      armSeconds: 0.32,
      hitStunSeconds: 0.4,
      hitSpeedFactor: 0.48,
      spinRadians: DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING.spinRadians,
      spinoutSeconds: DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds,
      spinoutRadians: DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING.spinoutRadians,
      hitImmunitySeconds: 1.35,
      hitFeedbackSeconds: 0.46,
      useCooldownSeconds: 0.36
    }
  }
} as const satisfies CombatItemRegistry;

export const RACER_ITEM_EFFECT_DURATIONS = {
  boost: {
    boostSeconds:
      COMBAT_ITEM_REGISTRY.boost.defaultRuntimeConfig.durationSeconds
  },
  shell: {
    stunSeconds:
      COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.hitStunSeconds,
    spinoutSeconds:
      COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.spinoutSeconds,
    itemHitImmunitySeconds:
      COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.hitImmunitySeconds,
    hitFeedbackSeconds:
      COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.hitFeedbackSeconds
  },
  banana: {
    stunSeconds:
      COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.hitStunSeconds,
    spinoutSeconds:
      COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.spinoutSeconds,
    itemHitImmunitySeconds:
      COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.hitImmunitySeconds,
    hitFeedbackSeconds:
      COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.hitFeedbackSeconds
  }
} as const satisfies RacerItemEffectDurationTable;

export const RACER_ITEM_EFFECT_DEFINITIONS =
  createRacerItemEffectDefinitions(RACER_ITEM_EFFECT_DURATIONS);

export interface RaceTrackObstacle {
  readonly id: string;
  readonly position: Vector3;
  readonly radius: number;
  readonly halfHeight?: number;
  readonly obstacleKind?: TrackObstacleColliderKind;
  readonly impactSpeedFactor: number;
}

export interface RaceItemPickupConfig {
  readonly id: string;
  readonly position: Vector3;
  readonly radius: number;
  readonly itemType: CombatItemType;
  readonly respawnSeconds: number;
}

export interface RaceItemPickupState extends RaceItemPickupConfig {
  active: boolean;
  cooldownSeconds: number;
  respawnDeadlineElapsedSeconds: number | null;
}

function isRaceItemPickupActive(pickup: RaceItemPickupState): boolean {
  return pickup.active && pickup.cooldownSeconds <= 0;
}

function isRaceItemPickupActiveAtElapsedSeconds(
  pickup: RaceItemPickupState,
  elapsedSeconds: number
): boolean {
  const normalizedElapsedSeconds = getFiniteNonNegativeNumber(
    elapsedSeconds,
    0
  );

  if (pickup.respawnDeadlineElapsedSeconds !== null) {
    return normalizedElapsedSeconds >= pickup.respawnDeadlineElapsedSeconds;
  }

  return pickup.cooldownSeconds <= 0;
}

export interface RaceItemPickupCollectionEvent {
  readonly eventId: string;
  readonly pickupId: string;
  readonly racerId: string;
  /** Host-selected inventory grant; this can differ from the pickup marker type. */
  readonly itemType: CombatItemType;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly cooldownSeconds: number;
  readonly respawnDeadlineElapsedSeconds: number;
}

export interface RaceItemPickupCollisionCandidate {
  readonly pickupId: string;
  readonly racerId: string;
  readonly racerSlotIndex: number;
  readonly itemType: CombatItemType;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
}

function createDefaultRaceItemPickup(
  id: string,
  position: Vector3,
  itemType: CombatItemType
): RaceItemPickupConfig {
  return {
    id,
    position,
    radius: ITEM_PICKUP_CADENCE_TUNING.pickupRadius,
    itemType,
    respawnSeconds: COMBAT_ITEM_REGISTRY[itemType].respawnSeconds
  };
}

function createDefaultRaceItemPickupsFromTrackPlacements(
  placements: readonly TrackItemBoxPlacement[],
  itemTypes: readonly CombatItemType[]
): readonly RaceItemPickupConfig[] {
  if (placements.length !== itemTypes.length) {
    throw new Error(
      `Default race item pickup item type count ${itemTypes.length} must match track item box count ${placements.length}.`
    );
  }

  return placements.map((placement, index) => {
    const itemType = itemTypes[index];

    if (itemType === undefined) {
      throw new Error(`Missing item type for track item box ${placement.id}.`);
    }

    return createDefaultRaceItemPickup(
      placement.id,
      placement.position,
      itemType
    );
  });
}

export interface RaceBoostActivationEvent {
  readonly eventId: string;
  readonly racerId: string;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly durationSeconds: number;
  readonly expiresAtElapsedSeconds: number;
  readonly cooldownSeconds: number;
}

export interface RaceBoostEffectEndEvent {
  readonly eventId: string;
  readonly boostActivationEventId: string;
  readonly racerId: string;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
}

export interface RaceSpinoutEffectStartEvent {
  readonly eventId: string;
  readonly spinoutId: string;
  readonly targetRacerId: string;
  readonly sourceItemType: Exclude<CombatItemType, "boost">;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly durationSeconds: number;
  readonly expiresAtElapsedSeconds: number;
  readonly spinoutAngularVelocity: number;
}

export interface RaceSpinoutEffectEndEvent {
  readonly eventId: string;
  readonly spinoutId: string;
  readonly targetRacerId: string;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
}

export interface RaceShellHitImpactData {
  readonly position: Vector3;
  readonly normal: Vector3;
  readonly shellPosition: Vector3;
  readonly shellVelocity: Vector3;
  readonly shellRadius: number;
  readonly targetHitboxCenter: Vector3;
  readonly penetrationDepth: number;
  readonly relativeSpeed: number;
}

export interface RaceItemHitEffectData {
  readonly itemType: Exclude<CombatItemType, "boost">;
  readonly stunSeconds: number;
  readonly spinoutSeconds: number;
  readonly spinoutAngularVelocity: number;
  readonly hitImmunitySeconds: number;
  readonly hitFeedbackSeconds: number;
  readonly speedFactor: number;
  readonly speedBeforeHit: number;
  readonly speedAfterHit: number;
  readonly headingDeltaRadians: number;
  readonly blockedByShield?: boolean;
  readonly shieldSecondsBeforeHit?: number;
  readonly shieldSecondsAfterHit?: number;
}

export interface RaceShellHitEvent {
  readonly eventId: string;
  readonly itemType: "shell";
  readonly shellId: string;
  readonly sourceRacerId: string;
  readonly sourceSlotIndex: number;
  readonly targetRacerId: string;
  readonly targetSlotIndex: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly impact: RaceShellHitImpactData;
  readonly effect: RaceItemHitEffectData;
}

export interface RaceBananaHitEvent {
  readonly eventId: string;
  readonly itemType: "banana";
  readonly bananaId: string;
  readonly sourceRacerId: string;
  readonly sourceSlotIndex: number;
  readonly targetRacerId: string;
  readonly targetSlotIndex: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly impact: RaceShellHitImpactData;
  readonly effect: RaceItemHitEffectData;
}

export interface RaceBananaSpawnEvent {
  readonly eventId: string;
  readonly itemType: "banana";
  readonly bananaId: string;
  readonly ownerRacerId: string;
  readonly ownerSlotIndex: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly radius: number;
  readonly armedSeconds: number;
  readonly ttlSeconds: number;
  readonly ageSeconds: number;
  readonly orientationRadians: number;
}

export type RaceBananaCleanupRemovalReason =
  | "hazard-cap"
  | "out-of-bounds"
  | "race-reset"
  | "race-finished";

export type RaceBananaRemovalReason =
  | "collision"
  | RaceBananaCleanupRemovalReason;

export interface RaceBananaRemovalEvent {
  readonly eventId: string;
  readonly itemType: "banana";
  readonly bananaId: string;
  readonly ownerRacerId: string;
  readonly ownerSlotIndex: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly reason: RaceBananaRemovalReason;
  readonly collisionEventId?: string;
  readonly collidedRacerId?: string;
}

export type RaceTrackEntityBodyType = "static";
export type RaceTrackEntityType = "banana-hazard";
export type RaceTrackEntityActiveStatus = "active" | "inactive";
export type RaceTrackEntityLifecycleState = "active" | "removed";

export interface RaceTrackEntityBase {
  readonly id: string;
  readonly networkId: string;
  readonly entityType: RaceTrackEntityType;
  readonly bodyType: RaceTrackEntityBodyType;
  readonly position: Vector3;
  readonly stablePosition: Vector3;
  readonly radius: number;
  readonly active: boolean;
  readonly activeStatus: RaceTrackEntityActiveStatus;
  readonly activeState: RaceTrackEntityLifecycleState;
  readonly state: RaceTrackEntityLifecycleState;
  readonly removed: boolean;
}

export interface RaceBananaHazardEntityState extends RaceTrackEntityBase {
  readonly entityType: "banana-hazard";
  readonly bodyType: "static";
  readonly itemType: "banana";
  readonly obstacleKind: "banana";
  readonly ownerId: string;
  readonly ownerRacerId: string;
  readonly owner: ActiveItemOwnerMetadata;
  readonly initialPosition: Vector3;
  readonly orientationRadians: number;
  readonly deployedAtTickIndex: number | null;
  readonly deployedAtElapsedSeconds: number | null;
  readonly deactivatedAtTickIndex: number | null;
  readonly deactivatedAtElapsedSeconds: number | null;
  readonly deactivationReason: RaceBananaRemovalReason | null;
  readonly collisionEventId: string | null;
  readonly collidedRacerId: string | null;
}

export type RaceTrackEntityState = RaceBananaHazardEntityState;

export interface RaceTrackEntityCollectionState {
  readonly entities: readonly RaceTrackEntityState[];
  readonly activeEntities: readonly RaceTrackEntityState[];
  readonly bananaHazards: readonly RaceBananaHazardEntityState[];
  readonly activeBananaHazards: readonly RaceBananaHazardEntityState[];
}

export type RaceItemUseActionType = `${CombatItemType}-use`;

export interface RaceItemActivationTargetCandidateRacerIdsByKind {
  readonly localPlayerRacerIds: readonly string[];
  readonly remotePlayerRacerIds: readonly string[];
  readonly aiOpponentRacerIds: readonly string[];
}

export interface RaceItemActivationTargetResolution {
  readonly sourceRacerId: string;
  readonly itemType: CombatItemType;
  readonly activeItemId: string | null;
  readonly candidateAffectedRacerIds: readonly string[];
  readonly candidateAffectedRacerIdsByKind: RaceItemActivationTargetCandidateRacerIdsByKind;
}

export interface RaceItemUseAction {
  readonly actionId: string;
  readonly action: RaceItemUseActionType;
  readonly racerId: string;
  readonly itemType: CombatItemType;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly activeItemId: string | null;
  readonly candidateAffectedRacerIds: readonly string[];
  readonly candidateAffectedRacerIdsByKind: RaceItemActivationTargetCandidateRacerIdsByKind;
  readonly targetResolution: RaceItemActivationTargetResolution;
}

export interface ActiveItemOwnerMetadata {
  readonly racerId: string;
  readonly slotIndex: number;
  readonly controller: RegisteredRacer["controller"];
}

interface ActiveRaceItemBase<Item extends Exclude<CombatItemType, "boost">> {
  readonly id: string;
  readonly networkId: string;
  readonly type: Item;
  readonly ownerId: string;
  readonly ownerRacerId: string;
  readonly owner: ActiveItemOwnerMetadata;
  readonly activeState: "active";
  readonly state: "active";
  readonly removed: false;
  readonly initialPosition: Vector3;
  position: Vector3;
  velocity: Vector3;
  readonly lifetimeSeconds: number;
  ageSeconds: number;
  ttlSeconds: number;
  armedSeconds: number;
  readonly radius: number;
}

export interface ShellProjectileState extends ActiveRaceItemBase<"shell"> {
  readonly spawnPosition: Vector3;
  readonly direction: Vector3;
  speed: number;
}

export interface BananaObstacleState extends ActiveRaceItemBase<"banana"> {
  readonly bodyType: "static";
  readonly obstacleKind: "banana";
  readonly active: true;
  readonly stablePosition: Vector3;
  readonly orientationRadians: number;
}

export interface BananaTrapState extends BananaObstacleState {}

export type ActiveRaceItemState = ShellProjectileState | BananaTrapState;

export type AiHeldItemUseDecisionReason =
  | "not-ai"
  | "finished"
  | "no-usable-item"
  | "recovering"
  | "low-speed-boost"
  | "catch-up-boost"
  | "incoming-threat-boost"
  | "offensive-target-ahead"
  | "defensive-target-behind"
  | "hold-for-context";

export interface AiHeldItemUseDecision {
  readonly useItem: boolean;
  readonly itemType: CombatItemType | null;
  readonly reason: AiHeldItemUseDecisionReason;
  readonly targetRacerId: string | null;
  readonly targetRaceDistance: number | null;
  readonly targetPlanarDistance: number | null;
  readonly aggression: number;
  readonly itemUseRange: number;
}

export interface AiHeldItemUseDecisionInput {
  readonly racer: RaceSessionRacerState;
  readonly racers: readonly RaceSessionRacerState[];
  readonly activeItems?: readonly ActiveRaceItemState[];
  readonly track: Pick<AiTrackState, "totalLength">;
}

export interface RaceSessionTickContext {
  readonly tickIndex: number;
  readonly deltaSeconds: number;
  readonly elapsedSeconds: number;
}

export interface RaceSessionTickResult extends RaceSessionTickContext {
  readonly racerUpdates: number;
  readonly aiUpdates: number;
  readonly kartCollisionPairChecks: number;
  readonly kartCollisionContacts: number;
  readonly activeItems: number;
  readonly trackEntityState: RaceTrackEntityCollectionState;
  readonly trackEntities: readonly RaceTrackEntityState[];
  readonly activeTrackEntities: readonly RaceTrackEntityState[];
  readonly availableItemPickups: number;
  readonly eligibleItemPickupCollisions: readonly RaceItemPickupCollisionCandidate[];
  readonly itemPickupCollections: readonly RaceItemPickupCollectionEvent[];
  readonly boostActivations: readonly RaceBoostActivationEvent[];
  readonly shellHits: readonly RaceShellHitEvent[];
  readonly bananaHits: readonly RaceBananaHitEvent[];
  readonly bananaRemovals: readonly RaceBananaRemovalEvent[];
  readonly itemUseActions: readonly RaceItemUseAction[];
  readonly raceProgress: readonly RaceProgressSnapshot[];
  readonly participants: readonly RaceParticipantState[];
}

export interface RaceSessionRacerEligibilityState
  extends RacerTargetEligibilityMetadata {
  readonly racerId: string;
  readonly stableId: string;
  readonly slotIndex: number;
  readonly kind: RacerTarget<RaceSessionRacerState>["kind"];
  readonly controller: RegisteredRacer["controller"];
}

export interface RaceSessionRacerEligibilitySnapshot {
  readonly states: readonly RaceSessionRacerEligibilityState[];
  readonly statesByRacerId: ReadonlyMap<
    string,
    RaceSessionRacerEligibilityState
  >;
  readonly statesBySlot: ReadonlyMap<number, RaceSessionRacerEligibilityState>;
}

export interface RaceRankingEntry {
  readonly racerId: string;
  readonly slotIndex: number;
  readonly displayName: string;
  readonly controller: RegisteredRacer["controller"];
  readonly rank: number;
  readonly lap: number;
  readonly checkpointIndex: number;
  readonly trackProgress: number;
  readonly finished: boolean;
  readonly finishPlace: number | null;
  readonly finishTimeSeconds: number | null;
}

export interface RaceProgressSnapshot {
  readonly racerId: string;
  readonly slotIndex: number;
  readonly displayName: string;
  readonly controller: RegisteredRacer["controller"];
  readonly rank: number;
  readonly lap: number;
  readonly lapCount: number;
  readonly checkpointIndex: number;
  readonly checkpointCount: number;
  readonly trackProgress: number;
  readonly trackLength: number;
  readonly completedDistance: number;
  readonly totalDistance: number;
  readonly currentLapProgressRatio: number;
  readonly completionRatio: number;
  readonly finished: boolean;
  readonly finishPlace: number | null;
  readonly finishTimeSeconds: number | null;
}

export interface RaceSessionOptions {
  readonly raceState?: RaceState;
  readonly aiController?: AiController;
  readonly track?: AiTrackState;
  readonly trackCollisionLayer?: TrackCollisionLayer;
  readonly obstacles?: readonly RaceTrackObstacle[];
  readonly itemPickups?: readonly RaceItemPickupConfig[];
  readonly shellSpinoutTuning?: Partial<ShellSpinoutGameplayTuning>;
  readonly bananaSpinoutTuning?: Partial<BananaSpinoutGameplayTuning>;
  readonly kartCollisionDimensions?: KartCollisionDimensionsInput;
  readonly racerTargetRegistryOptions?: RacerTargetRegistryCreateOptions;
  readonly onRacerTick?: (
    racerState: RaceSessionRacerState,
    context: RaceSessionTickContext
  ) => void;
}

export type RaceSessionRacerControllerPath =
  | "local-input"
  | "remote-input"
  | "remote-snapshot"
  | "ai-driver";

export type RaceSessionRacerControllerPathMap =
  | ReadonlyMap<string, RaceSessionRacerControllerPath>
  | Readonly<Record<string, RaceSessionRacerControllerPath>>;

export type RaceSessionItemPickupAuthority = "authoritative" | "remote";

export interface RaceSessionTickOptions {
  readonly controllerPaths?: RaceSessionRacerControllerPathMap;
  readonly itemPickupAuthority?: RaceSessionItemPickupAuthority;
}

export type RaceSessionSpinoutSourceItemType = Exclude<
  CombatItemType,
  "boost"
>;

export interface RaceSessionSpinoutTuningSnapshot {
  readonly shell: ShellSpinoutGameplayTuning;
  readonly banana: BananaSpinoutGameplayTuning;
}

export interface RaceSessionSpinoutTuningPatch {
  readonly shell?: Partial<ShellSpinoutGameplayTuning>;
  readonly banana?: Partial<BananaSpinoutGameplayTuning>;
}

export interface RaceSessionSpinoutVerificationTriggerOptions {
  readonly racerId?: string;
  readonly slotIndex?: number;
  readonly sourceItemType?: RaceSessionSpinoutSourceItemType;
  readonly durationSeconds?: number;
  readonly spinoutRadians?: number;
  readonly spinDirection?: 1 | -1;
}

export interface RaceSessionSpinoutVerificationResult {
  readonly racerId: string;
  readonly slotIndex: number;
  readonly sourceItemType: RaceSessionSpinoutSourceItemType;
  readonly applied: boolean;
  readonly spinoutSeconds: number;
  readonly spinoutRadians: number;
  readonly spinoutAngularVelocity: number;
  readonly recovering: boolean;
}

const HUMAN_DRIVING_STATS: DrivingStats = {
  maxSpeed: 30,
  acceleration: 20,
  braking: 20,
  steeringResponsiveness: 0.86,
  traction: 0.82,
  recovery: 0.75,
  itemAggression: 0.5
};

function getDefaultTrackWaypoint(index: number): AiWaypointState {
  const waypoint = DEFAULT_TRACK_WAYPOINTS[index];

  if (waypoint === undefined) {
    throw new Error(`Missing default track waypoint at index ${index}.`);
  }

  return waypoint;
}

export const DEFAULT_RACE_TRACK_STATE: AiTrackState = {
  id: DEFAULT_TRACK_GAMEPLAY_METADATA.id,
  name: DEFAULT_TRACK_GAMEPLAY_METADATA.name,
  lapCount: DEFAULT_TRACK_GAMEPLAY_METADATA.lapCount,
  spawnOrientationRadians:
    DEFAULT_TRACK_GAMEPLAY_METADATA.spawnOrientationRadians,
  bounds: DEFAULT_TRACK_GAMEPLAY_METADATA.bounds,
  road: DEFAULT_TRACK_DEFINITION.road,
  lapMarkers: DEFAULT_TRACK_DEFINITION.lapMarkers,
  checkpoints: DEFAULT_TRACK_DEFINITION.checkpoints,
  width: DEFAULT_TRACK_DEFINITION.road.roadWidth,
  totalLength: DEFAULT_TRACK_DEFINITION.road.totalLength,
  waypoints: DEFAULT_TRACK_WAYPOINTS,
  currentWaypoint: getDefaultTrackWaypoint(0),
  nextWaypoint: getDefaultTrackWaypoint(1),
  lookAheadWaypoint: getDefaultTrackWaypoint(2)
};

export const DEFAULT_RACE_TRACK_OBSTACLES: readonly RaceTrackObstacle[] =
  DEFAULT_TRACK_COLLISION_LAYER.obstacleColliders;

const DEFAULT_RACE_ITEM_PICKUP_TYPES = [
  COMBAT_ITEM_REGISTRY.boost.type,
  COMBAT_ITEM_REGISTRY.shell.type,
  COMBAT_ITEM_REGISTRY.banana.type,
  COMBAT_ITEM_REGISTRY.boost.type,
  COMBAT_ITEM_REGISTRY.boost.type,
  COMBAT_ITEM_REGISTRY.banana.type,
  COMBAT_ITEM_REGISTRY.boost.type,
  COMBAT_ITEM_REGISTRY.shell.type,
  COMBAT_ITEM_REGISTRY.banana.type
] as const satisfies readonly CombatItemType[];

export const DEFAULT_RACE_ITEM_PICKUPS =
  createDefaultRaceItemPickupsFromTrackPlacements(
    DEFAULT_TRACK_ITEM_BOX_PLACEMENTS,
    DEFAULT_RACE_ITEM_PICKUP_TYPES
  );

export const RACE_TARGET_DURATION_SECONDS = 120;
export const RACE_DURATION_TOLERANCE_SECONDS = 18;

type CollisionDampingType = "racer" | "boundary" | "obstacle";
type StaticCollisionResponseType = Exclude<CollisionDampingType, "racer">;

interface CollisionDampingConfig {
  readonly severeImpactSpeedFactor: number;
  readonly fullImpactSpeed: number;
  readonly fullPenetrationDepth: number;
  readonly impactSpeedWeight: number;
}

interface StaticCollisionResponseConfig {
  readonly restitution: number;
  readonly tangentialSpeedFactor: number;
}

const FULL_THROTTLE_UNPACED_RACE_SECONDS =
  (DEFAULT_RACE_TRACK_STATE.lapCount * DEFAULT_RACE_TRACK_STATE.totalLength) /
  HUMAN_DRIVING_STATS.maxSpeed;
const RACE_SPEED_SCALE =
  FULL_THROTTLE_UNPACED_RACE_SECONDS / RACE_TARGET_DURATION_SECONDS;
const RACE_SESSION_TRANSFORM_EPSILON = 0.000_001;
const MAX_TICK_SECONDS = 1 / 15;
const MIN_TICK_SECONDS = 0;
const BASE_STEER_RATE_RADIANS = Math.PI * 1.2;
const COAST_DECELERATION = 7;
const REVERSE_BRAKE_FACTOR = 0.35;
export const RACER_COLLISION_RADIUS = Math.hypot(
  DEFAULT_KART_COLLISION_DIMENSIONS.length / 2,
  DEFAULT_KART_COLLISION_DIMENSIONS.width / 2
);
const RACER_CONTACT_DAMPING = 0.84;
const RACER_CONTACT_RESTITUTION = 0.38;
const TRACK_BOUNDARY_DAMPING = 0.52;
const TRACK_SHOULDER_SPEED_LIMIT_FACTOR = 0.58;
const MIN_TRACK_BOUNDARY_COLLIDER_RESPONSE_DEPTH = 0.64;
// Slow AI shoulder recovery should not be snapped by guardrail thickness;
// high-speed impacts still resolve through the shared boundary response.
const AI_SHALLOW_BOUNDARY_RECOVERY_SPEED = 1;
const MIN_COLLISION_RESPONSE_SPEED = 0.02;
const OBSTACLE_STUN_SECONDS = 0.22;
const COLLISION_RESOLUTION_PASSES = 8;
const STATIC_TRACK_COLLISION_RESOLUTION_PASSES = 4;
const RACER_CONTACT_SEPARATION_EPSILON = 0.002;
const RACER_CONTACT_SEPARATION_DISTANCE_STEPS = 12;
const RACER_CONTACT_VALID_DISTANCE_STEPS = 12;
const RACER_CONTACT_AXIS_DUPLICATE_DOT = 0.999;
const RACER_CONTACT_SWEEP_STEP_DISTANCE = 0.5;
const RACER_CONTACT_SWEEP_MAX_STEPS = 96;
const RACER_CONTACT_SWEEP_REFINEMENT_STEPS = 8;
const ACTIVE_ITEM_BLOCKER_TRAVEL_EPSILON = 0.01;
const COLLISION_DAMPING_CONFIG_BY_TYPE = {
  racer: {
    severeImpactSpeedFactor: 0.62,
    fullImpactSpeed: 36,
    fullPenetrationDepth: 0.9,
    impactSpeedWeight: 0.72
  },
  boundary: {
    severeImpactSpeedFactor: 0.34,
    fullImpactSpeed: 42,
    fullPenetrationDepth: 1.15,
    impactSpeedWeight: 0.68
  },
  obstacle: {
    severeImpactSpeedFactor: 0.18,
    fullImpactSpeed: 36,
    fullPenetrationDepth: 0.85,
    impactSpeedWeight: 0.62
  }
} as const satisfies Record<CollisionDampingType, CollisionDampingConfig>;
const STATIC_COLLISION_RESPONSE_CONFIG_BY_TYPE = {
  boundary: {
    restitution: 0.58,
    tangentialSpeedFactor: 0.94
  },
  obstacle: {
    restitution: 0.46,
    tangentialSpeedFactor: 0.78
  }
} as const satisfies Record<
  StaticCollisionResponseType,
  StaticCollisionResponseConfig
>;
const STUN_RECOVERY_BRAKE_INPUT = 0.85;
const STUN_COAST_DECELERATION_MULTIPLIER = 1.35;
const SPINOUT_FALLBACK_CONTROL_WINDOW_SECONDS = Math.max(
  DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds,
  DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds
);
const STUN_ACCELERATION_MULTIPLIER = 0;
const STUN_MAX_SPEED_MULTIPLIER = 0.36;
const SPINOUT_MIN_ACCELERATION_MULTIPLIER = 0.22;
const SPINOUT_MIN_MAX_SPEED_MULTIPLIER = 0.58;
const SPINOUT_RECOVERY_BRAKE_INPUT = 0.34;
const SPINOUT_COAST_DECELERATION_MULTIPLIER = 1.7;
const ITEM_HIT_KNOCKBACK_MIN_SPEED = 4;
const ITEM_HIT_KNOCKBACK_DECELERATION = 30;
const ITEM_HIT_KNOCKBACK_STOP_SPEED = 0.08;
const ITEM_HIT_KNOCKBACK_CONFIG_BY_TYPE = {
  shell: {
    baseSpeed: 7.8,
    relativeSpeedFactor: 0.2,
    penetrationSpeedFactor: 3.8,
    maxSpeed: 15.5
  },
  banana: {
    baseSpeed: 4.2,
    relativeSpeedFactor: 0.12,
    penetrationSpeedFactor: 2.6,
    maxSpeed: 9.5
  }
} as const satisfies Record<
  Exclude<CombatItemType, "boost">,
  {
    readonly baseSpeed: number;
    readonly relativeSpeedFactor: number;
    readonly penetrationSpeedFactor: number;
    readonly maxSpeed: number;
  }
>;
const COLLISION_CONTROL_DURATION_SECONDS = 0.72;
const COLLISION_CONTROL_MIN_SECONDS = 0.16;
const COLLISION_CONTROL_MIN_THROTTLE_FACTOR = 0.52;
const COLLISION_CONTROL_MIN_STEER_FACTOR = 0.34;
const COLLISION_CONTROL_COAST_DECELERATION_MULTIPLIER = 1.22;
export const BOOST_DURATION_SECONDS =
  COMBAT_ITEM_REGISTRY.boost.defaultRuntimeConfig.durationSeconds;
const BOOST_SPEED_MULTIPLIER =
  COMBAT_ITEM_REGISTRY.boost.defaultRuntimeConfig.speedMultiplier;
const BOOST_ACCELERATION_BONUS =
  COMBAT_ITEM_REGISTRY.boost.defaultRuntimeConfig.accelerationBonus;
const SHELL_SPEED = COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed;
const SHELL_RADIUS = COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.radius;
const SHELL_TTL_SECONDS =
  COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.ttlSeconds;
const SHELL_ARM_SECONDS =
  COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.armSeconds;
export const SHELL_LAUNCH_CLEARANCE_METERS = 0.35;
const SHELL_OBSTACLE_SEPARATION_EPSILON = 0.04;
const SHELL_OBSTACLE_STOP_LINGER_SECONDS = 0.35;
const BANANA_RADIUS = COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.radius;
const BANANA_TTL_SECONDS =
  COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.ttlSeconds;
const BANANA_ARM_SECONDS =
  COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.armSeconds;
const BANANA_DROP_CLEARANCE_METERS = 0.35;
export const MAX_ACTIVE_BANANA_HAZARDS = RACE_CAPACITY * 2;
export const BANANA_DROP_DISTANCE_BEHIND_RACER =
  DEFAULT_KART_COLLISION_DIMENSIONS.length / 2 +
  BANANA_RADIUS +
  BANANA_DROP_CLEARANCE_METERS;
const TRACK_PROGRESS_EPSILON = 0.001;
const AI_RECOVERY_STALL_SPEED_THRESHOLD = 0.35;
const AI_RECOVERY_STALL_PROGRESS_EPSILON = 0.18;
const AI_RECOVERY_STALL_MOVEMENT_EPSILON = 0.2;
const AI_RECOVERY_STALL_REORIENT_SECONDS = 0.85;
const AI_RECOVERY_STALL_RESET_SECONDS = 2.6;
const AI_RECOVERY_OFF_TRACK_REORIENT_SECONDS = 0.12;
const AI_RECOVERY_OFF_TRACK_RESET_SECONDS = 1.85;
const AI_RECOVERY_WRONG_DIRECTION_REORIENT_SECONDS = 0.28;
const AI_RECOVERY_WRONG_DIRECTION_RESET_SECONDS = 1.65;
const AI_RECOVERY_WRONG_DIRECTION_HEADING_RADIANS = Math.PI * 0.62;
const AI_RECOVERY_COLLISION_REORIENT_SECONDS = 0.18;
const AI_RECOVERY_COLLISION_RESET_SECONDS = 2.15;
const AI_RECOVERY_COLLISION_STALL_SPEED_THRESHOLD = 2.5;
const AI_RECOVERY_COLLISION_PROGRESS_EPSILON = 0.35;
const AI_RECOVERY_COLLISION_MOVEMENT_EPSILON = 0.55;
const AI_RECOVERY_RESET_COOLDOWN_SECONDS = 0.9;
const AI_RECOVERY_OFF_TRACK_LOOKAHEAD_DISTANCE = 8;
const AI_RECOVERY_RESET_PROGRESS_SEARCH_DISTANCE = 7;
const AI_RECOVERY_RESET_LATERAL_MARGIN = 0.75;
const AI_RECOVERY_FULL_STEER_ANGLE_RADIANS = Math.PI * 0.55;
const AI_RECOVERY_REORIENT_THROTTLE = 0.62;
const AI_RECOVERY_STALL_THROTTLE = 0.82;
const AI_RECOVERY_COLLISION_THROTTLE = 0.68;
const AI_RECOVERY_HARD_TURN_BRAKE = 0.24;
const AI_ITEM_MIN_COMBAT_AGGRESSION = 0.05;
const AI_ITEM_OFFENSE_RANGE_MIN_FACTOR = 0.74;
const AI_ITEM_OFFENSE_RANGE_AGGRESSION_FACTOR = 0.56;
const AI_ITEM_DEFENSE_RANGE_MIN_FACTOR = 0.62;
const AI_ITEM_DEFENSE_RANGE_AGGRESSION_FACTOR = 0.5;
const AI_ITEM_BOOST_LOW_SPEED_FACTOR = 0.66;
const AI_ITEM_BOOST_LOW_SPEED_AGGRESSION_FACTOR = 0.18;
const AI_ITEM_BOOST_CATCHUP_RANGE_FACTOR = 1.45;
const AI_ITEM_BOOST_CATCHUP_MAX_SPEED_FACTOR = 0.97;
const AI_ITEM_SHELL_STRICT_FORWARD_DOT = 0.86;
const AI_ITEM_SHELL_AGGRESSIVE_FORWARD_DOT = 0.45;
const AI_ITEM_BANANA_STRICT_REAR_DOT = -0.78;
const AI_ITEM_BANANA_AGGRESSIVE_REAR_DOT = -0.38;
const AI_ITEM_INCOMING_SHELL_THREAT_DISTANCE = 14;
const AI_ITEM_INCOMING_SHELL_CLOSE_DISTANCE = 4.8;
const AI_ITEM_INCOMING_SHELL_CLOSING_DOT = 0.25;

type AiRecoveryReason = "stall" | "offTrack" | "wrongDirection" | "collision";

interface AiRacerRecoveryState {
  readonly racerId: string;
  lastPosition: Vector3;
  lastAbsoluteProgress: number;
  stallSeconds: number;
  offTrackSeconds: number;
  wrongDirectionSeconds: number;
  collisionSeconds: number;
  resetCooldownSeconds: number;
  lastResetReason: AiRecoveryReason | null;
}

interface AiRecoverySurfaceState {
  readonly surface: "road" | "shoulder" | "offTrack";
  readonly needsReorientation: boolean;
  readonly target: Vector3 | null;
}

interface AiRecoveryUpdate {
  readonly reason: AiRecoveryReason | null;
  readonly shouldReset: boolean;
  readonly target: Vector3 | null;
}

interface AiRecoveryResetPose {
  readonly position: Vector3;
  readonly headingRadians: number;
  readonly trackProgress: number;
}

interface SharedRacerCollisionPair {
  readonly left: RaceSessionRacerState;
  readonly right: RaceSessionRacerState;
}

interface AiItemUseTraits {
  readonly aggression: number;
  readonly itemUseRange: number;
  readonly offenseRange: number;
  readonly defenseRange: number;
}

interface AiItemUseTargetContext {
  readonly racer: RaceSessionRacerState;
  readonly raceDistance: number;
  readonly planarDistance: number;
  readonly forwardDot: number;
}

interface AiItemUseRaceContext {
  readonly targetsAhead: readonly AiItemUseTargetContext[];
  readonly targetsBehind: readonly AiItemUseTargetContext[];
  readonly nearestAhead: AiItemUseTargetContext | null;
  readonly nearestBehind: AiItemUseTargetContext | null;
  readonly incomingShellThreat: ActiveRaceItemState | null;
}

interface ActiveItemUpdateResult {
  readonly shellHits: readonly RaceShellHitEvent[];
  readonly bananaRemovals: readonly RaceBananaRemovalEvent[];
}

interface ItemPickupResolutionResult {
  readonly eligibleItemPickupCollisions: readonly RaceItemPickupCollisionCandidate[];
  readonly itemPickupCollections: readonly RaceItemPickupCollectionEvent[];
}

function createEmptyItemPickupResolutionResult(): ItemPickupResolutionResult {
  return {
    eligibleItemPickupCollisions: [],
    itemPickupCollections: []
  };
}

export class RaceSession {
  private readonly aiController: AiController;
  private readonly baseTrack: AiTrackState;
  private readonly gameplayTrackMetadata: TrackGameplayMetadata | null;
  private readonly trackCollisionData: TrackCollisionLayer;
  private readonly obstacles: readonly TrackObstacleCollider[];
  private readonly itemPickups: RaceItemPickupState[];
  private readonly itemPickupCollisionGatesByPickupId = new Map<
    string,
    Set<string>
  >();
  private shellSpinoutGameplayTuning: ShellSpinoutGameplayTuning;
  private bananaSpinoutGameplayTuning: BananaSpinoutGameplayTuning;
  private readonly activeItems: ActiveRaceItemState[] = [];
  private readonly bananaHazardEntitiesById =
    new Map<string, RaceBananaHazardEntityState>();
  private readonly onRacerTick:
    | ((racerState: RaceSessionRacerState, context: RaceSessionTickContext) => void)
    | undefined;
  private readonly racerTargetRegistryOptions: RacerTargetRegistryCreateOptions;
  private readonly racers: RaceSessionRacerState[];
  private readonly racersById = new Map<string, RaceSessionRacerState>();
  private readonly racersBySlot = new Map<number, RaceSessionRacerState>();
  private readonly aiRecoveryStates = new Map<string, AiRacerRecoveryState>();
  private readonly appliedPickupCollectionEventIds = new Set<string>();
  private readonly appliedBoostActivationEventIds = new Set<string>();
  private readonly appliedBoostEndEffectEventIds = new Set<string>();
  private readonly appliedBananaSpawnEventIds = new Set<string>();
  private readonly appliedShellHitEventIds = new Set<string>();
  private readonly appliedShellHitShellIds = new Set<string>();
  private readonly appliedBananaHitEventIds = new Set<string>();
  private readonly appliedBananaHitBananaIds = new Set<string>();
  private readonly appliedBananaRemovalEventIds = new Set<string>();
  private readonly appliedBananaRemovalBananaIds = new Set<string>();
  private readonly appliedSpinoutStartEffectEventIds = new Set<string>();
  private readonly appliedSpinoutEndEffectEventIds = new Set<string>();
  private readonly activeBoostActivationEventIdsByRacerId = new Map<
    string,
    string
  >();
  private readonly activeSpinoutEffectIdsByRacerId = new Map<string, string>();
  private pendingBoostActivationEvents: RaceBoostActivationEvent[] = [];
  private pendingShellHitEvents: RaceShellHitEvent[] = [];
  private pendingBananaHitEvents: RaceBananaHitEvent[] = [];
  private elapsedSeconds = 0;
  private tickIndex = 0;
  private itemSequence = 0;
  private pickupCollectionSequence = 0;
  private boostActivationSequence = 0;
  private shellHitSequence = 0;
  private bananaHitSequence = 0;
  private bananaRemovalSequence = 0;
  private itemUseActionSequence = 0;
  private nextFinishPlace = 1;

  public phase: RacePhase;

  public constructor(options: RaceSessionOptions = {}) {
    const raceState = options.raceState ?? INITIAL_RACE_STATE;

    assertRaceStartRacerCount(raceState.racers.length);

    this.phase = raceState.phase;
    this.aiController = options.aiController ?? createAiController();
    this.baseTrack = options.track ?? DEFAULT_RACE_TRACK_STATE;
    assertTrackMetadataIntegrity(this.baseTrack);
    this.gameplayTrackMetadata = createRaceTrackGameplayMetadata(this.baseTrack);
    this.trackCollisionData =
      options.trackCollisionLayer ?? DEFAULT_TRACK_COLLISION_LAYER;
    const configuredObstacles: readonly RaceTrackObstacle[] =
      options.obstacles ?? this.trackCollisionData.obstacleColliders;

    this.obstacles = configuredObstacles.map(createRaceTrackObstacleCollider);
    this.itemPickups = (options.itemPickups ?? DEFAULT_RACE_ITEM_PICKUPS).map(
      createRaceItemPickupState
    );
    this.shellSpinoutGameplayTuning = createShellSpinoutGameplayTuning(
      options.shellSpinoutTuning
    );
    this.bananaSpinoutGameplayTuning = createBananaSpinoutGameplayTuning(
      options.bananaSpinoutTuning
    );
    this.onRacerTick = options.onRacerTick;
    this.racerTargetRegistryOptions = options.racerTargetRegistryOptions ?? {};
    const kartCollisionDimensions = createKartCollisionDimensions(
      options.kartCollisionDimensions
    );
    this.racers = raceState.racers.map((racer) =>
      createRaceSessionRacerState(racer, kartCollisionDimensions)
    );
    assertRaceSessionInitialSlotTransforms(this.racers);

    for (const racer of this.racers) {
      if (this.racersById.has(racer.id)) {
        throw new Error(`Duplicate race-session racer id: ${racer.id}`);
      }

      if (this.racersBySlot.has(racer.slotIndex)) {
        throw new Error(`Duplicate race-session racer slot: ${racer.slotIndex}`);
      }

      this.racersById.set(racer.id, racer);
      this.racersBySlot.set(racer.slotIndex, racer);
    }

    this.refreshRaceRankings();
  }

  public get racerStates(): readonly RaceSessionRacerState[] {
    return this.racers;
  }

  public get aiRacerStates(): readonly RaceSessionRacerState[] {
    return this.racers.filter((racer) => racer.controller === "ai");
  }

  public get humanRacerStates(): readonly RaceSessionRacerState[] {
    return this.racers.filter((racer) => racer.controller === "human");
  }

  public get trackObstacles(): readonly RaceTrackObstacle[] {
    return this.obstacles;
  }

  public get trackCollisionLayer(): TrackCollisionLayer {
    return this.trackCollisionData;
  }

  public get trackMetadata(): AiTrackState {
    return this.baseTrack;
  }

  public get trackGameplayMetadata(): TrackGameplayMetadata | null {
    return this.gameplayTrackMetadata;
  }

  public queryTrackSurfaceAtPoint(
    position: Pick<Vector3, "x" | "z">,
    radius = 0
  ): TrackSurfaceQueryResult | null {
    if (this.gameplayTrackMetadata === null) {
      return null;
    }

    return queryTrackGameplaySurfaceAtPoint(
      this.gameplayTrackMetadata,
      position,
      radius
    );
  }

  public isTrackPointInsideCourseBoundary(
    position: Pick<Vector3, "x" | "z">,
    radius = 0
  ): boolean {
    const surface = this.queryTrackSurfaceAtPoint(position, radius);

    if (surface !== null) {
      return surface.withinCourseBoundary;
    }

    return isPointInsideTrackBounds(this.baseTrack.bounds, position, radius);
  }

  public isTrackPointOffTrack(
    position: Pick<Vector3, "x" | "z">,
    radius = 0
  ): boolean {
    const surface = this.queryTrackSurfaceAtPoint(position, radius);

    if (surface !== null) {
      return surface.offTrack;
    }

    return !isPointInsideTrackBounds(this.baseTrack.bounds, position, radius);
  }

  public get itemPickupStates(): readonly RaceItemPickupState[] {
    return this.itemPickups;
  }

  public get activeItemStates(): readonly ActiveRaceItemState[] {
    return this.activeItems;
  }

  public get shellProjectileStates(): readonly ShellProjectileState[] {
    return this.activeItems.filter(isShellProjectileState);
  }

  public get bananaObstacleStates(): readonly BananaObstacleState[] {
    return this.activeItems.filter(isBananaObstacleState);
  }

  public get trackEntityStates(): readonly RaceTrackEntityState[] {
    return [...this.bananaHazardEntitiesById.values()];
  }

  public get trackEntityState(): RaceTrackEntityCollectionState {
    const entities = this.trackEntityStates;
    const activeEntities = entities.filter((entity) => entity.active);
    const bananaHazards = entities.filter(isBananaHazardEntityState);

    return {
      entities,
      activeEntities,
      bananaHazards,
      activeBananaHazards: bananaHazards.filter((entity) => entity.active)
    };
  }

  public get activeTrackEntityStates(): readonly RaceTrackEntityState[] {
    return this.trackEntityState.activeEntities;
  }

  public get trackEntities(): readonly RaceTrackEntityState[] {
    return this.trackEntityStates;
  }

  public get entityStates(): readonly RaceTrackEntityState[] {
    return this.trackEntityStates;
  }

  public get bananaHazardEntityStates(): readonly RaceBananaHazardEntityState[] {
    return this.trackEntityState.bananaHazards;
  }

  public get activeBananaHazardEntityStates(): readonly RaceBananaHazardEntityState[] {
    return this.trackEntityState.activeBananaHazards;
  }

  public get nextTickIndex(): number {
    return this.tickIndex + 1;
  }

  public get raceElapsedSeconds(): number {
    return this.elapsedSeconds;
  }

  public get raceRankings(): readonly RaceRankingEntry[] {
    return createRaceRanking(this.racers, this.baseTrack);
  }

  public get raceProgress(): readonly RaceProgressSnapshot[] {
    return createRaceProgressSnapshots(this.racers, this.baseTrack);
  }

  public get participantStates(): readonly RaceParticipantState[] {
    return this.createParticipantStateIndex().participants;
  }

  public get participantsById(): Readonly<Record<string, RaceParticipantState>> {
    return this.createParticipantStateIndex().participantsById;
  }

  public get participantsBySlot(): Readonly<Record<number, RaceParticipantState>> {
    return this.createParticipantStateIndex().participantsBySlot;
  }

  public get racerTargets(): readonly RacerTarget<RaceSessionRacerState>[] {
    return this.createRacerTargetRegistry().targets;
  }

  public createParticipantStateIndex(
    options: RacerTargetRegistryCreateOptions = this.racerTargetRegistryOptions
  ): RaceParticipantStateIndex {
    return createRaceParticipantStateIndex(
      this.racers,
      options.localPeerId === undefined
        ? { phase: this.phase }
        : { localPeerId: options.localPeerId, phase: this.phase }
    );
  }

  public get racerEligibilityStates(): readonly RaceSessionRacerEligibilityState[] {
    return this.createRacerEligibilitySnapshot().states;
  }

  public getSpinoutGameplayTuning(): RaceSessionSpinoutTuningSnapshot {
    return {
      shell: { ...this.shellSpinoutGameplayTuning },
      banana: { ...this.bananaSpinoutGameplayTuning }
    };
  }

  public setSpinoutGameplayTuning(
    patch: RaceSessionSpinoutTuningPatch
  ): RaceSessionSpinoutTuningSnapshot {
    if (patch.shell !== undefined) {
      this.shellSpinoutGameplayTuning = createShellSpinoutGameplayTuning({
        ...this.shellSpinoutGameplayTuning,
        ...patch.shell
      });
    }

    if (patch.banana !== undefined) {
      this.bananaSpinoutGameplayTuning = createBananaSpinoutGameplayTuning({
        ...this.bananaSpinoutGameplayTuning,
        ...patch.banana
      });
    }

    return this.getSpinoutGameplayTuning();
  }

  public applySpinoutVerificationTrigger(
    options: RaceSessionSpinoutVerificationTriggerOptions = {}
  ): RaceSessionSpinoutVerificationResult {
    const racer = resolveSpinoutVerificationTargetRacer(this, options);
    const sourceItemType = options.sourceItemType ?? "shell";
    const tuning =
      sourceItemType === "banana"
        ? this.bananaSpinoutGameplayTuning
        : this.shellSpinoutGameplayTuning;
    const durationSeconds = options.durationSeconds ?? tuning.spinoutSeconds;
    const spinoutRadians = options.spinoutRadians ?? tuning.spinoutRadians;
    const validatedTuning =
      sourceItemType === "banana"
        ? createBananaSpinoutGameplayTuning({
            ...this.bananaSpinoutGameplayTuning,
            spinoutSeconds: durationSeconds,
            spinoutRadians
          })
        : createShellSpinoutGameplayTuning({
            spinoutSeconds: durationSeconds,
            spinoutRadians
          });
    const spinDirection = options.spinDirection ?? getDefaultSpinoutDirection(racer);
    const spinoutAngularVelocity =
      (spinDirection * validatedTuning.spinoutRadians) /
      validatedTuning.spinoutSeconds;
    const result = applyRacerSpinoutItemEffect(
      racer,
      validatedTuning.spinoutSeconds,
      spinoutAngularVelocity,
      sourceItemType
    );

    syncRacerRecoveringState(racer);
    refreshRacerVelocity(racer);
    refreshRacerCollisionBounds(racer);

    return {
      racerId: racer.id,
      slotIndex: racer.slotIndex,
      sourceItemType,
      applied: result.applied,
      spinoutSeconds: result.spinoutSeconds,
      spinoutRadians: validatedTuning.spinoutRadians,
      spinoutAngularVelocity: result.spinoutAngularVelocity,
      recovering: result.recovering
    };
  }

  public createRacerTargetRegistry(
    options: RacerTargetRegistryCreateOptions = {}
  ): RacerTargetRegistry<RaceSessionRacerState> {
    for (const racer of this.racers) {
      refreshRacerCollisionBounds(racer);
    }

    return createRacerTargetRegistry(this.racers, options);
  }

  public createRacerEligibilitySnapshot(
    options: RacerTargetRegistryCreateOptions = this.racerTargetRegistryOptions
  ): RaceSessionRacerEligibilitySnapshot {
    return createRaceSessionRacerEligibilitySnapshot(
      this.createRacerTargetRegistry(options)
    );
  }

  public getRacerEligibilityState(
    racerId: string,
    options: RacerTargetRegistryCreateOptions = this.racerTargetRegistryOptions
  ): RaceSessionRacerEligibilityState | undefined {
    return this.createRacerEligibilitySnapshot(options).statesByRacerId.get(
      racerId
    );
  }

  public getRacerTarget(
    racerId: string,
    options: RacerTargetRegistryCreateOptions = {}
  ): RacerTarget<RaceSessionRacerState> | undefined {
    return this.createRacerTargetRegistry(options).getTargetByStableId(racerId);
  }

  public resolveItemActivationTargets(
    racerId: string,
    itemType: CombatItemType,
    activeItemId: string | null = null,
    options: RacerTargetRegistryCreateOptions = this.racerTargetRegistryOptions
  ): RaceItemActivationTargetResolution {
    return resolveRaceItemActivationTargetResolution(
      itemType,
      racerId,
      activeItemId,
      this.createRacerTargetRegistry(options)
    );
  }

  public getRacerState(racerId: string): RaceSessionRacerState | undefined {
    return this.racersById.get(racerId);
  }

  public getRacerStateBySlot(
    slotIndex: number
  ): RaceSessionRacerState | undefined {
    return this.racersBySlot.get(slotIndex);
  }

  public getRacerProgress(
    racerId: string
  ): RaceProgressSnapshot | undefined {
    return this.raceProgress.find((progress) => progress.racerId === racerId);
  }

  public setHumanInput(
    racerId: string,
    input: Partial<RacerInputState>
  ): void {
    const racer = this.racersById.get(racerId);

    if (racer === undefined) {
      throw new Error(`Unknown race-session racer id: ${racerId}`);
    }

    if (racer.controller !== "human") {
      throw new Error(`Cannot assign human input to AI racer: ${racerId}`);
    }

    racer.input = {
      ...racer.input,
      ...input
    };
  }

  public applyItemPickupCollectionEvent(
    event: RaceItemPickupCollectionEvent
  ): boolean {
    if (this.appliedPickupCollectionEventIds.has(event.eventId)) {
      return false;
    }

    const pickup = this.itemPickups.find(
      (candidate) => candidate.id === event.pickupId
    );
    const racer = this.racersById.get(event.racerId);
    const eventElapsedSeconds = getFiniteNonNegativeNumber(
      event.elapsedSeconds,
      this.elapsedSeconds
    );

    if (
      pickup === undefined ||
      racer === undefined ||
      !isCombatItemType(event.itemType) ||
      !isRaceItemPickupActiveAtElapsedSeconds(pickup, eventElapsedSeconds)
    ) {
      return false;
    }

    if (
      !grantAcceptedItemPickupToRacer(racer, event.itemType, {
        acceptExistingMatchingItem: true
      })
    ) {
      return false;
    }

    this.appliedPickupCollectionEventIds.add(event.eventId);
    applyRaceItemPickupRespawnDeadline(
      pickup,
      event.respawnDeadlineElapsedSeconds,
      this.elapsedSeconds
    );
    if (!pickup.active) {
      this.getItemPickupCollisionGate(pickup.id).add(racer.id);
    } else {
      this.clearItemPickupCollisionGate(pickup.id);
    }

    return true;
  }

  public applyBoostActivationEvent(event: RaceBoostActivationEvent): boolean {
    if (this.appliedBoostActivationEventIds.has(event.eventId)) {
      return false;
    }

    const racer = this.racersById.get(event.racerId);

    if (racer === undefined) {
      return false;
    }

    this.appliedBoostActivationEventIds.add(event.eventId);

    if (event.elapsedSeconds > this.elapsedSeconds) {
      this.pendingBoostActivationEvents.push(event);
      this.pendingBoostActivationEvents.sort(compareBoostActivationEvents);
      return true;
    }

    this.applyBoostActivationEventToRacer(event, racer);

    return true;
  }

  public applyBoostEffectEndEvent(event: RaceBoostEffectEndEvent): boolean {
    if (
      this.appliedBoostEndEffectEventIds.has(event.eventId) ||
      event.eventId.trim().length === 0 ||
      event.boostActivationEventId.trim().length === 0
    ) {
      return false;
    }

    const racer = this.racersById.get(event.racerId);

    if (racer === undefined) {
      return false;
    }

    const hadActiveBoost =
      racer.boostSeconds > 0 || racer.timedEffects.boost !== undefined;
    const activeBoostActivationEventId =
      this.activeBoostActivationEventIdsByRacerId.get(racer.id);

    this.appliedBoostEndEffectEventIds.add(event.eventId);
    this.pendingBoostActivationEvents = this.pendingBoostActivationEvents.filter(
      (activation) => activation.eventId !== event.boostActivationEventId
    );

    if (
      activeBoostActivationEventId !== undefined &&
      activeBoostActivationEventId !== event.boostActivationEventId
    ) {
      return false;
    }

    clearRacerTimedItemEffect(racer, "boost");
    this.activeBoostActivationEventIdsByRacerId.delete(racer.id);
    refreshRacerVelocity(racer);

    return hadActiveBoost;
  }

  public applySpinoutEffectStartEvent(
    event: RaceSpinoutEffectStartEvent
  ): boolean {
    if (
      this.appliedSpinoutStartEffectEventIds.has(event.eventId) ||
      event.eventId.trim().length === 0 ||
      event.spinoutId.trim().length === 0
    ) {
      return false;
    }

    const racer = this.racersById.get(event.targetRacerId);

    if (racer === undefined) {
      return false;
    }

    const remainingSeconds = Math.min(
      normalizeEventDurationSeconds(event.durationSeconds),
      Math.max(0, event.expiresAtElapsedSeconds - this.elapsedSeconds)
    );

    this.appliedSpinoutStartEffectEventIds.add(event.eventId);

    if (remainingSeconds <= 0) {
      return false;
    }

    this.activeSpinoutEffectIdsByRacerId.set(racer.id, event.spinoutId);
    const result = applyRacerSpinoutItemEffect(
      racer,
      remainingSeconds,
      event.spinoutAngularVelocity,
      event.sourceItemType
    );

    syncRacerRecoveringState(racer);
    refreshRacerVelocity(racer);

    return result.applied;
  }

  public applySpinoutEffectEndEvent(event: RaceSpinoutEffectEndEvent): boolean {
    if (
      this.appliedSpinoutEndEffectEventIds.has(event.eventId) ||
      event.eventId.trim().length === 0 ||
      event.spinoutId.trim().length === 0
    ) {
      return false;
    }

    const racer = this.racersById.get(event.targetRacerId);

    if (racer === undefined) {
      return false;
    }

    const hadActiveSpinout =
      racer.spinoutSeconds > 0 || racer.timedEffects.spinout !== undefined;
    const activeSpinoutId = this.activeSpinoutEffectIdsByRacerId.get(racer.id);

    this.appliedSpinoutEndEffectEventIds.add(event.eventId);

    if (activeSpinoutId !== undefined && activeSpinoutId !== event.spinoutId) {
      return false;
    }

    clearRacerTimedItemEffect(racer, "spinout");
    this.activeSpinoutEffectIdsByRacerId.delete(racer.id);
    refreshRacerVelocity(racer);

    return hadActiveSpinout;
  }

  public applyBananaSpawnEvent(event: RaceBananaSpawnEvent): boolean {
    if (this.appliedBananaSpawnEventIds.has(event.eventId)) {
      return false;
    }

    if (
      event.itemType !== "banana" ||
      event.eventId.trim().length === 0 ||
      event.bananaId.trim().length === 0
    ) {
      return false;
    }

    if (
      this.appliedBananaHitBananaIds.has(event.bananaId) ||
      this.appliedBananaRemovalBananaIds.has(event.bananaId)
    ) {
      return false;
    }

    const owner = this.racersById.get(event.ownerRacerId);

    if (owner === undefined || owner.slotIndex !== event.ownerSlotIndex) {
      return false;
    }

    const banana = createBananaObstacleStateFromSpawnEvent(
      event,
      owner,
      this.elapsedSeconds
    );

    if (banana === null) {
      return false;
    }

    const existingIndex = this.activeItems.findIndex(
      (item) => item.id === event.bananaId
    );

    if (existingIndex >= 0) {
      const existingItem = this.activeItems[existingIndex];

      if (existingItem === undefined || existingItem.type !== "banana") {
        return false;
      }

      this.activeItems[existingIndex] = banana;
    } else {
      this.activeItems.push(banana);
    }

    this.storeBananaHazardEntity(banana, {
      tickIndex: event.tickIndex,
      elapsedSeconds: event.elapsedSeconds
    });
    this.appliedBananaSpawnEventIds.add(event.eventId);

    return true;
  }

  public applyShellHitEvent(event: RaceShellHitEvent): boolean {
    if (
      this.appliedShellHitEventIds.has(event.eventId) ||
      this.appliedShellHitShellIds.has(event.shellId)
    ) {
      return false;
    }

    const target = this.resolveNetworkStableItemHitTarget(event);

    if (target === undefined) {
      return false;
    }

    if (
      event.itemType !== "shell" ||
      event.shellId.trim().length === 0 ||
      event.effect.itemType !== event.itemType
    ) {
      return false;
    }

    this.appliedShellHitEventIds.add(event.eventId);
    this.appliedShellHitShellIds.add(event.shellId);
    this.removeActiveShellProjectile(event.shellId);

    if (event.elapsedSeconds > this.elapsedSeconds) {
      this.pendingShellHitEvents.push(event);
      this.pendingShellHitEvents.sort(compareItemHitEvents);
      return true;
    }

    applyItemTypeHit(
      target,
      event.itemType,
      event.impact,
      createTimeAlignedItemHitEffect(
        event.effect,
        event.elapsedSeconds,
        this.elapsedSeconds
      ),
      createItemHitSourceId(event.itemType, event.shellId)
    );

    return true;
  }

  public applyBananaHitEvent(event: RaceBananaHitEvent): boolean {
    if (this.appliedBananaHitEventIds.has(event.eventId)) {
      return false;
    }

    if (this.appliedBananaHitBananaIds.has(event.bananaId)) {
      return false;
    }

    const target = this.resolveNetworkStableItemHitTarget(event);

    if (target === undefined) {
      return false;
    }

    if (
      event.itemType !== "banana" ||
      event.bananaId.trim().length === 0 ||
      event.effect.itemType !== event.itemType
    ) {
      return false;
    }

    this.appliedBananaHitEventIds.add(event.eventId);
    this.appliedBananaHitBananaIds.add(event.bananaId);
    this.deactivateBananaHazardEntity({
      bananaId: event.bananaId,
      tickIndex: event.tickIndex,
      elapsedSeconds: event.elapsedSeconds,
      reason: "collision",
      collisionEventId: event.eventId,
      collidedRacerId: event.targetRacerId
    });
    this.removeActiveBananaObstacle(event.bananaId);

    if (event.elapsedSeconds > this.elapsedSeconds) {
      this.pendingBananaHitEvents.push(event);
      this.pendingBananaHitEvents.sort(compareItemHitEvents);
      return true;
    }

    applyItemTypeHit(
      target,
      event.itemType,
      event.impact,
      createTimeAlignedItemHitEffect(
        event.effect,
        event.elapsedSeconds,
        this.elapsedSeconds
      ),
      createItemHitSourceId(event.itemType, event.bananaId)
    );

    return true;
  }

  public applyBananaRemovalEvent(event: RaceBananaRemovalEvent): boolean {
    if (this.appliedBananaRemovalEventIds.has(event.eventId)) {
      return false;
    }

    if (
      event.itemType !== "banana" ||
      event.eventId.trim().length === 0 ||
      event.bananaId.trim().length === 0
    ) {
      return false;
    }

    const owner = this.racersById.get(event.ownerRacerId);

    if (owner === undefined || owner.slotIndex !== event.ownerSlotIndex) {
      return false;
    }

    this.appliedBananaRemovalEventIds.add(event.eventId);
    this.appliedBananaRemovalBananaIds.add(event.bananaId);
    this.deactivateBananaHazardEntityFromRemovalEvent(event);
    this.removeActiveBananaObstacle(event.bananaId);

    return true;
  }

  public clearActiveBananaHazardsForRaceReset():
    readonly RaceBananaRemovalEvent[] {
    const removals = this.clearActiveBananaHazards("race-reset", {
      tickIndex: this.tickIndex,
      deltaSeconds: 0,
      elapsedSeconds: this.elapsedSeconds
    });

    this.bananaHazardEntitiesById.clear();

    return removals;
  }

  private removeActiveBananaObstacle(bananaId: string): void {
    const bananaIndex = this.activeItems.findIndex(
      (item) => item.type === "banana" && item.id === bananaId
    );

    if (bananaIndex >= 0) {
      this.activeItems.splice(bananaIndex, 1);
    }
  }

  private removeActiveShellProjectile(shellId: string): void {
    const shellIndex = this.activeItems.findIndex(
      (item) => item.type === "shell" && item.id === shellId
    );

    if (shellIndex >= 0) {
      this.activeItems.splice(shellIndex, 1);
    }
  }

  private storeBananaHazardEntity(
    banana: BananaObstacleState,
    deployment: RaceBananaHazardDeploymentContext
  ): void {
    this.bananaHazardEntitiesById.set(
      banana.id,
      createBananaHazardEntityState(banana, deployment)
    );
  }

  private deactivateBananaHazardEntityFromRemovalEvent(
    event: RaceBananaRemovalEvent
  ): void {
    this.deactivateBananaHazardEntity({
      bananaId: event.bananaId,
      tickIndex: event.tickIndex,
      elapsedSeconds: event.elapsedSeconds,
      reason: event.reason,
      collisionEventId: event.collisionEventId ?? null,
      collidedRacerId: event.collidedRacerId ?? null
    });
  }

  private deactivateBananaHazardEntity(
    deactivation: RaceBananaHazardDeactivationContext
  ): void {
    const entity = this.bananaHazardEntitiesById.get(deactivation.bananaId);

    if (entity === undefined) {
      return;
    }

    this.bananaHazardEntitiesById.set(
      deactivation.bananaId,
      createInactiveBananaHazardEntityState(entity, deactivation)
    );
  }

  private applyBoostActivationEventToRacer(
    event: RaceBoostActivationEvent,
    racer: RaceSessionRacerState
  ): void {
    const elapsedSinceEventSeconds =
      this.elapsedSeconds - event.elapsedSeconds;

    consumeHeldInventoryItem(racer, "boost");
    applyRacerBoostItemEffect(
      racer,
      Math.max(0, event.expiresAtElapsedSeconds - this.elapsedSeconds)
    );
    this.activeBoostActivationEventIdsByRacerId.set(racer.id, event.eventId);
    applyRacerItemUseLockout(
      racer,
      decayEventCooldownSeconds(event.cooldownSeconds, elapsedSinceEventSeconds)
    );
  }

  private forgetExpiredAuthoritativeEffectIds(
    racer: RaceSessionRacerState
  ): void {
    if (racer.boostSeconds <= 0 && racer.timedEffects.boost === undefined) {
      this.activeBoostActivationEventIdsByRacerId.delete(racer.id);
    }

    if (racer.spinoutSeconds <= 0 && racer.timedEffects.spinout === undefined) {
      this.activeSpinoutEffectIdsByRacerId.delete(racer.id);
    }
  }

  public tick(
    deltaSeconds: number,
    options: RaceSessionTickOptions = {}
  ): RaceSessionTickResult {
    const clampedDeltaSeconds = clamp(
      Number.isFinite(deltaSeconds) ? deltaSeconds : 0,
      MIN_TICK_SECONDS,
      MAX_TICK_SECONDS
    );
    this.tickIndex += 1;
    this.elapsedSeconds += clampedDeltaSeconds;

    const context: RaceSessionTickContext = {
      tickIndex: this.tickIndex,
      deltaSeconds: clampedDeltaSeconds,
      elapsedSeconds: this.elapsedSeconds
    };
    let aiUpdates = 0;
    const boostActivations: RaceBoostActivationEvent[] = [];
    const itemUseActions: RaceItemUseAction[] = [];
    const resolveControllerPath = createRaceSessionControllerPathResolver(
      options.controllerPaths
    );

    this.updateItemPickupRespawnStates(context.elapsedSeconds);

    for (const racer of this.racers) {
      updateRacerEffectTimers(racer, clampedDeltaSeconds);
      this.forgetExpiredAuthoritativeEffectIds(racer);
    }

    const controllerEligibility = this.createRacerEligibilitySnapshot();

    for (const racer of this.racers) {
      const eligibility = requireRacerEligibilityState(
        controllerEligibility,
        racer
      );
      const controllerPath = resolveControllerPath(racer);

      if (
        controllerPath === "ai-driver" &&
        racer.controller === "ai" &&
        eligibility.canRunAiController
      ) {
        this.updateAiRacer(racer, context);
        aiUpdates += 1;
      }

      const itemUse =
        controllerPath === "remote-snapshot"
          ? null
          : this.activateHeldItem(racer, context, eligibility);

      if (itemUse !== null) {
        itemUseActions.push(itemUse.itemUseAction);

        if (itemUse.boostActivation !== null) {
          boostActivations.push(itemUse.boostActivation);
        }
      }
    }

    const hazardCapBananaRemovals =
      this.clearOverflowActiveBananaHazards(context);

    this.applyPendingBoostActivationEvents();
    this.applyPendingItemHitEvents();

    const racerCollisionSweepStates =
      snapshotRacerCollisionSweepStates(this.racers);

    for (const racer of this.racers) {
      if (resolveControllerPath(racer) === "remote-snapshot") {
        continue;
      }

      integrateRacer(racer, context, this.baseTrack);
      racer.updateCount += 1;
    }

    const interactionEligibility = this.createRacerEligibilitySnapshot();
    const racerCollisionResolution = resolveSharedRacerCollisions(
      this.racers,
      this.baseTrack,
      this.trackCollisionData,
      this.obstacles,
      racerCollisionSweepStates,
      interactionEligibility
    );
    const itemHitOptions = this.createItemHitResolutionOptions();
    const activeItemUpdates = this.updateActiveItems(
      clampedDeltaSeconds,
      context,
      interactionEligibility,
      racerCollisionSweepStates,
      itemHitOptions
    );
    const itemPickupResolution =
      options.itemPickupAuthority === "remote"
        ? createEmptyItemPickupResolutionResult()
        : this.resolveItemPickups(context, interactionEligibility);
    const itemHits = resolveActiveItemHits(
      this.racers,
      this.activeItems,
      context,
      interactionEligibility,
      racerCollisionSweepStates,
      itemHitOptions,
      (shell, target, impact, effect, hitContext) =>
        this.createShellHitEvent(shell, target, impact, effect, hitContext),
      (banana, target, impact, effect, hitContext) =>
        this.createBananaHitEvent(banana, target, impact, effect, hitContext),
      (item) => this.isResolvedActiveItem(item)
    );
    const shellHits = [...activeItemUpdates.shellHits, ...itemHits.shellHits];
    const bananaRemovals = [
      ...hazardCapBananaRemovals,
      ...activeItemUpdates.bananaRemovals,
      ...itemHits.bananaHits.map((hit) =>
        this.createBananaRemovalEventFromHit(hit)
      )
    ];
    const finishBananaRemovals = this.updateRaceProgression(context);
    const allBananaRemovals = [...bananaRemovals, ...finishBananaRemovals];

    for (const racer of this.racers) {
      refreshRacerCollisionBounds(racer);
      this.onRacerTick?.(racer, context);
    }

    return {
      ...context,
      racerUpdates: this.racers.length,
      aiUpdates,
      kartCollisionPairChecks: racerCollisionResolution.pairChecks,
      kartCollisionContacts: racerCollisionResolution.contacts,
      activeItems: this.activeItems.length,
      trackEntityState: this.trackEntityState,
      trackEntities: this.trackEntityStates,
      activeTrackEntities: this.activeTrackEntityStates,
      eligibleItemPickupCollisions:
        itemPickupResolution.eligibleItemPickupCollisions,
      itemPickupCollections: itemPickupResolution.itemPickupCollections,
      boostActivations,
      shellHits,
      bananaHits: itemHits.bananaHits,
      bananaRemovals: allBananaRemovals,
      itemUseActions,
      raceProgress: this.raceProgress,
      participants: this.participantStates,
      availableItemPickups: this.itemPickups.filter(isRaceItemPickupActive)
        .length
    };
  }

  private updateAiRacer(
    racer: RaceSessionRacerState,
    context: RaceSessionTickContext
  ): void {
    if (racer.progress.finished) {
      racer.input = {
        ...racer.input,
        throttle: 0,
        brake: 1,
        steer: 0,
        useItem: false
      };
      return;
    }

    const recovery = this.updateAiRecoveryState(racer, context);

    if (recovery.shouldReset && recovery.reason !== null) {
      this.resetAiRacerFromRecovery(racer, recovery.reason);
    }

    const trackState = createTrackStateForProgress(
      this.baseTrack,
      racer.progress.trackProgress
    );
    const command = this.aiController.getCommand({
      kart: createAiKartState(racer, trackState),
      track: trackState,
      deltaSeconds: context.deltaSeconds,
      elapsedSeconds: context.elapsedSeconds
    });
    const recoveredCommand =
      !recovery.shouldReset && recovery.reason !== null
        ? createAiRecoveryReorientationCommand(
            racer,
            recovery.target,
            recovery.reason
          )
        : command;

    racer.input = {
      ...toRacerInputState(recoveredCommand, racer.input),
      useItem: shouldAiUseHeldItem(
        racer,
        this.racers,
        this.activeItems,
        this.baseTrack
      )
    };
  }

  private updateAiRecoveryState(
    racer: RaceSessionRacerState,
    context: RaceSessionTickContext
  ): AiRecoveryUpdate {
    const state =
      this.aiRecoveryStates.get(racer.id) ??
      createAiRacerRecoveryState(racer, this.baseTrack);
    const surface = getAiRecoverySurfaceState(
      racer,
      this.baseTrack,
      getRacerCollisionRadius(racer)
    );
    const absoluteProgress = getAiRecoveryAbsoluteProgress(
      racer,
      this.baseTrack
    );
    const progressDelta = Math.abs(
      absoluteProgress - state.lastAbsoluteProgress
    );
    const movementDelta = getPlanarDistance(racer.position, state.lastPosition);
    const itemRecovering = isRacerItemRecovering(racer);
    const isTryingToDrive =
      racer.input.throttle > 0.35 &&
      racer.input.brake < 0.8 &&
      !isRacerRecovering(racer);
    const isStalled =
      isTryingToDrive &&
      racer.speed <= AI_RECOVERY_STALL_SPEED_THRESHOLD &&
      progressDelta <= AI_RECOVERY_STALL_PROGRESS_EPSILON &&
      movementDelta <= AI_RECOVERY_STALL_MOVEMENT_EPSILON;
    const headingError = getAiRecoveryTrackHeadingError(
      racer,
      this.baseTrack
    );
    const isWrongDirection =
      headingError !== null &&
      !surface.needsReorientation &&
      !itemRecovering &&
      Math.abs(headingError) >= AI_RECOVERY_WRONG_DIRECTION_HEADING_RADIANS;
    const isCollisionStalled =
      racer.collisionControlSeconds > 0 &&
      !itemRecovering &&
      racer.speed <= AI_RECOVERY_COLLISION_STALL_SPEED_THRESHOLD &&
      progressDelta <= AI_RECOVERY_COLLISION_PROGRESS_EPSILON &&
      movementDelta <= AI_RECOVERY_COLLISION_MOVEMENT_EPSILON;

    state.stallSeconds = isStalled
      ? state.stallSeconds + context.deltaSeconds
      : 0;
    state.offTrackSeconds = surface.needsReorientation
      ? state.offTrackSeconds + context.deltaSeconds
      : 0;
    state.wrongDirectionSeconds = isWrongDirection
      ? state.wrongDirectionSeconds + context.deltaSeconds
      : 0;
    state.collisionSeconds = isCollisionStalled
      ? state.collisionSeconds + context.deltaSeconds
      : 0;
    state.resetCooldownSeconds = Math.max(
      0,
      state.resetCooldownSeconds - context.deltaSeconds
    );
    state.lastPosition = { ...racer.position };
    state.lastAbsoluteProgress = absoluteProgress;

    const reason = selectAiRecoveryReason(state);
    const shouldReset =
      state.resetCooldownSeconds <= 0 &&
      (state.offTrackSeconds >= AI_RECOVERY_OFF_TRACK_RESET_SECONDS ||
        state.collisionSeconds >= AI_RECOVERY_COLLISION_RESET_SECONDS ||
        state.wrongDirectionSeconds >=
          AI_RECOVERY_WRONG_DIRECTION_RESET_SECONDS ||
        state.stallSeconds >= AI_RECOVERY_STALL_RESET_SECONDS);

    this.aiRecoveryStates.set(racer.id, state);

    return {
      reason,
      shouldReset,
      target: getAiRecoveryTargetForReason(
        racer,
        this.baseTrack,
        surface,
        reason
      )
    };
  }

  private resetAiRacerFromRecovery(
    racer: RaceSessionRacerState,
    reason: AiRecoveryReason
  ): void {
    const resetPose = findAiRecoveryResetPose(
      racer,
      this.baseTrack,
      this.trackCollisionData,
      this.obstacles,
      this.racers
    );

    applyAiRecoveryResetPose(racer, resetPose, this.baseTrack);
    this.aiController.resetNavigationState?.(racer.id);

    this.aiRecoveryStates.set(racer.id, {
      ...createAiRacerRecoveryState(racer, this.baseTrack),
      resetCooldownSeconds: AI_RECOVERY_RESET_COOLDOWN_SECONDS,
      lastResetReason: reason
    });
  }

  private activateHeldItem(
    racer: RaceSessionRacerState,
    context: RaceSessionTickContext,
    eligibility: RaceSessionRacerEligibilityState
  ): {
    readonly itemUseAction: RaceItemUseAction;
    readonly boostActivation: RaceBoostActivationEvent | null;
  } | null {
    const heldItem = getUsableHeldInventoryItem(racer);

    if (
      !racer.input.useItem ||
      !eligibility.canUseHeldItem ||
      heldItem === null
    ) {
      return null;
    }

    let activatedBoost = false;
    let activeItemId: string | null = null;

    switch (heldItem) {
      case "boost":
        activateBoostStatusEffect(racer);
        consumeHeldInventoryItem(racer, heldItem);
        activatedBoost = true;
        break;
      case "shell":
        activeItemId = this.createItemId();
        this.activeItems.push(createShellProjectileState(racer, activeItemId));
        consumeHeldInventoryItem(racer, heldItem);
        break;
      case "banana":
        activeItemId = this.createItemId();
        {
          const banana = createBananaObstacleState(racer, activeItemId);

          this.activeItems.push(banana);
          this.storeBananaHazardEntity(banana, {
            tickIndex: context.tickIndex,
            elapsedSeconds: context.elapsedSeconds
          });
        }
        consumeHeldInventoryItem(racer, heldItem);
        break;
    }

    applyRacerItemUseLockout(racer, getItemUseCooldownSeconds(heldItem));
    racer.input = {
      ...racer.input,
      useItem: false
    };

    const itemUseAction = this.createItemUseAction(
      racer,
      heldItem,
      context,
      activeItemId,
      this.resolveItemActivationTargets(racer.id, heldItem, activeItemId)
    );

    if (activatedBoost) {
      const boostActivation = this.createBoostActivationEvent(racer, context);
      this.appliedBoostActivationEventIds.add(boostActivation.eventId);

      return {
        itemUseAction,
        boostActivation
      };
    }

    return {
      itemUseAction,
      boostActivation: null
    };
  }

  private updateRaceProgression(
    context: RaceSessionTickContext
  ): readonly RaceBananaRemovalEvent[] {
    const previousPhase = this.phase;
    const newlyFinishedRacers = this.racers
      .filter((racer) => racer.progress.finished && racer.finishPlace === null)
      .sort((left, right) =>
        compareNewlyFinishedRacers(left, right, this.baseTrack)
      );

    for (const racer of newlyFinishedRacers) {
      racer.finishPlace = this.nextFinishPlace;
      racer.finishTimeSeconds = resolveRacerFinishTimeSeconds(racer, context);
      racer.pendingFinishTimeSeconds = null;
      syncRacerPlacementState(racer);
      this.nextFinishPlace += 1;
    }

    this.refreshRaceRankings();
    this.phase = resolveRacePhaseAfterProgression(
      this.racers,
      this.baseTrack
    );

    if (previousPhase !== "finished" && this.phase === "finished") {
      return this.clearActiveBananaHazards("race-finished", context);
    }

    return [];
  }

  private clearActiveBananaHazards(
    reason: RaceBananaRemovalReason,
    context: RaceSessionTickContext
  ): readonly RaceBananaRemovalEvent[] {
    const removals: RaceBananaRemovalEvent[] = [];

    for (let index = this.activeItems.length - 1; index >= 0; index -= 1) {
      const item = this.activeItems[index];

      if (item === undefined || item.type !== "banana") {
        continue;
      }

      removals.push(this.createBananaRemovalEvent(item, reason, context));
      this.activeItems.splice(index, 1);
    }

    return removals;
  }

  private clearOverflowActiveBananaHazards(
    context: RaceSessionTickContext
  ): readonly RaceBananaRemovalEvent[] {
    const overflowCount =
      this.activeItems.filter(isBananaObstacleState).length -
      MAX_ACTIVE_BANANA_HAZARDS;

    if (overflowCount <= 0) {
      return [];
    }

    const removals: RaceBananaRemovalEvent[] = [];
    let remainingOverflow = overflowCount;

    for (
      let index = 0;
      index < this.activeItems.length && remainingOverflow > 0;
      index += 1
    ) {
      const item = this.activeItems[index];

      if (item === undefined || item.type !== "banana") {
        continue;
      }

      removals.push(this.createBananaRemovalEvent(item, "hazard-cap", context));
      this.activeItems.splice(index, 1);
      index -= 1;
      remainingOverflow -= 1;
    }

    return removals;
  }

  private refreshRaceRankings(): void {
    for (const entry of createRaceRanking(this.racers, this.baseTrack)) {
      const racer = this.racersById.get(entry.racerId);

      if (racer !== undefined) {
        racer.rank = entry.rank;
        syncRacerPlacementState(racer);
      }
    }
  }

  private updateItemPickupRespawnStates(elapsedSeconds: number): void {
    for (const pickup of this.itemPickups) {
      const wasAvailable = isRaceItemPickupActive(pickup);

      updateRaceItemPickupRespawnState(pickup, elapsedSeconds);

      if (!wasAvailable && isRaceItemPickupActive(pickup)) {
        this.clearItemPickupCollisionGate(pickup.id);
      }
    }
  }

  private getItemPickupCollisionGate(pickupId: string): Set<string> {
    const existingGate = this.itemPickupCollisionGatesByPickupId.get(pickupId);

    if (existingGate !== undefined) {
      return existingGate;
    }

    const gate = new Set<string>();
    this.itemPickupCollisionGatesByPickupId.set(pickupId, gate);

    return gate;
  }

  private clearItemPickupCollisionGate(pickupId: string): void {
    this.itemPickupCollisionGatesByPickupId.get(pickupId)?.clear();
  }

  private refreshItemPickupCollisionGate(pickup: RaceItemPickupState): void {
    const gate = this.itemPickupCollisionGatesByPickupId.get(pickup.id);

    if (
      gate === undefined ||
      gate.size === 0 ||
      !isRaceItemPickupActive(pickup)
    ) {
      return;
    }

    for (const racerId of gate) {
      const racer = this.racersById.get(racerId);

      if (
        racer === undefined ||
        !hasRacerItemPickupCollisionOverlap(racer, pickup)
      ) {
        gate.delete(racerId);
      }
    }
  }

  private updateActiveItems(
    deltaSeconds: number,
    context: RaceSessionTickContext,
    eligibilitySnapshot: RaceSessionRacerEligibilitySnapshot,
    racerSweepStates: ReadonlyMap<string, RacerCollisionSweepState>,
    itemHitOptions: ItemHitResolutionOptions
  ): ActiveItemUpdateResult {
    const shellHits: RaceShellHitEvent[] = [];
    const bananaRemovals: RaceBananaRemovalEvent[] = [];
    const targetRegistry = createRacerTargetRegistry(this.racers);

    assertEligibilitySnapshotCoversTargetRegistry(
      eligibilitySnapshot,
      targetRegistry
    );

    for (let index = this.activeItems.length - 1; index >= 0; index -= 1) {
      const item = this.activeItems[index];

      if (item === undefined) {
        continue;
      }

      const previousPosition = { ...item.position };

      if (this.isResolvedActiveItem(item)) {
        this.activeItems.splice(index, 1);
        continue;
      }

      const wasExpired =
        item.type === "shell" &&
        getFiniteNonNegativeNumber(item.ttlSeconds, 0) <= 0;
      const armedSecondsBeforeTick = item.armedSeconds;
      const activeDeltaSeconds = updateActiveItemLifetime(item, deltaSeconds);

      if (wasExpired) {
        this.activeItems.splice(index, 1);
        continue;
      }

      item.armedSeconds = Math.max(0, item.armedSeconds - activeDeltaSeconds);
      item.velocity = getActiveItemTickVelocity(item);
      item.position = addVector(
        item.position,
        scaleVector(item.velocity, activeDeltaSeconds)
      );

      if (item.type === "shell") {
        const armedSweepStartPosition = getActiveItemArmedSweepStartPosition(
          previousPosition,
          item.position,
          activeDeltaSeconds,
          armedSecondsBeforeTick
        );
        const shellBlocker = findShellTravelBlocker(
          item,
          this.baseTrack,
          this.obstacles,
          previousPosition
        );
        const hit =
          item.armedSeconds <= 0
            ? findShellHit(
                item,
                targetRegistry,
                eligibilitySnapshot,
                armedSweepStartPosition,
                racerSweepStates
              )
            : null;
        const hitTravelDistance = hit?.travelDistance ?? null;

        if (isShellBlockerBeforeHit(shellBlocker, hitTravelDistance)) {
          if (shellBlocker.type === "obstacle") {
            const resolution = applyShellObstacleContactResolution(
              item,
              shellBlocker.contact
            );

            if (resolution === "destroyed") {
              this.activeItems.splice(index, 1);
              continue;
            }
          } else {
            this.activeItems.splice(index, 1);
            continue;
          }
        }

        if (hit !== null) {
          const shellHit = this.resolveShellProjectileHitOnce(
            item,
            hit,
            context,
            itemHitOptions
          );

          if (shellHit !== null) {
            shellHits.push(shellHit);
          }

          this.activeItems.splice(index, 1);
          continue;
        }
      }

      const despawnReason = getActiveItemDespawnReason(
        item,
        this.baseTrack,
        this.obstacles
      );

      if (despawnReason !== null) {
        if (item.type === "banana" && despawnReason !== "expired") {
          bananaRemovals.push(
            this.createBananaRemovalEvent(item, despawnReason, context)
          );
        }

        this.activeItems.splice(index, 1);
      }
    }

    return {
      shellHits,
      bananaRemovals
    };
  }

  private createItemHitResolutionOptions(): ItemHitResolutionOptions {
    return {
      shellSpinoutSeconds: this.shellSpinoutGameplayTuning.spinoutSeconds,
      shellSpinoutRadians: this.shellSpinoutGameplayTuning.spinoutRadians,
      bananaHitSpinRadians: this.bananaSpinoutGameplayTuning.spinRadians,
      bananaSpinoutSeconds: this.bananaSpinoutGameplayTuning.spinoutSeconds,
      bananaSpinoutRadians: this.bananaSpinoutGameplayTuning.spinoutRadians
    };
  }

  private isResolvedActiveItem(item: ActiveRaceItemState): boolean {
    return (
      isResolvedActiveShellProjectile(item, this.appliedShellHitShellIds) ||
      isResolvedActiveBananaObstacle(
        item,
        this.appliedBananaHitBananaIds,
        this.appliedBananaRemovalBananaIds
      )
    );
  }

  private resolveShellProjectileHitOnce(
    shell: ShellProjectileState,
    hit: ActiveItemHitResult,
    context: RaceSessionTickContext,
    itemHitOptions: ItemHitResolutionOptions
  ): RaceShellHitEvent | null {
    if (this.appliedShellHitShellIds.has(shell.id)) {
      return null;
    }

    const effect = applyItemHit(
      hit.target.source,
      shell,
      hit.impact,
      itemHitOptions
    );

    return this.createShellHitEvent(
      shell,
      hit.target,
      hit.impact,
      effect,
      context
    );
  }

  private createItemId(): string {
    this.itemSequence += 1;
    return `item_${this.tickIndex}_${this.itemSequence}`;
  }

  private resolveItemPickups(
    context: RaceSessionTickContext,
    eligibilitySnapshot: RaceSessionRacerEligibilitySnapshot
  ): ItemPickupResolutionResult {
    const eligibleItemPickupCollisions: RaceItemPickupCollisionCandidate[] = [];
    const collections: RaceItemPickupCollectionEvent[] = [];

    for (const pickup of this.itemPickups) {
      this.refreshItemPickupCollisionGate(pickup);

      if (!isRaceItemPickupActive(pickup)) {
        continue;
      }

      const collisionGate = this.getItemPickupCollisionGate(pickup.id);
      const collector = findItemPickupCollector(
        this.racers,
        pickup,
        eligibilitySnapshot,
        collisionGate
      );

      if (collector === undefined) {
        continue;
      }

      const grantedItemType = resolveCatchUpWeightedPickupGrantItemType(
        pickup,
        collector,
        this.racers,
        this.baseTrack,
        context
      );

      if (!grantAcceptedItemPickupToRacer(collector, grantedItemType)) {
        continue;
      }

      eligibleItemPickupCollisions.push(
        this.createItemPickupCollisionCandidate(pickup, collector, context)
      );

      collectRaceItemPickup(pickup, context.elapsedSeconds);
      if (pickup.cooldownSeconds > 0) {
        collisionGate.add(collector.id);
      } else {
        collisionGate.clear();
      }

      const event = this.createItemPickupCollectionEvent(
        pickup,
        collector,
        context,
        grantedItemType
      );

      this.appliedPickupCollectionEventIds.add(event.eventId);
      collections.push(event);
    }

    return {
      eligibleItemPickupCollisions,
      itemPickupCollections: collections
    };
  }

  private createItemPickupCollisionCandidate(
    pickup: RaceItemPickupState,
    racer: RaceSessionRacerState,
    context: RaceSessionTickContext
  ): RaceItemPickupCollisionCandidate {
    return {
      pickupId: pickup.id,
      racerId: racer.id,
      racerSlotIndex: racer.slotIndex,
      itemType: pickup.itemType,
      tickIndex: context.tickIndex,
      elapsedSeconds: context.elapsedSeconds
    };
  }

  private createItemPickupCollectionEvent(
    pickup: RaceItemPickupState,
    racer: RaceSessionRacerState,
    context: RaceSessionTickContext,
    grantedItemType: CombatItemType
  ): RaceItemPickupCollectionEvent {
    this.pickupCollectionSequence += 1;

    return {
      eventId: `pickup_${context.tickIndex}_${this.pickupCollectionSequence}`,
      pickupId: pickup.id,
      racerId: racer.id,
      itemType: grantedItemType,
      tickIndex: context.tickIndex,
      elapsedSeconds: context.elapsedSeconds,
      cooldownSeconds: pickup.cooldownSeconds,
      respawnDeadlineElapsedSeconds:
        requireRaceItemPickupRespawnDeadline(pickup)
    };
  }

  private createBoostActivationEvent(
    racer: RaceSessionRacerState,
    context: RaceSessionTickContext
  ): RaceBoostActivationEvent {
    this.boostActivationSequence += 1;

    return {
      eventId: `boost_${context.tickIndex}_${this.boostActivationSequence}`,
      racerId: racer.id,
      tickIndex: context.tickIndex,
      elapsedSeconds: context.elapsedSeconds,
      durationSeconds: racer.boostSeconds,
      expiresAtElapsedSeconds: context.elapsedSeconds + racer.boostSeconds,
      cooldownSeconds: racer.itemUseCooldownSeconds
    };
  }

  private createShellHitEvent(
    shell: ShellProjectileState,
    target: RacerTarget<RaceSessionRacerState>,
    impact: RaceShellHitImpactData,
    effect: RaceItemHitEffectData,
    context: RaceSessionTickContext
  ): RaceShellHitEvent {
    this.shellHitSequence += 1;

    const event = {
      eventId: `shell_hit_${context.tickIndex}_${this.shellHitSequence}`,
      itemType: "shell",
      shellId: shell.id,
      sourceRacerId: shell.owner.racerId,
      sourceSlotIndex: shell.owner.slotIndex,
      targetRacerId: target.stableId,
      targetSlotIndex: target.slotIndex,
      tickIndex: context.tickIndex,
      elapsedSeconds: context.elapsedSeconds,
      impact,
      effect
    } satisfies RaceShellHitEvent;

    this.appliedShellHitEventIds.add(event.eventId);
    this.appliedShellHitShellIds.add(event.shellId);

    return event;
  }

  private createBananaHitEvent(
    banana: BananaObstacleState,
    target: RacerTarget<RaceSessionRacerState>,
    impact: RaceShellHitImpactData,
    effect: RaceItemHitEffectData,
    context: RaceSessionTickContext
  ): RaceBananaHitEvent {
    this.bananaHitSequence += 1;

    const event = {
      eventId: `banana_hit_${context.tickIndex}_${this.bananaHitSequence}`,
      itemType: "banana",
      bananaId: banana.id,
      sourceRacerId: banana.owner.racerId,
      sourceSlotIndex: banana.owner.slotIndex,
      targetRacerId: target.stableId,
      targetSlotIndex: target.slotIndex,
      tickIndex: context.tickIndex,
      elapsedSeconds: context.elapsedSeconds,
      impact,
      effect
    } satisfies RaceBananaHitEvent;

    this.appliedBananaHitEventIds.add(event.eventId);
    this.appliedBananaHitBananaIds.add(event.bananaId);

    return event;
  }

  private createBananaRemovalEvent(
    banana: BananaObstacleState,
    reason: RaceBananaRemovalReason,
    context: RaceSessionTickContext
  ): RaceBananaRemovalEvent {
    return this.createBananaRemovalEventFromFields({
      bananaId: banana.id,
      ownerRacerId: banana.owner.racerId,
      ownerSlotIndex: banana.owner.slotIndex,
      tickIndex: context.tickIndex,
      elapsedSeconds: context.elapsedSeconds,
      reason
    });
  }

  private createBananaRemovalEventFromHit(
    hit: RaceBananaHitEvent
  ): RaceBananaRemovalEvent {
    return this.createBananaRemovalEventFromFields({
      bananaId: hit.bananaId,
      ownerRacerId: hit.sourceRacerId,
      ownerSlotIndex: hit.sourceSlotIndex,
      tickIndex: hit.tickIndex,
      elapsedSeconds: hit.elapsedSeconds,
      reason: "collision",
      collisionEventId: hit.eventId,
      collidedRacerId: hit.targetRacerId
    });
  }

  private createBananaRemovalEventFromFields(
    fields: Omit<RaceBananaRemovalEvent, "eventId" | "itemType">
  ): RaceBananaRemovalEvent {
    this.bananaRemovalSequence += 1;

    const event = {
      eventId: `banana_remove_${fields.tickIndex}_${this.bananaRemovalSequence}`,
      itemType: "banana",
      ...fields
    } satisfies RaceBananaRemovalEvent;

    this.appliedBananaRemovalEventIds.add(event.eventId);
    this.appliedBananaRemovalBananaIds.add(event.bananaId);
    this.deactivateBananaHazardEntityFromRemovalEvent(event);

    return event;
  }

  private createItemUseAction(
    racer: RaceSessionRacerState,
    itemType: CombatItemType,
    context: RaceSessionTickContext,
    activeItemId: string | null,
    targetResolution: RaceItemActivationTargetResolution
  ): RaceItemUseAction {
    this.itemUseActionSequence += 1;

    return {
      actionId: `item_use_${context.tickIndex}_${this.itemUseActionSequence}`,
      action: getItemUseActionType(itemType),
      racerId: racer.id,
      itemType,
      tickIndex: context.tickIndex,
      elapsedSeconds: context.elapsedSeconds,
      activeItemId,
      candidateAffectedRacerIds:
        targetResolution.candidateAffectedRacerIds,
      candidateAffectedRacerIdsByKind:
        targetResolution.candidateAffectedRacerIdsByKind,
      targetResolution
    };
  }

  private applyPendingBoostActivationEvents(): void {
    if (this.pendingBoostActivationEvents.length === 0) {
      return;
    }

    const readyEvents: RaceBoostActivationEvent[] = [];
    const pendingEvents: RaceBoostActivationEvent[] = [];

    for (const event of this.pendingBoostActivationEvents) {
      if (event.elapsedSeconds <= this.elapsedSeconds) {
        readyEvents.push(event);
      } else {
        pendingEvents.push(event);
      }
    }

    this.pendingBoostActivationEvents = pendingEvents;

    for (const event of readyEvents) {
      const racer = this.racersById.get(event.racerId);

      if (racer !== undefined) {
        this.applyBoostActivationEventToRacer(event, racer);
      }
    }
  }

  private applyPendingItemHitEvents(): void {
    this.pendingShellHitEvents = this.applyReadyPendingItemHitEvents(
      this.pendingShellHitEvents,
      (event, racer) =>
        applyItemTypeHit(
          racer,
          event.itemType,
          event.impact,
          createTimeAlignedItemHitEffect(
            event.effect,
            event.elapsedSeconds,
            this.elapsedSeconds
          ),
          createItemHitSourceId(event.itemType, event.shellId)
        )
    );
    this.pendingBananaHitEvents = this.applyReadyPendingItemHitEvents(
      this.pendingBananaHitEvents,
      (event, racer) =>
        applyItemTypeHit(
          racer,
          event.itemType,
          event.impact,
          createTimeAlignedItemHitEffect(
            event.effect,
            event.elapsedSeconds,
            this.elapsedSeconds
          ),
          createItemHitSourceId(event.itemType, event.bananaId)
        )
    );
  }

  private applyReadyPendingItemHitEvents<
    ItemHitEvent extends RaceShellHitEvent | RaceBananaHitEvent
  >(
    events: readonly ItemHitEvent[],
    applyHit: (
      event: ItemHitEvent,
      racer: RaceSessionRacerState
    ) => void
  ): ItemHitEvent[] {
    if (events.length === 0) {
      return [];
    }

    const pendingEvents: ItemHitEvent[] = [];

    for (const event of events) {
      if (event.elapsedSeconds > this.elapsedSeconds) {
        pendingEvents.push(event);
        continue;
      }

      const racer = this.resolveNetworkStableItemHitTarget(event);

      if (racer !== undefined) {
        applyHit(event, racer);
      }
    }

    return pendingEvents;
  }

  private resolveNetworkStableItemHitTarget(
    event: RaceShellHitEvent | RaceBananaHitEvent
  ): RaceSessionRacerState | undefined {
    const targetRegistry = this.createRacerTargetRegistry();
    const source = targetRegistry.getTargetByStableId(event.sourceRacerId);
    const target = targetRegistry.getTargetByStableId(event.targetRacerId);

    if (
      source === undefined ||
      target === undefined ||
      source.slotIndex !== event.sourceSlotIndex ||
      target.slotIndex !== event.targetSlotIndex ||
      (source.stableId === target.stableId && event.itemType !== "banana")
    ) {
      return undefined;
    }

    return target.source;
  }
}

export function createRaceSession(
  options: RaceSessionOptions = {}
): RaceSession {
  return new RaceSession(options);
}

export type RaceSessionStartRosterOptions = Omit<RaceSessionOptions, "raceState">;

export function createRaceSessionFromStartRoster(
  roster: RaceStartRoster,
  options: RaceSessionStartRosterOptions = {}
): RaceSession {
  return createRaceSession({
    ...options,
    raceState: createRaceStateFromStartRoster(roster)
  });
}

function createRaceSessionControllerPathResolver(
  controllerPaths: RaceSessionRacerControllerPathMap | undefined
): (racer: RaceSessionRacerState) => RaceSessionRacerControllerPath {
  if (controllerPaths === undefined) {
    return getDefaultRaceSessionControllerPath;
  }

  return (racer) => {
    const configuredPath =
      isRaceSessionControllerPathReadonlyMap(controllerPaths)
        ? controllerPaths.get(racer.id)
        : controllerPaths[racer.id];

    return configuredPath ?? getDefaultRaceSessionControllerPath(racer);
  };
}

function isRaceSessionControllerPathReadonlyMap(
  controllerPaths: RaceSessionRacerControllerPathMap
): controllerPaths is ReadonlyMap<string, RaceSessionRacerControllerPath> {
  return typeof (controllerPaths as ReadonlyMap<string, unknown>).get === "function";
}

function getDefaultRaceSessionControllerPath(
  racer: RaceSessionRacerState
): RaceSessionRacerControllerPath {
  return racer.controller === "ai" ? "ai-driver" : "local-input";
}

function resolveSpinoutVerificationTargetRacer(
  session: RaceSession,
  options: RaceSessionSpinoutVerificationTriggerOptions
): RaceSessionRacerState {
  if (options.racerId !== undefined) {
    const racer = session.getRacerState(options.racerId);

    if (racer === undefined) {
      throw new Error(`Unknown spin-out verification racer id: ${options.racerId}`);
    }

    return racer;
  }

  if (options.slotIndex !== undefined) {
    if (!Number.isInteger(options.slotIndex) || options.slotIndex < 0) {
      throw new Error(
        `Spin-out verification slot index must be a non-negative integer; found ${options.slotIndex}.`
      );
    }

    const racer = session.getRacerStateBySlot(options.slotIndex);

    if (racer === undefined) {
      throw new Error(
        `Unknown spin-out verification racer slot: ${options.slotIndex}.`
      );
    }

    return racer;
  }

  const fallbackRacer = session.humanRacerStates[0] ?? session.racerStates[0];

  if (fallbackRacer === undefined) {
    throw new Error("Spin-out verification requires at least one racer.");
  }

  return fallbackRacer;
}

function getDefaultSpinoutDirection(racer: RaceSessionRacerState): 1 | -1 {
  return racer.slotIndex % 2 === 0 ? 1 : -1;
}

function assertRaceStartRacerCount(racerCount: number): void {
  if (racerCount !== RACE_CAPACITY) {
    throw new Error(
      `Race start requires exactly ${RACE_CAPACITY} racers, found ${racerCount}.`
    );
  }
}

function assertRaceSessionInitialSlotTransforms(
  racers: readonly RaceSessionRacerState[]
): void {
  if (racers.length !== RACE_CAPACITY) {
    throw new Error(
      `Race session requires ${RACE_CAPACITY} slot transforms, found ${racers.length}.`
    );
  }

  const slots = new Set<number>();

  for (let index = 0; index < racers.length; index += 1) {
    const racer = racers[index];

    if (racer === undefined) {
      throw new Error(`Race session is missing racer state at slot ${index}.`);
    }

    if (racer.slotIndex !== index) {
      throw new Error(
        `Race-session racer ${racer.id} must stay in slot order; expected slot ${index}, found ${racer.slotIndex}.`
      );
    }

    if (slots.has(racer.slotIndex)) {
      throw new Error(`Duplicate race-session racer slot: ${racer.slotIndex}`);
    }

    slots.add(racer.slotIndex);
    assertFiniteVector(
      racer.racer.spawn.position,
      `race-session racer ${racer.id} spawn position`
    );
    assertFiniteTransformNumber(
      racer.racer.spawn.headingRadians,
      `race-session racer ${racer.id} spawn heading`
    );
    assertVectorMatches(
      racer.position,
      racer.racer.spawn.position,
      `race-session racer ${racer.id} initial position`
    );
    assertVectorMatches(
      {
        x: racer.body.position.x,
        y: racer.body.position.y,
        z: racer.body.position.z
      },
      racer.racer.spawn.position,
      `race-session racer ${racer.id} initial physics body position`
    );
    assertTransformNumberMatches(
      racer.headingRadians,
      racer.racer.spawn.headingRadians,
      `race-session racer ${racer.id} initial heading`
    );
    assertVectorMatches(
      racer.forward,
      forwardFromHeading(racer.racer.spawn.headingRadians),
      `race-session racer ${racer.id} initial forward`
    );
  }
}

function createRaceSessionRacerState(
  racer: RegisteredRacer,
  collisionDimensions: KartCollisionDimensions
): RaceSessionRacerState {
  const position = { ...racer.spawn.position };
  const velocity = { x: 0, y: 0, z: 0 };
  const headingRadians = racer.spawn.headingRadians;
  const collisionBounds = createKartCollisionBounds(
    position,
    headingRadians,
    collisionDimensions
  );
  const physics = createKartPhysicsState({
    position,
    velocity,
    headingRadians,
    collisionDimensions,
    collisionBounds
  });

  return {
    racer,
    id: racer.id,
    slotIndex: racer.slotIndex,
    controller: racer.controller,
    displayName: racer.displayName,
    peerId: racer.peerId,
    isHost: racer.isHost,
    color: racer.color,
    input: { ...racer.input },
    progress: { ...racer.progress },
    position,
    velocity,
    knockbackVelocity: { x: 0, y: 0, z: 0 },
    forward: forwardFromHeading(headingRadians),
    headingRadians,
    body: physics.body,
    physics,
    collision: physics.collision,
    collisionDimensions,
    collisionBounds,
    speed: 0,
    grounded: true,
    ...createInitialRacerItemInventoryState(racer.heldItem),
    ...createInitialRacerItemEffectState(),
    collisionControlSeconds: 0,
    rank: racer.placement.rank,
    finishPlace: racer.placement.finishPlace,
    finishTimeSeconds: racer.placement.finishTimeSeconds,
    pendingFinishTimeSeconds: null,
    placement: { ...racer.placement },
    updateCount: 0
  };
}

function syncRacerPlacementState(racer: RaceSessionRacerState): void {
  racer.placement = {
    rank: racer.rank,
    finishPlace: racer.finishPlace,
    finishTimeSeconds: racer.finishTimeSeconds
  };
}

function assertFiniteVector(vector: Vector3, label: string): void {
  assertFiniteTransformNumber(vector.x, `${label}.x`);
  assertFiniteTransformNumber(vector.y, `${label}.y`);
  assertFiniteTransformNumber(vector.z, `${label}.z`);
}

function assertFiniteTransformNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`Expected ${label} to be finite, found ${value}.`);
  }
}

function assertVectorMatches(
  actual: Vector3,
  expected: Vector3,
  label: string
): void {
  assertTransformNumberMatches(actual.x, expected.x, `${label}.x`);
  assertTransformNumberMatches(actual.y, expected.y, `${label}.y`);
  assertTransformNumberMatches(actual.z, expected.z, `${label}.z`);
}

function assertTransformNumberMatches(
  actual: number,
  expected: number,
  label: string
): void {
  assertFiniteTransformNumber(actual, label);
  assertFiniteTransformNumber(expected, label);

  if (Math.abs(actual - expected) > RACE_SESSION_TRANSFORM_EPSILON) {
    throw new Error(`Expected ${label} to be ${expected}, found ${actual}.`);
  }
}

function createAiKartState(
  racer: RaceSessionRacerState,
  track: AiTrackState
): AiKartState {
  const physicsVelocity = {
    x: racer.physics.body.velocity.x,
    y: racer.physics.body.velocity.y,
    z: racer.physics.body.velocity.z
  };
  const driving = getDrivingStats(racer.racer);
  const maxSpeed =
    driving.maxSpeed *
    getRacerItemMaxSpeedMultiplier(racer) *
    getTrackSurfaceSpeedFactor(
      racer.position,
      track,
      getRacerCollisionRadius(racer)
    );

  return {
    racerId: racer.id,
    position: racer.position,
    velocity: racer.velocity,
    forward: racer.forward,
    headingRadians: racer.headingRadians,
    speed: racer.speed,
    maxSpeed,
    progress: racer.progress,
    grounded: racer.grounded,
    recovering: racer.recovering,
    physics: {
      position: {
        x: racer.physics.body.position.x,
        y: racer.physics.body.position.y,
        z: racer.physics.body.position.z
      },
      velocity: physicsVelocity,
      forward: racer.forward,
      headingRadians: racer.headingRadians,
      speed: getPlanarSpeed(physicsVelocity),
      collisionRecoverySeconds: racer.collisionControlSeconds,
      collisionRecoveryRatio: getRacerCollisionControlIntensity(racer)
    }
  };
}

function createTrackStateForProgress(
  track: AiTrackState,
  trackProgress: number
): AiTrackState {
  const waypoints = track.waypoints ?? [
    track.currentWaypoint,
    track.nextWaypoint,
    track.lookAheadWaypoint
  ];

  if (waypoints.length < 3) {
    return track;
  }

  const normalizedProgress = normalizeTrackProgress(
    trackProgress,
    track.totalLength
  );
  const currentIndex = findCurrentWaypointIndex(waypoints, normalizedProgress);
  const currentWaypoint = getWaypointAt(waypoints, currentIndex);
  const nextWaypoint = getWaypointAt(waypoints, currentIndex + 1);
  const lookAheadWaypoint = getWaypointAt(waypoints, currentIndex + 2);

  return {
    ...track,
    waypoints,
    currentWaypoint,
    nextWaypoint,
    lookAheadWaypoint
  };
}

function createAiRacerRecoveryState(
  racer: RaceSessionRacerState,
  track: AiTrackState
): AiRacerRecoveryState {
  return {
    racerId: racer.id,
    lastPosition: { ...racer.position },
    lastAbsoluteProgress: getAiRecoveryAbsoluteProgress(racer, track),
    stallSeconds: 0,
    offTrackSeconds: 0,
    wrongDirectionSeconds: 0,
    collisionSeconds: 0,
    resetCooldownSeconds: 0,
    lastResetReason: null
  };
}

function getAiRecoveryAbsoluteProgress(
  racer: RaceSessionRacerState,
  track: AiTrackState
): number {
  return (
    clamp(racer.progress.lap, 0, Math.max(track.lapCount, 0)) *
      Math.max(track.totalLength, 1) +
    normalizeTrackProgress(racer.progress.trackProgress, track.totalLength)
  );
}

function getAiRecoverySurfaceState(
  racer: RaceSessionRacerState,
  track: AiTrackState,
  radius: number
): AiRecoverySurfaceState {
  if (track.road !== undefined) {
    const surface = queryTrackSurfaceAtPoint(track.road, racer.position, radius);

    return {
      surface: surface.surface,
      needsReorientation: !surface.drivable,
      target: surface.drivable
        ? null
        : getRoadPoseAtTrackProgress(
            track.road,
            surface.trackProgress + AI_RECOVERY_OFF_TRACK_LOOKAHEAD_DISTANCE
          ).position
    };
  }

  const bounds = getTrackBounds(track);
  const target = {
    x: clamp(racer.position.x, bounds.minX + radius, bounds.maxX - radius),
    y: racer.position.y,
    z: clamp(racer.position.z, bounds.minZ + radius, bounds.maxZ - radius)
  };
  const outsideBounds =
    target.x !== racer.position.x || target.z !== racer.position.z;

  return {
    surface: outsideBounds ? "offTrack" : "road",
    needsReorientation: outsideBounds,
    target: outsideBounds ? target : null
  };
}

function getAiRecoveryRouteTarget(
  racer: RaceSessionRacerState,
  track: AiTrackState
): Vector3 | null {
  const trackState = createTrackStateForProgress(
    track,
    racer.progress.trackProgress
  );

  return trackState.lookAheadWaypoint.position;
}

function getAiRecoveryTargetForReason(
  racer: RaceSessionRacerState,
  track: AiTrackState,
  surface: AiRecoverySurfaceState,
  reason: AiRecoveryReason | null
): Vector3 | null {
  if (reason === null) {
    return null;
  }

  return reason === "offTrack"
    ? surface.target
    : getAiRecoveryRouteTarget(racer, track);
}

function selectAiRecoveryReason(
  state: AiRacerRecoveryState
): AiRecoveryReason | null {
  if (state.offTrackSeconds >= AI_RECOVERY_OFF_TRACK_REORIENT_SECONDS) {
    return "offTrack";
  }

  if (state.collisionSeconds >= AI_RECOVERY_COLLISION_REORIENT_SECONDS) {
    return "collision";
  }

  if (
    state.wrongDirectionSeconds >=
    AI_RECOVERY_WRONG_DIRECTION_REORIENT_SECONDS
  ) {
    return "wrongDirection";
  }

  if (state.stallSeconds >= AI_RECOVERY_STALL_REORIENT_SECONDS) {
    return "stall";
  }

  return null;
}

function getAiRecoveryTrackHeadingError(
  racer: RaceSessionRacerState,
  track: AiTrackState
): number | null {
  if (track.road !== undefined) {
    const projection = getNearestTrackRoadProjection(track.road, racer.position);
    const pose = getRoadPoseAtTrackProgress(
      track.road,
      projection.trackProgress + AI_RECOVERY_OFF_TRACK_LOOKAHEAD_DISTANCE
    );

    return getSignedHeadingDelta(racer.headingRadians, pose.headingRadians);
  }

  const routeTarget = getAiRecoveryRouteTarget(racer, track);

  return routeTarget === null
    ? null
    : getSignedHeadingErrorToTarget(racer, routeTarget);
}

function createAiRecoveryReorientationCommand(
  racer: RaceSessionRacerState,
  target: Vector3 | null,
  reason: AiRecoveryReason
): AiControllerCommand {
  if (target === null) {
    return {
      throttle: 0,
      brake: 1,
      steering: 0
    };
  }

  const headingError = getSignedHeadingErrorToTarget(racer, target);
  const turnRatio = Math.abs(headingError) / Math.PI;
  const steering = clamp(
    headingError / AI_RECOVERY_FULL_STEER_ANGLE_RADIANS,
    -1,
    1
  );

  return {
    throttle: getAiRecoveryThrottle(reason),
    brake: turnRatio > 0.58 ? AI_RECOVERY_HARD_TURN_BRAKE : 0,
    steering
  };
}

function getAiRecoveryThrottle(reason: AiRecoveryReason): number {
  switch (reason) {
    case "stall":
      return AI_RECOVERY_STALL_THROTTLE;
    case "collision":
      return AI_RECOVERY_COLLISION_THROTTLE;
    case "offTrack":
    case "wrongDirection":
      return AI_RECOVERY_REORIENT_THROTTLE;
  }
}

function getSignedHeadingErrorToTarget(
  racer: RaceSessionRacerState,
  target: Vector3
): number {
  const targetDirection = normalizePlanarPointOrNull(
    target.x - racer.position.x,
    target.z - racer.position.z
  );

  if (targetDirection === null) {
    return 0;
  }

  const targetHeading = Math.atan2(targetDirection.x, targetDirection.z);

  return getSignedHeadingDelta(racer.headingRadians, targetHeading);
}

function getSignedHeadingDelta(
  fromHeadingRadians: number,
  toHeadingRadians: number
): number {
  return (
    positiveModulo(
      toHeadingRadians - fromHeadingRadians + Math.PI,
      Math.PI * 2
    ) - Math.PI
  );
}

function findAiRecoveryResetPose(
  racer: RaceSessionRacerState,
  track: AiTrackState,
  trackCollisionLayer: TrackCollisionLayer,
  obstacles: readonly TrackObstacleCollider[],
  racers: readonly RaceSessionRacerState[]
): AiRecoveryResetPose {
  const fallbackPose = createAiRecoveryResetPose(
    track,
    getAiRecoveryResetTrackProgress(racer, track),
    0
  );

  if (track.road === undefined) {
    return fallbackPose;
  }

  const radius = getRacerCollisionRadius(racer);
  const maximumLateralOffset = Math.max(
    0,
    track.road.courseBoundary.drivableHalfWidth -
      radius -
      AI_RECOVERY_RESET_LATERAL_MARGIN
  );
  const lateralStep = Math.min(2.25, maximumLateralOffset);
  const lateralOffsets =
    lateralStep > 0
      ? [0, lateralStep, -lateralStep, lateralStep * 0.5, -lateralStep * 0.5]
      : [0];
  const progressOffsets = [
    0,
    -AI_RECOVERY_RESET_PROGRESS_SEARCH_DISTANCE,
    AI_RECOVERY_RESET_PROGRESS_SEARCH_DISTANCE,
    -AI_RECOVERY_RESET_PROGRESS_SEARCH_DISTANCE * 2,
    AI_RECOVERY_RESET_PROGRESS_SEARCH_DISTANCE * 2
  ];

  for (const progressOffset of progressOffsets) {
    for (const lateralOffset of lateralOffsets) {
      const candidate = createAiRecoveryResetPose(
        track,
        fallbackPose.trackProgress + progressOffset,
        lateralOffset
      );

      if (
        isAiRecoveryResetPoseValid(
          racer,
          candidate,
          track,
          trackCollisionLayer,
          obstacles,
          racers
        )
      ) {
        return candidate;
      }
    }
  }

  return fallbackPose;
}

function getAiRecoveryResetTrackProgress(
  racer: RaceSessionRacerState,
  track: AiTrackState
): number {
  if (track.road === undefined) {
    return racer.progress.trackProgress;
  }

  return getNearestTrackRoadProjection(track.road, racer.position).trackProgress;
}

function createAiRecoveryResetPose(
  track: AiTrackState,
  trackProgress: number,
  lateralOffset: number
): AiRecoveryResetPose {
  if (track.road === undefined) {
    return {
      position: { ...track.currentWaypoint.position },
      headingRadians: track.spawnOrientationRadians,
      trackProgress: normalizeTrackProgress(trackProgress, track.totalLength)
    };
  }

  const pose = getRoadPoseAtTrackProgress(track.road, trackProgress);
  const right = getRightVectorFromHeading(pose.headingRadians);

  return {
    position: {
      x: pose.position.x + right.x * lateralOffset,
      y: pose.position.y,
      z: pose.position.z + right.z * lateralOffset
    },
    headingRadians: pose.headingRadians,
    trackProgress: pose.trackProgress
  };
}

function isAiRecoveryResetPoseValid(
  racer: RaceSessionRacerState,
  pose: AiRecoveryResetPose,
  track: AiTrackState,
  trackCollisionLayer: TrackCollisionLayer,
  obstacles: readonly TrackObstacleCollider[],
  racers: readonly RaceSessionRacerState[]
): boolean {
  const collisionBounds = createKartCollisionBounds(
    pose.position,
    pose.headingRadians,
    racer.collisionDimensions
  );

  if (
    getTrackBoundaryCollisionResponse(
      collisionBounds,
      track,
      trackCollisionLayer
    ) !== null
  ) {
    return false;
  }

  if (
    detectKartBoundsTrackObstacleContacts(collisionBounds, {
      obstacleColliders: obstacles
    }).hasCollision
  ) {
    return false;
  }

  return racers.every(
    (otherRacer) =>
      otherRacer.id === racer.id ||
      detectKartCollisionBoundsOverlap(
        collisionBounds,
        refreshRacerCollisionBounds(otherRacer)
      ) === null
  );
}

function applyAiRecoveryResetPose(
  racer: RaceSessionRacerState,
  pose: AiRecoveryResetPose,
  track: AiTrackState
): void {
  racer.position = { ...pose.position };
  racer.headingRadians = normalizeOrientationRadians(pose.headingRadians);
  racer.forward = forwardFromHeading(racer.headingRadians);
  racer.speed = 0;
  racer.knockbackVelocity = { x: 0, y: 0, z: 0 };
  racer.velocity = { x: 0, y: 0, z: 0 };
  racer.collisionControlSeconds = 0;
  racer.input = {
    ...racer.input,
    throttle: 0,
    brake: 1,
    steer: 0,
    useItem: false
  };
  racer.progress = resolveRecoveredRacerProgress(
    racer.progress,
    pose,
    track
  );
  racer.recovering = isRacerRecovering(racer);
  refreshRacerCollisionBounds(racer);
}

function resolveRecoveredRacerProgress(
  progress: RacerProgressState,
  pose: AiRecoveryResetPose,
  track: AiTrackState
): RacerProgressState {
  const safeTrackLength = Math.max(track.totalLength, 1);
  const lapCount = Math.max(track.lapCount, 0);
  const lap = clampWholeNumber(progress.lap, 0, lapCount);
  const markers = getTrackProgressMarkers(track);

  if (markers.length < 2) {
    return createSessionRacerProgressState(
      {
        lap,
        checkpointIndex: resolveCheckpointIndex(track, pose.trackProgress),
        trackProgress: normalizeTrackProgress(
          pose.trackProgress,
          safeTrackLength
        ),
        finished: false
      },
      track
    );
  }

  const checkpointIndex = resolveConsistentProgressMarkerOrder(
    progress,
    markers,
    safeTrackLength
  );
  const trackProgress = resolveGatedTrackProgress({
    baseTrackProgress: normalizeTrackProgress(
      progress.trackProgress,
      safeTrackLength
    ),
    checkpointIndex,
    currentPosition: pose.position,
    track,
    markers,
    trackLength: safeTrackLength
  });

  return createSessionRacerProgressState(
    {
      lap,
      checkpointIndex,
      trackProgress,
      finished: false
    },
    track
  );
}

function getRoadPoseAtTrackProgress(
  road: TrackRoadGeometry,
  trackProgress: number
): AiRecoveryResetPose {
  const normalizedProgress = normalizeTrackProgress(
    trackProgress,
    road.totalLength
  );

  for (const segment of road.segments) {
    const isOnSegment =
      normalizedProgress + TRACK_PROGRESS_EPSILON >= segment.startProgress &&
      normalizedProgress <= segment.endProgress + TRACK_PROGRESS_EPSILON;

    if (!isOnSegment) {
      continue;
    }

    const start = getRoadCenterlinePoint(road, segment.startPointIndex);
    const end = getRoadCenterlinePoint(road, segment.endPointIndex);
    const ratio =
      segment.length <= Number.EPSILON
        ? 0
        : clamp(
            (normalizedProgress - segment.startProgress) / segment.length,
            0,
            1
          );

    return {
      position: interpolatePlanarPosition(start.position, end.position, ratio),
      headingRadians: Math.atan2(
        end.position.x - start.position.x,
        end.position.z - start.position.z
      ),
      trackProgress: normalizedProgress
    };
  }

  const start = getRoadCenterlinePoint(road, 0);
  const end = getRoadCenterlinePoint(road, 1);

  return {
    position: { ...start.position },
    headingRadians: Math.atan2(
      end.position.x - start.position.x,
      end.position.z - start.position.z
    ),
    trackProgress: 0
  };
}

function getRoadCenterlinePoint(
  road: TrackRoadGeometry,
  index: number
): TrackRoadGeometry["centerline"][number] {
  const point = road.centerline[positiveModulo(index, road.centerline.length)];

  if (point === undefined) {
    throw new Error(`Missing road centerline point at index ${index}.`);
  }

  return point;
}

function getRightVectorFromHeading(headingRadians: number): PlanarPoint {
  return {
    x: Math.cos(headingRadians),
    z: -Math.sin(headingRadians)
  };
}

function integrateRacer(
  racer: RaceSessionRacerState,
  context: RaceSessionTickContext,
  track: AiTrackState
): void {
  const deltaSeconds = context.deltaSeconds;

  if (deltaSeconds <= 0) {
    return;
  }

  const previousPosition = racer.position;
  const wasFinished = racer.progress.finished;
  const driving = getDrivingStats(racer.racer);
  const controls = resolveRacerControlInputs(racer);
  const accelerationMultiplier = getRacerItemAccelerationMultiplier(racer);
  const maxSpeedMultiplier = getRacerItemMaxSpeedMultiplier(racer);
  const collisionRadius = getRacerCollisionRadius(racer);
  const surfaceSpeedFactor = getTrackSurfaceSpeedFactor(
    racer.position,
    track,
    collisionRadius
  );
  const acceleration =
    controls.throttle *
    (driving.acceleration + getBoostAccelerationBonus(racer)) *
    accelerationMultiplier;
  const braking = controls.brake * driving.braking;
  const coasting =
    controls.throttle <= 0 || controls.coastDecelerationMultiplier > 1
      ? COAST_DECELERATION *
        RACE_SPEED_SCALE *
        controls.coastDecelerationMultiplier
      : 0;
  const maxSpeed = driving.maxSpeed * maxSpeedMultiplier * surfaceSpeedFactor;
  const nextSpeed = clamp(
    racer.speed + (acceleration - braking - coasting) * deltaSeconds,
    0,
    maxSpeed
  );
  const steerRate =
    BASE_STEER_RATE_RADIANS *
    RACE_SPEED_SCALE *
    driving.steeringResponsiveness *
    driving.traction;
  const speedSteerScale =
    maxSpeed <= 0 ? 0 : clamp(nextSpeed / maxSpeed, 0.25, 1);

  racer.headingRadians = normalizeOrientationRadians(
    racer.headingRadians +
    controls.steer *
    steerRate *
    speedSteerScale *
    deltaSeconds +
    getRacerSpinoutHeadingDelta(racer, deltaSeconds)
  );
  racer.speed =
    nextSpeed -
    controls.brake * REVERSE_BRAKE_FACTOR * RACE_SPEED_SCALE * deltaSeconds;
  racer.speed = clamp(racer.speed, 0, maxSpeed);
  racer.knockbackVelocity = decayRacerKnockbackVelocity(
    racer.knockbackVelocity,
    deltaSeconds
  );
  racer.forward = forwardFromHeading(racer.headingRadians);
  racer.velocity = getRacerTotalVelocity(racer);
  racer.position = addVector(
    racer.position,
    scaleVector(racer.velocity, deltaSeconds)
  );
  const progressAdvance = advanceProgressWithTransition(
    racer.progress,
    previousPosition,
    racer.position,
    track,
    collisionRadius
  );

  racer.progress = progressAdvance.progress;

  if (
    !wasFinished &&
    racer.progress.finished &&
    progressAdvance.finishCrossingRatio !== null
  ) {
    racer.pendingFinishTimeSeconds = estimateFinishTimeSeconds(
      context,
      progressAdvance.finishCrossingRatio
    );
  } else if (!racer.progress.finished) {
    racer.pendingFinishTimeSeconds = null;
  }

  refreshRacerCollisionBounds(racer);
}

interface RacerCollisionSweepState {
  readonly racerId: string;
  readonly position: Vector3;
  readonly headingRadians: number;
  readonly collisionBounds: KartCollisionBounds;
}

function snapshotRacerCollisionSweepStates(
  racers: readonly RaceSessionRacerState[]
): ReadonlyMap<string, RacerCollisionSweepState> {
  const states = new Map<string, RacerCollisionSweepState>();

  for (const racer of racers) {
    states.set(racer.id, {
      racerId: racer.id,
      position: { ...racer.position },
      headingRadians: racer.headingRadians,
      collisionBounds: refreshRacerCollisionBounds(racer)
    });
  }

  return states;
}

function createRaceSessionRacerEligibilitySnapshot(
  targetRegistry: RacerTargetRegistry<RaceSessionRacerState>
): RaceSessionRacerEligibilitySnapshot {
  const states = targetRegistry.targets.map(
    createRaceSessionRacerEligibilityState
  );
  const statesByRacerId = new Map<string, RaceSessionRacerEligibilityState>();
  const statesBySlot = new Map<number, RaceSessionRacerEligibilityState>();

  if (states.length !== RACE_CAPACITY) {
    throw new Error(
      `Race eligibility snapshot requires ${RACE_CAPACITY} racers, found ${states.length}.`
    );
  }

  for (const state of states) {
    statesByRacerId.set(state.racerId, state);
    statesBySlot.set(state.slotIndex, state);
  }

  return {
    states,
    statesByRacerId,
    statesBySlot
  };
}

function createRaceSessionRacerEligibilityState(
  target: RacerTarget<RaceSessionRacerState>
): RaceSessionRacerEligibilityState {
  return {
    racerId: target.id,
    stableId: target.stableId,
    slotIndex: target.slotIndex,
    kind: target.kind,
    controller: target.controller,
    ...target.eligibility
  };
}

function requireRacerEligibilityState(
  snapshot: RaceSessionRacerEligibilitySnapshot,
  racer: Pick<RaceSessionRacerState, "id" | "slotIndex">
): RaceSessionRacerEligibilityState {
  const eligibility = snapshot.statesByRacerId.get(racer.id);

  if (eligibility === undefined || eligibility.slotIndex !== racer.slotIndex) {
    throw new Error(
      `Missing eligibility state for racer ${racer.id} in slot ${racer.slotIndex}.`
    );
  }

  return eligibility;
}

function assertEligibilitySnapshotCoversTargetRegistry(
  snapshot: RaceSessionRacerEligibilitySnapshot,
  targetRegistry: RacerTargetRegistry<RaceSessionRacerState>
): void {
  for (const target of targetRegistry.targets) {
    requireRacerEligibilityState(snapshot, target.source);
  }
}

function updateRacerEffectTimers(
  racer: RaceSessionRacerState,
  deltaSeconds: number
): void {
  updateRacerItemEffectTimers(racer, deltaSeconds);
  updateRacerItemInventoryTimers(racer, deltaSeconds);
  racer.collisionControlSeconds = Math.max(
    0,
    racer.collisionControlSeconds - deltaSeconds
  );
  syncRacerRecoveringState(racer);
}

function activateBoostStatusEffect(racer: RaceSessionRacerState): void {
  applyRacerBoostItemEffect(racer, BOOST_DURATION_SECONDS);
}

function getItemUseCooldownSeconds(itemType: CombatItemType): number {
  return COMBAT_ITEM_REGISTRY[itemType].defaultRuntimeConfig.useCooldownSeconds;
}

function getItemUseActionType(itemType: CombatItemType): RaceItemUseActionType {
  switch (itemType) {
    case "boost":
      return "boost-use";
    case "shell":
      return "shell-use";
    case "banana":
      return "banana-use";
  }
}

function decayEventCooldownSeconds(
  cooldownSeconds: number,
  elapsedSinceEventSeconds: number
): number {
  return Math.max(
    0,
    cooldownSeconds - Math.max(0, elapsedSinceEventSeconds)
  );
}

function createInitialRacerItemInventoryState(
  heldItem: CombatItemType | null
): RaceItemInventoryState {
  return {
    heldItem,
    itemUseCooldownSeconds: 0
  };
}

function updateRacerItemInventoryTimers(
  racer: RaceItemInventoryState,
  deltaSeconds: number
): void {
  racer.itemUseCooldownSeconds = Math.max(
    0,
    racer.itemUseCooldownSeconds - deltaSeconds
  );
}

function canRacerReceiveInventoryGrant(
  racer: RaceItemInventoryState
): boolean {
  return racer.heldItem === null;
}

interface RacerInventoryGrantOptions {
  readonly acceptExistingMatchingItem?: boolean;
}

function grantItemToRacerInventory(
  racer: RaceItemInventoryState,
  itemType: CombatItemType,
  options: RacerInventoryGrantOptions = {}
): boolean {
  if (canRacerReceiveInventoryGrant(racer)) {
    racer.heldItem = itemType;
    return true;
  }

  return (
    options.acceptExistingMatchingItem === true && racer.heldItem === itemType
  );
}

function canRacerUseHeldInventoryItem(
  racer: RaceItemInventoryState
): boolean {
  return racer.heldItem !== null && racer.itemUseCooldownSeconds <= 0;
}

function getUsableHeldInventoryItem(
  racer: RaceItemInventoryState
): CombatItemType | null {
  return canRacerUseHeldInventoryItem(racer) ? racer.heldItem : null;
}

function consumeHeldInventoryItem(
  racer: RaceItemInventoryState,
  itemType: CombatItemType
): void {
  if (racer.heldItem === itemType) {
    racer.heldItem = null;
  }
}

function applyRacerItemUseLockout(
  racer: RaceItemInventoryState,
  cooldownSeconds: number
): void {
  racer.itemUseCooldownSeconds = Math.max(
    racer.itemUseCooldownSeconds,
    Math.max(0, cooldownSeconds)
  );
}

function compareBoostActivationEvents(
  left: RaceBoostActivationEvent,
  right: RaceBoostActivationEvent
): number {
  return (
    left.elapsedSeconds - right.elapsedSeconds ||
    left.tickIndex - right.tickIndex ||
    left.eventId.localeCompare(right.eventId)
  );
}

function compareItemHitEvents(
  left: RaceShellHitEvent | RaceBananaHitEvent,
  right: RaceShellHitEvent | RaceBananaHitEvent
): number {
  return (
    left.elapsedSeconds - right.elapsedSeconds ||
    left.tickIndex - right.tickIndex ||
    left.eventId.localeCompare(right.eventId)
  );
}

function isBoostActive(racer: RaceSessionRacerState): boolean {
  return racer.boostSeconds > 0;
}

function getBoostSpeedMultiplier(racer: RaceSessionRacerState): number {
  return isBoostActive(racer) ? BOOST_SPEED_MULTIPLIER : 1;
}

function getBoostAccelerationBonus(racer: RaceSessionRacerState): number {
  return isBoostActive(racer) ? BOOST_ACCELERATION_BONUS * RACE_SPEED_SCALE : 0;
}

function getRacerItemAccelerationMultiplier(
  racer: RaceSessionRacerState
): number {
  if (racer.stunSeconds > 0) {
    return STUN_ACCELERATION_MULTIPLIER;
  }

  if (racer.spinoutSeconds <= 0) {
    return 1;
  }

  return interpolateNumber(
    1,
    SPINOUT_MIN_ACCELERATION_MULTIPLIER,
    getRacerSpinoutControlIntensity(racer)
  );
}

function getRacerItemMaxSpeedMultiplier(
  racer: RaceSessionRacerState
): number {
  const boostMultiplier = getBoostSpeedMultiplier(racer);

  if (racer.stunSeconds > 0) {
    return boostMultiplier * STUN_MAX_SPEED_MULTIPLIER;
  }

  if (racer.spinoutSeconds <= 0) {
    return boostMultiplier;
  }

  return (
    boostMultiplier *
    interpolateNumber(
      1,
      SPINOUT_MIN_MAX_SPEED_MULTIPLIER,
      getRacerSpinoutControlIntensity(racer)
    )
  );
}

function isRacerControlLocked(racer: RaceSessionRacerState): boolean {
  return racer.stunSeconds > 0;
}

function isRacerRecovering(racer: RaceSessionRacerState): boolean {
  return isRacerItemRecovering(racer) || racer.collisionControlSeconds > 0;
}

function syncRacerRecoveringState(racer: RaceSessionRacerState): void {
  racer.recovering = isRacerRecovering(racer);
}

export interface RacerResolvedControlInput {
  readonly throttle: number;
  readonly brake: number;
  readonly steer: number;
  readonly coastDecelerationMultiplier: number;
}

function resolveRacerControlInputs(
  racer: RaceSessionRacerState
): RacerResolvedControlInput {
  if (isRacerControlLocked(racer)) {
    return {
      throttle: 0,
      brake: Math.max(racer.input.brake, STUN_RECOVERY_BRAKE_INPUT),
      steer: 0,
      coastDecelerationMultiplier: STUN_COAST_DECELERATION_MULTIPLIER
    };
  }

  if (racer.spinoutSeconds <= 0) {
    return applyCollisionControlImpactToResolvedControls(racer, {
      throttle: racer.input.throttle,
      brake: racer.input.brake,
      steer: racer.input.steer,
      coastDecelerationMultiplier: 1
    });
  }

  const spinoutIntensity = getRacerSpinoutControlIntensity(racer);

  return applyCollisionControlImpactToResolvedControls(racer, {
    throttle: 0,
    brake: SPINOUT_RECOVERY_BRAKE_INPUT * spinoutIntensity,
    steer: 0,
    coastDecelerationMultiplier: interpolateNumber(
      1,
      SPINOUT_COAST_DECELERATION_MULTIPLIER,
      spinoutIntensity
    )
  });
}

export function debugResolveRacerControlInputs(
  racer: RaceSessionRacerState
): RacerResolvedControlInput {
  return resolveRacerControlInputs(racer);
}

function getRacerSpinoutControlIntensity(
  racer: RaceSessionRacerState
): number {
  if (racer.spinoutSeconds <= 0) {
    return 0;
  }

  const durationSeconds = getRacerActiveSpinoutDurationSeconds(racer);
  const durationRatio = clamp(racer.spinoutSeconds / durationSeconds, 0, 1);
  const strengthRatio = getRacerActiveSpinoutStrengthRatio(
    racer,
    durationSeconds
  );

  return clamp(durationRatio * strengthRatio, 0, 1);
}

function getRacerActiveSpinoutDurationSeconds(
  racer: RaceSessionRacerState
): number {
  const timedSpinout = racer.timedEffects.spinout;

  if (
    timedSpinout !== undefined &&
    timedSpinout.durationSeconds > 0 &&
    timedSpinout.remainingSeconds > 0
  ) {
    return timedSpinout.durationSeconds;
  }

  return SPINOUT_FALLBACK_CONTROL_WINDOW_SECONDS;
}

function getRacerActiveSpinoutStrengthRatio(
  racer: RaceSessionRacerState,
  durationSeconds: number
): number {
  if (racer.spinoutAngularVelocity === 0) {
    return 1;
  }

  const referenceStrengthRadians =
    getRacerReferenceSpinoutStrengthRadians(racer);
  const activeStrengthRadians =
    Math.abs(racer.spinoutAngularVelocity) * durationSeconds;

  if (referenceStrengthRadians <= 0 || activeStrengthRadians <= 0) {
    return 1;
  }

  return clamp(
    activeStrengthRadians / referenceStrengthRadians,
    0,
    1
  );
}

function getRacerReferenceSpinoutStrengthRadians(
  racer: RaceSessionRacerState
): number {
  const sourceItemType =
    racer.timedEffects.spinout?.sourceItemType ?? racer.lastHitItemType;

  return sourceItemType === "banana"
    ? DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING.spinoutRadians
    : DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutRadians;
}

function applyCollisionControlImpactToResolvedControls(
  racer: RaceSessionRacerState,
  controls: RacerResolvedControlInput
): RacerResolvedControlInput {
  const collisionControlIntensity = getRacerCollisionControlIntensity(racer);

  if (collisionControlIntensity <= 0) {
    return controls;
  }

  return {
    throttle:
      controls.throttle *
      interpolateNumber(
        1,
        COLLISION_CONTROL_MIN_THROTTLE_FACTOR,
        collisionControlIntensity
      ),
    brake: controls.brake,
    steer:
      controls.steer *
      interpolateNumber(
        1,
        COLLISION_CONTROL_MIN_STEER_FACTOR,
        collisionControlIntensity
      ),
    coastDecelerationMultiplier:
      controls.coastDecelerationMultiplier *
      interpolateNumber(
        1,
        COLLISION_CONTROL_COAST_DECELERATION_MULTIPLIER,
        collisionControlIntensity
      )
  };
}

function getRacerCollisionControlIntensity(
  racer: RaceSessionRacerState
): number {
  return clamp(
    racer.collisionControlSeconds / COLLISION_CONTROL_DURATION_SECONDS,
    0,
    1
  );
}

function getRacerSpinoutHeadingDelta(
  racer: RaceSessionRacerState,
  deltaSeconds: number
): number {
  if (racer.spinoutSeconds <= 0 || racer.spinoutAngularVelocity === 0) {
    return 0;
  }

  return racer.spinoutAngularVelocity * deltaSeconds;
}

function resolveSharedRacerCollisions(
  racers: readonly RaceSessionRacerState[],
  track: AiTrackState,
  trackCollisionLayer: TrackCollisionLayer,
  obstacles: readonly TrackObstacleCollider[],
  sweepStates: ReadonlyMap<string, RacerCollisionSweepState> | null,
  eligibilitySnapshot: RaceSessionRacerEligibilitySnapshot
): { readonly pairChecks: number; readonly contacts: number } {
  let pairChecks = 0;
  let contacts = 0;

  for (const racer of racers) {
    resolveTrackBoundaryCollision(racer, track, trackCollisionLayer);
    resolveObstacleCollisions(racer, obstacles);
  }

  const collisionPairs = createSharedRacerCollisionPairs(
    racers,
    eligibilitySnapshot
  );

  for (let pass = 0; pass < COLLISION_RESOLUTION_PASSES; pass += 1) {
    for (const pair of collisionPairs) {
      const { left, right } = pair;

      pairChecks += 1;

      if (
        resolveRacerContact(
          left,
          right,
          track,
          trackCollisionLayer,
          obstacles,
          pass === 0 ? sweepStates?.get(left.id) ?? null : null,
          pass === 0 ? sweepStates?.get(right.id) ?? null : null
        )
      ) {
        contacts += 1;
      }
    }
  }

  for (const racer of racers) {
    resolveTrackBoundaryCollision(racer, track, trackCollisionLayer);
    resolveObstacleCollisions(racer, obstacles);
  }

  return {
    pairChecks,
    contacts
  };
}

function createSharedRacerCollisionPairs(
  racers: readonly RaceSessionRacerState[],
  eligibilitySnapshot: RaceSessionRacerEligibilitySnapshot
): readonly SharedRacerCollisionPair[] {
  const collisionRacers = racers.filter((racer) => {
    const eligibility = requireRacerEligibilityState(
      eligibilitySnapshot,
      racer
    );

    refreshRacerCollisionBounds(racer);
    return (
      eligibility.canParticipateInRacerCollisions &&
      racer.collision.canCollideWithRacers
    );
  });
  const pairs: SharedRacerCollisionPair[] = [];

  for (let leftIndex = 0; leftIndex < collisionRacers.length; leftIndex += 1) {
    const left = collisionRacers[leftIndex];

    if (left === undefined) {
      continue;
    }

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < collisionRacers.length;
      rightIndex += 1
    ) {
      const right = collisionRacers[rightIndex];

      if (right !== undefined) {
        pairs.push({ left, right });
      }
    }
  }

  return pairs;
}

function resolveTrackBoundaryCollision(
  racer: RaceSessionRacerState,
  track: AiTrackState,
  trackCollisionLayer: TrackCollisionLayer = DEFAULT_TRACK_COLLISION_LAYER
): void {
  let responseNormal: Vector3 | null = null;
  let responseSpeedFactor = 1;
  let responsePenetrationDepth = 0;

  for (
    let pass = 0;
    pass < STATIC_TRACK_COLLISION_RESOLUTION_PASSES;
    pass += 1
  ) {
    const collisionBounds = refreshRacerCollisionBounds(racer);
    const boundaryResponse = getTrackBoundaryCollisionResponse(
      collisionBounds,
      track,
      trackCollisionLayer,
      {
        deferSoftBoundaryResponse:
          racer.controller === "ai" &&
          racer.speed < AI_SHALLOW_BOUNDARY_RECOVERY_SPEED
      }
    );

    if (boundaryResponse === null) {
      break;
    }

    racer.position = boundaryResponse.position;
    responseNormal ??= boundaryResponse.normal;
    responseSpeedFactor = Math.min(
      responseSpeedFactor,
      boundaryResponse.speedFactor
    );
    responsePenetrationDepth = Math.max(
      responsePenetrationDepth,
      boundaryResponse.penetrationDepth
    );
  }

  if (responseNormal === null) {
    return;
  }

  applyStaticCollisionResponse(racer, responseNormal, {
    collisionType: "boundary",
    baseSpeedFactor: responseSpeedFactor,
    impactSpeed: getStaticCollisionImpactSpeed(racer, responseNormal),
    penetrationDepth: responsePenetrationDepth
  });
  separateRacerFromTrackBoundary(racer, track, trackCollisionLayer);
}

function resolveObstacleCollisions(
  racer: RaceSessionRacerState,
  obstacles: readonly TrackObstacleCollider[]
): void {
  let responseNormal: Vector3 | null = null;
  let responseSpeedFactor = 1;
  let responsePenetrationDepth = 0;

  for (
    let pass = 0;
    pass < STATIC_TRACK_COLLISION_RESOLUTION_PASSES;
    pass += 1
  ) {
    const collisionBounds = refreshRacerCollisionBounds(racer);
    const collision = detectKartBoundsTrackObstacleContacts(collisionBounds, {
      obstacleColliders: obstacles
    });

    if (!collision.hasCollision) {
      break;
    }

    const collisionNormal = getCollisionResponseNormal(
      collision.correction,
      collision.contacts
    );

    racer.position = collision.correctedCenter;
    responseNormal ??= collisionNormal;
    responseSpeedFactor = Math.min(responseSpeedFactor, collision.speedFactor);
    responsePenetrationDepth = Math.max(
      responsePenetrationDepth,
      collision.maxPenetrationDepth
    );
  }

  if (responseNormal === null) {
    return;
  }

  applyStaticCollisionResponse(racer, responseNormal, {
    collisionType: "obstacle",
    baseSpeedFactor: responseSpeedFactor,
    impactSpeed: getStaticCollisionImpactSpeed(racer, responseNormal),
    penetrationDepth: responsePenetrationDepth
  });
  racer.stunSeconds = Math.max(racer.stunSeconds, OBSTACLE_STUN_SECONDS);
  syncRacerRecoveringState(racer);
  separateRacerFromObstacles(racer, obstacles);
}

function separateRacerFromTrackBoundary(
  racer: RaceSessionRacerState,
  track: AiTrackState,
  trackCollisionLayer: TrackCollisionLayer
): void {
  for (
    let pass = 0;
    pass < STATIC_TRACK_COLLISION_RESOLUTION_PASSES;
    pass += 1
  ) {
    const boundaryResponse = getTrackBoundaryCollisionResponse(
      refreshRacerCollisionBounds(racer),
      track,
      trackCollisionLayer,
      {
        deferSoftBoundaryResponse:
          racer.controller === "ai" &&
          racer.speed < AI_SHALLOW_BOUNDARY_RECOVERY_SPEED
      }
    );

    if (boundaryResponse === null) {
      return;
    }

    racer.position = boundaryResponse.position;
  }

  refreshRacerCollisionBounds(racer);
}

function separateRacerFromObstacles(
  racer: RaceSessionRacerState,
  obstacles: readonly TrackObstacleCollider[]
): void {
  for (
    let pass = 0;
    pass < STATIC_TRACK_COLLISION_RESOLUTION_PASSES;
    pass += 1
  ) {
    const collision = detectKartBoundsTrackObstacleContacts(
      refreshRacerCollisionBounds(racer),
      { obstacleColliders: obstacles }
    );

    if (!collision.hasCollision) {
      return;
    }

    racer.position = collision.correctedCenter;
  }

  refreshRacerCollisionBounds(racer);
}

function resolveRacerContact(
  left: RaceSessionRacerState,
  right: RaceSessionRacerState,
  track: AiTrackState,
  trackCollisionLayer: TrackCollisionLayer,
  obstacles: readonly TrackObstacleCollider[],
  leftSweepState: RacerCollisionSweepState | null = null,
  rightSweepState: RacerCollisionSweepState | null = null
): boolean {
  const leftBounds = refreshRacerCollisionBounds(left);
  const rightBounds = refreshRacerCollisionBounds(right);
  const collision = detectKartCollisionBoundsOverlap(leftBounds, rightBounds);

  if (collision !== null) {
    resolveDeterministicRacerOverlap(
      left,
      right,
      collision.normal,
      collision.depth,
      track,
      trackCollisionLayer,
      obstacles
    );

    applyRacerContactResponse(
      left,
      right,
      collision.normal,
      collision.depth
    );

    return true;
  }

  const sweptCollision =
    leftSweepState !== null && rightSweepState !== null
      ? detectSweptRacerContact(leftSweepState, rightSweepState, left, right)
      : null;

  if (sweptCollision === null) {
    return false;
  }

  left.position = sweptCollision.leftPosition;
  right.position = sweptCollision.rightPosition;
  left.headingRadians = sweptCollision.leftHeadingRadians;
  right.headingRadians = sweptCollision.rightHeadingRadians;
  refreshRacerVelocity(left);
  refreshRacerVelocity(right);

  resolveDeterministicRacerOverlap(
    left,
    right,
    sweptCollision.normal,
    sweptCollision.depth,
    track,
    trackCollisionLayer,
    obstacles
  );

  applyRacerContactResponse(
    left,
    right,
    sweptCollision.normal,
    sweptCollision.depth
  );

  return true;
}

interface SweptRacerContact {
  readonly leftPosition: Vector3;
  readonly rightPosition: Vector3;
  readonly leftHeadingRadians: number;
  readonly rightHeadingRadians: number;
  readonly normal: Vector3;
  readonly depth: number;
}

function detectSweptRacerContact(
  previousLeft: RacerCollisionSweepState,
  previousRight: RacerCollisionSweepState,
  left: RaceSessionRacerState,
  right: RaceSessionRacerState
): SweptRacerContact | null {
  const startingOverlap = detectKartCollisionBoundsOverlap(
    previousLeft.collisionBounds,
    previousRight.collisionBounds
  );

  if (startingOverlap !== null) {
    return {
      leftPosition: previousLeft.position,
      rightPosition: previousRight.position,
      leftHeadingRadians: previousLeft.headingRadians,
      rightHeadingRadians: previousRight.headingRadians,
      normal: startingOverlap.normal,
      depth: Math.max(startingOverlap.depth, RACER_CONTACT_SEPARATION_EPSILON)
    };
  }

  const leftMovement = getPlanarDistance(previousLeft.position, left.position);
  const rightMovement = getPlanarDistance(
    previousRight.position,
    right.position
  );
  const totalMovement = leftMovement + rightMovement;

  if (totalMovement <= Number.EPSILON) {
    return null;
  }

  const sweepSteps = clampWholeNumber(
    Math.ceil(totalMovement / RACER_CONTACT_SWEEP_STEP_DISTANCE),
    1,
    RACER_CONTACT_SWEEP_MAX_STEPS
  );
  let lastClearRatio = 0;

  for (let step = 1; step <= sweepSteps; step += 1) {
    const ratio = step / sweepSteps;
    const contact = createSweptRacerContactAtRatio(
      previousLeft,
      previousRight,
      left,
      right,
      ratio
    );

    if (contact !== null) {
      return refineSweptRacerContact(
        previousLeft,
        previousRight,
        left,
        right,
        lastClearRatio,
        ratio,
        contact
      );
    }

    lastClearRatio = ratio;
  }

  return null;
}

function refineSweptRacerContact(
  previousLeft: RacerCollisionSweepState,
  previousRight: RacerCollisionSweepState,
  left: RaceSessionRacerState,
  right: RaceSessionRacerState,
  clearRatio: number,
  hitRatio: number,
  initialContact: SweptRacerContact
): SweptRacerContact {
  let low = clearRatio;
  let high = hitRatio;
  let bestContact = initialContact;

  for (
    let step = 0;
    step < RACER_CONTACT_SWEEP_REFINEMENT_STEPS;
    step += 1
  ) {
    const middle = (low + high) / 2;
    const contact = createSweptRacerContactAtRatio(
      previousLeft,
      previousRight,
      left,
      right,
      middle
    );

    if (contact === null) {
      low = middle;
    } else {
      high = middle;
      bestContact = contact;
    }
  }

  return bestContact;
}

function createSweptRacerContactAtRatio(
  previousLeft: RacerCollisionSweepState,
  previousRight: RacerCollisionSweepState,
  left: RaceSessionRacerState,
  right: RaceSessionRacerState,
  ratio: number
): SweptRacerContact | null {
  const leftPosition = interpolatePlanarPosition(
    previousLeft.position,
    left.position,
    ratio
  );
  const rightPosition = interpolatePlanarPosition(
    previousRight.position,
    right.position,
    ratio
  );
  const leftHeadingRadians = interpolateHeadingRadians(
    previousLeft.headingRadians,
    left.headingRadians,
    ratio
  );
  const rightHeadingRadians = interpolateHeadingRadians(
    previousRight.headingRadians,
    right.headingRadians,
    ratio
  );
  const leftBounds = createKartCollisionBounds(
    leftPosition,
    leftHeadingRadians,
    left.collisionDimensions
  );
  const rightBounds = createKartCollisionBounds(
    rightPosition,
    rightHeadingRadians,
    right.collisionDimensions
  );
  const overlap = detectKartCollisionBoundsOverlap(leftBounds, rightBounds);

  if (overlap === null) {
    return null;
  }

  return {
    leftPosition,
    rightPosition,
    leftHeadingRadians,
    rightHeadingRadians,
    normal: overlap.normal,
    depth: Math.max(overlap.depth, RACER_CONTACT_SEPARATION_EPSILON)
  };
}

function interpolateHeadingRadians(
  startRadians: number,
  endRadians: number,
  ratio: number
): number {
  const fullTurnRadians = Math.PI * 2;
  const shortestDelta =
    positiveModulo(
      endRadians - startRadians + Math.PI,
      fullTurnRadians
    ) - Math.PI;

  return normalizeOrientationRadians(
    startRadians + shortestDelta * clamp(ratio, 0, 1)
  );
}

interface RacerSeparationCandidate {
  readonly leftPosition: Vector3;
  readonly rightPosition: Vector3;
  readonly totalMovement: number;
  readonly resolved: boolean;
}

function resolveDeterministicRacerOverlap(
  left: RaceSessionRacerState,
  right: RaceSessionRacerState,
  collisionNormal: Pick<Vector3, "x" | "z">,
  collisionDepth: number,
  track: AiTrackState,
  trackCollisionLayer: TrackCollisionLayer,
  obstacles: readonly TrackObstacleCollider[]
): void {
  const leftBounds = refreshRacerCollisionBounds(left);
  const rightBounds = refreshRacerCollisionBounds(right);
  const minimumTotalDistance =
    collisionDepth + RACER_CONTACT_SEPARATION_EPSILON;
  const maximumTotalDistance = Math.max(
    minimumTotalDistance,
    leftBounds.boundingRadius +
      rightBounds.boundingRadius +
      RACER_CONTACT_SEPARATION_EPSILON
  );
  const axes = getDeterministicRacerSeparationAxes(
    left,
    right,
    collisionNormal,
    track
  );
  let fallbackCandidate: RacerSeparationCandidate | null = null;

  for (const axis of axes) {
    const candidate = findValidRacerSeparationCandidate(
      left,
      right,
      axis,
      minimumTotalDistance,
      maximumTotalDistance,
      track,
      trackCollisionLayer,
      obstacles
    );

    if (candidate === null) {
      continue;
    }

    if (candidate.resolved) {
      applyRacerSeparationCandidate(left, right, candidate);
      return;
    }

    if (
      fallbackCandidate === null ||
      candidate.totalMovement > fallbackCandidate.totalMovement
    ) {
      fallbackCandidate = candidate;
    }
  }

  if (fallbackCandidate !== null) {
    applyRacerSeparationCandidate(left, right, fallbackCandidate);
  }
}

function findValidRacerSeparationCandidate(
  left: RaceSessionRacerState,
  right: RaceSessionRacerState,
  axis: PlanarPoint,
  minimumTotalDistance: number,
  maximumTotalDistance: number,
  track: AiTrackState,
  trackCollisionLayer: TrackCollisionLayer,
  obstacles: readonly TrackObstacleCollider[]
): RacerSeparationCandidate | null {
  let bestCandidate: RacerSeparationCandidate | null = null;

  for (
    let step = 0;
    step <= RACER_CONTACT_SEPARATION_DISTANCE_STEPS;
    step += 1
  ) {
    const totalDistance =
      step === 0
        ? minimumTotalDistance
        : interpolateNumber(
            minimumTotalDistance,
            maximumTotalDistance,
            step / RACER_CONTACT_SEPARATION_DISTANCE_STEPS
          );
    const candidate = createValidRacerSeparationCandidateForDistance(
      left,
      right,
      axis,
      totalDistance,
      track,
      trackCollisionLayer,
      obstacles
    );

    if (candidate === null) {
      continue;
    }

    if (candidate.resolved) {
      return candidate;
    }

    if (
      bestCandidate === null ||
      candidate.totalMovement > bestCandidate.totalMovement
    ) {
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

function createValidRacerSeparationCandidateForDistance(
  left: RaceSessionRacerState,
  right: RaceSessionRacerState,
  axis: PlanarPoint,
  totalDistance: number,
  track: AiTrackState,
  trackCollisionLayer: TrackCollisionLayer,
  obstacles: readonly TrackObstacleCollider[]
): RacerSeparationCandidate | null {
  const leftCapacity = getMaximumValidRacerDisplacement(
    left,
    axis,
    totalDistance,
    track,
    trackCollisionLayer,
    obstacles
  );
  const rightCapacity = getMaximumValidRacerDisplacement(
    right,
    { x: -axis.x, z: -axis.z },
    totalDistance,
    track,
    trackCollisionLayer,
    obstacles
  );
  const idealSplitDistance = totalDistance / 2;
  let leftDistance = Math.min(idealSplitDistance, leftCapacity);
  let rightDistance = Math.min(idealSplitDistance, rightCapacity);
  let remainingDistance = totalDistance - leftDistance - rightDistance;

  if (remainingDistance > Number.EPSILON) {
    const leftExtraDistance = Math.min(
      leftCapacity - leftDistance,
      remainingDistance
    );
    leftDistance += leftExtraDistance;
    remainingDistance -= leftExtraDistance;
  }

  if (remainingDistance > Number.EPSILON) {
    const rightExtraDistance = Math.min(
      rightCapacity - rightDistance,
      remainingDistance
    );
    rightDistance += rightExtraDistance;
  }

  const totalMovement = leftDistance + rightDistance;

  if (totalMovement <= Number.EPSILON) {
    return null;
  }

  const leftPosition = offsetPlanarPosition(left.position, axis, leftDistance);
  const rightPosition = offsetPlanarPosition(
    right.position,
    axis,
    -rightDistance
  );
  const leftBounds = createKartCollisionBounds(
    leftPosition,
    left.headingRadians,
    left.collisionDimensions
  );
  const rightBounds = createKartCollisionBounds(
    rightPosition,
    right.headingRadians,
    right.collisionDimensions
  );

  return {
    leftPosition,
    rightPosition,
    totalMovement,
    resolved: detectKartCollisionBoundsOverlap(leftBounds, rightBounds) === null
  };
}

function getMaximumValidRacerDisplacement(
  racer: RaceSessionRacerState,
  axis: PlanarPoint,
  maximumDistance: number,
  track: AiTrackState,
  trackCollisionLayer: TrackCollisionLayer,
  obstacles: readonly TrackObstacleCollider[]
): number {
  if (maximumDistance <= Number.EPSILON) {
    return 0;
  }

  if (
    isRacerPositionValidForCollisionResolution(
      racer,
      offsetPlanarPosition(racer.position, axis, maximumDistance),
      track,
      trackCollisionLayer,
      obstacles
    )
  ) {
    return maximumDistance;
  }

  if (
    !isRacerPositionValidForCollisionResolution(
      racer,
      racer.position,
      track,
      trackCollisionLayer,
      obstacles
    )
  ) {
    return getLargestSampledValidRacerDisplacement(
      racer,
      axis,
      maximumDistance,
      track,
      trackCollisionLayer,
      obstacles
    );
  }

  let low = 0;
  let high = maximumDistance;

  for (
    let step = 0;
    step < RACER_CONTACT_VALID_DISTANCE_STEPS;
    step += 1
  ) {
    const middle = (low + high) / 2;

    if (
      isRacerPositionValidForCollisionResolution(
        racer,
        offsetPlanarPosition(racer.position, axis, middle),
        track,
        trackCollisionLayer,
        obstacles
      )
    ) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return low;
}

function getLargestSampledValidRacerDisplacement(
  racer: RaceSessionRacerState,
  axis: PlanarPoint,
  maximumDistance: number,
  track: AiTrackState,
  trackCollisionLayer: TrackCollisionLayer,
  obstacles: readonly TrackObstacleCollider[]
): number {
  let largestValidDistance = 0;

  for (
    let step = 1;
    step <= RACER_CONTACT_VALID_DISTANCE_STEPS;
    step += 1
  ) {
    const distance =
      (maximumDistance * step) / RACER_CONTACT_VALID_DISTANCE_STEPS;

    if (
      isRacerPositionValidForCollisionResolution(
        racer,
        offsetPlanarPosition(racer.position, axis, distance),
        track,
        trackCollisionLayer,
        obstacles
      )
    ) {
      largestValidDistance = distance;
    }
  }

  return largestValidDistance;
}

function isRacerPositionValidForCollisionResolution(
  racer: RaceSessionRacerState,
  position: Vector3,
  track: AiTrackState,
  trackCollisionLayer: TrackCollisionLayer,
  obstacles: readonly TrackObstacleCollider[]
): boolean {
  const collisionBounds = createKartCollisionBounds(
    position,
    racer.headingRadians,
    racer.collisionDimensions
  );

  if (
    getTrackBoundaryCollisionResponse(
      collisionBounds,
      track,
      trackCollisionLayer
    ) !== null
  ) {
    return false;
  }

  return !detectKartBoundsTrackObstacleContacts(collisionBounds, {
    obstacleColliders: obstacles
  }).hasCollision;
}

function applyRacerSeparationCandidate(
  left: RaceSessionRacerState,
  right: RaceSessionRacerState,
  candidate: RacerSeparationCandidate
): void {
  left.position = candidate.leftPosition;
  right.position = candidate.rightPosition;
  refreshRacerCollisionBounds(left);
  refreshRacerCollisionBounds(right);
}

function getDeterministicRacerSeparationAxes(
  left: RaceSessionRacerState,
  right: RaceSessionRacerState,
  collisionNormal: Pick<Vector3, "x" | "z">,
  track: AiTrackState
): readonly PlanarPoint[] {
  const axes: PlanarPoint[] = [];

  appendSeparationAxis(axes, collisionNormal);
  appendSeparationAxis(axes, {
    x: left.position.x - right.position.x,
    z: left.position.z - right.position.z
  });

  const trackTangent = getTrackTangentSeparationAxis(left, right, track);

  if (trackTangent !== null) {
    appendBidirectionalSeparationAxis(axes, trackTangent);
    appendBidirectionalSeparationAxis(axes, {
      x: trackTangent.z,
      z: -trackTangent.x
    });
  }

  appendBidirectionalSeparationAxis(axes, left.forward);
  appendBidirectionalSeparationAxis(axes, {
    x: Math.cos(left.headingRadians),
    z: -Math.sin(left.headingRadians)
  });
  appendBidirectionalSeparationAxis(axes, right.forward);
  appendBidirectionalSeparationAxis(axes, {
    x: Math.cos(right.headingRadians),
    z: -Math.sin(right.headingRadians)
  });

  return axes;
}

function appendBidirectionalSeparationAxis(
  axes: PlanarPoint[],
  axis: Pick<Vector3, "x" | "z">
): void {
  appendSeparationAxis(axes, axis);
  appendSeparationAxis(axes, { x: -axis.x, z: -axis.z });
}

function appendSeparationAxis(
  axes: PlanarPoint[],
  axis: Pick<Vector3, "x" | "z">
): void {
  const normalized = normalizePlanarPointOrNull(axis.x, axis.z);

  if (normalized === null) {
    return;
  }

  if (
    axes.some(
      (existing) =>
        existing.x * normalized.x + existing.z * normalized.z >
        RACER_CONTACT_AXIS_DUPLICATE_DOT
    )
  ) {
    return;
  }

  axes.push(normalized);
}

function getTrackTangentSeparationAxis(
  left: RaceSessionRacerState,
  right: RaceSessionRacerState,
  track: AiTrackState
): PlanarPoint | null {
  if (track.road === undefined) {
    return null;
  }

  const midpoint = {
    x: (left.position.x + right.position.x) / 2,
    z: (left.position.z + right.position.z) / 2
  };
  const projection = getNearestTrackRoadProjection(track.road, midpoint);
  const segment = track.road.segments[projection.segmentIndex];

  if (segment === undefined) {
    return null;
  }

  const start = track.road.centerline[segment.startPointIndex];
  const end = track.road.centerline[segment.endPointIndex];

  if (start === undefined || end === undefined) {
    return null;
  }

  return normalizePlanarPointOrNull(
    end.position.x - start.position.x,
    end.position.z - start.position.z
  );
}

function resolveActiveItemHits(
  racers: readonly RaceSessionRacerState[],
  activeItems: ActiveRaceItemState[],
  context: RaceSessionTickContext,
  eligibilitySnapshot: RaceSessionRacerEligibilitySnapshot,
  racerSweepStates: ReadonlyMap<string, RacerCollisionSweepState> | null,
  itemHitOptions: ItemHitResolutionOptions,
  createShellHitEvent: (
    shell: ShellProjectileState,
    target: RacerTarget<RaceSessionRacerState>,
    impact: RaceShellHitImpactData,
    effect: RaceItemHitEffectData,
    context: RaceSessionTickContext
  ) => RaceShellHitEvent,
  createBananaHitEvent: (
    banana: BananaObstacleState,
    target: RacerTarget<RaceSessionRacerState>,
    impact: RaceShellHitImpactData,
    effect: RaceItemHitEffectData,
    context: RaceSessionTickContext
  ) => RaceBananaHitEvent,
  isItemAlreadyResolved: (item: ActiveRaceItemState) => boolean = () => false
): {
  readonly shellHits: readonly RaceShellHitEvent[];
  readonly bananaHits: readonly RaceBananaHitEvent[];
} {
  const shellHits: RaceShellHitEvent[] = [];
  const bananaHits: RaceBananaHitEvent[] = [];
  const targetRegistry = createRacerTargetRegistry(racers);

  assertEligibilitySnapshotCoversTargetRegistry(
    eligibilitySnapshot,
    targetRegistry
  );

  for (let itemIndex = activeItems.length - 1; itemIndex >= 0; itemIndex -= 1) {
    const item = activeItems[itemIndex];

    if (item === undefined) {
      continue;
    }

    if (isItemAlreadyResolved(item)) {
      activeItems.splice(itemIndex, 1);
      continue;
    }

    if (item.armedSeconds > 0) {
      continue;
    }

    const hit = findActiveItemHit(
      item,
      targetRegistry,
      eligibilitySnapshot,
      racerSweepStates
    );

    if (hit === null) {
      continue;
    }

    const effect = applyItemHit(
      hit.target.source,
      item,
      hit.impact,
      itemHitOptions
    );

    if (item.type === "banana" && !isResolvedItemHitEffect(effect)) {
      continue;
    }

    if (item.type === "shell") {
      shellHits.push(
        createShellHitEvent(item, hit.target, hit.impact, effect, context)
      );
    } else {
      bananaHits.push(
        createBananaHitEvent(item, hit.target, hit.impact, effect, context)
      );
    }

    activeItems.splice(itemIndex, 1);
  }

  return {
    shellHits,
    bananaHits
  };
}

function isResolvedItemHitEffect(effect: RaceItemHitEffectData): boolean {
  return (
    effect.blockedByShield === true ||
    effect.stunSeconds > 0 ||
    effect.spinoutSeconds > 0 ||
    effect.hitImmunitySeconds > 0 ||
    effect.hitFeedbackSeconds > 0 ||
    effect.speedFactor !== 1 ||
    effect.headingDeltaRadians !== 0
  );
}

interface ItemHitResolutionOptions {
  readonly shellSpinoutSeconds?: number;
  readonly shellSpinoutRadians?: number;
  readonly bananaHitSpinRadians?: number;
  readonly bananaSpinoutSeconds?: number;
  readonly bananaSpinoutRadians?: number;
}

function applyItemHit(
  racer: RaceSessionRacerState,
  item: Pick<ActiveRaceItemState, "id" | "type">,
  impact: RaceShellHitImpactData,
  options: ItemHitResolutionOptions = {}
): RaceItemHitEffectData {
  return applyItemTypeHit(
    racer,
    item.type,
    impact,
    null,
    createItemHitSourceId(item.type, item.id),
    options
  );
}

function createTimeAlignedItemHitEffect(
  effect: RaceItemHitEffectData,
  eventElapsedSeconds: number,
  sessionElapsedSeconds: number
): RaceItemHitEffectData {
  const elapsedSinceEventSeconds = Math.max(
    0,
    sessionElapsedSeconds - eventElapsedSeconds
  );

  if (elapsedSinceEventSeconds <= 0) {
    return effect;
  }

  const spinoutSeconds = decayEventCooldownSeconds(
    effect.spinoutSeconds,
    elapsedSinceEventSeconds
  );

  return {
    ...effect,
    stunSeconds: decayEventCooldownSeconds(
      effect.stunSeconds,
      elapsedSinceEventSeconds
    ),
    spinoutSeconds,
    spinoutAngularVelocity:
      spinoutSeconds > 0 ? effect.spinoutAngularVelocity : 0,
    hitImmunitySeconds: decayEventCooldownSeconds(
      effect.hitImmunitySeconds,
      elapsedSinceEventSeconds
    ),
    hitFeedbackSeconds: decayEventCooldownSeconds(
      effect.hitFeedbackSeconds,
      elapsedSinceEventSeconds
    )
  };
}

function applyItemTypeHit(
  racer: RaceSessionRacerState,
  itemType: Exclude<CombatItemType, "boost">,
  impact: RaceShellHitImpactData | null = null,
  effectOverride: RaceItemHitEffectData | null = null,
  sourceId: string | null = null,
  options: ItemHitResolutionOptions = {}
): RaceItemHitEffectData {
  const effect =
    effectOverride ?? createItemHitEffectData(racer, itemType, impact, options);
  const hitResult = applyRacerItemHitEffect(racer, effect, sourceId);
  const appliesRuntimeImpact = hitResult.applied && !hitResult.blockedByShield;
  const appliedEffect = {
    ...effect,
    stunSeconds: hitResult.applied ? effect.stunSeconds : 0,
    spinoutSeconds: hitResult.applied ? effect.spinoutSeconds : 0,
    spinoutAngularVelocity: hitResult.applied
      ? effect.spinoutAngularVelocity
      : 0,
    hitImmunitySeconds: hitResult.applied ? effect.hitImmunitySeconds : 0,
    hitFeedbackSeconds: hitResult.applied ? effect.hitFeedbackSeconds : 0,
    speedFactor: appliesRuntimeImpact ? effect.speedFactor : 1,
    speedAfterHit: appliesRuntimeImpact
      ? effectOverride === null
        ? racer.speed * effect.speedFactor
        : effect.speedAfterHit
      : racer.speed,
    headingDeltaRadians: appliesRuntimeImpact
      ? effect.headingDeltaRadians
      : 0,
    blockedByShield: hitResult.blockedByShield,
    shieldSecondsBeforeHit: hitResult.shieldSecondsBeforeHit,
    shieldSecondsAfterHit: hitResult.shieldSecondsAfterHit
  } satisfies RaceItemHitEffectData;

  if (appliesRuntimeImpact) {
    racer.speed =
      effectOverride === null
        ? racer.speed * appliedEffect.speedFactor
        : appliedEffect.speedAfterHit;
    applyRacerItemHitKnockback(racer, itemType, impact);

    if (appliedEffect.headingDeltaRadians !== 0) {
      racer.headingRadians = normalizeOrientationRadians(
        racer.headingRadians + appliedEffect.headingDeltaRadians
      );
    }
  }

  refreshRacerVelocity(racer);

  return appliedEffect;
}

function createItemHitSourceId(
  itemType: Exclude<CombatItemType, "boost">,
  itemId: string
): string {
  return `${itemType}:${itemId}`;
}

function createItemHitEffectData(
  racer: RaceSessionRacerState,
  itemType: Exclude<CombatItemType, "boost">,
  impact: RaceShellHitImpactData | null,
  options: ItemHitResolutionOptions = {}
): RaceItemHitEffectData {
  const speedBeforeHit = racer.speed;
  const spinDirection = getItemHitSpinDirection(racer, impact);
  const runtimeConfig = createItemHitRuntimeConfig(itemType, options);
  const itemSpinoutSeconds = runtimeConfig.spinoutSeconds;
  const unblockedHeadingDeltaRadians =
    itemType === "banana" && "spinRadians" in runtimeConfig
      ? spinDirection * runtimeConfig.spinRadians
      : 0;
  const blockedByShield =
    racer.shieldSeconds > 0 &&
    isNegativeItemHitRuntimeEffect(
      runtimeConfig.hitStunSeconds,
      itemSpinoutSeconds,
      runtimeConfig.hitSpeedFactor,
      unblockedHeadingDeltaRadians
    );
  const speedFactor = blockedByShield ? 1 : runtimeConfig.hitSpeedFactor;
  const spinoutAngularVelocity =
    blockedByShield || itemSpinoutSeconds <= 0
      ? 0
      : (spinDirection * runtimeConfig.spinoutRadians) / itemSpinoutSeconds;
  const headingDeltaRadians = blockedByShield
    ? 0
    : unblockedHeadingDeltaRadians;

  return {
    itemType,
    stunSeconds: blockedByShield ? 0 : runtimeConfig.hitStunSeconds,
    spinoutSeconds: blockedByShield ? 0 : itemSpinoutSeconds,
    spinoutAngularVelocity,
    hitImmunitySeconds: blockedByShield ? 0 : runtimeConfig.hitImmunitySeconds,
    hitFeedbackSeconds: blockedByShield ? 0 : runtimeConfig.hitFeedbackSeconds,
    speedFactor,
    speedBeforeHit,
    speedAfterHit: speedBeforeHit * speedFactor,
    headingDeltaRadians,
    blockedByShield,
    shieldSecondsBeforeHit: racer.shieldSeconds,
    shieldSecondsAfterHit: blockedByShield ? 0 : racer.shieldSeconds
  };
}

function createItemHitRuntimeConfig(
  itemType: Exclude<CombatItemType, "boost">,
  options: ItemHitResolutionOptions
): ShellRuntimeConfig | BananaRuntimeConfig {
  return itemType === "shell"
    ? createShellHitRuntimeConfig(options)
    : createBananaHitRuntimeConfig(options);
}

function createShellHitRuntimeConfig(
  options: ItemHitResolutionOptions
): ShellRuntimeConfig {
  const shellConfig = COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig;
  const configuredSpinout = createShellSpinoutGameplayTuning({
    spinoutSeconds: options.shellSpinoutSeconds ?? shellConfig.spinoutSeconds,
    spinoutRadians: options.shellSpinoutRadians ?? shellConfig.spinoutRadians
  });

  return {
    ...shellConfig,
    spinoutSeconds: configuredSpinout.spinoutSeconds,
    spinoutRadians: configuredSpinout.spinoutRadians
  };
}

function createBananaHitRuntimeConfig(
  options: ItemHitResolutionOptions
): BananaRuntimeConfig {
  const bananaConfig = COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig;
  const configuredSpinout = createBananaSpinoutGameplayTuning({
    spinRadians: options.bananaHitSpinRadians ?? bananaConfig.spinRadians,
    spinoutSeconds:
      options.bananaSpinoutSeconds ?? bananaConfig.spinoutSeconds,
    spinoutRadians:
      options.bananaSpinoutRadians ?? bananaConfig.spinoutRadians
  });

  return {
    ...bananaConfig,
    spinRadians: configuredSpinout.spinRadians,
    spinoutSeconds: configuredSpinout.spinoutSeconds,
    spinoutRadians: configuredSpinout.spinoutRadians
  };
}

function isNegativeItemHitRuntimeEffect(
  stunSeconds: number,
  spinoutSeconds: number,
  speedFactor: number,
  headingDeltaRadians: number
): boolean {
  return (
    stunSeconds > 0 ||
    spinoutSeconds > 0 ||
    speedFactor < 1 ||
    headingDeltaRadians !== 0
  );
}

function getItemHitSpinDirection(
  racer: RaceSessionRacerState,
  impact: RaceShellHitImpactData | null
): 1 | -1 {
  if (impact !== null) {
    const bounds = refreshRacerCollisionBounds(racer);
    const lateralHit =
      impact.normal.x * bounds.right.x + impact.normal.z * bounds.right.z;

    if (Math.abs(lateralHit) > Number.EPSILON) {
      return lateralHit >= 0 ? -1 : 1;
    }
  }

  return racer.slotIndex % 2 === 0 ? 1 : -1;
}

function applyRacerItemHitKnockback(
  racer: RaceSessionRacerState,
  itemType: Exclude<CombatItemType, "boost">,
  impact: RaceShellHitImpactData | null
): void {
  const knockbackVelocity = createItemHitKnockbackVelocity(itemType, impact);

  if (getPlanarSpeed(knockbackVelocity) <= 0) {
    return;
  }

  racer.knockbackVelocity = knockbackVelocity;
}

function createItemHitKnockbackVelocity(
  itemType: Exclude<CombatItemType, "boost">,
  impact: RaceShellHitImpactData | null
): Vector3 {
  if (impact === null) {
    return { x: 0, y: 0, z: 0 };
  }

  const direction = normalizePlanarPointOrNull(
    -impact.normal.x,
    -impact.normal.z
  );

  if (direction === null) {
    return { x: 0, y: 0, z: 0 };
  }

  const config = ITEM_HIT_KNOCKBACK_CONFIG_BY_TYPE[itemType];
  const relativeSpeed = Math.max(
    0,
    Number.isFinite(impact.relativeSpeed) ? impact.relativeSpeed : 0
  );
  const penetrationDepth = Math.max(
    0,
    Number.isFinite(impact.penetrationDepth) ? impact.penetrationDepth : 0
  );
  const speed = clamp(
    config.baseSpeed +
      relativeSpeed * config.relativeSpeedFactor +
      penetrationDepth * config.penetrationSpeedFactor,
    ITEM_HIT_KNOCKBACK_MIN_SPEED,
    config.maxSpeed
  );

  return {
    x: direction.x * speed,
    y: 0,
    z: direction.z * speed
  };
}

interface ActiveItemHitResult {
  readonly target: RacerTarget<RaceSessionRacerState>;
  readonly impact: RaceShellHitImpactData;
  readonly travelDistance: number | null;
}

function findActiveItemHit(
  item: ActiveRaceItemState,
  targetRegistry: RacerTargetRegistry<RaceSessionRacerState>,
  eligibilitySnapshot: RaceSessionRacerEligibilitySnapshot,
  racerSweepStates: ReadonlyMap<string, RacerCollisionSweepState> | null = null
): ActiveItemHitResult | null {
  if (item.type === "shell") {
    return findShellHit(
      item,
      targetRegistry,
      eligibilitySnapshot,
      null,
      racerSweepStates
    );
  }

  return findBananaHit(
    item,
    targetRegistry,
    eligibilitySnapshot,
    racerSweepStates
  );
}

function findShellHit(
  shell: ShellProjectileState,
  targetRegistry: RacerTargetRegistry<RaceSessionRacerState>,
  eligibilitySnapshot: RaceSessionRacerEligibilitySnapshot,
  previousPosition: Vector3 | null = null,
  racerSweepStates: ReadonlyMap<string, RacerCollisionSweepState> | null = null
): ActiveItemHitResult | null {
  let selectedHit: ActiveItemHitResult | null = null;

  for (const target of targetRegistry.getItemHitCandidates(shell.ownerRacerId)) {
    if (!canActiveItemHitLiveTarget(shell, target, eligibilitySnapshot)) {
      continue;
    }

    const racer = target.source;
    const racerSweepState = racerSweepStates?.get(racer.id) ?? null;

    const impact = getShellRacerHitImpact(
      shell,
      racer,
      previousPosition,
      racerSweepState
    );

    if (impact === null) {
      continue;
    }

    const hit = {
      target,
      impact,
      travelDistance:
        previousPosition === null
          ? null
          : getPlanarDistance(previousPosition, impact.shellPosition)
    } satisfies ActiveItemHitResult;

    if (
      selectedHit === null ||
      compareActiveItemHitResults(hit, selectedHit) < 0
    ) {
      selectedHit = hit;
    }
  }

  return selectedHit;
}

function findBananaHit(
  banana: BananaObstacleState,
  targetRegistry: RacerTargetRegistry<RaceSessionRacerState>,
  eligibilitySnapshot: RaceSessionRacerEligibilitySnapshot,
  racerSweepStates: ReadonlyMap<string, RacerCollisionSweepState> | null = null
): ActiveItemHitResult | null {
  let selectedHit: ActiveItemHitResult | null = null;

  for (const target of targetRegistry.itemHitTargets) {
    if (!canActiveItemHitLiveTarget(banana, target, eligibilitySnapshot)) {
      continue;
    }

    const racer = target.source;
    const racerSweepState = racerSweepStates?.get(racer.id) ?? null;

    const impact = getBananaRacerHitImpact(banana, racer, racerSweepState);

    if (impact === null) {
      continue;
    }

    const hit = {
      target,
      impact,
      travelDistance: null
    } satisfies ActiveItemHitResult;

    if (
      selectedHit === null ||
      compareActiveItemHitResults(hit, selectedHit) < 0
    ) {
      selectedHit = hit;
    }
  }

  return selectedHit;
}

function canActiveItemHitLiveTarget(
  item: ActiveRaceItemState,
  target: RacerTarget<RaceSessionRacerState>,
  eligibilitySnapshot: RaceSessionRacerEligibilitySnapshot
): boolean {
  const eligibility = requireRacerEligibilityState(
    eligibilitySnapshot,
    target.source
  );

  return (
    eligibility.canBlockActiveItems &&
    eligibility.canReceiveItemHits &&
    target.eligibility.canReceiveItemHits &&
    !target.source.progress.finished &&
    target.source.collision.canBlockItems &&
    target.source.itemHitImmunitySeconds <= 0 &&
    (item.type !== "shell" || target.source.spinoutSeconds <= 0) &&
    !hasActiveItemSourceAlreadyHitTarget(item, target.source)
  );
}

function hasActiveItemSourceAlreadyHitTarget(
  item: Pick<ActiveRaceItemState, "id" | "type">,
  target: Pick<RaceSessionRacerState, "hitSourceImmunitySecondsBySource">
): boolean {
  const sourceId = createItemHitSourceId(item.type, item.id);
  const remainingSeconds = getFiniteNonNegativeNumber(
    target.hitSourceImmunitySecondsBySource[sourceId] ?? 0,
    0
  );

  return remainingSeconds > 0;
}

function getShellRacerHitImpact(
  shell: ShellProjectileState,
  racer: RaceSessionRacerState,
  previousPosition: Vector3 | null = null,
  racerSweepState: RacerCollisionSweepState | null = null
): RaceShellHitImpactData | null {
  const directImpact = getActiveItemRacerHitImpact(
    shell,
    racer,
    () => getEmbeddedShellImpactNormal(shell),
    previousPosition
  );

  if (directImpact !== null) {
    return directImpact;
  }

  return getSweptShellMovingRacerHitImpact(
    shell,
    racer,
    previousPosition,
    racerSweepState
  );
}

function getBananaRacerHitImpact(
  banana: BananaObstacleState,
  racer: RaceSessionRacerState,
  racerSweepState: RacerCollisionSweepState | null = null
): RaceShellHitImpactData | null {
  const currentImpact = getActiveItemRacerHitImpact(banana, racer, () =>
    getEmbeddedBananaImpactNormal(banana, racer.position, racer)
  );

  if (currentImpact !== null || racerSweepState === null) {
    return currentImpact;
  }

  return getSweptBananaRacerHitImpact(banana, racer, racerSweepState);
}

function getSweptShellMovingRacerHitImpact(
  shell: ShellProjectileState,
  racer: RaceSessionRacerState,
  previousPosition: Vector3 | null,
  previousState: RacerCollisionSweepState | null
): RaceShellHitImpactData | null {
  const shellStart = previousPosition ?? shell.position;
  const shellMovement = getPlanarDistance(shellStart, shell.position);
  const racerMovement =
    previousState === null
      ? 0
      : getPlanarDistance(previousState.position, racer.position);
  const totalMovement = shellMovement + racerMovement;

  if (totalMovement <= Number.EPSILON) {
    return null;
  }

  const startingImpact = getSweptShellMovingRacerHitImpactAtRatio(
    shell,
    racer,
    shellStart,
    previousState,
    0
  );

  if (startingImpact !== null) {
    return startingImpact;
  }

  const sweepSteps = clampWholeNumber(
    Math.ceil(totalMovement / RACER_CONTACT_SWEEP_STEP_DISTANCE),
    1,
    RACER_CONTACT_SWEEP_MAX_STEPS
  );
  let lastClearRatio = 0;

  for (let step = 1; step <= sweepSteps; step += 1) {
    const ratio = step / sweepSteps;
    const impact = getSweptShellMovingRacerHitImpactAtRatio(
      shell,
      racer,
      shellStart,
      previousState,
      ratio
    );

    if (impact !== null) {
      return refineSweptShellMovingRacerHitImpact(
        shell,
        racer,
        shellStart,
        previousState,
        lastClearRatio,
        ratio,
        impact
      );
    }

    lastClearRatio = ratio;
  }

  return null;
}

function refineSweptShellMovingRacerHitImpact(
  shell: ShellProjectileState,
  racer: RaceSessionRacerState,
  shellStart: Vector3,
  previousState: RacerCollisionSweepState | null,
  clearRatio: number,
  hitRatio: number,
  initialImpact: RaceShellHitImpactData
): RaceShellHitImpactData {
  let low = clearRatio;
  let high = hitRatio;
  let bestImpact = initialImpact;

  for (
    let step = 0;
    step < RACER_CONTACT_SWEEP_REFINEMENT_STEPS;
    step += 1
  ) {
    const middle = (low + high) / 2;
    const impact = getSweptShellMovingRacerHitImpactAtRatio(
      shell,
      racer,
      shellStart,
      previousState,
      middle
    );

    if (impact === null) {
      low = middle;
    } else {
      high = middle;
      bestImpact = impact;
    }
  }

  return bestImpact;
}

function getSweptShellMovingRacerHitImpactAtRatio(
  shell: ShellProjectileState,
  racer: RaceSessionRacerState,
  shellStart: Vector3,
  previousState: RacerCollisionSweepState | null,
  ratio: number
): RaceShellHitImpactData | null {
  const shellPosition = interpolatePlanarPosition(
    shellStart,
    shell.position,
    ratio
  );
  const racerPosition =
    previousState === null
      ? racer.position
      : interpolatePlanarPosition(
          previousState.position,
          racer.position,
          ratio
        );
  const headingRadians =
    previousState === null
      ? racer.headingRadians
      : interpolateHeadingRadians(
          previousState.headingRadians,
          racer.headingRadians,
          ratio
        );
  const bounds = createKartCollisionBounds(
    racerPosition,
    headingRadians,
    racer.collisionDimensions
  );

  return getActiveItemPointRacerHitImpact(
    shell,
    racer,
    bounds,
    shellPosition,
    () => getEmbeddedShellImpactNormal(shell)
  );
}

function getActiveItemRacerHitImpact(
  item: Pick<ActiveRaceItemState, "position" | "velocity" | "radius">,
  racer: RaceSessionRacerState,
  getEmbeddedImpactNormal: () => Vector3,
  previousPosition: Vector3 | null = null
): RaceShellHitImpactData | null {
  const bounds = refreshRacerCollisionBounds(racer);
  const canUseSweptHit =
    previousPosition !== null &&
    getPlanarDistance(previousPosition, item.position) > Number.EPSILON;

  if (canUseSweptHit) {
    const sweptImpact = getSweptActiveItemRacerHitImpact(
      item,
      racer,
      bounds,
      previousPosition,
      getEmbeddedImpactNormal
    );

    if (sweptImpact !== null) {
      return sweptImpact;
    }
  }

  const currentImpact = getActiveItemPointRacerHitImpact(
    item,
    racer,
    bounds,
    item.position,
    getEmbeddedImpactNormal
  );

  return currentImpact;
}

function getActiveItemPointRacerHitImpact(
  item: Pick<ActiveRaceItemState, "position" | "velocity" | "radius">,
  racer: RaceSessionRacerState,
  bounds: KartCollisionBounds,
  itemPosition: Vector3,
  getEmbeddedImpactNormal: () => Vector3
): RaceShellHitImpactData | null {
  const delta = {
    x: itemPosition.x - bounds.center.x,
    z: itemPosition.z - bounds.center.z
  };
  const localX = delta.x * bounds.right.x + delta.z * bounds.right.z;
  const localZ = delta.x * bounds.forward.x + delta.z * bounds.forward.z;
  const clampedLocalX = clamp(localX, -bounds.halfWidth, bounds.halfWidth);
  const clampedLocalZ = clamp(localZ, -bounds.halfLength, bounds.halfLength);
  const closestPoint = {
    x:
      bounds.center.x +
      bounds.right.x * clampedLocalX +
      bounds.forward.x * clampedLocalZ,
    y: bounds.center.y,
    z:
      bounds.center.z +
      bounds.right.z * clampedLocalX +
      bounds.forward.z * clampedLocalZ
  };
  const normalOffset = {
    x: itemPosition.x - closestPoint.x,
    z: itemPosition.z - closestPoint.z
  };
  const separation = Math.hypot(normalOffset.x, normalOffset.z);

  if (separation > item.radius) {
    return null;
  }

  const normal =
    separation > Number.EPSILON
      ? {
          x: normalOffset.x / separation,
          y: 0,
          z: normalOffset.z / separation
        }
      : getEmbeddedImpactNormal();

  return {
    position: closestPoint,
    normal,
    shellPosition: { ...itemPosition },
    shellVelocity: { ...item.velocity },
    shellRadius: item.radius,
    targetHitboxCenter: { ...bounds.center },
    penetrationDepth: Math.max(0, item.radius - separation),
    relativeSpeed: getRelativePlanarSpeed(item.velocity, racer.velocity)
  };
}

function getSweptActiveItemRacerHitImpact(
  item: Pick<ActiveRaceItemState, "position" | "velocity" | "radius">,
  racer: RaceSessionRacerState,
  bounds: KartCollisionBounds,
  previousPosition: Vector3,
  getEmbeddedImpactNormal: () => Vector3
): RaceShellHitImpactData | null {
  const start = worldToKartLocalPoint(previousPosition, bounds);
  const end = worldToKartLocalPoint(item.position, bounds);
  const localHit = findSweptCircleBoxHit(
    start,
    end,
    bounds.halfWidth,
    bounds.halfLength,
    item.radius
  );

  if (localHit === null) {
    return null;
  }

  const shellPosition = kartLocalToWorldPoint(
    localHit.shellPoint,
    bounds,
    item.position.y
  );
  const impactPoint = kartLocalToWorldPoint(
    localHit.hitboxPoint,
    bounds,
    bounds.center.y
  );
  const normal =
    localHit.normal === null
      ? getEmbeddedImpactNormal()
      : {
          x:
            bounds.right.x * localHit.normal.x +
            bounds.forward.x * localHit.normal.z,
          y: 0,
          z:
            bounds.right.z * localHit.normal.x +
            bounds.forward.z * localHit.normal.z
        };

  return {
    position: impactPoint,
    normal,
    shellPosition,
    shellVelocity: { ...item.velocity },
    shellRadius: item.radius,
    targetHitboxCenter: { ...bounds.center },
    penetrationDepth: Math.max(0, item.radius - localHit.separation),
    relativeSpeed: getRelativePlanarSpeed(item.velocity, racer.velocity)
  };
}

interface SweptCircleBoxHit {
  readonly shellPoint: PlanarPoint;
  readonly hitboxPoint: PlanarPoint;
  readonly normal: PlanarPoint | null;
  readonly separation: number;
}

function findSweptCircleBoxHit(
  start: PlanarPoint,
  end: PlanarPoint,
  halfWidth: number,
  halfLength: number,
  radius: number
): SweptCircleBoxHit | null {
  const candidateTimes: number[] = [];

  addSweepCandidateTime(
    candidateTimes,
    findSegmentAabbIntersectionTime(
      start,
      end,
      -halfWidth,
      halfWidth,
      -halfLength - radius,
      halfLength + radius
    )
  );
  addSweepCandidateTime(
    candidateTimes,
    findSegmentAabbIntersectionTime(
      start,
      end,
      -halfWidth - radius,
      halfWidth + radius,
      -halfLength,
      halfLength
    )
  );

  for (const corner of [
    { x: -halfWidth, z: -halfLength },
    { x: halfWidth, z: -halfLength },
    { x: -halfWidth, z: halfLength },
    { x: halfWidth, z: halfLength }
  ] as const) {
    addSweepCandidateTime(
      candidateTimes,
      findSegmentCircleIntersectionTime(start, end, corner, radius)
    );
  }

  const time = Math.min(...candidateTimes);

  if (!Number.isFinite(time)) {
    return null;
  }

  const shellPoint = interpolatePlanarPoint(start, end, time);
  const hitboxPoint = {
    x: clamp(shellPoint.x, -halfWidth, halfWidth),
    z: clamp(shellPoint.z, -halfLength, halfLength)
  };
  const normalOffset = {
    x: shellPoint.x - hitboxPoint.x,
    z: shellPoint.z - hitboxPoint.z
  };
  const separation = Math.hypot(normalOffset.x, normalOffset.z);

  if (separation > radius + Number.EPSILON) {
    return null;
  }

  return {
    shellPoint,
    hitboxPoint,
    normal:
      separation > Number.EPSILON
        ? {
            x: normalOffset.x / separation,
            z: normalOffset.z / separation
          }
        : null,
    separation
  };
}

function addSweepCandidateTime(
  candidateTimes: number[],
  candidateTime: number | null
): void {
  if (
    candidateTime !== null &&
    Number.isFinite(candidateTime) &&
    candidateTime >= 0 &&
    candidateTime <= 1
  ) {
    candidateTimes.push(candidateTime);
  }
}

function findSegmentAabbIntersectionTime(
  start: PlanarPoint,
  end: PlanarPoint,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number
): number | null {
  const delta = {
    x: end.x - start.x,
    z: end.z - start.z
  };
  let entryTime = 0;
  let exitTime = 1;

  const xRange = updateSegmentSlabRange(
    start.x,
    delta.x,
    minX,
    maxX,
    entryTime,
    exitTime
  );

  if (xRange === null) {
    return null;
  }

  entryTime = xRange.entryTime;
  exitTime = xRange.exitTime;

  const zRange = updateSegmentSlabRange(
    start.z,
    delta.z,
    minZ,
    maxZ,
    entryTime,
    exitTime
  );

  return zRange?.entryTime ?? null;
}

function updateSegmentSlabRange(
  start: number,
  delta: number,
  minimum: number,
  maximum: number,
  entryTime: number,
  exitTime: number
): { readonly entryTime: number; readonly exitTime: number } | null {
  if (Math.abs(delta) <= Number.EPSILON) {
    return start >= minimum && start <= maximum
      ? { entryTime, exitTime }
      : null;
  }

  const inverseDelta = 1 / delta;
  const firstTime = (minimum - start) * inverseDelta;
  const secondTime = (maximum - start) * inverseDelta;
  const slabEntryTime = Math.min(firstTime, secondTime);
  const slabExitTime = Math.max(firstTime, secondTime);
  const nextEntryTime = Math.max(entryTime, slabEntryTime);
  const nextExitTime = Math.min(exitTime, slabExitTime);

  if (nextEntryTime - nextExitTime > Number.EPSILON) {
    return null;
  }

  return {
    entryTime: clamp(nextEntryTime, 0, 1),
    exitTime: clamp(nextExitTime, 0, 1)
  };
}

function findSegmentCircleIntersectionTime(
  start: PlanarPoint,
  end: PlanarPoint,
  center: PlanarPoint,
  radius: number
): number | null {
  const delta = {
    x: end.x - start.x,
    z: end.z - start.z
  };
  const offset = {
    x: start.x - center.x,
    z: start.z - center.z
  };
  const radiusSquared = radius * radius;
  const startDistanceSquared = offset.x * offset.x + offset.z * offset.z;

  if (startDistanceSquared <= radiusSquared) {
    return 0;
  }

  const a = delta.x * delta.x + delta.z * delta.z;

  if (a <= Number.EPSILON) {
    return null;
  }

  const b = 2 * (offset.x * delta.x + offset.z * delta.z);
  const c = startDistanceSquared - radiusSquared;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) {
    return null;
  }

  const root = Math.sqrt(discriminant);
  const firstTime = (-b - root) / (2 * a);
  const secondTime = (-b + root) / (2 * a);

  if (firstTime >= 0 && firstTime <= 1) {
    return firstTime;
  }

  if (secondTime >= 0 && secondTime <= 1) {
    return secondTime;
  }

  return null;
}

function interpolatePlanarPoint(
  start: PlanarPoint,
  end: PlanarPoint,
  time: number
): PlanarPoint {
  return {
    x: start.x + (end.x - start.x) * time,
    z: start.z + (end.z - start.z) * time
  };
}

function worldToKartLocalPoint(
  position: Vector3,
  bounds: KartCollisionBounds
): PlanarPoint {
  const delta = {
    x: position.x - bounds.center.x,
    z: position.z - bounds.center.z
  };

  return {
    x: delta.x * bounds.right.x + delta.z * bounds.right.z,
    z: delta.x * bounds.forward.x + delta.z * bounds.forward.z
  };
}

function kartLocalToWorldPoint(
  point: PlanarPoint,
  bounds: KartCollisionBounds,
  y: number
): Vector3 {
  return {
    x:
      bounds.center.x +
      bounds.right.x * point.x +
      bounds.forward.x * point.z,
    y,
    z:
      bounds.center.z +
      bounds.right.z * point.x +
      bounds.forward.z * point.z
  };
}

function getEmbeddedShellImpactNormal(shell: ShellProjectileState): Vector3 {
  const velocityNormal = normalizePlanarPointOrNull(
    -shell.velocity.x,
    -shell.velocity.z
  );

  if (velocityNormal !== null) {
    return {
      x: velocityNormal.x,
      y: 0,
      z: velocityNormal.z
    };
  }

  return {
    x: -shell.direction.x,
    y: 0,
    z: -shell.direction.z
  };
}

function getEmbeddedBananaImpactNormal(
  banana: BananaObstacleState,
  racerPosition: Vector3,
  racer: RaceSessionRacerState
): Vector3 {
  const centerNormal = normalizePlanarPointOrNull(
    banana.position.x - racerPosition.x,
    banana.position.z - racerPosition.z
  );

  if (centerNormal !== null) {
    return {
      x: centerNormal.x,
      y: 0,
      z: centerNormal.z
    };
  }

  const velocityNormal = normalizePlanarPointOrNull(
    -racer.velocity.x,
    -racer.velocity.z
  );

  if (velocityNormal !== null) {
    return {
      x: velocityNormal.x,
      y: 0,
      z: velocityNormal.z
    };
  }

  return {
    x: -racer.forward.x,
    y: 0,
    z: -racer.forward.z
  };
}

function getSweptBananaRacerHitImpact(
  banana: BananaObstacleState,
  racer: RaceSessionRacerState,
  previousState: RacerCollisionSweepState
): RaceShellHitImpactData | null {
  const startingImpact = getActiveItemPointRacerHitImpact(
    banana,
    racer,
    previousState.collisionBounds,
    banana.position,
    () => getEmbeddedBananaImpactNormal(banana, previousState.position, racer)
  );

  if (startingImpact !== null) {
    return startingImpact;
  }

  const movement = getPlanarDistance(previousState.position, racer.position);

  if (movement <= Number.EPSILON) {
    return null;
  }

  const sweepSteps = clampWholeNumber(
    Math.ceil(movement / RACER_CONTACT_SWEEP_STEP_DISTANCE),
    1,
    RACER_CONTACT_SWEEP_MAX_STEPS
  );
  let lastClearRatio = 0;

  for (let step = 1; step <= sweepSteps; step += 1) {
    const ratio = step / sweepSteps;
    const impact = getSweptBananaRacerHitImpactAtRatio(
      banana,
      racer,
      previousState,
      ratio
    );

    if (impact !== null) {
      return refineSweptBananaRacerHitImpact(
        banana,
        racer,
        previousState,
        lastClearRatio,
        ratio,
        impact
      );
    }

    lastClearRatio = ratio;
  }

  return null;
}

function refineSweptBananaRacerHitImpact(
  banana: BananaObstacleState,
  racer: RaceSessionRacerState,
  previousState: RacerCollisionSweepState,
  clearRatio: number,
  hitRatio: number,
  initialImpact: RaceShellHitImpactData
): RaceShellHitImpactData {
  let low = clearRatio;
  let high = hitRatio;
  let bestImpact = initialImpact;

  for (
    let step = 0;
    step < RACER_CONTACT_SWEEP_REFINEMENT_STEPS;
    step += 1
  ) {
    const middle = (low + high) / 2;
    const impact = getSweptBananaRacerHitImpactAtRatio(
      banana,
      racer,
      previousState,
      middle
    );

    if (impact === null) {
      low = middle;
    } else {
      high = middle;
      bestImpact = impact;
    }
  }

  return bestImpact;
}

function getSweptBananaRacerHitImpactAtRatio(
  banana: BananaObstacleState,
  racer: RaceSessionRacerState,
  previousState: RacerCollisionSweepState,
  ratio: number
): RaceShellHitImpactData | null {
  const position = interpolatePlanarPosition(
    previousState.position,
    racer.position,
    ratio
  );
  const headingRadians = interpolateHeadingRadians(
    previousState.headingRadians,
    racer.headingRadians,
    ratio
  );
  const bounds = createKartCollisionBounds(
    position,
    headingRadians,
    racer.collisionDimensions
  );

  return getActiveItemPointRacerHitImpact(
    banana,
    racer,
    bounds,
    banana.position,
    () => getEmbeddedBananaImpactNormal(banana, position, racer)
  );
}

function getRelativePlanarSpeed(left: Vector3, right: Vector3): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function compareActiveItemHitResults(
  left: ActiveItemHitResult,
  right: ActiveItemHitResult
): number {
  if (left.travelDistance !== null && right.travelDistance !== null) {
    const travelDistanceDelta = left.travelDistance - right.travelDistance;

    if (Math.abs(travelDistanceDelta) > Number.EPSILON) {
      return travelDistanceDelta;
    }
  }

  return compareActiveItemHitTargets(
    left.target.source,
    left.impact,
    right.target.source,
    right.impact
  );
}

function compareActiveItemHitTargets(
  leftTarget: RaceSessionRacerState,
  leftImpact: RaceShellHitImpactData,
  rightTarget: RaceSessionRacerState,
  rightImpact: RaceShellHitImpactData
): number {
  return (
    rightImpact.penetrationDepth - leftImpact.penetrationDepth ||
    leftTarget.slotIndex - rightTarget.slotIndex ||
    leftTarget.id.localeCompare(rightTarget.id)
  );
}

function resolveRaceItemActivationTargetResolution(
  itemType: CombatItemType,
  sourceRacerId: string,
  activeItemId: string | null,
  targetRegistry: RacerTargetRegistry<RaceSessionRacerState>
): RaceItemActivationTargetResolution {
  const candidateTargets =
    itemType === "boost"
      ? [targetRegistry.requireTargetByStableId(sourceRacerId)]
      : targetRegistry.getItemHitCandidates(sourceRacerId);
  const localPlayerRacerIds: string[] = [];
  const remotePlayerRacerIds: string[] = [];
  const aiOpponentRacerIds: string[] = [];
  const candidateAffectedRacerIds: string[] = [];

  for (const target of candidateTargets) {
    candidateAffectedRacerIds.push(target.stableId);

    if (target.isLocalPlayer) {
      localPlayerRacerIds.push(target.stableId);
    } else if (target.isRemotePlayer) {
      remotePlayerRacerIds.push(target.stableId);
    } else {
      aiOpponentRacerIds.push(target.stableId);
    }
  }

  return {
    sourceRacerId,
    itemType,
    activeItemId,
    candidateAffectedRacerIds,
    candidateAffectedRacerIdsByKind: {
      localPlayerRacerIds,
      remotePlayerRacerIds,
      aiOpponentRacerIds
    }
  };
}

function shouldAiUseHeldItem(
  racer: RaceSessionRacerState,
  racers: readonly RaceSessionRacerState[],
  activeItems: readonly ActiveRaceItemState[],
  track: Pick<AiTrackState, "totalLength">
): boolean {
  return evaluateAiHeldItemUseDecision({
    racer,
    racers,
    activeItems,
    track
  }).useItem;
}

export function evaluateAiHeldItemUseDecision(
  input: AiHeldItemUseDecisionInput
): AiHeldItemUseDecision {
  const { racer, racers, track } = input;
  const activeItems = input.activeItems ?? [];
  const heldItem = getUsableHeldInventoryItem(racer);

  if (racer.controller !== "ai" || racer.racer.controller !== "ai") {
    return createAiHeldItemUseDecision({
      useItem: false,
      itemType: heldItem,
      reason: "not-ai"
    });
  }

  const traits = createAiItemUseTraits(racer);

  if (racer.progress.finished) {
    return createAiHeldItemUseDecision({
      useItem: false,
      itemType: heldItem,
      reason: "finished",
      traits
    });
  }

  if (heldItem === null) {
    return createAiHeldItemUseDecision({
      useItem: false,
      itemType: null,
      reason: "no-usable-item",
      traits
    });
  }

  if (isRacerRecovering(racer)) {
    return createAiHeldItemUseDecision({
      useItem: false,
      itemType: heldItem,
      reason: "recovering",
      traits
    });
  }

  const context = createAiItemUseRaceContext(
    racer,
    racers,
    activeItems,
    track,
    traits
  );

  switch (heldItem) {
    case "boost":
      return evaluateAiBoostUseDecision(racer, heldItem, context, traits);
    case "shell":
      return evaluateAiShellUseDecision(heldItem, context, traits);
    case "banana":
      return evaluateAiBananaUseDecision(heldItem, context, traits);
  }
}

function evaluateAiBoostUseDecision(
  racer: RaceSessionRacerState,
  itemType: "boost",
  context: AiItemUseRaceContext,
  traits: AiItemUseTraits
): AiHeldItemUseDecision {
  const maxSpeed =
    racer.racer.controller === "ai"
      ? Math.max(1, racer.racer.driving.maxSpeed)
      : 1;
  const speedFactor = racer.speed / maxSpeed;
  const lowSpeedThreshold =
    AI_ITEM_BOOST_LOW_SPEED_FACTOR +
    traits.aggression * AI_ITEM_BOOST_LOW_SPEED_AGGRESSION_FACTOR;

  if (context.incomingShellThreat !== null && speedFactor < 1) {
    return createAiHeldItemUseDecision({
      useItem: true,
      itemType,
      reason: "incoming-threat-boost",
      traits
    });
  }

  if (speedFactor <= lowSpeedThreshold) {
    return createAiHeldItemUseDecision({
      useItem: true,
      itemType,
      reason: "low-speed-boost",
      traits
    });
  }

  if (
    racer.rank > 1 &&
    context.nearestAhead !== null &&
    context.nearestAhead.raceDistance <=
      traits.offenseRange * AI_ITEM_BOOST_CATCHUP_RANGE_FACTOR &&
    speedFactor <= AI_ITEM_BOOST_CATCHUP_MAX_SPEED_FACTOR
  ) {
    return createAiHeldItemUseDecision({
      useItem: true,
      itemType,
      reason: "catch-up-boost",
      traits,
      target: context.nearestAhead
    });
  }

  return createAiHeldItemUseDecision({
    useItem: false,
    itemType,
    reason: "hold-for-context",
    traits
  });
}

function evaluateAiShellUseDecision(
  itemType: "shell",
  context: AiItemUseRaceContext,
  traits: AiItemUseTraits
): AiHeldItemUseDecision {
  if (traits.aggression < AI_ITEM_MIN_COMBAT_AGGRESSION) {
    return createAiHeldItemUseDecision({
      useItem: false,
      itemType,
      reason: "hold-for-context",
      traits
    });
  }

  const forwardDotThreshold = interpolateNumber(
    AI_ITEM_SHELL_STRICT_FORWARD_DOT,
    AI_ITEM_SHELL_AGGRESSIVE_FORWARD_DOT,
    traits.aggression
  );
  const target = context.targetsAhead.find(
    (candidate) =>
      candidate.raceDistance <= traits.offenseRange &&
      candidate.forwardDot >= forwardDotThreshold
  );

  if (target === undefined) {
    return createAiHeldItemUseDecision({
      useItem: false,
      itemType,
      reason: "hold-for-context",
      traits
    });
  }

  return createAiHeldItemUseDecision({
    useItem: true,
    itemType,
    reason: "offensive-target-ahead",
    traits,
    target
  });
}

function evaluateAiBananaUseDecision(
  itemType: "banana",
  context: AiItemUseRaceContext,
  traits: AiItemUseTraits
): AiHeldItemUseDecision {
  if (traits.aggression < AI_ITEM_MIN_COMBAT_AGGRESSION) {
    return createAiHeldItemUseDecision({
      useItem: false,
      itemType,
      reason: "hold-for-context",
      traits
    });
  }

  const rearDotThreshold = interpolateNumber(
    AI_ITEM_BANANA_STRICT_REAR_DOT,
    AI_ITEM_BANANA_AGGRESSIVE_REAR_DOT,
    traits.aggression
  );
  const target = context.targetsBehind.find(
    (candidate) =>
      Math.abs(candidate.raceDistance) <= traits.defenseRange &&
      candidate.forwardDot <= rearDotThreshold
  );

  if (target === undefined) {
    return createAiHeldItemUseDecision({
      useItem: false,
      itemType,
      reason: "hold-for-context",
      traits
    });
  }

  return createAiHeldItemUseDecision({
    useItem: true,
    itemType,
    reason: "defensive-target-behind",
    traits,
    target
  });
}

function createAiItemUseTraits(
  racer: RaceSessionRacerState
): AiItemUseTraits {
  const aggression =
    racer.racer.controller === "ai"
      ? clamp(racer.racer.driving.itemAggression, 0, 1)
      : 0;
  const itemUseRange =
    racer.racer.controller === "ai"
      ? Math.max(0, racer.racer.behavior.itemUseRange)
      : 0;

  return {
    aggression,
    itemUseRange,
    offenseRange:
      itemUseRange *
      (AI_ITEM_OFFENSE_RANGE_MIN_FACTOR +
        aggression * AI_ITEM_OFFENSE_RANGE_AGGRESSION_FACTOR),
    defenseRange:
      itemUseRange *
      (AI_ITEM_DEFENSE_RANGE_MIN_FACTOR +
        aggression * AI_ITEM_DEFENSE_RANGE_AGGRESSION_FACTOR)
  };
}

function createAiItemUseRaceContext(
  racer: RaceSessionRacerState,
  racers: readonly RaceSessionRacerState[],
  activeItems: readonly ActiveRaceItemState[],
  track: Pick<AiTrackState, "totalLength">,
  traits: AiItemUseTraits
): AiItemUseRaceContext {
  const targetRegistry = createRacerTargetRegistry(racers);
  const targetContexts = targetRegistry
    .getItemHitCandidates(racer.id)
    .map((target) =>
      createAiItemUseTargetContext(racer, target.source, track.totalLength)
    );
  const targetsAhead = targetContexts
    .filter((target) => target.raceDistance > TRACK_PROGRESS_EPSILON)
    .sort(compareAiItemAheadTargets);
  const targetsBehind = targetContexts
    .filter((target) => target.raceDistance < -TRACK_PROGRESS_EPSILON)
    .sort(compareAiItemBehindTargets);

  return {
    targetsAhead,
    targetsBehind,
    nearestAhead: targetsAhead[0] ?? null,
    nearestBehind: targetsBehind[0] ?? null,
    incomingShellThreat: findIncomingAiShellThreat(racer, activeItems, traits)
  };
}

function createAiItemUseTargetContext(
  source: RaceSessionRacerState,
  target: RaceSessionRacerState,
  trackLength: number
): AiItemUseTargetContext {
  const targetDirection = normalizePlanarPointOrNull(
    target.position.x - source.position.x,
    target.position.z - source.position.z
  );

  return {
    racer: target,
    raceDistance: getSignedRaceDistance(source, target, trackLength),
    planarDistance: getPlanarDistance(source.position, target.position),
    forwardDot:
      targetDirection === null
        ? 0
        : source.forward.x * targetDirection.x +
          source.forward.z * targetDirection.z
  };
}

function findIncomingAiShellThreat(
  racer: RaceSessionRacerState,
  activeItems: readonly ActiveRaceItemState[],
  traits: AiItemUseTraits
): ActiveRaceItemState | null {
  const threatDistance =
    AI_ITEM_INCOMING_SHELL_THREAT_DISTANCE +
    traits.aggression * Math.max(0, traits.itemUseRange);

  for (const item of activeItems) {
    if (item.type !== "shell" || item.ownerRacerId === racer.id) {
      continue;
    }

    const distance = getPlanarDistance(racer.position, item.position);

    if (distance > threatDistance) {
      continue;
    }

    const shellDirection = normalizePlanarPointOrNull(
      item.velocity.x,
      item.velocity.z
    );
    const directionToRacer = normalizePlanarPointOrNull(
      racer.position.x - item.position.x,
      racer.position.z - item.position.z
    );
    const closingDot =
      shellDirection === null || directionToRacer === null
        ? 0
        : shellDirection.x * directionToRacer.x +
          shellDirection.z * directionToRacer.z;

    if (
      distance <= AI_ITEM_INCOMING_SHELL_CLOSE_DISTANCE ||
      closingDot >= AI_ITEM_INCOMING_SHELL_CLOSING_DOT
    ) {
      return item;
    }
  }

  return null;
}

function createAiHeldItemUseDecision(options: {
  readonly useItem: boolean;
  readonly itemType: CombatItemType | null;
  readonly reason: AiHeldItemUseDecisionReason;
  readonly traits?: AiItemUseTraits;
  readonly target?: AiItemUseTargetContext;
}): AiHeldItemUseDecision {
  return {
    useItem: options.useItem,
    itemType: options.itemType,
    reason: options.reason,
    targetRacerId: options.target?.racer.id ?? null,
    targetRaceDistance: options.target?.raceDistance ?? null,
    targetPlanarDistance: options.target?.planarDistance ?? null,
    aggression: options.traits?.aggression ?? 0,
    itemUseRange: options.traits?.itemUseRange ?? 0
  };
}

function compareAiItemAheadTargets(
  left: AiItemUseTargetContext,
  right: AiItemUseTargetContext
): number {
  return (
    left.raceDistance - right.raceDistance ||
    right.forwardDot - left.forwardDot ||
    left.racer.slotIndex - right.racer.slotIndex
  );
}

function compareAiItemBehindTargets(
  left: AiItemUseTargetContext,
  right: AiItemUseTargetContext
): number {
  return (
    Math.abs(left.raceDistance) - Math.abs(right.raceDistance) ||
    left.forwardDot - right.forwardDot ||
    left.racer.slotIndex - right.racer.slotIndex
  );
}

function createRaceItemPickupState(
  pickup: RaceItemPickupConfig
): RaceItemPickupState {
  return {
    ...pickup,
    active: true,
    cooldownSeconds: 0,
    respawnDeadlineElapsedSeconds: null
  };
}

function collectRaceItemPickup(
  pickup: RaceItemPickupState,
  elapsedSeconds: number
): void {
  applyRaceItemPickupRespawnDeadline(
    pickup,
    elapsedSeconds + pickup.respawnSeconds,
    elapsedSeconds
  );
}

function applyRaceItemPickupRespawnDeadline(
  pickup: RaceItemPickupState,
  respawnDeadlineElapsedSeconds: number,
  elapsedSeconds: number
): void {
  const deadlineElapsedSeconds = Math.max(0, respawnDeadlineElapsedSeconds);
  const cooldownSeconds = Math.max(0, deadlineElapsedSeconds - elapsedSeconds);

  pickup.cooldownSeconds = cooldownSeconds;

  if (cooldownSeconds <= 0) {
    pickup.active = true;
    pickup.respawnDeadlineElapsedSeconds = null;
    return;
  }

  pickup.active = false;
  pickup.respawnDeadlineElapsedSeconds = deadlineElapsedSeconds;
}

function updateRaceItemPickupRespawnState(
  pickup: RaceItemPickupState,
  elapsedSeconds: number
): void {
  if (pickup.respawnDeadlineElapsedSeconds !== null) {
    applyRaceItemPickupRespawnDeadline(
      pickup,
      pickup.respawnDeadlineElapsedSeconds,
      elapsedSeconds
    );
    return;
  }

  pickup.cooldownSeconds = Math.max(0, pickup.cooldownSeconds);
  pickup.active = pickup.cooldownSeconds <= 0;
}

function requireRaceItemPickupRespawnDeadline(
  pickup: RaceItemPickupState
): number {
  if (pickup.respawnDeadlineElapsedSeconds === null) {
    throw new Error(`Item pickup ${pickup.id} has no respawn deadline.`);
  }

  return pickup.respawnDeadlineElapsedSeconds;
}

function findItemPickupCollector(
  racers: readonly RaceSessionRacerState[],
  pickup: RaceItemPickupState,
  eligibilitySnapshot: RaceSessionRacerEligibilitySnapshot,
  collisionGateRacerIds: ReadonlySet<string>
): RaceSessionRacerState | undefined {
  if (!isRaceItemPickupActive(pickup)) {
    return undefined;
  }

  return racers.find((racer) =>
    !collisionGateRacerIds.has(racer.id) &&
    canRacerCollectItemPickup(racer, pickup, eligibilitySnapshot)
  );
}

function canRacerCollectItemPickup(
  racer: RaceSessionRacerState,
  pickup: RaceItemPickupState,
  eligibilitySnapshot: RaceSessionRacerEligibilitySnapshot
): boolean {
  const eligibility = requireRacerEligibilityState(
    eligibilitySnapshot,
    racer
  );

  return (
    isRaceItemPickupActive(pickup) &&
    eligibility.canCollectItemPickups &&
    canRacerReceiveInventoryGrant(racer) &&
    hasRacerItemPickupCollisionOverlap(racer, pickup)
  );
}

function hasRacerItemPickupCollisionOverlap(
  racer: RaceSessionRacerState,
  pickup: RaceItemPickupState
): boolean {
  return hasKartCollisionBoundsCircleOverlap(refreshRacerCollisionBounds(racer), {
    center: pickup.position,
    radius: pickup.radius
  });
}

function resolveCatchUpWeightedPickupGrantItemType(
  pickup: Pick<RaceItemPickupState, "id">,
  collector: RaceSessionRacerState,
  racers: readonly RaceSessionRacerState[],
  track: Pick<AiTrackState, "lapCount" | "totalLength">,
  context: RaceSessionTickContext
): CombatItemType {
  const catchUpState = createCombatItemCatchUpState(
    createCombatItemCatchUpInputForRacer(collector, racers, track)
  );

  return selectWeightedCombatItemType(
    catchUpState.weights,
    createStablePickupGrantRoll(pickup, context)
  );
}

function createCombatItemCatchUpInputForRacer(
  collector: RaceSessionRacerState,
  racers: readonly RaceSessionRacerState[],
  track: Pick<AiTrackState, "lapCount" | "totalLength">
): CombatItemCatchUpInput {
  const rankings = createRaceRanking(racers, track);
  const collectorRanking = rankings.find(
    (entry) => entry.racerId === collector.id
  );
  const leaderDistance = racers.reduce(
    (maxDistance, racer) =>
      Math.max(maxDistance, getAbsoluteRaceProgress(racer, track)),
    0
  );

  return {
    racerRank: collectorRanking?.rank ?? collector.rank,
    racerCount: racers.length,
    completedDistance: getAbsoluteRaceProgress(collector, track),
    leaderCompletedDistance: leaderDistance,
    trackLength: track.totalLength
  };
}

function createStablePickupGrantRoll(
  pickup: Pick<RaceItemPickupState, "id">,
  context: Pick<RaceSessionTickContext, "tickIndex" | "elapsedSeconds">
): number {
  return createStableUnitInterval(
    [
      pickup.id,
      context.tickIndex,
      Math.round(context.elapsedSeconds * 1000)
    ].join("|")
  );
}

function createStableUnitInterval(seed: string): number {
  let hash = 2_166_136_261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return (hash >>> 0) / 4_294_967_296;
}

function isCombatItemType(itemType: string): itemType is CombatItemType {
  return COMBAT_ITEM_TYPES.some((combatItemType) => combatItemType === itemType);
}

function createRaceTrackObstacleCollider(
  obstacle: RaceTrackObstacle
): TrackObstacleCollider {
  return {
    id: obstacle.id,
    colliderType: "obstacle",
    bodyType: "static",
    obstacleKind: obstacle.obstacleKind ?? "tire-stack",
    shape: "cylinder",
    position: obstacle.position,
    radius: obstacle.radius,
    halfHeight: obstacle.halfHeight ?? DEFAULT_OBSTACLE_HALF_HEIGHT,
    impactSpeedFactor: obstacle.impactSpeedFactor
  };
}

function getActiveItemTickVelocity(item: ActiveRaceItemState): Vector3 {
  if (item.type === "shell") {
    return scaleVector(item.direction, item.speed);
  }

  return { x: 0, y: 0, z: 0 };
}

type ShellObstacleCollisionResolution = "none" | "destroyed" | "stopped";

interface ShellObstacleContact {
  readonly obstacle: TrackObstacleCollider;
  readonly normal: Vector3;
  readonly penetrationDepth: number;
  readonly shellPosition: Vector3;
  readonly travelDistance: number;
}

type ShellTravelBlocker =
  | {
      readonly type: "obstacle";
      readonly travelDistance: number;
      readonly contact: ShellObstacleContact;
    }
  | {
      readonly type: "course-boundary";
      readonly travelDistance: number;
      readonly position: Vector3;
    };

function getActiveItemArmedSweepStartPosition(
  previousPosition: Vector3,
  currentPosition: Vector3,
  activeDeltaSeconds: number,
  armedSecondsBeforeTick: number
): Vector3 {
  const elapsedSeconds = getFiniteNonNegativeNumber(activeDeltaSeconds, 0);
  const armSeconds = getFiniteNonNegativeNumber(armedSecondsBeforeTick, 0);

  if (armSeconds <= 0) {
    return previousPosition;
  }

  if (elapsedSeconds <= 0 || armSeconds >= elapsedSeconds) {
    return currentPosition;
  }

  return interpolatePlanarPosition(
    previousPosition,
    currentPosition,
    armSeconds / elapsedSeconds
  );
}

function findShellTravelBlocker(
  shell: ShellProjectileState,
  track: AiTrackState,
  obstacles: readonly TrackObstacleCollider[],
  previousPosition: Vector3 | null
): ShellTravelBlocker | null {
  const obstacleContact = findShellObstacleContact(
    shell,
    obstacles,
    previousPosition
  );
  const courseBoundaryExit = findShellPlayableAreaExit(
    shell,
    track,
    previousPosition
  );
  let selectedBlocker: ShellTravelBlocker | null = null;

  if (obstacleContact !== null) {
    selectedBlocker = {
      type: "obstacle",
      travelDistance: obstacleContact.travelDistance,
      contact: obstacleContact
    };
  }

  if (
    courseBoundaryExit !== null &&
    (selectedBlocker === null ||
      courseBoundaryExit.travelDistance < selectedBlocker.travelDistance)
  ) {
    selectedBlocker = courseBoundaryExit;
  }

  return selectedBlocker;
}

function isShellBlockerBeforeHit(
  blocker: ShellTravelBlocker | null,
  hitTravelDistance: number | null
): blocker is ShellTravelBlocker {
  if (blocker === null) {
    return false;
  }

  if (hitTravelDistance === null) {
    return true;
  }

  return (
    blocker.travelDistance <=
    hitTravelDistance + ACTIVE_ITEM_BLOCKER_TRAVEL_EPSILON
  );
}

function applyShellObstacleContactResolution(
  shell: ShellProjectileState,
  contact: ShellObstacleContact
): ShellObstacleCollisionResolution {
  shell.position = { ...contact.shellPosition };

  switch (contact.obstacle.obstacleKind) {
    case "tire-stack":
      stopShellAtObstacle(shell, contact);
      return "stopped";
    case "oil-drum":
      shell.ttlSeconds = 0;
      shell.speed = 0;
      shell.velocity = { x: 0, y: 0, z: 0 };
      return "destroyed";
    case "cone-pack":
      stopShellAtObstacle(shell, contact);
      return "stopped";
  }
}

function findShellObstacleContact(
  shell: ShellProjectileState,
  obstacles: readonly TrackObstacleCollider[],
  previousPosition: Vector3 | null = null
): ShellObstacleContact | null {
  let selectedContact: ShellObstacleContact | null = null;

  for (const obstacle of obstacles) {
    selectedContact = selectEarlierShellObstacleContact(
      selectedContact,
      getSweptShellObstacleContact(shell, obstacle, previousPosition)
    );
    selectedContact = selectEarlierShellObstacleContact(
      selectedContact,
      getShellObstacleContactAtPosition(shell, obstacle, shell.position, {
        travelOrigin: previousPosition
      })
    );
  }

  return selectedContact;
}

function selectEarlierShellObstacleContact(
  selectedContact: ShellObstacleContact | null,
  candidateContact: ShellObstacleContact | null
): ShellObstacleContact | null {
  if (candidateContact === null) {
    return selectedContact;
  }

  if (selectedContact === null) {
    return candidateContact;
  }

  const travelDelta =
    candidateContact.travelDistance - selectedContact.travelDistance;

  if (Math.abs(travelDelta) > ACTIVE_ITEM_BLOCKER_TRAVEL_EPSILON) {
    return travelDelta < 0 ? candidateContact : selectedContact;
  }

  return candidateContact.penetrationDepth > selectedContact.penetrationDepth
    ? candidateContact
    : selectedContact;
}

function getSweptShellObstacleContact(
  shell: ShellProjectileState,
  obstacle: TrackObstacleCollider,
  previousPosition: Vector3 | null
): ShellObstacleContact | null {
  if (previousPosition === null) {
    return null;
  }

  const travelDistance = getPlanarDistance(previousPosition, shell.position);

  if (travelDistance <= Number.EPSILON) {
    return null;
  }

  const verticalDistance = Math.max(
    Math.abs(previousPosition.y - obstacle.position.y),
    Math.abs(shell.position.y - obstacle.position.y)
  );

  if (verticalDistance > obstacle.halfHeight + shell.radius) {
    return null;
  }

  const hitTime = findSegmentCircleIntersectionTime(
    { x: previousPosition.x, z: previousPosition.z },
    { x: shell.position.x, z: shell.position.z },
    { x: obstacle.position.x, z: obstacle.position.z },
    shell.radius + obstacle.radius
  );

  if (hitTime === null) {
    return null;
  }

  const shellPosition = interpolatePlanarPosition(
    previousPosition,
    shell.position,
    hitTime
  );

  return getShellObstacleContactAtPosition(shell, obstacle, shellPosition, {
    travelOrigin: previousPosition,
    fallbackTravelDistance: travelDistance * hitTime
  });
}

function getShellObstacleContactAtPosition(
  shell: ShellProjectileState,
  obstacle: TrackObstacleCollider,
  shellPosition: Vector3,
  options: {
    readonly travelOrigin?: Vector3 | null;
    readonly fallbackTravelDistance?: number;
  } = {}
): ShellObstacleContact | null {
  const verticalDistance = Math.abs(shellPosition.y - obstacle.position.y);

  if (verticalDistance > obstacle.halfHeight + shell.radius) {
    return null;
  }

  const deltaX = shellPosition.x - obstacle.position.x;
  const deltaZ = shellPosition.z - obstacle.position.z;
  const planarDistance = Math.hypot(deltaX, deltaZ);
  const combinedRadius = shell.radius + obstacle.radius;
  const penetrationDepth = combinedRadius - planarDistance;

  if (penetrationDepth < 0) {
    return null;
  }

  const normal =
    planarDistance > Number.EPSILON
      ? {
          x: deltaX / planarDistance,
          y: 0,
          z: deltaZ / planarDistance
        }
      : getEmbeddedShellImpactNormal(shell);
  const travelDistance =
    options.travelOrigin === undefined || options.travelOrigin === null
      ? options.fallbackTravelDistance ?? 0
      : getPlanarDistance(options.travelOrigin, shellPosition);

  return {
    obstacle,
    normal,
    penetrationDepth: Math.max(0, penetrationDepth),
    shellPosition,
    travelDistance
  };
}

function findShellPlayableAreaExit(
  shell: ShellProjectileState,
  track: AiTrackState,
  previousPosition: Vector3 | null
): ShellTravelBlocker | null {
  const startPosition = previousPosition ?? shell.position;
  const endPosition = shell.position;
  const startInside = isActiveItemPositionInsidePlayableArea(
    shell,
    track,
    startPosition
  );

  if (!startInside) {
    return {
      type: "course-boundary",
      position: { ...startPosition },
      travelDistance: 0
    };
  }

  if (isActiveItemPositionInsidePlayableArea(shell, track, endPosition)) {
    return null;
  }

  const travelDistance = getPlanarDistance(startPosition, endPosition);

  if (travelDistance <= Number.EPSILON) {
    return {
      type: "course-boundary",
      position: { ...endPosition },
      travelDistance: 0
    };
  }

  const sweepSteps = clampWholeNumber(
    Math.ceil(travelDistance / RACER_CONTACT_SWEEP_STEP_DISTANCE),
    1,
    RACER_CONTACT_SWEEP_MAX_STEPS
  );
  let lastInsideRatio = 0;

  for (let step = 1; step <= sweepSteps; step += 1) {
    const ratio = step / sweepSteps;
    const position = interpolatePlanarPosition(startPosition, endPosition, ratio);

    if (isActiveItemPositionInsidePlayableArea(shell, track, position)) {
      lastInsideRatio = ratio;
      continue;
    }

    return refineShellPlayableAreaExit(
      shell,
      track,
      startPosition,
      endPosition,
      lastInsideRatio,
      ratio
    );
  }

  return {
    type: "course-boundary",
    position: { ...endPosition },
    travelDistance
  };
}

function refineShellPlayableAreaExit(
  shell: ShellProjectileState,
  track: AiTrackState,
  startPosition: Vector3,
  endPosition: Vector3,
  insideRatio: number,
  outsideRatio: number
): ShellTravelBlocker {
  let low = insideRatio;
  let high = outsideRatio;

  for (
    let step = 0;
    step < RACER_CONTACT_SWEEP_REFINEMENT_STEPS;
    step += 1
  ) {
    const middle = (low + high) / 2;
    const position = interpolatePlanarPosition(
      startPosition,
      endPosition,
      middle
    );

    if (isActiveItemPositionInsidePlayableArea(shell, track, position)) {
      low = middle;
    } else {
      high = middle;
    }
  }

  const position = interpolatePlanarPosition(startPosition, endPosition, high);

  return {
    type: "course-boundary",
    position,
    travelDistance: getPlanarDistance(startPosition, position)
  };
}

function isActiveItemPositionInsidePlayableArea(
  item: ActiveRaceItemState,
  track: AiTrackState,
  position: Vector3
): boolean {
  if (track.road !== undefined) {
    return isPointInsideRoadGeometry(track.road, position, item.radius);
  }

  return isPointInsideTrackBounds(getTrackBounds(track), position, item.radius);
}

function stopShellAtObstacle(
  shell: ShellProjectileState,
  contact: ShellObstacleContact
): void {
  moveShellOutsideObstacle(shell, contact);
  shell.speed = 0;
  shell.velocity = { x: 0, y: 0, z: 0 };
  shell.ttlSeconds = Math.min(
    shell.ttlSeconds,
    SHELL_OBSTACLE_STOP_LINGER_SECONDS
  );
  shell.armedSeconds = Math.max(shell.armedSeconds, shell.ttlSeconds);
}

function moveShellOutsideObstacle(
  shell: ShellProjectileState,
  contact: ShellObstacleContact
): void {
  const separation =
    shell.radius +
    contact.obstacle.radius +
    SHELL_OBSTACLE_SEPARATION_EPSILON;

  shell.position = {
    x: contact.obstacle.position.x + contact.normal.x * separation,
    y: shell.position.y,
    z: contact.obstacle.position.z + contact.normal.z * separation
  };
}

function storePickupItemInInventorySlot(
  racer: RaceSessionRacerState,
  itemType: CombatItemType,
  options: RacerInventoryGrantOptions = {}
): boolean {
  return grantItemToRacerInventory(racer, itemType, options);
}

function grantAcceptedItemPickupToRacer(
  racer: RaceSessionRacerState,
  itemType: CombatItemType,
  options: RacerInventoryGrantOptions = {}
): boolean {
  return storePickupItemInInventorySlot(racer, itemType, options);
}

interface RaceBananaHazardDeploymentContext {
  readonly tickIndex: number | null;
  readonly elapsedSeconds: number | null;
}

interface RaceBananaHazardDeactivationContext {
  readonly bananaId: string;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly reason: RaceBananaRemovalReason;
  readonly collisionEventId?: string | null;
  readonly collidedRacerId?: string | null;
}

function createBananaHazardEntityState(
  banana: BananaObstacleState,
  deployment: RaceBananaHazardDeploymentContext
): RaceBananaHazardEntityState {
  return {
    id: banana.id,
    networkId: banana.networkId,
    entityType: "banana-hazard",
    bodyType: "static",
    itemType: "banana",
    obstacleKind: "banana",
    ownerId: banana.ownerId,
    ownerRacerId: banana.ownerRacerId,
    owner: { ...banana.owner },
    initialPosition: { ...banana.initialPosition },
    position: { ...banana.stablePosition },
    stablePosition: { ...banana.stablePosition },
    radius: banana.radius,
    orientationRadians: banana.orientationRadians,
    active: true,
    activeStatus: "active",
    activeState: "active",
    state: "active",
    removed: false,
    deployedAtTickIndex: deployment.tickIndex,
    deployedAtElapsedSeconds: deployment.elapsedSeconds,
    deactivatedAtTickIndex: null,
    deactivatedAtElapsedSeconds: null,
    deactivationReason: null,
    collisionEventId: null,
    collidedRacerId: null
  };
}

function createInactiveBananaHazardEntityState(
  entity: RaceBananaHazardEntityState,
  deactivation: RaceBananaHazardDeactivationContext
): RaceBananaHazardEntityState {
  return {
    ...entity,
    position: { ...entity.stablePosition },
    stablePosition: { ...entity.stablePosition },
    active: false,
    activeStatus: "inactive",
    activeState: "removed",
    state: "removed",
    removed: true,
    deactivatedAtTickIndex: deactivation.tickIndex,
    deactivatedAtElapsedSeconds: deactivation.elapsedSeconds,
    deactivationReason: deactivation.reason,
    collisionEventId:
      deactivation.collisionEventId ?? entity.collisionEventId,
    collidedRacerId:
      deactivation.collidedRacerId ?? entity.collidedRacerId
  };
}

export function createShellProjectileState(
  racer: RaceSessionRacerState,
  id: string
): ShellProjectileState {
  const direction = getProjectileForwardDirection(racer);
  const forwardClearance = getRacerLongitudinalCollisionClearance(racer);
  const initialPosition = addVector(
    racer.position,
    scaleVector(
      direction,
      forwardClearance + SHELL_RADIUS + SHELL_LAUNCH_CLEARANCE_METERS
    )
  );

  return {
    id,
    networkId: id,
    type: "shell",
    ownerId: racer.id,
    ownerRacerId: racer.id,
    owner: createActiveItemOwnerMetadata(racer),
    activeState: "active",
    state: "active",
    removed: false,
    spawnPosition: { ...racer.position },
    initialPosition: { ...initialPosition },
    position: { ...initialPosition },
    direction,
    speed: SHELL_SPEED,
    velocity: scaleVector(direction, SHELL_SPEED),
    lifetimeSeconds: SHELL_TTL_SECONDS,
    ageSeconds: 0,
    ttlSeconds: SHELL_TTL_SECONDS,
    armedSeconds: SHELL_ARM_SECONDS,
    radius: SHELL_RADIUS
  };
}

export function createBananaObstacleState(
  racer: RaceSessionRacerState,
  id: string
): BananaObstacleState {
  const headingForward = forwardFromHeading(racer.headingRadians);
  const initialPosition = addVector(
    racer.position,
    scaleVector(headingForward, -BANANA_DROP_DISTANCE_BEHIND_RACER)
  );

  return {
    id,
    networkId: id,
    type: "banana",
    bodyType: "static",
    obstacleKind: "banana",
    active: true,
    ownerId: racer.id,
    ownerRacerId: racer.id,
    owner: createActiveItemOwnerMetadata(racer),
    activeState: "active",
    state: "active",
    removed: false,
    initialPosition: { ...initialPosition },
    position: { ...initialPosition },
    stablePosition: { ...initialPosition },
    orientationRadians: normalizeOrientationRadians(racer.headingRadians),
    velocity: { x: 0, y: 0, z: 0 },
    lifetimeSeconds: BANANA_TTL_SECONDS,
    ageSeconds: 0,
    ttlSeconds: BANANA_TTL_SECONDS,
    armedSeconds: BANANA_ARM_SECONDS,
    radius: BANANA_RADIUS
  };
}

function createBananaObstacleStateFromSpawnEvent(
  event: RaceBananaSpawnEvent,
  owner: RaceSessionRacerState,
  sessionElapsedSeconds: number
): BananaObstacleState | null {
  const elapsedSinceEventSeconds = Math.max(
    0,
    sessionElapsedSeconds - event.elapsedSeconds
  );
  const ttlSeconds = getFiniteNonNegativeNumber(
    event.ttlSeconds,
    BANANA_TTL_SECONDS
  );

  const ageSeconds = Math.max(
    0,
    getFiniteNonNegativeNumber(event.ageSeconds, 0) + elapsedSinceEventSeconds
  );
  const lifetimeSeconds = Math.max(
    BANANA_TTL_SECONDS,
    ageSeconds + ttlSeconds
  );
  const position = createFiniteVector(event.position);

  return {
    id: event.bananaId,
    networkId: event.bananaId,
    type: "banana",
    bodyType: "static",
    obstacleKind: "banana",
    active: true,
    ownerId: owner.id,
    ownerRacerId: owner.id,
    owner: createActiveItemOwnerMetadata(owner),
    activeState: "active",
    state: "active",
    removed: false,
    initialPosition: { ...position },
    position,
    stablePosition: { ...position },
    orientationRadians: normalizeOrientationRadians(event.orientationRadians),
    velocity: { x: 0, y: 0, z: 0 },
    lifetimeSeconds,
    ageSeconds: Math.min(ageSeconds, lifetimeSeconds),
    ttlSeconds,
    armedSeconds: Math.max(
      0,
      getFiniteNonNegativeNumber(event.armedSeconds, BANANA_ARM_SECONDS) -
        elapsedSinceEventSeconds
    ),
    radius: getFinitePositiveNumber(event.radius, BANANA_RADIUS)
  };
}

function isShellProjectileState(
  item: ActiveRaceItemState
): item is ShellProjectileState {
  return item.type === "shell";
}

function isBananaObstacleState(
  item: ActiveRaceItemState
): item is BananaObstacleState {
  return item.type === "banana";
}

function isBananaHazardEntityState(
  entity: RaceTrackEntityState
): entity is RaceBananaHazardEntityState {
  return entity.entityType === "banana-hazard";
}

function createActiveItemOwnerMetadata(
  racer: RaceSessionRacerState
): ActiveItemOwnerMetadata {
  return {
    racerId: racer.id,
    slotIndex: racer.slotIndex,
    controller: racer.controller
  };
}

function getProjectileForwardDirection(racer: RaceSessionRacerState): Vector3 {
  if (Number.isFinite(racer.headingRadians)) {
    return forwardFromHeading(racer.headingRadians);
  }

  const forwardX = Number.isFinite(racer.forward.x) ? racer.forward.x : 0;
  const forwardZ = Number.isFinite(racer.forward.z) ? racer.forward.z : 0;
  const forwardLength = Math.hypot(forwardX, forwardZ);

  if (forwardLength > Number.EPSILON) {
    return {
      x: forwardX / forwardLength,
      y: 0,
      z: forwardZ / forwardLength
    };
  }

  return forwardFromHeading(racer.headingRadians);
}

function updateActiveItemLifetime(
  item: ActiveRaceItemState,
  deltaSeconds: number
): number {
  const elapsedSeconds = getFiniteNonNegativeNumber(deltaSeconds, 0);

  if (item.type === "banana") {
    item.ageSeconds += elapsedSeconds;
    item.ttlSeconds = getFiniteNonNegativeNumber(item.ttlSeconds, 0);
    return elapsedSeconds;
  }

  const remainingTtlSeconds = getFiniteNonNegativeNumber(item.ttlSeconds, 0);
  const consumedSeconds = Math.min(elapsedSeconds, remainingTtlSeconds);

  item.ageSeconds = Math.min(
    item.lifetimeSeconds,
    item.ageSeconds + consumedSeconds
  );
  item.ttlSeconds = Math.max(0, remainingTtlSeconds - elapsedSeconds);

  return consumedSeconds;
}

function isResolvedActiveShellProjectile(
  item: ActiveRaceItemState,
  appliedShellHitShellIds: ReadonlySet<string>
): boolean {
  return item.type === "shell" && appliedShellHitShellIds.has(item.id);
}

function isResolvedActiveBananaObstacle(
  item: ActiveRaceItemState,
  appliedBananaHitBananaIds: ReadonlySet<string>,
  appliedBananaRemovalBananaIds: ReadonlySet<string>
): boolean {
  return (
    item.type === "banana" &&
    (!item.active ||
      appliedBananaHitBananaIds.has(item.id) ||
      appliedBananaRemovalBananaIds.has(item.id))
  );
}

function getActiveItemDespawnReason(
  item: ActiveRaceItemState,
  track: AiTrackState,
  obstacles: readonly TrackObstacleCollider[]
): "expired" | RaceBananaCleanupRemovalReason | null {
  if (item.type === "shell" && item.ttlSeconds <= 0) {
    return "expired";
  }

  if (isActiveItemOutsidePlayableArea(item, track)) {
    return "out-of-bounds";
  }

  if (item.type === "banana") {
    return isBananaHazardOutsideAllowedPlayArea(item, obstacles)
      ? "out-of-bounds"
      : null;
  }

  return null;
}

function isBananaHazardOutsideAllowedPlayArea(
  item: BananaObstacleState,
  obstacles: readonly TrackObstacleCollider[]
): boolean {
  if (isActiveItemBlockedByObstacle(item, obstacles)) {
    return true;
  }

  return false;
}

function isActiveItemOutsidePlayableArea(
  item: ActiveRaceItemState,
  track: AiTrackState
): boolean {
  if (track.road !== undefined) {
    return !isPointInsideRoadGeometry(track.road, item.position, item.radius);
  }

  const bounds = getTrackBounds(track);
  return (
    item.position.x < bounds.minX - item.radius ||
    item.position.x > bounds.maxX + item.radius ||
    item.position.z < bounds.minZ - item.radius ||
    item.position.z > bounds.maxZ + item.radius
  );
}

function isActiveItemBlockedByObstacle(
  item: ActiveRaceItemState,
  obstacles: readonly TrackObstacleCollider[]
): boolean {
  return obstacles.some(
    (obstacle) =>
      getPlanarDistance(item.position, obstacle.position) <=
      item.radius + obstacle.radius
  );
}

function getSignedRaceDistance(
  from: RaceSessionRacerState,
  to: RaceSessionRacerState,
  trackLength: number
): number {
  const safeTrackLength = Math.max(trackLength, 1);
  return (
    (to.progress.lap - from.progress.lap) * safeTrackLength +
    (to.progress.trackProgress - from.progress.trackProgress)
  );
}

interface PlanarPoint {
  readonly x: number;
  readonly z: number;
}

interface TrackBoundaryCollisionResponse {
  readonly position: Vector3;
  readonly normal: Vector3;
  readonly penetrationDepth: number;
  readonly speedFactor: number;
}

interface TrackBoundaryCollisionResponseOptions {
  readonly deferSoftBoundaryResponse?: boolean;
}

function getTrackSurfaceSpeedFactor(
  position: Vector3,
  track: AiTrackState,
  radius: number
): number {
  if (track.road === undefined) {
    return 1;
  }

  const surface = queryTrackSurfaceAtPoint(track.road, position, radius);

  if (surface.surface === "road") {
    return 1;
  }

  if (surface.withinCourseBoundary) {
    return TRACK_SHOULDER_SPEED_LIMIT_FACTOR;
  }

  return TRACK_SHOULDER_SPEED_LIMIT_FACTOR * TRACK_BOUNDARY_DAMPING;
}

function getTrackBoundaryCollisionResponse(
  collisionBounds: KartCollisionBounds,
  track: AiTrackState,
  trackCollisionLayer: TrackCollisionLayer,
  options: TrackBoundaryCollisionResponseOptions = {}
): TrackBoundaryCollisionResponse | null {
  const position = collisionBounds.center;
  const radius = collisionBounds.boundingRadius;

  if (track.road !== undefined) {
    const isInsideCourseBoundary = isKartCollisionBoundsInsideRoadGeometry(
      track.road,
      collisionBounds
    );
    const boundaryCollision = detectKartBoundsTrackBoundaryContacts(
      collisionBounds,
      trackCollisionLayer
    );

    if (
      boundaryCollision.hasCollision &&
      options.deferSoftBoundaryResponse === true
    ) {
      return null;
    }

    if (
      boundaryCollision.hasCollision &&
      boundaryCollision.maxPenetrationDepth >=
        MIN_TRACK_BOUNDARY_COLLIDER_RESPONSE_DEPTH
    ) {
      return {
        position: boundaryCollision.correctedCenter,
        normal: getBoundaryCollisionResponseNormal(boundaryCollision),
        penetrationDepth: boundaryCollision.maxPenetrationDepth,
        speedFactor: boundaryCollision.speedFactor
      };
    }

    if (isInsideCourseBoundary) {
      return null;
    }

    if (options.deferSoftBoundaryResponse === true) {
      return null;
    }

    return getRoadBoundaryCollisionResponse(position, track.road, radius);
  }

  const bounds = getTrackBounds(track);
  const correctedX = clamp(
    position.x,
    bounds.minX + radius,
    bounds.maxX - radius
  );
  const correctedZ = clamp(
    position.z,
    bounds.minZ + radius,
    bounds.maxZ - radius
  );

  if (correctedX === position.x && correctedZ === position.z) {
    return null;
  }

  return {
    position: {
      x: correctedX,
      y: position.y,
      z: correctedZ
    },
    normal: normalizePlanarVector3(
      correctedX - position.x,
      correctedZ - position.z
    ),
    penetrationDepth: Math.hypot(
      correctedX - position.x,
      correctedZ - position.z
    ),
    speedFactor: TRACK_BOUNDARY_DAMPING
  };
}

function getRoadBoundaryCollisionResponse(
  position: Vector3,
  road: TrackRoadGeometry,
  radius: number
): TrackBoundaryCollisionResponse | null {
  const surface = queryTrackSurfaceAtPoint(road, position, radius);

  if (surface.withinCourseBoundary) {
    return null;
  }

  const maximumCenterlineDistance = Math.max(
    road.courseBoundary.courseHalfWidth - radius,
    0
  );
  const projection = getNearestTrackRoadProjection(road, position);
  const correctionNormal = normalizePlanarPoint(
    position.x - projection.point.x,
    position.z - projection.point.z
  );

  return {
    position: {
      x:
        projection.point.x +
        correctionNormal.x * maximumCenterlineDistance,
      y: position.y,
      z:
        projection.point.z +
        correctionNormal.z * maximumCenterlineDistance
    },
    normal: {
      x: -correctionNormal.x,
      y: 0,
      z: -correctionNormal.z
    },
    penetrationDepth: Math.max(
      surface.distanceFromCenterline - maximumCenterlineDistance,
      0
    ),
    speedFactor: TRACK_BOUNDARY_DAMPING
  };
}

function getBoundaryCollisionResponseNormal(collision: {
  readonly correction: Vector3;
  readonly contacts: readonly { readonly normal: Vector3 }[];
}): Vector3 {
  return getCollisionResponseNormal(collision.correction, collision.contacts);
}

function getCollisionResponseNormal(
  correction: Vector3,
  contacts: readonly { readonly normal: Vector3 }[]
): Vector3 {
  const correctionNormal = normalizePlanarVector3(
    correction.x,
    correction.z
  );

  if (
    Math.abs(correctionNormal.x) > Number.EPSILON ||
    Math.abs(correctionNormal.z) > Number.EPSILON
  ) {
    return correctionNormal;
  }

  return contacts[0]?.normal ?? { x: 0, y: 0, z: 0 };
}

function isPointInsideRoadGeometry(
  road: TrackRoadGeometry,
  position: Vector3,
  radius: number
): boolean {
  return queryTrackSurfaceAtPoint(road, position, radius).withinCourseBoundary;
}

function isKartCollisionBoundsInsideRoadGeometry(
  road: TrackRoadGeometry,
  collisionBounds: KartCollisionBounds
): boolean {
  const samplePoints = [
    collisionBounds.center,
    collisionBounds.frontLeft,
    collisionBounds.frontRight,
    collisionBounds.rearLeft,
    collisionBounds.rearRight
  ] as const;

  return samplePoints.every((point) => isPointInsideRoadGeometry(road, point, 0));
}

function getTrackBounds(track: AiTrackState): TrackBounds {
  return track.bounds;
}

function createRaceTrackGameplayMetadata(
  track: AiTrackState
): TrackGameplayMetadata | null {
  if (track.road === undefined) {
    return null;
  }

  return createTrackGameplayMetadata({
    id: track.id,
    name: track.name,
    lapCount: track.lapCount,
    spawnOrientationRadians: track.spawnOrientationRadians,
    bounds: track.bounds,
    road: track.road
  });
}

function isPointInsideTrackBounds(
  bounds: TrackBounds,
  position: Pick<Vector3, "x" | "z">,
  radius: number
): boolean {
  if (!Number.isFinite(radius) || radius < 0) {
    throw new Error(`Track bounds query radius must be non-negative, found ${radius}.`);
  }

  return (
    position.x >= bounds.minX + radius &&
    position.x <= bounds.maxX - radius &&
    position.z >= bounds.minZ + radius &&
    position.z <= bounds.maxZ - radius
  );
}

function getTrackBoundaryWaypoints(
  track: AiTrackState
): readonly Pick<AiWaypointState, "index" | "trackProgress">[] {
  if (track.checkpoints !== undefined && track.checkpoints.length > 0) {
    return track.checkpoints;
  }

  if (track.waypoints !== undefined && track.waypoints.length > 0) {
    return track.waypoints;
  }

  return [
    track.currentWaypoint,
    track.nextWaypoint,
    track.lookAheadWaypoint
  ];
}

function applyRacerContactResponse(
  left: RaceSessionRacerState,
  right: RaceSessionRacerState,
  normal: PlanarPoint,
  penetrationDepth: number
): void {
  const collisionNormal = normalizePlanarPointOrNull(normal.x, normal.z);

  if (collisionNormal === null) {
    return;
  }

  const leftVelocity = getRacerPlanarVelocity(left);
  const rightVelocity = getRacerPlanarVelocity(right);
  const relativeNormalSpeed =
    (leftVelocity.x - rightVelocity.x) * collisionNormal.x +
    (leftVelocity.z - rightVelocity.z) * collisionNormal.z;
  const collisionImpact = {
    collisionType: "racer" as const,
    baseSpeedFactor: RACER_CONTACT_DAMPING,
    impactSpeed: Math.max(0, -relativeNormalSpeed),
    penetrationDepth
  };

  applyCollisionControlImpact(left, collisionImpact);
  applyCollisionControlImpact(right, collisionImpact);

  if (relativeNormalSpeed >= 0) {
    return;
  }

  const dampingFactor = getCollisionVelocityDampingFactor(collisionImpact);
  const normalImpulse =
    (-(1 + RACER_CONTACT_RESTITUTION) * relativeNormalSpeed) / 2;
  const leftResponseVelocity = {
    x:
      (leftVelocity.x + normalImpulse * collisionNormal.x) *
      dampingFactor,
    z:
      (leftVelocity.z + normalImpulse * collisionNormal.z) *
      dampingFactor
  };
  const rightResponseVelocity = {
    x:
      (rightVelocity.x - normalImpulse * collisionNormal.x) *
      dampingFactor,
    z:
      (rightVelocity.z - normalImpulse * collisionNormal.z) *
      dampingFactor
  };

  applyPlanarVelocityToRacer(left, leftResponseVelocity);
  applyPlanarVelocityToRacer(right, rightResponseVelocity);
}

function applyStaticCollisionResponse(
  racer: RaceSessionRacerState,
  normal: Pick<Vector3, "x" | "z">,
  collision: {
    readonly collisionType: StaticCollisionResponseType;
    readonly baseSpeedFactor: number;
    readonly impactSpeed: number;
    readonly penetrationDepth: number;
  }
): void {
  const collisionNormal = normalizePlanarPointOrNull(normal.x, normal.z);
  const dampingFactor = getCollisionVelocityDampingFactor(collision);

  applyCollisionControlImpact(racer, collision);

  if (collisionNormal === null) {
    racer.speed *= dampingFactor;
    refreshRacerVelocity(racer);
    return;
  }

  const velocity = getRacerPlanarVelocity(racer);
  const normalSpeed =
    velocity.x * collisionNormal.x + velocity.z * collisionNormal.z;

  if (normalSpeed >= 0) {
    racer.speed *= dampingFactor;
    refreshRacerVelocity(racer);
    return;
  }

  const responseConfig =
    STATIC_COLLISION_RESPONSE_CONFIG_BY_TYPE[collision.collisionType];
  const tangentialVelocity = {
    x: velocity.x - normalSpeed * collisionNormal.x,
    z: velocity.z - normalSpeed * collisionNormal.z
  };
  const reboundSpeed = -normalSpeed * responseConfig.restitution;
  const responseVelocity = {
    x:
      (tangentialVelocity.x * responseConfig.tangentialSpeedFactor +
        collisionNormal.x * reboundSpeed) *
      dampingFactor,
    z:
      (tangentialVelocity.z * responseConfig.tangentialSpeedFactor +
        collisionNormal.z * reboundSpeed) *
      dampingFactor
  };

  applyPlanarVelocityToRacer(racer, responseVelocity);
}

function applyCollisionControlImpact(
  racer: RaceSessionRacerState,
  collision: {
    readonly collisionType: CollisionDampingType;
    readonly baseSpeedFactor: number;
    readonly impactSpeed: number;
    readonly penetrationDepth: number;
  }
): void {
  const severity = getCollisionImpactSeverity(
    collision,
    COLLISION_DAMPING_CONFIG_BY_TYPE[collision.collisionType]
  );

  if (severity <= 0) {
    return;
  }

  racer.collisionControlSeconds = Math.max(
    racer.collisionControlSeconds,
    interpolateNumber(
      COLLISION_CONTROL_MIN_SECONDS,
      COLLISION_CONTROL_DURATION_SECONDS,
      severity
    )
  );
  syncRacerRecoveringState(racer);
}

function getCollisionVelocityDampingFactor(collision: {
  readonly collisionType: CollisionDampingType;
  readonly baseSpeedFactor: number;
  readonly impactSpeed: number;
  readonly penetrationDepth: number;
}): number {
  const config = COLLISION_DAMPING_CONFIG_BY_TYPE[collision.collisionType];
  const baseSpeedFactor = clamp(
    Number.isFinite(collision.baseSpeedFactor) ? collision.baseSpeedFactor : 1,
    0,
    1
  );
  const severity = getCollisionImpactSeverity(collision, config);
  const targetSpeedFactor = interpolateNumber(
    baseSpeedFactor,
    Math.min(baseSpeedFactor, config.severeImpactSpeedFactor),
    severity
  );

  return interpolateNumber(1, targetSpeedFactor, severity);
}

function getCollisionImpactSeverity(
  collision: {
    readonly impactSpeed: number;
    readonly penetrationDepth: number;
  },
  config: CollisionDampingConfig
): number {
  const impactSpeed = Math.max(
    0,
    Number.isFinite(collision.impactSpeed) ? collision.impactSpeed : 0
  );
  const penetrationDepth = Math.max(
    0,
    Number.isFinite(collision.penetrationDepth)
      ? collision.penetrationDepth
      : 0
  );
  const speedSeverity = clamp(impactSpeed / config.fullImpactSpeed, 0, 1);
  const penetrationSeverity = clamp(
    penetrationDepth / config.fullPenetrationDepth,
    0,
    1
  );

  return clamp(
    speedSeverity * config.impactSpeedWeight +
      penetrationSeverity * (1 - config.impactSpeedWeight),
    0,
    1
  );
}

function getStaticCollisionImpactSpeed(
  racer: RaceSessionRacerState,
  normal: Pick<Vector3, "x" | "z">
): number {
  const velocity = getRacerPlanarVelocity(racer);
  const normalSpeed = velocity.x * normal.x + velocity.z * normal.z;

  return Math.max(0, -normalSpeed);
}

function getRacerPlanarVelocity(racer: RaceSessionRacerState): PlanarPoint {
  const velocity = getRacerTotalVelocity(racer);

  return {
    x: velocity.x,
    z: velocity.z
  };
}

function getPlanarDistance(
  left: Pick<Vector3, "x" | "z">,
  right: Pick<Vector3, "x" | "z">
): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function offsetPlanarPosition(
  position: Vector3,
  axis: Pick<Vector3, "x" | "z">,
  distance: number
): Vector3 {
  return {
    x: position.x + axis.x * distance,
    y: position.y,
    z: position.z + axis.z * distance
  };
}

function normalizePlanarPoint(x: number, z: number): PlanarPoint {
  const length = Math.hypot(x, z);

  if (length <= Number.EPSILON) {
    return { x: 1, z: 0 };
  }

  return {
    x: x / length,
    z: z / length
  };
}

function normalizePlanarVector3(x: number, z: number): Vector3 {
  const normal = normalizePlanarPointOrNull(x, z);

  return normal === null
    ? { x: 0, y: 0, z: 0 }
    : { x: normal.x, y: 0, z: normal.z };
}

function normalizePlanarPointOrNull(x: number, z: number): PlanarPoint | null {
  const length = Math.hypot(x, z);

  if (length <= Number.EPSILON) {
    return null;
  }

  return {
    x: x / length,
    z: z / length
  };
}

function applyPlanarVelocityToRacer(
  racer: RaceSessionRacerState,
  velocity: PlanarPoint
): void {
  const speed = Math.hypot(velocity.x, velocity.z);

  if (speed <= MIN_COLLISION_RESPONSE_SPEED) {
    racer.speed = 0;
    racer.knockbackVelocity = { x: 0, y: 0, z: 0 };
    refreshRacerVelocity(racer);
    return;
  }

  racer.speed = speed;
  racer.knockbackVelocity = { x: 0, y: 0, z: 0 };
  racer.headingRadians = normalizeOrientationRadians(
    Math.atan2(velocity.x, velocity.z)
  );
  refreshRacerVelocity(racer);
}

function refreshRacerVelocity(racer: RaceSessionRacerState): void {
  racer.forward = forwardFromHeading(racer.headingRadians);
  racer.velocity = getRacerTotalVelocity(racer);
  refreshRacerCollisionBounds(racer);
}

function getRacerTotalVelocity(racer: RaceSessionRacerState): Vector3 {
  return addVector(
    scaleVector(forwardFromHeading(racer.headingRadians), racer.speed),
    createFiniteVector(racer.knockbackVelocity)
  );
}

function decayRacerKnockbackVelocity(
  velocity: Vector3,
  deltaSeconds: number
): Vector3 {
  const currentVelocity = createFiniteVector(velocity);
  const speed = getPlanarSpeed(currentVelocity);

  if (speed <= ITEM_HIT_KNOCKBACK_STOP_SPEED) {
    return { x: 0, y: 0, z: 0 };
  }

  if (deltaSeconds <= 0) {
    return currentVelocity;
  }

  const nextSpeed = Math.max(
    0,
    speed - ITEM_HIT_KNOCKBACK_DECELERATION * deltaSeconds
  );

  if (nextSpeed <= ITEM_HIT_KNOCKBACK_STOP_SPEED) {
    return { x: 0, y: 0, z: 0 };
  }

  const scale = nextSpeed / speed;

  return {
    x: currentVelocity.x * scale,
    y: 0,
    z: currentVelocity.z * scale
  };
}

function getPlanarSpeed(velocity: Pick<Vector3, "x" | "z">): number {
  return Math.hypot(velocity.x, velocity.z);
}

export function refreshRacerCollisionBounds(
  racer: RaceSessionRacerState
): KartCollisionBounds {
  racer.collisionBounds = createKartCollisionBounds(
    racer.position,
    racer.headingRadians,
    racer.collisionDimensions
  );
  racer.physics = syncKartPhysicsState(racer.physics, {
    position: racer.position,
    velocity: racer.velocity,
    headingRadians: racer.headingRadians,
    collisionDimensions: racer.collisionDimensions,
    collisionBounds: racer.collisionBounds
  });
  racer.collision = racer.physics.collision;

  return racer.collisionBounds;
}

function getRacerCollisionRadius(racer: RaceSessionRacerState): number {
  return refreshRacerCollisionBounds(racer).boundingRadius;
}

function getRacerLongitudinalCollisionClearance(
  racer: RaceSessionRacerState
): number {
  return refreshRacerCollisionBounds(racer).halfLength;
}

function getDrivingStats(racer: RegisteredRacer): DrivingStats {
  return createRacePacedDrivingStats(
    racer.controller === "ai" ? racer.driving : HUMAN_DRIVING_STATS
  );
}

function createRacePacedDrivingStats(driving: DrivingStats): DrivingStats {
  return {
    ...driving,
    maxSpeed: driving.maxSpeed * RACE_SPEED_SCALE,
    acceleration: driving.acceleration * RACE_SPEED_SCALE,
    braking: driving.braking * RACE_SPEED_SCALE
  };
}

type RaceProgressMarker = Pick<
  TrackLapMarker,
  | "order"
  | "kind"
  | "position"
  | "radius"
  | "trackProgress"
  | "nextMarkerOrder"
  | "triggerZone"
>;

interface RaceProgressAdvanceResult {
  readonly progress: RacerProgressState;
  readonly finishCrossingRatio: number | null;
}

function advanceProgress(
  progress: RacerProgressState,
  previousPosition: Vector3,
  currentPosition: Vector3,
  track: AiTrackState,
  collisionRadius: number
): RacerProgressState {
  return advanceProgressWithTransition(
    progress,
    previousPosition,
    currentPosition,
    track,
    collisionRadius
  ).progress;
}

function advanceProgressWithTransition(
  progress: RacerProgressState,
  previousPosition: Vector3,
  currentPosition: Vector3,
  track: AiTrackState,
  collisionRadius: number
): RaceProgressAdvanceResult {
  const safeTrackLength = Math.max(track.totalLength, 1);
  const lapCount = Math.max(track.lapCount, 0);
  const markers = getTrackProgressMarkers(track);

  if (progress.finished || progress.lap >= lapCount) {
    return createProgressAdvanceResult(
      createSessionRacerProgressState(
        {
          lap: lapCount,
          checkpointIndex: 0,
          trackProgress: 0,
          finished: true
        },
        track
      )
    );
  }

  if (markers.length < 2) {
    return advanceProgressByDistanceWithTransition(
      progress,
      getPlanarDistance(previousPosition, currentPosition),
      track
    );
  }

  let lap = clampWholeNumber(progress.lap, 0, lapCount);
  let checkpointIndex = resolveConsistentProgressMarkerOrder(
    progress,
    markers,
    safeTrackLength
  );
  let baseTrackProgress = normalizeTrackProgress(
    progress.trackProgress,
    safeTrackLength
  );
  let crossingSegmentStart = previousPosition;

  for (let crossedCount = 0; crossedCount <= markers.length; crossedCount += 1) {
    const lastMarker = getProgressMarkerAt(markers, checkpointIndex);
    const expectedMarker = getProgressMarkerAt(
      markers,
      lastMarker.nextMarkerOrder
    );
    const expectedMarkerCrossingRatio = getMarkerCrossingRatio(
      crossingSegmentStart,
      currentPosition,
      expectedMarker,
      collisionRadius
    );
    const forwardExpectedMarkerCrossingRatio =
      expectedMarkerCrossingRatio !== null &&
      isForwardMarkerCrossing(
        crossingSegmentStart,
        currentPosition,
        lastMarker,
        expectedMarker
      )
        ? expectedMarkerCrossingRatio
        : null;
    const outOfOrderCrossingRatio =
      getEarliestOutOfOrderMarkerCrossingRatio({
        segmentStart: crossingSegmentStart,
        segmentEnd: currentPosition,
        markers,
        lastMarker,
        expectedMarker,
        collisionRadius
      });
    const projectedMarkerCrossingRatio =
      forwardExpectedMarkerCrossingRatio === null
        ? getProjectedMarkerCrossingRatio({
            baseTrackProgress,
            currentPosition,
            lastMarker,
            expectedMarker,
            track,
            trackLength: safeTrackLength
          })
        : null;
    const expectedCrossingRatio =
      forwardExpectedMarkerCrossingRatio ?? projectedMarkerCrossingRatio;
    const crossingRatio =
      expectedCrossingRatio !== null &&
      (outOfOrderCrossingRatio === null ||
        expectedCrossingRatio <= outOfOrderCrossingRatio + TRACK_PROGRESS_EPSILON)
        ? expectedCrossingRatio
        : null;

    if (crossingRatio === null) {
      break;
    }

    if (
      expectedMarker.kind === "startFinish" &&
      !isLapCompletionGateOpen(lastMarker, expectedMarker, markers)
    ) {
      break;
    }

    checkpointIndex = expectedMarker.order;
    baseTrackProgress = expectedMarker.trackProgress;

    if (expectedMarker.kind === "startFinish") {
      lap += 1;
      baseTrackProgress = 0;

      if (lap >= lapCount) {
        return createProgressAdvanceResult(
          createSessionRacerProgressState(
            {
              lap: lapCount,
              checkpointIndex: 0,
              trackProgress: 0,
              finished: true
            },
            track
          ),
          crossingRatio
        );
      }
    }

    crossingSegmentStart = interpolatePlanarPosition(
      crossingSegmentStart,
      currentPosition,
      crossingRatio
    );
  }

  const nextTrackProgress = resolveGatedTrackProgress({
    baseTrackProgress,
    checkpointIndex,
    currentPosition,
    track,
    markers,
    trackLength: safeTrackLength
  });

  return createProgressAdvanceResult(
    createSessionRacerProgressState(
      {
        lap,
        checkpointIndex,
        trackProgress: nextTrackProgress,
        finished: false
      },
      track
    )
  );
}

function advanceProgressByDistanceWithTransition(
  progress: RacerProgressState,
  distance: number,
  track: AiTrackState
): RaceProgressAdvanceResult {
  const safeTrackLength = Math.max(track.totalLength, 1);
  const lapCount = Math.max(track.lapCount, 0);
  const currentAbsoluteProgress =
    clamp(progress.lap, 0, lapCount) * safeTrackLength +
    normalizeTrackProgress(progress.trackProgress, safeTrackLength);
  const finishProgress = lapCount * safeTrackLength;

  if (progress.finished || currentAbsoluteProgress >= finishProgress) {
    return createProgressAdvanceResult(
      createSessionRacerProgressState(
        {
          lap: lapCount,
          checkpointIndex: 0,
          trackProgress: 0,
          finished: true
        },
        track
      )
    );
  }

  const distanceDelta = Math.max(distance, 0);
  const nextAbsoluteProgress = Math.min(
    finishProgress,
    currentAbsoluteProgress + distanceDelta
  );
  const didFinish = nextAbsoluteProgress >= finishProgress;
  const nextLap = didFinish
    ? lapCount
    : Math.floor(nextAbsoluteProgress / safeTrackLength);
  const nextTrackProgress = didFinish
    ? 0
    : nextAbsoluteProgress % safeTrackLength;

  return createProgressAdvanceResult(
    createSessionRacerProgressState(
      {
        lap: nextLap,
        checkpointIndex: resolveCheckpointIndex(track, nextTrackProgress),
        trackProgress: nextTrackProgress,
        finished: didFinish
      },
      track
    ),
    didFinish && distanceDelta > TRACK_PROGRESS_EPSILON
      ? clamp((finishProgress - currentAbsoluteProgress) / distanceDelta, 0, 1)
      : null
  );
}

function createProgressAdvanceResult(
  progress: RacerProgressState,
  finishCrossingRatio: number | null = null
): RaceProgressAdvanceResult {
  return {
    progress,
    finishCrossingRatio
  };
}

function createSessionRacerProgressState(
  input: Parameters<typeof createRacerProgressState>[0],
  track: Pick<AiTrackState, "lapCount" | "totalLength">
): RacerProgressState {
  return createRacerProgressState(input, {
    lapCount: track.lapCount,
    trackLength: track.totalLength
  });
}

export function debugAdvanceRacerProgress(input: {
  readonly progress: RacerProgressState;
  readonly previousPosition: Vector3;
  readonly currentPosition: Vector3;
  readonly track?: AiTrackState;
  readonly collisionRadius?: number;
}): RacerProgressState {
  return advanceProgress(
    input.progress,
    input.previousPosition,
    input.currentPosition,
    input.track ?? DEFAULT_RACE_TRACK_STATE,
    input.collisionRadius ?? 0
  );
}

function getTrackProgressMarkers(
  track: AiTrackState
): readonly RaceProgressMarker[] {
  if (track.lapMarkers !== undefined && track.lapMarkers.length > 0) {
    return track.lapMarkers;
  }

  const checkpoints = track.checkpoints;

  if (checkpoints === undefined || checkpoints.length <= 0) {
    return [];
  }

  return checkpoints.map((source) => ({
    order: source.order,
    kind: source.kind === "startFinish" ? "startFinish" : "progress",
    position: source.position,
    radius: source.radius,
    trackProgress: source.trackProgress,
    nextMarkerOrder: positiveModulo(source.order + 1, checkpoints.length),
    triggerZone: source.triggerZone
  }));
}

function resolveConsistentProgressMarkerOrder(
  progress: RacerProgressState,
  markers: readonly RaceProgressMarker[],
  trackLength: number
): number {
  const markerOrder = resolveProgressMarkerOrder(progress, markers);
  const marker = getProgressMarkerAt(markers, markerOrder);
  const trackProgress = normalizeTrackProgress(
    progress.trackProgress,
    trackLength
  );

  if (
    isTrackProgressInsideMarkerSegment(
      trackProgress,
      marker,
      markers,
      trackLength
    )
  ) {
    return markerOrder;
  }

  return resolveProgressMarkerOrderFromTrackProgress(
    trackProgress,
    markers,
    trackLength
  );
}

function resolveProgressMarkerOrder(
  progress: RacerProgressState,
  markers: readonly RaceProgressMarker[]
): number {
  if (!Number.isInteger(progress.checkpointIndex)) {
    return 0;
  }

  const matchingMarker = markers.find(
    (marker) => marker.order === progress.checkpointIndex
  );

  return matchingMarker?.order ?? 0;
}

function isTrackProgressInsideMarkerSegment(
  trackProgress: number,
  marker: RaceProgressMarker,
  markers: readonly RaceProgressMarker[],
  trackLength: number
): boolean {
  const segmentStart = normalizeTrackProgress(marker.trackProgress, trackLength);
  const nextMarker = getProgressMarkerAt(markers, marker.nextMarkerOrder);
  const segmentEnd =
    nextMarker.kind === "startFinish"
      ? trackLength
      : normalizeTrackProgress(nextMarker.trackProgress, trackLength);

  return (
    trackProgress + TRACK_PROGRESS_EPSILON >= segmentStart &&
    trackProgress <= segmentEnd - TRACK_PROGRESS_EPSILON
  );
}

function resolveProgressMarkerOrderFromTrackProgress(
  trackProgress: number,
  markers: readonly RaceProgressMarker[],
  trackLength: number
): number {
  let markerOrder = 0;

  for (const marker of markers) {
    const markerProgress = normalizeTrackProgress(
      marker.trackProgress,
      trackLength
    );

    if (markerProgress <= trackProgress) {
      markerOrder = marker.order;
    }
  }

  return markerOrder;
}

function isLapCompletionGateOpen(
  lastMarker: RaceProgressMarker,
  expectedMarker: RaceProgressMarker,
  markers: readonly RaceProgressMarker[]
): boolean {
  const requiredMarker = markers.find(
    (marker) =>
      marker.kind !== "startFinish" &&
      marker.nextMarkerOrder === expectedMarker.order
  );

  return (
    requiredMarker !== undefined &&
    lastMarker.order === requiredMarker.order
  );
}

function getProgressMarkerAt(
  markers: readonly RaceProgressMarker[],
  order: number
): RaceProgressMarker {
  const marker = markers[positiveModulo(order, markers.length)];

  if (marker === undefined) {
    throw new Error(`Missing race progress marker at order ${order}.`);
  }

  return marker;
}

function getMarkerCrossingRatio(
  segmentStart: Vector3,
  segmentEnd: Vector3,
  marker: RaceProgressMarker,
  collisionRadius: number
): number | null {
  const reachRadius = marker.triggerZone.radius + collisionRadius;
  const segmentX = segmentEnd.x - segmentStart.x;
  const segmentZ = segmentEnd.z - segmentStart.z;
  const markerOffsetX = segmentStart.x - marker.triggerZone.center.x;
  const markerOffsetZ = segmentStart.z - marker.triggerZone.center.z;
  const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ;

  if (segmentLengthSquared <= Number.EPSILON) {
    const distanceToTriggerZone = getPlanarDistance(
      segmentStart,
      marker.triggerZone.center
    );

    return distanceToTriggerZone <= reachRadius ? 0 : null;
  }

  const quadraticB = 2 * (markerOffsetX * segmentX + markerOffsetZ * segmentZ);
  const quadraticC =
    markerOffsetX * markerOffsetX +
    markerOffsetZ * markerOffsetZ -
    reachRadius * reachRadius;

  if (quadraticC <= 0) {
    return 0;
  }

  const discriminant =
    quadraticB * quadraticB - 4 * segmentLengthSquared * quadraticC;

  if (discriminant < 0) {
    return null;
  }

  const sqrtDiscriminant = Math.sqrt(discriminant);
  const firstRatio =
    (-quadraticB - sqrtDiscriminant) / (2 * segmentLengthSquared);
  const secondRatio =
    (-quadraticB + sqrtDiscriminant) / (2 * segmentLengthSquared);

  if (firstRatio >= 0 && firstRatio <= 1) {
    return firstRatio;
  }

  if (secondRatio >= 0 && secondRatio <= 1) {
    return secondRatio;
  }

  return null;
}

function isForwardMarkerCrossing(
  segmentStart: Vector3,
  segmentEnd: Vector3,
  lastMarker: RaceProgressMarker,
  expectedMarker: RaceProgressMarker
): boolean {
  const movementX = segmentEnd.x - segmentStart.x;
  const movementZ = segmentEnd.z - segmentStart.z;
  const movementLength = Math.hypot(movementX, movementZ);

  if (movementLength <= TRACK_PROGRESS_EPSILON) {
    return true;
  }

  const expectedX = expectedMarker.position.x - lastMarker.position.x;
  const expectedZ = expectedMarker.position.z - lastMarker.position.z;
  const expectedLength = Math.hypot(expectedX, expectedZ);

  if (expectedLength <= TRACK_PROGRESS_EPSILON) {
    return true;
  }

  const forwardDot =
    (movementX / movementLength) * (expectedX / expectedLength) +
    (movementZ / movementLength) * (expectedZ / expectedLength);

  return forwardDot > TRACK_PROGRESS_EPSILON;
}

function getEarliestOutOfOrderMarkerCrossingRatio(input: {
  readonly segmentStart: Vector3;
  readonly segmentEnd: Vector3;
  readonly markers: readonly RaceProgressMarker[];
  readonly lastMarker: RaceProgressMarker;
  readonly expectedMarker: RaceProgressMarker;
  readonly collisionRadius: number;
}): number | null {
  let earliestCrossingRatio: number | null = null;

  for (const marker of input.markers) {
    if (
      marker.order === input.expectedMarker.order ||
      marker.order === input.lastMarker.order
    ) {
      continue;
    }

    const crossingRatio = getMarkerCrossingRatio(
      input.segmentStart,
      input.segmentEnd,
      marker,
      input.collisionRadius
    );

    if (crossingRatio === null) {
      continue;
    }

    earliestCrossingRatio =
      earliestCrossingRatio === null
        ? crossingRatio
        : Math.min(earliestCrossingRatio, crossingRatio);
  }

  return earliestCrossingRatio;
}

function getProjectedMarkerCrossingRatio(input: {
  readonly baseTrackProgress: number;
  readonly currentPosition: Vector3;
  readonly lastMarker: RaceProgressMarker;
  readonly expectedMarker: RaceProgressMarker;
  readonly track: AiTrackState;
  readonly trackLength: number;
}): number | null {
  if (input.track.road === undefined) {
    return null;
  }

  const segmentStartProgress = normalizeTrackProgress(
    input.lastMarker.trackProgress,
    input.trackLength
  );
  const markerProgress = resolveOrderedMarkerProgress(
    input.expectedMarker,
    segmentStartProgress,
    input.trackLength
  );
  const baseProgress = unwrapProgressAfterSegmentStart(
    input.baseTrackProgress,
    segmentStartProgress,
    input.trackLength
  );
  const projectedProgress = unwrapProgressAfterSegmentStart(
    projectTrackProgress(
      input.currentPosition,
      input.track,
      input.baseTrackProgress
    ),
    segmentStartProgress,
    input.trackLength
  );

  if (projectedProgress + TRACK_PROGRESS_EPSILON < baseProgress) {
    return null;
  }

  if (
    markerProgress < baseProgress - TRACK_PROGRESS_EPSILON ||
    markerProgress > projectedProgress + TRACK_PROGRESS_EPSILON
  ) {
    return null;
  }

  if (
    projectedProgress - markerProgress >
    getProjectedMarkerCrossingTolerance(input.track, input.expectedMarker) +
      TRACK_PROGRESS_EPSILON
  ) {
    return null;
  }

  const projectedDelta = projectedProgress - baseProgress;

  if (projectedDelta <= TRACK_PROGRESS_EPSILON) {
    return 0;
  }

  return clamp((markerProgress - baseProgress) / projectedDelta, 0, 1);
}

function getProjectedMarkerCrossingTolerance(
  track: Pick<AiTrackState, "width">,
  marker: RaceProgressMarker
): number {
  return Math.max(
    getFinitePositiveNumber(track.width, 0),
    marker.triggerZone.radius
  );
}

function resolveOrderedMarkerProgress(
  marker: RaceProgressMarker,
  segmentStartProgress: number,
  trackLength: number
): number {
  const markerProgress = normalizeTrackProgress(
    marker.trackProgress,
    trackLength
  );

  if (
    marker.kind === "startFinish" &&
    markerProgress <= segmentStartProgress + TRACK_PROGRESS_EPSILON
  ) {
    return trackLength;
  }

  return markerProgress < segmentStartProgress - TRACK_PROGRESS_EPSILON
    ? markerProgress + trackLength
    : markerProgress;
}

function unwrapProgressAfterSegmentStart(
  trackProgress: number,
  segmentStartProgress: number,
  trackLength: number
): number {
  let unwrappedProgress = normalizeTrackProgress(trackProgress, trackLength);

  if (unwrappedProgress < segmentStartProgress - TRACK_PROGRESS_EPSILON) {
    unwrappedProgress += trackLength;
  }

  return unwrappedProgress;
}

interface GatedTrackProgressInput {
  readonly baseTrackProgress: number;
  readonly checkpointIndex: number;
  readonly currentPosition: Vector3;
  readonly track: AiTrackState;
  readonly markers: readonly RaceProgressMarker[];
  readonly trackLength: number;
}

function resolveGatedTrackProgress(
  input: GatedTrackProgressInput
): number {
  const { markers, trackLength } = input;
  const lastMarker = getProgressMarkerAt(markers, input.checkpointIndex);
  const nextMarker = getProgressMarkerAt(markers, lastMarker.nextMarkerOrder);
  const segmentStart = lastMarker.trackProgress;
  const segmentEnd =
    nextMarker.kind === "startFinish"
      ? trackLength
      : nextMarker.trackProgress;
  const segmentMax = Math.max(
    segmentStart,
    segmentEnd - TRACK_PROGRESS_EPSILON
  );
  const baseProgress = resolveProgressWithinOpenSegment(
    input.baseTrackProgress,
    segmentStart,
    segmentEnd,
    trackLength
  );
  const projectedProgress = resolveProgressWithinOpenSegment(
    projectTrackProgress(
      input.currentPosition,
      input.track,
      input.baseTrackProgress
    ),
    segmentStart,
    segmentEnd,
    trackLength
  );
  const nextProgress = Math.min(
    segmentMax,
    Math.max(segmentStart, baseProgress, projectedProgress)
  );

  return normalizeTrackProgress(nextProgress, trackLength);
}

function resolveProgressWithinOpenSegment(
  trackProgress: number,
  segmentStart: number,
  segmentEnd: number,
  trackLength: number
): number {
  const normalizedProgress = normalizeTrackProgress(trackProgress, trackLength);

  if (
    segmentEnd >= trackLength - TRACK_PROGRESS_EPSILON &&
    normalizedProgress <= TRACK_PROGRESS_EPSILON
  ) {
    return trackLength;
  }

  if (
    normalizedProgress + TRACK_PROGRESS_EPSILON >= segmentStart &&
    normalizedProgress <= segmentEnd + TRACK_PROGRESS_EPSILON
  ) {
    return normalizedProgress;
  }

  return segmentStart;
}

function projectTrackProgress(
  position: Vector3,
  track: AiTrackState,
  fallbackProgress: number
): number {
  if (track.road === undefined) {
    return fallbackProgress;
  }

  return getNearestTrackRoadProjection(track.road, position).trackProgress;
}

function interpolatePlanarPosition(
  start: Vector3,
  end: Vector3,
  ratio: number
): Vector3 {
  const clampedRatio = clamp(ratio, 0, 1);

  return {
    x: start.x + (end.x - start.x) * clampedRatio,
    y: start.y + (end.y - start.y) * clampedRatio,
    z: start.z + (end.z - start.z) * clampedRatio
  };
}

function createRaceRanking(
  racers: readonly RaceSessionRacerState[],
  track: Pick<AiTrackState, "lapCount" | "totalLength">
): readonly RaceRankingEntry[] {
  return [...racers]
    .sort((left, right) => compareRaceRanking(left, right, track))
    .map((racer, index) => ({
      racerId: racer.id,
      slotIndex: racer.slotIndex,
      displayName: racer.displayName,
      controller: racer.controller,
      rank: index + 1,
      lap: racer.progress.lap,
      checkpointIndex: racer.progress.checkpointIndex,
      trackProgress: racer.progress.trackProgress,
      finished: racer.progress.finished,
      finishPlace: racer.finishPlace,
      finishTimeSeconds: racer.finishTimeSeconds
    }));
}

function createRaceProgressSnapshots(
  racers: readonly RaceSessionRacerState[],
  track: AiTrackState
): readonly RaceProgressSnapshot[] {
  const ranksByRacerId = new Map<string, number>(
    createRaceRanking(racers, track).map((entry) => [
      entry.racerId,
      entry.rank
    ] as const)
  );

  return racers.map((racer) =>
    createRaceProgressSnapshot(
      racer,
      track,
      ranksByRacerId.get(racer.id) ?? racer.rank
    )
  );
}

export function createRaceProgressSnapshot(
  racer: RaceSessionRacerState,
  track: AiTrackState,
  rank: number = racer.rank
): RaceProgressSnapshot {
  const trackLength = Math.max(track.totalLength, 1);
  const lapCount = Math.max(track.lapCount, 0);
  const totalDistance = lapCount * trackLength;
  const completedDistance = clamp(
    getAbsoluteRaceProgress(racer, track),
    0,
    totalDistance
  );
  const checkpointCount = getTrackProgressMarkers(track).length;
  const checkpointMaxIndex = Math.max(checkpointCount - 1, 0);
  const normalizedLapProgress = racer.progress.finished
    ? 0
    : normalizeTrackProgress(racer.progress.trackProgress, trackLength);

  return {
    racerId: racer.id,
    slotIndex: racer.slotIndex,
    displayName: racer.displayName,
    controller: racer.controller,
    rank,
    lap: racer.progress.finished
      ? lapCount
      : clampWholeNumber(racer.progress.lap, 0, lapCount),
    lapCount,
    checkpointIndex: racer.progress.finished
      ? 0
      : clampWholeNumber(racer.progress.checkpointIndex, 0, checkpointMaxIndex),
    checkpointCount,
    trackProgress: racer.progress.finished ? 0 : normalizedLapProgress,
    trackLength,
    completedDistance,
    totalDistance,
    currentLapProgressRatio:
      trackLength <= 0 ? 0 : clamp(normalizedLapProgress / trackLength, 0, 1),
    completionRatio:
      totalDistance <= 0 ? 1 : clamp(completedDistance / totalDistance, 0, 1),
    finished: racer.progress.finished,
    finishPlace: racer.finishPlace,
    finishTimeSeconds: racer.finishTimeSeconds
  };
}

function compareNewlyFinishedRacers(
  left: RaceSessionRacerState,
  right: RaceSessionRacerState,
  track: Pick<AiTrackState, "lapCount" | "totalLength">
): number {
  const leftFinishTime = getPendingFinishOrderingTime(left);
  const rightFinishTime = getPendingFinishOrderingTime(right);
  const finishTimeDelta = leftFinishTime - rightFinishTime;

  if (finishTimeDelta !== 0) {
    return finishTimeDelta;
  }

  return compareRaceRanking(left, right, track);
}

function getPendingFinishOrderingTime(racer: RaceSessionRacerState): number {
  return racer.pendingFinishTimeSeconds === null
    ? Number.POSITIVE_INFINITY
    : racer.pendingFinishTimeSeconds;
}

function resolveRacerFinishTimeSeconds(
  racer: RaceSessionRacerState,
  context: RaceSessionTickContext
): number {
  if (
    racer.pendingFinishTimeSeconds === null ||
    !Number.isFinite(racer.pendingFinishTimeSeconds)
  ) {
    return context.elapsedSeconds;
  }

  return clamp(racer.pendingFinishTimeSeconds, 0, context.elapsedSeconds);
}

function resolveRacePhaseAfterProgression(
  racers: readonly RaceSessionRacerState[],
  track: Pick<AiTrackState, "lapCount">
): RacePhase {
  if (racers.every((racer) => racer.progress.finished)) {
    return "finished";
  }

  const finalLapIndex = Math.max(track.lapCount - 1, 0);

  if (
    racers.some(
      (racer) => racer.progress.finished || racer.progress.lap >= finalLapIndex
    )
  ) {
    return "final-lap";
  }

  return "running";
}

function estimateFinishTimeSeconds(
  context: RaceSessionTickContext,
  finishCrossingRatio: number
): number {
  return clamp(
    context.elapsedSeconds -
      context.deltaSeconds * (1 - clamp(finishCrossingRatio, 0, 1)),
    0,
    context.elapsedSeconds
  );
}

function compareRaceRanking(
  left: RaceSessionRacerState,
  right: RaceSessionRacerState,
  track: Pick<AiTrackState, "lapCount" | "totalLength">
): number {
  if (left.finishPlace !== null || right.finishPlace !== null) {
    if (left.finishPlace === null) {
      return 1;
    }

    if (right.finishPlace === null) {
      return -1;
    }

    return left.finishPlace - right.finishPlace;
  }

  if (left.progress.finished !== right.progress.finished) {
    return left.progress.finished ? -1 : 1;
  }

  const progressDelta =
    getAbsoluteRaceProgress(right, track) - getAbsoluteRaceProgress(left, track);

  if (progressDelta !== 0) {
    return progressDelta;
  }

  if (left.progress.checkpointIndex !== right.progress.checkpointIndex) {
    return right.progress.checkpointIndex - left.progress.checkpointIndex;
  }

  return left.slotIndex - right.slotIndex;
}

function getAbsoluteRaceProgress(
  racer: RaceSessionRacerState,
  track: Pick<AiTrackState, "lapCount" | "totalLength">
): number {
  const safeTrackLength = Math.max(track.totalLength, 1);

  if (racer.progress.finished) {
    return Math.max(track.lapCount, 0) * safeTrackLength;
  }

  return (
    racer.progress.lap * safeTrackLength +
    normalizeTrackProgress(racer.progress.trackProgress, safeTrackLength)
  );
}

function resolveCheckpointIndex(track: AiTrackState, trackProgress: number): number {
  const checkpoints = getTrackBoundaryWaypoints(track);
  let checkpointIndex = 0;

  for (let index = 0; index < checkpoints.length; index += 1) {
    const checkpoint = checkpoints[index];

    if (
      checkpoint !== undefined &&
      checkpoint.trackProgress <= trackProgress
    ) {
      checkpointIndex = checkpoint.index;
    }
  }

  return checkpointIndex;
}

function findCurrentWaypointIndex(
  waypoints: readonly AiWaypointState[],
  trackProgress: number
): number {
  let currentIndex = 0;

  for (let index = 0; index < waypoints.length; index += 1) {
    const waypoint = waypoints[index];

    if (waypoint !== undefined && waypoint.trackProgress <= trackProgress) {
      currentIndex = index;
    }
  }

  return currentIndex;
}

function getWaypointAt(
  waypoints: readonly AiWaypointState[],
  index: number
): AiWaypointState {
  const waypoint = waypoints[positiveModulo(index, waypoints.length)];

  if (waypoint === undefined) {
    throw new Error(`Missing AI waypoint at index ${index}.`);
  }

  return waypoint;
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

function createFiniteVector(vector: Vector3): Vector3 {
  return {
    x: Number.isFinite(vector.x) ? vector.x : 0,
    y: Number.isFinite(vector.y) ? vector.y : 0,
    z: Number.isFinite(vector.z) ? vector.z : 0
  };
}

function normalizeTrackProgress(trackProgress: number, trackLength: number): number {
  return positiveModulo(trackProgress, Math.max(trackLength, 1));
}

function normalizeOrientationRadians(orientationRadians: number): number {
  return Number.isFinite(orientationRadians)
    ? positiveModulo(orientationRadians, Math.PI * 2)
    : 0;
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeEventDurationSeconds(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function interpolateNumber(start: number, end: number, ratio: number): number {
  return start + (end - start) * clamp(ratio, 0, 1);
}

function clampWholeNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.floor(clamp(value, min, max));
}

function getFiniteNonNegativeNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function getFinitePositiveNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
