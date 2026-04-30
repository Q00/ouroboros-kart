import {
  createVisibleBananaHazardRenderStates,
  type TrackSceneBananaHazardRenderState,
  type TrackSceneVisibleBananaHazardRenderState
} from "./trackSceneRenderer";

function main(): void {
  const storedPosition = validateActiveHazardsRenderFromStoredPosition();
  const filteredCount = validateInactiveAndInvalidHazardsAreOmitted();

  console.info(
    [
      "bananaHazardVisual=ok",
      `storedX=${storedPosition.x.toFixed(2)}`,
      `storedZ=${storedPosition.z.toFixed(2)}`,
      `filtered=${filteredCount}`
    ].join(" ")
  );
}

function validateActiveHazardsRenderFromStoredPosition(): {
  readonly x: number;
  readonly z: number;
} {
  const movingPosition = { x: 99, y: 0, z: -99 };
  const stablePosition = { x: 6.25, y: 0, z: -3.5 };
  const activeHazard = createBananaHazard({
    id: "banana-active",
    active: true,
    position: movingPosition,
    stablePosition,
    orientationRadians: Math.PI / 4
  });
  const inactiveHazard = createBananaHazard({
    id: "banana-inactive",
    active: false,
    position: { x: -2, y: 0, z: 4 },
    stablePosition: { x: -2, y: 0, z: 4 }
  });
  const visibleHazards = createVisibleBananaHazardRenderStates([
    inactiveHazard,
    activeHazard
  ]);
  const visibleHazard = requireSingleHazard(visibleHazards);

  assertEqual(visibleHazard.id, activeHazard.id, "active hazard id");
  assertClose(
    visibleHazard.position.x,
    stablePosition.x,
    "banana hazard render x uses stable position"
  );
  assertClose(
    visibleHazard.position.z,
    stablePosition.z,
    "banana hazard render z uses stable position"
  );

  if (visibleHazard.position === activeHazard.stablePosition) {
    throw new Error("banana hazard render position should be copied");
  }

  return visibleHazard.position;
}

function validateInactiveAndInvalidHazardsAreOmitted(): number {
  const visibleHazards = createVisibleBananaHazardRenderStates([
    createBananaHazard({
      id: "banana-inactive",
      active: false,
      position: { x: 0, y: 0, z: 0 },
      stablePosition: { x: 0, y: 0, z: 0 }
    }),
    createBananaHazard({
      id: "banana-invalid",
      active: true,
      position: { x: 1, y: 0, z: 1 },
      stablePosition: { x: Number.NaN, y: 0, z: 1 }
    })
  ]);

  assertEqual(
    visibleHazards.length,
    0,
    "inactive and invalid hazards are omitted"
  );

  return 2;
}

function createBananaHazard(
  overrides: Partial<TrackSceneBananaHazardRenderState> & {
    readonly id: string;
  }
): TrackSceneBananaHazardRenderState {
  return {
    id: overrides.id,
    active: overrides.active ?? true,
    position: overrides.position ?? { x: 0, y: 0, z: 0 },
    stablePosition: overrides.stablePosition ?? { x: 0, y: 0, z: 0 },
    radius: overrides.radius ?? 0.78,
    orientationRadians: overrides.orientationRadians ?? 0
  };
}

function requireSingleHazard(
  hazards: readonly TrackSceneVisibleBananaHazardRenderState[]
): TrackSceneVisibleBananaHazardRenderState {
  assertEqual(hazards.length, 1, "single visible hazard");

  const hazard = hazards[0];

  if (hazard === undefined) {
    throw new Error("Expected one visible banana hazard.");
  }

  return hazard;
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

main();
