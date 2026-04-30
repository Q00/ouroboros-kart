import type { AiController, AiControllerCommand } from "../ai/aiController";
import type { AiRacerProfileConfig, Vector3 } from "../config/aiRacers";
import {
  DEFAULT_TRACK_DEFINITION,
  getNearestTrackRoadProjection,
  queryTrackSurfaceAtPoint
} from "../config/tracks";
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

const VALIDATION_TICK_SECONDS = 1 / 60;
const REORIENTATION_TICK_COUNT = 18;
const WRONG_DIRECTION_TICK_COUNT = 60;
const COLLISION_REORIENTATION_TICK_COUNT = 24;
const UNSTUCK_TICK_COUNT = 210;

interface RecoveryValidationResult {
  readonly stallResetCount: number;
  readonly stallSurfaceAfterReset: string;
  readonly stallHeadingError: number;
  readonly offTrackThrottle: number;
  readonly offTrackSteer: number;
  readonly offTrackHeadingImprovement: number;
  readonly offTrackResetCount: number;
  readonly offTrackSurfaceAfterReset: string;
  readonly wrongDirectionThrottle: number;
  readonly wrongDirectionSteer: number;
  readonly wrongDirectionHeadingImprovement: number;
  readonly collisionThrottle: number;
  readonly collisionSteer: number;
  readonly collisionResetCount: number;
  readonly collisionSurfaceAfterReset: string;
}

function main(): void {
  const result = validateAiRecoveryBehavior();

  console.info(
    [
      "aiRecovery=ok",
      `stallResets=${result.stallResetCount}`,
      `stallSurface=${result.stallSurfaceAfterReset}`,
      `stallHeadingError=${result.stallHeadingError.toFixed(3)}`,
      `offTrackThrottle=${result.offTrackThrottle.toFixed(3)}`,
      `offTrackSteer=${result.offTrackSteer.toFixed(3)}`,
      `offTrackHeadingGain=${result.offTrackHeadingImprovement.toFixed(3)}`,
      `offTrackResets=${result.offTrackResetCount}`,
      `offTrackSurface=${result.offTrackSurfaceAfterReset}`,
      `wrongDirThrottle=${result.wrongDirectionThrottle.toFixed(3)}`,
      `wrongDirSteer=${result.wrongDirectionSteer.toFixed(3)}`,
      `wrongDirHeadingGain=${result.wrongDirectionHeadingImprovement.toFixed(3)}`,
      `collisionThrottle=${result.collisionThrottle.toFixed(3)}`,
      `collisionSteer=${result.collisionSteer.toFixed(3)}`,
      `collisionResets=${result.collisionResetCount}`,
      `collisionSurface=${result.collisionSurfaceAfterReset}`
    ].join(" ")
  );
}

function validateAiRecoveryBehavior(): RecoveryValidationResult {
  const stall = validateStallResetAndReorientation();
  const offTrack = validateOffTrackReorientation();
  const offTrackReset = validateOffTrackReset();
  const wrongDirection = validateWrongDirectionReorientation();
  const collision = validateCollisionReorientation();
  const collisionReset = validateCollisionReset();

  return {
    stallResetCount: stall.resetCount,
    stallSurfaceAfterReset: stall.surfaceAfterReset,
    stallHeadingError: stall.headingError,
    offTrackThrottle: offTrack.throttle,
    offTrackSteer: offTrack.steer,
    offTrackHeadingImprovement: offTrack.headingImprovement,
    offTrackResetCount: offTrackReset.resetCount,
    offTrackSurfaceAfterReset: offTrackReset.surfaceAfterReset,
    wrongDirectionThrottle: wrongDirection.throttle,
    wrongDirectionSteer: wrongDirection.steer,
    wrongDirectionHeadingImprovement: wrongDirection.headingImprovement,
    collisionThrottle: collision.throttle,
    collisionSteer: collision.steer,
    collisionResetCount: collisionReset.resetCount,
    collisionSurfaceAfterReset: collisionReset.surfaceAfterReset
  };
}

function validateStallResetAndReorientation(): {
  readonly resetCount: number;
  readonly surfaceAfterReset: string;
  readonly headingError: number;
} {
  const controller = new RecordingAiController({
    throttle: 1,
    brake: 0,
    steering: 0
  });
  const session = createSlowAiValidationSession(controller);
  const racer = requireValue(session.aiRacerStates[0], "stall validation AI");
  const pose = getRoadValidationPose(1);

  parkOtherRacers(session, racer.id);
  setRacerPose(racer, pose.position, pose.headingRadians + Math.PI, 0);
  racer.input = {
    ...racer.input,
    throttle: 1,
    brake: 0,
    steer: 0
  };

  for (
    let tick = 0;
    tick < UNSTUCK_TICK_COUNT && controller.resetCount === 0;
    tick += 1
  ) {
    session.tick(VALIDATION_TICK_SECONDS);
  }

  const surfaceAfterReset = getRacerSurface(racer);
  const headingError = Math.abs(
    getSignedHeadingDelta(
      racer.headingRadians,
      getNearestRoadHeading(racer.position)
    )
  );

  assertGreaterThan(
    controller.resetCount,
    0,
    "stalled AI reset navigation state"
  );
  assertEqual(surfaceAfterReset, "road", "stalled AI reset onto road");
  assertLessThan(
    headingError,
    0.35,
    "stalled AI reset reorients toward the road segment"
  );

  return {
    resetCount: controller.resetCount,
    surfaceAfterReset,
    headingError
  };
}

function validateOffTrackReorientation(): {
  readonly throttle: number;
  readonly steer: number;
  readonly headingImprovement: number;
} {
  const controller = new RecordingAiController({
    throttle: 0,
    brake: 0,
    steering: 0
  });
  const session = createStandardValidationSession(controller);
  const racer = requireValue(
    session.aiRacerStates[0],
    "off-track reorientation AI"
  );
  const shoulderPose = getShoulderValidationPose(racer);

  parkOtherRacers(session, racer.id);
  setRacerPose(racer, shoulderPose.position, shoulderPose.outwardHeading, 0);

  const headingErrorBefore = Math.abs(
    getSignedHeadingDeltaToPoint(
      racer.headingRadians,
      racer.position,
      shoulderPose.rejoinTarget
    )
  );

  for (let tick = 0; tick < REORIENTATION_TICK_COUNT; tick += 1) {
    session.tick(VALIDATION_TICK_SECONDS);
  }

  const headingErrorAfter = Math.abs(
    getSignedHeadingDeltaToPoint(
      racer.headingRadians,
      racer.position,
      shoulderPose.rejoinTarget
    )
  );
  const headingImprovement = headingErrorBefore - headingErrorAfter;

  assertEqual(
    controller.resetCount,
    0,
    "short off-track recovery does not reset AI"
  );
  assertGreaterThan(
    racer.input.throttle,
    0.45,
    "off-track AI applies recovery throttle"
  );
  assertGreaterThan(
    Math.abs(racer.input.steer),
    0.2,
    "off-track AI steers toward the course"
  );
  assertGreaterThan(
    headingImprovement,
    0,
    "off-track AI heading turns toward rejoin target"
  );

  return {
    throttle: racer.input.throttle,
    steer: racer.input.steer,
    headingImprovement
  };
}

function validateOffTrackReset(): {
  readonly resetCount: number;
  readonly surfaceAfterReset: string;
} {
  const controller = new RecordingAiController({
    throttle: 0,
    brake: 0,
    steering: 0
  });
  const session = createSlowAiValidationSession(controller);
  const racer = requireValue(session.aiRacerStates[0], "off-track reset AI");
  const shoulderPose = getShoulderValidationPose(racer);

  parkOtherRacers(session, racer.id);
  setRacerPose(racer, shoulderPose.position, shoulderPose.outwardHeading, 0);

  for (
    let tick = 0;
    tick < UNSTUCK_TICK_COUNT && controller.resetCount === 0;
    tick += 1
  ) {
    session.tick(VALIDATION_TICK_SECONDS);
  }

  const surfaceAfterReset = getRacerSurface(racer);

  assertGreaterThan(
    controller.resetCount,
    0,
    "long off-track AI recovery resets navigation state"
  );
  assertEqual(surfaceAfterReset, "road", "long off-track AI reset onto road");

  return {
    resetCount: controller.resetCount,
    surfaceAfterReset
  };
}

function validateWrongDirectionReorientation(): {
  readonly throttle: number;
  readonly steer: number;
  readonly headingImprovement: number;
} {
  const controller = new RecordingAiController({
    throttle: 0,
    brake: 0,
    steering: 0
  });
  const session = createStandardValidationSession(controller);
  const racer = requireValue(
    session.aiRacerStates[0],
    "wrong-direction reorientation AI"
  );
  const pose = getRoadValidationPose(2);
  const roadPoint = requireValue(
    DEFAULT_TRACK_DEFINITION.road.centerline[2],
    "wrong-direction road point"
  );
  const rejoinTarget = getRoadValidationPoseAtProgress(
    roadPoint.trackProgress + 10
  ).position;

  parkOtherRacers(session, racer.id);
  setRacerPose(racer, pose.position, pose.headingRadians + Math.PI, 0);

  const headingErrorBefore = Math.abs(
    getSignedHeadingDeltaToPoint(
      racer.headingRadians,
      racer.position,
      rejoinTarget
    )
  );

  for (let tick = 0; tick < WRONG_DIRECTION_TICK_COUNT; tick += 1) {
    session.tick(VALIDATION_TICK_SECONDS);
  }

  const headingErrorAfter = Math.abs(
    getSignedHeadingDeltaToPoint(
      racer.headingRadians,
      racer.position,
      rejoinTarget
    )
  );
  const headingImprovement = headingErrorBefore - headingErrorAfter;

  assertEqual(
    controller.resetCount,
    0,
    "short wrong-direction recovery does not reset AI"
  );
  assertGreaterThan(
    racer.input.throttle,
    0.45,
    "wrong-direction AI applies recovery throttle"
  );
  assertGreaterThan(
    Math.abs(racer.input.steer),
    0.2,
    "wrong-direction AI steers back toward the route"
  );
  assertGreaterThan(
    headingImprovement,
    0,
    "wrong-direction AI heading turns back toward the route"
  );

  return {
    throttle: racer.input.throttle,
    steer: racer.input.steer,
    headingImprovement
  };
}

function validateCollisionReorientation(): {
  readonly throttle: number;
  readonly steer: number;
} {
  const controller = new RecordingAiController({
    throttle: 0,
    brake: 0,
    steering: 0
  });
  const session = createStandardValidationSession(controller);
  const racer = requireValue(
    session.aiRacerStates[0],
    "collision reorientation AI"
  );
  const pose = getRoadValidationPose(3);

  parkOtherRacers(session, racer.id);
  setRacerPose(racer, pose.position, pose.headingRadians + Math.PI / 2, 0);
  racer.collisionControlSeconds = 0.72;
  racer.recovering = true;

  for (let tick = 0; tick < COLLISION_REORIENTATION_TICK_COUNT; tick += 1) {
    session.tick(VALIDATION_TICK_SECONDS);
  }

  assertEqual(
    controller.resetCount,
    0,
    "short collision recovery does not reset AI"
  );
  assertGreaterThan(
    racer.input.throttle,
    0.45,
    "collision-stalled AI applies recovery throttle"
  );
  assertGreaterThan(
    Math.abs(racer.input.steer),
    0.2,
    "collision-stalled AI steers back toward the route"
  );

  return {
    throttle: racer.input.throttle,
    steer: racer.input.steer
  };
}

function validateCollisionReset(): {
  readonly resetCount: number;
  readonly surfaceAfterReset: string;
} {
  const controller = new RecordingAiController({
    throttle: 0,
    brake: 0,
    steering: 0
  });
  const session = createStandardValidationSession(controller);
  const racer = requireValue(session.aiRacerStates[0], "collision reset AI");
  const pose = getRoadValidationPose(4);

  parkOtherRacers(session, racer.id);
  setRacerPose(racer, pose.position, pose.headingRadians + Math.PI / 2, 0);

  for (
    let tick = 0;
    tick < UNSTUCK_TICK_COUNT && controller.resetCount === 0;
    tick += 1
  ) {
    racer.collisionControlSeconds = 0.72;
    racer.recovering = true;
    racer.speed = 0;
    racer.velocity = { x: 0, y: 0, z: 0 };
    session.tick(VALIDATION_TICK_SECONDS);
  }

  const surfaceAfterReset = getRacerSurface(racer);

  assertGreaterThan(
    controller.resetCount,
    0,
    "long collision-stalled AI recovery resets navigation state"
  );
  assertEqual(
    surfaceAfterReset,
    "road",
    "long collision-stalled AI reset onto road"
  );

  return {
    resetCount: controller.resetCount,
    surfaceAfterReset
  };
}

class RecordingAiController implements AiController {
  public resetCount = 0;

  public constructor(private readonly command: AiControllerCommand) {}

  public readonly getCommand = (): AiControllerCommand => this.command;

  public readonly resetNavigationState = (): void => {
    this.resetCount += 1;
  };
}

function createSlowAiValidationSession(
  controller: RecordingAiController
): RaceSession {
  return createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1), SLOW_AI_PROFILES),
    {
      aiController: controller,
      obstacles: [],
      itemPickups: []
    }
  );
}

function createStandardValidationSession(
  controller: RecordingAiController
): RaceSession {
  return createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      aiController: controller,
      obstacles: [],
      itemPickups: []
    }
  );
}

const SLOW_AI_PROFILES = [
  createSlowAiProfile("slow_ember", "Slow Ember", "#f45d48", 7, "flame"),
  createSlowAiProfile("slow_vex", "Slow Vex", "#3db7ff", 22, "bolt"),
  createSlowAiProfile("slow_nova", "Slow Nova", "#b36bff", 13, "comet")
] as const satisfies readonly AiRacerProfileConfig[];

function createSlowAiProfile(
  id: string,
  displayName: string,
  color: string,
  racingNumber: number,
  decal: AiRacerProfileConfig["visual"]["decal"]
): AiRacerProfileConfig {
  return {
    id,
    displayName,
    color,
    visual: {
      accentColor: "#ffffff",
      racingNumber,
      decal
    },
    driving: {
      maxSpeed: 0.2,
      acceleration: 1,
      braking: 1,
      steeringResponsiveness: 0.86,
      traction: 0.82,
      recovery: 0.75,
      itemAggression: 0.5
    },
    behavior: {
      preferredLane: "inside",
      overtakeBias: 0.5,
      itemUseRange: 10
    }
  };
}

function getRoadValidationPose(index: number): {
  readonly position: Vector3;
  readonly headingRadians: number;
} {
  const road = DEFAULT_TRACK_DEFINITION.road;
  const point = requireValue(road.centerline[index], `road point ${index}`);
  const nextPoint = requireValue(
    road.centerline[(index + 1) % road.centerline.length],
    `road point ${index + 1}`
  );

  return {
    position: point.position,
    headingRadians: Math.atan2(
      nextPoint.position.x - point.position.x,
      nextPoint.position.z - point.position.z
    )
  };
}

function getShoulderValidationPose(racer: RaceSessionRacerState): {
  readonly position: Vector3;
  readonly outwardHeading: number;
  readonly rejoinTarget: Vector3;
} {
  const road = DEFAULT_TRACK_DEFINITION.road;
  const pose = getRoadValidationPose(0);
  const radius = refreshRacerCollisionBounds(racer).boundingRadius;
  const right = {
    x: Math.cos(pose.headingRadians),
    z: -Math.sin(pose.headingRadians)
  };
  const forward = {
    x: Math.sin(pose.headingRadians),
    z: Math.cos(pose.headingRadians)
  };
  const lateralDistance =
    road.courseBoundary.drivableHalfWidth - radius + 0.8;
  const forwardDistance = 9;

  return {
    position: {
      x:
        pose.position.x +
        right.x * lateralDistance +
        forward.x * forwardDistance,
      y: pose.position.y,
      z:
        pose.position.z +
        right.z * lateralDistance +
        forward.z * forwardDistance
    },
    outwardHeading: Math.atan2(right.x, right.z),
    rejoinTarget: getRoadValidationPoseAtProgress(forwardDistance + 8).position
  };
}

function getRoadValidationPoseAtProgress(trackProgress: number): {
  readonly position: Vector3;
  readonly headingRadians: number;
} {
  const road = DEFAULT_TRACK_DEFINITION.road;
  const normalizedProgress =
    ((trackProgress % road.totalLength) + road.totalLength) % road.totalLength;

  for (const segment of road.segments) {
    if (
      normalizedProgress < segment.startProgress ||
      normalizedProgress > segment.endProgress
    ) {
      continue;
    }

    const start = requireValue(
      road.centerline[segment.startPointIndex],
      `road segment ${segment.startPointIndex}`
    );
    const end = requireValue(
      road.centerline[segment.endPointIndex],
      `road segment ${segment.endPointIndex}`
    );
    const ratio =
      segment.length <= Number.EPSILON
        ? 0
        : Math.min(
            Math.max(
              (normalizedProgress - segment.startProgress) / segment.length,
              0
            ),
            1
          );

    return {
      position: {
        x: start.position.x + (end.position.x - start.position.x) * ratio,
        y: start.position.y + (end.position.y - start.position.y) * ratio,
        z: start.position.z + (end.position.z - start.position.z) * ratio
      },
      headingRadians: Math.atan2(
        end.position.x - start.position.x,
        end.position.z - start.position.z
      )
    };
  }

  return getRoadValidationPose(0);
}

function getNearestRoadHeading(position: Vector3): number {
  const road = DEFAULT_TRACK_DEFINITION.road;
  const projection = getNearestTrackRoadProjection(road, position);
  const segment = requireValue(
    road.segments[projection.segmentIndex],
    `road segment ${projection.segmentIndex}`
  );
  const start = requireValue(
    road.centerline[segment.startPointIndex],
    `road segment start ${segment.startPointIndex}`
  );
  const end = requireValue(
    road.centerline[segment.endPointIndex],
    `road segment end ${segment.endPointIndex}`
  );

  return Math.atan2(
    end.position.x - start.position.x,
    end.position.z - start.position.z
  );
}

function getRacerSurface(racer: RaceSessionRacerState): string {
  return queryTrackSurfaceAtPoint(
    DEFAULT_TRACK_DEFINITION.road,
    racer.position,
    refreshRacerCollisionBounds(racer).boundingRadius
  ).surface;
}

function parkOtherRacers(session: RaceSession, activeRacerId: string): void {
  let waypointIndex = 3;

  for (const racer of session.racerStates) {
    if (racer.id === activeRacerId) {
      continue;
    }

    const pose = getRoadValidationPose(
      waypointIndex % DEFAULT_TRACK_DEFINITION.road.centerline.length
    );

    setRacerPose(racer, pose.position, pose.headingRadians, 0);
    waypointIndex += 2;
  }
}

function setRacerPose(
  racer: RaceSessionRacerState,
  position: Vector3,
  headingRadians: number,
  speed: number
): void {
  const normalizedHeading = normalizeHeading(headingRadians);
  const forward = {
    x: Math.sin(normalizedHeading),
    y: 0,
    z: Math.cos(normalizedHeading)
  };

  racer.position = { ...position };
  racer.headingRadians = normalizedHeading;
  racer.forward = forward;
  racer.speed = speed;
  racer.velocity = {
    x: forward.x * speed,
    y: 0,
    z: forward.z * speed
  };
  refreshRacerCollisionBounds(racer);
}

function getSignedHeadingDeltaToPoint(
  headingRadians: number,
  position: Vector3,
  target: Vector3
): number {
  return getSignedHeadingDelta(
    headingRadians,
    Math.atan2(target.x - position.x, target.z - position.z)
  );
}

function getSignedHeadingDelta(fromHeading: number, toHeading: number): number {
  return normalizeHeading(toHeading - fromHeading + Math.PI) - Math.PI;
}

function normalizeHeading(headingRadians: number): number {
  return ((headingRadians % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

function createHumanRacerInputs(
  humanRacerCount: number
): readonly HumanRaceStartRacerInput[] {
  return Array.from({ length: humanRacerCount }, (_, index) => {
    return {
      peerId: `ai-recovery-human-${index + 1}`,
      displayName: `AI Recovery Human ${index + 1}`,
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
