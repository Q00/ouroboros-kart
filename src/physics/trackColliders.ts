import type { Vector3 } from "../config/aiRacers";
import {
  DEFAULT_TRACK_DEFINITION,
  type TrackRoadGeometry
} from "../config/tracks";
import type { KartCollisionBounds } from "./kartCollisionBounds";

export type TrackStaticColliderBodyType = "static";
export type TrackBoundaryColliderSide = "left" | "right";
export type TrackObstacleColliderKind = "oil-drum" | "tire-stack" | "cone-pack";

export interface TrackBoundaryCollider {
  readonly id: string;
  readonly colliderType: "boundary";
  readonly bodyType: TrackStaticColliderBodyType;
  readonly side: TrackBoundaryColliderSide;
  readonly shape: "box";
  readonly segmentIndex: number;
  readonly start: Vector3;
  readonly end: Vector3;
  readonly position: Vector3;
  readonly halfExtents: Vector3;
  readonly headingRadians: number;
  readonly length: number;
  readonly impactSpeedFactor: number;
}

export interface TrackObstacleCollider {
  readonly id: string;
  readonly colliderType: "obstacle";
  readonly bodyType: TrackStaticColliderBodyType;
  readonly obstacleKind: TrackObstacleColliderKind;
  readonly shape: "cylinder";
  readonly position: Vector3;
  readonly radius: number;
  readonly halfHeight: number;
  readonly impactSpeedFactor: number;
}

export interface TrackCollisionLayer {
  readonly trackId: string;
  readonly boundaryColliders: readonly TrackBoundaryCollider[];
  readonly obstacleColliders: readonly TrackObstacleCollider[];
}

export interface KartTrackBoundaryContact {
  readonly colliderId: string;
  readonly colliderSide: TrackBoundaryColliderSide;
  readonly segmentIndex: number;
  readonly contactPoint: Vector3;
  readonly normal: Vector3;
  readonly penetrationDepth: number;
  readonly minimumTranslationNormal: Vector3;
  readonly minimumTranslationDepth: number;
  readonly impactSpeedFactor: number;
}

export interface KartTrackBoundaryCollisionResult {
  readonly hasCollision: boolean;
  readonly contacts: readonly KartTrackBoundaryContact[];
  readonly correction: Vector3;
  readonly correctedCenter: Vector3;
  readonly speedFactor: number;
  readonly maxPenetrationDepth: number;
}

export interface KartTrackObstacleContact {
  readonly colliderId: string;
  readonly obstacleKind: TrackObstacleColliderKind;
  readonly contactPoint: Vector3;
  readonly normal: Vector3;
  readonly penetrationDepth: number;
  readonly minimumTranslationNormal: Vector3;
  readonly minimumTranslationDepth: number;
  readonly verticalOverlap: number;
  readonly impactSpeedFactor: number;
}

export interface KartTrackObstacleCollisionResult {
  readonly hasCollision: boolean;
  readonly contacts: readonly KartTrackObstacleContact[];
  readonly correction: Vector3;
  readonly correctedCenter: Vector3;
  readonly speedFactor: number;
  readonly maxPenetrationDepth: number;
}

export interface TrackCollisionLayerOptions {
  readonly trackId?: string;
  readonly boundaryColliderThickness?: number;
  readonly boundaryColliderHeight?: number;
  readonly boundaryImpactSpeedFactor?: number;
  readonly obstacleColliders?: readonly TrackObstacleCollider[];
}

export const DEFAULT_BOUNDARY_COLLIDER_THICKNESS = 0.9;
export const DEFAULT_BOUNDARY_COLLIDER_HEIGHT = 1.35;
export const DEFAULT_BOUNDARY_IMPACT_SPEED_FACTOR = 0.52;
export const DEFAULT_OBSTACLE_HALF_HEIGHT = 0.8;

const COLLISION_OVERLAP_TOLERANCE = 1e-9;

export const DEFAULT_TRACK_OBSTACLE_COLLIDERS = [
  {
    id: "oil-drum-east",
    colliderType: "obstacle",
    bodyType: "static",
    obstacleKind: "oil-drum",
    shape: "cylinder",
    position: { x: 49, y: 0.45, z: -37 },
    radius: 2.2,
    halfHeight: DEFAULT_OBSTACLE_HALF_HEIGHT,
    impactSpeedFactor: 0.42
  },
  {
    id: "tire-stack-south",
    colliderType: "obstacle",
    bodyType: "static",
    obstacleKind: "tire-stack",
    shape: "cylinder",
    position: { x: 20, y: 0.45, z: -49 },
    radius: 2.4,
    halfHeight: DEFAULT_OBSTACLE_HALF_HEIGHT,
    impactSpeedFactor: 0.38
  },
  {
    id: "cone-pack-west",
    colliderType: "obstacle",
    bodyType: "static",
    obstacleKind: "cone-pack",
    shape: "cylinder",
    position: { x: -58, y: 0.45, z: 38 },
    radius: 2,
    halfHeight: DEFAULT_OBSTACLE_HALF_HEIGHT,
    impactSpeedFactor: 0.48
  }
] as const satisfies readonly TrackObstacleCollider[];

export const DEFAULT_TRACK_COLLISION_LAYER = createTrackCollisionLayer(
  DEFAULT_TRACK_DEFINITION.road,
  {
    trackId: DEFAULT_TRACK_DEFINITION.id,
    obstacleColliders: DEFAULT_TRACK_OBSTACLE_COLLIDERS
  }
);

export function detectKartBoundsTrackBoundaryContacts(
  kartBounds: KartCollisionBounds,
  collisionLayer: Pick<TrackCollisionLayer, "boundaryColliders">
): KartTrackBoundaryCollisionResult {
  assertFiniteVector(kartBounds.center, "kart collision bounds center");

  const contacts = collisionLayer.boundaryColliders
    .map((collider) => detectKartBoundaryContact(kartBounds, collider))
    .filter((contact): contact is KartTrackBoundaryContact => contact !== null)
    .sort((left, right) => right.penetrationDepth - left.penetrationDepth);
  const correction = getBoundaryContactCorrection(contacts);
  const speedFactor =
    contacts.length === 0
      ? 1
      : Math.min(...contacts.map((contact) => contact.impactSpeedFactor));

  return {
    hasCollision: contacts.length > 0,
    contacts,
    correction,
    correctedCenter: {
      x: kartBounds.center.x + correction.x,
      y: kartBounds.center.y + correction.y,
      z: kartBounds.center.z + correction.z
    },
    speedFactor,
    maxPenetrationDepth:
      contacts.length === 0
        ? 0
        : Math.max(...contacts.map((contact) => contact.penetrationDepth))
  };
}

export function detectKartBoundaryContact(
  kartBounds: KartCollisionBounds,
  collider: TrackBoundaryCollider
): KartTrackBoundaryContact | null {
  assertFiniteVector(kartBounds.center, "kart collision bounds center");
  assertFiniteVector(collider.position, `boundary ${collider.id} position`);

  const kartObb = createKartPlanarObb(kartBounds);
  const boundaryObb = createBoundaryPlanarObb(collider);
  const overlap = getPlanarObbOverlap(kartObb, boundaryObb);

  if (overlap === null) {
    return null;
  }

  const inwardNormal = getBoundaryInwardNormal(collider);
  const separation =
    (kartBounds.center.x - collider.position.x) * inwardNormal.x +
    (kartBounds.center.z - collider.position.z) * inwardNormal.z;
  const penetrationDepth = Math.max(
    getPlanarObbProjectedRadius(kartObb, inwardNormal) +
      getPlanarObbProjectedRadius(boundaryObb, inwardNormal) -
      separation,
    0
  );

  return {
    colliderId: collider.id,
    colliderSide: collider.side,
    segmentIndex: collider.segmentIndex,
    contactPoint: getClosestPointOnBoundaryCollider(
      kartBounds.center,
      collider
    ),
    normal: {
      x: inwardNormal.x,
      y: 0,
      z: inwardNormal.z
    },
    penetrationDepth,
    minimumTranslationNormal: {
      x: overlap.normal.x,
      y: 0,
      z: overlap.normal.z
    },
    minimumTranslationDepth: overlap.depth,
    impactSpeedFactor: collider.impactSpeedFactor
  };
}

export function detectKartBoundsTrackObstacleContacts(
  kartBounds: KartCollisionBounds,
  collisionLayer: Pick<TrackCollisionLayer, "obstacleColliders">
): KartTrackObstacleCollisionResult {
  assertFiniteVector(kartBounds.center, "kart collision bounds center");

  const contacts = collisionLayer.obstacleColliders
    .map((collider) => detectKartObstacleContact(kartBounds, collider))
    .filter((contact): contact is KartTrackObstacleContact => contact !== null)
    .sort((left, right) => right.penetrationDepth - left.penetrationDepth);
  const correction = getObstacleContactCorrection(contacts);
  const speedFactor =
    contacts.length === 0
      ? 1
      : Math.min(...contacts.map((contact) => contact.impactSpeedFactor));

  return {
    hasCollision: contacts.length > 0,
    contacts,
    correction,
    correctedCenter: {
      x: kartBounds.center.x + correction.x,
      y: kartBounds.center.y + correction.y,
      z: kartBounds.center.z + correction.z
    },
    speedFactor,
    maxPenetrationDepth:
      contacts.length === 0
        ? 0
        : Math.max(...contacts.map((contact) => contact.penetrationDepth))
  };
}

export function detectKartObstacleContact(
  kartBounds: KartCollisionBounds,
  collider: TrackObstacleCollider
): KartTrackObstacleContact | null {
  assertFiniteVector(kartBounds.center, "kart collision bounds center");
  assertFiniteVector(collider.position, `obstacle ${collider.id} position`);
  assertPositiveFiniteNumber(collider.radius, `obstacle ${collider.id} radius`);
  assertPositiveFiniteNumber(
    collider.halfHeight,
    `obstacle ${collider.id} half height`
  );

  const verticalOverlap = getVerticalOverlap(
    kartBounds.center.y,
    kartBounds.halfHeight,
    collider.position.y,
    collider.halfHeight
  );

  if (verticalOverlap <= Number.EPSILON) {
    return null;
  }

  const kartObb = createKartPlanarObb(kartBounds);
  const localObstacleCenter = getPlanarPointInObbSpace(
    collider.position,
    kartObb
  );
  const closestLocalPoint = {
    right: clamp(
      localObstacleCenter.right,
      -kartObb.halfWidth,
      kartObb.halfWidth
    ),
    forward: clamp(
      localObstacleCenter.forward,
      -kartObb.halfLength,
      kartObb.halfLength
    )
  };
  const obstacleCenterInsideKart =
    closestLocalPoint.right === localObstacleCenter.right &&
    closestLocalPoint.forward === localObstacleCenter.forward;
  const contact = obstacleCenterInsideKart
    ? getObstacleInsideKartContact(
        localObstacleCenter,
        kartObb,
        collider.radius
      )
    : getObstacleOutsideKartContact(
        closestLocalPoint,
        localObstacleCenter,
        kartObb,
        collider.radius
      );

  if (contact === null) {
    return null;
  }

  return {
    colliderId: collider.id,
    obstacleKind: collider.obstacleKind,
    contactPoint: {
      x: contact.point.x,
      y: collider.position.y,
      z: contact.point.z
    },
    normal: {
      x: contact.normal.x,
      y: 0,
      z: contact.normal.z
    },
    penetrationDepth: contact.depth,
    minimumTranslationNormal: {
      x: contact.normal.x,
      y: 0,
      z: contact.normal.z
    },
    minimumTranslationDepth: contact.depth,
    verticalOverlap,
    impactSpeedFactor: collider.impactSpeedFactor
  };
}

export function createTrackCollisionLayer(
  road: TrackRoadGeometry,
  options: TrackCollisionLayerOptions = {}
): TrackCollisionLayer {
  const boundaryColliderThickness =
    options.boundaryColliderThickness ?? DEFAULT_BOUNDARY_COLLIDER_THICKNESS;
  const boundaryColliderHeight =
    options.boundaryColliderHeight ?? DEFAULT_BOUNDARY_COLLIDER_HEIGHT;
  const boundaryImpactSpeedFactor =
    options.boundaryImpactSpeedFactor ?? DEFAULT_BOUNDARY_IMPACT_SPEED_FACTOR;
  const obstacleColliders =
    options.obstacleColliders ?? DEFAULT_TRACK_OBSTACLE_COLLIDERS;

  assertPositiveFiniteNumber(
    boundaryColliderThickness,
    "boundary collider thickness"
  );
  assertPositiveFiniteNumber(boundaryColliderHeight, "boundary collider height");
  assertImpactSpeedFactor(boundaryImpactSpeedFactor, "boundary collider");
  assertObstacleColliders(obstacleColliders);

  return {
    trackId: options.trackId ?? DEFAULT_TRACK_DEFINITION.id,
    boundaryColliders: [
      ...createBoundaryColliders(
        "left",
        road.courseBoundary.leftCourseBoundary,
        boundaryColliderThickness,
        boundaryColliderHeight,
        boundaryImpactSpeedFactor
      ),
      ...createBoundaryColliders(
        "right",
        road.courseBoundary.rightCourseBoundary,
        boundaryColliderThickness,
        boundaryColliderHeight,
        boundaryImpactSpeedFactor
      )
    ],
    obstacleColliders
  };
}

function createBoundaryColliders(
  side: TrackBoundaryColliderSide,
  points: readonly Vector3[],
  thickness: number,
  height: number,
  impactSpeedFactor: number
): readonly TrackBoundaryCollider[] {
  if (points.length < 2) {
    throw new Error(`Track ${side} boundary requires at least two points.`);
  }

  return points.map((start, segmentIndex) => {
    const end = requireLoopPoint(points, segmentIndex + 1);
    const deltaX = end.x - start.x;
    const deltaZ = end.z - start.z;
    const length = Math.hypot(deltaX, deltaZ);

    assertFiniteVector(start, `${side} boundary ${segmentIndex} start`);
    assertFiniteVector(end, `${side} boundary ${segmentIndex} end`);

    if (length <= Number.EPSILON) {
      throw new Error(
        `Track ${side} boundary segment ${segmentIndex} must have non-zero length.`
      );
    }

    return {
      id: `${side}-course-boundary-${segmentIndex}`,
      colliderType: "boundary",
      bodyType: "static",
      side,
      shape: "box",
      segmentIndex,
      start,
      end,
      position: {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
        z: (start.z + end.z) / 2
      },
      halfExtents: {
        x: thickness / 2,
        y: height / 2,
        z: length / 2
      },
      headingRadians: Math.atan2(deltaX, deltaZ),
      length,
      impactSpeedFactor
    } satisfies TrackBoundaryCollider;
  });
}

function assertObstacleColliders(
  obstacleColliders: readonly TrackObstacleCollider[]
): void {
  const ids = new Set<string>();

  for (const obstacle of obstacleColliders) {
    if (obstacle.id.trim().length === 0 || ids.has(obstacle.id)) {
      throw new Error("Track obstacle colliders require unique non-empty ids.");
    }

    if (
      obstacle.colliderType !== "obstacle" ||
      obstacle.bodyType !== "static" ||
      obstacle.shape !== "cylinder"
    ) {
      throw new Error(`Track obstacle ${obstacle.id} has invalid collider metadata.`);
    }

    assertFiniteVector(obstacle.position, `obstacle ${obstacle.id} position`);
    assertPositiveFiniteNumber(obstacle.radius, `obstacle ${obstacle.id} radius`);
    assertPositiveFiniteNumber(
      obstacle.halfHeight,
      `obstacle ${obstacle.id} half height`
    );
    assertImpactSpeedFactor(obstacle.impactSpeedFactor, obstacle.id);
    ids.add(obstacle.id);
  }
}

function assertImpactSpeedFactor(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} impact speed factor must be in the [0, 1] range.`);
  }
}

function assertPositiveFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`);
  }
}

function assertFiniteVector(vector: Vector3, label: string): void {
  if (
    !Number.isFinite(vector.x) ||
    !Number.isFinite(vector.y) ||
    !Number.isFinite(vector.z)
  ) {
    throw new Error(`${label} must contain finite coordinates.`);
  }
}

interface PlanarAxis {
  readonly x: number;
  readonly z: number;
}

interface PlanarObb {
  readonly center: PlanarAxis;
  readonly right: PlanarAxis;
  readonly forward: PlanarAxis;
  readonly halfWidth: number;
  readonly halfLength: number;
}

interface PlanarObbOverlap {
  readonly normal: PlanarAxis;
  readonly depth: number;
}

interface PlanarObbPoint {
  readonly right: number;
  readonly forward: number;
}

interface PlanarCircleObbContact {
  readonly normal: PlanarAxis;
  readonly point: PlanarAxis;
  readonly depth: number;
}

function createKartPlanarObb(kartBounds: KartCollisionBounds): PlanarObb {
  return {
    center: kartBounds.center,
    right: normalizePlanarAxis(kartBounds.right),
    forward: normalizePlanarAxis(kartBounds.forward),
    halfWidth: kartBounds.halfWidth,
    halfLength: kartBounds.halfLength
  };
}

function createBoundaryPlanarObb(collider: TrackBoundaryCollider): PlanarObb {
  return {
    center: collider.position,
    right: getRightAxis(collider.headingRadians),
    forward: getForwardAxis(collider.headingRadians),
    halfWidth: collider.halfExtents.x,
    halfLength: collider.halfExtents.z
  };
}

function getPlanarPointInObbSpace(
  point: Vector3,
  obb: PlanarObb
): PlanarObbPoint {
  const delta = {
    x: point.x - obb.center.x,
    z: point.z - obb.center.z
  };

  return {
    right: dotPlanar(delta, obb.right),
    forward: dotPlanar(delta, obb.forward)
  };
}

function getWorldPointFromObbSpace(
  point: PlanarObbPoint,
  obb: PlanarObb
): PlanarAxis {
  return {
    x:
      obb.center.x +
      obb.right.x * point.right +
      obb.forward.x * point.forward,
    z:
      obb.center.z +
      obb.right.z * point.right +
      obb.forward.z * point.forward
  };
}

function getPlanarObbOverlap(
  left: PlanarObb,
  right: PlanarObb
): PlanarObbOverlap | null {
  const axes = [left.right, left.forward, right.right, right.forward] as const;
  const centerDelta = {
    x: left.center.x - right.center.x,
    z: left.center.z - right.center.z
  };
  let shallowest: PlanarObbOverlap | null = null;

  for (const axis of axes) {
    const normalizedAxis = normalizePlanarAxis(axis);
    const separation = dotPlanar(centerDelta, normalizedAxis);
    const depth =
      getPlanarObbProjectedRadius(left, normalizedAxis) +
      getPlanarObbProjectedRadius(right, normalizedAxis) -
      Math.abs(separation);

    if (depth <= COLLISION_OVERLAP_TOLERANCE) {
      return null;
    }

    if (shallowest === null || depth < shallowest.depth) {
      const sign = separation < 0 ? -1 : 1;

      shallowest = {
        normal: {
          x: normalizedAxis.x * sign,
          z: normalizedAxis.z * sign
        },
        depth
      };
    }
  }

  return shallowest;
}

function getPlanarObbProjectedRadius(
  obb: PlanarObb,
  axis: PlanarAxis
): number {
  return (
    Math.abs(dotPlanar(obb.right, axis)) * obb.halfWidth +
    Math.abs(dotPlanar(obb.forward, axis)) * obb.halfLength
  );
}

function getObstacleOutsideKartContact(
  closestLocalPoint: PlanarObbPoint,
  obstacleLocalCenter: PlanarObbPoint,
  kartObb: PlanarObb,
  obstacleRadius: number
): PlanarCircleObbContact | null {
  const delta = {
    right: closestLocalPoint.right - obstacleLocalCenter.right,
    forward: closestLocalPoint.forward - obstacleLocalCenter.forward
  };
  const distance = Math.hypot(delta.right, delta.forward);
  const depth = obstacleRadius - distance;

  if (depth <= COLLISION_OVERLAP_TOLERANCE) {
    return null;
  }

  const normal =
    distance <= Number.EPSILON
      ? { x: 1, z: 0 }
      : normalizePlanarAxis({
          x:
            kartObb.right.x * (delta.right / distance) +
            kartObb.forward.x * (delta.forward / distance),
          z:
            kartObb.right.z * (delta.right / distance) +
            kartObb.forward.z * (delta.forward / distance)
        });

  return {
    normal,
    point: getWorldPointFromObbSpace(closestLocalPoint, kartObb),
    depth
  };
}

function getObstacleInsideKartContact(
  obstacleLocalCenter: PlanarObbPoint,
  kartObb: PlanarObb,
  obstacleRadius: number
): PlanarCircleObbContact {
  const rightFaceDistance =
    kartObb.halfWidth - Math.abs(obstacleLocalCenter.right);
  const forwardFaceDistance =
    kartObb.halfLength - Math.abs(obstacleLocalCenter.forward);
  const useRightAxis = rightFaceDistance <= forwardFaceDistance;
  const localNormal = useRightAxis
    ? {
        right: obstacleLocalCenter.right < 0 ? -1 : 1,
        forward: 0
      }
    : {
        right: 0,
        forward: obstacleLocalCenter.forward < 0 ? -1 : 1
      };
  const faceDistance = useRightAxis ? rightFaceDistance : forwardFaceDistance;
  const contactLocalPoint = useRightAxis
    ? {
        right: localNormal.right * kartObb.halfWidth,
        forward: obstacleLocalCenter.forward
      }
    : {
        right: obstacleLocalCenter.right,
        forward: localNormal.forward * kartObb.halfLength
      };

  return {
    normal: {
      x:
        kartObb.right.x * localNormal.right +
        kartObb.forward.x * localNormal.forward,
      z:
        kartObb.right.z * localNormal.right +
        kartObb.forward.z * localNormal.forward
    },
    point: getWorldPointFromObbSpace(contactLocalPoint, kartObb),
    depth: obstacleRadius + faceDistance
  };
}

function getBoundaryContactCorrection(
  contacts: readonly KartTrackBoundaryContact[]
): Vector3 {
  const correction = { x: 0, y: 0, z: 0 };

  for (const contact of contacts) {
    const resolvedDepth =
      correction.x * contact.normal.x + correction.z * contact.normal.z;
    const missingDepth = contact.penetrationDepth - resolvedDepth;

    if (missingDepth <= Number.EPSILON) {
      continue;
    }

    correction.x += contact.normal.x * missingDepth;
    correction.z += contact.normal.z * missingDepth;
  }

  return correction;
}

function getObstacleContactCorrection(
  contacts: readonly KartTrackObstacleContact[]
): Vector3 {
  const correction = { x: 0, y: 0, z: 0 };

  for (const contact of contacts) {
    const resolvedDepth =
      correction.x * contact.normal.x + correction.z * contact.normal.z;
    const missingDepth = contact.penetrationDepth - resolvedDepth;

    if (missingDepth <= Number.EPSILON) {
      continue;
    }

    correction.x += contact.normal.x * missingDepth;
    correction.z += contact.normal.z * missingDepth;
  }

  return correction;
}

function getClosestPointOnBoundaryCollider(
  point: Vector3,
  collider: TrackBoundaryCollider
): Vector3 {
  const right = getRightAxis(collider.headingRadians);
  const forward = getForwardAxis(collider.headingRadians);
  const delta = {
    x: point.x - collider.position.x,
    z: point.z - collider.position.z
  };
  const rightOffset = clamp(
    dotPlanar(delta, right),
    -collider.halfExtents.x,
    collider.halfExtents.x
  );
  const forwardOffset = clamp(
    dotPlanar(delta, forward),
    -collider.halfExtents.z,
    collider.halfExtents.z
  );

  return {
    x:
      collider.position.x +
      right.x * rightOffset +
      forward.x * forwardOffset,
    y: collider.position.y,
    z:
      collider.position.z +
      right.z * rightOffset +
      forward.z * forwardOffset
  };
}

function getVerticalOverlap(
  firstCenterY: number,
  firstHalfHeight: number,
  secondCenterY: number,
  secondHalfHeight: number
): number {
  return (
    firstHalfHeight +
    secondHalfHeight -
    Math.abs(firstCenterY - secondCenterY)
  );
}

function getBoundaryInwardNormal(
  collider: TrackBoundaryCollider
): PlanarAxis {
  const right = getRightAxis(collider.headingRadians);
  const direction = collider.side === "left" ? 1 : -1;

  return {
    x: right.x * direction,
    z: right.z * direction
  };
}

function getForwardAxis(headingRadians: number): PlanarAxis {
  return {
    x: Math.sin(headingRadians),
    z: Math.cos(headingRadians)
  };
}

function getRightAxis(headingRadians: number): PlanarAxis {
  return {
    x: Math.cos(headingRadians),
    z: -Math.sin(headingRadians)
  };
}

function normalizePlanarAxis(axis: PlanarAxis): PlanarAxis {
  const length = Math.hypot(axis.x, axis.z);

  if (length <= Number.EPSILON) {
    return { x: 1, z: 0 };
  }

  return {
    x: axis.x / length,
    z: axis.z / length
  };
}

function dotPlanar(left: PlanarAxis, right: PlanarAxis): number {
  return left.x * right.x + left.z * right.z;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function requireLoopPoint(points: readonly Vector3[], index: number): Vector3 {
  const point = points[positiveModulo(index, points.length)];

  if (point === undefined) {
    throw new Error(`Missing track boundary point at index ${index}.`);
  }

  return point;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
