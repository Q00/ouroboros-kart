import type { AiRacerProfileConfig, Vector3 } from "../config/aiRacers";
import {
  DEFAULT_TRACK_DEFINITION,
  type TrackRoadGeometry
} from "../config/tracks";
import { detectKartCollisionBoundsOverlap } from "../physics/kartCollisionBounds";
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

const SWEPT_CONTACT_TICK_SECONDS = 1 / 15;
const HIGH_SPEED_AI_PROFILES = [
  {
    id: "collision_sprint_left",
    displayName: "Collision Sprint Left",
    color: "#f45d48",
    visual: {
      accentColor: "#ffd166",
      racingNumber: 81,
      decal: "flame"
    },
    driving: {
      maxSpeed: 600,
      acceleration: 0,
      braking: 0,
      steeringResponsiveness: 0,
      traction: 1,
      recovery: 1,
      itemAggression: 0
    },
    behavior: {
      preferredLane: "inside",
      overtakeBias: 0,
      itemUseRange: 0
    }
  },
  {
    id: "collision_sprint_right",
    displayName: "Collision Sprint Right",
    color: "#3db7ff",
    visual: {
      accentColor: "#9fffe0",
      racingNumber: 82,
      decal: "bolt"
    },
    driving: {
      maxSpeed: 600,
      acceleration: 0,
      braking: 0,
      steeringResponsiveness: 0,
      traction: 1,
      recovery: 1,
      itemAggression: 0
    },
    behavior: {
      preferredLane: "outside",
      overtakeBias: 0,
      itemUseRange: 0
    }
  }
] as const satisfies readonly AiRacerProfileConfig[];

interface PlanarVector {
  readonly x: number;
  readonly z: number;
}

interface KartOverlapSeparationValidationResult {
  readonly pairChecks: number;
  readonly contacts: number;
  readonly initialDepth: number;
  readonly separationGain: number;
  readonly leftControlSeconds: number;
  readonly rightControlSeconds: number;
}

interface KartHeadOnResponseValidationResult {
  readonly contacts: number;
  readonly relativeNormalSpeedBefore: number;
  readonly relativeNormalSpeedAfter: number;
  readonly leftSpeedBefore: number;
  readonly leftSpeedAfter: number;
  readonly rightSpeedAfter: number;
  readonly overlapResolved: boolean;
}

interface KartSweptContactValidationResult {
  readonly contacts: number;
  readonly initialSeparation: number;
  readonly finalSeparation: number;
  readonly orderPreserved: boolean;
  readonly overlapResolved: boolean;
}

interface AiInvolvedImpactValidationResult {
  readonly humanAiContacts: number;
  readonly humanAiSeparationGain: number;
  readonly humanAiSpeedFactor: number;
  readonly aiAiContacts: number;
  readonly aiAiSeparationGain: number;
  readonly aiAiSpeedFactor: number;
}

function main(): void {
  const overlap = validateKartOverlapSeparation();
  const headOn = validateHeadOnKartResponse();
  const swept = validateSweptHighSpeedKartContact();
  const aiImpacts = validateAiInvolvedRacerContactResponses();

  console.info(
    [
      "kartToKartCollision=ok",
      `overlapDepth=${overlap.initialDepth.toFixed(3)}`,
      `overlapContacts=${overlap.contacts}`,
      `separationGain=${overlap.separationGain.toFixed(3)}`,
      `control=(${overlap.leftControlSeconds.toFixed(3)},${overlap.rightControlSeconds.toFixed(3)})`,
      `headOnContacts=${headOn.contacts}`,
      `relativeBefore=${headOn.relativeNormalSpeedBefore.toFixed(3)}`,
      `relativeAfter=${headOn.relativeNormalSpeedAfter.toFixed(3)}`,
      `headOnSpeeds=(${headOn.leftSpeedBefore.toFixed(3)},${headOn.leftSpeedAfter.toFixed(3)},${headOn.rightSpeedAfter.toFixed(3)})`,
      `sweptContacts=${swept.contacts}`,
      `sweptSeparation=(${swept.initialSeparation.toFixed(3)},${swept.finalSeparation.toFixed(3)})`,
      `sweptOrderPreserved=${swept.orderPreserved}`,
      `humanAiContacts=${aiImpacts.humanAiContacts}`,
      `humanAiGain=${aiImpacts.humanAiSeparationGain.toFixed(3)}`,
      `humanAiSpeedFactor=${aiImpacts.humanAiSpeedFactor.toFixed(3)}`,
      `aiAiContacts=${aiImpacts.aiAiContacts}`,
      `aiAiGain=${aiImpacts.aiAiSeparationGain.toFixed(3)}`,
      `aiAiSpeedFactor=${aiImpacts.aiAiSpeedFactor.toFixed(3)}`
    ].join(" ")
  );
}

function validateKartOverlapSeparation(): KartOverlapSeparationValidationResult {
  const session = createValidationSession(1);
  const left = requireValue(
    session.humanRacerStates[0],
    "overlap validation human racer"
  );
  const right = requireValue(
    session.aiRacerStates[0],
    "overlap validation AI racer"
  );
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const lateralAxis = rightFromHeading(headingRadians);

  parkNonTargetRacers(session, [left.id, right.id]);
  setMovingRacerPose(left, targetPoint.position, headingRadians, 0);
  setMovingRacerPose(
    right,
    offsetPlanarPosition(targetPoint.position, lateralAxis, 1.45),
    headingRadians,
    0
  );

  const initialOverlap = requireValue(
    detectKartCollisionBoundsOverlap(
      refreshRacerCollisionBounds(left),
      refreshRacerCollisionBounds(right)
    ),
    "initial kart-to-kart overlap"
  );
  const initialSeparation = getPlanarDistance(left.position, right.position);
  const tickResult = session.tick(0);
  const finalSeparation = getPlanarDistance(left.position, right.position);
  const finalOverlap = detectKartCollisionBoundsOverlap(
    refreshRacerCollisionBounds(left),
    refreshRacerCollisionBounds(right)
  );

  assertGreaterThan(
    tickResult.kartCollisionPairChecks,
    0,
    "overlap scenario pair checks"
  );
  assertGreaterThan(
    tickResult.kartCollisionContacts,
    0,
    "overlap scenario contact count"
  );
  assertEqual(finalOverlap, null, "overlap scenario clears kart overlap");
  assertGreaterThan(
    finalSeparation - initialSeparation,
    0,
    "overlap scenario increases racer separation"
  );
  assertGreaterThan(
    left.collisionControlSeconds,
    0,
    "left overlap racer collision-control timer"
  );
  assertGreaterThan(
    right.collisionControlSeconds,
    0,
    "right overlap racer collision-control timer"
  );

  return {
    pairChecks: tickResult.kartCollisionPairChecks,
    contacts: tickResult.kartCollisionContacts,
    initialDepth: initialOverlap.depth,
    separationGain: finalSeparation - initialSeparation,
    leftControlSeconds: left.collisionControlSeconds,
    rightControlSeconds: right.collisionControlSeconds
  };
}

function validateHeadOnKartResponse(): KartHeadOnResponseValidationResult {
  const session = createValidationSession(2);
  const left = requireValue(
    session.humanRacerStates[0],
    "head-on validation left racer"
  );
  const right = requireValue(
    session.humanRacerStates[1],
    "head-on validation right racer"
  );
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const forwardAxis = forwardFromHeading(headingRadians);
  const speedBefore = 24;

  parkNonTargetRacers(session, [left.id, right.id]);
  setMovingRacerPose(
    left,
    offsetPlanarPosition(targetPoint.position, forwardAxis, -0.72),
    headingRadians,
    speedBefore
  );
  setMovingRacerPose(
    right,
    offsetPlanarPosition(targetPoint.position, forwardAxis, 0.72),
    normalizeOrientationRadians(headingRadians + Math.PI),
    speedBefore
  );

  const initialOverlap = requireValue(
    detectKartCollisionBoundsOverlap(
      refreshRacerCollisionBounds(left),
      refreshRacerCollisionBounds(right)
    ),
    "head-on initial kart overlap"
  );
  const relativeNormalSpeedBefore = getRelativeNormalSpeed(
    left,
    right,
    initialOverlap.normal
  );

  assertLessThan(
    relativeNormalSpeedBefore,
    0,
    "head-on racers start moving into each other"
  );

  const tickResult = session.tick(0);
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
    "head-on scenario contact count"
  );
  assertEqual(overlapResolved, true, "head-on response clears kart overlap");
  assertGreaterThan(
    relativeNormalSpeedAfter,
    0,
    "head-on response creates separating normal velocity"
  );
  assertLessThan(
    left.speed,
    speedBefore,
    "head-on response damps left racer speed"
  );
  assertLessThan(
    right.speed,
    speedBefore,
    "head-on response damps right racer speed"
  );
  assertGreaterThan(
    left.collisionControlSeconds,
    0,
    "head-on left racer collision-control timer"
  );
  assertGreaterThan(
    right.collisionControlSeconds,
    0,
    "head-on right racer collision-control timer"
  );

  return {
    contacts: tickResult.kartCollisionContacts,
    relativeNormalSpeedBefore,
    relativeNormalSpeedAfter,
    leftSpeedBefore: speedBefore,
    leftSpeedAfter: left.speed,
    rightSpeedAfter: right.speed,
    overlapResolved
  };
}

function validateSweptHighSpeedKartContact(): KartSweptContactValidationResult {
  const session = createValidationSession(2, HIGH_SPEED_AI_PROFILES);
  const left = requireValue(
    session.aiRacerStates[0],
    "swept validation left AI racer"
  );
  const right = requireValue(
    session.aiRacerStates[1],
    "swept validation right AI racer"
  );
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const forwardAxis = forwardFromHeading(headingRadians);
  const initialHalfSeparation = 1.65;
  const speed = 48;

  parkNonTargetRacers(session, [left.id, right.id]);
  setMovingRacerPose(
    left,
    offsetPlanarPosition(
      targetPoint.position,
      forwardAxis,
      -initialHalfSeparation
    ),
    headingRadians,
    speed
  );
  setMovingRacerPose(
    right,
    offsetPlanarPosition(
      targetPoint.position,
      forwardAxis,
      initialHalfSeparation
    ),
    normalizeOrientationRadians(headingRadians + Math.PI),
    speed
  );

  const initialSeparation = getPlanarDistance(left.position, right.position);
  const initialOverlap = detectKartCollisionBoundsOverlap(
    refreshRacerCollisionBounds(left),
    refreshRacerCollisionBounds(right)
  );

  assertEqual(initialOverlap, null, "swept scenario starts without overlap");

  const tickResult = session.tick(SWEPT_CONTACT_TICK_SECONDS);
  const finalSeparation = getPlanarDistance(left.position, right.position);
  const leftProjection = getPlanarProjection(
    left.position,
    targetPoint.position,
    forwardAxis
  );
  const rightProjection = getPlanarProjection(
    right.position,
    targetPoint.position,
    forwardAxis
  );
  const overlapResolved =
    detectKartCollisionBoundsOverlap(
      refreshRacerCollisionBounds(left),
      refreshRacerCollisionBounds(right)
    ) === null;
  const orderPreserved = leftProjection < rightProjection;

  assertGreaterThan(
    tickResult.kartCollisionContacts,
    0,
    "swept scenario contact count"
  );
  assertEqual(overlapResolved, true, "swept response clears kart overlap");
  assertEqual(
    orderPreserved,
    true,
    "swept response prevents racers from tunneling through each other"
  );
  assertGreaterThan(
    finalSeparation,
    0,
    "swept response keeps racer centers separated"
  );

  return {
    contacts: tickResult.kartCollisionContacts,
    initialSeparation,
    finalSeparation,
    orderPreserved,
    overlapResolved
  };
}

function validateAiInvolvedRacerContactResponses(): AiInvolvedImpactValidationResult {
  const humanAi = validateAiInvolvedRacerContactResponse("human-ai");
  const aiAi = validateAiInvolvedRacerContactResponse("ai-ai");

  return {
    humanAiContacts: humanAi.contacts,
    humanAiSeparationGain: humanAi.separationGain,
    humanAiSpeedFactor: humanAi.speedFactor,
    aiAiContacts: aiAi.contacts,
    aiAiSeparationGain: aiAi.separationGain,
    aiAiSpeedFactor: aiAi.speedFactor
  };
}

function validateAiInvolvedRacerContactResponse(
  scenario: "human-ai" | "ai-ai"
): {
  readonly contacts: number;
  readonly separationGain: number;
  readonly speedFactor: number;
} {
  const session = createValidationSession(scenario === "human-ai" ? 1 : 0);
  const left =
    scenario === "human-ai"
      ? requireValue(
          session.humanRacerStates[0],
          "human-AI impact human racer"
        )
      : requireValue(
          session.aiRacerStates[0],
          "AI-AI impact left AI racer"
        );
  const right =
    scenario === "human-ai"
      ? requireValue(
          session.aiRacerStates[0],
          "human-AI impact AI racer"
        )
      : requireValue(
          session.aiRacerStates[1],
          "AI-AI impact right AI racer"
        );
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const forwardAxis = forwardFromHeading(headingRadians);
  const halfSeparation = 0.72;
  const speedBefore = 24;

  parkNonTargetRacers(session, [left.id, right.id]);
  setMovingRacerPose(
    left,
    offsetPlanarPosition(targetPoint.position, forwardAxis, -halfSeparation),
    headingRadians,
    speedBefore
  );
  setMovingRacerPose(
    right,
    offsetPlanarPosition(targetPoint.position, forwardAxis, halfSeparation),
    normalizeOrientationRadians(headingRadians + Math.PI),
    speedBefore
  );

  const initialSeparation = getPlanarDistance(left.position, right.position);
  const tickResult = session.tick(0);
  const finalSeparation = getPlanarDistance(left.position, right.position);
  const overlapResolved =
    detectKartCollisionBoundsOverlap(
      refreshRacerCollisionBounds(left),
      refreshRacerCollisionBounds(right)
    ) === null;

  assertGreaterThan(
    tickResult.kartCollisionContacts,
    0,
    `${scenario} impact contact count`
  );
  assertGreaterThan(
    finalSeparation - initialSeparation,
    0,
    `${scenario} impact position separation`
  );
  assertLessThan(
    left.speed,
    speedBefore,
    `${scenario} impact left speed damping`
  );
  assertLessThan(
    right.speed,
    speedBefore,
    `${scenario} impact right speed damping`
  );
  assertEqual(overlapResolved, true, `${scenario} impact overlap resolved`);

  return {
    contacts: tickResult.kartCollisionContacts,
    separationGain: finalSeparation - initialSeparation,
    speedFactor: (left.speed / speedBefore + right.speed / speedBefore) / 2
  };
}

function createValidationSession(
  humanRacerCount: number,
  aiProfiles?: readonly AiRacerProfileConfig[]
): RaceSession {
  return createRaceSessionFromStartRoster(
    createRaceStartRoster(
      createHumanRacerInputs(humanRacerCount),
      aiProfiles
    ),
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
}

function createHumanRacerInputs(
  humanRacerCount: number
): readonly HumanRaceStartRacerInput[] {
  return Array.from({ length: humanRacerCount }, (_, index) => ({
    peerId: `kart-collision-validation-human-${humanRacerCount}-${index + 1}`,
    displayName: `Kart Collision ${index + 1}`,
    slotIndex: index,
    isHost: index === 0
  }));
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

function getPlanarProjection(
  position: Vector3,
  origin: Vector3,
  axis: PlanarVector
): number {
  return (
    (position.x - origin.x) * axis.x +
    (position.z - origin.z) * axis.z
  );
}

function getPlanarDistance(
  left: Pick<Vector3, "x" | "z">,
  right: Pick<Vector3, "x" | "z">
): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function forwardFromHeading(headingRadians: number): PlanarVector {
  return {
    x: Math.sin(headingRadians),
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

function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${label}.`);
  }

  return value;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`
    );
  }
}

function assertGreaterThan(
  actual: number,
  expected: number,
  label: string
): void {
  if (actual <= expected) {
    throw new Error(`${label}: expected > ${expected}, got ${actual}`);
  }
}

function assertLessThan(
  actual: number,
  expected: number,
  label: string
): void {
  if (actual >= expected) {
    throw new Error(`${label}: expected < ${expected}, got ${actual}`);
  }
}

main();
