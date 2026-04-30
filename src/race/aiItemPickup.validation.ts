import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AiController } from "../ai/aiController";
import type { Vector3 } from "../config/aiRacers";
import { DEFAULT_TRACK_DEFINITION } from "../config/tracks";
import {
  COMBAT_ITEM_TYPES,
  COMBAT_ITEM_REGISTRY,
  createRaceSessionFromStartRoster,
  evaluateAiHeldItemUseDecision,
  refreshRacerCollisionBounds,
  type AiHeldItemUseDecisionReason,
  type CombatItemType,
  type RaceItemPickupCollectionEvent,
  type RaceItemPickupConfig,
  type RaceItemPickupState,
  type RaceSession,
  type RaceSessionRacerState
} from "./raceSession";
import { createRaceStartRoster } from "./raceStartRoster";

type PickupParityController = "human" | "ai";

interface PickupRuleScenarioResult {
  readonly controller: PickupParityController;
  readonly racerId: string;
  readonly pickupId: string;
  readonly outsideCollections: number;
  readonly collectionRacerId: string;
  readonly collectionItemType: CombatItemType;
  readonly collectionCooldownSeconds: number;
  readonly cooldownBlockedCollections: number;
  readonly respawnCollections: number;
  readonly fullInventoryBlockedCollections: number;
  readonly heldItemAfterFullInventoryBlock: CombatItemType | null;
  readonly pickupCooldownAfterFullInventoryBlock: number;
}

interface PickupCollisionGateScenarioResult {
  readonly controller: PickupParityController;
  readonly racerId: string;
  readonly pickupId: string;
  readonly firstCollections: number;
  readonly continuousOverlapCollections: number;
  readonly separationCollections: number;
  readonly reentryCollections: number;
  readonly respawnCollections: number;
}

interface PickupCollisionGateValidationResult {
  readonly human: PickupCollisionGateScenarioResult;
  readonly ai: PickupCollisionGateScenarioResult;
}

interface InactivePickupCollisionGateValidationResult {
  readonly pickupId: string;
  readonly initialCollections: number;
  readonly inactiveSeparationCollections: number;
  readonly inactiveAfterSeparationActive: boolean;
  readonly inactiveAfterSeparationCooldown: number;
  readonly inactiveReentryCollections: number;
  readonly heldItemAfterInactiveReentry: CombatItemType | null;
}

interface InactivePickupEventGrantValidationResult {
  readonly pickupId: string;
  readonly initialCollections: number;
  readonly inactiveEventAccepted: boolean;
  readonly heldItemAfterInactiveEvent: CombatItemType | null;
  readonly pickupActiveAfterInactiveEvent: boolean;
  readonly pickupCooldownAfterInactiveEvent: number;
}

interface RegeneratedPickupEventGrantValidationResult {
  readonly pickupId: string;
  readonly firstCollectionCount: number;
  readonly firstApplyAccepted: boolean;
  readonly firstRespawnDeadlineElapsedSeconds: number;
  readonly hostActiveAfterRespawn: boolean;
  readonly secondCollectionElapsedSeconds: number;
  readonly secondCollectionCollisionCandidates: number;
  readonly secondCollectionCount: number;
  readonly secondCollectionPickupId: string;
  readonly secondCollectionItemType: CombatItemType;
  readonly mirroredPickupActiveBeforeSecondApply: boolean;
  readonly mirroredPickupCooldownBeforeSecondApply: number;
  readonly secondApplyAccepted: boolean;
  readonly mirroredHeldItemAfterSecondApply: CombatItemType | null;
  readonly mirroredPickupActiveAfterSecondApply: boolean;
  readonly mirroredPickupCooldownAfterSecondApply: number;
}

interface AiGrantedItemInventoryTimerValidationResult {
  readonly racerId: string;
  readonly grantedItem: CombatItemType;
  readonly heldItemAfterGrant: CombatItemType | null;
  readonly pickupCooldownAfterGrant: number;
  readonly blockedItemUseActions: number;
  readonly blockedBoostActivations: number;
  readonly heldItemDuringLockout: CombatItemType | null;
  readonly cooldownAfterBlockedTick: number;
  readonly activatedAction: string;
  readonly activatedBoostEvents: number;
  readonly heldItemAfterActivation: CombatItemType | null;
  readonly cooldownAfterActivation: number;
}

interface AcceptedGatedPickupGrantTargetValidationResult {
  readonly pickupId: string;
  readonly collectionCount: number;
  readonly collectionRacerId: string;
  readonly grantedItemType: CombatItemType;
  readonly localHumanRacerId: string;
  readonly remoteHumanRacerId: string;
  readonly localHeldItemAfterAcceptedPickup: CombatItemType | null;
  readonly remoteHeldItemAfterAcceptedPickup: CombatItemType | null;
  readonly mirroredApplyAccepted: boolean;
  readonly mirroredDuplicateAccepted: boolean;
  readonly mirroredLocalHeldItemAfterAcceptedPickup: CombatItemType | null;
  readonly mirroredRemoteHeldItemAfterAcceptedPickup: CombatItemType | null;
}

interface SelectedPickupInventorySlotValidationResult {
  readonly collectionCount: number;
  readonly collectionPickupId: string;
  readonly selectedItemType: CombatItemType;
  readonly heldItemAfterPickup: CombatItemType | null;
  readonly uncollectedPickupActive: boolean;
  readonly uncollectedPickupCooldownSeconds: number;
}

interface AiContextualItemUseScenarioResult {
  readonly itemType: CombatItemType;
  readonly racerId: string;
  readonly decisionReasonBeforeTick: AiHeldItemUseDecisionReason;
  readonly decisionTargetBeforeTick: string | null;
  readonly action: string;
  readonly actionItemType: CombatItemType;
  readonly actionRacerId: string;
  readonly activeItemId: string | null;
  readonly heldItemAfterUse: CombatItemType | null;
  readonly inputUseItemAfterTick: boolean;
  readonly boostActivations: number;
  readonly activeShells: number;
  readonly activeBananas: number;
  readonly candidateIncludesTarget: boolean;
}

interface AiContextualItemHoldScenarioResult {
  readonly itemType: CombatItemType;
  readonly racerId: string;
  readonly decisionReasonBeforeTick: AiHeldItemUseDecisionReason;
  readonly itemUseActions: number;
  readonly heldItemAfterTick: CombatItemType | null;
}

interface AiContextualItemUseValidationResult {
  readonly boost: AiContextualItemUseScenarioResult;
  readonly shell: AiContextualItemUseScenarioResult;
  readonly banana: AiContextualItemUseScenarioResult;
  readonly shellHold: AiContextualItemHoldScenarioResult;
  readonly bananaHold: AiContextualItemHoldScenarioResult;
}

type ItemUseParityController = "player" | "ai";

interface ItemUseRuleParityOutcome {
  readonly controller: ItemUseParityController;
  readonly itemType: CombatItemType;
  readonly racerId: string;
  readonly actionCount: number;
  readonly action: string | null;
  readonly actionItemType: CombatItemType | null;
  readonly activeItemId: string | null;
  readonly heldItemAfterTick: CombatItemType | null;
  readonly cooldownAfterTick: number;
  readonly inputUseItemAfterTick: boolean;
  readonly boostActivations: number;
  readonly sourceBoostSeconds: number;
  readonly activeShells: number;
  readonly activeBananas: number;
  readonly activeItemType: CombatItemType | null;
  readonly activeItemOwnerRacerId: string | null;
  readonly activeItemSpeed: number | null;
  readonly activeItemTtlSeconds: number | null;
  readonly activeItemArmedSeconds: number | null;
  readonly candidateAffectedCount: number;
}

interface AiPlayerItemUseRuleParityScenarioResult {
  readonly itemType: CombatItemType;
  readonly playerReady: ItemUseRuleParityOutcome;
  readonly aiReady: ItemUseRuleParityOutcome;
  readonly playerCooldownBlocked: ItemUseRuleParityOutcome;
  readonly aiCooldownBlocked: ItemUseRuleParityOutcome;
}

interface AiPlayerItemUseRuleParityValidationResult {
  readonly boost: AiPlayerItemUseRuleParityScenarioResult;
  readonly shell: AiPlayerItemUseRuleParityScenarioResult;
  readonly banana: AiPlayerItemUseRuleParityScenarioResult;
}

interface AutomaticPickupRespawnValidationResult {
  readonly pickupId: string;
  readonly respawnSeconds: number;
  readonly respawnDeadlineElapsedSeconds: number;
  readonly activeAfterCollection: boolean;
  readonly cooldownAfterCollection: number;
  readonly elapsedBeforeRespawn: number;
  readonly activeBeforeRespawn: boolean;
  readonly cooldownBeforeRespawn: number;
  readonly elapsedAfterRespawn: number;
  readonly activeAfterRespawn: boolean;
  readonly cooldownAfterRespawn: number;
  readonly respawnDeadlineAfterRespawn: number | null;
  readonly collectionsOnRespawnTick: number;
}

export interface AiItemPickupParityValidationResult {
  readonly human: PickupRuleScenarioResult;
  readonly ai: PickupRuleScenarioResult;
  readonly automaticRespawn: AutomaticPickupRespawnValidationResult;
  readonly pickupCollisionGate: PickupCollisionGateValidationResult;
  readonly inactivePickupCollisionGate: InactivePickupCollisionGateValidationResult;
  readonly inactivePickupEventGrant: InactivePickupEventGrantValidationResult;
  readonly regeneratedPickupEventGrant: RegeneratedPickupEventGrantValidationResult;
  readonly aiGrantedInventoryTimers: AiGrantedItemInventoryTimerValidationResult;
  readonly acceptedGatedPickupGrantTarget: AcceptedGatedPickupGrantTargetValidationResult;
  readonly selectedPickupInventorySlot: SelectedPickupInventorySlotValidationResult;
  readonly aiContextualItemUse: AiContextualItemUseValidationResult;
  readonly aiPlayerItemUseRuleParity: AiPlayerItemUseRuleParityValidationResult;
}

const STATIONARY_AI_CONTROLLER: AiController = {
  getCommand: () => ({
    throttle: 0,
    brake: 1,
    steering: 0
  })
};

const PICKUP_TICK_SECONDS = 1 / 60;

export function validateAiItemPickupRuleParity(): AiItemPickupParityValidationResult {
  const human = runPickupRuleScenario("human");
  const ai = runPickupRuleScenario("ai");
  const automaticRespawn = validateAutomaticPickupRespawn();
  const pickupCollisionGate = validatePickupCollisionGate();
  const inactivePickupCollisionGate = validateInactivePickupCollisionGate();
  const inactivePickupEventGrant = validateInactivePickupEventGrant();
  const regeneratedPickupEventGrant = validateRegeneratedPickupEventGrant();
  const aiGrantedInventoryTimers = validateAiGrantedItemInventoryTimers();
  const acceptedGatedPickupGrantTarget =
    validateAcceptedGatedPickupGrantTarget();
  const selectedPickupInventorySlot = validateSelectedPickupInventorySlot();
  const aiContextualItemUse = validateAiContextualItemUseBehavior();
  const aiPlayerItemUseRuleParity = validateAiPlayerItemUseRuleParity();

  assertPickupRuleScenario(human, "human pickup rules");
  assertPickupRuleScenario(ai, "AI pickup rules");
  assertEqual(
    ai.outsideCollections,
    human.outsideCollections,
    "AI outside collision miss matches human"
  );
  if (
    !COMBAT_ITEM_TYPES.includes(ai.collectionItemType) ||
    !COMBAT_ITEM_TYPES.includes(human.collectionItemType)
  ) {
    throw new Error("AI and human pickup grants must use combat item pool.");
  }
  assertAlmostEqual(
    ai.collectionCooldownSeconds,
    human.collectionCooldownSeconds,
    "AI collection cooldown matches human"
  );
  assertEqual(
    ai.cooldownBlockedCollections,
    human.cooldownBlockedCollections,
    "AI cooldown-blocked collection count matches human"
  );
  assertEqual(
    ai.respawnCollections,
    human.respawnCollections,
    "AI respawn collection count matches human"
  );
  assertEqual(
    ai.fullInventoryBlockedCollections,
    human.fullInventoryBlockedCollections,
    "AI full-inventory block count matches human"
  );
  assertAutomaticPickupRespawn(automaticRespawn);
  assertInactivePickupCollisionGate(inactivePickupCollisionGate);
  assertInactivePickupEventGrant(inactivePickupEventGrant);
  assertRegeneratedPickupEventGrant(regeneratedPickupEventGrant);
  assertAiGrantedItemInventoryTimers(aiGrantedInventoryTimers);
  assertAcceptedGatedPickupGrantTarget(acceptedGatedPickupGrantTarget);
  assertSelectedPickupInventorySlot(selectedPickupInventorySlot);
  assertAiContextualItemUseBehavior(aiContextualItemUse);
  assertAiPlayerItemUseRuleParity(aiPlayerItemUseRuleParity);

  return {
    human,
    ai,
    automaticRespawn,
    pickupCollisionGate,
    inactivePickupCollisionGate,
    inactivePickupEventGrant,
    regeneratedPickupEventGrant,
    aiGrantedInventoryTimers,
    acceptedGatedPickupGrantTarget,
    selectedPickupInventorySlot,
    aiContextualItemUse,
    aiPlayerItemUseRuleParity
  };
}

function runPickupRuleScenario(
  controller: PickupParityController
): PickupRuleScenarioResult {
  const pickup = createValidationPickup();
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      aiController: STATIONARY_AI_CONTROLLER,
      obstacles: [],
      itemPickups: [pickup]
    }
  );
  const racer = selectScenarioRacer(raceSession, controller);
  const pickupState = requirePickupState(raceSession, pickup.id);

  parkNonScenarioRacers(raceSession, racer.id);
  prepareRacerForPickupValidation(racer, pickup.position);

  const pickupSideDirection = rightFromHeading(racer.headingRadians);
  const pickupSideContactDistance =
    refreshRacerCollisionBounds(racer).halfWidth + pickup.radius;

  prepareRacerForPickupValidation(
    racer,
    offsetPlanarPosition(
      pickup.position,
      pickupSideDirection,
      pickupSideContactDistance + 0.1
    )
  );

  const outsideTick = raceSession.tick(0);

  prepareRacerForPickupValidation(
    racer,
    offsetPlanarPosition(
      pickup.position,
      pickupSideDirection,
      Math.max(0, pickupSideContactDistance - 0.1)
    )
  );

  const collectionTick = raceSession.tick(0);
  const collection = requireCollectionEvent(
    collectionTick.itemPickupCollections[0],
    `${controller} item pickup collection`
  );

  racer.heldItem = null;
  prepareRacerForPickupValidation(racer, pickup.position);
  const cooldownBlockedTick = raceSession.tick(0);
  const respawnCollections = tickUntilPickupRespawns(
    raceSession,
    pickup.respawnSeconds
  );

  racer.heldItem = COMBAT_ITEM_REGISTRY.boost.type;
  racer.itemUseCooldownSeconds = 1;
  makePickupAvailableForValidation(pickupState);
  prepareRacerForPickupValidation(racer, pickup.position);
  const fullInventoryBlockedTick = raceSession.tick(0);

  return {
    controller,
    racerId: racer.id,
    pickupId: pickup.id,
    outsideCollections: outsideTick.itemPickupCollections.length,
    collectionRacerId: collection.racerId,
    collectionItemType: collection.itemType,
    collectionCooldownSeconds: collection.cooldownSeconds,
    cooldownBlockedCollections:
      cooldownBlockedTick.itemPickupCollections.length,
    respawnCollections,
    fullInventoryBlockedCollections:
      fullInventoryBlockedTick.itemPickupCollections.length,
    heldItemAfterFullInventoryBlock: racer.heldItem,
    pickupCooldownAfterFullInventoryBlock: pickupState.cooldownSeconds
  };
}

function createValidationPickup(): RaceItemPickupConfig {
  return {
    id: "validation-shared-shell-pickup",
    position: getTrackCenterPoint(2),
    radius: 1.4,
    itemType: COMBAT_ITEM_REGISTRY.shell.type,
    respawnSeconds: COMBAT_ITEM_REGISTRY.shell.respawnSeconds
  };
}

function validatePickupCollisionGate(): PickupCollisionGateValidationResult {
  const human = runPickupCollisionGateScenario("human");
  const ai = runPickupCollisionGateScenario("ai");

  assertPickupCollisionGateScenario(human, "human pickup collision gate");
  assertPickupCollisionGateScenario(ai, "AI pickup collision gate");
  assertEqual(
    ai.continuousOverlapCollections,
    human.continuousOverlapCollections,
    "AI continuous-overlap gate matches human"
  );
  assertEqual(
    ai.reentryCollections,
    human.reentryCollections,
    "AI separation gate reset matches human"
  );
  assertEqual(
    ai.respawnCollections,
    human.respawnCollections,
    "AI respawn gate reset matches human"
  );

  return { human, ai };
}

function validateAutomaticPickupRespawn(): AutomaticPickupRespawnValidationResult {
  const pickup = createValidationPickup();
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      aiController: STATIONARY_AI_CONTROLLER,
      obstacles: [],
      itemPickups: [pickup]
    }
  );
  const racer = selectScenarioRacer(raceSession, "human");
  const pickupState = requirePickupState(raceSession, pickup.id);

  parkNonScenarioRacers(raceSession, racer.id);
  prepareRacerForPickupValidation(racer, pickup.position);

  const collectionTick = raceSession.tick(0);
  requireCollectionEvent(
    collectionTick.itemPickupCollections[0],
    "automatic respawn initial pickup"
  );

  const respawnDeadlineElapsedSeconds = requireNumber(
    pickupState.respawnDeadlineElapsedSeconds,
    "automatic pickup respawn deadline"
  );
  const activeAfterCollection = pickupState.active;
  const cooldownAfterCollection = pickupState.cooldownSeconds;

  racer.heldItem = null;
  racer.itemUseCooldownSeconds = 0;
  prepareRacerForPickupValidation(racer, getTrackCenterPoint(8));
  parkRacersAwayFromPickupValidation(raceSession, racer.id);

  const maxTicks = Math.ceil(
    (pickup.respawnSeconds + PICKUP_TICK_SECONDS) / PICKUP_TICK_SECONDS
  );
  let ticks = 0;

  while (
    raceSession.raceElapsedSeconds + PICKUP_TICK_SECONDS <
    respawnDeadlineElapsedSeconds
  ) {
    raceSession.tick(PICKUP_TICK_SECONDS);
    ticks += 1;

    if (ticks > maxTicks) {
      throw new Error("Expected item pickup respawn validation to reach deadline.");
    }
  }

  const elapsedBeforeRespawn = raceSession.raceElapsedSeconds;
  const activeBeforeRespawn = pickupState.active;
  const cooldownBeforeRespawn = pickupState.cooldownSeconds;
  const respawnTick = raceSession.tick(PICKUP_TICK_SECONDS);

  return {
    pickupId: pickup.id,
    respawnSeconds: pickup.respawnSeconds,
    respawnDeadlineElapsedSeconds,
    activeAfterCollection,
    cooldownAfterCollection,
    elapsedBeforeRespawn,
    activeBeforeRespawn,
    cooldownBeforeRespawn,
    elapsedAfterRespawn: raceSession.raceElapsedSeconds,
    activeAfterRespawn: pickupState.active,
    cooldownAfterRespawn: pickupState.cooldownSeconds,
    respawnDeadlineAfterRespawn: pickupState.respawnDeadlineElapsedSeconds,
    collectionsOnRespawnTick: respawnTick.itemPickupCollections.length
  };
}

function runPickupCollisionGateScenario(
  controller: PickupParityController
): PickupCollisionGateScenarioResult {
  const pickup = createValidationPickup();
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      aiController: STATIONARY_AI_CONTROLLER,
      obstacles: [],
      itemPickups: [pickup]
    }
  );
  const racer = selectScenarioRacer(raceSession, controller);
  const pickupState = requirePickupState(raceSession, pickup.id);

  parkNonScenarioRacers(raceSession, racer.id);
  prepareRacerForPickupValidation(racer, pickup.position);

  const pickupSideDirection = rightFromHeading(racer.headingRadians);
  const pickupSideContactDistance =
    refreshRacerCollisionBounds(racer).halfWidth + pickup.radius;
  const firstTick = raceSession.tick(0);

  racer.heldItem = null;
  makePickupAvailableForValidation(pickupState);
  prepareRacerForPickupValidation(racer, pickup.position);
  const continuousOverlapTick = raceSession.tick(0);

  prepareRacerForPickupValidation(
    racer,
    offsetPlanarPosition(
      pickup.position,
      pickupSideDirection,
      pickupSideContactDistance + 0.25
    )
  );
  const separationTick = raceSession.tick(0);

  racer.heldItem = null;
  makePickupAvailableForValidation(pickupState);
  prepareRacerForPickupValidation(racer, pickup.position);
  const reentryTick = raceSession.tick(0);

  racer.heldItem = null;
  prepareRacerForPickupValidation(racer, pickup.position);
  const respawnCollections = tickUntilPickupRespawns(
    raceSession,
    pickup.respawnSeconds
  );

  return {
    controller,
    racerId: racer.id,
    pickupId: pickup.id,
    firstCollections: firstTick.itemPickupCollections.length,
    continuousOverlapCollections:
      continuousOverlapTick.itemPickupCollections.length,
    separationCollections: separationTick.itemPickupCollections.length,
    reentryCollections: reentryTick.itemPickupCollections.length,
    respawnCollections
  };
}

function validateInactivePickupCollisionGate(): InactivePickupCollisionGateValidationResult {
  const pickup = createValidationPickup();
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      aiController: STATIONARY_AI_CONTROLLER,
      obstacles: [],
      itemPickups: [pickup]
    }
  );
  const racer = selectScenarioRacer(raceSession, "human");
  const pickupState = requirePickupState(raceSession, pickup.id);

  parkNonScenarioRacers(raceSession, racer.id);
  prepareRacerForPickupValidation(racer, pickup.position);

  const pickupSideDirection = rightFromHeading(racer.headingRadians);
  const pickupSideContactDistance =
    refreshRacerCollisionBounds(racer).halfWidth + pickup.radius;
  const firstTick = raceSession.tick(0);

  racer.heldItem = null;
  prepareRacerForPickupValidation(
    racer,
    offsetPlanarPosition(
      pickup.position,
      pickupSideDirection,
      pickupSideContactDistance + 0.25
    )
  );
  const inactiveSeparationTick = raceSession.tick(0);
  const inactiveAfterSeparationActive = pickupState.active;
  const inactiveAfterSeparationCooldown = pickupState.cooldownSeconds;

  makePickupAvailableForValidation(pickupState);
  prepareRacerForPickupValidation(racer, pickup.position);
  const inactiveReentryTick = raceSession.tick(0);

  return {
    pickupId: pickup.id,
    initialCollections: firstTick.itemPickupCollections.length,
    inactiveSeparationCollections:
      inactiveSeparationTick.itemPickupCollections.length,
    inactiveAfterSeparationActive,
    inactiveAfterSeparationCooldown,
    inactiveReentryCollections:
      inactiveReentryTick.itemPickupCollections.length,
    heldItemAfterInactiveReentry: racer.heldItem
  };
}

function validateInactivePickupEventGrant(): InactivePickupEventGrantValidationResult {
  const pickup = createValidationPickup();
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      aiController: STATIONARY_AI_CONTROLLER,
      obstacles: [],
      itemPickups: [pickup]
    }
  );
  const racer = selectScenarioRacer(raceSession, "human");
  const pickupState = requirePickupState(raceSession, pickup.id);

  parkNonScenarioRacers(raceSession, racer.id);
  prepareRacerForPickupValidation(racer, pickup.position);

  const firstTick = raceSession.tick(0);

  racer.heldItem = null;
  racer.itemUseCooldownSeconds = 0;

  const inactiveEventAccepted = raceSession.applyItemPickupCollectionEvent({
    eventId: "validation-inactive-pickup-grant",
    pickupId: pickup.id,
    racerId: racer.id,
    itemType: COMBAT_ITEM_REGISTRY.shell.type,
    tickIndex: raceSession.nextTickIndex,
    elapsedSeconds: raceSession.raceElapsedSeconds,
    cooldownSeconds: pickup.respawnSeconds,
    respawnDeadlineElapsedSeconds:
      raceSession.raceElapsedSeconds + pickup.respawnSeconds
  });

  return {
    pickupId: pickup.id,
    initialCollections: firstTick.itemPickupCollections.length,
    inactiveEventAccepted,
    heldItemAfterInactiveEvent: racer.heldItem,
    pickupActiveAfterInactiveEvent: pickupState.active,
    pickupCooldownAfterInactiveEvent: pickupState.cooldownSeconds
  };
}

function validateRegeneratedPickupEventGrant(): RegeneratedPickupEventGrantValidationResult {
  const pickup = createValidationPickup();
  const roster = createRaceStartRoster(createHumanRacerInputs(1));
  const raceSession = createRaceSessionFromStartRoster(roster, {
    aiController: STATIONARY_AI_CONTROLLER,
    obstacles: [],
    itemPickups: [pickup]
  });
  const racer = selectScenarioRacer(raceSession, "human");

  parkNonScenarioRacers(raceSession, racer.id);
  prepareRacerForPickupValidation(racer, pickup.position);

  const firstTick = raceSession.tick(0);
  const firstCollection = requireCollectionEvent(
    firstTick.itemPickupCollections[0],
    "regenerated pickup initial collection"
  );
  const firstRespawnDeadlineElapsedSeconds = requireNumber(
    firstCollection.respawnDeadlineElapsedSeconds,
    "regenerated pickup first respawn deadline"
  );

  racer.heldItem = null;
  racer.itemUseCooldownSeconds = 0;
  prepareRacerForPickupValidation(racer, getTrackCenterPoint(8));
  parkRacersAwayFromPickupValidation(raceSession, racer.id);

  const maxTicks = Math.ceil(
    (pickup.respawnSeconds + PICKUP_TICK_SECONDS) / PICKUP_TICK_SECONDS
  );
  let ticks = 0;

  while (
    raceSession.raceElapsedSeconds + PICKUP_TICK_SECONDS <
    firstRespawnDeadlineElapsedSeconds
  ) {
    raceSession.tick(PICKUP_TICK_SECONDS);
    ticks += 1;

    if (ticks > maxTicks) {
      throw new Error(
        "Expected regenerated pickup validation to reach respawn deadline."
      );
    }
  }

  raceSession.tick(PICKUP_TICK_SECONDS);
  const hostPickupState = requirePickupState(raceSession, pickup.id);
  const hostActiveAfterRespawn = hostPickupState.active;

  racer.heldItem = null;
  racer.itemUseCooldownSeconds = 0;
  prepareRacerForPickupValidation(racer, pickup.position);
  const secondTick = raceSession.tick(0);
  const secondCollection = requireCollectionEvent(
    secondTick.itemPickupCollections[0],
    "regenerated pickup second collection"
  );

  const mirroredSession = createRaceSessionFromStartRoster(roster, {
    aiController: STATIONARY_AI_CONTROLLER,
    obstacles: [],
    itemPickups: [pickup]
  });
  const mirroredRacer = requireRacerState(
    mirroredSession.getRacerState(racer.id),
    "mirrored regenerated pickup racer"
  );
  const mirroredPickup = requirePickupState(mirroredSession, pickup.id);
  const firstApplyAccepted =
    mirroredSession.applyItemPickupCollectionEvent(firstCollection);

  mirroredRacer.heldItem = null;
  mirroredRacer.itemUseCooldownSeconds = 0;

  const mirroredPickupActiveBeforeSecondApply = mirroredPickup.active;
  const mirroredPickupCooldownBeforeSecondApply =
    mirroredPickup.cooldownSeconds;
  const secondApplyAccepted =
    mirroredSession.applyItemPickupCollectionEvent(secondCollection);

  return {
    pickupId: pickup.id,
    firstCollectionCount: firstTick.itemPickupCollections.length,
    firstApplyAccepted,
    firstRespawnDeadlineElapsedSeconds,
    hostActiveAfterRespawn,
    secondCollectionElapsedSeconds: secondCollection.elapsedSeconds,
    secondCollectionCollisionCandidates:
      secondTick.eligibleItemPickupCollisions.length,
    secondCollectionCount: secondTick.itemPickupCollections.length,
    secondCollectionPickupId: secondCollection.pickupId,
    secondCollectionItemType: secondCollection.itemType,
    mirroredPickupActiveBeforeSecondApply,
    mirroredPickupCooldownBeforeSecondApply,
    secondApplyAccepted,
    mirroredHeldItemAfterSecondApply: mirroredRacer.heldItem,
    mirroredPickupActiveAfterSecondApply: mirroredPickup.active,
    mirroredPickupCooldownAfterSecondApply: mirroredPickup.cooldownSeconds
  };
}

function validateAiGrantedItemInventoryTimers(): AiGrantedItemInventoryTimerValidationResult {
  const boost = COMBAT_ITEM_REGISTRY.boost;
  const pickup: RaceItemPickupConfig = {
    id: "validation-ai-granted-boost-pickup",
    position: getTrackCenterPoint(6),
    radius: 1.4,
    itemType: boost.type,
    respawnSeconds: boost.respawnSeconds
  };
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      aiController: STATIONARY_AI_CONTROLLER,
      obstacles: [],
      itemPickups: [pickup]
    }
  );
  const racer = selectScenarioRacer(raceSession, "ai");
  const pickupState = requirePickupState(raceSession, pickup.id);

  parkNonScenarioRacers(raceSession, racer.id);
  prepareRacerForPickupValidation(racer, getTrackCenterPoint(8));

  const granted = raceSession.applyItemPickupCollectionEvent({
    eventId: "validation-ai-granted-boost",
    pickupId: pickup.id,
    racerId: racer.id,
    itemType: boost.type,
    tickIndex: 0,
    elapsedSeconds: 0,
    cooldownSeconds: pickup.respawnSeconds,
    respawnDeadlineElapsedSeconds: pickup.respawnSeconds
  });

  if (!granted) {
    throw new Error("Expected AI granted boost pickup event to apply.");
  }

  const heldItemAfterGrant = racer.heldItem;
  const pickupCooldownAfterGrant = pickupState.cooldownSeconds;

  racer.itemUseCooldownSeconds = boost.defaultRuntimeConfig.useCooldownSeconds;
  const blockedTick = raceSession.tick(PICKUP_TICK_SECONDS);
  const heldItemDuringLockout = racer.heldItem;
  const cooldownAfterBlockedTick = racer.itemUseCooldownSeconds;
  const activationTick = tickUntilAiUsesGrantedItem(
    raceSession,
    racer.id,
    boost.defaultRuntimeConfig.useCooldownSeconds
  );
  const activatedAction = activationTick.itemUseActions.find(
    (action) => action.racerId === racer.id
  );

  if (activatedAction === undefined) {
    throw new Error("Expected AI granted boost to create an item-use action.");
  }

  return {
    racerId: racer.id,
    grantedItem: boost.type,
    heldItemAfterGrant,
    pickupCooldownAfterGrant,
    blockedItemUseActions: blockedTick.itemUseActions.length,
    blockedBoostActivations: blockedTick.boostActivations.length,
    heldItemDuringLockout,
    cooldownAfterBlockedTick,
    activatedAction: activatedAction.action,
    activatedBoostEvents: activationTick.boostActivations.length,
    heldItemAfterActivation: racer.heldItem,
    cooldownAfterActivation: racer.itemUseCooldownSeconds
  };
}

function validateAcceptedGatedPickupGrantTarget(): AcceptedGatedPickupGrantTargetValidationResult {
  const pickup = createValidationPickup();
  const roster = createRaceStartRoster(createHumanRacerInputs(2));
  const raceSession = createRaceSessionFromStartRoster(roster, {
    aiController: STATIONARY_AI_CONTROLLER,
    obstacles: [],
    itemPickups: [pickup]
  });
  const localHuman = requireRacerState(
    raceSession.humanRacerStates[0],
    "accepted pickup local human racer"
  );
  const remoteHuman = requireRacerState(
    raceSession.humanRacerStates[1],
    "accepted pickup remote human racer"
  );

  parkRacersAwayFromPickupValidation(raceSession, remoteHuman.id);
  prepareRacerForPickupValidation(remoteHuman, pickup.position);

  const acceptedPickupTick = raceSession.tick(0);
  const collection = requireCollectionEvent(
    acceptedPickupTick.itemPickupCollections[0],
    "accepted gated human pickup collection"
  );
  const mirroredSession = createRaceSessionFromStartRoster(roster, {
    aiController: STATIONARY_AI_CONTROLLER,
    obstacles: [],
    itemPickups: [pickup]
  });
  const mirroredLocalHuman = requireRacerState(
    mirroredSession.getRacerState(localHuman.id),
    "mirrored accepted pickup local human racer"
  );
  const mirroredRemoteHuman = requireRacerState(
    mirroredSession.getRacerState(remoteHuman.id),
    "mirrored accepted pickup remote human racer"
  );
  const mirroredApplyAccepted =
    mirroredSession.applyItemPickupCollectionEvent(collection);
  const mirroredDuplicateAccepted =
    mirroredSession.applyItemPickupCollectionEvent(collection);

  return {
    pickupId: pickup.id,
    collectionCount: acceptedPickupTick.itemPickupCollections.length,
    collectionRacerId: collection.racerId,
    grantedItemType: collection.itemType,
    localHumanRacerId: localHuman.id,
    remoteHumanRacerId: remoteHuman.id,
    localHeldItemAfterAcceptedPickup: localHuman.heldItem,
    remoteHeldItemAfterAcceptedPickup: remoteHuman.heldItem,
    mirroredApplyAccepted,
    mirroredDuplicateAccepted,
    mirroredLocalHeldItemAfterAcceptedPickup: mirroredLocalHuman.heldItem,
    mirroredRemoteHeldItemAfterAcceptedPickup: mirroredRemoteHuman.heldItem
  };
}

function validateSelectedPickupInventorySlot(): SelectedPickupInventorySlotValidationResult {
  const pickupPosition = getTrackCenterPoint(5);
  const firstPickup: RaceItemPickupConfig = {
    id: "validation-selected-slot-first-pickup",
    position: pickupPosition,
    radius: 1.4,
    itemType: COMBAT_ITEM_REGISTRY.boost.type,
    respawnSeconds: COMBAT_ITEM_REGISTRY.boost.respawnSeconds
  };
  const secondPickup: RaceItemPickupConfig = {
    id: "validation-selected-slot-second-pickup",
    position: pickupPosition,
    radius: 1.4,
    itemType: COMBAT_ITEM_REGISTRY.shell.type,
    respawnSeconds: COMBAT_ITEM_REGISTRY.shell.respawnSeconds
  };
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      aiController: STATIONARY_AI_CONTROLLER,
      obstacles: [],
      itemPickups: [firstPickup, secondPickup]
    }
  );
  const racer = selectScenarioRacer(raceSession, "human");

  parkNonScenarioRacers(raceSession, racer.id);
  prepareRacerForPickupValidation(racer, pickupPosition);

  const pickupTick = raceSession.tick(0);
  const collection = requireCollectionEvent(
    pickupTick.itemPickupCollections[0],
    "selected inventory-slot pickup collection"
  );
  const uncollectedPickup = requirePickupState(
    raceSession,
    collection.pickupId === firstPickup.id ? secondPickup.id : firstPickup.id
  );

  return {
    collectionCount: pickupTick.itemPickupCollections.length,
    collectionPickupId: collection.pickupId,
    selectedItemType: collection.itemType,
    heldItemAfterPickup: racer.heldItem,
    uncollectedPickupActive: uncollectedPickup.active,
    uncollectedPickupCooldownSeconds: uncollectedPickup.cooldownSeconds
  };
}

function validateAiContextualItemUseBehavior(): AiContextualItemUseValidationResult {
  return {
    boost: runAiContextualItemUseScenario("boost"),
    shell: runAiContextualItemUseScenario("shell"),
    banana: runAiContextualItemUseScenario("banana"),
    shellHold: runAiContextualItemHoldScenario("shell"),
    bananaHold: runAiContextualItemHoldScenario("banana")
  };
}

function runAiContextualItemUseScenario(
  itemType: CombatItemType
): AiContextualItemUseScenarioResult {
  const { raceSession, source, target } = createAiItemDecisionValidationSession();

  configureAiItemUseScenario(itemType, source, target);

  const decision = evaluateAiHeldItemUseDecision({
    racer: source,
    racers: raceSession.racerStates,
    activeItems: raceSession.activeItemStates,
    track: { totalLength: DEFAULT_TRACK_DEFINITION.road.totalLength }
  });
  const tick = raceSession.tick(PICKUP_TICK_SECONDS);
  const action = tick.itemUseActions.find(
    (candidate) => candidate.racerId === source.id
  );

  if (action === undefined) {
    throw new Error(`Expected AI ${itemType} contextual item use action.`);
  }

  return {
    itemType,
    racerId: source.id,
    decisionReasonBeforeTick: decision.reason,
    decisionTargetBeforeTick: decision.targetRacerId,
    action: action.action,
    actionItemType: action.itemType,
    actionRacerId: action.racerId,
    activeItemId: action.activeItemId,
    heldItemAfterUse: source.heldItem,
    inputUseItemAfterTick: source.input.useItem,
    boostActivations: tick.boostActivations.filter(
      (event) => event.racerId === source.id
    ).length,
    activeShells: raceSession.shellProjectileStates.filter(
      (shell) => shell.ownerRacerId === source.id
    ).length,
    activeBananas: raceSession.bananaObstacleStates.filter(
      (banana) => banana.ownerRacerId === source.id
    ).length,
    candidateIncludesTarget: action.candidateAffectedRacerIds.includes(
      itemType === "boost" ? source.id : target.id
    )
  };
}

function runAiContextualItemHoldScenario(
  itemType: Exclude<CombatItemType, "boost">
): AiContextualItemHoldScenarioResult {
  const { raceSession, source, target } = createAiItemDecisionValidationSession();

  configureAiItemHoldScenario(itemType, source, target);

  const decision = evaluateAiHeldItemUseDecision({
    racer: source,
    racers: raceSession.racerStates,
    activeItems: raceSession.activeItemStates,
    track: { totalLength: DEFAULT_TRACK_DEFINITION.road.totalLength }
  });
  const tick = raceSession.tick(PICKUP_TICK_SECONDS);

  return {
    itemType,
    racerId: source.id,
    decisionReasonBeforeTick: decision.reason,
    itemUseActions: tick.itemUseActions.filter(
      (action) => action.racerId === source.id
    ).length,
    heldItemAfterTick: source.heldItem
  };
}

function validateAiPlayerItemUseRuleParity(): AiPlayerItemUseRuleParityValidationResult {
  return {
    boost: runAiPlayerItemUseRuleParityScenario("boost"),
    shell: runAiPlayerItemUseRuleParityScenario("shell"),
    banana: runAiPlayerItemUseRuleParityScenario("banana")
  };
}

function runAiPlayerItemUseRuleParityScenario(
  itemType: CombatItemType
): AiPlayerItemUseRuleParityScenarioResult {
  return {
    itemType,
    playerReady: runItemUseRuleParityOutcome(itemType, "player", "ready"),
    aiReady: runItemUseRuleParityOutcome(itemType, "ai", "ready"),
    playerCooldownBlocked: runItemUseRuleParityOutcome(
      itemType,
      "player",
      "cooldown-blocked"
    ),
    aiCooldownBlocked: runItemUseRuleParityOutcome(
      itemType,
      "ai",
      "cooldown-blocked"
    )
  };
}

function runItemUseRuleParityOutcome(
  itemType: CombatItemType,
  controller: ItemUseParityController,
  mode: "ready" | "cooldown-blocked"
): ItemUseRuleParityOutcome {
  const { raceSession, source, target } =
    createItemUseRuleParityValidationSession(controller);

  configureAiItemUseScenario(itemType, source, target);

  if (mode === "cooldown-blocked") {
    source.itemUseCooldownSeconds = getValidationItemUseCooldownSeconds(itemType);
  }

  if (controller === "player") {
    raceSession.setHumanInput(source.id, { useItem: true });
  }

  const tick = raceSession.tick(mode === "ready" ? PICKUP_TICK_SECONDS : 0);
  const sourceActions = tick.itemUseActions.filter(
    (action) => action.racerId === source.id
  );
  const action = sourceActions[0] ?? null;
  const activeItem =
    raceSession.activeItemStates.find(
      (candidate) => candidate.ownerRacerId === source.id
    ) ?? null;

  return {
    controller,
    itemType,
    racerId: source.id,
    actionCount: sourceActions.length,
    action: action?.action ?? null,
    actionItemType: action?.itemType ?? null,
    activeItemId: action?.activeItemId ?? null,
    heldItemAfterTick: source.heldItem,
    cooldownAfterTick: source.itemUseCooldownSeconds,
    inputUseItemAfterTick: source.input.useItem,
    boostActivations: tick.boostActivations.filter(
      (event) => event.racerId === source.id
    ).length,
    sourceBoostSeconds: source.boostSeconds,
    activeShells: raceSession.shellProjectileStates.filter(
      (shell) => shell.ownerRacerId === source.id
    ).length,
    activeBananas: raceSession.bananaObstacleStates.filter(
      (banana) => banana.ownerRacerId === source.id
    ).length,
    activeItemType: activeItem?.type ?? null,
    activeItemOwnerRacerId: activeItem?.ownerRacerId ?? null,
    activeItemSpeed:
      activeItem === null ? null : getPlanarSpeed(activeItem.velocity),
    activeItemTtlSeconds: activeItem?.ttlSeconds ?? null,
    activeItemArmedSeconds: activeItem?.armedSeconds ?? null,
    candidateAffectedCount: action?.candidateAffectedRacerIds.length ?? 0
  };
}

function createItemUseRuleParityValidationSession(
  controller: ItemUseParityController
): {
  readonly raceSession: RaceSession;
  readonly source: RaceSessionRacerState;
  readonly target: RaceSessionRacerState;
} {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(controller === "player" ? 2 : 1)),
    {
      aiController: STATIONARY_AI_CONTROLLER,
      obstacles: [],
      itemPickups: []
    }
  );
  const source = requireRacerState(
    controller === "player"
      ? raceSession.humanRacerStates[0]
      : raceSession.aiRacerStates[0],
    `${controller} item-use parity source`
  );
  const target = requireRacerState(
    controller === "player"
      ? raceSession.humanRacerStates[1]
      : raceSession.humanRacerStates[0],
    `${controller} item-use parity target`
  );

  parkUnusedItemDecisionRacers(raceSession, [source.id, target.id]);
  source.itemHitImmunitySeconds = 0;
  target.itemHitImmunitySeconds = 0;

  return { raceSession, source, target };
}

function createAiItemDecisionValidationSession(): {
  readonly raceSession: RaceSession;
  readonly source: RaceSessionRacerState;
  readonly target: RaceSessionRacerState;
} {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      aiController: STATIONARY_AI_CONTROLLER,
      obstacles: [],
      itemPickups: []
    }
  );
  const source = requireRacerState(
    raceSession.aiRacerStates[0],
    "contextual item-use validation AI"
  );
  const target = requireRacerState(
    raceSession.humanRacerStates[0],
    "contextual item-use validation target"
  );

  parkUnusedItemDecisionRacers(raceSession, [source.id, target.id]);
  source.itemHitImmunitySeconds = 0;
  target.itemHitImmunitySeconds = 0;

  return { raceSession, source, target };
}

function configureAiItemUseScenario(
  itemType: CombatItemType,
  source: RaceSessionRacerState,
  target: RaceSessionRacerState
): void {
  source.heldItem = itemType;
  source.itemUseCooldownSeconds = 0;

  switch (itemType) {
    case "boost":
      placeRacerOnStartStraight(source, 10, {
        rank: 3,
        speed: 0
      });
      placeRacerOnStartStraight(target, 28, {
        rank: 1,
        speed: 20
      });
      break;
    case "shell":
      placeRacerOnStartStraight(source, 10, {
        rank: 2,
        speed: 24
      });
      placeRacerOnStartStraight(target, 20, {
        rank: 1,
        speed: 22
      });
      break;
    case "banana":
      placeRacerOnStartStraight(source, 22, {
        rank: 1,
        speed: 22
      });
      placeRacerOnStartStraight(target, 14, {
        rank: 2,
        speed: 23
      });
      break;
  }
}

function configureAiItemHoldScenario(
  itemType: Exclude<CombatItemType, "boost">,
  source: RaceSessionRacerState,
  target: RaceSessionRacerState
): void {
  source.heldItem = itemType;
  source.itemUseCooldownSeconds = 0;

  if (itemType === "shell") {
    placeRacerOnStartStraight(source, 22, {
      rank: 1,
      speed: 22
    });
    placeRacerOnStartStraight(target, 14, {
      rank: 2,
      speed: 23
    });
    return;
  }

  placeRacerOnStartStraight(source, 10, {
    rank: 2,
    speed: 24
  });
  placeRacerOnStartStraight(target, 20, {
    rank: 1,
    speed: 22
  });
}

function parkUnusedItemDecisionRacers(
  raceSession: RaceSession,
  activeRacerIds: readonly string[]
): void {
  const activeIds = new Set(activeRacerIds);
  let parkingProgress = 70;

  for (const racer of raceSession.racerStates) {
    if (activeIds.has(racer.id)) {
      continue;
    }

    placeRacerOnStartStraight(racer, parkingProgress, {
      rank: 4,
      speed: 0
    });
    racer.heldItem = null;
    racer.itemUseCooldownSeconds = 999;
    racer.itemHitImmunitySeconds = 999;
    parkingProgress += 8;
  }
}

function placeRacerOnStartStraight(
  racer: RaceSessionRacerState,
  trackProgress: number,
  options: {
    readonly rank: number;
    readonly speed: number;
  }
): void {
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const forward = forwardFromHeading(headingRadians);
  const position = offsetPlanarPosition(
    getTrackCenterPoint(0),
    forward,
    trackProgress
  );
  const velocity = {
    x: forward.x * options.speed,
    y: 0,
    z: forward.z * options.speed
  };

  racer.position = position;
  racer.velocity = velocity;
  racer.knockbackVelocity = { x: 0, y: 0, z: 0 };
  racer.forward = { x: forward.x, y: 0, z: forward.z };
  racer.headingRadians = headingRadians;
  racer.speed = options.speed;
  racer.rank = options.rank;
  racer.progress = {
    ...racer.progress,
    lap: 0,
    checkpointIndex: 0,
    trackProgress,
    finished: false
  };
  racer.input = {
    ...racer.input,
    throttle: 0,
    brake: 0,
    steer: 0,
    useItem: false
  };
  racer.body.position.set(position.x, position.y, position.z);
  racer.body.velocity.set(velocity.x, velocity.y, velocity.z);
  refreshRacerCollisionBounds(racer);
}

function tickUntilAiUsesGrantedItem(
  raceSession: RaceSession,
  racerId: string,
  initialCooldownSeconds: number
) {
  const maxTicks = Math.ceil((initialCooldownSeconds + 0.5) / PICKUP_TICK_SECONDS);

  for (let tickIndex = 0; tickIndex < maxTicks; tickIndex += 1) {
    const tickResult = raceSession.tick(PICKUP_TICK_SECONDS);

    if (tickResult.itemUseActions.some((action) => action.racerId === racerId)) {
      return tickResult;
    }
  }

  throw new Error("Expected AI granted item to activate after use lockout.");
}

function selectScenarioRacer(
  raceSession: RaceSession,
  controller: PickupParityController
): RaceSessionRacerState {
  const racer =
    controller === "human"
      ? raceSession.humanRacerStates[0]
      : raceSession.aiRacerStates[0];

  return requireRacerState(racer, `${controller} pickup validation racer`);
}

function parkNonScenarioRacers(
  raceSession: RaceSession,
  scenarioRacerId: string
): void {
  let parkingIndex = 4;

  for (const racer of raceSession.racerStates) {
    if (racer.id === scenarioRacerId) {
      continue;
    }

    prepareRacerForPickupValidation(racer, getTrackCenterPoint(parkingIndex));
    racer.heldItem = COMBAT_ITEM_REGISTRY.boost.type;
    racer.itemUseCooldownSeconds = 999;
    parkingIndex += 2;
  }
}

function parkRacersAwayFromPickupValidation(
  raceSession: RaceSession,
  collectingRacerId: string
): void {
  let parkingIndex = 4;

  for (const racer of raceSession.racerStates) {
    if (racer.id === collectingRacerId) {
      continue;
    }

    prepareRacerForPickupValidation(racer, getTrackCenterPoint(parkingIndex));
    racer.heldItem = null;
    racer.itemUseCooldownSeconds = 0;
    parkingIndex += 2;
  }
}

function prepareRacerForPickupValidation(
  racer: RaceSessionRacerState,
  position: Vector3
): void {
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const forward = forwardFromHeading(headingRadians);

  racer.position = { ...position };
  racer.velocity = { x: 0, y: 0, z: 0 };
  racer.knockbackVelocity = { x: 0, y: 0, z: 0 };
  racer.forward = { x: forward.x, y: 0, z: forward.z };
  racer.headingRadians = headingRadians;
  racer.speed = 0;
  racer.input = {
    ...racer.input,
    throttle: 0,
    brake: 1,
    steer: 0,
    useItem: false
  };
  refreshRacerCollisionBounds(racer);
}

function tickUntilPickupRespawns(
  raceSession: RaceSession,
  respawnSeconds: number
): number {
  const maxTicks = Math.ceil((respawnSeconds + 0.5) / PICKUP_TICK_SECONDS);

  for (let tickIndex = 0; tickIndex < maxTicks; tickIndex += 1) {
    const tickResult = raceSession.tick(PICKUP_TICK_SECONDS);

    if (tickResult.itemPickupCollections.length > 0) {
      return tickResult.itemPickupCollections.length;
    }
  }

  throw new Error("Expected item pickup to collect again after respawn.");
}

function assertPickupRuleScenario(
  result: PickupRuleScenarioResult,
  label: string
): void {
  assertEqual(result.outsideCollections, 0, `${label} outside miss`);
  assertEqual(
    result.collectionRacerId,
    result.racerId,
    `${label} collection racer id`
  );
  if (!COMBAT_ITEM_TYPES.includes(result.collectionItemType)) {
    throw new Error(`${label} collection item type is not in combat item pool.`);
  }
  assertAlmostEqual(
    result.collectionCooldownSeconds,
    COMBAT_ITEM_REGISTRY.shell.respawnSeconds,
    `${label} collection cooldown`
  );
  assertEqual(
    result.cooldownBlockedCollections,
    0,
    `${label} cooldown blocks collection`
  );
  assertEqual(
    result.respawnCollections,
    1,
    `${label} respawn allows collection`
  );
  assertEqual(
    result.fullInventoryBlockedCollections,
    0,
    `${label} full inventory blocks collection`
  );
  assertEqual(
    result.heldItemAfterFullInventoryBlock,
    COMBAT_ITEM_REGISTRY.boost.type,
    `${label} held item survives full inventory block`
  );
  assertAlmostEqual(
    result.pickupCooldownAfterFullInventoryBlock,
    0,
    `${label} available pickup remains available when inventory is full`
  );
}

function assertPickupCollisionGateScenario(
  result: PickupCollisionGateScenarioResult,
  label: string
): void {
  assertEqual(result.firstCollections, 1, `${label} first collection`);
  assertEqual(
    result.continuousOverlapCollections,
    0,
    `${label} blocks continuous-overlap duplicate`
  );
  assertEqual(
    result.separationCollections,
    0,
    `${label} separation does not collect while outside`
  );
  assertEqual(
    result.reentryCollections,
    1,
    `${label} separation resets collision gate`
  );
  assertEqual(
    result.respawnCollections,
    1,
    `${label} respawn resets collision gate`
  );
}

function assertInactivePickupCollisionGate(
  result: InactivePickupCollisionGateValidationResult
): void {
  assertEqual(
    result.initialCollections,
    1,
    "inactive pickup gate validation starts with a collection"
  );
  assertEqual(
    result.inactiveSeparationCollections,
    0,
    "inactive pickup separation cannot collect while respawning"
  );
  assertEqual(
    result.inactiveAfterSeparationActive,
    false,
    "inactive pickup remains inactive while respawning"
  );
  assertGreaterThan(
    result.inactiveAfterSeparationCooldown,
    0,
    "inactive pickup keeps respawn cooldown after ignored separation"
  );
  assertEqual(
    result.inactiveReentryCollections,
    0,
    "inactive pickup collision checks do not reset the gate before availability"
  );
  assertEqual(
    result.heldItemAfterInactiveReentry,
    null,
    "inactive pickup reentry does not grant an item"
  );
}

function assertInactivePickupEventGrant(
  result: InactivePickupEventGrantValidationResult
): void {
  assertEqual(
    result.initialCollections,
    1,
    "inactive pickup event validation starts with a collection"
  );
  assertEqual(
    result.inactiveEventAccepted,
    false,
    "inactive pickup event is rejected before granting inventory"
  );
  assertEqual(
    result.heldItemAfterInactiveEvent,
    null,
    "inactive pickup event does not grant an item"
  );
  assertEqual(
    result.pickupActiveAfterInactiveEvent,
    false,
    "inactive pickup event leaves pickup inactive"
  );
  assertGreaterThan(
    result.pickupCooldownAfterInactiveEvent,
    0,
    "inactive pickup event leaves respawn cooldown intact"
  );
}

function assertRegeneratedPickupEventGrant(
  result: RegeneratedPickupEventGrantValidationResult
): void {
  assertEqual(
    result.firstCollectionCount,
    1,
    "regenerated pickup validation starts with one collection"
  );
  assertEqual(
    result.firstApplyAccepted,
    true,
    "mirrored regenerated pickup first event applies"
  );
  assertEqual(
    result.hostActiveAfterRespawn,
    true,
    "host pickup reactivates at respawn deadline"
  );
  assertGreaterThanOrEqual(
    result.secondCollectionElapsedSeconds,
    result.firstRespawnDeadlineElapsedSeconds,
    "regenerated pickup second collection happens after respawn deadline"
  );
  assertEqual(
    result.secondCollectionCollisionCandidates,
    1,
    "regenerated pickup is eligible for collision after respawn"
  );
  assertEqual(
    result.secondCollectionCount,
    1,
    "regenerated pickup grants exactly one item after respawn"
  );
  assertEqual(
    result.secondCollectionPickupId,
    result.pickupId,
    "regenerated pickup collection uses the same pickup id"
  );
  if (!COMBAT_ITEM_TYPES.includes(result.secondCollectionItemType)) {
    throw new Error(
      "Expected regenerated pickup grant to use combat item pool."
    );
  }
  assertEqual(
    result.mirroredPickupActiveBeforeSecondApply,
    false,
    "mirrored regenerated pickup is still inactive before second event"
  );
  assertGreaterThan(
    result.mirroredPickupCooldownBeforeSecondApply,
    0,
    "mirrored regenerated pickup still has cooldown before second event"
  );
  assertEqual(
    result.secondApplyAccepted,
    true,
    "mirrored regenerated pickup second event applies after respawn deadline"
  );
  assertEqual(
    result.mirroredHeldItemAfterSecondApply,
    result.secondCollectionItemType,
    "mirrored regenerated pickup grants the second event item"
  );
  assertEqual(
    result.mirroredPickupActiveAfterSecondApply,
    false,
    "mirrored regenerated pickup returns to inactive cooldown after second grant"
  );
  assertGreaterThan(
    result.mirroredPickupCooldownAfterSecondApply,
    0,
    "mirrored regenerated pickup starts a new cooldown after second grant"
  );
}

function assertAutomaticPickupRespawn(
  result: AutomaticPickupRespawnValidationResult
): void {
  assertEqual(
    result.activeAfterCollection,
    false,
    "automatic pickup respawn starts inactive after collection"
  );
  assertAlmostEqual(
    result.cooldownAfterCollection,
    result.respawnSeconds,
    "automatic pickup respawn uses configured cooldown"
  );
  assertLessThan(
    result.elapsedBeforeRespawn,
    result.respawnDeadlineElapsedSeconds,
    "automatic pickup respawn validation samples before deadline"
  );
  assertEqual(
    result.activeBeforeRespawn,
    false,
    "automatic pickup remains inactive before respawn deadline"
  );
  assertGreaterThan(
    result.cooldownBeforeRespawn,
    0,
    "automatic pickup cooldown remains positive before respawn deadline"
  );
  assertGreaterThanOrEqual(
    result.elapsedAfterRespawn,
    result.respawnDeadlineElapsedSeconds,
    "automatic pickup respawn tick crosses configured deadline"
  );
  assertEqual(
    result.activeAfterRespawn,
    true,
    "automatic pickup reactivates in race update loop"
  );
  assertAlmostEqual(
    result.cooldownAfterRespawn,
    0,
    "automatic pickup cooldown clears after respawn"
  );
  assertEqual(
    result.respawnDeadlineAfterRespawn,
    null,
    "automatic pickup respawn deadline clears after reactivation"
  );
  assertEqual(
    result.collectionsOnRespawnTick,
    0,
    "automatic pickup reactivation does not require an immediate collector"
  );
}

function assertAiGrantedItemInventoryTimers(
  result: AiGrantedItemInventoryTimerValidationResult
): void {
  const boost = COMBAT_ITEM_REGISTRY.boost;

  assertEqual(
    result.grantedItem,
    boost.type,
    "AI granted inventory item type"
  );
  assertEqual(
    result.heldItemAfterGrant,
    boost.type,
    "AI holds granted inventory item"
  );
  assertAlmostEqual(
    result.pickupCooldownAfterGrant,
    boost.respawnSeconds,
    "AI granted pickup cooldown mirrors shared event state"
  );
  assertEqual(
    result.blockedItemUseActions,
    0,
    "AI use-lockout blocks granted item use action"
  );
  assertEqual(
    result.blockedBoostActivations,
    0,
    "AI use-lockout blocks granted boost activation"
  );
  assertEqual(
    result.heldItemDuringLockout,
    boost.type,
    "AI keeps granted item during use lockout"
  );
  assertGreaterThan(
    result.cooldownAfterBlockedTick,
    0,
    "AI use-lockout timer remains active after blocked tick"
  );
  assertEqual(
    result.activatedAction,
    "boost-use",
    "AI activates granted item after use lockout"
  );
  assertEqual(
    result.activatedBoostEvents,
    1,
    "AI granted boost activation event count"
  );
  assertEqual(
    result.heldItemAfterActivation,
    null,
    "AI granted item is consumed after activation"
  );
  assertAlmostEqual(
    result.cooldownAfterActivation,
    boost.defaultRuntimeConfig.useCooldownSeconds,
    "AI item-use cooldown resets after activation"
  );
}

function assertAcceptedGatedPickupGrantTarget(
  result: AcceptedGatedPickupGrantTargetValidationResult
): void {
  assertEqual(
    result.collectionCount,
    1,
    "accepted gated pickup event count"
  );
  assertEqual(
    result.collectionRacerId,
    result.remoteHumanRacerId,
    "accepted gated pickup targets remote human racer"
  );
  assertEqual(
    result.localHeldItemAfterAcceptedPickup,
    null,
    "accepted gated pickup does not grant local human"
  );
  assertEqual(
    result.remoteHeldItemAfterAcceptedPickup,
    result.grantedItemType,
    "accepted gated pickup grants collecting human"
  );
  assertEqual(
    result.mirroredApplyAccepted,
    true,
    "mirrored accepted gated pickup applies"
  );
  assertEqual(
    result.mirroredDuplicateAccepted,
    false,
    "mirrored accepted gated pickup duplicate is ignored"
  );
  assertEqual(
    result.mirroredLocalHeldItemAfterAcceptedPickup,
    null,
    "mirrored accepted pickup does not grant local human"
  );
  assertEqual(
    result.mirroredRemoteHeldItemAfterAcceptedPickup,
    result.grantedItemType,
    "mirrored accepted pickup grants event racer"
  );
}

function assertSelectedPickupInventorySlot(
  result: SelectedPickupInventorySlotValidationResult
): void {
  assertEqual(
    result.collectionCount,
    1,
    "overlapping pickups grant exactly one selected item"
  );
  assertEqual(
    result.heldItemAfterPickup,
    result.selectedItemType,
    "inventory slot stores the selected pickup item"
  );
  assertEqual(
    result.uncollectedPickupActive,
    true,
    "second overlapping pickup remains available after slot fills"
  );
  assertAlmostEqual(
    result.uncollectedPickupCooldownSeconds,
    0,
    "second overlapping pickup does not enter cooldown"
  );
}

function assertAiContextualItemUseBehavior(
  result: AiContextualItemUseValidationResult
): void {
  assertAiContextualItemUseScenario(result.boost, {
    itemType: "boost",
    action: "boost-use",
    reason: "low-speed-boost",
    expectedBoostActivations: 1,
    expectedActiveShells: 0,
    expectedActiveBananas: 0,
    expectsActiveItem: false
  });
  assertAiContextualItemUseScenario(result.shell, {
    itemType: "shell",
    action: "shell-use",
    reason: "offensive-target-ahead",
    expectedBoostActivations: 0,
    expectedActiveShells: 1,
    expectedActiveBananas: 0,
    expectsActiveItem: true
  });
  assertAiContextualItemUseScenario(result.banana, {
    itemType: "banana",
    action: "banana-use",
    reason: "defensive-target-behind",
    expectedBoostActivations: 0,
    expectedActiveShells: 0,
    expectedActiveBananas: 1,
    expectsActiveItem: true
  });
  assertAiContextualItemHoldScenario(result.shellHold, "shell");
  assertAiContextualItemHoldScenario(result.bananaHold, "banana");
}

function assertAiContextualItemUseScenario(
  result: AiContextualItemUseScenarioResult,
  expected: {
    readonly itemType: CombatItemType;
    readonly action: string;
    readonly reason: AiHeldItemUseDecisionReason;
    readonly expectedBoostActivations: number;
    readonly expectedActiveShells: number;
    readonly expectedActiveBananas: number;
    readonly expectsActiveItem: boolean;
  }
): void {
  assertEqual(result.itemType, expected.itemType, "AI contextual item type");
  assertEqual(
    result.action,
    expected.action,
    `${expected.itemType} contextual action type`
  );
  assertEqual(
    result.actionItemType,
    expected.itemType,
    `${expected.itemType} contextual action item type`
  );
  assertEqual(
    result.actionRacerId,
    result.racerId,
    `${expected.itemType} contextual action racer`
  );
  assertEqual(
    result.decisionReasonBeforeTick,
    expected.reason,
    `${expected.itemType} contextual decision reason`
  );
  assertEqual(
    result.heldItemAfterUse,
    null,
    `${expected.itemType} contextual held item consumed`
  );
  assertEqual(
    result.inputUseItemAfterTick,
    false,
    `${expected.itemType} contextual item-use input pulse is consumed`
  );
  assertEqual(
    result.boostActivations,
    expected.expectedBoostActivations,
    `${expected.itemType} contextual boost activation count`
  );
  assertEqual(
    result.activeShells,
    expected.expectedActiveShells,
    `${expected.itemType} contextual active shell count`
  );
  assertEqual(
    result.activeBananas,
    expected.expectedActiveBananas,
    `${expected.itemType} contextual active banana count`
  );
  assertEqual(
    result.activeItemId !== null,
    expected.expectsActiveItem,
    `${expected.itemType} contextual active item id presence`
  );
  assertEqual(
    result.candidateIncludesTarget,
    true,
    `${expected.itemType} contextual activation target candidate`
  );
}

function assertAiContextualItemHoldScenario(
  result: AiContextualItemHoldScenarioResult,
  itemType: Exclude<CombatItemType, "boost">
): void {
  assertEqual(result.itemType, itemType, `${itemType} hold item type`);
  assertEqual(
    result.decisionReasonBeforeTick,
    "hold-for-context",
    `${itemType} hold decision reason`
  );
  assertEqual(
    result.itemUseActions,
    0,
    `${itemType} hold suppresses item-use action`
  );
  assertEqual(
    result.heldItemAfterTick,
    itemType,
    `${itemType} hold keeps inventory item`
  );
}

function assertAiPlayerItemUseRuleParity(
  result: AiPlayerItemUseRuleParityValidationResult
): void {
  assertAiPlayerItemUseRuleParityScenario(result.boost);
  assertAiPlayerItemUseRuleParityScenario(result.shell);
  assertAiPlayerItemUseRuleParityScenario(result.banana);
}

function assertAiPlayerItemUseRuleParityScenario(
  result: AiPlayerItemUseRuleParityScenarioResult
): void {
  assertReadyItemUseOutcome(result.playerReady, "player ready item use");
  assertReadyItemUseOutcome(result.aiReady, "AI ready item use");
  assertCooldownBlockedItemUseOutcome(
    result.playerCooldownBlocked,
    "player cooldown-blocked item use"
  );
  assertCooldownBlockedItemUseOutcome(
    result.aiCooldownBlocked,
    "AI cooldown-blocked item use"
  );

  assertEqual(
    result.aiReady.action,
    result.playerReady.action,
    `${result.itemType} AI action matches player action`
  );
  assertEqual(
    result.aiReady.actionItemType,
    result.playerReady.actionItemType,
    `${result.itemType} AI action item type matches player`
  );
  assertAlmostEqual(
    result.aiReady.cooldownAfterTick,
    result.playerReady.cooldownAfterTick,
    `${result.itemType} AI use cooldown matches player`
  );
  assertAlmostEqual(
    result.aiReady.sourceBoostSeconds,
    result.playerReady.sourceBoostSeconds,
    `${result.itemType} AI boost timer matches player`
  );
  assertEqual(
    result.aiReady.activeShells,
    result.playerReady.activeShells,
    `${result.itemType} AI shell spawn count matches player`
  );
  assertEqual(
    result.aiReady.activeBananas,
    result.playerReady.activeBananas,
    `${result.itemType} AI banana spawn count matches player`
  );
  assertEqual(
    result.aiReady.activeItemType,
    result.playerReady.activeItemType,
    `${result.itemType} AI active item type matches player`
  );
  assertNullableAlmostEqual(
    result.aiReady.activeItemSpeed,
    result.playerReady.activeItemSpeed,
    `${result.itemType} AI active item speed matches player`
  );
  assertNullableAlmostEqual(
    result.aiReady.activeItemTtlSeconds,
    result.playerReady.activeItemTtlSeconds,
    `${result.itemType} AI active item ttl matches player`
  );
  assertNullableAlmostEqual(
    result.aiReady.activeItemArmedSeconds,
    result.playerReady.activeItemArmedSeconds,
    `${result.itemType} AI active item arm timer matches player`
  );
  assertEqual(
    result.aiReady.candidateAffectedCount,
    result.playerReady.candidateAffectedCount,
    `${result.itemType} AI target candidate count matches player`
  );
  assertEqual(
    result.aiCooldownBlocked.actionCount,
    result.playerCooldownBlocked.actionCount,
    `${result.itemType} AI cooldown block action count matches player`
  );
  assertAlmostEqual(
    result.aiCooldownBlocked.cooldownAfterTick,
    result.playerCooldownBlocked.cooldownAfterTick,
    `${result.itemType} AI blocked cooldown matches player`
  );
  assertEqual(
    result.aiCooldownBlocked.heldItemAfterTick,
    result.playerCooldownBlocked.heldItemAfterTick,
    `${result.itemType} AI blocked inventory matches player`
  );
}

function assertReadyItemUseOutcome(
  outcome: ItemUseRuleParityOutcome,
  label: string
): void {
  const expectedAction = getExpectedItemUseAction(outcome.itemType);

  assertEqual(outcome.actionCount, 1, `${label} action count`);
  assertEqual(outcome.action, expectedAction, `${label} action`);
  assertEqual(
    outcome.actionItemType,
    outcome.itemType,
    `${label} action item type`
  );
  assertEqual(outcome.heldItemAfterTick, null, `${label} consumes inventory`);
  assertAlmostEqual(
    outcome.cooldownAfterTick,
    getValidationItemUseCooldownSeconds(outcome.itemType),
    `${label} cooldown after use`
  );
  assertEqual(outcome.inputUseItemAfterTick, false, `${label} input consumed`);
  assertEqual(
    outcome.candidateAffectedCount,
    1,
    `${label} target candidate count`
  );

  switch (outcome.itemType) {
    case "boost":
      assertEqual(outcome.boostActivations, 1, `${label} boost event count`);
      assertAlmostEqual(
        outcome.sourceBoostSeconds,
        COMBAT_ITEM_REGISTRY.boost.defaultRuntimeConfig.durationSeconds,
        `${label} boost duration`
      );
      assertEqual(outcome.activeShells, 0, `${label} shell count`);
      assertEqual(outcome.activeBananas, 0, `${label} banana count`);
      assertEqual(outcome.activeItemType, null, `${label} active item type`);
      break;
    case "shell":
      assertEqual(outcome.boostActivations, 0, `${label} boost event count`);
      assertEqual(outcome.sourceBoostSeconds, 0, `${label} boost timer`);
      assertEqual(outcome.activeShells, 1, `${label} shell count`);
      assertEqual(outcome.activeBananas, 0, `${label} banana count`);
      assertEqual(outcome.activeItemType, "shell", `${label} active item type`);
      assertEqual(
        outcome.activeItemOwnerRacerId,
        outcome.racerId,
        `${label} shell owner`
      );
      assertAlmostEqual(
        requireNumber(outcome.activeItemSpeed, `${label} shell speed`),
        COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed,
        `${label} shell speed`
      );
      break;
    case "banana":
      assertEqual(outcome.boostActivations, 0, `${label} boost event count`);
      assertEqual(outcome.sourceBoostSeconds, 0, `${label} boost timer`);
      assertEqual(outcome.activeShells, 0, `${label} shell count`);
      assertEqual(outcome.activeBananas, 1, `${label} banana count`);
      assertEqual(outcome.activeItemType, "banana", `${label} active item type`);
      assertEqual(
        outcome.activeItemOwnerRacerId,
        outcome.racerId,
        `${label} banana owner`
      );
      assertAlmostEqual(
        requireNumber(outcome.activeItemSpeed, `${label} banana speed`),
        0,
        `${label} banana speed`
      );
      break;
  }
}

function assertCooldownBlockedItemUseOutcome(
  outcome: ItemUseRuleParityOutcome,
  label: string
): void {
  assertEqual(outcome.actionCount, 0, `${label} action count`);
  assertEqual(outcome.action, null, `${label} action`);
  assertEqual(
    outcome.actionItemType,
    null,
    `${label} action item type`
  );
  assertEqual(
    outcome.heldItemAfterTick,
    outcome.itemType,
    `${label} keeps inventory`
  );
  assertAlmostEqual(
    outcome.cooldownAfterTick,
    getValidationItemUseCooldownSeconds(outcome.itemType),
    `${label} cooldown remains enforced`
  );
  assertEqual(outcome.boostActivations, 0, `${label} boost event count`);
  assertEqual(outcome.sourceBoostSeconds, 0, `${label} boost timer`);
  assertEqual(outcome.activeShells, 0, `${label} shell count`);
  assertEqual(outcome.activeBananas, 0, `${label} banana count`);
  assertEqual(outcome.activeItemType, null, `${label} active item type`);
}

function requirePickupState(
  raceSession: RaceSession,
  pickupId: string
): RaceItemPickupState {
  const pickup = raceSession.itemPickupStates.find(
    (candidate) => candidate.id === pickupId
  );

  if (pickup === undefined) {
    throw new Error(`Expected validation pickup state ${pickupId}.`);
  }

  return pickup;
}

function makePickupAvailableForValidation(pickup: RaceItemPickupState): void {
  pickup.active = true;
  pickup.cooldownSeconds = 0;
  pickup.respawnDeadlineElapsedSeconds = null;
}

function requireCollectionEvent(
  event: RaceItemPickupCollectionEvent | undefined,
  label: string
): RaceItemPickupCollectionEvent {
  if (event === undefined) {
    throw new Error(`Expected ${label}.`);
  }

  return event;
}

function requireRacerState(
  racer: RaceSessionRacerState | undefined,
  label: string
): RaceSessionRacerState {
  if (racer === undefined) {
    throw new Error(`Expected ${label}.`);
  }

  return racer;
}

function getTrackCenterPoint(index: number): Vector3 {
  const point = DEFAULT_TRACK_DEFINITION.road.centerline[index];

  if (point === undefined) {
    throw new Error(`Expected track centerline point ${index}.`);
  }

  return point.position;
}

function offsetPlanarPosition(
  position: Vector3,
  direction: Pick<Vector3, "x" | "z">,
  distance: number
): Vector3 {
  return {
    x: position.x + direction.x * distance,
    y: position.y,
    z: position.z + direction.z * distance
  };
}

function forwardFromHeading(headingRadians: number): Pick<Vector3, "x" | "z"> {
  return {
    x: Math.sin(headingRadians),
    z: Math.cos(headingRadians)
  };
}

function rightFromHeading(headingRadians: number): Pick<Vector3, "x" | "z"> {
  return {
    x: Math.cos(headingRadians),
    z: -Math.sin(headingRadians)
  };
}

function getPlanarSpeed(velocity: Pick<Vector3, "x" | "z">): number {
  return Math.hypot(velocity.x, velocity.z);
}

function getValidationItemUseCooldownSeconds(itemType: CombatItemType): number {
  return COMBAT_ITEM_REGISTRY[itemType].defaultRuntimeConfig.useCooldownSeconds;
}

function getExpectedItemUseAction(itemType: CombatItemType): string {
  switch (itemType) {
    case "boost":
      return "boost-use";
    case "shell":
      return "shell-use";
    case "banana":
      return "banana-use";
  }
}

function createHumanRacerInputs(count: number): readonly {
  readonly peerId: string;
  readonly displayName: string;
  readonly slotIndex: number;
  readonly isHost: boolean;
}[] {
  return Array.from({ length: count }, (_, index) => ({
    peerId: `ai-item-pickup-human-${index + 1}`,
    displayName: `AI Item Pickup Human ${index + 1}`,
    slotIndex: index,
    isHost: index === 0
  }));
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}.`);
  }
}

function assertAlmostEqual(
  actual: number,
  expected: number,
  label: string,
  epsilon = 1e-6
): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${label}: expected ${expected}, received ${actual}.`);
  }
}

function assertNullableAlmostEqual(
  actual: number | null,
  expected: number | null,
  label: string,
  epsilon = 1e-6
): void {
  if (actual === null || expected === null) {
    assertEqual(actual, expected, label);
    return;
  }

  assertAlmostEqual(actual, expected, label, epsilon);
}

function requireNumber(value: number | null, label: string): number {
  if (value === null) {
    throw new Error(`${label}: expected a number, received null.`);
  }

  return value;
}

function assertGreaterThan(
  actual: number,
  minimum: number,
  label: string
): void {
  if (actual <= minimum) {
    throw new Error(`${label}: expected > ${minimum}, received ${actual}.`);
  }
}

function assertGreaterThanOrEqual(
  actual: number,
  minimum: number,
  label: string
): void {
  if (actual < minimum) {
    throw new Error(`${label}: expected >= ${minimum}, received ${actual}.`);
  }
}

function assertLessThan(
  actual: number,
  maximum: number,
  label: string
): void {
  if (actual >= maximum) {
    throw new Error(`${label}: expected < ${maximum}, received ${actual}.`);
  }
}

function isDirectExecution(): boolean {
  return (
    process.argv[1] !== undefined &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  );
}

if (isDirectExecution()) {
  const result = validateAiItemPickupRuleParity();

  console.info(
    [
      "aiItemPickup=ok",
      `humanRacer=${result.human.racerId}`,
      `aiRacer=${result.ai.racerId}`,
      `pickupId=${result.ai.pickupId}`,
      `itemType=${result.ai.collectionItemType}`,
      `cooldown=${result.ai.collectionCooldownSeconds}`,
      `outsideCollections=${result.ai.outsideCollections}`,
      `cooldownBlocked=${result.ai.cooldownBlockedCollections}`,
      `respawnCollections=${result.ai.respawnCollections}`,
      `fullInventoryBlocked=${result.ai.fullInventoryBlockedCollections}`,
      "automaticRespawn=ok",
      `activeAfterRespawn=${result.automaticRespawn.activeAfterRespawn}`,
      `respawnCooldown=${result.automaticRespawn.cooldownAfterRespawn}`,
      `respawnCollectionsOnTick=${result.automaticRespawn.collectionsOnRespawnTick}`,
      "pickupGate=ok",
      `continuousOverlapBlocked=${result.pickupCollisionGate.ai.continuousOverlapCollections}`,
      `gateReentryCollections=${result.pickupCollisionGate.ai.reentryCollections}`,
      `gateRespawnCollections=${result.pickupCollisionGate.ai.respawnCollections}`,
      "inactivePickupGate=ok",
      `inactiveReentryCollections=${result.inactivePickupCollisionGate.inactiveReentryCollections}`,
      "inactivePickupEventGrant=ok",
      `inactiveEventAccepted=${result.inactivePickupEventGrant.inactiveEventAccepted}`,
      "inventoryLockout=ok",
      `grantedItem=${result.aiGrantedInventoryTimers.grantedItem}`,
      `blockedUses=${result.aiGrantedInventoryTimers.blockedItemUseActions}`,
      `activatedAction=${result.aiGrantedInventoryTimers.activatedAction}`,
      `cooldownAfterActivation=${result.aiGrantedInventoryTimers.cooldownAfterActivation}`,
      "acceptedPickupGrantTarget=ok",
      `acceptedPickupRacer=${result.acceptedGatedPickupGrantTarget.collectionRacerId}`,
      `acceptedPickupItem=${result.acceptedGatedPickupGrantTarget.grantedItemType}`,
      "selectedPickupInventorySlot=ok",
      `selectedPickup=${result.selectedPickupInventorySlot.collectionPickupId}`,
      `selectedItem=${result.selectedPickupInventorySlot.selectedItemType}`,
      "aiItemUse=ok",
      `boostReason=${result.aiContextualItemUse.boost.decisionReasonBeforeTick}`,
      `shellReason=${result.aiContextualItemUse.shell.decisionReasonBeforeTick}`,
      `bananaReason=${result.aiContextualItemUse.banana.decisionReasonBeforeTick}`,
      `shellHold=${result.aiContextualItemUse.shellHold.itemUseActions}`,
      `bananaHold=${result.aiContextualItemUse.bananaHold.itemUseActions}`,
      "aiPlayerItemUseParity=ok",
      `boostParity=${result.aiPlayerItemUseRuleParity.boost.aiReady.action}`,
      `shellParity=${result.aiPlayerItemUseRuleParity.shell.aiReady.action}`,
      `bananaParity=${result.aiPlayerItemUseRuleParity.banana.aiReady.action}`,
      `cooldownBlocks=${result.aiPlayerItemUseRuleParity.boost.aiCooldownBlocked.actionCount}:${result.aiPlayerItemUseRuleParity.shell.aiCooldownBlocked.actionCount}:${result.aiPlayerItemUseRuleParity.banana.aiCooldownBlocked.actionCount}`
    ].join(" ")
  );
}
