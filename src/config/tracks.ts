import type { TrackLane, Vector3 } from "./aiRacers.js";
import { RACE_CAPACITY } from "./gameConfig.js";

export interface TrackBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface TrackMetadata {
  readonly id: string;
  readonly name: string;
  readonly lapCount: number;
  readonly spawnOrientationRadians: number;
  readonly bounds: TrackBounds;
}

export interface TrackCenterlineControlPoint {
  readonly id: string;
  readonly position: Vector3;
  readonly lane: TrackLane;
  readonly radius: number;
  readonly targetSpeed: number;
}

export interface TrackPathPoint extends TrackCenterlineControlPoint {
  readonly index: number;
  readonly trackProgress: number;
  readonly roadWidth: number;
}

export interface TrackRoadSegment {
  readonly id: string;
  readonly startPointIndex: number;
  readonly endPointIndex: number;
  readonly length: number;
  readonly startProgress: number;
  readonly endProgress: number;
}

export interface TrackStartFinishLine {
  readonly trackProgress: number;
  readonly center: Vector3;
  readonly left: Vector3;
  readonly right: Vector3;
  readonly headingRadians: number;
}

export type TrackSurfaceType = "road" | "shoulder" | "offTrack";

export interface TrackSurfaceBand<
  Surface extends Exclude<TrackSurfaceType, "offTrack"> =
    Exclude<TrackSurfaceType, "offTrack">
> {
  readonly surface: Surface;
  readonly drivable: boolean;
  readonly minCenterlineDistance: number;
  readonly maxCenterlineDistance: number;
}

export type TrackOffTrackRegionSide = "left" | "right";

export interface TrackOffTrackRegion {
  readonly id: string;
  readonly side: TrackOffTrackRegionSide;
  readonly surface: "offTrack";
  readonly drivable: false;
  readonly minCenterlineDistance: number;
  readonly boundary: readonly Vector3[];
}

export interface TrackCourseBoundary {
  readonly drivableHalfWidth: number;
  readonly shoulderWidth: number;
  readonly courseHalfWidth: number;
  readonly roadSurface: TrackSurfaceBand<"road">;
  readonly shoulderSurface: TrackSurfaceBand<"shoulder">;
  readonly leftCourseBoundary: readonly Vector3[];
  readonly rightCourseBoundary: readonly Vector3[];
  readonly offTrackRegions: readonly TrackOffTrackRegion[];
}

export interface TrackRoadGeometry {
  readonly closedLoop: true;
  readonly roadWidth: number;
  readonly shoulderWidth: number;
  readonly totalLength: number;
  readonly centerline: readonly TrackPathPoint[];
  readonly segments: readonly TrackRoadSegment[];
  readonly leftBoundary: readonly Vector3[];
  readonly rightBoundary: readonly Vector3[];
  readonly courseBoundary: TrackCourseBoundary;
  readonly startFinishLine: TrackStartFinishLine;
}

export type TrackCheckpointKind = "startFinish" | "checkpoint";

export type TrackCheckpointTriggerZoneShape = "circle";

export interface TrackCheckpointTriggerZone {
  readonly id: string;
  readonly checkpointSequenceId: string;
  readonly checkpointOrder: number;
  readonly kind: TrackCheckpointKind;
  readonly shape: TrackCheckpointTriggerZoneShape;
  readonly center: Vector3;
  readonly radius: number;
  readonly trackProgress: number;
}

export interface TrackCheckpoint {
  readonly id: string;
  readonly sequenceId: string;
  readonly index: number;
  readonly order: number;
  readonly kind: TrackCheckpointKind;
  readonly position: Vector3;
  readonly radius: number;
  readonly trackProgress: number;
  readonly headingRadians: number;
  readonly nextSequenceId: string;
  readonly triggerZone: TrackCheckpointTriggerZone;
}

export type TrackLapMarkerKind = "startFinish" | "progress";

export interface TrackLapMarker {
  readonly id: string;
  readonly sequenceId: string;
  readonly order: number;
  readonly kind: TrackLapMarkerKind;
  readonly position: Vector3;
  readonly radius: number;
  readonly trackProgress: number;
  readonly headingRadians: number;
  readonly nextMarkerOrder: number;
  readonly triggerZone: TrackCheckpointTriggerZone;
}

export interface TrackStartGridSlot {
  readonly slotIndex: number;
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly position: Vector3;
  readonly headingRadians: number;
  readonly lateralOffset: number;
  readonly forwardOffset: number;
}

export interface TrackItemBoxPlacement {
  readonly id: string;
  readonly position: Vector3;
  readonly trackProgress: number;
  readonly segmentIndex: number;
  readonly lateralOffset: number;
}

export interface TrackDefinition extends TrackMetadata {
  readonly road: TrackRoadGeometry;
  readonly lapMarkers: readonly TrackLapMarker[];
  readonly checkpoints: readonly TrackCheckpoint[];
  readonly checkpointTriggerZones: readonly TrackCheckpointTriggerZone[];
  readonly startGrid: readonly TrackStartGridSlot[];
  readonly itemBoxPlacements: readonly TrackItemBoxPlacement[];
}

export interface TrackGameplayBoundaryMetadata {
  readonly bounds: TrackBounds;
  readonly drivableHalfWidth: number;
  readonly shoulderWidth: number;
  readonly courseHalfWidth: number;
  readonly leftCourseBoundary: readonly Vector3[];
  readonly rightCourseBoundary: readonly Vector3[];
}

export interface TrackGameplayOffTrackMetadata {
  readonly roadSurface: TrackSurfaceBand<"road">;
  readonly shoulderSurface: TrackSurfaceBand<"shoulder">;
  readonly offTrackRegions: readonly TrackOffTrackRegion[];
}

export interface TrackGameplayMetadata extends TrackMetadata {
  readonly road: TrackRoadGeometry;
  readonly boundaryCollision: TrackGameplayBoundaryMetadata;
  readonly offTrackDetection: TrackGameplayOffTrackMetadata;
  readonly itemBoxPlacements: readonly TrackItemBoxPlacement[];
}

export type TrackGameplayMetadataSource = TrackMetadata & {
  readonly road: TrackRoadGeometry;
  readonly itemBoxPlacements?: readonly TrackItemBoxPlacement[];
};

export type TrackAiWaypoint = Pick<
  TrackPathPoint,
  "index" | "position" | "lane" | "radius" | "targetSpeed" | "trackProgress"
>;

export interface TrackRoadSegmentProjection {
  readonly segmentIndex: number;
  readonly point: Vector3;
  readonly distance: number;
  readonly signedLateralOffset: number;
  readonly trackProgress: number;
}

export interface TrackSurfaceQueryResult {
  readonly surface: TrackSurfaceType;
  readonly drivable: boolean;
  readonly offTrack: boolean;
  readonly withinCourseBoundary: boolean;
  readonly offTrackRegionId: string | null;
  readonly distanceFromCenterline: number;
  readonly signedLateralOffset: number;
  readonly nearestPoint: Vector3;
  readonly nearestSegmentIndex: number;
  readonly trackProgress: number;
}

export const RACE_LAP_COUNT = 3 as const;

const DEFAULT_TRACK_ROAD_WIDTH = 15;
const DEFAULT_TRACK_SHOULDER_WIDTH = 2;
const DEFAULT_TRACK_START_GRID_COLUMNS = 2;
const DEFAULT_TRACK_START_GRID_FIRST_ROW_FORWARD_OFFSET = 2.5;
const DEFAULT_TRACK_START_GRID_ROW_SPACING = 4;
const DEFAULT_TRACK_START_GRID_LATERAL_SPACING_FACTOR = 0.36;
const DEFAULT_TRACK_START_GRID_MIN_EDGE_CLEARANCE = 1.5;
const DEFAULT_TRACK_ITEM_BOX_MAX_RACING_LINE_OFFSET = 0.25;

const DEFAULT_TRACK_CENTERLINE_CONTROL_POINTS = [
  {
    id: "start-straight",
    position: { x: 0, y: 0.45, z: -55 },
    lane: "inside",
    radius: 14,
    targetSpeed: 34
  },
  {
    id: "south-straight",
    position: { x: 30, y: 0.45, z: -55 },
    lane: "inside",
    radius: 14,
    targetSpeed: 34
  },
  {
    id: "south-east-approach",
    position: { x: 55, y: 0.45, z: -55 },
    lane: "outside",
    radius: 16,
    targetSpeed: 30
  },
  {
    id: "east-sweeper",
    position: { x: 62, y: 0.45, z: -10 },
    lane: "outside",
    radius: 18,
    targetSpeed: 26
  },
  {
    id: "east-chicane",
    position: { x: 55, y: 0.45, z: 30 },
    lane: "outside",
    radius: 18,
    targetSpeed: 26
  },
  {
    id: "north-corner",
    position: { x: 25, y: 0.45, z: 55 },
    lane: "outside",
    radius: 16,
    targetSpeed: 26
  },
  {
    id: "north-west-corner",
    position: { x: -25, y: 0.45, z: 55 },
    lane: "outside",
    radius: 16,
    targetSpeed: 26
  },
  {
    id: "west-chicane",
    position: { x: -55, y: 0.45, z: 30 },
    lane: "outside",
    radius: 18,
    targetSpeed: 26
  },
  {
    id: "west-sweeper",
    position: { x: -62, y: 0.45, z: -10 },
    lane: "outside",
    radius: 18,
    targetSpeed: 26
  },
  {
    id: "south-west-approach",
    position: { x: -45, y: 0.45, z: -55 },
    lane: "outside",
    radius: 16,
    targetSpeed: 30
  }
] as const satisfies readonly TrackCenterlineControlPoint[];

const DEFAULT_TRACK_ITEM_BOX_PLACEMENT_SPECS = [
  {
    id: "boost-box-start-straight",
    segmentStartPointIndex: 0,
    segmentProgressRatio: 0.8,
    lateralOffset: 0
  },
  {
    id: "shell-box-south-east",
    segmentStartPointIndex: 1,
    segmentProgressRatio: 0.92,
    lateralOffset: 0
  },
  {
    id: "banana-box-east-sweeper",
    segmentStartPointIndex: 2,
    segmentProgressRatio: 0.89,
    lateralOffset: 0
  },
  {
    id: "boost-box-east-chicane",
    segmentStartPointIndex: 3,
    segmentProgressRatio: 0.88,
    lateralOffset: 0
  },
  {
    id: "boost-box-north-east",
    segmentStartPointIndex: 5,
    segmentProgressRatio: 0.08,
    lateralOffset: 0
  },
  {
    id: "banana-box-north-west",
    segmentStartPointIndex: 5,
    segmentProgressRatio: 0.92,
    lateralOffset: 0
  },
  {
    id: "boost-box-west-chicane",
    segmentStartPointIndex: 7,
    segmentProgressRatio: 0.13,
    lateralOffset: 0
  },
  {
    id: "shell-box-west-sweeper",
    segmentStartPointIndex: 8,
    segmentProgressRatio: 0.11,
    lateralOffset: 0
  },
  {
    id: "banana-box-final-straight",
    segmentStartPointIndex: 9,
    segmentProgressRatio: 0.38,
    lateralOffset: 0
  }
] as const;

export const DEFAULT_TRACK_ROAD_GEOMETRY = createTrackRoadGeometry(
  DEFAULT_TRACK_CENTERLINE_CONTROL_POINTS,
  DEFAULT_TRACK_ROAD_WIDTH,
  DEFAULT_TRACK_SHOULDER_WIDTH
);

export const DEFAULT_TRACK_METADATA = {
  id: "turbo-yard",
  name: "Turbo Yard",
  lapCount: RACE_LAP_COUNT,
  spawnOrientationRadians:
    DEFAULT_TRACK_ROAD_GEOMETRY.startFinishLine.headingRadians,
  bounds: createTrackBounds(DEFAULT_TRACK_ROAD_GEOMETRY)
} as const satisfies TrackMetadata;

export const DEFAULT_TRACK_START_GRID = createTrackStartGrid(
  DEFAULT_TRACK_ROAD_GEOMETRY,
  RACE_CAPACITY
);

export const DEFAULT_TRACK_ITEM_BOX_PLACEMENTS = createTrackItemBoxPlacements(
  DEFAULT_TRACK_ROAD_GEOMETRY,
  DEFAULT_TRACK_ITEM_BOX_PLACEMENT_SPECS
);

export const DEFAULT_TRACK_CHECKPOINTS = createTrackCheckpoints(
  DEFAULT_TRACK_ROAD_GEOMETRY
);

export const DEFAULT_TRACK_CHECKPOINT_TRIGGER_ZONES =
  createTrackCheckpointTriggerZones(DEFAULT_TRACK_CHECKPOINTS);

export const DEFAULT_TRACK_LAP_MARKERS = createTrackLapMarkers(
  DEFAULT_TRACK_CHECKPOINTS
);

export const DEFAULT_TRACK_DEFINITION = {
  ...DEFAULT_TRACK_METADATA,
  road: DEFAULT_TRACK_ROAD_GEOMETRY,
  lapMarkers: DEFAULT_TRACK_LAP_MARKERS,
  checkpoints: DEFAULT_TRACK_CHECKPOINTS,
  checkpointTriggerZones: DEFAULT_TRACK_CHECKPOINT_TRIGGER_ZONES,
  startGrid: DEFAULT_TRACK_START_GRID,
  itemBoxPlacements: DEFAULT_TRACK_ITEM_BOX_PLACEMENTS
} as const satisfies TrackDefinition;

export const DEFAULT_TRACK_GAMEPLAY_METADATA =
  createTrackGameplayMetadata(DEFAULT_TRACK_DEFINITION);

export const DEFAULT_TRACK_WAYPOINTS: readonly TrackAiWaypoint[] =
  DEFAULT_TRACK_DEFINITION.road.centerline.map((point) => ({
    index: point.index,
    position: point.position,
    lane: point.lane,
    radius: point.radius,
    targetSpeed: point.targetSpeed,
    trackProgress: point.trackProgress
  }));

export function assertTrackMetadataIntegrity(
  metadata: TrackMetadata = DEFAULT_TRACK_METADATA
): void {
  if (metadata.id.trim().length === 0) {
    throw new Error("Track metadata id must be non-empty.");
  }

  if (metadata.name.trim().length === 0) {
    throw new Error("Track metadata name must be non-empty.");
  }

  if (!Number.isInteger(metadata.lapCount) || metadata.lapCount < 1) {
    throw new Error(
      `Track ${metadata.id} lap count must be a positive integer, found ${metadata.lapCount}.`
    );
  }

  if (metadata.lapCount !== RACE_LAP_COUNT) {
    throw new Error(
      `Track ${metadata.id} race length must be ${RACE_LAP_COUNT} laps, found ${metadata.lapCount}.`
    );
  }

  if (!Number.isFinite(metadata.spawnOrientationRadians)) {
    throw new Error(
      `Track ${metadata.id} spawn orientation must be finite, found ${metadata.spawnOrientationRadians}.`
    );
  }

  assertTrackBoundsIntegrity(metadata.id, metadata.bounds);
}

export function assertTrackDefinitionIntegrity(
  definition: TrackDefinition = DEFAULT_TRACK_DEFINITION
): void {
  assertTrackMetadataIntegrity(definition);
  assertRoadGeometryIntegrity(definition.id, definition.road);

  if (
    Math.abs(
      definition.spawnOrientationRadians -
        definition.road.startFinishLine.headingRadians
    ) > 0.000_001
  ) {
    throw new Error(
      `Track ${definition.id} spawn orientation must match the start finish heading.`
    );
  }

  assertTrackLapMarkerIntegrity(definition.id, definition);
  assertTrackCheckpointIntegrity(definition.id, definition);
  assertTrackStartGridIntegrity(
    definition.id,
    definition.road,
    definition.startGrid
  );
  assertTrackItemBoxPlacementIntegrity(
    definition.id,
    definition.road,
    definition.itemBoxPlacements
  );
}

export function createTrackGameplayMetadata(
  source: TrackGameplayMetadataSource = DEFAULT_TRACK_DEFINITION
): TrackGameplayMetadata {
  const courseBoundary = source.road.courseBoundary;

  assertTrackMetadataIntegrity(source);
  assertRoadGeometryIntegrity(source.id, source.road);

  return {
    id: source.id,
    name: source.name,
    lapCount: source.lapCount,
    spawnOrientationRadians: source.spawnOrientationRadians,
    bounds: source.bounds,
    road: source.road,
    boundaryCollision: {
      bounds: source.bounds,
      drivableHalfWidth: courseBoundary.drivableHalfWidth,
      shoulderWidth: courseBoundary.shoulderWidth,
      courseHalfWidth: courseBoundary.courseHalfWidth,
      leftCourseBoundary: courseBoundary.leftCourseBoundary,
      rightCourseBoundary: courseBoundary.rightCourseBoundary
    },
    offTrackDetection: {
      roadSurface: courseBoundary.roadSurface,
      shoulderSurface: courseBoundary.shoulderSurface,
      offTrackRegions: courseBoundary.offTrackRegions
    },
    itemBoxPlacements: source.itemBoxPlacements ?? []
  };
}

export function queryTrackGameplaySurfaceAtPoint(
  metadata: TrackGameplayMetadata,
  position: Pick<Vector3, "x" | "z">,
  radius = 0
): TrackSurfaceQueryResult {
  return queryTrackSurfaceAtPoint(metadata.road, position, radius);
}

function assertTrackBoundsIntegrity(trackId: string, bounds: TrackBounds): void {
  const values = [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ];

  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Track ${trackId} bounds must contain only finite values.`);
  }

  if (bounds.minX >= bounds.maxX) {
    throw new Error(
      `Track ${trackId} bounds minX must be less than maxX.`
    );
  }

  if (bounds.minZ >= bounds.maxZ) {
    throw new Error(
      `Track ${trackId} bounds minZ must be less than maxZ.`
    );
  }
}

function createTrackRoadGeometry(
  controlPoints: readonly TrackCenterlineControlPoint[],
  roadWidth: number,
  shoulderWidth: number
): TrackRoadGeometry {
  if (controlPoints.length < 4) {
    throw new Error("A closed-loop track requires at least 4 centerline points.");
  }

  const segmentLengths = controlPoints.map((point, index) => {
    const nextPoint = requireArrayItem(controlPoints, index + 1);
    return getPlanarDistance(point.position, nextPoint.position);
  });
  const totalLength = segmentLengths.reduce(
    (sum, segmentLength) => sum + segmentLength,
    0
  );
  const centerline: TrackPathPoint[] = [];
  let trackProgress = 0;

  for (let index = 0; index < controlPoints.length; index += 1) {
    const point = requireArrayItem(controlPoints, index);

    centerline.push({
      ...point,
      index,
      trackProgress,
      roadWidth
    });

    trackProgress += requireArrayItem(segmentLengths, index);
  }

  const segments = centerline.map<TrackRoadSegment>((point, index) => {
    const nextIndex = positiveModulo(index + 1, centerline.length);
    const nextPoint = requireArrayItem(centerline, nextIndex);
    const length = requireArrayItem(segmentLengths, index);

    return {
      id: `${point.id}-to-${nextPoint.id}`,
      startPointIndex: point.index,
      endPointIndex: nextPoint.index,
      length,
      startProgress: point.trackProgress,
      endProgress:
        nextIndex === 0 ? totalLength : point.trackProgress + length
    };
  });
  const boundaries = createTrackBoundaries(centerline, roadWidth);
  const courseBoundary = createTrackCourseBoundary(
    centerline,
    boundaries.leftBoundary,
    boundaries.rightBoundary,
    roadWidth,
    shoulderWidth
  );
  const startPoint = requireArrayItem(centerline, 0);
  const startLeft = requireArrayItem(boundaries.leftBoundary, 0);
  const startRight = requireArrayItem(boundaries.rightBoundary, 0);

  return {
    closedLoop: true,
    roadWidth,
    shoulderWidth,
    totalLength,
    centerline,
    segments,
    leftBoundary: boundaries.leftBoundary,
    rightBoundary: boundaries.rightBoundary,
    courseBoundary,
    startFinishLine: {
      trackProgress: 0,
      center: startPoint.position,
      left: startLeft,
      right: startRight,
      headingRadians: getHeadingRadians(
        startPoint.position,
        requireArrayItem(centerline, 1).position
      )
    }
  };
}

function createTrackBoundaries(
  centerline: readonly TrackPathPoint[],
  roadWidth: number
): {
  readonly leftBoundary: readonly Vector3[];
  readonly rightBoundary: readonly Vector3[];
} {
  const halfRoadWidth = roadWidth / 2;
  const leftBoundary: Vector3[] = [];
  const rightBoundary: Vector3[] = [];

  for (let index = 0; index < centerline.length; index += 1) {
    const previousPoint = requireArrayItem(centerline, index - 1);
    const nextPoint = requireArrayItem(centerline, index + 1);
    const point = requireArrayItem(centerline, index);
    const tangent = normalizePlanarVector(
      nextPoint.position.x - previousPoint.position.x,
      nextPoint.position.z - previousPoint.position.z
    );
    const leftNormal = { x: -tangent.z, z: tangent.x };

    leftBoundary.push({
      x: point.position.x + leftNormal.x * halfRoadWidth,
      y: point.position.y,
      z: point.position.z + leftNormal.z * halfRoadWidth
    });
    rightBoundary.push({
      x: point.position.x - leftNormal.x * halfRoadWidth,
      y: point.position.y,
      z: point.position.z - leftNormal.z * halfRoadWidth
    });
  }

  return { leftBoundary, rightBoundary };
}

function createTrackCourseBoundary(
  centerline: readonly TrackPathPoint[],
  leftBoundary: readonly Vector3[],
  rightBoundary: readonly Vector3[],
  roadWidth: number,
  shoulderWidth: number
): TrackCourseBoundary {
  const drivableHalfWidth = roadWidth / 2;
  const courseHalfWidth = drivableHalfWidth + shoulderWidth;
  const leftCourseBoundary = createOffsetBoundary(
    centerline,
    leftBoundary,
    shoulderWidth
  );
  const rightCourseBoundary = createOffsetBoundary(
    centerline,
    rightBoundary,
    shoulderWidth
  );

  return {
    drivableHalfWidth,
    shoulderWidth,
    courseHalfWidth,
    roadSurface: {
      surface: "road",
      drivable: true,
      minCenterlineDistance: 0,
      maxCenterlineDistance: drivableHalfWidth
    },
    shoulderSurface: {
      surface: "shoulder",
      drivable: false,
      minCenterlineDistance: drivableHalfWidth,
      maxCenterlineDistance: courseHalfWidth
    },
    leftCourseBoundary,
    rightCourseBoundary,
    offTrackRegions: createTrackOffTrackRegions(
      courseHalfWidth,
      leftCourseBoundary,
      rightCourseBoundary
    )
  };
}

function createTrackOffTrackRegions(
  minCenterlineDistance: number,
  leftCourseBoundary: readonly Vector3[],
  rightCourseBoundary: readonly Vector3[]
): readonly TrackOffTrackRegion[] {
  return [
    {
      id: "left-off-track",
      side: "left",
      surface: "offTrack",
      drivable: false,
      minCenterlineDistance,
      boundary: leftCourseBoundary
    },
    {
      id: "right-off-track",
      side: "right",
      surface: "offTrack",
      drivable: false,
      minCenterlineDistance,
      boundary: rightCourseBoundary
    }
  ];
}

function createOffsetBoundary(
  centerline: readonly TrackPathPoint[],
  boundary: readonly Vector3[],
  distance: number
): readonly Vector3[] {
  return boundary.map((point, index) => {
    const centerPoint = requireArrayItem(centerline, index).position;
    const offsetX = point.x - centerPoint.x;
    const offsetZ = point.z - centerPoint.z;
    const offsetLength = Math.hypot(offsetX, offsetZ);

    if (offsetLength <= Number.EPSILON) {
      return point;
    }

    return {
      x: point.x + (offsetX / offsetLength) * distance,
      y: point.y,
      z: point.z + (offsetZ / offsetLength) * distance
    };
  });
}

function createTrackCheckpoints(
  road: TrackRoadGeometry
): readonly TrackCheckpoint[] {
  return road.centerline.map((point, order) => {
    const nextPoint = requireArrayItem(road.centerline, order + 1);
    const sequenceId = createCheckpointSequenceId(order);
    const kind: TrackCheckpointKind =
      order === 0 ? "startFinish" : "checkpoint";
    const headingRadians = getHeadingRadians(point.position, nextPoint.position);
    const triggerZone = {
      id: `${sequenceId}-trigger`,
      checkpointSequenceId: sequenceId,
      checkpointOrder: order,
      kind,
      shape: "circle",
      center: point.position,
      radius: point.radius,
      trackProgress: point.trackProgress
    } satisfies TrackCheckpointTriggerZone;

    return {
      id: order === 0 ? "start-finish" : `checkpoint-${point.id}`,
      sequenceId,
      index: point.index,
      order,
      kind,
      position: point.position,
      radius: point.radius,
      trackProgress: point.trackProgress,
      headingRadians,
      nextSequenceId: createCheckpointSequenceId(
        positiveModulo(order + 1, road.centerline.length)
      ),
      triggerZone
    } satisfies TrackCheckpoint;
  });
}

function createTrackCheckpointTriggerZones(
  checkpoints: readonly TrackCheckpoint[]
): readonly TrackCheckpointTriggerZone[] {
  return checkpoints.map((checkpoint) => checkpoint.triggerZone);
}

function createTrackLapMarkers(
  checkpoints: readonly TrackCheckpoint[]
): readonly TrackLapMarker[] {
  return checkpoints.map((checkpoint, order) => ({
    id: checkpoint.id,
    sequenceId: checkpoint.sequenceId,
    order: checkpoint.order,
    kind: checkpoint.kind === "startFinish" ? "startFinish" : "progress",
    position: checkpoint.position,
    radius: checkpoint.radius,
    trackProgress: checkpoint.trackProgress,
    headingRadians: checkpoint.headingRadians,
    nextMarkerOrder: positiveModulo(order + 1, checkpoints.length),
    triggerZone: checkpoint.triggerZone
  }) satisfies TrackLapMarker);
}

function createTrackStartGrid(
  road: TrackRoadGeometry,
  slotCount: number
): readonly TrackStartGridSlot[] {
  if (!Number.isInteger(slotCount) || slotCount < 1) {
    throw new Error(
      `Track start grid slot count must be positive, found ${slotCount}.`
    );
  }

  const startLine = road.startFinishLine;
  const headingRadians = startLine.headingRadians;
  const forward = getForwardVector(headingRadians);
  const right = getRightVector(headingRadians);
  const lateralSpacing =
    road.roadWidth * DEFAULT_TRACK_START_GRID_LATERAL_SPACING_FACTOR;

  return Array.from({ length: slotCount }, (_, slotIndex) => {
    const rowIndex = Math.floor(slotIndex / DEFAULT_TRACK_START_GRID_COLUMNS);
    const columnIndex = slotIndex % DEFAULT_TRACK_START_GRID_COLUMNS;
    const lateralOffset =
      (columnIndex - (DEFAULT_TRACK_START_GRID_COLUMNS - 1) / 2) *
      lateralSpacing;
    const forwardOffset =
      DEFAULT_TRACK_START_GRID_FIRST_ROW_FORWARD_OFFSET +
      rowIndex * DEFAULT_TRACK_START_GRID_ROW_SPACING;

    return {
      slotIndex,
      rowIndex,
      columnIndex,
      position: {
        x:
          startLine.center.x +
          forward.x * forwardOffset +
          right.x * lateralOffset,
        y: startLine.center.y,
        z:
          startLine.center.z +
          forward.z * forwardOffset +
          right.z * lateralOffset
      },
      headingRadians,
      lateralOffset,
      forwardOffset
    } satisfies TrackStartGridSlot;
  });
}

function createTrackItemBoxPlacements(
  road: TrackRoadGeometry,
  specs: readonly {
    readonly id: string;
    readonly segmentStartPointIndex: number;
    readonly segmentProgressRatio: number;
    readonly lateralOffset: number;
  }[]
): readonly TrackItemBoxPlacement[] {
  const ids = new Set<string>();

  return specs.map((spec) => {
    if (spec.id.trim().length === 0 || ids.has(spec.id)) {
      throw new Error("Track item box placement ids must be unique and non-empty.");
    }

    if (
      !Number.isInteger(spec.segmentStartPointIndex) ||
      spec.segmentStartPointIndex < 0 ||
      spec.segmentStartPointIndex >= road.segments.length
    ) {
      throw new Error(
        `Track item box ${spec.id} has an invalid segment index ${spec.segmentStartPointIndex}.`
      );
    }

    if (
      !Number.isFinite(spec.segmentProgressRatio) ||
      spec.segmentProgressRatio <= 0 ||
      spec.segmentProgressRatio >= 1
    ) {
      throw new Error(
        `Track item box ${spec.id} must sit inside its road segment.`
      );
    }

    if (
      !Number.isFinite(spec.lateralOffset) ||
      Math.abs(spec.lateralOffset) > DEFAULT_TRACK_ITEM_BOX_MAX_RACING_LINE_OFFSET
    ) {
      throw new Error(
        `Track item box ${spec.id} must stay on the racing line.`
      );
    }

    const startPoint = requireArrayItem(
      road.centerline,
      spec.segmentStartPointIndex
    );
    const endPoint = requireArrayItem(
      road.centerline,
      spec.segmentStartPointIndex + 1
    );
    const segment = requireArrayItem(road.segments, spec.segmentStartPointIndex);
    const position = interpolateTrackRoadSegmentPosition(
      startPoint.position,
      endPoint.position,
      spec.segmentProgressRatio,
      spec.lateralOffset
    );

    ids.add(spec.id);

    return {
      id: spec.id,
      position,
      trackProgress: normalizeTrackProgress(
        segment.startProgress + segment.length * spec.segmentProgressRatio,
        road.totalLength
      ),
      segmentIndex: spec.segmentStartPointIndex,
      lateralOffset: spec.lateralOffset
    } satisfies TrackItemBoxPlacement;
  });
}

function createTrackBounds(road: TrackRoadGeometry): TrackBounds {
  const boundaryPoints = [
    ...road.leftBoundary,
    ...road.rightBoundary,
    ...road.courseBoundary.leftCourseBoundary,
    ...road.courseBoundary.rightCourseBoundary
  ];
  const minX = Math.min(...boundaryPoints.map((point) => point.x));
  const maxX = Math.max(...boundaryPoints.map((point) => point.x));
  const minZ = Math.min(...boundaryPoints.map((point) => point.z));
  const maxZ = Math.max(...boundaryPoints.map((point) => point.z));

  return {
    minX: Math.floor(minX),
    maxX: Math.ceil(maxX),
    minZ: Math.floor(minZ),
    maxZ: Math.ceil(maxZ)
  };
}

export function getNearestTrackRoadProjection(
  road: TrackRoadGeometry,
  position: Pick<Vector3, "x" | "z">
): TrackRoadSegmentProjection {
  assertFinitePlanarPosition(position, "track surface query position");

  let nearestProjection: TrackRoadSegmentProjection | null = null;

  for (let index = 0; index < road.centerline.length; index += 1) {
    const startPoint = requireArrayItem(road.centerline, index);
    const endPoint = requireArrayItem(road.centerline, index + 1);
    const projected = projectPointOntoRoadSegment(
      position,
      startPoint.position,
      endPoint.position
    );
    const distance = getPlanarDistance(position, projected.point);
    const projection: TrackRoadSegmentProjection = {
      segmentIndex: index,
      point: projected.point,
      distance,
      signedLateralOffset: getSignedLateralOffset(
        position,
        startPoint.position,
        endPoint.position,
        projected.point
      ),
      trackProgress: normalizeTrackProgress(
        startPoint.trackProgress +
          requireArrayItem(road.segments, index).length * projected.progressRatio,
        road.totalLength
      )
    };

    if (
      nearestProjection === null ||
      projection.distance < nearestProjection.distance
    ) {
      nearestProjection = projection;
    }
  }

  if (nearestProjection === null) {
    throw new Error("Road geometry must include at least one segment.");
  }

  return nearestProjection;
}

export function queryTrackSurfaceAtPoint(
  road: TrackRoadGeometry,
  position: Pick<Vector3, "x" | "z">,
  radius = 0
): TrackSurfaceQueryResult {
  if (!Number.isFinite(radius) || radius < 0) {
    throw new Error(`Track surface query radius must be non-negative, found ${radius}.`);
  }

  const projection = getNearestTrackRoadProjection(road, position);
  const footprintDistance = projection.distance + radius;
  const boundary = road.courseBoundary;
  const surface =
    footprintDistance <= boundary.roadSurface.maxCenterlineDistance
      ? boundary.roadSurface.surface
      : footprintDistance <= boundary.shoulderSurface.maxCenterlineDistance
        ? boundary.shoulderSurface.surface
        : "offTrack";
  const drivable = surface === "road";
  const withinCourseBoundary =
    footprintDistance <= boundary.courseHalfWidth + 1e-9;
  const offTrackRegion =
    surface === "offTrack"
      ? getOffTrackRegionForSignedLateralOffset(
          boundary,
          projection.signedLateralOffset
        )
      : null;

  return {
    surface,
    drivable,
    offTrack: !drivable,
    withinCourseBoundary,
    offTrackRegionId: offTrackRegion?.id ?? null,
    distanceFromCenterline: projection.distance,
    signedLateralOffset: projection.signedLateralOffset,
    nearestPoint: projection.point,
    nearestSegmentIndex: projection.segmentIndex,
    trackProgress: projection.trackProgress
  };
}

function getOffTrackRegionForSignedLateralOffset(
  boundary: TrackCourseBoundary,
  signedLateralOffset: number
): TrackOffTrackRegion | null {
  const side: TrackOffTrackRegionSide =
    signedLateralOffset >= 0 ? "left" : "right";

  return boundary.offTrackRegions.find((region) => region.side === side) ?? null;
}

export function isTrackPointDrivable(
  road: TrackRoadGeometry,
  position: Pick<Vector3, "x" | "z">,
  radius = 0
): boolean {
  return queryTrackSurfaceAtPoint(road, position, radius).drivable;
}

export function isTrackPointInsideCourseBoundary(
  road: TrackRoadGeometry,
  position: Pick<Vector3, "x" | "z">,
  radius = 0
): boolean {
  return queryTrackSurfaceAtPoint(road, position, radius).withinCourseBoundary;
}

function assertRoadGeometryIntegrity(
  trackId: string,
  road: TrackRoadGeometry
): void {
  if (road.closedLoop !== true) {
    throw new Error(`Track ${trackId} road must be a closed loop.`);
  }

  if (!Number.isFinite(road.roadWidth) || road.roadWidth <= 0) {
    throw new Error(`Track ${trackId} road width must be positive.`);
  }

  if (!Number.isFinite(road.shoulderWidth) || road.shoulderWidth < 0) {
    throw new Error(`Track ${trackId} shoulder width must be non-negative.`);
  }

  if (!Number.isFinite(road.totalLength) || road.totalLength <= 0) {
    throw new Error(`Track ${trackId} road total length must be positive.`);
  }

  if (road.centerline.length < 4) {
    throw new Error(`Track ${trackId} road must include at least 4 path points.`);
  }

  if (road.segments.length !== road.centerline.length) {
    throw new Error(
      `Track ${trackId} must have one road segment per centerline point.`
    );
  }

  if (
    road.leftBoundary.length !== road.centerline.length ||
    road.rightBoundary.length !== road.centerline.length
  ) {
    throw new Error(
      `Track ${trackId} road boundaries must match centerline point count.`
    );
  }

  assertCenterlineIntegrity(trackId, road.centerline, road.totalLength);
  assertSegmentIntegrity(trackId, road);
  assertBoundaryIntegrity(trackId, road);
  assertCourseBoundaryIntegrity(trackId, road);
  assertStartFinishLineIntegrity(trackId, road);
}

function assertCenterlineIntegrity(
  trackId: string,
  centerline: readonly TrackPathPoint[],
  totalLength: number
): void {
  const ids = new Set<string>();
  let previousProgress = -Number.EPSILON;

  for (const point of centerline) {
    if (ids.has(point.id)) {
      throw new Error(`Track ${trackId} has duplicate path point id ${point.id}.`);
    }

    ids.add(point.id);

    if (point.index < 0 || point.index >= centerline.length) {
      throw new Error(`Track ${trackId} path point ${point.id} has invalid index.`);
    }

    assertFiniteVector(trackId, point.position, `path point ${point.id}`);

    if (
      !Number.isFinite(point.trackProgress) ||
      point.trackProgress < 0 ||
      point.trackProgress >= totalLength ||
      point.trackProgress < previousProgress
    ) {
      throw new Error(
        `Track ${trackId} path point ${point.id} has invalid progress.`
      );
    }

    if (!Number.isFinite(point.radius) || point.radius <= 0) {
      throw new Error(`Track ${trackId} path point ${point.id} radius is invalid.`);
    }

    if (!Number.isFinite(point.targetSpeed) || point.targetSpeed <= 0) {
      throw new Error(
        `Track ${trackId} path point ${point.id} target speed is invalid.`
      );
    }

    previousProgress = point.trackProgress;
  }
}

function assertSegmentIntegrity(
  trackId: string,
  road: TrackRoadGeometry
): void {
  for (let index = 0; index < road.segments.length; index += 1) {
    const segment = requireArrayItem(road.segments, index);
    const expectedStart = requireArrayItem(road.centerline, index);
    const expectedEnd = requireArrayItem(road.centerline, index + 1);

    if (
      segment.startPointIndex !== expectedStart.index ||
      segment.endPointIndex !== expectedEnd.index
    ) {
      throw new Error(
        `Track ${trackId} segment ${segment.id} does not follow centerline order.`
      );
    }

    if (!Number.isFinite(segment.length) || segment.length <= 0) {
      throw new Error(`Track ${trackId} segment ${segment.id} length is invalid.`);
    }

    if (
      !Number.isFinite(segment.startProgress) ||
      !Number.isFinite(segment.endProgress) ||
      segment.startProgress < 0 ||
      segment.endProgress <= segment.startProgress ||
      segment.endProgress > road.totalLength + Number.EPSILON
    ) {
      throw new Error(
        `Track ${trackId} segment ${segment.id} progress range is invalid.`
      );
    }
  }
}

function assertBoundaryIntegrity(
  trackId: string,
  road: TrackRoadGeometry
): void {
  for (let index = 0; index < road.centerline.length; index += 1) {
    const center = requireArrayItem(road.centerline, index).position;
    const left = requireArrayItem(road.leftBoundary, index);
    const right = requireArrayItem(road.rightBoundary, index);
    const expectedHalfWidth = road.roadWidth / 2;
    const leftDistance = getPlanarDistance(center, left);
    const rightDistance = getPlanarDistance(center, right);

    assertFiniteVector(trackId, left, `left boundary ${index}`);
    assertFiniteVector(trackId, right, `right boundary ${index}`);

    if (
      Math.abs(leftDistance - expectedHalfWidth) > 0.001 ||
      Math.abs(rightDistance - expectedHalfWidth) > 0.001
    ) {
      throw new Error(
        `Track ${trackId} boundary ${index} does not match road width.`
      );
    }
  }
}

function assertCourseBoundaryIntegrity(
  trackId: string,
  road: TrackRoadGeometry
): void {
  const boundary = road.courseBoundary;
  const expectedDrivableHalfWidth = road.roadWidth / 2;
  const expectedCourseHalfWidth = expectedDrivableHalfWidth + road.shoulderWidth;

  if (
    Math.abs(boundary.drivableHalfWidth - expectedDrivableHalfWidth) > 0.001 ||
    Math.abs(boundary.shoulderWidth - road.shoulderWidth) > 0.001 ||
    Math.abs(boundary.courseHalfWidth - expectedCourseHalfWidth) > 0.001
  ) {
    throw new Error(`Track ${trackId} course boundary widths are inconsistent.`);
  }

  assertSurfaceBandIntegrity(
    trackId,
    boundary.roadSurface,
    "road",
    true,
    0,
    expectedDrivableHalfWidth
  );
  assertSurfaceBandIntegrity(
    trackId,
    boundary.shoulderSurface,
    "shoulder",
    false,
    expectedDrivableHalfWidth,
    expectedCourseHalfWidth
  );

  if (
    boundary.leftCourseBoundary.length !== road.centerline.length ||
    boundary.rightCourseBoundary.length !== road.centerline.length
  ) {
    throw new Error(
      `Track ${trackId} course boundaries must match centerline point count.`
    );
  }

  for (let index = 0; index < road.centerline.length; index += 1) {
    const center = requireArrayItem(road.centerline, index).position;
    const left = requireArrayItem(boundary.leftCourseBoundary, index);
    const right = requireArrayItem(boundary.rightCourseBoundary, index);
    const leftDistance = getPlanarDistance(center, left);
    const rightDistance = getPlanarDistance(center, right);

    assertFiniteVector(trackId, left, `left course boundary ${index}`);
    assertFiniteVector(trackId, right, `right course boundary ${index}`);

    if (
      Math.abs(leftDistance - expectedCourseHalfWidth) > 0.001 ||
      Math.abs(rightDistance - expectedCourseHalfWidth) > 0.001
    ) {
      throw new Error(
        `Track ${trackId} course boundary ${index} does not match course width.`
      );
    }
  }

  assertOffTrackRegionIntegrity(trackId, road);
}

function assertSurfaceBandIntegrity<
  Surface extends Exclude<TrackSurfaceType, "offTrack">
>(
  trackId: string,
  band: TrackSurfaceBand<Surface>,
  surface: Surface,
  drivable: boolean,
  expectedMinDistance: number,
  expectedMaxDistance: number
): void {
  if (band.surface !== surface || band.drivable !== drivable) {
    throw new Error(`Track ${trackId} ${surface} surface metadata is invalid.`);
  }

  if (
    !Number.isFinite(band.minCenterlineDistance) ||
    !Number.isFinite(band.maxCenterlineDistance) ||
    band.minCenterlineDistance < 0 ||
    band.maxCenterlineDistance < band.minCenterlineDistance ||
    Math.abs(band.minCenterlineDistance - expectedMinDistance) > 0.001 ||
    Math.abs(band.maxCenterlineDistance - expectedMaxDistance) > 0.001
  ) {
    throw new Error(
      `Track ${trackId} ${surface} surface distance range is invalid.`
    );
  }
}

function assertOffTrackRegionIntegrity(
  trackId: string,
  road: TrackRoadGeometry
): void {
  const boundary = road.courseBoundary;
  const expectedRegions = [
    {
      side: "left",
      boundary: boundary.leftCourseBoundary
    },
    {
      side: "right",
      boundary: boundary.rightCourseBoundary
    }
  ] as const;

  if (boundary.offTrackRegions.length !== expectedRegions.length) {
    throw new Error(
      `Track ${trackId} must define ${expectedRegions.length} off-track regions.`
    );
  }

  const ids = new Set<string>();

  for (const expected of expectedRegions) {
    const region = boundary.offTrackRegions.find(
      (candidate) => candidate.side === expected.side
    );

    if (region === undefined) {
      throw new Error(
        `Track ${trackId} is missing ${expected.side} off-track region metadata.`
      );
    }

    if (region.id.trim().length === 0 || ids.has(region.id)) {
      throw new Error(
        `Track ${trackId} off-track region ids must be unique and non-empty.`
      );
    }

    if (region.surface !== "offTrack" || region.drivable !== false) {
      throw new Error(
        `Track ${trackId} ${region.id} off-track surface metadata is invalid.`
      );
    }

    if (
      !Number.isFinite(region.minCenterlineDistance) ||
      Math.abs(region.minCenterlineDistance - boundary.courseHalfWidth) > 0.001
    ) {
      throw new Error(
        `Track ${trackId} ${region.id} off-track distance range is invalid.`
      );
    }

    if (region.boundary.length !== expected.boundary.length) {
      throw new Error(
        `Track ${trackId} ${region.id} boundary must match course boundary point count.`
      );
    }

    for (let index = 0; index < region.boundary.length; index += 1) {
      const actual = requireArrayItem(region.boundary, index);
      const expectedPoint = requireArrayItem(expected.boundary, index);

      assertFiniteVector(trackId, actual, `${region.id} boundary ${index}`);

      if (
        Math.abs(actual.x - expectedPoint.x) > 0.001 ||
        Math.abs(actual.y - expectedPoint.y) > 0.001 ||
        Math.abs(actual.z - expectedPoint.z) > 0.001
      ) {
        throw new Error(
          `Track ${trackId} ${region.id} boundary does not match the ${region.side} course edge.`
        );
      }
    }

    ids.add(region.id);
  }
}

function assertStartFinishLineIntegrity(
  trackId: string,
  road: TrackRoadGeometry
): void {
  assertFiniteVector(trackId, road.startFinishLine.center, "start finish center");
  assertFiniteVector(trackId, road.startFinishLine.left, "start finish left");
  assertFiniteVector(trackId, road.startFinishLine.right, "start finish right");

  if (road.startFinishLine.trackProgress !== 0) {
    throw new Error(`Track ${trackId} start finish line must be at progress 0.`);
  }

  if (!Number.isFinite(road.startFinishLine.headingRadians)) {
    throw new Error(`Track ${trackId} start finish heading must be finite.`);
  }
}

function assertTrackLapMarkerIntegrity(
  trackId: string,
  definition: TrackDefinition
): void {
  const { lapMarkers, road } = definition;

  if (lapMarkers.length !== road.centerline.length) {
    throw new Error(
      `Track ${trackId} lap marker count must match road centerline point count.`
    );
  }

  if (lapMarkers.length < 2) {
    throw new Error(`Track ${trackId} must include at least 2 lap markers.`);
  }

  const ids = new Set<string>();
  let previousProgress = -Number.EPSILON;

  for (let order = 0; order < lapMarkers.length; order += 1) {
    const marker = requireArrayItem(lapMarkers, order);
    const point = requireArrayItem(road.centerline, order);
    const nextPoint = requireArrayItem(road.centerline, order + 1);
    const checkpoint = requireArrayItem(definition.checkpoints, order);
    const expectedKind: TrackLapMarkerKind =
      order === 0 ? "startFinish" : "progress";
    const expectedNextOrder = positiveModulo(order + 1, lapMarkers.length);

    if (marker.id.trim().length === 0 || ids.has(marker.id)) {
      throw new Error(
        `Track ${trackId} lap marker ${order} must have a unique non-empty id.`
      );
    }

    ids.add(marker.id);

    if (marker.order !== order) {
      throw new Error(
        `Track ${trackId} lap marker ${marker.id} has invalid order.`
      );
    }

    if (marker.kind !== expectedKind) {
      throw new Error(
        `Track ${trackId} lap marker ${marker.id} has invalid kind.`
      );
    }

    if (marker.sequenceId !== checkpoint.sequenceId) {
      throw new Error(
        `Track ${trackId} lap marker ${marker.id} does not match its checkpoint sequence id.`
      );
    }

    if (
      marker.trackProgress !== point.trackProgress ||
      marker.position.x !== point.position.x ||
      marker.position.y !== point.position.y ||
      marker.position.z !== point.position.z ||
      (order > 0 && marker.trackProgress <= previousProgress)
    ) {
      throw new Error(
        `Track ${trackId} lap marker ${marker.id} is out of track-progress order.`
      );
    }

    if (
      marker.nextMarkerOrder !== expectedNextOrder ||
      !Number.isInteger(marker.nextMarkerOrder)
    ) {
      throw new Error(
        `Track ${trackId} lap marker ${marker.id} has invalid next marker order.`
      );
    }

    if (
      !Number.isFinite(marker.headingRadians) ||
      Math.abs(
        marker.headingRadians -
          getHeadingRadians(point.position, nextPoint.position)
      ) > 0.000_001
    ) {
      throw new Error(
        `Track ${trackId} lap marker ${marker.id} does not follow race direction.`
      );
    }

    if (!Number.isFinite(marker.radius) || marker.radius <= 0) {
      throw new Error(
        `Track ${trackId} lap marker ${marker.id} radius is invalid.`
      );
    }

    assertCheckpointTriggerZoneIntegrity(
      trackId,
      marker.triggerZone,
      checkpoint
    );
    assertFiniteVector(trackId, marker.position, `lap marker ${marker.id}`);

    previousProgress = marker.trackProgress;
  }

  const startMarker = requireArrayItem(lapMarkers, 0);

  if (
    startMarker.trackProgress !== road.startFinishLine.trackProgress ||
    startMarker.position.x !== road.startFinishLine.center.x ||
    startMarker.position.y !== road.startFinishLine.center.y ||
    startMarker.position.z !== road.startFinishLine.center.z ||
    Math.abs(
      startMarker.headingRadians - road.startFinishLine.headingRadians
    ) > 0.000_001
  ) {
    throw new Error(
      `Track ${trackId} start/finish marker must match the start/finish line.`
    );
  }
}

function assertTrackCheckpointIntegrity(
  trackId: string,
  definition: TrackDefinition
): void {
  if (definition.checkpoints.length !== definition.road.centerline.length) {
    throw new Error(
      `Track ${trackId} checkpoint count must match road centerline point count.`
    );
  }

  if (
    definition.checkpointTriggerZones.length !== definition.checkpoints.length
  ) {
    throw new Error(
      `Track ${trackId} checkpoint trigger zone count must match checkpoint count.`
    );
  }

  const ids = new Set<string>();
  const sequenceIds = new Set<string>();
  const triggerZoneIds = new Set<string>();
  let previousProgress = -Number.EPSILON;

  for (let index = 0; index < definition.checkpoints.length; index += 1) {
    const checkpoint = requireArrayItem(definition.checkpoints, index);
    const point = requireArrayItem(definition.road.centerline, index);
    const nextPoint = requireArrayItem(definition.road.centerline, index + 1);
    const triggerZone = requireArrayItem(
      definition.checkpointTriggerZones,
      index
    );
    const expectedSequenceId = createCheckpointSequenceId(index);
    const expectedNextSequenceId = createCheckpointSequenceId(
      positiveModulo(index + 1, definition.checkpoints.length)
    );
    const expectedKind: TrackCheckpointKind =
      index === 0 ? "startFinish" : "checkpoint";

    if (
      checkpoint.index !== point.index ||
      checkpoint.order !== index ||
      checkpoint.trackProgress !== point.trackProgress ||
      (index > 0 && checkpoint.trackProgress <= previousProgress)
    ) {
      throw new Error(
        `Track ${trackId} checkpoint ${index} does not match centerline progress.`
      );
    }

    if (checkpoint.id.trim().length === 0 || ids.has(checkpoint.id)) {
      throw new Error(
        `Track ${trackId} checkpoint ${index} must have a unique non-empty id.`
      );
    }

    if (
      checkpoint.sequenceId !== expectedSequenceId ||
      sequenceIds.has(checkpoint.sequenceId)
    ) {
      throw new Error(
        `Track ${trackId} checkpoint ${index} has an invalid sequence id.`
      );
    }

    if (
      checkpoint.kind !== expectedKind ||
      checkpoint.nextSequenceId !== expectedNextSequenceId
    ) {
      throw new Error(
        `Track ${trackId} checkpoint ${checkpoint.sequenceId} has invalid ordered metadata.`
      );
    }

    if (
      !Number.isFinite(checkpoint.headingRadians) ||
      Math.abs(
        checkpoint.headingRadians -
          getHeadingRadians(point.position, nextPoint.position)
      ) > 0.000_001
    ) {
      throw new Error(
        `Track ${trackId} checkpoint ${checkpoint.sequenceId} does not follow race direction.`
      );
    }

    if (!Number.isFinite(checkpoint.radius) || checkpoint.radius <= 0) {
      throw new Error(`Track ${trackId} checkpoint ${index} radius is invalid.`);
    }

    if (triggerZoneIds.has(triggerZone.id)) {
      throw new Error(
        `Track ${trackId} checkpoint trigger zone ids must be unique.`
      );
    }

    assertCheckpointTriggerZoneIntegrity(trackId, triggerZone, checkpoint);
    assertCheckpointTriggerZoneIntegrity(
      trackId,
      checkpoint.triggerZone,
      checkpoint
    );
    assertFiniteVector(trackId, checkpoint.position, `checkpoint ${index}`);

    ids.add(checkpoint.id);
    sequenceIds.add(checkpoint.sequenceId);
    triggerZoneIds.add(triggerZone.id);
    previousProgress = checkpoint.trackProgress;
  }
}

function assertCheckpointTriggerZoneIntegrity(
  trackId: string,
  triggerZone: TrackCheckpointTriggerZone,
  checkpoint: TrackCheckpoint
): void {
  if (
    triggerZone.id.trim().length === 0 ||
    triggerZone.checkpointSequenceId !== checkpoint.sequenceId ||
    triggerZone.checkpointOrder !== checkpoint.order ||
    triggerZone.kind !== checkpoint.kind ||
    triggerZone.shape !== "circle" ||
    triggerZone.trackProgress !== checkpoint.trackProgress
  ) {
    throw new Error(
      `Track ${trackId} checkpoint ${checkpoint.sequenceId} trigger zone metadata is invalid.`
    );
  }

  if (
    triggerZone.center.x !== checkpoint.position.x ||
    triggerZone.center.y !== checkpoint.position.y ||
    triggerZone.center.z !== checkpoint.position.z
  ) {
    throw new Error(
      `Track ${trackId} checkpoint ${checkpoint.sequenceId} trigger zone center does not match checkpoint position.`
    );
  }

  if (
    !Number.isFinite(triggerZone.radius) ||
    triggerZone.radius <= 0 ||
    Math.abs(triggerZone.radius - checkpoint.radius) > 0.000_001
  ) {
    throw new Error(
      `Track ${trackId} checkpoint ${checkpoint.sequenceId} trigger zone radius is invalid.`
    );
  }

  assertFiniteVector(
    trackId,
    triggerZone.center,
    `checkpoint ${checkpoint.sequenceId} trigger zone`
  );
}

function assertTrackItemBoxPlacementIntegrity(
  trackId: string,
  road: TrackRoadGeometry,
  itemBoxPlacements: readonly TrackItemBoxPlacement[]
): void {
  if (itemBoxPlacements.length < RACE_CAPACITY * 2) {
    throw new Error(
      `Track ${trackId} must define at least ${RACE_CAPACITY * 2} item box placements.`
    );
  }

  const ids = new Set<string>();
  const positions = new Set<string>();
  let previousProgress = -Number.EPSILON;

  for (let index = 0; index < itemBoxPlacements.length; index += 1) {
    const placement = requireArrayItem(itemBoxPlacements, index);

    if (placement.id.trim().length === 0 || ids.has(placement.id)) {
      throw new Error(
        `Track ${trackId} item box placement ${index} must have a unique non-empty id.`
      );
    }

    if (
      !Number.isInteger(placement.segmentIndex) ||
      placement.segmentIndex < 0 ||
      placement.segmentIndex >= road.segments.length
    ) {
      throw new Error(
        `Track ${trackId} item box ${placement.id} has invalid segment index.`
      );
    }

    if (
      !Number.isFinite(placement.trackProgress) ||
      placement.trackProgress < 0 ||
      placement.trackProgress >= road.totalLength ||
      placement.trackProgress <= previousProgress
    ) {
      throw new Error(
        `Track ${trackId} item box ${placement.id} is not ordered along track progress.`
      );
    }

    if (
      !Number.isFinite(placement.lateralOffset) ||
      Math.abs(placement.lateralOffset) > DEFAULT_TRACK_ITEM_BOX_MAX_RACING_LINE_OFFSET
    ) {
      throw new Error(
        `Track ${trackId} item box ${placement.id} must stay on the racing line.`
      );
    }

    assertFiniteVector(trackId, placement.position, `item box ${placement.id}`);

    const surface = queryTrackSurfaceAtPoint(road, placement.position);

    if (
      surface.surface !== "road" ||
      Math.abs(surface.trackProgress - placement.trackProgress) > 0.001 ||
      Math.abs(surface.signedLateralOffset) >
        DEFAULT_TRACK_ITEM_BOX_MAX_RACING_LINE_OFFSET
    ) {
      throw new Error(
        `Track ${trackId} item box ${placement.id} must be fixed on the racing line.`
      );
    }

    const positionKey = [
      placement.position.x.toFixed(3),
      placement.position.y.toFixed(3),
      placement.position.z.toFixed(3)
    ].join(":");

    if (positions.has(positionKey)) {
      throw new Error(
        `Track ${trackId} item box placements contain duplicate position ${positionKey}.`
      );
    }

    ids.add(placement.id);
    positions.add(positionKey);
    previousProgress = placement.trackProgress;
  }
}

function assertTrackStartGridIntegrity(
  trackId: string,
  road: TrackRoadGeometry,
  startGrid: readonly TrackStartGridSlot[]
): void {
  if (startGrid.length !== RACE_CAPACITY) {
    throw new Error(
      `Track ${trackId} start grid must define ${RACE_CAPACITY} slots, found ${startGrid.length}.`
    );
  }

  const slots = new Set<number>();
  const positions = new Set<string>();
  const startLine = road.startFinishLine;
  const forward = getForwardVector(startLine.headingRadians);
  const right = getRightVector(startLine.headingRadians);
  const firstSegment = requireArrayItem(road.segments, 0);
  const maxLateralOffset =
    road.roadWidth / 2 - DEFAULT_TRACK_START_GRID_MIN_EDGE_CLEARANCE;

  for (let index = 0; index < startGrid.length; index += 1) {
    const slot = requireArrayItem(startGrid, index);

    if (slot.slotIndex !== index) {
      throw new Error(
        `Track ${trackId} start grid slot ${index} has mismatched slot index ${slot.slotIndex}.`
      );
    }

    if (slots.has(slot.slotIndex)) {
      throw new Error(`Track ${trackId} start grid has duplicate slot ${slot.slotIndex}.`);
    }

    if (
      !Number.isInteger(slot.rowIndex) ||
      slot.rowIndex < 0 ||
      !Number.isInteger(slot.columnIndex) ||
      slot.columnIndex < 0
    ) {
      throw new Error(
        `Track ${trackId} start grid slot ${slot.slotIndex} has invalid row or column.`
      );
    }

    if (
      !Number.isFinite(slot.headingRadians) ||
      Math.abs(slot.headingRadians - startLine.headingRadians) > 0.000_001
    ) {
      throw new Error(
        `Track ${trackId} start grid slot ${slot.slotIndex} is not aligned to the start heading.`
      );
    }

    assertFiniteVector(trackId, slot.position, `start grid slot ${slot.slotIndex}`);

    const projected = projectStartGridPosition(
      slot.position,
      startLine.center,
      forward,
      right
    );

    if (
      !Number.isFinite(slot.forwardOffset) ||
      slot.forwardOffset < 0 ||
      slot.forwardOffset > firstSegment.length ||
      Math.abs(projected.forwardOffset - slot.forwardOffset) > 0.000_001
    ) {
      throw new Error(
        `Track ${trackId} start grid slot ${slot.slotIndex} is not on the start straight.`
      );
    }

    if (
      !Number.isFinite(slot.lateralOffset) ||
      Math.abs(slot.lateralOffset) > maxLateralOffset ||
      Math.abs(projected.lateralOffset - slot.lateralOffset) > 0.000_001
    ) {
      throw new Error(
        `Track ${trackId} start grid slot ${slot.slotIndex} is outside the start road width.`
      );
    }

    const positionKey = [
      slot.position.x.toFixed(3),
      slot.position.y.toFixed(3),
      slot.position.z.toFixed(3)
    ].join(":");

    if (positions.has(positionKey)) {
      throw new Error(
        `Track ${trackId} start grid has duplicate position ${positionKey}.`
      );
    }

    slots.add(slot.slotIndex);
    positions.add(positionKey);
  }
}

function assertFiniteVector(
  trackId: string,
  vector: Vector3,
  label: string
): void {
  if (
    !Number.isFinite(vector.x) ||
    !Number.isFinite(vector.y) ||
    !Number.isFinite(vector.z)
  ) {
    throw new Error(`Track ${trackId} ${label} must contain finite coordinates.`);
  }
}

function getPlanarDistance(
  from: Pick<Vector3, "x" | "z">,
  to: Pick<Vector3, "x" | "z">
): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

function getHeadingRadians(from: Vector3, to: Vector3): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function projectPointOntoRoadSegment(
  position: Pick<Vector3, "x" | "z">,
  segmentStart: Vector3,
  segmentEnd: Vector3
): {
  readonly point: Vector3;
  readonly progressRatio: number;
} {
  const segmentX = segmentEnd.x - segmentStart.x;
  const segmentZ = segmentEnd.z - segmentStart.z;
  const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ;

  if (segmentLengthSquared <= Number.EPSILON) {
    return {
      point: {
        x: segmentStart.x,
        y: segmentStart.y,
        z: segmentStart.z
      },
      progressRatio: 0
    };
  }

  const progressRatio = clamp(
    ((position.x - segmentStart.x) * segmentX +
      (position.z - segmentStart.z) * segmentZ) /
      segmentLengthSquared,
    0,
    1
  );

  return {
    point: {
      x: segmentStart.x + segmentX * progressRatio,
      y: segmentStart.y + (segmentEnd.y - segmentStart.y) * progressRatio,
      z: segmentStart.z + segmentZ * progressRatio
    },
    progressRatio
  };
}

function getSignedLateralOffset(
  position: Pick<Vector3, "x" | "z">,
  segmentStart: Vector3,
  segmentEnd: Vector3,
  projectedPoint: Vector3
): number {
  const tangent = normalizePlanarVector(
    segmentEnd.x - segmentStart.x,
    segmentEnd.z - segmentStart.z
  );
  const leftNormal = { x: -tangent.z, z: tangent.x };

  return (
    (position.x - projectedPoint.x) * leftNormal.x +
    (position.z - projectedPoint.z) * leftNormal.z
  );
}

function getForwardVector(
  headingRadians: number
): { readonly x: number; readonly z: number } {
  return {
    x: Math.sin(headingRadians),
    z: Math.cos(headingRadians)
  };
}

function getRightVector(
  headingRadians: number
): { readonly x: number; readonly z: number } {
  return {
    x: Math.cos(headingRadians),
    z: -Math.sin(headingRadians)
  };
}

function createCheckpointSequenceId(order: number): string {
  return order === 0
    ? "start-finish"
    : `checkpoint-${String(order).padStart(2, "0")}`;
}

function projectStartGridPosition(
  position: Vector3,
  origin: Vector3,
  forward: { readonly x: number; readonly z: number },
  right: { readonly x: number; readonly z: number }
): {
  readonly forwardOffset: number;
  readonly lateralOffset: number;
} {
  const deltaX = position.x - origin.x;
  const deltaZ = position.z - origin.z;

  return {
    forwardOffset: deltaX * forward.x + deltaZ * forward.z,
    lateralOffset: deltaX * right.x + deltaZ * right.z
  };
}

function interpolateTrackRoadSegmentPosition(
  start: Vector3,
  end: Vector3,
  progressRatio: number,
  lateralOffset: number
): Vector3 {
  const headingRadians = getHeadingRadians(start, end);
  const right = getRightVector(headingRadians);

  return {
    x: start.x + (end.x - start.x) * progressRatio + right.x * lateralOffset,
    y: start.y + (end.y - start.y) * progressRatio,
    z: start.z + (end.z - start.z) * progressRatio + right.z * lateralOffset
  };
}

function normalizePlanarVector(
  x: number,
  z: number
): { readonly x: number; readonly z: number } {
  const length = Math.hypot(x, z);

  if (length <= Number.EPSILON) {
    return { x: 0, z: 1 };
  }

  return {
    x: x / length,
    z: z / length
  };
}

function assertFinitePlanarPosition(
  position: Pick<Vector3, "x" | "z">,
  label: string
): void {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.z)) {
    throw new Error(`${label} must contain finite coordinates.`);
  }
}

function requireArrayItem<T>(items: readonly T[], index: number): T {
  const item = items[positiveModulo(index, items.length)];

  if (item === undefined) {
    throw new Error(`Missing track geometry item at index ${index}.`);
  }

  return item;
}

function normalizeTrackProgress(trackProgress: number, trackLength: number): number {
  return positiveModulo(trackProgress, Math.max(trackLength, 1));
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
