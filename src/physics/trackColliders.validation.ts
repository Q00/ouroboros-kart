import type { Vector3 } from "../config/aiRacers";
import {
  DEFAULT_KART_COLLISION_DIMENSIONS,
  createKartCollisionBounds,
  createKartCollisionDimensions
} from "./kartCollisionBounds";
import {
  DEFAULT_TRACK_COLLISION_LAYER,
  detectKartBoundsTrackBoundaryContacts,
  detectKartBoundsTrackObstacleContacts,
  type TrackBoundaryCollider,
  type TrackObstacleCollider
} from "./trackColliders";

function main(): void {
  const boundary = validateBoundaryBoundsContactDetection();
  const obstacle = validateObstacleBoundsContactDetection();
  const precision = validateObstacleBoundsRejectsBroadRadiusFalsePositive();
  const vertical = validateObstacleBoundsRejectsVerticalMiss();

  console.info(
    [
      "trackColliders=ok",
      `boundaryCollider=${boundary.colliderId}`,
      `boundaryPenetration=${boundary.penetrationDepth.toFixed(3)}`,
      `obstacleCollider=${obstacle.colliderId}`,
      `obstaclePenetration=${obstacle.penetrationDepth.toFixed(3)}`,
      `broadRadiusRejected=${precision.broadRadiusRejected}`,
      `verticalMissRejected=${vertical.verticalMissRejected}`
    ].join(" ")
  );
}

function validateBoundaryBoundsContactDetection(): {
  readonly colliderId: string;
  readonly penetrationDepth: number;
} {
  const boundaryCollider = requireValue(
    DEFAULT_TRACK_COLLISION_LAYER.boundaryColliders.find(
      (collider) => collider.side === "left" && collider.segmentIndex === 0
    ),
    "first left boundary collider"
  );
  const dimensions = createKartCollisionDimensions({
    length: 3,
    width: 2,
    height: 1.2
  });
  const inwardNormal = getBoundaryColliderInwardNormal(boundaryCollider);
  const targetPenetrationDepth = 0.3;
  const contactSeparation =
    boundaryCollider.halfExtents.x +
    dimensions.width / 2 -
    targetPenetrationDepth;
  const contactCenter = {
    x: boundaryCollider.position.x + inwardNormal.x * contactSeparation,
    y: boundaryCollider.position.y,
    z: boundaryCollider.position.z + inwardNormal.z * contactSeparation
  };
  const contactResult = detectKartBoundsTrackBoundaryContacts(
    createKartCollisionBounds(
      contactCenter,
      boundaryCollider.headingRadians,
      dimensions
    ),
    DEFAULT_TRACK_COLLISION_LAYER
  );
  const contact = requireValue(
    contactResult.contacts.find(
      (candidate) => candidate.colliderId === boundaryCollider.id
    ),
    "expected boundary contact"
  );
  const correctionDepth =
    contactResult.correction.x * inwardNormal.x +
    contactResult.correction.z * inwardNormal.z;
  const correctedSeparation =
    (contactResult.correctedCenter.x - boundaryCollider.position.x) *
      inwardNormal.x +
    (contactResult.correctedCenter.z - boundaryCollider.position.z) *
      inwardNormal.z;

  assertEqual(contactResult.hasCollision, true, "boundary collision detected");
  assertAlmostEqual(
    contact.penetrationDepth,
    targetPenetrationDepth,
    "boundary penetration"
  );
  assertAlmostEqual(
    correctionDepth,
    targetPenetrationDepth,
    "boundary correction depth"
  );
  assertAlmostEqual(
    correctedSeparation,
    boundaryCollider.halfExtents.x + dimensions.width / 2,
    "boundary corrected separation"
  );

  const clearResult = detectKartBoundsTrackBoundaryContacts(
    createKartCollisionBounds(
      {
        x:
          boundaryCollider.position.x +
          inwardNormal.x * (boundaryCollider.halfExtents.x + dimensions.width),
        y: boundaryCollider.position.y,
        z:
          boundaryCollider.position.z +
          inwardNormal.z * (boundaryCollider.halfExtents.x + dimensions.width)
      },
      boundaryCollider.headingRadians,
      dimensions
    ),
    DEFAULT_TRACK_COLLISION_LAYER
  );

  assertEqual(clearResult.hasCollision, false, "clear boundary is not detected");
  assertEqual(clearResult.contacts.length, 0, "clear boundary contact count");

  return {
    colliderId: contact.colliderId,
    penetrationDepth: contact.penetrationDepth
  };
}

function validateObstacleBoundsContactDetection(): {
  readonly colliderId: string;
  readonly penetrationDepth: number;
} {
  const dimensions = createKartCollisionDimensions({
    length: 4,
    width: 2,
    height: 1.2
  });
  const obstacle = createValidationObstacle({
    position: { x: 0, y: 0.45, z: 0 },
    radius: 1.25,
    halfHeight: 0.75,
    impactSpeedFactor: 0.4
  });
  const targetPenetrationDepth = 0.25;
  const contactCenter = {
    x:
      obstacle.position.x +
      obstacle.radius +
      dimensions.width / 2 -
      targetPenetrationDepth,
    y: obstacle.position.y,
    z: obstacle.position.z
  };
  const contactResult = detectKartBoundsTrackObstacleContacts(
    createKartCollisionBounds(contactCenter, 0, dimensions),
    { obstacleColliders: [obstacle] }
  );
  const contact = requireValue(
    contactResult.contacts.find(
      (candidate) => candidate.colliderId === obstacle.id
    ),
    "expected obstacle contact"
  );

  assertEqual(contactResult.hasCollision, true, "obstacle collision detected");
  assertEqual(contact.colliderId, obstacle.id, "obstacle contact collider id");
  assertEqual(contact.obstacleKind, obstacle.obstacleKind, "obstacle kind");
  assertAlmostEqual(contact.normal.x, 1, "obstacle normal x");
  assertAlmostEqual(contact.normal.z, 0, "obstacle normal z");
  assertAlmostEqual(
    contact.penetrationDepth,
    targetPenetrationDepth,
    "obstacle penetration"
  );
  assertAlmostEqual(
    contactResult.correction.x,
    targetPenetrationDepth,
    "obstacle correction x"
  );
  assertAlmostEqual(contactResult.correction.z, 0, "obstacle correction z");
  assertAlmostEqual(
    contactResult.correctedCenter.x,
    contactCenter.x + targetPenetrationDepth,
    "obstacle corrected center"
  );
  assertAlmostEqual(
    contactResult.speedFactor,
    obstacle.impactSpeedFactor,
    "obstacle speed factor"
  );
  assertGreaterThan(contact.verticalOverlap, 0, "obstacle vertical overlap");

  return {
    colliderId: contact.colliderId,
    penetrationDepth: contact.penetrationDepth
  };
}

function validateObstacleBoundsRejectsBroadRadiusFalsePositive(): {
  readonly broadRadiusRejected: boolean;
} {
  const dimensions = createKartCollisionDimensions({
    length: 4,
    width: 2,
    height: 1.2
  });
  const bounds = createKartCollisionBounds(
    { x: 0, y: 0.45, z: 0 },
    0,
    dimensions
  );
  const obstacle = createValidationObstacle({
    position: { x: 1.35, y: 0.45, z: 2.05 },
    radius: 0.25,
    halfHeight: 0.75,
    impactSpeedFactor: 0.4
  });
  const broadRadiusWouldOverlap =
    getPlanarDistance(bounds.center, obstacle.position) <
    bounds.boundingRadius + obstacle.radius;
  const contactResult = detectKartBoundsTrackObstacleContacts(bounds, {
    obstacleColliders: [obstacle]
  });

  assertEqual(
    broadRadiusWouldOverlap,
    true,
    "setup overlaps broad kart radius"
  );
  assertEqual(
    contactResult.hasCollision,
    false,
    "OBB obstacle detection rejects broad-radius false positive"
  );
  assertEqual(contactResult.contacts.length, 0, "false-positive contact count");

  return {
    broadRadiusRejected: !contactResult.hasCollision
  };
}

function validateObstacleBoundsRejectsVerticalMiss(): {
  readonly verticalMissRejected: boolean;
} {
  const dimensions = DEFAULT_KART_COLLISION_DIMENSIONS;
  const obstacle = createValidationObstacle({
    position: { x: 1.2, y: 5, z: 0 },
    radius: 1.4,
    halfHeight: 0.4,
    impactSpeedFactor: 0.4
  });
  const contactResult = detectKartBoundsTrackObstacleContacts(
    createKartCollisionBounds({ x: 1.9, y: 0.45, z: 0 }, 0, dimensions),
    { obstacleColliders: [obstacle] }
  );

  assertEqual(
    contactResult.hasCollision,
    false,
    "vertically separated obstacle is not detected"
  );
  assertEqual(contactResult.contacts.length, 0, "vertical miss contact count");

  return {
    verticalMissRejected: !contactResult.hasCollision
  };
}

function createValidationObstacle(
  overrides: Pick<
    TrackObstacleCollider,
    "position" | "radius" | "halfHeight" | "impactSpeedFactor"
  >
): TrackObstacleCollider {
  return {
    id: "validation-obstacle",
    colliderType: "obstacle",
    bodyType: "static",
    obstacleKind: "tire-stack",
    shape: "cylinder",
    ...overrides
  };
}

function getBoundaryColliderInwardNormal(
  collider: TrackBoundaryCollider
): { readonly x: number; readonly z: number } {
  const right = {
    x: Math.cos(collider.headingRadians),
    z: -Math.sin(collider.headingRadians)
  };
  const direction = collider.side === "left" ? 1 : -1;

  return {
    x: right.x * direction,
    z: right.z * direction
  };
}

function getPlanarDistance(left: Vector3, right: Vector3): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function requireValue<Value>(value: Value | undefined, label: string): Value {
  if (value === undefined) {
    throw new Error(`Missing ${label}.`);
  }

  return value;
}

function assertEqual<Value>(actual: Value, expected: Value, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}.`
    );
  }
}

function assertAlmostEqual(actual: number, expected: number, label: string): void {
  const tolerance = 1e-6;

  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `${label}: expected ${expected.toFixed(6)}, got ${actual.toFixed(6)}.`
    );
  }
}

function assertGreaterThan(actual: number, expected: number, label: string): void {
  if (!(actual > expected)) {
    throw new Error(
      `${label}: expected ${actual} to be greater than ${expected}.`
    );
  }
}

main();
