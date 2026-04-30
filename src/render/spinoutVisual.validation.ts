import {
  SPINOUT_VISUAL_MAX_FRAME_SECONDS,
  SPINOUT_VISUAL_MINOR_TIMESTAMP_JITTER_SECONDS,
  createDefaultRacerSpinoutVisualState,
  updateRacerSpinoutVisualState
} from "./spinoutVisual";
import {
  createTrackSceneRacerBananaSlipVisualFrame,
  createTrackSceneRacerBoostVisualFrame,
  createTrackSceneRacerEffectRenderState,
  createTrackSceneRacerShellHitVisualFrame,
  createTrackSceneRacerSharedEffectFrame,
  createTrackSceneRacerSpinoutReactionFrame,
  type TrackSceneRacerRenderState
} from "./trackSceneRenderer";

function main(): void {
  validateSpinoutVisualRotationAccumulatesDuringActiveSpinout();
  validateSpinoutVisualRotationFollowsAngularVelocityDirection();
  validateSpinoutVisualRotationResetsWhenSpinoutEnds();
  validateSpinoutVisualRotationIgnoresStalledFrames();
  validateSpinoutVisualAcceptsMinorTimestampJitter();
  validateTrackSceneSpinoutReactionKeepsJitterBounded();
  validateTrackSceneSharedEffectStateNormalizesTimers();
  validateTrackSceneSharedEffectFrameActivatesForLocalAndRemoteRacers();
  validateTrackSceneBoostVisualFrameActivatesForAnyRacerWithBoostEffect();
  validateTrackSceneBoostVisualFrameResetsWithoutBoostEffect();
  validateTrackSceneShellHitVisualFrameActivatesForAnyRacerWithActiveShellEffect();
  validateTrackSceneShellHitVisualFrameIgnoresInactiveOrNonShellEffects();
  validateTrackSceneBananaSlipVisualFrameActivatesForAnyRacerWithBananaEffect();
  validateTrackSceneBananaSlipVisualFrameIgnoresInactiveOrNonBananaEffects();
  validateTrackSceneSpinoutReactionFrameIsVisibleDuringStatusEffect();
  validateTrackSceneSpinoutReactionFrameResetsAfterStatusEffect();

  console.info("spinoutVisual=ok");
}

function validateSpinoutVisualRotationAccumulatesDuringActiveSpinout(): void {
  let state = createDefaultRacerSpinoutVisualState();

  state = updateRacerSpinoutVisualState(state, {
    spinoutSeconds: 0.8,
    spinoutAngularVelocity: 9,
    animationSeconds: 12
  });

  assertEqual(Number(state.active), 1, "spinout visual state activates");
  assertClose(state.spinRadians, 0, "first active frame starts from kart heading");

  state = updateRacerSpinoutVisualState(state, {
    spinoutSeconds: 0.78,
    spinoutAngularVelocity: 9,
    animationSeconds: 12 + 1 / 30
  });

  assertGreaterThan(
    Math.abs(state.spinRadians),
    0.2,
    "active spinout accumulates visible body rotation"
  );
}

function validateSpinoutVisualRotationFollowsAngularVelocityDirection(): void {
  let state = createDefaultRacerSpinoutVisualState();

  state = updateRacerSpinoutVisualState(state, {
    spinoutSeconds: 0.8,
    spinoutAngularVelocity: -6,
    animationSeconds: 2
  });
  state = updateRacerSpinoutVisualState(state, {
    spinoutSeconds: 0.7,
    spinoutAngularVelocity: -6,
    animationSeconds: 2.05
  });

  assertLessThan(
    state.spinRadians,
    0,
    "spinout visual rotation follows hit spin direction"
  );
}

function validateSpinoutVisualRotationResetsWhenSpinoutEnds(): void {
  let state = createDefaultRacerSpinoutVisualState();

  state = updateRacerSpinoutVisualState(state, {
    spinoutSeconds: 0.8,
    spinoutAngularVelocity: 8,
    animationSeconds: 4
  });
  state = updateRacerSpinoutVisualState(state, {
    spinoutSeconds: 0.7,
    spinoutAngularVelocity: 8,
    animationSeconds: 4.05
  });

  assertGreaterThan(
    Math.abs(state.spinRadians),
    0,
    "active spinout has visual rotation before reset"
  );

  state = updateRacerSpinoutVisualState(state, {
    spinoutSeconds: 0,
    spinoutAngularVelocity: 0,
    animationSeconds: 4.1
  });

  assertEqual(Number(state.active), 0, "expired spinout deactivates visual state");
  assertClose(state.spinRadians, 0, "expired spinout removes extra visual spin");
  assertEqual(
    state.lastAnimationSeconds,
    null,
    "expired spinout clears visual timestamp"
  );
}

function validateSpinoutVisualRotationIgnoresStalledFrames(): void {
  let state = createDefaultRacerSpinoutVisualState();

  state = updateRacerSpinoutVisualState(state, {
    spinoutSeconds: 1,
    spinoutAngularVelocity: 20,
    animationSeconds: 1
  });
  state = updateRacerSpinoutVisualState(state, {
    spinoutSeconds: 0.9,
    spinoutAngularVelocity: 20,
    animationSeconds: 1.5
  });

  assertLessThan(
    Math.abs(state.spinRadians),
    Math.PI,
    "spinout visual rotation clamps large frame gaps"
  );
}

function validateSpinoutVisualAcceptsMinorTimestampJitter(): void {
  let state = createDefaultRacerSpinoutVisualState();

  state = updateRacerSpinoutVisualState(state, {
    spinoutSeconds: 0.95,
    spinoutAngularVelocity: 10,
    animationSeconds: 8
  });
  state = updateRacerSpinoutVisualState(state, {
    spinoutSeconds: 0.92,
    spinoutAngularVelocity: 10,
    animationSeconds: 8.04
  });

  const stableRotation = state.spinRadians;
  const stableTimestamp = state.lastAnimationSeconds;

  state = updateRacerSpinoutVisualState(state, {
    spinoutSeconds: 0.9,
    spinoutAngularVelocity: 10,
    animationSeconds:
      8.04 - SPINOUT_VISUAL_MINOR_TIMESTAMP_JITTER_SECONDS / 2
  });

  assertEqual(Number(state.active), 1, "minor spin timestamp jitter stays active");
  assertClose(
    state.spinRadians,
    stableRotation,
    "minor spin timestamp jitter does not add extra spin"
  );
  assertEqual(
    state.lastAnimationSeconds,
    stableTimestamp,
    "minor spin timestamp jitter keeps the stable animation timestamp"
  );
}

function validateTrackSceneSpinoutReactionKeepsJitterBounded(): void {
  const frame = createTrackSceneRacerSpinoutReactionFrame(
    createTrackSceneRacer({
      slotIndex: 3,
      effectState: createTrackSceneRacerEffectRenderState({
        spinoutSeconds: 0.82,
        spinoutAngularVelocity: 12,
        spinoutRotationRadians: 2.4,
        lastHitItemType: "shell"
      })
    })
  );

  assertLessThanOrEqual(
    Math.abs(frame.bodyTiltX),
    0.22,
    "minor spin animation jitter keeps x-axis body tilt bounded"
  );
  assertLessThanOrEqual(
    Math.abs(frame.bodyTiltZ),
    0.22,
    "minor spin animation jitter keeps z-axis body tilt bounded"
  );
  assertLessThanOrEqual(
    frame.bodyLift,
    0.23,
    "minor spin animation jitter keeps body lift bounded"
  );
  assertLessThanOrEqual(
    SPINOUT_VISUAL_MAX_FRAME_SECONDS,
    0.12,
    "spinout visual clamps frame gaps so animation jitter remains minor"
  );
}

function validateTrackSceneSharedEffectStateNormalizesTimers(): void {
  const effectState = createTrackSceneRacerEffectRenderState({
    boostSeconds: 0.4,
    shieldSeconds: -1,
    stunSeconds: Number.NaN,
    spinoutSeconds: 0.7,
    spinoutAngularVelocity: 8,
    spinoutRotationRadians: 1.1,
    itemHitImmunitySeconds: 0.9,
    hitFeedbackSeconds: 0.3,
    lastHitItemType: "shell",
    recovering: false
  });

  assertClose(effectState.boostSeconds, 0.4, "boost timer is retained");
  assertClose(effectState.shieldSeconds, 0, "shield timer is clamped");
  assertClose(effectState.stunSeconds, 0, "invalid stun timer is sanitized");
  assertEqual(
    effectState.recovering,
    true,
    "active spinout makes shared effect state recovering"
  );
  assertEqual(
    effectState.lastHitItemType,
    "shell",
    "shared effect state keeps hit source item"
  );
}

function validateTrackSceneSharedEffectFrameActivatesForLocalAndRemoteRacers(): void {
  const localFrame = createTrackSceneRacerSharedEffectFrame(
    createTrackSceneRacer({
      role: "local-human",
      effectState: createTrackSceneRacerEffectRenderState({
        boostSeconds: 0.6,
        shieldSeconds: 0.5
      })
    })
  );
  const remoteFrame = createTrackSceneRacerSharedEffectFrame(
    createTrackSceneRacer({
      role: "remote-human",
      effectState: createTrackSceneRacerEffectRenderState({
        stunSeconds: 0.25,
        spinoutSeconds: 0.7,
        spinoutAngularVelocity: 8,
        hitFeedbackSeconds: 0.3,
        itemHitImmunitySeconds: 0.8,
        lastHitItemType: "banana"
      })
    })
  );

  assertEqual(Number(localFrame.boostActive), 1, "local boost effect binds");
  assertEqual(Number(localFrame.shieldActive), 1, "local shield effect binds");
  assertEqual(
    Number(remoteFrame.hitFeedbackActive),
    1,
    "remote hit feedback effect binds"
  );
  assertEqual(
    Number(remoteFrame.immunityActive),
    1,
    "remote immunity effect binds"
  );
  assertEqual(
    remoteFrame.hitFeedbackColor,
    "#ffd166",
    "remote hit feedback color follows shared hit source"
  );
}

function validateTrackSceneBoostVisualFrameActivatesForAnyRacerWithBoostEffect(): void {
  const boostedRoles: readonly TrackSceneRacerRenderState["role"][] = [
    "local-human",
    "remote-human",
    "ai"
  ];

  for (const role of boostedRoles) {
    const frame = createTrackSceneRacerBoostVisualFrame(
      createTrackSceneRacer({
        role,
        speed: role === "ai" ? 18 : 20,
        accentColor: role === "remote-human" ? "#74f7ff" : "#ffd166",
        effectState: createTrackSceneRacerEffectRenderState({
          boostSeconds: 0.52
        })
      })
    );

    assertEqual(
      Number(frame.active),
      1,
      `${role} active boost visual state binds`
    );
    assertGreaterThan(
      frame.ringOpacity,
      0.2,
      `${role} active boost emits visible ring`
    );
    assertGreaterThan(
      frame.wakeOpacity,
      0.15,
      `${role} active boost emits visible wake`
    );
    assertGreaterThan(
      frame.flameOpacity,
      0.5,
      `${role} active boost emits visible exhaust flames`
    );
  }
}

function validateTrackSceneBoostVisualFrameResetsWithoutBoostEffect(): void {
  const frame = createTrackSceneRacerBoostVisualFrame(
    createTrackSceneRacer({
      role: "remote-human",
      boostActive: false,
      effectState: createTrackSceneRacerEffectRenderState({
        boostSeconds: 0
      })
    })
  );

  assertEqual(Number(frame.active), 0, "inactive boost visual state resets");
  assertClose(frame.ringOpacity, 0, "inactive boost hides ring");
  assertClose(frame.wakeOpacity, 0, "inactive boost hides wake");
  assertClose(frame.flameOpacity, 0, "inactive boost hides exhaust flames");
}

function validateTrackSceneShellHitVisualFrameActivatesForAnyRacerWithActiveShellEffect(): void {
  const roles: readonly TrackSceneRacerRenderState["role"][] = [
    "local-human",
    "remote-human",
    "ai"
  ];

  for (const role of roles) {
    const frame = createTrackSceneRacerShellHitVisualFrame(
      createTrackSceneRacer({
        role,
        effectState: createTrackSceneRacerEffectRenderState({
          stunSeconds: 0.2,
          spinoutSeconds: 0.82,
          spinoutAngularVelocity: 8,
          spinoutRotationRadians: role === "remote-human" ? -0.8 : 1.1,
          hitFeedbackSeconds: 0.28,
          lastHitItemType: "shell",
          recovering: true
        })
      })
    );

    assertEqual(
      Number(frame.active),
      1,
      `${role} shell-hit visual activates`
    );
    assertGreaterThan(
      frame.ringOpacity,
      0.35,
      `${role} shell-hit visual emits visible impact ring`
    );
    assertGreaterThan(
      frame.sparkScale,
      0.7,
      `${role} shell-hit visual emits visible impact sparks`
    );
    assertEqual(frame.color, "#7cf8a5", `${role} shell-hit color is shell green`);
  }
}

function validateTrackSceneShellHitVisualFrameIgnoresInactiveOrNonShellEffects(): void {
  const bananaFrame = createTrackSceneRacerShellHitVisualFrame(
    createTrackSceneRacer({
      role: "ai",
      effectState: createTrackSceneRacerEffectRenderState({
        spinoutSeconds: 0.82,
        spinoutAngularVelocity: 8,
        hitFeedbackSeconds: 0.3,
        lastHitItemType: "banana",
        recovering: true
      })
    })
  );
  const inactiveShellFrame = createTrackSceneRacerShellHitVisualFrame(
    createTrackSceneRacer({
      role: "remote-human",
      effectState: createTrackSceneRacerEffectRenderState({
        lastHitItemType: "shell",
        recovering: false
      })
    })
  );

  assertEqual(
    Number(bananaFrame.active),
    0,
    "banana spinout does not use shell-hit visual state"
  );
  assertEqual(
    Number(inactiveShellFrame.active),
    0,
    "inactive shell source does not leave stale shell-hit visual state"
  );
  assertClose(
    inactiveShellFrame.ringOpacity,
    0,
    "inactive shell-hit visual hides impact ring"
  );
  assertClose(
    inactiveShellFrame.sparkScale,
    0,
    "inactive shell-hit visual hides impact sparks"
  );
}

function validateTrackSceneBananaSlipVisualFrameActivatesForAnyRacerWithBananaEffect(): void {
  const roles: readonly TrackSceneRacerRenderState["role"][] = [
    "local-human",
    "remote-human",
    "ai"
  ];

  for (const role of roles) {
    const frame = createTrackSceneRacerBananaSlipVisualFrame(
      createTrackSceneRacer({
        role,
        slotIndex: role === "remote-human" ? 1 : role === "ai" ? 2 : 0,
        effectState: createTrackSceneRacerEffectRenderState({
          stunSeconds: 0.16,
          spinoutSeconds: 0.74,
          spinoutAngularVelocity: -7,
          spinoutRotationRadians: role === "remote-human" ? -0.7 : 0.9,
          hitFeedbackSeconds: 0.24,
          lastHitItemType: "banana",
          recovering: true
        })
      })
    );

    assertEqual(
      Number(frame.active),
      1,
      `${role} banana-slip visual activates`
    );
    assertEqual(frame.color, "#ffd166", `${role} banana-slip color is yellow`);
    assertGreaterThan(
      frame.ringOpacity,
      0.3,
      `${role} banana-slip visual emits visible ring`
    );
    assertGreaterThan(
      frame.skidOpacity,
      0.3,
      `${role} banana-slip visual emits visible skid marks`
    );
    assertGreaterThan(
      Math.abs(frame.bodyLateralOffset),
      0.01,
      `${role} banana-slip visual wobbles the kart body`
    );
  }
}

function validateTrackSceneBananaSlipVisualFrameIgnoresInactiveOrNonBananaEffects(): void {
  const shellFrame = createTrackSceneRacerBananaSlipVisualFrame(
    createTrackSceneRacer({
      role: "remote-human",
      effectState: createTrackSceneRacerEffectRenderState({
        spinoutSeconds: 0.82,
        spinoutAngularVelocity: 8,
        hitFeedbackSeconds: 0.3,
        lastHitItemType: "shell",
        recovering: true
      })
    })
  );
  const inactiveBananaFrame = createTrackSceneRacerBananaSlipVisualFrame(
    createTrackSceneRacer({
      role: "ai",
      effectState: createTrackSceneRacerEffectRenderState({
        lastHitItemType: "banana",
        recovering: false
      })
    })
  );

  assertEqual(
    Number(shellFrame.active),
    0,
    "shell spinout does not use banana-slip visual state"
  );
  assertEqual(
    Number(inactiveBananaFrame.active),
    0,
    "inactive banana source does not leave stale banana-slip visual state"
  );
  assertClose(
    inactiveBananaFrame.ringOpacity,
    0,
    "inactive banana-slip visual hides ring"
  );
  assertClose(
    inactiveBananaFrame.skidOpacity,
    0,
    "inactive banana-slip visual hides skid marks"
  );
}

function validateTrackSceneSpinoutReactionFrameIsVisibleDuringStatusEffect(): void {
  const frame = createTrackSceneRacerSpinoutReactionFrame(
    createTrackSceneRacer({
      effectState: createTrackSceneRacerEffectRenderState({
        spinoutSeconds: 0.82,
        spinoutAngularVelocity: 8,
        spinoutRotationRadians: 1.2,
        lastHitItemType: "shell"
      })
    })
  );

  assertEqual(Number(frame.active), 1, "track scene spinout reaction activates");
  assertClose(
    frame.bodyRotationRadians,
    1.2,
    "track scene body uses accumulated spinout rotation"
  );
  assertGreaterThan(
    frame.bodyLift,
    0.03,
    "track scene spinout lifts the kart body visibly"
  );
  assertGreaterThan(
    frame.ringOpacity,
    0.35,
    "track scene spinout emits a visible reaction ring"
  );
  assertGreaterThan(
    frame.sparkScale,
    0.7,
    "track scene spinout emits visible orbit sparks"
  );
}

function validateTrackSceneSpinoutReactionFrameResetsAfterStatusEffect(): void {
  const frame = createTrackSceneRacerSpinoutReactionFrame(
    createTrackSceneRacer({
      effectState: createTrackSceneRacerEffectRenderState({
        spinoutSeconds: 0,
        spinoutAngularVelocity: 8,
        spinoutRotationRadians: 1.2
      })
    })
  );

  assertEqual(Number(frame.active), 0, "expired track scene reaction deactivates");
  assertClose(
    frame.bodyRotationRadians,
    0,
    "expired track scene reaction clears body rotation"
  );
  assertClose(frame.bodyLift, 0, "expired track scene reaction clears body lift");
  assertClose(
    frame.ringOpacity,
    0,
    "expired track scene reaction hides the ring"
  );
  assertClose(
    frame.sparkScale,
    0,
    "expired track scene reaction hides orbit sparks"
  );
}

function createTrackSceneRacer(
  overrides: Partial<TrackSceneRacerRenderState>
): TrackSceneRacerRenderState {
  return {
    racerId: overrides.racerId ?? "racer-spinout",
    slotIndex: overrides.slotIndex ?? 0,
    role: overrides.role ?? "local-human",
    displayName: overrides.displayName ?? "Spinout Test",
    color: overrides.color ?? "#ff5c8a",
    accentColor: overrides.accentColor ?? "#ffd166",
    position: overrides.position ?? { x: 0, y: 0, z: 0 },
    headingRadians: overrides.headingRadians ?? 0,
    speed: overrides.speed ?? 12,
    boostActive: overrides.boostActive ?? false,
    heldItem: overrides.heldItem ?? null,
    indicatorLabel: overrides.indicatorLabel ?? null,
    racingNumber: overrides.racingNumber ?? null,
    effectState:
      overrides.effectState ?? createTrackSceneRacerEffectRenderState()
  };
}

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 0.001) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
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

function assertLessThanOrEqual(
  actual: number,
  expected: number,
  label: string
): void {
  if (actual > expected) {
    throw new Error(`${label}: expected <= ${expected}, got ${actual}`);
  }
}

main();
