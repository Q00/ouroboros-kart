import type { CombatItemType } from "../race/raceSession";

export type CombatFeedbackItemType = Exclude<CombatItemType, "boost">;

export type CombatFeedbackEventKind =
  | "shell-launch"
  | "banana-drop"
  | "shell-near-miss"
  | "banana-near-miss"
  | "shell-hit"
  | "banana-hit"
  | "recovery";

export interface CombatFeedbackPulseFrameInput {
  readonly kind: CombatFeedbackEventKind;
  readonly ageSeconds: number;
  readonly durationSeconds?: number;
  readonly intensity?: number;
}

export interface CombatFeedbackPulseFrame {
  readonly kind: CombatFeedbackEventKind;
  readonly ageSeconds: number;
  readonly durationSeconds: number;
  readonly progressRatio: number;
  readonly isActive: boolean;
  readonly opacity: number;
  readonly coreOpacity: number;
  readonly ringOpacity: number;
  readonly labelOpacity: number;
  readonly coreRadiusScale: number;
  readonly ringRadiusScale: number;
  readonly sparkDistanceScale: number;
  readonly sparkOpacity: number;
}

export interface CombatNearMissFeedbackInput {
  readonly distance: number;
  readonly itemRadius: number;
  readonly racerRadius: number;
  readonly extraRadius: number;
  readonly itemArmed: boolean;
  readonly itemActive: boolean;
}

export interface CombatNearMissFeedbackResult {
  readonly isNearMiss: boolean;
  readonly innerRadius: number;
  readonly outerRadius: number;
  readonly closenessRatio: number;
}

interface CombatFeedbackKindScale {
  readonly durationSeconds: number;
  readonly opacity: number;
  readonly coreRadiusScale: number;
  readonly ringRadiusScale: number;
  readonly sparkDistanceScale: number;
  readonly labelBias: number;
}

const COMBAT_FEEDBACK_KIND_SCALES = {
  "shell-launch": {
    durationSeconds: 0.42,
    opacity: 0.74,
    coreRadiusScale: 0.86,
    ringRadiusScale: 1.16,
    sparkDistanceScale: 0.84,
    labelBias: 0.64
  },
  "banana-drop": {
    durationSeconds: 0.5,
    opacity: 0.78,
    coreRadiusScale: 0.9,
    ringRadiusScale: 1.08,
    sparkDistanceScale: 0.72,
    labelBias: 0.72
  },
  "shell-near-miss": {
    durationSeconds: 0.34,
    opacity: 0.88,
    coreRadiusScale: 0.62,
    ringRadiusScale: 1.34,
    sparkDistanceScale: 1.06,
    labelBias: 0.82
  },
  "banana-near-miss": {
    durationSeconds: 0.38,
    opacity: 0.82,
    coreRadiusScale: 0.66,
    ringRadiusScale: 1.2,
    sparkDistanceScale: 0.9,
    labelBias: 0.8
  },
  "shell-hit": {
    durationSeconds: 0.58,
    opacity: 0.96,
    coreRadiusScale: 1.18,
    ringRadiusScale: 1.6,
    sparkDistanceScale: 1.34,
    labelBias: 0.92
  },
  "banana-hit": {
    durationSeconds: 0.62,
    opacity: 0.92,
    coreRadiusScale: 1.04,
    ringRadiusScale: 1.44,
    sparkDistanceScale: 1.1,
    labelBias: 0.9
  },
  recovery: {
    durationSeconds: 0.48,
    opacity: 0.68,
    coreRadiusScale: 0.74,
    ringRadiusScale: 1.02,
    sparkDistanceScale: 0.54,
    labelBias: 0.74
  }
} as const satisfies Record<CombatFeedbackEventKind, CombatFeedbackKindScale>;

export function getCombatFeedbackDefaultDurationSeconds(
  kind: CombatFeedbackEventKind
): number {
  return COMBAT_FEEDBACK_KIND_SCALES[kind].durationSeconds;
}

export function createCombatFeedbackPulseFrame(
  input: CombatFeedbackPulseFrameInput
): CombatFeedbackPulseFrame {
  const kindScale = COMBAT_FEEDBACK_KIND_SCALES[input.kind];
  const durationSeconds = Math.max(
    0.001,
    normalizeSeconds(input.durationSeconds ?? kindScale.durationSeconds)
  );
  const ageSeconds = normalizeSeconds(input.ageSeconds);
  const progressRatio = clampRatio(ageSeconds / durationSeconds);
  const fadeRatio = 1 - progressRatio;
  const easeOutRatio = 1 - Math.pow(1 - progressRatio, 2);
  const intensity = clampRatio(input.intensity ?? 1);
  const opacity = kindScale.opacity * fadeRatio * intensity;

  return {
    kind: input.kind,
    ageSeconds,
    durationSeconds,
    progressRatio,
    isActive: ageSeconds < durationSeconds,
    opacity,
    coreOpacity: opacity * (0.44 + intensity * 0.38),
    ringOpacity: opacity * (0.58 + easeOutRatio * 0.22),
    labelOpacity:
      opacity *
      clampRatio(kindScale.labelBias + Math.sin(progressRatio * Math.PI) * 0.18),
    coreRadiusScale:
      kindScale.coreRadiusScale * (0.72 + easeOutRatio * 0.36),
    ringRadiusScale:
      kindScale.ringRadiusScale * (0.42 + easeOutRatio * 0.86),
    sparkDistanceScale:
      kindScale.sparkDistanceScale * (0.34 + easeOutRatio * 0.96),
    sparkOpacity: opacity * Math.pow(fadeRatio, 0.46)
  };
}

export function evaluateCombatNearMissFeedback(
  input: CombatNearMissFeedbackInput
): CombatNearMissFeedbackResult {
  const itemRadius = normalizeNonNegativeNumber(input.itemRadius);
  const racerRadius = normalizeNonNegativeNumber(input.racerRadius);
  const extraRadius = normalizeNonNegativeNumber(input.extraRadius);
  const innerRadius = itemRadius + racerRadius;
  const outerRadius = innerRadius + extraRadius;
  const distance = normalizeNonNegativeNumber(input.distance);
  const isNearMiss =
    input.itemActive &&
    input.itemArmed &&
    outerRadius > innerRadius &&
    distance > innerRadius &&
    distance <= outerRadius;
  const closenessRatio = isNearMiss
    ? 1 - clampRatio((distance - innerRadius) / Math.max(0.001, extraRadius))
    : 0;

  return {
    isNearMiss,
    innerRadius,
    outerRadius,
    closenessRatio
  };
}

function normalizeSeconds(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

function normalizeNonNegativeNumber(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}
