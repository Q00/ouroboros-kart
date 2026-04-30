import type { Vector3 } from "../config/aiRacers";
import { DEFAULT_TRACK_DEFINITION, type TrackRoadGeometry } from "../config/tracks";
import {
  detectKartBoundsTrackObstacleContacts,
  type TrackObstacleCollider
} from "../physics/trackColliders";
import {
  createRaceSessionFromStartRoster,
  refreshRacerCollisionBounds,
  type RaceSession,
  type RaceSessionRacerState
} from "./raceSession";
import {
  createRaceStartRoster,
  type HumanRaceStartRacerInput
} from "./raceStartRoster";

interface ObstacleImpactScenario {
  readonly session: RaceSession;
  readonly racer: RaceSessionRacerState;
  readonly obstacle: TrackObstacleCollider;
  readonly collisionNormal: Pick<Vector3, "x" | "z">;
  readonly penetrationDepth: number;
  readonly speedBefore: number;
}

interface ObstacleContactDetectionValidationResult {
  readonly colliderId: string;
  readonly penetrationDepth: number;
  readonly correctionDistance: number;
  readonly verticalOverlap: number;
}

interface ObstacleCollisionResponseValidationResult {
  readonly speedBefore: number;
  readonly speedAfter: number;
  readonly responseDot: number;
  readonly controlSeconds: number;
  readonly stunSeconds: number;
}

function main(): void {
  const scenario = createObstacleImpactScenario();
  const detection = validateObstacleContactDetection(scenario);
  const response = validateObstacleCollisionResponse(scenario);

  console.info(
    [
      "trackObstacleCollision=ok",
      `collider=${detection.colliderId}`,
      `penetration=${detection.penetrationDepth.toFixed(3)}`,
      `correction=${detection.correctionDistance.toFixed(3)}`,
      `verticalOverlap=${detection.verticalOverlap.toFixed(3)}`,
      `speedBefore=${response.speedBefore.toFixed(3)}`,
      `speedAfter=${response.speedAfter.toFixed(3)}`,
      `responseDot=${response.responseDot.toFixed(3)}`,
      `controlSeconds=${response.controlSeconds.toFixed(3)}`,
      `stunSeconds=${response.stunSeconds.toFixed(3)}`
    ].join(" ")
  );
}

function validateObstacleContactDetection(
  scenario: ObstacleImpactScenario
): ObstacleContactDetectionValidationResult {
  const contactResult = detectKartBoundsTrackObstacleContacts(
    refreshRacerCollisionBounds(scenario.racer),
    { obstacleColliders: [scenario.obstacle] }
  );
  const contact = requireValue(
    contactResult.contacts.find(
      (candidate) => candidate.colliderId === scenario.obstacle.id
    ),
    "expected obstacle contact"
  );
  const correctionDistance =
    contactResult.correction.x * scenario.collisionNormal.x +
    contactResult.correction.z * scenario.collisionNormal.z;

  assertEqual(contactResult.hasCollision, true, "obstacle collision detected");
  assertEqual(contact.colliderId, scenario.obstacle.id, "obstacle collider id");
  assertEqual(
    contact.obstacleKind,
    scenario.obstacle.obstacleKind,
    "obstacle collider kind"
  );
  assertAlmostEqual(
    contact.normal.x,
    scenario.collisionNormal.x,
    "obstacle contact normal x"
  );
  assertAlmostEqual(
    contact.normal.z,
    scenario.collisionNormal.z,
    "obstacle contact normal z"
  );
  assertAlmostEqual(
    contact.penetrationDepth,
    scenario.penetrationDepth,
    "obstacle contact penetration"
  );
  assertAlmostEqual(
    correctionDistance,
    scenario.penetrationDepth,
    "obstacle correction distance"
  );
  assertAlmostEqual(
    contactResult.speedFactor,
    scenario.obstacle.impactSpeedFactor,
    "obstacle impact speed factor"
  );
  assertGreaterThan(contact.verticalOverlap, 0, "obstacle vertical overlap");

  return {
    colliderId: contact.colliderId,
    penetrationDepth: contact.penetrationDepth,
    correctionDistance,
    verticalOverlap: contact.verticalOverlap
  };
}

function validateObstacleCollisionResponse(
  scenario: ObstacleImpactScenario
): ObstacleCollisionResponseValidationResult {
  const preResponseContact = detectKartBoundsTrackObstacleContacts(
    refreshRacerCollisionBounds(scenario.racer),
    { obstacleColliders: [scenario.obstacle] }
  );
  const incomingNormalSpeed =
    scenario.racer.velocity.x * scenario.collisionNormal.x +
    scenario.racer.velocity.z * scenario.collisionNormal.z;

  assertEqual(
    preResponseContact.hasCollision,
    true,
    "response scenario starts in obstacle contact"
  );
  assertLessThan(incomingNormalSpeed, 0, "racer starts moving into obstacle");

  scenario.session.tick(0);

  const postResponseContact = detectKartBoundsTrackObstacleContacts(
    refreshRacerCollisionBounds(scenario.racer),
    { obstacleColliders: [scenario.obstacle] }
  );
  const correctedDisplacement =
    (scenario.racer.position.x - preResponseContact.correctedCenter.x) *
      scenario.collisionNormal.x +
    (scenario.racer.position.z - preResponseContact.correctedCenter.z) *
      scenario.collisionNormal.z;
  const responseDot =
    scenario.racer.forward.x * scenario.collisionNormal.x +
    scenario.racer.forward.z * scenario.collisionNormal.z;

  assertEqual(
    postResponseContact.hasCollision,
    false,
    "obstacle response clears overlap"
  );
  assertAlmostEqual(
    correctedDisplacement,
    0,
    "racer remains at corrected obstacle separation"
  );
  assertGreaterThan(
    scenario.speedBefore,
    scenario.racer.speed,
    "obstacle response damps racer speed"
  );
  assertGreaterThan(
    scenario.racer.speed,
    0,
    "obstacle response preserves rebound speed"
  );
  assertGreaterThan(
    responseDot,
    0.25,
    "obstacle response redirects racer away from obstacle"
  );
  assertGreaterThan(
    scenario.racer.collisionControlSeconds,
    0,
    "obstacle response starts collision-control timer"
  );
  assertGreaterThan(
    scenario.racer.stunSeconds,
    0,
    "obstacle response applies brief stun"
  );
  assertEqual(
    scenario.racer.recovering,
    true,
    "obstacle response marks racer recovering"
  );

  return {
    speedBefore: scenario.speedBefore,
    speedAfter: scenario.racer.speed,
    responseDot,
    controlSeconds: scenario.racer.collisionControlSeconds,
    stunSeconds: scenario.racer.stunSeconds
  };
}

function createObstacleImpactScenario(): ObstacleImpactScenario {
  const impactPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const trackHeadingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const collisionNormal = rightFromHeading(trackHeadingRadians);
  const obstacle: TrackObstacleCollider = {
    id: "obstacle-response-validation-drum",
    colliderType: "obstacle",
    bodyType: "static",
    obstacleKind: "oil-drum",
    shape: "cylinder",
    position: { ...impactPoint.position },
    radius: 1.5,
    halfHeight: 0.8,
    impactSpeedFactor: 0.4
  };
  const session = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      obstacles: [obstacle],
      itemPickups: []
    }
  );
  const racer = requireValue(
    session.humanRacerStates[0],
    "obstacle response validation racer"
  );
  const penetrationDepth = 0.42;
  const speedBefore = 36;
  const impactHeading = headingFromPlanarDirection({
    x: -collisionNormal.x,
    z: -collisionNormal.z
  });
  const centerOffset =
    obstacle.radius +
    refreshRacerCollisionBounds(racer).halfLength -
    penetrationDepth;
  const impactPosition = {
    x: obstacle.position.x + collisionNormal.x * centerOffset,
    y: obstacle.position.y,
    z: obstacle.position.z + collisionNormal.z * centerOffset
  };

  parkNonTargetRacers(session, racer.id);
  setMovingRacerPose(racer, impactPosition, impactHeading, speedBefore);

  return {
    session,
    racer,
    obstacle,
    collisionNormal,
    penetrationDepth,
    speedBefore
  };
}

function parkNonTargetRacers(session: RaceSession, targetRacerId: string): void {
  const parkingPointIndexes = [3, 5, 7] as const;
  let parkingSlot = 0;

  for (const racer of session.racerStates) {
    if (racer.id === targetRacerId) {
      continue;
    }

    const parkingPoint = requireTrackCenterPoint(
      DEFAULT_TRACK_DEFINITION.road,
      parkingPointIndexes[parkingSlot] ?? 3
    );

    setStationaryRacerPose(
      racer,
      parkingPoint.position,
      DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians
    );
    parkingSlot += 1;
  }
}

function createHumanRacerInputs(
  humanRacerCount: number
): readonly HumanRaceStartRacerInput[] {
  return Array.from({ length: humanRacerCount }, (_, index) => ({
    peerId: `obstacle-validation-human-${index + 1}`,
    displayName: `Obstacle Validation ${index + 1}`,
    slotIndex: index,
    isHost: index === 0
  }));
}

function requireTrackCenterPoint(
  road: TrackRoadGeometry,
  index: number
): TrackRoadGeometry["centerline"][number] {
  const point = road.centerline[index];

  if (point === undefined) {
    throw new Error(`Expected default track to include center point ${index}.`);
  }

  return point;
}

function setStationaryRacerPose(
  racer: RaceSessionRacerState,
  position: Vector3,
  headingRadians: number
): void {
  const forward = forwardFromHeading(headingRadians);

  racer.position = { ...position };
  racer.velocity = { x: 0, y: 0, z: 0 };
  racer.speed = 0;
  racer.headingRadians = headingRadians;
  racer.forward = { x: forward.x, y: 0, z: forward.z };
  refreshRacerCollisionBounds(racer);
}

function setMovingRacerPose(
  racer: RaceSessionRacerState,
  position: Vector3,
  headingRadians: number,
  speed: number
): void {
  const forward = forwardFromHeading(headingRadians);

  racer.position = { ...position };
  racer.speed = speed;
  racer.headingRadians = headingRadians;
  racer.forward = { x: forward.x, y: 0, z: forward.z };
  racer.velocity = {
    x: forward.x * speed,
    y: 0,
    z: forward.z * speed
  };
  refreshRacerCollisionBounds(racer);
}

function forwardFromHeading(
  headingRadians: number
): { readonly x: number; readonly z: number } {
  return {
    x: Math.sin(headingRadians),
    z: Math.cos(headingRadians)
  };
}

function rightFromHeading(
  headingRadians: number
): { readonly x: number; readonly z: number } {
  return {
    x: Math.cos(headingRadians),
    z: -Math.sin(headingRadians)
  };
}

function headingFromPlanarDirection(direction: {
  readonly x: number;
  readonly z: number;
}): number {
  return positiveModulo(Math.atan2(direction.x, direction.z), Math.PI * 2);
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function requireValue<Value>(
  value: Value | null | undefined,
  label: string
): Value {
  if (value === null || value === undefined) {
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

function assertAlmostEqual(
  actual: number,
  expected: number,
  label: string
): void {
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

function assertLessThan(actual: number, expected: number, label: string): void {
  if (!(actual < expected)) {
    throw new Error(`${label}: expected ${actual} to be less than ${expected}.`);
  }
}

main();
