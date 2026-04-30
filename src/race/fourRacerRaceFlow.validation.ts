import { AI_RACER_SLOT_COUNT, HUMAN_RACER_SLOT_COUNT, RACE_CAPACITY } from "../config/gameConfig";
import { createBoostVisualState } from "../hud/boostHud";
import {
  createRaceHudRacerStatus,
  type RaceHudConnectionContext,
  type RaceHudRacerParticipant,
  type RaceHudRacerStatus
} from "../hud/raceRosterHud";
import { MULTIPLAYER_CONNECTION_PHASES } from "../network/multiplayerConnectionState";
import { LocalKartRaceStateSnapshotEmitter } from "../network/kartRaceStateMessage";
import {
  createTrackViewport,
  projectTrackPoint
} from "../render/trackViewport";
import {
  createTrackSceneRacerEffectRenderState,
  type TrackSceneRacerRenderState,
  type TrackSceneRacerRole
} from "../render/trackSceneRenderer";
import {
  createRaceSessionFromStartRoster,
  DEFAULT_RACE_TRACK_STATE,
  type RaceSession,
  type RaceSessionRacerControllerPath,
  type RaceSessionRacerState,
  type RaceSessionTickResult
} from "./raceSession";
import { createMultiplayerRaceStartRoster } from "./raceStartRoster";

const HOST_PEER_ID = "host-peer";
const GUEST_PEER_ID = "guest-peer";
const HOST_RACER_ID = "human_1";
const GUEST_RACER_ID = "human_2";
const VALIDATED_TICK_COUNT = 12;
const VALIDATED_DELTA_SECONDS = 1 / 60;
const VALIDATED_VIEWPORT_WIDTH = 1280;
const VALIDATED_VIEWPORT_HEIGHT = 720;

interface FourRacerInitializationValidationResult {
  readonly rosterRacerCount: number;
  readonly humanRacerCount: number;
  readonly aiRacerCount: number;
  readonly participantRoles: readonly string[];
  readonly lifecycleStatuses: readonly string[];
}

interface FourRacerLoopValidationResult {
  readonly tickIndex: number;
  readonly racerUpdates: number;
  readonly aiUpdates: number;
  readonly phase: string;
  readonly updatedRacerCount: number;
  readonly progressEntryCount: number;
  readonly snapshotRacerCount: number;
  readonly snapshotTransformCount: number;
}

interface FourRacerRenderValidationResult {
  readonly trackSceneRacerCount: number;
  readonly localHumanRenderCount: number;
  readonly remoteHumanRenderCount: number;
  readonly aiRenderCount: number;
  readonly finiteProjectedRacerCount: number;
  readonly indicatorCount: number;
}

interface FourRacerHudValidationResult {
  readonly hudStatusCount: number;
  readonly localRoleLabel: string;
  readonly remoteRoleLabel: string;
  readonly aiStatusCount: number;
  readonly connectedHumanStatusCount: number;
}

interface FourRacerRaceFlowValidationResult {
  readonly initialization: FourRacerInitializationValidationResult;
  readonly loop: FourRacerLoopValidationResult;
  readonly render: FourRacerRenderValidationResult;
  readonly hud: FourRacerHudValidationResult;
}

function main(): void {
  const result = validateFourRacerRaceFlow();

  console.info(
    [
      "fourRacerRaceFlow=ok",
      `roster=${result.initialization.rosterRacerCount}`,
      `humans=${result.initialization.humanRacerCount}`,
      `ai=${result.initialization.aiRacerCount}`,
      `roles=${result.initialization.participantRoles.join(",")}`,
      `lifecycle=${result.initialization.lifecycleStatuses.join(",")}`,
      `tick=${result.loop.tickIndex}`,
      `phase=${result.loop.phase}`,
      `updates=${result.loop.updatedRacerCount}`,
      `aiUpdates=${result.loop.aiUpdates}`,
      `progress=${result.loop.progressEntryCount}`,
      `snapshot=${result.loop.snapshotRacerCount}/${result.loop.snapshotTransformCount}`,
      `render=${result.render.trackSceneRacerCount}`,
      `renderRoles=${result.render.localHumanRenderCount}/${result.render.remoteHumanRenderCount}/${result.render.aiRenderCount}`,
      `projected=${result.render.finiteProjectedRacerCount}`,
      `indicators=${result.render.indicatorCount}`,
      `hud=${result.hud.hudStatusCount}`,
      `hudRoles=${result.hud.localRoleLabel}/${result.hud.remoteRoleLabel}`,
      `connectedHumans=${result.hud.connectedHumanStatusCount}`,
      `aiHud=${result.hud.aiStatusCount}`
    ].join(" ")
  );
}

function validateFourRacerRaceFlow(): FourRacerRaceFlowValidationResult {
  const raceSession = createValidatedFourRacerRaceSession();
  const initialization = validateFourRacerInitialization(raceSession);
  const loop = validateFourRacerLoopUpdates(raceSession);
  const render = validateFourRacerRenderState(raceSession);
  const hud = validateFourRacerHudState(raceSession);

  return {
    initialization,
    loop,
    render,
    hud
  };
}

function createValidatedFourRacerRaceSession(): RaceSession {
  const roster = createMultiplayerRaceStartRoster([
    {
      peerId: HOST_PEER_ID,
      displayName: "Host Driver",
      slotIndex: 0,
      isHost: true
    },
    {
      peerId: GUEST_PEER_ID,
      displayName: "Guest Driver",
      slotIndex: 1,
      isHost: false
    }
  ]);

  return createRaceSessionFromStartRoster(roster, {
    racerTargetRegistryOptions: {
      localPeerId: HOST_PEER_ID
    }
  });
}

function validateFourRacerInitialization(
  raceSession: RaceSession
): FourRacerInitializationValidationResult {
  assertEqual(
    raceSession.racerStates.length,
    RACE_CAPACITY,
    "race session initializes four racers"
  );
  assertEqual(
    raceSession.humanRacerStates.length,
    HUMAN_RACER_SLOT_COUNT,
    "race session initializes two human racers"
  );
  assertEqual(
    raceSession.aiRacerStates.length,
    AI_RACER_SLOT_COUNT,
    "race session initializes two AI racers"
  );
  assertEqual(
    requireRacer(raceSession, HOST_RACER_ID).peerId,
    HOST_PEER_ID,
    "host peer is assigned to local human racer"
  );
  assertEqual(
    requireRacer(raceSession, GUEST_RACER_ID).peerId,
    GUEST_PEER_ID,
    "guest peer is assigned to remote human racer"
  );

  const participants = raceSession.participantStates;
  const participantRoles = participants.map((participant) => participant.role);
  const lifecycleStatuses = participants.map(
    (participant) => participant.lifecycleStatus
  );

  assertEqual(participants.length, RACE_CAPACITY, "four participants initialize");
  assertEqual(
    countValues(participantRoles, "local-human"),
    1,
    "one participant is the local human"
  );
  assertEqual(
    countValues(participantRoles, "remote-human"),
    1,
    "one participant is the remote human"
  );
  assertEqual(
    countValues(participantRoles, "ai"),
    AI_RACER_SLOT_COUNT,
    "two participants are AI opponents"
  );
  assertEqual(
    countValues(lifecycleStatuses, "ready"),
    RACE_CAPACITY,
    "all initialized participants are race-ready"
  );

  return {
    rosterRacerCount: raceSession.racerStates.length,
    humanRacerCount: raceSession.humanRacerStates.length,
    aiRacerCount: raceSession.aiRacerStates.length,
    participantRoles,
    lifecycleStatuses
  };
}

function validateFourRacerLoopUpdates(
  raceSession: RaceSession
): FourRacerLoopValidationResult {
  raceSession.setHumanInput(HOST_RACER_ID, {
    throttle: 1,
    brake: 0,
    steer: 0.08,
    drift: false,
    useItem: false
  });
  raceSession.setHumanInput(GUEST_RACER_ID, {
    throttle: 1,
    brake: 0,
    steer: -0.08,
    drift: false,
    useItem: false
  });

  const controllerPaths = createHostAuthoritativeControllerPathMap(raceSession);
  let lastTick: RaceSessionTickResult | null = null;

  for (let tick = 0; tick < VALIDATED_TICK_COUNT; tick += 1) {
    lastTick = raceSession.tick(VALIDATED_DELTA_SECONDS, {
      controllerPaths
    });
  }

  assert(lastTick !== null, "race loop produced a tick result");
  assertEqual(
    lastTick.racerUpdates,
    RACE_CAPACITY,
    "loop updates all four racers"
  );
  assertEqual(
    lastTick.aiUpdates,
    AI_RACER_SLOT_COUNT,
    "loop advances both AI opponents"
  );
  assertEqual(
    raceSession.racerStates.filter((racer) => racer.updateCount > 0).length,
    RACE_CAPACITY,
    "all racers receive integrated movement updates"
  );
  assertEqual(
    lastTick.raceProgress.length,
    RACE_CAPACITY,
    "loop produces progress for all four racers"
  );
  assertEqual(
    lastTick.participants.length,
    RACE_CAPACITY,
    "loop produces participant state for all four racers"
  );
  assertEqual(
    countValues(
      lastTick.participants.map((participant) => participant.lifecycleStatus),
      "racing"
    ),
    RACE_CAPACITY,
    "all participants transition to racing during the loop"
  );

  const snapshot = new LocalKartRaceStateSnapshotEmitter({
    hostPeerId: HOST_PEER_ID,
    now: () => 2_000,
    send: () => true
  }).emit(
    {
      tickIndex: lastTick.tickIndex,
      elapsedSeconds: lastTick.elapsedSeconds
    },
    raceSession.phase,
    raceSession.trackMetadata.lapCount,
    raceSession.raceProgress,
    raceSession.racerStates,
    raceSession.itemPickupStates,
    lastTick.itemPickupCollections,
    lastTick.boostActivations,
    lastTick.shellHits,
    lastTick.bananaHits,
    raceSession.activeItemStates
  );

  assert(snapshot !== null, "host-authoritative race-state snapshot emits");
  assertEqual(
    snapshot.racers.length,
    RACE_CAPACITY,
    "race-state snapshot includes four progress entries"
  );
  assertEqual(
    snapshot.racerTransforms.length,
    RACE_CAPACITY,
    "race-state snapshot includes four racer transforms"
  );
  assertEqual(
    snapshot.racerTransforms.find((racer) => racer.racerId === GUEST_RACER_ID)
      ?.slotIndex,
    1,
    "remote human transform remains synchronized in slot 1"
  );

  return {
    tickIndex: lastTick.tickIndex,
    racerUpdates: lastTick.racerUpdates,
    aiUpdates: lastTick.aiUpdates,
    phase: raceSession.phase,
    updatedRacerCount: raceSession.racerStates.filter(
      (racer) => racer.updateCount > 0
    ).length,
    progressEntryCount: lastTick.raceProgress.length,
    snapshotRacerCount: snapshot.racers.length,
    snapshotTransformCount: snapshot.racerTransforms.length
  };
}

function validateFourRacerRenderState(
  raceSession: RaceSession
): FourRacerRenderValidationResult {
  const renderStates = createTrackSceneRacerRenderStates(
    raceSession.racerStates,
    HOST_RACER_ID
  );
  const viewport = createTrackViewport(
    DEFAULT_RACE_TRACK_STATE.bounds,
    VALIDATED_VIEWPORT_WIDTH,
    VALIDATED_VIEWPORT_HEIGHT
  );
  const projectedPositions = renderStates.map((state) =>
    projectTrackPoint(state.position, viewport)
  );

  assertEqual(
    renderStates.length,
    RACE_CAPACITY,
    "track scene receives four racer render states"
  );
  assertEqual(
    countValues(
      renderStates.map((state) => state.role),
      "local-human"
    ),
    1,
    "track scene marks one local human"
  );
  assertEqual(
    countValues(
      renderStates.map((state) => state.role),
      "remote-human"
    ),
    1,
    "track scene marks one remote human"
  );
  assertEqual(
    countValues(
      renderStates.map((state) => state.role),
      "ai"
    ),
    AI_RACER_SLOT_COUNT,
    "track scene marks two AI racers"
  );
  assertEqual(
    renderStates.filter((state) => state.indicatorLabel !== null).length,
    RACE_CAPACITY,
    "every racer render state carries a race indicator"
  );
  assertEqual(
    renderStates.filter((state) => state.effectState !== undefined).length,
    RACE_CAPACITY,
    "every racer render state carries shared effect state"
  );
  assertEqual(
    projectedPositions.filter(isFiniteViewportPoint).length,
    RACE_CAPACITY,
    "every racer projects to a finite HUD coordinate"
  );

  return {
    trackSceneRacerCount: renderStates.length,
    localHumanRenderCount: countRenderRoles(renderStates, "local-human"),
    remoteHumanRenderCount: countRenderRoles(renderStates, "remote-human"),
    aiRenderCount: countRenderRoles(renderStates, "ai"),
    finiteProjectedRacerCount: projectedPositions.filter(isFiniteViewportPoint)
      .length,
    indicatorCount: renderStates.filter((state) => state.indicatorLabel !== null)
      .length
  };
}

function validateFourRacerHudState(
  raceSession: RaceSession
): FourRacerHudValidationResult {
  const context: RaceHudConnectionContext = {
    localRacerId: HOST_RACER_ID,
    localPeerId: HOST_PEER_ID,
    remotePeerId: GUEST_PEER_ID,
    phase: MULTIPLAYER_CONNECTION_PHASES.CONNECTED,
    dataChannelOpen: true
  };
  const statuses = new Map<string, RaceHudRacerStatus>();

  for (const racer of raceSession.racerStates) {
    statuses.set(
      racer.id,
      createRaceHudRacerStatus(createRaceHudParticipant(racer), context)
    );
  }

  const localStatus = requireStatus(statuses, HOST_RACER_ID);
  const remoteStatus = requireStatus(statuses, GUEST_RACER_ID);
  const statusValues = [...statuses.values()];

  assertEqual(statuses.size, RACE_CAPACITY, "HUD creates four racer statuses");
  assertEqual(localStatus.roleLabel, "YOU", "local human HUD role");
  assertEqual(localStatus.statusLabel, "HOST ONLINE", "local host HUD status");
  assertEqual(localStatus.tone, "local", "local human HUD tone");
  assertEqual(remoteStatus.roleLabel, "GUEST", "remote human HUD role");
  assertEqual(
    remoteStatus.statusLabel,
    "GUEST ONLINE",
    "remote guest HUD status"
  );
  assertEqual(remoteStatus.tone, "connected", "remote human HUD tone");
  assertEqual(
    statusValues.filter((status) => status.isConnected && status.isHuman)
      .length,
    HUMAN_RACER_SLOT_COUNT,
    "both human racers are represented as connected"
  );
  assertEqual(
    statusValues.filter((status) => status.tone === "ai").length,
    AI_RACER_SLOT_COUNT,
    "both AI racers use AI HUD tone"
  );

  return {
    hudStatusCount: statuses.size,
    localRoleLabel: localStatus.roleLabel,
    remoteRoleLabel: remoteStatus.roleLabel,
    aiStatusCount: statusValues.filter((status) => status.tone === "ai").length,
    connectedHumanStatusCount: statusValues.filter(
      (status) => status.isConnected && status.isHuman
    ).length
  };
}

function createHostAuthoritativeControllerPathMap(
  raceSession: RaceSession
): ReadonlyMap<string, RaceSessionRacerControllerPath> {
  const controllerPaths = new Map<string, RaceSessionRacerControllerPath>();

  for (const racer of raceSession.racerStates) {
    if (racer.controller === "ai") {
      controllerPaths.set(racer.id, "ai-driver");
    } else if (racer.peerId === HOST_PEER_ID) {
      controllerPaths.set(racer.id, "local-input");
    } else {
      controllerPaths.set(racer.id, "remote-input");
    }
  }

  return controllerPaths;
}

function createTrackSceneRacerRenderStates(
  racers: readonly RaceSessionRacerState[],
  localRacerId: string
): readonly TrackSceneRacerRenderState[] {
  const progressByRacerId = new Map(
    racers.map((racer) => [racer.id, racer.progress] as const)
  );

  return [...racers]
    .sort((left, right) => left.slotIndex - right.slotIndex)
    .map((racer) => {
      const role = getTrackSceneRacerRole(racer, localRacerId);
      const boostVisual = createBoostVisualState(racer);
      const progress = progressByRacerId.get(racer.id);

      return {
        racerId: racer.id,
        slotIndex: racer.slotIndex,
        role,
        displayName: racer.displayName,
        color: racer.color,
        accentColor: getTrackSceneRacerAccentColor(racer, role),
        position: racer.position,
        headingRadians: racer.headingRadians,
        speed: racer.speed,
        boostActive: boostVisual.isActive,
        heldItem: racer.heldItem,
        indicatorLabel:
          progress === undefined
            ? null
            : `P${racer.rank} L${progress.currentLap}/${DEFAULT_RACE_TRACK_STATE.lapCount}`,
        racingNumber:
          racer.racer.controller === "ai" ? racer.racer.visual.racingNumber : null,
        effectState: createTrackSceneRacerEffectRenderState({
          boostSeconds: racer.boostSeconds,
          shieldSeconds: racer.shieldSeconds,
          stunSeconds: racer.stunSeconds,
          spinoutSeconds: racer.spinoutSeconds,
          spinoutAngularVelocity: racer.spinoutAngularVelocity,
          spinoutRotationRadians: 0,
          itemHitImmunitySeconds: racer.itemHitImmunitySeconds,
          hitFeedbackSeconds: racer.hitFeedbackSeconds,
          lastHitItemType: racer.lastHitItemType,
          recovering: racer.recovering
        })
      } satisfies TrackSceneRacerRenderState;
    });
}

function getTrackSceneRacerRole(
  racer: RaceSessionRacerState,
  localRacerId: string
): TrackSceneRacerRole {
  if (racer.controller === "ai") {
    return "ai";
  }

  return racer.id === localRacerId ? "local-human" : "remote-human";
}

function getTrackSceneRacerAccentColor(
  racer: RaceSessionRacerState,
  role: TrackSceneRacerRole
): string {
  if (racer.racer.controller === "ai") {
    return racer.racer.visual.accentColor;
  }

  return role === "local-human" ? "#ffd166" : "#9ad7ff";
}

function createRaceHudParticipant(
  racer: RaceSessionRacerState
): RaceHudRacerParticipant {
  return {
    racerId: racer.id,
    slotIndex: racer.slotIndex,
    controller: racer.controller,
    peerId: racer.peerId,
    isHost: racer.isHost
  };
}

function requireRacer(
  raceSession: RaceSession,
  racerId: string
): RaceSessionRacerState {
  const racer = raceSession.getRacerState(racerId);

  if (racer === undefined) {
    throw new Error(`Missing racer: ${racerId}`);
  }

  return racer;
}

function requireStatus(
  statuses: ReadonlyMap<string, RaceHudRacerStatus>,
  racerId: string
): RaceHudRacerStatus {
  const status = statuses.get(racerId);

  if (status === undefined) {
    throw new Error(`Missing HUD status: ${racerId}`);
  }

  return status;
}

function countRenderRoles(
  states: readonly TrackSceneRacerRenderState[],
  role: TrackSceneRacerRole
): number {
  return states.filter((state) => state.role === role).length;
}

function countValues<T>(values: readonly T[], expected: T): number {
  return values.filter((value) => value === expected).length;
}

function isFiniteViewportPoint(point: {
  readonly x: number;
  readonly y: number;
}): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, received ${String(actual)}.`
    );
  }
}

main();
