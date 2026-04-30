export interface BoostCameraFovState {
  readonly fovMultiplier: number;
  readonly feedbackIntensity?: number;
  readonly feedbackPhaseSeconds?: number;
}

export interface BoostCameraFovUpdate {
  readonly isBoostActive: boolean;
  readonly deltaSeconds: number;
}

export interface BoostCameraFeedbackFrame {
  readonly fovMultiplier: number;
  readonly speedLineIntensity: number;
  readonly speedLinePhase: number;
  readonly cameraPunchScale: number;
  readonly frameTiltRadians: number;
}

export const DEFAULT_CAMERA_FOV_MULTIPLIER = 1;
export const ACTIVE_BOOST_CAMERA_FOV_MULTIPLIER = 1.16;
export const DEFAULT_BOOST_CAMERA_FEEDBACK_INTENSITY = 0;
export const ACTIVE_BOOST_CAMERA_FEEDBACK_INTENSITY = 1;
export const BOOST_CAMERA_PUNCH_SCALE = 0.018;
export const BOOST_CAMERA_TILT_RADIANS = 0.018;

const MIN_FRAME_SECONDS = 0;
const MAX_FRAME_SECONDS = 0.12;
const BOOST_FOV_WIDEN_RESPONSE = 13;
const BOOST_FOV_RESTORE_RESPONSE = 4.8;
const BOOST_FEEDBACK_ATTACK_RESPONSE = 18;
const BOOST_FEEDBACK_RELEASE_RESPONSE = 9.5;
const FOV_SETTLE_EPSILON = 0.0008;
const FEEDBACK_SETTLE_EPSILON = 0.002;

export function createDefaultBoostCameraFovState(): BoostCameraFovState {
  return {
    fovMultiplier: DEFAULT_CAMERA_FOV_MULTIPLIER,
    feedbackIntensity: DEFAULT_BOOST_CAMERA_FEEDBACK_INTENSITY,
    feedbackPhaseSeconds: 0
  };
}

export function updateBoostCameraFovState(
  state: BoostCameraFovState,
  update: BoostCameraFovUpdate
): BoostCameraFovState {
  const deltaSeconds = clampValue(
    update.deltaSeconds,
    MIN_FRAME_SECONDS,
    MAX_FRAME_SECONDS
  );
  const targetMultiplier = update.isBoostActive
    ? ACTIVE_BOOST_CAMERA_FOV_MULTIPLIER
    : DEFAULT_CAMERA_FOV_MULTIPLIER;
  const response =
    targetMultiplier > state.fovMultiplier
      ? BOOST_FOV_WIDEN_RESPONSE
      : BOOST_FOV_RESTORE_RESPONSE;
  const blend = 1 - Math.exp(-response * deltaSeconds);
  const nextMultiplier =
    state.fovMultiplier + (targetMultiplier - state.fovMultiplier) * blend;
  const targetFeedbackIntensity = update.isBoostActive
    ? ACTIVE_BOOST_CAMERA_FEEDBACK_INTENSITY
    : DEFAULT_BOOST_CAMERA_FEEDBACK_INTENSITY;
  const feedbackIntensity = normalizeFeedbackIntensity(
    state.feedbackIntensity
  );
  const feedbackResponse =
    targetFeedbackIntensity > feedbackIntensity
      ? BOOST_FEEDBACK_ATTACK_RESPONSE
      : BOOST_FEEDBACK_RELEASE_RESPONSE;
  const feedbackBlend = 1 - Math.exp(-feedbackResponse * deltaSeconds);
  const nextFeedbackIntensity =
    feedbackIntensity +
    (targetFeedbackIntensity - feedbackIntensity) * feedbackBlend;
  const settledFeedbackIntensity =
    Math.abs(targetFeedbackIntensity - nextFeedbackIntensity) <=
    FEEDBACK_SETTLE_EPSILON
      ? targetFeedbackIntensity
      : nextFeedbackIntensity;

  return {
    fovMultiplier:
      Math.abs(targetMultiplier - nextMultiplier) <= FOV_SETTLE_EPSILON
        ? targetMultiplier
        : nextMultiplier,
    feedbackIntensity: settledFeedbackIntensity,
    feedbackPhaseSeconds:
      settledFeedbackIntensity > 0
        ? normalizePhaseSeconds(state.feedbackPhaseSeconds) + deltaSeconds
        : 0
  };
}

export function createBoostCameraFeedbackFrame(
  state: BoostCameraFovState
): BoostCameraFeedbackFrame {
  const speedLineIntensity = normalizeFeedbackIntensity(
    state.feedbackIntensity
  );
  const speedLinePhase = normalizePhaseSeconds(state.feedbackPhaseSeconds);

  return {
    fovMultiplier: state.fovMultiplier,
    speedLineIntensity,
    speedLinePhase,
    cameraPunchScale: speedLineIntensity * BOOST_CAMERA_PUNCH_SCALE,
    frameTiltRadians:
      Math.sin(speedLinePhase * 22) *
      speedLineIntensity *
      BOOST_CAMERA_TILT_RADIANS
  };
}

function clampValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function normalizeFeedbackIntensity(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_BOOST_CAMERA_FEEDBACK_INTENSITY;
  }

  return clampValue(value, 0, ACTIVE_BOOST_CAMERA_FEEDBACK_INTENSITY);
}

function normalizePhaseSeconds(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}
