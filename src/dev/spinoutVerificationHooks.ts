import {
  DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING,
  DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING
} from "../config/gameplayTuning";
import type {
  RaceSession,
  RaceSessionRacerState,
  RaceSessionSpinoutSourceItemType,
  RaceSessionSpinoutTuningPatch,
  RaceSessionSpinoutTuningSnapshot,
  RaceSessionSpinoutVerificationTriggerOptions
} from "../race/raceSession";

export const SPINOUT_VERIFICATION_HOOK_NAME = "kartSpinout";
export const SPINOUT_VERIFICATION_COMPAT_HOOK_NAME = "kartSpinoutVerification";
export const SPINOUT_VERIFICATION_HELP = [
  "kartSpinout.inspect()",
  "kartSpinout.trigger({ target: 'local' })",
  "kartSpinout.trigger({ slotIndex: 1, durationSeconds: 1.2, spinStrengthRadians: 7 })",
  "kartSpinout.setTuning({ shell: { durationSeconds: 1.4, spinStrengthRadians: 8 } })",
  "kartSpinout.resetTuning()"
] as const;

export type SpinoutVerificationTarget = "local" | "first-human";
export type SpinoutVerificationSpinDirection =
  | 1
  | -1
  | "clockwise"
  | "counterclockwise"
  | "right"
  | "left";

export interface SpinoutVerificationTuningOverride {
  readonly durationSeconds?: number;
  readonly spinoutSeconds?: number;
  readonly spinStrengthRadians?: number;
  readonly spinoutRadians?: number;
  readonly hitSpinRadians?: number;
  readonly spinRadians?: number;
}

export interface SpinoutVerificationTuningOverrides
  extends SpinoutVerificationTuningOverride {
  readonly sourceItemType?: RaceSessionSpinoutSourceItemType;
  readonly shell?: SpinoutVerificationTuningOverride;
  readonly banana?: SpinoutVerificationTuningOverride;
}

export interface SpinoutVerificationTriggerOptions
  extends SpinoutVerificationTuningOverride {
  readonly target?: SpinoutVerificationTarget;
  readonly racerId?: string;
  readonly slotIndex?: number;
  readonly sourceItemType?: RaceSessionSpinoutSourceItemType;
  readonly spinDirection?: SpinoutVerificationSpinDirection;
}

export interface SpinoutVerificationRacerInspection {
  readonly racerId: string;
  readonly slotIndex: number;
  readonly displayName: string;
  readonly controller: RaceSessionRacerState["controller"];
  readonly peerId: string | null;
  readonly isLocal: boolean;
  readonly active: boolean;
  readonly spinoutSeconds: number;
  readonly spinStrengthRadians: number;
  readonly spinoutAngularVelocity: number;
  readonly lastHitItemType: RaceSessionRacerState["lastHitItemType"];
  readonly recovering: boolean;
}

export interface SpinoutVerificationTuningInspection {
  readonly shell: {
    readonly durationSeconds: number;
    readonly spinStrengthRadians: number;
    readonly spinoutAngularVelocity: number;
  };
  readonly banana: {
    readonly hitSpinRadians: number;
    readonly durationSeconds: number;
    readonly spinStrengthRadians: number;
    readonly spinoutAngularVelocity: number;
  };
}

export interface SpinoutVerificationInspection {
  readonly authoritative: boolean;
  readonly localRacerId: string | null;
  readonly tuning: SpinoutVerificationTuningInspection;
  readonly racers: readonly SpinoutVerificationRacerInspection[];
}

export interface SpinoutVerificationTriggerResult
  extends SpinoutVerificationRacerInspection {
  readonly sourceItemType: RaceSessionSpinoutSourceItemType;
  readonly applied: boolean;
  readonly authoritative: boolean;
}

export interface KartSpinoutVerificationHooks {
  readonly help: readonly string[];
  inspect: () => SpinoutVerificationInspection;
  listRacers: () => readonly SpinoutVerificationRacerInspection[];
  getTuning: () => SpinoutVerificationTuningInspection;
  setTuning: (
    overrides: SpinoutVerificationTuningOverrides
  ) => SpinoutVerificationInspection;
  resetTuning: (
    sourceItemType?: RaceSessionSpinoutSourceItemType
  ) => SpinoutVerificationInspection;
  trigger: (
    options?: SpinoutVerificationTriggerOptions
  ) => SpinoutVerificationTriggerResult;
}

export interface SpinoutVerificationGlobalTarget {
  kartSpinout?: KartSpinoutVerificationHooks;
  kartSpinoutVerification?: KartSpinoutVerificationHooks;
}

export interface SpinoutVerificationHookInstallOptions {
  readonly getRaceSession: () => RaceSession;
  readonly getLocalRacerId: () => string | null;
  readonly isAuthoritative: () => boolean;
  readonly onChange?: (inspection: SpinoutVerificationInspection) => void;
  readonly log?: (message: string, ...data: unknown[]) => void;
}

type MutableShellSpinoutTuningPatch = {
  spinoutSeconds?: number;
  spinoutRadians?: number;
};

type MutableBananaSpinoutTuningPatch = {
  spinRadians?: number;
  spinoutSeconds?: number;
  spinoutRadians?: number;
};

type MutableRaceSessionSpinoutTuningPatch = {
  shell?: MutableShellSpinoutTuningPatch;
  banana?: MutableBananaSpinoutTuningPatch;
};

declare global {
  interface Window extends SpinoutVerificationGlobalTarget {}
}

export function installSpinoutVerificationHooks(
  target: SpinoutVerificationGlobalTarget,
  options: SpinoutVerificationHookInstallOptions
): () => void {
  const hadShortHook = SPINOUT_VERIFICATION_HOOK_NAME in target;
  const hadCompatHook = SPINOUT_VERIFICATION_COMPAT_HOOK_NAME in target;
  const previousShortHook = target.kartSpinout;
  const previousCompatHook = target.kartSpinoutVerification;
  const hooks = createSpinoutVerificationHooks(options);

  target.kartSpinout = hooks;
  target.kartSpinoutVerification = hooks;

  return () => {
    restoreHook(target, SPINOUT_VERIFICATION_HOOK_NAME, hadShortHook, previousShortHook);
    restoreHook(
      target,
      SPINOUT_VERIFICATION_COMPAT_HOOK_NAME,
      hadCompatHook,
      previousCompatHook
    );
  };
}

function createSpinoutVerificationHooks(
  options: SpinoutVerificationHookInstallOptions
): KartSpinoutVerificationHooks {
  const inspect = (): SpinoutVerificationInspection =>
    createInspection(options);

  const notifyChange = (): SpinoutVerificationInspection => {
    const inspection = inspect();

    options.onChange?.(inspection);

    return inspection;
  };

  return {
    help: SPINOUT_VERIFICATION_HELP,
    inspect,
    listRacers: () => inspect().racers,
    getTuning: () => inspect().tuning,
    setTuning: (overrides) => {
      const session = options.getRaceSession();
      const tuning = session.setSpinoutGameplayTuning(
        createRaceSessionTuningPatch(overrides)
      );
      const inspection = notifyChange();

      options.log?.("kartSpinout tuning updated", createTuningInspection(tuning));

      return inspection;
    },
    resetTuning: (sourceItemType) => {
      const session = options.getRaceSession();
      const tuning = session.setSpinoutGameplayTuning(
        createDefaultTuningPatch(sourceItemType)
      );
      const inspection = notifyChange();

      options.log?.("kartSpinout tuning reset", createTuningInspection(tuning));

      return inspection;
    },
    trigger: (triggerOptions = {}) => {
      const session = options.getRaceSession();
      const racer = resolveTriggerTargetRacer(
        session,
        triggerOptions,
        options.getLocalRacerId()
      );
      const raceOptions = createRaceSessionTriggerOptions(racer, triggerOptions);
      const result = session.applySpinoutVerificationTrigger(raceOptions);
      const inspection = notifyChange();
      const inspectedRacer = inspection.racers.find(
        (candidate) => candidate.racerId === result.racerId
      );
      const triggerResult = {
        ...(inspectedRacer ?? createRacerInspection(racer, options.getLocalRacerId())),
        sourceItemType: result.sourceItemType,
        applied: result.applied,
        authoritative: inspection.authoritative
      } satisfies SpinoutVerificationTriggerResult;

      options.log?.("kartSpinout triggered", triggerResult);

      return triggerResult;
    }
  };
}

function createInspection(
  options: SpinoutVerificationHookInstallOptions
): SpinoutVerificationInspection {
  const session = options.getRaceSession();
  const localRacerId = options.getLocalRacerId();

  return {
    authoritative: options.isAuthoritative(),
    localRacerId,
    tuning: createTuningInspection(session.getSpinoutGameplayTuning()),
    racers: session.racerStates.map((racer) =>
      createRacerInspection(racer, localRacerId)
    )
  };
}

function createTuningInspection(
  tuning: RaceSessionSpinoutTuningSnapshot
): SpinoutVerificationTuningInspection {
  return {
    shell: {
      durationSeconds: tuning.shell.spinoutSeconds,
      spinStrengthRadians: tuning.shell.spinoutRadians,
      spinoutAngularVelocity:
        tuning.shell.spinoutRadians / tuning.shell.spinoutSeconds
    },
    banana: {
      hitSpinRadians: tuning.banana.spinRadians,
      durationSeconds: tuning.banana.spinoutSeconds,
      spinStrengthRadians: tuning.banana.spinoutRadians,
      spinoutAngularVelocity:
        tuning.banana.spinoutRadians / tuning.banana.spinoutSeconds
    }
  };
}

function createRacerInspection(
  racer: RaceSessionRacerState,
  localRacerId: string | null
): SpinoutVerificationRacerInspection {
  const spinoutDurationSeconds =
    racer.timedEffects.spinout?.durationSeconds ?? racer.spinoutSeconds;

  return {
    racerId: racer.id,
    slotIndex: racer.slotIndex,
    displayName: racer.displayName,
    controller: racer.controller,
    peerId: racer.peerId,
    isLocal: localRacerId !== null && racer.id === localRacerId,
    active: racer.spinoutSeconds > 0,
    spinoutSeconds: racer.spinoutSeconds,
    spinStrengthRadians:
      Math.abs(racer.spinoutAngularVelocity) * spinoutDurationSeconds,
    spinoutAngularVelocity: racer.spinoutAngularVelocity,
    lastHitItemType: racer.lastHitItemType,
    recovering: racer.recovering
  };
}

function createRaceSessionTuningPatch(
  overrides: SpinoutVerificationTuningOverrides
): RaceSessionSpinoutTuningPatch {
  const patch: MutableRaceSessionSpinoutTuningPatch = {};

  if (hasTopLevelTuningOverride(overrides)) {
    const sourceItemType = normalizeSourceItemType(
      overrides.sourceItemType,
      "shell"
    );

    if (sourceItemType === "banana") {
      patch.banana = createBananaTuningPatch(overrides);
    } else {
      patch.shell = createShellTuningPatch(overrides);
    }
  }

  if (overrides.shell !== undefined) {
    patch.shell = createShellTuningPatch(overrides.shell);
  }

  if (overrides.banana !== undefined) {
    patch.banana = createBananaTuningPatch(overrides.banana);
  }

  if (patch.shell === undefined && patch.banana === undefined) {
    throw new Error("Spin-out tuning override must include shell or banana values.");
  }

  return patch;
}

function createDefaultTuningPatch(
  sourceItemType?: RaceSessionSpinoutSourceItemType
): RaceSessionSpinoutTuningPatch {
  if (sourceItemType === "shell") {
    return { shell: DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING };
  }

  if (sourceItemType === "banana") {
    return { banana: DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING };
  }

  return {
    shell: DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING,
    banana: DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING
  };
}

function createShellTuningPatch(
  override: SpinoutVerificationTuningOverride
): MutableShellSpinoutTuningPatch {
  const patch: MutableShellSpinoutTuningPatch = {};
  const durationSeconds = readFirstNumberOverride(override, [
    "durationSeconds",
    "spinoutSeconds"
  ]);
  const spinoutRadians = readFirstNumberOverride(override, [
    "spinStrengthRadians",
    "spinoutRadians"
  ]);

  if (durationSeconds !== undefined) {
    patch.spinoutSeconds = requirePositiveFiniteNumber(
      durationSeconds,
      "shell durationSeconds"
    );
  }

  if (spinoutRadians !== undefined) {
    patch.spinoutRadians = requirePositiveFiniteNumber(
      spinoutRadians,
      "shell spinStrengthRadians"
    );
  }

  return patch;
}

function createBananaTuningPatch(
  override: SpinoutVerificationTuningOverride
): MutableBananaSpinoutTuningPatch {
  const patch: MutableBananaSpinoutTuningPatch = {};
  const hitSpinRadians = readFirstNumberOverride(override, [
    "hitSpinRadians",
    "spinRadians"
  ]);
  const durationSeconds = readFirstNumberOverride(override, [
    "durationSeconds",
    "spinoutSeconds"
  ]);
  const spinoutRadians = readFirstNumberOverride(override, [
    "spinStrengthRadians",
    "spinoutRadians"
  ]);

  if (hitSpinRadians !== undefined) {
    patch.spinRadians = requirePositiveFiniteNumber(
      hitSpinRadians,
      "banana hitSpinRadians"
    );
  }

  if (durationSeconds !== undefined) {
    patch.spinoutSeconds = requirePositiveFiniteNumber(
      durationSeconds,
      "banana durationSeconds"
    );
  }

  if (spinoutRadians !== undefined) {
    patch.spinoutRadians = requirePositiveFiniteNumber(
      spinoutRadians,
      "banana spinStrengthRadians"
    );
  }

  return patch;
}

function createRaceSessionTriggerOptions(
  racer: RaceSessionRacerState,
  options: SpinoutVerificationTriggerOptions
): RaceSessionSpinoutVerificationTriggerOptions {
  const sourceItemType = normalizeSourceItemType(
    options.sourceItemType,
    "shell"
  );
  const raceOptions: {
    racerId: string;
    sourceItemType: RaceSessionSpinoutSourceItemType;
    durationSeconds?: number;
    spinoutRadians?: number;
    spinDirection?: 1 | -1;
  } = {
    racerId: racer.id,
    sourceItemType
  };
  const durationSeconds = readFirstNumberOverride(options, [
    "durationSeconds",
    "spinoutSeconds"
  ]);
  const spinoutRadians = readFirstNumberOverride(options, [
    "spinStrengthRadians",
    "spinoutRadians"
  ]);
  const spinDirection = normalizeSpinDirection(options.spinDirection);

  if (durationSeconds !== undefined) {
    raceOptions.durationSeconds = requirePositiveFiniteNumber(
      durationSeconds,
      "trigger durationSeconds"
    );
  }

  if (spinoutRadians !== undefined) {
    raceOptions.spinoutRadians = requirePositiveFiniteNumber(
      spinoutRadians,
      "trigger spinStrengthRadians"
    );
  }

  if (spinDirection !== undefined) {
    raceOptions.spinDirection = spinDirection;
  }

  return raceOptions;
}

function resolveTriggerTargetRacer(
  session: RaceSession,
  options: SpinoutVerificationTriggerOptions,
  localRacerId: string | null
): RaceSessionRacerState {
  if (options.racerId !== undefined) {
    const racer = session.getRacerState(options.racerId);

    if (racer === undefined) {
      throw new Error(`Unknown spin-out hook racer id: ${options.racerId}`);
    }

    return racer;
  }

  if (options.slotIndex !== undefined) {
    const racer = session.getRacerStateBySlot(options.slotIndex);

    if (racer === undefined) {
      throw new Error(`Unknown spin-out hook racer slot: ${options.slotIndex}.`);
    }

    return racer;
  }

  if (options.target === "local" && localRacerId !== null) {
    const racer = session.getRacerState(localRacerId);

    if (racer !== undefined) {
      return racer;
    }
  }

  if (options.target === "first-human" || options.target === undefined) {
    const localRacer =
      localRacerId === null ? undefined : session.getRacerState(localRacerId);

    return localRacer ?? requireFallbackRacer(session);
  }

  throw new Error(`Unsupported spin-out hook target: ${options.target}.`);
}

function requireFallbackRacer(session: RaceSession): RaceSessionRacerState {
  const racer = session.humanRacerStates[0] ?? session.racerStates[0];

  if (racer === undefined) {
    throw new Error("Spin-out hook requires at least one racer.");
  }

  return racer;
}

function hasTopLevelTuningOverride(
  overrides: SpinoutVerificationTuningOverrides
): boolean {
  return (
    overrides.durationSeconds !== undefined ||
    overrides.spinoutSeconds !== undefined ||
    overrides.spinStrengthRadians !== undefined ||
    overrides.spinoutRadians !== undefined ||
    overrides.hitSpinRadians !== undefined ||
    overrides.spinRadians !== undefined
  );
}

function readFirstNumberOverride(
  source: SpinoutVerificationTuningOverride,
  keys: readonly (keyof SpinoutVerificationTuningOverride)[]
): number | undefined {
  for (const key of keys) {
    const value = source[key];

    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function normalizeSourceItemType(
  value: RaceSessionSpinoutSourceItemType | undefined,
  fallback: RaceSessionSpinoutSourceItemType
): RaceSessionSpinoutSourceItemType {
  if (value === undefined) {
    return fallback;
  }

  if (value === "shell" || value === "banana") {
    return value;
  }

  throw new Error(`Unsupported spin-out source item type: ${value}.`);
}

function normalizeSpinDirection(
  value: SpinoutVerificationSpinDirection | undefined
): 1 | -1 | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === 1 || value === "clockwise" || value === "right") {
    return 1;
  }

  if (value === -1 || value === "counterclockwise" || value === "left") {
    return -1;
  }

  throw new Error(`Unsupported spin-out direction: ${value}.`);
}

function requirePositiveFiniteNumber(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number; found ${value}.`);
  }

  return value;
}

function restoreHook(
  target: SpinoutVerificationGlobalTarget,
  hookName:
    | typeof SPINOUT_VERIFICATION_HOOK_NAME
    | typeof SPINOUT_VERIFICATION_COMPAT_HOOK_NAME,
  hadHook: boolean,
  previousHook: KartSpinoutVerificationHooks | undefined
): void {
  if (hadHook && previousHook !== undefined) {
    target[hookName] = previousHook;
    return;
  }

  delete target[hookName];
}
