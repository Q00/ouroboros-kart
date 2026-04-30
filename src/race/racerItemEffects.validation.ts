import {
  applyRacerBoostItemEffect,
  applyRacerItemHitEffect,
  applyRacerShieldItemEffect,
  applyRacerSpinoutItemEffect,
  createRacerItemEffectLifecycleRecord,
  createInitialRacerItemEffectState,
  deserializeRacerItemEffectLifecycleRecord,
  isRacerItemEffectLifecycleRecordPayload,
  isRacerShieldActive,
  resolveRacerItemEffectLifecycleRules,
  serializeRacerItemEffectLifecycleRecord,
  RACER_ITEM_EFFECT_LIFECYCLE_PROTOCOL,
  RACER_ITEM_EFFECT_LIFECYCLE_RECORD_TYPE,
  RACER_ITEM_EFFECT_LIFECYCLE_VERSION,
  updateRacerItemEffectTimers,
  RACER_ITEM_EFFECT_REFRESH_RULES,
  RACER_ITEM_EFFECT_STACKING_RULES,
  type RacerItemEffectDefinition,
  type RacerItemEffectState,
  type RacerTimedItemEffectState
} from "./racerItemEffects";
import type { AiController } from "../ai/aiController";
import {
  DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING,
  DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING,
  SHELL_SPINOUT_FEEL_RANGE_RADIANS,
  SHELL_SPINOUT_FEEL_RANGE_SECONDS
} from "../config/gameplayTuning";
import {
  BOOST_DURATION_SECONDS,
  COMBAT_ITEM_REGISTRY,
  RACER_ITEM_EFFECT_DEFINITIONS,
  RACER_ITEM_EFFECT_DURATIONS,
  createRaceSessionFromStartRoster,
  refreshRacerCollisionBounds,
  type RaceSessionRacerState
} from "./raceSession";
import { createRaceStartRoster } from "./raceStartRoster";

interface ItemEffectDefinitionValidationResult {
  readonly definitionCount: number;
  readonly boostDurationSeconds: number;
  readonly shellStunSeconds: number;
  readonly bananaSpinoutSeconds: number;
  readonly spinoutStackingRule: string;
  readonly boostStackLimitSeconds: number | null;
  readonly shellRecoveryDurationSeconds: number;
  readonly shellImmunityWindowSeconds: number;
  readonly shellImmunityStackLimitSeconds: number | null;
  readonly shellStackBehavior: string;
}

interface ItemEffectStackingValidationResult {
  readonly boostAfterRefreshSeconds: number;
  readonly boostAfterCapSeconds: number;
  readonly shieldAfterRefreshSeconds: number;
  readonly freshBananaHitApplied: boolean;
  readonly bananaRepeatedHitApplied: boolean;
  readonly repeatedShellHitApplied: boolean;
  readonly stunAfterShorterHitSeconds: number;
  readonly spinoutAfterShorterHitSeconds: number;
  readonly hitFeedbackAfterRepeatedShellSeconds: number;
  readonly immunityAfterRepeatedShellSeconds: number;
  readonly angularVelocityAfterShorterHit: number;
  readonly angularVelocityAfterRepeatedShellHit: number;
  readonly lastHitItemType: string;
  readonly recoveryAfterRepeatedShellHitSeconds: number;
  readonly recoveryDurationAfterRepeatedShellHitSeconds: number;
  readonly immunityWindowAfterRepeatedShellHitSeconds: number;
  readonly timedSpinoutStackBehavior: string;
  readonly timedSpinoutRecoveryDurationSeconds: number;
  readonly timedImmunityWindowSeconds: number;
}

interface ItemEffectExpirationValidationResult {
  readonly expiredEffectCount: number;
  readonly expiredEffectTypes: string;
  readonly activeEffectCount: number;
  readonly recoveryEffectCount: number;
  readonly transitionedRecoveryEffectCount: number;
  readonly boostSeconds: number;
  readonly shieldSeconds: number;
  readonly stunSeconds: number;
  readonly spinoutSeconds: number;
  readonly spinoutAngularVelocity: number;
  readonly itemHitImmunitySeconds: number;
  readonly itemHitImmunityWindowSeconds: number;
  readonly hitFeedbackSeconds: number;
  readonly recoverySeconds: number;
  readonly recoveryDurationSeconds: number;
  readonly lastHitItemType: string | null;
  readonly recovering: boolean;
  readonly timedEffectCount: number;
  readonly sourceImmunityCount: number;
}

interface SpinoutStatusValidationResult {
  readonly applied: boolean;
  readonly bananaContactApplied: boolean;
  readonly activeSpinoutSeconds: number;
  readonly partialSpinoutSeconds: number;
  readonly expiredSpinoutSeconds: number;
  readonly expiredAngularVelocity: number;
  readonly bananaContactExpiredSpinoutSeconds: number;
  readonly bananaContactExpiredAngularVelocity: number;
  readonly bananaContactTimedStateCleared: boolean;
  readonly recoveringAfterApply: boolean;
  readonly recoveringAfterExpiry: boolean;
  readonly timedSpinoutSource: string | null;
}

interface ItemEffectLifecycleValidationResult {
  readonly activeAppliedBoostSeconds: number;
  readonly transitionedEffectType: string;
  readonly recoveryEffectType: string;
  readonly activeEffectTypeDuringRecovery: string;
  readonly stunPhaseDuringRecovery: string;
  readonly stunRemainingDuringRecovery: number;
  readonly stunRecoverySecondsDuringRecovery: number;
  readonly recoveringDuringTransition: boolean;
  readonly clearedActiveEffectCount: number;
  readonly clearedRecoveryEffectCount: number;
  readonly clearedLastHitItemType: string | null;
  readonly clearedTimedEffectCount: number;
}

interface RaceSessionEffectIntegrationValidationResult {
  readonly activeBoostSeconds: number;
  readonly expiredBoostSeconds: number;
  readonly expiredStunSeconds: number;
  readonly clearedLastHitItemType: string | null;
  readonly recovering: boolean;
}

interface RaceSessionEffectMotionValidationResult {
  readonly baselineAccelerationSpeed: number;
  readonly boostedAccelerationSpeed: number;
  readonly baselineMaxSpeedCap: number;
  readonly boostedMaxSpeedCap: number;
  readonly expiredBoostSeconds: number;
  readonly expiredBoostMaxSpeedCap: number;
  readonly slowedMaxSpeedCap: number;
  readonly recoverySpeedDuringStun: number;
  readonly recoverySpeedAfterStun: number;
  readonly knockbackVelocityAfterHit: number;
  readonly knockbackDisplacementDuringStun: number;
  readonly knockbackVelocityAfterRecovery: number;
}

interface ShieldBlockValidationResult {
  readonly effectBlockedByShield: boolean;
  readonly directShieldSecondsAfterBlock: number;
  readonly directStunSecondsAfterBlock: number;
  readonly sessionShieldSecondsAfterBlock: number;
  readonly sessionStunSecondsAfterBlock: number;
  readonly sessionSpinoutSecondsAfterBlock: number;
  readonly sessionBlockedHitCount: number;
  readonly sessionActiveShellCountAfterBlock: number;
}

interface DuplicateHitImmunityValidationResult {
  readonly firstShellApplied: boolean;
  readonly duplicateShellApplied: boolean;
  readonly secondSourceShellApplied: boolean;
  readonly reappliedAfterExpiry: boolean;
  readonly effectSourceDuplicateApplied: boolean;
  readonly shellPostSpinoutRecovering: boolean;
  readonly shellPostSpinoutImmunitySeconds: number;
  readonly shellPostSpinoutDuplicateApplied: boolean;
  readonly shellReappliedAfterGlobalImmunity: boolean;
  readonly bananaPostSpinoutRecovering: boolean;
  readonly bananaPostSpinoutImmunitySeconds: number;
  readonly bananaPostSpinoutDuplicateApplied: boolean;
  readonly firstSourceImmunitySeconds: number;
  readonly decayedSourceImmunitySeconds: number;
  readonly duplicateSourceImmunitySeconds: number;
  readonly effectSourceImmunitySeconds: number;
  readonly duplicateStunSeconds: number;
  readonly secondSourceStunSeconds: number;
  readonly expiredSourceImmunityCount: number;
}

interface ItemEffectLifecycleModelValidationResult {
  readonly protocol: string;
  readonly version: number;
  readonly recordType: string;
  readonly effectType: string;
  readonly sourceRacerId: string;
  readonly targetRacerId: string;
  readonly startedAtElapsedSeconds: number;
  readonly durationSeconds: number;
  readonly expiresAtElapsedSeconds: number;
  readonly stackingRule: string;
  readonly cancellationRule: string;
  readonly serializedRoundTrip: boolean;
  readonly payloadAccepted: boolean;
  readonly boostStackLimitSeconds: number | null;
  readonly bananaCancellationRule: string;
  readonly cancelledPhase: string;
}

const STATIONARY_AI_CONTROLLER = {
  getCommand: () => ({
    throttle: 0,
    brake: 1,
    steering: 0
  }),
  resetNavigationState: () => undefined
} satisfies AiController;

function main(): void {
  const definitions = validateItemEffectDefinitions();
  const lifecycleModel = validateItemEffectLifecycleModel();
  const stacking = validateItemEffectStackingRules();
  const expiration = validateItemEffectExpirationHandling();
  const spinoutStatus = validateSpinoutStatusHandling();
  const lifecycle = validateItemEffectLifecycleUpdateLoop();
  const raceSessionIntegration = validateRaceSessionEffectTimerIntegration();
  const raceSessionMotion = validateRaceSessionEffectMotionIntegration();
  const shieldBlock = validateShieldBlocksNegativeItemEffects();
  const duplicateHitImmunity = validateDuplicateHitSourceImmunity();

  console.info(
    [
      "racerItemEffects=ok",
      `definitions=${definitions.definitionCount}`,
      `boostDuration=${definitions.boostDurationSeconds}`,
      `shellStun=${definitions.shellStunSeconds}`,
      `bananaSpinout=${definitions.bananaSpinoutSeconds}`,
      `spinoutStacking=${definitions.spinoutStackingRule}`,
      `boostStackLimit=${definitions.boostStackLimitSeconds ?? "none"}`,
      `shellRecoveryDuration=${definitions.shellRecoveryDurationSeconds}`,
      `shellImmunityWindow=${definitions.shellImmunityWindowSeconds}`,
      `shellImmunityStackLimit=${definitions.shellImmunityStackLimitSeconds ?? "none"}`,
      `shellStackBehavior=${definitions.shellStackBehavior}`,
      `lifecycleProtocol=${lifecycleModel.protocol}`,
      `lifecycleVersion=${lifecycleModel.version}`,
      `lifecycleRecordType=${lifecycleModel.recordType}`,
      `lifecycleEffectType=${lifecycleModel.effectType}`,
      `lifecycleSourceRacer=${lifecycleModel.sourceRacerId}`,
      `lifecycleTargetRacer=${lifecycleModel.targetRacerId}`,
      `lifecycleStartedAt=${lifecycleModel.startedAtElapsedSeconds}`,
      `lifecycleDuration=${lifecycleModel.durationSeconds}`,
      `lifecycleExpiresAt=${lifecycleModel.expiresAtElapsedSeconds}`,
      `lifecycleStacking=${lifecycleModel.stackingRule}`,
      `lifecycleCancellation=${lifecycleModel.cancellationRule}`,
      `lifecycleSerialized=${Number(lifecycleModel.serializedRoundTrip)}`,
      `lifecyclePayloadAccepted=${Number(lifecycleModel.payloadAccepted)}`,
      `lifecycleBoostStackLimit=${lifecycleModel.boostStackLimitSeconds ?? "none"}`,
      `lifecycleBananaCancellation=${lifecycleModel.bananaCancellationRule}`,
      `lifecycleCancelledPhase=${lifecycleModel.cancelledPhase}`,
      `boostAfterRefresh=${stacking.boostAfterRefreshSeconds}`,
      `boostAfterCap=${stacking.boostAfterCapSeconds}`,
      `shieldAfterRefresh=${stacking.shieldAfterRefreshSeconds}`,
      `freshBananaApplied=${Number(stacking.freshBananaHitApplied)}`,
      `bananaRepeatedApplied=${Number(stacking.bananaRepeatedHitApplied)}`,
      `shellRepeatedApplied=${Number(stacking.repeatedShellHitApplied)}`,
      `stunAfterShorter=${stacking.stunAfterShorterHitSeconds}`,
      `spinoutAfterShorter=${stacking.spinoutAfterShorterHitSeconds}`,
      `feedbackAfterRepeatedShell=${stacking.hitFeedbackAfterRepeatedShellSeconds.toFixed(3)}`,
      `immunityAfterRepeatedShell=${stacking.immunityAfterRepeatedShellSeconds.toFixed(3)}`,
      `angularShorter=${stacking.angularVelocityAfterShorterHit}`,
      `angularAfterRepeatedShell=${stacking.angularVelocityAfterRepeatedShellHit}`,
      `lastHit=${stacking.lastHitItemType}`,
      `recoveryAfterRepeatedShell=${stacking.recoveryAfterRepeatedShellHitSeconds}`,
      `recoveryDurationAfterRepeatedShell=${stacking.recoveryDurationAfterRepeatedShellHitSeconds}`,
      `immunityWindowAfterRepeatedShell=${stacking.immunityWindowAfterRepeatedShellHitSeconds}`,
      `timedSpinoutStack=${stacking.timedSpinoutStackBehavior}`,
      `timedSpinoutRecovery=${stacking.timedSpinoutRecoveryDurationSeconds}`,
      `timedImmunityWindow=${stacking.timedImmunityWindowSeconds}`,
      `expiredEffects=${expiration.expiredEffectCount}`,
      `expiredEffectTypes=${expiration.expiredEffectTypes}`,
      `expiredActiveEffects=${expiration.activeEffectCount}`,
      `expiredRecoveryEffects=${expiration.recoveryEffectCount}`,
      `expiredTransitionedRecovery=${expiration.transitionedRecoveryEffectCount}`,
      `expiredBoost=${expiration.boostSeconds}`,
      `expiredShield=${expiration.shieldSeconds}`,
      `expiredStun=${expiration.stunSeconds}`,
      `expiredSpinout=${expiration.spinoutSeconds}`,
      `expiredAngular=${expiration.spinoutAngularVelocity}`,
      `expiredImmunity=${expiration.itemHitImmunitySeconds}`,
      `expiredImmunityWindow=${expiration.itemHitImmunityWindowSeconds}`,
      `expiredFeedback=${expiration.hitFeedbackSeconds}`,
      `expiredRecovery=${expiration.recoverySeconds}`,
      `expiredRecoveryDuration=${expiration.recoveryDurationSeconds}`,
      `expiredLastHit=${expiration.lastHitItemType ?? "none"}`,
      `expiredRecovering=${Number(expiration.recovering)}`,
      `expiredTimedEffects=${expiration.timedEffectCount}`,
      `expiredSourceImmunities=${expiration.sourceImmunityCount}`,
      `spinoutApplied=${Number(spinoutStatus.applied)}`,
      `spinoutActive=${spinoutStatus.activeSpinoutSeconds.toFixed(3)}`,
      `spinoutPartial=${spinoutStatus.partialSpinoutSeconds.toFixed(3)}`,
      `spinoutExpired=${spinoutStatus.expiredSpinoutSeconds}`,
      `spinoutExpiredAngular=${spinoutStatus.expiredAngularVelocity}`,
      `bananaContactSpinout=${Number(spinoutStatus.bananaContactApplied)}`,
      `bananaContactExpiredSpinout=${spinoutStatus.bananaContactExpiredSpinoutSeconds}`,
      `bananaContactExpiredAngular=${spinoutStatus.bananaContactExpiredAngularVelocity}`,
      `bananaContactTimedClear=${Number(spinoutStatus.bananaContactTimedStateCleared)}`,
      `spinoutRecovering=${Number(spinoutStatus.recoveringAfterApply)}`,
      `spinoutRecovered=${Number(!spinoutStatus.recoveringAfterExpiry)}`,
      `spinoutSource=${spinoutStatus.timedSpinoutSource ?? "none"}`,
      `lifecycleAppliedBoost=${lifecycle.activeAppliedBoostSeconds.toFixed(3)}`,
      `lifecycleTransitioned=${lifecycle.transitionedEffectType}`,
      `lifecycleRecovery=${lifecycle.recoveryEffectType}`,
      `lifecycleActiveDuringRecovery=${lifecycle.activeEffectTypeDuringRecovery}`,
      `lifecycleStunPhase=${lifecycle.stunPhaseDuringRecovery}`,
      `lifecycleStunRemaining=${lifecycle.stunRemainingDuringRecovery}`,
      `lifecycleStunRecovery=${lifecycle.stunRecoverySecondsDuringRecovery.toFixed(3)}`,
      `lifecycleRecovering=${Number(lifecycle.recoveringDuringTransition)}`,
      `lifecycleClearedActive=${lifecycle.clearedActiveEffectCount}`,
      `lifecycleClearedRecovery=${lifecycle.clearedRecoveryEffectCount}`,
      `lifecycleClearedLastHit=${lifecycle.clearedLastHitItemType ?? "none"}`,
      `lifecycleCleared=${lifecycle.clearedTimedEffectCount}`,
      `sessionActiveBoost=${raceSessionIntegration.activeBoostSeconds.toFixed(3)}`,
      `sessionExpiredBoost=${raceSessionIntegration.expiredBoostSeconds}`,
      `sessionExpiredStun=${raceSessionIntegration.expiredStunSeconds}`,
      `sessionLastHit=${raceSessionIntegration.clearedLastHitItemType ?? "none"}`,
      `sessionRecovering=${Number(raceSessionIntegration.recovering)}`,
      `baselineAcceleration=${raceSessionMotion.baselineAccelerationSpeed.toFixed(3)}`,
      `boostedAcceleration=${raceSessionMotion.boostedAccelerationSpeed.toFixed(3)}`,
      `baselineMaxSpeed=${raceSessionMotion.baselineMaxSpeedCap.toFixed(3)}`,
      `boostedMaxSpeed=${raceSessionMotion.boostedMaxSpeedCap.toFixed(3)}`,
      `expiredBoostSeconds=${raceSessionMotion.expiredBoostSeconds}`,
      `expiredBoostMaxSpeed=${raceSessionMotion.expiredBoostMaxSpeedCap.toFixed(3)}`,
      `slowedMaxSpeed=${raceSessionMotion.slowedMaxSpeedCap.toFixed(3)}`,
      `stunRecoverySpeed=${raceSessionMotion.recoverySpeedDuringStun.toFixed(3)}`,
      `postRecoverySpeed=${raceSessionMotion.recoverySpeedAfterStun.toFixed(3)}`,
      `knockbackVelocity=${raceSessionMotion.knockbackVelocityAfterHit.toFixed(3)}`,
      `knockbackDisplacement=${raceSessionMotion.knockbackDisplacementDuringStun.toFixed(3)}`,
      `knockbackRecovered=${raceSessionMotion.knockbackVelocityAfterRecovery.toFixed(3)}`,
      `shieldBlocked=${Number(shieldBlock.effectBlockedByShield)}`,
      `directShieldAfterBlock=${shieldBlock.directShieldSecondsAfterBlock}`,
      `directStunAfterBlock=${shieldBlock.directStunSecondsAfterBlock}`,
      `sessionShieldAfterBlock=${shieldBlock.sessionShieldSecondsAfterBlock}`,
      `sessionStunAfterBlock=${shieldBlock.sessionStunSecondsAfterBlock}`,
      `sessionSpinoutAfterBlock=${shieldBlock.sessionSpinoutSecondsAfterBlock}`,
      `sessionBlockedHits=${shieldBlock.sessionBlockedHitCount}`,
      `sessionShellsAfterBlock=${shieldBlock.sessionActiveShellCountAfterBlock}`,
      `firstSourceHit=${Number(duplicateHitImmunity.firstShellApplied)}`,
      `duplicateSourceHit=${Number(duplicateHitImmunity.duplicateShellApplied)}`,
      `secondSourceHit=${Number(duplicateHitImmunity.secondSourceShellApplied)}`,
      `reappliedAfterSourceExpiry=${Number(duplicateHitImmunity.reappliedAfterExpiry)}`,
      `effectSourceDuplicate=${Number(duplicateHitImmunity.effectSourceDuplicateApplied)}`,
      `firstSourceImmunity=${duplicateHitImmunity.firstSourceImmunitySeconds.toFixed(3)}`,
      `decayedSourceImmunity=${duplicateHitImmunity.decayedSourceImmunitySeconds.toFixed(3)}`,
      `duplicateSourceImmunity=${duplicateHitImmunity.duplicateSourceImmunitySeconds.toFixed(3)}`,
      `effectSourceImmunity=${duplicateHitImmunity.effectSourceImmunitySeconds.toFixed(3)}`,
      `shellPostSpinoutRecovering=${Number(duplicateHitImmunity.shellPostSpinoutRecovering)}`,
      `shellPostSpinoutImmunity=${duplicateHitImmunity.shellPostSpinoutImmunitySeconds.toFixed(3)}`,
      `shellPostSpinoutDuplicate=${Number(duplicateHitImmunity.shellPostSpinoutDuplicateApplied)}`,
      `shellAfterGlobalImmunity=${Number(duplicateHitImmunity.shellReappliedAfterGlobalImmunity)}`,
      `bananaPostSpinoutRecovering=${Number(duplicateHitImmunity.bananaPostSpinoutRecovering)}`,
      `bananaPostSpinoutImmunity=${duplicateHitImmunity.bananaPostSpinoutImmunitySeconds.toFixed(3)}`,
      `bananaPostSpinoutDuplicate=${Number(duplicateHitImmunity.bananaPostSpinoutDuplicateApplied)}`,
      `duplicateSourceStun=${duplicateHitImmunity.duplicateStunSeconds.toFixed(3)}`,
      `secondSourceStun=${duplicateHitImmunity.secondSourceStunSeconds.toFixed(3)}`,
      `expiredSourceImmunityCount=${duplicateHitImmunity.expiredSourceImmunityCount}`
    ].join(" ")
  );
}

function validateItemEffectLifecycleModel(): ItemEffectLifecycleModelValidationResult {
  const shell = COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig;
  const startedAtElapsedSeconds = 12.5;
  const lifecycleRecord = createRacerItemEffectLifecycleRecord({
    effectId: "effect-shell-stun-1",
    effectType: "stun",
    sourceItemType: "shell",
    sourceItemId: "shell-projectile-1",
    sourceRacerId: "racer-source",
    targetRacerId: "racer-target",
    startedAtTick: 750,
    startedAtElapsedSeconds,
    durationSeconds: shell.hitStunSeconds,
    recoveryDurationSeconds: shell.spinoutSeconds,
    immunityWindowSeconds: shell.hitImmunitySeconds,
    immunityRemainingSeconds: shell.hitImmunitySeconds,
    sequence: 24
  });
  const serialized = serializeRacerItemEffectLifecycleRecord(lifecycleRecord);
  const deserialized = deserializeRacerItemEffectLifecycleRecord(serialized);
  const payloadAccepted = isRacerItemEffectLifecycleRecordPayload(serialized);
  const boostRules = resolveRacerItemEffectLifecycleRules({
    effectType: "boost",
    sourceItemType: "boost",
    durationSeconds: RACER_ITEM_EFFECT_DURATIONS.boost.boostSeconds
  });
  const bananaRules = resolveRacerItemEffectLifecycleRules({
    effectType: "spinout",
    sourceItemType: "banana",
    durationSeconds: COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig
      .spinoutSeconds
  });
  const cancelledRecord = createRacerItemEffectLifecycleRecord({
    ...lifecycleRecord,
    effectId: "effect-shell-stun-cancelled",
    phase: "cancelled",
    remainingSeconds: 0,
    recoveryRemainingSeconds: 0,
    cancelledByEffectId: "effect-shield-block-1",
    cancelledAtElapsedSeconds: startedAtElapsedSeconds + 0.1,
    sequence: 25
  });

  assertEqual(
    lifecycleRecord.protocol,
    RACER_ITEM_EFFECT_LIFECYCLE_PROTOCOL,
    "lifecycle record exposes serialization protocol"
  );
  assertEqual(
    lifecycleRecord.version,
    RACER_ITEM_EFFECT_LIFECYCLE_VERSION,
    "lifecycle record exposes serialization version"
  );
  assertEqual(
    lifecycleRecord.type,
    RACER_ITEM_EFFECT_LIFECYCLE_RECORD_TYPE,
    "lifecycle record exposes serialization type"
  );
  assertEqual(
    lifecycleRecord.effectType,
    "stun",
    "lifecycle record stores effect type"
  );
  assertEqual(
    lifecycleRecord.sourceRacerId,
    "racer-source",
    "lifecycle record stores source racer"
  );
  assertEqual(
    lifecycleRecord.targetRacerId,
    "racer-target",
    "lifecycle record stores target racer"
  );
  assertEqual(
    lifecycleRecord.startedAtElapsedSeconds,
    startedAtElapsedSeconds,
    "lifecycle record stores start time"
  );
  assertEqual(
    lifecycleRecord.durationSeconds,
    shell.hitStunSeconds,
    "lifecycle record stores duration"
  );
  assertAlmostEqual(
    lifecycleRecord.expiresAtElapsedSeconds,
    startedAtElapsedSeconds + shell.hitStunSeconds,
    "lifecycle record derives expiry time"
  );
  assertEqual(
    lifecycleRecord.stackingRule,
    RACER_ITEM_EFFECT_STACKING_RULES.stun,
    "lifecycle record resolves stacking rule"
  );
  assertEqual(
    lifecycleRecord.cancellationRule,
    "replace-existing",
    "lifecycle record resolves cancellation rule"
  );
  assertEqual(
    deserialized.effectId,
    lifecycleRecord.effectId,
    "lifecycle record round-trips effect id"
  );
  assertEqual(
    deserialized.sourceItemId,
    lifecycleRecord.sourceItemId,
    "lifecycle record round-trips nullable source item id"
  );
  assertEqual(
    payloadAccepted,
    true,
    "lifecycle serialized payload passes runtime guard"
  );
  assertAlmostEqual(
    boostRules.stackLimitSeconds ?? 0,
    RACER_ITEM_EFFECT_DURATIONS.boost.boostSeconds *
      RACER_ITEM_EFFECT_REFRESH_RULES.boost.boost.stackLimitMultiplier,
    "lifecycle rules expose boost stack cap"
  );
  assertEqual(
    boostRules.cancellationRule,
    "none",
    "capped boost lifecycle effects do not cancel existing effects"
  );
  assertEqual(
    bananaRules.cancellationRule,
    "ignore-incoming",
    "ignored banana lifecycle effects cancel the incoming duplicate"
  );
  assertEqual(
    cancelledRecord.phase,
    "cancelled",
    "lifecycle record supports cancelled phase"
  );
  assertEqual(
    cancelledRecord.cancelledByEffectId,
    "effect-shield-block-1",
    "cancelled lifecycle record stores cancellation source"
  );

  return {
    protocol: lifecycleRecord.protocol,
    version: lifecycleRecord.version,
    recordType: lifecycleRecord.type,
    effectType: lifecycleRecord.effectType,
    sourceRacerId: lifecycleRecord.sourceRacerId,
    targetRacerId: lifecycleRecord.targetRacerId,
    startedAtElapsedSeconds: lifecycleRecord.startedAtElapsedSeconds,
    durationSeconds: lifecycleRecord.durationSeconds,
    expiresAtElapsedSeconds: lifecycleRecord.expiresAtElapsedSeconds,
    stackingRule: lifecycleRecord.stackingRule,
    cancellationRule: lifecycleRecord.cancellationRule,
    serializedRoundTrip: deserialized.effectId === lifecycleRecord.effectId,
    payloadAccepted,
    boostStackLimitSeconds: boostRules.stackLimitSeconds,
    bananaCancellationRule: bananaRules.cancellationRule,
    cancelledPhase: cancelledRecord.phase
  };
}

function validateItemEffectDefinitions(): ItemEffectDefinitionValidationResult {
  assertEqual(
    RACER_ITEM_EFFECT_DURATIONS.boost.boostSeconds,
    COMBAT_ITEM_REGISTRY.boost.defaultRuntimeConfig.durationSeconds,
    "boost duration table uses registry boost duration"
  );
  assertEqual(
    RACER_ITEM_EFFECT_DURATIONS.shell.stunSeconds,
    COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.hitStunSeconds,
    "shell stun duration table uses registry hit stun"
  );
  assertEqual(
    RACER_ITEM_EFFECT_DURATIONS.shell.spinoutSeconds,
    DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds,
    "shell spinout duration table uses gameplay tuning default"
  );
  assertGreaterThan(
    RACER_ITEM_EFFECT_DURATIONS.shell.spinoutSeconds,
    SHELL_SPINOUT_FEEL_RANGE_SECONDS.min - 0.000001,
    "shell spinout duration default meets feel-range minimum"
  );
  assertLessThanOrEqual(
    RACER_ITEM_EFFECT_DURATIONS.shell.spinoutSeconds,
    SHELL_SPINOUT_FEEL_RANGE_SECONDS.max,
    "shell spinout duration default meets feel-range maximum"
  );
  assertEqual(
    COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.spinoutRadians,
    DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutRadians,
    "shell spinout strength uses gameplay tuning default"
  );
  assertGreaterThan(
    COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.spinoutRadians,
    SHELL_SPINOUT_FEEL_RANGE_RADIANS.min - 0.000001,
    "shell spinout strength default meets feel-range minimum"
  );
  assertLessThanOrEqual(
    COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.spinoutRadians,
    SHELL_SPINOUT_FEEL_RANGE_RADIANS.max,
    "shell spinout strength default meets feel-range maximum"
  );
  assertEqual(
    RACER_ITEM_EFFECT_DURATIONS.banana.spinoutSeconds,
    DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds,
    "banana spinout duration table uses gameplay tuning default"
  );
  assertEqual(
    COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.spinoutRadians,
    DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING.spinoutRadians,
    "banana spinout strength uses gameplay tuning default"
  );
  assertGreaterThan(
    DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds,
    DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds,
    "shell default spinout duration is stronger than banana reaction"
  );
  assertGreaterThan(
    DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutRadians,
    DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING.spinoutRadians,
    "shell default spinout strength is stronger than banana reaction"
  );
  assertGreaterThan(
    COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.spinoutRadians /
      COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.spinoutSeconds,
    0,
    "banana default spinout angular velocity is positive"
  );
  assertGreaterThan(
    COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.spinoutRadians /
      COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.spinoutSeconds,
    COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.spinoutRadians /
      COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.spinoutSeconds,
    "shell default spinout angular velocity is stronger than banana reaction"
  );

  const boostDefinition = requireDefinition("boost", "boost");
  const shellStunDefinition = requireDefinition("shell", "stun");
  const shellImmunityDefinition = requireDefinition("shell", "itemHitImmunity");
  const bananaSpinoutDefinition = requireDefinition("banana", "spinout");
  const shellRecoveryDurationSeconds = Math.max(
    RACER_ITEM_EFFECT_DURATIONS.shell.stunSeconds,
    RACER_ITEM_EFFECT_DURATIONS.shell.spinoutSeconds
  );

  assertEqual(
    boostDefinition.stackingRule,
    RACER_ITEM_EFFECT_STACKING_RULES.boost,
    "boost effect uses capped refresh stacking"
  );
  assertAlmostEqual(
    boostDefinition.stackLimitSeconds ?? 0,
    RACER_ITEM_EFFECT_DURATIONS.boost.boostSeconds *
      RACER_ITEM_EFFECT_REFRESH_RULES.boost.boost.stackLimitMultiplier,
    "boost effect exposes capped stacked duration"
  );
  assertEqual(
    bananaSpinoutDefinition.stackingRule,
    RACER_ITEM_EFFECT_REFRESH_RULES.banana.spinout.stackBehavior,
    "banana spinout effect declares repeated-hit ignore stacking"
  );
  assertEqual(
    shellStunDefinition.stackBehavior,
    RACER_ITEM_EFFECT_STACKING_RULES.stun,
    "shell stun effect metadata exposes replace stack behavior"
  );
  assertEqual(
    shellStunDefinition.stackingRule,
    shellStunDefinition.stackBehavior,
    "stack behavior mirrors existing stacking rule"
  );
  assertEqual(
    shellStunDefinition.recoveryDurationSeconds,
    shellRecoveryDurationSeconds,
    "negative hit effect metadata exposes recovery duration"
  );
  assertEqual(
    shellStunDefinition.immunityWindowSeconds,
    RACER_ITEM_EFFECT_DURATIONS.shell.itemHitImmunitySeconds,
    "negative hit effect metadata exposes immunity window"
  );
  assertEqual(
    shellImmunityDefinition.immunityWindowSeconds,
    RACER_ITEM_EFFECT_DURATIONS.shell.itemHitImmunitySeconds,
    "immunity effect metadata exposes its immunity window"
  );
  assertEqual(
    shellImmunityDefinition.stackBehavior,
    RACER_ITEM_EFFECT_REFRESH_RULES.shell.itemHitImmunity.stackBehavior,
    "shell immunity effect declares capped refresh behavior"
  );
  assertAlmostEqual(
    shellImmunityDefinition.stackLimitSeconds ?? 0,
    RACER_ITEM_EFFECT_DURATIONS.shell.itemHitImmunitySeconds *
      RACER_ITEM_EFFECT_REFRESH_RULES.shell.itemHitImmunity
        .stackLimitMultiplier,
    "shell immunity effect exposes capped stack duration"
  );
  assertEqual(
    bananaSpinoutDefinition.recoveryDurationSeconds,
    Math.max(
      RACER_ITEM_EFFECT_DURATIONS.banana.stunSeconds,
      RACER_ITEM_EFFECT_DURATIONS.banana.spinoutSeconds
    ),
    "banana spinout metadata exposes recovery duration"
  );
  assertGreaterThan(
    RACER_ITEM_EFFECT_DEFINITIONS.length,
    0,
    "item effect definition registry is populated"
  );

  return {
    definitionCount: RACER_ITEM_EFFECT_DEFINITIONS.length,
    boostDurationSeconds: boostDefinition.durationSeconds,
    shellStunSeconds: shellStunDefinition.durationSeconds,
    bananaSpinoutSeconds: bananaSpinoutDefinition.durationSeconds,
    spinoutStackingRule: bananaSpinoutDefinition.stackingRule,
    boostStackLimitSeconds: boostDefinition.stackLimitSeconds,
    shellRecoveryDurationSeconds,
    shellImmunityWindowSeconds: shellStunDefinition.immunityWindowSeconds,
    shellImmunityStackLimitSeconds: shellImmunityDefinition.stackLimitSeconds,
    shellStackBehavior: shellStunDefinition.stackBehavior
  };
}

function validateItemEffectStackingRules(): ItemEffectStackingValidationResult {
  const state = createInitialRacerItemEffectState();
  const shell = COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig;
  const banana = COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig;
  const initialAngularVelocity = 10;
  const shorterAngularVelocity = -4;
  const longerAngularVelocity = -18;
  const shieldState = createInitialRacerItemEffectState();
  const bananaOnlyState = createInitialRacerItemEffectState();

  applyRacerBoostItemEffect(state, BOOST_DURATION_SECONDS);
  updateRacerItemEffectTimers(state, 0.25);
  applyRacerBoostItemEffect(state, 0.2);
  const boostAfterRefreshSeconds = state.boostSeconds;
  applyRacerBoostItemEffect(state, BOOST_DURATION_SECONDS);
  applyRacerBoostItemEffect(state, BOOST_DURATION_SECONDS);
  const boostAfterCapSeconds = state.boostSeconds;
  applyRacerShieldItemEffect(shieldState, 1.1);
  updateRacerItemEffectTimers(shieldState, 0.25);
  applyRacerShieldItemEffect(shieldState, 0.2);

  assertAlmostEqual(
    boostAfterRefreshSeconds,
    BOOST_DURATION_SECONDS - 0.25 + 0.2,
    "repeated boost extends the active timer"
  );
  assertAlmostEqual(
    boostAfterCapSeconds,
    BOOST_DURATION_SECONDS *
      RACER_ITEM_EFFECT_REFRESH_RULES.boost.boost.stackLimitMultiplier,
    "repeated boost is capped at its configured stack limit"
  );
  assertAlmostEqual(
    shieldState.shieldSeconds,
    0.2,
    "repeated shield replaces the active shield timer"
  );

  const freshBananaHit = applyRacerItemHitEffect(bananaOnlyState, {
    itemType: "banana",
    stunSeconds: banana.hitStunSeconds,
    spinoutSeconds: banana.spinoutSeconds,
    spinoutAngularVelocity: shorterAngularVelocity,
    hitImmunitySeconds: banana.hitImmunitySeconds,
    hitFeedbackSeconds: banana.hitFeedbackSeconds
  });

  assertEqual(
    freshBananaHit.applied,
    true,
    "fresh banana hit applies before ignore stacking is active"
  );

  applyRacerItemHitEffect(state, {
    itemType: "shell",
    stunSeconds: shell.hitStunSeconds,
    spinoutSeconds: shell.spinoutSeconds,
    spinoutAngularVelocity: initialAngularVelocity,
    hitImmunitySeconds: shell.hitImmunitySeconds,
    hitFeedbackSeconds: shell.hitFeedbackSeconds
  });
  updateRacerItemEffectTimers(state, 0.1);

  const shellStunAfterDecay = state.stunSeconds;
  const shellSpinoutAfterDecay = state.spinoutSeconds;
  const hitFeedbackAfterFirstShellSeconds = state.hitFeedbackSeconds;
  const immunityAfterFirstShellSeconds = state.itemHitImmunitySeconds;

  const ignoredBananaHit = applyRacerItemHitEffect(state, {
    itemType: "banana",
    stunSeconds: 0.05,
    spinoutSeconds: 0.05,
    spinoutAngularVelocity: shorterAngularVelocity,
    hitImmunitySeconds: banana.hitImmunitySeconds,
    hitFeedbackSeconds: banana.hitFeedbackSeconds
  });

  assertAlmostEqual(
    state.stunSeconds,
    shellStunAfterDecay,
    "shorter stun hit preserves longer remaining stun"
  );
  assertAlmostEqual(
    state.spinoutSeconds,
    shellSpinoutAfterDecay,
    "shorter spinout hit preserves longer remaining spinout"
  );
  assertEqual(
    ignoredBananaHit.applied,
    false,
    "repeated banana hit is ignored while a hit effect is active"
  );
  assertEqual(
    state.spinoutAngularVelocity,
    initialAngularVelocity,
    "shorter spinout hit does not replace active angular velocity"
  );

  const repeatedShellHit = applyRacerItemHitEffect(state, {
    itemType: "shell",
    stunSeconds: shell.hitStunSeconds + 0.4,
    spinoutSeconds: shell.spinoutSeconds + 0.4,
    spinoutAngularVelocity: longerAngularVelocity,
    hitImmunitySeconds: shell.hitImmunitySeconds + 0.4,
    hitFeedbackSeconds: shell.hitFeedbackSeconds + 0.4
  });

  assertEqual(
    repeatedShellHit.applied,
    false,
    "repeated shell hit is ignored while shell spinout is active"
  );
  assertAlmostEqual(
    state.stunSeconds,
    shellStunAfterDecay,
    "repeated shell hit does not refresh active stun"
  );
  assertAlmostEqual(
    state.spinoutSeconds,
    shellSpinoutAfterDecay,
    "repeated shell hit does not refresh active spinout"
  );
  assertAlmostEqual(
    state.hitFeedbackSeconds,
    hitFeedbackAfterFirstShellSeconds,
    "repeated shell hit does not extend active feedback"
  );
  assertAlmostEqual(
    state.itemHitImmunitySeconds,
    immunityAfterFirstShellSeconds,
    "repeated shell hit does not extend active immunity"
  );
  assertEqual(
    state.spinoutAngularVelocity,
    initialAngularVelocity,
    "repeated shell hit does not replace active angular velocity"
  );
  assertEqual(
    state.lastHitItemType,
    "shell",
    "latest hit item marker updates"
  );
  const lastHitItemType = state.lastHitItemType;

  if (lastHitItemType === null) {
    throw new Error("Expected latest hit item marker to be retained.");
  }

  const expectedRecoverySeconds = Math.max(
    shellStunAfterDecay,
    shellSpinoutAfterDecay
  );
  const expectedRecoveryDuration = Math.max(
    shell.hitStunSeconds,
    shell.spinoutSeconds
  );
  const expectedImmunityWindow =
    shell.hitImmunitySeconds *
    RACER_ITEM_EFFECT_REFRESH_RULES.shell.itemHitImmunity.stackLimitMultiplier;
  const hitFeedbackAfterRepeatedShellSeconds = state.hitFeedbackSeconds;
  const immunityAfterRepeatedShellSeconds = state.itemHitImmunitySeconds;
  const timedSpinout = requireTimedEffect(state, "spinout");
  const timedImmunity = requireTimedEffect(state, "itemHitImmunity");

  assertAlmostEqual(
    state.recoverySeconds,
    expectedRecoverySeconds,
    "player effect state exposes active recovery seconds"
  );
  assertAlmostEqual(
    state.recoveryDurationSeconds,
    expectedRecoveryDuration,
    "player effect state exposes recovery duration"
  );
  assertAlmostEqual(
    state.itemHitImmunityWindowSeconds,
    expectedImmunityWindow,
    "player effect state exposes active immunity window"
  );
  assertAlmostEqual(
    hitFeedbackAfterRepeatedShellSeconds,
    hitFeedbackAfterFirstShellSeconds,
    "hit feedback is not extended by repeated shell hits during spinout"
  );
  assertAlmostEqual(
    immunityAfterRepeatedShellSeconds,
    immunityAfterFirstShellSeconds,
    "hit immunity is not extended by repeated shell hits during spinout"
  );
  assertEqual(
    timedSpinout.stackBehavior,
    RACER_ITEM_EFFECT_STACKING_RULES.spinout,
    "timed player effect state exposes stack behavior"
  );
  assertAlmostEqual(
    timedSpinout.recoveryDurationSeconds,
    expectedRecoveryDuration,
    "timed spinout state carries recovery duration"
  );
  assertAlmostEqual(
    timedImmunity.immunityWindowSeconds,
    expectedImmunityWindow,
    "timed immunity state carries immunity window"
  );
  assertAlmostEqual(
    timedImmunity.stackLimitSeconds ?? 0,
    expectedImmunityWindow,
    "timed immunity state carries cap duration"
  );
  assertAlmostEqual(
    timedImmunity.immunityRemainingSeconds,
    state.itemHitImmunitySeconds,
    "timed immunity state mirrors remaining immunity"
  );

  return {
    boostAfterRefreshSeconds,
    boostAfterCapSeconds,
    shieldAfterRefreshSeconds: shieldState.shieldSeconds,
    freshBananaHitApplied: freshBananaHit.applied,
    bananaRepeatedHitApplied: ignoredBananaHit.applied,
    repeatedShellHitApplied: repeatedShellHit.applied,
    stunAfterShorterHitSeconds: shellStunAfterDecay,
    spinoutAfterShorterHitSeconds: shellSpinoutAfterDecay,
    hitFeedbackAfterRepeatedShellSeconds,
    immunityAfterRepeatedShellSeconds,
    angularVelocityAfterShorterHit: initialAngularVelocity,
    angularVelocityAfterRepeatedShellHit: state.spinoutAngularVelocity,
    lastHitItemType,
    recoveryAfterRepeatedShellHitSeconds: state.recoverySeconds,
    recoveryDurationAfterRepeatedShellHitSeconds:
      state.recoveryDurationSeconds,
    immunityWindowAfterRepeatedShellHitSeconds:
      state.itemHitImmunityWindowSeconds,
    timedSpinoutStackBehavior: timedSpinout.stackBehavior,
    timedSpinoutRecoveryDurationSeconds: timedSpinout.recoveryDurationSeconds,
    timedImmunityWindowSeconds: timedImmunity.immunityWindowSeconds
  };
}

function validateDuplicateHitSourceImmunity(): DuplicateHitImmunityValidationResult {
  const state = createInitialRacerItemEffectState();
  const shell = COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig;
  const firstSourceId = "shell-source-1";
  const secondSourceId = "shell-source-2";
  const effectSourceId = "effect-source";

  const firstHit = applyRacerItemHitEffect(
    state,
    {
      itemType: "shell",
      stunSeconds: shell.hitStunSeconds,
      spinoutSeconds: shell.spinoutSeconds,
      spinoutAngularVelocity: 7,
      hitImmunitySeconds: shell.hitImmunitySeconds,
      hitFeedbackSeconds: shell.hitFeedbackSeconds
    },
    firstSourceId
  );
  const firstSourceImmunitySeconds =
    state.hitSourceImmunitySecondsBySource[firstSourceId] ?? 0;

  assertEqual(firstHit.applied, true, "first shell source hit applies");
  assertAlmostEqual(
    firstSourceImmunitySeconds,
    shell.hitImmunitySeconds,
    "first shell source starts duplicate-hit immunity"
  );

  updateRacerItemEffectTimers(state, 0.25);

  const decayedSourceImmunitySeconds =
    state.hitSourceImmunitySecondsBySource[firstSourceId] ?? 0;
  const stunBeforeDuplicate = state.stunSeconds;
  const duplicateHit = applyRacerItemHitEffect(
    state,
    {
      itemType: "shell",
      stunSeconds: shell.hitStunSeconds + 0.5,
      spinoutSeconds: shell.spinoutSeconds + 0.5,
      spinoutAngularVelocity: -11,
      hitImmunitySeconds: shell.hitImmunitySeconds,
      hitFeedbackSeconds: shell.hitFeedbackSeconds
    },
    ` ${firstSourceId} `
  );
  const duplicateStunSeconds = state.stunSeconds;
  const duplicateSourceImmunitySeconds =
    state.hitSourceImmunitySecondsBySource[firstSourceId] ?? 0;

  assertAlmostEqual(
    decayedSourceImmunitySeconds,
    shell.hitImmunitySeconds - 0.25,
    "source immunity timer decays with item effect timers"
  );
  assertEqual(
    duplicateHit.applied,
    false,
    "same source cannot reapply hit effects during immunity window"
  );
  assertAlmostEqual(
    duplicateStunSeconds,
    stunBeforeDuplicate,
    "blocked duplicate source does not refresh stun"
  );
  assertAlmostEqual(
    duplicateSourceImmunitySeconds,
    decayedSourceImmunitySeconds,
    "blocked duplicate source does not refresh source immunity"
  );

  const secondSourceHit = applyRacerItemHitEffect(
    state,
    {
      itemType: "shell",
      stunSeconds: shell.hitStunSeconds + 0.5,
      spinoutSeconds: shell.spinoutSeconds + 0.5,
      spinoutAngularVelocity: -11,
      hitImmunitySeconds: shell.hitImmunitySeconds,
      hitFeedbackSeconds: shell.hitFeedbackSeconds
    },
    secondSourceId
  );
  const secondSourceStunSeconds = state.stunSeconds;

  assertEqual(
    secondSourceHit.applied,
    false,
    "different shell source cannot reapply while shell spinout is active"
  );
  assertAlmostEqual(
    secondSourceStunSeconds,
    duplicateStunSeconds,
    "blocked different shell source does not refresh stun during spinout"
  );

  updateRacerItemEffectTimers(state, shell.hitImmunitySeconds + 0.01);

  const expiredSourceImmunityCount = Object.keys(
    state.hitSourceImmunitySecondsBySource
  ).length;
  const reappliedAfterExpiry = applyRacerItemHitEffect(
    state,
    {
      itemType: "shell",
      stunSeconds: shell.hitStunSeconds + 0.7,
      spinoutSeconds: shell.spinoutSeconds + 0.7,
      spinoutAngularVelocity: 13,
      hitImmunitySeconds: shell.hitImmunitySeconds,
      hitFeedbackSeconds: shell.hitFeedbackSeconds
    },
    firstSourceId
  );

  assertEqual(
    expiredSourceImmunityCount,
    0,
    "source immunity entries are removed after expiry"
  );
  assertEqual(
    reappliedAfterExpiry.applied,
    true,
    "same source can apply again after its immunity window expires"
  );

  const effectSourceState = createInitialRacerItemEffectState();
  const effectSourceHit = applyRacerItemHitEffect(
    effectSourceState,
    {
      itemType: "shell",
      sourceId: ` ${effectSourceId} `,
      stunSeconds: shell.hitStunSeconds,
      spinoutSeconds: shell.spinoutSeconds,
      spinoutAngularVelocity: 4,
      hitImmunitySeconds: shell.hitImmunitySeconds,
      hitFeedbackSeconds: shell.hitFeedbackSeconds
    },
    "fallback-source"
  );
  const effectSourceDuplicate = applyRacerItemHitEffect(
    effectSourceState,
    {
      itemType: "shell",
      sourceId: effectSourceId,
      stunSeconds: shell.hitStunSeconds + 0.25,
      spinoutSeconds: shell.spinoutSeconds + 0.25,
      spinoutAngularVelocity: -4,
      hitImmunitySeconds: shell.hitImmunitySeconds,
      hitFeedbackSeconds: shell.hitFeedbackSeconds
    },
    "different-fallback-source"
  );
  const effectSourceImmunitySeconds =
    effectSourceState.hitSourceImmunitySecondsBySource[effectSourceId] ?? 0;

  assertEqual(
    effectSourceHit.applied,
    true,
    "effect source id applies initial hit"
  );
  assertEqual(
    effectSourceDuplicate.applied,
    false,
    "normalized effect source id blocks duplicate hits"
  );
  assertAlmostEqual(
    effectSourceImmunitySeconds,
    shell.hitImmunitySeconds,
    "effect source id owns the duplicate-hit immunity timer"
  );
  assertEqual(
    effectSourceState.hitSourceImmunitySecondsBySource["fallback-source"],
    undefined,
    "effect source id takes precedence over fallback source argument"
  );

  const shellPostSpinoutState = createInitialRacerItemEffectState();
  const shellPostSpinoutHit = applyRacerItemHitEffect(shellPostSpinoutState, {
    itemType: "shell",
    stunSeconds: shell.hitStunSeconds,
    spinoutSeconds: shell.spinoutSeconds,
    spinoutAngularVelocity: 8,
    hitImmunitySeconds: shell.hitImmunitySeconds,
    hitFeedbackSeconds: shell.hitFeedbackSeconds
  });

  updateRacerItemEffectTimers(
    shellPostSpinoutState,
    shell.spinoutSeconds + 0.01
  );

  const shellPostSpinoutRecovering = shellPostSpinoutState.recovering;
  const shellPostSpinoutImmunitySeconds =
    shellPostSpinoutState.itemHitImmunitySeconds;
  const shellPostSpinoutDuplicate = applyRacerItemHitEffect(
    shellPostSpinoutState,
    {
      itemType: "shell",
      stunSeconds: shell.hitStunSeconds,
      spinoutSeconds: shell.spinoutSeconds,
      spinoutAngularVelocity: -8,
      hitImmunitySeconds: shell.hitImmunitySeconds,
      hitFeedbackSeconds: shell.hitFeedbackSeconds
    },
    "post-spinout-shell"
  );

  assertEqual(
    shellPostSpinoutHit.applied,
    true,
    "shell post-spinout balance starts from an applied hit"
  );
  assertEqual(
    shellPostSpinoutState.spinoutSeconds,
    0,
    "shell control spinout has ended before post-hit immunity expires"
  );
  assertEqual(
    shellPostSpinoutRecovering,
    false,
    "shell control returns during post-hit immunity"
  );
  assertGreaterThan(
    shellPostSpinoutImmunitySeconds,
    0,
    "shell post-hit immunity remains after control returns"
  );
  assertEqual(
    shellPostSpinoutDuplicate.applied,
    false,
    "shell post-hit immunity blocks a new shell chain after spinout"
  );

  updateRacerItemEffectTimers(
    shellPostSpinoutState,
    shellPostSpinoutImmunitySeconds + 0.01
  );

  const shellAfterGlobalImmunity = applyRacerItemHitEffect(
    shellPostSpinoutState,
    {
      itemType: "shell",
      stunSeconds: shell.hitStunSeconds,
      spinoutSeconds: shell.spinoutSeconds,
      spinoutAngularVelocity: 8,
      hitImmunitySeconds: shell.hitImmunitySeconds,
      hitFeedbackSeconds: shell.hitFeedbackSeconds
    },
    "post-immunity-shell"
  );

  assertEqual(
    shellAfterGlobalImmunity.applied,
    true,
    "shell can hit again after global post-hit immunity expires"
  );

  const banana = COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig;
  const bananaPostSpinoutState = createInitialRacerItemEffectState();
  const bananaPostSpinoutHit = applyRacerItemHitEffect(bananaPostSpinoutState, {
    itemType: "banana",
    stunSeconds: banana.hitStunSeconds,
    spinoutSeconds: banana.spinoutSeconds,
    spinoutAngularVelocity: banana.spinoutRadians / banana.spinoutSeconds,
    hitImmunitySeconds: banana.hitImmunitySeconds,
    hitFeedbackSeconds: banana.hitFeedbackSeconds
  });

  updateRacerItemEffectTimers(
    bananaPostSpinoutState,
    banana.spinoutSeconds + 0.01
  );

  const bananaPostSpinoutRecovering = bananaPostSpinoutState.recovering;
  const bananaPostSpinoutImmunitySeconds =
    bananaPostSpinoutState.itemHitImmunitySeconds;
  const bananaPostSpinoutDuplicate = applyRacerItemHitEffect(
    bananaPostSpinoutState,
    {
      itemType: "banana",
      stunSeconds: banana.hitStunSeconds,
      spinoutSeconds: banana.spinoutSeconds,
      spinoutAngularVelocity: -banana.spinoutRadians / banana.spinoutSeconds,
      hitImmunitySeconds: banana.hitImmunitySeconds,
      hitFeedbackSeconds: banana.hitFeedbackSeconds
    },
    "post-spinout-banana"
  );

  assertEqual(
    bananaPostSpinoutHit.applied,
    true,
    "banana post-spinout balance starts from an applied hit"
  );
  assertEqual(
    bananaPostSpinoutState.spinoutSeconds,
    0,
    "banana control spinout has ended before post-hit immunity expires"
  );
  assertEqual(
    bananaPostSpinoutRecovering,
    false,
    "banana control returns during post-hit immunity"
  );
  assertGreaterThan(
    bananaPostSpinoutImmunitySeconds,
    0,
    "banana post-hit immunity remains after control returns"
  );
  assertEqual(
    bananaPostSpinoutDuplicate.applied,
    false,
    "banana post-hit immunity blocks a new trap chain after spinout"
  );

  return {
    firstShellApplied: firstHit.applied,
    duplicateShellApplied: duplicateHit.applied,
    secondSourceShellApplied: secondSourceHit.applied,
    reappliedAfterExpiry: reappliedAfterExpiry.applied,
    effectSourceDuplicateApplied: effectSourceDuplicate.applied,
    shellPostSpinoutRecovering,
    shellPostSpinoutImmunitySeconds,
    shellPostSpinoutDuplicateApplied: shellPostSpinoutDuplicate.applied,
    shellReappliedAfterGlobalImmunity: shellAfterGlobalImmunity.applied,
    bananaPostSpinoutRecovering,
    bananaPostSpinoutImmunitySeconds,
    bananaPostSpinoutDuplicateApplied: bananaPostSpinoutDuplicate.applied,
    firstSourceImmunitySeconds,
    decayedSourceImmunitySeconds,
    duplicateSourceImmunitySeconds,
    effectSourceImmunitySeconds,
    duplicateStunSeconds,
    secondSourceStunSeconds,
    expiredSourceImmunityCount
  };
}

function validateItemEffectExpirationHandling(): ItemEffectExpirationValidationResult {
  const state = createInitialRacerItemEffectState();

  state.boostSeconds = 0.1;
  state.shieldSeconds = 0.15;
  state.stunSeconds = 0.2;
  state.spinoutSeconds = 0.3;
  state.spinoutAngularVelocity = 12;
  state.recoverySeconds = 0.3;
  state.recoveryDurationSeconds = 0.3;
  state.itemHitImmunitySeconds = 0.4;
  state.itemHitImmunityWindowSeconds = 0.4;
  state.hitFeedbackSeconds = 0.5;
  state.lastHitItemType = "banana";
  state.recovering = true;
  state.hitSourceImmunitySecondsBySource["expiring-source"] = 0.2;

  const result = updateRacerItemEffectTimers(state, 0.6);

  assertIncludes(
    result.expiredEffectTypes,
    "boost",
    "expiration result reports boost expiry"
  );
  assertIncludes(
    result.expiredEffectTypes,
    "shield",
    "expiration result reports shield expiry"
  );
  assertIncludes(
    result.expiredEffectTypes,
    "stun",
    "expiration result reports stun expiry"
  );
  assertIncludes(
    result.expiredEffectTypes,
    "spinout",
    "expiration result reports spinout expiry"
  );
  assertIncludes(
    result.expiredEffectTypes,
    "itemHitImmunity",
    "expiration result reports hit immunity expiry"
  );
  assertIncludes(
    result.expiredEffectTypes,
    "hitFeedback",
    "expiration result reports hit feedback expiry"
  );
  assertEqual(
    result.activeEffectTypes.length,
    0,
    "expiration result has no active effects after full expiry"
  );
  assertEqual(
    result.recoveryEffectTypes.length,
    0,
    "expiration result has no recovery effects after full expiry"
  );
  assertEqual(
    result.transitionedToRecoveryEffectTypes.length,
    0,
    "full expiry without timed state does not report recovery transitions"
  );
  assertEqual(state.boostSeconds, 0, "boost effect expires");
  assertEqual(state.shieldSeconds, 0, "shield effect expires");
  assertEqual(state.stunSeconds, 0, "stun effect expires");
  assertEqual(state.spinoutSeconds, 0, "spinout effect expires");
  assertEqual(
    state.spinoutAngularVelocity,
    0,
    "spinout angular velocity clears on expiry"
  );
  assertEqual(
    state.itemHitImmunitySeconds,
    0,
    "hit immunity effect expires"
  );
  assertEqual(
    state.itemHitImmunityWindowSeconds,
    0,
    "hit immunity window clears on expiry"
  );
  assertEqual(state.hitFeedbackSeconds, 0, "hit feedback effect expires");
  assertEqual(state.recoverySeconds, 0, "recovery seconds expire");
  assertEqual(
    state.recoveryDurationSeconds,
    0,
    "recovery duration clears on expiry"
  );
  assertEqual(state.lastHitItemType, null, "last hit marker clears on expiry");
  assertEqual(state.recovering, false, "recovering flag clears on expiry");
  assertEqual(
    Object.keys(state.timedEffects).length,
    0,
    "timed player effect state clears on expiry"
  );
  assertEqual(
    Object.keys(state.hitSourceImmunitySecondsBySource).length,
    0,
    "source duplicate-hit immunity expires with item timers"
  );
  assertEqual(
    result.clearedLastHitItemType,
    true,
    "expiration result reports marker cleanup"
  );

  return {
    expiredEffectCount: result.expiredEffectTypes.length,
    expiredEffectTypes: result.expiredEffectTypes.join(","),
    activeEffectCount: result.activeEffectTypes.length,
    recoveryEffectCount: result.recoveryEffectTypes.length,
    transitionedRecoveryEffectCount:
      result.transitionedToRecoveryEffectTypes.length,
    boostSeconds: state.boostSeconds,
    shieldSeconds: state.shieldSeconds,
    stunSeconds: state.stunSeconds,
    spinoutSeconds: state.spinoutSeconds,
    spinoutAngularVelocity: state.spinoutAngularVelocity,
    itemHitImmunitySeconds: state.itemHitImmunitySeconds,
    itemHitImmunityWindowSeconds: state.itemHitImmunityWindowSeconds,
    hitFeedbackSeconds: state.hitFeedbackSeconds,
    recoverySeconds: state.recoverySeconds,
    recoveryDurationSeconds: state.recoveryDurationSeconds,
    lastHitItemType: state.lastHitItemType,
    recovering: state.recovering,
    timedEffectCount: Object.keys(state.timedEffects).length,
    sourceImmunityCount: Object.keys(state.hitSourceImmunitySecondsBySource)
      .length
  };
}

function validateSpinoutStatusHandling(): SpinoutStatusValidationResult {
  const state = createInitialRacerItemEffectState();
  const bananaContactState = createInitialRacerItemEffectState();
  const spinoutSeconds = 0.45;
  const spinoutAngularVelocity = 7.25;
  const applied = applyRacerSpinoutItemEffect(
    state,
    spinoutSeconds,
    spinoutAngularVelocity,
    "banana"
  );
  const timedSpinout = requireTimedEffect(state, "spinout");

  assertEqual(applied.applied, true, "direct spinout status applies");
  assertAlmostEqual(
    applied.spinoutSeconds,
    spinoutSeconds,
    "direct spinout status exposes configured duration"
  );
  assertAlmostEqual(
    state.spinoutSeconds,
    spinoutSeconds,
    "direct spinout status starts the timer"
  );
  assertEqual(
    state.spinoutAngularVelocity,
    spinoutAngularVelocity,
    "direct spinout status stores angular velocity"
  );
  assertEqual(state.recovering, true, "direct spinout status marks recovering");
  assertEqual(
    state.lastHitItemType,
    "banana",
    "direct spinout status records source item for status labels"
  );
  assertEqual(
    timedSpinout.sourceItemType,
    "banana",
    "direct spinout timed state records source item"
  );
  assertEqual(
    timedSpinout.phase,
    "active",
    "direct spinout timed state starts active"
  );
  assertAlmostEqual(
    timedSpinout.remainingSeconds,
    spinoutSeconds,
    "direct spinout timed state mirrors duration"
  );

  updateRacerItemEffectTimers(state, 0.2);
  const partialSpinoutSeconds = state.spinoutSeconds;

  assertAlmostEqual(
    partialSpinoutSeconds,
    spinoutSeconds - 0.2,
    "direct spinout status decays by elapsed time"
  );
  assertEqual(
    state.spinoutAngularVelocity,
    spinoutAngularVelocity,
    "active direct spinout keeps angular velocity"
  );
  assertEqual(
    state.recovering,
    true,
    "active direct spinout keeps racer recovering"
  );

  updateRacerItemEffectTimers(state, spinoutSeconds);

  assertEqual(state.spinoutSeconds, 0, "direct spinout status expires");
  assertEqual(
    state.spinoutAngularVelocity,
    0,
    "direct spinout status clears angular velocity on expiry"
  );
  assertEqual(
    state.recovering,
    false,
    "direct spinout status clears recovery on expiry"
  );
  assertEqual(
    state.timedEffects.spinout,
    undefined,
    "direct spinout timed state clears on expiry"
  );
  assertEqual(
    state.lastHitItemType,
    null,
    "direct spinout status clears source label on expiry"
  );

  const banana = COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig;
  const bananaContactAngularVelocity = banana.spinoutRadians / banana.spinoutSeconds;
  const bananaContact = applyRacerItemHitEffect(
    bananaContactState,
    {
      itemType: "banana",
      stunSeconds: banana.hitStunSeconds,
      spinoutSeconds: banana.spinoutSeconds,
      spinoutAngularVelocity: bananaContactAngularVelocity,
      hitImmunitySeconds: banana.hitImmunitySeconds,
      hitFeedbackSeconds: banana.hitFeedbackSeconds
    },
    "banana:validation-contact"
  );
  const bananaContactTimedSpinout = requireTimedEffect(
    bananaContactState,
    "spinout"
  );

  assertEqual(
    bananaContact.applied,
    true,
    "banana contact applies the spinout state"
  );
  assertAlmostEqual(
    bananaContactState.spinoutSeconds,
    banana.spinoutSeconds,
    "banana contact starts the spinout timer"
  );
  assertEqual(
    bananaContactState.spinoutAngularVelocity,
    bananaContactAngularVelocity,
    "banana contact stores spinout angular velocity"
  );
  assertEqual(
    bananaContactTimedSpinout.sourceItemType,
    "banana",
    "banana contact timed spinout records banana source"
  );
  assertEqual(
    bananaContactState.recovering,
    true,
    "banana contact puts the racer in recovery"
  );

  updateRacerItemEffectTimers(bananaContactState, banana.spinoutSeconds + 0.01);

  assertEqual(
    bananaContactState.spinoutSeconds,
    0,
    "banana contact spinout timer expires"
  );
  assertEqual(
    bananaContactState.spinoutAngularVelocity,
    0,
    "banana contact spinout clears angular velocity on expiry"
  );
  assertEqual(
    bananaContactState.timedEffects.spinout,
    undefined,
    "banana contact timed spinout clears on expiry"
  );
  assertEqual(
    bananaContactState.recovering,
    false,
    "banana contact clears recovery on spinout expiry"
  );

  return {
    applied: applied.applied,
    bananaContactApplied: bananaContact.applied,
    activeSpinoutSeconds: applied.spinoutSeconds,
    partialSpinoutSeconds,
    expiredSpinoutSeconds: state.spinoutSeconds,
    expiredAngularVelocity: state.spinoutAngularVelocity,
    bananaContactExpiredSpinoutSeconds: bananaContactState.spinoutSeconds,
    bananaContactExpiredAngularVelocity:
      bananaContactState.spinoutAngularVelocity,
    bananaContactTimedStateCleared:
      bananaContactState.timedEffects.spinout === undefined,
    recoveringAfterApply: applied.recovering,
    recoveringAfterExpiry: state.recovering,
    timedSpinoutSource: timedSpinout.sourceItemType
  };
}

function validateItemEffectLifecycleUpdateLoop(): ItemEffectLifecycleValidationResult {
  const timedBoostState = createInitialRacerItemEffectState();

  timedBoostState.timedEffects.boost = {
    sourceItemType: "boost",
    effectType: "boost",
    phase: "active",
    durationSeconds: 0.5,
    remainingSeconds: 0.5,
    recoveryDurationSeconds: 0,
    recoverySeconds: 0,
    stackBehavior: RACER_ITEM_EFFECT_STACKING_RULES.boost,
    stackLimitSeconds: 1,
    immunityWindowSeconds: 0,
    immunityRemainingSeconds: 0
  };

  updateRacerItemEffectTimers(timedBoostState, 0.2);

  assertAlmostEqual(
    timedBoostState.boostSeconds,
    0.3,
    "lifecycle update applies active timed boost before countdown"
  );

  const hitState = createInitialRacerItemEffectState();
  const shell = COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig;

  applyRacerItemHitEffect(hitState, {
    itemType: "shell",
    stunSeconds: shell.hitStunSeconds,
    spinoutSeconds: shell.spinoutSeconds,
    spinoutAngularVelocity: 9,
    hitImmunitySeconds: shell.hitImmunitySeconds,
    hitFeedbackSeconds: shell.hitFeedbackSeconds
  });

  const transitionResult = updateRacerItemEffectTimers(
    hitState,
    shell.hitStunSeconds + 0.01
  );
  const stunEffectDuringRecovery = requireTimedEffect(hitState, "stun");
  const spinoutEffectDuringRecovery = requireTimedEffect(hitState, "spinout");

  assertIncludes(
    transitionResult.transitionedToRecoveryEffectTypes,
    "stun",
    "stun transitions from active into recovery"
  );
  assertIncludes(
    transitionResult.recoveryEffectTypes,
    "stun",
    "stun remains tracked during recovery"
  );
  assertIncludes(
    transitionResult.activeEffectTypes,
    "spinout",
    "longer spinout remains active during stun recovery"
  );
  assertEqual(
    stunEffectDuringRecovery.phase,
    "recovery",
    "stun timed effect enters recovery phase"
  );
  assertEqual(
    spinoutEffectDuringRecovery.phase,
    "active",
    "spinout timed effect stays active while stun recovers"
  );
  assertEqual(
    stunEffectDuringRecovery.remainingSeconds,
    0,
    "recovered stun has no active duration remaining"
  );
  assertGreaterThan(
    stunEffectDuringRecovery.recoverySeconds,
    0,
    "recovered stun retains remaining recovery seconds"
  );
  assertEqual(
    transitionResult.recovering,
    true,
    "transition result keeps racer recovering while spinout remains active"
  );

  const clearResult = updateRacerItemEffectTimers(
    hitState,
    shell.hitImmunitySeconds + 0.5
  );

  assertEqual(
    Object.keys(hitState.timedEffects).length,
    0,
    "lifecycle update clears timed effects after recovery and immunity expire"
  );
  assertEqual(
    clearResult.activeEffectTypes.length,
    0,
    "clear result has no active effects after recovery expiry"
  );
  assertEqual(
    clearResult.recoveryEffectTypes.length,
    0,
    "clear result has no recovery effects after recovery expiry"
  );
  assertEqual(
    clearResult.recovering,
    false,
    "clear result exits recovery after negative effects expire"
  );
  assertEqual(
    hitState.lastHitItemType,
    null,
    "lifecycle update clears last hit marker after recovery and immunity expire"
  );

  return {
    activeAppliedBoostSeconds: timedBoostState.boostSeconds,
    transitionedEffectType: "stun",
    recoveryEffectType: stunEffectDuringRecovery.effectType,
    activeEffectTypeDuringRecovery: spinoutEffectDuringRecovery.effectType,
    stunPhaseDuringRecovery: stunEffectDuringRecovery.phase,
    stunRemainingDuringRecovery: stunEffectDuringRecovery.remainingSeconds,
    stunRecoverySecondsDuringRecovery: stunEffectDuringRecovery.recoverySeconds,
    recoveringDuringTransition: transitionResult.recovering,
    clearedActiveEffectCount: clearResult.activeEffectTypes.length,
    clearedRecoveryEffectCount: clearResult.recoveryEffectTypes.length,
    clearedLastHitItemType: hitState.lastHitItemType,
    clearedTimedEffectCount: Object.keys(hitState.timedEffects).length
  };
}

function validateRaceSessionEffectTimerIntegration(): RaceSessionEffectIntegrationValidationResult {
  const tickSeconds = 1 / 60;
  const session = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: "effect-host",
        displayName: "Effect Host",
        slotIndex: 0,
        isHost: true
      }
    ]),
    {
      aiController: STATIONARY_AI_CONTROLLER,
      itemPickups: [],
      obstacles: []
    }
  );
  const racer = requireFirstHumanRacer(session.humanRacerStates);

  racer.heldItem = COMBAT_ITEM_REGISTRY.boost.type;
  session.setHumanInput(racer.id, {
    throttle: 1,
    useItem: true
  });
  session.tick(tickSeconds);

  const activeBoostSeconds = racer.boostSeconds;

  assertGreaterThan(
    activeBoostSeconds,
    0,
    "race session applies boost through item-effect state"
  );

  racer.stunSeconds = 0.05;
  racer.spinoutSeconds = 0.05;
  racer.spinoutAngularVelocity = 8;
  racer.itemHitImmunitySeconds = 0.05;
  racer.hitFeedbackSeconds = 0.05;
  racer.lastHitItemType = "shell";
  racer.recovering = true;

  for (
    let tickIndex = 0;
    tickIndex < Math.ceil((BOOST_DURATION_SECONDS + 0.2) / tickSeconds);
    tickIndex += 1
  ) {
    session.tick(tickSeconds);
  }

  assertEqual(racer.boostSeconds, 0, "race session boost timer expires");
  assertEqual(racer.stunSeconds, 0, "race session stun timer expires");
  assertEqual(
    racer.spinoutAngularVelocity,
    0,
    "race session spinout angular velocity expires"
  );
  assertEqual(
    racer.lastHitItemType,
    null,
    "race session clears hit marker after effects expire"
  );
  const itemEffectRecovering =
    racer.stunSeconds > 0 ||
    racer.spinoutSeconds > 0 ||
    racer.recoverySeconds > 0;

  assertEqual(
    itemEffectRecovering,
    false,
    "race session item-effect recovery state follows timer expiry"
  );

  return {
    activeBoostSeconds,
    expiredBoostSeconds: racer.boostSeconds,
    expiredStunSeconds: racer.stunSeconds,
    clearedLastHitItemType: racer.lastHitItemType,
    recovering: itemEffectRecovering
  };
}

function validateRaceSessionEffectMotionIntegration(): RaceSessionEffectMotionValidationResult {
  const tickSeconds = 1 / 60;
  const baselineAccelerationSession = createEffectValidationSession();
  const boostedAccelerationSession = createEffectValidationSession();
  const baselineAccelerationRacer = requireFirstHumanRacer(
    baselineAccelerationSession.humanRacerStates
  );
  const boostedAccelerationRacer = requireFirstHumanRacer(
    boostedAccelerationSession.humanRacerStates
  );

  baselineAccelerationSession.setHumanInput(baselineAccelerationRacer.id, {
    throttle: 1
  });
  boostedAccelerationRacer.heldItem = COMBAT_ITEM_REGISTRY.boost.type;
  boostedAccelerationSession.setHumanInput(boostedAccelerationRacer.id, {
    throttle: 1,
    useItem: true
  });

  baselineAccelerationSession.tick(tickSeconds);
  boostedAccelerationSession.tick(tickSeconds);

  assertGreaterThan(
    boostedAccelerationRacer.speed,
    baselineAccelerationRacer.speed,
    "boost increases racer acceleration"
  );

  const baselineCapSession = createEffectValidationSession();
  const boostedCapSession = createEffectValidationSession();
  const baselineCapRacer = requireFirstHumanRacer(
    baselineCapSession.humanRacerStates
  );
  const boostedCapRacer = requireFirstHumanRacer(
    boostedCapSession.humanRacerStates
  );

  setRacerSpeedForValidation(baselineCapRacer, 999);
  setRacerSpeedForValidation(boostedCapRacer, 999);
  boostedCapRacer.heldItem = COMBAT_ITEM_REGISTRY.boost.type;
  baselineCapSession.setHumanInput(baselineCapRacer.id, { throttle: 1 });
  boostedCapSession.setHumanInput(boostedCapRacer.id, {
    throttle: 1,
    useItem: true
  });
  baselineCapSession.tick(tickSeconds);
  boostedCapSession.tick(tickSeconds);

  assertGreaterThan(
    boostedCapRacer.speed,
    baselineCapRacer.speed,
    "boost raises racer max speed cap"
  );

  const boostExpirySession = createEffectValidationSession();
  const boostExpiryRacer = requireFirstHumanRacer(
    boostExpirySession.humanRacerStates
  );

  setRacerSpeedForValidation(boostExpiryRacer, 999);
  boostExpiryRacer.boostSeconds = BOOST_DURATION_SECONDS;
  boostExpirySession.setHumanInput(boostExpiryRacer.id, { throttle: 1 });

  for (
    let tickIndex = 0;
    tickIndex < Math.ceil((BOOST_DURATION_SECONDS + tickSeconds) / tickSeconds);
    tickIndex += 1
  ) {
    boostExpirySession.tick(tickSeconds);
  }

  assertEqual(
    boostExpiryRacer.boostSeconds,
    0,
    "boost movement timer expires after duration"
  );
  assertLessThanOrEqual(
    boostExpiryRacer.speed,
    baselineCapRacer.speed,
    "expired boost returns racer to normal max speed cap"
  );

  const slowdownBaselineSession = createEffectValidationSession();
  const slowedSession = createEffectValidationSession();
  const slowdownBaselineRacer = requireFirstHumanRacer(
    slowdownBaselineSession.humanRacerStates
  );
  const slowedRacer = requireFirstHumanRacer(slowedSession.humanRacerStates);
  const shell = COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig;

  setRacerSpeedForValidation(slowdownBaselineRacer, 999);
  setRacerSpeedForValidation(slowedRacer, 999);
  slowedRacer.spinoutSeconds = shell.spinoutSeconds;
  slowedRacer.spinoutAngularVelocity = 0;
  slowedRacer.recovering = true;
  slowdownBaselineSession.setHumanInput(slowdownBaselineRacer.id, {
    throttle: 1
  });
  slowedSession.setHumanInput(slowedRacer.id, { throttle: 1 });
  slowdownBaselineSession.tick(tickSeconds);
  slowedSession.tick(tickSeconds);

  assertGreaterThan(
    slowdownBaselineRacer.speed,
    slowedRacer.speed,
    "spinout slowdown lowers racer max speed cap"
  );
  assertEqual(
    Number(slowedRacer.recovering),
    1,
    "spinout slowdown keeps racer in recovery"
  );

  const recoveryBaselineSession = createEffectValidationSession();
  const recoverySession = createEffectValidationSession();
  const recoveryBaselineRacer = requireFirstHumanRacer(
    recoveryBaselineSession.humanRacerStates
  );
  const recoveryRacer = requireFirstHumanRacer(recoverySession.humanRacerStates);

  recoveryRacer.stunSeconds = shell.hitStunSeconds;
  recoveryRacer.recovering = true;
  recoveryBaselineSession.setHumanInput(recoveryBaselineRacer.id, {
    throttle: 1
  });
  recoverySession.setHumanInput(recoveryRacer.id, { throttle: 1 });
  recoveryBaselineSession.tick(tickSeconds);
  recoverySession.tick(tickSeconds);

  assertGreaterThan(
    recoveryBaselineRacer.speed,
    recoveryRacer.speed,
    "stun recovery blocks racer acceleration"
  );
  assertEqual(
    Number(recoveryRacer.recovering),
    1,
    "stun recovery keeps racer marked recovering"
  );

  const recoverySpeedDuringStun = recoveryRacer.speed;

  for (
    let tickIndex = 0;
    tickIndex < Math.ceil((shell.hitStunSeconds + tickSeconds) / tickSeconds);
    tickIndex += 1
  ) {
    recoverySession.tick(tickSeconds);
  }

  assertEqual(
    Number(recoveryRacer.recovering),
    0,
    "stun recovery clears after timer expiry"
  );

  recoverySession.setHumanInput(recoveryRacer.id, { throttle: 1 });
  recoverySession.tick(tickSeconds);

  assertGreaterThan(
    recoveryRacer.speed,
    recoverySpeedDuringStun,
    "racer acceleration returns after stun recovery"
  );

  const knockbackSession = createEffectValidationSession();
  const knockbackOwner = requireFirstHumanRacer(
    knockbackSession.humanRacerStates
  );
  const knockbackTarget = requireFirstAiRacer(knockbackSession.aiRacerStates);

  knockbackOwner.heldItem = COMBAT_ITEM_REGISTRY.shell.type;
  knockbackSession.setHumanInput(knockbackOwner.id, { useItem: true });
  knockbackSession.tick(0);

  const shellProjectile = knockbackSession.shellProjectileStates[0];

  if (shellProjectile === undefined) {
    throw new Error("Expected shell projectile for knockback validation.");
  }

  const targetBounds = refreshRacerCollisionBounds(knockbackTarget);
  const targetPositionBeforeHitTick = { ...knockbackTarget.position };

  setRacerSpeedForValidation(knockbackTarget, 12);
  shellProjectile.armedSeconds = 0;
  shellProjectile.position = { ...targetBounds.center };
  shellProjectile.velocity = {
    x: -COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed,
    y: 0,
    z: 0
  };

  const knockbackHitTick = knockbackSession.tick(0);
  const knockbackVelocityAfterHit = getPlanarVelocityMagnitude(
    knockbackTarget.knockbackVelocity
  );

  assertEqual(
    knockbackHitTick.shellHits.length,
    1,
    "shell hit is resolved for knockback validation"
  );
  assertGreaterThan(
    knockbackVelocityAfterHit,
    0,
    "shell hit applies target knockback velocity"
  );

  knockbackSession.tick(tickSeconds);

  const knockbackDisplacementDuringStun = getPlanarDistance(
    targetPositionBeforeHitTick,
    knockbackTarget.position
  );

  assertGreaterThan(
    knockbackDisplacementDuringStun,
    0,
    "knockback moves stunned racer through host movement physics"
  );

  for (
    let tickIndex = 0;
    tickIndex < Math.ceil(0.6 / tickSeconds);
    tickIndex += 1
  ) {
    knockbackSession.tick(tickSeconds);
  }

  const knockbackVelocityAfterRecovery = getPlanarVelocityMagnitude(
    knockbackTarget.knockbackVelocity
  );

  assertLessThanOrEqual(
    knockbackVelocityAfterRecovery,
    0.1,
    "item knockback decays quickly enough for recovery"
  );

  return {
    baselineAccelerationSpeed: baselineAccelerationRacer.speed,
    boostedAccelerationSpeed: boostedAccelerationRacer.speed,
    baselineMaxSpeedCap: baselineCapRacer.speed,
    boostedMaxSpeedCap: boostedCapRacer.speed,
    expiredBoostSeconds: boostExpiryRacer.boostSeconds,
    expiredBoostMaxSpeedCap: boostExpiryRacer.speed,
    slowedMaxSpeedCap: slowedRacer.speed,
    recoverySpeedDuringStun,
    recoverySpeedAfterStun: recoveryRacer.speed,
    knockbackVelocityAfterHit,
    knockbackDisplacementDuringStun,
    knockbackVelocityAfterRecovery
  };
}

function validateShieldBlocksNegativeItemEffects(): ShieldBlockValidationResult {
  const directState = createInitialRacerItemEffectState();
  const shell = COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig;

  applyRacerShieldItemEffect(directState, 1.25);
  assertEqual(
    isRacerShieldActive(directState),
    true,
    "shield state exposes active shield flag"
  );

  const directResult = applyRacerItemHitEffect(directState, {
    itemType: "shell",
    stunSeconds: shell.hitStunSeconds,
    spinoutSeconds: shell.spinoutSeconds,
    spinoutAngularVelocity: 8,
    hitImmunitySeconds: shell.hitImmunitySeconds,
    hitFeedbackSeconds: shell.hitFeedbackSeconds
  });

  assertEqual(directResult.blockedByShield, true, "shield blocks hit effect");
  assertEqual(directResult.shieldConsumed, true, "shield is consumed by block");
  assertEqual(directState.shieldSeconds, 0, "shield timer is consumed");
  assertEqual(directState.stunSeconds, 0, "shield blocks stun");
  assertEqual(directState.spinoutSeconds, 0, "shield blocks spinout");
  assertEqual(
    directState.lastHitItemType,
    null,
    "blocked hit does not mark last negative hit"
  );
  assertEqual(
    directState.timedEffects.shield,
    undefined,
    "blocked hit clears consumed shield timed state"
  );

  const session = createEffectValidationSession();
  const owner = requireFirstHumanRacer(session.humanRacerStates);
  const target = requireFirstAiRacer(session.aiRacerStates);

  target.shieldSeconds = 1.1;
  setRacerSpeedForValidation(target, 14);
  owner.heldItem = COMBAT_ITEM_REGISTRY.shell.type;
  session.setHumanInput(owner.id, { useItem: true });
  session.tick(0);

  const shellProjectile = session.shellProjectileStates[0];

  if (shellProjectile === undefined) {
    throw new Error("Expected shell projectile for shield block validation.");
  }

  const targetBounds = refreshRacerCollisionBounds(target);

  shellProjectile.armedSeconds = 0;
  shellProjectile.position = { ...targetBounds.center };
  shellProjectile.velocity = {
    x: COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed,
    y: 0,
    z: 0
  };

  const blockedTick = session.tick(0);

  assertEqual(
    blockedTick.shellHits.length,
    1,
    "shielded racer still consumes incoming shell contact"
  );
  assertEqual(
    blockedTick.shellHits[0]?.effect.blockedByShield,
    true,
    "shield block is exposed on shell hit effect"
  );
  assertEqual(target.shieldSeconds, 0, "session shield is consumed");
  assertEqual(target.stunSeconds, 0, "session shield blocks stun");
  assertEqual(target.spinoutSeconds, 0, "session shield blocks spinout");
  assertEqual(
    session.shellProjectileStates.length,
    0,
    "blocked shell is consumed after shield contact"
  );

  return {
    effectBlockedByShield: directResult.blockedByShield,
    directShieldSecondsAfterBlock: directState.shieldSeconds,
    directStunSecondsAfterBlock: directState.stunSeconds,
    sessionShieldSecondsAfterBlock: target.shieldSeconds,
    sessionStunSecondsAfterBlock: target.stunSeconds,
    sessionSpinoutSecondsAfterBlock: target.spinoutSeconds,
    sessionBlockedHitCount: blockedTick.shellHits.length,
    sessionActiveShellCountAfterBlock: session.shellProjectileStates.length
  };
}

function createEffectValidationSession() {
  return createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: "effect-validation-host",
        displayName: "Effect Validation Host",
        slotIndex: 0,
        isHost: true
      }
    ]),
    {
      itemPickups: [],
      obstacles: []
    }
  );
}

function setRacerSpeedForValidation(
  racer: RaceSessionRacerState,
  speed: number
): void {
  racer.speed = speed;
  racer.velocity = {
    x: racer.forward.x * speed,
    y: 0,
    z: racer.forward.z * speed
  };
}

function requireDefinition(
  sourceItemType: RacerItemEffectDefinition["sourceItemType"],
  effectType: RacerItemEffectDefinition["effectType"]
): RacerItemEffectDefinition {
  const definition = RACER_ITEM_EFFECT_DEFINITIONS.find(
    (candidate) =>
      candidate.sourceItemType === sourceItemType &&
      candidate.effectType === effectType
  );

  if (definition === undefined) {
    throw new Error(
      `Expected item effect definition: ${sourceItemType}/${effectType}.`
    );
  }

  return definition;
}

function requireTimedEffect(
  state: Pick<RacerItemEffectState, "timedEffects">,
  effectType: RacerTimedItemEffectState["effectType"]
): RacerTimedItemEffectState {
  const effect = state.timedEffects[effectType];

  if (effect === undefined) {
    throw new Error(`Expected active timed effect state: ${effectType}.`);
  }

  return effect;
}

function requireFirstHumanRacer(
  racers: readonly RaceSessionRacerState[]
): RaceSessionRacerState {
  const racer = racers[0];

  if (racer === undefined) {
    throw new Error("Expected a human racer for item-effect validation.");
  }

  return racer;
}

function requireFirstAiRacer(
  racers: readonly RaceSessionRacerState[]
): RaceSessionRacerState {
  const racer = racers[0];

  if (racer === undefined) {
    throw new Error("Expected an AI racer for item-effect validation.");
  }

  return racer;
}

function getPlanarVelocityMagnitude(
  velocity: Pick<RaceSessionRacerState["velocity"], "x" | "z">
): number {
  return Math.hypot(velocity.x, velocity.z);
}

function getPlanarDistance(
  left: Pick<RaceSessionRacerState["position"], "x" | "z">,
  right: Pick<RaceSessionRacerState["position"], "x" | "z">
): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`
    );
  }
}

function assertAlmostEqual(
  actual: number,
  expected: number,
  label: string,
  epsilon = 0.000001
): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertGreaterThan(
  actual: number,
  expected: number,
  label: string
): void {
  if (actual <= expected) {
    throw new Error(`${label}: expected > ${expected}, got ${actual}`);
  }
}

function assertLessThanOrEqual(
  actual: number,
  expected: number,
  label: string,
  epsilon = 0.000001
): void {
  if (actual - expected > epsilon) {
    throw new Error(`${label}: expected <= ${expected}, got ${actual}`);
  }
}

function assertIncludes<T>(
  values: readonly T[],
  expected: T,
  label: string
): void {
  if (!values.includes(expected)) {
    throw new Error(
      `${label}: expected ${String(expected)} in ${values.join(",")}`
    );
  }
}

main();
