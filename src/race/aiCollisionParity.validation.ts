import type { AiRacerProfileConfig, Vector3 } from "../config/aiRacers";
import {
  DEFAULT_TRACK_DEFINITION,
  type TrackRoadGeometry
} from "../config/tracks";
import { detectKartCollisionBoundsOverlap } from "../physics/kartCollisionBounds";
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
import {
  createRaceStartRoster,
  type HumanRaceStartRacerInput
} from "./raceStartRoster";

const KART_IMPACT_SPEED = 24;
const KART_IMPACT_HALF_SEPARATION = 0.72;
const TRACK_IMPACT_SPEED = 34;
const BOUNDARY_PENETRATION_DEPTH = 0.65;
const OBSTACLE_PENETRATION_DEPTH = 0.42;
const PARITY_TOLERANCE = 0.001;

const COLLISION_PARITY_AI_PROFILES = [
  {
    id: "parity_ai_1",
    displayName: "Parity AI 1",
    color: "#f45d48",
    visual: {
      accentColor: "#ffd166",
      racingNumber: 91,
      decal: "flame"
    },
    driving: {
      maxSpeed: 30,
      acceleration: 20,
      braking: 20,
      steeringResponsiveness: 0.86,
      traction: 0.82,
      recovery: 0.75,
      itemAggression: 0
    },
    behavior: {
      preferredLane: "inside",
      overtakeBias: 0,
      itemUseRange: 0
    }
  },
  {
    id: "parity_ai_2",
    displayName: "Parity AI 2",
    color: "#3db7ff",
    visual: {
      accentColor: "#9fffe0",
      racingNumber: 92,
      decal: "bolt"
    },
    driving: {
      maxSpeed: 30,
      acceleration: 20,
      braking: 20,
      steeringResponsiveness: 0.86,
      traction: 0.82,
      recovery: 0.75,
      itemAggression: 0
    },
    behavior: {
      preferredLane: "outside",
      overtakeBias: 0,
      itemUseRange: 0
    }
  },
  {
    id: "parity_ai_3",
    displayName: "Parity AI 3",
    color: "#82d173",
    visual: {
      accentColor: "#f7fff7",
      racingNumber: 93,
      decal: "comet"
    },
    driving: {
      maxSpeed: 30,
      acceleration: 20,
      braking: 20,
      steeringResponsiveness: 0.86,
      traction: 0.82,
      recovery: 0.75,
      itemAggression: 0
    },
    behavior: {
      preferredLane: "inside",
      overtakeBias: 0,
      itemUseRange: 0
    }
  },
  {
    id: "parity_ai_4",
    displayName: "Parity AI 4",
    color: "#b388eb",
    visual: {
      accentColor: "#ffafcc",
      racingNumber: 94,
      decal: "wing"
    },
    driving: {
      maxSpeed: 30,
      acceleration: 20,
      braking: 20,
      steeringResponsiveness: 0.86,
      traction: 0.82,
      recovery: 0.75,
      itemAggression: 0
    },
    behavior: {
      preferredLane: "outside",
      overtakeBias: 0,
      itemUseRange: 0
    }
  }
] as const satisfies readonly AiRacerProfileConfig[];

type KartPairScenarioKind = "human-human" | "human-ai" | "ai-ai";
type SingleRacerScenarioKind = "human" | "ai";

interface PlanarVector {
  readonly x: number;
  readonly z: number;
}

interface KartPairImpactResult {
  readonly scenario: KartPairScenarioKind;
  readonly contacts: number;
  readonly overlapResolved: boolean;
  readonly separationGain: number;
  readonly leftSpeedAfter: number;
  readonly rightSpeedAfter: number;
  readonly averageSpeedFactor: number;
  readonly leftControlSeconds: number;
  readonly rightControlSeconds: number;
  readonly relativeNormalSpeedAfter: number;
}

interface TrackImpactResult {
  readonly scenario: SingleRacerScenarioKind;
  readonly impactType: "boundary" | "obstacle";
  readonly hasPostCollisionOverlap: boolean;
  readonly speedAfter: number;
  readonly controlSeconds: number;
  readonly stunSeconds: number;
  readonly recovering: boolean;
  readonly responseDot: number;
}

interface KartPairParityValidationResult {
  readonly humanHuman: KartPairImpactResult;
  readonly humanAi: KartPairImpactResult;
  readonly aiAi: KartPairImpactResult;
}

interface TrackParityValidationResult {
  readonly humanBoundary: TrackImpactResult;
  readonly aiBoundary: TrackImpactResult;
  readonly humanObstacle: TrackImpactResult;
  readonly aiObstacle: TrackImpactResult;
}

function main(): void {
  const kartPairParity = validateKartPairCollisionParity();
  const trackParity = validateKartTrackCollisionParity();

  console.info(
    [
      "aiCollisionParity=ok",
      `humanHumanKartSpeed=${kartPairParity.humanHuman.averageSpeedFactor.toFixed(3)}`,
      `humanAiKartSpeed=${kartPairParity.humanAi.averageSpeedFactor.toFixed(3)}`,
      `aiAiKartSpeed=${kartPairParity.aiAi.averageSpeedFactor.toFixed(3)}`,
      `boundarySpeeds=(${trackParity.humanBoundary.speedAfter.toFixed(3)},${trackParity.aiBoundary.speedAfter.toFixed(3)})`,
      `obstacleSpeeds=(${trackParity.humanObstacle.speedAfter.toFixed(3)},${trackParity.aiObstacle.speedAfter.toFixed(3)})`,
      `obstacleStuns=(${trackParity.humanObstacle.stunSeconds.toFixed(3)},${trackParity.aiObstacle.stunSeconds.toFixed(3)})`
    ].join(" ")
  );
}

function validateKartPairCollisionParity(): KartPairParityValidationResult {
  const humanHuman = resolveKartPairImpact("human-human");
  const humanAi = resolveKartPairImpact("human-ai");
  const aiAi = resolveKartPairImpact("ai-ai");

  assertKartPairParity(humanHuman, humanAi, "human-AI kart impact");
  assertKartPairParity(humanHuman, aiAi, "AI-AI kart impact");

  return {
    humanHuman,
    humanAi,
    aiAi
  };
}

function validateKartTrackCollisionParity(): TrackParityValidationResult {
  const humanBoundary = resolveBoundaryImpact("human");
  const aiBoundary = resolveBoundaryImpact("ai");
  const humanObstacle = resolveObstacleImpact("human");
  const aiObstacle = resolveObstacleImpact("ai");

  assertTrackImpactParity(humanBoundary, aiBoundary, "AI boundary impact");
  assertTrackImpactParity(humanObstacle, aiObstacle, "AI obstacle impact");

  return {
    humanBoundary,
    aiBoundary,
    humanObstacle,
    aiObstacle
  };
}

function resolveKartPairImpact(
  scenario: KartPairScenarioKind
): KartPairImpactResult {
  const session = createValidationSession(getHumanRacerCount(scenario));
  const { left, right } = getActiveKartPair(session, scenario);
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const forwardAxis = forwardFromHeading(headingRadians);

  parkNonTargetRacers(session, [left.id, right.id]);
  setMovingRacerPose(
    left,
    offsetPlanarPosition(
      targetPoint.position,
      forwardAxis,
      -KART_IMPACT_HALF_SEPARATION
    ),
    headingRadians,
    KART_IMPACT_SPEED
  );
  setMovingRacerPose(
    right,
    offsetPlanarPosition(
      targetPoint.position,
      forwardAxis,
      KART_IMPACT_HALF_SEPARATION
    ),
    normalizeOrientationRadians(headingRadians + Math.PI),
    KART_IMPACT_SPEED
  );

  const initialOverlap = requireValue(
    detectKartCollisionBoundsOverlap(
      refreshRacerCollisionBounds(left),
      refreshRacerCollisionBounds(right)
    ),
    `${scenario} initial kart overlap`
  );
  const relativeNormalSpeedBefore = getRelativeNormalSpeed(
    left,
    right,
    initialOverlap.normal
  );
  const initialSeparation = getPlanarDistance(left.position, right.position);

  assertLessThan(
    relativeNormalSpeedBefore,
    0,
    `${scenario} racers start moving into each other`
  );

  const tickResult = session.tick(0);
  const finalSeparation = getPlanarDistance(left.position, right.position);
  const relativeNormalSpeedAfter = getRelativeNormalSpeed(
    left,
    right,
    initialOverlap.normal
  );
  const overlapResolved =
    detectKartCollisionBoundsOverlap(
      refreshRacerCollisionBounds(left),
      refreshRacerCollisionBounds(right)
    ) === null;

  assertGreaterThan(
    tickResult.kartCollisionContacts,
    0,
    `${scenario} contact count`
  );
  assertEqual(overlapResolved, true, `${scenario} overlap resolved`);
  assertGreaterThan(
    finalSeparation - initialSeparation,
    0,
    `${scenario} separation gain`
  );
  assertGreaterThan(
    relativeNormalSpeedAfter,
    0,
    `${scenario} separating normal velocity`
  );
  assertGreaterThan(
    left.collisionControlSeconds,
    0,
    `${scenario} left collision-control timer`
  );
  assertGreaterThan(
    right.collisionControlSeconds,
    0,
    `${scenario} right collision-control timer`
  );

  return {
    scenario,
    contacts: tickResult.kartCollisionContacts,
    overlapResolved,
    separationGain: finalSeparation - initialSeparation,
    leftSpeedAfter: left.speed,
    rightSpeedAfter: right.speed,
    averageSpeedFactor:
      (left.speed / KART_IMPACT_SPEED + right.speed / KART_IMPACT_SPEED) / 2,
    leftControlSeconds: left.collisionControlSeconds,
    rightControlSeconds: right.collisionControlSeconds,
    relativeNormalSpeedAfter
  };
}

function resolveBoundaryImpact(
  scenario: SingleRacerScenarioKind
): TrackImpactResult {
  const session = createValidationSession(scenario === "human" ? 1 : 0);
  const racer = getActiveSingleRacer(session, scenario);
  const boundaryCollider = requireValue(
    DEFAULT_TRACK_COLLISION_LAYER.boundaryColliders.find(
      (collider) => collider.side === "right" && collider.segmentIndex === 0
    ),
    "right course boundary collider"
  );
  const inwardNormal = getBoundaryColliderInwardNormal(boundaryCollider);

  parkNonTargetRacers(session, [racer.id]);
  placeRacerInBoundaryContact(racer, boundaryCollider, inwardNormal);

  const preCollision = detectBoundaryCollision(racer);

  assertEqual(
    preCollision.hasCollision,
    true,
    `${scenario} boundary scenario starts in collision`
  );

  session.tick(0);

  const postCollision = detectBoundaryCollision(racer);
  const responseDot =
    racer.forward.x * inwardNormal.x + racer.forward.z * inwardNormal.z;

  assertEqual(
    postCollision.hasCollision,
    false,
    `${scenario} boundary scenario clears overlap`
  );
  assertLessThan(
    racer.speed,
    TRACK_IMPACT_SPEED,
    `${scenario} boundary impact damps speed`
  );
  assertGreaterThan(
    racer.collisionControlSeconds,
    0,
    `${scenario} boundary impact starts collision control`
  );
  assertEqual(
    racer.recovering,
    true,
    `${scenario} boundary impact marks recovering`
  );
  assertGreaterThan(
    responseDot,
    0.25,
    `${scenario} boundary impact redirects inward`
  );

  return {
    scenario,
    impactType: "boundary",
    hasPostCollisionOverlap: postCollision.hasCollision,
    speedAfter: racer.speed,
    controlSeconds: racer.collisionControlSeconds,
    stunSeconds: racer.stunSeconds,
    recovering: racer.recovering,
    responseDot
  };
}

function resolveObstacleImpact(
  scenario: SingleRacerScenarioKind
): TrackImpactResult {
  const obstacle = createValidationObstacle();
  const session = createValidationSession(
    scenario === "human" ? 1 : 0,
    [obstacle]
  );
  const racer = getActiveSingleRacer(session, scenario);
  const collisionNormal = rightFromHeading(
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians
  );

  parkNonTargetRacers(session, [racer.id]);
  placeRacerInObstacleContact(racer, obstacle, collisionNormal);

  const preCollision = detectKartBoundsTrackObstacleContacts(
    refreshRacerCollisionBounds(racer),
    { obstacleColliders: [obstacle] }
  );

  assertEqual(
    preCollision.hasCollision,
    true,
    `${scenario} obstacle scenario starts in collision`
  );

  session.tick(0);

  const postCollision = detectKartBoundsTrackObstacleContacts(
    refreshRacerCollisionBounds(racer),
    { obstacleColliders: [obstacle] }
  );
  const responseDot =
    racer.forward.x * collisionNormal.x + racer.forward.z * collisionNormal.z;

  assertEqual(
    postCollision.hasCollision,
    false,
    `${scenario} obstacle scenario clears overlap`
  );
  assertLessThan(
    racer.speed,
    TRACK_IMPACT_SPEED,
    `${scenario} obstacle impact damps speed`
  );
  assertGreaterThan(
    racer.collisionControlSeconds,
    0,
    `${scenario} obstacle impact starts collision control`
  );
  assertGreaterThan(
    racer.stunSeconds,
    0,
    `${scenario} obstacle impact applies stun`
  );
  assertEqual(
    racer.recovering,
    true,
    `${scenario} obstacle impact marks recovering`
  );
  assertGreaterThan(
    responseDot,
    0.25,
    `${scenario} obstacle impact redirects away`
  );

  return {
    scenario,
    impactType: "obstacle",
    hasPostCollisionOverlap: postCollision.hasCollision,
    speedAfter: racer.speed,
    controlSeconds: racer.collisionControlSeconds,
    stunSeconds: racer.stunSeconds,
    recovering: racer.recovering,
    responseDot
  };
}

function assertKartPairParity(
  expected: KartPairImpactResult,
  actual: KartPairImpactResult,
  label: string
): void {
  assertEqual(
    actual.contacts,
    expected.contacts,
    `${label} contact count matches player baseline`
  );
  assertEqual(
    actual.overlapResolved,
    expected.overlapResolved,
    `${label} overlap resolution matches player baseline`
  );
  assertAlmostEqual(
    actual.separationGain,
    expected.separationGain,
    `${label} separation gain matches player baseline`
  );
  assertAlmostEqual(
    actual.leftSpeedAfter,
    expected.leftSpeedAfter,
    `${label} left speed response matches player baseline`
  );
  assertAlmostEqual(
    actual.rightSpeedAfter,
    expected.rightSpeedAfter,
    `${label} right speed response matches player baseline`
  );
  assertAlmostEqual(
    actual.averageSpeedFactor,
    expected.averageSpeedFactor,
    `${label} average speed damping matches player baseline`
  );
  assertAlmostEqual(
    actual.leftControlSeconds,
    expected.leftControlSeconds,
    `${label} left recovery timer matches player baseline`
  );
  assertAlmostEqual(
    actual.rightControlSeconds,
    expected.rightControlSeconds,
    `${label} right recovery timer matches player baseline`
  );
  assertAlmostEqual(
    actual.relativeNormalSpeedAfter,
    expected.relativeNormalSpeedAfter,
    `${label} separating velocity matches player baseline`
  );
}

function assertTrackImpactParity(
  expected: TrackImpactResult,
  actual: TrackImpactResult,
  label: string
): void {
  assertEqual(
    actual.impactType,
    expected.impactType,
    `${label} impact type matches player baseline`
  );
  assertEqual(
    actual.hasPostCollisionOverlap,
    expected.hasPostCollisionOverlap,
    `${label} overlap resolution matches player baseline`
  );
  assertAlmostEqual(
    actual.speedAfter,
    expected.speedAfter,
    `${label} speed response matches player baseline`
  );
  assertAlmostEqual(
    actual.controlSeconds,
    expected.controlSeconds,
    `${label} recovery timer matches player baseline`
  );
  assertAlmostEqual(
    actual.stunSeconds,
    expected.stunSeconds,
    `${label} stun timer matches player baseline`
  );
  assertEqual(
    actual.recovering,
    expected.recovering,
    `${label} recovering state matches player baseline`
  );
  assertAlmostEqual(
    actual.responseDot,
    expected.responseDot,
    `${label} response direction matches player baseline`
  );
}

function createValidationSession(
  humanRacerCount: number,
  obstacles: readonly TrackObstacleCollider[] = []
): RaceSession {
  return createRaceSessionFromStartRoster(
    createRaceStartRoster(
      createHumanRacerInputs(humanRacerCount),
      COLLISION_PARITY_AI_PROFILES
    ),
    {
      aiController: {
        getCommand: () => ({
          throttle: 0,
          brake: 0,
          steering: 0
        })
      },
      obstacles,
      itemPickups: []
    }
  );
}

function createHumanRacerInputs(
  humanRacerCount: number
): readonly HumanRaceStartRacerInput[] {
  return Array.from({ length: humanRacerCount }, (_, index) => ({
    peerId: `ai-collision-parity-human-${humanRacerCount}-${index + 1}`,
    displayName: `AI Collision Parity Human ${index + 1}`,
    slotIndex: index,
    isHost: index === 0
  }));
}

function getHumanRacerCount(scenario: KartPairScenarioKind): number {
  switch (scenario) {
    case "human-human":
      return 2;
    case "human-ai":
      return 1;
    case "ai-ai":
      return 0;
  }
}

function getActiveKartPair(
  session: RaceSession,
  scenario: KartPairScenarioKind
): {
  readonly left: RaceSessionRacerState;
  readonly right: RaceSessionRacerState;
} {
  switch (scenario) {
    case "human-human":
      return {
        left: requireValue(
          session.humanRacerStates[0],
          "human-human left racer"
        ),
        right: requireValue(
          session.humanRacerStates[1],
          "human-human right racer"
        )
      };
    case "human-ai":
      return {
        left: requireValue(session.humanRacerStates[0], "human-AI human racer"),
        right: requireValue(session.aiRacerStates[0], "human-AI AI racer")
      };
    case "ai-ai":
      return {
        left: requireValue(session.aiRacerStates[0], "AI-AI left racer"),
        right: requireValue(session.aiRacerStates[1], "AI-AI right racer")
      };
  }
}

function getActiveSingleRacer(
  session: RaceSession,
  scenario: SingleRacerScenarioKind
): RaceSessionRacerState {
  return scenario === "human"
    ? requireValue(session.humanRacerStates[0], "single human impact racer")
    : requireValue(session.aiRacerStates[0], "single AI impact racer");
}

function createValidationObstacle(): TrackObstacleCollider {
  const impactPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);

  return {
    id: "ai-collision-parity-obstacle",
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
    BOUNDARY_PENETRATION_DEPTH;
  const collisionPosition = {
    x: boundaryCollider.position.x + inwardNormal.x * centerSeparation,
    y: boundaryCollider.position.y,
    z: boundaryCollider.position.z + inwardNormal.z * centerSeparation
  };

  setMovingRacerPose(racer, collisionPosition, headingRadians, TRACK_IMPACT_SPEED);
}

function placeRacerInObstacleContact(
  racer: RaceSessionRacerState,
  obstacle: TrackObstacleCollider,
  collisionNormal: PlanarVector
): void {
  const headingRadians = headingFromPlanarDirection({
    x: -collisionNormal.x,
    z: -collisionNormal.z
  });
  const centerOffset =
    obstacle.radius +
    refreshRacerCollisionBounds(racer).halfLength -
    OBSTACLE_PENETRATION_DEPTH;
  const impactPosition = {
    x: obstacle.position.x + collisionNormal.x * centerOffset,
    y: obstacle.position.y,
    z: obstacle.position.z + collisionNormal.z * centerOffset
  };

  setMovingRacerPose(racer, impactPosition, headingRadians, TRACK_IMPACT_SPEED);
}

function detectBoundaryCollision(
  racer: RaceSessionRacerState
): KartTrackBoundaryCollisionResult {
  return detectKartBoundsTrackBoundaryContacts(
    refreshRacerCollisionBounds(racer),
    DEFAULT_TRACK_COLLISION_LAYER
  );
}

function parkNonTargetRacers(
  session: RaceSession,
  activeRacerIds: readonly string[]
): void {
  const activeIds = new Set(activeRacerIds);
  const parkingPointIndexes = [3, 5, 7] as const;
  let parkingSlot = 0;

  for (const racer of session.racerStates) {
    if (activeIds.has(racer.id)) {
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
  racer.forward = { x: forward.x, y: 0, z: forward.z };
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

function getRelativeNormalSpeed(
  left: RaceSessionRacerState,
  right: RaceSessionRacerState,
  normal: PlanarVector
): number {
  return (
    (left.velocity.x - right.velocity.x) * normal.x +
    (left.velocity.z - right.velocity.z) * normal.z
  );
}

function offsetPlanarPosition(
  position: Vector3,
  axis: PlanarVector,
  distance: number
): Vector3 {
  return {
    x: position.x + axis.x * distance,
    y: position.y,
    z: position.z + axis.z * distance
  };
}

function getPlanarDistance(
  left: Pick<Vector3, "x" | "z">,
  right: Pick<Vector3, "x" | "z">
): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
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

function normalizeOrientationRadians(orientationRadians: number): number {
  return Number.isFinite(orientationRadians)
    ? positiveModulo(orientationRadians, Math.PI * 2)
    : 0;
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

function assertAlmostEqual(
  actual: number,
  expected: number,
  label: string,
  tolerance = PARITY_TOLERANCE
): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `${label}: expected ${actual} to be within ${tolerance} of ${expected}.`
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
