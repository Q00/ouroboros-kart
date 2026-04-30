import {
  createCombatFeedbackPulseFrame,
  evaluateCombatNearMissFeedback,
  getCombatFeedbackDefaultDurationSeconds
} from "./combatFeedback";

function main(): void {
  validateHitPulseIsBrighterThanLaunchPulse();
  validatePulseExpiresAtConfiguredDuration();
  validateNearMissOnlyTriggersOutsideCollisionRadius();
  validateNearMissClosenessScalesTowardInnerRadius();

  console.info("combatFeedback=ok");
}

function validateHitPulseIsBrighterThanLaunchPulse(): void {
  const launch = createCombatFeedbackPulseFrame({
    kind: "shell-launch",
    ageSeconds: 0.08
  });
  const hit = createCombatFeedbackPulseFrame({
    kind: "shell-hit",
    ageSeconds: 0.08
  });

  assertGreaterThan(
    hit.opacity,
    launch.opacity,
    "shell hit pulse is brighter than launch pulse"
  );
  assertGreaterThan(
    hit.sparkDistanceScale,
    launch.sparkDistanceScale,
    "shell hit pulse throws sparks farther than launch pulse"
  );
}

function validatePulseExpiresAtConfiguredDuration(): void {
  const durationSeconds = getCombatFeedbackDefaultDurationSeconds("banana-drop");
  const activeFrame = createCombatFeedbackPulseFrame({
    kind: "banana-drop",
    ageSeconds: durationSeconds - 0.01
  });
  const expiredFrame = createCombatFeedbackPulseFrame({
    kind: "banana-drop",
    ageSeconds: durationSeconds
  });

  assertEqual(
    activeFrame.isActive,
    true,
    "banana drop feedback remains active before duration"
  );
  assertEqual(
    expiredFrame.isActive,
    false,
    "banana drop feedback ends at duration"
  );
}

function validateNearMissOnlyTriggersOutsideCollisionRadius(): void {
  const collision = evaluateCombatNearMissFeedback({
    distance: 2,
    itemRadius: 0.8,
    racerRadius: 1.4,
    extraRadius: 3.5,
    itemArmed: true,
    itemActive: true
  });
  const nearMiss = evaluateCombatNearMissFeedback({
    distance: 2.35,
    itemRadius: 0.8,
    racerRadius: 1.4,
    extraRadius: 3.5,
    itemArmed: true,
    itemActive: true
  });
  const farMiss = evaluateCombatNearMissFeedback({
    distance: 6.1,
    itemRadius: 0.8,
    racerRadius: 1.4,
    extraRadius: 3.5,
    itemArmed: true,
    itemActive: true
  });

  assertEqual(
    collision.isNearMiss,
    false,
    "overlapping item is handled as a hit, not a near miss"
  );
  assertEqual(
    nearMiss.isNearMiss,
    true,
    "armed item inside read radius creates a near miss cue"
  );
  assertEqual(
    farMiss.isNearMiss,
    false,
    "item outside read radius does not create a near miss cue"
  );
}

function validateNearMissClosenessScalesTowardInnerRadius(): void {
  const closeMiss = evaluateCombatNearMissFeedback({
    distance: 2.3,
    itemRadius: 0.8,
    racerRadius: 1.4,
    extraRadius: 3.5,
    itemArmed: true,
    itemActive: true
  });
  const wideMiss = evaluateCombatNearMissFeedback({
    distance: 5.2,
    itemRadius: 0.8,
    racerRadius: 1.4,
    extraRadius: 3.5,
    itemArmed: true,
    itemActive: true
  });

  assertGreaterThan(
    closeMiss.closenessRatio,
    wideMiss.closenessRatio,
    "closer near miss produces stronger feedback"
  );
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`
    );
  }
}

function assertGreaterThan(actual: number, expected: number, label: string): void {
  if (actual <= expected) {
    throw new Error(`${label}: expected > ${expected}, got ${actual}`);
  }
}

main();
