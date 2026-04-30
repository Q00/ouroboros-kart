import {
  createKartCollisionBounds,
  createKartCollisionDimensions,
  detectKartCollisionBoundsCircleOverlap,
  detectKartCollisionBoundsOverlap,
  detectKartCollisionBoundsPairOverlaps,
  hasKartCollisionBoundsCircleOverlap,
  hasKartCollisionBoundsOverlap,
  type KartCollisionBounds
} from "./kartCollisionBounds";

interface ValidationKart {
  readonly id: string;
  readonly controller: "human" | "ai";
  readonly collisionBounds: KartCollisionBounds;
}

function main(): void {
  const direct = validateDirectKartOverlap();
  const precision = validateBroadRadiusFalsePositiveRejected();
  const vertical = validateVerticalSeparationRejected();
  const pairwise = validatePairwiseHumanAiOverlapDetection();
  const itemBox = validateKartCircleItemBoxOverlapDetection();
  const itemBoxPrecision = validateKartCircleRejectsBroadRadiusFalsePositive();

  console.info(
    [
      "kartCollisionBounds=ok",
      `directDepth=${direct.depth.toFixed(3)}`,
      `directNormal=(${direct.normalX.toFixed(1)},${direct.normalZ.toFixed(
        1
      )})`,
      `broadRadiusRejected=${precision.broadRadiusRejected}`,
      `verticalRejected=${vertical.verticalRejected}`,
      `pairwise=${pairwise.overlapCount}`,
      `pair=${pairwise.pairId}`,
      `itemBoxDepth=${itemBox.depth.toFixed(3)}`,
      `itemBoxBroadRadiusRejected=${itemBoxPrecision.broadRadiusRejected}`
    ].join(" ")
  );
}

function validateDirectKartOverlap(): {
  readonly depth: number;
  readonly normalX: number;
  readonly normalZ: number;
} {
  const dimensions = createKartCollisionDimensions({
    length: 4,
    width: 2,
    height: 1.2
  });
  const left = createKartCollisionBounds(
    { x: 0, y: 0.5, z: 0 },
    0,
    dimensions
  );
  const right = createKartCollisionBounds(
    { x: 1.75, y: 0.5, z: 0 },
    0,
    dimensions
  );
  const overlap = requireValue(
    detectKartCollisionBoundsOverlap(left, right),
    "expected direct kart overlap"
  );

  assertEqual(
    hasKartCollisionBoundsOverlap(left, right),
    true,
    "direct kart overlap predicate"
  );
  assertAlmostEqual(overlap.depth, 0.25, "direct overlap depth");
  assertAlmostEqual(overlap.normal.x, -1, "direct overlap normal x");
  assertAlmostEqual(overlap.normal.z, 0, "direct overlap normal z");
  assertAlmostEqual(overlap.verticalOverlap, 1.2, "direct vertical overlap");

  return {
    depth: overlap.depth,
    normalX: overlap.normal.x,
    normalZ: overlap.normal.z
  };
}

function validateBroadRadiusFalsePositiveRejected(): {
  readonly broadRadiusRejected: boolean;
} {
  const dimensions = createKartCollisionDimensions({
    length: 4,
    width: 2,
    height: 1.2
  });
  const left = createKartCollisionBounds(
    { x: 0, y: 0.5, z: 0 },
    0,
    dimensions
  );
  const right = createKartCollisionBounds(
    { x: 2.05, y: 0.5, z: 0 },
    0,
    dimensions
  );
  const broadRadiusWouldOverlap =
    getPlanarDistance(left.center, right.center) <
    left.boundingRadius + right.boundingRadius;
  const overlap = detectKartCollisionBoundsOverlap(left, right);

  assertEqual(
    broadRadiusWouldOverlap,
    true,
    "setup overlaps broad kart radii"
  );
  assertEqual(overlap, null, "OBB overlap rejects broad-radius false positive");
  assertEqual(
    hasKartCollisionBoundsOverlap(left, right),
    false,
    "false-positive predicate"
  );

  return {
    broadRadiusRejected: overlap === null
  };
}

function validateVerticalSeparationRejected(): {
  readonly verticalRejected: boolean;
} {
  const dimensions = createKartCollisionDimensions({
    length: 4,
    width: 2,
    height: 1.2
  });
  const left = createKartCollisionBounds(
    { x: 0, y: 0.5, z: 0 },
    0,
    dimensions
  );
  const right = createKartCollisionBounds(
    { x: 1.75, y: 2, z: 0 },
    0,
    dimensions
  );
  const overlap = detectKartCollisionBoundsOverlap(left, right);

  assertEqual(overlap, null, "vertically separated karts do not overlap");

  return {
    verticalRejected: overlap === null
  };
}

function validatePairwiseHumanAiOverlapDetection(): {
  readonly overlapCount: number;
  readonly pairId: string;
} {
  const dimensions = createKartCollisionDimensions({
    length: 4,
    width: 2,
    height: 1.2
  });
  const human: ValidationKart = {
    id: "human_1",
    controller: "human",
    collisionBounds: createKartCollisionBounds(
      { x: 0, y: 0.5, z: 0 },
      0,
      dimensions
    )
  };
  const overlappingAi: ValidationKart = {
    id: "ai_1",
    controller: "ai",
    collisionBounds: createKartCollisionBounds(
      { x: 1.75, y: 0.5, z: 0 },
      0,
      dimensions
    )
  };
  const clearAi: ValidationKart = {
    id: "ai_2",
    controller: "ai",
    collisionBounds: createKartCollisionBounds(
      { x: -8, y: 0.5, z: 0 },
      Math.PI / 4,
      dimensions
    )
  };
  const overlaps = detectKartCollisionBoundsPairOverlaps([
    human,
    overlappingAi,
    clearAi
  ]);
  const overlap = requireValue(overlaps[0], "expected human/AI overlap pair");

  assertEqual(overlaps.length, 1, "pairwise overlap count");
  assertEqual(overlap.left.id, "human_1", "pairwise left racer id");
  assertEqual(overlap.left.controller, "human", "pairwise left controller");
  assertEqual(overlap.right.id, "ai_1", "pairwise right racer id");
  assertEqual(overlap.right.controller, "ai", "pairwise right controller");
  assertGreaterThan(overlap.overlap.depth, 0, "pairwise overlap depth");

  return {
    overlapCount: overlaps.length,
    pairId: `${overlap.left.id}:${overlap.right.id}`
  };
}

function validateKartCircleItemBoxOverlapDetection(): {
  readonly depth: number;
} {
  const dimensions = createKartCollisionDimensions({
    length: 4,
    width: 2,
    height: 1.2
  });
  const bounds = createKartCollisionBounds(
    { x: 0, y: 0.5, z: 0 },
    0,
    dimensions
  );
  const itemBox = {
    center: { x: 2.2, y: 0.5, z: 0 },
    radius: 1.4
  };
  const overlap = requireValue(
    detectKartCollisionBoundsCircleOverlap(bounds, itemBox),
    "expected kart/item-box overlap"
  );

  assertEqual(
    hasKartCollisionBoundsCircleOverlap(bounds, itemBox),
    true,
    "kart/item-box overlap predicate"
  );
  assertAlmostEqual(overlap.depth, 0.2, "kart/item-box overlap depth");
  assertAlmostEqual(overlap.normal.x, -1, "kart/item-box normal x");
  assertAlmostEqual(overlap.normal.z, 0, "kart/item-box normal z");
  assertAlmostEqual(overlap.contactPoint.x, 1, "kart/item-box contact x");
  assertAlmostEqual(overlap.contactPoint.z, 0, "kart/item-box contact z");

  return {
    depth: overlap.depth
  };
}

function validateKartCircleRejectsBroadRadiusFalsePositive(): {
  readonly broadRadiusRejected: boolean;
} {
  const dimensions = createKartCollisionDimensions({
    length: 4,
    width: 2,
    height: 1.2
  });
  const bounds = createKartCollisionBounds(
    { x: 0, y: 0.5, z: 0 },
    0,
    dimensions
  );
  const itemBox = {
    center: { x: 1.5, y: 0.5, z: 2.4 },
    radius: 0.6
  };
  const broadRadiusWouldOverlap =
    getPlanarDistance(bounds.center, itemBox.center) <
    bounds.boundingRadius + itemBox.radius;
  const overlap = detectKartCollisionBoundsCircleOverlap(bounds, itemBox);

  assertEqual(
    broadRadiusWouldOverlap,
    true,
    "setup overlaps broad kart/item-box radius"
  );
  assertEqual(
    overlap,
    null,
    "OBB-circle item-box detection rejects broad-radius false positive"
  );
  assertEqual(
    hasKartCollisionBoundsCircleOverlap(bounds, itemBox),
    false,
    "item-box false-positive predicate"
  );

  return {
    broadRadiusRejected: overlap === null
  };
}

function getPlanarDistance(
  left: Pick<KartCollisionBounds["center"], "x" | "z">,
  right: Pick<KartCollisionBounds["center"], "x" | "z">
): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(label);
  }

  return value;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`
    );
  }
}

function assertAlmostEqual(
  actual: number,
  expected: number,
  label: string,
  epsilon = 0.000001
): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertGreaterThan(
  actual: number,
  expected: number,
  label: string
): void {
  if (actual <= expected) {
    throw new Error(`${label}: expected > ${expected}, got ${actual}`);
  }
}

main();
