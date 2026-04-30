import type { TrackLane, Vector3 } from "../config/aiRacers";
import type {
  TrackCheckpoint,
  TrackLapMarker,
  TrackMetadata,
  TrackRoadGeometry
} from "../config/tracks";
import type {
  RacerInputState,
  RacerProgressState
} from "../race/raceState";

export interface AiKartState {
  readonly racerId: string;
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly forward: Vector3;
  readonly headingRadians: number;
  readonly speed: number;
  readonly maxSpeed?: number;
  readonly progress: RacerProgressState;
  readonly grounded: boolean;
  readonly recovering: boolean;
  readonly physics?: AiKartPhysicsFeedbackState;
}

export interface AiKartPhysicsFeedbackState {
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly forward: Vector3;
  readonly headingRadians: number;
  readonly speed: number;
  readonly collisionRecoverySeconds: number;
  readonly collisionRecoveryRatio: number;
}

export interface AiWaypointState {
  readonly index: number;
  readonly position: Vector3;
  readonly lane: TrackLane;
  readonly radius: number;
  readonly targetSpeed: number;
  readonly trackProgress: number;
}

export interface AiRouteNavigationState {
  readonly racerId: string;
  readonly currentWaypointIndex: number;
  readonly targetWaypointIndex: number;
  readonly nextWaypointIndex: number;
  readonly lookAheadWaypointIndex: number;
  readonly lastTrackProgress: number;
  readonly waypointAdvanceCount: number;
  readonly distanceToTarget: number;
}

export interface AiRouteNavigationUpdate {
  readonly state: AiRouteNavigationState;
  readonly currentWaypoint: AiWaypointState;
  readonly targetWaypoint: AiWaypointState;
  readonly nextWaypoint: AiWaypointState;
  readonly lookAheadWaypoint: AiWaypointState;
  readonly targetSelection: AiWaypointTargetSelection;
}

export interface AiTrackState extends TrackMetadata {
  readonly lapCount: number;
  readonly road?: TrackRoadGeometry;
  readonly lapMarkers?: readonly TrackLapMarker[];
  readonly checkpoints?: readonly TrackCheckpoint[];
  readonly width: number;
  readonly totalLength: number;
  readonly waypoints?: readonly AiWaypointState[];
  readonly currentWaypoint: AiWaypointState;
  readonly nextWaypoint: AiWaypointState;
  readonly lookAheadWaypoint: AiWaypointState;
}

export interface AiControllerInput {
  readonly kart: AiKartState;
  readonly track: AiTrackState;
  readonly deltaSeconds: number;
  readonly elapsedSeconds: number;
}

export interface AiControllerCommand {
  /** Normalized forward acceleration in the [0, 1] range. */
  readonly throttle: number;
  /** Normalized braking force in the [0, 1] range. */
  readonly brake: number;
  /** Normalized steering command in the [-1, 1] range. */
  readonly steering: number;
}

export type AiWaypointTargetSource =
  | "trackWaypoints"
  | "routeState"
  | "currentWaypoint"
  | "nextWaypoint"
  | "lookAheadWaypoint";

export interface AiWaypointTargetSelectionInput {
  readonly kart: Pick<AiKartState, "position" | "progress" | "speed">;
  readonly track: AiTrackState;
  readonly navigationState?: AiRouteNavigationState;
  readonly lookAheadDistance?: number;
}

export interface AiWaypointTargetSelection {
  readonly waypoint: AiWaypointState;
  readonly position: Vector3;
  readonly distanceToTarget: number;
  readonly distanceToWaypoint: number;
  readonly progressDelta: number;
  readonly lookAheadDistance: number;
  readonly targetSpeed: number;
  readonly source: AiWaypointTargetSource;
}

export interface AiSteeringInputCalculationInput {
  readonly kart: Pick<
    AiKartState,
    "position" | "velocity" | "forward" | "headingRadians" | "physics"
  >;
  readonly target: Pick<AiWaypointTargetSelection, "position">;
  readonly fullSteerAngleRadians?: number;
}

export interface AiSpeedControlInputCalculationInput {
  readonly currentSpeed?: number;
  readonly speed?: number;
  readonly waypointDistance?: number;
  readonly distanceToWaypoint?: number;
  readonly distanceToTarget?: number;
  readonly upcomingTurnSeverity?: number;
  readonly turnSeverity?: number;
  readonly targetSpeed?: number;
  readonly maxSpeed?: number;
}

export type AiSpeedControlInputCalculation = Pick<
  AiControllerCommand,
  "throttle" | "brake"
>;

export interface AiTurnSeverityCalculationInput {
  readonly entryWaypoint: Pick<AiWaypointState, "position">;
  readonly apexWaypoint: Pick<AiWaypointState, "position">;
  readonly exitWaypoint: Pick<AiWaypointState, "position">;
}

export interface AiController {
  readonly getCommand: (input: AiControllerInput) => AiControllerCommand;
  readonly getNavigationState?: (
    racerId: string
  ) => AiRouteNavigationState | undefined;
  readonly resetNavigationState?: (racerId?: string) => void;
}

export const AI_CONTROLLER_COMMAND_LIMITS = {
  throttle: { min: 0, max: 1 },
  brake: { min: 0, max: 1 },
  steering: { min: -1, max: 1 }
} as const;

export const NEUTRAL_AI_CONTROLLER_COMMAND: AiControllerCommand = {
  throttle: 0,
  brake: 0,
  steering: 0
};

const MIN_AI_LOOKAHEAD_DISTANCE = 8;
const MAX_AI_LOOKAHEAD_DISTANCE = 30;
const AI_LOOKAHEAD_SECONDS = 0.55;
const AI_FULL_STEERING_ANGLE_RADIANS = Math.PI / 3;
const TRACK_PROGRESS_EPSILON = 0.001;
const AI_DEFAULT_TARGET_SPEED = 26;
const AI_MIN_CORNER_SPEED = 8;
const AI_MAX_TARGET_SPEED = 38;
const AI_TURN_SPEED_REDUCTION = 0.62;
const AI_CLOSE_TURN_SPEED_REDUCTION = 0.38;
const AI_MIN_BRAKING_DISTANCE = 7;
const AI_MAX_BRAKING_DISTANCE = 32;
const AI_SPEED_BRAKING_DISTANCE_FACTOR = 0.45;
const AI_TURN_BRAKING_DISTANCE = 15;
const AI_SPEED_CONTROL_DEAD_ZONE = 0.45;
const AI_FULL_THROTTLE_SPEED_DELTA = 8;
const AI_FULL_BRAKE_SPEED_DELTA = 11;
const AI_MAINTAIN_THROTTLE = 0.2;
const AI_WAYPOINT_ADVANCE_RADIUS_FLOOR = 3;
const AI_WAYPOINT_ADVANCE_PROGRESS_MARGIN = 1.25;
const AI_WAYPOINT_RESYNC_PROGRESS_MARGIN = 3;
const AI_IMPACT_STEERING_VELOCITY_BLEND = 0.72;
const AI_IMPACT_RECOVERY_MIN_THROTTLE_FACTOR = 0.2;
const AI_IMPACT_RECOVERY_BRAKE_FLOOR = 0.14;
const AI_IMPACT_RECOVERY_BRAKE_SCALE = 0.64;
const AI_IMPACT_RECOVERY_BRAKE_SPEED_THRESHOLD = 1.5;

export function createAiController(): AiController {
  const navigationStates = new Map<string, AiRouteNavigationState>();

  return {
    getCommand: (input) => getAiControllerCommand(input, navigationStates),
    getNavigationState: (racerId) => navigationStates.get(racerId),
    resetNavigationState: (racerId) => {
      if (racerId === undefined) {
        navigationStates.clear();
        return;
      }

      navigationStates.delete(racerId);
    }
  };
}

export const DEFAULT_AI_CONTROLLER = createAiController();

export function getAiControllerCommand(
  input: AiControllerInput,
  navigationStates?: Map<string, AiRouteNavigationState>
): AiControllerCommand {
  const kart = createAiPhysicsAwareKartState(input.kart);
  const collisionRecoveryRatio = getAiCollisionRecoveryRatio(kart);

  if (kart.recovering && collisionRecoveryRatio <= 0) {
    return {
      throttle: 0,
      brake: 1,
      steering: 0
    };
  }

  const previousNavigationState = navigationStates?.get(kart.racerId);
  const route = updateAiRouteNavigationState({
    kart,
    track: input.track,
    ...(previousNavigationState === undefined
      ? {}
      : { previousState: previousNavigationState })
  });
  navigationStates?.set(kart.racerId, route.state);

  const target = route.targetSelection;
  const steering = calculateAiSteeringInput({
    kart,
    target
  });
  const upcomingTurnSeverity = calculateAiUpcomingTurnSeverity({
    entryWaypoint: route.currentWaypoint,
    apexWaypoint: route.targetWaypoint,
    exitWaypoint: route.nextWaypoint
  });
  const speedControl = calculateAiSpeedControlInput({
    currentSpeed: kart.speed,
    waypointDistance: target.distanceToWaypoint,
    upcomingTurnSeverity,
    targetSpeed: target.targetSpeed,
    ...(kart.maxSpeed === undefined ? {} : { maxSpeed: kart.maxSpeed })
  });

  return normalizeAiControllerCommand(applyAiCollisionRecoveryToCommand(kart, {
    throttle: kart.grounded ? speedControl.throttle : 0,
    brake: speedControl.brake,
    steering
  }));
}

export function normalizeAiControllerCommand(
  command: AiControllerCommand
): AiControllerCommand {
  return {
    throttle: clampCommandAxis(command.throttle, "throttle"),
    brake: clampCommandAxis(command.brake, "brake"),
    steering: clampCommandAxis(command.steering, "steering")
  };
}

export function toRacerInputState(
  command: AiControllerCommand,
  previousInput?: Pick<RacerInputState, "drift" | "useItem">
): RacerInputState {
  const normalized = normalizeAiControllerCommand(command);

  return {
    throttle: normalized.throttle,
    brake: normalized.brake,
    steer: normalized.steering,
    drift: previousInput?.drift ?? false,
    useItem: previousInput?.useItem ?? false
  };
}

export function updateAiRouteNavigationState(input: {
  readonly kart: Pick<
    AiKartState,
    "racerId" | "position" | "progress" | "speed"
  >;
  readonly track: AiTrackState;
  readonly previousState?: AiRouteNavigationState;
  readonly lookAheadDistance?: number;
}): AiRouteNavigationUpdate {
  const waypoints = getRouteWaypoints(input.track);
  const currentProgress = resolveCurrentTrackProgress(
    input.kart.progress.trackProgress,
    input.track.currentWaypoint.trackProgress
  );

  if (waypoints.length === 0) {
    const fallbackTarget = selectAiWaypointTarget({
      kart: input.kart,
      track: input.track,
      ...(input.lookAheadDistance === undefined
        ? {}
        : { lookAheadDistance: input.lookAheadDistance })
    });
    const fallbackState: AiRouteNavigationState = {
      racerId: input.kart.racerId,
      currentWaypointIndex: fallbackTarget.waypoint.index,
      targetWaypointIndex: fallbackTarget.waypoint.index,
      nextWaypointIndex: fallbackTarget.waypoint.index,
      lookAheadWaypointIndex: fallbackTarget.waypoint.index,
      lastTrackProgress: currentProgress,
      waypointAdvanceCount: 0,
      distanceToTarget: fallbackTarget.distanceToTarget
    };

    return {
      state: fallbackState,
      currentWaypoint: fallbackTarget.waypoint,
      targetWaypoint: fallbackTarget.waypoint,
      nextWaypoint: fallbackTarget.waypoint,
      lookAheadWaypoint: fallbackTarget.waypoint,
      targetSelection: fallbackTarget
    };
  }

  const previousState =
    input.previousState?.racerId === input.kart.racerId
      ? input.previousState
      : undefined;
  let targetRouteIndex =
    previousState !== undefined
      ? clampWaypointRouteIndex(
          previousState.targetWaypointIndex,
          waypoints.length
        )
      : selectInitialAiRouteTargetIndex(
          waypoints,
          currentProgress,
          input.track.totalLength
        );
  let waypointAdvanceCount = previousState?.waypointAdvanceCount ?? 0;
  let localAdvanceCount = 0;
  let targetWaypoint = getWaypointAt(waypoints, targetRouteIndex);

  if (
    previousState !== undefined &&
    shouldResyncAiRouteWaypoint({
      currentProgress,
      previousProgress: previousState.lastTrackProgress,
      targetWaypoint,
      totalLength: input.track.totalLength
    })
  ) {
    const progressSyncedTargetIndex = selectInitialAiRouteTargetIndex(
      waypoints,
      currentProgress,
      input.track.totalLength
    );

    waypointAdvanceCount += getForwardRouteIndexDistance(
      targetRouteIndex,
      progressSyncedTargetIndex,
      waypoints.length
    );
    targetRouteIndex = progressSyncedTargetIndex;
    targetWaypoint = getWaypointAt(waypoints, targetRouteIndex);
  }

  while (
    localAdvanceCount < waypoints.length &&
    shouldAdvanceAiRouteWaypoint({
      kartPosition: input.kart.position,
      currentProgress,
      previousProgress: previousState?.lastTrackProgress,
      targetWaypoint,
      totalLength: input.track.totalLength
    })
  ) {
    targetRouteIndex = positiveModulo(targetRouteIndex + 1, waypoints.length);
    targetWaypoint = getWaypointAt(waypoints, targetRouteIndex);
    waypointAdvanceCount += 1;
    localAdvanceCount += 1;
  }

  const currentRouteIndex = positiveModulo(
    targetRouteIndex - 1,
    waypoints.length
  );
  const nextRouteIndex = positiveModulo(targetRouteIndex + 1, waypoints.length);
  const lookAheadRouteIndex = positiveModulo(
    targetRouteIndex + 2,
    waypoints.length
  );
  const currentWaypoint = getWaypointAt(waypoints, currentRouteIndex);
  const nextWaypoint = getWaypointAt(waypoints, nextRouteIndex);
  const lookAheadWaypoint = getWaypointAt(waypoints, lookAheadRouteIndex);
  const targetSelection = selectAiWaypointTarget({
    kart: input.kart,
    track: input.track,
    navigationState: {
      racerId: input.kart.racerId,
      currentWaypointIndex: currentRouteIndex,
      targetWaypointIndex: targetRouteIndex,
      nextWaypointIndex: nextRouteIndex,
      lookAheadWaypointIndex: lookAheadRouteIndex,
      lastTrackProgress: currentProgress,
      waypointAdvanceCount,
      distanceToTarget: getVectorDistance(
        input.kart.position,
        targetWaypoint.position
      )
    },
    ...(input.lookAheadDistance === undefined
      ? {}
      : { lookAheadDistance: input.lookAheadDistance })
  });
  const state: AiRouteNavigationState = {
    racerId: input.kart.racerId,
    currentWaypointIndex: currentRouteIndex,
    targetWaypointIndex: targetRouteIndex,
    nextWaypointIndex: nextRouteIndex,
    lookAheadWaypointIndex: lookAheadRouteIndex,
    lastTrackProgress: currentProgress,
    waypointAdvanceCount,
    distanceToTarget: targetSelection.distanceToTarget
  };

  return {
    state,
    currentWaypoint,
    targetWaypoint,
    nextWaypoint,
    lookAheadWaypoint,
    targetSelection
  };
}

export function selectAiWaypointTarget(
  input: AiWaypointTargetSelectionInput
): AiWaypointTargetSelection {
  const { kart, track } = input;
  const routeTarget = selectAiRouteWaypointTarget(input);

  if (routeTarget !== undefined) {
    return routeTarget;
  }

  const candidates = getWaypointTargetCandidates(track);
  const currentProgress = resolveCurrentTrackProgress(
    kart.progress.trackProgress,
    track.currentWaypoint.trackProgress
  );
  const lookAheadDistance = resolveLookAheadDistance(
    input.lookAheadDistance,
    kart.speed,
    track.totalLength
  );
  const laneFilteredCandidates = filterCandidatesByCurrentLane(
    candidates,
    track.currentWaypoint.lane
  );
  const targetCandidate = selectLookAheadCandidate(
    laneFilteredCandidates,
    currentProgress,
    track.totalLength,
    lookAheadDistance
  );

  return {
    waypoint: targetCandidate.waypoint,
    position: targetCandidate.waypoint.position,
    distanceToTarget: getVectorDistance(
      kart.position,
      targetCandidate.waypoint.position
    ),
    distanceToWaypoint: getVectorDistance(
      kart.position,
      targetCandidate.waypoint.position
    ),
    progressDelta: targetCandidate.progressDelta,
    lookAheadDistance,
    targetSpeed: targetCandidate.waypoint.targetSpeed,
    source: targetCandidate.source
  };
}

export function selectNextLookaheadWaypoint(
  input: AiWaypointTargetSelectionInput
): AiWaypointState {
  return selectAiWaypointTarget(input).waypoint;
}

export const selectNextLookAheadWaypoint = selectNextLookaheadWaypoint;

export function calculateAiSteeringInput(
  input: AiSteeringInputCalculationInput
): number {
  const forward = resolveForwardVector(input.kart);
  const targetDirection = getPlanarDirection(
    input.kart.position,
    input.target.position
  );

  if (forward === null || targetDirection === null) {
    return NEUTRAL_AI_CONTROLLER_COMMAND.steering;
  }

  const fullSteerAngle = resolveFullSteerAngle(input.fullSteerAngleRadians);
  const signedAngleToTarget = getSignedPlanarAngle(forward, targetDirection);
  const headingSteering = clampCommandAxis(
    signedAngleToTarget / fullSteerAngle,
    "steering"
  );
  const collisionRecoveryRatio = getAiCollisionRecoveryRatio(input.kart);

  if (collisionRecoveryRatio <= 0) {
    return headingSteering;
  }

  const velocityDirection = resolveVelocityVector(input.kart);

  if (velocityDirection === null) {
    return headingSteering;
  }

  const velocitySteering = clampCommandAxis(
    getSignedPlanarAngle(velocityDirection, targetDirection) / fullSteerAngle,
    "steering"
  );
  const velocityBlend = Math.min(
    AI_IMPACT_STEERING_VELOCITY_BLEND,
    collisionRecoveryRatio * AI_IMPACT_STEERING_VELOCITY_BLEND
  );

  return clampCommandAxis(
    interpolateNumber(headingSteering, velocitySteering, velocityBlend),
    "steering"
  );
}

export function calculateAiSpeedControlInput(
  input: AiSpeedControlInputCalculationInput
): AiSpeedControlInputCalculation {
  const currentSpeed = Math.abs(
    resolveFiniteNumber(input.currentSpeed ?? input.speed, 0)
  );
  const waypointDistance = Math.max(
    0,
    resolveFiniteNumber(
      input.waypointDistance ??
        input.distanceToWaypoint ??
        input.distanceToTarget,
      AI_MAX_BRAKING_DISTANCE
    )
  );
  const upcomingTurnSeverity = clampNumber(
    resolveFiniteNumber(
      input.upcomingTurnSeverity ?? input.turnSeverity,
      0
    ),
    0,
    1
  );
  const straightTargetSpeed = resolveTargetSpeed(input);
  const minimumTargetSpeed = resolveMinimumTargetSpeed(input.maxSpeed);
  const cornerTargetSpeed = Math.max(
    minimumTargetSpeed,
    straightTargetSpeed * (1 - upcomingTurnSeverity * AI_TURN_SPEED_REDUCTION)
  );
  const brakingDistance = clampNumber(
    AI_MIN_BRAKING_DISTANCE +
      currentSpeed * AI_SPEED_BRAKING_DISTANCE_FACTOR +
      upcomingTurnSeverity * AI_TURN_BRAKING_DISTANCE,
    AI_MIN_BRAKING_DISTANCE,
    AI_MAX_BRAKING_DISTANCE
  );
  const turnApproachRatio =
    1 - clampNumber(waypointDistance / brakingDistance, 0, 1);
  const closeTurnRatio = upcomingTurnSeverity * turnApproachRatio;
  const preparedTargetSpeed =
    straightTargetSpeed +
    (cornerTargetSpeed - straightTargetSpeed) * turnApproachRatio;
  const targetSpeed = Math.max(
    minimumTargetSpeed,
    preparedTargetSpeed * (1 - closeTurnRatio * AI_CLOSE_TURN_SPEED_REDUCTION)
  );
  const speedError = targetSpeed - currentSpeed;

  if (speedError > AI_SPEED_CONTROL_DEAD_ZONE) {
    const throttleDemand = speedError / AI_FULL_THROTTLE_SPEED_DELTA;
    const throttleLift = closeTurnRatio * 0.55;

    return {
      throttle: clampCommandAxis(
        throttleDemand * (1 - throttleLift),
        "throttle"
      ),
      brake: 0
    };
  }

  if (speedError < -AI_SPEED_CONTROL_DEAD_ZONE) {
    const overspeed = Math.abs(speedError);

    return {
      throttle: 0,
      brake: clampCommandAxis(
        overspeed / AI_FULL_BRAKE_SPEED_DELTA + closeTurnRatio * 0.35,
        "brake"
      )
    };
  }

  return {
    throttle: clampCommandAxis(
      AI_MAINTAIN_THROTTLE * (1 - closeTurnRatio),
      "throttle"
    ),
    brake: clampCommandAxis(
      closeTurnRatio > 0.75 ? (closeTurnRatio - 0.75) / 0.25 : 0,
      "brake"
    )
  };
}

export const calculateAiSpeedControlInputs = calculateAiSpeedControlInput;

export function calculateAiUpcomingTurnSeverity(
  input: AiTurnSeverityCalculationInput
): number {
  const entryDirection = getPlanarDirection(
    input.entryWaypoint.position,
    input.apexWaypoint.position
  );
  const exitDirection = getPlanarDirection(
    input.apexWaypoint.position,
    input.exitWaypoint.position
  );

  if (entryDirection === null || exitDirection === null) {
    return 0;
  }

  return clampNumber(
    Math.abs(getSignedPlanarAngle(entryDirection, exitDirection)) / Math.PI,
    0,
    1
  );
}

function createAiPhysicsAwareKartState(kart: AiKartState): AiKartState {
  const physics = kart.physics;

  if (physics === undefined) {
    return kart;
  }

  const headingRadians = resolveFiniteNumber(
    physics.headingRadians,
    kart.headingRadians
  );
  const velocity = createFiniteVector(physics.velocity, kart.velocity);
  const speed = Math.max(
    0,
    resolveFiniteNumber(physics.speed, getPlanarSpeed(velocity))
  );

  return {
    ...kart,
    position: createFiniteVector(physics.position, kart.position),
    velocity,
    forward: createFiniteVector(
      physics.forward,
      forwardFromHeading(headingRadians)
    ),
    headingRadians,
    speed
  };
}

function applyAiCollisionRecoveryToCommand(
  kart: Pick<AiKartState, "grounded" | "physics">,
  command: AiControllerCommand
): AiControllerCommand {
  const collisionRecoveryRatio = getAiCollisionRecoveryRatio(kart);

  if (collisionRecoveryRatio <= 0) {
    return command;
  }

  const collisionSpeed = resolveAiPhysicsSpeed(kart);
  const throttleFactor = interpolateNumber(
    1,
    AI_IMPACT_RECOVERY_MIN_THROTTLE_FACTOR,
    collisionRecoveryRatio
  );
  const brakeFloor =
    collisionSpeed > AI_IMPACT_RECOVERY_BRAKE_SPEED_THRESHOLD
      ? AI_IMPACT_RECOVERY_BRAKE_FLOOR +
        AI_IMPACT_RECOVERY_BRAKE_SCALE * collisionRecoveryRatio
      : AI_IMPACT_RECOVERY_BRAKE_FLOOR * collisionRecoveryRatio;

  return {
    throttle: kart.grounded ? command.throttle * throttleFactor : 0,
    brake: Math.max(command.brake, brakeFloor),
    steering: command.steering
  };
}

function getAiCollisionRecoveryRatio(
  kart: Pick<AiKartState, "physics">
): number {
  return clampNumber(
    resolveFiniteNumber(kart.physics?.collisionRecoveryRatio, 0),
    0,
    1
  );
}

function resolveAiPhysicsSpeed(kart: Pick<AiKartState, "physics">): number {
  const physics = kart.physics;

  if (physics === undefined) {
    return 0;
  }

  return Math.max(
    0,
    resolveFiniteNumber(physics.speed, getPlanarSpeed(physics.velocity))
  );
}

function resolveVelocityVector(
  kart: Pick<AiKartState, "velocity" | "physics">
): PlanarVector | null {
  const velocity = kart.physics?.velocity ?? kart.velocity;

  return normalizePlanarVector(velocity.x, velocity.z);
}

function createFiniteVector(value: Vector3, fallback: Vector3): Vector3 {
  return {
    x: resolveFiniteNumber(value.x, fallback.x),
    y: resolveFiniteNumber(value.y, fallback.y),
    z: resolveFiniteNumber(value.z, fallback.z)
  };
}

function forwardFromHeading(headingRadians: number): Vector3 {
  return {
    x: Math.sin(headingRadians),
    y: 0,
    z: Math.cos(headingRadians)
  };
}

function getPlanarSpeed(velocity: Pick<Vector3, "x" | "z">): number {
  return Math.hypot(
    resolveFiniteNumber(velocity.x, 0),
    resolveFiniteNumber(velocity.z, 0)
  );
}

function clampCommandAxis(
  value: number,
  axis: keyof typeof AI_CONTROLLER_COMMAND_LIMITS
): number {
  if (!Number.isFinite(value)) {
    return NEUTRAL_AI_CONTROLLER_COMMAND[axis];
  }

  const limits = AI_CONTROLLER_COMMAND_LIMITS[axis];
  return Math.min(limits.max, Math.max(limits.min, value));
}

interface WaypointTargetCandidate {
  readonly waypoint: AiWaypointState;
  readonly source: AiWaypointTargetSource;
}

interface RankedWaypointTargetCandidate extends WaypointTargetCandidate {
  readonly progressDelta: number;
}

function selectAiRouteWaypointTarget(
  input: AiWaypointTargetSelectionInput
): AiWaypointTargetSelection | undefined {
  const routeState = input.navigationState;

  if (routeState === undefined) {
    return undefined;
  }

  const waypoints = getRouteWaypoints(input.track);

  if (waypoints.length === 0) {
    return undefined;
  }

  const targetWaypoint = getWaypointAt(
    waypoints,
    routeState.targetWaypointIndex
  );
  const currentProgress = resolveCurrentTrackProgress(
    input.kart.progress.trackProgress,
    input.track.currentWaypoint.trackProgress
  );
  const lookAheadDistance = resolveLookAheadDistance(
    input.lookAheadDistance,
    input.kart.speed,
    input.track.totalLength
  );
  const waypointDistance = getVectorDistance(
    input.kart.position,
    targetWaypoint.position
  );
  const pathTarget = sampleAiRoutePathTarget({
    waypoints,
    currentProgress,
    totalLength: input.track.totalLength,
    lookAheadDistance,
    fallbackWaypoint: targetWaypoint
  });

  return {
    waypoint: targetWaypoint,
    position: pathTarget.position,
    distanceToTarget: getVectorDistance(input.kart.position, pathTarget.position),
    distanceToWaypoint: waypointDistance,
    progressDelta: getForwardProgressDelta(
      currentProgress,
      targetWaypoint.trackProgress,
      input.track.totalLength
    ),
    lookAheadDistance,
    targetSpeed: pathTarget.targetSpeed,
    source: "routeState"
  };
}

interface AiRoutePathTarget {
  readonly position: Vector3;
  readonly targetSpeed: number;
}

function sampleAiRoutePathTarget(input: {
  readonly waypoints: readonly AiWaypointState[];
  readonly currentProgress: number;
  readonly totalLength: number;
  readonly lookAheadDistance: number;
  readonly fallbackWaypoint: AiWaypointState;
}): AiRoutePathTarget {
  const pathPosition = sampleAiRoutePositionAtProgress(
    input.waypoints,
    input.currentProgress + input.lookAheadDistance,
    input.totalLength
  );

  return pathPosition ?? {
    position: input.fallbackWaypoint.position,
    targetSpeed: input.fallbackWaypoint.targetSpeed
  };
}

function sampleAiRoutePositionAtProgress(
  waypoints: readonly AiWaypointState[],
  trackProgress: number,
  totalLength: number
): AiRoutePathTarget | null {
  if (
    waypoints.length < 2 ||
    !Number.isFinite(totalLength) ||
    totalLength <= TRACK_PROGRESS_EPSILON
  ) {
    return null;
  }

  const normalizedProgress = normalizeTrackProgress(trackProgress, totalLength);

  for (let index = 0; index < waypoints.length; index += 1) {
    const startWaypoint = getWaypointAt(waypoints, index);
    const endWaypoint = getWaypointAt(waypoints, index + 1);
    const startProgress = normalizeTrackProgress(
      startWaypoint.trackProgress,
      totalLength
    );
    let endProgress = normalizeTrackProgress(
      endWaypoint.trackProgress,
      totalLength
    );

    if (index === waypoints.length - 1 || endProgress <= startProgress) {
      endProgress += totalLength;
    }

    const sampleProgress =
      normalizedProgress + (normalizedProgress < startProgress ? totalLength : 0);

    if (
      sampleProgress + TRACK_PROGRESS_EPSILON < startProgress ||
      sampleProgress - TRACK_PROGRESS_EPSILON > endProgress
    ) {
      continue;
    }

    const segmentProgressLength = endProgress - startProgress;
    const interpolation =
      segmentProgressLength <= TRACK_PROGRESS_EPSILON
        ? 0
        : clampNumber(
            (sampleProgress - startProgress) / segmentProgressLength,
            0,
            1
          );

    return {
      position: interpolateVector(
        startWaypoint.position,
        endWaypoint.position,
        interpolation
      ),
      targetSpeed:
        startWaypoint.targetSpeed +
        (endWaypoint.targetSpeed - startWaypoint.targetSpeed) * interpolation
    };
  }

  return null;
}

function getWaypointTargetCandidates(
  track: AiTrackState
): readonly WaypointTargetCandidate[] {
  const trackWaypoints = track.waypoints;

  if (trackWaypoints !== undefined && trackWaypoints.length > 0) {
    return dedupeWaypointTargetCandidates(
      trackWaypoints.map<WaypointTargetCandidate>((waypoint) => ({
        waypoint,
        source: "trackWaypoints"
      }))
    );
  }

  return dedupeWaypointTargetCandidates([
    {
      waypoint: track.lookAheadWaypoint,
      source: "lookAheadWaypoint"
    },
    {
      waypoint: track.nextWaypoint,
      source: "nextWaypoint"
    },
    {
      waypoint: track.currentWaypoint,
      source: "currentWaypoint"
    }
  ]);
}

function dedupeWaypointTargetCandidates(
  candidates: readonly WaypointTargetCandidate[]
): readonly WaypointTargetCandidate[] {
  const seen = new Set<string>();
  const deduped: WaypointTargetCandidate[] = [];

  for (const candidate of candidates) {
    const waypointKey = [
      candidate.waypoint.index,
      candidate.waypoint.trackProgress,
      candidate.waypoint.lane
    ].join(":");

    if (seen.has(waypointKey)) {
      continue;
    }

    seen.add(waypointKey);
    deduped.push(candidate);
  }

  return deduped;
}

function filterCandidatesByCurrentLane(
  candidates: readonly WaypointTargetCandidate[],
  currentLane: TrackLane
): readonly WaypointTargetCandidate[] {
  const sameLaneCandidates = candidates.filter(
    (candidate) => candidate.waypoint.lane === currentLane
  );

  return sameLaneCandidates.length > 0 ? sameLaneCandidates : candidates;
}

function selectLookAheadCandidate(
  candidates: readonly WaypointTargetCandidate[],
  currentProgress: number,
  totalLength: number,
  lookAheadDistance: number
): RankedWaypointTargetCandidate {
  const rankedCandidates = candidates.map((candidate) => ({
    ...candidate,
    progressDelta: getForwardProgressDelta(
      currentProgress,
      candidate.waypoint.trackProgress,
      totalLength
    )
  }));
  const stateLookAheadCandidate = rankedCandidates.find(
    (candidate) =>
      candidate.source === "lookAheadWaypoint" &&
      candidate.progressDelta > TRACK_PROGRESS_EPSILON
  );

  if (stateLookAheadCandidate !== undefined) {
    return stateLookAheadCandidate;
  }

  const aheadCandidates = rankedCandidates.filter(
    (candidate) => candidate.progressDelta > TRACK_PROGRESS_EPSILON
  );
  const selectableCandidates =
    aheadCandidates.length > 0 ? aheadCandidates : rankedCandidates;
  const reachedLookAheadCandidates = selectableCandidates.filter(
    (candidate) => candidate.progressDelta >= lookAheadDistance
  );

  if (reachedLookAheadCandidates.length > 0) {
    return reachedLookAheadCandidates.reduce((best, candidate) =>
      candidate.progressDelta < best.progressDelta ? candidate : best
    );
  }

  return selectableCandidates.reduce((best, candidate) =>
    candidate.progressDelta > best.progressDelta ? candidate : best
  );
}

function resolveCurrentTrackProgress(
  racerProgress: number,
  fallbackProgress: number
): number {
  return Number.isFinite(racerProgress) ? racerProgress : fallbackProgress;
}

function resolveLookAheadDistance(
  configuredDistance: number | undefined,
  speed: number,
  totalLength: number
): number {
  const speedBasedDistance = Math.abs(speed) * AI_LOOKAHEAD_SECONDS;
  const rawDistance =
    configuredDistance !== undefined
      ? configuredDistance
      : speedBasedDistance;
  const clampedDistance = clampNumber(
    rawDistance,
    MIN_AI_LOOKAHEAD_DISTANCE,
    MAX_AI_LOOKAHEAD_DISTANCE
  );

  if (!Number.isFinite(totalLength) || totalLength <= TRACK_PROGRESS_EPSILON) {
    return clampedDistance;
  }

  return Math.min(clampedDistance, totalLength);
}

function getRouteWaypoints(track: AiTrackState): readonly AiWaypointState[] {
  const trackWaypoints = track.waypoints;

  if (trackWaypoints !== undefined && trackWaypoints.length > 0) {
    return trackWaypoints;
  }

  return dedupeWaypointTargetCandidates([
    {
      waypoint: track.currentWaypoint,
      source: "currentWaypoint"
    },
    {
      waypoint: track.nextWaypoint,
      source: "nextWaypoint"
    },
    {
      waypoint: track.lookAheadWaypoint,
      source: "lookAheadWaypoint"
    }
  ]).map((candidate) => candidate.waypoint);
}

function selectInitialAiRouteTargetIndex(
  waypoints: readonly AiWaypointState[],
  currentProgress: number,
  totalLength: number
): number {
  const indexedCandidates = waypoints.map((waypoint, routeIndex) => ({
    routeIndex,
    progressDelta: getForwardProgressDelta(
      currentProgress,
      waypoint.trackProgress,
      totalLength
    )
  }));
  const aheadCandidates = indexedCandidates.filter(
    (candidate) => candidate.progressDelta > TRACK_PROGRESS_EPSILON
  );
  const selectableCandidates =
    aheadCandidates.length > 0 ? aheadCandidates : indexedCandidates;

  return selectableCandidates.reduce((best, candidate) =>
    candidate.progressDelta < best.progressDelta ? candidate : best
  ).routeIndex;
}

function shouldAdvanceAiRouteWaypoint(input: {
  readonly kartPosition: Vector3;
  readonly currentProgress: number;
  readonly previousProgress: number | undefined;
  readonly targetWaypoint: AiWaypointState;
  readonly totalLength: number;
}): boolean {
  const advanceRadius = Math.max(
    AI_WAYPOINT_ADVANCE_RADIUS_FLOOR,
    input.targetWaypoint.radius
  );

  if (
    getVectorDistance(input.kartPosition, input.targetWaypoint.position) <=
    advanceRadius
  ) {
    return true;
  }

  if (input.previousProgress === undefined) {
    return false;
  }

  const previousDelta = getForwardProgressDelta(
    input.previousProgress,
    input.targetWaypoint.trackProgress,
    input.totalLength
  );
  const currentDelta = getForwardProgressDelta(
    input.currentProgress,
    input.targetWaypoint.trackProgress,
    input.totalLength
  );

  return (
    previousDelta <= advanceRadius + AI_WAYPOINT_ADVANCE_PROGRESS_MARGIN &&
    currentDelta > previousDelta + AI_WAYPOINT_ADVANCE_PROGRESS_MARGIN
  );
}

function shouldResyncAiRouteWaypoint(input: {
  readonly currentProgress: number;
  readonly previousProgress: number;
  readonly targetWaypoint: AiWaypointState;
  readonly totalLength: number;
}): boolean {
  const previousDelta = getForwardProgressDelta(
    input.previousProgress,
    input.targetWaypoint.trackProgress,
    input.totalLength
  );
  const currentDelta = getForwardProgressDelta(
    input.currentProgress,
    input.targetWaypoint.trackProgress,
    input.totalLength
  );

  return currentDelta > previousDelta + AI_WAYPOINT_RESYNC_PROGRESS_MARGIN;
}

function getForwardRouteIndexDistance(
  fromIndex: number,
  toIndex: number,
  waypointCount: number
): number {
  return positiveModulo(toIndex - fromIndex, waypointCount);
}

function clampWaypointRouteIndex(index: number, waypointCount: number): number {
  if (!Number.isFinite(index) || waypointCount <= 0) {
    return 0;
  }

  return positiveModulo(Math.trunc(index), waypointCount);
}

function getForwardProgressDelta(
  currentProgress: number,
  waypointProgress: number,
  totalLength: number
): number {
  if (
    !Number.isFinite(totalLength) ||
    totalLength <= TRACK_PROGRESS_EPSILON
  ) {
    const finiteCurrentProgress = Number.isFinite(currentProgress)
      ? currentProgress
      : 0;
    const finiteWaypointProgress = Number.isFinite(waypointProgress)
      ? waypointProgress
      : finiteCurrentProgress;

    return Math.max(0, finiteWaypointProgress - finiteCurrentProgress);
  }

  const normalizedCurrentProgress = normalizeTrackProgress(
    currentProgress,
    totalLength
  );
  const normalizedWaypointProgress = normalizeTrackProgress(
    waypointProgress,
    totalLength
  );
  const rawDelta = normalizedWaypointProgress - normalizedCurrentProgress;

  return rawDelta >= -TRACK_PROGRESS_EPSILON
    ? Math.max(0, rawDelta)
    : rawDelta + totalLength;
}

function normalizeTrackProgress(progress: number, totalLength: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }

  const normalizedProgress = progress % totalLength;
  return normalizedProgress >= 0
    ? normalizedProgress
    : normalizedProgress + totalLength;
}

function getWaypointAt(
  waypoints: readonly AiWaypointState[],
  index: number
): AiWaypointState {
  if (waypoints.length === 0) {
    throw new Error("Cannot resolve AI route waypoint from an empty route.");
  }

  const waypoint = waypoints[positiveModulo(index, waypoints.length)];

  if (waypoint === undefined) {
    throw new Error(`Missing AI route waypoint at index ${index}.`);
  }

  return waypoint;
}

function positiveModulo(value: number, divisor: number): number {
  if (!Number.isFinite(value) || divisor <= 0) {
    return 0;
  }

  return ((Math.trunc(value) % divisor) + divisor) % divisor;
}

function getVectorDistance(from: Vector3, to: Vector3): number {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const deltaZ = to.z - from.z;

  return Math.hypot(deltaX, deltaY, deltaZ);
}

function interpolateVector(from: Vector3, to: Vector3, amount: number): Vector3 {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
    z: from.z + (to.z - from.z) * amount
  };
}

interface PlanarVector {
  readonly x: number;
  readonly z: number;
}

function resolveForwardVector(
  kart: Pick<AiKartState, "forward" | "headingRadians">
): PlanarVector | null {
  const forward = normalizePlanarVector(kart.forward.x, kart.forward.z);

  if (forward !== null) {
    return forward;
  }

  if (!Number.isFinite(kart.headingRadians)) {
    return null;
  }

  return normalizePlanarVector(
    Math.sin(kart.headingRadians),
    Math.cos(kart.headingRadians)
  );
}

function getPlanarDirection(from: Vector3, to: Vector3): PlanarVector | null {
  return normalizePlanarVector(to.x - from.x, to.z - from.z);
}

function normalizePlanarVector(x: number, z: number): PlanarVector | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    return null;
  }

  const length = Math.hypot(x, z);

  if (length <= TRACK_PROGRESS_EPSILON) {
    return null;
  }

  return {
    x: x / length,
    z: z / length
  };
}

function getSignedPlanarAngle(from: PlanarVector, to: PlanarVector): number {
  const dot = from.x * to.x + from.z * to.z;
  const rightTurnCross = from.z * to.x - from.x * to.z;

  return Math.atan2(
    rightTurnCross,
    clampNumber(dot, -1, 1)
  );
}

function resolveFullSteerAngle(configuredAngle: number | undefined): number {
  if (
    configuredAngle === undefined ||
    !Number.isFinite(configuredAngle) ||
    configuredAngle <= TRACK_PROGRESS_EPSILON
  ) {
    return AI_FULL_STEERING_ANGLE_RADIANS;
  }

  return Math.min(configuredAngle, Math.PI);
}

function resolveTargetSpeed(
  input: Pick<
    AiSpeedControlInputCalculationInput,
    "targetSpeed" | "maxSpeed"
  >
): number {
  const maximumTargetSpeed = resolveMaximumTargetSpeed(input.maxSpeed);
  const minimumTargetSpeed = resolveMinimumTargetSpeed(input.maxSpeed);
  const configuredSpeed = resolveFiniteNumber(
    input.targetSpeed ?? input.maxSpeed,
    AI_DEFAULT_TARGET_SPEED
  );

  return clampNumber(
    configuredSpeed,
    minimumTargetSpeed,
    maximumTargetSpeed
  );
}

function resolveMinimumTargetSpeed(maxSpeed: number | undefined): number {
  return Math.min(AI_MIN_CORNER_SPEED, resolveMaximumTargetSpeed(maxSpeed));
}

function resolveMaximumTargetSpeed(maxSpeed: number | undefined): number {
  if (maxSpeed === undefined || !Number.isFinite(maxSpeed)) {
    return AI_MAX_TARGET_SPEED;
  }

  return clampNumber(maxSpeed, 0, AI_MAX_TARGET_SPEED);
}

function resolveFiniteNumber(
  value: number | undefined,
  fallback: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function interpolateNumber(start: number, end: number, ratio: number): number {
  const normalizedRatio = clampNumber(resolveFiniteNumber(ratio, 0), 0, 1);

  return start + (end - start) * normalizedRatio;
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}
