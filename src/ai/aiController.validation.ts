import {
  calculateAiSpeedControlInput,
  createAiController,
  getAiControllerCommand,
  updateAiRouteNavigationState,
  type AiKartState,
  type AiTrackState,
  type AiWaypointState
} from "./aiController";
import {
  createRacerProgressState,
  type RacerProgressState
} from "../race/raceState";

function main(): void {
  validateCurrentTargetSelectionAndImmediateAdvance();
  validateProgressCrossingAdvance();
  validateProgressJumpResynchronizesRouteTarget();
  validatePerOpponentNavigationState();
  validateActiveWaypointPathLookAheadTarget();
  validateStraightAndCornerSpeedModulation();
  validateRacePacedSpeedControlKeepsMovingWhileBrakingForTurns();
  validateImpactPhysicsFeedbackModulatesControl();

  console.info("aiController=ok");
}

function validateCurrentTargetSelectionAndImmediateAdvance(): void {
  const route = updateAiRouteNavigationState({
    kart: createKartState("ai-route", { x: 9.6, y: 0.45, z: 0 }, 9.6),
    track: VALIDATION_TRACK
  });

  assertEqual(route.targetSelection.source, "routeState", "route target source");
  assertEqual(route.state.currentWaypointIndex, 1, "current waypoint advances");
  assertEqual(route.state.targetWaypointIndex, 2, "target waypoint advances");
  assertEqual(route.state.nextWaypointIndex, 3, "next waypoint selection");
  assertEqual(route.state.lookAheadWaypointIndex, 0, "look-ahead wraps");
  assertEqual(route.state.waypointAdvanceCount, 1, "advance count increments");
  assertClose(
    route.targetSelection.position.x,
    17.6,
    "route target follows sampled path position"
  );
  assertGreaterThan(
    route.targetSelection.distanceToWaypoint,
    route.targetSelection.distanceToTarget,
    "route preserves waypoint distance separately from steering target"
  );
}

function validateProgressCrossingAdvance(): void {
  const firstRoute = updateAiRouteNavigationState({
    kart: createKartState("ai-crossing", { x: 16, y: 0.45, z: 9 }, 16),
    track: VALIDATION_TRACK
  });
  const crossedRoute = updateAiRouteNavigationState({
    kart: createKartState("ai-crossing", { x: 22, y: 0.45, z: 9 }, 22),
    track: VALIDATION_TRACK,
    previousState: firstRoute.state
  });

  assertEqual(firstRoute.state.targetWaypointIndex, 2, "initial crossing target");
  assertEqual(
    crossedRoute.state.targetWaypointIndex,
    3,
    "target advances after progress crosses waypoint"
  );
  assertEqual(
    crossedRoute.state.waypointAdvanceCount,
    firstRoute.state.waypointAdvanceCount + 1,
    "progress crossing increments advance count"
  );
}

function validateProgressJumpResynchronizesRouteTarget(): void {
  const firstRoute = updateAiRouteNavigationState({
    kart: createKartState("ai-progress-jump", { x: 1, y: 0.45, z: 0 }, 1),
    track: VALIDATION_TRACK
  });
  const jumpedRoute = updateAiRouteNavigationState({
    kart: createKartState("ai-progress-jump", { x: 24, y: 0.45, z: 0 }, 24),
    track: VALIDATION_TRACK,
    previousState: firstRoute.state
  });

  assertEqual(firstRoute.state.targetWaypointIndex, 1, "jump starts at target");
  assertEqual(
    jumpedRoute.state.targetWaypointIndex,
    3,
    "jump resynchronizes to upcoming waypoint"
  );
  assertEqual(
    jumpedRoute.state.waypointAdvanceCount,
    firstRoute.state.waypointAdvanceCount + 2,
    "jump counts skipped waypoint advances"
  );
  assertLessThan(
    jumpedRoute.state.distanceToTarget,
    getPlanarDistance(
      createKartState("ai-stale-route", { x: 24, y: 0.45, z: 0 }, 24).position,
      VALIDATION_WAYPOINTS[1].position
    ),
    "jump target is closer than the stale route waypoint"
  );
}

function validateActiveWaypointPathLookAheadTarget(): void {
  const kart = createKartState(
    "ai-turn-path",
    { x: 8, y: 0.45, z: -2 },
    8,
    { speed: 24 }
  );
  const route = updateAiRouteNavigationState({
    kart,
    track: TURN_VALIDATION_TRACK
  });
  const command = getAiControllerCommand({
    kart,
    track: TURN_VALIDATION_TRACK,
    deltaSeconds: 1 / 60,
    elapsedSeconds: 1 / 60
  });

  assertEqual(route.state.targetWaypointIndex, 1, "turn path target waypoint");
  assertClose(route.targetSelection.position.x, 20, "sampled turn target x");
  assertClose(route.targetSelection.position.z, 1.2, "sampled turn target z");
  assertClose(
    route.targetSelection.targetSpeed,
    33.04,
    "sampled turn target speed"
  );
  assertLessThan(command.steering, -0.05, "AI steers toward active path bend");
}

function validateStraightAndCornerSpeedModulation(): void {
  const straightCommand = getAiControllerCommand({
    kart: createKartState(
      "ai-straight-speed",
      { x: 2, y: 0.45, z: 0 },
      2,
      { speed: 12 }
    ),
    track: TURN_VALIDATION_TRACK,
    deltaSeconds: 1 / 60,
    elapsedSeconds: 1 / 60
  });
  const cornerCommand = getAiControllerCommand({
    kart: createKartState(
      "ai-corner-speed",
      { x: 18, y: 0.45, z: 0 },
      18,
      { speed: 31 }
    ),
    track: TURN_VALIDATION_TRACK,
    deltaSeconds: 1 / 60,
    elapsedSeconds: 1 / 60
  });

  assertGreaterThan(
    straightCommand.throttle,
    0.75,
    "AI uses strong throttle on straightaway"
  );
  assertEqual(straightCommand.brake, 0, "AI does not brake on open straight");
  assertLessThan(
    cornerCommand.throttle,
    straightCommand.throttle,
    "AI lifts throttle before a turn"
  );
  assertGreaterThan(
    cornerCommand.brake,
    0.55,
    "AI brakes when approaching a tight turn too fast"
  );
}

function validateRacePacedSpeedControlKeepsMovingWhileBrakingForTurns(): void {
  const turnEntryCommand = getAiControllerCommand({
    kart: createKartState(
      "ai-race-paced-turn-entry",
      { x: 20, y: 0.45, z: 12 },
      32,
      {
        speed: 12.4,
        maxSpeed: 12
      }
    ),
    track: TURN_VALIDATION_TRACK,
    deltaSeconds: 1 / 60,
    elapsedSeconds: 1 / 60
  });
  const turnExitRecovery = calculateAiSpeedControlInput({
    currentSpeed: 5,
    waypointDistance: 4,
    upcomingTurnSeverity: 0.5,
    targetSpeed: 34,
    maxSpeed: 12
  });
  const straightPaceHold = calculateAiSpeedControlInput({
    currentSpeed: 11.8,
    waypointDistance: 28,
    upcomingTurnSeverity: 0,
    targetSpeed: 34,
    maxSpeed: 12
  });

  assertGreaterThan(
    turnEntryCommand.brake,
    0.4,
    "race-paced AI brakes before turns when near its actual max speed"
  );
  assertLessThan(
    turnEntryCommand.throttle,
    0.15,
    "race-paced AI lifts throttle before turn entry"
  );
  assertGreaterThan(
    turnExitRecovery.throttle,
    0.25,
    "race-paced AI accelerates back to MVP speed after slowing for a turn"
  );
  assertEqual(
    turnExitRecovery.brake,
    0,
    "race-paced AI does not drag brake while recovering speed"
  );
  assertGreaterThan(
    straightPaceHold.throttle,
    0.15,
    "race-paced AI keeps maintenance throttle near straightaway max speed"
  );
  assertEqual(
    straightPaceHold.brake,
    0,
    "race-paced AI does not brake on straightaway pace hold"
  );
}

function validateImpactPhysicsFeedbackModulatesControl(): void {
  const command = getAiControllerCommand({
    kart: createKartState(
      "ai-impact-feedback",
      { x: 2, y: 0.45, z: 0 },
      2,
      {
        speed: 8,
        forward: { x: 1, y: 0, z: 0 },
        recovering: true,
        physics: {
          position: { x: 2, y: 0.45, z: 0 },
          velocity: { x: 0, y: 0, z: 18 },
          forward: { x: 0, y: 0, z: 1 },
          headingRadians: 0,
          speed: 18,
          collisionRecoverySeconds: 0.72,
          collisionRecoveryRatio: 1
        }
      }
    ),
    track: VALIDATION_TRACK,
    deltaSeconds: 1 / 60,
    elapsedSeconds: 1 / 60
  });

  assertGreaterThan(
    command.steering,
    0.55,
    "AI steers from impact-altered physics heading"
  );
  assertLessThan(
    command.throttle,
    0.35,
    "AI cuts throttle while collision recovery is active"
  );
  assertGreaterThan(
    command.brake,
    0.6,
    "AI applies braking from collision recovery feedback"
  );
}

function validatePerOpponentNavigationState(): void {
  const controller = createAiController();

  controller.getCommand({
    kart: createKartState("ai-alpha", { x: 9.8, y: 0.45, z: 0 }, 9.8),
    track: VALIDATION_TRACK,
    deltaSeconds: 1 / 60,
    elapsedSeconds: 1 / 60
  });
  controller.getCommand({
    kart: createKartState("ai-bravo", { x: 1, y: 0.45, z: 7 }, 1),
    track: VALIDATION_TRACK,
    deltaSeconds: 1 / 60,
    elapsedSeconds: 1 / 60
  });

  const alphaState = requireNavigationState(controller, "ai-alpha");
  const bravoState = requireNavigationState(controller, "ai-bravo");

  assertEqual(alphaState.racerId, "ai-alpha", "alpha state racer id");
  assertEqual(bravoState.racerId, "ai-bravo", "bravo state racer id");
  assertEqual(alphaState.targetWaypointIndex, 2, "alpha advanced target");
  assertEqual(bravoState.targetWaypointIndex, 1, "bravo keeps own target");

  controller.resetNavigationState?.("ai-alpha");
  assertEqual(
    controller.getNavigationState?.("ai-alpha"),
    undefined,
    "single racer navigation reset"
  );
  assertEqual(
    requireNavigationState(controller, "ai-bravo").targetWaypointIndex,
    1,
    "reset does not clear other racers"
  );
}

const VALIDATION_WAYPOINTS = [
  createWaypoint(0, { x: 0, y: 0.45, z: 0 }, 0),
  createWaypoint(1, { x: 10, y: 0.45, z: 0 }, 10),
  createWaypoint(2, { x: 20, y: 0.45, z: 0 }, 20),
  createWaypoint(3, { x: 30, y: 0.45, z: 0 }, 30)
] as const satisfies readonly AiWaypointState[];

const VALIDATION_TRACK = {
  id: "ai-validation-loop",
  name: "AI Validation Loop",
  lapCount: 3,
  spawnOrientationRadians: Math.PI / 2,
  bounds: {
    minX: -5,
    maxX: 35,
    minZ: -12,
    maxZ: 12
  },
  width: 8,
  totalLength: 40,
  waypoints: VALIDATION_WAYPOINTS,
  currentWaypoint: VALIDATION_WAYPOINTS[0],
  nextWaypoint: VALIDATION_WAYPOINTS[1],
  lookAheadWaypoint: VALIDATION_WAYPOINTS[2]
} as const satisfies AiTrackState;

const TURN_VALIDATION_WAYPOINTS = [
  createWaypoint(0, { x: 0, y: 0.45, z: 0 }, 0, 34),
  createWaypoint(1, { x: 20, y: 0.45, z: 0 }, 20, 34),
  createWaypoint(2, { x: 20, y: 0.45, z: 20 }, 40, 18),
  createWaypoint(3, { x: 0, y: 0.45, z: 20 }, 60, 30)
] as const satisfies readonly AiWaypointState[];

const TURN_VALIDATION_TRACK = {
  id: "ai-turn-validation-loop",
  name: "AI Turn Validation Loop",
  lapCount: 3,
  spawnOrientationRadians: Math.PI / 2,
  bounds: {
    minX: -5,
    maxX: 25,
    minZ: -8,
    maxZ: 25
  },
  width: 8,
  totalLength: 80,
  waypoints: TURN_VALIDATION_WAYPOINTS,
  currentWaypoint: TURN_VALIDATION_WAYPOINTS[0],
  nextWaypoint: TURN_VALIDATION_WAYPOINTS[1],
  lookAheadWaypoint: TURN_VALIDATION_WAYPOINTS[2]
} as const satisfies AiTrackState;

function createWaypoint(
  index: number,
  position: AiWaypointState["position"],
  trackProgress: number,
  targetSpeed = 24
): AiWaypointState {
  return {
    index,
    position,
    lane: "inside",
    radius: 4,
    targetSpeed,
    trackProgress
  };
}

function createKartState(
  racerId: string,
  position: AiKartState["position"],
  trackProgress: number,
  options: Partial<
    Pick<
      AiKartState,
      | "velocity"
      | "forward"
      | "headingRadians"
      | "speed"
      | "maxSpeed"
      | "recovering"
      | "physics"
    >
  > = {}
): AiKartState {
  const speed = options.speed ?? 8;
  const forward = options.forward ?? { x: 1, y: 0, z: 0 };

  return {
    racerId,
    position,
    velocity: options.velocity ?? {
      x: forward.x * speed,
      y: forward.y * speed,
      z: forward.z * speed
    },
    forward,
    headingRadians: options.headingRadians ?? Math.PI / 2,
    speed,
    ...(options.maxSpeed === undefined ? {} : { maxSpeed: options.maxSpeed }),
    progress: createProgressState(trackProgress),
    grounded: true,
    recovering: options.recovering ?? false,
    ...(options.physics === undefined ? {} : { physics: options.physics })
  };
}

function createProgressState(trackProgress: number): RacerProgressState {
  return createRacerProgressState({
    lap: 0,
    checkpointIndex: 0,
    trackProgress,
    finished: false
  });
}

function requireNavigationState(
  controller: ReturnType<typeof createAiController>,
  racerId: string
) {
  const state = controller.getNavigationState?.(racerId);

  if (state === undefined) {
    throw new Error(`Expected navigation state for ${racerId}.`);
  }

  return state;
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, got ${String(actual)}`
    );
  }
}

function assertClose(actual: number, expected: number, message: string): void {
  if (Math.abs(actual - expected) > 0.001) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertGreaterThan(
  actual: number,
  expectedMinimum: number,
  message: string
): void {
  if (actual <= expectedMinimum) {
    throw new Error(
      `${message}: expected > ${expectedMinimum}, got ${actual}`
    );
  }
}

function assertLessThan(
  actual: number,
  expectedMaximum: number,
  message: string
): void {
  if (actual >= expectedMaximum) {
    throw new Error(
      `${message}: expected < ${expectedMaximum}, got ${actual}`
    );
  }
}

function getPlanarDistance(
  from: AiKartState["position"],
  to: AiKartState["position"]
): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

main();
