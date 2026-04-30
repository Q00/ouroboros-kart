import {
  ACTIVE_BOOST_CAMERA_FOV_MULTIPLIER,
  ACTIVE_BOOST_CAMERA_FEEDBACK_INTENSITY,
  DEFAULT_BOOST_CAMERA_FEEDBACK_INTENSITY,
  DEFAULT_CAMERA_FOV_MULTIPLIER,
  createBoostCameraFeedbackFrame,
  createDefaultBoostCameraFovState,
  updateBoostCameraFovState
} from "./boostCameraFov";
import { createTrackViewport, projectTrackPoint } from "./trackViewport";

function main(): void {
  validateBoostWidensCameraFov();
  validateBoostCameraFovRestoresSmoothly();
  validateWidenedFovExpandsSharedTrackViewport();
  validateBoostCameraFeedbackStartsAndEndsWithBoostState();

  console.info("boostCameraFov=ok");
}

function validateBoostWidensCameraFov(): void {
  let state = createDefaultBoostCameraFovState();

  state = updateBoostCameraFovState(state, {
    isBoostActive: true,
    deltaSeconds: 1 / 60
  });

  assertGreaterThan(
    state.fovMultiplier,
    DEFAULT_CAMERA_FOV_MULTIPLIER,
    "active boost starts widening FOV"
  );
  assertLessThan(
    state.fovMultiplier,
    ACTIVE_BOOST_CAMERA_FOV_MULTIPLIER,
    "FOV widening eases instead of snapping on"
  );

  for (let frame = 0; frame < 60; frame += 1) {
    state = updateBoostCameraFovState(state, {
      isBoostActive: true,
      deltaSeconds: 1 / 60
    });
  }

  assertClose(
    state.fovMultiplier,
    ACTIVE_BOOST_CAMERA_FOV_MULTIPLIER,
    "active boost reaches widened FOV"
  );
}

function validateBoostCameraFovRestoresSmoothly(): void {
  let state = {
    fovMultiplier: ACTIVE_BOOST_CAMERA_FOV_MULTIPLIER
  };

  state = updateBoostCameraFovState(state, {
    isBoostActive: false,
    deltaSeconds: 1 / 60
  });

  assertLessThan(
    state.fovMultiplier,
    ACTIVE_BOOST_CAMERA_FOV_MULTIPLIER,
    "inactive boost starts restoring FOV"
  );
  assertGreaterThan(
    state.fovMultiplier,
    DEFAULT_CAMERA_FOV_MULTIPLIER,
    "inactive boost restores smoothly instead of snapping off"
  );

  for (let frame = 0; frame < 120; frame += 1) {
    state = updateBoostCameraFovState(state, {
      isBoostActive: false,
      deltaSeconds: 1 / 60
    });
  }

  assertClose(
    state.fovMultiplier,
    DEFAULT_CAMERA_FOV_MULTIPLIER,
    "inactive boost settles back to default FOV"
  );
}

function validateWidenedFovExpandsSharedTrackViewport(): void {
  const bounds = {
    minX: -50,
    maxX: 50,
    minZ: -30,
    maxZ: 30
  };
  const defaultViewport = createTrackViewport(bounds, 1200, 800);
  const widenedViewport = createTrackViewport(bounds, 1200, 800, {
    fovMultiplier: ACTIVE_BOOST_CAMERA_FOV_MULTIPLIER
  });
  const defaultProjection = projectTrackPoint(
    { x: bounds.maxX, z: 0 },
    defaultViewport
  );
  const widenedProjection = projectTrackPoint(
    { x: bounds.maxX, z: 0 },
    widenedViewport
  );

  assertLessThan(
    widenedViewport.scale,
    defaultViewport.scale,
    "widened FOV lowers projection scale"
  );
  assertLessThan(
    Math.abs(widenedProjection.x - widenedViewport.originX),
    Math.abs(defaultProjection.x - defaultViewport.originX),
    "widened viewport keeps projected overlay aligned with wider camera"
  );
}

function validateBoostCameraFeedbackStartsAndEndsWithBoostState(): void {
  let state = createDefaultBoostCameraFovState();

  state = updateBoostCameraFovState(state, {
    isBoostActive: true,
    deltaSeconds: 1 / 60
  });

  assertGreaterThan(
    state.feedbackIntensity ?? 0,
    DEFAULT_BOOST_CAMERA_FEEDBACK_INTENSITY,
    "active boost starts camera feedback"
  );

  const activeFrame = createBoostCameraFeedbackFrame(state);

  assertGreaterThan(
    activeFrame.speedLineIntensity,
    DEFAULT_BOOST_CAMERA_FEEDBACK_INTENSITY,
    "active boost produces speed-line framing"
  );
  assertGreaterThan(
    activeFrame.cameraPunchScale,
    0,
    "active boost produces camera punch scale"
  );

  for (let frame = 0; frame < 60; frame += 1) {
    state = updateBoostCameraFovState(state, {
      isBoostActive: true,
      deltaSeconds: 1 / 60
    });
  }

  assertClose(
    state.feedbackIntensity ?? 0,
    ACTIVE_BOOST_CAMERA_FEEDBACK_INTENSITY,
    "active boost feedback reaches full strength"
  );

  state = updateBoostCameraFovState(state, {
    isBoostActive: false,
    deltaSeconds: 1 / 60
  });

  assertLessThan(
    state.feedbackIntensity ?? 0,
    ACTIVE_BOOST_CAMERA_FEEDBACK_INTENSITY,
    "inactive boost starts ending camera feedback"
  );

  for (let frame = 0; frame < 60; frame += 1) {
    state = updateBoostCameraFovState(state, {
      isBoostActive: false,
      deltaSeconds: 1 / 60
    });
  }

  assertClose(
    state.feedbackIntensity ?? 0,
    DEFAULT_BOOST_CAMERA_FEEDBACK_INTENSITY,
    "inactive boost ends camera feedback"
  );

  const inactiveFrame = createBoostCameraFeedbackFrame(state);

  assertClose(
    inactiveFrame.speedLineIntensity,
    DEFAULT_BOOST_CAMERA_FEEDBACK_INTENSITY,
    "inactive boost removes speed-line framing"
  );
  assertClose(
    inactiveFrame.cameraPunchScale,
    0,
    "inactive boost removes camera punch scale"
  );
}

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 0.001) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertGreaterThan(actual: number, expected: number, label: string): void {
  if (actual <= expected) {
    throw new Error(`${label}: expected > ${expected}, got ${actual}`);
  }
}

function assertLessThan(actual: number, expected: number, label: string): void {
  if (actual >= expected) {
    throw new Error(`${label}: expected < ${expected}, got ${actual}`);
  }
}

main();
