import type { Vector3 } from "../config/aiRacers";
import { DEFAULT_TRACK_DEFINITION } from "../config/tracks";
import {
  DEFAULT_TRACK_COLLISION_LAYER,
  detectKartBoundsTrackBoundaryContacts,
  type KartTrackBoundaryCollisionResult,
  type TrackBoundaryCollider
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

const VALIDATION_COLLISION_SPEED = 34;
const VALIDATION_PENETRATION_DEPTH = 0.65;
const VALIDATION_TICK_SECONDS = 1 / 60;

interface BoundaryCollisionValidationResult {
  readonly colliderId: string;
  readonly speedBeforeCollision: number;
  readonly speedAfterCollision: number;
  readonly correctionDistance: number;
  readonly controlSeconds: number;
}

interface BoundaryRecoveryValidationResult {
  readonly controlSecondsAfterCollision: number;
  readonly controlSecondsAfterFirstRecoveryTick: number;
  readonly recoveryTickCount: number;
  readonly speedAfterRecoveredThrottle: number;
}

interface BoundaryCollisionScenario {
  readonly session: RaceSession;
  readonly racer: RaceSessionRacerState;
  readonly boundaryCollider: TrackBoundaryCollider;
  readonly inwardNormal: PlanarVector;
  readonly preCollision: KartTrackBoundaryCollisionResult;
}

interface PlanarVector {
  readonly x: number;
  readonly z: number;
}

function main(): void {
  const collision = validateTrackBoundaryCollisionCorrection();
  const recovery = validateTrackBoundaryRecoveryDecay();

  console.info(
    [
      "trackBoundaryRecovery=ok",
      `collider=${collision.colliderId}`,
      `speedBefore=${collision.speedBeforeCollision.toFixed(3)}`,
      `speedAfter=${collision.speedAfterCollision.toFixed(3)}`,
      `correction=${collision.correctionDistance.toFixed(3)}`,
      `controlSeconds=${collision.controlSeconds.toFixed(3)}`,
      `firstRecoveryTick=${recovery.controlSecondsAfterFirstRecoveryTick.toFixed(3)}`,
      `recoveryTicks=${recovery.recoveryTickCount}`,
      `recoveredThrottleSpeed=${recovery.speedAfterRecoveredThrottle.toFixed(3)}`
    ].join(" ")
  );
}

function validateTrackBoundaryCollisionCorrection(): BoundaryCollisionValidationResult {
  const scenario = createBoundaryCollisionScenario();
  const speedBeforeCollision = scenario.racer.speed;
  const positionBeforeCollision = { ...scenario.racer.position };

  assertEqual(
    scenario.preCollision.hasCollision,
    true,
    "validation racer starts in boundary collision"
  );
  assertGreaterThan(
    scenario.preCollision.maxPenetrationDepth,
    0,
    "validation racer starts with boundary penetration"
  );

  scenario.session.tick(0);

  const postCollision = detectBoundaryCollision(scenario.racer);
  const correctionDistance =
    (scenario.racer.position.x - positionBeforeCollision.x) *
      scenario.inwardNormal.x +
    (scenario.racer.position.z - positionBeforeCollision.z) *
      scenario.inwardNormal.z;
  const inwardVelocity =
    scenario.racer.velocity.x * scenario.inwardNormal.x +
    scenario.racer.velocity.z * scenario.inwardNormal.z;

  assertEqual(
    postCollision.hasCollision,
    false,
    "boundary correction clears the kart overlap"
  );
  assertGreaterThan(
    correctionDistance,
    VALIDATION_PENETRATION_DEPTH * 0.9,
    "boundary correction moves the kart back toward the course"
  );
  assertGreaterThan(
    speedBeforeCollision,
    scenario.racer.speed,
    "boundary collision damps kart speed"
  );
  assertGreaterThan(
    inwardVelocity,
    0,
    "boundary collision redirects velocity back into the course"
  );
  assertGreaterThan(
    scenario.racer.collisionControlSeconds,
    0,
    "boundary collision starts recovery control timer"
  );

  return {
    colliderId: scenario.boundaryCollider.id,
    speedBeforeCollision,
    speedAfterCollision: scenario.racer.speed,
    correctionDistance,
    controlSeconds: scenario.racer.collisionControlSeconds
  };
}

function validateTrackBoundaryRecoveryDecay(): BoundaryRecoveryValidationResult {
  const scenario = createBoundaryCollisionScenario();

  scenario.session.tick(0);

  const controlSecondsAfterCollision = scenario.racer.collisionControlSeconds;

  assertGreaterThan(
    controlSecondsAfterCollision,
    0,
    "boundary collision starts recovery decay scenario"
  );

  parkRacerSafely(scenario.racer, 3);
  scenario.session.setHumanInput(scenario.racer.id, {
    throttle: 0,
    brake: 0,
    steer: 0
  });
  scenario.session.tick(VALIDATION_TICK_SECONDS);

  const controlSecondsAfterFirstRecoveryTick =
    scenario.racer.collisionControlSeconds;

  assertLessThan(
    controlSecondsAfterFirstRecoveryTick,
    controlSecondsAfterCollision,
    "boundary recovery timer decays on a safe track segment"
  );

  let recoveryTickCount = 1;

  while (
    scenario.racer.collisionControlSeconds > 0 &&
    recoveryTickCount < 120
  ) {
    scenario.session.tick(VALIDATION_TICK_SECONDS);
    recoveryTickCount += 1;
  }

  assertEqual(
    scenario.racer.collisionControlSeconds,
    0,
    "boundary recovery timer reaches zero"
  );
  assertLessThan(
    recoveryTickCount,
    120,
    "boundary recovery timer drains within two seconds"
  );

  scenario.session.setHumanInput(scenario.racer.id, {
    throttle: 1,
    brake: 0,
    steer: 0
  });
  scenario.session.tick(VALIDATION_TICK_SECONDS);

  assertGreaterThan(
    scenario.racer.speed,
    0,
    "recovered kart accepts throttle after boundary recovery"
  );

  return {
    controlSecondsAfterCollision,
    controlSecondsAfterFirstRecoveryTick,
    recoveryTickCount,
    speedAfterRecoveredThrottle: scenario.racer.speed
  };
}

function createBoundaryCollisionScenario(): BoundaryCollisionScenario {
  const session = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      aiController: {
        getCommand: () => ({
          throttle: 0,
          brake: 0,
          steering: 0
        })
      },
      obstacles: [],
      itemPickups: []
    }
  );
  const racer = requireValue(
    session.humanRacerStates[0],
    "boundary validation human racer"
  );
  const boundaryCollider = requireValue(
    DEFAULT_TRACK_COLLISION_LAYER.boundaryColliders.find(
      (collider) => collider.side === "right" && collider.segmentIndex === 0
    ),
    "right course boundary collider"
  );
  const inwardNormal = getBoundaryColliderInwardNormal(boundaryCollider);

  parkNonTargetRacers(session, racer.id);
  placeRacerInBoundaryContact(racer, boundaryCollider, inwardNormal);

  return {
    session,
    racer,
    boundaryCollider,
    inwardNormal,
    preCollision: detectBoundaryCollision(racer)
  };
}

function placeRacerInBoundaryContact(
  racer: RaceSessionRacerState,
  boundaryCollider: TrackBoundaryCollider,
  inwardNormal: PlanarVector
): void {
  const outwardNormal = {
    x: -inwardNormal.x,
    z: -inwardNormal.z
  };
  const headingRadians = headingFromPlanarDirection(outwardNormal);
  const collisionBounds = refreshRacerCollisionBounds(racer);
  const centerSeparation =
    boundaryCollider.halfExtents.x +
    collisionBounds.halfLength -
    VALIDATION_PENETRATION_DEPTH;
  const collisionPosition = {
    x: boundaryCollider.position.x + inwardNormal.x * centerSeparation,
    y: boundaryCollider.position.y,
    z: boundaryCollider.position.z + inwardNormal.z * centerSeparation
  };

  setMovingRacerPose(
    racer,
    collisionPosition,
    headingRadians,
    VALIDATION_COLLISION_SPEED
  );
}

function detectBoundaryCollision(
  racer: RaceSessionRacerState
): KartTrackBoundaryCollisionResult {
  return detectKartBoundsTrackBoundaryContacts(
    refreshRacerCollisionBounds(racer),
    DEFAULT_TRACK_COLLISION_LAYER
  );
}

function parkNonTargetRacers(session: RaceSession, activeRacerId: string): void {
  let waypointIndex = 2;

  for (const racer of session.racerStates) {
    if (racer.id === activeRacerId) {
      continue;
    }

    parkRacerSafely(racer, waypointIndex);
    waypointIndex += 2;
  }
}

function parkRacerSafely(
  racer: RaceSessionRacerState,
  waypointIndex: number
): void {
  const waypoint = requireValue(
    DEFAULT_TRACK_DEFINITION.road.centerline[
      waypointIndex % DEFAULT_TRACK_DEFINITION.road.centerline.length
    ],
    `safe waypoint ${waypointIndex}`
  );

  setMovingRacerPose(
    racer,
    waypoint.position,
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians,
    0
  );
}

function setMovingRacerPose(
  racer: RaceSessionRacerState,
  position: Vector3,
  headingRadians: number,
  speed: number
): void {
  const forward = forwardFromHeading(headingRadians);

  racer.position = { ...position };
  racer.headingRadians = headingRadians;
  racer.forward = forward;
  racer.speed = speed;
  racer.velocity = {
    x: forward.x * speed,
    y: 0,
    z: forward.z * speed
  };
  refreshRacerCollisionBounds(racer);
}

function getBoundaryColliderInwardNormal(
  collider: TrackBoundaryCollider
): PlanarVector {
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

function headingFromPlanarDirection(direction: PlanarVector): number {
  return Math.atan2(direction.x, direction.z);
}

function forwardFromHeading(headingRadians: number): Vector3 {
  return {
    x: Math.sin(headingRadians),
    y: 0,
    z: Math.cos(headingRadians)
  };
}

function createHumanRacerInputs(
  humanRacerCount: number
): readonly HumanRaceStartRacerInput[] {
  return Array.from({ length: humanRacerCount }, (_, index) => {
    return {
      peerId: `boundary-validation-human-${index + 1}`,
      displayName: `Boundary Human ${index + 1}`,
      slotIndex: index,
      isHost: index === 0
    } satisfies HumanRaceStartRacerInput;
  });
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
