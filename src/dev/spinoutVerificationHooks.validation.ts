import {
  DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING,
  DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING,
  SHELL_SPINOUT_FEEL_RANGE_SECONDS
} from "../config/gameplayTuning";
import {
  createRaceSession,
  debugResolveRacerControlInputs
} from "../race/raceSession";
import {
  installSpinoutVerificationHooks,
  type SpinoutVerificationGlobalTarget
} from "./spinoutVerificationHooks";

function main(): void {
  validateSpinoutVerificationHooksExposeInspectionAndTrigger();
  validateSpinoutVerificationHooksOverrideRuntimeTuning();
  validateSpinoutVerificationTuningAdjustmentsChangeBehavior();

  console.info("spinoutVerificationHooks=ok");
}

function validateSpinoutVerificationHooksExposeInspectionAndTrigger(): void {
  const session = createRaceSession();
  const localRacer = requireValue(
    session.humanRacerStates[0],
    "default local human racer"
  );
  const target: SpinoutVerificationGlobalTarget = {};
  let changeNotifications = 0;
  let logMessages = 0;
  const dispose = installSpinoutVerificationHooks(target, {
    getRaceSession: () => session,
    getLocalRacerId: () => localRacer.id,
    isAuthoritative: () => true,
    onChange: () => {
      changeNotifications += 1;
    },
    log: () => {
      logMessages += 1;
    }
  });
  const hooks = requireValue(target.kartSpinout, "spin-out hook");

  assertEqual(
    target.kartSpinoutVerification,
    hooks,
    "compatibility hook aliases the short hook"
  );

  const inspection = hooks.inspect();

  assertEqual(Number(inspection.authoritative), 1, "hook reports host authority");
  assertEqual(
    inspection.localRacerId,
    localRacer.id,
    "inspection reports local racer id"
  );
  assertEqual(inspection.racers.length, 4, "inspection lists all racers");
  assert(
    hooks.help.some((entry) => entry.includes("trigger")),
    "help lists trigger usage"
  );

  const result = hooks.trigger({
    target: "local",
    sourceItemType: "shell",
    durationSeconds: 1.1,
    spinStrengthRadians: 5.5,
    spinDirection: "right"
  });
  const spunRacer = requireValue(
    session.getRacerState(localRacer.id),
    "spun local racer"
  );

  assertEqual(result.racerId, localRacer.id, "trigger targets local racer");
  assertEqual(Number(result.applied), 1, "trigger applies spin-out");
  assertClose(spunRacer.spinoutSeconds, 1.1, "trigger applies duration");
  assertClose(
    spunRacer.spinoutAngularVelocity,
    5.5 / 1.1,
    "trigger applies spin strength as angular velocity"
  );
  assertEqual(changeNotifications, 1, "trigger notifies render hook");
  assertEqual(logMessages, 1, "trigger logs for console playtesting");

  dispose();
  assertEqual(target.kartSpinout, undefined, "dispose removes short hook");
  assertEqual(
    target.kartSpinoutVerification,
    undefined,
    "dispose removes compatibility hook"
  );
}

function validateSpinoutVerificationHooksOverrideRuntimeTuning(): void {
  const session = createRaceSession();
  const target: SpinoutVerificationGlobalTarget = {};
  const dispose = installSpinoutVerificationHooks(target, {
    getRaceSession: () => session,
    getLocalRacerId: () => null,
    isAuthoritative: () => false
  });
  const hooks = requireValue(target.kartSpinout, "spin-out hook");
  const tunedInspection = hooks.setTuning({
    shell: {
      durationSeconds: 1.45,
      spinStrengthRadians: 7.25
    },
    banana: {
      hitSpinRadians: 1.15,
      durationSeconds: 0.72,
      spinStrengthRadians: 4.1
    }
  });

  assertEqual(
    Number(tunedInspection.authoritative),
    0,
    "guest inspection exposes non-authoritative status"
  );
  assertClose(
    tunedInspection.tuning.shell.durationSeconds,
    1.45,
    "shell duration override is inspectable"
  );
  assertClose(
    tunedInspection.tuning.shell.spinStrengthRadians,
    7.25,
    "shell spin strength override is inspectable"
  );
  assertClose(
    tunedInspection.tuning.banana.hitSpinRadians,
    1.15,
    "banana hit spin override is inspectable"
  );
  assertClose(
    tunedInspection.tuning.banana.durationSeconds,
    0.72,
    "banana duration override is inspectable"
  );
  assertClose(
    tunedInspection.tuning.banana.spinStrengthRadians,
    4.1,
    "banana spin strength override is inspectable"
  );

  const bananaTarget = requireValue(session.racerStates[1], "banana target racer");
  const bananaResult = hooks.trigger({
    slotIndex: bananaTarget.slotIndex,
    sourceItemType: "banana",
    spinDirection: "left"
  });

  assertEqual(
    bananaResult.racerId,
    bananaTarget.id,
    "slot trigger selects requested racer"
  );
  assertClose(
    bananaTarget.spinoutSeconds,
    0.72,
    "banana trigger uses overridden duration"
  );
  assertClose(
    bananaTarget.spinoutAngularVelocity,
    -4.1 / 0.72,
    "banana trigger uses overridden strength and direction"
  );
  assertClose(
    bananaResult.spinStrengthRadians,
    4.1,
    "trigger result reports active spin strength"
  );

  const resetInspection = hooks.resetTuning("shell");

  assertClose(
    resetInspection.tuning.shell.durationSeconds,
    DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds,
    "shell reset restores default duration"
  );
  assertClose(
    resetInspection.tuning.shell.spinStrengthRadians,
    DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutRadians,
    "shell reset restores default strength"
  );
  assertClose(
    resetInspection.tuning.banana.durationSeconds,
    0.72,
    "targeted shell reset leaves banana override intact"
  );

  const fullResetInspection = hooks.resetTuning();

  assertClose(
    fullResetInspection.tuning.banana.hitSpinRadians,
    DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING.spinRadians,
    "full reset restores banana hit spin"
  );
  assertClose(
    fullResetInspection.tuning.banana.spinStrengthRadians,
    DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING.spinoutRadians,
    "full reset restores banana spin strength"
  );

  dispose();
}

interface SpinoutTuningBehaviorSample {
  readonly triggeredSpinoutSeconds: number;
  readonly spinoutSeconds: number;
  readonly spinoutAngularVelocity: number;
  readonly resolvedThrottle: number;
  readonly resolvedBrake: number;
  readonly resolvedSteer: number;
  readonly resolvedCoastDecelerationMultiplier: number;
  readonly headingDeltaRadians: number;
}

function validateSpinoutVerificationTuningAdjustmentsChangeBehavior(): void {
  const referenceStrengthRadians =
    DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutRadians;
  const weakStrengthRadians = referenceStrengthRadians * 0.65;
  const sameRemainingSeconds = SHELL_SPINOUT_FEEL_RANGE_SECONDS.min / 2;
  const shortDurationSample = sampleShellSpinoutTuningBehavior({
    durationSeconds: SHELL_SPINOUT_FEEL_RANGE_SECONDS.min,
    spinStrengthRadians: referenceStrengthRadians,
    remainingSeconds: sameRemainingSeconds
  });
  const longDurationSample = sampleShellSpinoutTuningBehavior({
    durationSeconds: SHELL_SPINOUT_FEEL_RANGE_SECONDS.max,
    spinStrengthRadians: referenceStrengthRadians,
    remainingSeconds: sameRemainingSeconds
  });
  const weakStrengthSample = sampleShellSpinoutTuningBehavior({
    durationSeconds: DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds,
    spinStrengthRadians: weakStrengthRadians
  });
  const strongStrengthSample = sampleShellSpinoutTuningBehavior({
    durationSeconds: DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds,
    spinStrengthRadians: referenceStrengthRadians
  });

  assertGreaterThan(
    longDurationSample.triggeredSpinoutSeconds,
    shortDurationSample.triggeredSpinoutSeconds,
    "longer spin-out duration changes the applied timer"
  );
  assertLessThan(
    Math.abs(longDurationSample.spinoutAngularVelocity),
    Math.abs(shortDurationSample.spinoutAngularVelocity),
    "longer spin-out duration lowers per-frame spin at equal total strength"
  );
  assertGreaterThan(
    shortDurationSample.resolvedBrake,
    longDurationSample.resolvedBrake,
    "longer spin-out duration changes automatic braking behavior"
  );
  assertGreaterThan(
    shortDurationSample.resolvedCoastDecelerationMultiplier,
    longDurationSample.resolvedCoastDecelerationMultiplier,
    "longer spin-out duration changes coasting loss behavior"
  );
  assertLessThan(
    Math.abs(longDurationSample.headingDeltaRadians),
    Math.abs(shortDurationSample.headingDeltaRadians),
    "longer spin-out duration changes visible rotation behavior"
  );

  assertClose(
    weakStrengthSample.spinoutSeconds,
    strongStrengthSample.spinoutSeconds,
    "strength samples keep duration fixed"
  );
  assertGreaterThan(
    Math.abs(strongStrengthSample.spinoutAngularVelocity),
    Math.abs(weakStrengthSample.spinoutAngularVelocity),
    "stronger spin-out increases angular velocity"
  );
  assertGreaterThan(
    Math.abs(strongStrengthSample.headingDeltaRadians),
    Math.abs(weakStrengthSample.headingDeltaRadians),
    "stronger spin-out changes visible rotation behavior"
  );
  assertGreaterThan(
    strongStrengthSample.resolvedBrake,
    weakStrengthSample.resolvedBrake,
    "stronger spin-out changes automatic braking behavior"
  );
  assertGreaterThan(
    strongStrengthSample.resolvedCoastDecelerationMultiplier,
    weakStrengthSample.resolvedCoastDecelerationMultiplier,
    "stronger spin-out changes coasting loss behavior"
  );
  assertEqual(
    strongStrengthSample.resolvedThrottle,
    0,
    "spin-out suppresses throttle input"
  );
  assertEqual(
    strongStrengthSample.resolvedSteer,
    0,
    "spin-out suppresses steering input"
  );
}

function sampleShellSpinoutTuningBehavior(options: {
  readonly durationSeconds: number;
  readonly spinStrengthRadians: number;
  readonly remainingSeconds?: number;
}): SpinoutTuningBehaviorSample {
  const session = createRaceSession();
  const localRacer = requireValue(
    session.humanRacerStates[0],
    "spin-out behavior sample racer"
  );
  const target: SpinoutVerificationGlobalTarget = {};
  const dispose = installSpinoutVerificationHooks(target, {
    getRaceSession: () => session,
    getLocalRacerId: () => localRacer.id,
    isAuthoritative: () => true
  });
  const hooks = requireValue(target.kartSpinout, "spin-out behavior sample hook");

  try {
    hooks.setTuning({
      shell: {
        durationSeconds: options.durationSeconds,
        spinStrengthRadians: options.spinStrengthRadians
      }
    });
    const triggerResult = hooks.trigger({
      target: "local",
      sourceItemType: "shell",
      spinDirection: "right"
    });

    const remainingSeconds =
      options.remainingSeconds ?? options.durationSeconds;
    const spinoutEffect = requireValue(
      localRacer.timedEffects.spinout,
      "active spin-out behavior sample effect"
    );

    localRacer.spinoutSeconds = remainingSeconds;
    spinoutEffect.remainingSeconds = remainingSeconds;
    session.setHumanInput(localRacer.id, {
      throttle: 1,
      steer: 1,
      brake: 0
    });

    const resolvedControls = debugResolveRacerControlInputs(localRacer);

    session.setHumanInput(localRacer.id, {
      throttle: 0,
      steer: 0,
      brake: 0
    });

    const headingBeforeTick = localRacer.headingRadians;

    session.tick(1 / 60);

    return {
      triggeredSpinoutSeconds: triggerResult.spinoutSeconds,
      spinoutSeconds: localRacer.spinoutSeconds,
      spinoutAngularVelocity: localRacer.spinoutAngularVelocity,
      resolvedThrottle: resolvedControls.throttle,
      resolvedBrake: resolvedControls.brake,
      resolvedSteer: resolvedControls.steer,
      resolvedCoastDecelerationMultiplier:
        resolvedControls.coastDecelerationMultiplier,
      headingDeltaRadians: localRacer.headingRadians - headingBeforeTick
    };
  } finally {
    dispose();
  }
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Missing ${label}.`);
  }

  return value;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertClose(actual: number, expected: number, message: string): void {
  if (Math.abs(actual - expected) > 0.000_001) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertGreaterThan(actual: number, expectedLowerBound: number, message: string): void {
  if (actual <= expectedLowerBound) {
    throw new Error(
      `${message}: expected > ${expectedLowerBound}, got ${actual}`
    );
  }
}

function assertLessThan(actual: number, expectedUpperBound: number, message: string): void {
  if (actual >= expectedUpperBound) {
    throw new Error(
      `${message}: expected < ${expectedUpperBound}, got ${actual}`
    );
  }
}

main();
