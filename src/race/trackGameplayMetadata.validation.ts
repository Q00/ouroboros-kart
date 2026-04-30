import type { Vector3 } from "../config/aiRacers";
import {
  DEFAULT_TRACK_DEFINITION,
  DEFAULT_TRACK_GAMEPLAY_METADATA,
  queryTrackGameplaySurfaceAtPoint,
  type TrackRoadGeometry,
  type TrackSurfaceType
} from "../config/tracks";
import { DEFAULT_TRACK_COLLISION_LAYER } from "../physics/trackColliders";
import {
  createRaceSessionFromStartRoster,
  RACER_COLLISION_RADIUS
} from "./raceSession";
import { createRaceStartRoster } from "./raceStartRoster";

interface TrackGameplayMetadataValidationResult {
  readonly trackId: string;
  readonly boundaryColliderCount: number;
  readonly offTrackRegionCount: number;
  readonly checkpointTriggerZoneCount: number;
  readonly startFinishSequenceId: string;
  readonly firstCheckpointSequenceId: string;
  readonly surfaceSamples: readonly TrackSurfaceType[];
  readonly sessionQueryMatchesConfig: boolean;
}

function main(): void {
  const result = validateTrackGameplayMetadataExposure();

  console.info(
    [
      "trackGameplayMetadata=ok",
      `track=${result.trackId}`,
      `boundaryColliders=${result.boundaryColliderCount}`,
      `offTrackRegions=${result.offTrackRegionCount}`,
      `checkpointTriggerZones=${result.checkpointTriggerZoneCount}`,
      `startFinishSequence=${result.startFinishSequenceId}`,
      `firstCheckpointSequence=${result.firstCheckpointSequenceId}`,
      `surfaces=${result.surfaceSamples.join(",")}`,
      `sessionQueryMatchesConfig=${result.sessionQueryMatchesConfig}`
    ].join(" ")
  );
}

function validateTrackGameplayMetadataExposure(): TrackGameplayMetadataValidationResult {
  const metadata = DEFAULT_TRACK_GAMEPLAY_METADATA;
  const roadSample = requireSurfaceSample(metadata.road, "road");
  const shoulderSample = requireSurfaceSample(metadata.road, "shoulder");
  const offTrackSample = requireSurfaceSample(metadata.road, "offTrack");
  const roadQuery = queryTrackGameplaySurfaceAtPoint(metadata, roadSample);
  const shoulderQuery = queryTrackGameplaySurfaceAtPoint(metadata, shoulderSample);
  const offTrackQuery = queryTrackGameplaySurfaceAtPoint(
    metadata,
    offTrackSample
  );
  const startFinishCheckpoint = requireValue(
    DEFAULT_TRACK_DEFINITION.checkpoints[0],
    "start/finish checkpoint"
  );
  const firstProgressCheckpoint = requireValue(
    DEFAULT_TRACK_DEFINITION.checkpoints[1],
    "first progress checkpoint"
  );
  const finalCheckpoint = requireValue(
    DEFAULT_TRACK_DEFINITION.checkpoints[
      DEFAULT_TRACK_DEFINITION.checkpoints.length - 1
    ],
    "final checkpoint"
  );
  const startFinishTriggerZone = requireValue(
    DEFAULT_TRACK_DEFINITION.checkpointTriggerZones[0],
    "start/finish trigger zone"
  );

  assertEqual(metadata.boundaryCollision.bounds, metadata.bounds, "bounds");
  assertEqual(
    metadata.boundaryCollision.leftCourseBoundary,
    metadata.road.courseBoundary.leftCourseBoundary,
    "left collision boundary"
  );
  assertEqual(
    metadata.boundaryCollision.rightCourseBoundary,
    metadata.road.courseBoundary.rightCourseBoundary,
    "right collision boundary"
  );
  assertGreaterThan(
    metadata.boundaryCollision.courseHalfWidth,
    metadata.boundaryCollision.drivableHalfWidth,
    "course boundary includes shoulder"
  );
  assertEqual(
    metadata.offTrackDetection.roadSurface.drivable,
    true,
    "road surface is drivable"
  );
  assertEqual(
    metadata.offTrackDetection.shoulderSurface.drivable,
    false,
    "shoulder surface is not drivable"
  );
  assertEqual(roadQuery.surface, "road", "road metadata query");
  assertEqual(roadQuery.drivable, true, "road metadata drivable");
  assertEqual(shoulderQuery.surface, "shoulder", "shoulder metadata query");
  assertEqual(shoulderQuery.drivable, false, "shoulder metadata drivable");
  assertEqual(offTrackQuery.surface, "offTrack", "off-track metadata query");
  assertEqual(offTrackQuery.withinCourseBoundary, false, "off-track boundary");
  assertEqual(
    metadata.offTrackDetection.offTrackRegions.some(
      (region) => region.id === offTrackQuery.offTrackRegionId
    ),
    true,
    "off-track query exposes region id"
  );
  assertEqual(
    DEFAULT_TRACK_DEFINITION.checkpointTriggerZones.length,
    DEFAULT_TRACK_DEFINITION.checkpoints.length,
    "checkpoint trigger zone count"
  );
  assertEqual(
    DEFAULT_TRACK_DEFINITION.checkpoints.length,
    DEFAULT_TRACK_DEFINITION.road.centerline.length,
    "ordered checkpoint count"
  );
  assertEqual(
    startFinishCheckpoint.kind,
    "startFinish",
    "start/finish checkpoint kind"
  );
  assertEqual(
    startFinishCheckpoint.sequenceId,
    "start-finish",
    "start/finish checkpoint sequence id"
  );
  assertEqual(
    firstProgressCheckpoint.kind,
    "checkpoint",
    "progress checkpoint kind"
  );
  assertEqual(
    firstProgressCheckpoint.sequenceId,
    "checkpoint-01",
    "first checkpoint sequence id"
  );
  assertEqual(
    startFinishCheckpoint.nextSequenceId,
    firstProgressCheckpoint.sequenceId,
    "start/finish next checkpoint sequence id"
  );
  assertEqual(
    finalCheckpoint.nextSequenceId,
    startFinishCheckpoint.sequenceId,
    "final checkpoint loops to start/finish sequence"
  );
  assertEqual(
    startFinishTriggerZone.checkpointSequenceId,
    startFinishCheckpoint.sequenceId,
    "start/finish trigger zone sequence id"
  );
  assertEqual(
    startFinishTriggerZone.checkpointOrder,
    startFinishCheckpoint.order,
    "start/finish trigger zone order"
  );
  assertEqual(
    startFinishTriggerZone.id,
    startFinishCheckpoint.triggerZone.id,
    "checkpoint trigger zone mirrored on checkpoint"
  );
  assertEqual(
    DEFAULT_TRACK_DEFINITION.lapMarkers[0]?.triggerZone.id,
    startFinishTriggerZone.id,
    "lap marker trigger zone mirrors checkpoint trigger zone"
  );

  const session = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: "host-peer",
        displayName: "Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: "guest-peer",
        displayName: "Guest",
        slotIndex: 1
      }
    ]),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const sessionMetadata = requireValue(
    session.trackGameplayMetadata,
    "session gameplay metadata"
  );
  const sessionOffTrackQuery =
    session.queryTrackSurfaceAtPoint(offTrackSample);
  const sessionQueryMatchesConfig =
    sessionOffTrackQuery?.surface === offTrackQuery.surface &&
    sessionOffTrackQuery?.offTrackRegionId === offTrackQuery.offTrackRegionId;

  assertEqual(session.trackMetadata.id, metadata.id, "session track metadata id");
  assertEqual(
    sessionMetadata.boundaryCollision.courseHalfWidth,
    metadata.boundaryCollision.courseHalfWidth,
    "session boundary metadata"
  );
  assertEqual(
    session.trackCollisionLayer.trackId,
    DEFAULT_TRACK_COLLISION_LAYER.trackId,
    "track collision layer id"
  );
  assertEqual(
    session.trackCollisionLayer.boundaryColliders.length,
    metadata.boundaryCollision.leftCourseBoundary.length +
      metadata.boundaryCollision.rightCourseBoundary.length,
    "boundary collision colliders match exposed metadata"
  );
  assertEqual(
    session.isTrackPointInsideCourseBoundary(offTrackSample),
    false,
    "session course-boundary helper"
  );
  assertEqual(
    session.isTrackPointOffTrack(offTrackSample, RACER_COLLISION_RADIUS),
    true,
    "session off-track helper"
  );
  assertEqual(
    sessionQueryMatchesConfig,
    true,
    "session query matches track metadata query"
  );

  return {
    trackId: metadata.id,
    boundaryColliderCount: session.trackCollisionLayer.boundaryColliders.length,
    offTrackRegionCount: metadata.offTrackDetection.offTrackRegions.length,
    checkpointTriggerZoneCount:
      DEFAULT_TRACK_DEFINITION.checkpointTriggerZones.length,
    startFinishSequenceId: startFinishCheckpoint.sequenceId,
    firstCheckpointSequenceId: firstProgressCheckpoint.sequenceId,
    surfaceSamples: [roadQuery.surface, shoulderQuery.surface, offTrackQuery.surface],
    sessionQueryMatchesConfig
  };
}

function requireSurfaceSample(
  road: TrackRoadGeometry,
  surface: TrackSurfaceType
): Vector3 {
  const center = requireValue(road.centerline[0], "track center sample").position;
  const leftBoundary = requireValue(
    road.courseBoundary.leftCourseBoundary[0],
    "track left course boundary sample"
  );
  const normal = normalizePlanarOffset(
    leftBoundary.x - center.x,
    leftBoundary.z - center.z
  );
  const distance =
    surface === "road"
      ? 0
      : surface === "shoulder"
        ? road.courseBoundary.drivableHalfWidth +
          road.courseBoundary.shoulderWidth * 0.5
        : road.courseBoundary.courseHalfWidth + 1.5;
  const sample = {
    x: center.x + normal.x * distance,
    y: center.y,
    z: center.z + normal.z * distance
  };
  const query = queryTrackGameplaySurfaceAtPoint(
    DEFAULT_TRACK_GAMEPLAY_METADATA,
    sample
  );

  if (query.surface !== surface) {
    throw new Error(
      `Expected ${surface} sample, found ${query.surface} at (${sample.x}, ${sample.z}).`
    );
  }

  return sample;
}

function normalizePlanarOffset(
  x: number,
  z: number
): { readonly x: number; readonly z: number } {
  const length = Math.hypot(x, z);

  if (length <= Number.EPSILON) {
    throw new Error("Cannot sample track surface from a zero-length offset.");
  }

  return {
    x: x / length,
    z: z / length
  };
}

function requireValue<T>(value: T | undefined | null, label: string): T {
  if (value === undefined || value === null) {
    throw new Error(`Missing ${label}.`);
  }

  return value;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function assertGreaterThan(actual: number, expected: number, label: string): void {
  if (!(actual > expected)) {
    throw new Error(`${label}: expected ${actual} to be greater than ${expected}.`);
  }
}

main();
