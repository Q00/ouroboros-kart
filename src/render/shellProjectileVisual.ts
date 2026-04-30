export interface ShellProjectileVisualDirection {
  readonly x: number;
  readonly z: number;
}

export interface ShellProjectileVisualFrameInput {
  readonly ageSeconds: number;
  readonly speed: number;
  readonly direction: ShellProjectileVisualDirection;
  readonly isInteractable: boolean;
}

export interface ShellProjectileVisualFrame {
  readonly launchAgeSeconds: number;
  readonly direction: ShellProjectileVisualDirection;
  readonly spinDirection: 1 | -1;
  readonly spinRadians: number;
  readonly bankRadians: number;
}

export type ShellProjectileRemovalVisualKind = "impact" | "expiration";

export interface ShellProjectileRemovalVisualFrameInput {
  readonly kind: ShellProjectileRemovalVisualKind;
  readonly ageSeconds: number;
  readonly durationSeconds: number;
}

export interface ShellProjectileRemovalVisualFrame {
  readonly kind: ShellProjectileRemovalVisualKind;
  readonly ageSeconds: number;
  readonly progressRatio: number;
  readonly isActive: boolean;
  readonly opacity: number;
  readonly coreRadiusScale: number;
  readonly ringRadiusScale: number;
  readonly sparkDistanceScale: number;
  readonly sparkOpacity: number;
}

const SHELL_PROJECTILE_BANK_RADIANS = 0.14;
const SHELL_PROJECTILE_ARMING_BANK_SPEED = 11;
const SHELL_PROJECTILE_LIVE_BANK_SPEED = 20;
const SHELL_PROJECTILE_ARMING_SPIN_RADIANS_PER_SECOND = 9;
const SHELL_PROJECTILE_LIVE_SPIN_RADIANS_PER_SECOND = 18;
const SHELL_PROJECTILE_IMPACT_OPACITY = 0.95;
const SHELL_PROJECTILE_EXPIRATION_OPACITY = 0.72;
const SHELL_PROJECTILE_IMPACT_CORE_SCALE = 1.18;
const SHELL_PROJECTILE_EXPIRATION_CORE_SCALE = 0.9;
const SHELL_PROJECTILE_IMPACT_RING_SCALE = 1.75;
const SHELL_PROJECTILE_EXPIRATION_RING_SCALE = 1.24;
const SHELL_PROJECTILE_IMPACT_SPARK_SCALE = 1.35;
const SHELL_PROJECTILE_EXPIRATION_SPARK_SCALE = 0.82;

export function createShellProjectileVisualFrame(
  input: ShellProjectileVisualFrameInput
): ShellProjectileVisualFrame {
  const launchAgeSeconds = normalizeSeconds(input.ageSeconds);
  const direction = normalizePlanarDirection(input.direction);
  const spinDirection = getShellVisualSpinDirection(direction);
  const motionScale = input.isInteractable ? 1 : 0.58;
  const bankSpeed = input.isInteractable
    ? SHELL_PROJECTILE_LIVE_BANK_SPEED
    : SHELL_PROJECTILE_ARMING_BANK_SPEED;
  const spinSpeed = input.isInteractable
    ? SHELL_PROJECTILE_LIVE_SPIN_RADIANS_PER_SECOND
    : SHELL_PROJECTILE_ARMING_SPIN_RADIANS_PER_SECOND;
  const movingScale = normalizeMotionScale(input.speed);

  return {
    launchAgeSeconds,
    direction,
    spinDirection,
    spinRadians: launchAgeSeconds * spinSpeed * movingScale * spinDirection,
    bankRadians:
      Math.sin(launchAgeSeconds * bankSpeed) *
      SHELL_PROJECTILE_BANK_RADIANS *
      motionScale *
      movingScale *
      spinDirection
  };
}

export function createShellProjectileRemovalVisualFrame(
  input: ShellProjectileRemovalVisualFrameInput
): ShellProjectileRemovalVisualFrame {
  const ageSeconds = normalizeSeconds(input.ageSeconds);
  const durationSeconds = Math.max(0.001, normalizeSeconds(input.durationSeconds));
  const progressRatio = clampRatio(ageSeconds / durationSeconds);
  const easeOutRatio = 1 - Math.pow(1 - progressRatio, 2);
  const fadeRatio = 1 - progressRatio;
  const kindScale = getShellProjectileRemovalKindScale(input.kind);

  return {
    kind: input.kind,
    ageSeconds,
    progressRatio,
    isActive: ageSeconds < durationSeconds,
    opacity: kindScale.opacity * fadeRatio,
    coreRadiusScale:
      kindScale.coreRadiusScale * (0.62 + easeOutRatio * 0.54),
    ringRadiusScale:
      kindScale.ringRadiusScale * (0.46 + easeOutRatio * 0.78),
    sparkDistanceScale:
      kindScale.sparkDistanceScale * (0.35 + easeOutRatio * 0.95),
    sparkOpacity: kindScale.opacity * Math.pow(fadeRatio, 0.72)
  };
}

function normalizeSeconds(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function normalizeMotionScale(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0.35, speed / 24));
}

function normalizePlanarDirection(
  direction: ShellProjectileVisualDirection
): ShellProjectileVisualDirection {
  const magnitude = Math.hypot(direction.x, direction.z);

  if (!Number.isFinite(magnitude) || magnitude <= 0.0001) {
    return { x: 0, z: 1 };
  }

  return {
    x: direction.x / magnitude,
    z: direction.z / magnitude
  };
}

function getShellVisualSpinDirection(
  direction: ShellProjectileVisualDirection
): 1 | -1 {
  return direction.x + direction.z >= 0 ? 1 : -1;
}

function getShellProjectileRemovalKindScale(
  kind: ShellProjectileRemovalVisualKind
): {
  readonly opacity: number;
  readonly coreRadiusScale: number;
  readonly ringRadiusScale: number;
  readonly sparkDistanceScale: number;
} {
  switch (kind) {
    case "impact":
      return {
        opacity: SHELL_PROJECTILE_IMPACT_OPACITY,
        coreRadiusScale: SHELL_PROJECTILE_IMPACT_CORE_SCALE,
        ringRadiusScale: SHELL_PROJECTILE_IMPACT_RING_SCALE,
        sparkDistanceScale: SHELL_PROJECTILE_IMPACT_SPARK_SCALE
      };
    case "expiration":
      return {
        opacity: SHELL_PROJECTILE_EXPIRATION_OPACITY,
        coreRadiusScale: SHELL_PROJECTILE_EXPIRATION_CORE_SCALE,
        ringRadiusScale: SHELL_PROJECTILE_EXPIRATION_RING_SCALE,
        sparkDistanceScale: SHELL_PROJECTILE_EXPIRATION_SPARK_SCALE
      };
  }
}
