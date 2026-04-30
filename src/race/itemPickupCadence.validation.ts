import { RACE_CAPACITY } from "../config/gameConfig";
import {
  DEFAULT_TRACK_DEFINITION,
  DEFAULT_TRACK_GAMEPLAY_METADATA,
  DEFAULT_TRACK_ITEM_BOX_PLACEMENTS,
  getNearestTrackRoadProjection,
  queryTrackGameplaySurfaceAtPoint,
  type TrackItemBoxPlacement
} from "../config/tracks";
import {
  COMBAT_ITEM_CATCH_UP_TUNING,
  COMBAT_ITEM_REGISTRY,
  DEFAULT_COMBAT_ITEM_DISTRIBUTION_TABLE,
  DEFAULT_RACE_ITEM_PICKUPS,
  ITEM_DISTRIBUTION_BALANCE_TUNING,
  ITEM_PICKUP_CADENCE_TUNING,
  createCombatItemCatchUpState,
  type CombatItemType,
  type CombatItemDistributionRole,
  type CombatItemSelectionWeight,
  type RaceItemPickupConfig
} from "./raceSession";
import {
  getCombatItemDistributionItemWeight,
  getCombatItemDistributionRoleWeight,
  getCombatItemDistributionTotalWeight
} from "./raceSession";

interface ItemPickupCadenceValidationResult {
  readonly pickupCount: number;
  readonly trackItemBoxCount: number;
  readonly mirroredPickupCount: number;
  readonly itemTypes: readonly CombatItemType[];
  readonly maxTrackGapMeters: number;
  readonly maxTrackGapRatio: number;
  readonly maxRacingLineOffset: number;
  readonly maxRespawnSeconds: number;
  readonly distributionTotalWeight: number;
  readonly roleShares: Readonly<Record<CombatItemDistributionRole, number>>;
  readonly itemShares: Readonly<Record<CombatItemType, number>>;
  readonly catchUp: CombatItemCatchUpValidationResult;
}

interface CombatItemCatchUpValidationResult {
  readonly leaderBoostWeight: number;
  readonly trailingBoostWeight: number;
  readonly leaderShellWeight: number;
  readonly trailingShellWeight: number;
  readonly leaderBananaWeight: number;
  readonly trailingBananaWeight: number;
  readonly distanceOnlyBoostWeight: number;
  readonly closeMiddleBoostWeight: number;
}

interface ItemPickupProgressSample {
  readonly trackProgress: number;
}

function main(): void {
  const result = validateDefaultItemPickupCadence();

  console.info(
    [
      "itemPickupCadence=ok",
      `pickups=${result.pickupCount}`,
      `trackBoxes=${result.trackItemBoxCount}`,
      `mirroredPickups=${result.mirroredPickupCount}`,
      `types=${result.itemTypes.join(",")}`,
      `maxGap=${result.maxTrackGapMeters.toFixed(2)}`,
      `maxGapRatio=${result.maxTrackGapRatio.toFixed(3)}`,
      `maxRacingLineOffset=${result.maxRacingLineOffset.toFixed(3)}`,
      `maxRespawn=${result.maxRespawnSeconds.toFixed(2)}`,
      `distributionWeight=${result.distributionTotalWeight}`,
      `commonShare=${result.roleShares.common.toFixed(2)}`,
      `defensiveShare=${result.roleShares.defensive.toFixed(2)}`,
      `offensiveShare=${result.roleShares.offensive.toFixed(2)}`,
      `highImpactShare=${result.roleShares["high-impact"].toFixed(2)}`,
      `leaderBoostWeight=${result.catchUp.leaderBoostWeight.toFixed(2)}`,
      `trailingBoostWeight=${result.catchUp.trailingBoostWeight.toFixed(2)}`,
      `trailingShellWeight=${result.catchUp.trailingShellWeight.toFixed(2)}`
    ].join(" ")
  );
}

export function validateDefaultItemPickupCadence(): ItemPickupCadenceValidationResult {
  const track = DEFAULT_TRACK_GAMEPLAY_METADATA;
  const pickupProgress = DEFAULT_RACE_ITEM_PICKUPS.map((pickup) =>
    createPickupProgressSample(pickup)
  ).sort((left, right) => left.trackProgress - right.trackProgress);
  const maxTrackGapMeters = getMaxLoopGapMeters(
    pickupProgress,
    track.road.totalLength
  );
  const maxTrackGapRatio = maxTrackGapMeters / track.road.totalLength;
  const itemTypes = Array.from(
    new Set(DEFAULT_RACE_ITEM_PICKUPS.map((pickup) => pickup.itemType))
  ).sort();
  const maxRespawnSeconds = Math.max(
    ...DEFAULT_RACE_ITEM_PICKUPS.map((pickup) => pickup.respawnSeconds)
  );

  assertGreaterThanOrEqual(
    DEFAULT_RACE_ITEM_PICKUPS.length,
    ITEM_PICKUP_CADENCE_TUNING.minBoxesPerLap,
    "default item pickup density"
  );
  assertLessThanOrEqual(
    maxTrackGapRatio,
    ITEM_PICKUP_CADENCE_TUNING.maxTrackGapFraction,
    "default item pickup track gap"
  );

  for (const itemType of Object.keys(COMBAT_ITEM_REGISTRY) as CombatItemType[]) {
    assert(
      itemTypes.includes(itemType),
      `default item pickup cadence includes ${itemType}`
    );
  }

  for (const pickup of DEFAULT_RACE_ITEM_PICKUPS) {
    validatePickupPosition(pickup);
    validatePickupRespawn(pickup);
  }

  const trackItemBoxPlacement = validateDefaultTrackItemBoxPlacements();
  const itemDistribution = validateCombatItemDistributionBalance();
  const catchUp = validateCombatItemCatchUpWeighting();

  return {
    pickupCount: DEFAULT_RACE_ITEM_PICKUPS.length,
    itemTypes,
    maxTrackGapMeters,
    maxTrackGapRatio,
    maxRespawnSeconds,
    catchUp,
    ...trackItemBoxPlacement,
    ...itemDistribution
  };
}

function validateDefaultTrackItemBoxPlacements(): Pick<
  ItemPickupCadenceValidationResult,
  "trackItemBoxCount" | "mirroredPickupCount" | "maxRacingLineOffset"
> {
  const placements = DEFAULT_TRACK_DEFINITION.itemBoxPlacements;

  assertEqual(
    placements.length,
    DEFAULT_TRACK_ITEM_BOX_PLACEMENTS.length,
    "default track exposes fixed item box placements"
  );
  assertEqual(
    DEFAULT_RACE_ITEM_PICKUPS.length,
    placements.length,
    "default race pickups mirror track item box count"
  );

  let maxRacingLineOffset = 0;
  const ids = new Set<string>();

  for (let index = 0; index < placements.length; index += 1) {
    const placement = requireValue(
      placements[index],
      `track item box placement ${index}`
    );
    const pickup = requireValue(
      DEFAULT_RACE_ITEM_PICKUPS[index],
      `race item pickup ${index}`
    );
    const racingLineOffset = validateTrackItemBoxPlacement(placement, ids);

    assertEqual(
      pickup.id,
      placement.id,
      `${placement.id} pickup id mirrors track placement`
    );
    assertAlmostEqual(
      pickup.position.x,
      placement.position.x,
      `${placement.id} pickup x mirrors track placement`
    );
    assertAlmostEqual(
      pickup.position.y,
      placement.position.y,
      `${placement.id} pickup y mirrors track placement`
    );
    assertAlmostEqual(
      pickup.position.z,
      placement.position.z,
      `${placement.id} pickup z mirrors track placement`
    );

    maxRacingLineOffset = Math.max(maxRacingLineOffset, racingLineOffset);
  }

  return {
    trackItemBoxCount: placements.length,
    mirroredPickupCount: DEFAULT_RACE_ITEM_PICKUPS.length,
    maxRacingLineOffset
  };
}

function validateTrackItemBoxPlacement(
  placement: TrackItemBoxPlacement,
  ids: Set<string>
): number {
  assert(
    placement.id.trim().length > 0 && !ids.has(placement.id),
    `${placement.id} track item box placement has a stable unique id`
  );
  ids.add(placement.id);

  const projection = getNearestTrackRoadProjection(
    DEFAULT_TRACK_GAMEPLAY_METADATA.road,
    placement.position
  );
  const racingLineOffset = Math.abs(projection.signedLateralOffset);

  assertEqual(
    projection.segmentIndex,
    placement.segmentIndex,
    `${placement.id} item box segment follows fixed racing-line route`
  );
  assertAlmostEqual(
    projection.trackProgress,
    placement.trackProgress,
    `${placement.id} item box track progress mirrors racing-line projection`
  );
  assertLessThanOrEqual(
    racingLineOffset,
    DEFAULT_TRACK_GAMEPLAY_METADATA.road.roadWidth * 0.02,
    `${placement.id} item box is placed on the racing line`
  );

  return racingLineOffset;
}

function validateCombatItemDistributionBalance(): Pick<
  ItemPickupCadenceValidationResult,
  "distributionTotalWeight" | "roleShares" | "itemShares"
> {
  const totalWeight = getCombatItemDistributionTotalWeight();

  assertGreaterThan(totalWeight, 0, "item distribution total weight");

  for (const entry of DEFAULT_COMBAT_ITEM_DISTRIBUTION_TABLE) {
    assert(
      entry.itemType in COMBAT_ITEM_REGISTRY,
      `item distribution registered item type: ${entry.itemType}`
    );
    assertGreaterThan(
      entry.weight,
      0,
      `${entry.role} ${entry.itemType} distribution weight`
    );
  }

  const roleShares = createDistributionRoleShares(totalWeight);
  const itemShares = createDistributionItemShares(totalWeight);

  validateDistributionShareRanges(
    roleShares,
    ITEM_DISTRIBUTION_BALANCE_TUNING.roleShareRanges,
    "role"
  );
  validateDistributionShareRanges(
    itemShares,
    ITEM_DISTRIBUTION_BALANCE_TUNING.itemShareRanges,
    "item"
  );

  for (const itemType of Object.keys(COMBAT_ITEM_REGISTRY) as CombatItemType[]) {
    assertAlmostEqual(
      COMBAT_ITEM_REGISTRY[itemType].pickupWeight,
      getCombatItemDistributionItemWeight(itemType),
      `${itemType} registry pickup weight mirrors distribution table`
    );
  }

  return {
    distributionTotalWeight: totalWeight,
    roleShares,
    itemShares
  };
}

function validateCombatItemCatchUpWeighting(): CombatItemCatchUpValidationResult {
  const trackLength = DEFAULT_TRACK_GAMEPLAY_METADATA.road.totalLength;
  const baselineDistance = trackLength;
  const leader = createCombatItemCatchUpState({
    racerRank: 1,
    racerCount: RACE_CAPACITY,
    completedDistance: baselineDistance,
    leaderCompletedDistance: baselineDistance,
    trackLength
  });
  const trailing = createCombatItemCatchUpState({
    racerRank: RACE_CAPACITY,
    racerCount: RACE_CAPACITY,
    completedDistance: baselineDistance,
    leaderCompletedDistance:
      baselineDistance +
      trackLength * COMBAT_ITEM_CATCH_UP_TUNING.fullEffectDistanceTrackFraction,
    trackLength
  });
  const closeMiddle = createCombatItemCatchUpState({
    racerRank: 2,
    racerCount: RACE_CAPACITY,
    completedDistance: baselineDistance,
    leaderCompletedDistance: baselineDistance,
    trackLength
  });
  const distanceOnlyMiddle = createCombatItemCatchUpState({
    racerRank: 2,
    racerCount: RACE_CAPACITY,
    completedDistance: baselineDistance,
    leaderCompletedDistance:
      baselineDistance +
      trackLength * COMBAT_ITEM_CATCH_UP_TUNING.fullEffectDistanceTrackFraction,
    trackLength
  });

  const leaderBoostWeight = requireCatchUpWeight(leader.weights, "boost").weight;
  const trailingBoostWeight = requireCatchUpWeight(
    trailing.weights,
    "boost"
  ).weight;
  const leaderShellWeight = requireCatchUpWeight(leader.weights, "shell").weight;
  const trailingShellWeight = requireCatchUpWeight(
    trailing.weights,
    "shell"
  ).weight;
  const leaderBananaWeight = requireCatchUpWeight(
    leader.weights,
    "banana"
  ).weight;
  const trailingBananaWeight = requireCatchUpWeight(
    trailing.weights,
    "banana"
  ).weight;
  const closeMiddleBoostWeight = requireCatchUpWeight(
    closeMiddle.weights,
    "boost"
  ).weight;
  const distanceOnlyBoostWeight = requireCatchUpWeight(
    distanceOnlyMiddle.weights,
    "boost"
  ).weight;

  assertGreaterThan(
    trailing.positionScore,
    leader.positionScore,
    "trailing racer has larger position catch-up score"
  );
  assertGreaterThan(
    trailing.distanceScore,
    leader.distanceScore,
    "trailing racer has larger distance catch-up score"
  );
  assertGreaterThan(
    trailingBoostWeight,
    leaderBoostWeight,
    "trailing racer receives stronger boost recovery weighting"
  );
  assertGreaterThan(
    trailingShellWeight,
    leaderShellWeight,
    "trailing racer receives stronger shell combat weighting"
  );
  assertLessThan(
    trailingBananaWeight,
    leaderBananaWeight,
    "trailing racer receives less defensive trap weighting"
  );
  assertGreaterThan(
    distanceOnlyBoostWeight,
    closeMiddleBoostWeight,
    "distance-behind catch-up increases recovery weighting"
  );

  return {
    leaderBoostWeight,
    trailingBoostWeight,
    leaderShellWeight,
    trailingShellWeight,
    leaderBananaWeight,
    trailingBananaWeight,
    distanceOnlyBoostWeight,
    closeMiddleBoostWeight
  };
}

function requireCatchUpWeight(
  weights: readonly CombatItemSelectionWeight[],
  itemType: CombatItemType
): CombatItemSelectionWeight {
  const weight = weights.find((entry) => entry.itemType === itemType);

  if (weight === undefined) {
    throw new Error(`Expected catch-up weight for ${itemType}.`);
  }

  return weight;
}

function createDistributionRoleShares(
  totalWeight: number
): Readonly<Record<CombatItemDistributionRole, number>> {
  return {
    common: getCombatItemDistributionRoleWeight("common") / totalWeight,
    defensive: getCombatItemDistributionRoleWeight("defensive") / totalWeight,
    offensive: getCombatItemDistributionRoleWeight("offensive") / totalWeight,
    "high-impact":
      getCombatItemDistributionRoleWeight("high-impact") / totalWeight
  };
}

function createDistributionItemShares(
  totalWeight: number
): Readonly<Record<CombatItemType, number>> {
  return {
    boost: getCombatItemDistributionItemWeight("boost") / totalWeight,
    shell: getCombatItemDistributionItemWeight("shell") / totalWeight,
    banana: getCombatItemDistributionItemWeight("banana") / totalWeight
  };
}

function validateDistributionShareRanges<Key extends string>(
  shares: Readonly<Record<Key, number>>,
  ranges: Readonly<Record<Key, { readonly min: number; readonly max: number }>>,
  label: string
): void {
  for (const key of Object.keys(ranges) as Key[]) {
    const share = shares[key];
    const range = ranges[key];

    assertGreaterThanOrEqual(
      share,
      range.min,
      `${label} ${key} distribution share lower bound`
    );
    assertLessThanOrEqual(
      share,
      range.max,
      `${label} ${key} distribution share upper bound`
    );
  }
}

function createPickupProgressSample(
  pickup: RaceItemPickupConfig
): ItemPickupProgressSample {
  const projection = getNearestTrackRoadProjection(
    DEFAULT_TRACK_GAMEPLAY_METADATA.road,
    pickup.position
  );

  return {
    trackProgress: projection.trackProgress
  };
}

function getMaxLoopGapMeters(
  samples: readonly ItemPickupProgressSample[],
  trackLength: number
): number {
  if (samples.length === 0) {
    throw new Error("Expected at least one item pickup for cadence validation.");
  }

  let maxGap = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const current = requireValue(samples[index], "current pickup progress sample");
    const next = requireValue(
      samples[(index + 1) % samples.length],
      "next pickup progress sample"
    );
    const gap =
      next.trackProgress >= current.trackProgress
        ? next.trackProgress - current.trackProgress
        : trackLength - current.trackProgress + next.trackProgress;

    maxGap = Math.max(maxGap, gap);
  }

  return maxGap;
}

function validatePickupPosition(pickup: RaceItemPickupConfig): void {
  const surface = queryTrackGameplaySurfaceAtPoint(
    DEFAULT_TRACK_GAMEPLAY_METADATA,
    pickup.position
  );

  assertEqual(surface.surface, "road", `${pickup.id} sits on road surface`);
  assertLessThanOrEqual(
    Math.abs(surface.signedLateralOffset) + pickup.radius,
    DEFAULT_TRACK_GAMEPLAY_METADATA.road.roadWidth / 2,
    `${pickup.id} pickup radius stays on road`
  );
}

function validatePickupRespawn(pickup: RaceItemPickupConfig): void {
  assertEqual(
    pickup.respawnSeconds,
    COMBAT_ITEM_REGISTRY[pickup.itemType].respawnSeconds,
    `${pickup.id} uses registry respawn tuning`
  );
  assertGreaterThanOrEqual(
    pickup.respawnSeconds,
    ITEM_PICKUP_CADENCE_TUNING.minRespawnSeconds,
    `${pickup.id} respawn lower bound`
  );
  assertLessThanOrEqual(
    pickup.respawnSeconds,
    ITEM_PICKUP_CADENCE_TUNING.maxRespawnSeconds,
    `${pickup.id} respawn upper bound`
  );
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Expected ${label}.`);
  }

  return value;
}

function assert(value: boolean, label: string): void {
  if (!value) {
    throw new Error(label);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertGreaterThanOrEqual(
  actual: number,
  expected: number,
  label: string
): void {
  if (actual < expected) {
    throw new Error(`${label}: expected >= ${expected}, got ${actual}.`);
  }
}

function assertGreaterThan(actual: number, expected: number, label: string): void {
  if (actual <= expected) {
    throw new Error(`${label}: expected > ${expected}, got ${actual}.`);
  }
}

function assertLessThanOrEqual(
  actual: number,
  expected: number,
  label: string
): void {
  if (actual > expected) {
    throw new Error(`${label}: expected <= ${expected}, got ${actual}.`);
  }
}

function assertLessThan(actual: number, expected: number, label: string): void {
  if (actual >= expected) {
    throw new Error(`${label}: expected < ${expected}, got ${actual}.`);
  }
}

function assertAlmostEqual(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 0.000001) {
    throw new Error(`${label}: expected ${expected}, got ${actual}.`);
  }
}

main();
