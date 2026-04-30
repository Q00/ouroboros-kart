export interface RacerSpinoutVisualState {
  readonly spinRadians: number;
  readonly lastAnimationSeconds: number | null;
  readonly active: boolean;
}

export interface RacerSpinoutVisualUpdate {
  readonly spinoutSeconds: number;
  readonly spinoutAngularVelocity: number;
  readonly animationSeconds: number;
}

export interface AuthoritativeRacerSpinoutVisualUpdate
  extends RacerSpinoutVisualUpdate {
  readonly elapsedSinceSpinoutStartSeconds: number;
}

interface RacerSpinoutVisualFrameTiming {
  readonly elapsedSeconds: number;
  readonly lastAnimationSeconds: number;
}

export const SPINOUT_VISUAL_MINOR_TIMESTAMP_JITTER_SECONDS = 1 / 60;
export const SPINOUT_VISUAL_MAX_FRAME_SECONDS = 0.12;

const FULL_ROTATION_RADIANS = Math.PI * 2;
const MIN_FRAME_SECONDS = 0;

export function createDefaultRacerSpinoutVisualState(): RacerSpinoutVisualState {
  return {
    spinRadians: 0,
    lastAnimationSeconds: null,
    active: false
  };
}

export function updateRacerSpinoutVisualState(
  state: RacerSpinoutVisualState,
  update: RacerSpinoutVisualUpdate
): RacerSpinoutVisualState {
  if (!isActiveSpinoutVisualUpdate(update)) {
    return createDefaultRacerSpinoutVisualState();
  }

  const frameTiming =
    state.active && state.lastAnimationSeconds !== null
      ? createSpinoutVisualFrameTiming(
          update.animationSeconds,
          state.lastAnimationSeconds
        )
      : {
          elapsedSeconds: 0,
          lastAnimationSeconds: update.animationSeconds
        };

  return {
    spinRadians: normalizeRotationRadians(
      state.spinRadians +
        update.spinoutAngularVelocity * frameTiming.elapsedSeconds
    ),
    lastAnimationSeconds: frameTiming.lastAnimationSeconds,
    active: true
  };
}

export function createAuthoritativeRacerSpinoutVisualState(
  update: AuthoritativeRacerSpinoutVisualUpdate
): RacerSpinoutVisualState {
  if (!isActiveSpinoutVisualUpdate(update)) {
    return createDefaultRacerSpinoutVisualState();
  }

  const elapsedSinceSpinoutStartSeconds = clampValue(
    update.elapsedSinceSpinoutStartSeconds,
    0,
    update.spinoutSeconds
  );

  if (elapsedSinceSpinoutStartSeconds >= update.spinoutSeconds) {
    return createDefaultRacerSpinoutVisualState();
  }

  return {
    spinRadians: normalizeRotationRadians(
      update.spinoutAngularVelocity * elapsedSinceSpinoutStartSeconds
    ),
    lastAnimationSeconds: update.animationSeconds,
    active: true
  };
}

function isActiveSpinoutVisualUpdate(
  update: RacerSpinoutVisualUpdate
): boolean {
  return (
    update.spinoutSeconds > 0 &&
    Number.isFinite(update.spinoutAngularVelocity) &&
    update.spinoutAngularVelocity !== 0 &&
    Number.isFinite(update.animationSeconds)
  );
}

function normalizeRotationRadians(radians: number): number {
  const normalized =
    ((((radians + Math.PI) % FULL_ROTATION_RADIANS) +
      FULL_ROTATION_RADIANS) %
      FULL_ROTATION_RADIANS) -
    Math.PI;

  return normalized === -Math.PI ? Math.PI : normalized;
}

function createSpinoutVisualFrameTiming(
  animationSeconds: number,
  lastAnimationSeconds: number
): RacerSpinoutVisualFrameTiming {
  const rawElapsedSeconds = animationSeconds - lastAnimationSeconds;

  if (
    rawElapsedSeconds < 0 &&
    Math.abs(rawElapsedSeconds) <= SPINOUT_VISUAL_MINOR_TIMESTAMP_JITTER_SECONDS
  ) {
    return {
      elapsedSeconds: 0,
      lastAnimationSeconds
    };
  }

  if (rawElapsedSeconds < 0) {
    return {
      elapsedSeconds: 0,
      lastAnimationSeconds: animationSeconds
    };
  }

  return {
    elapsedSeconds: clampValue(
      rawElapsedSeconds,
      MIN_FRAME_SECONDS,
      SPINOUT_VISUAL_MAX_FRAME_SECONDS
    ),
    lastAnimationSeconds: animationSeconds
  };
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
