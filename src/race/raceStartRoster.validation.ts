import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { KeyboardKartInputState } from "../input/localKartInput";
import {
  STARTING_GRID_SPAWNS,
  getStartingGridSpawn,
  type SpawnPose,
  type Vector3
} from "../config/aiRacers";
import { AI_RACER_SLOT_COUNT, RACE_CAPACITY } from "../config/gameConfig";
import {
  BANANA_SPINOUT_FEEL_RANGE_RADIANS,
  BANANA_SPINOUT_FEEL_RANGE_SECONDS,
  DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING,
  DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING,
  SHELL_SPINOUT_FEEL_RANGE_RADIANS,
  SHELL_SPINOUT_FEEL_RANGE_SECONDS
} from "../config/gameplayTuning";
import { INITIAL_RACER_SLOTS } from "../config/racerSlots";
import {
  DEFAULT_TRACK_DEFINITION,
  assertTrackDefinitionIntegrity,
  isTrackPointDrivable,
  isTrackPointInsideCourseBoundary,
  queryTrackSurfaceAtPoint,
  type TrackRoadGeometry,
  type TrackSurfaceType,
  type TrackStartGridSlot
} from "../config/tracks";
import { createActiveCombatItemVisualState } from "../hud/combatItemHud";
import { createKartActiveItemSnapshotFromRaceState } from "../network/kartTransformSnapshot";
import {
  DEFAULT_BOUNDARY_COLLIDER_HEIGHT,
  DEFAULT_BOUNDARY_COLLIDER_THICKNESS,
  DEFAULT_TRACK_COLLISION_LAYER,
  DEFAULT_TRACK_OBSTACLE_COLLIDERS,
  createTrackCollisionLayer,
  detectKartBoundsTrackBoundaryContacts,
  type KartTrackBoundaryContact,
  type TrackBoundaryCollider,
  type TrackObstacleColliderKind
} from "../physics/trackColliders";
import { detectKartCollisionBoundsOverlap } from "../physics/kartCollisionBounds";
import {
  COMBAT_ITEM_TYPES,
  COMBAT_ITEM_REGISTRY,
  BANANA_DROP_DISTANCE_BEHIND_RACER,
  DEFAULT_RACE_ITEM_PICKUPS,
  DEFAULT_RACE_TRACK_OBSTACLES,
  DEFAULT_RACE_TRACK_STATE,
  MAX_ACTIVE_BANANA_HAZARDS,
  RACER_COLLISION_RADIUS,
  RACE_DURATION_TOLERANCE_SECONDS,
  RACE_TARGET_DURATION_SECONDS,
  createRaceSession,
  createRaceSessionFromStartRoster,
  debugResolveRacerControlInputs,
  refreshRacerCollisionBounds,
  SHELL_LAUNCH_CLEARANCE_METERS,
  type BananaObstacleState,
  type RaceBananaHitEvent,
  type RaceProgressSnapshot,
  type RaceRankingEntry,
  type RaceSession,
  type RaceSessionRacerControllerPath,
  type RaceSessionRacerState,
  type RaceShellHitEvent,
  type ShellProjectileState
} from "./raceSession";
import {
  createRaceParticipantStateIndex,
  createRacerProgressState,
  createRaceStateFromStartRoster,
  resetRaceStatePhase,
  type AiRacerInstance,
  type HumanRacerInstance,
  type RacerProgressState,
  type RacerProgressStateInput,
  type RaceParticipantState,
  type RaceState,
  type RegisteredRacer
} from "./raceState";
import {
  createMultiplayerRaceStartRoster,
  createRaceStartRoster,
  type HumanRaceStartRacerInput
} from "./raceStartRoster";
import { applyRacerSpinoutItemEffect } from "./racerItemEffects";

const HUMAN_RACER_COUNTS_TO_VALIDATE = [1, 2, 3, 4] as const;
const INVALID_RACE_STATE_RACER_COUNTS = [0, 1, 2, 3, 5] as const;
const DEFAULT_PROGRESS_STATE_TRACK = {
  lapCount: DEFAULT_RACE_TRACK_STATE.lapCount,
  totalLength: DEFAULT_RACE_TRACK_STATE.totalLength
} as const;
const HIGH_SPEED_AI_PROFILES = [
  {
    id: "ai_sprint_left",
    displayName: "Sprint Left",
    color: "#f45d48",
    visual: {
      accentColor: "#ffd166",
      racingNumber: 71,
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
    id: "ai_sprint_right",
    displayName: "Sprint Right",
    color: "#3db7ff",
    visual: {
      accentColor: "#9fffe0",
      racingNumber: 72,
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
] as const;

type HumanRacerCountScenario =
  (typeof HUMAN_RACER_COUNTS_TO_VALIDATE)[number];
type InvalidRaceStateRacerCountScenario =
  (typeof INVALID_RACE_STATE_RACER_COUNTS)[number];

export interface RaceStartRosterCapacityValidationResult {
  readonly humanRacerCount: HumanRacerCountScenario;
  readonly aiRacerCount: number;
  readonly rosterRacerCount: number;
  readonly raceStateRacerCount: number;
  readonly raceSessionRacerCount: number;
}

export interface MultiplayerAiSlotAssignmentValidationResult {
  readonly racerCount: number;
  readonly humanRacerCount: number;
  readonly aiRacerCount: number;
  readonly humanSlots: readonly number[];
  readonly aiSlots: readonly number[];
  readonly distinctAiSpawnCount: number;
  readonly aiPeerlessInputOwnerCount: number;
  readonly aiNeutralInputCount: number;
}

export interface AiRacerProgressionValidationResult {
  readonly humanCheckpointIndex: number;
  readonly aiCheckpointIndex: number;
  readonly aiProjectedCheckpointIndex: number;
  readonly aiProjectedTrackProgress: number;
  readonly aiRankBeforeFinish: number;
  readonly aiFinished: boolean;
  readonly aiLap: number;
  readonly aiFinishPlace: number;
  readonly aiRankAfterFinish: number;
  readonly aiProjectedFinishPlace: number;
}

export interface OrderedCheckpointProgressionValidationResult {
  readonly blockedCheckpointIndex: number;
  readonly firstCheckpointIndex: number;
  readonly blockedLap: number;
  readonly completedLap: number;
  readonly finalCheckpointIndex: number;
  readonly prematureFinishBlocked: boolean;
  readonly staleFinishShortcutBlocked: boolean;
}

export interface RaceProgressSurfaceValidationResult {
  readonly initialCompletionRatio: number;
  readonly finishedCompletionRatio: number;
  readonly completedDistance: number;
  readonly totalDistance: number;
  readonly finished: boolean;
  readonly tickSurfaceCount: number;
}

export interface TrackGeometryValidationResult {
  readonly centerlinePointCount: number;
  readonly segmentCount: number;
  readonly lapMarkerCount: number;
  readonly checkpointCount: number;
  readonly startFinishMarkerProgress: number;
  readonly firstProgressMarkerOrder: number;
  readonly finalMarkerNextOrder: number;
  readonly totalLength: number;
  readonly roadWidth: number;
  readonly courseHalfWidth: number;
  readonly leftCourseBoundaryPointCount: number;
  readonly rightCourseBoundaryPointCount: number;
  readonly offTrackRegionCount: number;
  readonly offTrackRegionIds: readonly string[];
  readonly surfaceSamples: readonly TrackSurfaceType[];
}

export interface TrackCollisionLayerValidationResult {
  readonly trackId: string;
  readonly boundaryColliderCount: number;
  readonly leftBoundaryColliderCount: number;
  readonly rightBoundaryColliderCount: number;
  readonly obstacleColliderCount: number;
  readonly obstacleIds: readonly string[];
  readonly minimumObstacleRacingLineClearance: number;
  readonly firstBoundaryLength: number;
  readonly firstBoundaryHalfThickness: number;
  readonly firstBoundaryHalfHeight: number;
  readonly firstBoundaryHeadingRadians: number;
}

export interface KartTrackBoundaryContactDetectionValidationResult {
  readonly contactCount: number;
  readonly contactColliderId: string;
  readonly contactSide: TrackBoundaryCollider["side"];
  readonly penetrationDepth: number;
  readonly correctionDepth: number;
  readonly speedFactor: number;
  readonly clearContactCount: number;
}

export interface StartGridAlignmentValidationResult {
  readonly slotCount: number;
  readonly humanRacerCount: number;
  readonly aiRacerCount: number;
  readonly raceSessionHumanRacerCount: number;
  readonly raceSessionAiRacerCount: number;
  readonly sessionSpawnedRacerCount: number;
  readonly bodyAlignedRacerCount: number;
  readonly headingRadians: number;
  readonly minForwardAlignment: number;
  readonly maxLateralOffset: number;
  readonly lastForwardOffset: number;
}

export interface RacerSlotTransformStateValidationResult {
  readonly slotCount: number;
  readonly spawnAlignedRacerCount: number;
  readonly stableSlotReferenceCount: number;
  readonly stableOrderAfterRanking: boolean;
  readonly stableOrderAfterTick: boolean;
  readonly stableArrayReferenceAfterTick: boolean;
  readonly preservedTransformCount: number;
  readonly updatedTransformCount: number;
}

export interface RacerSlotRaceStateValidationResult {
  readonly slotCount: number;
  readonly lapCount: number;
  readonly initialPhase: string;
  readonly participantCount: number;
  readonly localHumanParticipantCount: number;
  readonly remoteHumanParticipantCount: number;
  readonly aiParticipantCount: number;
  readonly readyParticipantCount: number;
  readonly racingParticipantCount: number;
  readonly finishedParticipantCount: number;
  readonly participantPositionUpdateCount: number;
  readonly participantRankUpdateCount: number;
  readonly resetReadyParticipantCount: number;
  readonly independentInitialProgressCount: number;
  readonly independentInitialPlacementCount: number;
  readonly uniqueInitialRankCount: number;
  readonly initialCurrentLapCount: number;
  readonly initialRaceProgressCount: number;
  readonly maintainedProgressSlotCount: number;
  readonly maintainedRankSlotCount: number;
  readonly raceProgressSnapshotCount: number;
  readonly uniqueSnapshotRankCount: number;
  readonly finishPlaceCount: number;
  readonly finishOrderSignature: string;
  readonly resetPhase: string;
  readonly resetInitialProgressCount: number;
  readonly resetFinishTimeCount: number;
}

export interface RaceDurationValidationResult {
  readonly targetSeconds: number;
  readonly toleranceSeconds: number;
  readonly finishTimeSeconds: number;
  readonly tickCount: number;
}

export interface BoostItemPickupValidationResult {
  readonly pickupId: string;
  readonly heldItem: string;
  readonly activeAfterCollection: boolean;
  readonly respawnSeconds: number;
  readonly respawnDeadlineElapsedSeconds: number;
}

export interface ShellItemPickupInventoryValidationResult {
  readonly pickupId: string;
  readonly heldItem: string;
  readonly collectionItemType: string;
  readonly respawnSeconds: number;
  readonly mirroredHeldItem: string;
  readonly blockedHeldItem: string;
  readonly blockedCollectionCount: number;
}

export interface ShellItemUseControlValidationResult {
  readonly racerId: string;
  readonly action: string;
  readonly heldItemAfterUse: string | null;
  readonly activeItemId: string;
  readonly activeItems: number;
  readonly ownerRacerId: string;
  readonly ownerSlotIndex: number;
  readonly projectileSpeed: number;
  readonly velocitySpeed: number;
  readonly spawnDistance: number;
  readonly renderInitialDistance: number;
  readonly renderLifetimeSeconds: number;
  readonly renderWorldVisible: boolean;
  readonly forwardAlignment: number;
  readonly renderDirectionAlignment: number;
  readonly staleForwardAlignment: number;
  readonly spawnLateralOffset: number;
  readonly tickIndex: number;
}

export interface ShellProjectileTickUpdateValidationResult {
  readonly activeItemId: string;
  readonly tickSeconds: number;
  readonly directionX: number;
  readonly directionZ: number;
  readonly speed: number;
  readonly distanceMoved: number;
  readonly expectedDistance: number;
  readonly velocitySpeedAfterTick: number;
}

export interface ShellProjectileInitialDirectionValidationResult {
  readonly activeItemId: string;
  readonly tickSeconds: number;
  readonly initialDirectionX: number;
  readonly initialDirectionZ: number;
  readonly ownerTurnDirectionX: number;
  readonly ownerTurnDirectionZ: number;
  readonly retainedDirectionX: number;
  readonly retainedDirectionZ: number;
  readonly travelAlignment: number;
  readonly ownerTurnAlignment: number;
  readonly distanceMoved: number;
  readonly expectedDistance: number;
}

export interface ShellProjectileLifetimeCleanupValidationResult {
  readonly activeItemId: string;
  readonly lifetimeSeconds: number;
  readonly initialTtlSeconds: number;
  readonly ttlAfterFirstTick: number;
  readonly ageAfterFirstTick: number;
  readonly expiryTickCount: number;
  readonly activeItemsAfterExpiry: number;
  readonly activeItemsAfterLeavingArea: number;
}

export interface ShellHitboxCollisionValidationResult {
  readonly eventId: string;
  readonly shellId: string;
  readonly sourceRacerId: string;
  readonly targetRacerId: string;
  readonly targetSlotIndex: number;
  readonly hitboxPenetrationDepth: number;
  readonly impactRelativeSpeed: number;
  readonly targetStunSeconds: number;
  readonly targetSpinoutSeconds: number;
  readonly targetSpinoutAngularVelocity: number;
  readonly configuredTargetSpinoutSeconds: number;
  readonly targetHitImmunitySeconds: number;
  readonly targetHitFeedbackSeconds: number;
  readonly targetSpeedAfterHit: number;
  readonly targetHeadingAfterSpinoutTick: number;
  readonly shellCountAfterHit: number;
  readonly immuneShellCountAfterOverlap: number;
  readonly immuneShellHitEventCount: number;
  readonly immunitySecondsAfterExpiry: number;
  readonly postSpinoutDuplicateShellHitEventCount: number;
  readonly postSpinoutDuplicateRemainingShellCount: number;
  readonly spinoutSecondsAfterPostSpinoutDuplicate: number;
  readonly speedAfterPostSpinoutDuplicate: number;
  readonly simultaneousShellHitEventCount: number;
  readonly simultaneousTargetSpeedAfterHit: number;
  readonly simultaneousRemainingShellCount: number;
  readonly pendingShellHitAccepted: boolean;
  readonly pendingDuplicateShellHitAccepted: boolean;
  readonly pendingDuplicateAfterHitAccepted: boolean;
  readonly pendingShellCountAfterApply: number;
  readonly pendingStunBeforeHitTime: number;
  readonly pendingStunAfterHitTime: number;
  readonly pendingSpeedAfterHitTime: number;
  readonly sweptShellHitEventCount: number;
  readonly sweptShellTargetRacerId: string;
  readonly sweptShellsAfterHit: number;
  readonly sweptImpactTravelDistance: number;
  readonly sweptFinalCenterDistance: number;
  readonly movingSweptShellHitEventCount: number;
  readonly movingSweptShellTargetRacerId: string;
  readonly movingSweptShellsAfterHit: number;
  readonly movingSweptImpactTravelDistance: number;
  readonly movingSweptFinalLateralSeparation: number;
  readonly alreadyHitTargetShellHitEventCount: number;
  readonly alreadyHitTargetRemainingShellCount: number;
  readonly expiredShellHitEventCount: number;
  readonly expiredShellRemainingCount: number;
  readonly missShellCount: number;
  readonly missEventCount: number;
}

export interface ShellObstacleCollisionValidationResult {
  readonly tireObstacleId: string;
  readonly tireObstacleKind: string;
  readonly tireShellCountAfterHit: number;
  readonly tireForwardDot: number;
  readonly tireSpeedAfterHit: number;
  readonly tireVelocityAfterHit: number;
  readonly tireArmedSecondsAfterHit: number;
  readonly tireShellCountAfterLinger: number;
  readonly destroyedObstacleId: string;
  readonly destroyedObstacleKind: string;
  readonly destroyedShellCount: number;
  readonly stoppedObstacleId: string;
  readonly stoppedObstacleKind: string;
  readonly stoppedShellCountAfterHit: number;
  readonly stoppedSpeedAfterHit: number;
  readonly stoppedVelocityAfterHit: number;
  readonly stoppedArmedSecondsAfterHit: number;
  readonly stoppedShellCountAfterLinger: number;
}

export interface BananaObstacleWorldStateValidationResult {
  readonly obstacleId: string;
  readonly stableObstacleId: string;
  readonly entityId: string;
  readonly entityType: string;
  readonly entityBodyType: string;
  readonly entityActive: boolean;
  readonly entityActiveStatus: string;
  readonly obstacleKind: string;
  readonly ownerRacerId: string;
  readonly ownerSlotIndex: number;
  readonly heldItemAfterUse: string | null;
  readonly positionBehindRacer: number;
  readonly expectedPositionBehindRacer: number;
  readonly lateralOffset: number;
  readonly orientationRadians: number;
  readonly obstacleCount: number;
  readonly entityCount: number;
  readonly activeEntityCount: number;
  readonly postLifetimeObstacleCount: number;
  readonly postLifetimeExpiredRemovalCount: number;
  readonly postLifetimeActiveEntityCount: number;
}

export interface BananaCleanupRulesValidationResult {
  readonly maxActiveBananaHazards: number;
  readonly hazardCapRemovalCount: number;
  readonly hazardCapRemovalReason: string;
  readonly hazardCapRemovedOldest: boolean;
  readonly hazardCapActiveBananaCount: number;
  readonly outOfBoundsRemovalCount: number;
  readonly outOfBoundsRemovalReason: string;
  readonly outOfBoundsActiveBananaCount: number;
  readonly outOfBoundsActiveEntityCount: number;
}

export interface BananaHazardCollisionValidationResult {
  readonly targetRacerId: string;
  readonly targetStunSeconds: number;
  readonly targetSpinoutSeconds: number;
  readonly targetSpinoutAngularVelocity: number;
  readonly targetSpeedAfterHit: number;
  readonly targetHeadingDelta: number;
  readonly bananaCountAfterHit: number;
  readonly bananaEntityCountAfterHit: number;
  readonly activeBananaEntityCountAfterHit: number;
  readonly hitBananaEntityActiveStatus: string;
  readonly hitBananaEntityDeactivationReason: string | null;
  readonly ownerStunSeconds: number;
  readonly bananaHitEventCount: number;
  readonly bananaHitSpinoutSeconds: number;
  readonly bananaHitFeedbackSeconds: number;
  readonly repeatBananaHitEventCount: number;
  readonly repeatBananaRemovalEventCount: number;
  readonly repeatBananaCountAfterHit: number;
  readonly repeatTargetSpinoutSeconds: number;
  readonly repeatTargetSpeed: number;
  readonly multiBananaHitEventCount: number;
  readonly multiBananaRemovalEventCount: number;
  readonly multiBananaRemainingCount: number;
  readonly ignoredSpinoutBananaHitEventCount: number;
  readonly ignoredSpinoutRemainingBananaCount: number;
  readonly missBananaCount: number;
  readonly missTargetStunSeconds: number;
  readonly unarmedBananaCount: number;
  readonly unarmedTargetStunSeconds: number;
  readonly sweptBananaHitEventCount: number;
  readonly sweptBananaCountAfterHit: number;
  readonly sweptTargetStunSeconds: number;
  readonly aiTargetBananaHitEventCount: number;
  readonly aiTargetStunSeconds: number;
  readonly remoteTargetBananaHitEventCount: number;
  readonly remoteTargetStunSeconds: number;
  readonly ownerTargetBananaHitEventCount: number;
  readonly ownerTargetStunSeconds: number;
  readonly ownerSelfHitMirrorAccepted: boolean;
  readonly ownerSelfHitMirrorStunSeconds: number;
}

interface BananaHazardContactScenarioValidationResult {
  readonly targetRacerId: string;
  readonly hitEvent: RaceBananaHitEvent;
  readonly hitEventCount: number;
  readonly targetStunSeconds: number;
  readonly activeBananaCountAfterHit: number;
}

export interface TimedSpinoutControlLossValidationResult {
  readonly baselineResolvedThrottle: number;
  readonly spinoutResolvedThrottle: number;
  readonly spinoutResolvedBrake: number;
  readonly spinoutResolvedCoastDecelerationMultiplier: number;
  readonly shortDurationResolvedThrottle: number;
  readonly shortDurationResolvedBrake: number;
  readonly shortDurationResolvedCoastDecelerationMultiplier: number;
  readonly longDurationResolvedThrottle: number;
  readonly longDurationResolvedBrake: number;
  readonly longDurationResolvedCoastDecelerationMultiplier: number;
  readonly weakStrengthResolvedThrottle: number;
  readonly weakStrengthResolvedBrake: number;
  readonly weakStrengthResolvedCoastDecelerationMultiplier: number;
  readonly strongStrengthResolvedThrottle: number;
  readonly strongStrengthResolvedBrake: number;
  readonly strongStrengthResolvedCoastDecelerationMultiplier: number;
  readonly baselineResolvedSteer: number;
  readonly spinoutResolvedSteer: number;
  readonly shortDurationResolvedSteer: number;
  readonly longDurationResolvedSteer: number;
  readonly baselineSpeedGain: number;
  readonly spinoutSpeedDelta: number;
  readonly baselineHeadingDelta: number;
  readonly spinoutHeadingDelta: number;
  readonly weakStrengthHeadingDelta: number;
  readonly strongStrengthHeadingDelta: number;
  readonly activeSpinoutSeconds: number;
  readonly recoveredSpinoutSeconds: number;
  readonly recoveringDuringSpinout: boolean;
  readonly recoveringAfterExpiry: boolean;
  readonly recoveredSpeedGain: number;
  readonly recoveredHeadingDelta: number;
}

export interface CollisionControlImpactValidationResult {
  readonly boundaryControlSeconds: number;
  readonly racerContactLeftControlSeconds: number;
  readonly racerContactRightControlSeconds: number;
  readonly baselineSpeedGain: number;
  readonly impactedSpeedGain: number;
  readonly recoveredSpeedGain: number;
  readonly baselineHeadingDelta: number;
  readonly impactedHeadingDelta: number;
  readonly recoveredHeadingDelta: number;
  readonly recoveredControlSeconds: number;
}

export interface BoostActivationValidationResult {
  readonly baselineSpeedAfterActivationTick: number;
  readonly boostedSpeedAfterActivationTick: number;
  readonly boostSecondsAfterActivation: number;
  readonly boostSecondsAfterExpiry: number;
  readonly activationTickIndex: number;
}

export interface ShellItemRegistryValidationResult {
  readonly id: string;
  readonly type: string;
  readonly displayName: string;
  readonly rarity: string;
  readonly behaviorType: string;
  readonly pickupWeight: number;
  readonly inventoryIcon: string;
  readonly inventoryIconKey: string;
  readonly inventoryIconRef: string;
  readonly inventoryKey: string;
  readonly respawnSeconds: number;
  readonly speed: number;
  readonly radius: number;
  readonly ttlSeconds: number;
  readonly armSeconds: number;
  readonly hitStunSeconds: number;
  readonly hitSpeedFactor: number;
  readonly spinoutSeconds: number;
  readonly spinoutRadians: number;
  readonly hitImmunitySeconds: number;
  readonly hitFeedbackSeconds: number;
}

export interface BananaItemRegistryValidationResult {
  readonly id: string;
  readonly type: string;
  readonly displayName: string;
  readonly rarity: string;
  readonly behaviorType: string;
  readonly pickupWeight: number;
  readonly inventoryIcon: string;
  readonly inventoryIconKey: string;
  readonly inventoryIconRef: string;
  readonly inventoryKey: string;
  readonly respawnSeconds: number;
}

export interface TrackBoundaryPhysicsValidationResult {
  readonly shoulderSurface: TrackSurfaceType;
  readonly roadSpeedAfterTick: number;
  readonly shoulderSpeedAfterTick: number;
  readonly correctedSurface: TrackSurfaceType;
  readonly boundarySpeedAfterClamp: number;
  readonly aiCorrectedSurface: TrackSurfaceType;
  readonly aiBoundarySpeedAfterClamp: number;
}

export interface KartCollisionBoundsValidationResult {
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly boundingRadius: number;
  readonly centerX: number;
  readonly centerZ: number;
  readonly headingRadians: number;
  readonly frontRightX: number;
  readonly frontRightZ: number;
}

export interface RaceLoopKartPairCollisionValidationResult {
  readonly expectedUniquePairsPerTick: number;
  readonly humanHumanPairChecks: number;
  readonly humanHumanContacts: number;
  readonly humanHumanSeparationGain: number;
  readonly humanAiPairChecks: number;
  readonly humanAiContacts: number;
  readonly humanAiSeparationGain: number;
  readonly humanAiSpeedFactor: number;
  readonly aiAiPairChecks: number;
  readonly aiAiContacts: number;
  readonly aiAiSeparationGain: number;
  readonly aiAiSpeedFactor: number;
  readonly boundaryPairContacts: number;
  readonly boundaryPairSeparationGain: number;
  readonly boundaryPairOverlapResolved: boolean;
  readonly boundaryPairLeftInsideCourse: boolean;
  readonly boundaryPairRightInsideCourse: boolean;
  readonly headOnContacts: number;
  readonly headOnOverlapResolved: boolean;
  readonly sideImpactContacts: number;
  readonly sideImpactOverlapResolved: boolean;
  readonly multiKartContacts: number;
  readonly multiKartOverlapsResolved: boolean;
  readonly highSpeedContacts: number;
  readonly highSpeedOverlapResolved: boolean;
  readonly highSpeedTunnelPrevented: boolean;
}

export interface CollisionVelocityDampingValidationResult {
  readonly boundaryLowSpeedFactor: number;
  readonly boundaryHighSpeedFactor: number;
  readonly obstacleHighSpeedFactor: number;
  readonly racerLowSpeedFactor: number;
  readonly racerHighSpeedFactor: number;
}

export interface CollisionDeflectionValidationResult {
  readonly boundaryReboundDot: number;
  readonly obstacleReboundDot: number;
  readonly racerLeftReboundDot: number;
  readonly racerRightReboundDot: number;
  readonly racerOverlapResolved: boolean;
}

export function validateRaceStartRosterCapacityScenarios(): readonly RaceStartRosterCapacityValidationResult[] {
  const results = HUMAN_RACER_COUNTS_TO_VALIDATE.map((humanRacerCount) => {
    const humanRacers = createHumanRacerInputs(humanRacerCount);
    const roster = createRaceStartRoster(humanRacers);
    const raceState = createRaceStateFromStartRoster(roster);
    const raceSession = createRaceSessionFromStartRoster(roster);
    const expectedAiRacerCount = RACE_CAPACITY - humanRacerCount;

    assertEqual(
      roster.racers.length,
      RACE_CAPACITY,
      `roster total racer count for ${humanRacerCount} human racer(s)`
    );
    assertEqual(
      roster.humanRacerCount,
      humanRacerCount,
      `roster human racer count for ${humanRacerCount} human racer(s)`
    );
    assertEqual(
      roster.aiRacerCount,
      expectedAiRacerCount,
      `roster AI racer count for ${humanRacerCount} human racer(s)`
    );
    assertEqual(
      raceState.racers.length,
      RACE_CAPACITY,
      `race-state total racer count for ${humanRacerCount} human racer(s)`
    );
    assertEqual(
      raceSession.racerStates.length,
      RACE_CAPACITY,
      `race-session total racer count for ${humanRacerCount} human racer(s)`
    );

    return {
      humanRacerCount,
      aiRacerCount: roster.aiRacerCount,
      rosterRacerCount: roster.racers.length,
      raceStateRacerCount: raceState.racers.length,
      raceSessionRacerCount: raceSession.racerStates.length
    };
  });

  validateInvalidRaceStateRacerCountRejections();
  validateStableRacerIdsAcrossRaceSetupLifecycle();
  return results;
}

function validateStableRacerIdsAcrossRaceSetupLifecycle(): void {
  const expectedRacerIds = INITIAL_RACER_SLOTS.map((slot) => slot.racerId);
  const initialSession = createRaceSession();
  const initializedSession = createLifecycleValidationRaceSession([
    {
      peerId: "initial-host-peer",
      displayName: "Initial Host",
      slotIndex: 0,
      isHost: true
    },
    {
      peerId: "initial-guest-peer",
      displayName: "Initial Guest",
      slotIndex: 1,
      isHost: false
    }
  ]);
  const resetSession = createLifecycleValidationRaceSession([
    {
      peerId: "initial-host-peer",
      displayName: "Initial Host",
      slotIndex: 0,
      isHost: true
    },
    {
      peerId: "initial-guest-peer",
      displayName: "Initial Guest",
      slotIndex: 1,
      isHost: false
    }
  ]);
  const restartedSession = createLifecycleValidationRaceSession([
    {
      peerId: "restart-host-peer",
      displayName: "Restart Host",
      slotIndex: 0,
      isHost: true
    },
    {
      peerId: "restart-guest-peer",
      displayName: "Restart Guest",
      slotIndex: 1,
      isHost: false
    }
  ]);

  assertStringArrayEqual(
    initialSession.racerStates.map((racer) => racer.id),
    expectedRacerIds,
    "initial setup racer ids"
  );
  assertStringArrayEqual(
    initializedSession.racerStates.map((racer) => racer.id),
    expectedRacerIds,
    "room initialization racer ids"
  );
  assertStringArrayEqual(
    resetSession.racerStates.map((racer) => racer.id),
    expectedRacerIds,
    "room reset racer ids"
  );
  assertStringArrayEqual(
    restartedSession.racerStates.map((racer) => racer.id),
    expectedRacerIds,
    "room restart racer ids"
  );
}

function createLifecycleValidationRaceSession(
  humanRacers: readonly HumanRaceStartRacerInput[]
): RaceSession {
  const roster = createMultiplayerRaceStartRoster(humanRacers);
  const raceState = createRaceStateFromStartRoster(roster);
  const raceSession = createRaceSessionFromStartRoster(roster);

  assertEqual(roster.racers.length, RACE_CAPACITY, "lifecycle roster slots");
  assertEqual(
    raceState.racers.length,
    RACE_CAPACITY,
    "lifecycle race-state racers"
  );
  assertEqual(
    raceSession.racerStates.length,
    RACE_CAPACITY,
    "lifecycle race-session racers"
  );

  return raceSession;
}

export function validateMultiplayerAiSlotAssignments(): MultiplayerAiSlotAssignmentValidationResult {
  const roster = createMultiplayerRaceStartRoster(createHumanRacerInputs(2));
  const raceState = createRaceStateFromStartRoster(roster);
  const raceSession = createRaceSessionFromStartRoster(roster, {
    obstacles: [],
    itemPickups: []
  });
  const aiSlots = raceSession.aiRacerStates.map((racer) => racer.slotIndex);
  const humanSlots = raceSession.humanRacerStates.map((racer) => racer.slotIndex);
  const aiSpawnKeys = new Set(
    raceSession.aiRacerStates.map((racer) =>
      [
        racer.position.x.toFixed(3),
        racer.position.y.toFixed(3),
        racer.position.z.toFixed(3)
      ].join(":")
    )
  );
  const aiPeerlessInputOwnerCount = raceSession.aiRacerStates.filter(
    (racer) => racer.controller === "ai" && racer.peerId === null
  ).length;
  const aiNeutralInputCount = raceSession.aiRacerStates.filter(
    (racer) =>
      racer.input.throttle === 0 &&
      racer.input.brake === 0 &&
      racer.input.steer === 0 &&
      !racer.input.drift &&
      !racer.input.useItem
  ).length;

  assertStringArrayEqual(
    humanSlots.map(String),
    ["0", "1"],
    "multiplayer human slots"
  );
  assertStringArrayEqual(
    aiSlots.map(String),
    ["2", "3"],
    "multiplayer AI slots"
  );
  assertEqual(
    roster.aiRacerCount,
    2,
    "multiplayer roster fills exactly two AI racers"
  );
  assertEqual(
    raceState.aiRacers.length,
    2,
    "multiplayer race state owns exactly two AI racers"
  );
  assertEqual(
    raceSession.aiRacerStates.length,
    2,
    "multiplayer race session owns exactly two AI racers"
  );
  assertEqual(
    aiSpawnKeys.size,
    2,
    "multiplayer AI racers start at distinct grid positions"
  );
  assertEqual(
    aiPeerlessInputOwnerCount,
    2,
    "multiplayer AI racers have no peer owner"
  );
  assertEqual(
    aiNeutralInputCount,
    2,
    "multiplayer AI racers start from neutral input state"
  );
  assertThrows(
    () => createMultiplayerRaceStartRoster(createHumanRacerInputs(1)),
    "exactly 2 human racers",
    "strict multiplayer rejects missing guest human slot"
  );
  assertThrows(
    () =>
      createMultiplayerRaceStartRoster([
        {
          peerId: "invalid-host",
          displayName: "Invalid Host",
          slotIndex: 0,
          isHost: true
        },
        {
          peerId: "invalid-ai-slot-human",
          displayName: "Invalid AI Slot Human",
          slotIndex: 2,
          isHost: false
        }
      ]),
    "AI-owned slot",
    "strict multiplayer rejects human assignment into AI slot"
  );

  return {
    racerCount: raceSession.racerStates.length,
    humanRacerCount: raceSession.humanRacerStates.length,
    aiRacerCount: raceSession.aiRacerStates.length,
    humanSlots,
    aiSlots,
    distinctAiSpawnCount: aiSpawnKeys.size,
    aiPeerlessInputOwnerCount,
    aiNeutralInputCount
  };
}

function createValidationProgressState(
  input: RacerProgressStateInput,
  track: Pick<typeof DEFAULT_PROGRESS_STATE_TRACK, "lapCount" | "totalLength"> =
    DEFAULT_PROGRESS_STATE_TRACK
): RacerProgressState {
  return createRacerProgressState(input, {
    lapCount: track.lapCount,
    trackLength: track.totalLength
  });
}

function getExpectedValidationRaceProgress(
  lap: number,
  trackProgress: number,
  track: Pick<typeof DEFAULT_PROGRESS_STATE_TRACK, "lapCount" | "totalLength"> =
    DEFAULT_PROGRESS_STATE_TRACK
): number {
  return (
    (lap * track.totalLength + trackProgress) /
    (track.lapCount * track.totalLength)
  );
}

function createFinishedRaceStateForResetValidation(state: RaceState): RaceState {
  const racers = state.racers.map((racer) => ({
    ...racer,
    progress: createValidationProgressState({
      lap: state.lapCount,
      checkpointIndex: 0,
      trackProgress: 0,
      finished: true
    }),
    placement: {
      rank: racer.placement.rank,
      finishPlace: racer.slotIndex + 1,
      finishTimeSeconds: 90 + racer.slotIndex
    }
  })) as RegisteredRacer[];
  const participantIndex = createRaceParticipantStateIndex(racers, {
    phase: "finished"
  });

  return {
    ...state,
    phase: "finished",
    racers,
    humanRacers: racers.filter(isHumanRacerInstance),
    aiRacers: racers.filter(isAiRacerInstance),
    racersById: createRacersByIdRecord(racers),
    racersBySlot: createRacersBySlotRecord(racers),
    ...participantIndex
  };
}

function isHumanRacerInstance(
  racer: RegisteredRacer
): racer is HumanRacerInstance {
  return racer.controller === "human";
}

function isAiRacerInstance(racer: RegisteredRacer): racer is AiRacerInstance {
  return racer.controller === "ai";
}

function createRacersByIdRecord(
  racers: readonly RegisteredRacer[]
): Record<string, RegisteredRacer> {
  const racersById: Record<string, RegisteredRacer> = {};

  for (const racer of racers) {
    racersById[racer.id] = racer;
  }

  return racersById;
}

function createRacersBySlotRecord(
  racers: readonly RegisteredRacer[]
): Record<number, RegisteredRacer> {
  const racersBySlot: Record<number, RegisteredRacer> = {};

  for (const racer of racers) {
    racersBySlot[racer.slotIndex] = racer;
  }

  return racersBySlot;
}

export function validateDefaultTrackGeometry(): TrackGeometryValidationResult {
  assertTrackDefinitionIntegrity(DEFAULT_TRACK_DEFINITION);
  const lapMarkerSummary = validateDefaultTrackLapMarkers();
  const surfaceSamples = validateDefaultTrackSurfaceQueries(
    DEFAULT_TRACK_DEFINITION.road
  );

  assertEqual(
    DEFAULT_RACE_TRACK_STATE.totalLength,
    DEFAULT_TRACK_DEFINITION.road.totalLength,
    "race-session track length from road geometry"
  );
  assertEqual(
    DEFAULT_RACE_TRACK_STATE.width,
    DEFAULT_TRACK_DEFINITION.road.roadWidth,
    "race-session track width from road geometry"
  );
  assertEqual(
    DEFAULT_RACE_TRACK_STATE.waypoints?.length ?? 0,
    DEFAULT_TRACK_DEFINITION.road.centerline.length,
    "race-session waypoint count from road geometry"
  );

  return {
    centerlinePointCount: DEFAULT_TRACK_DEFINITION.road.centerline.length,
    segmentCount: DEFAULT_TRACK_DEFINITION.road.segments.length,
    lapMarkerCount: DEFAULT_TRACK_DEFINITION.lapMarkers.length,
    checkpointCount: DEFAULT_TRACK_DEFINITION.checkpoints.length,
    startFinishMarkerProgress: lapMarkerSummary.startFinishMarkerProgress,
    firstProgressMarkerOrder: lapMarkerSummary.firstProgressMarkerOrder,
    finalMarkerNextOrder: lapMarkerSummary.finalMarkerNextOrder,
    totalLength: DEFAULT_TRACK_DEFINITION.road.totalLength,
    roadWidth: DEFAULT_TRACK_DEFINITION.road.roadWidth,
    courseHalfWidth: DEFAULT_TRACK_DEFINITION.road.courseBoundary.courseHalfWidth,
    leftCourseBoundaryPointCount:
      DEFAULT_TRACK_DEFINITION.road.courseBoundary.leftCourseBoundary.length,
    rightCourseBoundaryPointCount:
      DEFAULT_TRACK_DEFINITION.road.courseBoundary.rightCourseBoundary.length,
    offTrackRegionCount:
      DEFAULT_TRACK_DEFINITION.road.courseBoundary.offTrackRegions.length,
    offTrackRegionIds:
      DEFAULT_TRACK_DEFINITION.road.courseBoundary.offTrackRegions.map(
        (region) => region.id
      ),
    surfaceSamples
  };
}

export function validateDefaultTrackCollisionLayer(): TrackCollisionLayerValidationResult {
  const road = DEFAULT_TRACK_DEFINITION.road;
  const collisionLayer = DEFAULT_TRACK_COLLISION_LAYER;
  const rebuiltCollisionLayer = createTrackCollisionLayer(road, {
    trackId: DEFAULT_TRACK_DEFINITION.id,
    obstacleColliders: DEFAULT_TRACK_OBSTACLE_COLLIDERS
  });
  const leftBoundaryColliders = collisionLayer.boundaryColliders.filter(
    (collider) => collider.side === "left"
  );
  const rightBoundaryColliders = collisionLayer.boundaryColliders.filter(
    (collider) => collider.side === "right"
  );
  const expectedBoundaryColliderCount =
    road.courseBoundary.leftCourseBoundary.length +
    road.courseBoundary.rightCourseBoundary.length;
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(4))
  );
  let minimumObstacleRacingLineClearance = Number.POSITIVE_INFINITY;

  assertStringEqual(
    collisionLayer.trackId,
    DEFAULT_TRACK_DEFINITION.id,
    "track collision layer id"
  );
  assertEqual(
    collisionLayer.boundaryColliders.length,
    expectedBoundaryColliderCount,
    "track boundary collider count"
  );
  assertEqual(
    rebuiltCollisionLayer.boundaryColliders.length,
    collisionLayer.boundaryColliders.length,
    "rebuilt collision layer boundary collider count"
  );
  assertEqual(
    leftBoundaryColliders.length,
    road.courseBoundary.leftCourseBoundary.length,
    "left boundary collider count"
  );
  assertEqual(
    rightBoundaryColliders.length,
    road.courseBoundary.rightCourseBoundary.length,
    "right boundary collider count"
  );
  assertEqual(
    collisionLayer.obstacleColliders.length,
    DEFAULT_TRACK_OBSTACLE_COLLIDERS.length,
    "static obstacle collider count"
  );
  assertEqual(
    DEFAULT_RACE_TRACK_OBSTACLES.length,
    collisionLayer.obstacleColliders.length,
    "race-session default obstacle source count"
  );
  assertEqual(
    raceSession.trackCollisionLayer.boundaryColliders.length,
    collisionLayer.boundaryColliders.length,
    "race-session collision-layer boundary count"
  );
  assertEqual(
    raceSession.trackObstacles.length,
    collisionLayer.obstacleColliders.length,
    "race-session default track obstacle count"
  );

  const firstBoundary = requireBoundaryCollider(
    leftBoundaryColliders[0],
    "first left boundary collider"
  );
  const firstBoundaryStart = requireVector(
    road.courseBoundary.leftCourseBoundary[0],
    "first left course boundary point"
  );
  const firstBoundaryEnd = requireVector(
    road.courseBoundary.leftCourseBoundary[1],
    "second left course boundary point"
  );
  const firstBoundaryLength = getPlanarDistance(
    firstBoundaryStart,
    firstBoundaryEnd
  );
  const firstBoundaryHeading = Math.atan2(
    firstBoundaryEnd.x - firstBoundaryStart.x,
    firstBoundaryEnd.z - firstBoundaryStart.z
  );

  assertStringEqual(
    firstBoundary.colliderType,
    "boundary",
    "first boundary collider type"
  );
  assertStringEqual(
    firstBoundary.bodyType,
    "static",
    "first boundary collider body type"
  );
  assertStringEqual(
    firstBoundary.shape,
    "box",
    "first boundary collider shape"
  );
  assertEqual(firstBoundary.segmentIndex, 0, "first boundary segment index");
  assertAlmostEqual(
    firstBoundary.position.x,
    (firstBoundaryStart.x + firstBoundaryEnd.x) / 2,
    "first boundary collider center x"
  );
  assertAlmostEqual(
    firstBoundary.position.z,
    (firstBoundaryStart.z + firstBoundaryEnd.z) / 2,
    "first boundary collider center z"
  );
  assertAlmostEqual(
    firstBoundary.length,
    firstBoundaryLength,
    "first boundary collider length"
  );
  assertAlmostEqual(
    firstBoundary.halfExtents.x,
    DEFAULT_BOUNDARY_COLLIDER_THICKNESS / 2,
    "first boundary collider half thickness"
  );
  assertAlmostEqual(
    firstBoundary.halfExtents.y,
    DEFAULT_BOUNDARY_COLLIDER_HEIGHT / 2,
    "first boundary collider half height"
  );
  assertAlmostEqual(
    firstBoundary.halfExtents.z,
    firstBoundaryLength / 2,
    "first boundary collider half length"
  );
  assertAlmostEqual(
    firstBoundary.headingRadians,
    firstBoundaryHeading,
    "first boundary collider heading"
  );

  for (const obstacle of collisionLayer.obstacleColliders) {
    const obstacleSurface = queryTrackSurfaceAtPoint(road, obstacle.position);
    const racingLineClearance =
      obstacleSurface.distanceFromCenterline -
      obstacle.radius -
      RACER_COLLISION_RADIUS;

    assertStringEqual(
      obstacle.colliderType,
      "obstacle",
      `obstacle ${obstacle.id} collider type`
    );
    assertStringEqual(
      obstacle.bodyType,
      "static",
      `obstacle ${obstacle.id} body type`
    );
    assertStringEqual(
      obstacle.shape,
      "cylinder",
      `obstacle ${obstacle.id} collider shape`
    );
    assertGreaterThan(obstacle.radius, 0, `obstacle ${obstacle.id} radius`);
    assertGreaterThan(
      obstacle.halfHeight,
      0,
      `obstacle ${obstacle.id} half height`
    );
    assertBetween(
      obstacle.impactSpeedFactor,
      0,
      1,
      `obstacle ${obstacle.id} impact speed factor`
    );
    assertEqual(
      Number(isTrackPointInsideCourseBoundary(road, obstacle.position)),
      1,
      `obstacle ${obstacle.id} track placement`
    );
    assertGreaterThan(
      racingLineClearance,
      0.75,
      `obstacle ${obstacle.id} racing-line clearance`
    );

    minimumObstacleRacingLineClearance = Math.min(
      minimumObstacleRacingLineClearance,
      racingLineClearance
    );
  }

  return {
    trackId: collisionLayer.trackId,
    boundaryColliderCount: collisionLayer.boundaryColliders.length,
    leftBoundaryColliderCount: leftBoundaryColliders.length,
    rightBoundaryColliderCount: rightBoundaryColliders.length,
    obstacleColliderCount: collisionLayer.obstacleColliders.length,
    obstacleIds: collisionLayer.obstacleColliders.map((obstacle) => obstacle.id),
    minimumObstacleRacingLineClearance,
    firstBoundaryLength: firstBoundary.length,
    firstBoundaryHalfThickness: firstBoundary.halfExtents.x,
    firstBoundaryHalfHeight: firstBoundary.halfExtents.y,
    firstBoundaryHeadingRadians: firstBoundary.headingRadians
  };
}

export function validateKartTrackBoundaryContactDetection(): KartTrackBoundaryContactDetectionValidationResult {
  const collisionLayer = DEFAULT_TRACK_COLLISION_LAYER;
  const boundaryCollider = requireBoundaryCollider(
    collisionLayer.boundaryColliders.find(
      (collider) => collider.side === "left" && collider.segmentIndex === 0
    ),
    "first left boundary contact collider"
  );
  const session = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(4)),
    { obstacles: [], itemPickups: [] }
  );
  const racer = requireRacerState(
    session.humanRacerStates[0],
    "boundary contact detection racer"
  );
  const inwardNormal = getBoundaryColliderInwardNormal(boundaryCollider);
  const targetPenetrationDepth = 0.35;

  racer.headingRadians = boundaryCollider.headingRadians;
  refreshRacerCollisionBounds(racer);

  const contactSeparation =
    boundaryCollider.halfExtents.x +
    racer.collisionBounds.halfWidth -
    targetPenetrationDepth;

  racer.position = {
    x: boundaryCollider.position.x + inwardNormal.x * contactSeparation,
    y: racer.position.y,
    z: boundaryCollider.position.z + inwardNormal.z * contactSeparation
  };

  const contactBounds = refreshRacerCollisionBounds(racer);
  const contactResult = detectKartBoundsTrackBoundaryContacts(
    contactBounds,
    collisionLayer
  );
  const contact = requireBoundaryContact(
    contactResult.contacts.find(
      (candidate) => candidate.colliderId === boundaryCollider.id
    ),
    "primary kart boundary contact"
  );
  const correctionDepth =
    contactResult.correction.x * inwardNormal.x +
    contactResult.correction.z * inwardNormal.z;
  const correctedSeparation =
    (contactResult.correctedCenter.x - boundaryCollider.position.x) *
      inwardNormal.x +
    (contactResult.correctedCenter.z - boundaryCollider.position.z) *
      inwardNormal.z;

  assertEqual(
    Number(contactResult.hasCollision),
    1,
    "kart boundary contact detection state"
  );
  assertGreaterThan(
    contactResult.contacts.length,
    0,
    "kart boundary contact count"
  );
  assertStringEqual(
    contact.colliderId,
    boundaryCollider.id,
    "kart boundary contact collider id"
  );
  assertStringEqual(
    contact.colliderSide,
    boundaryCollider.side,
    "kart boundary contact side"
  );
  assertEqual(
    contact.segmentIndex,
    boundaryCollider.segmentIndex,
    "kart boundary contact segment"
  );
  assertAlmostEqual(
    contact.normal.x,
    inwardNormal.x,
    "kart boundary contact normal x"
  );
  assertAlmostEqual(
    contact.normal.z,
    inwardNormal.z,
    "kart boundary contact normal z"
  );
  assertAlmostEqual(
    contact.penetrationDepth,
    targetPenetrationDepth,
    "kart boundary contact penetration"
  );
  assertAlmostEqual(
    correctionDepth,
    targetPenetrationDepth,
    "kart boundary contact correction depth"
  );
  assertAlmostEqual(
    correctedSeparation,
    boundaryCollider.halfExtents.x + contactBounds.halfWidth,
    "kart boundary corrected separation"
  );
  assertAlmostEqual(
    contactResult.speedFactor,
    boundaryCollider.impactSpeedFactor,
    "kart boundary contact speed factor"
  );
  assertAlmostEqual(
    contactResult.maxPenetrationDepth,
    targetPenetrationDepth,
    "kart boundary max penetration"
  );

  const clearSeparation =
    boundaryCollider.halfExtents.x + contactBounds.halfWidth + 0.5;

  racer.position = {
    x: boundaryCollider.position.x + inwardNormal.x * clearSeparation,
    y: racer.position.y,
    z: boundaryCollider.position.z + inwardNormal.z * clearSeparation
  };

  const clearResult = detectKartBoundsTrackBoundaryContacts(
    refreshRacerCollisionBounds(racer),
    collisionLayer
  );

  assertEqual(
    Number(clearResult.hasCollision),
    0,
    "clear kart boundary contact detection state"
  );
  assertEqual(
    clearResult.contacts.length,
    0,
    "clear kart boundary contact count"
  );
  assertAlmostEqual(
    clearResult.speedFactor,
    1,
    "clear kart boundary contact speed factor"
  );

  return {
    contactCount: contactResult.contacts.length,
    contactColliderId: contact.colliderId,
    contactSide: contact.colliderSide,
    penetrationDepth: contact.penetrationDepth,
    correctionDepth,
    speedFactor: contactResult.speedFactor,
    clearContactCount: clearResult.contacts.length
  };
}

function validateDefaultTrackLapMarkers(): {
  readonly startFinishMarkerProgress: number;
  readonly firstProgressMarkerOrder: number;
  readonly finalMarkerNextOrder: number;
} {
  const markers = DEFAULT_TRACK_DEFINITION.lapMarkers;
  const startFinishMarker = requireTrackLapMarker(0);
  const firstProgressMarker = requireTrackLapMarker(1);
  const finalMarker = requireTrackLapMarker(markers.length - 1);

  assertEqual(
    markers.length,
    DEFAULT_TRACK_DEFINITION.road.centerline.length,
    "lap marker count from road centerline"
  );
  assertStringEqual(
    startFinishMarker.kind,
    "startFinish",
    "first lap marker kind"
  );
  assertEqual(startFinishMarker.order, 0, "start/finish lap marker order");
  assertStringEqual(
    startFinishMarker.sequenceId,
    "start-finish",
    "start/finish lap marker sequence id"
  );
  assertAlmostEqual(
    startFinishMarker.trackProgress,
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.trackProgress,
    "start/finish lap marker progress"
  );
  assertAlmostEqual(
    startFinishMarker.headingRadians,
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians,
    "start/finish lap marker heading"
  );
  assertStringEqual(
    firstProgressMarker.kind,
    "progress",
    "first intermediate lap marker kind"
  );
  assertEqual(firstProgressMarker.order, 1, "first progress lap marker order");
  assertStringEqual(
    firstProgressMarker.sequenceId,
    "checkpoint-01",
    "first progress lap marker sequence id"
  );
  assertStringEqual(
    startFinishMarker.triggerZone.checkpointSequenceId,
    startFinishMarker.sequenceId,
    "start/finish marker trigger zone sequence id"
  );
  assertEqual(
    startFinishMarker.triggerZone.checkpointOrder,
    startFinishMarker.order,
    "start/finish marker trigger zone order"
  );
  assertStringEqual(
    firstProgressMarker.triggerZone.checkpointSequenceId,
    firstProgressMarker.sequenceId,
    "first progress marker trigger zone sequence id"
  );
  assertEqual(finalMarker.nextMarkerOrder, 0, "final lap marker loops to start");

  let previousProgress = startFinishMarker.trackProgress;

  for (let index = 1; index < markers.length; index += 1) {
    const marker = requireTrackLapMarker(index);

    assertGreaterThan(
      marker.trackProgress,
      previousProgress,
      `lap marker ${marker.id} progress order`
    );
    assertEqual(
      marker.nextMarkerOrder,
      (index + 1) % markers.length,
      `lap marker ${marker.id} next order`
    );

    previousProgress = marker.trackProgress;
  }

  return {
    startFinishMarkerProgress: startFinishMarker.trackProgress,
    firstProgressMarkerOrder: firstProgressMarker.order,
    finalMarkerNextOrder: finalMarker.nextMarkerOrder
  };
}

function validateDefaultTrackSurfaceQueries(
  road: TrackRoadGeometry
): readonly TrackSurfaceType[] {
  const centerPoint = requireTrackCenterPoint(road, 0);
  const shoulderPoint = requireTrackSurfaceSamplePoint(road, "shoulder", 0);
  const offTrackPoint = requireTrackSurfaceSamplePoint(road, "offTrack", 0);
  const roadQuery = queryTrackSurfaceAtPoint(road, centerPoint.position);
  const shoulderQuery = queryTrackSurfaceAtPoint(road, shoulderPoint);
  const offTrackQuery = queryTrackSurfaceAtPoint(road, offTrackPoint);
  const offTrackRegionIds = road.courseBoundary.offTrackRegions.map(
    (region) => region.id
  );

  assertStringEqual(roadQuery.surface, "road", "centerline surface query");
  assertEqual(Number(roadQuery.drivable), 1, "centerline drivable query");
  assertEqual(
    Number(roadQuery.offTrackRegionId === null),
    1,
    "centerline off-track region query"
  );
  assertAlmostEqual(
    roadQuery.distanceFromCenterline,
    0,
    "centerline query distance"
  );
  assertStringEqual(
    shoulderQuery.surface,
    "shoulder",
    "shoulder surface query"
  );
  assertEqual(Number(shoulderQuery.drivable), 0, "shoulder drivable query");
  assertEqual(
    Number(shoulderQuery.offTrackRegionId === null),
    1,
    "shoulder off-track region query"
  );
  assertEqual(
    Number(isTrackPointDrivable(road, shoulderPoint)),
    0,
    "shoulder drivable helper"
  );
  assertEqual(
    Number(isTrackPointInsideCourseBoundary(road, shoulderPoint)),
    1,
    "shoulder course-boundary helper"
  );
  assertStringEqual(
    offTrackQuery.surface,
    "offTrack",
    "off-track surface query"
  );
  assertEqual(Number(offTrackQuery.drivable), 0, "off-track drivable query");
  assertEqual(
    road.courseBoundary.offTrackRegions.length,
    2,
    "off-track region count"
  );
  assertEqual(
    Number(
      offTrackQuery.offTrackRegionId !== null &&
        offTrackRegionIds.includes(offTrackQuery.offTrackRegionId)
    ),
    1,
    "off-track region query id"
  );
  assertEqual(
    Number(isTrackPointInsideCourseBoundary(road, offTrackPoint)),
    0,
    "off-track course-boundary helper"
  );

  return [roadQuery.surface, shoulderQuery.surface, offTrackQuery.surface];
}

export function validateStartingGridAlignment(): StartGridAlignmentValidationResult {
  assertTrackDefinitionIntegrity(DEFAULT_TRACK_DEFINITION);
  assertEqual(
    DEFAULT_TRACK_DEFINITION.startGrid.length,
    RACE_CAPACITY,
    "track start grid slot count"
  );
  assertEqual(
    STARTING_GRID_SPAWNS.length,
    RACE_CAPACITY,
    "racer spawn table slot count"
  );

  const startLine = DEFAULT_TRACK_DEFINITION.road.startFinishLine;
  const firstSegment = DEFAULT_TRACK_DEFINITION.road.segments[0];

  if (firstSegment === undefined) {
    throw new Error("Expected default track to include a start straight segment.");
  }

  const forward = forwardFromHeading(startLine.headingRadians);
  const right = rightFromHeading(startLine.headingRadians);
  const positionKeys = new Set<string>();
  let maxLateralOffset = 0;
  let lastForwardOffset = 0;

  for (let slotIndex = 0; slotIndex < RACE_CAPACITY; slotIndex += 1) {
    const gridSlot = requireStartGridSlot(slotIndex);
    const spawn = getStartingGridSpawn(slotIndex);
    const exportedSpawn = STARTING_GRID_SPAWNS[slotIndex];

    if (exportedSpawn === undefined) {
      throw new Error(`Missing exported racer spawn for grid slot ${slotIndex}.`);
    }

    assertPoseMatchesStartGridSlot(
      spawn,
      gridSlot,
      `resolved racer spawn ${slotIndex}`
    );
    assertPoseMatchesStartGridSlot(
      exportedSpawn,
      gridSlot,
      `exported racer spawn ${slotIndex}`
    );

    const projected = projectPositionOnStartLine(
      gridSlot.position,
      startLine.center,
      forward,
      right
    );

    assertAlmostEqual(
      projected.forwardOffset,
      gridSlot.forwardOffset,
      `grid slot ${slotIndex} forward projection`
    );
    assertAlmostEqual(
      projected.lateralOffset,
      gridSlot.lateralOffset,
      `grid slot ${slotIndex} lateral projection`
    );
    assertBetween(
      projected.forwardOffset,
      0,
      firstSegment.length,
      `grid slot ${slotIndex} start-straight position`
    );
    assertBetween(
      Math.abs(projected.lateralOffset),
      0,
      DEFAULT_TRACK_DEFINITION.road.roadWidth / 2,
      `grid slot ${slotIndex} road-width position`
    );
    assertAlmostEqual(
      gridSlot.headingRadians,
      startLine.headingRadians,
      `grid slot ${slotIndex} heading`
    );

    const positionKey = [
      gridSlot.position.x.toFixed(3),
      gridSlot.position.y.toFixed(3),
      gridSlot.position.z.toFixed(3)
    ].join(":");

    if (positionKeys.has(positionKey)) {
      throw new Error(`Duplicate start grid position ${positionKey}.`);
    }

    positionKeys.add(positionKey);
    maxLateralOffset = Math.max(
      maxLateralOffset,
      Math.abs(projected.lateralOffset)
    );
    lastForwardOffset = Math.max(lastForwardOffset, projected.forwardOffset);
  }

  const twoPlayerRoster = createRaceStartRoster(createHumanRacerInputs(2));
  const raceState = createRaceStateFromStartRoster(twoPlayerRoster);
  const raceSession = createRaceSessionFromStartRoster(twoPlayerRoster);

  for (const racer of raceState.racers) {
    assertPoseMatchesStartGridSlot(
      racer.spawn,
      requireStartGridSlot(racer.slotIndex),
      `${racer.controller} racer ${racer.id} start spawn`
    );
  }

  assertEqual(
    raceSession.humanRacerStates.length,
    2,
    "two-player session human racer count"
  );
  assertEqual(
    raceSession.aiRacerStates.length,
    2,
    "two-player session AI racer count"
  );

  let bodyAlignedRacerCount = 0;
  let minForwardAlignment = 1;

  for (const racer of raceSession.racerStates) {
    const forwardAlignment = assertSessionRacerMatchesStartGridSlot(
      racer,
      requireStartGridSlot(racer.slotIndex),
      forward,
      `${racer.controller} racer ${racer.id} runtime start spawn`
    );

    bodyAlignedRacerCount += 1;
    minForwardAlignment = Math.min(minForwardAlignment, forwardAlignment);
  }

  return {
    slotCount: DEFAULT_TRACK_DEFINITION.startGrid.length,
    humanRacerCount: raceState.humanRacers.length,
    aiRacerCount: raceState.aiRacers.length,
    raceSessionHumanRacerCount: raceSession.humanRacerStates.length,
    raceSessionAiRacerCount: raceSession.aiRacerStates.length,
    sessionSpawnedRacerCount: raceSession.racerStates.length,
    bodyAlignedRacerCount,
    headingRadians: startLine.headingRadians,
    minForwardAlignment,
    maxLateralOffset,
    lastForwardOffset
  };
}

export function validateRacerSlotTransformStateStability(): RacerSlotTransformStateValidationResult {
  const roster = createRaceStartRoster(createHumanRacerInputs(2));
  const raceSession = createRaceSessionFromStartRoster(roster, {
    obstacles: [],
    itemPickups: []
  });
  const initialRacerStates = raceSession.racerStates;
  const initialReferencesBySlot = new Map<number, RaceSessionRacerState>();
  let spawnAlignedRacerCount = 0;

  assertEqual(
    initialRacerStates.length,
    RACE_CAPACITY,
    "slot transform racer count"
  );

  for (let slotIndex = 0; slotIndex < RACE_CAPACITY; slotIndex += 1) {
    const racer = requireRacerState(
      initialRacerStates[slotIndex],
      `slot transform racer ${slotIndex}`
    );
    const gridSlot = requireStartGridSlot(slotIndex);

    assertEqual(racer.slotIndex, slotIndex, `slot transform order ${slotIndex}`);
    assertSessionRacerMatchesStartGridSlot(
      racer,
      gridSlot,
      forwardFromHeading(gridSlot.headingRadians),
      `slot transform racer ${slotIndex} spawn`
    );

    if (raceSession.getRacerStateBySlot(slotIndex) !== racer) {
      throw new Error(`Slot ${slotIndex} did not retain its racer state reference.`);
    }

    initialReferencesBySlot.set(slotIndex, racer);
    spawnAlignedRacerCount += 1;
  }

  void raceSession.raceRankings;

  const stableOrderAfterRanking = initialRacerStates.every(
    (racer, slotIndex) => racer === initialReferencesBySlot.get(slotIndex)
  );

  assertEqual(
    stableOrderAfterRanking,
    true,
    "slot transform order after ranking"
  );

  const preservedTransforms = new Map<
    number,
    {
      readonly position: Vector3;
      readonly velocity: Vector3;
      readonly forward: Vector3;
      readonly headingRadians: number;
      readonly speed: number;
      readonly updateCount: number;
    }
  >();

  for (const racer of initialRacerStates) {
    const offset = (racer.slotIndex + 1) * 0.18;
    const headingRadians = normalizeOrientationRadians(
      racer.headingRadians + (racer.slotIndex + 1) * 0.025
    );
    const forward = forwardFromHeading(headingRadians);

    racer.position = {
      x: racer.position.x + offset,
      y: racer.position.y,
      z: racer.position.z + offset * 0.5
    };
    racer.velocity = {
      x: racer.slotIndex + 1,
      y: 0,
      z: -(racer.slotIndex + 1) * 0.25
    };
    racer.forward = {
      x: forward.x,
      y: 0,
      z: forward.z
    };
    racer.headingRadians = headingRadians;
    racer.speed = 4 + racer.slotIndex;
    racer.updateCount = 10 + racer.slotIndex;
    refreshRacerCollisionBounds(racer);
    preservedTransforms.set(racer.slotIndex, snapshotRacerTransform(racer));
  }

  const statesBeforeTick = raceSession.racerStates;
  const tickResult = raceSession.tick(0);
  const statesAfterTick = raceSession.racerStates;
  const stableArrayReferenceAfterTick = statesAfterTick === statesBeforeTick;
  const stableOrderAfterTick = statesAfterTick.every(
    (racer, slotIndex) => racer === initialReferencesBySlot.get(slotIndex)
  );
  let stableSlotReferenceCount = 0;
  let preservedTransformCount = 0;
  let updatedTransformCount = 0;

  assertEqual(
    stableArrayReferenceAfterTick,
    true,
    "slot transform array reference after tick"
  );
  assertEqual(stableOrderAfterTick, true, "slot transform order after tick");
  assertEqual(
    tickResult.racerUpdates,
    RACE_CAPACITY,
    "slot transform tick racer updates"
  );

  for (const racer of statesAfterTick) {
    const preserved = preservedTransforms.get(racer.slotIndex);

    if (raceSession.getRacerStateBySlot(racer.slotIndex) === racer) {
      stableSlotReferenceCount += 1;
    }

    if (preserved === undefined) {
      throw new Error(`Missing preserved transform for slot ${racer.slotIndex}.`);
    }

    assertRacerTransformMatchesSnapshot(
      racer,
      preserved,
      `slot ${racer.slotIndex} transform after tick`
    );
    preservedTransformCount += 1;

    assertEqual(
      racer.updateCount,
      preserved.updateCount + 1,
      `slot ${racer.slotIndex} update count after tick`
    );
    updatedTransformCount += 1;
  }

  assertEqual(
    stableSlotReferenceCount,
    RACE_CAPACITY,
    "stable slot references after tick"
  );

  return {
    slotCount: initialRacerStates.length,
    spawnAlignedRacerCount,
    stableSlotReferenceCount,
    stableOrderAfterRanking,
    stableOrderAfterTick,
    stableArrayReferenceAfterTick,
    preservedTransformCount,
    updatedTransformCount
  };
}

export function validateRacerSlotRaceProgressAndPlacementState(): RacerSlotRaceStateValidationResult {
  const roster = createRaceStartRoster(createHumanRacerInputs(2));
  const raceState = createRaceStateFromStartRoster(roster);
  const raceSession = createRaceSessionFromStartRoster(roster, {
    racerTargetRegistryOptions: {
      localPeerId: "human-2-1"
    },
    obstacles: [],
    itemPickups: []
  });
  const initialProgressRefs = new Set(
    raceState.racers.map((racer) => racer.progress)
  );
  const initialPlacementRefs = new Set(
    raceState.racers.map((racer) => racer.placement)
  );
  const initialParticipantIndex = raceSession.createParticipantStateIndex({
    localPeerId: "human-2-1"
  });
  const initialParticipants = initialParticipantIndex.participants;
  const initialRanks = new Set<number>();
  let initialCurrentLapCount = 0;
  let initialRaceProgressCount = 0;

  assertEqual(raceState.racers.length, RACE_CAPACITY, "race-state slot count");
  assertStringEqual(raceState.phase, "setup", "race-state initial phase");
  assertEqual(
    raceState.lapCount,
    DEFAULT_RACE_TRACK_STATE.lapCount,
    "race-state lap count"
  );
  assertEqual(
    raceSession.racerStates.length,
    RACE_CAPACITY,
    "race-session slot count"
  );
  assertEqual(
    raceState.participants.length,
    RACE_CAPACITY,
    "race-state participant slot count"
  );
  assertEqual(
    initialParticipants.length,
    RACE_CAPACITY,
    "race-session participant slot count"
  );
  assertEqual(
    countParticipantsByRole(initialParticipants, "local-human"),
    1,
    "one local human participant"
  );
  assertEqual(
    countParticipantsByRole(initialParticipants, "remote-human"),
    1,
    "one remote human participant"
  );
  assertEqual(
    countParticipantsByRole(initialParticipants, "ai"),
    AI_RACER_SLOT_COUNT,
    "two AI participants"
  );
  assertStringEqual(
    requireRaceParticipant(
      initialParticipantIndex.participantsById.human_1,
      "host participant"
    ).role,
    "local-human",
    "host peer resolves as local participant"
  );
  assertStringEqual(
    requireRaceParticipant(
      initialParticipantIndex.participantsById.human_2,
      "guest participant"
    ).role,
    "remote-human",
    "guest peer resolves as remote participant"
  );
  assertEqual(
    initialProgressRefs.size,
    RACE_CAPACITY,
    "independent initial progress state count"
  );
  assertEqual(
    initialPlacementRefs.size,
    RACE_CAPACITY,
    "independent initial placement state count"
  );

  for (let slotIndex = 0; slotIndex < RACE_CAPACITY; slotIndex += 1) {
    const raceStateRacer = requireRegisteredRacer(
      raceState.racersBySlot[slotIndex],
      `race-state racer slot ${slotIndex}`
    );
    const raceStateParticipant = requireRaceParticipant(
      raceState.participantsBySlot[slotIndex],
      `race-state participant slot ${slotIndex}`
    );
    const sessionParticipant = requireRaceParticipant(
      initialParticipantIndex.participantsBySlot[slotIndex],
      `race-session participant slot ${slotIndex}`
    );
    const sessionRacer = requireRacerState(
      raceSession.getRacerStateBySlot(slotIndex),
      `race-session racer slot ${slotIndex}`
    );

    assertEqual(
      raceStateRacer.progress.lap,
      0,
      `race-state slot ${slotIndex} initial lap`
    );
    assertEqual(
      raceStateRacer.progress.currentLap,
      1,
      `race-state slot ${slotIndex} initial current lap`
    );
    assertEqual(
      raceStateRacer.progress.checkpointIndex,
      0,
      `race-state slot ${slotIndex} initial checkpoint`
    );
    assertAlmostEqual(
      raceStateRacer.progress.trackProgress,
      0,
      `race-state slot ${slotIndex} initial track progress`
    );
    assertAlmostEqual(
      raceStateRacer.progress.raceProgress,
      0,
      `race-state slot ${slotIndex} initial race progress`
    );
    assertEqual(
      Number(raceStateRacer.progress.finished),
      0,
      `race-state slot ${slotIndex} initial finished state`
    );
    assertEqual(
      raceStateRacer.placement.rank,
      slotIndex + 1,
      `race-state slot ${slotIndex} initial placement rank`
    );
    assertNull(
      raceStateRacer.placement.finishPlace,
      `race-state slot ${slotIndex} initial finish place`
    );
    assertNull(
      raceStateRacer.placement.finishTimeSeconds,
      `race-state slot ${slotIndex} initial finish time`
    );
    assertEqual(
      sessionRacer.rank,
      slotIndex + 1,
      `race-session slot ${slotIndex} initial rank`
    );
    assertEqual(
      sessionRacer.placement.rank,
      slotIndex + 1,
      `race-session slot ${slotIndex} initial placement rank`
    );
    assertStringEqual(
      raceStateParticipant.stableId,
      raceStateRacer.id,
      `race-state slot ${slotIndex} participant stable id`
    );
    assertEqual(
      raceStateParticipant.rank,
      slotIndex + 1,
      `race-state slot ${slotIndex} participant rank`
    );
    assertStringEqual(
      raceStateParticipant.lifecycleStatus,
      "ready",
      `race-state slot ${slotIndex} participant lifecycle`
    );
    assertVectorAlmostEqual(
      raceStateParticipant.position,
      raceStateRacer.spawn.position,
      `race-state slot ${slotIndex} participant position`
    );
    assertStringEqual(
      sessionParticipant.stableId,
      sessionRacer.id,
      `race-session slot ${slotIndex} participant stable id`
    );
    assertVectorAlmostEqual(
      sessionParticipant.position,
      sessionRacer.position,
      `race-session slot ${slotIndex} participant position`
    );
    initialRanks.add(raceStateRacer.placement.rank);
    initialCurrentLapCount +=
      raceStateRacer.progress.currentLap === 1 ? 1 : 0;
    initialRaceProgressCount +=
      raceStateRacer.progress.raceProgress === 0 ? 1 : 0;
  }

  const configuredProgress = [
    { slotIndex: 0, lap: 0, markerOrder: 1, expectedRank: 4 },
    { slotIndex: 1, lap: 1, markerOrder: 2, expectedRank: 2 },
    { slotIndex: 2, lap: 0, markerOrder: 3, expectedRank: 3 },
    { slotIndex: 3, lap: 2, markerOrder: 4, expectedRank: 1 }
  ] as const;

  for (const config of configuredProgress) {
    const racer = requireRacerState(
      raceSession.getRacerStateBySlot(config.slotIndex),
      `configured progress racer slot ${config.slotIndex}`
    );
    const marker = requireTrackLapMarker(config.markerOrder);

    racer.progress = createValidationProgressState({
      lap: config.lap,
      checkpointIndex: marker.order,
      trackProgress: marker.trackProgress,
      finished: false
    });
  }

  const progressTickResult = raceSession.tick(0);
  const snapshotRanks = new Set(
    progressTickResult.raceProgress.map((progress) => progress.rank)
  );
  let maintainedProgressSlotCount = 0;
  let maintainedRankSlotCount = 0;
  let participantRankUpdateCount = 0;

  for (const config of configuredProgress) {
    const racer = requireRacerState(
      raceSession.getRacerStateBySlot(config.slotIndex),
      `maintained progress racer slot ${config.slotIndex}`
    );
    const participant = requireRaceParticipant(
      progressTickResult.participants.find(
        (candidate) => candidate.slotIndex === config.slotIndex
      ),
      `maintained participant slot ${config.slotIndex}`
    );
    const marker = requireTrackLapMarker(config.markerOrder);

    assertEqual(
      racer.progress.lap,
      config.lap,
      `slot ${config.slotIndex} maintained lap`
    );
    assertEqual(
      racer.progress.checkpointIndex,
      marker.order,
      `slot ${config.slotIndex} maintained checkpoint`
    );
    assertAlmostEqual(
      racer.progress.trackProgress,
      marker.trackProgress,
      `slot ${config.slotIndex} maintained track progress`
    );
    assertEqual(
      racer.progress.currentLap,
      Math.min(config.lap + 1, DEFAULT_RACE_TRACK_STATE.lapCount),
      `slot ${config.slotIndex} maintained current lap`
    );
    assertAlmostEqual(
      racer.progress.raceProgress,
      getExpectedValidationRaceProgress(config.lap, marker.trackProgress),
      `slot ${config.slotIndex} maintained race progress`
    );
    maintainedProgressSlotCount += 1;

    assertEqual(
      racer.rank,
      config.expectedRank,
      `slot ${config.slotIndex} maintained rank`
    );
    assertEqual(
      racer.placement.rank,
      config.expectedRank,
      `slot ${config.slotIndex} maintained placement rank`
    );
    assertEqual(
      participant.rank,
      config.expectedRank,
      `slot ${config.slotIndex} maintained participant rank`
    );
    assertStringEqual(
      participant.lifecycleStatus,
      "racing",
      `slot ${config.slotIndex} participant racing lifecycle`
    );
    maintainedRankSlotCount += 1;
    participantRankUpdateCount += 1;
  }

  assertEqual(
    progressTickResult.raceProgress.length,
    RACE_CAPACITY,
    "race progress snapshot slot count"
  );
  assertEqual(
    snapshotRanks.size,
    RACE_CAPACITY,
    "race progress snapshot unique rank count"
  );
  assertEqual(
    progressTickResult.participants.length,
    RACE_CAPACITY,
    "race participant tick snapshot count"
  );

  const movedRacer = requireRacerState(
    raceSession.getRacerStateBySlot(0),
    "participant position update racer"
  );
  movedRacer.position = {
    x: movedRacer.position.x + 4.25,
    y: movedRacer.position.y,
    z: movedRacer.position.z - 1.5
  };
  refreshRacerCollisionBounds(movedRacer);
  const movedParticipant = requireRaceParticipant(
    raceSession.participantsBySlot[0],
    "participant position update slot 0"
  );
  assertVectorAlmostEqual(
    movedParticipant.position,
    movedRacer.position,
    "participant position follows live racer state"
  );
  const participantPositionUpdateCount = 1;

  const finishOrderSlots = [1, 3, 0, 2] as const;
  const finishOrder: string[] = [];

  for (let order = 0; order < finishOrderSlots.length; order += 1) {
    const slotIndex = finishOrderSlots[order];

    if (slotIndex === undefined) {
      throw new Error(`Missing finish-order slot at index ${order}.`);
    }

    const racer = requireRacerState(
      raceSession.getRacerStateBySlot(slotIndex),
      `finish-order racer slot ${slotIndex}`
    );

    racer.progress = createValidationProgressState({
      lap: DEFAULT_RACE_TRACK_STATE.lapCount,
      checkpointIndex: 0,
      trackProgress: 0,
      finished: true
    });
    raceSession.tick(0);

    assertEqual(
      racer.finishPlace ?? -1,
      order + 1,
      `slot ${slotIndex} finish place`
    );
    assertEqual(
      racer.placement.finishPlace ?? -1,
      order + 1,
      `slot ${slotIndex} placement finish place`
    );
    assertEqual(
      racer.progress.currentLap,
      DEFAULT_RACE_TRACK_STATE.lapCount,
      `slot ${slotIndex} finished current lap`
    );
    assertAlmostEqual(
      racer.progress.raceProgress,
      1,
      `slot ${slotIndex} finished race progress`
    );
    finishOrder.push(`${slotIndex}:${racer.finishPlace ?? -1}`);
  }

  assertEqual(
    raceSession.phase === "finished",
    true,
    "race session finished after all slot placements"
  );
  const finishedParticipantCount = countParticipantsByLifecycleStatus(
    raceSession.participantStates,
    "finished"
  );
  assertEqual(
    finishedParticipantCount,
    RACE_CAPACITY,
    "all participants expose finished lifecycle after race finish"
  );

  const resetRaceState = resetRaceStatePhase(
    createFinishedRaceStateForResetValidation(raceState)
  );
  let resetInitialProgressCount = 0;
  let resetFinishTimeCount = 0;
  const resetReadyParticipantCount = countParticipantsByLifecycleStatus(
    resetRaceState.participants,
    "ready"
  );

  assertStringEqual(resetRaceState.phase, "setup", "reset race-state phase");
  assertEqual(
    resetReadyParticipantCount,
    RACE_CAPACITY,
    "reset race-state participant lifecycle"
  );

  for (const racer of resetRaceState.racers) {
    assertEqual(racer.progress.lap, 0, `reset racer ${racer.id} lap`);
    assertEqual(
      racer.progress.currentLap,
      1,
      `reset racer ${racer.id} current lap`
    );
    assertAlmostEqual(
      racer.progress.raceProgress,
      0,
      `reset racer ${racer.id} race progress`
    );
    assertEqual(
      Number(racer.progress.finished),
      0,
      `reset racer ${racer.id} finished flag`
    );
    assertNull(
      racer.placement.finishTimeSeconds,
      `reset racer ${racer.id} finish time`
    );
    resetInitialProgressCount +=
      racer.progress.currentLap === 1 &&
      racer.progress.raceProgress === 0 &&
      !racer.progress.finished
        ? 1
        : 0;
    resetFinishTimeCount += racer.placement.finishTimeSeconds === null ? 1 : 0;
  }

  return {
    slotCount: raceSession.racerStates.length,
    lapCount: raceState.lapCount,
    initialPhase: raceState.phase,
    participantCount: initialParticipants.length,
    localHumanParticipantCount: countParticipantsByRole(
      initialParticipants,
      "local-human"
    ),
    remoteHumanParticipantCount: countParticipantsByRole(
      initialParticipants,
      "remote-human"
    ),
    aiParticipantCount: countParticipantsByRole(initialParticipants, "ai"),
    readyParticipantCount: countParticipantsByLifecycleStatus(
      initialParticipants,
      "ready"
    ),
    racingParticipantCount: countParticipantsByLifecycleStatus(
      progressTickResult.participants,
      "racing"
    ),
    finishedParticipantCount,
    participantPositionUpdateCount,
    participantRankUpdateCount,
    resetReadyParticipantCount,
    independentInitialProgressCount: initialProgressRefs.size,
    independentInitialPlacementCount: initialPlacementRefs.size,
    uniqueInitialRankCount: initialRanks.size,
    initialCurrentLapCount,
    initialRaceProgressCount,
    maintainedProgressSlotCount,
    maintainedRankSlotCount,
    raceProgressSnapshotCount: progressTickResult.raceProgress.length,
    uniqueSnapshotRankCount: snapshotRanks.size,
    finishPlaceCount: finishOrder.length,
    finishOrderSignature: finishOrder.join(","),
    resetPhase: resetRaceState.phase,
    resetInitialProgressCount,
    resetFinishTimeCount
  };
}

export function validateAiRacerProgressionUsesRaceRules(): AiRacerProgressionValidationResult {
  const roster = createRaceStartRoster(createHumanRacerInputs(2));
  const raceSession = createRaceSessionFromStartRoster(roster, {
    aiController: {
      getCommand: () => ({
        throttle: 1,
        brake: 0,
        steering: 0
      })
    }
  });
  const firstHumanRacer = requireRacerState(
    raceSession.humanRacerStates[0],
    "first human racer"
  );
  const firstAiRacer = requireRacerState(
    raceSession.aiRacerStates[0],
    "first AI racer"
  );
  const firstCheckpoint = requireTrackLapMarker(1);
  const finalMarker = requireTrackLapMarker(
    DEFAULT_TRACK_DEFINITION.lapMarkers.length - 1
  );
  const startMarker = requireTrackLapMarker(0);

  firstHumanRacer.progress = createValidationProgressState({
    lap: 0,
    checkpointIndex: 0,
    trackProgress: 0,
    finished: false
  });
  firstAiRacer.progress = createValidationProgressState({
    lap: 0,
    checkpointIndex: 0,
    trackProgress: 0,
    finished: false
  });
  setRacerAtLapMarker(firstHumanRacer, firstCheckpoint);
  setRacerAtLapMarker(firstAiRacer, firstCheckpoint);
  raceSession.tick(1 / 60);

  assertEqual(
    firstHumanRacer.progress.checkpointIndex,
    firstCheckpoint.order,
    "human checkpoint progression through race rules"
  );
  assertEqual(
    firstAiRacer.progress.checkpointIndex,
    firstCheckpoint.order,
    "AI checkpoint progression through race rules"
  );
  const humanCheckpointIndex = firstHumanRacer.progress.checkpointIndex;
  const aiCheckpointIndex = firstAiRacer.progress.checkpointIndex;

  const projectedProgression = validateAiProjectedWaypointProgression();

  firstHumanRacer.progress = createValidationProgressState({
    lap: 1,
    checkpointIndex: 1,
    trackProgress: 50,
    finished: false
  });
  firstAiRacer.progress = createValidationProgressState({
    lap: 1,
    checkpointIndex: 2,
    trackProgress: 95,
    finished: false
  });
  raceSession.tick(0);

  const aiRankBeforeFinish = requireRankingEntry(
    raceSession,
    firstAiRacer.id
  ).rank;

  assertEqual(aiRankBeforeFinish, 1, "AI ranking before finish");

  firstHumanRacer.progress = createValidationProgressState({
    lap: DEFAULT_RACE_TRACK_STATE.lapCount - 1,
    checkpointIndex: finalMarker.order,
    trackProgress: finalMarker.trackProgress,
    finished: false
  });
  firstAiRacer.progress = createValidationProgressState({
    lap: DEFAULT_RACE_TRACK_STATE.lapCount - 1,
    checkpointIndex: finalMarker.order,
    trackProgress: finalMarker.trackProgress,
    finished: false
  });
  setRacerAtLapMarker(firstHumanRacer, startMarker);
  setRacerAtLapMarker(firstAiRacer, startMarker);
  raceSession.tick(1 / 60);

  assertEqual(
    firstHumanRacer.progress.lap,
    DEFAULT_RACE_TRACK_STATE.lapCount,
    "human finish lap through race rules"
  );
  assertEqual(
    firstAiRacer.progress.lap,
    DEFAULT_RACE_TRACK_STATE.lapCount,
    "AI finish lap through race rules"
  );
  assertEqual(
    Number(firstHumanRacer.progress.finished),
    1,
    "human finish state through race rules"
  );
  assertEqual(
    Number(firstAiRacer.progress.finished),
    1,
    "AI finish state through race rules"
  );

  const aiFinishPlace = requireNonNullNumber(
    firstAiRacer.finishPlace,
    "AI finish place"
  );
  const aiRankAfterFinish = requireRankingEntry(
    raceSession,
    firstAiRacer.id
  ).rank;

  return {
    humanCheckpointIndex,
    aiCheckpointIndex,
    aiProjectedCheckpointIndex: projectedProgression.checkpointIndex,
    aiProjectedTrackProgress: projectedProgression.trackProgress,
    aiRankBeforeFinish,
    aiFinished: firstAiRacer.progress.finished,
    aiLap: firstAiRacer.progress.lap,
    aiFinishPlace,
    aiRankAfterFinish,
    aiProjectedFinishPlace: projectedProgression.finishPlace
  };
}

function validateAiProjectedWaypointProgression(): {
  readonly checkpointIndex: number;
  readonly trackProgress: number;
  readonly finishPlace: number;
} {
  const preciseTrack = createPreciseRaceProgressTrack();
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      aiController: {
        getCommand: () => ({
          throttle: 0,
          brake: 1,
          steering: 0
        })
      },
      track: preciseTrack,
      obstacles: [],
      itemPickups: []
    }
  );
  const aiRacer = requireRacerState(
    raceSession.aiRacerStates[0],
    "projected waypoint AI racer"
  );
  const firstMarker = requireTrackLapMarker(1);
  const finalMarker = requireTrackLapMarker(
    DEFAULT_TRACK_DEFINITION.lapMarkers.length - 1
  );
  const startMarker = requireTrackLapMarker(0);

  parkRaceLoopCollisionValidationNonTargets(raceSession, aiRacer.id, "");

  aiRacer.progress = createValidationProgressState({
    lap: 0,
    checkpointIndex: startMarker.order,
    trackProgress: startMarker.trackProgress,
    finished: false
  }, preciseTrack);
  setStationaryRacerPose(
    aiRacer,
    getPositionJustPastLapMarker(firstMarker.order, 0.2),
    firstMarker.headingRadians
  );
  raceSession.tick(1 / 60);

  assertEqual(
    aiRacer.progress.checkpointIndex,
    firstMarker.order,
    "AI projected waypoint checkpoint progression"
  );
  assertGreaterThan(
    aiRacer.progress.trackProgress,
    firstMarker.trackProgress,
    "AI projected waypoint track progress"
  );

  const checkpointIndex = aiRacer.progress.checkpointIndex;
  const trackProgress = aiRacer.progress.trackProgress;

  aiRacer.progress = createValidationProgressState({
    lap: preciseTrack.lapCount - 1,
    checkpointIndex: finalMarker.order,
    trackProgress: finalMarker.trackProgress,
    finished: false
  }, preciseTrack);
  setStationaryRacerPose(
    aiRacer,
    getPositionJustPastLapMarker(startMarker.order, 0.08),
    startMarker.headingRadians
  );
  raceSession.tick(1 / 60);

  assertEqual(
    aiRacer.progress.lap,
    preciseTrack.lapCount,
    "AI projected waypoint finish lap"
  );
  assertEqual(
    Number(aiRacer.progress.finished),
    1,
    "AI projected waypoint finish state"
  );

  return {
    checkpointIndex,
    trackProgress,
    finishPlace: requireNonNullNumber(
      aiRacer.finishPlace,
      "AI projected waypoint finish place"
    )
  };
}

export function validateOrderedCheckpointCrossingRules(): OrderedCheckpointProgressionValidationResult {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1))
  );
  const racer = requireRacerState(
    raceSession.humanRacerStates[0],
    "ordered checkpoint human racer"
  );
  const startMarker = requireTrackLapMarker(0);
  const firstMarker = requireTrackLapMarker(1);
  const secondMarker = requireTrackLapMarker(2);
  const finalMarker = requireTrackLapMarker(
    DEFAULT_TRACK_DEFINITION.lapMarkers.length - 1
  );

  racer.progress = createValidationProgressState({
    lap: 0,
    checkpointIndex: 0,
    trackProgress: 0,
    finished: false
  });
  setRacerAtLapMarker(racer, secondMarker);
  raceSession.tick(1 / 60);

  assertEqual(
    racer.progress.checkpointIndex,
    0,
    "out-of-order checkpoint gate"
  );
  assertEqual(racer.progress.lap, 0, "out-of-order lap gate");

  const blockedCheckpointIndex = racer.progress.checkpointIndex;

  setRacerAtLapMarker(racer, firstMarker);
  raceSession.tick(1 / 60);

  assertEqual(
    racer.progress.checkpointIndex,
    firstMarker.order,
    "first checkpoint crossing"
  );

  const firstCheckpointIndex = racer.progress.checkpointIndex;

  setRacerAtLapMarker(racer, startMarker);
  raceSession.tick(1 / 60);

  assertEqual(
    racer.progress.checkpointIndex,
    firstMarker.order,
    "start finish blocked before remaining checkpoints"
  );
  assertEqual(racer.progress.lap, 0, "lap blocked before remaining checkpoints");

  const blockedLap = racer.progress.lap;

  for (
    let markerOrder = secondMarker.order;
    markerOrder < DEFAULT_TRACK_DEFINITION.lapMarkers.length;
    markerOrder += 1
  ) {
    setRacerAtLapMarker(racer, requireTrackLapMarker(markerOrder));
    raceSession.tick(1 / 60);
  }

  assertEqual(
    racer.progress.checkpointIndex,
    finalMarker.order,
    "final checkpoint crossing"
  );

  const finalCheckpointIndex = racer.progress.checkpointIndex;

  setRacerAtLapMarker(racer, startMarker);
  raceSession.tick(1 / 60);

  assertEqual(racer.progress.lap, 1, "in-order lap completion");
  assertEqual(
    racer.progress.checkpointIndex,
    startMarker.order,
    "lap completion resets checkpoint to start finish"
  );

  const completedLap = racer.progress.lap;

  racer.progress = createValidationProgressState({
    lap: DEFAULT_RACE_TRACK_STATE.lapCount - 1,
    checkpointIndex: startMarker.order,
    trackProgress: startMarker.trackProgress,
    finished: false
  });
  setRacerAtLapMarker(racer, startMarker);
  raceSession.tick(1 / 60);

  assertEqual(
    Number(racer.progress.finished),
    0,
    "premature finish blocked before ordered checkpoints"
  );

  const prematureFinishBlocked = !racer.progress.finished;

  racer.progress = createValidationProgressState({
    lap: 0,
    checkpointIndex: finalMarker.order,
    trackProgress: firstMarker.trackProgress,
    finished: false
  });
  setRacerAtLapMarker(racer, startMarker);
  raceSession.tick(1 / 60);

  assertEqual(
    racer.progress.lap,
    0,
    "stale final checkpoint cannot complete lap without checkpoint progress"
  );
  assertEqual(
    racer.progress.checkpointIndex,
    firstMarker.order,
    "stale final checkpoint resolves back to completed progress marker"
  );

  const staleFinishShortcutBlocked =
    racer.progress.lap === 0 && !racer.progress.finished;

  return {
    blockedCheckpointIndex,
    firstCheckpointIndex,
    blockedLap,
    completedLap,
    finalCheckpointIndex,
    prematureFinishBlocked,
    staleFinishShortcutBlocked
  };
}

export function validateRaceProgressStateSurface(): RaceProgressSurfaceValidationResult {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1))
  );
  const racer = requireRacerState(
    raceSession.humanRacerStates[0],
    "race progress surface human racer"
  );
  const startMarker = requireTrackLapMarker(0);
  const finalMarker = requireTrackLapMarker(
    DEFAULT_TRACK_DEFINITION.lapMarkers.length - 1
  );
  const initialProgress = requireProgressSnapshot(
    raceSession.getRacerProgress(racer.id),
    "initial racer progress"
  );

  assertEqual(
    initialProgress.finished,
    false,
    "initial progress finished state"
  );
  assertAlmostEqual(
    initialProgress.completionRatio,
    0,
    "initial completion ratio"
  );
  assertAlmostEqual(
    initialProgress.totalDistance,
    DEFAULT_RACE_TRACK_STATE.lapCount * DEFAULT_RACE_TRACK_STATE.totalLength,
    "total race distance"
  );

  racer.progress = createValidationProgressState({
    lap: DEFAULT_RACE_TRACK_STATE.lapCount - 1,
    checkpointIndex: finalMarker.order,
    trackProgress: finalMarker.trackProgress,
    finished: false
  });
  setRacerAtLapMarker(racer, startMarker);

  const tickResult = raceSession.tick(1 / 60);
  const finishedProgress = requireProgressSnapshot(
    raceSession.getRacerProgress(racer.id),
    "finished racer progress"
  );
  const tickProgress = requireProgressSnapshot(
    tickResult.raceProgress.find((progress) => progress.racerId === racer.id),
    "tick racer progress"
  );

  assertEqual(finishedProgress.finished, true, "finished progress state");
  assertEqual(
    tickProgress.finished,
    true,
    "tick result exposes finished progress state"
  );
  assertAlmostEqual(
    finishedProgress.completedDistance,
    finishedProgress.totalDistance,
    "finished completed distance"
  );
  assertAlmostEqual(
    finishedProgress.completionRatio,
    1,
    "finished completion ratio"
  );
  assertEqual(
    finishedProgress.finishPlace ?? -1,
    racer.finishPlace ?? -1,
    "progress finish place"
  );

  return {
    initialCompletionRatio: initialProgress.completionRatio,
    finishedCompletionRatio: finishedProgress.completionRatio,
    completedDistance: finishedProgress.completedDistance,
    totalDistance: finishedProgress.totalDistance,
    finished: finishedProgress.finished,
    tickSurfaceCount: tickResult.raceProgress.length
  };
}

export function validateApproximateRaceDuration(): RaceDurationValidationResult {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(4)),
    {
      track: {
        id: DEFAULT_RACE_TRACK_STATE.id,
        name: DEFAULT_RACE_TRACK_STATE.name,
        lapCount: DEFAULT_RACE_TRACK_STATE.lapCount,
        spawnOrientationRadians: DEFAULT_RACE_TRACK_STATE.spawnOrientationRadians,
        bounds: {
          minX: -10_000,
          maxX: 10_000,
          minZ: -10_000,
          maxZ: 10_000
        },
        width: DEFAULT_RACE_TRACK_STATE.width,
        totalLength: DEFAULT_RACE_TRACK_STATE.totalLength,
        ...(DEFAULT_RACE_TRACK_STATE.waypoints === undefined
          ? {}
          : { waypoints: DEFAULT_RACE_TRACK_STATE.waypoints }),
        currentWaypoint: DEFAULT_RACE_TRACK_STATE.currentWaypoint,
        nextWaypoint: DEFAULT_RACE_TRACK_STATE.nextWaypoint,
        lookAheadWaypoint: DEFAULT_RACE_TRACK_STATE.lookAheadWaypoint
      },
      obstacles: [],
      itemPickups: []
    }
  );
  const pacer = requireRacerState(
    raceSession.humanRacerStates[0],
    "race duration pacer"
  );
  const tickSeconds = 1 / 60;
  const maxTicks = Math.ceil(
    (RACE_TARGET_DURATION_SECONDS + RACE_DURATION_TOLERANCE_SECONDS + 5) /
      tickSeconds
  );
  let tickCount = 0;

  for (const racer of raceSession.racerStates) {
    if (racer.id === pacer.id) {
      continue;
    }

    racer.position = {
      x: 1_000 + racer.slotIndex * 8,
      y: racer.position.y,
      z: 1_000
    };
  }

  raceSession.setHumanInput(pacer.id, { throttle: 1 });

  while (!pacer.progress.finished && tickCount < maxTicks) {
    raceSession.tick(tickSeconds);
    tickCount += 1;
  }

  const finishTimeSeconds = requireNonNullNumber(
    pacer.finishTimeSeconds,
    "race duration pacer finish time"
  );

  assertBetween(
    finishTimeSeconds,
    RACE_TARGET_DURATION_SECONDS - RACE_DURATION_TOLERANCE_SECONDS,
    RACE_TARGET_DURATION_SECONDS + RACE_DURATION_TOLERANCE_SECONDS,
    "clean 3-lap race duration"
  );

  return {
    targetSeconds: RACE_TARGET_DURATION_SECONDS,
    toleranceSeconds: RACE_DURATION_TOLERANCE_SECONDS,
    finishTimeSeconds,
    tickCount
  };
}

export function validateBoostItemPickupRegistration(): BoostItemPickupValidationResult {
  const boostPickup = DEFAULT_RACE_ITEM_PICKUPS.find(
    (pickup) => pickup.itemType === COMBAT_ITEM_REGISTRY.boost.type
  );

  if (boostPickup === undefined) {
    throw new Error("Expected default item pickup table to include boost.");
  }

  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1))
  );
  const racer = requireRacerState(
    raceSession.humanRacerStates[0],
    "boost pickup human racer"
  );

  racer.position = { ...boostPickup.position };
  const tickResult = raceSession.tick(0);

  if (racer.heldItem === null || !COMBAT_ITEM_TYPES.includes(racer.heldItem)) {
    throw new Error("Expected collected boost pickup to grant a combat item.");
  }

  const boostPickupState = raceSession.itemPickupStates.find(
    (pickup) => pickup.id === boostPickup.id
  );

  if (boostPickupState === undefined) {
    throw new Error(`Expected boost pickup state ${boostPickup.id} to exist.`);
  }

  assertEqual(
    boostPickupState.cooldownSeconds,
    boostPickup.respawnSeconds,
    "boost pickup cooldown after collection"
  );
  assertEqual(
    boostPickupState.active,
    false,
    "boost pickup inactive after collection"
  );
  const boostPickupRespawnDeadline =
    boostPickupState.respawnDeadlineElapsedSeconds;

  if (boostPickupRespawnDeadline === null) {
    throw new Error("Expected boost pickup to record a respawn deadline.");
  }

  assertEqual(
    boostPickupRespawnDeadline,
    tickResult.elapsedSeconds + boostPickup.respawnSeconds,
    "boost pickup respawn deadline after collection"
  );

  assertEqual(
    tickResult.itemPickupCollections.length,
    1,
    "boost pickup collection event count"
  );

  const boostCollection = tickResult.itemPickupCollections[0];

  if (boostCollection === undefined) {
    throw new Error("Expected boost pickup collection event to exist.");
  }

  assertStringEqual(
    boostCollection.pickupId,
    boostPickup.id,
    "boost pickup collection event pickup id"
  );
  assertStringEqual(
    boostCollection.racerId,
    racer.id,
    "boost pickup collection event racer id"
  );
  if (!COMBAT_ITEM_TYPES.includes(boostCollection.itemType)) {
    throw new Error(
      "Expected boost pickup collection event item type to use combat item pool."
    );
  }
  assertStringEqual(
    boostCollection.itemType,
    racer.heldItem,
    "boost pickup collection event item type matches inventory grant"
  );
  assertEqual(
    boostCollection.cooldownSeconds,
    boostPickup.respawnSeconds,
    "boost pickup collection event cooldown"
  );
  assertEqual(
    boostCollection.respawnDeadlineElapsedSeconds,
    tickResult.elapsedSeconds + boostPickup.respawnSeconds,
    "boost pickup collection event respawn deadline"
  );

  const mirroredSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1))
  );
  const mirroredRacer = requireRacerState(
    mirroredSession.getRacerState(racer.id),
    "mirrored boost pickup racer"
  );
  const applied =
    mirroredSession.applyItemPickupCollectionEvent(boostCollection);
  const duplicateApplied =
    mirroredSession.applyItemPickupCollectionEvent(boostCollection);
  const mirroredBoostPickup = mirroredSession.itemPickupStates.find(
    (pickup) => pickup.id === boostPickup.id
  );

  if (!applied) {
    throw new Error("Expected mirrored boost pickup collection event to apply.");
  }

  if (duplicateApplied) {
    throw new Error(
      "Expected duplicate mirrored boost pickup collection event to be ignored."
    );
  }

  if (mirroredBoostPickup === undefined) {
    throw new Error(`Expected mirrored pickup state ${boostPickup.id} to exist.`);
  }

  assertStringEqual(
    mirroredRacer.heldItem,
    boostCollection.itemType,
    "mirrored held item after replicated boost pickup"
  );
  assertAlmostEqual(
    mirroredBoostPickup.cooldownSeconds,
    boostPickup.respawnSeconds,
    "mirrored boost pickup cooldown after replicated event"
  );
  assertEqual(
    mirroredBoostPickup.active,
    false,
    "mirrored boost pickup inactive after replicated event"
  );
  const mirroredBoostPickupRespawnDeadline =
    mirroredBoostPickup.respawnDeadlineElapsedSeconds;

  if (mirroredBoostPickupRespawnDeadline === null) {
    throw new Error("Expected mirrored boost pickup to record a respawn deadline.");
  }

  assertEqual(
    mirroredBoostPickupRespawnDeadline,
    boostCollection.respawnDeadlineElapsedSeconds,
    "mirrored boost pickup respawn deadline after replicated event"
  );

  return {
    pickupId: boostPickup.id,
    heldItem: boostCollection.itemType,
    activeAfterCollection: boostPickupState.active,
    respawnSeconds: boostPickupState.cooldownSeconds,
    respawnDeadlineElapsedSeconds: boostPickupRespawnDeadline
  };
}

export function validateShellItemPickupInventoryFlow(): ShellItemPickupInventoryValidationResult {
  const shell = COMBAT_ITEM_REGISTRY.shell;
  const shellPickup = DEFAULT_RACE_ITEM_PICKUPS.find(
    (pickup) => pickup.itemType === shell.type
  );

  if (shellPickup === undefined) {
    throw new Error("Expected default item pickup table to include shell.");
  }

  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1))
  );
  const racer = requireRacerState(
    raceSession.humanRacerStates[0],
    "shell pickup human racer"
  );

  racer.position = { ...shellPickup.position };
  const tickResult = raceSession.tick(0);

  if (racer.heldItem === null || !COMBAT_ITEM_TYPES.includes(racer.heldItem)) {
    throw new Error("Expected collected shell pickup to grant a combat item.");
  }
  const grantedItemType = racer.heldItem;

  const shellPickupState = raceSession.itemPickupStates.find(
    (pickup) => pickup.id === shellPickup.id
  );

  if (shellPickupState === undefined) {
    throw new Error(`Expected shell pickup state ${shellPickup.id} to exist.`);
  }

  assertEqual(
    shellPickupState.cooldownSeconds,
    shellPickup.respawnSeconds,
    "shell pickup cooldown after collection"
  );

  assertEqual(
    tickResult.itemPickupCollections.length,
    1,
    "shell pickup collection event count"
  );

  const shellCollection = tickResult.itemPickupCollections[0];

  if (shellCollection === undefined) {
    throw new Error("Expected shell pickup collection event to exist.");
  }

  assertStringEqual(
    shellCollection.pickupId,
    shellPickup.id,
    "shell pickup collection event pickup id"
  );
  assertStringEqual(
    shellCollection.racerId,
    racer.id,
    "shell pickup collection event racer id"
  );
  if (!COMBAT_ITEM_TYPES.includes(shellCollection.itemType)) {
    throw new Error(
      "Expected shell pickup collection event item type to use combat item pool."
    );
  }
  assertStringEqual(
    shellCollection.itemType,
    grantedItemType,
    "shell pickup collection event item type matches inventory grant"
  );
  assertEqual(
    shellCollection.cooldownSeconds,
    shellPickup.respawnSeconds,
    "shell pickup collection event cooldown"
  );

  const mirroredSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1))
  );
  const mirroredRacer = requireRacerState(
    mirroredSession.getRacerState(racer.id),
    "mirrored shell pickup racer"
  );
  const applied =
    mirroredSession.applyItemPickupCollectionEvent(shellCollection);
  const duplicateApplied =
    mirroredSession.applyItemPickupCollectionEvent(shellCollection);
  const mirroredShellPickup = mirroredSession.itemPickupStates.find(
    (pickup) => pickup.id === shellPickup.id
  );

  if (!applied) {
    throw new Error("Expected mirrored shell pickup collection event to apply.");
  }

  if (duplicateApplied) {
    throw new Error(
      "Expected duplicate mirrored shell pickup collection event to be ignored."
    );
  }

  if (mirroredShellPickup === undefined) {
    throw new Error(`Expected mirrored pickup state ${shellPickup.id} to exist.`);
  }

  assertStringEqual(
    mirroredRacer.heldItem,
    shellCollection.itemType,
    "mirrored held item after replicated shell pickup"
  );
  assertAlmostEqual(
    mirroredShellPickup.cooldownSeconds,
    shellPickup.respawnSeconds,
    "mirrored shell pickup cooldown after replicated event"
  );

  const boostPickup = DEFAULT_RACE_ITEM_PICKUPS.find(
    (pickup) => pickup.itemType === COMBAT_ITEM_REGISTRY.boost.type
  );

  if (boostPickup === undefined) {
    throw new Error("Expected default item pickup table to include boost.");
  }

  racer.position = { ...boostPickup.position };
  const blockedTickResult = raceSession.tick(0);

  assertStringEqual(
    racer.heldItem,
    grantedItemType,
    "held item remains in inventory when slot is full"
  );
  assertEqual(
    blockedTickResult.itemPickupCollections.length,
    0,
    "full shell inventory blocks another pickup collection"
  );

  return {
    pickupId: shellPickup.id,
    heldItem: grantedItemType,
    collectionItemType: shellCollection.itemType,
    respawnSeconds: shellPickupState.cooldownSeconds,
    mirroredHeldItem: shellCollection.itemType,
    blockedHeldItem: grantedItemType,
    blockedCollectionCount: blockedTickResult.itemPickupCollections.length
  };
}

export function validateShellItemUseControlFlow(): ShellItemUseControlValidationResult {
  const localInput = new KeyboardKartInputState();
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const racer = requireRacerState(
    raceSession.humanRacerStates[0],
    "local shell-use racer"
  );
  const startPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const headingForward = forwardFromHeading(headingRadians);
  const staleForward = forwardFromHeading(headingRadians + Math.PI / 2);

  racer.position = { ...startPoint.position };
  racer.forward = { x: staleForward.x, y: 0, z: staleForward.z };
  racer.headingRadians = headingRadians;
  racer.heldItem = COMBAT_ITEM_REGISTRY.shell.type;
  const firingPosition = { ...racer.position };
  localInput.press({ code: "Space" });
  const itemUseInput = localInput.sample();

  if (!itemUseInput.useItem) {
    throw new Error("Expected item-use control to emit one local input pulse.");
  }

  raceSession.setHumanInput(racer.id, itemUseInput);
  const tickResult = raceSession.tick(0);
  const shellUseAction = tickResult.itemUseActions[0];
  const activeShell = raceSession.activeItemStates[0];

  assertNull(racer.heldItem, "held shell item after item-use input");
  assertEqual(
    raceSession.activeItemStates.length,
    1,
    "active shell item count after item-use input"
  );
  assertEqual(
    tickResult.itemUseActions.length,
    1,
    "item-use action count after shell input"
  );

  if (shellUseAction === undefined) {
    throw new Error("Expected shell-use action after item-use input.");
  }

  if (shellUseAction.activeItemId === null) {
    throw new Error("Expected shell-use action to reference the spawned shell.");
  }

  if (activeShell === undefined) {
    throw new Error("Expected active shell after item-use input.");
  }

  if (activeShell.type !== "shell") {
    throw new Error(`Expected active shell type, found ${activeShell.type}.`);
  }

  const expectedSpawnDistance =
    refreshRacerCollisionBounds(racer).halfLength +
    COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.radius +
    SHELL_LAUNCH_CLEARANCE_METERS;
  const spawnOffsetX = activeShell.position.x - firingPosition.x;
  const spawnOffsetZ = activeShell.position.z - firingPosition.z;
  const spawnDistance = Math.hypot(spawnOffsetX, spawnOffsetZ);
  const spawnAheadDistance =
    spawnOffsetX * headingForward.x + spawnOffsetZ * headingForward.z;
  const spawnLateralOffset = Math.abs(
    spawnOffsetX * headingForward.z - spawnOffsetZ * headingForward.x
  );
  const velocitySpeed = Math.hypot(
    activeShell.velocity.x,
    activeShell.velocity.z
  );
  const renderableShell =
    createKartActiveItemSnapshotFromRaceState(activeShell);
  const shellVisual = createActiveCombatItemVisualState(renderableShell);
  const renderInitialOffsetX =
    renderableShell.initialPosition.x - firingPosition.x;
  const renderInitialOffsetZ =
    renderableShell.initialPosition.z - firingPosition.z;
  const renderInitialDistance = Math.hypot(
    renderInitialOffsetX,
    renderInitialOffsetZ
  );
  const forwardAlignment =
    activeShell.direction.x * headingForward.x +
    activeShell.direction.z * headingForward.z;
  const renderDirectionAlignment =
    renderableShell.direction.x * headingForward.x +
    renderableShell.direction.z * headingForward.z;
  const staleForwardAlignment =
    activeShell.direction.x * staleForward.x +
    activeShell.direction.z * staleForward.z;

  if (renderableShell.ownerSlotIndex === null) {
    throw new Error("Expected renderable shell owner slot metadata.");
  }

  assertStringEqual(
    shellUseAction.action,
    "shell-use",
    "local shell-use action"
  );
  assertStringEqual(
    shellUseAction.racerId,
    racer.id,
    "local shell-use racer id"
  );
  assertStringEqual(
    shellUseAction.itemType,
    COMBAT_ITEM_REGISTRY.shell.type,
    "local shell-use item type"
  );
  assertStringEqual(
    activeShell.id,
    shellUseAction.activeItemId,
    "local shell-use active item id"
  );
  assertStringEqual(
    activeShell.type,
    COMBAT_ITEM_REGISTRY.shell.type,
    "local shell-use active item type"
  );
  assertStringEqual(
    renderableShell.type,
    COMBAT_ITEM_REGISTRY.shell.type,
    "renderable shell projectile item type"
  );
  assertStringEqual(
    renderableShell.itemId,
    activeShell.id,
    "renderable shell projectile id"
  );
  assertStringEqual(
    activeShell.ownerRacerId,
    racer.id,
    "local shell owner racer id"
  );
  assertStringEqual(
    activeShell.owner.racerId,
    racer.id,
    "local shell owner metadata racer id"
  );
  assertEqual(
    activeShell.owner.slotIndex,
    racer.slotIndex,
    "local shell owner metadata slot"
  );
  assertStringEqual(
    activeShell.owner.controller,
    racer.controller,
    "local shell owner metadata controller"
  );
  assertStringEqual(
    renderableShell.ownerRacerId,
    racer.id,
    "renderable shell owner racer id"
  );
  assertEqual(
    renderableShell.ownerSlotIndex,
    racer.slotIndex,
    "renderable shell owner slot"
  );
  assertAlmostEqual(
    activeShell.spawnPosition.x,
    firingPosition.x,
    "local shell spawn origin x"
  );
  assertAlmostEqual(
    activeShell.spawnPosition.y,
    firingPosition.y,
    "local shell spawn origin y"
  );
  assertAlmostEqual(
    activeShell.spawnPosition.z,
    firingPosition.z,
    "local shell spawn origin z"
  );
  assertAlmostEqual(
    activeShell.initialPosition.x,
    activeShell.position.x,
    "local shell initial render position x"
  );
  assertAlmostEqual(
    activeShell.initialPosition.y,
    activeShell.position.y,
    "local shell initial render position y"
  );
  assertAlmostEqual(
    activeShell.initialPosition.z,
    activeShell.position.z,
    "local shell initial render position z"
  );
  assertAlmostEqual(
    renderableShell.initialPosition.x,
    activeShell.initialPosition.x,
    "renderable shell initial position x"
  );
  assertAlmostEqual(
    renderableShell.initialPosition.y,
    activeShell.initialPosition.y,
    "renderable shell initial position y"
  );
  assertAlmostEqual(
    renderableShell.initialPosition.z,
    activeShell.initialPosition.z,
    "renderable shell initial position z"
  );
  assertAlmostEqual(
    activeShell.direction.x,
    headingForward.x,
    "local shell forward direction x"
  );
  assertAlmostEqual(
    activeShell.direction.y,
    0,
    "local shell forward direction y"
  );
  assertAlmostEqual(
    activeShell.direction.z,
    headingForward.z,
    "local shell forward direction z"
  );
  assertAlmostEqual(
    renderableShell.direction.x,
    activeShell.direction.x,
    "renderable shell direction x"
  );
  assertAlmostEqual(
    renderableShell.direction.y,
    activeShell.direction.y,
    "renderable shell direction y"
  );
  assertAlmostEqual(
    renderableShell.direction.z,
    activeShell.direction.z,
    "renderable shell direction z"
  );
  assertAlmostEqual(
    renderableShell.lifetimeSeconds,
    activeShell.lifetimeSeconds,
    "renderable shell lifetime"
  );
  assertAlmostEqual(
    activeShell.speed,
    COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed,
    "local shell projectile speed"
  );
  assertAlmostEqual(
    velocitySpeed,
    COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed,
    "local shell velocity speed"
  );
  assertAlmostEqual(
    spawnDistance,
    expectedSpawnDistance,
    "local shell spawn distance from firing kart"
  );
  assertAlmostEqual(
    renderInitialDistance,
    expectedSpawnDistance,
    "renderable shell initial distance from firing kart"
  );
  assertAlmostEqual(
    spawnAheadDistance,
    expectedSpawnDistance,
    "local shell spawn distance ahead of firing kart"
  );
  assertAlmostEqual(
    spawnLateralOffset,
    0,
    "local shell spawn lateral offset from firing kart heading"
  );
  assertAlmostEqual(
    forwardAlignment,
    1,
    "local shell forward alignment"
  );
  assertAlmostEqual(
    renderDirectionAlignment,
    1,
    "renderable shell forward alignment"
  );
  assertAlmostEqual(
    staleForwardAlignment,
    0,
    "local shell ignores stale cached forward alignment"
  );
  assertEqual(
    shellUseAction.tickIndex,
    tickResult.tickIndex,
    "local shell-use tick index"
  );
  assertStringEqual(
    shellVisual.itemType,
    COMBAT_ITEM_REGISTRY.shell.type,
    "renderable shell visual item type"
  );
  assertEqual(
    shellVisual.isWorldVisible,
    true,
    "renderable shell is world visible"
  );

  return {
    racerId: racer.id,
    action: shellUseAction.action,
    heldItemAfterUse: racer.heldItem,
    activeItemId: shellUseAction.activeItemId,
    activeItems: raceSession.activeItemStates.length,
    ownerRacerId: activeShell.owner.racerId,
    ownerSlotIndex: activeShell.owner.slotIndex,
    projectileSpeed: activeShell.speed,
    velocitySpeed,
    spawnDistance,
    renderInitialDistance,
    renderLifetimeSeconds: renderableShell.lifetimeSeconds,
    renderWorldVisible: shellVisual.isWorldVisible,
    forwardAlignment,
    renderDirectionAlignment,
    staleForwardAlignment,
    spawnLateralOffset,
    tickIndex: shellUseAction.tickIndex
  };
}

export function validateShellProjectileTickUpdate(): ShellProjectileTickUpdateValidationResult {
  const shell = COMBAT_ITEM_REGISTRY.shell;
  const tickSeconds = 1 / 30;
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const racer = requireRacerState(
    raceSession.humanRacerStates[0],
    "shell projectile tick racer"
  );
  const startPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const forward = forwardFromHeading(
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians
  );

  racer.position = { ...startPoint.position };
  racer.forward = { x: forward.x, y: 0, z: forward.z };
  racer.headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  racer.heldItem = shell.type;
  raceSession.setHumanInput(racer.id, { useItem: true });
  const spawnTickResult = raceSession.tick(0);
  const activeShell = raceSession.activeItemStates[0];

  assertEqual(
    spawnTickResult.itemUseActions.length,
    1,
    "shell projectile tick setup action count"
  );

  if (activeShell === undefined) {
    throw new Error("Expected active shell for projectile tick validation.");
  }

  if (activeShell.type !== "shell") {
    throw new Error(
      `Expected shell projectile for tick validation, found ${activeShell.type}.`
    );
  }

  const startPosition = { ...activeShell.position };
  const direction = { ...activeShell.direction };
  const speed = activeShell.speed;

  activeShell.velocity = { x: 0, y: 0, z: 0 };
  raceSession.tick(tickSeconds);
  const updatedShell = raceSession.activeItemStates.find(
    (item) => item.id === activeShell.id
  );

  if (updatedShell === undefined) {
    throw new Error("Expected shell to remain active after projectile tick.");
  }

  if (updatedShell.type !== "shell") {
    throw new Error(
      `Expected updated projectile to remain shell, found ${updatedShell.type}.`
    );
  }

  const deltaX = updatedShell.position.x - startPosition.x;
  const deltaY = updatedShell.position.y - startPosition.y;
  const deltaZ = updatedShell.position.z - startPosition.z;
  const expectedDeltaX = direction.x * speed * tickSeconds;
  const expectedDeltaY = direction.y * speed * tickSeconds;
  const expectedDeltaZ = direction.z * speed * tickSeconds;
  const distanceMoved = Math.hypot(deltaX, deltaZ);
  const expectedDistance = speed * tickSeconds;
  const velocitySpeedAfterTick = Math.hypot(
    updatedShell.velocity.x,
    updatedShell.velocity.z
  );

  assertAlmostEqual(
    deltaX,
    expectedDeltaX,
    "shell projectile tick movement x"
  );
  assertAlmostEqual(
    deltaY,
    expectedDeltaY,
    "shell projectile tick movement y"
  );
  assertAlmostEqual(
    deltaZ,
    expectedDeltaZ,
    "shell projectile tick movement z"
  );
  assertAlmostEqual(
    distanceMoved,
    expectedDistance,
    "shell projectile tick distance"
  );
  assertAlmostEqual(
    updatedShell.velocity.x,
    direction.x * speed,
    "shell projectile tick velocity x"
  );
  assertAlmostEqual(
    updatedShell.velocity.y,
    direction.y * speed,
    "shell projectile tick velocity y"
  );
  assertAlmostEqual(
    updatedShell.velocity.z,
    direction.z * speed,
    "shell projectile tick velocity z"
  );
  assertAlmostEqual(
    velocitySpeedAfterTick,
    speed,
    "shell projectile tick velocity speed"
  );

  return {
    activeItemId: updatedShell.id,
    tickSeconds,
    directionX: direction.x,
    directionZ: direction.z,
    speed,
    distanceMoved,
    expectedDistance,
    velocitySpeedAfterTick
  };
}

export function validateShellProjectileCapturesInitialDirection(): ShellProjectileInitialDirectionValidationResult {
  const shell = COMBAT_ITEM_REGISTRY.shell;
  const tickSeconds = 1 / 30;
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const racer = requireRacerState(
    raceSession.humanRacerStates[0],
    "shell initial direction racer"
  );
  const startPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const launchHeadingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const launchDirection = forwardFromHeading(launchHeadingRadians);
  const ownerTurnDirection = forwardFromHeading(
    launchHeadingRadians + Math.PI / 2
  );

  parkOtherRacersAwayFromShellPath(raceSession, racer.id);
  racer.position = { ...startPoint.position };
  racer.velocity = { x: 0, y: 0, z: 0 };
  racer.speed = 0;
  racer.forward = { x: launchDirection.x, y: 0, z: launchDirection.z };
  racer.headingRadians = launchHeadingRadians;
  racer.heldItem = shell.type;
  refreshRacerCollisionBounds(racer);
  raceSession.setHumanInput(racer.id, { useItem: true });

  const spawnTickResult = raceSession.tick(0);
  const activeShell = raceSession.activeItemStates[0];

  assertEqual(
    spawnTickResult.itemUseActions.length,
    1,
    "shell initial direction setup action count"
  );

  if (activeShell === undefined) {
    throw new Error("Expected active shell for initial direction validation.");
  }

  if (activeShell.type !== "shell") {
    throw new Error(
      `Expected shell projectile for initial direction validation, found ${activeShell.type}.`
    );
  }

  const shellId = activeShell.id;
  const initialDirection = { ...activeShell.direction };
  const startPosition = { ...activeShell.position };
  const speed = activeShell.speed;

  racer.headingRadians = launchHeadingRadians + Math.PI / 2;
  racer.forward = { x: ownerTurnDirection.x, y: 0, z: ownerTurnDirection.z };
  refreshRacerCollisionBounds(racer);

  raceSession.tick(tickSeconds);
  const updatedShell = raceSession.activeItemStates.find(
    (item) => item.id === shellId
  );

  if (updatedShell === undefined) {
    throw new Error(
      "Expected shell to remain active after owner direction change."
    );
  }

  if (updatedShell.type !== "shell") {
    throw new Error(
      `Expected updated initial-direction projectile to remain shell, found ${updatedShell.type}.`
    );
  }

  const deltaX = updatedShell.position.x - startPosition.x;
  const deltaZ = updatedShell.position.z - startPosition.z;
  const expectedDeltaX = initialDirection.x * speed * tickSeconds;
  const expectedDeltaZ = initialDirection.z * speed * tickSeconds;
  const distanceMoved = Math.hypot(deltaX, deltaZ);
  const expectedDistance = speed * tickSeconds;
  const travelAlignment =
    deltaX * initialDirection.x + deltaZ * initialDirection.z;
  const ownerTurnAlignment =
    initialDirection.x * ownerTurnDirection.x +
    initialDirection.z * ownerTurnDirection.z;

  assertAlmostEqual(
    updatedShell.direction.x,
    initialDirection.x,
    "shell retained initial direction x"
  );
  assertAlmostEqual(
    updatedShell.direction.y,
    initialDirection.y,
    "shell retained initial direction y"
  );
  assertAlmostEqual(
    updatedShell.direction.z,
    initialDirection.z,
    "shell retained initial direction z"
  );
  assertAlmostEqual(
    deltaX,
    expectedDeltaX,
    "shell initial direction movement x"
  );
  assertAlmostEqual(
    deltaZ,
    expectedDeltaZ,
    "shell initial direction movement z"
  );
  assertAlmostEqual(
    updatedShell.velocity.x,
    initialDirection.x * speed,
    "shell initial direction velocity x"
  );
  assertAlmostEqual(
    updatedShell.velocity.z,
    initialDirection.z * speed,
    "shell initial direction velocity z"
  );
  assertAlmostEqual(
    distanceMoved,
    expectedDistance,
    "shell initial direction distance"
  );
  assertAlmostEqual(
    travelAlignment,
    expectedDistance,
    "shell initial direction travel alignment"
  );
  assertAlmostEqual(
    ownerTurnAlignment,
    0,
    "shell initial direction differs from owner turn direction"
  );

  return {
    activeItemId: updatedShell.id,
    tickSeconds,
    initialDirectionX: initialDirection.x,
    initialDirectionZ: initialDirection.z,
    ownerTurnDirectionX: ownerTurnDirection.x,
    ownerTurnDirectionZ: ownerTurnDirection.z,
    retainedDirectionX: updatedShell.direction.x,
    retainedDirectionZ: updatedShell.direction.z,
    travelAlignment,
    ownerTurnAlignment,
    distanceMoved,
    expectedDistance
  };
}

export function validateShellProjectileLifetimeCleanup(): ShellProjectileLifetimeCleanupValidationResult {
  const shell = COMBAT_ITEM_REGISTRY.shell;
  const tickSeconds = 1 / 60;
  const expirySession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(4)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const expiryRacer = requireRacerState(
    expirySession.humanRacerStates[0],
    "shell lifetime cleanup racer"
  );
  const activeShell = spawnShellForValidation(expirySession, expiryRacer);
  const activeItemId = activeShell.id;
  const initialTtlSeconds = activeShell.ttlSeconds;
  const lifetimeSeconds = activeShell.lifetimeSeconds;
  const centerPosition = {
    ...requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0).position
  };

  activeShell.position = { ...centerPosition };
  expirySession.tick(tickSeconds);

  const shellAfterFirstTick = requireShellProjectileState(
    expirySession.shellProjectileStates.find((item) => item.id === activeItemId),
    "shell after first lifetime tick"
  );
  const ttlAfterFirstTick = shellAfterFirstTick.ttlSeconds;
  const ageAfterFirstTick = shellAfterFirstTick.ageSeconds;

  assertAlmostEqual(
    shellAfterFirstTick.lifetimeSeconds,
    shell.defaultRuntimeConfig.ttlSeconds,
    "shell projectile lifetime source"
  );
  assertAlmostEqual(
    initialTtlSeconds,
    shell.defaultRuntimeConfig.ttlSeconds,
    "shell projectile initial ttl"
  );
  assertAlmostEqual(
    ttlAfterFirstTick,
    initialTtlSeconds - tickSeconds,
    "shell projectile ttl after first lifetime tick"
  );
  assertAlmostEqual(
    ageAfterFirstTick,
    tickSeconds,
    "shell projectile age after first lifetime tick"
  );

  let expiryTickCount = 1;
  const maximumExpiryTicks = Math.ceil((lifetimeSeconds + 1) / tickSeconds);

  while (
    expirySession.shellProjectileStates.some((item) => item.id === activeItemId)
  ) {
    const active = expirySession.shellProjectileStates.find(
      (item) => item.id === activeItemId
    );

    if (active !== undefined) {
      active.position = { ...centerPosition };
    }

    expirySession.tick(tickSeconds);
    expiryTickCount += 1;

    if (expiryTickCount > maximumExpiryTicks) {
      throw new Error("Expected shell projectile to despawn after ttl expiry.");
    }
  }

  const outsideSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(4)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const outsideRacer = requireRacerState(
    outsideSession.humanRacerStates[0],
    "shell outside cleanup racer"
  );
  const outsideShell = spawnShellForValidation(outsideSession, outsideRacer);
  const outsidePoint = requireTrackSurfaceSamplePoint(
    DEFAULT_TRACK_DEFINITION.road,
    "offTrack",
    shell.defaultRuntimeConfig.radius
  );

  outsideShell.position = outsidePoint;
  outsideSession.tick(0);

  assertEqual(
    expirySession.shellProjectileStates.length,
    0,
    "active shell projectiles after ttl expiry"
  );
  assertEqual(
    outsideSession.shellProjectileStates.length,
    0,
    "active shell projectiles after leaving playable area"
  );

  return {
    activeItemId,
    lifetimeSeconds,
    initialTtlSeconds,
    ttlAfterFirstTick,
    ageAfterFirstTick,
    expiryTickCount,
    activeItemsAfterExpiry: expirySession.shellProjectileStates.length,
    activeItemsAfterLeavingArea: outsideSession.shellProjectileStates.length
  };
}

export function validateShellHitboxCollisionEvents(): ShellHitboxCollisionValidationResult {
  const hitSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const hitOwner = requireRacerState(
    hitSession.humanRacerStates[0],
    "shell hitbox owner racer"
  );
  const hitTarget = requireRacerState(
    hitSession.humanRacerStates[1],
    "shell hitbox target racer"
  );
  const hitShell = spawnShellForValidation(hitSession, hitOwner);

  placeRacerForShellHitboxValidation(hitOwner, 7);
  placeRacerForShellHitboxValidation(hitTarget, 2);
  hitTarget.headingRadians = 0;
  hitTarget.speed = 12;
  hitTarget.velocity = { x: 0, y: 0, z: 12 };
  const hitTargetBounds = refreshRacerCollisionBounds(hitTarget);

  hitShell.armedSeconds = 0;
  hitShell.position = {
    x:
      hitTargetBounds.center.x +
      hitTargetBounds.right.x *
        (hitTargetBounds.halfWidth + hitShell.radius - 0.05),
    y: hitTargetBounds.center.y,
    z:
      hitTargetBounds.center.z +
      hitTargetBounds.right.z *
        (hitTargetBounds.halfWidth + hitShell.radius - 0.05)
  };
  hitShell.velocity = {
    x: -COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed,
    y: 0,
    z: 0
  };

  const hitTickResult = hitSession.tick(0);
  const shellHit = hitTickResult.shellHits[0];

  assertEqual(
    hitTickResult.shellHits.length,
    1,
    "shell-hit event count for hitbox overlap"
  );

  if (shellHit === undefined) {
    throw new Error("Expected shell-hit event for hitbox overlap.");
  }

  assertStringEqual(shellHit.itemType, "shell", "shell-hit item type");
  assertStringEqual(shellHit.shellId, hitShell.id, "shell-hit source shell id");
  assertStringEqual(
    shellHit.sourceRacerId,
    hitOwner.id,
    "shell-hit source racer id"
  );
  assertStringEqual(
    shellHit.targetRacerId,
    hitTarget.id,
    "shell-hit target network-stable racer id"
  );
  assertEqual(
    shellHit.targetSlotIndex,
    hitTarget.slotIndex,
    "shell-hit target slot index"
  );
  assertEqual(
    shellHit.tickIndex,
    hitTickResult.tickIndex,
    "shell-hit event tick index"
  );
  assertAlmostEqual(
    shellHit.elapsedSeconds,
    hitTickResult.elapsedSeconds,
    "shell-hit event elapsed seconds"
  );
  assertAlmostEqual(
    shellHit.impact.shellRadius,
    COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.radius,
    "shell-hit impact shell radius"
  );
  assertAlmostEqual(
    shellHit.impact.targetHitboxCenter.x,
    hitTargetBounds.center.x,
    "shell-hit impact target hitbox center x"
  );
  assertGreaterThan(
    shellHit.impact.penetrationDepth,
    0,
    "shell-hit impact penetration depth"
  );
  assertGreaterThan(
    shellHit.impact.relativeSpeed,
    0,
    "shell-hit impact relative speed"
  );
  assertGreaterThan(
    hitTarget.stunSeconds,
    0,
    "shell-hit target stun timer"
  );
  const shellConfig = COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig;

  assertAlmostEqual(
    shellHit.effect.stunSeconds,
    shellConfig.hitStunSeconds,
    "shell-hit effect stun duration"
  );
  assertAlmostEqual(
    shellHit.effect.spinoutSeconds,
    shellConfig.spinoutSeconds,
    "shell-hit effect spinout duration"
  );
  assertGreaterThan(
    Math.abs(shellHit.effect.spinoutAngularVelocity),
    0,
    "shell-hit effect spinout angular velocity"
  );
  assertAlmostEqual(
    shellHit.effect.hitImmunitySeconds,
    shellConfig.hitImmunitySeconds,
    "shell-hit effect immunity duration"
  );
  assertAlmostEqual(
    shellHit.effect.hitFeedbackSeconds,
    shellConfig.hitFeedbackSeconds,
    "shell-hit effect feedback duration"
  );
  assertAlmostEqual(
    shellHit.effect.speedBeforeHit,
    12,
    "shell-hit effect speed before hit"
  );
  assertAlmostEqual(
    shellHit.effect.speedAfterHit,
    12 * shellConfig.hitSpeedFactor,
    "shell-hit effect speed after hit"
  );
  assertAlmostEqual(
    hitTarget.speed,
    12 * shellConfig.hitSpeedFactor,
    "shell-hit target speed damping"
  );
  assertAlmostEqual(
    hitTarget.spinoutSeconds,
    shellConfig.spinoutSeconds,
    "shell-hit target spinout timer"
  );
  assertGreaterThan(
    Math.abs(hitTarget.spinoutAngularVelocity),
    0,
    "shell-hit target spinout angular velocity"
  );
  assertAlmostEqual(
    hitTarget.itemHitImmunitySeconds,
    shellConfig.hitImmunitySeconds,
    "shell-hit target immunity timer"
  );
  assertAlmostEqual(
    hitTarget.hitFeedbackSeconds,
    shellConfig.hitFeedbackSeconds,
    "shell-hit target feedback timer"
  );
  assertStringEqual(
    hitTarget.lastHitItemType ?? "",
    "shell",
    "shell-hit target feedback item type"
  );

  const configuredShellSpinoutSeconds =
    DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds + 0.35 <=
    SHELL_SPINOUT_FEEL_RANGE_SECONDS.max
      ? DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds + 0.35
      : SHELL_SPINOUT_FEEL_RANGE_SECONDS.min;
  const configuredShellSpinoutRadians =
    DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutRadians + Math.PI * 0.2 <=
    SHELL_SPINOUT_FEEL_RANGE_RADIANS.max
      ? DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutRadians + Math.PI * 0.2
      : SHELL_SPINOUT_FEEL_RANGE_RADIANS.min;
  const configuredSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: [],
      shellSpinoutTuning: {
        spinoutSeconds: configuredShellSpinoutSeconds,
        spinoutRadians: configuredShellSpinoutRadians
      }
    }
  );
  const configuredOwner = requireRacerState(
    configuredSession.humanRacerStates[0],
    "configured shell spinout owner racer"
  );
  const configuredTarget = requireRacerState(
    configuredSession.humanRacerStates[1],
    "configured shell spinout target racer"
  );
  const configuredShell = spawnShellForValidation(
    configuredSession,
    configuredOwner
  );

  placeRacerForShellHitboxValidation(configuredOwner, 7);
  placeRacerForShellHitboxValidation(configuredTarget, 2);
  configuredTarget.headingRadians = 0;
  configuredTarget.speed = 12;
  configuredTarget.velocity = { x: 0, y: 0, z: 12 };
  const configuredTargetBounds = refreshRacerCollisionBounds(configuredTarget);

  configuredShell.armedSeconds = 0;
  configuredShell.position = {
    x:
      configuredTargetBounds.center.x +
      configuredTargetBounds.right.x *
        (configuredTargetBounds.halfWidth + configuredShell.radius - 0.05),
    y: configuredTargetBounds.center.y,
    z:
      configuredTargetBounds.center.z +
      configuredTargetBounds.right.z *
        (configuredTargetBounds.halfWidth + configuredShell.radius - 0.05)
  };
  configuredShell.velocity = {
    x: -shellConfig.speed,
    y: 0,
    z: 0
  };

  const configuredHitTickResult = configuredSession.tick(0);
  const configuredShellHit = configuredHitTickResult.shellHits[0];

  assertEqual(
    configuredHitTickResult.shellHits.length,
    1,
    "configured shell-hit event count"
  );

  if (configuredShellHit === undefined) {
    throw new Error("Expected configured shell-hit event.");
  }

  assertAlmostEqual(
    configuredShellHit.effect.spinoutSeconds,
    configuredShellSpinoutSeconds,
    "configured shell-hit effect spinout duration"
  );
  assertAlmostEqual(
    configuredTarget.spinoutSeconds,
    configuredShellSpinoutSeconds,
    "configured shell-hit target spinout timer"
  );
  assertAlmostEqual(
    Math.abs(configuredTarget.spinoutAngularVelocity),
    configuredShellSpinoutRadians / configuredShellSpinoutSeconds,
    "configured shell-hit target spinout angular velocity"
  );
  assertEqual(
    hitSession.shellProjectileStates.length,
    0,
    "shell despawns after hitbox collision"
  );

  const targetSpeedBeforeDuplicateShellReplay = hitTarget.speed;
  const duplicateShellHitWithNewEventId = {
    ...shellHit,
    eventId: `${shellHit.eventId}_duplicate_replay`
  };

  assertEqual(
    hitSession.applyShellHitEvent(duplicateShellHitWithNewEventId),
    false,
    "duplicate shell hit for the same stable shell id is ignored"
  );
  assertAlmostEqual(
    hitTarget.speed,
    targetSpeedBeforeDuplicateShellReplay,
    "duplicate shell hit replay does not damp speed twice"
  );

  const equivalentAuthoritativeShellReplay = {
    ...shellHit,
    eventId: `${shellHit.eventId}_equivalent_authoritative_replay`,
    shellId: `${shellHit.shellId}_equivalent_authoritative_replay`
  };

  assertEqual(
    hitSession.applyShellHitEvent(equivalentAuthoritativeShellReplay),
    true,
    "authoritative shell replay with a new shell id is accepted"
  );
  assertAlmostEqual(
    hitTarget.speed,
    targetSpeedBeforeDuplicateShellReplay,
    "authoritative shell replay uses host speedAfterHit without compounding"
  );

  const shellCountAfterHit = hitSession.shellProjectileStates.length;
  const targetStunSeconds = hitTarget.stunSeconds;
  const targetSpinoutSeconds = hitTarget.spinoutSeconds;
  const targetSpinoutAngularVelocity = hitTarget.spinoutAngularVelocity;
  const targetHitImmunitySeconds = hitTarget.itemHitImmunitySeconds;
  const targetHitFeedbackSeconds = hitTarget.hitFeedbackSeconds;
  const targetSpeedAfterHit = hitTarget.speed;
  const headingBeforeSpinoutTick = hitTarget.headingRadians;
  const immuneShell = spawnShellForValidation(hitSession, hitOwner);

  immuneShell.armedSeconds = 0;
  immuneShell.position = { ...hitTargetBounds.center };
  immuneShell.velocity = {
    x: -COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed,
    y: 0,
    z: 0
  };

  const immuneTickResult = hitSession.tick(0);

  assertEqual(
    immuneTickResult.shellHits.length,
    0,
    "shell-hit immunity suppresses repeat shell-hit event"
  );
  assertEqual(
    hitSession.shellProjectileStates.length,
    1,
    "immune racer does not consume overlapping shell"
  );

  const immuneShellCountAfterOverlap = hitSession.shellProjectileStates.length;

  immuneShell.ttlSeconds = 0;
  hitSession.tick(1 / 60);

  const targetHeadingAfterSpinoutTick = hitTarget.headingRadians;

  assertGreaterThan(
    Math.abs(targetHeadingAfterSpinoutTick - headingBeforeSpinoutTick),
    0,
    "shell-hit spinout changes target heading over time"
  );

  let postSpinoutImmunityGuardTicks = 0;

  while (hitTarget.spinoutSeconds > 0 && postSpinoutImmunityGuardTicks < 120) {
    hitSession.tick(1 / 60);
    postSpinoutImmunityGuardTicks += 1;
  }

  assertEqual(
    hitTarget.spinoutSeconds,
    0,
    "shell-hit spinout expires before post-hit immunity"
  );
  assertGreaterThan(
    hitTarget.itemHitImmunitySeconds,
    0,
    "shell-hit immunity remains after spinout recovery"
  );

  const speedBeforePostSpinoutDuplicate = hitTarget.speed;
  const postSpinoutDuplicateShell = spawnShellForValidation(
    hitSession,
    hitOwner
  );
  const postSpinoutDuplicateTargetBounds =
    refreshRacerCollisionBounds(hitTarget);

  postSpinoutDuplicateShell.armedSeconds = 0;
  postSpinoutDuplicateShell.position = {
    ...postSpinoutDuplicateTargetBounds.center
  };
  postSpinoutDuplicateShell.velocity = {
    x: -COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed,
    y: 0,
    z: 0
  };

  const postSpinoutDuplicateTickResult = hitSession.tick(0);
  const postSpinoutDuplicateRemainingShellCount =
    hitSession.shellProjectileStates.length;
  const speedAfterPostSpinoutDuplicate = hitTarget.speed;

  assertEqual(
    postSpinoutDuplicateTickResult.shellHits.length,
    0,
    "post-spinout immunity suppresses duplicate shell-hit event"
  );
  assertAlmostEqual(
    speedAfterPostSpinoutDuplicate,
    speedBeforePostSpinoutDuplicate,
    "post-spinout immunity duplicate does not damp speed again"
  );
  assertEqual(
    postSpinoutDuplicateRemainingShellCount,
    1,
    "post-spinout immunity duplicate does not consume overlapping shell"
  );

  postSpinoutDuplicateShell.ttlSeconds = 0;
  hitSession.tick(1 / 60);

  for (
    let tickIndex = 0;
    tickIndex < Math.ceil((targetHitImmunitySeconds + 0.2) * 60);
    tickIndex += 1
  ) {
    hitSession.tick(1 / 60);
  }

  assertEqual(
    hitTarget.itemHitImmunitySeconds,
    0,
    "shell-hit immunity expires"
  );

  const simultaneousSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const simultaneousOwner = requireRacerState(
    simultaneousSession.humanRacerStates[0],
    "simultaneous shell hitbox owner racer"
  );
  const simultaneousTarget = requireRacerState(
    simultaneousSession.humanRacerStates[1],
    "simultaneous shell hitbox target racer"
  );
  const firstSimultaneousShell = spawnShellForValidation(
    simultaneousSession,
    simultaneousOwner
  );
  const secondSimultaneousShell = spawnShellForValidation(
    simultaneousSession,
    simultaneousOwner
  );

  placeRacerForShellHitboxValidation(simultaneousOwner, 7);
  placeRacerForShellHitboxValidation(simultaneousTarget, 2);
  simultaneousTarget.headingRadians = 0;
  simultaneousTarget.speed = 12;
  simultaneousTarget.velocity = { x: 0, y: 0, z: 12 };
  const simultaneousTargetBounds =
    refreshRacerCollisionBounds(simultaneousTarget);

  for (const shellProjectile of [
    firstSimultaneousShell,
    secondSimultaneousShell
  ]) {
    shellProjectile.armedSeconds = 0;
    shellProjectile.position = {
      x: simultaneousTargetBounds.center.x,
      y: simultaneousTargetBounds.center.y,
      z: simultaneousTargetBounds.center.z
    };
    shellProjectile.velocity = {
      x: -COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed,
      y: 0,
      z: 0
    };
  }

  const simultaneousTickResult = simultaneousSession.tick(0);

  assertEqual(
    simultaneousTickResult.shellHits.length,
    1,
    "simultaneous shell overlaps emit a single target hit"
  );
  assertStringEqual(
    simultaneousTickResult.shellHits[0]?.targetRacerId ?? "",
    simultaneousTarget.id,
    "simultaneous shell hit target racer id"
  );
  assertAlmostEqual(
    simultaneousTarget.speed,
    12 * shellConfig.hitSpeedFactor,
    "simultaneous shell hit damps target once"
  );
  assertEqual(
    simultaneousSession.shellProjectileStates.length,
    1,
    "simultaneous immune target leaves later overlapping shell active"
  );

  const pendingReplaySession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const pendingReplayOwner = requireRacerState(
    pendingReplaySession.humanRacerStates[0],
    "pending shell replay owner racer"
  );
  const pendingReplayTarget = requireRacerState(
    pendingReplaySession.humanRacerStates[1],
    "pending shell replay target racer"
  );
  const pendingReplayShell = spawnShellForValidation(
    pendingReplaySession,
    pendingReplayOwner
  );
  const pendingReplayTargetSpeed = 9;

  pendingReplayTarget.speed = pendingReplayTargetSpeed;
  pendingReplayTarget.velocity = { x: 0, y: 0, z: pendingReplayTargetSpeed };

  const pendingShellHit = createAuthoritativeShellHitEventForValidation({
    eventId: "pending-shell-hit",
    shell: pendingReplayShell,
    source: pendingReplayOwner,
    target: pendingReplayTarget,
    tickIndex: 10,
    elapsedSeconds: 0.05,
    speedBeforeHit: pendingReplayTargetSpeed
  });
  const pendingShellHitAccepted =
    pendingReplaySession.applyShellHitEvent(pendingShellHit);
  const pendingShellCountAfterApply =
    pendingReplaySession.shellProjectileStates.length;
  const pendingDuplicateShellHitAccepted =
    pendingReplaySession.applyShellHitEvent({
      ...pendingShellHit,
      eventId: `${pendingShellHit.eventId}-duplicate-before-ready`
    });
  const pendingReplayControllerPaths = new Map(
    pendingReplaySession.racerStates.map((racer) => [
      racer.id,
      "remote-snapshot" as const
    ])
  );

  pendingReplaySession.tick(0.04, {
    controllerPaths: pendingReplayControllerPaths
  });

  const pendingStunBeforeHitTime = pendingReplayTarget.stunSeconds;

  const pendingReadyTickResult = pendingReplaySession.tick(0.02, {
    controllerPaths: pendingReplayControllerPaths
  });

  const pendingElapsedSinceHitSeconds = Math.max(
    0,
    pendingReadyTickResult.elapsedSeconds - pendingShellHit.elapsedSeconds
  );
  const pendingStunAfterHitTime = pendingReplayTarget.stunSeconds;
  const pendingSpeedAfterHitTime = pendingReplayTarget.speed;
  const pendingDuplicateAfterHitAccepted =
    pendingReplaySession.applyShellHitEvent({
      ...pendingShellHit,
      eventId: `${pendingShellHit.eventId}-duplicate-after-ready`
    });

  assertEqual(
    pendingShellHitAccepted,
    true,
    "future authoritative shell hit event is accepted"
  );
  assertEqual(
    pendingShellCountAfterApply,
    0,
    "future authoritative shell hit immediately resolves active shell"
  );
  assertEqual(
    pendingDuplicateShellHitAccepted,
    false,
    "future authoritative shell duplicate is ignored before hit time"
  );
  assertEqual(
    pendingStunBeforeHitTime,
    0,
    "future authoritative shell hit does not apply before hit time"
  );
  assertAlmostEqual(
    pendingStunAfterHitTime,
    Math.max(
      0,
      pendingShellHit.effect.stunSeconds - pendingElapsedSinceHitSeconds
    ),
    "future authoritative shell hit applies elapsed-aligned stun once at hit time"
  );
  assertAlmostEqual(
    pendingSpeedAfterHitTime,
    pendingShellHit.effect.speedAfterHit,
    "future authoritative shell hit applies host speed result once"
  );
  assertEqual(
    pendingDuplicateAfterHitAccepted,
    false,
    "future authoritative shell duplicate is ignored after hit time"
  );

  const sweptSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const sweptOwner = requireRacerState(
    sweptSession.humanRacerStates[0],
    "swept shell hitbox owner racer"
  );
  const sweptTarget = requireRacerState(
    sweptSession.humanRacerStates[1],
    "swept shell hitbox target racer"
  );
  const sweptShell = spawnShellForValidation(sweptSession, sweptOwner);
  const sweptDirection = { ...sweptShell.direction };
  const sweptHeadingRadians = Math.atan2(
    sweptDirection.x,
    sweptDirection.z
  );
  const sweptForward = forwardFromHeading(sweptHeadingRadians);

  sweptTarget.headingRadians = sweptHeadingRadians;
  sweptTarget.forward = {
    x: sweptForward.x,
    y: 0,
    z: sweptForward.z
  };
  sweptTarget.velocity = { x: 0, y: 0, z: 0 };
  sweptTarget.speed = 0;
  sweptTarget.position = {
    x: sweptShell.position.x + sweptDirection.x * 3,
    y: sweptShell.position.y,
    z: sweptShell.position.z + sweptDirection.z * 3
  };
  let sweptTargetBounds = refreshRacerCollisionBounds(sweptTarget);
  const sweptClearDistance =
    sweptTargetBounds.halfLength + sweptShell.radius + 0.35;

  sweptTarget.position = {
    x:
      sweptShell.position.x +
      sweptDirection.x * (sweptClearDistance + 0.35),
    y: sweptShell.position.y,
    z:
      sweptShell.position.z +
      sweptDirection.z * (sweptClearDistance + 0.35)
  };
  sweptTargetBounds = refreshRacerCollisionBounds(sweptTarget);
  sweptShell.armedSeconds = 0;
  sweptShell.position = {
    x:
      sweptTargetBounds.center.x -
      sweptDirection.x * sweptClearDistance,
    y: sweptTargetBounds.center.y,
    z:
      sweptTargetBounds.center.z -
      sweptDirection.z * sweptClearDistance
  };
  sweptShell.velocity = {
    x: sweptDirection.x * shellConfig.speed,
    y: 0,
    z: sweptDirection.z * shellConfig.speed
  };
  const sweptTickSeconds = (sweptClearDistance * 2 + 0.6) / sweptShell.speed;
  const sweptFinalCenterDistance =
    -sweptClearDistance + sweptShell.speed * sweptTickSeconds;

  assertGreaterThan(
    sweptFinalCenterDistance,
    sweptClearDistance,
    "swept shell final center passes fully beyond target hitbox"
  );

  const sweptTickResult = sweptSession.tick(sweptTickSeconds);
  const sweptShellHit = sweptTickResult.shellHits[0];

  assertEqual(
    sweptTickResult.shellHits.length,
    1,
    "swept shell crossing emits one shell-hit event"
  );

  if (sweptShellHit === undefined) {
    throw new Error("Expected swept shell-hit event.");
  }

  assertStringEqual(
    sweptShellHit.targetRacerId,
    sweptTarget.id,
    "swept shell hit target racer id"
  );
  assertEqual(
    sweptSession.shellProjectileStates.length,
    0,
    "swept shell despawns after crossing hitbox"
  );

  const sweptImpactTravelDistance =
    (sweptShellHit.impact.shellPosition.x - sweptTargetBounds.center.x) *
      sweptDirection.x +
    (sweptShellHit.impact.shellPosition.z - sweptTargetBounds.center.z) *
      sweptDirection.z;

  assertBetween(
    sweptImpactTravelDistance,
    -sweptClearDistance,
    sweptClearDistance,
    "swept shell impact point lies along crossed hitbox span"
  );

  const movingSweptSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const movingSweptOwner = requireRacerState(
    movingSweptSession.humanRacerStates[0],
    "moving swept shell owner racer"
  );
  const movingSweptTarget = requireRacerState(
    movingSweptSession.humanRacerStates[1],
    "moving swept shell target racer"
  );
  const movingSweptShell = spawnShellForValidation(
    movingSweptSession,
    movingSweptOwner
  );
  const movingSweptDirection = { ...movingSweptShell.direction };
  const movingSweptLateral = {
    x: -movingSweptDirection.z,
    z: movingSweptDirection.x
  };
  const movingSweptHeadingRadians = Math.atan2(
    movingSweptDirection.x,
    movingSweptDirection.z
  );
  const movingSweptForward = forwardFromHeading(movingSweptHeadingRadians);
  const movingSweptTickSeconds = 1 / 15;
  const movingSweptShellStart = { ...movingSweptShell.position };
  const movingSweptShellTravel =
    movingSweptShell.speed * movingSweptTickSeconds;
  const movingSweptCrossingPoint = {
    x:
      movingSweptShellStart.x +
      movingSweptDirection.x * movingSweptShellTravel * 0.5,
    y: movingSweptShellStart.y,
    z:
      movingSweptShellStart.z +
      movingSweptDirection.z * movingSweptShellTravel * 0.5
  };
  const movingSweptStartLateralOffset = 3.25;
  const movingSweptTargetTravel = movingSweptStartLateralOffset * 2 + 0.45;
  const movingSweptTargetKnockbackSpeed =
    movingSweptTargetTravel / movingSweptTickSeconds + 3;

  movingSweptTarget.position = {
    x:
      movingSweptCrossingPoint.x +
      movingSweptLateral.x * movingSweptStartLateralOffset,
    y: movingSweptCrossingPoint.y,
    z:
      movingSweptCrossingPoint.z +
      movingSweptLateral.z * movingSweptStartLateralOffset
  };
  movingSweptTarget.headingRadians = movingSweptHeadingRadians;
  movingSweptTarget.forward = {
    x: movingSweptForward.x,
    y: 0,
    z: movingSweptForward.z
  };
  movingSweptTarget.speed = 0;
  movingSweptTarget.velocity = { x: 0, y: 0, z: 0 };
  movingSweptTarget.knockbackVelocity = {
    x: -movingSweptLateral.x * movingSweptTargetKnockbackSpeed,
    y: 0,
    z: -movingSweptLateral.z * movingSweptTargetKnockbackSpeed
  };
  movingSweptShell.armedSeconds = 0;
  refreshRacerCollisionBounds(movingSweptTarget);
  movingSweptSession.setHumanInput(movingSweptTarget.id, {
    throttle: 0,
    brake: 0,
    steer: 0,
    useItem: false
  });

  const movingSweptTickResult =
    movingSweptSession.tick(movingSweptTickSeconds);
  const movingSweptShellHit = movingSweptTickResult.shellHits[0];

  assertEqual(
    movingSweptTickResult.shellHits.length,
    1,
    "moving swept shell crossing emits one shell-hit event"
  );

  if (movingSweptShellHit === undefined) {
    throw new Error("Expected moving swept shell-hit event.");
  }

  assertStringEqual(
    movingSweptShellHit.targetRacerId,
    movingSweptTarget.id,
    "moving swept shell hit target racer id"
  );
  assertEqual(
    movingSweptSession.shellProjectileStates.length,
    0,
    "moving swept shell despawns after crossing hitbox"
  );

  const movingSweptImpactTravelDistance = getPlanarProjection(
    movingSweptShellHit.impact.shellPosition,
    movingSweptShellStart,
    movingSweptDirection
  );

  assertBetween(
    movingSweptImpactTravelDistance,
    0,
    movingSweptShellTravel,
    "moving swept shell impact point lies within shell tick travel"
  );

  const movingSweptFinalLateralSeparation = Math.abs(
    getPlanarProjection(
      movingSweptTarget.position,
      movingSweptCrossingPoint,
      movingSweptLateral
    )
  );
  const movingSweptTargetBoundsAfter =
    refreshRacerCollisionBounds(movingSweptTarget);

  assertGreaterThan(
    movingSweptFinalLateralSeparation,
    movingSweptTargetBoundsAfter.halfWidth + movingSweptShell.radius,
    "moving swept shell target ends beyond current-frame shell overlap"
  );

  const alreadyHitTargetSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const alreadyHitOwner = requireRacerState(
    alreadyHitTargetSession.humanRacerStates[0],
    "already-hit shell target owner racer"
  );
  const alreadyHitTarget = requireRacerState(
    alreadyHitTargetSession.humanRacerStates[1],
    "already-hit shell target racer"
  );
  const alreadyHitShell = spawnShellForValidation(
    alreadyHitTargetSession,
    alreadyHitOwner
  );

  placeRacerForShellHitboxValidation(alreadyHitOwner, 7);
  placeRacerForShellHitboxValidation(alreadyHitTarget, 2);
  alreadyHitTarget.itemHitImmunitySeconds = 0;
  alreadyHitTarget.hitSourceImmunitySecondsBySource[
    `shell:${alreadyHitShell.id}`
  ] = 1;
  const alreadyHitTargetBounds = refreshRacerCollisionBounds(alreadyHitTarget);

  alreadyHitShell.armedSeconds = 0;
  alreadyHitShell.position = { ...alreadyHitTargetBounds.center };
  alreadyHitShell.velocity = {
    x: -shellConfig.speed,
    y: 0,
    z: 0
  };

  const alreadyHitTargetTickResult = alreadyHitTargetSession.tick(0);

  assertEqual(
    alreadyHitTargetTickResult.shellHits.length,
    0,
    "already-hit target source immunity suppresses repeated shell-hit event"
  );
  assertEqual(
    alreadyHitTargetSession.shellProjectileStates.length,
    1,
    "already-hit target does not consume overlapping shell"
  );

  const expiredShellSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const expiredShellOwner = requireRacerState(
    expiredShellSession.humanRacerStates[0],
    "expired shell owner racer"
  );
  const expiredShellTarget = requireRacerState(
    expiredShellSession.humanRacerStates[1],
    "expired shell target racer"
  );
  const expiredShell = spawnShellForValidation(
    expiredShellSession,
    expiredShellOwner
  );

  placeRacerForShellHitboxValidation(expiredShellOwner, 7);
  placeRacerForShellHitboxValidation(expiredShellTarget, 2);
  const expiredShellTargetBounds = refreshRacerCollisionBounds(
    expiredShellTarget
  );

  expiredShell.armedSeconds = 0;
  expiredShell.ttlSeconds = 0;
  expiredShell.position = { ...expiredShellTargetBounds.center };
  expiredShell.velocity = {
    x: -shellConfig.speed,
    y: 0,
    z: 0
  };

  const expiredShellTickResult = expiredShellSession.tick(0);

  assertEqual(
    expiredShellTickResult.shellHits.length,
    0,
    "expired shell projectile does not scan overlapping target"
  );
  assertEqual(
    expiredShellSession.shellProjectileStates.length,
    0,
    "expired shell projectile despawns without consuming target"
  );

  const missSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const missOwner = requireRacerState(
    missSession.humanRacerStates[0],
    "shell hitbox miss owner racer"
  );
  const missTarget = requireRacerState(
    missSession.humanRacerStates[1],
    "shell hitbox miss target racer"
  );
  const missShell = spawnShellForValidation(missSession, missOwner);

  placeRacerForShellHitboxValidation(missOwner, 7);
  placeRacerForShellHitboxValidation(missTarget, 2);
  missTarget.headingRadians = 0;
  const missTargetBounds = refreshRacerCollisionBounds(missTarget);

  missShell.armedSeconds = 0;
  missShell.position = {
    x:
      missTargetBounds.center.x +
      missTargetBounds.right.x *
        (missTargetBounds.halfWidth + missShell.radius + 0.05),
    y: missTargetBounds.center.y,
    z:
      missTargetBounds.center.z +
      missTargetBounds.right.z *
        (missTargetBounds.halfWidth + missShell.radius + 0.05)
  };
  missShell.velocity = { x: 0, y: 0, z: 0 };

  const missTickResult = missSession.tick(0);

  assertEqual(
    missTickResult.shellHits.length,
    0,
    "shell-hit event count outside oriented hitbox"
  );
  assertEqual(
    missSession.shellProjectileStates.length,
    1,
    "shell remains active after near miss outside hitbox"
  );

  return {
    eventId: shellHit.eventId,
    shellId: shellHit.shellId,
    sourceRacerId: shellHit.sourceRacerId,
    targetRacerId: shellHit.targetRacerId,
    targetSlotIndex: shellHit.targetSlotIndex,
    hitboxPenetrationDepth: shellHit.impact.penetrationDepth,
    impactRelativeSpeed: shellHit.impact.relativeSpeed,
    targetStunSeconds,
    targetSpinoutSeconds,
    targetSpinoutAngularVelocity,
    configuredTargetSpinoutSeconds: configuredTarget.spinoutSeconds,
    targetHitImmunitySeconds,
    targetHitFeedbackSeconds,
    targetSpeedAfterHit,
    targetHeadingAfterSpinoutTick,
    shellCountAfterHit,
    immuneShellCountAfterOverlap,
    immuneShellHitEventCount: immuneTickResult.shellHits.length,
    immunitySecondsAfterExpiry: hitTarget.itemHitImmunitySeconds,
    postSpinoutDuplicateShellHitEventCount:
      postSpinoutDuplicateTickResult.shellHits.length,
    postSpinoutDuplicateRemainingShellCount,
    spinoutSecondsAfterPostSpinoutDuplicate: hitTarget.spinoutSeconds,
    speedAfterPostSpinoutDuplicate,
    simultaneousShellHitEventCount: simultaneousTickResult.shellHits.length,
    simultaneousTargetSpeedAfterHit: simultaneousTarget.speed,
    simultaneousRemainingShellCount:
      simultaneousSession.shellProjectileStates.length,
    pendingShellHitAccepted,
    pendingDuplicateShellHitAccepted,
    pendingDuplicateAfterHitAccepted,
    pendingShellCountAfterApply,
    pendingStunBeforeHitTime,
    pendingStunAfterHitTime,
    pendingSpeedAfterHitTime,
    sweptShellHitEventCount: sweptTickResult.shellHits.length,
    sweptShellTargetRacerId: sweptShellHit.targetRacerId,
    sweptShellsAfterHit: sweptSession.shellProjectileStates.length,
    sweptImpactTravelDistance,
    sweptFinalCenterDistance,
    movingSweptShellHitEventCount: movingSweptTickResult.shellHits.length,
    movingSweptShellTargetRacerId: movingSweptShellHit.targetRacerId,
    movingSweptShellsAfterHit:
      movingSweptSession.shellProjectileStates.length,
    movingSweptImpactTravelDistance,
    movingSweptFinalLateralSeparation,
    alreadyHitTargetShellHitEventCount:
      alreadyHitTargetTickResult.shellHits.length,
    alreadyHitTargetRemainingShellCount:
      alreadyHitTargetSession.shellProjectileStates.length,
    expiredShellHitEventCount: expiredShellTickResult.shellHits.length,
    expiredShellRemainingCount: expiredShellSession.shellProjectileStates.length,
    missShellCount: missSession.shellProjectileStates.length,
    missEventCount: missTickResult.shellHits.length
  };
}

export function validateShellObstacleCollisionBehavior(): ShellObstacleCollisionValidationResult {
  const tireScenario = createShellObstacleCollisionScenario(
    "tire-stack",
    "shell obstacle tire-stack stop"
  );
  const tireInitialDirection = { ...tireScenario.shell.direction };
  const tireTickResult = tireScenario.raceSession.tick(
    tireScenario.tickSeconds
  );
  const tireStoppedShell = requireShellProjectileState(
    tireScenario.raceSession.shellProjectileStates.find(
      (shell) => shell.id === tireScenario.shell.id
    ),
    "stopped shell after tire-stack contact"
  );
  const tireForwardDot =
    tireStoppedShell.direction.x * tireInitialDirection.x +
    tireStoppedShell.direction.z * tireInitialDirection.z;
  const tireVelocityAfterHit = getPlanarDistance(
    tireStoppedShell.velocity,
    { x: 0, z: 0 }
  );
  const tireShellCountAfterHit =
    tireScenario.raceSession.shellProjectileStates.length;
  const tireSpeedAfterHit = tireStoppedShell.speed;
  const tireArmedSecondsAfterHit = tireStoppedShell.armedSeconds;

  assertEqual(
    tireTickResult.shellHits.length,
    0,
    "tire-stack shell obstacle contact does not create racer hit"
  );
  assertEqual(
    tireShellCountAfterHit,
    1,
    "tire-stack shell obstacle contact keeps shell briefly active"
  );
  assertAlmostEqual(
    tireForwardDot,
    1,
    "tire-stack shell obstacle contact retains captured shell direction"
  );
  assertAlmostEqual(
    tireSpeedAfterHit,
    0,
    "tire-stack shell obstacle contact stops shell speed"
  );
  assertAlmostEqual(
    tireVelocityAfterHit,
    0,
    "tire-stack shell obstacle contact stops shell velocity"
  );
  assertGreaterThan(
    tireArmedSecondsAfterHit,
    0,
    "tire-stack stopped shell remains inert while lingering"
  );

  let tireStoppedLingerTicks = 0;
  const maximumTireStoppedLingerTicks = 60;

  while (tireScenario.raceSession.shellProjectileStates.length > 0) {
    tireScenario.raceSession.tick(1 / 60);
    tireStoppedLingerTicks += 1;

    if (tireStoppedLingerTicks > maximumTireStoppedLingerTicks) {
      throw new Error("Expected stopped shell to despawn after tire-stack linger.");
    }
  }

  const destroyedScenario = createShellObstacleCollisionScenario(
    "oil-drum",
    "shell obstacle destruction"
  );

  destroyedScenario.raceSession.tick(destroyedScenario.tickSeconds);

  assertEqual(
    destroyedScenario.raceSession.shellProjectileStates.length,
    0,
    "oil-drum shell obstacle collision destroys shell"
  );

  const stoppedScenario = createShellObstacleCollisionScenario(
    "cone-pack",
    "shell obstacle stop"
  );

  stoppedScenario.raceSession.tick(stoppedScenario.tickSeconds);
  const stoppedShell = requireShellProjectileState(
    stoppedScenario.raceSession.shellProjectileStates.find(
      (shell) => shell.id === stoppedScenario.shell.id
    ),
    "stopped shell after cone-pack contact"
  );
  const stoppedVelocityAfterHit = getPlanarDistance(
    stoppedShell.velocity,
    { x: 0, z: 0 }
  );
  const stoppedShellCountAfterHit =
    stoppedScenario.raceSession.shellProjectileStates.length;
  const stoppedSpeedAfterHit = stoppedShell.speed;
  const stoppedArmedSecondsAfterHit = stoppedShell.armedSeconds;

  assertEqual(
    stoppedShellCountAfterHit,
    1,
    "cone-pack shell obstacle collision keeps stopped shell briefly active"
  );
  assertAlmostEqual(
    stoppedSpeedAfterHit,
    0,
    "cone-pack shell obstacle collision stops shell speed"
  );
  assertAlmostEqual(
    stoppedVelocityAfterHit,
    0,
    "cone-pack shell obstacle collision stops shell velocity"
  );
  assertGreaterThan(
    stoppedArmedSecondsAfterHit,
    0,
    "cone-pack stopped shell remains inert while lingering"
  );

  let stoppedLingerTicks = 0;
  const maximumStoppedLingerTicks = 60;

  while (stoppedScenario.raceSession.shellProjectileStates.length > 0) {
    stoppedScenario.raceSession.tick(1 / 60);
    stoppedLingerTicks += 1;

    if (stoppedLingerTicks > maximumStoppedLingerTicks) {
      throw new Error("Expected stopped shell to despawn after cone-pack linger.");
    }
  }

  return {
    tireObstacleId: tireScenario.obstacle.id,
    tireObstacleKind: tireScenario.obstacle.obstacleKind,
    tireShellCountAfterHit,
    tireForwardDot,
    tireSpeedAfterHit,
    tireVelocityAfterHit,
    tireArmedSecondsAfterHit,
    tireShellCountAfterLinger:
      tireScenario.raceSession.shellProjectileStates.length,
    destroyedObstacleId: destroyedScenario.obstacle.id,
    destroyedObstacleKind: destroyedScenario.obstacle.obstacleKind,
    destroyedShellCount: destroyedScenario.raceSession.shellProjectileStates.length,
    stoppedObstacleId: stoppedScenario.obstacle.id,
    stoppedObstacleKind: stoppedScenario.obstacle.obstacleKind,
    stoppedShellCountAfterHit,
    stoppedSpeedAfterHit,
    stoppedVelocityAfterHit,
    stoppedArmedSecondsAfterHit,
    stoppedShellCountAfterLinger:
      stoppedScenario.raceSession.shellProjectileStates.length
  };
}

export function validateBananaObstacleWorldState(): BananaObstacleWorldStateValidationResult {
  const banana = COMBAT_ITEM_REGISTRY.banana;
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const racer = requireRacerState(
    raceSession.humanRacerStates[0],
    "banana obstacle racer"
  );
  const startPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const headingForward = forwardFromHeading(headingRadians);
  const staleForward = forwardFromHeading(headingRadians + Math.PI / 2);

  racer.position = { ...startPoint.position };
  racer.forward = { x: staleForward.x, y: 0, z: staleForward.z };
  racer.headingRadians = headingRadians;
  racer.heldItem = banana.type;

  const dropPosition = { ...racer.position };

  raceSession.setHumanInput(racer.id, { useItem: true });
  const dropTickResult = raceSession.tick(0);
  const bananaUseAction = dropTickResult.itemUseActions[0];
  const bananaObstacle = raceSession.bananaObstacleStates[0];
  const bananaEntity = raceSession.bananaHazardEntityStates[0];

  assertEqual(
    dropTickResult.itemUseActions.length,
    1,
    "banana obstacle item-use action count"
  );
  assertEqual(
    raceSession.bananaObstacleStates.length,
    1,
    "banana obstacle world-state count"
  );
  assertNull(racer.heldItem, "held banana item after item-use input");

  if (bananaUseAction === undefined) {
    throw new Error("Expected banana-use action after item-use input.");
  }

  if (bananaUseAction.activeItemId === null) {
    throw new Error("Expected banana-use action to reference the obstacle.");
  }

  if (bananaObstacle === undefined) {
    throw new Error("Expected banana obstacle world state after item use.");
  }

  if (bananaEntity === undefined) {
    throw new Error("Expected banana hazard entity state after item use.");
  }

  const offsetX = bananaObstacle.position.x - dropPosition.x;
  const offsetZ = bananaObstacle.position.z - dropPosition.z;
  const positionBehindRacer =
    -(offsetX * headingForward.x + offsetZ * headingForward.z);
  const lateralOffset = Math.abs(
    offsetX * headingForward.z - offsetZ * headingForward.x
  );

  assertStringEqual(
    bananaUseAction.action,
    "banana-use",
    "banana obstacle action"
  );
  assertStringEqual(
    bananaUseAction.activeItemId,
    bananaObstacle.id,
    "banana obstacle stable id from item-use action"
  );
  assertStringEqual(
    bananaObstacle.type,
    banana.type,
    "banana obstacle item type"
  );
  assertStringEqual(
    bananaObstacle.obstacleKind,
    "banana",
    "banana obstacle kind"
  );
  assertStringEqual(
    bananaObstacle.ownerRacerId,
    racer.id,
    "banana obstacle owner racer id"
  );
  assertStringEqual(
    bananaObstacle.owner.racerId,
    racer.id,
    "banana obstacle owner metadata racer id"
  );
  assertEqual(
    bananaObstacle.owner.slotIndex,
    racer.slotIndex,
    "banana obstacle owner metadata slot"
  );
  assertStringEqual(
    bananaObstacle.owner.controller,
    racer.controller,
    "banana obstacle owner metadata controller"
  );
  assertStringEqual(
    bananaObstacle.bodyType,
    "static",
    "banana obstacle is a static world entity"
  );
  assertEqual(bananaObstacle.active, true, "banana obstacle active flag");
  assertAlmostEqual(
    bananaObstacle.stablePosition.x,
    bananaObstacle.position.x,
    "banana obstacle stable position x"
  );
  assertAlmostEqual(
    bananaObstacle.stablePosition.z,
    bananaObstacle.position.z,
    "banana obstacle stable position z"
  );
  assertEqual(
    dropTickResult.trackEntities.length,
    1,
    "banana hazard appears in tick track entity state"
  );
  assertStringEqual(
    bananaEntity.id,
    bananaObstacle.id,
    "banana hazard entity stable id"
  );
  assertStringEqual(
    bananaEntity.entityType,
    "banana-hazard",
    "banana hazard entity type"
  );
  assertStringEqual(
    bananaEntity.bodyType,
    "static",
    "banana hazard entity body type"
  );
  assertEqual(bananaEntity.active, true, "banana hazard entity active flag");
  assertStringEqual(
    bananaEntity.activeStatus,
    "active",
    "banana hazard entity active status"
  );
  assertAlmostEqual(
    bananaEntity.stablePosition.x,
    bananaObstacle.position.x,
    "banana hazard entity stable position x"
  );
  assertAlmostEqual(
    bananaEntity.stablePosition.z,
    bananaObstacle.position.z,
    "banana hazard entity stable position z"
  );
  assertGreaterThan(
    positionBehindRacer,
    banana.defaultRuntimeConfig.radius,
    "banana obstacle rear placement distance"
  );
  assertAlmostEqual(
    positionBehindRacer,
    BANANA_DROP_DISTANCE_BEHIND_RACER,
    "banana obstacle fixed rear placement distance"
  );
  assertAlmostEqual(lateralOffset, 0, "banana obstacle lateral placement");
  assertAlmostEqual(
    bananaObstacle.orientationRadians,
    normalizeOrientationRadians(headingRadians),
    "banana obstacle orientation"
  );

  const stableObstacleId = bananaObstacle.id;
  const stableOrientationRadians = bananaObstacle.orientationRadians;
  const stablePosition = { ...bananaObstacle.position };

  raceSession.setHumanInput(racer.id, { useItem: false });
  raceSession.tick(1 / 60);

  const persistedObstacle = raceSession.bananaObstacleStates.find(
    (obstacle) => obstacle.id === stableObstacleId
  );
  const persistedEntity = raceSession.bananaHazardEntityStates.find(
    (entity) => entity.id === stableObstacleId
  );

  if (persistedObstacle === undefined) {
    throw new Error("Expected banana obstacle to persist after world tick.");
  }

  if (persistedEntity === undefined) {
    throw new Error("Expected banana hazard entity to persist after world tick.");
  }

  assertStringEqual(
    persistedObstacle.id,
    stableObstacleId,
    "persisted banana obstacle stable id"
  );
  assertAlmostEqual(
    persistedObstacle.position.x,
    stablePosition.x,
    "persisted banana obstacle position x"
  );
  assertAlmostEqual(
    persistedObstacle.position.z,
    stablePosition.z,
    "persisted banana obstacle position z"
  );
  assertAlmostEqual(
    persistedObstacle.orientationRadians,
    stableOrientationRadians,
    "persisted banana obstacle orientation"
  );
  assertEqual(
    persistedEntity.active,
    true,
    "persisted banana hazard entity remains active"
  );
  assertAlmostEqual(
    persistedEntity.stablePosition.x,
    stablePosition.x,
    "persisted banana hazard entity stable position x"
  );
  assertAlmostEqual(
    persistedEntity.stablePosition.z,
    stablePosition.z,
    "persisted banana hazard entity stable position z"
  );

  const persistenceTickSeconds = 1 / 15;
  const persistenceTickCount = Math.ceil(
    (banana.defaultRuntimeConfig.ttlSeconds + 0.5) / persistenceTickSeconds
  );
  let postLifetimeExpiredRemovalCount = 0;

  for (let tick = 0; tick < persistenceTickCount; tick += 1) {
    const tickResult = raceSession.tick(persistenceTickSeconds);
    postLifetimeExpiredRemovalCount += tickResult.bananaRemovals.filter(
      (removal) => removal.bananaId === stableObstacleId
    ).length;
  }

  const postLifetimeObstacle = raceSession.bananaObstacleStates.find(
    (obstacle) => obstacle.id === stableObstacleId
  );
  const postLifetimeEntity = raceSession.bananaHazardEntityStates.find(
    (entity) => entity.id === stableObstacleId
  );

  if (postLifetimeObstacle === undefined) {
    throw new Error(
      "Expected banana obstacle to persist after its runtime TTL window."
    );
  }

  if (postLifetimeEntity === undefined) {
    throw new Error(
      "Expected banana hazard entity to persist after its runtime TTL window."
    );
  }

  assertEqual(
    postLifetimeExpiredRemovalCount,
    0,
    "banana hazard does not emit timer-based expired removals"
  );
  assertEqual(
    postLifetimeEntity.active,
    true,
    "banana hazard entity remains active after runtime TTL window"
  );
  assertAlmostEqual(
    postLifetimeObstacle.position.x,
    stablePosition.x,
    "post-lifetime banana obstacle position x"
  );
  assertAlmostEqual(
    postLifetimeObstacle.position.z,
    stablePosition.z,
    "post-lifetime banana obstacle position z"
  );

  return {
    obstacleId: bananaObstacle.id,
    stableObstacleId: persistedObstacle.id,
    entityId: bananaEntity.id,
    entityType: bananaEntity.entityType,
    entityBodyType: bananaEntity.bodyType,
    entityActive: bananaEntity.active,
    entityActiveStatus: bananaEntity.activeStatus,
    obstacleKind: bananaObstacle.obstacleKind,
    ownerRacerId: bananaObstacle.owner.racerId,
    ownerSlotIndex: bananaObstacle.owner.slotIndex,
    heldItemAfterUse: racer.heldItem,
    positionBehindRacer,
    expectedPositionBehindRacer: BANANA_DROP_DISTANCE_BEHIND_RACER,
    lateralOffset,
    orientationRadians: bananaObstacle.orientationRadians,
    obstacleCount: raceSession.bananaObstacleStates.length,
    entityCount: raceSession.bananaHazardEntityStates.length,
    activeEntityCount: raceSession.activeBananaHazardEntityStates.length,
    postLifetimeObstacleCount: raceSession.bananaObstacleStates.length,
    postLifetimeExpiredRemovalCount,
    postLifetimeActiveEntityCount: raceSession.activeBananaHazardEntityStates.length
  };
}

export function validateBananaCleanupRules(): BananaCleanupRulesValidationResult {
  const capSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const capOwner = requireRacerState(
    capSession.humanRacerStates[0],
    "banana cap cleanup owner"
  );
  const capStartPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const capHeading =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const spawnedBananaIds: string[] = [];
  let hazardCapRemovalCount = 0;
  let hazardCapRemovalReason = "";

  parkOtherRacersAwayFromShellPath(capSession, capOwner.id);
  setStationaryRacerPose(capOwner, capStartPoint.position, capHeading);

  for (let spawnIndex = 0; spawnIndex <= MAX_ACTIVE_BANANA_HAZARDS; spawnIndex += 1) {
    const existingBananaIds = new Set(
      capSession.bananaObstacleStates.map((banana) => banana.id)
    );

    capOwner.itemUseCooldownSeconds = 0;
    capOwner.heldItem = COMBAT_ITEM_REGISTRY.banana.type;
    capSession.setHumanInput(capOwner.id, { useItem: true });

    const tickResult = capSession.tick(0);
    const spawnedBanana = capSession.bananaObstacleStates.find(
      (banana) => !existingBananaIds.has(banana.id)
    );

    if (spawnedBanana === undefined) {
      throw new Error("Expected hazard-cap validation to spawn a banana.");
    }

    spawnedBananaIds.push(spawnedBanana.id);

    if (spawnIndex < MAX_ACTIVE_BANANA_HAZARDS) {
      assertEqual(
        tickResult.bananaRemovals.length,
        0,
        "banana hazard cap stays inactive below limit"
      );
      continue;
    }

    const hazardCapRemoval = tickResult.bananaRemovals.find(
      (removal) => removal.reason === "hazard-cap"
    );

    if (hazardCapRemoval === undefined) {
      throw new Error("Expected hazard cap cleanup to emit a removal event.");
    }

    hazardCapRemovalCount = tickResult.bananaRemovals.length;
    hazardCapRemovalReason = hazardCapRemoval.reason;
    assertStringEqual(
      hazardCapRemoval.bananaId,
      spawnedBananaIds[0] ?? "",
      "hazard cap removes oldest banana"
    );
  }

  const hazardCapRemovedOldest = !capSession.bananaObstacleStates.some(
    (banana) => banana.id === spawnedBananaIds[0]
  );
  const cappedEntity = capSession.bananaHazardEntityStates.find(
    (entity) => entity.id === spawnedBananaIds[0]
  );

  if (cappedEntity === undefined) {
    throw new Error("Expected hazard-capped banana entity to remain recorded.");
  }

  assertEqual(
    capSession.bananaObstacleStates.length,
    MAX_ACTIVE_BANANA_HAZARDS,
    "hazard cap keeps active banana count bounded"
  );
  assertEqual(
    hazardCapRemovedOldest,
    true,
    "hazard cap removes the oldest active banana"
  );
  assertStringEqual(
    cappedEntity.deactivationReason ?? "",
    "hazard-cap",
    "hazard-capped banana entity deactivation reason"
  );

  const outOfBoundsSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const outOfBoundsOwner = requireRacerState(
    outOfBoundsSession.humanRacerStates[0],
    "banana out-of-bounds cleanup owner"
  );
  const outOfBoundsBanana = spawnBananaForValidation(
    outOfBoundsSession,
    outOfBoundsOwner
  );

  outOfBoundsBanana.position = {
    x:
      DEFAULT_RACE_TRACK_STATE.bounds.maxX +
      outOfBoundsBanana.radius +
      DEFAULT_RACE_TRACK_STATE.width,
    y: 0,
    z:
      DEFAULT_RACE_TRACK_STATE.bounds.maxZ +
      outOfBoundsBanana.radius +
      DEFAULT_RACE_TRACK_STATE.width
  };

  const outOfBoundsTick = outOfBoundsSession.tick(0);
  const outOfBoundsRemoval = outOfBoundsTick.bananaRemovals.find(
    (removal) => removal.bananaId === outOfBoundsBanana.id
  );

  if (outOfBoundsRemoval === undefined) {
    throw new Error("Expected out-of-bounds banana cleanup removal event.");
  }

  const outOfBoundsEntity = outOfBoundsSession.bananaHazardEntityStates.find(
    (entity) => entity.id === outOfBoundsBanana.id
  );

  if (outOfBoundsEntity === undefined) {
    throw new Error("Expected out-of-bounds banana entity to remain recorded.");
  }

  assertStringEqual(
    outOfBoundsRemoval.reason,
    "out-of-bounds",
    "out-of-bounds banana removal reason"
  );
  assertStringEqual(
    outOfBoundsEntity.deactivationReason ?? "",
    "out-of-bounds",
    "out-of-bounds banana entity deactivation reason"
  );
  assertEqual(
    outOfBoundsSession.bananaObstacleStates.length,
    0,
    "out-of-bounds cleanup removes active banana"
  );
  assertEqual(
    outOfBoundsSession.activeBananaHazardEntityStates.length,
    0,
    "out-of-bounds cleanup clears active hazard entity"
  );

  return {
    maxActiveBananaHazards: MAX_ACTIVE_BANANA_HAZARDS,
    hazardCapRemovalCount,
    hazardCapRemovalReason,
    hazardCapRemovedOldest,
    hazardCapActiveBananaCount: capSession.bananaObstacleStates.length,
    outOfBoundsRemovalCount: outOfBoundsTick.bananaRemovals.length,
    outOfBoundsRemovalReason: outOfBoundsRemoval.reason,
    outOfBoundsActiveBananaCount:
      outOfBoundsSession.bananaObstacleStates.length,
    outOfBoundsActiveEntityCount:
      outOfBoundsSession.activeBananaHazardEntityStates.length
  };
}

export function validateBananaHazardCollisionConsumption(): BananaHazardCollisionValidationResult {
  const banana = COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig;
  const hitSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const hitOwner = requireRacerState(
    hitSession.humanRacerStates[0],
    "banana collision owner racer"
  );
  const hitTarget = requireRacerState(
    hitSession.humanRacerStates[1],
    "banana collision target racer"
  );
  const hitBanana = spawnBananaForValidation(hitSession, hitOwner);

  placeRacerForShellHitboxValidation(hitOwner, 7);
  placeRacerForShellHitboxValidation(hitTarget, 2);
  hitTarget.headingRadians = 0;
  hitTarget.forward = { x: 0, y: 0, z: 1 };
  hitTarget.speed = 12;
  hitTarget.velocity = { x: 0, y: 0, z: 12 };
  const hitTargetBounds = refreshRacerCollisionBounds(hitTarget);
  const initialTargetHeading = hitTarget.headingRadians;

  hitBanana.armedSeconds = 0;
  hitBanana.position = {
    x:
      hitTargetBounds.center.x +
      hitTargetBounds.right.x *
        (hitTargetBounds.halfWidth + hitBanana.radius - 0.05),
    y: hitTargetBounds.center.y,
    z:
      hitTargetBounds.center.z +
      hitTargetBounds.right.z *
        (hitTargetBounds.halfWidth + hitBanana.radius - 0.05)
  };
  hitBanana.velocity = { x: 0, y: 0, z: 0 };

  const hitTickResult = hitSession.tick(0);
  const bananaHit = hitTickResult.bananaHits[0];
  const targetHeadingDelta = getSignedAngleDeltaRadians(
    hitTarget.headingRadians,
    initialTargetHeading
  );

  assertEqual(
    hitTickResult.shellHits.length,
    0,
    "banana hazard does not emit shell-hit events"
  );
  assertEqual(
    hitTickResult.bananaHits.length,
    1,
    "banana hazard emits banana-hit event"
  );

  if (bananaHit === undefined) {
    throw new Error("Expected banana-hit event for banana hazard collision.");
  }

  assertStringEqual(bananaHit.itemType, "banana", "banana-hit item type");
  assertStringEqual(bananaHit.bananaId, hitBanana.id, "banana-hit source id");
  assertStringEqual(
    bananaHit.sourceRacerId,
    hitOwner.id,
    "banana-hit source racer id"
  );
  assertStringEqual(
    bananaHit.targetRacerId,
    hitTarget.id,
    "banana-hit target racer id"
  );
  assertAlmostEqual(
    bananaHit.effect.spinoutSeconds,
    banana.spinoutSeconds,
    "banana-hit event spinout seconds"
  );
  assertAlmostEqual(
    bananaHit.effect.hitFeedbackSeconds,
    banana.hitFeedbackSeconds,
    "banana-hit event feedback seconds"
  );
  assertEqual(
    hitSession.bananaObstacleStates.length,
    0,
    "banana hazard is consumed after target collision"
  );
  const hitBananaEntity = hitSession.bananaHazardEntityStates.find(
    (entity) => entity.id === hitBanana.id
  );

  if (hitBananaEntity === undefined) {
    throw new Error("Expected consumed banana hazard entity to remain in state.");
  }

  assertEqual(
    hitBananaEntity.active,
    false,
    "consumed banana hazard entity active flag"
  );
  assertStringEqual(
    hitBananaEntity.activeStatus,
    "inactive",
    "consumed banana hazard entity active status"
  );
  assertStringEqual(
    hitBananaEntity.deactivationReason ?? "",
    "collision",
    "consumed banana hazard entity deactivation reason"
  );
  assertEqual(
    hitSession.activeBananaHazardEntityStates.length,
    0,
    "consumed banana hazard leaves no active entity state"
  );
  assertAlmostEqual(
    hitTarget.stunSeconds,
    banana.hitStunSeconds,
    "banana hazard target stun timer"
  );
  assertAlmostEqual(
    hitTarget.spinoutSeconds,
    banana.spinoutSeconds,
    "banana hazard target spinout timer"
  );
  assertGreaterThan(
    Math.abs(hitTarget.spinoutAngularVelocity),
    0,
    "banana hazard target spinout angular velocity"
  );
  assertAlmostEqual(
    hitTarget.speed,
    12 * banana.hitSpeedFactor,
    "banana hazard target speed damping"
  );
  assertAlmostEqual(
    targetHeadingDelta,
    -banana.spinRadians,
    "banana hazard target spin"
  );
  assertStringEqual(
    hitTarget.lastHitItemType ?? "",
    "banana",
    "banana hazard target hit feedback item type"
  );
  assertEqual(hitOwner.stunSeconds, 0, "banana owner is not hit");

  hitTarget.speed = 12;
  hitTarget.velocity = { x: 0, y: 0, z: 12 };
  hitTarget.stunSeconds = 0;
  hitTarget.spinoutSeconds = 0;
  hitTarget.spinoutAngularVelocity = 0;
  hitTarget.itemHitImmunitySeconds = 0;
  hitTarget.itemHitImmunityWindowSeconds = 0;
  hitTarget.hitFeedbackSeconds = 0;
  hitTarget.recoverySeconds = 0;
  hitTarget.recoveryDurationSeconds = 0;
  hitTarget.recovering = false;
  hitTarget.lastHitItemType = null;
  delete hitTarget.timedEffects.stun;
  delete hitTarget.timedEffects.spinout;
  delete hitTarget.timedEffects.itemHitImmunity;
  delete hitTarget.timedEffects.hitFeedback;
  delete hitTarget.hitSourceImmunitySecondsBySource[`banana:${hitBanana.id}`];

  const repeatHitTickResult = hitSession.tick(0);

  assertEqual(
    repeatHitTickResult.bananaHits.length,
    0,
    "consumed banana cannot emit a repeat hit after immunity clears"
  );
  assertEqual(
    repeatHitTickResult.bananaRemovals.length,
    0,
    "consumed banana cannot emit a repeat removal"
  );
  assertEqual(
    hitSession.bananaObstacleStates.length,
    0,
    "consumed banana remains inactive after repeat overlap"
  );
  assertEqual(
    hitTarget.spinoutSeconds,
    0,
    "consumed banana does not restart spinout on repeat overlap"
  );
  assertAlmostEqual(
    hitTarget.speed,
    12,
    "consumed banana does not damp speed on repeat overlap"
  );

  const multiSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const multiOwner = requireRacerState(
    multiSession.humanRacerStates[0],
    "multi banana collision owner racer"
  );
  const multiTarget = requireRacerState(
    multiSession.humanRacerStates[1],
    "multi banana collision target racer"
  );
  const triggeredBanana = spawnBananaForValidation(multiSession, multiOwner);
  const sparedBanana = spawnAdditionalBananaForValidation(
    multiSession,
    multiOwner,
    "spared multi banana"
  );

  placeRacerForShellHitboxValidation(multiOwner, 7);
  placeRacerForShellHitboxValidation(multiTarget, 2);
  multiTarget.headingRadians = 0;
  multiTarget.forward = { x: 0, y: 0, z: 1 };
  multiTarget.speed = 12;
  multiTarget.velocity = { x: 0, y: 0, z: 12 };

  const multiTargetBounds = refreshRacerCollisionBounds(multiTarget);

  triggeredBanana.armedSeconds = 0;
  triggeredBanana.position = {
    x:
      multiTargetBounds.center.x +
      multiTargetBounds.right.x *
        (multiTargetBounds.halfWidth + triggeredBanana.radius - 0.05),
    y: multiTargetBounds.center.y,
    z:
      multiTargetBounds.center.z +
      multiTargetBounds.right.z *
        (multiTargetBounds.halfWidth + triggeredBanana.radius - 0.05)
  };
  triggeredBanana.velocity = { x: 0, y: 0, z: 0 };
  sparedBanana.armedSeconds = 0;

  const multiHitTickResult = multiSession.tick(0);
  const remainingMultiBanana = multiSession.bananaObstacleStates[0];

  assertEqual(
    multiHitTickResult.bananaHits.length,
    1,
    "multi-banana overlap emits one banana-hit event"
  );
  assertStringEqual(
    multiHitTickResult.bananaHits[0]?.bananaId ?? "",
    triggeredBanana.id,
    "multi-banana hit references triggered banana"
  );
  assertEqual(
    multiHitTickResult.bananaRemovals.length,
    1,
    "multi-banana overlap emits one banana removal"
  );
  assertStringEqual(
    multiHitTickResult.bananaRemovals[0]?.bananaId ?? "",
    triggeredBanana.id,
    "multi-banana removal references triggered banana"
  );
  assertEqual(
    multiSession.bananaObstacleStates.length,
    1,
    "multi-banana overlap removes only triggered banana"
  );
  assertStringEqual(
    remainingMultiBanana?.id ?? "",
    sparedBanana.id,
    "multi-banana overlap leaves non-triggered banana active"
  );

  const ignoredSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const ignoredOwner = requireRacerState(
    ignoredSession.humanRacerStates[0],
    "ignored spinout banana owner racer"
  );
  const ignoredTarget = requireRacerState(
    ignoredSession.humanRacerStates[1],
    "ignored spinout banana target racer"
  );
  const ignoredBanana = spawnBananaForValidation(
    ignoredSession,
    ignoredOwner
  );

  placeRacerForShellHitboxValidation(ignoredOwner, 7);
  placeRacerForShellHitboxValidation(ignoredTarget, 2);
  ignoredTarget.headingRadians = 0;
  ignoredTarget.forward = { x: 0, y: 0, z: 1 };
  ignoredTarget.speed = 12;
  ignoredTarget.velocity = { x: 0, y: 0, z: 12 };
  ignoredTarget.stunSeconds = 0;
  ignoredTarget.spinoutSeconds = banana.spinoutSeconds;
  ignoredTarget.spinoutAngularVelocity = banana.spinoutRadians;
  ignoredTarget.itemHitImmunitySeconds = 0;
  ignoredTarget.hitFeedbackSeconds = 0;

  const ignoredTargetBounds = refreshRacerCollisionBounds(ignoredTarget);

  ignoredBanana.armedSeconds = 0;
  ignoredBanana.position = {
    x:
      ignoredTargetBounds.center.x +
      ignoredTargetBounds.right.x *
        (ignoredTargetBounds.halfWidth + ignoredBanana.radius - 0.05),
    y: ignoredTargetBounds.center.y,
    z:
      ignoredTargetBounds.center.z +
      ignoredTargetBounds.right.z *
        (ignoredTargetBounds.halfWidth + ignoredBanana.radius - 0.05)
  };
  ignoredBanana.velocity = { x: 0, y: 0, z: 0 };

  const ignoredSpinoutTickResult = ignoredSession.tick(0);
  const ignoredSpinoutRemainingBananaCount =
    ignoredSession.bananaObstacleStates.length;

  assertEqual(
    ignoredSpinoutTickResult.bananaHits.length,
    0,
    "banana overlap during active spinout does not emit ignored hit"
  );
  assertEqual(
    ignoredSession.bananaObstacleStates.length,
    1,
    "banana overlap during active spinout keeps hazard active"
  );
  assertStringEqual(
    ignoredSession.bananaObstacleStates[0]?.id ?? "",
    ignoredBanana.id,
    "ignored banana overlap keeps same hazard id"
  );
  assertAlmostEqual(
    ignoredTarget.speed,
    12,
    "ignored banana overlap does not damp target speed"
  );

  const mirroredHitSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const mirroredTarget = requireRacerState(
    mirroredHitSession.humanRacerStates[1],
    "mirrored banana collision target racer"
  );

  assertEqual(
    mirroredHitSession.applyBananaHitEvent(bananaHit),
    true,
    "banana-hit event applies to mirrored race session"
  );
  assertAlmostEqual(
    mirroredTarget.spinoutSeconds,
    banana.spinoutSeconds,
    "mirrored banana-hit spinout timer"
  );
  assertStringEqual(
    mirroredTarget.lastHitItemType ?? "",
    "banana",
    "mirrored banana-hit feedback item type"
  );

  const missSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const missOwner = requireRacerState(
    missSession.humanRacerStates[0],
    "banana miss owner racer"
  );
  const missTarget = requireRacerState(
    missSession.humanRacerStates[1],
    "banana miss target racer"
  );
  const missBanana = spawnBananaForValidation(missSession, missOwner);

  placeRacerForShellHitboxValidation(missOwner, 7);
  placeRacerForShellHitboxValidation(missTarget, 2);
  const missTargetBounds = refreshRacerCollisionBounds(missTarget);

  missBanana.armedSeconds = 0;
  missBanana.position = {
    x:
      missTargetBounds.center.x +
      missTargetBounds.right.x *
        (missTargetBounds.halfWidth + missBanana.radius + 0.05),
    y: missTargetBounds.center.y,
    z:
      missTargetBounds.center.z +
      missTargetBounds.right.z *
        (missTargetBounds.halfWidth + missBanana.radius + 0.05)
  };

  missSession.tick(0);

  assertEqual(
    missSession.bananaObstacleStates.length,
    1,
    "banana hazard remains active after near miss"
  );
  assertEqual(
    missTarget.stunSeconds,
    0,
    "banana near miss does not stun target"
  );

  const unarmedSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const unarmedOwner = requireRacerState(
    unarmedSession.humanRacerStates[0],
    "unarmed banana owner racer"
  );
  const unarmedTarget = requireRacerState(
    unarmedSession.humanRacerStates[1],
    "unarmed banana target racer"
  );
  const unarmedBanana = spawnBananaForValidation(unarmedSession, unarmedOwner);

  placeRacerForShellHitboxValidation(unarmedOwner, 7);
  placeRacerForShellHitboxValidation(unarmedTarget, 2);
  const unarmedTargetBounds = refreshRacerCollisionBounds(unarmedTarget);

  unarmedBanana.armedSeconds = 0.1;
  unarmedBanana.position = {
    x:
      unarmedTargetBounds.center.x +
      unarmedTargetBounds.right.x *
        (unarmedTargetBounds.halfWidth + unarmedBanana.radius - 0.05),
    y: unarmedTargetBounds.center.y,
    z:
      unarmedTargetBounds.center.z +
      unarmedTargetBounds.right.z *
        (unarmedTargetBounds.halfWidth + unarmedBanana.radius - 0.05)
  };

  unarmedSession.tick(0);

  assertEqual(
    unarmedSession.bananaObstacleStates.length,
    1,
    "unarmed banana hazard remains active on overlap"
  );
  assertEqual(
    unarmedTarget.stunSeconds,
    0,
    "unarmed banana hazard does not stun target"
  );

  const sweptSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const sweptOwner = requireRacerState(
    sweptSession.humanRacerStates[0],
    "swept banana owner racer"
  );
  const sweptTarget = requireRacerState(
    sweptSession.humanRacerStates[1],
    "swept banana target racer"
  );
  const sweepPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 2);
  const sweepBananaPosition = { ...sweepPoint.position };

  sweptOwner.position = {
    x: sweepBananaPosition.x,
    y: sweepBananaPosition.y,
    z: sweepBananaPosition.z + BANANA_DROP_DISTANCE_BEHIND_RACER
  };
  sweptOwner.headingRadians = 0;
  sweptOwner.forward = { x: 0, y: 0, z: 1 };
  sweptOwner.velocity = { x: 0, y: 0, z: 0 };
  sweptOwner.speed = 0;
  sweptOwner.itemUseCooldownSeconds = 0;
  sweptOwner.heldItem = COMBAT_ITEM_REGISTRY.banana.type;
  refreshRacerCollisionBounds(sweptOwner);
  sweptSession.setHumanInput(sweptOwner.id, { useItem: true });

  const sweptDropTickResult = sweptSession.tick(0);
  const sweptBanana = requireBananaObstacleState(
    sweptSession.bananaObstacleStates[0],
    "swept validation banana"
  );

  assertEqual(
    sweptDropTickResult.itemUseActions.length,
    1,
    "swept banana validation spawn action count"
  );
  assertAlmostEqual(
    sweptBanana.position.z,
    sweepBananaPosition.z,
    "swept banana validation spawn position"
  );

  placeRacerForShellHitboxValidation(sweptOwner, 7);
  sweptBanana.armedSeconds = 0;
  sweptTarget.position = {
    x: sweptBanana.position.x,
    y: sweptBanana.position.y,
    z: sweptBanana.position.z - 4.25
  };
  sweptTarget.headingRadians = 0;
  sweptTarget.forward = { x: 0, y: 0, z: 1 };
  sweptTarget.speed = 0;
  sweptTarget.velocity = { x: 0, y: 0, z: 0 };
  sweptTarget.knockbackVelocity = { x: 0, y: 0, z: 140 };
  refreshRacerCollisionBounds(sweptTarget);

  const sweptTickResult = sweptSession.tick(1 / 15);

  assertEqual(
    sweptTickResult.bananaHits.length,
    1,
    "swept kart collision emits banana-hit event"
  );
  assertEqual(
    sweptSession.bananaObstacleStates.length,
    0,
    "swept kart collision consumes banana hazard"
  );
  assertAlmostEqual(
    sweptTarget.stunSeconds,
    banana.hitStunSeconds,
    "swept kart collision applies banana hit behavior"
  );

  const aiContactSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const aiContactOwner = requireRacerState(
    aiContactSession.humanRacerStates[0],
    "AI banana contact owner racer"
  );
  const aiContactTarget = requireRacerState(
    aiContactSession.aiRacerStates[0],
    "AI banana contact target racer"
  );
  const aiContact = resolveBananaHazardContactScenario(
    aiContactSession,
    aiContactOwner,
    aiContactTarget,
    "AI target banana contact"
  );

  assertStringEqual(
    aiContactTarget.controller,
    "ai",
    "banana contact target is AI-controlled"
  );

  const remoteContactSession = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: "banana-contact-host",
        displayName: "Banana Contact Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: "banana-contact-guest",
        displayName: "Banana Contact Guest",
        slotIndex: 1,
        isHost: false
      }
    ]),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const remoteContactOwner = requireRacerState(
    remoteContactSession.humanRacerStates[0],
    "remote banana contact owner racer"
  );
  const remoteContactTarget = requireRacerState(
    remoteContactSession.humanRacerStates[1],
    "remote banana contact target racer"
  );
  const remoteTargetMetadata =
    remoteContactSession
      .createRacerTargetRegistry({
        localPeerId: remoteContactOwner.peerId
      })
      .getTargetByStableId(remoteContactTarget.id);
  const remoteContact = resolveBananaHazardContactScenario(
    remoteContactSession,
    remoteContactOwner,
    remoteContactTarget,
    "remote target banana contact",
    createHostBananaContactControllerPaths(
      remoteContactSession,
      remoteContactOwner.id
    )
  );

  assertEqual(
    remoteTargetMetadata?.isRemotePlayer ?? false,
    true,
    "banana contact target is a remote multiplayer racer"
  );

  const ownerContactSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const ownerContactTarget = requireRacerState(
    ownerContactSession.humanRacerStates[0],
    "owner banana contact target racer"
  );
  const ownerContact = resolveBananaHazardContactScenario(
    ownerContactSession,
    ownerContactTarget,
    ownerContactTarget,
    "owner self banana contact"
  );
  const ownerMirrorSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const ownerMirrorTarget = requireRacerState(
    ownerMirrorSession.humanRacerStates[0],
    "owner self banana contact mirrored target"
  );
  const ownerSelfHitMirrorAccepted = ownerMirrorSession.applyBananaHitEvent(
    ownerContact.hitEvent
  );

  assertStringEqual(
    ownerContact.hitEvent.sourceRacerId,
    ownerContact.hitEvent.targetRacerId,
    "owner self banana contact event targets source racer"
  );
  assertEqual(
    ownerSelfHitMirrorAccepted,
    true,
    "owner self banana contact event applies to mirrored session"
  );
  assertAlmostEqual(
    ownerMirrorTarget.stunSeconds,
    banana.hitStunSeconds,
    "owner self banana contact mirrored stun"
  );

  return {
    targetRacerId: hitTarget.id,
    targetStunSeconds: hitTarget.stunSeconds,
    targetSpinoutSeconds: hitTarget.spinoutSeconds,
    targetSpinoutAngularVelocity: hitTarget.spinoutAngularVelocity,
    targetSpeedAfterHit: hitTarget.speed,
    targetHeadingDelta,
    bananaCountAfterHit: hitSession.bananaObstacleStates.length,
    bananaEntityCountAfterHit: hitSession.bananaHazardEntityStates.length,
    activeBananaEntityCountAfterHit:
      hitSession.activeBananaHazardEntityStates.length,
    hitBananaEntityActiveStatus: hitBananaEntity.activeStatus,
    hitBananaEntityDeactivationReason: hitBananaEntity.deactivationReason,
    ownerStunSeconds: hitOwner.stunSeconds,
    bananaHitEventCount: hitTickResult.bananaHits.length,
    bananaHitSpinoutSeconds: bananaHit.effect.spinoutSeconds,
    bananaHitFeedbackSeconds: bananaHit.effect.hitFeedbackSeconds,
    repeatBananaHitEventCount: repeatHitTickResult.bananaHits.length,
    repeatBananaRemovalEventCount: repeatHitTickResult.bananaRemovals.length,
    repeatBananaCountAfterHit: hitSession.bananaObstacleStates.length,
    repeatTargetSpinoutSeconds: hitTarget.spinoutSeconds,
    repeatTargetSpeed: hitTarget.speed,
    multiBananaHitEventCount: multiHitTickResult.bananaHits.length,
    multiBananaRemovalEventCount: multiHitTickResult.bananaRemovals.length,
    multiBananaRemainingCount: multiSession.bananaObstacleStates.length,
    ignoredSpinoutBananaHitEventCount:
      ignoredSpinoutTickResult.bananaHits.length,
    ignoredSpinoutRemainingBananaCount,
    missBananaCount: missSession.bananaObstacleStates.length,
    missTargetStunSeconds: missTarget.stunSeconds,
    unarmedBananaCount: unarmedSession.bananaObstacleStates.length,
    unarmedTargetStunSeconds: unarmedTarget.stunSeconds,
    sweptBananaHitEventCount: sweptTickResult.bananaHits.length,
    sweptBananaCountAfterHit: sweptSession.bananaObstacleStates.length,
    sweptTargetStunSeconds: sweptTarget.stunSeconds,
    aiTargetBananaHitEventCount: aiContact.hitEventCount,
    aiTargetStunSeconds: aiContact.targetStunSeconds,
    remoteTargetBananaHitEventCount: remoteContact.hitEventCount,
    remoteTargetStunSeconds: remoteContact.targetStunSeconds,
    ownerTargetBananaHitEventCount: ownerContact.hitEventCount,
    ownerTargetStunSeconds: ownerContact.targetStunSeconds,
    ownerSelfHitMirrorAccepted,
    ownerSelfHitMirrorStunSeconds: ownerMirrorTarget.stunSeconds
  };
}

export function validateTimedSpinoutControlLossState(): TimedSpinoutControlLossValidationResult {
  const tickSeconds = 1 / 60;
  const startingSpeed = 12;
  const roster = createRaceStartRoster(createHumanRacerInputs(4));
  const sessionOptions = {
    obstacles: [],
    itemPickups: []
  };
  const baselineSession = createRaceSessionFromStartRoster(
    roster,
    sessionOptions
  );
  const spinoutSession = createRaceSessionFromStartRoster(
    roster,
    sessionOptions
  );
  const baselineRacer = requireRacerState(
    baselineSession.humanRacerStates[0],
    "baseline spinout control racer"
  );
  const spinoutRacer = requireRacerState(
    spinoutSession.humanRacerStates[0],
    "timed spinout control racer"
  );
  const startPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 2);
  const headingRadians = 0;
  const shell = COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig;

  parkOtherRacersAwayFromShellPath(baselineSession, baselineRacer.id);
  parkOtherRacersAwayFromShellPath(spinoutSession, spinoutRacer.id);
  placeRacerForSpinoutControlValidation(
    baselineRacer,
    startPoint.position,
    headingRadians,
    startingSpeed
  );
  placeRacerForSpinoutControlValidation(
    spinoutRacer,
    startPoint.position,
    headingRadians,
    startingSpeed
  );

  baselineSession.setHumanInput(baselineRacer.id, {
    throttle: 1,
    steer: 1,
    brake: 0
  });
  spinoutSession.setHumanInput(spinoutRacer.id, {
    throttle: 1,
    steer: 1,
    brake: 0
  });
  spinoutRacer.spinoutSeconds = shell.spinoutSeconds;
  spinoutRacer.spinoutAngularVelocity =
    shell.spinoutRadians / shell.spinoutSeconds;
  spinoutRacer.recovering = true;

  const baselineResolvedControls =
    debugResolveRacerControlInputs(baselineRacer);
  const spinoutResolvedControls =
    debugResolveRacerControlInputs(spinoutRacer);

  assertEqual(
    baselineResolvedControls.throttle,
    1,
    "normal driving preserves full throttle input"
  );
  assertEqual(
    baselineResolvedControls.steer,
    1,
    "normal driving preserves full steering input"
  );
  assertEqual(
    spinoutResolvedControls.throttle,
    0,
    "spinout input handling suppresses throttle command"
  );
  assertEqual(
    spinoutResolvedControls.steer,
    0,
    "spinout input handling suppresses steering command"
  );
  assertGreaterThan(
    spinoutResolvedControls.brake,
    0,
    "spinout input handling applies automatic braking"
  );
  assertGreaterThan(
    spinoutResolvedControls.coastDecelerationMultiplier,
    1,
    "spinout input handling applies extra coasting deceleration"
  );

  baselineSession.tick(tickSeconds);
  spinoutSession.tick(tickSeconds);

  const baselineSpeedGain = baselineRacer.speed - startingSpeed;
  const spinoutSpeedDelta = spinoutRacer.speed - startingSpeed;
  const baselineHeadingDelta = getSignedAngleDeltaRadians(
    baselineRacer.headingRadians,
    headingRadians
  );
  const spinoutHeadingDelta = getSignedAngleDeltaRadians(
    spinoutRacer.headingRadians,
    headingRadians
  );
  const activeSpinoutSeconds = spinoutRacer.spinoutSeconds;
  const recoveringDuringSpinout = spinoutRacer.recovering;

  assertGreaterThan(
    baselineSpeedGain,
    spinoutSpeedDelta,
    "spinout throttle degradation versus normal acceleration"
  );
  assertGreaterThan(
    startingSpeed,
    spinoutRacer.speed,
    "spinout recovery braking slows the racer despite throttle input"
  );
  assertGreaterThan(
    Math.abs(spinoutHeadingDelta),
    Math.abs(baselineHeadingDelta),
    "spinout heading override dominates steering input"
  );
  assertGreaterThan(
    activeSpinoutSeconds,
    0,
    "spinout timer remains active after first control-loss tick"
  );
  assertGreaterThan(
    shell.spinoutSeconds,
    activeSpinoutSeconds,
    "spinout timer decays during control-loss tick"
  );
  assertEqual(
    Number(recoveringDuringSpinout),
    1,
    "racer is recovering while spinout timer is active"
  );

  for (
    let tickIndex = 0;
    tickIndex < Math.ceil((shell.spinoutSeconds + tickSeconds) / tickSeconds);
    tickIndex += 1
  ) {
    spinoutSession.tick(tickSeconds);
  }

  const recoveredSpinoutSeconds = spinoutRacer.spinoutSeconds;
  const recoveringAfterExpiry = spinoutRacer.recovering;

  assertEqual(recoveredSpinoutSeconds, 0, "spinout timer expires");
  assertEqual(
    spinoutRacer.spinoutAngularVelocity,
    0,
    "spinout angular velocity clears after expiry"
  );
  assertEqual(
    Number(recoveringAfterExpiry),
    0,
    "racer leaves recovery after spinout expiry"
  );

  placeRacerForSpinoutControlValidation(
    spinoutRacer,
    startPoint.position,
    headingRadians,
    startingSpeed
  );
  spinoutSession.setHumanInput(spinoutRacer.id, {
    throttle: 1,
    steer: 1,
    brake: 0
  });
  const recoveredResolvedControls =
    debugResolveRacerControlInputs(spinoutRacer);

  assertEqual(
    recoveredResolvedControls.throttle,
    baselineResolvedControls.throttle,
    "normal throttle handling is restored after spinout expiry"
  );
  assertEqual(
    recoveredResolvedControls.steer,
    baselineResolvedControls.steer,
    "normal steering handling is restored after spinout expiry"
  );

  spinoutSession.tick(tickSeconds);

  const recoveredSpeedGain = spinoutRacer.speed - startingSpeed;
  const recoveredHeadingDelta = getSignedAngleDeltaRadians(
    spinoutRacer.headingRadians,
    headingRadians
  );

  assertAlmostEqual(
    recoveredSpeedGain,
    baselineSpeedGain,
    "throttle returns to normal after spinout expiry"
  );
  assertAlmostEqual(
    recoveredHeadingDelta,
    baselineHeadingDelta,
    "steering returns to normal after spinout expiry"
  );

  const remainingSpinoutSeconds = 0.5;
  const referenceSpinoutStrength =
    DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutRadians;
  const shortDurationProbe = createSpinoutTuningControlProbe({
    durationSeconds: SHELL_SPINOUT_FEEL_RANGE_SECONDS.min,
    spinoutRadians: referenceSpinoutStrength,
    remainingSeconds: remainingSpinoutSeconds
  });
  const longDurationProbe = createSpinoutTuningControlProbe({
    durationSeconds: SHELL_SPINOUT_FEEL_RANGE_SECONDS.max,
    spinoutRadians: referenceSpinoutStrength,
    remainingSeconds: remainingSpinoutSeconds
  });
  const weakStrengthProbe = createSpinoutTuningControlProbe({
    durationSeconds: DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds,
    spinoutRadians: Math.max(
      SHELL_SPINOUT_FEEL_RANGE_RADIANS.min,
      referenceSpinoutStrength * 0.75
    ),
    remainingSeconds: DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds
  });
  const strongStrengthProbe = createSpinoutTuningControlProbe({
    durationSeconds: DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds,
    spinoutRadians: referenceSpinoutStrength,
    remainingSeconds: DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds
  });

  assertGreaterThan(
    shortDurationProbe.resolvedBrake,
    longDurationProbe.resolvedBrake,
    "spinout duration tuning controls automatic braking intensity"
  );
  assertGreaterThan(
    shortDurationProbe.resolvedCoastDecelerationMultiplier,
    longDurationProbe.resolvedCoastDecelerationMultiplier,
    "spinout duration tuning controls coasting loss intensity"
  );
  assertGreaterThan(
    strongStrengthProbe.resolvedBrake,
    weakStrengthProbe.resolvedBrake,
    "spinout strength tuning controls automatic braking intensity"
  );
  assertGreaterThan(
    strongStrengthProbe.resolvedCoastDecelerationMultiplier,
    weakStrengthProbe.resolvedCoastDecelerationMultiplier,
    "spinout strength tuning controls coasting loss intensity"
  );
  assertGreaterThan(
    Math.abs(strongStrengthProbe.headingDelta),
    Math.abs(weakStrengthProbe.headingDelta),
    "spinout strength tuning controls heading loss"
  );

  return {
    baselineResolvedThrottle: baselineResolvedControls.throttle,
    spinoutResolvedThrottle: spinoutResolvedControls.throttle,
    spinoutResolvedBrake: spinoutResolvedControls.brake,
    spinoutResolvedCoastDecelerationMultiplier:
      spinoutResolvedControls.coastDecelerationMultiplier,
    shortDurationResolvedThrottle: shortDurationProbe.resolvedThrottle,
    shortDurationResolvedBrake: shortDurationProbe.resolvedBrake,
    shortDurationResolvedCoastDecelerationMultiplier:
      shortDurationProbe.resolvedCoastDecelerationMultiplier,
    longDurationResolvedThrottle: longDurationProbe.resolvedThrottle,
    longDurationResolvedBrake: longDurationProbe.resolvedBrake,
    longDurationResolvedCoastDecelerationMultiplier:
      longDurationProbe.resolvedCoastDecelerationMultiplier,
    weakStrengthResolvedThrottle: weakStrengthProbe.resolvedThrottle,
    weakStrengthResolvedBrake: weakStrengthProbe.resolvedBrake,
    weakStrengthResolvedCoastDecelerationMultiplier:
      weakStrengthProbe.resolvedCoastDecelerationMultiplier,
    strongStrengthResolvedThrottle: strongStrengthProbe.resolvedThrottle,
    strongStrengthResolvedBrake: strongStrengthProbe.resolvedBrake,
    strongStrengthResolvedCoastDecelerationMultiplier:
      strongStrengthProbe.resolvedCoastDecelerationMultiplier,
    baselineResolvedSteer: baselineResolvedControls.steer,
    spinoutResolvedSteer: spinoutResolvedControls.steer,
    shortDurationResolvedSteer: shortDurationProbe.resolvedSteer,
    longDurationResolvedSteer: longDurationProbe.resolvedSteer,
    baselineSpeedGain,
    spinoutSpeedDelta,
    baselineHeadingDelta,
    spinoutHeadingDelta,
    weakStrengthHeadingDelta: weakStrengthProbe.headingDelta,
    strongStrengthHeadingDelta: strongStrengthProbe.headingDelta,
    activeSpinoutSeconds,
    recoveredSpinoutSeconds,
    recoveringDuringSpinout,
    recoveringAfterExpiry,
    recoveredSpeedGain,
    recoveredHeadingDelta
  };
}

interface SpinoutTuningControlProbeOptions {
  readonly durationSeconds: number;
  readonly spinoutRadians: number;
  readonly remainingSeconds: number;
}

interface SpinoutTuningControlProbeResult {
  readonly resolvedThrottle: number;
  readonly resolvedBrake: number;
  readonly resolvedSteer: number;
  readonly resolvedCoastDecelerationMultiplier: number;
  readonly headingDelta: number;
}

function createSpinoutTuningControlProbe(
  options: SpinoutTuningControlProbeOptions
): SpinoutTuningControlProbeResult {
  const tickSeconds = 1 / 60;
  const roster = createRaceStartRoster(createHumanRacerInputs(4));
  const session = createRaceSessionFromStartRoster(roster, {
    obstacles: [],
    itemPickups: []
  });
  const racer = requireRacerState(
    session.humanRacerStates[0],
    "spinout tuning control probe racer"
  );
  const startPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 2);
  const headingRadians = 0;

  parkOtherRacersAwayFromShellPath(session, racer.id);
  placeRacerForSpinoutControlValidation(
    racer,
    startPoint.position,
    headingRadians,
    0
  );
  applyRacerSpinoutItemEffect(
    racer,
    options.durationSeconds,
    options.spinoutRadians / options.durationSeconds,
    "shell"
  );
  advanceRaceSessionForValidation(
    session,
    Math.max(0, options.durationSeconds - options.remainingSeconds),
    tickSeconds
  );
  session.setHumanInput(racer.id, {
    throttle: 1,
    steer: 1,
    brake: 0
  });

  const resolvedControls = debugResolveRacerControlInputs(racer);

  session.setHumanInput(racer.id, {
    throttle: 0,
    steer: 0,
    brake: 0
  });

  const headingBeforeTick = racer.headingRadians;

  session.tick(tickSeconds);

  return {
    resolvedThrottle: resolvedControls.throttle,
    resolvedBrake: resolvedControls.brake,
    resolvedSteer: resolvedControls.steer,
    resolvedCoastDecelerationMultiplier:
      resolvedControls.coastDecelerationMultiplier,
    headingDelta: getSignedAngleDeltaRadians(
      racer.headingRadians,
      headingBeforeTick
    )
  };
}

function advanceRaceSessionForValidation(
  session: RaceSession,
  elapsedSeconds: number,
  tickSeconds: number
): void {
  let remainingSeconds = Math.max(0, elapsedSeconds);

  while (remainingSeconds > 0.000_001) {
    const stepSeconds = Math.min(tickSeconds, remainingSeconds);
    session.tick(stepSeconds);
    remainingSeconds -= stepSeconds;
  }
}

export function validateBoostActivationStatusEffect(): BoostActivationValidationResult {
  const tickSeconds = 1 / 60;
  const roster = createRaceStartRoster(createHumanRacerInputs(4));
  const sessionOptions = {
    obstacles: [],
    itemPickups: []
  };
  const baselineSession = createRaceSessionFromStartRoster(
    roster,
    sessionOptions
  );
  const boostedSession = createRaceSessionFromStartRoster(
    roster,
    sessionOptions
  );
  const baselineRacer = requireRacerState(
    baselineSession.humanRacerStates[0],
    "baseline boost comparison racer"
  );
  const boostedRacer = requireRacerState(
    boostedSession.humanRacerStates[0],
    "boost status-effect racer"
  );

  baselineSession.setHumanInput(baselineRacer.id, { throttle: 1 });
  boostedRacer.heldItem = COMBAT_ITEM_REGISTRY.boost.type;
  boostedSession.setHumanInput(boostedRacer.id, {
    throttle: 1,
    useItem: true
  });

  baselineSession.tick(tickSeconds);
  const boostedTickResult = boostedSession.tick(tickSeconds);

  assertNull(boostedRacer.heldItem, "held boost item after activation");
  assertEqual(
    boostedTickResult.boostActivations.length,
    1,
    "boost activation event count"
  );
  const boostActivation = boostedTickResult.boostActivations[0];

  if (boostActivation === undefined) {
    throw new Error("Expected boost activation event.");
  }

  assertStringEqual(
    boostActivation.racerId,
    boostedRacer.id,
    "boost activation event racer id"
  );
  assertEqual(
    boostActivation.tickIndex,
    boostedTickResult.tickIndex,
    "boost activation event tick"
  );

  const boostActivationEvent = boostedTickResult.boostActivations[0];

  if (boostActivationEvent === undefined) {
    throw new Error("Expected boost activation event to exist.");
  }

  assertAlmostEqual(
    boostActivationEvent.expiresAtElapsedSeconds,
    boostActivationEvent.elapsedSeconds + boostActivationEvent.durationSeconds,
    "boost activation event shared expiry"
  );

  const mirroredSession = createRaceSessionFromStartRoster(
    roster,
    sessionOptions
  );
  const mirroredRacer = requireRacerState(
    mirroredSession.humanRacerStates[0],
    "mirrored boost activation racer"
  );

  assertEqual(
    mirroredSession.applyBoostActivationEvent(boostActivationEvent),
    true,
    "mirrored boost activation event schedules"
  );
  assertEqual(
    mirroredSession.applyBoostActivationEvent(boostActivationEvent),
    false,
    "duplicate mirrored boost activation event is ignored"
  );
  assertEqual(
    mirroredRacer.boostSeconds,
    0,
    "future mirrored boost activation waits for event time"
  );
  mirroredSession.tick(tickSeconds);
  assertGreaterThan(
    mirroredRacer.boostSeconds,
    0,
    "mirrored boost activation applies at event time"
  );
  assertGreaterThan(
    boostedRacer.boostSeconds,
    0,
    "boost status-effect timer after activation"
  );
  assertGreaterThan(
    boostedRacer.speed,
    baselineRacer.speed,
    "boosted acceleration after activation"
  );

  const boostedSpeedAfterActivationTick = boostedRacer.speed;
  const boostSecondsAfterActivation = boostedRacer.boostSeconds;

  for (
    let tickIndex = 0;
    tickIndex < Math.ceil(1.5 / tickSeconds);
    tickIndex += 1
  ) {
    boostedSession.tick(tickSeconds);
  }

  assertEqual(
    boostedRacer.boostSeconds,
    0,
    "boost status-effect timer after expiry"
  );

  return {
    baselineSpeedAfterActivationTick: baselineRacer.speed,
    boostedSpeedAfterActivationTick,
    boostSecondsAfterActivation,
    boostSecondsAfterExpiry: boostedRacer.boostSeconds,
    activationTickIndex: boostedTickResult.tickIndex
  };
}

export function validateShellItemRegistryRegistration(): ShellItemRegistryValidationResult {
  const shell = COMBAT_ITEM_REGISTRY.shell;

  assertStringEqual(shell.id, "shell", "shell registry id");
  assertStringEqual(shell.type, "shell", "shell registry type");
  assertStringEqual(shell.metadata.id, "shell", "shell metadata id");
  assertStringEqual(
    shell.metadata.displayName,
    "Shell",
    "shell registry display name"
  );
  assertStringEqual(
    shell.metadata.category,
    "projectile",
    "shell registry category"
  );
  assertStringEqual(shell.rarity, "uncommon", "shell registry rarity");
  assertStringEqual(
    shell.metadata.rarity,
    shell.rarity,
    "shell metadata rarity"
  );
  assertStringEqual(
    shell.behaviorType,
    "projectile",
    "shell registry behavior type"
  );
  assertStringEqual(
    shell.metadata.behaviorType,
    shell.behaviorType,
    "shell metadata behavior type"
  );
  assertGreaterThan(
    shell.metadata.description.length,
    0,
    "shell registry description length"
  );
  assertGreaterThan(shell.pickupWeight, 0, "shell pickup weight");
  assertStringEqual(shell.inventoryIcon, "S", "shell inventory icon");
  assertStringEqual(
    shell.inventoryIconKey,
    "combat-item-shell",
    "shell inventory icon key"
  );
  assertStringEqual(
    shell.inventoryIconRef,
    shell.inventoryIconKey,
    "shell inventory icon ref"
  );
  assertStringEqual(
    shell.metadata.inventoryIconRef,
    shell.inventoryIconKey,
    "shell metadata inventory icon ref"
  );
  assertStringEqual(shell.inventoryKey, "shell", "shell inventory key");
  assertGreaterThan(shell.respawnSeconds, 0, "shell respawn seconds");
  assertGreaterThan(
    shell.defaultRuntimeConfig.speed,
    0,
    "shell projectile speed"
  );
  assertGreaterThan(
    shell.defaultRuntimeConfig.radius,
    0,
    "shell projectile radius"
  );
  assertGreaterThan(
    shell.defaultRuntimeConfig.ttlSeconds,
    0,
    "shell projectile ttl"
  );
  assertGreaterThan(
    shell.defaultRuntimeConfig.armSeconds,
    0,
    "shell projectile arm time"
  );
  assertGreaterThan(
    shell.defaultRuntimeConfig.hitStunSeconds,
    0,
    "shell hit stun"
  );
  assertGreaterThan(
    shell.defaultRuntimeConfig.hitSpeedFactor,
    0,
    "shell hit speed factor"
  );
  assertGreaterThan(
    shell.defaultRuntimeConfig.spinoutSeconds,
    0,
    "shell spinout seconds"
  );
  assertEqual(
    shell.defaultRuntimeConfig.spinoutSeconds,
    DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds,
    "shell spinout seconds use gameplay tuning default"
  );
  assertBetween(
    shell.defaultRuntimeConfig.spinoutSeconds,
    SHELL_SPINOUT_FEEL_RANGE_SECONDS.min,
    SHELL_SPINOUT_FEEL_RANGE_SECONDS.max,
    "shell spinout gameplay tuning default"
  );
  assertGreaterThan(
    shell.defaultRuntimeConfig.spinoutRadians,
    0,
    "shell spinout radians"
  );
  assertAlmostEqual(
    shell.defaultRuntimeConfig.spinoutRadians,
    DEFAULT_SHELL_SPINOUT_GAMEPLAY_TUNING.spinoutRadians,
    "shell spinout radians use gameplay tuning default"
  );
  assertBetween(
    shell.defaultRuntimeConfig.spinoutRadians,
    SHELL_SPINOUT_FEEL_RANGE_RADIANS.min,
    SHELL_SPINOUT_FEEL_RANGE_RADIANS.max,
    "shell spinout strength gameplay tuning default"
  );
  assertGreaterThan(
    shell.defaultRuntimeConfig.hitImmunitySeconds,
    0,
    "shell hit immunity seconds"
  );
  assertGreaterThan(
    shell.defaultRuntimeConfig.hitFeedbackSeconds,
    0,
    "shell hit feedback seconds"
  );
  assertGreaterThan(
    shell.defaultRuntimeConfig.useCooldownSeconds,
    0,
    "shell use cooldown"
  );

  const shellPickup = DEFAULT_RACE_ITEM_PICKUPS.find(
    (pickup) => pickup.itemType === shell.type
  );

  if (shellPickup === undefined) {
    throw new Error("Expected default item pickup table to include shell.");
  }

  assertEqual(
    shellPickup.respawnSeconds,
    shell.respawnSeconds,
    "shell pickup registry respawn"
  );

  return {
    id: shell.id,
    type: shell.type,
    displayName: shell.metadata.displayName,
    rarity: shell.rarity,
    behaviorType: shell.behaviorType,
    pickupWeight: shell.pickupWeight,
    inventoryIcon: shell.inventoryIcon,
    inventoryIconKey: shell.inventoryIconKey,
    inventoryIconRef: shell.inventoryIconRef,
    inventoryKey: shell.inventoryKey,
    respawnSeconds: shell.respawnSeconds,
    speed: shell.defaultRuntimeConfig.speed,
    radius: shell.defaultRuntimeConfig.radius,
    ttlSeconds: shell.defaultRuntimeConfig.ttlSeconds,
    armSeconds: shell.defaultRuntimeConfig.armSeconds,
    hitStunSeconds: shell.defaultRuntimeConfig.hitStunSeconds,
    hitSpeedFactor: shell.defaultRuntimeConfig.hitSpeedFactor,
    spinoutSeconds: shell.defaultRuntimeConfig.spinoutSeconds,
    spinoutRadians: shell.defaultRuntimeConfig.spinoutRadians,
    hitImmunitySeconds: shell.defaultRuntimeConfig.hitImmunitySeconds,
    hitFeedbackSeconds: shell.defaultRuntimeConfig.hitFeedbackSeconds
  };
}

export function validateBananaItemRegistryRegistration(): BananaItemRegistryValidationResult {
  const banana = COMBAT_ITEM_REGISTRY.banana;

  assertStringEqual(banana.id, "banana", "banana registry id");
  assertStringEqual(banana.type, "banana", "banana registry type");
  assertStringEqual(banana.metadata.id, "banana", "banana metadata id");
  assertStringEqual(
    banana.metadata.displayName,
    "Banana",
    "banana registry display name"
  );
  assertStringEqual(
    banana.metadata.category,
    "trap",
    "banana registry category"
  );
  assertStringEqual(banana.rarity, "uncommon", "banana registry rarity");
  assertStringEqual(
    banana.metadata.rarity,
    banana.rarity,
    "banana metadata rarity"
  );
  assertStringEqual(
    banana.behaviorType,
    "dropped-trap",
    "banana registry behavior type"
  );
  assertStringEqual(
    banana.metadata.behaviorType,
    banana.behaviorType,
    "banana metadata behavior type"
  );
  assertGreaterThan(
    banana.metadata.description.length,
    0,
    "banana registry description length"
  );
  assertGreaterThan(banana.pickupWeight, 0, "banana pickup weight");
  assertStringEqual(banana.inventoryIcon, "N", "banana inventory icon");
  assertStringEqual(
    banana.inventoryIconKey,
    "combat-item-banana",
    "banana inventory icon key"
  );
  assertStringEqual(
    banana.inventoryIconRef,
    banana.inventoryIconKey,
    "banana inventory icon ref"
  );
  assertStringEqual(
    banana.metadata.inventoryIconRef,
    banana.inventoryIconKey,
    "banana metadata inventory icon ref"
  );
  assertStringEqual(banana.inventoryKey, "banana", "banana inventory key");
  assertGreaterThan(banana.respawnSeconds, 0, "banana respawn seconds");
  assertAlmostEqual(
    banana.defaultRuntimeConfig.spinRadians,
    DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING.spinRadians,
    "banana hit spin radians use gameplay tuning default"
  );
  assertAlmostEqual(
    banana.defaultRuntimeConfig.spinoutSeconds,
    DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING.spinoutSeconds,
    "banana spinout seconds use gameplay tuning default"
  );
  assertBetween(
    banana.defaultRuntimeConfig.spinoutSeconds,
    BANANA_SPINOUT_FEEL_RANGE_SECONDS.min,
    BANANA_SPINOUT_FEEL_RANGE_SECONDS.max,
    "banana spinout duration gameplay tuning default"
  );
  assertAlmostEqual(
    banana.defaultRuntimeConfig.spinoutRadians,
    DEFAULT_BANANA_SPINOUT_GAMEPLAY_TUNING.spinoutRadians,
    "banana spinout radians use gameplay tuning default"
  );
  assertBetween(
    banana.defaultRuntimeConfig.spinoutRadians,
    BANANA_SPINOUT_FEEL_RANGE_RADIANS.min,
    BANANA_SPINOUT_FEEL_RANGE_RADIANS.max,
    "banana spinout strength gameplay tuning default"
  );

  const bananaPickup = DEFAULT_RACE_ITEM_PICKUPS.find(
    (pickup) => pickup.itemType === banana.type
  );

  if (bananaPickup === undefined) {
    throw new Error("Expected default item pickup table to include banana.");
  }

  assertEqual(
    bananaPickup.respawnSeconds,
    banana.respawnSeconds,
    "banana pickup registry respawn"
  );

  return {
    id: banana.id,
    type: banana.type,
    displayName: banana.metadata.displayName,
    rarity: banana.rarity,
    behaviorType: banana.behaviorType,
    pickupWeight: banana.pickupWeight,
    inventoryIcon: banana.inventoryIcon,
    inventoryIconKey: banana.inventoryIconKey,
    inventoryIconRef: banana.inventoryIconRef,
    inventoryKey: banana.inventoryKey,
    respawnSeconds: banana.respawnSeconds
  };
}

export function validateTrackBoundaryPhysicsResponse(): TrackBoundaryPhysicsValidationResult {
  const road = DEFAULT_TRACK_DEFINITION.road;
  const shoulderPoint = requireTrackSurfaceSamplePoint(
    road,
    "shoulder",
    RACER_COLLISION_RADIUS
  );
  const shoulderQuery = queryTrackSurfaceAtPoint(
    road,
    shoulderPoint,
    RACER_COLLISION_RADIUS
  );

  assertStringEqual(
    shoulderQuery.surface,
    "shoulder",
    "kart footprint shoulder contact query"
  );

  const roadSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(4)),
    { obstacles: [], itemPickups: [] }
  );
  const shoulderSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(4)),
    { obstacles: [], itemPickups: [] }
  );
  const roadRacer = requireRacerState(
    roadSession.humanRacerStates[0],
    "road speed comparison racer"
  );
  const shoulderRacer = requireRacerState(
    shoulderSession.humanRacerStates[0],
    "shoulder speed comparison racer"
  );
  const startingSpeed = 30;
  const tickSeconds = 1 / 60;

  roadRacer.position = requireTrackCenterPoint(road, 0).position;
  shoulderRacer.position = shoulderPoint;
  roadRacer.speed = startingSpeed;
  shoulderRacer.speed = startingSpeed;
  roadSession.tick(tickSeconds);
  shoulderSession.tick(tickSeconds);

  assertGreaterThan(
    roadRacer.speed,
    shoulderRacer.speed,
    "road speed after shoulder slowdown comparison"
  );

  const boundarySession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(4)),
    { obstacles: [], itemPickups: [] }
  );
  const boundaryRacer = requireRacerState(
    boundarySession.humanRacerStates[0],
    "off-track boundary racer"
  );
  const offTrackPoint = requireTrackSurfaceSamplePoint(
    road,
    "offTrack",
    RACER_COLLISION_RADIUS
  );

  boundaryRacer.position = offTrackPoint;
  boundaryRacer.speed = startingSpeed;
  boundarySession.tick(0);

  const correctedQuery = queryTrackSurfaceAtPoint(
    road,
    boundaryRacer.position,
    RACER_COLLISION_RADIUS
  );

  assertEqual(
    Number(correctedQuery.withinCourseBoundary),
    1,
    "off-track kart clamped inside course boundary"
  );
  assertGreaterThan(
    startingSpeed,
    boundaryRacer.speed,
    "off-track boundary collision speed damping"
  );

  const aiBoundarySession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    { obstacles: [], itemPickups: [] }
  );
  const aiBoundaryRacer = requireRacerState(
    aiBoundarySession.aiRacerStates[0],
    "off-track AI boundary racer"
  );

  aiBoundaryRacer.position = offTrackPoint;
  aiBoundaryRacer.speed = startingSpeed;
  aiBoundarySession.tick(0);

  const aiCorrectedQuery = queryTrackSurfaceAtPoint(
    road,
    aiBoundaryRacer.position,
    RACER_COLLISION_RADIUS
  );

  assertEqual(
    Number(aiCorrectedQuery.withinCourseBoundary),
    1,
    "off-track AI kart clamped inside course boundary"
  );
  assertGreaterThan(
    startingSpeed,
    aiBoundaryRacer.speed,
    "off-track AI boundary collision speed damping"
  );
  assertStringEqual(
    aiCorrectedQuery.surface,
    correctedQuery.surface,
    "AI boundary correction surface matches human correction"
  );
  assertAlmostEqual(
    aiBoundaryRacer.speed,
    boundaryRacer.speed,
    "AI boundary damping matches human damping"
  );

  return {
    shoulderSurface: shoulderQuery.surface,
    roadSpeedAfterTick: roadRacer.speed,
    shoulderSpeedAfterTick: shoulderRacer.speed,
    correctedSurface: correctedQuery.surface,
    boundarySpeedAfterClamp: boundaryRacer.speed,
    aiCorrectedSurface: aiCorrectedQuery.surface,
    aiBoundarySpeedAfterClamp: aiBoundaryRacer.speed
  };
}

export function validateKartCollisionBoundsModel(): KartCollisionBoundsValidationResult {
  const customDimensions = {
    length: 4,
    width: 2,
    height: 1.2
  };
  const session = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(4)),
    {
      obstacles: [],
      itemPickups: [],
      kartCollisionDimensions: customDimensions
    }
  );
  const racer = requireRacerState(
    session.humanRacerStates[0],
    "custom collision bounds racer"
  );

  assertAlmostEqual(
    racer.collisionDimensions.length,
    customDimensions.length,
    "custom kart collision length"
  );
  assertAlmostEqual(
    racer.collisionDimensions.width,
    customDimensions.width,
    "custom kart collision width"
  );
  assertAlmostEqual(
    racer.collisionDimensions.height,
    customDimensions.height,
    "custom kart collision height"
  );
  assertAlmostEqual(
    racer.collisionBounds.center.x,
    racer.position.x,
    "initial collision bounds center.x"
  );
  assertAlmostEqual(
    racer.collisionBounds.center.z,
    racer.position.z,
    "initial collision bounds center.z"
  );
  assertAlmostEqual(
    racer.collisionBounds.headingRadians,
    racer.headingRadians,
    "initial collision bounds heading"
  );
  assertAlmostEqual(
    racer.collisionBounds.boundingRadius,
    Math.hypot(customDimensions.length / 2, customDimensions.width / 2),
    "custom collision bounding radius"
  );

  racer.position = { x: 8, y: racer.position.y, z: -3 };
  racer.headingRadians = Math.PI / 2;

  const rotatedBounds = refreshRacerCollisionBounds(racer);

  assertAlmostEqual(rotatedBounds.center.x, 8, "rotated bounds center.x");
  assertAlmostEqual(rotatedBounds.center.z, -3, "rotated bounds center.z");
  assertAlmostEqual(
    rotatedBounds.headingRadians,
    Math.PI / 2,
    "rotated bounds heading"
  );
  assertAlmostEqual(
    rotatedBounds.frontRight.x,
    10,
    "rotated front-right collision x"
  );
  assertAlmostEqual(
    rotatedBounds.frontRight.z,
    -4,
    "rotated front-right collision z"
  );

  assertThrows(
    () =>
      createRaceSessionFromStartRoster(
        createRaceStartRoster(createHumanRacerInputs(4)),
        {
          obstacles: [],
          itemPickups: [],
          kartCollisionDimensions: { length: 0 }
        }
      ),
    "Kart collision length",
    "invalid kart collision dimensions"
  );

  return {
    length: racer.collisionDimensions.length,
    width: racer.collisionDimensions.width,
    height: racer.collisionDimensions.height,
    boundingRadius: rotatedBounds.boundingRadius,
    centerX: rotatedBounds.center.x,
    centerZ: rotatedBounds.center.z,
    headingRadians: rotatedBounds.headingRadians,
    frontRightX: rotatedBounds.frontRight.x,
    frontRightZ: rotatedBounds.frontRight.z
  };
}

type RaceLoopKartPairCollisionScenario = "human-human" | "human-ai" | "ai-ai";

interface RaceLoopKartPairCollisionScenarioResult {
  readonly pairChecks: number;
  readonly contacts: number;
  readonly separationGain: number;
  readonly leftPositionDelta: number;
  readonly rightPositionDelta: number;
  readonly leftSpeedBefore: number;
  readonly leftSpeedAfter: number;
  readonly rightSpeedBefore: number;
  readonly rightSpeedAfter: number;
}

interface RaceLoopKartPairBoundaryCollisionScenarioResult {
  readonly contacts: number;
  readonly separationGain: number;
  readonly overlapResolved: boolean;
  readonly leftInsideCourse: boolean;
  readonly rightInsideCourse: boolean;
  readonly leftX: number;
  readonly leftZ: number;
  readonly rightX: number;
  readonly rightZ: number;
}

interface RaceLoopKartManeuverCollisionScenarioResult {
  readonly contacts: number;
  readonly overlapResolved: boolean;
}

interface RaceLoopMultiKartCollisionScenarioResult {
  readonly contacts: number;
  readonly overlapsResolved: boolean;
}

interface RaceLoopHighSpeedCollisionScenarioResult {
  readonly contacts: number;
  readonly overlapResolved: boolean;
  readonly tunnelPrevented: boolean;
}

interface CollisionVelocityDampingScenarioResult {
  readonly speedBefore: number;
  readonly speedAfter: number;
  readonly speedFactor: number;
}

interface StaticCollisionDeflectionScenarioResult {
  readonly reboundDot: number;
}

interface RacerContactDeflectionScenarioResult {
  readonly leftReboundDot: number;
  readonly rightReboundDot: number;
  readonly overlapResolved: boolean;
}

export function validateRaceLoopKartPairCollisionChecks(): RaceLoopKartPairCollisionValidationResult {
  const expectedUniquePairsPerTick = (RACE_CAPACITY * (RACE_CAPACITY - 1)) / 2;
  const humanHuman = validateRaceLoopKartPairCollisionScenario("human-human");
  const humanAi = validateRaceLoopKartPairCollisionScenario("human-ai");
  const aiAi = validateRaceLoopKartPairCollisionScenario("ai-ai");
  const boundaryPair = validateRaceLoopKartPairBoundaryCollisionScenario();
  const headOn = validateRaceLoopHeadOnCollisionScenario();
  const sideImpact = validateRaceLoopSideImpactCollisionScenario();
  const multiKart = validateRaceLoopMultiKartCollisionScenario();
  const highSpeed = validateRaceLoopHighSpeedCollisionScenario();

  assertRaceLoopKartPairCollisionScenario(
    humanHuman,
    expectedUniquePairsPerTick,
    "human-human"
  );
  assertRaceLoopKartPairCollisionScenario(
    humanAi,
    expectedUniquePairsPerTick,
    "human-AI"
  );
  assertRaceLoopKartPairCollisionScenario(
    aiAi,
    expectedUniquePairsPerTick,
    "AI-AI"
  );
  assertGreaterThan(
    boundaryPair.contacts,
    0,
    "boundary kart-pair contact count"
  );
  assertGreaterThan(
    boundaryPair.separationGain,
    0,
    "boundary kart-pair separation gain"
  );
  assertEqual(
    boundaryPair.overlapResolved,
    true,
    "boundary kart-pair overlap resolved"
  );
  assertEqual(
    boundaryPair.leftInsideCourse,
    true,
    "boundary left racer remains inside course"
  );
  assertEqual(
    boundaryPair.rightInsideCourse,
    true,
    "boundary right racer remains inside course"
  );
  assertRaceLoopManeuverCollisionScenario(headOn, "head-on");
  assertRaceLoopManeuverCollisionScenario(sideImpact, "side-impact");
  assertGreaterThan(
    multiKart.contacts,
    0,
    "multi-kart contact count"
  );
  assertEqual(
    multiKart.overlapsResolved,
    true,
    "multi-kart overlaps resolved"
  );
  assertGreaterThan(
    highSpeed.contacts,
    0,
    "high-speed contact count"
  );
  assertEqual(
    highSpeed.overlapResolved,
    true,
    "high-speed overlap resolved"
  );
  assertEqual(
    highSpeed.tunnelPrevented,
    true,
    "high-speed tunneling prevented"
  );

  return {
    expectedUniquePairsPerTick,
    humanHumanPairChecks: humanHuman.pairChecks,
    humanHumanContacts: humanHuman.contacts,
    humanHumanSeparationGain: humanHuman.separationGain,
    humanAiPairChecks: humanAi.pairChecks,
    humanAiContacts: humanAi.contacts,
    humanAiSeparationGain: humanAi.separationGain,
    humanAiSpeedFactor: getAverageRacerPairSpeedFactor(humanAi),
    aiAiPairChecks: aiAi.pairChecks,
    aiAiContacts: aiAi.contacts,
    aiAiSeparationGain: aiAi.separationGain,
    aiAiSpeedFactor: getAverageRacerPairSpeedFactor(aiAi),
    boundaryPairContacts: boundaryPair.contacts,
    boundaryPairSeparationGain: boundaryPair.separationGain,
    boundaryPairOverlapResolved: boundaryPair.overlapResolved,
    boundaryPairLeftInsideCourse: boundaryPair.leftInsideCourse,
    boundaryPairRightInsideCourse: boundaryPair.rightInsideCourse,
    headOnContacts: headOn.contacts,
    headOnOverlapResolved: headOn.overlapResolved,
    sideImpactContacts: sideImpact.contacts,
    sideImpactOverlapResolved: sideImpact.overlapResolved,
    multiKartContacts: multiKart.contacts,
    multiKartOverlapsResolved: multiKart.overlapsResolved,
    highSpeedContacts: highSpeed.contacts,
    highSpeedOverlapResolved: highSpeed.overlapResolved,
    highSpeedTunnelPrevented: highSpeed.tunnelPrevented
  };
}

export function validateCollisionVelocityDampingResponse(): CollisionVelocityDampingValidationResult {
  const boundaryLowSpeed = runBoundaryVelocityDampingScenario(12);
  const boundaryHighSpeed = runBoundaryVelocityDampingScenario(48);
  const obstacleHighSpeed = runObstacleVelocityDampingScenario(48);
  const racerLowSpeed = runRacerContactVelocityDampingScenario(8);
  const racerHighSpeed = runRacerContactVelocityDampingScenario(48);

  assertGreaterThan(
    boundaryLowSpeed.speedFactor,
    boundaryHighSpeed.speedFactor,
    "boundary damping scales with impact speed severity"
  );
  assertGreaterThan(
    boundaryHighSpeed.speedBefore,
    boundaryHighSpeed.speedAfter,
    "boundary collision reduces velocity"
  );
  assertGreaterThan(
    boundaryHighSpeed.speedFactor,
    obstacleHighSpeed.speedFactor,
    "obstacle damping is harsher than boundary damping"
  );
  assertGreaterThan(
    racerLowSpeed.speedFactor,
    racerHighSpeed.speedFactor,
    "racer contact damping scales with impact speed severity"
  );
  assertGreaterThan(
    racerHighSpeed.speedFactor,
    obstacleHighSpeed.speedFactor,
    "racer contact damping remains softer than obstacle damping"
  );

  return {
    boundaryLowSpeedFactor: boundaryLowSpeed.speedFactor,
    boundaryHighSpeedFactor: boundaryHighSpeed.speedFactor,
    obstacleHighSpeedFactor: obstacleHighSpeed.speedFactor,
    racerLowSpeedFactor: racerLowSpeed.speedFactor,
    racerHighSpeedFactor: racerHighSpeed.speedFactor
  };
}

export function validateCollisionDeflectionResponse(): CollisionDeflectionValidationResult {
  const boundary = runBoundaryCollisionDeflectionScenario();
  const obstacle = runObstacleCollisionDeflectionScenario();
  const racer = runRacerContactDeflectionScenario();

  assertGreaterThan(
    boundary.reboundDot,
    0.25,
    "boundary collision redirects racer inward along normal"
  );
  assertGreaterThan(
    obstacle.reboundDot,
    0.25,
    "obstacle collision redirects racer away along normal"
  );
  assertGreaterThan(
    racer.leftReboundDot,
    0.25,
    "racer contact redirects left racer away from opponent"
  );
  assertGreaterThan(
    racer.rightReboundDot,
    0.25,
    "racer contact redirects right racer away from opponent"
  );
  assertEqual(
    racer.overlapResolved,
    true,
    "racer deflection overlap resolved"
  );

  return {
    boundaryReboundDot: boundary.reboundDot,
    obstacleReboundDot: obstacle.reboundDot,
    racerLeftReboundDot: racer.leftReboundDot,
    racerRightReboundDot: racer.rightReboundDot,
    racerOverlapResolved: racer.overlapResolved
  };
}

export function validateCollisionControlImpactRecovery(): CollisionControlImpactValidationResult {
  const tickSeconds = 1 / 60;
  const baselineSession = createCollisionControlValidationSession(1);
  const impactedSession = createCollisionControlValidationSession(1);
  const baselineRacer = requireRacerState(
    baselineSession.humanRacerStates[0],
    "baseline collision-control racer"
  );
  const impactedRacer = requireRacerState(
    impactedSession.humanRacerStates[0],
    "impacted collision-control racer"
  );
  const boundaryControlSeconds = triggerBoundaryCollisionControlImpact(
    impactedSession,
    impactedRacer
  );
  const racerContact = runRacerContactControlImpactScenario();
  const baselineProbe = runCollisionControlHandlingProbe(
    baselineSession,
    baselineRacer,
    tickSeconds
  );
  const impactedProbe = runCollisionControlHandlingProbe(
    impactedSession,
    impactedRacer,
    tickSeconds
  );

  assertGreaterThan(
    boundaryControlSeconds,
    0,
    "boundary collision starts control-impact timer"
  );
  assertGreaterThan(
    racerContact.leftControlSeconds,
    0,
    "racer contact starts left control-impact timer"
  );
  assertGreaterThan(
    racerContact.rightControlSeconds,
    0,
    "racer contact starts right control-impact timer"
  );
  assertGreaterThan(
    baselineProbe.speedGain,
    impactedProbe.speedGain,
    "collision control impact reduces acceleration response"
  );
  assertGreaterThan(
    baselineProbe.headingDelta,
    impactedProbe.headingDelta,
    "collision control impact reduces steering response"
  );
  assertGreaterThan(
    impactedProbe.controlSecondsAfterTick,
    0,
    "collision control impact remains active briefly after first handling tick"
  );

  impactedSession.setHumanInput(impactedRacer.id, {
    throttle: 0,
    brake: 0,
    steer: 0
  });
  drainCollisionControlImpactTimer(
    impactedSession,
    impactedRacer,
    tickSeconds
  );

  const recoveredControlSeconds = impactedRacer.collisionControlSeconds;
  const recoveredProbe = runCollisionControlHandlingProbe(
    impactedSession,
    impactedRacer,
    tickSeconds
  );

  assertEqual(
    recoveredControlSeconds,
    0,
    "collision control impact timer decays to zero"
  );
  assertGreaterThan(
    recoveredProbe.speedGain,
    impactedProbe.speedGain,
    "recovered collision control restores acceleration response"
  );
  assertGreaterThan(
    recoveredProbe.headingDelta,
    impactedProbe.headingDelta,
    "recovered collision control restores steering response"
  );
  assertAlmostEqual(
    recoveredProbe.speedGain,
    baselineProbe.speedGain,
    "recovered acceleration response matches baseline"
  );
  assertAlmostEqual(
    recoveredProbe.headingDelta,
    baselineProbe.headingDelta,
    "recovered steering response matches baseline"
  );

  return {
    boundaryControlSeconds,
    racerContactLeftControlSeconds: racerContact.leftControlSeconds,
    racerContactRightControlSeconds: racerContact.rightControlSeconds,
    baselineSpeedGain: baselineProbe.speedGain,
    impactedSpeedGain: impactedProbe.speedGain,
    recoveredSpeedGain: recoveredProbe.speedGain,
    baselineHeadingDelta: baselineProbe.headingDelta,
    impactedHeadingDelta: impactedProbe.headingDelta,
    recoveredHeadingDelta: recoveredProbe.headingDelta,
    recoveredControlSeconds
  };
}

interface CollisionControlHandlingProbeResult {
  readonly speedGain: number;
  readonly headingDelta: number;
  readonly controlSecondsAfterTick: number;
}

interface RacerContactControlImpactScenarioResult {
  readonly leftControlSeconds: number;
  readonly rightControlSeconds: number;
}

function createCollisionControlValidationSession(
  humanRacerCount: HumanRacerCountScenario
): RaceSession {
  return createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(humanRacerCount)),
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

function triggerBoundaryCollisionControlImpact(
  raceSession: RaceSession,
  racer: RaceSessionRacerState
): number {
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const rightVector = rightFromHeading(headingRadians);
  const centerOffset =
    DEFAULT_TRACK_DEFINITION.road.courseBoundary.courseHalfWidth -
    refreshRacerCollisionBounds(racer).halfLength +
    0.55;
  const collisionPosition = {
    x: targetPoint.position.x + rightVector.x * centerOffset,
    y: targetPoint.position.y,
    z: targetPoint.position.z + rightVector.z * centerOffset
  };

  parkRaceLoopCollisionValidationNonTargets(raceSession, racer.id, "");
  setMovingRacerPose(
    racer,
    collisionPosition,
    headingFromPlanarDirection(rightVector),
    36
  );
  raceSession.tick(0);

  return racer.collisionControlSeconds;
}

function runRacerContactControlImpactScenario(): RacerContactControlImpactScenarioResult {
  const raceSession = createCollisionControlValidationSession(2);
  const left = requireRacerState(
    raceSession.humanRacerStates[0],
    "collision-control contact left racer"
  );
  const right = requireRacerState(
    raceSession.humanRacerStates[1],
    "collision-control contact right racer"
  );
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const forwardVector = forwardFromHeading(headingRadians);
  const halfSeparation = 0.9;

  parkRaceLoopCollisionValidationNonTargets(raceSession, left.id, right.id);
  setMovingRacerPose(
    left,
    offsetPlanarPosition(targetPoint.position, forwardVector, -halfSeparation),
    headingRadians,
    36
  );
  setMovingRacerPose(
    right,
    offsetPlanarPosition(targetPoint.position, forwardVector, halfSeparation),
    normalizeOrientationRadians(headingRadians + Math.PI),
    36
  );
  raceSession.tick(0);

  return {
    leftControlSeconds: left.collisionControlSeconds,
    rightControlSeconds: right.collisionControlSeconds
  };
}

function runCollisionControlHandlingProbe(
  raceSession: RaceSession,
  racer: RaceSessionRacerState,
  tickSeconds: number
): CollisionControlHandlingProbeResult {
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 1);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const startingSpeed = 2;

  parkRaceLoopCollisionValidationNonTargets(raceSession, racer.id, "");
  setMovingRacerPose(racer, targetPoint.position, headingRadians, startingSpeed);
  raceSession.setHumanInput(racer.id, {
    throttle: 1,
    brake: 0,
    steer: 1
  });

  const speedBeforeTick = racer.speed;
  const headingBeforeTick = racer.headingRadians;

  raceSession.tick(tickSeconds);
  raceSession.setHumanInput(racer.id, {
    throttle: 0,
    brake: 0,
    steer: 0
  });

  return {
    speedGain: racer.speed - speedBeforeTick,
    headingDelta: Math.abs(
      getSignedAngleDeltaRadians(racer.headingRadians, headingBeforeTick)
    ),
    controlSecondsAfterTick: racer.collisionControlSeconds
  };
}

function drainCollisionControlImpactTimer(
  raceSession: RaceSession,
  racer: RaceSessionRacerState,
  tickSeconds: number
): void {
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 1);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  let elapsedSeconds = 0;

  parkRaceLoopCollisionValidationNonTargets(raceSession, racer.id, "");
  setStationaryRacerPose(racer, targetPoint.position, headingRadians);

  while (racer.collisionControlSeconds > 0 && elapsedSeconds < 2) {
    raceSession.tick(tickSeconds);
    elapsedSeconds += tickSeconds;
  }
}

function validateRaceLoopKartPairCollisionScenario(
  scenario: RaceLoopKartPairCollisionScenario
): RaceLoopKartPairCollisionScenarioResult {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const firstHuman = requireRacerState(
    raceSession.humanRacerStates[0],
    `${scenario} first human racer`
  );
  const secondHuman = requireRacerState(
    raceSession.humanRacerStates[1],
    `${scenario} second human racer`
  );
  const firstAi = requireRacerState(
    raceSession.aiRacerStates[0],
    `${scenario} first AI racer`
  );
  const secondAi = requireRacerState(
    raceSession.aiRacerStates[1],
    `${scenario} second AI racer`
  );
  const [left, right] = selectRaceLoopCollisionPair(
    scenario,
    firstHuman,
    secondHuman,
    firstAi,
    secondAi
  );
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const forwardVector = forwardFromHeading(headingRadians);
  const halfSeparation = 0.72;
  const speedBefore = 24;

  parkRaceLoopCollisionValidationNonTargets(raceSession, left.id, right.id);
  setMovingRacerPose(
    left,
    offsetPlanarPosition(targetPoint.position, forwardVector, -halfSeparation),
    headingRadians,
    speedBefore
  );
  setMovingRacerPose(
    right,
    offsetPlanarPosition(targetPoint.position, forwardVector, halfSeparation),
    normalizeOrientationRadians(headingRadians + Math.PI),
    speedBefore
  );

  const leftPositionBeforeTick = { ...left.position };
  const rightPositionBeforeTick = { ...right.position };
  const leftSpeedBeforeTick = left.speed;
  const rightSpeedBeforeTick = right.speed;
  const distanceBeforeTick = getPlanarDistance(left.position, right.position);
  const tickResult = raceSession.tick(0);
  const distanceAfterTick = getPlanarDistance(left.position, right.position);

  return {
    pairChecks: tickResult.kartCollisionPairChecks,
    contacts: tickResult.kartCollisionContacts,
    separationGain: distanceAfterTick - distanceBeforeTick,
    leftPositionDelta: getPlanarDistance(leftPositionBeforeTick, left.position),
    rightPositionDelta: getPlanarDistance(
      rightPositionBeforeTick,
      right.position
    ),
    leftSpeedBefore: leftSpeedBeforeTick,
    leftSpeedAfter: left.speed,
    rightSpeedBefore: rightSpeedBeforeTick,
    rightSpeedAfter: right.speed
  };
}

function assertRaceLoopKartPairCollisionScenario(
  result: RaceLoopKartPairCollisionScenarioResult,
  expectedUniquePairsPerTick: number,
  label: string
): void {
  assertGreaterThan(
    result.pairChecks,
    expectedUniquePairsPerTick - 1,
    `${label} kart-pair checks include every racer pair`
  );
  assertGreaterThan(
    result.contacts,
    0,
    `${label} kart-pair contact count`
  );
  assertGreaterThan(
    result.separationGain,
    0,
    `${label} kart-pair separation gain`
  );
  assertGreaterThan(
    result.leftPositionDelta,
    0,
    `${label} left racer position change`
  );
  assertGreaterThan(
    result.rightPositionDelta,
    0,
    `${label} right racer position change`
  );
  assertGreaterThan(
    result.leftSpeedBefore,
    result.leftSpeedAfter,
    `${label} left racer speed damping`
  );
  assertGreaterThan(
    result.rightSpeedBefore,
    result.rightSpeedAfter,
    `${label} right racer speed damping`
  );
}

function getAverageRacerPairSpeedFactor(
  result: RaceLoopKartPairCollisionScenarioResult
): number {
  const leftFactor =
    result.leftSpeedBefore <= Number.EPSILON
      ? 1
      : result.leftSpeedAfter / result.leftSpeedBefore;
  const rightFactor =
    result.rightSpeedBefore <= Number.EPSILON
      ? 1
      : result.rightSpeedAfter / result.rightSpeedBefore;

  return (leftFactor + rightFactor) / 2;
}

function assertRaceLoopManeuverCollisionScenario(
  result: RaceLoopKartManeuverCollisionScenarioResult,
  label: string
): void {
  assertGreaterThan(
    result.contacts,
    0,
    `${label} contact count`
  );
  assertEqual(
    result.overlapResolved,
    true,
    `${label} overlap resolved`
  );
}

function validateRaceLoopHeadOnCollisionScenario(): RaceLoopKartManeuverCollisionScenarioResult {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const left = requireRacerState(
    raceSession.humanRacerStates[0],
    "head-on left racer"
  );
  const right = requireRacerState(
    raceSession.humanRacerStates[1],
    "head-on right racer"
  );
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const forwardVector = forwardFromHeading(headingRadians);

  parkRaceLoopCollisionValidationNonTargets(raceSession, left.id, right.id);
  setStationaryRacerPose(
    left,
    offsetPlanarPosition(targetPoint.position, forwardVector, -0.55),
    headingRadians
  );
  setStationaryRacerPose(
    right,
    offsetPlanarPosition(targetPoint.position, forwardVector, 0.55),
    normalizeOrientationRadians(headingRadians + Math.PI)
  );

  const tickResult = raceSession.tick(0);

  return {
    contacts: tickResult.kartCollisionContacts,
    overlapResolved: !hasRacerPairOverlap(left, right)
  };
}

function validateRaceLoopSideImpactCollisionScenario(): RaceLoopKartManeuverCollisionScenarioResult {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const front = requireRacerState(
    raceSession.humanRacerStates[0],
    "side-impact front racer"
  );
  const side = requireRacerState(
    raceSession.humanRacerStates[1],
    "side-impact side racer"
  );
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const rightVector = rightFromHeading(headingRadians);

  parkRaceLoopCollisionValidationNonTargets(raceSession, front.id, side.id);
  setStationaryRacerPose(front, targetPoint.position, headingRadians);
  setStationaryRacerPose(
    side,
    offsetPlanarPosition(targetPoint.position, rightVector, 0.85),
    normalizeOrientationRadians(headingRadians + Math.PI / 2)
  );

  const tickResult = raceSession.tick(0);

  return {
    contacts: tickResult.kartCollisionContacts,
    overlapResolved: !hasRacerPairOverlap(front, side)
  };
}

function validateRaceLoopMultiKartCollisionScenario(): RaceLoopMultiKartCollisionScenarioResult {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(4)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const racers = raceSession.racerStates;
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const forwardVector = forwardFromHeading(headingRadians);
  const rightVector = rightFromHeading(headingRadians);
  const offsets = [
    { axis: forwardVector, distance: -0.5 },
    { axis: forwardVector, distance: 0.5 },
    { axis: rightVector, distance: -0.5 },
    { axis: rightVector, distance: 0.5 }
  ] as const;

  racers.forEach((racer, index) => {
    const offset = offsets[index];

    if (offset === undefined) {
      throw new Error(`Missing multi-kart validation offset ${index}.`);
    }

    setStationaryRacerPose(
      racer,
      offsetPlanarPosition(targetPoint.position, offset.axis, offset.distance),
      headingRadians
    );
  });

  const tickResult = raceSession.tick(0);

  return {
    contacts: tickResult.kartCollisionContacts,
    overlapsResolved: getRacerPairOverlapCount(racers) === 0
  };
}

function validateRaceLoopHighSpeedCollisionScenario(): RaceLoopHighSpeedCollisionScenarioResult {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2), HIGH_SPEED_AI_PROFILES),
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
  const left = requireRacerState(
    raceSession.aiRacerStates[0],
    "high-speed left AI racer"
  );
  const right = requireRacerState(
    raceSession.aiRacerStates[1],
    "high-speed right AI racer"
  );
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const forwardVector = forwardFromHeading(headingRadians);
  const initialHalfSeparation = 1.65;
  const testSpeed = 48;

  parkRaceLoopCollisionValidationNonTargets(raceSession, left.id, right.id);
  setMovingRacerPose(
    left,
    offsetPlanarPosition(
      targetPoint.position,
      forwardVector,
      -initialHalfSeparation
    ),
    headingRadians,
    testSpeed
  );
  setMovingRacerPose(
    right,
    offsetPlanarPosition(
      targetPoint.position,
      forwardVector,
      initialHalfSeparation
    ),
    normalizeOrientationRadians(headingRadians + Math.PI),
    testSpeed
  );

  const tickResult = raceSession.tick(1 / 15);
  const leftProjection = getPlanarProjection(
    left.position,
    targetPoint.position,
    forwardVector
  );
  const rightProjection = getPlanarProjection(
    right.position,
    targetPoint.position,
    forwardVector
  );

  return {
    contacts: tickResult.kartCollisionContacts,
    overlapResolved: !hasRacerPairOverlap(left, right),
    tunnelPrevented: leftProjection < rightProjection
  };
}

function runBoundaryVelocityDampingScenario(
  speed: number
): CollisionVelocityDampingScenarioResult {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const racer = requireRacerState(
    raceSession.humanRacerStates[0],
    "boundary damping racer"
  );
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const rightVector = rightFromHeading(headingRadians);
  const penetrationDepth = 0.55;
  const centerOffset =
    DEFAULT_TRACK_DEFINITION.road.courseBoundary.courseHalfWidth -
    refreshRacerCollisionBounds(racer).halfLength +
    penetrationDepth;
  const position = {
    x: targetPoint.position.x + rightVector.x * centerOffset,
    y: targetPoint.position.y,
    z: targetPoint.position.z + rightVector.z * centerOffset
  };
  const outwardHeading = headingFromPlanarDirection(rightVector);

  parkRaceLoopCollisionValidationNonTargets(raceSession, racer.id, "");
  setMovingRacerPose(racer, position, outwardHeading, speed);
  raceSession.tick(0);

  return createCollisionVelocityDampingScenarioResult(speed, racer.speed);
}

function runObstacleVelocityDampingScenario(
  speed: number
): CollisionVelocityDampingScenarioResult {
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const rightVector = rightFromHeading(headingRadians);
  const obstacle = {
    id: "damping-validation-oil-drum",
    position: { ...targetPoint.position },
    radius: 1.45,
    halfHeight: 0.8,
    obstacleKind: "oil-drum" as const,
    impactSpeedFactor: 0.4
  };
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      obstacles: [obstacle],
      itemPickups: []
    }
  );
  const racer = requireRacerState(
    raceSession.humanRacerStates[0],
    "obstacle damping racer"
  );
  const penetrationDepth = 0.45;
  const centerOffset =
    obstacle.radius +
    refreshRacerCollisionBounds(racer).halfLength -
    penetrationDepth;
  const position = {
    x: obstacle.position.x + rightVector.x * centerOffset,
    y: obstacle.position.y,
    z: obstacle.position.z + rightVector.z * centerOffset
  };
  const impactHeading = headingFromPlanarDirection({
    x: -rightVector.x,
    z: -rightVector.z
  });

  parkRaceLoopCollisionValidationNonTargets(raceSession, racer.id, "");
  setMovingRacerPose(racer, position, impactHeading, speed);
  raceSession.tick(0);

  return createCollisionVelocityDampingScenarioResult(speed, racer.speed);
}

function runRacerContactVelocityDampingScenario(
  speed: number
): CollisionVelocityDampingScenarioResult {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const left = requireRacerState(
    raceSession.humanRacerStates[0],
    "racer damping left racer"
  );
  const right = requireRacerState(
    raceSession.humanRacerStates[1],
    "racer damping right racer"
  );
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const forwardVector = forwardFromHeading(headingRadians);
  const halfSeparation = 0.9;

  parkRaceLoopCollisionValidationNonTargets(raceSession, left.id, right.id);
  setMovingRacerPose(
    left,
    offsetPlanarPosition(targetPoint.position, forwardVector, -halfSeparation),
    headingRadians,
    speed
  );
  setMovingRacerPose(
    right,
    offsetPlanarPosition(targetPoint.position, forwardVector, halfSeparation),
    normalizeOrientationRadians(headingRadians + Math.PI),
    speed
  );
  raceSession.tick(0);

  return createCollisionVelocityDampingScenarioResult(speed, left.speed);
}

function createCollisionVelocityDampingScenarioResult(
  speedBefore: number,
  speedAfter: number
): CollisionVelocityDampingScenarioResult {
  return {
    speedBefore,
    speedAfter,
    speedFactor: speedBefore <= Number.EPSILON ? 1 : speedAfter / speedBefore
  };
}

function runBoundaryCollisionDeflectionScenario(): StaticCollisionDeflectionScenarioResult {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const racer = requireRacerState(
    raceSession.humanRacerStates[0],
    "boundary deflection racer"
  );
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const rightVector = rightFromHeading(headingRadians);
  const inwardNormal = { x: -rightVector.x, z: -rightVector.z };
  const penetrationDepth = 0.5;
  const centerOffset =
    DEFAULT_TRACK_DEFINITION.road.courseBoundary.courseHalfWidth -
    refreshRacerCollisionBounds(racer).halfLength +
    penetrationDepth;
  const position = {
    x: targetPoint.position.x + rightVector.x * centerOffset,
    y: targetPoint.position.y,
    z: targetPoint.position.z + rightVector.z * centerOffset
  };

  parkRaceLoopCollisionValidationNonTargets(raceSession, racer.id, "");
  setMovingRacerPose(
    racer,
    position,
    headingFromPlanarDirection(rightVector),
    36
  );
  raceSession.tick(0);

  return {
    reboundDot: getPlanarDot(racer.forward, inwardNormal)
  };
}

function runObstacleCollisionDeflectionScenario(): StaticCollisionDeflectionScenarioResult {
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const rightVector = rightFromHeading(headingRadians);
  const obstacle = {
    id: "deflection-validation-oil-drum",
    position: { ...targetPoint.position },
    radius: 1.45,
    halfHeight: 0.8,
    obstacleKind: "oil-drum" as const,
    impactSpeedFactor: 0.4
  };
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      obstacles: [obstacle],
      itemPickups: []
    }
  );
  const racer = requireRacerState(
    raceSession.humanRacerStates[0],
    "obstacle deflection racer"
  );
  const centerOffset =
    obstacle.radius + refreshRacerCollisionBounds(racer).halfLength - 0.42;
  const position = {
    x: obstacle.position.x + rightVector.x * centerOffset,
    y: obstacle.position.y,
    z: obstacle.position.z + rightVector.z * centerOffset
  };

  parkRaceLoopCollisionValidationNonTargets(raceSession, racer.id, "");
  setMovingRacerPose(
    racer,
    position,
    headingFromPlanarDirection({
      x: -rightVector.x,
      z: -rightVector.z
    }),
    36
  );
  raceSession.tick(0);

  return {
    reboundDot: getPlanarDot(racer.forward, rightVector)
  };
}

function runRacerContactDeflectionScenario(): RacerContactDeflectionScenarioResult {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const left = requireRacerState(
    raceSession.humanRacerStates[0],
    "racer deflection left racer"
  );
  const right = requireRacerState(
    raceSession.humanRacerStates[1],
    "racer deflection right racer"
  );
  const targetPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const forwardVector = forwardFromHeading(headingRadians);
  const halfSeparation = 0.9;

  parkRaceLoopCollisionValidationNonTargets(raceSession, left.id, right.id);
  setMovingRacerPose(
    left,
    offsetPlanarPosition(targetPoint.position, forwardVector, -halfSeparation),
    headingRadians,
    36
  );
  setMovingRacerPose(
    right,
    offsetPlanarPosition(targetPoint.position, forwardVector, halfSeparation),
    normalizeOrientationRadians(headingRadians + Math.PI),
    36
  );
  raceSession.tick(0);

  return {
    leftReboundDot: getPlanarDot(left.forward, {
      x: -forwardVector.x,
      z: -forwardVector.z
    }),
    rightReboundDot: getPlanarDot(right.forward, forwardVector),
    overlapResolved: !hasRacerPairOverlap(left, right)
  };
}

function validateRaceLoopKartPairBoundaryCollisionScenario(): RaceLoopKartPairBoundaryCollisionScenarioResult {
  const firstResult = runRaceLoopKartPairBoundaryCollisionScenario();
  const repeatResult = runRaceLoopKartPairBoundaryCollisionScenario();

  assertAlmostEqual(
    repeatResult.leftX,
    firstResult.leftX,
    "boundary collision deterministic left x"
  );
  assertAlmostEqual(
    repeatResult.leftZ,
    firstResult.leftZ,
    "boundary collision deterministic left z"
  );
  assertAlmostEqual(
    repeatResult.rightX,
    firstResult.rightX,
    "boundary collision deterministic right x"
  );
  assertAlmostEqual(
    repeatResult.rightZ,
    firstResult.rightZ,
    "boundary collision deterministic right z"
  );

  return firstResult;
}

function runRaceLoopKartPairBoundaryCollisionScenario(): RaceLoopKartPairBoundaryCollisionScenarioResult {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(2)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const left = requireRacerState(
    raceSession.humanRacerStates[0],
    "boundary collision left human racer"
  );
  const right = requireRacerState(
    raceSession.humanRacerStates[1],
    "boundary collision right human racer"
  );
  const startPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const rightVector = rightFromHeading(headingRadians);
  const edgeOffset =
    DEFAULT_TRACK_DEFINITION.road.courseBoundary.courseHalfWidth -
    refreshRacerCollisionBounds(left).halfWidth -
    0.05;
  const edgePosition = {
    x: startPoint.position.x + rightVector.x * edgeOffset,
    y: startPoint.position.y,
    z: startPoint.position.z + rightVector.z * edgeOffset
  };

  parkRaceLoopCollisionValidationNonTargets(raceSession, left.id, right.id);
  setStationaryRacerPose(left, edgePosition, headingRadians);
  setStationaryRacerPose(right, edgePosition, headingRadians);

  const distanceBeforeTick = getPlanarDistance(left.position, right.position);
  const tickResult = raceSession.tick(0);
  const distanceAfterTick = getPlanarDistance(left.position, right.position);
  const leftBounds = refreshRacerCollisionBounds(left);
  const rightBounds = refreshRacerCollisionBounds(right);

  return {
    contacts: tickResult.kartCollisionContacts,
    separationGain: distanceAfterTick - distanceBeforeTick,
    overlapResolved:
      detectKartCollisionBoundsOverlap(leftBounds, rightBounds) === null,
    leftInsideCourse: isRacerCollisionBoundsInsideCourse(left),
    rightInsideCourse: isRacerCollisionBoundsInsideCourse(right),
    leftX: left.position.x,
    leftZ: left.position.z,
    rightX: right.position.x,
    rightZ: right.position.z
  };
}

function isRacerCollisionBoundsInsideCourse(
  racer: RaceSessionRacerState
): boolean {
  const bounds = refreshRacerCollisionBounds(racer);
  const samplePoints = [
    bounds.center,
    bounds.frontLeft,
    bounds.frontRight,
    bounds.rearLeft,
    bounds.rearRight
  ] as const;

  return samplePoints.every(
    (point) =>
      queryTrackSurfaceAtPoint(
        DEFAULT_TRACK_DEFINITION.road,
        point,
        0
      ).withinCourseBoundary
  );
}

function selectRaceLoopCollisionPair(
  scenario: RaceLoopKartPairCollisionScenario,
  firstHuman: RaceSessionRacerState,
  secondHuman: RaceSessionRacerState,
  firstAi: RaceSessionRacerState,
  secondAi: RaceSessionRacerState
): readonly [RaceSessionRacerState, RaceSessionRacerState] {
  switch (scenario) {
    case "human-human":
      return [firstHuman, secondHuman];
    case "human-ai":
      return [firstHuman, firstAi];
    case "ai-ai":
      return [firstAi, secondAi];
  }
}

function parkRaceLoopCollisionValidationNonTargets(
  raceSession: RaceSession,
  leftRacerId: string,
  rightRacerId: string
): void {
  const parkingPointIndexes = [3, 6] as const;
  let parkingSlot = 0;

  for (const racer of raceSession.racerStates) {
    if (racer.id === leftRacerId || racer.id === rightRacerId) {
      continue;
    }

    const parkingPointIndex =
      parkingPointIndexes[parkingSlot % parkingPointIndexes.length] ?? 3;
    const parkingPoint = requireTrackCenterPoint(
      DEFAULT_TRACK_DEFINITION.road,
      parkingPointIndex
    );

    setStationaryRacerPose(
      racer,
      parkingPoint.position,
      DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians
    );
    parkingSlot += 1;
  }
}

if (isDirectExecution()) {
  const results = validateRaceStartRosterCapacityScenarios();
  const multiplayerAiSlots = validateMultiplayerAiSlotAssignments();
  const trackGeometry = validateDefaultTrackGeometry();
  const trackCollision = validateDefaultTrackCollisionLayer();
  const startGrid = validateStartingGridAlignment();
  const slotTransforms = validateRacerSlotTransformStateStability();
  const slotRaceState = validateRacerSlotRaceProgressAndPlacementState();
  const progression = validateAiRacerProgressionUsesRaceRules();
  const orderedProgression = validateOrderedCheckpointCrossingRules();
  const progressSurface = validateRaceProgressStateSurface();
  const duration = validateApproximateRaceDuration();
  const boostPickup = validateBoostItemPickupRegistration();
  const shellPickupInventory = validateShellItemPickupInventoryFlow();
  const shellItemUseControl = validateShellItemUseControlFlow();
  const shellProjectileTick = validateShellProjectileTickUpdate();
  const shellInitialDirection = validateShellProjectileCapturesInitialDirection();
  const shellLifetimeCleanup = validateShellProjectileLifetimeCleanup();
  const shellHitboxCollision = validateShellHitboxCollisionEvents();
  const shellObstacleCollision = validateShellObstacleCollisionBehavior();
  const bananaObstacleWorldState = validateBananaObstacleWorldState();
  const bananaCleanupRules = validateBananaCleanupRules();
  const bananaHazardCollision = validateBananaHazardCollisionConsumption();
  const timedSpinoutControlLoss = validateTimedSpinoutControlLossState();
  const boostActivation = validateBoostActivationStatusEffect();
  const shellRegistry = validateShellItemRegistryRegistration();
  const bananaRegistry = validateBananaItemRegistryRegistration();
  const boundaryPhysics = validateTrackBoundaryPhysicsResponse();
  const kartCollisionBounds = validateKartCollisionBoundsModel();
  const raceLoopKartCollisions = validateRaceLoopKartPairCollisionChecks();
  const collisionDamping = validateCollisionVelocityDampingResponse();
  const collisionDeflection = validateCollisionDeflectionResponse();
  const collisionControlImpact = validateCollisionControlImpactRecovery();
  const boundaryContacts = validateKartTrackBoundaryContactDetection();

  for (const result of results) {
    console.info(
      [
        `humans=${result.humanRacerCount}`,
        `ai=${result.aiRacerCount}`,
        `roster=${result.rosterRacerCount}`,
        `raceState=${result.raceStateRacerCount}`,
        `raceSession=${result.raceSessionRacerCount}`
      ].join(" ")
    );
  }

  console.info(
    [
      "multiplayerAiSlots=ok",
      `racers=${multiplayerAiSlots.racerCount}`,
      `humans=${multiplayerAiSlots.humanRacerCount}`,
      `ai=${multiplayerAiSlots.aiRacerCount}`,
      `humanSlots=${multiplayerAiSlots.humanSlots.join(",")}`,
      `aiSlots=${multiplayerAiSlots.aiSlots.join(",")}`,
      `aiSpawns=${multiplayerAiSlots.distinctAiSpawnCount}`,
      `aiPeerlessOwners=${multiplayerAiSlots.aiPeerlessInputOwnerCount}`,
      `aiNeutralInputs=${multiplayerAiSlots.aiNeutralInputCount}`
    ].join(" ")
  );

  console.info(
    [
      "trackGeometry=ok",
      `centerline=${trackGeometry.centerlinePointCount}`,
      `segments=${trackGeometry.segmentCount}`,
      `lapMarkers=${trackGeometry.lapMarkerCount}`,
      `checkpoints=${trackGeometry.checkpointCount}`,
      `startFinishProgress=${trackGeometry.startFinishMarkerProgress.toFixed(2)}`,
      `firstProgressMarker=${trackGeometry.firstProgressMarkerOrder}`,
      `finalMarkerNext=${trackGeometry.finalMarkerNextOrder}`,
      `length=${trackGeometry.totalLength.toFixed(2)}`,
      `width=${trackGeometry.roadWidth}`,
      `courseHalfWidth=${trackGeometry.courseHalfWidth}`,
      `leftCourseBoundary=${trackGeometry.leftCourseBoundaryPointCount}`,
      `rightCourseBoundary=${trackGeometry.rightCourseBoundaryPointCount}`,
      `offTrackRegions=${trackGeometry.offTrackRegionCount}`,
      `offTrackIds=${trackGeometry.offTrackRegionIds.join(",")}`,
      `surfaces=${trackGeometry.surfaceSamples.join(",")}`
    ].join(" ")
  );

  console.info(
    [
      "trackCollision=ok",
      `trackId=${trackCollision.trackId}`,
      `boundaries=${trackCollision.boundaryColliderCount}`,
      `left=${trackCollision.leftBoundaryColliderCount}`,
      `right=${trackCollision.rightBoundaryColliderCount}`,
      `obstacles=${trackCollision.obstacleColliderCount}`,
      `obstacleIds=${trackCollision.obstacleIds.join(",")}`,
      `minObstacleLineClearance=${trackCollision.minimumObstacleRacingLineClearance.toFixed(2)}`,
      `firstBoundaryLength=${trackCollision.firstBoundaryLength.toFixed(2)}`,
      `halfThickness=${trackCollision.firstBoundaryHalfThickness.toFixed(2)}`,
      `halfHeight=${trackCollision.firstBoundaryHalfHeight.toFixed(2)}`,
      `heading=${trackCollision.firstBoundaryHeadingRadians.toFixed(3)}`
    ].join(" ")
  );

  console.info(
    [
      "startGrid=ok",
      `slots=${startGrid.slotCount}`,
      `humans=${startGrid.humanRacerCount}`,
      `ai=${startGrid.aiRacerCount}`,
      `sessionHumans=${startGrid.raceSessionHumanRacerCount}`,
      `sessionAi=${startGrid.raceSessionAiRacerCount}`,
      `sessionRacers=${startGrid.sessionSpawnedRacerCount}`,
      `bodyAligned=${startGrid.bodyAlignedRacerCount}`,
      `heading=${startGrid.headingRadians.toFixed(3)}`,
      `minForwardDot=${startGrid.minForwardAlignment.toFixed(3)}`,
      `maxLateral=${startGrid.maxLateralOffset.toFixed(2)}`,
      `lastForward=${startGrid.lastForwardOffset.toFixed(2)}`
    ].join(" ")
  );

  console.info(
    [
      "slotTransforms=ok",
      `slots=${slotTransforms.slotCount}`,
      `spawnAligned=${slotTransforms.spawnAlignedRacerCount}`,
      `stableRefs=${slotTransforms.stableSlotReferenceCount}`,
      `rankingStable=${slotTransforms.stableOrderAfterRanking}`,
      `tickStable=${slotTransforms.stableOrderAfterTick}`,
      `arrayStable=${slotTransforms.stableArrayReferenceAfterTick}`,
      `preserved=${slotTransforms.preservedTransformCount}`,
      `updated=${slotTransforms.updatedTransformCount}`
    ].join(" ")
  );

  console.info(
    [
      "slotRaceState=ok",
      `slots=${slotRaceState.slotCount}`,
      `laps=${slotRaceState.lapCount}`,
      `phase=${slotRaceState.initialPhase}`,
      `participants=${slotRaceState.participantCount}`,
      `localParticipants=${slotRaceState.localHumanParticipantCount}`,
      `remoteParticipants=${slotRaceState.remoteHumanParticipantCount}`,
      `aiParticipants=${slotRaceState.aiParticipantCount}`,
      `readyParticipants=${slotRaceState.readyParticipantCount}`,
      `racingParticipants=${slotRaceState.racingParticipantCount}`,
      `finishedParticipants=${slotRaceState.finishedParticipantCount}`,
      `participantPositions=${slotRaceState.participantPositionUpdateCount}`,
      `participantRanks=${slotRaceState.participantRankUpdateCount}`,
      `resetParticipants=${slotRaceState.resetReadyParticipantCount}`,
      `progressRefs=${slotRaceState.independentInitialProgressCount}`,
      `placementRefs=${slotRaceState.independentInitialPlacementCount}`,
      `initialRanks=${slotRaceState.uniqueInitialRankCount}`,
      `currentLapInitial=${slotRaceState.initialCurrentLapCount}`,
      `raceProgressInitial=${slotRaceState.initialRaceProgressCount}`,
      `maintainedProgress=${slotRaceState.maintainedProgressSlotCount}`,
      `maintainedRanks=${slotRaceState.maintainedRankSlotCount}`,
      `snapshots=${slotRaceState.raceProgressSnapshotCount}`,
      `snapshotRanks=${slotRaceState.uniqueSnapshotRankCount}`,
      `finishPlaces=${slotRaceState.finishPlaceCount}`,
      `finishOrder=${slotRaceState.finishOrderSignature}`,
      `resetPhase=${slotRaceState.resetPhase}`,
      `resetProgress=${slotRaceState.resetInitialProgressCount}`,
      `resetFinishTimes=${slotRaceState.resetFinishTimeCount}`
    ].join(" ")
  );

  console.info(
    [
      "aiProgression=ok",
      `humanCheckpoint=${progression.humanCheckpointIndex}`,
      `aiCheckpoint=${progression.aiCheckpointIndex}`,
      `aiProjectedCheckpoint=${progression.aiProjectedCheckpointIndex}`,
      `aiProjectedTrackProgress=${progression.aiProjectedTrackProgress.toFixed(2)}`,
      `aiRankBeforeFinish=${progression.aiRankBeforeFinish}`,
      `aiFinished=${progression.aiFinished}`,
      `aiLap=${progression.aiLap}`,
      `aiFinishPlace=${progression.aiFinishPlace}`,
      `aiRankAfterFinish=${progression.aiRankAfterFinish}`,
      `aiProjectedFinishPlace=${progression.aiProjectedFinishPlace}`
    ].join(" ")
  );

  console.info(
    [
      "orderedCheckpoints=ok",
      `blockedCheckpoint=${orderedProgression.blockedCheckpointIndex}`,
      `firstCheckpoint=${orderedProgression.firstCheckpointIndex}`,
      `blockedLap=${orderedProgression.blockedLap}`,
      `completedLap=${orderedProgression.completedLap}`,
      `finalCheckpoint=${orderedProgression.finalCheckpointIndex}`,
      `prematureFinishBlocked=${orderedProgression.prematureFinishBlocked}`,
      `staleFinishShortcutBlocked=${orderedProgression.staleFinishShortcutBlocked}`
    ].join(" ")
  );

  console.info(
    [
      "raceProgress=ok",
      `initialRatio=${progressSurface.initialCompletionRatio.toFixed(2)}`,
      `finishedRatio=${progressSurface.finishedCompletionRatio.toFixed(2)}`,
      `completedDistance=${progressSurface.completedDistance.toFixed(2)}`,
      `totalDistance=${progressSurface.totalDistance.toFixed(2)}`,
      `finished=${progressSurface.finished}`,
      `tickSurfaceCount=${progressSurface.tickSurfaceCount}`
    ].join(" ")
  );

  console.info(
    [
      "raceDuration=ok",
      `targetSeconds=${duration.targetSeconds}`,
      `toleranceSeconds=${duration.toleranceSeconds}`,
      `finishTimeSeconds=${duration.finishTimeSeconds.toFixed(2)}`,
      `ticks=${duration.tickCount}`
    ].join(" ")
  );

  console.info(
    [
      "boostPickup=ok",
      `pickupId=${boostPickup.pickupId}`,
      `heldItem=${boostPickup.heldItem}`,
      `activeAfterCollection=${boostPickup.activeAfterCollection}`,
      `respawnSeconds=${boostPickup.respawnSeconds}`,
      `respawnDeadline=${boostPickup.respawnDeadlineElapsedSeconds}`
    ].join(" ")
  );

  console.info(
    [
      "shellPickupInventory=ok",
      `pickupId=${shellPickupInventory.pickupId}`,
      `heldItem=${shellPickupInventory.heldItem}`,
      `collectionItemType=${shellPickupInventory.collectionItemType}`,
      `respawnSeconds=${shellPickupInventory.respawnSeconds}`,
      `mirroredHeldItem=${shellPickupInventory.mirroredHeldItem}`,
      `blockedHeldItem=${shellPickupInventory.blockedHeldItem}`,
      `blockedCollections=${shellPickupInventory.blockedCollectionCount}`
    ].join(" ")
  );

  console.info(
    [
      "shellItemUseControl=ok",
      `racerId=${shellItemUseControl.racerId}`,
      `action=${shellItemUseControl.action}`,
      `heldItemAfterUse=${shellItemUseControl.heldItemAfterUse}`,
      `activeItemId=${shellItemUseControl.activeItemId}`,
      `activeItems=${shellItemUseControl.activeItems}`,
      `owner=${shellItemUseControl.ownerRacerId}`,
      `ownerSlot=${shellItemUseControl.ownerSlotIndex}`,
      `speed=${shellItemUseControl.projectileSpeed}`,
      `velocitySpeed=${shellItemUseControl.velocitySpeed}`,
      `spawnDistance=${shellItemUseControl.spawnDistance.toFixed(2)}`,
      `forwardDot=${shellItemUseControl.forwardAlignment.toFixed(2)}`,
      `staleForwardDot=${shellItemUseControl.staleForwardAlignment.toFixed(2)}`,
      `spawnLateral=${shellItemUseControl.spawnLateralOffset.toFixed(3)}`,
      `tick=${shellItemUseControl.tickIndex}`
    ].join(" ")
  );

  console.info(
    [
      "shellProjectileTick=ok",
      `activeItemId=${shellProjectileTick.activeItemId}`,
      `tickSeconds=${shellProjectileTick.tickSeconds.toFixed(3)}`,
      `direction=(${shellProjectileTick.directionX.toFixed(2)},${shellProjectileTick.directionZ.toFixed(2)})`,
      `speed=${shellProjectileTick.speed}`,
      `distance=${shellProjectileTick.distanceMoved.toFixed(2)}`,
      `expected=${shellProjectileTick.expectedDistance.toFixed(2)}`,
      `velocitySpeed=${shellProjectileTick.velocitySpeedAfterTick.toFixed(2)}`
    ].join(" ")
  );

  console.info(
    [
      "shellInitialDirection=ok",
      `activeItemId=${shellInitialDirection.activeItemId}`,
      `tickSeconds=${shellInitialDirection.tickSeconds.toFixed(3)}`,
      `initial=(${shellInitialDirection.initialDirectionX.toFixed(2)},${shellInitialDirection.initialDirectionZ.toFixed(2)})`,
      `ownerTurn=(${shellInitialDirection.ownerTurnDirectionX.toFixed(2)},${shellInitialDirection.ownerTurnDirectionZ.toFixed(2)})`,
      `retained=(${shellInitialDirection.retainedDirectionX.toFixed(2)},${shellInitialDirection.retainedDirectionZ.toFixed(2)})`,
      `travelDot=${shellInitialDirection.travelAlignment.toFixed(2)}`,
      `ownerTurnDot=${shellInitialDirection.ownerTurnAlignment.toFixed(2)}`,
      `distance=${shellInitialDirection.distanceMoved.toFixed(2)}`,
      `expected=${shellInitialDirection.expectedDistance.toFixed(2)}`
    ].join(" ")
  );

  console.info(
    [
      "shellLifetimeCleanup=ok",
      `activeItemId=${shellLifetimeCleanup.activeItemId}`,
      `lifetime=${shellLifetimeCleanup.lifetimeSeconds.toFixed(2)}`,
      `initialTtl=${shellLifetimeCleanup.initialTtlSeconds.toFixed(2)}`,
      `ttlAfterTick=${shellLifetimeCleanup.ttlAfterFirstTick.toFixed(3)}`,
      `ageAfterTick=${shellLifetimeCleanup.ageAfterFirstTick.toFixed(3)}`,
      `expiryTicks=${shellLifetimeCleanup.expiryTickCount}`,
      `afterExpiry=${shellLifetimeCleanup.activeItemsAfterExpiry}`,
      `afterLeavingArea=${shellLifetimeCleanup.activeItemsAfterLeavingArea}`
    ].join(" ")
  );

  console.info(
    [
      "shellHitboxCollision=ok",
      `eventId=${shellHitboxCollision.eventId}`,
      `shellId=${shellHitboxCollision.shellId}`,
      `source=${shellHitboxCollision.sourceRacerId}`,
      `target=${shellHitboxCollision.targetRacerId}`,
      `targetSlot=${shellHitboxCollision.targetSlotIndex}`,
      `penetration=${shellHitboxCollision.hitboxPenetrationDepth.toFixed(3)}`,
      `relativeSpeed=${shellHitboxCollision.impactRelativeSpeed.toFixed(2)}`,
      `stun=${shellHitboxCollision.targetStunSeconds.toFixed(2)}`,
      `spin=${shellHitboxCollision.targetSpinoutSeconds.toFixed(2)}`,
      `configuredSpin=${shellHitboxCollision.configuredTargetSpinoutSeconds.toFixed(2)}`,
      `immune=${shellHitboxCollision.targetHitImmunitySeconds.toFixed(2)}`,
      `feedback=${shellHitboxCollision.targetHitFeedbackSeconds.toFixed(2)}`,
      `speedAfter=${shellHitboxCollision.targetSpeedAfterHit.toFixed(2)}`,
      `afterHit=${shellHitboxCollision.shellCountAfterHit}`,
      `immuneOverlapShells=${shellHitboxCollision.immuneShellCountAfterOverlap}`,
      `immuneEvents=${shellHitboxCollision.immuneShellHitEventCount}`,
      `immuneExpired=${shellHitboxCollision.immunitySecondsAfterExpiry}`,
      `postSpinoutDuplicateEvents=${shellHitboxCollision.postSpinoutDuplicateShellHitEventCount}`,
      `postSpinoutDuplicateShells=${shellHitboxCollision.postSpinoutDuplicateRemainingShellCount}`,
      `postSpinoutDuplicateSpin=${shellHitboxCollision.spinoutSecondsAfterPostSpinoutDuplicate.toFixed(2)}`,
      `postSpinoutDuplicateSpeed=${shellHitboxCollision.speedAfterPostSpinoutDuplicate.toFixed(2)}`,
      `simultaneousEvents=${shellHitboxCollision.simultaneousShellHitEventCount}`,
      `simultaneousSpeed=${shellHitboxCollision.simultaneousTargetSpeedAfterHit.toFixed(2)}`,
      `simultaneousShells=${shellHitboxCollision.simultaneousRemainingShellCount}`,
      `pendingAccepted=${shellHitboxCollision.pendingShellHitAccepted}`,
      `pendingDuplicateBefore=${shellHitboxCollision.pendingDuplicateShellHitAccepted}`,
      `pendingDuplicateAfter=${shellHitboxCollision.pendingDuplicateAfterHitAccepted}`,
      `pendingShells=${shellHitboxCollision.pendingShellCountAfterApply}`,
      `pendingStunBefore=${shellHitboxCollision.pendingStunBeforeHitTime.toFixed(2)}`,
      `pendingStunAfter=${shellHitboxCollision.pendingStunAfterHitTime.toFixed(2)}`,
      `pendingSpeed=${shellHitboxCollision.pendingSpeedAfterHitTime.toFixed(2)}`,
      `sweptEvents=${shellHitboxCollision.sweptShellHitEventCount}`,
      `sweptTarget=${shellHitboxCollision.sweptShellTargetRacerId}`,
      `sweptShells=${shellHitboxCollision.sweptShellsAfterHit}`,
      `sweptImpact=${shellHitboxCollision.sweptImpactTravelDistance.toFixed(2)}`,
      `sweptFinal=${shellHitboxCollision.sweptFinalCenterDistance.toFixed(2)}`,
      `movingSweptEvents=${shellHitboxCollision.movingSweptShellHitEventCount}`,
      `movingSweptTarget=${shellHitboxCollision.movingSweptShellTargetRacerId}`,
      `movingSweptShells=${shellHitboxCollision.movingSweptShellsAfterHit}`,
      `movingSweptImpact=${shellHitboxCollision.movingSweptImpactTravelDistance.toFixed(2)}`,
      `movingSweptFinalLat=${shellHitboxCollision.movingSweptFinalLateralSeparation.toFixed(2)}`,
      `alreadyHitEvents=${shellHitboxCollision.alreadyHitTargetShellHitEventCount}`,
      `alreadyHitShells=${shellHitboxCollision.alreadyHitTargetRemainingShellCount}`,
      `expiredEvents=${shellHitboxCollision.expiredShellHitEventCount}`,
      `expiredShells=${shellHitboxCollision.expiredShellRemainingCount}`,
      `missShells=${shellHitboxCollision.missShellCount}`,
      `missEvents=${shellHitboxCollision.missEventCount}`
    ].join(" ")
  );

  console.info(
    [
      "shellObstacleCollision=ok",
      `tireId=${shellObstacleCollision.tireObstacleId}`,
      `tireKind=${shellObstacleCollision.tireObstacleKind}`,
      `tireShells=${shellObstacleCollision.tireShellCountAfterHit}`,
      `tireDot=${shellObstacleCollision.tireForwardDot.toFixed(2)}`,
      `tireSpeed=${shellObstacleCollision.tireSpeedAfterHit.toFixed(2)}`,
      `tireVelocity=${shellObstacleCollision.tireVelocityAfterHit.toFixed(2)}`,
      `tireArmed=${shellObstacleCollision.tireArmedSecondsAfterHit.toFixed(2)}`,
      `tireAfter=${shellObstacleCollision.tireShellCountAfterLinger}`,
      `destroyId=${shellObstacleCollision.destroyedObstacleId}`,
      `destroyKind=${shellObstacleCollision.destroyedObstacleKind}`,
      `destroyShells=${shellObstacleCollision.destroyedShellCount}`,
      `stopId=${shellObstacleCollision.stoppedObstacleId}`,
      `stopKind=${shellObstacleCollision.stoppedObstacleKind}`,
      `stopShells=${shellObstacleCollision.stoppedShellCountAfterHit}`,
      `stopSpeed=${shellObstacleCollision.stoppedSpeedAfterHit.toFixed(2)}`,
      `stopVelocity=${shellObstacleCollision.stoppedVelocityAfterHit.toFixed(2)}`,
      `stopArmed=${shellObstacleCollision.stoppedArmedSecondsAfterHit.toFixed(2)}`,
      `stopAfter=${shellObstacleCollision.stoppedShellCountAfterLinger}`
    ].join(" ")
  );

  console.info(
    [
      "bananaObstacleWorldState=ok",
      `obstacleId=${bananaObstacleWorldState.obstacleId}`,
      `stableId=${bananaObstacleWorldState.stableObstacleId}`,
      `entityId=${bananaObstacleWorldState.entityId}`,
      `entityType=${bananaObstacleWorldState.entityType}`,
      `body=${bananaObstacleWorldState.entityBodyType}`,
      `entityActive=${bananaObstacleWorldState.entityActive}`,
      `entityStatus=${bananaObstacleWorldState.entityActiveStatus}`,
      `kind=${bananaObstacleWorldState.obstacleKind}`,
      `owner=${bananaObstacleWorldState.ownerRacerId}`,
      `ownerSlot=${bananaObstacleWorldState.ownerSlotIndex}`,
      `heldAfterUse=${bananaObstacleWorldState.heldItemAfterUse}`,
      `behind=${bananaObstacleWorldState.positionBehindRacer.toFixed(2)}`,
      `expectedBehind=${bananaObstacleWorldState.expectedPositionBehindRacer.toFixed(2)}`,
      `lateral=${bananaObstacleWorldState.lateralOffset.toFixed(3)}`,
      `orientation=${bananaObstacleWorldState.orientationRadians.toFixed(3)}`,
      `count=${bananaObstacleWorldState.obstacleCount}`,
      `entityCount=${bananaObstacleWorldState.entityCount}`,
      `activeEntityCount=${bananaObstacleWorldState.activeEntityCount}`,
      `postLifetimeCount=${bananaObstacleWorldState.postLifetimeObstacleCount}`,
      `postLifetimeExpiredRemovals=${bananaObstacleWorldState.postLifetimeExpiredRemovalCount}`,
      `postLifetimeActiveEntities=${bananaObstacleWorldState.postLifetimeActiveEntityCount}`
    ].join(" ")
  );

  console.info(
    [
      "bananaCleanupRules=ok",
      `cap=${bananaCleanupRules.maxActiveBananaHazards}`,
      `capRemovals=${bananaCleanupRules.hazardCapRemovalCount}`,
      `capReason=${bananaCleanupRules.hazardCapRemovalReason}`,
      `capRemovedOldest=${bananaCleanupRules.hazardCapRemovedOldest}`,
      `capActive=${bananaCleanupRules.hazardCapActiveBananaCount}`,
      `outsideRemovals=${bananaCleanupRules.outOfBoundsRemovalCount}`,
      `outsideReason=${bananaCleanupRules.outOfBoundsRemovalReason}`,
      `outsideActive=${bananaCleanupRules.outOfBoundsActiveBananaCount}`,
      `outsideEntities=${bananaCleanupRules.outOfBoundsActiveEntityCount}`
    ].join(" ")
  );

  console.info(
    [
      "bananaHazardCollision=ok",
      `target=${bananaHazardCollision.targetRacerId}`,
      `stun=${bananaHazardCollision.targetStunSeconds.toFixed(2)}`,
      `spinout=${bananaHazardCollision.targetSpinoutSeconds.toFixed(2)}`,
      `spinVelocity=${bananaHazardCollision.targetSpinoutAngularVelocity.toFixed(2)}`,
      `speed=${bananaHazardCollision.targetSpeedAfterHit.toFixed(2)}`,
      `headingDelta=${bananaHazardCollision.targetHeadingDelta.toFixed(3)}`,
      `afterHit=${bananaHazardCollision.bananaCountAfterHit}`,
      `entitiesAfterHit=${bananaHazardCollision.bananaEntityCountAfterHit}`,
      `activeEntitiesAfterHit=${bananaHazardCollision.activeBananaEntityCountAfterHit}`,
      `entityStatus=${bananaHazardCollision.hitBananaEntityActiveStatus}`,
      `entityReason=${bananaHazardCollision.hitBananaEntityDeactivationReason}`,
      `ownerStun=${bananaHazardCollision.ownerStunSeconds}`,
      `bananaEvents=${bananaHazardCollision.bananaHitEventCount}`,
      `eventSpinout=${bananaHazardCollision.bananaHitSpinoutSeconds.toFixed(2)}`,
      `eventFeedback=${bananaHazardCollision.bananaHitFeedbackSeconds.toFixed(2)}`,
      `repeatEvents=${bananaHazardCollision.repeatBananaHitEventCount}`,
      `repeatRemovals=${bananaHazardCollision.repeatBananaRemovalEventCount}`,
      `repeatRemaining=${bananaHazardCollision.repeatBananaCountAfterHit}`,
      `repeatSpinout=${bananaHazardCollision.repeatTargetSpinoutSeconds.toFixed(2)}`,
      `repeatSpeed=${bananaHazardCollision.repeatTargetSpeed.toFixed(2)}`,
      `multiEvents=${bananaHazardCollision.multiBananaHitEventCount}`,
      `multiRemovals=${bananaHazardCollision.multiBananaRemovalEventCount}`,
      `multiRemaining=${bananaHazardCollision.multiBananaRemainingCount}`,
      `ignoredSpinoutEvents=${bananaHazardCollision.ignoredSpinoutBananaHitEventCount}`,
      `ignoredSpinoutRemaining=${bananaHazardCollision.ignoredSpinoutRemainingBananaCount}`,
      `missBananas=${bananaHazardCollision.missBananaCount}`,
      `missStun=${bananaHazardCollision.missTargetStunSeconds}`,
      `unarmedBananas=${bananaHazardCollision.unarmedBananaCount}`,
      `unarmedStun=${bananaHazardCollision.unarmedTargetStunSeconds}`,
      `sweptEvents=${bananaHazardCollision.sweptBananaHitEventCount}`,
      `sweptAfterHit=${bananaHazardCollision.sweptBananaCountAfterHit}`,
      `sweptStun=${bananaHazardCollision.sweptTargetStunSeconds.toFixed(2)}`,
      `aiEvents=${bananaHazardCollision.aiTargetBananaHitEventCount}`,
      `aiStun=${bananaHazardCollision.aiTargetStunSeconds.toFixed(2)}`,
      `remoteEvents=${bananaHazardCollision.remoteTargetBananaHitEventCount}`,
      `remoteStun=${bananaHazardCollision.remoteTargetStunSeconds.toFixed(2)}`,
      `ownerEvents=${bananaHazardCollision.ownerTargetBananaHitEventCount}`,
      `ownerStunAfterSelfHit=${bananaHazardCollision.ownerTargetStunSeconds.toFixed(2)}`,
      `ownerMirror=${bananaHazardCollision.ownerSelfHitMirrorAccepted}`,
      `ownerMirrorStun=${bananaHazardCollision.ownerSelfHitMirrorStunSeconds.toFixed(2)}`
    ].join(" ")
  );

  console.info(
    [
      "timedSpinoutControlLoss=ok",
      `baselineThrottle=${timedSpinoutControlLoss.baselineResolvedThrottle.toFixed(2)}`,
      `spinoutThrottle=${timedSpinoutControlLoss.spinoutResolvedThrottle.toFixed(2)}`,
      `spinoutBrake=${timedSpinoutControlLoss.spinoutResolvedBrake.toFixed(2)}`,
      `spinoutCoast=${timedSpinoutControlLoss.spinoutResolvedCoastDecelerationMultiplier.toFixed(2)}`,
      `shortDurationThrottle=${timedSpinoutControlLoss.shortDurationResolvedThrottle.toFixed(2)}`,
      `shortDurationBrake=${timedSpinoutControlLoss.shortDurationResolvedBrake.toFixed(2)}`,
      `shortDurationCoast=${timedSpinoutControlLoss.shortDurationResolvedCoastDecelerationMultiplier.toFixed(2)}`,
      `longDurationThrottle=${timedSpinoutControlLoss.longDurationResolvedThrottle.toFixed(2)}`,
      `longDurationBrake=${timedSpinoutControlLoss.longDurationResolvedBrake.toFixed(2)}`,
      `longDurationCoast=${timedSpinoutControlLoss.longDurationResolvedCoastDecelerationMultiplier.toFixed(2)}`,
      `weakStrengthThrottle=${timedSpinoutControlLoss.weakStrengthResolvedThrottle.toFixed(2)}`,
      `weakStrengthBrake=${timedSpinoutControlLoss.weakStrengthResolvedBrake.toFixed(2)}`,
      `weakStrengthCoast=${timedSpinoutControlLoss.weakStrengthResolvedCoastDecelerationMultiplier.toFixed(2)}`,
      `strongStrengthThrottle=${timedSpinoutControlLoss.strongStrengthResolvedThrottle.toFixed(2)}`,
      `strongStrengthBrake=${timedSpinoutControlLoss.strongStrengthResolvedBrake.toFixed(2)}`,
      `strongStrengthCoast=${timedSpinoutControlLoss.strongStrengthResolvedCoastDecelerationMultiplier.toFixed(2)}`,
      `baselineSteer=${timedSpinoutControlLoss.baselineResolvedSteer.toFixed(2)}`,
      `spinoutSteer=${timedSpinoutControlLoss.spinoutResolvedSteer.toFixed(2)}`,
      `shortDurationSteer=${timedSpinoutControlLoss.shortDurationResolvedSteer.toFixed(2)}`,
      `longDurationSteer=${timedSpinoutControlLoss.longDurationResolvedSteer.toFixed(2)}`,
      `baselineSpeedGain=${timedSpinoutControlLoss.baselineSpeedGain.toFixed(3)}`,
      `spinoutSpeedDelta=${timedSpinoutControlLoss.spinoutSpeedDelta.toFixed(3)}`,
      `baselineHeadingDelta=${timedSpinoutControlLoss.baselineHeadingDelta.toFixed(3)}`,
      `spinoutHeadingDelta=${timedSpinoutControlLoss.spinoutHeadingDelta.toFixed(3)}`,
      `weakStrengthHeadingDelta=${timedSpinoutControlLoss.weakStrengthHeadingDelta.toFixed(3)}`,
      `strongStrengthHeadingDelta=${timedSpinoutControlLoss.strongStrengthHeadingDelta.toFixed(3)}`,
      `activeSeconds=${timedSpinoutControlLoss.activeSpinoutSeconds.toFixed(3)}`,
      `recoveredSeconds=${timedSpinoutControlLoss.recoveredSpinoutSeconds}`,
      `recoveringDuring=${timedSpinoutControlLoss.recoveringDuringSpinout}`,
      `recoveringAfter=${timedSpinoutControlLoss.recoveringAfterExpiry}`,
      `recoveredSpeedGain=${timedSpinoutControlLoss.recoveredSpeedGain.toFixed(3)}`,
      `recoveredHeadingDelta=${timedSpinoutControlLoss.recoveredHeadingDelta.toFixed(3)}`
    ].join(" ")
  );

  console.info(
    [
      "boostActivation=ok",
      `baselineSpeed=${boostActivation.baselineSpeedAfterActivationTick.toFixed(3)}`,
      `boostedSpeed=${boostActivation.boostedSpeedAfterActivationTick.toFixed(3)}`,
      `activeSeconds=${boostActivation.boostSecondsAfterActivation.toFixed(2)}`,
      `expiredSeconds=${boostActivation.boostSecondsAfterExpiry}`,
      `eventTick=${boostActivation.activationTickIndex}`
    ].join(" ")
  );

  console.info(
    [
      "shellRegistry=ok",
      `id=${shellRegistry.id}`,
      `type=${shellRegistry.type}`,
      `displayName=${shellRegistry.displayName}`,
      `rarity=${shellRegistry.rarity}`,
      `behaviorType=${shellRegistry.behaviorType}`,
      `pickupWeight=${shellRegistry.pickupWeight}`,
      `inventoryIcon=${shellRegistry.inventoryIcon}`,
      `inventoryIconKey=${shellRegistry.inventoryIconKey}`,
      `inventoryIconRef=${shellRegistry.inventoryIconRef}`,
      `inventoryKey=${shellRegistry.inventoryKey}`,
      `respawnSeconds=${shellRegistry.respawnSeconds}`,
      `speed=${shellRegistry.speed}`,
      `radius=${shellRegistry.radius}`,
      `ttl=${shellRegistry.ttlSeconds}`,
      `arm=${shellRegistry.armSeconds}`,
      `stun=${shellRegistry.hitStunSeconds}`,
      `speedFactor=${shellRegistry.hitSpeedFactor}`,
      `spinout=${shellRegistry.spinoutSeconds}`,
      `spinRadians=${shellRegistry.spinoutRadians.toFixed(2)}`,
      `immunity=${shellRegistry.hitImmunitySeconds}`,
      `feedback=${shellRegistry.hitFeedbackSeconds}`
    ].join(" ")
  );

  console.info(
    [
      "bananaRegistry=ok",
      `id=${bananaRegistry.id}`,
      `type=${bananaRegistry.type}`,
      `displayName=${bananaRegistry.displayName}`,
      `rarity=${bananaRegistry.rarity}`,
      `behaviorType=${bananaRegistry.behaviorType}`,
      `pickupWeight=${bananaRegistry.pickupWeight}`,
      `inventoryIcon=${bananaRegistry.inventoryIcon}`,
      `inventoryIconKey=${bananaRegistry.inventoryIconKey}`,
      `inventoryIconRef=${bananaRegistry.inventoryIconRef}`,
      `inventoryKey=${bananaRegistry.inventoryKey}`,
      `respawnSeconds=${bananaRegistry.respawnSeconds}`
    ].join(" ")
  );

  console.info(
    [
      "boundaryPhysics=ok",
      `shoulderSurface=${boundaryPhysics.shoulderSurface}`,
      `roadSpeed=${boundaryPhysics.roadSpeedAfterTick.toFixed(3)}`,
      `shoulderSpeed=${boundaryPhysics.shoulderSpeedAfterTick.toFixed(3)}`,
      `correctedSurface=${boundaryPhysics.correctedSurface}`,
      `boundarySpeed=${boundaryPhysics.boundarySpeedAfterClamp.toFixed(3)}`,
      `aiCorrectedSurface=${boundaryPhysics.aiCorrectedSurface}`,
      `aiBoundarySpeed=${boundaryPhysics.aiBoundarySpeedAfterClamp.toFixed(3)}`
    ].join(" ")
  );

  console.info(
    [
      "kartCollisionBounds=ok",
      `length=${kartCollisionBounds.length}`,
      `width=${kartCollisionBounds.width}`,
      `height=${kartCollisionBounds.height}`,
      `radius=${kartCollisionBounds.boundingRadius.toFixed(3)}`,
      `center=(${kartCollisionBounds.centerX.toFixed(1)},${kartCollisionBounds.centerZ.toFixed(1)})`,
      `heading=${kartCollisionBounds.headingRadians.toFixed(3)}`,
      `frontRight=(${kartCollisionBounds.frontRightX.toFixed(1)},${kartCollisionBounds.frontRightZ.toFixed(1)})`
    ].join(" ")
  );

  console.info(
    [
      "raceLoopKartCollisions=ok",
      `expectedPairs=${raceLoopKartCollisions.expectedUniquePairsPerTick}`,
      `humanHumanChecks=${raceLoopKartCollisions.humanHumanPairChecks}`,
      `humanHumanContacts=${raceLoopKartCollisions.humanHumanContacts}`,
      `humanHumanGain=${raceLoopKartCollisions.humanHumanSeparationGain.toFixed(3)}`,
      `humanAiChecks=${raceLoopKartCollisions.humanAiPairChecks}`,
      `humanAiContacts=${raceLoopKartCollisions.humanAiContacts}`,
      `humanAiGain=${raceLoopKartCollisions.humanAiSeparationGain.toFixed(3)}`,
      `humanAiSpeedFactor=${raceLoopKartCollisions.humanAiSpeedFactor.toFixed(3)}`,
      `aiAiChecks=${raceLoopKartCollisions.aiAiPairChecks}`,
      `aiAiContacts=${raceLoopKartCollisions.aiAiContacts}`,
      `aiAiGain=${raceLoopKartCollisions.aiAiSeparationGain.toFixed(3)}`,
      `aiAiSpeedFactor=${raceLoopKartCollisions.aiAiSpeedFactor.toFixed(3)}`,
      `boundaryContacts=${raceLoopKartCollisions.boundaryPairContacts}`,
      `boundaryGain=${raceLoopKartCollisions.boundaryPairSeparationGain.toFixed(3)}`,
      `boundaryResolved=${raceLoopKartCollisions.boundaryPairOverlapResolved}`,
      `boundaryInside=${raceLoopKartCollisions.boundaryPairLeftInsideCourse && raceLoopKartCollisions.boundaryPairRightInsideCourse}`,
      `headOnContacts=${raceLoopKartCollisions.headOnContacts}`,
      `headOnResolved=${raceLoopKartCollisions.headOnOverlapResolved}`,
      `sideContacts=${raceLoopKartCollisions.sideImpactContacts}`,
      `sideResolved=${raceLoopKartCollisions.sideImpactOverlapResolved}`,
      `multiContacts=${raceLoopKartCollisions.multiKartContacts}`,
      `multiResolved=${raceLoopKartCollisions.multiKartOverlapsResolved}`,
      `highSpeedContacts=${raceLoopKartCollisions.highSpeedContacts}`,
      `highSpeedResolved=${raceLoopKartCollisions.highSpeedOverlapResolved}`,
      `highSpeedNoTunnel=${raceLoopKartCollisions.highSpeedTunnelPrevented}`
    ].join(" ")
  );

  console.info(
    [
      "collisionDamping=ok",
      `boundaryLow=${collisionDamping.boundaryLowSpeedFactor.toFixed(3)}`,
      `boundaryHigh=${collisionDamping.boundaryHighSpeedFactor.toFixed(3)}`,
      `obstacleHigh=${collisionDamping.obstacleHighSpeedFactor.toFixed(3)}`,
      `racerLow=${collisionDamping.racerLowSpeedFactor.toFixed(3)}`,
      `racerHigh=${collisionDamping.racerHighSpeedFactor.toFixed(3)}`
    ].join(" ")
  );

  console.info(
    [
      "collisionDeflection=ok",
      `boundaryDot=${collisionDeflection.boundaryReboundDot.toFixed(3)}`,
      `obstacleDot=${collisionDeflection.obstacleReboundDot.toFixed(3)}`,
      `racerLeftDot=${collisionDeflection.racerLeftReboundDot.toFixed(3)}`,
      `racerRightDot=${collisionDeflection.racerRightReboundDot.toFixed(3)}`,
      `racerResolved=${collisionDeflection.racerOverlapResolved}`
    ].join(" ")
  );

  console.info(
    [
      "collisionControlImpact=ok",
      `boundarySeconds=${collisionControlImpact.boundaryControlSeconds.toFixed(3)}`,
      `racerLeftSeconds=${collisionControlImpact.racerContactLeftControlSeconds.toFixed(3)}`,
      `racerRightSeconds=${collisionControlImpact.racerContactRightControlSeconds.toFixed(3)}`,
      `baselineSpeedGain=${collisionControlImpact.baselineSpeedGain.toFixed(3)}`,
      `impactedSpeedGain=${collisionControlImpact.impactedSpeedGain.toFixed(3)}`,
      `recoveredSpeedGain=${collisionControlImpact.recoveredSpeedGain.toFixed(3)}`,
      `baselineHeading=${collisionControlImpact.baselineHeadingDelta.toFixed(4)}`,
      `impactedHeading=${collisionControlImpact.impactedHeadingDelta.toFixed(4)}`,
      `recoveredHeading=${collisionControlImpact.recoveredHeadingDelta.toFixed(4)}`,
      `recoveredSeconds=${collisionControlImpact.recoveredControlSeconds}`
    ].join(" ")
  );

  console.info(
    [
      "boundaryContacts=ok",
      `contacts=${boundaryContacts.contactCount}`,
      `collider=${boundaryContacts.contactColliderId}`,
      `side=${boundaryContacts.contactSide}`,
      `penetration=${boundaryContacts.penetrationDepth.toFixed(3)}`,
      `correction=${boundaryContacts.correctionDepth.toFixed(3)}`,
      `speedFactor=${boundaryContacts.speedFactor.toFixed(2)}`,
      `clearContacts=${boundaryContacts.clearContactCount}`
    ].join(" ")
  );
}

function createHumanRacerInputs(
  humanRacerCount: HumanRacerCountScenario
): readonly HumanRaceStartRacerInput[] {
  return Array.from({ length: humanRacerCount }, (_, index) => {
    return {
      peerId: `human-${humanRacerCount}-${index + 1}`,
      displayName: `Human ${index + 1}`,
      slotIndex: index,
      isHost: index === 0
    } satisfies HumanRaceStartRacerInput;
  });
}

function validateInvalidRaceStateRacerCountRejections(): void {
  const validRoster = createRaceStartRoster(createHumanRacerInputs(2));
  const validRaceState = createRaceStateFromStartRoster(validRoster);

  for (const racerCount of INVALID_RACE_STATE_RACER_COUNTS) {
    const invalidRaceState = createRaceStateWithRacerCount(
      validRaceState,
      racerCount
    );

    assertThrows(
      () => createRaceSession({ raceState: invalidRaceState }),
      `exactly ${RACE_CAPACITY} racers`,
      `race-state racer count ${racerCount}`
    );
  }
}

function createRaceStateWithRacerCount(
  raceState: RaceState,
  racerCount: InvalidRaceStateRacerCountScenario
): RaceState {
  const racers = raceState.racers.slice(
    0,
    Math.min(racerCount, raceState.racers.length)
  ) as RegisteredRacer[];

  while (racers.length < racerCount) {
    const sourceRacer = raceState.racers[racers.length % raceState.racers.length];

    if (sourceRacer === undefined) {
      throw new Error("Cannot create invalid race state without seed racers.");
    }

    racers.push(sourceRacer);
  }

  return {
    ...raceState,
    racers
  };
}

function requireStartGridSlot(slotIndex: number): TrackStartGridSlot {
  const slot = DEFAULT_TRACK_DEFINITION.startGrid[slotIndex];

  if (slot === undefined) {
    throw new Error(`Expected start grid slot ${slotIndex} to exist.`);
  }

  return slot;
}

function assertPoseMatchesStartGridSlot(
  pose: SpawnPose,
  slot: TrackStartGridSlot,
  label: string
): void {
  assertAlmostEqual(
    pose.position.x,
    slot.position.x,
    `${label} position.x`
  );
  assertAlmostEqual(
    pose.position.y,
    slot.position.y,
    `${label} position.y`
  );
  assertAlmostEqual(
    pose.position.z,
    slot.position.z,
    `${label} position.z`
  );
  assertAlmostEqual(
    pose.headingRadians,
    slot.headingRadians,
    `${label} heading`
  );
}

function assertSessionRacerMatchesStartGridSlot(
  racer: RaceSessionRacerState,
  slot: TrackStartGridSlot,
  raceForward: { readonly x: number; readonly z: number },
  label: string
): number {
  assertAlmostEqual(
    racer.position.x,
    slot.position.x,
    `${label} position.x`
  );
  assertAlmostEqual(
    racer.position.y,
    slot.position.y,
    `${label} position.y`
  );
  assertAlmostEqual(
    racer.position.z,
    slot.position.z,
    `${label} position.z`
  );
  assertAlmostEqual(
    racer.body.position.x,
    slot.position.x,
    `${label} body.position.x`
  );
  assertAlmostEqual(
    racer.body.position.y,
    slot.position.y,
    `${label} body.position.y`
  );
  assertAlmostEqual(
    racer.body.position.z,
    slot.position.z,
    `${label} body.position.z`
  );
  assertAlmostEqual(
    racer.headingRadians,
    slot.headingRadians,
    `${label} heading`
  );
  assertAlmostEqual(
    racer.forward.x,
    raceForward.x,
    `${label} forward.x`
  );
  assertAlmostEqual(
    racer.forward.z,
    raceForward.z,
    `${label} forward.z`
  );

  const forwardAlignment = getPlanarDot(racer.forward, raceForward);

  assertAlmostEqual(forwardAlignment, 1, `${label} forward alignment`);

  return forwardAlignment;
}

function snapshotRacerTransform(racer: RaceSessionRacerState): {
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly forward: Vector3;
  readonly headingRadians: number;
  readonly speed: number;
  readonly updateCount: number;
} {
  return {
    position: { ...racer.position },
    velocity: { ...racer.velocity },
    forward: { ...racer.forward },
    headingRadians: racer.headingRadians,
    speed: racer.speed,
    updateCount: racer.updateCount
  };
}

function assertRacerTransformMatchesSnapshot(
  racer: RaceSessionRacerState,
  snapshot: ReturnType<typeof snapshotRacerTransform>,
  label: string
): void {
  assertVectorAlmostEqual(racer.position, snapshot.position, `${label} position`);
  assertVectorAlmostEqual(racer.velocity, snapshot.velocity, `${label} velocity`);
  assertVectorAlmostEqual(racer.forward, snapshot.forward, `${label} forward`);
  assertAlmostEqual(
    racer.headingRadians,
    snapshot.headingRadians,
    `${label} heading`
  );
  assertAlmostEqual(racer.speed, snapshot.speed, `${label} speed`);
  assertVectorAlmostEqual(
    {
      x: racer.body.position.x,
      y: racer.body.position.y,
      z: racer.body.position.z
    },
    snapshot.position,
    `${label} body position`
  );
}

function assertVectorAlmostEqual(
  actual: Vector3,
  expected: Vector3,
  label: string
): void {
  assertAlmostEqual(actual.x, expected.x, `${label}.x`);
  assertAlmostEqual(actual.y, expected.y, `${label}.y`);
  assertAlmostEqual(actual.z, expected.z, `${label}.z`);
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

function normalizeOrientationRadians(orientationRadians: number): number {
  return Number.isFinite(orientationRadians)
    ? positiveModulo(orientationRadians, Math.PI * 2)
    : 0;
}

function getSignedAngleDeltaRadians(
  nextRadians: number,
  previousRadians: number
): number {
  return positiveModulo(nextRadians - previousRadians + Math.PI, Math.PI * 2) -
    Math.PI;
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function projectPositionOnStartLine(
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

function requireTrackSurfaceSamplePoint(
  road: TrackRoadGeometry,
  surface: TrackSurfaceType,
  radius: number
): Vector3 {
  const sampleDistances = getTrackSurfaceSampleDistances(road, surface, radius);

  for (let index = 0; index < road.centerline.length; index += 1) {
    const startPoint = road.centerline[index];
    const endPoint = road.centerline[(index + 1) % road.centerline.length];

    if (startPoint === undefined || endPoint === undefined) {
      continue;
    }

    for (const distance of sampleDistances) {
      for (const sign of [1, -1] as const) {
        for (const progress of [0.25, 0.5, 0.75] as const) {
          const sample = createSegmentLateralSamplePoint(
            startPoint.position,
            endPoint.position,
            distance * sign,
            progress
          );

          if (
            queryTrackSurfaceAtPoint(road, sample, radius).surface === surface
          ) {
            return sample;
          }
        }
      }
    }
  }

  throw new Error(`Expected default track to include a ${surface} sample.`);
}

function getTrackSurfaceSampleDistances(
  road: TrackRoadGeometry,
  surface: TrackSurfaceType,
  radius: number
): readonly number[] {
  const boundary = road.courseBoundary;

  if (surface === "road") {
    return [0];
  }

  if (surface === "shoulder") {
    const minDistance = Math.max(
      boundary.drivableHalfWidth - radius + 0.05,
      0
    );
    const maxDistance = Math.max(
      boundary.courseHalfWidth - radius - 0.05,
      minDistance
    );

    return [
      (minDistance + maxDistance) / 2,
      minDistance,
      maxDistance
    ];
  }

  return [
    boundary.courseHalfWidth + radius + 1,
    boundary.courseHalfWidth + radius + 4
  ];
}

function createSegmentLateralSamplePoint(
  start: Vector3,
  end: Vector3,
  centerlineDistance: number,
  progress: number
): Vector3 {
  const segmentX = end.x - start.x;
  const segmentZ = end.z - start.z;
  const segmentLength = Math.hypot(segmentX, segmentZ);

  if (segmentLength <= Number.EPSILON) {
    throw new Error("Expected default track segment length to be non-zero.");
  }

  const leftNormal = {
    x: -segmentZ / segmentLength,
    z: segmentX / segmentLength
  };

  return {
    x: start.x + segmentX * progress + leftNormal.x * centerlineDistance,
    y: start.y + (end.y - start.y) * progress,
    z: start.z + segmentZ * progress + leftNormal.z * centerlineDistance
  };
}

function getPlanarDistance(
  from: Pick<Vector3, "x" | "z">,
  to: Pick<Vector3, "x" | "z">
): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

function requireVector(vector: Vector3 | undefined, label: string): Vector3 {
  if (vector === undefined) {
    throw new Error(`Expected ${label} to exist.`);
  }

  return vector;
}

function requireBoundaryCollider(
  collider: TrackBoundaryCollider | undefined,
  label: string
): TrackBoundaryCollider {
  if (collider === undefined) {
    throw new Error(`Expected ${label} to exist.`);
  }

  return collider;
}

function requireBoundaryContact(
  contact: KartTrackBoundaryContact | undefined,
  label: string
): KartTrackBoundaryContact {
  if (contact === undefined) {
    throw new Error(`Expected ${label} to exist.`);
  }

  return contact;
}

function getBoundaryColliderInwardNormal(
  collider: TrackBoundaryCollider
): Vector3 {
  const direction = collider.side === "left" ? 1 : -1;

  return {
    x: Math.cos(collider.headingRadians) * direction,
    y: 0,
    z: -Math.sin(collider.headingRadians) * direction
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

function requireTrackLapMarker(
  index: number
): (typeof DEFAULT_TRACK_DEFINITION.lapMarkers)[number] {
  const marker = DEFAULT_TRACK_DEFINITION.lapMarkers[index];

  if (marker === undefined) {
    throw new Error(`Expected default track to include lap marker ${index}.`);
  }

  return marker;
}

function createPreciseRaceProgressTrack(): typeof DEFAULT_RACE_TRACK_STATE {
  return {
    ...DEFAULT_RACE_TRACK_STATE,
    lapMarkers: DEFAULT_TRACK_DEFINITION.lapMarkers.map((marker) => ({
      ...marker,
      radius: 0.05,
      triggerZone: {
        ...marker.triggerZone,
        radius: 0.05
      }
    })),
    checkpoints: DEFAULT_TRACK_DEFINITION.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      radius: 0.05,
      triggerZone: {
        ...checkpoint.triggerZone,
        radius: 0.05
      }
    }))
  };
}

function getPositionJustPastLapMarker(
  markerOrder: number,
  progressRatio: number
): Vector3 {
  const marker = requireTrackLapMarker(markerOrder);
  const nextMarker = requireTrackLapMarker(
    positiveModulo(markerOrder + 1, DEFAULT_TRACK_DEFINITION.lapMarkers.length)
  );
  const clampedRatio = Math.min(Math.max(progressRatio, 0), 1);

  return {
    x:
      marker.position.x +
      (nextMarker.position.x - marker.position.x) * clampedRatio,
    y:
      marker.position.y +
      (nextMarker.position.y - marker.position.y) * clampedRatio,
    z:
      marker.position.z +
      (nextMarker.position.z - marker.position.z) * clampedRatio
  };
}

function setRacerAtLapMarker(
  racer: RaceSessionRacerState,
  marker: (typeof DEFAULT_TRACK_DEFINITION.lapMarkers)[number]
): void {
  racer.position = { ...marker.position };
  racer.velocity = { x: 0, y: 0, z: 0 };
  racer.speed = 0;
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

function offsetPlanarPosition(
  position: Vector3,
  axis: { readonly x: number; readonly z: number },
  distance: number
): Vector3 {
  return {
    x: position.x + axis.x * distance,
    y: position.y,
    z: position.z + axis.z * distance
  };
}

function headingFromPlanarDirection(direction: {
  readonly x: number;
  readonly z: number;
}): number {
  return normalizeOrientationRadians(Math.atan2(direction.x, direction.z));
}

function hasRacerPairOverlap(
  left: RaceSessionRacerState,
  right: RaceSessionRacerState
): boolean {
  return (
    detectKartCollisionBoundsOverlap(
      refreshRacerCollisionBounds(left),
      refreshRacerCollisionBounds(right)
    ) !== null
  );
}

function getRacerPairOverlapCount(
  racers: readonly RaceSessionRacerState[]
): number {
  let overlapCount = 0;

  for (let leftIndex = 0; leftIndex < racers.length; leftIndex += 1) {
    const left = racers[leftIndex];

    if (left === undefined) {
      continue;
    }

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < racers.length;
      rightIndex += 1
    ) {
      const right = racers[rightIndex];

      if (right !== undefined && hasRacerPairOverlap(left, right)) {
        overlapCount += 1;
      }
    }
  }

  return overlapCount;
}

function getPlanarProjection(
  position: Vector3,
  origin: Vector3,
  axis: { readonly x: number; readonly z: number }
): number {
  return (position.x - origin.x) * axis.x + (position.z - origin.z) * axis.z;
}

function getPlanarDot(
  left: { readonly x: number; readonly z: number },
  right: { readonly x: number; readonly z: number }
): number {
  return left.x * right.x + left.z * right.z;
}

function createAuthoritativeShellHitEventForValidation(options: {
  readonly eventId: string;
  readonly shell: ShellProjectileState;
  readonly source: RaceSessionRacerState;
  readonly target: RaceSessionRacerState;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly speedBeforeHit: number;
}): RaceShellHitEvent {
  const shellConfig = COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig;
  const targetBounds = refreshRacerCollisionBounds(options.target);
  const shellVelocitySpeed = Math.hypot(
    options.shell.velocity.x,
    options.shell.velocity.z
  );
  const impactNormal =
    shellVelocitySpeed > Number.EPSILON
      ? {
          x: -options.shell.velocity.x / shellVelocitySpeed,
          y: 0,
          z: -options.shell.velocity.z / shellVelocitySpeed
        }
      : { x: 1, y: 0, z: 0 };

  return {
    eventId: options.eventId,
    itemType: "shell",
    shellId: options.shell.id,
    sourceRacerId: options.source.id,
    sourceSlotIndex: options.source.slotIndex,
    targetRacerId: options.target.id,
    targetSlotIndex: options.target.slotIndex,
    tickIndex: options.tickIndex,
    elapsedSeconds: options.elapsedSeconds,
    impact: {
      position: { ...targetBounds.center },
      normal: impactNormal,
      shellPosition: { ...options.shell.position },
      shellVelocity: { ...options.shell.velocity },
      shellRadius: options.shell.radius,
      targetHitboxCenter: { ...targetBounds.center },
      penetrationDepth: options.shell.radius,
      relativeSpeed: shellVelocitySpeed
    },
    effect: {
      itemType: "shell",
      stunSeconds: shellConfig.hitStunSeconds,
      spinoutSeconds: shellConfig.spinoutSeconds,
      spinoutAngularVelocity:
        shellConfig.spinoutRadians / shellConfig.spinoutSeconds,
      hitImmunitySeconds: shellConfig.hitImmunitySeconds,
      hitFeedbackSeconds: shellConfig.hitFeedbackSeconds,
      speedFactor: shellConfig.hitSpeedFactor,
      speedBeforeHit: options.speedBeforeHit,
      speedAfterHit: options.speedBeforeHit * shellConfig.hitSpeedFactor,
      headingDeltaRadians: 0
    }
  };
}

function assertEqual(
  actual: number | boolean,
  expected: number | boolean,
  label: string
): void {
  if (actual !== expected) {
    throw new Error(`Expected ${label} to be ${expected}, found ${actual}.`);
  }
}

function assertStringEqual(
  actual: string | null,
  expected: string,
  label: string
): void {
  if (actual !== expected) {
    throw new Error(`Expected ${label} to be ${expected}, found ${actual}.`);
  }
}

function assertStringArrayEqual(
  actual: readonly string[],
  expected: readonly string[],
  label: string
): void {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(
      `Expected ${label} to be ${expected.join(",")}, found ${actual.join(",")}.`
    );
  }
}

function assertNull(actual: unknown, label: string): void {
  if (actual !== null) {
    throw new Error(`Expected ${label} to be null, found ${String(actual)}.`);
  }
}

function assertGreaterThan(actual: number, minimum: number, label: string): void {
  if (actual <= minimum) {
    throw new Error(
      `Expected ${label} to be greater than ${minimum}, found ${actual}.`
    );
  }
}

function assertBetween(
  actual: number,
  minimum: number,
  maximum: number,
  label: string
): void {
  if (actual < minimum || actual > maximum) {
    throw new Error(
      `Expected ${label} to be between ${minimum} and ${maximum}, found ${actual}.`
    );
  }
}

function assertAlmostEqual(
  actual: number,
  expected: number,
  label: string,
  epsilon = 0.000_001
): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(
      `Expected ${label} to be ${expected}, found ${actual}.`
    );
  }
}

function assertThrows(
  action: () => void,
  expectedMessagePart: string,
  label: string
): void {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!message.includes(expectedMessagePart)) {
      throw new Error(
        `Expected ${label} to reject with "${expectedMessagePart}", found "${message}".`
      );
    }

    return;
  }

  throw new Error(`Expected ${label} to reject.`);
}

function requireRacerState(
  racer: RaceSessionRacerState | undefined,
  label: string
): RaceSessionRacerState {
  if (racer === undefined) {
    throw new Error(`Expected ${label} to exist.`);
  }

  return racer;
}

function requireRegisteredRacer(
  racer: RegisteredRacer | undefined,
  label: string
): RegisteredRacer {
  if (racer === undefined) {
    throw new Error(`Expected ${label} to exist.`);
  }

  return racer;
}

function requireRaceParticipant(
  participant: RaceParticipantState | undefined,
  label: string
): RaceParticipantState {
  if (participant === undefined) {
    throw new Error(`Expected ${label} to exist.`);
  }

  return participant;
}

function countParticipantsByRole(
  participants: readonly RaceParticipantState[],
  role: RaceParticipantState["role"]
): number {
  return participants.filter((participant) => participant.role === role).length;
}

function countParticipantsByLifecycleStatus(
  participants: readonly RaceParticipantState[],
  lifecycleStatus: RaceParticipantState["lifecycleStatus"]
): number {
  return participants.filter(
    (participant) => participant.lifecycleStatus === lifecycleStatus
  ).length;
}

function requireShellProjectileState(
  shell: ShellProjectileState | undefined,
  label: string
): ShellProjectileState {
  if (shell === undefined) {
    throw new Error(`Expected ${label} to exist.`);
  }

  return shell;
}

function requireBananaObstacleState(
  banana: BananaObstacleState | undefined,
  label: string
): BananaObstacleState {
  if (banana === undefined) {
    throw new Error(`Expected ${label} to exist.`);
  }

  return banana;
}

interface ShellObstacleCollisionScenario {
  readonly raceSession: RaceSession;
  readonly shell: ShellProjectileState;
  readonly obstacle: {
    readonly id: string;
    readonly position: Vector3;
    readonly radius: number;
    readonly halfHeight: number;
    readonly obstacleKind: TrackObstacleColliderKind;
    readonly impactSpeedFactor: number;
  };
  readonly tickSeconds: number;
}

function createShellObstacleCollisionScenario(
  obstacleKind: TrackObstacleColliderKind,
  label: string
): ShellObstacleCollisionScenario {
  const tickSeconds = 1 / 60;
  const probeSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const probeRacer = requireRacerState(
    probeSession.humanRacerStates[0],
    `${label} probe racer`
  );
  const probeShell = spawnShellForValidation(probeSession, probeRacer);
  const obstacle = createShellObstacleForValidation(
    obstacleKind,
    probeShell,
    tickSeconds
  );
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs(1)),
    {
      obstacles: [obstacle],
      itemPickups: []
    }
  );
  const racer = requireRacerState(
    raceSession.humanRacerStates[0],
    `${label} racer`
  );
  const shell = spawnShellForValidation(raceSession, racer);

  assertEqual(
    raceSession.shellProjectileStates.length,
    1,
    `${label} active shell before obstacle contact`
  );

  return {
    raceSession,
    shell,
    obstacle,
    tickSeconds
  };
}

function createShellObstacleForValidation(
  obstacleKind: TrackObstacleColliderKind,
  shell: ShellProjectileState,
  tickSeconds: number
): ShellObstacleCollisionScenario["obstacle"] {
  const radius = getValidationObstacleRadius(obstacleKind);
  const movementDistance = shell.speed * tickSeconds;
  const overlapDepth = 0.2;
  const distanceFromShell =
    movementDistance + shell.radius + radius - overlapDepth;

  return {
    id: `validation-shell-${obstacleKind}`,
    position: {
      x: shell.position.x + shell.direction.x * distanceFromShell,
      y: shell.position.y,
      z: shell.position.z + shell.direction.z * distanceFromShell
    },
    radius,
    halfHeight: 0.8,
    obstacleKind,
    impactSpeedFactor: 0.5
  };
}

function getValidationObstacleRadius(
  obstacleKind: TrackObstacleColliderKind
): number {
  switch (obstacleKind) {
    case "oil-drum":
      return 1.45;
    case "tire-stack":
      return 1.6;
    case "cone-pack":
      return 1.25;
  }
}

function spawnShellForValidation(
  raceSession: RaceSession,
  racer: RaceSessionRacerState
): ShellProjectileState {
  const startPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const forward = forwardFromHeading(headingRadians);

  parkOtherRacersAwayFromShellPath(raceSession, racer.id);
  racer.position = { ...startPoint.position };
  racer.velocity = { x: 0, y: 0, z: 0 };
  racer.speed = 0;
  racer.forward = { x: forward.x, y: 0, z: forward.z };
  racer.headingRadians = headingRadians;
  racer.itemUseCooldownSeconds = 0;
  racer.heldItem = COMBAT_ITEM_REGISTRY.shell.type;
  refreshRacerCollisionBounds(racer);
  raceSession.setHumanInput(racer.id, { useItem: true });

  const tickResult = raceSession.tick(0);

  assertEqual(
    tickResult.itemUseActions.length,
    1,
    "shell validation spawn action count"
  );

  return requireShellProjectileState(
    raceSession.shellProjectileStates[0],
    "spawned validation shell"
  );
}

function spawnBananaForValidation(
  raceSession: RaceSession,
  racer: RaceSessionRacerState
): BananaObstacleState {
  const startPoint = requireTrackCenterPoint(DEFAULT_TRACK_DEFINITION.road, 0);
  const headingRadians =
    DEFAULT_TRACK_DEFINITION.road.startFinishLine.headingRadians;
  const forward = forwardFromHeading(headingRadians);

  parkOtherRacersAwayFromShellPath(raceSession, racer.id);
  racer.position = { ...startPoint.position };
  racer.velocity = { x: 0, y: 0, z: 0 };
  racer.speed = 0;
  racer.forward = { x: forward.x, y: 0, z: forward.z };
  racer.headingRadians = headingRadians;
  racer.itemUseCooldownSeconds = 0;
  racer.heldItem = COMBAT_ITEM_REGISTRY.banana.type;
  refreshRacerCollisionBounds(racer);
  raceSession.setHumanInput(racer.id, { useItem: true });

  const tickResult = raceSession.tick(0);

  assertEqual(
    tickResult.itemUseActions.length,
    1,
    "banana validation spawn action count"
  );

  return requireBananaObstacleState(
    raceSession.bananaObstacleStates[0],
    "spawned validation banana"
  );
}

function spawnAdditionalBananaForValidation(
  raceSession: RaceSession,
  racer: RaceSessionRacerState,
  label: string
): BananaObstacleState {
  const existingBananaIds = new Set(
    raceSession.bananaObstacleStates.map((banana) => banana.id)
  );

  racer.itemUseCooldownSeconds = 0;
  racer.heldItem = COMBAT_ITEM_REGISTRY.banana.type;
  refreshRacerCollisionBounds(racer);
  raceSession.setHumanInput(racer.id, { useItem: true });

  const tickResult = raceSession.tick(0);

  assertEqual(tickResult.itemUseActions.length, 1, `${label} spawn action count`);

  const spawnedBanana = raceSession.bananaObstacleStates.find(
    (banana) => !existingBananaIds.has(banana.id)
  );

  return requireBananaObstacleState(spawnedBanana, `${label} spawned banana`);
}

function resolveBananaHazardContactScenario(
  raceSession: RaceSession,
  owner: RaceSessionRacerState,
  target: RaceSessionRacerState,
  label: string,
  controllerPaths?: ReadonlyMap<string, RaceSessionRacerControllerPath>
): BananaHazardContactScenarioValidationResult {
  const banana = spawnBananaForValidation(raceSession, owner);

  if (owner.id !== target.id) {
    placeRacerForShellHitboxValidation(owner, 7);
  }

  placeRacerForShellHitboxValidation(target, 2);
  target.stunSeconds = 0;
  target.spinoutSeconds = 0;
  target.spinoutAngularVelocity = 0;
  target.itemHitImmunitySeconds = 0;
  target.hitFeedbackSeconds = 0;
  target.lastHitItemType = null;
  target.knockbackVelocity = { x: 0, y: 0, z: 0 };
  target.headingRadians = 0;
  target.forward = { x: 0, y: 0, z: 1 };
  target.speed = 12;
  target.velocity = { x: 0, y: 0, z: 12 };

  const targetBounds = refreshRacerCollisionBounds(target);

  banana.armedSeconds = 0;
  banana.position = {
    x:
      targetBounds.center.x +
      targetBounds.right.x *
        (targetBounds.halfWidth + banana.radius - 0.05),
    y: targetBounds.center.y,
    z:
      targetBounds.center.z +
      targetBounds.right.z *
        (targetBounds.halfWidth + banana.radius - 0.05)
  };
  banana.velocity = { x: 0, y: 0, z: 0 };

  const tickResult =
    controllerPaths === undefined
      ? raceSession.tick(0)
      : raceSession.tick(0, { controllerPaths });
  const hitEvent = tickResult.bananaHits[0];

  assertEqual(tickResult.bananaHits.length, 1, `${label} hit event count`);

  if (hitEvent === undefined) {
    throw new Error(`Expected ${label} to emit a banana-hit event.`);
  }

  assertStringEqual(
    hitEvent.targetRacerId,
    target.id,
    `${label} target racer id`
  );
  assertEqual(
    raceSession.bananaObstacleStates.length,
    0,
    `${label} consumes banana hazard`
  );
  assertAlmostEqual(
    target.stunSeconds,
    COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.hitStunSeconds,
    `${label} applies banana stun`
  );

  return {
    targetRacerId: target.id,
    hitEvent,
    hitEventCount: tickResult.bananaHits.length,
    targetStunSeconds: target.stunSeconds,
    activeBananaCountAfterHit: raceSession.bananaObstacleStates.length
  };
}

function createHostBananaContactControllerPaths(
  raceSession: RaceSession,
  localRacerId: string
): ReadonlyMap<string, RaceSessionRacerControllerPath> {
  const controllerPaths = new Map<string, RaceSessionRacerControllerPath>();

  for (const racer of raceSession.racerStates) {
    controllerPaths.set(
      racer.id,
      racer.id === localRacerId
        ? "local-input"
        : racer.controller === "ai"
          ? "ai-driver"
          : "remote-input"
    );
  }

  return controllerPaths;
}

function parkOtherRacersAwayFromShellPath(
  raceSession: RaceSession,
  shellOwnerRacerId: string
): void {
  const parkingPointIndexes = [5, 6, 7] as const;
  let parkingSlot = 0;

  for (const racer of raceSession.racerStates) {
    if (racer.id === shellOwnerRacerId) {
      continue;
    }

    const parkingPointIndex =
      parkingPointIndexes[parkingSlot % parkingPointIndexes.length] ?? 5;
    const parkingPoint = requireTrackCenterPoint(
      DEFAULT_TRACK_DEFINITION.road,
      parkingPointIndex
    );

    racer.position = { ...parkingPoint.position };
    racer.velocity = { x: 0, y: 0, z: 0 };
    racer.speed = 0;
    refreshRacerCollisionBounds(racer);
    parkingSlot += 1;
  }
}

function placeRacerForShellHitboxValidation(
  racer: RaceSessionRacerState,
  centerPointIndex: number
): void {
  const centerPoint = requireTrackCenterPoint(
    DEFAULT_TRACK_DEFINITION.road,
    centerPointIndex
  );

  racer.position = { ...centerPoint.position };
  racer.velocity = { x: 0, y: 0, z: 0 };
  racer.speed = 0;
  racer.headingRadians = 0;
  racer.forward = { x: 0, y: 0, z: 1 };
  refreshRacerCollisionBounds(racer);
}

function placeRacerForSpinoutControlValidation(
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

function requireRankingEntry(
  raceSession: RaceSession,
  racerId: string
): RaceRankingEntry {
  const entry = raceSession.raceRankings.find(
    (ranking) => ranking.racerId === racerId
  );

  if (entry === undefined) {
    throw new Error(`Expected race ranking for racer ${racerId}.`);
  }

  return entry;
}

function requireProgressSnapshot(
  progress: RaceProgressSnapshot | undefined,
  label: string
): RaceProgressSnapshot {
  if (progress === undefined) {
    throw new Error(`Expected ${label} to exist.`);
  }

  return progress;
}

function requireNonNullNumber(value: number | null, label: string): number {
  if (value === null) {
    throw new Error(`Expected ${label} to be assigned.`);
  }

  return value;
}

function isDirectExecution(): boolean {
  const entryPoint = process.argv[1];

  if (entryPoint === undefined) {
    return false;
  }

  return fileURLToPath(import.meta.url) === resolve(entryPoint);
}
