import type {
  AiController,
  AiControllerCommand,
  AiControllerInput
} from "../ai/aiController";
import { getAiControllerCommand } from "../ai/aiController";
import type { Vector3 } from "../config/aiRacers";
import { DEFAULT_TRACK_DEFINITION, type TrackRoadGeometry } from "../config/tracks";
import {
  DEFAULT_TRACK_COLLISION_LAYER,
  detectKartBoundsTrackBoundaryContacts,
  detectKartBoundsTrackObstacleContacts,
  type KartTrackBoundaryCollisionResult,
  type TrackBoundaryCollider,
  type TrackObstacleCollider
} from "../physics/trackColliders";
import {
  createRaceSessionFromStartRoster,
  refreshRacerCollisionBounds,
  type RaceSession,
  type RaceSessionRacerState
} from "./raceSession";
import { createRaceStartRoster } from "./raceStartRoster";

const VALIDATION_COLLISION_SPEED = 34;
const VALIDATION_BOUNDARY_PENETRATION_DEPTH = 0.65;
const VALIDATION_OBSTACLE_PENETRATION_DEPTH = 0.42;
const VALIDATION_TICK_SECONDS = 1 / 60;

interface PlanarVector {
  readonly x: number;
  readonly z: number;
}

interface AiBoundaryCollisionValidationResult {
  readonly colliderId: string;
  readonly speedBeforeCollision: number;
  readonly speedAfterCollision: number;
  readonly speedAfterRecoveryTick: number;
  readonly controlSeconds: number;
  readonly physicsRecoveryRatio: number;
  readonly commandThrottle: number;
  readonly commandBrake: number;
  readonly controllerSawRecovering: boolean;
}

interface AiObstacleCollisionValidationResult {
  readonly obstacleId: string;
  readonly speedBeforeCollision: number;
  readonly speedAfterCollision: number;
  readonly speedAfterRecoveryTick: number;
  readonly controlSeconds: number;
  readonly stunSeconds: number;
  readonly physicsRecoveryRatio: number;
  readonly commandThrottle: number;
  readonly commandBrake: number;
  readonly controllerSawRecovering: boolean;
}

function main(): void {
  const boundary = validateAiBoundaryCollisionHandling();
  const obstacle = validateAiObstacleCollisionHandling();

  console.info(
    [
      "aiTrackCollision=ok",
      `boundary=${boundary.colliderId}`,
      `boundarySpeeds=(${boundary.speedBeforeCollision.toFixed(3)},${boundary.speedAfterCollision.toFixed(3)},${boundary.speedAfterRecoveryTick.toFixed(3)})`,
      `boundaryControl=${boundary.controlSeconds.toFixed(3)}`,
      `boundaryAiPhysics=${boundary.physicsRecoveryRatio.toFixed(3)}`,
      `boundaryAiCommand=(${boundary.commandThrottle.toFixed(3)},${boundary.commandBrake.toFixed(3)})`,
      `boundaryRecovering=${boundary.controllerSawRecovering}`,
      `obstacle=${obstacle.obstacleId}`,
      `obstacleSpeeds=(${obstacle.speedBeforeCollision.toFixed(3)},${obstacle.speedAfterCollision.toFixed(3)},${obstacle.speedAfterRecoveryTick.toFixed(3)})`,
      `obstacleControl=${obstacle.controlSeconds.toFixed(3)}`,
      `obstacleStun=${obstacle.stunSeconds.toFixed(3)}`,
      `obstacleAiPhysics=${obstacle.physicsRecoveryRatio.toFixed(3)}`,
      `obstacleAiCommand=(${obstacle.commandThrottle.toFixed(3)},${obstacle.commandBrake.toFixed(3)})`,
      `obstacleRecovering=${obstacle.controllerSawRecovering}`
    ].join(" ")
  );
}

function validateAiBoundaryCollisionHandling(): AiBoundaryCollisionValidationResult {
  const controller = new RecordingRecoveryAiController();
  const session = createAiValidationSession(controller);
  const racer = requireValue(
    session.aiRacerStates[0],
    "AI boundary validation racer"
  );
  const boundaryCollider = requireValue(
    DEFAULT_TRACK_COLLISION_LAYER.boundaryColliders.find(
      (collider) => collider.side === "right" && collider.segmentIndex === 0
    ),
    "right course boundary collider"
  );
  const inwardNormal = getBoundaryColliderInwardNormal(boundaryCollider);

  parkNonTargetRacers(session, racer.id);
  placeAiInBoundaryContact(racer, boundaryCollider, inwardNormal);

  const preCollision = detectBoundaryCollision(racer);
  const speedBeforeCollision = racer.speed;

  assertEqual(
    preCollision.hasCollision,
    true,
    "AI boundary scenario starts in collision"
  );

  session.tick(0);

  const postCollision = detectBoundaryCollision(racer);
  const speedAfterCollision = racer.speed;
  const controlSeconds = racer.collisionControlSeconds;

  assertEqual(
    postCollision.hasCollision,
    false,
    "AI boundary collision clears overlap"
  );
  assertLessThan(
    speedAfterCollision,
    speedBeforeCollision,
    "AI boundary collision damps speed"
  );
  assertGreaterThan(
    controlSeconds,
    0,
    "AI boundary collision starts collision-control recovery"
  );
  assertEqual(racer.recovering, true, "AI boundary collision marks recovering");

  session.tick(VALIDATION_TICK_SECONDS);

  const recordedPhysics = requireValue(
    controller.physicsByRacerId.get(racer.id),
    "boundary AI physics feedback"
  );
  const recordedCommand = requireValue(
    controller.commandByRacerId.get(racer.id),
    "boundary AI command"
  );

  assertEqual(
    controller.recoveringByRacerId.get(racer.id),
    true,
    "AI controller receives boundary recovery state"
  );
  assertGreaterThan(
    recordedPhysics.collisionRecoverySeconds,
    0,
    "AI controller receives boundary collision recovery seconds"
  );
  assertGreaterThan(
    recordedPhysics.collisionRecoveryRatio,
    0,
    "AI controller receives boundary collision recovery ratio"
  );
  assertLessThan(
    Math.abs(recordedPhysics.speed - speedAfterCollision),
    0.001,
    "AI controller receives boundary post-collision physics speed"
  );
  assertGreaterThan(
    recordedCommand.brake,
    0.1,
    "AI command brakes during boundary collision recovery"
  );
  assertLessThan(
    recordedCommand.throttle,
    0.8,
    "AI command limits throttle during boundary collision recovery"
  );
  assertLessThan(
    racer.speed,
    speedAfterCollision,
    "AI boundary recovery applies friction on the next tick"
  );

  return {
    colliderId: boundaryCollider.id,
    speedBeforeCollision,
    speedAfterCollision,
    speedAfterRecoveryTick: racer.speed,
    controlSeconds,
    physicsRecoveryRatio: recordedPhysics.collisionRecoveryRatio,
    commandThrottle: recordedCommand.throttle,
    commandBrake: recordedCommand.brake,
    controllerSawRecovering:
      controller.recoveringByRacerId.get(racer.id) === true
  };
}

function validateAiObstacleCollisionHandling(): AiObstacleCollisionValidationResult {
  const controller = new RecordingRecoveryAiController();
  const obstacle = createValidationObstacle();
  const session = createAiValidationSession(controller, [obstacle]);
  const racer = requireValue(
    session.aiRacerStates[0],
    "AI obstacle validation racer"
  );
  const collisionNormal = rightFromHeading(
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians
  );
  const speedBeforeCollision = 36;
  const impactHeading = headingFromPlanarDirection({
    x: -collisionNormal.x,
    z: -collisionNormal.z
  });
  const centerOffset =
    obstacle.radius +
    refreshRacerCollisionBounds(racer).halfLength -
    VALIDATION_OBSTACLE_PENETRATION_DEPTH;
  const impactPosition = {
    x: obstacle.position.x + collisionNormal.x * centerOffset,
    y: obstacle.position.y,
    z: obstacle.position.z + collisionNormal.z * centerOffset
  };

  parkNonTargetRacers(session, racer.id);
  setMovingRacerPose(racer, impactPosition, impactHeading, speedBeforeCollision);

  const preCollision = detectKartBoundsTrackObstacleContacts(
    refreshRacerCollisionBounds(racer),
    { obstacleColliders: [obstacle] }
  );

  assertEqual(
    preCollision.hasCollision,
    true,
    "AI obstacle scenario starts in collision"
  );

  session.tick(0);

  const postCollision = detectKartBoundsTrackObstacleContacts(
    refreshRacerCollisionBounds(racer),
    { obstacleColliders: [obstacle] }
  );
  const speedAfterCollision = racer.speed;
  const controlSeconds = racer.collisionControlSeconds;
  const stunSeconds = racer.stunSeconds;

  assertEqual(
    postCollision.hasCollision,
    false,
    "AI obstacle collision clears overlap"
  );
  assertLessThan(
    speedAfterCollision,
    speedBeforeCollision,
    "AI obstacle collision damps speed"
  );
  assertGreaterThan(
    controlSeconds,
    0,
    "AI obstacle collision starts collision-control recovery"
  );
  assertGreaterThan(stunSeconds, 0, "AI obstacle collision applies stun");
  assertEqual(racer.recovering, true, "AI obstacle collision marks recovering");

  session.tick(VALIDATION_TICK_SECONDS);

  const recordedPhysics = requireValue(
    controller.physicsByRacerId.get(racer.id),
    "obstacle AI physics feedback"
  );
  const recordedCommand = requireValue(
    controller.commandByRacerId.get(racer.id),
    "obstacle AI command"
  );

  assertEqual(
    controller.recoveringByRacerId.get(racer.id),
    true,
    "AI controller receives obstacle recovery state"
  );
  assertGreaterThan(
    recordedPhysics.collisionRecoverySeconds,
    0,
    "AI controller receives obstacle collision recovery seconds"
  );
  assertGreaterThan(
    recordedPhysics.collisionRecoveryRatio,
    0,
    "AI controller receives obstacle collision recovery ratio"
  );
  assertLessThan(
    Math.abs(recordedPhysics.speed - speedAfterCollision),
    0.001,
    "AI controller receives obstacle post-collision physics speed"
  );
  assertGreaterThan(
    recordedCommand.brake,
    0.1,
    "AI command brakes during obstacle collision recovery"
  );
  assertLessThan(
    recordedCommand.throttle,
    0.8,
    "AI command limits throttle during obstacle collision recovery"
  );
  assertLessThan(
    racer.speed,
    speedAfterCollision,
    "AI obstacle recovery applies friction on the next tick"
  );

  return {
    obstacleId: obstacle.id,
    speedBeforeCollision,
    speedAfterCollision,
    speedAfterRecoveryTick: racer.speed,
    controlSeconds,
    stunSeconds,
    physicsRecoveryRatio: recordedPhysics.collisionRecoveryRatio,
    commandThrottle: recordedCommand.throttle,
    commandBrake: recordedCommand.brake,
    controllerSawRecovering:
      controller.recoveringByRacerId.get(racer.id) === true
  };
}

class RecordingRecoveryAiController implements AiController {
  public readonly recoveringByRacerId = new Map<string, boolean>();
  public readonly physicsByRacerId = new Map<
    string,
    NonNullable<AiControllerInput["kart"]["physics"]>
  >();
  public readonly commandByRacerId = new Map<string, AiControllerCommand>();

  public readonly getCommand = (input: AiControllerInput): AiControllerCommand => {
    this.recoveringByRacerId.set(input.kart.racerId, input.kart.recovering);

    if (input.kart.physics !== undefined) {
      this.physicsByRacerId.set(input.kart.racerId, input.kart.physics);
    }

    const command = getAiControllerCommand(input);

    this.commandByRacerId.set(input.kart.racerId, command);

    return command;
  };
}

function createAiValidationSession(
  aiController: AiController,
  obstacles: readonly TrackObstacleCollider[] = []
): RaceSession {
  return createRaceSessionFromStartRoster(createRaceStartRoster([]), {
    aiController,
    obstacles,
    itemPickups: []
  });
}

function createValidationObstacle(): TrackObstacleCollider {
  const impactPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);

  return {
    id: "ai-obstacle-validation-drum",
    colliderType: "obstacle",
    bodyType: "static",
    obstacleKind: "oil-drum",
    shape: "cylinder",
    position: { ...impactPoint.position },
    radius: 1.5,
    halfHeight: 0.8,
    impactSpeedFactor: 0.4
  };
}

function placeAiInBoundaryContact(
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
    VALIDATION_BOUNDARY_PENETRATION_DEPTH;
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
  const parkingPointIndexes = [3, 5, 7] as const;
  let parkingSlot = 0;

  for (const racer of session.racerStates) {
    if (racer.id === activeRacerId) {
      continue;
    }

    const parkingPoint = requireTrackCenterPoint(
      DEFAULT_TRACK_DEFINITION.road,
      parkingPointIndexes[parkingSlot] ?? 3
    );

    setMovingRacerPose(
      racer,
      parkingPoint.position,
      DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians,
      0
    );
    parkingSlot += 1;
  }
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
  racer.forward = { ...forward };
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
  const right = rightFromHeading(collider.headingRadians);
  const direction = collider.side === "left" ? 1 : -1;

  return {
    x: right.x * direction,
    z: right.z * direction
  };
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

function headingFromPlanarDirection(direction: PlanarVector): number {
  return positiveModulo(Math.atan2(direction.x, direction.z), Math.PI * 2);
}

function forwardFromHeading(headingRadians: number): Vector3 {
  return {
    x: Math.sin(headingRadians),
    y: 0,
    z: Math.cos(headingRadians)
  };
}

function rightFromHeading(headingRadians: number): PlanarVector {
  return {
    x: Math.cos(headingRadians),
    z: -Math.sin(headingRadians)
  };
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
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

function assertEqual<Value>(
  actual: Value,
  expected: Value,
  label: string
): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}.`
    );
  }
}

function assertGreaterThan(
  actual: number,
  expected: number,
  label: string
): void {
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
