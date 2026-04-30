export interface ShellSpinoutGameplayTuning {
  readonly spinoutSeconds: number;
  readonly spinoutRadians: number;
}

export interface BananaSpinoutGameplayTuning {
  readonly spinRadians: number;
  readonly spinoutSeconds: number;
  readonly spinoutRadians: number;
}

export const SHELL_SPINOUT_FEEL_RANGE_SECONDS = {
  min: 1,
  max: 2
} as const;

export const SHELL_SPINOUT_FEEL_RANGE_RADIANS = {
  min: Math.PI * 1.25,
  max: Math.PI * 2.5
} as const;

export const BANANA_SPINOUT_FEEL_RANGE_SECONDS =
  SHELL_SPINOUT_FEEL_RANGE_SECONDS;

export const BANANA_SPINOUT_FEEL_RANGE_RADIANS =
  SHELL_SPINOUT_FEEL_RANGE_RADIANS;

/**
 * Playtest default: shell hits remove control for 1.35 seconds.
 * Increase this for a harsher hit; decrease it if combat interrupts racing too much.
 */
export const DEFAULT_SHELL_SPINOUT_DURATION_SECONDS = 1.35;

/**
 * Playtest default: shell hits rotate the kart by Math.PI * 2.05 radians.
 * This is total spin strength over the duration, not angular velocity per second.
 */
export const DEFAULT_SHELL_SPINOUT_STRENGTH_RADIANS = Math.PI * 2.05;

/**
 * Playtest default: banana traps add a small immediate yaw kick before the
 * shorter trap spin-out, making them feel distinct from direct shell hits.
 */
export const DEFAULT_BANANA_HIT_SPIN_RADIANS = Math.PI * 0.16;

/**
 * Playtest default: banana spin-outs are shorter than direct shell hits.
 */
export const DEFAULT_BANANA_SPINOUT_DURATION_SECONDS = 1.05;

/**
 * Playtest default: banana spin-outs are lighter than direct shell hits.
 * This is total spin strength over the duration, not angular velocity per second.
 */
export const DEFAULT_BANANA_SPINOUT_STRENGTH_RADIANS = Math.PI * 1.45;

export const DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING = {
  spinoutSeconds: DEFAULT_SHELL_SPINOUT_DURATION_SECONDS,
  spinoutRadians: DEFAULT_SHELL_SPINOUT_STRENGTH_RADIANS
} as const satisfies ShellSpinoutGameplayTuning;

export const DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING = {
  spinRadians: DEFAULT_BANANA_HIT_SPIN_RADIANS,
  spinoutSeconds: DEFAULT_BANANA_SPINOUT_DURATION_SECONDS,
  spinoutRadians: DEFAULT_BANANA_SPINOUT_STRENGTH_RADIANS
} as const satisfies BananaSpinoutGameplayTuning;

export function createShellSpinoutGameplayTuning(
  tuning: Partial<ShellSpinoutGameplayTuning> = {}
): ShellSpinoutGameplayTuning {
  const spinoutSeconds =
    tuning.spinoutSeconds ??
    DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds;
  const spinoutRadians =
    tuning.spinoutRadians ??
    DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutRadians;

  if (!Number.isFinite(spinoutSeconds) || spinoutSeconds <= 0) {
    throw new Error(
      `Shell spin-out duration must be a positive finite number; found ${spinoutSeconds}.`
    );
  }

  if (!Number.isFinite(spinoutRadians) || spinoutRadians <= 0) {
    throw new Error(
      `Shell spin-out strength must be a positive finite number; found ${spinoutRadians}.`
    );
  }

  return { spinoutSeconds, spinoutRadians };
}

export function createBananaSpinoutGameplayTuning(
  tuning: Partial<BananaSpinoutGameplayTuning> = {}
): BananaSpinoutGameplayTuning {
  const spinRadians =
    tuning.spinRadians ?? DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING.spinRadians;
  const spinoutSeconds =
    tuning.spinoutSeconds ??
    DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds;
  const spinoutRadians =
    tuning.spinoutRadians ??
    DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING.spinoutRadians;

  if (!Number.isFinite(spinRadians) || spinRadians < 0) {
    throw new Error(
      `Banana hit spin strength must be a non-negative finite number; found ${spinRadians}.`
    );
  }

  if (!Number.isFinite(spinoutSeconds) || spinoutSeconds <= 0) {
    throw new Error(
      `Banana spin-out duration must be a positive finite number; found ${spinoutSeconds}.`
    );
  }

  if (!Number.isFinite(spinoutRadians) || spinoutRadians <= 0) {
    throw new Error(
      `Banana spin-out strength must be a positive finite number; found ${spinoutRadians}.`
    );
  }

  return { spinRadians, spinoutSeconds, spinoutRadians };
}
