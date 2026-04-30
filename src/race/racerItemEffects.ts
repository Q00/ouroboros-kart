export const RACER_ITEM_EFFECT_SOURCE_ITEM_TYPES = [
  "boost",
  "shell",
  "banana"
] as const;

export type RacerItemEffectSourceItemType =
  (typeof RACER_ITEM_EFFECT_SOURCE_ITEM_TYPES)[number];
export type RacerItemHitEffectItemType = Exclude<
  RacerItemEffectSourceItemType,
  "boost"
>;

export const RACER_ITEM_EFFECT_TYPES = [
  "boost",
  "shield",
  "stun",
  "spinout",
  "itemHitImmunity",
  "hitFeedback"
] as const;

export type RacerItemEffectType = (typeof RACER_ITEM_EFFECT_TYPES)[number];

export const RACER_TIMED_ITEM_EFFECT_PHASES = [
  "active",
  "recovery"
] as const;

export type RacerTimedItemEffectPhase =
  (typeof RACER_TIMED_ITEM_EFFECT_PHASES)[number];

export const RACER_ITEM_EFFECT_LIFECYCLE_PHASES = [
  "pending",
  "active",
  "recovery",
  "expired",
  "cancelled"
] as const;

export type RacerItemEffectLifecyclePhase =
  (typeof RACER_ITEM_EFFECT_LIFECYCLE_PHASES)[number];

export type RacerItemEffectStackingRule =
  | "replace"
  | "extend"
  | "ignore"
  | "cap";
export type RacerItemEffectStackBehavior = RacerItemEffectStackingRule;
export type RacerItemEffectCancellationRule =
  | "none"
  | "replace-existing"
  | "ignore-incoming"
  | "block-negative-hit";
export type RacerItemEffectRefreshRuleSource =
  | RacerItemEffectSourceItemType
  | "shield";

export const RACER_ITEM_EFFECT_LIFECYCLE_PROTOCOL =
  "kart-racer-item-effect-lifecycle";
export const RACER_ITEM_EFFECT_LIFECYCLE_VERSION = 1;
export const RACER_ITEM_EFFECT_LIFECYCLE_RECORD_TYPE =
  "racer-item-effect-lifecycle";
export const MAX_RACER_ITEM_EFFECT_LIFECYCLE_PAYLOAD_BYTES = 2 * 1024;

export interface RacerItemEffectRefreshRule {
  readonly stackBehavior: RacerItemEffectStackBehavior;
  readonly stackLimitMultiplier: number | null;
}

export interface RacerTimedItemEffectMetadata {
  readonly sourceItemType: RacerItemEffectSourceItemType;
  readonly effectType: RacerItemEffectType;
  readonly durationSeconds: number;
  readonly recoveryDurationSeconds: number;
  readonly stackBehavior: RacerItemEffectStackBehavior;
  readonly stackingRule: RacerItemEffectStackingRule;
  readonly stackLimitSeconds: number | null;
  readonly immunityWindowSeconds: number;
}

export interface RacerTimedItemEffectState {
  readonly sourceItemType: RacerItemEffectSourceItemType | null;
  readonly effectType: RacerItemEffectType;
  phase: RacerTimedItemEffectPhase;
  durationSeconds: number;
  remainingSeconds: number;
  recoveryDurationSeconds: number;
  recoverySeconds: number;
  stackBehavior: RacerItemEffectStackBehavior;
  stackLimitSeconds: number | null;
  immunityWindowSeconds: number;
  immunityRemainingSeconds: number;
}

export type RacerTimedItemEffectStateByType = Partial<
  Record<RacerItemEffectType, RacerTimedItemEffectState>
>;
export type RacerItemHitSourceImmunityState = Record<string, number>;

export interface RacerItemEffectState {
  boostSeconds: number;
  shieldSeconds: number;
  stunSeconds: number;
  spinoutSeconds: number;
  spinoutAngularVelocity: number;
  recoverySeconds: number;
  recoveryDurationSeconds: number;
  itemHitImmunitySeconds: number;
  itemHitImmunityWindowSeconds: number;
  hitFeedbackSeconds: number;
  lastHitItemType: RacerItemHitEffectItemType | null;
  recovering: boolean;
  timedEffects: RacerTimedItemEffectStateByType;
  hitSourceImmunitySecondsBySource: RacerItemHitSourceImmunityState;
}

export interface RacerItemHitEffectApplication {
  readonly itemType: RacerItemHitEffectItemType;
  readonly sourceId?: string | null;
  readonly stunSeconds: number;
  readonly spinoutSeconds: number;
  readonly spinoutAngularVelocity: number;
  readonly hitImmunitySeconds: number;
  readonly hitFeedbackSeconds: number;
  readonly blockedByShield?: boolean;
  readonly shieldSecondsBeforeHit?: number;
  readonly shieldSecondsAfterHit?: number;
}

export interface RacerItemHitEffectDurationConfig {
  readonly stunSeconds: number;
  readonly spinoutSeconds: number;
  readonly itemHitImmunitySeconds: number;
  readonly hitFeedbackSeconds: number;
}

export interface RacerItemEffectDurationTable {
  readonly boost: {
    readonly boostSeconds: number;
  };
  readonly shell: RacerItemHitEffectDurationConfig;
  readonly banana: RacerItemHitEffectDurationConfig;
}

export interface RacerItemEffectDefinition
  extends RacerTimedItemEffectMetadata {}

export interface RacerItemEffectExpirationResult {
  readonly expiredEffectTypes: readonly RacerItemEffectType[];
  readonly activeEffectTypes: readonly RacerItemEffectType[];
  readonly recoveryEffectTypes: readonly RacerItemEffectType[];
  readonly transitionedToRecoveryEffectTypes: readonly RacerItemEffectType[];
  readonly clearedLastHitItemType: boolean;
  readonly recovering: boolean;
}

export interface RacerItemHitEffectApplicationResult {
  readonly applied: boolean;
  readonly blockedByShield: boolean;
  readonly shieldConsumed: boolean;
  readonly shieldSecondsBeforeHit: number;
  readonly shieldSecondsAfterHit: number;
}

export interface RacerSpinoutEffectApplicationResult {
  readonly applied: boolean;
  readonly spinoutSeconds: number;
  readonly spinoutAngularVelocity: number;
  readonly recovering: boolean;
}

export interface RacerItemEffectLifecycleRules {
  readonly stackingRule: RacerItemEffectStackingRule;
  readonly stackLimitSeconds: number | null;
  readonly cancellationRule: RacerItemEffectCancellationRule;
}

export interface RacerItemEffectLifecycleRecord
  extends RacerItemEffectLifecycleRules {
  readonly protocol: typeof RACER_ITEM_EFFECT_LIFECYCLE_PROTOCOL;
  readonly version: typeof RACER_ITEM_EFFECT_LIFECYCLE_VERSION;
  readonly type: typeof RACER_ITEM_EFFECT_LIFECYCLE_RECORD_TYPE;
  readonly effectId: string;
  readonly effectType: RacerItemEffectType;
  readonly sourceItemType: RacerItemEffectSourceItemType | null;
  readonly sourceItemId: string | null;
  readonly sourceRacerId: string;
  readonly targetRacerId: string;
  readonly startedAtTick: number;
  readonly startedAtElapsedSeconds: number;
  readonly durationSeconds: number;
  readonly expiresAtElapsedSeconds: number;
  readonly phase: RacerItemEffectLifecyclePhase;
  readonly remainingSeconds: number;
  readonly recoveryDurationSeconds: number;
  readonly recoveryRemainingSeconds: number;
  readonly immunityWindowSeconds: number;
  readonly immunityRemainingSeconds: number;
  readonly cancelledByEffectId: string | null;
  readonly cancelledAtElapsedSeconds: number | null;
  readonly sequence: number;
}

export interface RacerItemEffectLifecycleCreateOptions {
  readonly effectId: string;
  readonly effectType: RacerItemEffectType;
  readonly sourceItemType?: RacerItemEffectSourceItemType | null;
  readonly sourceItemId?: string | null;
  readonly sourceRacerId: string;
  readonly targetRacerId: string;
  readonly startedAtTick: number;
  readonly startedAtElapsedSeconds: number;
  readonly durationSeconds: number;
  readonly phase?: RacerItemEffectLifecyclePhase;
  readonly remainingSeconds?: number;
  readonly recoveryDurationSeconds?: number;
  readonly recoveryRemainingSeconds?: number;
  readonly immunityWindowSeconds?: number;
  readonly immunityRemainingSeconds?: number;
  readonly stackingRule?: RacerItemEffectStackingRule;
  readonly stackLimitSeconds?: number | null;
  readonly cancellationRule?: RacerItemEffectCancellationRule;
  readonly cancelledByEffectId?: string | null;
  readonly cancelledAtElapsedSeconds?: number | null;
  readonly sequence?: number;
}

export interface RacerTimedItemEffectReconciliationSnapshot {
  readonly sourceItemType: RacerItemEffectSourceItemType | null;
  readonly effectType: RacerItemEffectType;
  readonly phase: RacerTimedItemEffectPhase;
  readonly durationSeconds: number;
  readonly remainingSeconds: number;
  readonly recoveryDurationSeconds: number;
  readonly recoverySeconds: number;
  readonly stackBehavior: RacerItemEffectStackBehavior;
  readonly stackLimitSeconds: number | null;
  readonly immunityWindowSeconds: number;
  readonly immunityRemainingSeconds: number;
}

export interface RacerItemHitSourceImmunityReconciliationSnapshot {
  readonly sourceId: string;
  readonly remainingSeconds: number;
}

export interface RacerItemEffectReconciliationState {
  readonly boostSeconds: number;
  readonly shieldSeconds: number;
  readonly stunSeconds: number;
  readonly spinoutSeconds: number;
  readonly spinoutAngularVelocity: number;
  readonly recoverySeconds: number;
  readonly recoveryDurationSeconds: number;
  readonly itemHitImmunitySeconds: number;
  readonly itemHitImmunityWindowSeconds: number;
  readonly hitFeedbackSeconds: number;
  readonly lastHitItemType: RacerItemHitEffectItemType | null;
  readonly recovering: boolean;
  readonly timedEffects: readonly RacerTimedItemEffectReconciliationSnapshot[];
  readonly hitSourceImmunities: readonly RacerItemHitSourceImmunityReconciliationSnapshot[];
}

export const RACER_ITEM_EFFECT_REFRESH_RULES = {
  boost: {
    boost: {
      stackBehavior: "cap",
      stackLimitMultiplier: 2
    }
  },
  shield: {
    shield: {
      stackBehavior: "replace",
      stackLimitMultiplier: 1
    }
  },
  shell: {
    stun: {
      stackBehavior: "replace",
      stackLimitMultiplier: 1
    },
    spinout: {
      stackBehavior: "replace",
      stackLimitMultiplier: 1
    },
    itemHitImmunity: {
      stackBehavior: "cap",
      stackLimitMultiplier: 1.5
    },
    hitFeedback: {
      stackBehavior: "extend",
      stackLimitMultiplier: null
    }
  },
  banana: {
    stun: {
      stackBehavior: "ignore",
      stackLimitMultiplier: 1
    },
    spinout: {
      stackBehavior: "ignore",
      stackLimitMultiplier: 1
    },
    itemHitImmunity: {
      stackBehavior: "cap",
      stackLimitMultiplier: 1.5
    },
    hitFeedback: {
      stackBehavior: "extend",
      stackLimitMultiplier: null
    }
  }
} as const satisfies Record<
  RacerItemEffectRefreshRuleSource,
  Partial<Record<RacerItemEffectType, RacerItemEffectRefreshRule>>
>;

export const RACER_ITEM_EFFECT_STACKING_RULES = {
  boost: RACER_ITEM_EFFECT_REFRESH_RULES.boost.boost.stackBehavior,
  shield: RACER_ITEM_EFFECT_REFRESH_RULES.shield.shield.stackBehavior,
  stun: RACER_ITEM_EFFECT_REFRESH_RULES.shell.stun.stackBehavior,
  spinout: RACER_ITEM_EFFECT_REFRESH_RULES.shell.spinout.stackBehavior,
  itemHitImmunity:
    RACER_ITEM_EFFECT_REFRESH_RULES.shell.itemHitImmunity.stackBehavior,
  hitFeedback: RACER_ITEM_EFFECT_REFRESH_RULES.shell.hitFeedback.stackBehavior,
  lastHitItemType: "replace"
} as const satisfies Record<
  RacerItemEffectType | "lastHitItemType",
  RacerItemEffectStackingRule
>;

export function resolveRacerItemEffectLifecycleRules(options: {
  readonly effectType: RacerItemEffectType;
  readonly sourceItemType?: RacerItemEffectSourceItemType | null;
  readonly durationSeconds: number;
}): RacerItemEffectLifecycleRules {
  const effectType = requireLifecycleEffectType(
    options.effectType,
    "effectType"
  );
  const sourceItemType = requireLifecycleNullableSourceItemType(
    options.sourceItemType ?? null,
    "sourceItemType"
  );
  const durationSeconds = requireLifecycleFiniteNonNegativeNumber(
    options.durationSeconds,
    "durationSeconds"
  );

  assertLifecycleSourceCompatibility(sourceItemType, effectType);

  const refreshRule = resolveRacerItemEffectRefreshRule(
    resolveLifecycleRefreshRuleSource(sourceItemType, effectType),
    effectType,
    durationSeconds
  );

  return {
    stackingRule: refreshRule.stackBehavior,
    stackLimitSeconds: refreshRule.stackLimitSeconds,
    cancellationRule: getDefaultLifecycleCancellationRule(
      effectType,
      refreshRule.stackBehavior
    )
  };
}

export function createRacerItemEffectLifecycleRecord(
  options: RacerItemEffectLifecycleCreateOptions
): RacerItemEffectLifecycleRecord {
  const effectType = requireLifecycleEffectType(
    options.effectType,
    "effectType"
  );
  const sourceItemType = requireLifecycleNullableSourceItemType(
    options.sourceItemType ?? null,
    "sourceItemType"
  );
  const startedAtElapsedSeconds = requireLifecycleFiniteNonNegativeNumber(
    options.startedAtElapsedSeconds,
    "startedAtElapsedSeconds"
  );
  const durationSeconds = requireLifecycleFiniteNonNegativeNumber(
    options.durationSeconds,
    "durationSeconds"
  );
  const recoveryDurationSeconds = requireLifecycleFiniteNonNegativeNumber(
    options.recoveryDurationSeconds ?? 0,
    "recoveryDurationSeconds"
  );
  const rules = resolveRacerItemEffectLifecycleRules({
    effectType,
    sourceItemType,
    durationSeconds
  });
  const stackingRule =
    options.stackingRule === undefined
      ? rules.stackingRule
      : requireLifecycleStackingRule(options.stackingRule, "stackingRule");
  const stackLimitSeconds =
    options.stackLimitSeconds === undefined
      ? rules.stackLimitSeconds
      : requireLifecycleNullableFiniteNonNegativeNumber(
          options.stackLimitSeconds,
          "stackLimitSeconds"
        );
  const cancellationRule =
    options.cancellationRule === undefined
      ? getDefaultLifecycleCancellationRule(effectType, stackingRule)
      : requireLifecycleCancellationRule(
          options.cancellationRule,
          "cancellationRule"
        );
  const remainingSeconds = requireLifecycleFiniteNonNegativeNumber(
    options.remainingSeconds ?? durationSeconds,
    "remainingSeconds"
  );
  const recoveryRemainingSeconds = requireLifecycleFiniteNonNegativeNumber(
    options.recoveryRemainingSeconds ?? 0,
    "recoveryRemainingSeconds"
  );
  const immunityWindowSeconds = requireLifecycleFiniteNonNegativeNumber(
    options.immunityWindowSeconds ?? 0,
    "immunityWindowSeconds"
  );
  const immunityRemainingSeconds = requireLifecycleFiniteNonNegativeNumber(
    options.immunityRemainingSeconds ?? 0,
    "immunityRemainingSeconds"
  );
  const cancelledByEffectId = requireLifecycleNullableNonEmptyText(
    options.cancelledByEffectId ?? null,
    "cancelledByEffectId"
  );
  const cancelledAtElapsedSeconds =
    requireLifecycleNullableFiniteNonNegativeNumber(
      options.cancelledAtElapsedSeconds ?? null,
      "cancelledAtElapsedSeconds"
    );
  const phase = requireLifecyclePhase(
    options.phase ??
      inferLifecyclePhase(
        remainingSeconds,
        recoveryRemainingSeconds,
        cancelledAtElapsedSeconds
      ),
    "phase"
  );

  assertLifecycleSourceCompatibility(sourceItemType, effectType);
  assertLifecycleCancellationState(
    phase,
    cancelledByEffectId,
    cancelledAtElapsedSeconds
  );
  assertLifecycleTimerState(
    phase,
    durationSeconds,
    remainingSeconds,
    recoveryDurationSeconds,
    recoveryRemainingSeconds,
    immunityWindowSeconds,
    immunityRemainingSeconds
  );

  return {
    protocol: RACER_ITEM_EFFECT_LIFECYCLE_PROTOCOL,
    version: RACER_ITEM_EFFECT_LIFECYCLE_VERSION,
    type: RACER_ITEM_EFFECT_LIFECYCLE_RECORD_TYPE,
    effectId: requireLifecycleNonEmptyText(options.effectId, "effectId"),
    effectType,
    sourceItemType,
    sourceItemId: requireLifecycleNullableNonEmptyText(
      options.sourceItemId ?? null,
      "sourceItemId"
    ),
    sourceRacerId: requireLifecycleNonEmptyText(
      options.sourceRacerId,
      "sourceRacerId"
    ),
    targetRacerId: requireLifecycleNonEmptyText(
      options.targetRacerId,
      "targetRacerId"
    ),
    startedAtTick: requireLifecycleWholeNumber(
      options.startedAtTick,
      "startedAtTick"
    ),
    startedAtElapsedSeconds,
    durationSeconds,
    expiresAtElapsedSeconds: startedAtElapsedSeconds + durationSeconds,
    phase,
    remainingSeconds,
    recoveryDurationSeconds,
    recoveryRemainingSeconds,
    immunityWindowSeconds,
    immunityRemainingSeconds,
    stackingRule,
    stackLimitSeconds,
    cancellationRule,
    cancelledByEffectId,
    cancelledAtElapsedSeconds,
    sequence: requireLifecycleWholeNumber(options.sequence ?? 0, "sequence")
  };
}

export function serializeRacerItemEffectLifecycleRecord(
  record: RacerItemEffectLifecycleRecord
): string {
  return JSON.stringify(createRacerItemEffectLifecycleRecord(record));
}

export function deserializeRacerItemEffectLifecycleRecord(
  payload: unknown
): RacerItemEffectLifecycleRecord {
  if (typeof payload !== "string") {
    throw new RacerItemEffectLifecycleError(
      "Item effect lifecycle payload must be a string."
    );
  }

  if (
    getLifecycleUtf8ByteLength(payload) >
    MAX_RACER_ITEM_EFFECT_LIFECYCLE_PAYLOAD_BYTES
  ) {
    throw new RacerItemEffectLifecycleError(
      "Item effect lifecycle payload exceeds the packet size limit."
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new RacerItemEffectLifecycleError(
      "Item effect lifecycle payload is not valid JSON."
    );
  }

  if (!isLifecycleRecord(parsed)) {
    throw new RacerItemEffectLifecycleError(
      "Item effect lifecycle payload must be an object."
    );
  }

  if (parsed.protocol !== RACER_ITEM_EFFECT_LIFECYCLE_PROTOCOL) {
    throw new RacerItemEffectLifecycleError(
      "Item effect lifecycle protocol mismatch."
    );
  }

  if (parsed.version !== RACER_ITEM_EFFECT_LIFECYCLE_VERSION) {
    throw new RacerItemEffectLifecycleError(
      "Item effect lifecycle version mismatch."
    );
  }

  if (parsed.type !== RACER_ITEM_EFFECT_LIFECYCLE_RECORD_TYPE) {
    throw new RacerItemEffectLifecycleError(
      "Item effect lifecycle record type mismatch."
    );
  }

  return createRacerItemEffectLifecycleRecord({
    effectId: requireLifecycleStringField(parsed, "effectId"),
    effectType: requireLifecycleEffectTypeField(parsed, "effectType"),
    sourceItemType: requireLifecycleNullableSourceItemTypeField(
      parsed,
      "sourceItemType"
    ),
    sourceItemId: requireLifecycleNullableStringField(
      parsed,
      "sourceItemId"
    ),
    sourceRacerId: requireLifecycleStringField(parsed, "sourceRacerId"),
    targetRacerId: requireLifecycleStringField(parsed, "targetRacerId"),
    startedAtTick: requireLifecycleNumberField(parsed, "startedAtTick"),
    startedAtElapsedSeconds: requireLifecycleNumberField(
      parsed,
      "startedAtElapsedSeconds"
    ),
    durationSeconds: requireLifecycleNumberField(parsed, "durationSeconds"),
    phase: requireLifecyclePhaseField(parsed, "phase"),
    remainingSeconds: requireLifecycleNumberField(parsed, "remainingSeconds"),
    recoveryDurationSeconds: requireLifecycleNumberField(
      parsed,
      "recoveryDurationSeconds"
    ),
    recoveryRemainingSeconds: requireLifecycleNumberField(
      parsed,
      "recoveryRemainingSeconds"
    ),
    immunityWindowSeconds: requireLifecycleNumberField(
      parsed,
      "immunityWindowSeconds"
    ),
    immunityRemainingSeconds: requireLifecycleNumberField(
      parsed,
      "immunityRemainingSeconds"
    ),
    stackingRule: requireLifecycleStackingRuleField(parsed, "stackingRule"),
    stackLimitSeconds: requireLifecycleNullableNumberField(
      parsed,
      "stackLimitSeconds"
    ),
    cancellationRule: requireLifecycleCancellationRuleField(
      parsed,
      "cancellationRule"
    ),
    cancelledByEffectId: requireLifecycleNullableStringField(
      parsed,
      "cancelledByEffectId"
    ),
    cancelledAtElapsedSeconds: requireLifecycleNullableNumberField(
      parsed,
      "cancelledAtElapsedSeconds"
    ),
    sequence: requireLifecycleNumberField(parsed, "sequence")
  });
}

export function isRacerItemEffectLifecycleRecordPayload(
  payload: unknown
): payload is string {
  try {
    deserializeRacerItemEffectLifecycleRecord(payload);
    return true;
  } catch {
    return false;
  }
}

export class RacerItemEffectLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RacerItemEffectLifecycleError";
  }
}

export function createInitialRacerItemEffectState(): RacerItemEffectState {
  return {
    boostSeconds: 0,
    shieldSeconds: 0,
    stunSeconds: 0,
    spinoutSeconds: 0,
    spinoutAngularVelocity: 0,
    recoverySeconds: 0,
    recoveryDurationSeconds: 0,
    itemHitImmunitySeconds: 0,
    itemHitImmunityWindowSeconds: 0,
    hitFeedbackSeconds: 0,
    lastHitItemType: null,
    recovering: false,
    timedEffects: {},
    hitSourceImmunitySecondsBySource: {}
  };
}

export function createRacerItemEffectDefinitions(
  durations: RacerItemEffectDurationTable
): readonly RacerItemEffectDefinition[] {
  const boostRule = resolveRacerItemEffectRefreshRule(
    "boost",
    "boost",
    durations.boost.boostSeconds
  );

  return [
    createRacerItemEffectDefinition({
      sourceItemType: "boost",
      effectType: "boost",
      durationSeconds: normalizeDurationSeconds(
        durations.boost.boostSeconds
      ),
      recoveryDurationSeconds: 0,
      stackingRule: boostRule.stackBehavior,
      stackLimitSeconds: boostRule.stackLimitSeconds,
      immunityWindowSeconds: 0
    }),
    ...createHitItemEffectDefinitions("shell", durations.shell),
    ...createHitItemEffectDefinitions("banana", durations.banana)
  ];
}

export function applyRacerBoostItemEffect(
  state: RacerItemEffectState,
  durationSeconds: number
): void {
  const rule = resolveRacerItemEffectRefreshRule(
    "boost",
    "boost",
    durationSeconds
  );
  const refreshRule = withStackLimitAtLeast(
    rule,
    state.timedEffects.boost?.stackLimitSeconds ?? null
  );

  state.boostSeconds = refreshEffectTimerSeconds(
    state.boostSeconds,
    durationSeconds,
    refreshRule
  ).nextSeconds;
  syncTimedItemEffectState(state, {
    sourceItemType: "boost",
    effectType: "boost",
    durationSeconds,
    recoveryDurationSeconds: 0,
    stackBehavior: refreshRule.stackBehavior,
    stackLimitSeconds: refreshRule.stackLimitSeconds,
    immunityWindowSeconds: 0
  });
}

export function applyRacerShieldItemEffect(
  state: RacerItemEffectState,
  durationSeconds: number
): void {
  const rule = resolveRacerItemEffectRefreshRule(
    "shield",
    "shield",
    durationSeconds
  );

  state.shieldSeconds = refreshEffectTimerSeconds(
    state.shieldSeconds,
    durationSeconds,
    rule
  ).nextSeconds;
  syncTimedItemEffectState(state, {
    sourceItemType: null,
    effectType: "shield",
    durationSeconds,
    recoveryDurationSeconds: 0,
    stackBehavior: rule.stackBehavior,
    stackLimitSeconds: rule.stackLimitSeconds,
    immunityWindowSeconds: 0
  });
}

export function applyRacerSpinoutItemEffect(
  state: RacerItemEffectState,
  durationSeconds: number,
  spinoutAngularVelocity = 0,
  sourceItemType: RacerItemHitEffectItemType = "shell"
): RacerSpinoutEffectApplicationResult {
  const incomingSpinoutSeconds = normalizeDurationSeconds(durationSeconds);
  const spinoutRule = resolveRacerItemEffectRefreshRule(
    sourceItemType,
    "spinout",
    incomingSpinoutSeconds
  );
  const spinoutRefresh = refreshEffectTimerSeconds(
    state.spinoutSeconds,
    incomingSpinoutSeconds,
    spinoutRule
  );

  state.spinoutSeconds = spinoutRefresh.nextSeconds;

  if (spinoutRefresh.applied && incomingSpinoutSeconds > 0) {
    state.spinoutAngularVelocity = Number.isFinite(spinoutAngularVelocity)
      ? spinoutAngularVelocity
      : 0;
    state.lastHitItemType = sourceItemType;
  }

  if (state.spinoutSeconds <= 0) {
    state.spinoutAngularVelocity = 0;
  }

  state.recoverySeconds = getRecoveryDurationSeconds(
    state.stunSeconds,
    state.spinoutSeconds
  );

  if (spinoutRefresh.applied) {
    state.recoveryDurationSeconds = state.recoverySeconds;
  }

  state.recovering = isRacerItemRecovering(state);
  syncTimedItemEffectState(state, {
    sourceItemType,
    effectType: "spinout",
    durationSeconds: incomingSpinoutSeconds,
    recoveryDurationSeconds: state.recoveryDurationSeconds,
    stackBehavior: spinoutRule.stackBehavior,
    stackLimitSeconds: spinoutRule.stackLimitSeconds,
    immunityWindowSeconds: state.itemHitImmunityWindowSeconds
  });

  return {
    applied: spinoutRefresh.applied,
    spinoutSeconds: state.spinoutSeconds,
    spinoutAngularVelocity: state.spinoutAngularVelocity,
    recovering: state.recovering
  };
}

export function clearRacerTimedItemEffect(
  state: RacerItemEffectState,
  effectType: RacerItemEffectType
): void {
  switch (effectType) {
    case "boost":
      state.boostSeconds = 0;
      break;
    case "shield":
      state.shieldSeconds = 0;
      break;
    case "stun":
      state.stunSeconds = 0;
      break;
    case "spinout":
      state.spinoutSeconds = 0;
      state.spinoutAngularVelocity = 0;
      break;
    case "itemHitImmunity":
      state.itemHitImmunitySeconds = 0;
      state.itemHitImmunityWindowSeconds = 0;
      break;
    case "hitFeedback":
      state.hitFeedbackSeconds = 0;
      break;
  }

  delete state.timedEffects[effectType];
  state.recoverySeconds = getRecoveryDurationSeconds(
    state.stunSeconds,
    state.spinoutSeconds
  );

  if (state.recoverySeconds <= 0) {
    state.recoveryDurationSeconds = 0;
  }

  if (state.itemHitImmunitySeconds <= 0) {
    state.itemHitImmunityWindowSeconds = 0;
  }

  state.recovering = isRacerItemRecovering(state);

  if (
    state.lastHitItemType !== null &&
    state.hitFeedbackSeconds <= 0 &&
    state.itemHitImmunitySeconds <= 0 &&
    !state.recovering
  ) {
    state.lastHitItemType = null;
  }

  syncAllTimedItemEffectStates(state);
}

export function applyRacerItemHitEffect(
  state: RacerItemEffectState,
  effect: RacerItemHitEffectApplication,
  sourceId: string | null = null
): RacerItemHitEffectApplicationResult {
  const shieldSecondsBeforeHit = normalizeDurationSeconds(state.shieldSeconds);
  const hitSourceId = normalizeItemHitSourceId(effect.sourceId ?? sourceId);

  if (shouldIgnoreRepeatedItemHitEffect(state, effect, hitSourceId)) {
    return {
      applied: false,
      blockedByShield: false,
      shieldConsumed: false,
      shieldSecondsBeforeHit,
      shieldSecondsAfterHit: normalizeDurationSeconds(state.shieldSeconds)
    };
  }

  if (shouldShieldBlockHitEffect(effect, shieldSecondsBeforeHit)) {
    const shieldSecondsAfterHit = normalizeDurationSeconds(
      effect.shieldSecondsAfterHit ?? 0
    );

    state.shieldSeconds = shieldSecondsAfterHit;
    state.recoverySeconds = getRecoveryDurationSeconds(
      state.stunSeconds,
      state.spinoutSeconds
    );
    state.recovering = isRacerItemRecovering(state);
    syncTimedItemEffectState(state, {
      sourceItemType: null,
      effectType: "shield",
      durationSeconds:
        state.timedEffects.shield?.durationSeconds ?? shieldSecondsBeforeHit,
      recoveryDurationSeconds: 0,
      stackBehavior: RACER_ITEM_EFFECT_STACKING_RULES.shield,
      stackLimitSeconds: shieldSecondsAfterHit,
      immunityWindowSeconds: 0
    });

    return {
      applied: false,
      blockedByShield: true,
      shieldConsumed:
        effect.blockedByShield === true ||
        shieldSecondsAfterHit < shieldSecondsBeforeHit,
      shieldSecondsBeforeHit:
        effect.shieldSecondsBeforeHit ?? shieldSecondsBeforeHit,
      shieldSecondsAfterHit
    };
  }

  const incomingStunSeconds = normalizeDurationSeconds(effect.stunSeconds);
  const incomingSpinoutSeconds = normalizeDurationSeconds(
    effect.spinoutSeconds
  );
  const stunRule = resolveRacerItemEffectRefreshRule(
    effect.itemType,
    "stun",
    incomingStunSeconds
  );
  const spinoutRule = resolveRacerItemEffectRefreshRule(
    effect.itemType,
    "spinout",
    incomingSpinoutSeconds
  );
  const immunityRule = withStackLimitAtLeast(
    resolveRacerItemEffectRefreshRule(
      effect.itemType,
      "itemHitImmunity",
      effect.hitImmunitySeconds
    ),
    state.itemHitImmunityWindowSeconds
  );
  const feedbackRule = resolveRacerItemEffectRefreshRule(
    effect.itemType,
    "hitFeedback",
    effect.hitFeedbackSeconds
  );
  const incomingImmunityWindowSeconds = normalizeDurationSeconds(
    effect.hitImmunitySeconds
  );
  const stunRefresh = refreshEffectTimerSeconds(
    state.stunSeconds,
    incomingStunSeconds,
    stunRule
  );
  const spinoutRefresh = refreshEffectTimerSeconds(
    state.spinoutSeconds,
    incomingSpinoutSeconds,
    spinoutRule
  );
  const immunityRefresh = refreshEffectTimerSeconds(
    state.itemHitImmunitySeconds,
    effect.hitImmunitySeconds,
    immunityRule
  );
  const feedbackRefresh = refreshEffectTimerSeconds(
    state.hitFeedbackSeconds,
    effect.hitFeedbackSeconds,
    feedbackRule
  );

  state.stunSeconds = stunRefresh.nextSeconds;
  state.spinoutSeconds = spinoutRefresh.nextSeconds;
  state.itemHitImmunitySeconds = immunityRefresh.nextSeconds;
  state.hitFeedbackSeconds = feedbackRefresh.nextSeconds;
  state.recoverySeconds = getRecoveryDurationSeconds(
    state.stunSeconds,
    state.spinoutSeconds
  );

  if (stunRefresh.applied || spinoutRefresh.applied) {
    state.recoveryDurationSeconds = state.recoverySeconds;
  }

  if (immunityRefresh.applied) {
    state.itemHitImmunityWindowSeconds = Math.max(
      state.itemHitImmunityWindowSeconds,
      state.itemHitImmunitySeconds,
      incomingImmunityWindowSeconds,
      immunityRule.stackLimitSeconds ?? 0
    );
  }

  if (spinoutRefresh.applied && incomingSpinoutSeconds > 0) {
    state.spinoutAngularVelocity = Number.isFinite(
      effect.spinoutAngularVelocity
    )
      ? effect.spinoutAngularVelocity
      : 0;
  }

  if (
    stunRefresh.applied ||
    spinoutRefresh.applied ||
    immunityRefresh.applied ||
    feedbackRefresh.applied
  ) {
    state.lastHitItemType = effect.itemType;
  }

  state.recovering = isRacerItemRecovering(state);
  syncHitTimedItemEffectStates(state, effect.itemType, {
    stunSeconds: incomingStunSeconds,
    spinoutSeconds: incomingSpinoutSeconds,
    itemHitImmunitySeconds: incomingImmunityWindowSeconds,
    hitFeedbackSeconds: effect.hitFeedbackSeconds
  });

  const applied =
    stunRefresh.applied ||
    spinoutRefresh.applied ||
    immunityRefresh.applied ||
    feedbackRefresh.applied;

  if (applied) {
    refreshItemHitSourceImmunity(
      state,
      hitSourceId,
      incomingImmunityWindowSeconds
    );
  }

  return {
    applied,
    blockedByShield: false,
    shieldConsumed: false,
    shieldSecondsBeforeHit,
    shieldSecondsAfterHit: normalizeDurationSeconds(state.shieldSeconds)
  };
}

export function updateRacerItemEffectTimers(
  state: RacerItemEffectState,
  deltaSeconds: number
): RacerItemEffectExpirationResult {
  const elapsedSeconds = normalizeDurationSeconds(deltaSeconds);
  const expiredEffectTypes: RacerItemEffectType[] = [];

  applyActiveTimedItemEffects(state);

  state.boostSeconds = decayEffectTimer(
    state.boostSeconds,
    elapsedSeconds,
    "boost",
    expiredEffectTypes
  );
  state.shieldSeconds = decayEffectTimer(
    state.shieldSeconds,
    elapsedSeconds,
    "shield",
    expiredEffectTypes
  );
  state.stunSeconds = decayEffectTimer(
    state.stunSeconds,
    elapsedSeconds,
    "stun",
    expiredEffectTypes
  );
  state.spinoutSeconds = decayEffectTimer(
    state.spinoutSeconds,
    elapsedSeconds,
    "spinout",
    expiredEffectTypes
  );
  state.itemHitImmunitySeconds = decayEffectTimer(
    state.itemHitImmunitySeconds,
    elapsedSeconds,
    "itemHitImmunity",
    expiredEffectTypes
  );
  state.hitFeedbackSeconds = decayEffectTimer(
    state.hitFeedbackSeconds,
    elapsedSeconds,
    "hitFeedback",
    expiredEffectTypes
  );
  decayItemHitSourceImmunityTimers(state, elapsedSeconds);

  if (state.spinoutSeconds <= 0) {
    state.spinoutAngularVelocity = 0;
  }

  state.recoverySeconds = getRecoveryDurationSeconds(
    state.stunSeconds,
    state.spinoutSeconds
  );

  if (state.recoverySeconds <= 0) {
    state.recoveryDurationSeconds = 0;
  }

  if (state.itemHitImmunitySeconds <= 0) {
    state.itemHitImmunityWindowSeconds = 0;
  }

  state.recovering = isRacerItemRecovering(state);
  syncAllTimedItemEffectStates(state);

  const activeEffectTypes = getTimedEffectTypesInPhase(state, "active");
  const recoveryEffectTypes = getTimedEffectTypesInPhase(state, "recovery");
  const transitionedToRecoveryEffectTypes = expiredEffectTypes.filter(
    (effectType) => state.timedEffects[effectType]?.phase === "recovery"
  );
  const shouldClearLastHitItemType =
    state.lastHitItemType !== null &&
    state.hitFeedbackSeconds <= 0 &&
    state.itemHitImmunitySeconds <= 0 &&
    !state.recovering;

  if (shouldClearLastHitItemType) {
    state.lastHitItemType = null;
  }

  return {
    expiredEffectTypes,
    activeEffectTypes,
    recoveryEffectTypes,
    transitionedToRecoveryEffectTypes,
    clearedLastHitItemType: shouldClearLastHitItemType,
    recovering: state.recovering
  };
}

export function isRacerItemRecovering(
  state: Pick<RacerItemEffectState, "stunSeconds" | "spinoutSeconds">
): boolean {
  return state.stunSeconds > 0 || state.spinoutSeconds > 0;
}

function createTimedEffectReconciliationSnapshots(
  state: RacerItemEffectState
): RacerTimedItemEffectReconciliationSnapshot[] {
  return RACER_ITEM_EFFECT_TYPES.flatMap((effectType) => {
    const effect = state.timedEffects[effectType];

    if (effect === undefined) {
      return [];
    }

    return [normalizeTimedEffectReconciliationSnapshot(effect)];
  });
}

function createHitSourceImmunityReconciliationSnapshots(
  state: RacerItemEffectState
): RacerItemHitSourceImmunityReconciliationSnapshot[] {
  return Object.entries(state.hitSourceImmunitySecondsBySource)
    .map(([sourceId, remainingSeconds]) => ({
      sourceId: sourceId.trim(),
      remainingSeconds: normalizeDurationSeconds(remainingSeconds)
    }))
    .filter(
      (immunity) =>
        immunity.sourceId.length > 0 && immunity.remainingSeconds > 0
    )
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
}

function normalizeRacerItemEffectReconciliationState(
  reconciliation: RacerItemEffectReconciliationState
): RacerItemEffectReconciliationState {
  const boostSeconds = normalizeDurationSeconds(reconciliation.boostSeconds);
  const shieldSeconds = normalizeDurationSeconds(reconciliation.shieldSeconds);
  const stunSeconds = normalizeDurationSeconds(reconciliation.stunSeconds);
  const spinoutSeconds = normalizeDurationSeconds(reconciliation.spinoutSeconds);
  const itemHitImmunitySeconds = normalizeDurationSeconds(
    reconciliation.itemHitImmunitySeconds
  );
  const hitFeedbackSeconds = normalizeDurationSeconds(
    reconciliation.hitFeedbackSeconds
  );
  const recoverySeconds = normalizeDurationSeconds(
    reconciliation.recoverySeconds
  );
  const recoveryDurationSeconds = Math.max(
    normalizeDurationSeconds(reconciliation.recoveryDurationSeconds),
    recoverySeconds
  );
  const itemHitImmunityWindowSeconds = Math.max(
    normalizeDurationSeconds(reconciliation.itemHitImmunityWindowSeconds),
    itemHitImmunitySeconds
  );
  const timedEffects = reconciliation.timedEffects
    .map(normalizeTimedEffectReconciliationSnapshot)
    .filter(
      (effect) =>
        effect.remainingSeconds > 0 ||
        effect.recoverySeconds > 0 ||
        effect.immunityRemainingSeconds > 0
    );
  const hitSourceImmunities = reconciliation.hitSourceImmunities
    .map(normalizeHitSourceImmunityReconciliationSnapshot)
    .filter(
      (immunity) =>
        immunity.sourceId.length > 0 && immunity.remainingSeconds > 0
    )
    .sort((left, right) => left.sourceId.localeCompare(right.sourceId));

  return {
    boostSeconds,
    shieldSeconds,
    stunSeconds,
    spinoutSeconds,
    spinoutAngularVelocity:
      spinoutSeconds > 0 &&
      Number.isFinite(reconciliation.spinoutAngularVelocity)
        ? reconciliation.spinoutAngularVelocity
        : 0,
    recoverySeconds,
    recoveryDurationSeconds,
    itemHitImmunitySeconds,
    itemHitImmunityWindowSeconds,
    hitFeedbackSeconds,
    lastHitItemType: normalizeReconciliationHitItemType(
      reconciliation.lastHitItemType
    ),
    recovering: isRacerItemRecovering({
      stunSeconds,
      spinoutSeconds
    }),
    timedEffects,
    hitSourceImmunities
  };
}

function normalizeTimedEffectReconciliationSnapshot(
  effect: RacerTimedItemEffectReconciliationSnapshot
): RacerTimedItemEffectReconciliationSnapshot {
  const effectType = normalizeReconciliationEffectType(effect.effectType);
  const remainingSeconds = normalizeDurationSeconds(effect.remainingSeconds);
  const recoverySeconds = normalizeDurationSeconds(effect.recoverySeconds);
  const immunityRemainingSeconds = normalizeDurationSeconds(
    effect.immunityRemainingSeconds
  );
  const durationSeconds = Math.max(
    normalizeDurationSeconds(effect.durationSeconds),
    remainingSeconds
  );
  const recoveryDurationSeconds = Math.max(
    normalizeDurationSeconds(effect.recoveryDurationSeconds),
    recoverySeconds
  );
  const immunityWindowSeconds = Math.max(
    normalizeDurationSeconds(effect.immunityWindowSeconds),
    immunityRemainingSeconds
  );

  return {
    sourceItemType: normalizeTimedEffectSourceItemType(
      effectType,
      effect.sourceItemType
    ),
    effectType,
    phase: remainingSeconds > 0 ? "active" : "recovery",
    durationSeconds,
    remainingSeconds,
    recoveryDurationSeconds,
    recoverySeconds,
    stackBehavior: normalizeReconciliationStackBehavior(
      effect.stackBehavior,
      effectType
    ),
    stackLimitSeconds:
      effect.stackLimitSeconds === null
        ? null
        : normalizeDurationSeconds(effect.stackLimitSeconds),
    immunityWindowSeconds,
    immunityRemainingSeconds
  };
}

function normalizeHitSourceImmunityReconciliationSnapshot(
  immunity: RacerItemHitSourceImmunityReconciliationSnapshot
): RacerItemHitSourceImmunityReconciliationSnapshot {
  return {
    sourceId: immunity.sourceId.trim(),
    remainingSeconds: normalizeDurationSeconds(immunity.remainingSeconds)
  };
}

function normalizeReconciliationEffectType(
  effectType: RacerItemEffectType
): RacerItemEffectType {
  return (RACER_ITEM_EFFECT_TYPES as readonly string[]).includes(effectType)
    ? effectType
    : "hitFeedback";
}

function normalizeTimedEffectSourceItemType(
  effectType: RacerItemEffectType,
  sourceItemType: RacerItemEffectSourceItemType | null
): RacerItemEffectSourceItemType | null {
  if (effectType === "boost") {
    return "boost";
  }

  if (effectType === "shield") {
    return null;
  }

  return sourceItemType === "banana" ? "banana" : "shell";
}

function normalizeReconciliationStackBehavior(
  stackBehavior: RacerItemEffectStackBehavior,
  effectType: RacerItemEffectType
): RacerItemEffectStackBehavior {
  switch (stackBehavior) {
    case "replace":
    case "extend":
    case "ignore":
    case "cap":
      return stackBehavior;
  }

  return RACER_ITEM_EFFECT_STACKING_RULES[effectType];
}

function normalizeReconciliationHitItemType(
  itemType: RacerItemHitEffectItemType | null
): RacerItemHitEffectItemType | null {
  return itemType === "shell" || itemType === "banana" ? itemType : null;
}

export function createRacerItemEffectReconciliationState(
  state: RacerItemEffectState
): RacerItemEffectReconciliationState {
  return normalizeRacerItemEffectReconciliationState({
    boostSeconds: state.boostSeconds,
    shieldSeconds: state.shieldSeconds,
    stunSeconds: state.stunSeconds,
    spinoutSeconds: state.spinoutSeconds,
    spinoutAngularVelocity: state.spinoutAngularVelocity,
    recoverySeconds: state.recoverySeconds,
    recoveryDurationSeconds: state.recoveryDurationSeconds,
    itemHitImmunitySeconds: state.itemHitImmunitySeconds,
    itemHitImmunityWindowSeconds: state.itemHitImmunityWindowSeconds,
    hitFeedbackSeconds: state.hitFeedbackSeconds,
    lastHitItemType: state.lastHitItemType,
    recovering: state.recovering,
    timedEffects: createTimedEffectReconciliationSnapshots(state),
    hitSourceImmunities: createHitSourceImmunityReconciliationSnapshots(state)
  });
}

export function applyRacerItemEffectReconciliationState(
  state: RacerItemEffectState,
  reconciliation: RacerItemEffectReconciliationState
): void {
  const normalized =
    normalizeRacerItemEffectReconciliationState(reconciliation);

  state.boostSeconds = normalized.boostSeconds;
  state.shieldSeconds = normalized.shieldSeconds;
  state.stunSeconds = normalized.stunSeconds;
  state.spinoutSeconds = normalized.spinoutSeconds;
  state.spinoutAngularVelocity =
    normalized.spinoutSeconds > 0 ? normalized.spinoutAngularVelocity : 0;
  state.recoverySeconds = normalized.recoverySeconds;
  state.recoveryDurationSeconds = normalized.recoveryDurationSeconds;
  state.itemHitImmunitySeconds = normalized.itemHitImmunitySeconds;
  state.itemHitImmunityWindowSeconds =
    normalized.itemHitImmunityWindowSeconds;
  state.hitFeedbackSeconds = normalized.hitFeedbackSeconds;
  state.lastHitItemType = normalized.lastHitItemType;
  state.recovering = normalized.recovering;

  for (const effectType of RACER_ITEM_EFFECT_TYPES) {
    delete state.timedEffects[effectType];
  }

  for (const effect of normalized.timedEffects) {
    state.timedEffects[effect.effectType] = {
      sourceItemType: effect.sourceItemType,
      effectType: effect.effectType,
      phase: effect.phase,
      durationSeconds: effect.durationSeconds,
      remainingSeconds: effect.remainingSeconds,
      recoveryDurationSeconds: effect.recoveryDurationSeconds,
      recoverySeconds: effect.recoverySeconds,
      stackBehavior: effect.stackBehavior,
      stackLimitSeconds: effect.stackLimitSeconds,
      immunityWindowSeconds: effect.immunityWindowSeconds,
      immunityRemainingSeconds: effect.immunityRemainingSeconds
    };
  }

  for (const sourceId of Object.keys(state.hitSourceImmunitySecondsBySource)) {
    delete state.hitSourceImmunitySecondsBySource[sourceId];
  }

  for (const immunity of normalized.hitSourceImmunities) {
    state.hitSourceImmunitySecondsBySource[immunity.sourceId] =
      immunity.remainingSeconds;
  }
}

export function isRacerShieldActive(
  state: Pick<RacerItemEffectState, "shieldSeconds">
): boolean {
  return normalizeDurationSeconds(state.shieldSeconds) > 0;
}

function shouldShieldBlockHitEffect(
  effect: RacerItemHitEffectApplication,
  shieldSecondsBeforeHit: number
): boolean {
  if (effect.blockedByShield === true) {
    return true;
  }

  if (effect.blockedByShield === false || shieldSecondsBeforeHit <= 0) {
    return false;
  }

  return isNegativeRacerItemHitEffect(effect);
}

function isNegativeRacerItemHitEffect(
  effect: RacerItemHitEffectApplication
): boolean {
  return (
    normalizeDurationSeconds(effect.stunSeconds) > 0 ||
    normalizeDurationSeconds(effect.spinoutSeconds) > 0 ||
    Math.abs(
      Number.isFinite(effect.spinoutAngularVelocity)
        ? effect.spinoutAngularVelocity
        : 0
    ) > 0
  );
}

function shouldIgnoreRepeatedItemHitEffect(
  state: RacerItemEffectState,
  effect: RacerItemHitEffectApplication,
  sourceId: string | null
): boolean {
  if (!isNegativeRacerItemHitEffect(effect)) {
    return false;
  }

  if (isItemHitSourceImmune(state, sourceId)) {
    return true;
  }

  if (normalizeDurationSeconds(state.itemHitImmunitySeconds) > 0) {
    return true;
  }

  if (isActiveShellSpinoutDuplicate(state, effect)) {
    return true;
  }

  if (effect.itemType !== "banana") {
    return false;
  }

  return (
    normalizeDurationSeconds(state.stunSeconds) > 0 ||
    normalizeDurationSeconds(state.spinoutSeconds) > 0 ||
    normalizeDurationSeconds(state.itemHitImmunitySeconds) > 0
  );
}

function isActiveShellSpinoutDuplicate(
  state: RacerItemEffectState,
  effect: RacerItemHitEffectApplication
): boolean {
  return (
    effect.itemType === "shell" &&
    normalizeDurationSeconds(effect.spinoutSeconds) > 0 &&
    normalizeDurationSeconds(state.spinoutSeconds) > 0
  );
}

function normalizeItemHitSourceId(
  sourceId: string | null | undefined
): string | null {
  if (sourceId === null || sourceId === undefined) {
    return null;
  }

  const normalizedSourceId = sourceId.trim();

  return normalizedSourceId.length > 0 ? normalizedSourceId : null;
}

function isItemHitSourceImmune(
  state: RacerItemEffectState,
  sourceId: string | null
): boolean {
  if (sourceId === null) {
    return false;
  }

  return (
    normalizeDurationSeconds(
      state.hitSourceImmunitySecondsBySource[sourceId] ?? 0
    ) > 0
  );
}

function refreshItemHitSourceImmunity(
  state: RacerItemEffectState,
  sourceId: string | null,
  immunityWindowSeconds: number
): void {
  if (sourceId === null) {
    return;
  }

  const windowSeconds = normalizeDurationSeconds(immunityWindowSeconds);

  if (windowSeconds <= 0) {
    return;
  }

  state.hitSourceImmunitySecondsBySource[sourceId] = Math.max(
    normalizeDurationSeconds(
      state.hitSourceImmunitySecondsBySource[sourceId] ?? 0
    ),
    windowSeconds
  );
}

function decayItemHitSourceImmunityTimers(
  state: RacerItemEffectState,
  elapsedSeconds: number
): void {
  for (const sourceId of Object.keys(state.hitSourceImmunitySecondsBySource)) {
    const nextSeconds = Math.max(
      0,
      normalizeDurationSeconds(
        state.hitSourceImmunitySecondsBySource[sourceId] ?? 0
      ) - elapsedSeconds
    );

    if (nextSeconds <= 0) {
      delete state.hitSourceImmunitySecondsBySource[sourceId];
    } else {
      state.hitSourceImmunitySecondsBySource[sourceId] = nextSeconds;
    }
  }
}

function createHitItemEffectDefinitions(
  sourceItemType: RacerItemHitEffectItemType,
  durations: RacerItemHitEffectDurationConfig
): readonly RacerItemEffectDefinition[] {
  const recoveryDurationSeconds = getRecoveryDurationSeconds(
    durations.stunSeconds,
    durations.spinoutSeconds
  );
  const immunityWindowSeconds = normalizeDurationSeconds(
    durations.itemHitImmunitySeconds
  );

  return [
    createRacerItemEffectDefinition({
      sourceItemType,
      effectType: "stun",
      durationSeconds: normalizeDurationSeconds(durations.stunSeconds),
      recoveryDurationSeconds,
      stackingRule: resolveRacerItemEffectRefreshRule(
        sourceItemType,
        "stun",
        durations.stunSeconds
      ).stackBehavior,
      immunityWindowSeconds
    }),
    createRacerItemEffectDefinition({
      sourceItemType,
      effectType: "spinout",
      durationSeconds: normalizeDurationSeconds(durations.spinoutSeconds),
      recoveryDurationSeconds,
      stackingRule: resolveRacerItemEffectRefreshRule(
        sourceItemType,
        "spinout",
        durations.spinoutSeconds
      ).stackBehavior,
      immunityWindowSeconds
    }),
    createRacerItemEffectDefinition({
      sourceItemType,
      effectType: "itemHitImmunity",
      durationSeconds: normalizeDurationSeconds(
        durations.itemHitImmunitySeconds
      ),
      recoveryDurationSeconds: 0,
      stackingRule: resolveRacerItemEffectRefreshRule(
        sourceItemType,
        "itemHitImmunity",
        durations.itemHitImmunitySeconds
      ).stackBehavior,
      immunityWindowSeconds
    }),
    createRacerItemEffectDefinition({
      sourceItemType,
      effectType: "hitFeedback",
      durationSeconds: normalizeDurationSeconds(durations.hitFeedbackSeconds),
      recoveryDurationSeconds: 0,
      stackingRule: resolveRacerItemEffectRefreshRule(
        sourceItemType,
        "hitFeedback",
        durations.hitFeedbackSeconds
      ).stackBehavior,
      immunityWindowSeconds
    })
  ];
}

function createRacerItemEffectDefinition(
  metadata: Omit<
    RacerTimedItemEffectMetadata,
    "stackBehavior" | "stackLimitSeconds"
  > & {
    readonly stackLimitSeconds?: number | null;
  }
): RacerItemEffectDefinition {
  const refreshRule = resolveRacerItemEffectRefreshRule(
    metadata.sourceItemType,
    metadata.effectType,
    metadata.durationSeconds
  );

  return {
    ...metadata,
    durationSeconds: normalizeDurationSeconds(metadata.durationSeconds),
    recoveryDurationSeconds: normalizeDurationSeconds(
      metadata.recoveryDurationSeconds
    ),
    stackBehavior: refreshRule.stackBehavior,
    stackingRule: refreshRule.stackBehavior,
    stackLimitSeconds:
      metadata.stackLimitSeconds ?? refreshRule.stackLimitSeconds,
    immunityWindowSeconds: normalizeDurationSeconds(
      metadata.immunityWindowSeconds
    )
  };
}

function syncHitTimedItemEffectStates(
  state: RacerItemEffectState,
  sourceItemType: RacerItemHitEffectItemType,
  durations: RacerItemHitEffectDurationConfig
): void {
  const stunRule = resolveRacerItemEffectRefreshRule(
    sourceItemType,
    "stun",
    durations.stunSeconds
  );
  const spinoutRule = resolveRacerItemEffectRefreshRule(
    sourceItemType,
    "spinout",
    durations.spinoutSeconds
  );
  const immunityRule = resolveRacerItemEffectRefreshRule(
    sourceItemType,
    "itemHitImmunity",
    durations.itemHitImmunitySeconds
  );
  const feedbackRule = resolveRacerItemEffectRefreshRule(
    sourceItemType,
    "hitFeedback",
    durations.hitFeedbackSeconds
  );

  syncTimedItemEffectState(state, {
    sourceItemType,
    effectType: "stun",
    durationSeconds: durations.stunSeconds,
    recoveryDurationSeconds: state.recoveryDurationSeconds,
    stackBehavior: stunRule.stackBehavior,
    stackLimitSeconds: stunRule.stackLimitSeconds,
    immunityWindowSeconds: state.itemHitImmunityWindowSeconds
  });
  syncTimedItemEffectState(state, {
    sourceItemType,
    effectType: "spinout",
    durationSeconds: durations.spinoutSeconds,
    recoveryDurationSeconds: state.recoveryDurationSeconds,
    stackBehavior: spinoutRule.stackBehavior,
    stackLimitSeconds: spinoutRule.stackLimitSeconds,
    immunityWindowSeconds: state.itemHitImmunityWindowSeconds
  });
  syncTimedItemEffectState(state, {
    sourceItemType,
    effectType: "itemHitImmunity",
    durationSeconds: durations.itemHitImmunitySeconds,
    recoveryDurationSeconds: 0,
    stackBehavior: immunityRule.stackBehavior,
    stackLimitSeconds: immunityRule.stackLimitSeconds,
    immunityWindowSeconds: state.itemHitImmunityWindowSeconds
  });
  syncTimedItemEffectState(state, {
    sourceItemType,
    effectType: "hitFeedback",
    durationSeconds: durations.hitFeedbackSeconds,
    recoveryDurationSeconds: 0,
    stackBehavior: feedbackRule.stackBehavior,
    stackLimitSeconds: feedbackRule.stackLimitSeconds,
    immunityWindowSeconds: state.itemHitImmunityWindowSeconds
  });
}

function syncAllTimedItemEffectStates(state: RacerItemEffectState): void {
  const boostRule = resolveRacerItemEffectRefreshRule(
    "boost",
    "boost",
    state.timedEffects.boost?.durationSeconds ?? state.boostSeconds
  );
  const shieldRule = resolveRacerItemEffectRefreshRule(
    "shield",
    "shield",
    state.timedEffects.shield?.durationSeconds ?? state.shieldSeconds
  );

  syncTimedItemEffectState(state, {
    sourceItemType: "boost",
    effectType: "boost",
    durationSeconds:
      state.timedEffects.boost?.durationSeconds ?? state.boostSeconds,
    recoveryDurationSeconds: 0,
    stackBehavior: boostRule.stackBehavior,
    stackLimitSeconds:
      state.timedEffects.boost?.stackLimitSeconds ??
      boostRule.stackLimitSeconds,
    immunityWindowSeconds: 0
  });
  syncTimedItemEffectState(state, {
    sourceItemType: null,
    effectType: "shield",
    durationSeconds:
      state.timedEffects.shield?.durationSeconds ?? state.shieldSeconds,
    recoveryDurationSeconds: 0,
    stackBehavior: shieldRule.stackBehavior,
    stackLimitSeconds:
      state.timedEffects.shield?.stackLimitSeconds ??
      shieldRule.stackLimitSeconds,
    immunityWindowSeconds: 0
  });
  syncHitTimedItemEffectStates(state, state.lastHitItemType ?? "shell", {
    stunSeconds: state.timedEffects.stun?.durationSeconds ?? state.stunSeconds,
    spinoutSeconds:
      state.timedEffects.spinout?.durationSeconds ?? state.spinoutSeconds,
    itemHitImmunitySeconds:
      state.timedEffects.itemHitImmunity?.durationSeconds ??
      state.itemHitImmunitySeconds,
    hitFeedbackSeconds:
      state.timedEffects.hitFeedback?.durationSeconds ??
      state.hitFeedbackSeconds
  });
}

function syncTimedItemEffectState(
  state: RacerItemEffectState,
  effect: {
    readonly sourceItemType: RacerItemEffectSourceItemType | null;
    readonly effectType: RacerItemEffectType;
    readonly durationSeconds: number;
    readonly recoveryDurationSeconds: number;
    readonly stackBehavior: RacerItemEffectStackBehavior;
    readonly stackLimitSeconds: number | null;
    readonly immunityWindowSeconds: number;
  }
): void {
  const remainingSeconds = getEffectRemainingSeconds(state, effect.effectType);
  const recoverySeconds = getEffectRecoverySeconds(state, effect);
  const previous = state.timedEffects[effect.effectType];
  const shouldCarryPreviousTiming = effect.stackBehavior !== "replace";
  const durationSeconds = normalizeDurationSeconds(effect.durationSeconds);
  const recoveryDurationSeconds = normalizeDurationSeconds(
    effect.recoveryDurationSeconds
  );
  const immunityWindowSeconds = normalizeDurationSeconds(
    effect.immunityWindowSeconds
  );

  if (
    remainingSeconds <= 0 &&
    (recoverySeconds <= 0 || previous === undefined)
  ) {
    delete state.timedEffects[effect.effectType];
    return;
  }

  state.timedEffects[effect.effectType] = {
    sourceItemType: effect.sourceItemType,
    effectType: effect.effectType,
    phase: remainingSeconds > 0 ? "active" : "recovery",
    durationSeconds: shouldCarryPreviousTiming
      ? Math.max(
          durationSeconds,
          previous?.durationSeconds ?? 0,
          remainingSeconds
        )
      : Math.max(durationSeconds, remainingSeconds),
    remainingSeconds,
    recoveryDurationSeconds: shouldCarryPreviousTiming
      ? Math.max(
          recoveryDurationSeconds,
          previous?.recoveryDurationSeconds ?? 0
        )
      : recoveryDurationSeconds,
    recoverySeconds,
    stackBehavior: effect.stackBehavior,
    stackLimitSeconds: effect.stackLimitSeconds,
    immunityWindowSeconds: shouldCarryPreviousTiming
      ? Math.max(immunityWindowSeconds, previous?.immunityWindowSeconds ?? 0)
      : immunityWindowSeconds,
    immunityRemainingSeconds: state.itemHitImmunitySeconds
  };
}

function applyActiveTimedItemEffects(state: RacerItemEffectState): void {
  for (const effect of Object.values(state.timedEffects)) {
    if (effect === undefined) {
      continue;
    }

    const remainingSeconds = normalizeDurationSeconds(effect.remainingSeconds);

    if (remainingSeconds <= 0) {
      continue;
    }

    applyActiveTimedItemEffect(state, effect, remainingSeconds);
  }

  state.recoverySeconds = getRecoveryDurationSeconds(
    state.stunSeconds,
    state.spinoutSeconds
  );
  state.recovering = isRacerItemRecovering(state);
}

function applyActiveTimedItemEffect(
  state: RacerItemEffectState,
  effect: RacerTimedItemEffectState,
  remainingSeconds: number
): void {
  switch (effect.effectType) {
    case "boost":
      state.boostSeconds = stackMaxRemainingSeconds(
        state.boostSeconds,
        remainingSeconds
      );
      break;
    case "shield":
      state.shieldSeconds = stackMaxRemainingSeconds(
        state.shieldSeconds,
        remainingSeconds
      );
      break;
    case "stun":
      state.stunSeconds = stackMaxRemainingSeconds(
        state.stunSeconds,
        remainingSeconds
      );
      break;
    case "spinout":
      state.spinoutSeconds = stackMaxRemainingSeconds(
        state.spinoutSeconds,
        remainingSeconds
      );
      break;
    case "itemHitImmunity":
      state.itemHitImmunitySeconds = stackMaxRemainingSeconds(
        state.itemHitImmunitySeconds,
        remainingSeconds
      );
      break;
    case "hitFeedback":
      state.hitFeedbackSeconds = stackMaxRemainingSeconds(
        state.hitFeedbackSeconds,
        remainingSeconds
      );
      break;
  }

  state.recoveryDurationSeconds = Math.max(
    state.recoveryDurationSeconds,
    normalizeDurationSeconds(effect.recoveryDurationSeconds)
  );
  state.itemHitImmunityWindowSeconds = Math.max(
    state.itemHitImmunityWindowSeconds,
    normalizeDurationSeconds(effect.immunityWindowSeconds)
  );

  if (
    state.lastHitItemType === null &&
    (effect.sourceItemType === "shell" || effect.sourceItemType === "banana")
  ) {
    state.lastHitItemType = effect.sourceItemType;
  }
}

function getEffectRemainingSeconds(
  state: RacerItemEffectState,
  effectType: RacerItemEffectType
): number {
  switch (effectType) {
    case "boost":
      return normalizeDurationSeconds(state.boostSeconds);
    case "shield":
      return normalizeDurationSeconds(state.shieldSeconds);
    case "stun":
      return normalizeDurationSeconds(state.stunSeconds);
    case "spinout":
      return normalizeDurationSeconds(state.spinoutSeconds);
    case "itemHitImmunity":
      return normalizeDurationSeconds(state.itemHitImmunitySeconds);
    case "hitFeedback":
      return normalizeDurationSeconds(state.hitFeedbackSeconds);
  }
}

function getRecoveryDurationSeconds(
  stunSeconds: number,
  spinoutSeconds: number
): number {
  return Math.max(
    normalizeDurationSeconds(stunSeconds),
    normalizeDurationSeconds(spinoutSeconds)
  );
}

function getEffectRecoverySeconds(
  state: RacerItemEffectState,
  effect: Pick<
    RacerTimedItemEffectState,
    "effectType" | "recoveryDurationSeconds"
  >
): number {
  if (normalizeDurationSeconds(effect.recoveryDurationSeconds) <= 0) {
    return 0;
  }

  if (effect.effectType !== "stun" && effect.effectType !== "spinout") {
    return 0;
  }

  return normalizeDurationSeconds(state.recoverySeconds);
}

function getTimedEffectTypesInPhase(
  state: Pick<RacerItemEffectState, "timedEffects">,
  phase: RacerTimedItemEffectPhase
): RacerItemEffectType[] {
  return Object.values(state.timedEffects)
    .filter((effect): effect is RacerTimedItemEffectState => {
      return effect !== undefined && effect.phase === phase;
    })
    .map((effect) => effect.effectType);
}

function stackMaxRemainingSeconds(
  currentSeconds: number,
  incomingSeconds: number
): number {
  return Math.max(
    normalizeDurationSeconds(currentSeconds),
    normalizeDurationSeconds(incomingSeconds)
  );
}

interface ResolvedRacerItemEffectRefreshRule {
  readonly stackBehavior: RacerItemEffectStackBehavior;
  readonly stackLimitSeconds: number | null;
}

interface RacerItemEffectTimerRefreshResult {
  readonly nextSeconds: number;
  readonly applied: boolean;
}

function resolveRacerItemEffectRefreshRule(
  sourceItemType: RacerItemEffectRefreshRuleSource,
  effectType: RacerItemEffectType,
  durationSeconds = 0
): ResolvedRacerItemEffectRefreshRule {
  const sourceRules = RACER_ITEM_EFFECT_REFRESH_RULES[
    sourceItemType
  ] as Partial<Record<RacerItemEffectType, RacerItemEffectRefreshRule>>;
  const shellRules = RACER_ITEM_EFFECT_REFRESH_RULES.shell as Partial<
    Record<RacerItemEffectType, RacerItemEffectRefreshRule>
  >;
  const rule = sourceRules[effectType] ?? shellRules[effectType] ?? null;

  if (rule === null) {
    return {
      stackBehavior: RACER_ITEM_EFFECT_STACKING_RULES[effectType],
      stackLimitSeconds: null
    };
  }

  return {
    stackBehavior: rule.stackBehavior,
    stackLimitSeconds: resolveStackLimitSeconds(rule, durationSeconds)
  };
}

function refreshEffectTimerSeconds(
  currentSeconds: number,
  incomingSeconds: number,
  rule: ResolvedRacerItemEffectRefreshRule
): RacerItemEffectTimerRefreshResult {
  const current = normalizeDurationSeconds(currentSeconds);
  const incoming = normalizeDurationSeconds(incomingSeconds);

  if (incoming <= 0) {
    return {
      nextSeconds: current,
      applied: false
    };
  }

  switch (rule.stackBehavior) {
    case "replace":
      return {
        nextSeconds: incoming,
        applied: true
      };
    case "extend":
      return {
        nextSeconds: current + incoming,
        applied: true
      };
    case "ignore":
      return current > 0
        ? {
            nextSeconds: current,
            applied: false
          }
        : {
            nextSeconds: incoming,
            applied: true
          };
    case "cap": {
      const extendedSeconds = current + incoming;
      const cappedSeconds =
        rule.stackLimitSeconds === null
          ? extendedSeconds
          : Math.max(
              current,
              Math.min(extendedSeconds, rule.stackLimitSeconds)
            );

      return {
        nextSeconds: cappedSeconds,
        applied: cappedSeconds > current
      };
    }
  }
}

function withStackLimitAtLeast(
  rule: ResolvedRacerItemEffectRefreshRule,
  minimumStackLimitSeconds: number | null
): ResolvedRacerItemEffectRefreshRule {
  const minimum = normalizeDurationSeconds(minimumStackLimitSeconds ?? 0);

  if (minimum <= 0) {
    return rule;
  }

  return {
    ...rule,
    stackLimitSeconds:
      rule.stackLimitSeconds === null
        ? minimum
        : Math.max(rule.stackLimitSeconds, minimum)
  };
}

function resolveStackLimitSeconds(
  rule: RacerItemEffectRefreshRule,
  durationSeconds: number
): number | null {
  if (rule.stackLimitMultiplier === null) {
    return null;
  }

  return (
    normalizeDurationSeconds(durationSeconds) *
    Math.max(0, rule.stackLimitMultiplier)
  );
}

function decayEffectTimer(
  currentSeconds: number,
  elapsedSeconds: number,
  effectType: RacerItemEffectType,
  expiredEffectTypes: RacerItemEffectType[]
): number {
  const current = normalizeDurationSeconds(currentSeconds);
  const next = Math.max(0, current - elapsedSeconds);

  if (current > 0 && next <= 0) {
    expiredEffectTypes.push(effectType);
  }

  return next;
}

function resolveLifecycleRefreshRuleSource(
  sourceItemType: RacerItemEffectSourceItemType | null,
  effectType: RacerItemEffectType
): RacerItemEffectRefreshRuleSource {
  if (effectType === "shield") {
    return "shield";
  }

  if (sourceItemType === null) {
    throw new RacerItemEffectLifecycleError(
      `Item effect lifecycle requires a source item type for ${effectType}.`
    );
  }

  return sourceItemType;
}

function getDefaultLifecycleCancellationRule(
  effectType: RacerItemEffectType,
  stackingRule: RacerItemEffectStackingRule
): RacerItemEffectCancellationRule {
  if (effectType === "shield") {
    return "block-negative-hit";
  }

  switch (stackingRule) {
    case "replace":
      return "replace-existing";
    case "ignore":
      return "ignore-incoming";
    case "cap":
    case "extend":
      return "none";
  }
}

function inferLifecyclePhase(
  remainingSeconds: number,
  recoveryRemainingSeconds: number,
  cancelledAtElapsedSeconds: number | null
): RacerItemEffectLifecyclePhase {
  if (cancelledAtElapsedSeconds !== null) {
    return "cancelled";
  }

  if (remainingSeconds > 0) {
    return "active";
  }

  return recoveryRemainingSeconds > 0 ? "recovery" : "expired";
}

function assertLifecycleSourceCompatibility(
  sourceItemType: RacerItemEffectSourceItemType | null,
  effectType: RacerItemEffectType
): void {
  switch (effectType) {
    case "boost":
      if (sourceItemType !== "boost") {
        throw new RacerItemEffectLifecycleError(
          "Boost lifecycle effects must use boost as the source item type."
        );
      }
      return;
    case "shield":
      if (sourceItemType !== null) {
        throw new RacerItemEffectLifecycleError(
          "Shield lifecycle effects must use a null source item type."
        );
      }
      return;
    case "stun":
    case "spinout":
    case "itemHitImmunity":
    case "hitFeedback":
      if (sourceItemType !== "shell" && sourceItemType !== "banana") {
        throw new RacerItemEffectLifecycleError(
          `${effectType} lifecycle effects must come from shell or banana.`
        );
      }
      return;
  }
}

function assertLifecycleCancellationState(
  phase: RacerItemEffectLifecyclePhase,
  cancelledByEffectId: string | null,
  cancelledAtElapsedSeconds: number | null
): void {
  if (phase === "cancelled") {
    if (cancelledAtElapsedSeconds === null) {
      throw new RacerItemEffectLifecycleError(
        "Cancelled lifecycle effects must include a cancellation time."
      );
    }

    return;
  }

  if (cancelledByEffectId !== null || cancelledAtElapsedSeconds !== null) {
    throw new RacerItemEffectLifecycleError(
      "Only cancelled lifecycle effects can include cancellation fields."
    );
  }
}

function assertLifecycleTimerState(
  phase: RacerItemEffectLifecyclePhase,
  durationSeconds: number,
  remainingSeconds: number,
  recoveryDurationSeconds: number,
  recoveryRemainingSeconds: number,
  immunityWindowSeconds: number,
  immunityRemainingSeconds: number
): void {
  if (durationSeconds <= 0) {
    throw new RacerItemEffectLifecycleError(
      "Item effect lifecycle duration must be greater than zero."
    );
  }

  if (
    recoveryDurationSeconds <= 0 &&
    recoveryRemainingSeconds > Number.EPSILON
  ) {
    throw new RacerItemEffectLifecycleError(
      "Recovery remaining seconds require a recovery duration."
    );
  }

  if (
    recoveryDurationSeconds > 0 &&
    recoveryRemainingSeconds - recoveryDurationSeconds > Number.EPSILON
  ) {
    throw new RacerItemEffectLifecycleError(
      "Recovery remaining seconds cannot exceed recovery duration."
    );
  }

  if (immunityRemainingSeconds - immunityWindowSeconds > Number.EPSILON) {
    throw new RacerItemEffectLifecycleError(
      "Immunity remaining seconds cannot exceed the immunity window."
    );
  }

  if (phase === "active" && remainingSeconds <= 0) {
    throw new RacerItemEffectLifecycleError(
      "Active lifecycle effects must have active time remaining."
    );
  }

  if (phase === "recovery" && recoveryRemainingSeconds <= 0) {
    throw new RacerItemEffectLifecycleError(
      "Recovery lifecycle effects must have recovery time remaining."
    );
  }

  if (
    phase === "expired" &&
    (remainingSeconds > 0 || recoveryRemainingSeconds > 0)
  ) {
    throw new RacerItemEffectLifecycleError(
      "Expired lifecycle effects cannot have active or recovery time remaining."
    );
  }
}

function requireLifecycleNonEmptyText(value: unknown, key: string): string {
  if (typeof value !== "string") {
    throw new RacerItemEffectLifecycleError(
      `Item effect lifecycle field must be a string: ${key}.`
    );
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new RacerItemEffectLifecycleError(
      `Item effect lifecycle field cannot be empty: ${key}.`
    );
  }

  return normalized;
}

function requireLifecycleNullableNonEmptyText(
  value: unknown,
  key: string
): string | null {
  if (value === null) {
    return null;
  }

  return requireLifecycleNonEmptyText(value, key);
}

function requireLifecycleFiniteNonNegativeNumber(
  value: unknown,
  key: string
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RacerItemEffectLifecycleError(
      `Item effect lifecycle field must be a finite non-negative number: ${key}.`
    );
  }

  return value;
}

function requireLifecycleNullableFiniteNonNegativeNumber(
  value: unknown,
  key: string
): number | null {
  if (value === null) {
    return null;
  }

  return requireLifecycleFiniteNonNegativeNumber(value, key);
}

function requireLifecycleWholeNumber(value: unknown, key: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new RacerItemEffectLifecycleError(
      `Item effect lifecycle field must be a whole number: ${key}.`
    );
  }

  return value;
}

function requireLifecycleEffectType(
  value: unknown,
  key: string
): RacerItemEffectType {
  if (
    typeof value === "string" &&
    (RACER_ITEM_EFFECT_TYPES as readonly string[]).includes(value)
  ) {
    return value as RacerItemEffectType;
  }

  throw new RacerItemEffectLifecycleError(
    `Item effect lifecycle field must be a known effect type: ${key}.`
  );
}

function requireLifecycleNullableSourceItemType(
  value: unknown,
  key: string
): RacerItemEffectSourceItemType | null {
  if (value === null) {
    return null;
  }

  if (
    typeof value === "string" &&
    (RACER_ITEM_EFFECT_SOURCE_ITEM_TYPES as readonly string[]).includes(value)
  ) {
    return value as RacerItemEffectSourceItemType;
  }

  throw new RacerItemEffectLifecycleError(
    `Item effect lifecycle field must be a known source item type: ${key}.`
  );
}

function requireLifecyclePhase(
  value: unknown,
  key: string
): RacerItemEffectLifecyclePhase {
  if (
    typeof value === "string" &&
    (RACER_ITEM_EFFECT_LIFECYCLE_PHASES as readonly string[]).includes(value)
  ) {
    return value as RacerItemEffectLifecyclePhase;
  }

  throw new RacerItemEffectLifecycleError(
    `Item effect lifecycle field must be a known phase: ${key}.`
  );
}

function requireLifecycleStackingRule(
  value: unknown,
  key: string
): RacerItemEffectStackingRule {
  switch (value) {
    case "replace":
    case "extend":
    case "ignore":
    case "cap":
      return value;
    default:
      throw new RacerItemEffectLifecycleError(
        `Item effect lifecycle field must be a known stacking rule: ${key}.`
      );
  }
}

function requireLifecycleCancellationRule(
  value: unknown,
  key: string
): RacerItemEffectCancellationRule {
  switch (value) {
    case "none":
    case "replace-existing":
    case "ignore-incoming":
    case "block-negative-hit":
      return value;
    default:
      throw new RacerItemEffectLifecycleError(
        `Item effect lifecycle field must be a known cancellation rule: ${key}.`
      );
  }
}

function requireLifecycleStringField(
  record: Readonly<Record<string, unknown>>,
  key: string
): string {
  return requireLifecycleNonEmptyText(record[key], key);
}

function requireLifecycleNullableStringField(
  record: Readonly<Record<string, unknown>>,
  key: string
): string | null {
  return requireLifecycleNullableNonEmptyText(record[key] ?? null, key);
}

function requireLifecycleNumberField(
  record: Readonly<Record<string, unknown>>,
  key: string
): number {
  return requireLifecycleFiniteNonNegativeNumber(record[key], key);
}

function requireLifecycleNullableNumberField(
  record: Readonly<Record<string, unknown>>,
  key: string
): number | null {
  return requireLifecycleNullableFiniteNonNegativeNumber(
    record[key] ?? null,
    key
  );
}

function requireLifecycleEffectTypeField(
  record: Readonly<Record<string, unknown>>,
  key: string
): RacerItemEffectType {
  return requireLifecycleEffectType(record[key], key);
}

function requireLifecycleNullableSourceItemTypeField(
  record: Readonly<Record<string, unknown>>,
  key: string
): RacerItemEffectSourceItemType | null {
  return requireLifecycleNullableSourceItemType(record[key] ?? null, key);
}

function requireLifecyclePhaseField(
  record: Readonly<Record<string, unknown>>,
  key: string
): RacerItemEffectLifecyclePhase {
  return requireLifecyclePhase(record[key], key);
}

function requireLifecycleStackingRuleField(
  record: Readonly<Record<string, unknown>>,
  key: string
): RacerItemEffectStackingRule {
  return requireLifecycleStackingRule(record[key], key);
}

function requireLifecycleCancellationRuleField(
  record: Readonly<Record<string, unknown>>,
  key: string
): RacerItemEffectCancellationRule {
  return requireLifecycleCancellationRule(record[key], key);
}

function isLifecycleRecord(
  value: unknown
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getLifecycleUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function normalizeDurationSeconds(seconds: number): number {
  return Math.max(0, Number.isFinite(seconds) ? seconds : 0);
}
