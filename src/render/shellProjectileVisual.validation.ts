import {
  createShellProjectileRemovalVisualFrame,
  createShellProjectileVisualFrame
} from "./shellProjectileVisual";

function main(): void {
  validateShellSpinStartsFromLaunchAge();
  validateShellDirectionIsNormalizedForDirectionalMotion();
  validateShellSpinDirectionFollowsTravelDirection();
  validateStoppedShellDoesNotAnimateAsMovingProjectile();
  validateShellRemovalImpactFrameStaysActiveUntilDuration();
  validateShellRemovalExpirationFrameIsSofterThanImpact();

  console.info("shellProjectileVisual=ok");
}

function validateShellSpinStartsFromLaunchAge(): void {
  const launchFrame = createShellProjectileVisualFrame({
    ageSeconds: 0,
    speed: 38,
    direction: { x: 1, z: 0 },
    isInteractable: false
  });
  const nextFrame = createShellProjectileVisualFrame({
    ageSeconds: 1 / 60,
    speed: 38,
    direction: { x: 1, z: 0 },
    isInteractable: false
  });

  assertEqual(launchFrame.spinRadians, 0, "launch frame starts at zero spin");
  assertGreaterThan(
    Math.abs(nextFrame.spinRadians),
    0,
    "next frame advances shell spin from launch age"
  );
  assertNotEqual(
    nextFrame.bankRadians,
    launchFrame.bankRadians,
    "next frame advances directional bank animation"
  );
}

function validateShellDirectionIsNormalizedForDirectionalMotion(): void {
  const frame = createShellProjectileVisualFrame({
    ageSeconds: 0.2,
    speed: 30,
    direction: { x: 3, z: 4 },
    isInteractable: true
  });

  assertClose(
    Math.hypot(frame.direction.x, frame.direction.z),
    1,
    "shell visual frame carries normalized travel direction"
  );
}

function validateShellSpinDirectionFollowsTravelDirection(): void {
  const forwardFrame = createShellProjectileVisualFrame({
    ageSeconds: 0.2,
    speed: 30,
    direction: { x: 1, z: 0 },
    isInteractable: true
  });
  const reverseFrame = createShellProjectileVisualFrame({
    ageSeconds: 0.2,
    speed: 30,
    direction: { x: -1, z: -1 },
    isInteractable: true
  });

  assertEqual(
    forwardFrame.spinDirection,
    1,
    "forward shell keeps positive spin direction"
  );
  assertEqual(
    reverseFrame.spinDirection,
    -1,
    "reverse shell flips spin direction"
  );
  assertLessThan(
    forwardFrame.spinRadians * reverseFrame.spinRadians,
    0,
    "opposite travel directions create opposite visible spin"
  );
}

function validateStoppedShellDoesNotAnimateAsMovingProjectile(): void {
  const frame = createShellProjectileVisualFrame({
    ageSeconds: 0.5,
    speed: 0,
    direction: { x: 1, z: 0 },
    isInteractable: false
  });

  assertEqual(frame.spinRadians, 0, "stopped shell spin is suppressed");
  assertEqual(frame.bankRadians, 0, "stopped shell bank is suppressed");
}

function validateShellRemovalImpactFrameStaysActiveUntilDuration(): void {
  const activeFrame = createShellProjectileRemovalVisualFrame({
    kind: "impact",
    ageSeconds: 0.18,
    durationSeconds: 0.42
  });
  const expiredFrame = createShellProjectileRemovalVisualFrame({
    kind: "impact",
    ageSeconds: 0.42,
    durationSeconds: 0.42
  });

  assertEqual(
    activeFrame.isActive,
    true,
    "shell impact visual remains active before duration"
  );
  assertEqual(
    expiredFrame.isActive,
    false,
    "shell impact visual stops at duration"
  );
  assertGreaterThan(
    activeFrame.opacity,
    expiredFrame.opacity,
    "shell impact visual fades out by expiration"
  );
  assertGreaterThan(
    expiredFrame.ringRadiusScale,
    activeFrame.ringRadiusScale,
    "shell impact ring expands through its lifetime"
  );
}

function validateShellRemovalExpirationFrameIsSofterThanImpact(): void {
  const impactFrame = createShellProjectileRemovalVisualFrame({
    kind: "impact",
    ageSeconds: 0.08,
    durationSeconds: 0.42
  });
  const expirationFrame = createShellProjectileRemovalVisualFrame({
    kind: "expiration",
    ageSeconds: 0.08,
    durationSeconds: 0.42
  });

  assertGreaterThan(
    impactFrame.opacity,
    expirationFrame.opacity,
    "impact shell removal is brighter than expiration"
  );
  assertGreaterThan(
    impactFrame.sparkDistanceScale,
    expirationFrame.sparkDistanceScale,
    "impact shell removal sends sparks farther than expiration"
  );
}

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 0.000001) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`
    );
  }
}

function assertNotEqual(actual: number, expected: number, label: string): void {
  if (actual === expected) {
    throw new Error(`${label}: did not expect ${expected}`);
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
