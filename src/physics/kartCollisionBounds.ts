import type { Vector3 } from "../config/aiRacers";

export interface KartCollisionDimensions {
  readonly length: number;
  readonly width: number;
  readonly height: number;
}

export type KartCollisionDimensionsInput = Partial<KartCollisionDimensions>;

export interface KartCollisionBounds {
  readonly center: Vector3;
  readonly headingRadians: number;
  readonly dimensions: KartCollisionDimensions;
  readonly halfLength: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly boundingRadius: number;
  readonly forward: Vector3;
  readonly right: Vector3;
  readonly frontLeft: Vector3;
  readonly frontRight: Vector3;
  readonly rearLeft: Vector3;
  readonly rearRight: Vector3;
}

export interface KartCollisionBoundsOverlap {
  readonly normal: Vector3;
  readonly depth: number;
  readonly verticalOverlap: number;
  readonly planarCenterDistance: number;
}

export interface KartCollisionCircleBounds {
  readonly center: Vector3;
  readonly radius: number;
}

export interface KartCollisionBoundsCircleOverlap {
  readonly normal: Vector3;
  readonly depth: number;
  readonly contactPoint: Vector3;
  readonly planarCenterDistance: number;
}

export interface KartCollisionBoundsPairCandidate {
  readonly collisionBounds: KartCollisionBounds;
}

export interface KartCollisionBoundsPairOverlap<
  Candidate extends KartCollisionBoundsPairCandidate
> {
  readonly left: Candidate;
  readonly right: Candidate;
  readonly overlap: KartCollisionBoundsOverlap;
}

export const DEFAULT_KART_COLLISION_DIMENSIONS: KartCollisionDimensions = {
  length: 2.1,
  width: 2,
  height: 1.3
};

export function createKartCollisionDimensions(
  input: KartCollisionDimensionsInput = {}
): KartCollisionDimensions {
  const dimensions = {
    ...DEFAULT_KART_COLLISION_DIMENSIONS,
    ...input
  };

  assertKartCollisionDimensions(dimensions);

  return dimensions;
}

export function createKartCollisionBounds(
  position: Vector3,
  headingRadians: number,
  dimensions: KartCollisionDimensions = DEFAULT_KART_COLLISION_DIMENSIONS
): KartCollisionBounds {
  assertFiniteVector(position, "kart collision position");
  assertKartCollisionDimensions(dimensions);

  const safeHeadingRadians = Number.isFinite(headingRadians)
    ? headingRadians
    : 0;
  const halfLength = dimensions.length / 2;
  const halfWidth = dimensions.width / 2;
  const halfHeight = dimensions.height / 2;
  const forward = forwardFromHeading(safeHeadingRadians);
  const right = rightFromHeading(safeHeadingRadians);

  return {
    center: { ...position },
    headingRadians: safeHeadingRadians,
    dimensions,
    halfLength,
    halfWidth,
    halfHeight,
    boundingRadius: Math.hypot(halfLength, halfWidth),
    forward,
    right,
    frontLeft: createCorner(position, forward, right, halfLength, -halfWidth),
    frontRight: createCorner(position, forward, right, halfLength, halfWidth),
    rearLeft: createCorner(position, forward, right, -halfLength, -halfWidth),
    rearRight: createCorner(position, forward, right, -halfLength, halfWidth)
  };
}

export function detectKartCollisionBoundsOverlap(
  left: KartCollisionBounds,
  right: KartCollisionBounds
): KartCollisionBoundsOverlap | null {
  assertKartCollisionBounds(left, "left kart collision bounds");
  assertKartCollisionBounds(right, "right kart collision bounds");

  const verticalOverlap = getVerticalOverlap(left, right);

  if (verticalOverlap <= 0) {
    return null;
  }

  const deltaX = left.center.x - right.center.x;
  const deltaZ = left.center.z - right.center.z;
  const planarCenterDistance = Math.hypot(deltaX, deltaZ);

  if (planarCenterDistance >= left.boundingRadius + right.boundingRadius) {
    return null;
  }

  let minimumOverlap = Number.POSITIVE_INFINITY;
  let minimumTranslationNormal: PlanarAxis | null = null;

  for (const axis of getKartProjectionAxes(left, right)) {
    const centerDistanceOnAxis = dotPlanar(deltaX, deltaZ, axis);
    const overlap =
      getKartProjectionRadius(left, axis) +
      getKartProjectionRadius(right, axis) -
      Math.abs(centerDistanceOnAxis);

    if (overlap <= 0) {
      return null;
    }

    if (overlap < minimumOverlap) {
      minimumOverlap = overlap;
      minimumTranslationNormal =
        centerDistanceOnAxis < 0 ? negateAxis(axis) : axis;
    }
  }

  if (
    minimumTranslationNormal === null ||
    !Number.isFinite(minimumOverlap)
  ) {
    return null;
  }

  return {
    normal: {
      x: minimumTranslationNormal.x,
      y: 0,
      z: minimumTranslationNormal.z
    },
    depth: minimumOverlap,
    verticalOverlap,
    planarCenterDistance
  };
}

export function hasKartCollisionBoundsOverlap(
  left: KartCollisionBounds,
  right: KartCollisionBounds
): boolean {
  return detectKartCollisionBoundsOverlap(left, right) !== null;
}

export function detectKartCollisionBoundsCircleOverlap(
  bounds: KartCollisionBounds,
  circle: KartCollisionCircleBounds
): KartCollisionBoundsCircleOverlap | null {
  assertKartCollisionBounds(bounds, "kart collision bounds");
  assertFiniteVector(circle.center, "circle collision center");
  assertPositiveFiniteDimension(circle.radius, "circle radius");

  const circleCenter = getPlanarPointInKartBoundsSpace(circle.center, bounds);
  const closestPoint = {
    right: clamp(circleCenter.right, -bounds.halfWidth, bounds.halfWidth),
    forward: clamp(circleCenter.forward, -bounds.halfLength, bounds.halfLength)
  };
  const circleCenterInsideKart =
    closestPoint.right === circleCenter.right &&
    closestPoint.forward === circleCenter.forward;
  const contact = circleCenterInsideKart
    ? getCircleInsideKartBoundsContact(circleCenter, bounds, circle.radius)
    : getCircleOutsideKartBoundsContact(
        closestPoint,
        circleCenter,
        bounds,
        circle.radius
      );

  if (contact === null) {
    return null;
  }

  return {
    normal: {
      x: contact.normal.x,
      y: 0,
      z: contact.normal.z
    },
    depth: contact.depth,
    contactPoint: {
      x: contact.point.x,
      y: circle.center.y,
      z: contact.point.z
    },
    planarCenterDistance: Math.hypot(
      bounds.center.x - circle.center.x,
      bounds.center.z - circle.center.z
    )
  };
}

export function hasKartCollisionBoundsCircleOverlap(
  bounds: KartCollisionBounds,
  circle: KartCollisionCircleBounds
): boolean {
  return detectKartCollisionBoundsCircleOverlap(bounds, circle) !== null;
}

export function detectKartCollisionBoundsPairOverlaps<
  Candidate extends KartCollisionBoundsPairCandidate
>(
  candidates: readonly Candidate[]
): readonly KartCollisionBoundsPairOverlap<Candidate>[] {
  const overlaps: KartCollisionBoundsPairOverlap<Candidate>[] = [];

  for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
    const left = candidates[leftIndex];

    if (left === undefined) {
      continue;
    }

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < candidates.length;
      rightIndex += 1
    ) {
      const right = candidates[rightIndex];

      if (right === undefined) {
        continue;
      }

      const overlap = detectKartCollisionBoundsOverlap(
        left.collisionBounds,
        right.collisionBounds
      );

      if (overlap !== null) {
        overlaps.push({ left, right, overlap });
      }
    }
  }

  return overlaps;
}

export function assertKartCollisionDimensions(
  dimensions: KartCollisionDimensions
): void {
  assertPositiveFiniteDimension(dimensions.length, "length");
  assertPositiveFiniteDimension(dimensions.width, "width");
  assertPositiveFiniteDimension(dimensions.height, "height");
}

export function assertKartCollisionBounds(
  bounds: KartCollisionBounds,
  label = "kart collision bounds"
): void {
  assertFiniteVector(bounds.center, `${label} center`);
  assertKartCollisionDimensions(bounds.dimensions);
  assertPositiveFiniteDimension(bounds.halfLength, `${label} half length`);
  assertPositiveFiniteDimension(bounds.halfWidth, `${label} half width`);
  assertPositiveFiniteDimension(bounds.halfHeight, `${label} half height`);
  assertPositiveFiniteDimension(
    bounds.boundingRadius,
    `${label} bounding radius`
  );
  assertFiniteVector(bounds.forward, `${label} forward`);
  assertFiniteVector(bounds.right, `${label} right`);
}

function createCorner(
  position: Vector3,
  forward: Vector3,
  right: Vector3,
  forwardOffset: number,
  rightOffset: number
): Vector3 {
  return {
    x: position.x + forward.x * forwardOffset + right.x * rightOffset,
    y: position.y,
    z: position.z + forward.z * forwardOffset + right.z * rightOffset
  };
}

interface KartBoundsLocalPoint {
  readonly right: number;
  readonly forward: number;
}

interface PlanarAxis {
  readonly x: number;
  readonly z: number;
}

interface PlanarCircleBoundsContact {
  readonly normal: PlanarAxis;
  readonly point: PlanarAxis;
  readonly depth: number;
}

function getPlanarPointInKartBoundsSpace(
  point: Vector3,
  bounds: KartCollisionBounds
): KartBoundsLocalPoint {
  const delta = {
    x: point.x - bounds.center.x,
    z: point.z - bounds.center.z
  };

  return {
    right: dotVectorPlanar(delta, toPlanarAxis(bounds.right, "kart right axis")),
    forward: dotVectorPlanar(
      delta,
      toPlanarAxis(bounds.forward, "kart forward axis")
    )
  };
}

function getWorldPointFromKartBoundsSpace(
  point: KartBoundsLocalPoint,
  bounds: KartCollisionBounds
): PlanarAxis {
  return {
    x:
      bounds.center.x +
      bounds.right.x * point.right +
      bounds.forward.x * point.forward,
    z:
      bounds.center.z +
      bounds.right.z * point.right +
      bounds.forward.z * point.forward
  };
}

function getCircleOutsideKartBoundsContact(
  closestPoint: KartBoundsLocalPoint,
  circleCenter: KartBoundsLocalPoint,
  bounds: KartCollisionBounds,
  circleRadius: number
): PlanarCircleBoundsContact | null {
  const delta = {
    right: closestPoint.right - circleCenter.right,
    forward: closestPoint.forward - circleCenter.forward
  };
  const distance = Math.hypot(delta.right, delta.forward);
  const depth = circleRadius - distance;

  if (depth <= 0) {
    return null;
  }

  const normal =
    distance <= Number.EPSILON
      ? { x: bounds.right.x, z: bounds.right.z }
      : toPlanarAxis(
          {
            x:
              bounds.right.x * (delta.right / distance) +
              bounds.forward.x * (delta.forward / distance),
            y: 0,
            z:
              bounds.right.z * (delta.right / distance) +
              bounds.forward.z * (delta.forward / distance)
          },
          "circle contact normal"
        );

  return {
    normal,
    point: getWorldPointFromKartBoundsSpace(closestPoint, bounds),
    depth
  };
}

function getCircleInsideKartBoundsContact(
  circleCenter: KartBoundsLocalPoint,
  bounds: KartCollisionBounds,
  circleRadius: number
): PlanarCircleBoundsContact {
  const rightFaceDistance = bounds.halfWidth - Math.abs(circleCenter.right);
  const forwardFaceDistance =
    bounds.halfLength - Math.abs(circleCenter.forward);
  const useRightAxis = rightFaceDistance <= forwardFaceDistance;
  const localNormal = useRightAxis
    ? {
        right: circleCenter.right < 0 ? -1 : 1,
        forward: 0
      }
    : {
        right: 0,
        forward: circleCenter.forward < 0 ? -1 : 1
      };
  const faceDistance = useRightAxis ? rightFaceDistance : forwardFaceDistance;
  const contactPoint = useRightAxis
    ? {
        right: localNormal.right * bounds.halfWidth,
        forward: circleCenter.forward
      }
    : {
        right: circleCenter.right,
        forward: localNormal.forward * bounds.halfLength
      };

  return {
    normal: {
      x:
        bounds.right.x * localNormal.right +
        bounds.forward.x * localNormal.forward,
      z:
        bounds.right.z * localNormal.right +
        bounds.forward.z * localNormal.forward
    },
    point: getWorldPointFromKartBoundsSpace(contactPoint, bounds),
    depth: circleRadius + faceDistance
  };
}

function getKartProjectionAxes(
  left: KartCollisionBounds,
  right: KartCollisionBounds
): readonly PlanarAxis[] {
  return [
    toPlanarAxis(left.right, "left kart right axis"),
    toPlanarAxis(left.forward, "left kart forward axis"),
    toPlanarAxis(right.right, "right kart right axis"),
    toPlanarAxis(right.forward, "right kart forward axis")
  ];
}

function getKartProjectionRadius(
  bounds: KartCollisionBounds,
  axis: PlanarAxis
): number {
  return (
    Math.abs(dotVectorPlanar(bounds.right, axis)) * bounds.halfWidth +
    Math.abs(dotVectorPlanar(bounds.forward, axis)) * bounds.halfLength
  );
}

function getVerticalOverlap(
  left: KartCollisionBounds,
  right: KartCollisionBounds
): number {
  return (
    left.halfHeight +
    right.halfHeight -
    Math.abs(left.center.y - right.center.y)
  );
}

function toPlanarAxis(vector: Vector3, label: string): PlanarAxis {
  assertFiniteVector(vector, label);

  const length = Math.hypot(vector.x, vector.z);

  if (length <= Number.EPSILON) {
    throw new Error(`${label} must have non-zero planar length.`);
  }

  return {
    x: vector.x / length,
    z: vector.z / length
  };
}

function negateAxis(axis: PlanarAxis): PlanarAxis {
  return {
    x: -axis.x,
    z: -axis.z
  };
}

function dotPlanar(x: number, z: number, axis: PlanarAxis): number {
  return x * axis.x + z * axis.z;
}

function dotVectorPlanar(
  vector: Pick<Vector3, "x" | "z">,
  axis: PlanarAxis
): number {
  return vector.x * axis.x + vector.z * axis.z;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function forwardFromHeading(headingRadians: number): Vector3 {
  return {
    x: Math.sin(headingRadians),
    y: 0,
    z: Math.cos(headingRadians)
  };
}

function rightFromHeading(headingRadians: number): Vector3 {
  return {
    x: Math.cos(headingRadians),
    y: 0,
    z: -Math.sin(headingRadians)
  };
}

function assertFiniteVector(vector: Vector3, label: string): void {
  if (
    !Number.isFinite(vector.x) ||
    !Number.isFinite(vector.y) ||
    !Number.isFinite(vector.z)
  ) {
    throw new Error(`${label} must have finite x, y, and z values.`);
  }
}

function assertPositiveFiniteDimension(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Kart collision ${label} must be a positive finite number.`);
  }
}
