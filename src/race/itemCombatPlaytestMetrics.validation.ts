import { RACE_CAPACITY } from "../config/gameConfig";
import { DEFAULT_TRACK_GAMEPLAY_METADATA } from "../config/tracks";
import {
  COMBAT_ITEM_TYPES,
  DEFAULT_COMBAT_ITEM_DISTRIBUTION_TABLE,
  DEFAULT_RACE_ITEM_PICKUPS,
  RACE_TARGET_DURATION_SECONDS,
  createRaceSessionFromStartRoster,
  refreshRacerCollisionBounds,
  type CombatItemType,
  type RaceBoostActivationEvent,
  type RaceItemActivationTargetResolution,
  type RaceItemPickupCollectionEvent,
  type RaceItemUseAction,
  type RaceSession,
  type RaceSessionRacerControllerPath,
  type RaceSessionRacerState
} from "./raceSession";
import { createMultiplayerRaceStartRoster } from "./raceStartRoster";

interface ItemCombatPlaytestMetricsValidationResult {
  readonly pickupFrequency: ItemPickupFrequencyMetrics;
  readonly usefulItemRate: UsefulItemRateMetrics;
  readonly combatOpportunityRate: CombatOpportunityRateMetrics;
  readonly controlledCycle: ControlledPlaytestCycleMetrics;
}

interface ItemPickupFrequencyMetrics {
  readonly pickupBoxCount: number;
  readonly lapCount: number;
  readonly raceTargetSeconds: number;
  readonly pickupOpportunitiesPerRace: number;
  readonly pickupOpportunitiesPerRacerRace: number;
  readonly pickupOpportunitiesPerRacerLap: number;
  readonly pickupOpportunitiesPerMinute: number;
  readonly averageGlobalOpportunitySpacingSeconds: number;
}

interface UsefulItemRateMetrics {
  readonly weightedUsefulItemRate: number;
  readonly controlledUsefulItemUseRate: number;
  readonly byType: Readonly<Record<CombatItemType, ItemTypeUsefulnessMetrics>>;
}

interface ItemTypeUsefulnessMetrics {
  readonly itemType: CombatItemType;
  readonly sampleCount: number;
  readonly usefulSampleCount: number;
  readonly usefulRate: number;
  readonly distributionShare: number;
  readonly averageCandidateCount: number;
}

interface CombatOpportunityRateMetrics {
  readonly layoutCombatItemShare: number;
  readonly distributionCombatItemShare: number;
  readonly combatItemShare: number;
  readonly combatCandidateCoverageRate: number;
  readonly averageCombatCandidateCount: number;
  readonly combatOpportunitiesPerRace: number;
  readonly combatOpportunityRatePerMinute: number;
  readonly controlledCombatOpportunityActionRate: number;
}

interface ControlledPlaytestCycleMetrics {
  readonly itemPickupCollections: number;
  readonly itemUseActions: number;
  readonly usefulItemUseActions: number;
  readonly usefulItemUseRate: number;
  readonly combatItemUseActions: number;
  readonly combatOpportunityActions: number;
  readonly combatOpportunityActionRate: number;
  readonly grantedItemCounts: Readonly<Record<CombatItemType, number>>;
  readonly usedItemCounts: Readonly<Record<CombatItemType, number>>;
}

interface ItemActivationTargetSample {
  readonly sourceRacerId: string;
  readonly itemType: CombatItemType;
  readonly usefulCandidateCount: number;
  readonly useful: boolean;
}

const HOST_PEER_ID = "metrics-host-peer";
const GUEST_PEER_ID = "metrics-guest-peer";

const PLAYTEST_METRIC_TARGETS = {
  minPickupOpportunitiesPerRacerLap: 1,
  minPickupOpportunitiesPerRacerRace: 3,
  minPickupOpportunitiesPerMinute: 8,
  minUsefulItemRate: 0.85,
  minControlledUsefulItemUseRate: 0.85,
  minCombatCandidateCoverageRate: 0.9,
  minAverageCombatCandidateCount: 1,
  minCombatOpportunityRatePerMinute: 4
} as const;

const PARKED_RACER_POSITIONS = [
  { x: -12, y: 0.45, z: 0 },
  { x: -4, y: 0.45, z: 0 },
  { x: 4, y: 0.45, z: 0 },
  { x: 12, y: 0.45, z: 0 }
] as const;

function main(): void {
  const result = validateItemCombatPlaytestMetrics();

  console.info(
    [
      "itemCombatPlaytestMetrics=ok",
      `boxes=${result.pickupFrequency.pickupBoxCount}`,
      `laps=${result.pickupFrequency.lapCount}`,
      `pickupsPerRacerLap=${result.pickupFrequency.pickupOpportunitiesPerRacerLap.toFixed(
        2
      )}`,
      `pickupsPerMinute=${result.pickupFrequency.pickupOpportunitiesPerMinute.toFixed(
        2
      )}`,
      `usefulRate=${result.usefulItemRate.weightedUsefulItemRate.toFixed(2)}`,
      `controlledUsefulRate=${result.usefulItemRate.controlledUsefulItemUseRate.toFixed(
        2
      )}`,
      `combatCoverage=${result.combatOpportunityRate.combatCandidateCoverageRate.toFixed(
        2
      )}`,
      `combatRatePerMinute=${result.combatOpportunityRate.combatOpportunityRatePerMinute.toFixed(
        2
      )}`,
      `avgCombatCandidates=${result.combatOpportunityRate.averageCombatCandidateCount.toFixed(
        2
      )}`,
      `controlledCollections=${result.controlledCycle.itemPickupCollections}`,
      `controlledActions=${result.controlledCycle.itemUseActions}`,
      `controlledCombatActions=${result.controlledCycle.combatOpportunityActions}`
    ].join(" ")
  );
}

export function validateItemCombatPlaytestMetrics(): ItemCombatPlaytestMetricsValidationResult {
  const targetSamples = createItemActivationTargetSamples(
    createMetricsValidationRaceSession()
  );
  const pickupFrequency = createPickupFrequencyMetrics();
  const controlledCycle = runControlledPlaytestItemCycle();
  const usefulItemRate = createUsefulItemRateMetrics(
    targetSamples,
    controlledCycle
  );
  const combatOpportunityRate = createCombatOpportunityRateMetrics(
    pickupFrequency,
    targetSamples,
    controlledCycle
  );

  assertGreaterThanOrEqual(
    pickupFrequency.pickupOpportunitiesPerRacerLap,
    PLAYTEST_METRIC_TARGETS.minPickupOpportunitiesPerRacerLap,
    "pickup frequency per racer lap"
  );
  assertGreaterThanOrEqual(
    pickupFrequency.pickupOpportunitiesPerRacerRace,
    PLAYTEST_METRIC_TARGETS.minPickupOpportunitiesPerRacerRace,
    "pickup frequency per racer race"
  );
  assertGreaterThanOrEqual(
    pickupFrequency.pickupOpportunitiesPerMinute,
    PLAYTEST_METRIC_TARGETS.minPickupOpportunitiesPerMinute,
    "pickup opportunity rate per minute"
  );
  assertEqual(
    controlledCycle.itemPickupCollections,
    DEFAULT_RACE_ITEM_PICKUPS.length,
    "controlled playtest collects each shipped item box"
  );
  assertEqual(
    controlledCycle.itemUseActions,
    controlledCycle.itemPickupCollections,
    "controlled playtest turns each pickup into one item use"
  );
  assertGreaterThanOrEqual(
    usefulItemRate.weightedUsefulItemRate,
    PLAYTEST_METRIC_TARGETS.minUsefulItemRate,
    "weighted useful item rate"
  );
  assertGreaterThanOrEqual(
    usefulItemRate.controlledUsefulItemUseRate,
    PLAYTEST_METRIC_TARGETS.minControlledUsefulItemUseRate,
    "controlled useful item use rate"
  );
  assertGreaterThanOrEqual(
    combatOpportunityRate.combatCandidateCoverageRate,
    PLAYTEST_METRIC_TARGETS.minCombatCandidateCoverageRate,
    "combat candidate coverage rate"
  );
  assertGreaterThanOrEqual(
    combatOpportunityRate.averageCombatCandidateCount,
    PLAYTEST_METRIC_TARGETS.minAverageCombatCandidateCount,
    "average combat candidate count"
  );
  assertGreaterThanOrEqual(
    combatOpportunityRate.combatOpportunityRatePerMinute,
    PLAYTEST_METRIC_TARGETS.minCombatOpportunityRatePerMinute,
    "combat opportunity rate per minute"
  );

  return {
    pickupFrequency,
    usefulItemRate,
    combatOpportunityRate,
    controlledCycle
  };
}

function createPickupFrequencyMetrics(): ItemPickupFrequencyMetrics {
  const pickupBoxCount = DEFAULT_RACE_ITEM_PICKUPS.length;
  const lapCount = DEFAULT_TRACK_GAMEPLAY_METADATA.lapCount;
  const raceTargetSeconds = RACE_TARGET_DURATION_SECONDS;
  const pickupOpportunitiesPerRace = pickupBoxCount * lapCount;
  const raceTargetMinutes = raceTargetSeconds / 60;

  return {
    pickupBoxCount,
    lapCount,
    raceTargetSeconds,
    pickupOpportunitiesPerRace,
    pickupOpportunitiesPerRacerRace:
      pickupOpportunitiesPerRace / RACE_CAPACITY,
    pickupOpportunitiesPerRacerLap: pickupBoxCount / RACE_CAPACITY,
    pickupOpportunitiesPerMinute:
      pickupOpportunitiesPerRace / raceTargetMinutes,
    averageGlobalOpportunitySpacingSeconds:
      raceTargetSeconds / pickupOpportunitiesPerRace
  };
}

function createItemActivationTargetSamples(
  raceSession: RaceSession
): readonly ItemActivationTargetSample[] {
  const samples: ItemActivationTargetSample[] = [];

  for (const racer of raceSession.racerStates) {
    for (const itemType of COMBAT_ITEM_TYPES) {
      const resolution = raceSession.resolveItemActivationTargets(
        racer.id,
        itemType
      );
      const usefulCandidateCount = getUsefulCandidateCount(
        itemType,
        resolution
      );

      samples.push({
        sourceRacerId: racer.id,
        itemType,
        usefulCandidateCount,
        useful: usefulCandidateCount > 0
      });
    }
  }

  return samples;
}

function createUsefulItemRateMetrics(
  samples: readonly ItemActivationTargetSample[],
  controlledCycle: ControlledPlaytestCycleMetrics
): UsefulItemRateMetrics {
  const byType = createItemRecord<ItemTypeUsefulnessMetrics>((itemType) => {
    const itemSamples = samples.filter((sample) => sample.itemType === itemType);
    const usefulSampleCount = itemSamples.filter((sample) => sample.useful)
      .length;
    const sampleCount = itemSamples.length;

    return {
      itemType,
      sampleCount,
      usefulSampleCount,
      usefulRate: safeRatio(usefulSampleCount, sampleCount),
      distributionShare: getDistributionItemShare(itemType),
      averageCandidateCount: safeRatio(
        itemSamples.reduce(
          (total, sample) => total + sample.usefulCandidateCount,
          0
        ),
        sampleCount
      )
    };
  });
  const weightedUsefulItemRate = COMBAT_ITEM_TYPES.reduce(
    (total, itemType) =>
      total + byType[itemType].usefulRate * byType[itemType].distributionShare,
    0
  );

  return {
    weightedUsefulItemRate,
    controlledUsefulItemUseRate: controlledCycle.usefulItemUseRate,
    byType
  };
}

function createCombatOpportunityRateMetrics(
  pickupFrequency: ItemPickupFrequencyMetrics,
  samples: readonly ItemActivationTargetSample[],
  controlledCycle: ControlledPlaytestCycleMetrics
): CombatOpportunityRateMetrics {
  const combatSamples = samples.filter((sample) =>
    isCombatOpportunityItem(sample.itemType)
  );
  const combatCandidateSamples = combatSamples.filter((sample) => sample.useful);
  const combatCandidateCoverageRate = safeRatio(
    combatCandidateSamples.length,
    combatSamples.length
  );
  const averageCombatCandidateCount = safeRatio(
    combatSamples.reduce(
      (total, sample) => total + sample.usefulCandidateCount,
      0
    ),
    combatSamples.length
  );
  const layoutCombatItemShare = safeRatio(
    DEFAULT_RACE_ITEM_PICKUPS.filter((pickup) =>
      isCombatOpportunityItem(pickup.itemType)
    ).length,
    DEFAULT_RACE_ITEM_PICKUPS.length
  );
  const distributionCombatItemShare =
    getDistributionItemShare("shell") + getDistributionItemShare("banana");
  const combatItemShare = Math.min(
    layoutCombatItemShare,
    distributionCombatItemShare
  );
  const combatOpportunitiesPerRace =
    pickupFrequency.pickupOpportunitiesPerRace *
    combatItemShare *
    combatCandidateCoverageRate;

  return {
    layoutCombatItemShare,
    distributionCombatItemShare,
    combatItemShare,
    combatCandidateCoverageRate,
    averageCombatCandidateCount,
    combatOpportunitiesPerRace,
    combatOpportunityRatePerMinute:
      combatOpportunitiesPerRace / (pickupFrequency.raceTargetSeconds / 60),
    controlledCombatOpportunityActionRate:
      controlledCycle.combatOpportunityActionRate
  };
}

function runControlledPlaytestItemCycle(): ControlledPlaytestCycleMetrics {
  const raceSession = createMetricsValidationRaceSession();
  const itemPickupCollections: RaceItemPickupCollectionEvent[] = [];
  const itemUseActions: RaceItemUseAction[] = [];
  const boostActivations: RaceBoostActivationEvent[] = [];
  const humanCollectors = raceSession.humanRacerStates;

  assertGreaterThan(humanCollectors.length, 0, "controlled human collector count");

  for (let index = 0; index < DEFAULT_RACE_ITEM_PICKUPS.length; index += 1) {
    const pickup = requireValue(
      DEFAULT_RACE_ITEM_PICKUPS[index],
      `default item pickup ${index}`
    );
    const collector = requireValue(
      humanCollectors[index % humanCollectors.length],
      `human collector ${index}`
    );
    const controllerPaths = createControlledCycleControllerPaths(
      raceSession,
      collector.id
    );

    prepareControlledCycleRacers(raceSession, collector, pickup.position);

    const pickupTick = raceSession.tick(0, { controllerPaths });
    const collection = pickupTick.itemPickupCollections.find(
      (event) => event.pickupId === pickup.id && event.racerId === collector.id
    );

    assert(
      collection !== undefined,
      `controlled playtest pickup ${pickup.id} should be collected by ${collector.id}`
    );
    assertEqual(
      pickupTick.itemPickupCollections.length,
      1,
      `controlled playtest pickup ${pickup.id} collection count`
    );

    itemPickupCollections.push(collection);
    collector.itemUseCooldownSeconds = 0;
    raceSession.setHumanInput(collector.id, {
      throttle: 0,
      brake: 1,
      steer: 0,
      drift: false,
      useItem: true
    });

    const useTick = raceSession.tick(0, { controllerPaths });
    const action = useTick.itemUseActions.find(
      (candidate) => candidate.racerId === collector.id
    );

    assert(
      action !== undefined,
      `controlled playtest item from ${pickup.id} should be used by ${collector.id}`
    );

    itemUseActions.push(action);
    boostActivations.push(...useTick.boostActivations);
  }

  const usefulItemUseActions = itemUseActions.filter((action) =>
    isUsefulItemUseAction(action, boostActivations)
  ).length;
  const combatItemUseActions = itemUseActions.filter((action) =>
    isCombatOpportunityItem(action.itemType)
  ).length;
  const combatOpportunityActions = itemUseActions.filter(
    (action) =>
      isCombatOpportunityItem(action.itemType) &&
      getActionUsefulCandidateCount(action) > 0
  ).length;

  return {
    itemPickupCollections: itemPickupCollections.length,
    itemUseActions: itemUseActions.length,
    usefulItemUseActions,
    usefulItemUseRate: safeRatio(usefulItemUseActions, itemUseActions.length),
    combatItemUseActions,
    combatOpportunityActions,
    combatOpportunityActionRate: safeRatio(
      combatOpportunityActions,
      combatItemUseActions
    ),
    grantedItemCounts: countCollectionItems(itemPickupCollections),
    usedItemCounts: countActionItems(itemUseActions)
  };
}

function createMetricsValidationRaceSession(): RaceSession {
  return createRaceSessionFromStartRoster(
    createMultiplayerRaceStartRoster([
      {
        peerId: HOST_PEER_ID,
        displayName: "Metrics Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: GUEST_PEER_ID,
        displayName: "Metrics Guest",
        slotIndex: 1,
        isHost: false
      }
    ]),
    {
      obstacles: [],
      racerTargetRegistryOptions: {
        localPeerId: HOST_PEER_ID
      }
    }
  );
}

function prepareControlledCycleRacers(
  raceSession: RaceSession,
  collector: RaceSessionRacerState,
  pickupPosition: RaceSessionRacerState["position"]
): void {
  for (const racer of raceSession.racerStates) {
    const parkedPosition = requireValue(
      PARKED_RACER_POSITIONS[racer.slotIndex],
      `parked racer position ${racer.slotIndex}`
    );

    racer.position =
      racer.id === collector.id ? { ...pickupPosition } : { ...parkedPosition };
    racer.velocity = { x: 0, y: 0, z: 0 };
    racer.knockbackVelocity = { x: 0, y: 0, z: 0 };
    racer.speed = 0;
    racer.grounded = true;
    racer.heldItem = null;
    racer.itemUseCooldownSeconds = 0;
    racer.boostSeconds = 0;
    racer.shieldSeconds = 0;
    racer.stunSeconds = 0;
    racer.spinoutSeconds = 0;
    racer.spinoutAngularVelocity = 0;
    racer.recoverySeconds = 0;
    racer.recoveryDurationSeconds = 0;
    racer.itemHitImmunitySeconds = 0;
    racer.itemHitImmunityWindowSeconds = 0;
    racer.hitFeedbackSeconds = 0;
    racer.lastHitItemType = null;
    racer.recovering = false;
    racer.timedEffects = {};
    racer.hitSourceImmunitySecondsBySource = {};
    racer.input = {
      throttle: 0,
      brake: 1,
      steer: 0,
      drift: false,
      useItem: false
    };

    refreshRacerCollisionBounds(racer);
  }
}

function createControlledCycleControllerPaths(
  raceSession: RaceSession,
  collectorRacerId: string
): ReadonlyMap<string, RaceSessionRacerControllerPath> {
  const paths = new Map<string, RaceSessionRacerControllerPath>();

  for (const racer of raceSession.racerStates) {
    paths.set(
      racer.id,
      racer.id === collectorRacerId ? "local-input" : "remote-snapshot"
    );
  }

  return paths;
}

function isUsefulItemUseAction(
  action: RaceItemUseAction,
  boostActivations: readonly RaceBoostActivationEvent[]
): boolean {
  if (action.itemType === "boost") {
    return boostActivations.some(
      (event) =>
        event.racerId === action.racerId && event.tickIndex === action.tickIndex
    );
  }

  return getActionUsefulCandidateCount(action) > 0;
}

function getUsefulCandidateCount(
  itemType: CombatItemType,
  resolution: RaceItemActivationTargetResolution
): number {
  if (itemType === "boost") {
    return resolution.candidateAffectedRacerIds.includes(
      resolution.sourceRacerId
    )
      ? 1
      : 0;
  }

  return resolution.candidateAffectedRacerIds.filter(
    (racerId) => racerId !== resolution.sourceRacerId
  ).length;
}

function getActionUsefulCandidateCount(action: RaceItemUseAction): number {
  return getUsefulCandidateCount(action.itemType, action.targetResolution);
}

function getDistributionItemShare(itemType: CombatItemType): number {
  return safeRatio(
    DEFAULT_COMBAT_ITEM_DISTRIBUTION_TABLE.filter(
      (entry) => entry.itemType === itemType
    ).reduce((total, entry) => total + entry.weight, 0),
    DEFAULT_COMBAT_ITEM_DISTRIBUTION_TABLE.reduce(
      (total, entry) => total + entry.weight,
      0
    )
  );
}

function isCombatOpportunityItem(itemType: CombatItemType): boolean {
  return itemType === "shell" || itemType === "banana";
}

function countCollectionItems(
  collections: readonly RaceItemPickupCollectionEvent[]
): Readonly<Record<CombatItemType, number>> {
  const counts = createZeroItemCountRecord();

  for (const collection of collections) {
    counts[collection.itemType] += 1;
  }

  return counts;
}

function countActionItems(
  actions: readonly RaceItemUseAction[]
): Readonly<Record<CombatItemType, number>> {
  const counts = createZeroItemCountRecord();

  for (const action of actions) {
    counts[action.itemType] += 1;
  }

  return counts;
}

function createZeroItemCountRecord(): Record<CombatItemType, number> {
  return {
    boost: 0,
    shell: 0,
    banana: 0
  };
}

function createItemRecord<T>(
  createValue: (itemType: CombatItemType) => T
): Record<CombatItemType, T> {
  return {
    boost: createValue("boost"),
    shell: createValue("shell"),
    banana: createValue("banana")
  };
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator <= 0 ? 0 : numerator / denominator;
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Expected ${label}.`);
  }

  return value;
}

function assert(value: boolean, label: string): asserts value {
  if (!value) {
    throw new Error(label);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertGreaterThan(
  actual: number,
  expected: number,
  label: string
): void {
  if (actual <= expected) {
    throw new Error(`${label}: expected > ${expected}, got ${actual}.`);
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

main();
