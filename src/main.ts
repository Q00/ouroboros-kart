import {
  AI_RACER_SLOT_COUNT,
  MAX_HUMAN_RACERS_PER_LOBBY,
  RACE_CAPACITY
} from "./config/gameConfig";
import { DEFAULT_TRACK_DEFINITION } from "./config/tracks";
import type { AiRacerInstance, RacerInputState } from "./race/raceState";
import { createMultiplayerRaceStartRoster } from "./race/raceStartRoster";
import {
  BOOST_DURATION_SECONDS,
  COMBAT_ITEM_REGISTRY,
  DEFAULT_RACE_TRACK_STATE,
  RACER_COLLISION_RADIUS,
  createRaceSession,
  createRaceSessionFromStartRoster,
  refreshRacerCollisionBounds,
  type ActiveRaceItemState,
  type CombatItemType,
  type RaceBananaHitEvent,
  type RaceBoostActivationEvent,
  type RaceItemPickupCollectionEvent,
  type RaceItemPickupState,
  type RaceItemUseAction,
  type RaceShellHitEvent,
  type RaceProgressSnapshot,
  type RaceSessionTickResult,
  type RaceSessionRacerState
} from "./race/raceSession";
import type { RaceSessionRacerControllerPath } from "./race/raceSession";
import {
  COMBAT_ITEM_VISUAL_ASSET_LIST,
  getCombatItemVisualAsset
} from "./assets/combatItemAssets";
import {
  KeyboardKartInputState,
  bindKeyboardKartInput
} from "./input/localKartInput";
import {
  createBoostHudState,
  createBoostVisualState,
  type BoostHudAvailability
} from "./hud/boostHud";
import {
  createActiveCombatItemVisualState,
  createCombatItemInventorySlotState,
  createCombatItemPickupVisualState,
  createRenderedItemPickupStates,
  getCombatItemHudVisualConfig,
  type ActiveCombatItemVisualState,
  type CombatItemInventorySlotState
} from "./hud/combatItemHud";
import {
  createRaceHudRacerStatus,
  type RaceHudConnectionContext,
  type RaceHudRacerParticipant,
  type RaceHudRacerStatus,
  type RaceHudRacerStatusTone
} from "./hud/raceRosterHud";
import { LobbyUi, type LobbyConnectionStatus } from "./lobby/lobbyUi";
import { GuestPeerConnection } from "./network/guestPeer";
import {
  HostPeerConnection,
  createLowLatencyDataChannelOptions
} from "./network/hostPeer";
import {
  LocalKartInputSnapshotEmitter,
  MAX_INPUT_SNAPSHOT_BUFFERED_BYTES,
  RemoteKartInputSnapshotBuffer
} from "./network/kartInputSnapshot";
import {
  LocalKartRemoteInputDeltaEmitter,
  RemoteKartInputDeltaQueue,
  type KartRemoteInputDeltaPacket
} from "./network/remoteInputDelta";
import {
  dispatchKartGameplayMessage,
  serializeKartGameplayMessage,
  tryDeserializeKartGameplayMessage
} from "./network/gameplayMessage";
import {
  MULTIPLAYER_CONNECTION_PHASES,
  MultiplayerConnectionStateModel,
  type MultiplayerConnectionEvent,
  type MultiplayerConnectionState,
} from "./network/multiplayerConnectionState";
import {
  applyLatestReadyRemoteKartInput,
  applyReadyRemoteKartInputDeltas
} from "./network/remoteKartInputApplier";
import {
  LocalKartTransformSnapshotEmitter,
  MAX_TRANSFORM_SNAPSHOT_BUFFERED_BYTES,
  RemoteKartTransformSmoother,
  createKartRacerTransformFromRaceState,
  serializeKartTransformSnapshot,
  type KartActiveItemSnapshot,
  type KartRacerTransform,
  type KartTransformSnapshot,
  type SmoothedKartTransform
} from "./network/kartTransformSnapshot";
import {
  LocalKartOwnedTransformSnapshotEmitter,
  MAX_OWNED_TRANSFORM_SNAPSHOT_BUFFERED_BYTES,
  RemoteKartOwnedTransformSmoother,
  type KartOwnedTransformSnapshot
} from "./network/kartOwnedTransformSnapshot";
import {
  LocalKartItemUseEventEmitter,
  type KartItemUseEventMessage
} from "./network/kartItemUseMessage";
import {
  MAX_ITEM_COLLISION_OUTCOME_EVENT_PAYLOAD_BYTES,
  createKartItemCollisionOutcomeEventMessageFromBananaHitEvent,
  createKartItemCollisionOutcomeEventMessageFromShellHitEvent,
  createRaceBananaHitEventFromItemCollisionOutcomeMessage,
  createRaceShellHitEventFromItemCollisionOutcomeMessage,
  serializeKartItemCollisionOutcomeEventMessage,
  type KartItemCollisionOutcomeEventMessage
} from "./network/kartItemCollisionOutcomeEventMessage";
import {
  KART_MULTIPLAYER_EFFECT_EVENT_KINDS,
  LocalKartMultiplayerEffectEventEmitter,
  MAX_EFFECT_EVENT_PAYLOAD_BYTES,
  RemoteKartMultiplayerEffectEventBuffer,
  type KartBananaDropEffectEventMessage,
  type KartBananaHitEffectEventMessage,
  type KartBoostStartEffectEventMessage,
  type KartEffectHitEffectSnapshot,
  type KartEffectImpactSnapshot,
  type KartEffectParticipantSnapshot,
  type KartMultiplayerEffectEventReplicationTiming,
  type KartMultiplayerEffectEventMessage,
  type KartShellHitEffectEventMessage,
  type KartShellLaunchEffectEventMessage,
  type KartSpinoutSourceItemType
} from "./network/kartEffectEventMessage";
import {
  FixedKartAuthoritativePlayerSnapshotClock,
  LocalKartAuthoritativePlayerSnapshotEmitter,
  MAX_AUTHORITATIVE_PLAYER_SNAPSHOT_PAYLOAD_BYTES,
  RemoteKartAuthoritativePlayerReconciler,
  RemoteKartAuthoritativePlayerSnapshotSynchronizer,
  createKartAuthoritativePlayerStateFromRaceState,
  type KartAuthoritativePlayerSnapshot
} from "./network/kartAuthoritativePlayerSnapshot";
import {
  MAX_RACE_STATE_SNAPSHOT_PAYLOAD_BYTES,
  LocalKartRaceStateSnapshotEmitter,
  RemoteKartRaceStateSnapshotSynchronizer,
  createKartTransformSnapshotFromRaceStateSnapshot,
  type KartRaceStateSnapshot
} from "./network/kartRaceStateMessage";
import {
  broadcastSerializedKartAuthoritativeSnapshotPayloadToPeer,
  type KartAuthoritativeSnapshotPeerChannel
} from "./network/hostAuthoritativeSnapshotBroadcast";
import {
  createKartBananaCollisionEventMessageFromRaceEvent,
  createKartBananaRemovalEventMessageFromRaceEvent,
  createKartBananaSpawnEventMessageFromActiveItem,
  createRaceBananaHitEventFromMessage,
  createRaceBananaRemovalEventFromMessage,
  createRaceBananaSpawnEventFromMessage,
  type KartBananaCollisionEventMessage,
  type KartBananaRemovalEventMessage,
  type KartBananaSpawnEventMessage
} from "./network/kartBananaEventMessage";
import {
  broadcastKartBananaLifecycleEventsToPeers,
  type KartBananaEventPeerChannel
} from "./network/kartBananaEventChannel";
import {
  SIGNALING_MESSAGE_TYPES,
  type SdpOfferSignalingMessage,
  type SignalingMessage,
  type SignalingPeerId,
  type SignalingRoomPeer,
  type SignalingRoomSnapshot
} from "./network/signaling";
import { RoomSignalingClient } from "./network/signalingClient";
import { createHumanRaceStartRacersFromRoomSnapshot } from "./network/racePeerSlotMapping";
import {
  canAcceptWebRtcOfferForPeer,
  createWebRtcRacePeerPlan,
  type WebRtcRacePeerPlan
} from "./network/webrtcRacePeerRole";
import {
  TrackSceneRenderer,
  createTrackSceneRacerEffectRenderState,
  type TrackSceneRacerRenderState,
  type TrackSceneRacerRole,
  type TrackSceneRacerEffectRenderState
} from "./render/trackSceneRenderer";
import {
  createBoostCameraFeedbackFrame,
  createDefaultBoostCameraFovState,
  updateBoostCameraFovState,
  type BoostCameraFovState
} from "./render/boostCameraFov";
import {
  createDefaultBoostParticleTrailState,
  updateBoostParticleTrailState,
  type BoostParticleTrailParticle,
  type BoostParticleTrailState
} from "./render/boostParticleTrail";
import {
  createAuthoritativeRacerSpinoutVisualState,
  createDefaultRacerSpinoutVisualState,
  updateRacerSpinoutVisualState,
  type RacerSpinoutVisualState
} from "./render/spinoutVisual";
import {
  createShellProjectileRemovalVisualFrame,
  createShellProjectileVisualFrame,
  type ShellProjectileRemovalVisualKind
} from "./render/shellProjectileVisual";
import {
  createCombatFeedbackPulseFrame,
  evaluateCombatNearMissFeedback,
  getCombatFeedbackDefaultDurationSeconds,
  type CombatFeedbackEventKind,
  type CombatFeedbackItemType
} from "./render/combatFeedback";
import {
  createTrackViewport,
  projectTrackPoint
} from "./render/trackViewport";
import { installSpinoutVerificationHooks } from "./dev/spinoutVerificationHooks";

type KartBoostEndEffectEventMessage = Extract<
  KartMultiplayerEffectEventMessage,
  {
    readonly effectEventKind: typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_END;
  }
>;
type KartSpinoutStartEffectEventMessage = Extract<
  KartMultiplayerEffectEventMessage,
  {
    readonly effectEventKind: typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_START;
  }
>;
type KartSpinoutEndEffectEventMessage = Extract<
  KartMultiplayerEffectEventMessage,
  {
    readonly effectEventKind: typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_END;
  }
>;

const sceneCanvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const hudCanvas = document.querySelector<HTMLCanvasElement>("#hud-canvas");
const MAX_GAMEPLAY_DATA_CHANNEL_BUFFERED_BYTES = Math.max(
  MAX_INPUT_SNAPSHOT_BUFFERED_BYTES,
  MAX_TRANSFORM_SNAPSHOT_BUFFERED_BYTES,
  MAX_OWNED_TRANSFORM_SNAPSHOT_BUFFERED_BYTES,
  MAX_ITEM_COLLISION_OUTCOME_EVENT_PAYLOAD_BYTES,
  MAX_EFFECT_EVENT_PAYLOAD_BYTES,
  MAX_AUTHORITATIVE_PLAYER_SNAPSHOT_PAYLOAD_BYTES,
  MAX_RACE_STATE_SNAPSHOT_PAYLOAD_BYTES
);
const PICKUP_COLLECTION_REPLAY_SECONDS = 0.5;
const MAX_REPLICATED_PICKUP_COLLECTIONS = 16;
const BOOST_ACTIVATION_REPLAY_SECONDS = BOOST_DURATION_SECONDS + 0.5;
const MAX_REPLICATED_BOOST_ACTIVATIONS = 16;
const SHELL_HIT_REPLAY_SECONDS = 0.5;
const MAX_REPLICATED_SHELL_HITS = 16;
const MAX_EMITTED_ITEM_COLLISION_OUTCOME_KEYS = 128;
const BANANA_SPAWN_REPLAY_SECONDS = 0.5;
const MAX_REPLICATED_BANANA_SPAWNS = 16;
const BANANA_HIT_REPLAY_SECONDS = 0.5;
const MAX_REPLICATED_BANANA_HITS = 16;
const BANANA_REMOVAL_REPLAY_SECONDS = 0.5;
const MAX_REPLICATED_BANANA_REMOVALS = 16;
const MAX_REPLICATED_EFFECT_TIMING_SAMPLES = 64;

if (!sceneCanvas) {
  throw new Error("Game scene canvas not found.");
}

if (!hudCanvas) {
  throw new Error("Game HUD canvas not found.");
}

const context = hudCanvas.getContext("2d");

if (!context) {
  throw new Error("HUD canvas 2D context unavailable.");
}

const defaultTrackRoad = DEFAULT_RACE_TRACK_STATE.road;

if (defaultTrackRoad === undefined) {
  throw new Error("Default track road geometry unavailable.");
}

const defaultTrackRoadGeometry = defaultTrackRoad;

const trackSceneRenderer = new TrackSceneRenderer({
  canvas: sceneCanvas,
  road: defaultTrackRoadGeometry,
  bounds: DEFAULT_RACE_TRACK_STATE.bounds,
  startGrid: DEFAULT_TRACK_DEFINITION.startGrid
});

interface RacerRaceIndicator {
  readonly place: number;
  readonly lap: number;
  readonly lapCount: number;
}

type RaceStandingsPhase = KartRaceStateSnapshot["phase"];

interface RaceStandingEntry {
  readonly racerId: string;
  readonly slotIndex: number;
  readonly displayName: string;
  readonly controller: RaceProgressSnapshot["controller"];
  readonly place: number;
  readonly lap: number;
  readonly lapCount: number;
  readonly currentLapProgressRatio: number;
  readonly completionRatio: number;
  readonly finished: boolean;
  readonly finishPlace: number | null;
  readonly finishTimeSeconds: number | null;
}

interface RaceStandingsState {
  readonly phase: RaceStandingsPhase;
  readonly entries: readonly RaceStandingEntry[];
}

interface RaceControllerTickPlan {
  readonly controllerPaths: ReadonlyMap<string, RaceSessionRacerControllerPath>;
  readonly remoteSnapshotTransforms: ReadonlyMap<string, SmoothedKartTransform> | null;
}

type BoostHudItemPickupState = Pick<
  RaceItemPickupState,
  "itemType" | "cooldownSeconds"
>;
type TrackViewport = ReturnType<typeof createTrackViewport>;
type ActiveItemRenderState =
  | ActiveRaceItemState
  | KartActiveItemSnapshot;
type TrackPoint3 = RaceSessionRacerState["position"];
interface RacerRenderEntry {
  readonly state: RaceSessionRacerState;
  readonly indicator: RacerRaceIndicator | undefined;
  readonly role: TrackSceneRacerRole;
}

interface ScreenRacerRenderEntry extends RacerRenderEntry {
  readonly screenPosition: { readonly x: number; readonly y: number };
}

interface ShellLaunchFeedbackState {
  readonly key: string;
  readonly racerId: string;
  readonly itemId: string | null;
  readonly origin: TrackPoint3;
  readonly direction: TrackPoint3;
  readonly startedAtSeconds: number;
  readonly expiresAtSeconds: number;
  readonly isLocal: boolean;
}

interface CombatFeedbackEventState {
  readonly key: string;
  readonly kind: CombatFeedbackEventKind;
  readonly itemType: CombatFeedbackItemType | null;
  readonly label: string;
  readonly position: TrackPoint3;
  readonly direction: TrackPoint3;
  readonly startedAtSeconds: number;
  readonly expiresAtSeconds: number;
  readonly intensity: number;
  readonly isLocal: boolean;
}

interface ActiveBoostMultiplayerEffectState {
  readonly effectId: string;
  readonly racer: KartEffectParticipantSnapshot;
}

interface ActiveSpinoutMultiplayerEffectState {
  readonly spinoutId: string;
  readonly target: KartEffectParticipantSnapshot;
  readonly source: KartEffectParticipantSnapshot | null;
  readonly sourceItemType: KartSpinoutSourceItemType;
  readonly sourceObjectId: string;
}

const SHELL_LAUNCH_FEEDBACK_SECONDS = 0.42;
const SHELL_LAUNCH_HUD_SECONDS = 0.56;
const SHELL_LAUNCH_WORLD_DISTANCE = 11;
const SHELL_LAUNCH_RACER_CLEARANCE = 2.35;
const SHELL_LAUNCH_REMOTE_MAX_AGE_SECONDS = 0.34;
const SHELL_LAUNCH_MIN_DUPLICATE_INTERVAL_SECONDS = 0.16;
const SHELL_LAUNCH_HUD_COOLDOWN_SECONDS =
  COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.useCooldownSeconds;
const SHELL_PROJECTILE_SPRITE_WIDTH_SCALE = 1.18;
const SHELL_PROJECTILE_SPRITE_HEIGHT_SCALE = 0.92;
const SHELL_PROJECTILE_FORWARD_AXIS_RADIANS = Math.PI / 2;
const SHELL_PROJECTILE_REMOVAL_EFFECT_SECONDS = 0.42;
const SHELL_PROJECTILE_IMPACT_EFFECT_RADIUS = 34;
const SHELL_PROJECTILE_EXPIRATION_EFFECT_RADIUS = 25;
const SHELL_PROJECTILE_IMPACT_SPARK_COUNT = 8;
const SHELL_PROJECTILE_EXPIRATION_SPARK_COUNT = 5;
const COMBAT_FEEDBACK_MAX_EVENTS = 36;
const COMBAT_FEEDBACK_BASE_RADIUS = 26;
const COMBAT_FEEDBACK_SPARK_COUNT = 7;
const COMBAT_NEAR_MISS_EXTRA_RADIUS_BY_ITEM = {
  shell: 4.2,
  banana: 2.9
} as const satisfies Record<CombatFeedbackItemType, number>;
const COMBAT_NEAR_MISS_REPEAT_SECONDS = 0.82;
const COMBAT_NEAR_MISS_MIN_OWNER_AGE_SECONDS = 0.72;
const COMBAT_RECOVERY_REPEAT_SECONDS = 1.2;

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void => {
  const cornerRadius = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + cornerRadius, y);
  ctx.lineTo(x + width - cornerRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + cornerRadius);
  ctx.lineTo(x + width, y + height - cornerRadius);
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - cornerRadius,
    y + height
  );
  ctx.lineTo(x + cornerRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - cornerRadius);
  ctx.lineTo(x, y + cornerRadius);
  ctx.quadraticCurveTo(x, y, x + cornerRadius, y);
  ctx.closePath();
};

const clampValue = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

interface ShellLaunchFeedbackRegistration {
  readonly key: string;
  readonly racerId: string;
  readonly itemId: string | null;
  readonly origin: TrackPoint3;
  readonly direction: TrackPoint3;
  readonly startedAtSeconds: number;
  readonly isLocal: boolean;
  readonly playSound: boolean;
}

interface CombatFeedbackEventRegistration {
  readonly key: string;
  readonly kind: CombatFeedbackEventKind;
  readonly itemType?: CombatFeedbackItemType | null;
  readonly label?: string;
  readonly position: TrackPoint3;
  readonly direction?: TrackPoint3;
  readonly startedAtSeconds: number;
  readonly durationSeconds?: number;
  readonly intensity?: number;
  readonly isLocal?: boolean;
  readonly playSound?: boolean;
}

interface ShellProjectileRenderMemory {
  readonly itemId: string;
  readonly position: TrackPoint3;
  readonly velocity: TrackPoint3;
  readonly direction: TrackPoint3;
}

interface ShellProjectileRemovalEffectRegistration {
  readonly key: string;
  readonly shellId: string;
  readonly kind: ShellProjectileRemovalVisualKind;
  readonly position: TrackPoint3;
  readonly direction: TrackPoint3;
  readonly startedAtSeconds: number;
}

interface ShellProjectileRemovalEffectState {
  readonly key: string;
  readonly shellId: string;
  readonly kind: ShellProjectileRemovalVisualKind;
  readonly position: TrackPoint3;
  readonly direction: TrackPoint3;
  readonly startedAtSeconds: number;
  readonly expiresAtSeconds: number;
}

interface RacerCombatStatusFeedbackMemory {
  readonly hadDisablingEffect: boolean;
  readonly hadRecoveryOnlyEffect: boolean;
  readonly lastRecoveryCueAtSeconds: number;
}

const getCurrentAnimationSeconds = (): number => performance.now() / 1000;

function registerShellLaunchFeedback(
  registration: ShellLaunchFeedbackRegistration
): void {
  const nowSeconds = getCurrentAnimationSeconds();
  pruneShellLaunchFeedbacks(nowSeconds);

  if (
    registration.itemId !== null &&
    seenShellLaunchItemIds.has(registration.itemId)
  ) {
    return;
  }

  const existingIndex = activeShellLaunchFeedbacks.findIndex((feedback) =>
    isShellLaunchFeedbackDuplicate(feedback, registration, nowSeconds)
  );
  const normalizedDirection = normalizePlanarDirection(registration.direction);
  const nextFeedback: ShellLaunchFeedbackState = {
    key: registration.key,
    racerId: registration.racerId,
    itemId: registration.itemId,
    origin: registration.origin,
    direction: normalizedDirection,
    startedAtSeconds:
      existingIndex >= 0
        ? activeShellLaunchFeedbacks[existingIndex]?.startedAtSeconds ??
          registration.startedAtSeconds
        : registration.startedAtSeconds,
    expiresAtSeconds:
      registration.startedAtSeconds +
      Math.max(SHELL_LAUNCH_FEEDBACK_SECONDS, SHELL_LAUNCH_HUD_SECONDS),
    isLocal:
      registration.isLocal ||
      (existingIndex >= 0 &&
        activeShellLaunchFeedbacks[existingIndex]?.isLocal === true)
  };

  if (existingIndex >= 0) {
    activeShellLaunchFeedbacks.splice(existingIndex, 1, nextFeedback);
  } else {
    activeShellLaunchFeedbacks.push(nextFeedback);
  }

  if (registration.itemId !== null) {
    seenShellLaunchItemIds.add(registration.itemId);
  }

  registerCombatFeedbackEvent({
    key: `shell-launch:${registration.key}`,
    kind: "shell-launch",
    itemType: "shell",
    label: "SHELL",
    position: registration.origin,
    direction: normalizedDirection,
    startedAtSeconds: registration.startedAtSeconds,
    isLocal: registration.isLocal,
    playSound: false
  });

  if (registration.playSound) {
    playShellLaunchSound();
  }
}

function isShellLaunchFeedbackDuplicate(
  feedback: ShellLaunchFeedbackState,
  registration: ShellLaunchFeedbackRegistration,
  nowSeconds: number
): boolean {
  if (
    registration.itemId !== null &&
    feedback.itemId !== null &&
    registration.itemId === feedback.itemId
  ) {
    return true;
  }

  if (
    registration.itemId !== null &&
    feedback.itemId === null &&
    feedback.racerId === registration.racerId &&
    nowSeconds - feedback.startedAtSeconds <= SHELL_LAUNCH_HUD_SECONDS
  ) {
    return true;
  }

  return (
    feedback.racerId === registration.racerId &&
    nowSeconds - feedback.startedAtSeconds <=
      SHELL_LAUNCH_MIN_DUPLICATE_INTERVAL_SECONDS
  );
}

function getActiveShellLaunchFeedbacks(
  nowSeconds: number
): readonly ShellLaunchFeedbackState[] {
  pruneShellLaunchFeedbacks(nowSeconds);

  return activeShellLaunchFeedbacks.filter(
    (feedback) =>
      nowSeconds >= feedback.startedAtSeconds &&
      nowSeconds <= feedback.startedAtSeconds + SHELL_LAUNCH_FEEDBACK_SECONDS
  );
}

function getShellLaunchHudFeedbackForRacer(
  racerId: string,
  nowSeconds: number
): ShellLaunchFeedbackState | null {
  pruneShellLaunchFeedbacks(nowSeconds);

  return (
    activeShellLaunchFeedbacks
      .filter(
        (feedback) =>
          feedback.racerId === racerId &&
          nowSeconds <= feedback.startedAtSeconds + SHELL_LAUNCH_HUD_SECONDS
      )
      .sort((left, right) => right.startedAtSeconds - left.startedAtSeconds)[0] ??
    null
  );
}

function pruneShellLaunchFeedbacks(nowSeconds: number): void {
  activeShellLaunchFeedbacks = activeShellLaunchFeedbacks.filter(
    (feedback) => feedback.expiresAtSeconds >= nowSeconds
  );
}

function resetShellLaunchFeedbacks(): void {
  activeShellLaunchFeedbacks = [];
  seenShellLaunchItemIds.clear();
}

function registerCombatFeedbackEvent(
  registration: CombatFeedbackEventRegistration
): void {
  const nowSeconds = getCurrentAnimationSeconds();
  const durationSeconds =
    registration.durationSeconds ??
    getCombatFeedbackDefaultDurationSeconds(registration.kind);

  pruneCombatFeedbackEvents(nowSeconds);

  const event: CombatFeedbackEventState = {
    key: registration.key,
    kind: registration.kind,
    itemType: registration.itemType ?? getCombatFeedbackItemType(registration.kind),
    label: registration.label ?? getCombatFeedbackLabel(registration.kind),
    position: copyTrackPoint(registration.position),
    direction: normalizePlanarDirection(
      registration.direction ?? { x: 0, y: 0, z: 1 }
    ),
    startedAtSeconds: registration.startedAtSeconds,
    expiresAtSeconds: registration.startedAtSeconds + durationSeconds,
    intensity: clampValue(registration.intensity ?? 1, 0, 1),
    isLocal: registration.isLocal === true
  };
  const existingIndex = activeCombatFeedbackEvents.findIndex(
    (candidate) => candidate.key === event.key
  );

  if (existingIndex >= 0) {
    activeCombatFeedbackEvents.splice(existingIndex, 1, event);
  } else {
    activeCombatFeedbackEvents.push(event);
  }

  activeCombatFeedbackEvents = activeCombatFeedbackEvents.slice(
    -COMBAT_FEEDBACK_MAX_EVENTS
  );

  if (registration.playSound === true && existingIndex < 0) {
    playCombatFeedbackSound(registration.kind);
  }
}

function getActiveCombatFeedbackEvents(
  nowSeconds: number
): readonly CombatFeedbackEventState[] {
  pruneCombatFeedbackEvents(nowSeconds);

  return activeCombatFeedbackEvents.filter(
    (event) =>
      nowSeconds >= event.startedAtSeconds &&
      nowSeconds <= event.expiresAtSeconds
  );
}

function hasActiveCombatFeedbackEventForKeyPrefix(
  keyPrefix: string,
  nowSeconds: number
): boolean {
  pruneCombatFeedbackEvents(nowSeconds);

  return activeCombatFeedbackEvents.some(
    (event) =>
      event.key.startsWith(keyPrefix) && event.expiresAtSeconds >= nowSeconds
  );
}

function pruneCombatFeedbackEvents(nowSeconds: number): void {
  activeCombatFeedbackEvents = activeCombatFeedbackEvents.filter(
    (event) => event.expiresAtSeconds >= nowSeconds
  );
}

function resetCombatFeedbackEvents(): void {
  activeCombatFeedbackEvents = [];
  recentNearMissFeedbacks.clear();
  racerCombatStatusFeedbackMemory.clear();
}

function getCombatFeedbackItemType(
  kind: CombatFeedbackEventKind
): CombatFeedbackItemType | null {
  switch (kind) {
    case "shell-launch":
    case "shell-near-miss":
    case "shell-hit":
      return "shell";
    case "banana-drop":
    case "banana-near-miss":
    case "banana-hit":
      return "banana";
    case "recovery":
      return null;
  }
}

function getCombatFeedbackLabel(kind: CombatFeedbackEventKind): string {
  switch (kind) {
    case "shell-launch":
      return "SHELL";
    case "banana-drop":
      return "DROP";
    case "shell-near-miss":
    case "banana-near-miss":
      return "NEAR MISS";
    case "shell-hit":
    case "banana-hit":
      return "HIT";
    case "recovery":
      return "RECOVER";
  }
}

function updateShellProjectileVisualLifecycle(
  activeItems: readonly ActiveItemRenderState[],
  nowMilliseconds: number
): readonly ActiveItemRenderState[] {
  const nowSeconds = nowMilliseconds / 1000;
  const visibleShells = new Map<string, ShellProjectileRenderMemory>();

  for (const item of activeItems) {
    if (item.type !== "shell" || item.ttlSeconds <= 0) {
      continue;
    }

    const memory = createShellProjectileRenderMemory(item);
    visibleShells.set(memory.itemId, memory);
  }

  for (const [shellId, previousShell] of visibleShellProjectileRenderStates) {
    if (
      visibleShells.has(shellId) ||
      hasShellProjectileRemovalEffectForShell(shellId)
    ) {
      continue;
    }

    registerShellProjectileRemovalEffect({
      key: `shell-expiration:${shellId}:${Math.round(nowMilliseconds)}`,
      shellId,
      kind: "expiration",
      position: previousShell.position,
      direction: getShellProjectileMemoryDirection(previousShell),
      startedAtSeconds: nowSeconds
    });
  }

  visibleShellProjectileRenderStates = visibleShells;
  pruneShellProjectileRemovalEffects(nowSeconds);

  return activeItems;
}

function createShellProjectileRenderMemory(
  item: ActiveItemRenderState
): ShellProjectileRenderMemory {
  return {
    itemId: getActiveRenderItemId(item),
    position: copyTrackPoint(item.position),
    velocity: copyTrackPoint(item.velocity),
    direction: getActiveItemTravelDirection(item)
  };
}

function getShellProjectileMemoryDirection(
  memory: ShellProjectileRenderMemory
): TrackPoint3 {
  return getPlanarVectorMagnitude(memory.velocity) > 0.0001
    ? memory.velocity
    : memory.direction;
}

function registerShellProjectileImpactEffectsFromHits(
  events: readonly RaceShellHitEvent[]
): void {
  const nowSeconds = getCurrentAnimationSeconds();

  for (const event of events) {
    registerShellProjectileRemovalEffect({
      key: event.eventId,
      shellId: event.shellId,
      kind: "impact",
      position: event.impact.shellPosition,
      direction:
        getPlanarVectorMagnitude(event.impact.shellVelocity) > 0.0001
          ? event.impact.shellVelocity
          : {
              x: -event.impact.normal.x,
              y: 0,
              z: -event.impact.normal.z
            },
      startedAtSeconds: nowSeconds
    });
  }
}

function registerShellProjectileRemovalEffect(
  registration: ShellProjectileRemovalEffectRegistration
): void {
  const nowSeconds = getCurrentAnimationSeconds();

  pruneShellProjectileRemovalEffects(nowSeconds);

  if (seenShellProjectileRemovalEffectKeys.has(registration.key)) {
    return;
  }

  const existingIndex = activeShellProjectileRemovalEffects.findIndex(
    (effect) => effect.shellId === registration.shellId
  );
  const existingEffect =
    existingIndex >= 0
      ? activeShellProjectileRemovalEffects[existingIndex]
      : undefined;

  if (
    existingEffect !== undefined &&
    existingEffect.kind === "impact" &&
    registration.kind === "expiration"
  ) {
    seenShellProjectileRemovalEffectKeys.add(registration.key);
    return;
  }

  const nextEffect: ShellProjectileRemovalEffectState = {
    key: registration.key,
    shellId: registration.shellId,
    kind: registration.kind,
    position: copyTrackPoint(registration.position),
    direction: normalizePlanarDirection(registration.direction),
    startedAtSeconds: registration.startedAtSeconds,
    expiresAtSeconds:
      registration.startedAtSeconds + SHELL_PROJECTILE_REMOVAL_EFFECT_SECONDS
  };

  if (existingIndex >= 0) {
    activeShellProjectileRemovalEffects.splice(existingIndex, 1, nextEffect);
  } else {
    activeShellProjectileRemovalEffects.push(nextEffect);
  }

  seenShellProjectileRemovalEffectKeys.add(registration.key);

  if (registration.kind === "impact") {
    seenShellProjectileImpactShellIds.add(registration.shellId);
  }
}

function hasShellProjectileRemovalEffectForShell(shellId: string): boolean {
  return (
    seenShellProjectileImpactShellIds.has(shellId) ||
    activeShellProjectileRemovalEffects.some(
      (effect) => effect.shellId === shellId
    )
  );
}

function getActiveShellProjectileRemovalEffects(
  nowSeconds: number
): readonly ShellProjectileRemovalEffectState[] {
  pruneShellProjectileRemovalEffects(nowSeconds);

  return activeShellProjectileRemovalEffects.filter(
    (effect) =>
      nowSeconds >= effect.startedAtSeconds &&
      nowSeconds <= effect.expiresAtSeconds
  );
}

function pruneShellProjectileRemovalEffects(nowSeconds: number): void {
  activeShellProjectileRemovalEffects =
    activeShellProjectileRemovalEffects.filter(
      (effect) => effect.expiresAtSeconds >= nowSeconds
    );
}

function resetShellProjectileRemovalEffects(): void {
  visibleShellProjectileRenderStates = new Map();
  activeShellProjectileRemovalEffects = [];
  seenShellProjectileRemovalEffectKeys.clear();
  seenShellProjectileImpactShellIds.clear();
}

function applyShellLaunchFeedbackToHudRacer(
  racer: RaceSessionRacerState,
  feedback: ShellLaunchFeedbackState | null,
  nowSeconds: number
): RaceSessionRacerState {
  if (feedback === null) {
    return racer;
  }

  return {
    ...racer,
    heldItem: null,
    itemUseCooldownSeconds: Math.max(
      racer.itemUseCooldownSeconds,
      getShellLaunchHudCooldownSeconds(feedback, nowSeconds)
    )
  };
}

function getShellLaunchHudCooldownSeconds(
  feedback: ShellLaunchFeedbackState,
  nowSeconds: number
): number {
  const elapsedSeconds = Math.max(0, nowSeconds - feedback.startedAtSeconds);

  return Math.max(0, SHELL_LAUNCH_HUD_COOLDOWN_SECONDS - elapsedSeconds);
}

function getShellLaunchFeedbackProgress(
  feedback: ShellLaunchFeedbackState,
  nowSeconds: number,
  durationSeconds: number
): number {
  return clampValue(
    (nowSeconds - feedback.startedAtSeconds) / Math.max(0.001, durationSeconds),
    0,
    1
  );
}

function createShellLaunchOriginFromRacer(
  racer: RaceSessionRacerState
): TrackPoint3 {
  return createShellLaunchOrigin(racer.position, racer.forward);
}

function createShellLaunchOrigin(
  position: TrackPoint3,
  direction: TrackPoint3
): TrackPoint3 {
  return addTrackPoint(
    position,
    scaleTrackPoint(
      normalizePlanarDirection(direction),
      SHELL_LAUNCH_RACER_CLEARANCE
    )
  );
}

function createShellLaunchOriginFromRemoteItem(
  item: KartActiveItemSnapshot,
  direction: TrackPoint3
): TrackPoint3 {
  const rewindDistance = clampValue(
    item.ageSeconds * getPlanarVectorMagnitude(item.velocity),
    0,
    SHELL_LAUNCH_WORLD_DISTANCE
  );

  return addTrackPoint(item.position, scaleTrackPoint(direction, -rewindDistance));
}

function normalizePlanarDirection(vector: TrackPoint3): TrackPoint3 {
  const magnitude = getPlanarVectorMagnitude(vector);

  if (magnitude <= 0.0001) {
    return { x: 0, y: 0, z: 1 };
  }

  return {
    x: vector.x / magnitude,
    y: 0,
    z: vector.z / magnitude
  };
}

function getPlanarVectorMagnitude(vector: TrackPoint3): number {
  if (!Number.isFinite(vector.x) || !Number.isFinite(vector.z)) {
    return 0;
  }

  return Math.hypot(vector.x, vector.z);
}

function addTrackPoint(left: TrackPoint3, right: TrackPoint3): TrackPoint3 {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
    z: left.z + right.z
  };
}

function scaleTrackPoint(point: TrackPoint3, scale: number): TrackPoint3 {
  return {
    x: point.x * scale,
    y: point.y * scale,
    z: point.z * scale
  };
}

function playShellLaunchSound(): void {
  const audioContext = getShellLaunchAudioContext();

  if (audioContext === null) {
    return;
  }

  if (audioContext.state === "suspended") {
    void audioContext.resume().catch(() => undefined);
  }

  const startedAt = audioContext.currentTime;
  const endedAt = startedAt + 0.22;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(620, startedAt);
  oscillator.frequency.exponentialRampToValueAtTime(180, endedAt);
  gain.gain.setValueAtTime(0.0001, startedAt);
  gain.gain.exponentialRampToValueAtTime(0.12, startedAt + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, endedAt);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(startedAt);
  oscillator.stop(endedAt);
}

function playItemHitSound(itemType: Exclude<CombatItemType, "boost">): void {
  const audioContext = getShellLaunchAudioContext();

  if (audioContext === null) {
    return;
  }

  if (audioContext.state === "suspended") {
    void audioContext.resume().catch(() => undefined);
  }

  const startedAt = audioContext.currentTime;
  const endedAt = startedAt + (itemType === "shell" ? 0.18 : 0.14);
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = itemType === "shell" ? "sawtooth" : "square";
  oscillator.frequency.setValueAtTime(
    itemType === "shell" ? 150 : 360,
    startedAt
  );
  oscillator.frequency.exponentialRampToValueAtTime(
    itemType === "shell" ? 60 : 120,
    endedAt
  );
  gain.gain.setValueAtTime(0.0001, startedAt);
  gain.gain.exponentialRampToValueAtTime(0.09, startedAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, endedAt);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(startedAt);
  oscillator.stop(endedAt);
}

function playCombatFeedbackSound(kind: CombatFeedbackEventKind): void {
  switch (kind) {
    case "shell-launch":
      playShellLaunchSound();
      return;
    case "banana-drop":
      playBananaDropSound();
      return;
    case "shell-near-miss":
      playNearMissSound("shell");
      return;
    case "banana-near-miss":
      playNearMissSound("banana");
      return;
    case "shell-hit":
      playItemHitSound("shell");
      return;
    case "banana-hit":
      playItemHitSound("banana");
      return;
    case "recovery":
      playRecoverySound();
      return;
  }
}

function playBananaDropSound(): void {
  playCombatTone({
    oscillatorType: "sine",
    startFrequency: 520,
    endFrequency: 260,
    durationSeconds: 0.18,
    peakGain: 0.07,
    attackSeconds: 0.018
  });
}

function playNearMissSound(itemType: CombatFeedbackItemType): void {
  playCombatTone({
    oscillatorType: itemType === "shell" ? "triangle" : "square",
    startFrequency: itemType === "shell" ? 920 : 460,
    endFrequency: itemType === "shell" ? 380 : 760,
    durationSeconds: itemType === "shell" ? 0.16 : 0.13,
    peakGain: itemType === "shell" ? 0.052 : 0.046,
    attackSeconds: 0.01
  });
}

function playRecoverySound(): void {
  playCombatTone({
    oscillatorType: "sine",
    startFrequency: 420,
    endFrequency: 660,
    durationSeconds: 0.22,
    peakGain: 0.055,
    attackSeconds: 0.028
  });
}

function playCombatTone(options: {
  readonly oscillatorType: OscillatorType;
  readonly startFrequency: number;
  readonly endFrequency: number;
  readonly durationSeconds: number;
  readonly peakGain: number;
  readonly attackSeconds: number;
}): void {
  const audioContext = getShellLaunchAudioContext();

  if (audioContext === null) {
    return;
  }

  if (audioContext.state === "suspended") {
    void audioContext.resume().catch(() => undefined);
  }

  const startedAt = audioContext.currentTime;
  const endedAt = startedAt + options.durationSeconds;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = options.oscillatorType;
  oscillator.frequency.setValueAtTime(options.startFrequency, startedAt);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(1, options.endFrequency),
    endedAt
  );
  gain.gain.setValueAtTime(0.0001, startedAt);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, options.peakGain),
    startedAt + options.attackSeconds
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, endedAt);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(startedAt);
  oscillator.stop(endedAt);
}

function unlockShellLaunchAudio(): void {
  const audioContext = getShellLaunchAudioContext();

  if (audioContext?.state === "suspended") {
    void audioContext.resume().catch(() => undefined);
  }
}

function bindShellLaunchAudioUnlock(target: Window): () => void {
  target.addEventListener("keydown", unlockShellLaunchAudio);
  target.addEventListener("pointerdown", unlockShellLaunchAudio);

  return () => {
    target.removeEventListener("keydown", unlockShellLaunchAudio);
    target.removeEventListener("pointerdown", unlockShellLaunchAudio);
  };
}

function getShellLaunchAudioContext(): AudioContext | null {
  if (shellLaunchAudioContext !== null) {
    return shellLaunchAudioContext;
  }

  const audioWindow = window as Window & {
    readonly AudioContext?: typeof AudioContext;
    readonly webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextConstructor =
    audioWindow.AudioContext ?? audioWindow.webkitAudioContext;

  if (AudioContextConstructor === undefined) {
    return null;
  }

  shellLaunchAudioContext = new AudioContextConstructor();

  return shellLaunchAudioContext;
}

type CombatItemAssetImageRole = "inventoryIcon" | "worldVisual";

const combatItemAssetImages = createCombatItemAssetImageCache();
const HELD_ITEM_BADGE_SIZE = 28;

function createCombatItemAssetImageCache(): ReadonlyMap<string, HTMLImageElement> {
  const images = new Map<string, HTMLImageElement>();

  for (const asset of COMBAT_ITEM_VISUAL_ASSET_LIST) {
    images.set(
      getCombatItemAssetImageKey(asset.itemType, "inventoryIcon"),
      createCombatItemImage(asset.inventoryIconUrl)
    );
    images.set(
      getCombatItemAssetImageKey(asset.itemType, "worldVisual"),
      createCombatItemImage(asset.worldVisualUrl)
    );
  }

  return images;
}

function createCombatItemImage(src: string): HTMLImageElement {
  const image = new Image();

  image.decoding = "async";
  image.src = src;

  return image;
}

function getCombatItemAssetImage(
  itemType: CombatItemType,
  role: CombatItemAssetImageRole
): HTMLImageElement | null {
  const asset = getCombatItemVisualAsset(itemType);

  if (asset === null) {
    return null;
  }

  const image = combatItemAssetImages.get(
    getCombatItemAssetImageKey(asset.itemType, role)
  );

  if (image === undefined || !image.complete || image.naturalWidth <= 0) {
    return null;
  }

  return image;
}

function getCombatItemAssetImageKey(
  itemType: CombatItemType,
  role: CombatItemAssetImageRole
): string {
  return `${itemType}:${role}`;
}

const drawPill = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  fillStyle: string,
  textStyle: string,
  font = "700 11px system-ui, sans-serif"
): void => {
  ctx.font = font;
  const width = Math.ceil(ctx.measureText(text).width) + 16;
  const height = 20;

  ctx.fillStyle = fillStyle;
  drawRoundedRect(ctx, x - width / 2, y - height / 2, width, height, 7);
  ctx.fill();

  ctx.fillStyle = textStyle;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 0.5);
};

const drawBoostHudPanel = (
  ctx: CanvasRenderingContext2D,
  racer: RaceSessionRacerState,
  itemPickups: readonly BoostHudItemPickupState[],
  height: number,
  animationSeconds: number,
  shellLaunchFeedback: ShellLaunchFeedbackState | null = null
): void => {
  const hud = createBoostHudState(racer, itemPickups);
  const panelWidth = 292;
  const panelHeight = 122;
  const x = 22;
  const y = Math.max(20, height - panelHeight - 22);
  const activeRatio = hud.activeDurationRatio;
  const boxCooldownRatio = hud.pickupRespawnRatio;
  const inventorySlot = createCombatItemInventorySlotState(racer);
  const hasShellLaunchFeedback = shellLaunchFeedback !== null;
  const shellHudVisual = getCombatItemHudVisualConfig("shell");

  ctx.save();
  ctx.fillStyle = "rgba(16, 20, 24, 0.84)";
  drawRoundedRect(ctx, x, y, panelWidth, panelHeight, 8);
  ctx.fill();

  ctx.strokeStyle = "rgba(245, 247, 250, 0.18)";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, x, y, panelWidth, panelHeight, 8);
  ctx.stroke();

  drawCombatItemInventorySlotFrame(
    ctx,
    inventorySlot,
    x + 16,
    y + 16,
    34,
    animationSeconds
  );

  if (inventorySlot.itemType !== null) {
    drawCombatItemInventoryIcon(
      ctx,
      inventorySlot.itemType,
      x + 33,
      y + 33,
      27
    );
  } else {
    drawEmptyInventorySlotGlyph(ctx, x + 33, y + 33);
  }

  if (hasShellLaunchFeedback) {
    drawShellLaunchHudCue(
      ctx,
      shellLaunchFeedback,
      x + 33,
      y + 33,
      animationSeconds
    );
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "#f5f7fa";
  ctx.font = "800 15px system-ui, sans-serif";
  ctx.fillText(
    hasShellLaunchFeedback
      ? "SHELL"
      : inventorySlot.isEmpty
        ? "BOOST"
        : inventorySlot.label,
    x + 60,
    y + 26
  );

  ctx.fillStyle = hasShellLaunchFeedback
    ? shellHudVisual.accentColor
    : inventorySlot.isEmpty
      ? "#b8c2cc"
      : inventorySlot.accentColor;
  ctx.font = "700 10px system-ui, sans-serif";
  ctx.fillText(
    hasShellLaunchFeedback ? "SHELL FIRED" : inventorySlot.feedbackLabel,
    x + 60,
    y + 41
  );

  ctx.fillStyle = hasShellLaunchFeedback
    ? shellHudVisual.accentColor
    : getCombatItemHudStatusColor(hud.availability, inventorySlot);
  drawRoundedRect(ctx, x + 164, y + 13, 108, 24, 7);
  ctx.fill();

  ctx.fillStyle = "#101418";
  ctx.font = "800 10px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(
    hasShellLaunchFeedback
      ? "LAUNCH"
      : getCombatItemHudStatusLabel(hud.availabilityLabel, inventorySlot),
    x + 218,
    y + 25
  );

  ctx.textAlign = "left";
  drawBoostHudLine(ctx, hud.countLabel, x + 16, y + 62, "#f5f7fa");
  drawBoostHudLine(ctx, hud.cooldownLabel, x + 16, y + 84, "#b8c2cc");
  drawBoostHudLine(ctx, hud.activeDurationLabel, x + 16, y + 106, "#ffd166");

  drawBoostHudMeter(ctx, x + 154, y + 55, 118, 8, boxCooldownRatio, "#7cff6b");
  drawBoostHudMeter(ctx, x + 154, y + 99, 118, 8, activeRatio, "#ffd166");

  ctx.restore();
};

const drawCombatItemInventorySlotFrame = (
  ctx: CanvasRenderingContext2D,
  inventorySlot: CombatItemInventorySlotState,
  x: number,
  y: number,
  size: number,
  animationSeconds: number
): void => {
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const shellPulse = inventorySlot.isShellHeld
    ? 1 + Math.sin(animationSeconds * 8) * 0.06
    : 1;

  ctx.save();
  ctx.shadowColor = inventorySlot.isShellHeld
    ? inventorySlot.shadowColor
    : "transparent";
  ctx.shadowBlur = inventorySlot.isShellHeld ? 14 : 0;
  ctx.fillStyle = inventorySlot.isEmpty
    ? "rgba(245, 247, 250, 0.12)"
    : inventorySlot.accentColor;
  drawRoundedRect(ctx, x, y, size, size, 7);
  ctx.fill();
  ctx.restore();

  if (!inventorySlot.isEmpty) {
    ctx.save();
    ctx.strokeStyle = inventorySlot.ringColor;
    ctx.lineWidth = inventorySlot.isShellHeld ? 2.4 : 1.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, size * 0.72 * shellPulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (inventorySlot.cooldownRatio > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(16, 20, 24, 0.82)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      centerX,
      centerY,
      size * 0.58,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * (1 - inventorySlot.cooldownRatio)
    );
    ctx.stroke();
    ctx.restore();
  }
};

const drawShellLaunchHudCue = (
  ctx: CanvasRenderingContext2D,
  feedback: ShellLaunchFeedbackState,
  x: number,
  y: number,
  animationSeconds: number
): void => {
  const progress = getShellLaunchFeedbackProgress(
    feedback,
    animationSeconds,
    SHELL_LAUNCH_HUD_SECONDS
  );
  const alpha = 1 - progress;
  const burstRadius = 16 + progress * 18;
  const shellOffset = 9 + progress * 16;

  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.strokeStyle = "rgba(154, 215, 255, 0.86)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, burstRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = Math.max(0, alpha * 0.92);
  drawCombatItemWorldVisual(
    ctx,
    "shell",
    x + shellOffset,
    y - shellOffset * 0.5,
    18,
    animationSeconds,
    -progress * Math.PI * 2.5
  );
  ctx.restore();
};

const drawBoostHudLine = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string
): void => {
  ctx.fillStyle = color;
  ctx.font = "700 12px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
};

const drawBoostHudMeter = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  ratio: number,
  color: string
): void => {
  ctx.fillStyle = "rgba(245, 247, 250, 0.12)";
  drawRoundedRect(ctx, x, y, width, height, height / 2);
  ctx.fill();

  if (ratio <= 0) {
    return;
  }

  ctx.fillStyle = color;
  drawRoundedRect(ctx, x, y, width * ratio, height, height / 2);
  ctx.fill();
};

const drawCombatItemInventoryIcon = (
  ctx: CanvasRenderingContext2D,
  itemType: CombatItemType,
  x: number,
  y: number,
  size: number
): void => {
  const image = getCombatItemAssetImage(itemType, "inventoryIcon");

  ctx.save();
  ctx.translate(x, y);

  if (image !== null) {
    ctx.drawImage(image, -size / 2, -size / 2, size, size);
  } else {
    drawCombatItemFallbackGlyph(ctx, itemType, size);
  }

  ctx.restore();
};

const drawEmptyInventorySlotGlyph = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number
): void => {
  ctx.save();
  ctx.strokeStyle = "rgba(245, 247, 250, 0.48)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(245, 247, 250, 0.72)";
  ctx.font = "900 16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", x, y + 0.5);
  ctx.restore();
};

const getBoostHudStatusColor = (
  availability: BoostHudAvailability
): string => {
  switch (availability) {
    case "active":
      return "#ffd166";
    case "ready":
      return "#7cff6b";
    case "cooldown":
      return "#ff8bd1";
    case "blocked":
      return "#ff8bd1";
    case "seek":
      return "#9ad7ff";
    case "respawn":
      return "#f5f7fa";
    case "unavailable":
      return "#7b8792";
  }
};

const getCombatItemHudStatusLabel = (
  boostAvailabilityLabel: string,
  inventorySlot: CombatItemInventorySlotState
): string => {
  if (inventorySlot.isEmpty || inventorySlot.itemType === "boost") {
    return boostAvailabilityLabel;
  }

  return inventorySlot.statusLabel;
};

const getCombatItemHudStatusColor = (
  availability: BoostHudAvailability,
  inventorySlot: CombatItemInventorySlotState
): string => {
  if (!inventorySlot.isEmpty && inventorySlot.itemType !== "boost") {
    return inventorySlot.isReady ? inventorySlot.accentColor : "#ff8bd1";
  }

  return getBoostHudStatusColor(availability);
};

const HUMAN_BOOST_ACCENT_COLOR = "#ffd166";
const HUMAN_BOOST_VISUAL_MAX_SPEED = 30;

const getBoostVisualIntensity = (state: RaceSessionRacerState): number =>
  createBoostVisualState(state).intensity;

const drawActiveBoostEffects = (
  ctx: CanvasRenderingContext2D,
  animationSeconds: number,
  accentColor: string,
  intensity: number,
  speedRatio: number
): void => {
  if (intensity <= 0) {
    return;
  }

  const pulse = 1 + Math.sin(animationSeconds * 34) * 0.08;
  const trailStrength = clampValue(0.55 + speedRatio * 0.45, 0.55, 1);

  ctx.save();
  ctx.globalAlpha = 0.28 + intensity * 0.34;
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 18 + intensity * 14;
  ctx.fillStyle = "rgba(255, 209, 102, 0.24)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 30 * pulse, 43 * pulse, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = intensity * trailStrength;
  ctx.lineCap = "round";

  for (let index = 0; index < 6; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const lane = Math.floor(index / 2);
    const phase = animationSeconds * 46 + index * 1.7;
    const x = side * (19 + lane * 5 + Math.sin(phase) * 2);
    const startY = 18 + lane * 7;
    const endY = 56 + lane * 9 + Math.cos(phase) * 5;

    ctx.strokeStyle = index < 2 ? "rgba(255, 255, 255, 0.72)" : accentColor;
    ctx.lineWidth = index < 2 ? 2.5 : 2;
    ctx.beginPath();
    ctx.moveTo(x, startY);
    ctx.lineTo(x + side * 4, endY);
    ctx.stroke();
  }

  ctx.restore();

  drawBoostExhaustFlames(ctx, animationSeconds, accentColor, intensity);
};

const drawBoostExhaustFlames = (
  ctx: CanvasRenderingContext2D,
  animationSeconds: number,
  accentColor: string,
  intensity: number
): void => {
  ctx.save();
  ctx.globalAlpha = 0.72 + intensity * 0.28;

  for (const jetX of [-8, 8]) {
    const flameLength =
      21 + intensity * 15 + Math.sin(animationSeconds * 42 + jetX) * 5;

    ctx.fillStyle = "rgba(255, 117, 48, 0.88)";
    ctx.beginPath();
    ctx.moveTo(jetX - 5, 21);
    ctx.lineTo(jetX, 21 + flameLength);
    ctx.lineTo(jetX + 5, 21);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.moveTo(jetX - 2.5, 23);
    ctx.lineTo(jetX, 25 + flameLength * 0.58);
    ctx.lineTo(jetX + 2.5, 23);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
};

const drawRacerDecal = (
  ctx: CanvasRenderingContext2D,
  racer: AiRacerInstance
): void => {
  ctx.fillStyle = racer.visual.accentColor;

  switch (racer.visual.decal) {
    case "flame":
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.bezierCurveTo(9, -10, 2, -7, 7, -1);
      ctx.bezierCurveTo(2, -3, -1, 2, 0, 7);
      ctx.bezierCurveTo(-9, 1, -8, -9, 0, -18);
      ctx.fill();
      break;
    case "bolt":
      ctx.beginPath();
      ctx.moveTo(4, -19);
      ctx.lineTo(-7, -1);
      ctx.lineTo(1, -1);
      ctx.lineTo(-4, 16);
      ctx.lineTo(9, -5);
      ctx.lineTo(1, -5);
      ctx.closePath();
      ctx.fill();
      break;
    case "comet":
      ctx.beginPath();
      ctx.arc(1, -4, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-5, 2);
      ctx.lineTo(-18, 13);
      ctx.lineTo(-8, -6);
      ctx.closePath();
      ctx.fill();
      break;
    case "wing":
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.bezierCurveTo(-12, -6, -15, 6, -5, 15);
      ctx.bezierCurveTo(-2, 5, 4, 2, 0, -12);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(3, -10);
      ctx.bezierCurveTo(13, -5, 14, 5, 5, 13);
      ctx.bezierCurveTo(5, 4, 0, 1, 3, -10);
      ctx.fill();
      break;
  }
};

const drawItemPickupMarkers = (
  ctx: CanvasRenderingContext2D,
  itemPickups: readonly RaceItemPickupState[],
  viewport: TrackViewport,
  animationSeconds: number
): void => {
  for (const pickup of itemPickups) {
    const position = projectTrackPoint(pickup.position, viewport);
    const visual = createCombatItemPickupVisualState(pickup);
    const bob = Math.sin(animationSeconds * 3.8 + position.x * 0.03) * 2;

    ctx.save();
    ctx.globalAlpha = visual.opacity;
    ctx.strokeStyle = visual.ringColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      position.x,
      position.y + bob,
      visual.markerSize * 0.62,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    drawCombatItemWorldVisual(
      ctx,
      pickup.itemType,
      position.x,
      position.y + bob,
      visual.markerSize,
      animationSeconds
    );

    if (visual.cooldownRatio > 0) {
      ctx.strokeStyle = "rgba(245, 247, 250, 0.62)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        position.x,
        position.y + bob,
        visual.markerSize * 0.72,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * (1 - visual.cooldownRatio)
      );
      ctx.stroke();
    }

    ctx.restore();
  }
};

const drawActiveShellProjectileMarkers = (
  ctx: CanvasRenderingContext2D,
  activeItems: readonly ActiveItemRenderState[],
  viewport: TrackViewport,
  animationSeconds: number
): void => {
  for (const item of activeItems) {
    if (item.type !== "shell") {
      continue;
    }

    const position = projectTrackPoint(item.position, viewport);
    const visual = createActiveCombatItemVisualState(item);

    if (visual.isWorldVisible) {
      drawActiveShellMarker(
        ctx,
        item,
        position.x,
        position.y,
        visual,
        animationSeconds
      );
    }
  }
};

const drawActiveShellMarker = (
  ctx: CanvasRenderingContext2D,
  item: ActiveItemRenderState,
  x: number,
  y: number,
  visual: ActiveCombatItemVisualState,
  animationSeconds: number
): void => {
  const direction = getActiveItemTravelDirection(item);
  const shellVisualFrame = createShellProjectileVisualFrame({
    ageSeconds: item.ageSeconds,
    speed: visual.speed,
    direction: { x: direction.x, z: direction.z },
    isInteractable: visual.isInteractable
  });
  const canvasDirection = getCanvasDirectionFromTrackDirection({
    x: shellVisualFrame.direction.x,
    y: 0,
    z: shellVisualFrame.direction.z
  });
  const shellHeading =
    getShellProjectileHeadingRadians(canvasDirection) +
    shellVisualFrame.bankRadians;

  ctx.save();
  drawActiveShellTrail(ctx, x, y, canvasDirection, visual);
  drawActiveShellProjectileShadow(ctx, x, y, visual);
  drawActiveShellProjectileGlow(ctx, x, y, visual, animationSeconds);
  drawActiveShellStateRing(ctx, x, y, visual, animationSeconds);
  ctx.globalAlpha = visual.opacity;
  drawActiveShellProjectileSprite(
    ctx,
    x,
    y,
    visual,
    shellHeading,
    shellVisualFrame.spinRadians
  );
  drawActiveShellStatusPill(ctx, x, y, visual);
  ctx.restore();
};

const drawShellProjectileRemovalEffects = (
  ctx: CanvasRenderingContext2D,
  effects: readonly ShellProjectileRemovalEffectState[],
  viewport: TrackViewport,
  animationSeconds: number
): void => {
  for (const effect of effects) {
    const ageSeconds = animationSeconds - effect.startedAtSeconds;
    const frame = createShellProjectileRemovalVisualFrame({
      kind: effect.kind,
      ageSeconds,
      durationSeconds: SHELL_PROJECTILE_REMOVAL_EFFECT_SECONDS
    });

    if (!frame.isActive || frame.opacity <= 0) {
      continue;
    }

    const position = projectTrackPoint(effect.position, viewport);
    const canvasDirection = getCanvasDirectionFromTrackDirection(
      effect.direction
    );

    drawShellProjectileRemovalEffect(
      ctx,
      position.x,
      position.y,
      canvasDirection,
      frame,
      animationSeconds
    );
  }
};

const drawShellProjectileRemovalEffect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: { readonly x: number; readonly y: number },
  frame: ReturnType<typeof createShellProjectileRemovalVisualFrame>,
  animationSeconds: number
): void => {
  const baseRadius =
    frame.kind === "impact"
      ? SHELL_PROJECTILE_IMPACT_EFFECT_RADIUS
      : SHELL_PROJECTILE_EXPIRATION_EFFECT_RADIUS;
  const coreRadius = baseRadius * frame.coreRadiusScale;
  const ringRadius = baseRadius * frame.ringRadiusScale;
  const glow = ctx.createRadialGradient(
    x,
    y,
    Math.max(1, coreRadius * 0.12),
    x,
    y,
    Math.max(2, coreRadius)
  );

  glow.addColorStop(0, getShellRemovalCoreColor(frame.kind, 0.92));
  glow.addColorStop(0.48, getShellRemovalCoreColor(frame.kind, 0.34));
  glow.addColorStop(1, getShellRemovalCoreColor(frame.kind, 0));

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = frame.opacity;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = getShellRemovalRingColor(frame.kind, frame.opacity);
  ctx.lineWidth = frame.kind === "impact" ? 3.2 : 2.2;
  ctx.beginPath();
  ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  drawShellProjectileRemovalSparks(
    ctx,
    x,
    y,
    direction,
    frame,
    baseRadius,
    animationSeconds
  );
  ctx.restore();
};

const drawShellProjectileRemovalSparks = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: { readonly x: number; readonly y: number },
  frame: ReturnType<typeof createShellProjectileRemovalVisualFrame>,
  baseRadius: number,
  animationSeconds: number
): void => {
  const sparkCount =
    frame.kind === "impact"
      ? SHELL_PROJECTILE_IMPACT_SPARK_COUNT
      : SHELL_PROJECTILE_EXPIRATION_SPARK_COUNT;
  const normalizedDirection = normalizeCanvasDirection(direction);
  const baseAngle = Math.atan2(
    normalizedDirection.y,
    normalizedDirection.x
  );
  const spreadRadians = frame.kind === "impact" ? Math.PI * 1.55 : Math.PI;
  const phase = animationSeconds * 3.7;

  ctx.save();
  ctx.globalAlpha = frame.sparkOpacity;
  ctx.strokeStyle =
    frame.kind === "impact"
      ? "rgba(245, 247, 250, 0.96)"
      : "rgba(154, 215, 255, 0.78)";
  ctx.lineWidth = frame.kind === "impact" ? 2.4 : 1.7;
  ctx.lineCap = "round";

  for (let index = 0; index < sparkCount; index += 1) {
    const ratio = sparkCount <= 1 ? 0.5 : index / (sparkCount - 1);
    const jitter = Math.sin(phase + index * 1.71) * 0.11;
    const angle = baseAngle + (ratio - 0.5) * spreadRadians + jitter;
    const distance =
      baseRadius *
      frame.sparkDistanceScale *
      (0.78 + Math.sin(index * 2.13) * 0.08);
    const innerDistance = baseRadius * 0.36;
    const startX = x + Math.cos(angle) * innerDistance;
    const startY = y + Math.sin(angle) * innerDistance;
    const endX = x + Math.cos(angle) * distance;
    const endY = y + Math.sin(angle) * distance;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  ctx.restore();
};

function normalizeCanvasDirection(direction: {
  readonly x: number;
  readonly y: number;
}): {
  readonly x: number;
  readonly y: number;
} {
  const magnitude = Math.hypot(direction.x, direction.y);

  if (!Number.isFinite(magnitude) || magnitude <= 0.0001) {
    return { x: 1, y: 0 };
  }

  return {
    x: direction.x / magnitude,
    y: direction.y / magnitude
  };
}

function getShellRemovalCoreColor(
  kind: ShellProjectileRemovalVisualKind,
  alpha: number
): string {
  return kind === "impact"
    ? `rgba(245, 247, 250, ${alpha})`
    : `rgba(154, 215, 255, ${alpha})`;
}

function getShellRemovalRingColor(
  kind: ShellProjectileRemovalVisualKind,
  alpha: number
): string {
  return kind === "impact"
    ? `rgba(255, 139, 209, ${Math.min(0.96, alpha + 0.12)})`
    : `rgba(154, 215, 255, ${Math.min(0.82, alpha + 0.08)})`;
}

const drawActiveShellProjectileShadow = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  visual: ActiveCombatItemVisualState
): void => {
  const shadowWidth = visual.renderSize * 0.84;
  const shadowHeight = visual.renderSize * 0.38;

  ctx.save();
  ctx.globalAlpha = visual.opacity * (visual.isInteractable ? 0.36 : 0.22);
  ctx.fillStyle = "rgba(0, 0, 0, 0.48)";
  ctx.beginPath();
  ctx.ellipse(
    x,
    y + visual.renderSize * 0.22,
    shadowWidth / 2,
    shadowHeight / 2,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.restore();
};

const drawActiveShellProjectileSprite = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  visual: ActiveCombatItemVisualState,
  headingRadians: number,
  spinRadians: number
): void => {
  const image = getCombatItemAssetImage("shell", "worldVisual");
  const shellVisual = getCombatItemHudVisualConfig("shell");
  const spriteWidth = visual.renderSize * SHELL_PROJECTILE_SPRITE_WIDTH_SCALE;
  const spriteHeight = visual.renderSize * SHELL_PROJECTILE_SPRITE_HEIGHT_SCALE;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(headingRadians);
  ctx.shadowColor = shellVisual.shadowColor;
  ctx.shadowBlur = visual.isInteractable ? 14 : 8;
  drawShellProjectileSpriteBackdrop(ctx, spriteWidth, spriteHeight, visual);

  if (image !== null) {
    ctx.drawImage(
      image,
      -spriteWidth / 2,
      -spriteHeight / 2,
      spriteWidth,
      spriteHeight
    );
  } else {
    drawCombatItemFallbackGlyph(ctx, "shell", visual.renderSize);
  }

  drawShellProjectileSpinBands(
    ctx,
    spriteWidth,
    spriteHeight,
    visual,
    spinRadians
  );
  drawShellProjectileForwardHighlight(ctx, spriteWidth, spriteHeight, visual);
  ctx.restore();
};

const drawShellProjectileSpinBands = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  visual: ActiveCombatItemVisualState,
  spinRadians: number
): void => {
  if (!Number.isFinite(spinRadians) || Math.abs(spinRadians) <= 0.0001) {
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, width * 0.42, height * 0.38, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.rotate(spinRadians);
  ctx.globalAlpha = visual.isInteractable ? 0.58 : 0.34;
  ctx.strokeStyle = visual.isExpiring
    ? "rgba(255, 139, 209, 0.95)"
    : "rgba(245, 247, 250, 0.86)";
  ctx.lineWidth = visual.isInteractable ? 2.2 : 1.6;
  ctx.lineCap = "round";

  for (const offset of [-0.24, 0, 0.24]) {
    ctx.beginPath();
    ctx.moveTo(offset * width - width * 0.24, -height * 0.5);
    ctx.lineTo(offset * width + width * 0.24, height * 0.5);
    ctx.stroke();
  }

  ctx.restore();
};

const drawShellProjectileSpriteBackdrop = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  visual: ActiveCombatItemVisualState
): void => {
  ctx.save();
  ctx.globalAlpha = visual.isInteractable ? 0.82 : 0.58;
  ctx.fillStyle = "rgba(16, 20, 24, 0.72)";
  ctx.beginPath();
  ctx.ellipse(0, 0, width * 0.54, height * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = visual.isExpiring
    ? "rgba(255, 139, 209, 0.95)"
    : "rgba(245, 247, 250, 0.88)";
  ctx.lineWidth = visual.isInteractable ? 2.5 : 1.75;
  ctx.beginPath();
  ctx.ellipse(0, 0, width * 0.48, height * 0.46, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

const drawShellProjectileForwardHighlight = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  visual: ActiveCombatItemVisualState
): void => {
  const noseY = -height * 0.42;

  ctx.save();
  ctx.globalAlpha = visual.isInteractable ? 0.86 : 0.58;
  ctx.fillStyle = visual.isExpiring
    ? "rgba(255, 139, 209, 0.9)"
    : "rgba(245, 247, 250, 0.9)";
  ctx.beginPath();
  ctx.moveTo(0, noseY - 3);
  ctx.lineTo(width * 0.13, noseY + height * 0.16);
  ctx.lineTo(-width * 0.13, noseY + height * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const drawActiveShellProjectileGlow = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  visual: ActiveCombatItemVisualState,
  animationSeconds: number
): void => {
  if (visual.projectileGlowRadius <= 0 || visual.projectileGlowOpacity <= 0) {
    return;
  }

  const pulse = 1 + Math.sin(animationSeconds * 14) * 0.08;
  const radius = visual.projectileGlowRadius * pulse;
  const gradient = ctx.createRadialGradient(
    x,
    y,
    Math.max(1, radius * 0.18),
    x,
    y,
    radius
  );

  gradient.addColorStop(0, "rgba(245, 247, 250, 0.94)");
  gradient.addColorStop(0.48, "rgba(154, 215, 255, 0.45)");
  gradient.addColorStop(1, "rgba(154, 215, 255, 0)");

  ctx.save();
  ctx.globalAlpha = visual.projectileGlowOpacity;
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const drawActiveShellTrail = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: { readonly x: number; readonly y: number },
  visual: ActiveCombatItemVisualState
): void => {
  if (visual.trailLength <= 0 || visual.trailOpacity <= 0) {
    return;
  }

  const tailX = x - direction.x * visual.trailLength;
  const tailY = y - direction.y * visual.trailLength;
  const gradient = ctx.createLinearGradient(tailX, tailY, x, y);

  gradient.addColorStop(0, "rgba(154, 215, 255, 0)");
  gradient.addColorStop(
    0.38,
    `rgba(154, 215, 255, ${visual.trailOpacity * 0.42})`
  );
  gradient.addColorStop(1, `rgba(245, 247, 250, ${visual.trailOpacity})`);

  ctx.save();
  ctx.globalAlpha = visual.opacity;
  ctx.lineCap = "round";
  ctx.strokeStyle = gradient;
  ctx.lineWidth = visual.isInteractable ? 9 : 6;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
};

const drawActiveShellStateRing = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  visual: ActiveCombatItemVisualState,
  animationSeconds: number
): void => {
  const pulse =
    1 +
    Math.sin(animationSeconds * (visual.isInteractable ? 12 : 7)) *
      (visual.isInteractable ? 0.08 : 0.04);
  const radius = visual.ringRadius * pulse;

  ctx.save();
  ctx.globalAlpha = visual.opacity;
  ctx.strokeStyle = visual.isExpiring
    ? "rgba(255, 139, 209, 0.9)"
    : visual.isInteractable
      ? visual.ringColor
      : "rgba(245, 247, 250, 0.5)";
  ctx.lineWidth = visual.isInteractable ? 2.5 : 2;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();

  if (!visual.isArmed) {
    ctx.strokeStyle = visual.ringColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      x,
      y,
      radius + 4,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * visual.armProgressRatio
    );
    ctx.stroke();
  }

  if (visual.isInteractable) {
    drawActiveShellReticleTicks(ctx, x, y, radius + 6, visual);
  }

  ctx.restore();
};

const drawActiveShellReticleTicks = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  visual: ActiveCombatItemVisualState
): void => {
  ctx.save();
  ctx.strokeStyle = visual.isExpiring
    ? "rgba(255, 139, 209, 0.88)"
    : "rgba(245, 247, 250, 0.86)";
  ctx.lineWidth = 2;

  for (let index = 0; index < 4; index += 1) {
    const angle = index * (Math.PI / 2);
    const innerRadius = radius - 4;
    const outerRadius = radius + 4;

    ctx.beginPath();
    ctx.moveTo(
      x + Math.cos(angle) * innerRadius,
      y + Math.sin(angle) * innerRadius
    );
    ctx.lineTo(
      x + Math.cos(angle) * outerRadius,
      y + Math.sin(angle) * outerRadius
    );
    ctx.stroke();
  }

  ctx.restore();
};

const drawActiveShellStatusPill = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  visual: ActiveCombatItemVisualState
): void => {
  const fillStyle = visual.isExpiring
    ? "rgba(255, 139, 209, 0.9)"
    : visual.isInteractable
      ? "rgba(154, 215, 255, 0.88)"
      : "rgba(16, 20, 24, 0.76)";
  const textStyle = visual.isInteractable || visual.isExpiring
    ? "#101418"
    : "#f5f7fa";

  ctx.save();
  ctx.globalAlpha = visual.status === "dormant" ? 0.72 : visual.opacity;
  drawPill(
    ctx,
    x,
    y - visual.renderSize * 0.74 - 12,
    visual.statusLabel,
    fillStyle,
    textStyle,
    "800 9px system-ui, sans-serif"
  );
  ctx.restore();
};

const drawShellLaunchFeedbackMarkers = (
  ctx: CanvasRenderingContext2D,
  feedbacks: readonly ShellLaunchFeedbackState[],
  viewport: TrackViewport,
  animationSeconds: number
): void => {
  for (const feedback of feedbacks) {
    const progress = getShellLaunchFeedbackProgress(
      feedback,
      animationSeconds,
      SHELL_LAUNCH_FEEDBACK_SECONDS
    );
    const alpha = 1 - progress;
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    const launchTip = addTrackPoint(
      feedback.origin,
      scaleTrackPoint(
        feedback.direction,
        SHELL_LAUNCH_WORLD_DISTANCE * easedProgress
      )
    );
    const origin = projectTrackPoint(feedback.origin, viewport);
    const tip = projectTrackPoint(launchTip, viewport);
    const gradient = ctx.createLinearGradient(origin.x, origin.y, tip.x, tip.y);

    gradient.addColorStop(0, `rgba(154, 215, 255, ${0.02 * alpha})`);
    gradient.addColorStop(0.32, `rgba(245, 247, 250, ${0.34 * alpha})`);
    gradient.addColorStop(1, `rgba(154, 215, 255, ${0.9 * alpha})`);

    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 10 - progress * 5;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();

    ctx.globalAlpha = Math.max(0, alpha * 0.86);
    ctx.strokeStyle = "rgba(154, 215, 255, 0.92)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 14 + progress * 24, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = Math.max(0, alpha);
    drawCombatItemWorldVisual(
      ctx,
      "shell",
      tip.x,
      tip.y,
      30 + alpha * 5,
      animationSeconds,
      animationSeconds * 18
    );
    ctx.restore();
  }
};

const drawCombatFeedbackEventMarkers = (
  ctx: CanvasRenderingContext2D,
  events: readonly CombatFeedbackEventState[],
  viewport: TrackViewport,
  animationSeconds: number
): void => {
  for (const event of events) {
    const ageSeconds = animationSeconds - event.startedAtSeconds;
    const frame = createCombatFeedbackPulseFrame({
      kind: event.kind,
      ageSeconds,
      durationSeconds: event.expiresAtSeconds - event.startedAtSeconds,
      intensity: event.intensity
    });

    if (!frame.isActive || frame.opacity <= 0) {
      continue;
    }

    const position = projectTrackPoint(event.position, viewport);
    const direction = normalizeCanvasDirection(
      getCanvasDirectionFromTrackDirection(event.direction)
    );

    drawCombatFeedbackEventMarker(
      ctx,
      event,
      position.x,
      position.y,
      direction,
      frame,
      animationSeconds
    );
  }
};

const drawCombatFeedbackEventMarker = (
  ctx: CanvasRenderingContext2D,
  event: CombatFeedbackEventState,
  x: number,
  y: number,
  direction: { readonly x: number; readonly y: number },
  frame: ReturnType<typeof createCombatFeedbackPulseFrame>,
  animationSeconds: number
): void => {
  const color = getCombatFeedbackEventColor(event);
  const baseRadius = COMBAT_FEEDBACK_BASE_RADIUS * getCombatFeedbackRadiusBias(event);
  const coreRadius = baseRadius * frame.coreRadiusScale;
  const ringRadius = baseRadius * frame.ringRadiusScale;
  const labelLift = 32 + frame.progressRatio * 12;
  const glow = ctx.createRadialGradient(
    x,
    y,
    Math.max(1, coreRadius * 0.16),
    x,
    y,
    Math.max(2, coreRadius)
  );

  glow.addColorStop(0, toRgba(color, 0.82));
  glow.addColorStop(0.48, toRgba(color, 0.28));
  glow.addColorStop(1, toRgba(color, 0));

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = frame.coreOpacity;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = frame.ringOpacity;
  ctx.strokeStyle = toRgba(color, event.isLocal ? 0.98 : 0.82);
  ctx.lineWidth = event.kind.includes("hit") ? 3 : 2.2;
  ctx.beginPath();
  ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  drawCombatFeedbackSparks(
    ctx,
    x,
    y,
    direction,
    color,
    baseRadius,
    frame,
    animationSeconds
  );
  ctx.restore();

  if (frame.labelOpacity <= 0) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = frame.labelOpacity;
  drawPill(
    ctx,
    x + direction.x * 12,
    y - labelLift + direction.y * 6,
    event.label,
    toRgba(color, 0.92),
    "#101418",
    "900 10px system-ui, sans-serif"
  );
  ctx.restore();
};

const drawCombatFeedbackSparks = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: { readonly x: number; readonly y: number },
  color: string,
  baseRadius: number,
  frame: ReturnType<typeof createCombatFeedbackPulseFrame>,
  animationSeconds: number
): void => {
  const baseAngle = Math.atan2(direction.y, direction.x);
  const spreadRadians =
    frame.kind.includes("hit") || frame.kind.includes("near-miss")
      ? Math.PI * 1.45
      : Math.PI * 0.92;
  const phase = animationSeconds * 4.6;

  ctx.save();
  ctx.globalAlpha = frame.sparkOpacity;
  ctx.strokeStyle = toRgba(color, 0.95);
  ctx.lineWidth = frame.kind.includes("hit") ? 2.5 : 1.8;
  ctx.lineCap = "round";

  for (let index = 0; index < COMBAT_FEEDBACK_SPARK_COUNT; index += 1) {
    const ratio =
      COMBAT_FEEDBACK_SPARK_COUNT <= 1
        ? 0.5
        : index / (COMBAT_FEEDBACK_SPARK_COUNT - 1);
    const jitter = Math.sin(phase + index * 1.39) * 0.13;
    const angle = baseAngle + (ratio - 0.5) * spreadRadians + jitter;
    const distance =
      baseRadius *
      frame.sparkDistanceScale *
      (0.76 + Math.cos(index * 1.82) * 0.1);
    const startDistance = baseRadius * 0.3;

    ctx.beginPath();
    ctx.moveTo(
      x + Math.cos(angle) * startDistance,
      y + Math.sin(angle) * startDistance
    );
    ctx.lineTo(
      x + Math.cos(angle) * distance,
      y + Math.sin(angle) * distance
    );
    ctx.stroke();
  }

  ctx.restore();
};

function getCombatFeedbackEventColor(event: CombatFeedbackEventState): string {
  if (event.kind === "recovery") {
    return "#f5f7fa";
  }

  if (event.itemType !== null) {
    return getCombatItemHudVisualConfig(event.itemType).accentColor;
  }

  return "#f5f7fa";
}

function getCombatFeedbackRadiusBias(event: CombatFeedbackEventState): number {
  switch (event.kind) {
    case "shell-hit":
      return 1.22;
    case "banana-hit":
      return 1.14;
    case "shell-near-miss":
    case "banana-near-miss":
      return 0.94 + event.intensity * 0.18;
    case "recovery":
      return 0.86;
    case "shell-launch":
    case "banana-drop":
      return 0.96;
  }
}

function toRgba(hexColor: string, alpha: number): string {
  const normalized = hexColor.trim().replace("#", "");

  if (!/^[\dA-Fa-f]{6}$/.test(normalized)) {
    return `rgba(245, 247, 250, ${clampValue(alpha, 0, 1)})`;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${clampValue(alpha, 0, 1)})`;
}

const drawCombatItemWorldVisual = (
  ctx: CanvasRenderingContext2D,
  itemType: CombatItemType,
  x: number,
  y: number,
  size: number,
  animationSeconds: number,
  baseRotationRadians = 0
): void => {
  const image = getCombatItemAssetImage(itemType, "worldVisual");
  const visual = getCombatItemHudVisualConfig(itemType);
  const rotation =
    itemType === "banana" ? Math.sin(animationSeconds * 5.2) * 0.08 : 0;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(baseRotationRadians + rotation);
  ctx.shadowColor = visual.shadowColor;
  ctx.shadowBlur = itemType === "banana" ? 10 : 4;

  if (image !== null) {
    ctx.drawImage(image, -size / 2, -size / 2, size, size);
  } else {
    drawCombatItemFallbackGlyph(ctx, itemType, size);
  }

  ctx.restore();
};

function getActiveItemTravelDirection(item: ActiveItemRenderState): TrackPoint3 {
  const velocityMagnitude = getPlanarVectorMagnitude(item.velocity);

  if (velocityMagnitude > 0.0001) {
    return normalizePlanarDirection(item.velocity);
  }

  if (item.type === "shell" && "direction" in item) {
    return normalizePlanarDirection(item.direction);
  }

  return { x: 0, y: 0, z: 1 };
}

function getCanvasDirectionFromTrackDirection(direction: TrackPoint3): {
  readonly x: number;
  readonly y: number;
} {
  return {
    x: direction.x,
    y: -direction.z
  };
}

function getShellProjectileHeadingRadians(direction: {
  readonly x: number;
  readonly y: number;
}): number {
  const magnitude = Math.hypot(direction.x, direction.y);

  if (magnitude <= 0.0001) {
    return 0;
  }

  return (
    Math.atan2(direction.y / magnitude, direction.x / magnitude) +
    SHELL_PROJECTILE_FORWARD_AXIS_RADIANS
  );
}

const drawCombatItemFallbackGlyph = (
  ctx: CanvasRenderingContext2D,
  itemType: CombatItemType,
  size: number
): void => {
  const registryItem = COMBAT_ITEM_REGISTRY[itemType];

  ctx.fillStyle =
    itemType === "boost"
      ? "#ffd166"
      : itemType === "shell"
        ? "#9ad7ff"
        : "#ffd84a";
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.42, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#101418";
  ctx.font = `900 ${Math.max(11, size * 0.46)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(registryItem.inventoryIcon, 0, 1);
};

const drawHeldItemBadge = (
  ctx: CanvasRenderingContext2D,
  state: RaceSessionRacerState,
  x: number,
  y: number,
  animationSeconds: number
): void => {
  if (state.heldItem === null) {
    return;
  }

  const inventorySlot = createCombatItemInventorySlotState(state);
  const badgeX = x + 27;
  const badgeY = y - 37;
  const badgeRadius = 7;

  ctx.save();
  ctx.fillStyle = "rgba(16, 20, 24, 0.9)";
  drawRoundedRect(
    ctx,
    badgeX - HELD_ITEM_BADGE_SIZE / 2,
    badgeY - HELD_ITEM_BADGE_SIZE / 2,
    HELD_ITEM_BADGE_SIZE,
    HELD_ITEM_BADGE_SIZE,
    badgeRadius
  );
  ctx.fill();

  ctx.strokeStyle = inventorySlot.ringColor;
  ctx.lineWidth = 1.5;
  drawRoundedRect(
    ctx,
    badgeX - HELD_ITEM_BADGE_SIZE / 2,
    badgeY - HELD_ITEM_BADGE_SIZE / 2,
    HELD_ITEM_BADGE_SIZE,
    HELD_ITEM_BADGE_SIZE,
    badgeRadius
  );
  ctx.stroke();

  if (inventorySlot.isShellHeld) {
    drawHeldShellBadgeVisual(
      ctx,
      badgeX,
      badgeY,
      HELD_ITEM_BADGE_SIZE - 3,
      animationSeconds,
      inventorySlot.ringColor
    );
  } else {
    drawCombatItemInventoryIcon(
      ctx,
      state.heldItem,
      badgeX,
      badgeY,
      HELD_ITEM_BADGE_SIZE - 8
    );
  }

  ctx.restore();
};

const drawHeldShellBadgeVisual = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  animationSeconds: number,
  ringColor: string
): void => {
  const pulse = 1 + Math.sin(animationSeconds * 10) * 0.08;

  ctx.save();
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, (size / 2) * pulse, 0, Math.PI * 2);
  ctx.stroke();
  drawCombatItemWorldVisual(ctx, "shell", x, y, size - 3, animationSeconds);
  ctx.restore();
};

const drawRacerMarker = (
  ctx: CanvasRenderingContext2D,
  state: RaceSessionRacerState,
  role: TrackSceneRacerRole,
  x: number,
  y: number,
  animationSeconds: number,
  indicator: RacerRaceIndicator | undefined,
  visualSpinRadians: number
): void => {
  if (state.racer.controller === "ai") {
    drawAiRacerMarker(
      ctx,
      state,
      x,
      y,
      animationSeconds,
      indicator,
      visualSpinRadians
    );
    return;
  }

  drawHumanRacerMarker(
    ctx,
    state,
    role,
    x,
    y,
    animationSeconds,
    indicator,
    visualSpinRadians
  );
};

const drawHumanRacerMarker = (
  ctx: CanvasRenderingContext2D,
  state: RaceSessionRacerState,
  role: TrackSceneRacerRole,
  x: number,
  y: number,
  animationSeconds: number,
  indicator: RacerRaceIndicator | undefined,
  visualSpinRadians: number
): void => {
  const boostIntensity = getBoostVisualIntensity(state);
  const boostPulse =
    boostIntensity > 0 ? 1 + Math.sin(animationSeconds * 28) * 0.045 : 1;
  const speedRatio = clampValue(
    state.speed / HUMAN_BOOST_VISUAL_MAX_SPEED,
    0,
    1
  );
  const recoveringWobble = getRacerRecoveringWobble(state, animationSeconds);
  const roleAccentColor = getHumanRacerRoleAccentColor(role);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(state.headingRadians + recoveringWobble + visualSpinRadians);

  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.beginPath();
  ctx.ellipse(0, 9, 25, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  drawActiveBoostEffects(
    ctx,
    animationSeconds,
    HUMAN_BOOST_ACCENT_COLOR,
    boostIntensity,
    speedRatio
  );

  ctx.fillStyle = "#20272e";
  drawRoundedRect(ctx, -21, -18, 8, 35, 4);
  ctx.fill();
  drawRoundedRect(ctx, 13, -18, 8, 35, 4);
  ctx.fill();

  ctx.save();
  ctx.scale(boostPulse, 1);

  ctx.fillStyle = state.color;
  drawRoundedRect(ctx, -15, -24, 30, 48, 7);
  ctx.fill();

  ctx.strokeStyle = roleAccentColor;
  ctx.lineWidth = role === "local-human" ? 3 : 2;
  drawRoundedRect(ctx, -15, -24, 30, 48, 7);
  ctx.stroke();

  ctx.fillStyle = roleAccentColor;
  drawRoundedRect(ctx, -8, -14, 16, 18, 4);
  ctx.fill();

  ctx.fillStyle = "#f5f7fa";
  drawRoundedRect(ctx, -11, 3, 22, 16, 4);
  ctx.fill();

  ctx.fillStyle = "#101418";
  ctx.font = "700 12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(state.slotIndex + 1), 0, 11);

  ctx.restore();
  ctx.restore();

  if (indicator !== undefined) {
    drawPill(
      ctx,
      x,
      y - 55,
      `P${indicator.place} L${indicator.lap}/${indicator.lapCount}`,
      "rgba(16, 20, 24, 0.82)",
      "#f5f7fa"
    );
  }

  ctx.fillStyle = "#f5f7fa";
  ctx.font = "600 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(state.displayName, x, y + 42);

  ctx.fillStyle = roleAccentColor;
  ctx.font = "700 11px system-ui, sans-serif";
  ctx.fillText(getHumanRacerRoleLabel(role), x, y + 58);

  drawHeldItemBadge(ctx, state, x, y, animationSeconds);
  drawRacerHitFeedback(
    ctx,
    state,
      x,
      y,
      animationSeconds,
      roleAccentColor
    );

  const statusLabel = getHumanStatusLabel(state);

  if (statusLabel !== null) {
    drawPill(
      ctx,
      x,
      y + 76,
      statusLabel,
      "rgba(245, 247, 250, 0.9)",
      "#101418",
      "800 10px system-ui, sans-serif"
    );
  } else if (boostIntensity > 0) {
    drawPill(
      ctx,
      x,
      y + 76,
      "BOOST",
      "rgba(255, 209, 102, 0.92)",
      "#101418",
      "800 10px system-ui, sans-serif"
    );
  }
};

const drawAiRacerMarker = (
  ctx: CanvasRenderingContext2D,
  state: RaceSessionRacerState,
  x: number,
  y: number,
  animationSeconds: number,
  indicator: RacerRaceIndicator | undefined,
  visualSpinRadians: number
): void => {
  const racer = state.racer;

  if (racer.controller !== "ai") {
    return;
  }

  const maxSpeed = Math.max(racer.driving.maxSpeed, 1);
  const speedRatio = clampValue(state.speed / maxSpeed, 0, 1);
  const boostIntensity = getBoostVisualIntensity(state);
  const steerLean = clampValue(state.input.steer, -1, 1) * 0.14 * speedRatio;
  const boostPulse =
    boostIntensity > 0 ? 1 + Math.sin(animationSeconds * 28) * 0.045 : 1;
  const throttleBob =
    state.input.throttle > 0
      ? Math.sin(animationSeconds * 18 + state.slotIndex) * 1.4 * speedRatio
      : 0;
  const stunWobble = getRacerRecoveringWobble(state, animationSeconds);

  ctx.save();
  ctx.translate(x, y + throttleBob);
  ctx.rotate(state.headingRadians + steerLean + stunWobble + visualSpinRadians);

  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.beginPath();
  ctx.ellipse(0, 10, 26 + speedRatio * 3, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  drawActiveBoostEffects(
    ctx,
    animationSeconds,
    racer.visual.accentColor,
    boostIntensity,
    speedRatio
  );

  drawAiWheels(ctx, speedRatio, animationSeconds);

  ctx.save();
  ctx.scale(boostPulse, 1);

  ctx.fillStyle = state.color;
  drawRoundedRect(ctx, -16, -25, 32, 50, 7);
  ctx.fill();

  ctx.strokeStyle = "#f5f7fa";
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, -16, -25, 32, 50, 7);
  ctx.stroke();

  ctx.fillStyle = racer.visual.accentColor;
  drawRoundedRect(ctx, -5, -20, 10, 28, 3);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -27);
  ctx.lineTo(-11, -13);
  ctx.lineTo(11, -13);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.translate(0, -4);
  ctx.scale(0.58, 0.58);
  drawRacerDecal(ctx, racer);
  ctx.restore();

  ctx.fillStyle = "#f5f7fa";
  drawRoundedRect(ctx, -12, 5, 24, 16, 4);
  ctx.fill();

  ctx.fillStyle = "#101418";
  ctx.font = "700 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(racer.visual.racingNumber), 0, 13);

  ctx.fillStyle = "#101418";
  drawRoundedRect(ctx, -8, -14, 16, 10, 3);
  ctx.fill();

  ctx.restore();
  ctx.restore();

  drawRacerHitFeedback(ctx, state, x, y, animationSeconds, racer.visual.accentColor);

  drawAiRaceIndicators(ctx, state, x, y, animationSeconds, indicator);
};

const drawAiWheels = (
  ctx: CanvasRenderingContext2D,
  speedRatio: number,
  animationSeconds: number
): void => {
  const wheelFlash = Math.sin(animationSeconds * 32) > 0 ? "#5f6972" : "#20272e";
  const treadOffset = speedRatio > 0.08 ? Math.sin(animationSeconds * 24) * 2 : 0;

  ctx.fillStyle = "#20272e";
  drawRoundedRect(ctx, -23, -18, 8, 36, 4);
  ctx.fill();
  drawRoundedRect(ctx, 15, -18, 8, 36, 4);
  ctx.fill();

  ctx.fillStyle = wheelFlash;
  drawRoundedRect(ctx, -22, -11 + treadOffset, 6, 8, 3);
  ctx.fill();
  drawRoundedRect(ctx, 16, -11 - treadOffset, 6, 8, 3);
  ctx.fill();
  drawRoundedRect(ctx, -22, 6 - treadOffset, 6, 8, 3);
  ctx.fill();
  drawRoundedRect(ctx, 16, 6 + treadOffset, 6, 8, 3);
  ctx.fill();
};

const drawAiStunSparks = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  animationSeconds: number,
  accentColor: string
): void => {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;

  for (let index = 0; index < 5; index += 1) {
    const angle = animationSeconds * 5.5 + index * ((Math.PI * 2) / 5);
    const innerRadius = 27;
    const outerRadius = 34 + Math.sin(animationSeconds * 11 + index) * 2;
    const startX = Math.cos(angle) * innerRadius;
    const startY = Math.sin(angle) * innerRadius;
    const endX = Math.cos(angle) * outerRadius;
    const endY = Math.sin(angle) * outerRadius;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  ctx.restore();
};

const drawRacerHitFeedback = (
  ctx: CanvasRenderingContext2D,
  state: RaceSessionRacerState,
  x: number,
  y: number,
  animationSeconds: number,
  fallbackColor: string
): void => {
  if (
    state.shieldSeconds <= 0 &&
    state.hitFeedbackSeconds <= 0 &&
    state.itemHitImmunitySeconds <= 0 &&
    !state.recovering &&
    state.stunSeconds <= 0 &&
    state.spinoutSeconds <= 0
  ) {
    return;
  }

  const feedbackColor = getRacerHitFeedbackColor(state, fallbackColor);
  const shieldIntensity = clampValue(state.shieldSeconds / 1.25, 0, 1);
  const feedbackIntensity = clampValue(state.hitFeedbackSeconds / 0.48, 0, 1);
  const immunityIntensity = clampValue(state.itemHitImmunitySeconds / 1.15, 0, 1);
  const statusIntensity = Math.max(
    feedbackIntensity,
    clampValue(state.stunSeconds / 0.45, 0, 1),
    state.spinoutSeconds > 0 ? clampValue(state.spinoutSeconds / 1.1, 0.36, 1) : 0,
    state.recovering ? 0.36 : 0
  );
  const pulse = 1 + Math.sin(animationSeconds * 22 + state.slotIndex) * 0.08;

  if (shieldIntensity > 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.22 + shieldIntensity * 0.34;
    ctx.strokeStyle = "#74f7ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 43 * pulse, 35 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (feedbackIntensity > 0 || state.recovering) {
    drawAiStunSparks(ctx, x, y, animationSeconds, feedbackColor);
  }

  if (statusIntensity > 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.16 + statusIntensity * 0.22;
    ctx.strokeStyle = feedbackColor;
    ctx.lineWidth = state.spinoutSeconds > 0 ? 3.2 : 2.4;
    ctx.beginPath();
    ctx.ellipse(
      0,
      0,
      (48 + statusIntensity * 14) * pulse,
      (38 + statusIntensity * 10) * pulse,
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.restore();
  }

  if (immunityIntensity <= 0) {
    return;
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.16 + immunityIntensity * 0.22;
  ctx.strokeStyle = feedbackColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 39 * pulse, 31 * pulse, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

const getRacerHitFeedbackColor = (
  state: RaceSessionRacerState,
  fallbackColor: string
): string => {
  if (state.lastHitItemType !== null) {
    return getCombatItemHudVisualConfig(state.lastHitItemType).accentColor;
  }

  return fallbackColor;
};

const getRacerRecoveringWobble = (
  state: RaceSessionRacerState,
  animationSeconds: number
): number => {
  if (!state.recovering && state.stunSeconds <= 0 && state.spinoutSeconds <= 0) {
    return 0;
  }

  const spinoutScale = state.spinoutSeconds > 0 ? 0.34 : 0.24;

  return Math.sin(animationSeconds * 34 + state.slotIndex) * spinoutScale;
};

const drawAiRaceIndicators = (
  ctx: CanvasRenderingContext2D,
  state: RaceSessionRacerState,
  x: number,
  y: number,
  animationSeconds: number,
  indicator: RacerRaceIndicator | undefined
): void => {
  const racer = state.racer;

  if (racer.controller !== "ai") {
    return;
  }

  if (indicator !== undefined) {
    drawPill(
      ctx,
      x,
      y - 55,
      `P${indicator.place} L${indicator.lap}/${indicator.lapCount}`,
      "rgba(16, 20, 24, 0.82)",
      "#f5f7fa"
    );
  }

  ctx.fillStyle = "#f5f7fa";
  ctx.font = "600 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(state.displayName, x, y + 43);

  ctx.fillStyle = racer.visual.accentColor;
  ctx.font = "700 11px system-ui, sans-serif";
  ctx.fillText(
    `#${racer.visual.racingNumber} ${racer.visual.decal.toUpperCase()}`,
    x,
    y + 59
  );

  const statusLabel = getAiStatusLabel(state);

  if (statusLabel !== null) {
    drawPill(
      ctx,
      x,
      y + 76,
      statusLabel,
      "rgba(245, 247, 250, 0.9)",
      "#101418",
      "700 10px system-ui, sans-serif"
    );
  }

  drawHeldItemBadge(ctx, state, x, y, animationSeconds);
};

const getAiStatusLabel = (
  state: RaceSessionRacerState
): string | null => {
  const hitStatusLabel = getRacerHitStatusLabel(state);

  if (hitStatusLabel !== null) {
    return hitStatusLabel;
  }

  const boostLabel = createBoostVisualState(state).label;

  if (boostLabel !== null) {
    return boostLabel;
  }

  if (state.heldItem !== null) {
    return state.heldItem.toUpperCase();
  }

  return null;
};

const getHumanStatusLabel = (
  state: RaceSessionRacerState
): string | null => {
  return getRacerHitStatusLabel(state);
};

const getHumanRacerRoleLabel = (role: TrackSceneRacerRole): string => {
  switch (role) {
    case "local-human":
      return "YOU";
    case "remote-human":
      return "PEER";
    case "ai":
      return "PLAYER";
  }
};

const getHumanRacerRoleAccentColor = (
  role: TrackSceneRacerRole
): string => {
  switch (role) {
    case "local-human":
      return "#ffd166";
    case "remote-human":
      return "#74f7ff";
    case "ai":
      return HUMAN_BOOST_ACCENT_COLOR;
  }
};

const getRacerHitStatusLabel = (
  state: RaceSessionRacerState
): string | null => {
  if (state.lastHitItemType === "shell" && state.spinoutSeconds > 0) {
    return "SHELL SPIN";
  }

  if (state.lastHitItemType === "banana" && state.spinoutSeconds > 0) {
    return "BANANA SPIN";
  }

  if (state.recovering || state.stunSeconds > 0) {
    return "STUN";
  }

  if (state.itemHitImmunitySeconds > 0) {
    return "RECOVER";
  }

  return null;
};

const createRaceStandingsFromRaceProgress = (
  phase: RaceStandingsPhase,
  progress: readonly RaceProgressSnapshot[]
): RaceStandingsState => ({
  phase,
  entries: progress
    .map(createRaceStandingEntryFromProgress)
    .sort(compareRaceStandingEntries)
});

const createRaceStandingsFromRaceStateSnapshot = (
  snapshot: KartRaceStateSnapshot
): RaceStandingsState =>
  createRaceStandingsFromRaceProgress(snapshot.phase, snapshot.racers);

const createRaceStandingEntryFromProgress = (
  progress: RaceProgressSnapshot
): RaceStandingEntry => ({
  racerId: progress.racerId,
  slotIndex: progress.slotIndex,
  displayName: progress.displayName,
  controller: progress.controller,
  place: progress.finishPlace ?? progress.rank,
  lap: progress.finished
    ? progress.lapCount
    : clampValue(progress.lap + 1, 1, progress.lapCount),
  lapCount: progress.lapCount,
  currentLapProgressRatio: progress.finished
    ? 1
    : progress.currentLapProgressRatio,
  completionRatio: progress.completionRatio,
  finished: progress.finished,
  finishPlace: progress.finishPlace,
  finishTimeSeconds: progress.finishTimeSeconds
});

const compareRaceStandingEntries = (
  left: RaceStandingEntry,
  right: RaceStandingEntry
): number => {
  if (left.finishPlace !== null || right.finishPlace !== null) {
    if (left.finishPlace === null) {
      return 1;
    }

    if (right.finishPlace === null) {
      return -1;
    }

    return left.finishPlace - right.finishPlace;
  }

  if (left.finished !== right.finished) {
    return left.finished ? -1 : 1;
  }

  const progressDelta = right.completionRatio - left.completionRatio;

  if (Math.abs(progressDelta) > 0.000_001) {
    return progressDelta;
  }

  if (left.lap !== right.lap) {
    return right.lap - left.lap;
  }

  return left.place - right.place || left.slotIndex - right.slotIndex;
};

const createRaceIndicatorsFromStandings = (
  standings: RaceStandingsState
): ReadonlyMap<string, RacerRaceIndicator> => {
  const indicators = new Map<string, RacerRaceIndicator>();

  for (const entry of standings.entries) {
    indicators.set(entry.racerId, {
      place: entry.place,
      lap: entry.lap,
      lapCount: entry.lapCount
    });
  }

  return indicators;
};

const BOOST_CAMERA_SPEED_LINE_COUNT = 30;
const BOOST_CAMERA_SPEED_LINE_MIN_INTENSITY = 0.01;

function drawBoostCameraFeedbackFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  feedback: ReturnType<typeof createBoostCameraFeedbackFrame>
): void {
  const intensity = clampValue(feedback.speedLineIntensity, 0, 1);

  if (intensity <= BOOST_CAMERA_SPEED_LINE_MIN_INTENSITY) {
    return;
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const diagonal = Math.hypot(width, height);
  const phase = feedback.speedLinePhase * 7.5;
  const edgeGlow = ctx.createRadialGradient(
    centerX,
    centerY,
    diagonal * 0.18,
    centerX,
    centerY,
    diagonal * 0.62
  );

  edgeGlow.addColorStop(0, "rgba(255, 209, 102, 0)");
  edgeGlow.addColorStop(0.62, "rgba(255, 209, 102, 0)");
  edgeGlow.addColorStop(1, `rgba(255, 209, 102, ${0.18 * intensity})`);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = edgeGlow;
  ctx.fillRect(0, 0, width, height);
  ctx.translate(centerX, centerY);
  ctx.rotate(feedback.frameTiltRadians);
  ctx.scale(
    1 + feedback.cameraPunchScale,
    1 + feedback.cameraPunchScale * 0.45
  );
  ctx.lineCap = "round";

  for (let index = 0; index < BOOST_CAMERA_SPEED_LINE_COUNT; index += 1) {
    const lane = index / BOOST_CAMERA_SPEED_LINE_COUNT;
    const angle =
      lane * Math.PI * 2 + Math.sin(index * 2.17 + phase) * 0.045;
    const travel = (phase + index * 0.29) % 1;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const innerRadius = diagonal * (0.24 + travel * 0.055);
    const outerRadius = diagonal * (0.46 + travel * 0.13);
    const lineAlpha = intensity * (0.34 + (1 - travel) * 0.36);

    ctx.strokeStyle =
      index % 3 === 0
        ? `rgba(255, 255, 255, ${lineAlpha})`
        : `rgba(255, 209, 102, ${lineAlpha})`;
    ctx.lineWidth = 1.6 + intensity * 3.2 + (index % 4) * 0.34;
    ctx.beginPath();
    ctx.moveTo(directionX * innerRadius, directionY * innerRadius);
    ctx.lineTo(directionX * outerRadius, directionY * outerRadius);
    ctx.stroke();
  }

  ctx.restore();
}

const LIVE_STANDINGS_PANEL_WIDTH = 352;
const LIVE_STANDINGS_ROW_HEIGHT = 44;
const LOCAL_LAP_HUD_PANEL_WIDTH = 230;
const LOCAL_LAP_HUD_PANEL_HEIGHT = 74;
const FINAL_RESULTS_PANEL_WIDTH = 430;
const FINAL_RESULTS_HEADER_HEIGHT = 122;
const FINAL_RESULTS_ROW_HEIGHT = 50;

const RACE_HUD_STATUS_COLORS: Record<
  RaceHudRacerStatusTone,
  { readonly fill: string; readonly stroke: string; readonly text: string }
> = {
  local: {
    fill: "rgba(255, 209, 102, 0.18)",
    stroke: "rgba(255, 209, 102, 0.48)",
    text: "#fff3c4"
  },
  connected: {
    fill: "rgba(124, 255, 107, 0.14)",
    stroke: "rgba(124, 255, 107, 0.42)",
    text: "#caffc2"
  },
  pending: {
    fill: "rgba(253, 185, 75, 0.14)",
    stroke: "rgba(253, 185, 75, 0.42)",
    text: "#ffe0a3"
  },
  offline: {
    fill: "rgba(245, 247, 250, 0.1)",
    stroke: "rgba(245, 247, 250, 0.2)",
    text: "#aeb7c0"
  },
  ai: {
    fill: "rgba(154, 215, 255, 0.14)",
    stroke: "rgba(154, 215, 255, 0.42)",
    text: "#c4ebff"
  }
};

function drawRaceStandingsPanel(
  ctx: CanvasRenderingContext2D,
  standings: RaceStandingsState,
  statusByRacerId: ReadonlyMap<string, RaceHudRacerStatus>,
  width: number,
  height: number,
  localRacerId: string | null
): void {
  if (standings.entries.length === 0) {
    return;
  }

  if (standings.phase === "finished") {
    drawFinalResultsPanel(
      ctx,
      standings,
      statusByRacerId,
      width,
      height,
      localRacerId
    );
    return;
  }

  drawLiveStandingsPanel(ctx, standings, statusByRacerId, width, localRacerId);
}

function drawLocalLapHudPanel(
  ctx: CanvasRenderingContext2D,
  standings: RaceStandingsState,
  width: number,
  localRacerId: string | null
): void {
  if (standings.phase === "finished") {
    return;
  }

  const entry = getLocalRaceStandingEntry(standings, localRacerId);

  if (entry === undefined) {
    return;
  }

  const panelWidth = Math.min(
    LOCAL_LAP_HUD_PANEL_WIDTH,
    Math.max(132, width - 32)
  );
  const x = 18;
  const hasCrampedTopRow =
    width <
    LOCAL_LAP_HUD_PANEL_WIDTH + LIVE_STANDINGS_PANEL_WIDTH + 64;
  const y = hasCrampedTopRow
    ? 18 + 42 + standings.entries.length * LIVE_STANDINGS_ROW_HEIGHT + 12
    : 18;
  const placeLabel = formatPlaceLabel(entry.place);
  const lapLabel = `${entry.lap}/${entry.lapCount}`;
  const progressLabel = formatRaceProgressPercentLabel(
    entry.currentLapProgressRatio
  );
  const statusLabel = getLocalLapHudStatusLabel(entry);

  ctx.save();
  ctx.fillStyle = "rgba(16, 20, 24, 0.86)";
  drawRoundedRect(ctx, x, y, panelWidth, LOCAL_LAP_HUD_PANEL_HEIGHT, 8);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 209, 102, 0.46)";
  ctx.lineWidth = 1.2;
  drawRoundedRect(ctx, x, y, panelWidth, LOCAL_LAP_HUD_PANEL_HEIGHT, 8);
  ctx.stroke();

  ctx.fillStyle = "#ffd166";
  ctx.font = "900 10px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("POS", x + 14, y + 16);

  ctx.fillStyle = getRacePlaceColor(entry.place);
  ctx.font = "900 27px system-ui, sans-serif";
  ctx.fillText(placeLabel, x + 14, y + 42);

  ctx.fillStyle = "#ffd166";
  ctx.font = "900 10px system-ui, sans-serif";
  ctx.fillText("LAP", x + 82, y + 16);

  ctx.fillStyle = "#f5f7fa";
  ctx.font = "900 25px system-ui, sans-serif";
  ctx.fillText(lapLabel, x + 82, y + 42);

  ctx.fillStyle = entry.finished ? "#7cff6b" : "#b8c2cc";
  ctx.font = "800 9px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(statusLabel, x + panelWidth - 14, y + 17);

  ctx.fillStyle = "#f5f7fa";
  ctx.font = "900 16px system-ui, sans-serif";
  ctx.fillText(progressLabel, x + panelWidth - 14, y + 42);

  drawRaceStandingProgressBar(
    ctx,
    x + 14,
    y + LOCAL_LAP_HUD_PANEL_HEIGHT - 12,
    panelWidth - 28,
    6,
    entry.currentLapProgressRatio,
    entry.finished
  );

  ctx.restore();
}

function getLocalRaceStandingEntry(
  standings: RaceStandingsState,
  localRacerId: string | null
): RaceStandingEntry | undefined {
  if (localRacerId !== null) {
    return standings.entries.find((entry) => entry.racerId === localRacerId);
  }

  return (
    standings.entries.find((entry) => entry.controller === "human") ??
    standings.entries[0]
  );
}

function getLocalLapHudStatusLabel(entry: RaceStandingEntry): string {
  if (entry.finished) {
    return "FINISHED";
  }

  return entry.lap >= entry.lapCount ? "FINAL LAP" : "CURRENT";
}

function drawLiveStandingsPanel(
  ctx: CanvasRenderingContext2D,
  standings: RaceStandingsState,
  statusByRacerId: ReadonlyMap<string, RaceHudRacerStatus>,
  width: number,
  localRacerId: string | null
): void {
  const panelWidth = Math.min(
    LIVE_STANDINGS_PANEL_WIDTH,
    Math.max(220, width - 32)
  );
  const panelHeight = 42 + standings.entries.length * LIVE_STANDINGS_ROW_HEIGHT;
  const x = Math.max(16, width - panelWidth - 18);
  const y = 18;

  ctx.save();
  ctx.fillStyle = "rgba(16, 20, 24, 0.84)";
  drawRoundedRect(ctx, x, y, panelWidth, panelHeight, 8);
  ctx.fill();

  ctx.strokeStyle = "rgba(245, 247, 250, 0.16)";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, x, y, panelWidth, panelHeight, 8);
  ctx.stroke();

  ctx.fillStyle = "#f5f7fa";
  ctx.font = "800 13px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("RACE ORDER", x + 14, y + 20);
  ctx.fillStyle = "#aeb7c0";
  ctx.font = "800 10px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`${standings.entries.length}/${RACE_CAPACITY}`, x + panelWidth - 14, y + 20);

  for (let index = 0; index < standings.entries.length; index += 1) {
    const entry = standings.entries[index];

    if (entry === undefined) {
      continue;
    }

    drawLiveStandingRow(
      ctx,
      entry,
      x + 10,
      y + 36 + index * LIVE_STANDINGS_ROW_HEIGHT,
      panelWidth - 20,
      LIVE_STANDINGS_ROW_HEIGHT,
      entry.racerId === localRacerId,
      getRaceHudStatusForEntry(entry, statusByRacerId)
    );
  }

  ctx.restore();
}

function drawRaceHudStatusBadge(
  ctx: CanvasRenderingContext2D,
  status: RaceHudRacerStatus,
  x: number,
  y: number
): number {
  const colors = RACE_HUD_STATUS_COLORS[status.tone];
  const height = 15;

  ctx.save();
  ctx.font = "900 8px system-ui, sans-serif";
  const width = Math.ceil(ctx.measureText(status.roleLabel).width) + 12;

  ctx.fillStyle = colors.fill;
  drawRoundedRect(ctx, x, y, width, height, 5);
  ctx.fill();

  ctx.strokeStyle = colors.stroke;
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, x, y, width, height, 5);
  ctx.stroke();

  ctx.fillStyle = colors.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(status.roleLabel, x + width / 2, y + height / 2 + 0.5);
  ctx.restore();

  return width;
}

function drawLiveStandingRow(
  ctx: CanvasRenderingContext2D,
  entry: RaceStandingEntry,
  x: number,
  y: number,
  width: number,
  height: number,
  isLocal: boolean,
  status: RaceHudRacerStatus
): void {
  if (isLocal) {
    ctx.fillStyle = "rgba(255, 209, 102, 0.14)";
    drawRoundedRect(ctx, x, y, width, height - 4, 6);
    ctx.fill();
  }

  const placeX = x + 7;
  const centerY = y + height / 2 - 2;
  const lapLabel = formatRaceStandingLapLabel(entry);
  const progressWidth = Math.max(70, Math.min(106, width * 0.31));
  const progressX = x + width - progressWidth;
  const nameMaxWidth = Math.max(76, progressX - (x + 39) - 56);
  const progressLabel = formatRaceProgressPercentLabel(entry.completionRatio);

  ctx.fillStyle = getRacePlaceColor(entry.place);
  ctx.font = "900 14px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(formatPlaceLabel(entry.place), placeX, centerY);

  ctx.fillStyle = isLocal ? "#fff3c4" : "#f5f7fa";
  ctx.font = "800 12px system-ui, sans-serif";
  drawEllipsizedText(ctx, entry.displayName, x + 39, y + 13, nameMaxWidth);

  const badgeWidth = drawRaceHudStatusBadge(
    ctx,
    status,
    x + 39,
    y + 25
  );
  ctx.fillStyle = RACE_HUD_STATUS_COLORS[status.tone].text;
  ctx.font = "800 9px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  drawEllipsizedText(
    ctx,
    status.statusLabel,
    x + 39 + badgeWidth + 6,
    y + 32,
    Math.max(48, progressX - (x + 39 + badgeWidth + 14))
  );

  ctx.fillStyle = entry.finished ? "#7cff6b" : "#b8c2cc";
  ctx.font = "800 10px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(lapLabel, progressX - 8, y + 14);

  drawRaceStandingProgressBar(
    ctx,
    progressX,
    y + 11,
    progressWidth,
    8,
    entry.completionRatio,
    entry.finished
  );

  ctx.fillStyle = entry.finished ? "#7cff6b" : "#aeb7c0";
  ctx.font = "800 9px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(progressLabel, x + width, y + 31);
}

function drawFinalResultsPanel(
  ctx: CanvasRenderingContext2D,
  standings: RaceStandingsState,
  statusByRacerId: ReadonlyMap<string, RaceHudRacerStatus>,
  width: number,
  height: number,
  localRacerId: string | null
): void {
  const localEntry = getLocalRaceStandingEntry(standings, localRacerId);
  const panelWidth = Math.min(
    FINAL_RESULTS_PANEL_WIDTH,
    Math.max(280, width - 36)
  );
  const panelHeight =
    FINAL_RESULTS_HEADER_HEIGHT +
    standings.entries.length * FINAL_RESULTS_ROW_HEIGHT;
  const x = (width - panelWidth) / 2;
  const y = Math.max(24, Math.min(height - panelHeight - 24, height * 0.14));

  ctx.save();
  ctx.fillStyle = "rgba(16, 20, 24, 0.92)";
  drawRoundedRect(ctx, x, y, panelWidth, panelHeight, 8);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 209, 102, 0.58)";
  ctx.lineWidth = 1.5;
  drawRoundedRect(ctx, x, y, panelWidth, panelHeight, 8);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffd166";
  ctx.font = "900 22px system-ui, sans-serif";
  ctx.fillText("FINAL RESULTS", x + panelWidth / 2, y + 28);
  ctx.fillStyle = "#b8c2cc";
  ctx.font = "700 11px system-ui, sans-serif";
  ctx.fillText(
    `${getRaceStandingsLapCount(standings)} LAPS COMPLETE`,
    x + panelWidth / 2,
    y + 50
  );

  if (localEntry !== undefined) {
    drawFinalPlacementCallout(
      ctx,
      localEntry,
      x + 16,
      y + 64,
      panelWidth - 32
    );
  }

  ctx.fillStyle = "#f5f7fa";
  ctx.font = "900 10px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("FINISH ORDER", x + 18, y + 108);
  ctx.textAlign = "right";
  ctx.fillText("TIME", x + panelWidth - 18, y + 108);

  for (let index = 0; index < standings.entries.length; index += 1) {
    const entry = standings.entries[index];

    if (entry === undefined) {
      continue;
    }

    drawFinalResultRow(
      ctx,
      entry,
      x + 14,
      y + FINAL_RESULTS_HEADER_HEIGHT + index * FINAL_RESULTS_ROW_HEIGHT,
      panelWidth - 28,
      FINAL_RESULTS_ROW_HEIGHT,
      entry.racerId === localRacerId,
      getRaceHudStatusForEntry(entry, statusByRacerId)
    );
  }

  ctx.restore();
}

function drawFinalPlacementCallout(
  ctx: CanvasRenderingContext2D,
  entry: RaceStandingEntry,
  x: number,
  y: number,
  width: number
): void {
  const calloutHeight = 34;
  const placeLabel = formatOrdinalPlaceLabel(entry.place);
  const resultLabel =
    entry.finishPlace === null ? "FINAL PLACEMENT" : "YOUR FINAL PLACEMENT";
  const timeLabel = formatFinishTime(entry);

  ctx.fillStyle = "rgba(255, 209, 102, 0.16)";
  drawRoundedRect(ctx, x, y, width, calloutHeight, 7);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 209, 102, 0.34)";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, x, y, width, calloutHeight, 7);
  ctx.stroke();

  ctx.fillStyle = "#ffd166";
  ctx.font = "900 9px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(resultLabel, x + 12, y + 11);

  ctx.fillStyle = getRacePlaceColor(entry.place);
  ctx.font = "900 20px system-ui, sans-serif";
  ctx.fillText(placeLabel, x + 12, y + 25);

  ctx.fillStyle = "#f5f7fa";
  ctx.font = "800 11px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(formatFinalPlacementSummary(entry), x + width - 12, y + 13);

  ctx.fillStyle = "#b8c2cc";
  ctx.font = "800 9px system-ui, sans-serif";
  ctx.fillText(`FINISH ${timeLabel}`, x + width - 12, y + 27);
}

function drawFinalResultRow(
  ctx: CanvasRenderingContext2D,
  entry: RaceStandingEntry,
  x: number,
  y: number,
  width: number,
  height: number,
  isLocal: boolean,
  status: RaceHudRacerStatus
): void {
  const rowHeight = height - 6;
  const centerY = y + rowHeight / 2;

  ctx.fillStyle = isLocal
    ? "rgba(255, 209, 102, 0.16)"
    : "rgba(245, 247, 250, 0.07)";
  drawRoundedRect(ctx, x, y, width, rowHeight, 7);
  ctx.fill();

  ctx.fillStyle = getRacePlaceColor(entry.place);
  ctx.font = "900 16px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(formatPlaceLabel(entry.place), x + 12, centerY);

  ctx.fillStyle = isLocal ? "#fff3c4" : "#f5f7fa";
  ctx.font = "800 14px system-ui, sans-serif";
  drawEllipsizedText(ctx, entry.displayName, x + 68, centerY - 8, width - 184);

  const badgeWidth = drawRaceHudStatusBadge(
    ctx,
    status,
    x + 68,
    centerY + 1
  );
  ctx.fillStyle = RACE_HUD_STATUS_COLORS[status.tone].text;
  ctx.font = "800 9px system-ui, sans-serif";
  ctx.textBaseline = "middle";
  drawEllipsizedText(
    ctx,
    status.statusLabel,
    x + 68 + badgeWidth + 6,
    centerY + 8,
    Math.max(70, width - 196 - badgeWidth)
  );

  ctx.fillStyle = "#f5f7fa";
  ctx.font = "800 13px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(formatFinishTime(entry), x + width - 12, centerY);
}

function drawRaceStandingProgressBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  completionRatio: number,
  finished: boolean
): void {
  const ratio = clampValue(completionRatio, 0, 1);

  ctx.fillStyle = "rgba(245, 247, 250, 0.14)";
  drawRoundedRect(ctx, x, y, width, height, height / 2);
  ctx.fill();

  if (ratio <= 0) {
    return;
  }

  ctx.fillStyle = finished ? "#7cff6b" : "#ffd166";
  drawRoundedRect(ctx, x, y, Math.max(height, width * ratio), height, height / 2);
  ctx.fill();
}

function drawEllipsizedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number
): void {
  ctx.fillText(getEllipsizedText(ctx, text, maxWidth), x, y);
}

function getEllipsizedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  const ellipsis = "...";
  let candidate = text;

  while (candidate.length > 0) {
    candidate = candidate.slice(0, -1);

    if (ctx.measureText(`${candidate}${ellipsis}`).width <= maxWidth) {
      return `${candidate}${ellipsis}`;
    }
  }

  return ellipsis;
}

function formatPlaceLabel(place: number): string {
  return `P${Math.max(1, Math.round(place))}`;
}

function formatOrdinalPlaceLabel(place: number): string {
  const normalizedPlace = Math.max(1, Math.round(place));
  const lastTwoDigits = normalizedPlace % 100;
  const suffix =
    lastTwoDigits >= 11 && lastTwoDigits <= 13
      ? "TH"
      : normalizedPlace % 10 === 1
        ? "ST"
        : normalizedPlace % 10 === 2
          ? "ND"
          : normalizedPlace % 10 === 3
            ? "RD"
            : "TH";

  return `${normalizedPlace}${suffix}`;
}

function formatRaceStandingLapLabel(entry: RaceStandingEntry): string {
  return entry.finished ? "FIN" : `L${entry.lap}/${entry.lapCount}`;
}

function formatRaceProgressPercentLabel(progressRatio: number): string {
  return `${Math.round(clampValue(progressRatio, 0, 1) * 100)}%`;
}

function formatFinishTime(entry: RaceStandingEntry): string {
  if (entry.finishTimeSeconds === null) {
    return "--.--";
  }

  return `${entry.finishTimeSeconds.toFixed(2)}s`;
}

function formatFinalPlacementSummary(entry: RaceStandingEntry): string {
  return `${formatPlaceLabel(entry.place)} OF ${RACE_CAPACITY}`;
}

function getRacePlaceColor(place: number): string {
  switch (place) {
    case 1:
      return "#ffd166";
    case 2:
      return "#d7dde4";
    case 3:
      return "#ffb27a";
    default:
      return "#9ad7ff";
  }
}

function getRaceStandingsLapCount(standings: RaceStandingsState): number {
  return standings.entries[0]?.lapCount ?? DEFAULT_RACE_TRACK_STATE.lapCount;
}

const renderRaceOverlay = (
  target: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  racerEntries: readonly RacerRenderEntry[],
  itemPickups: readonly RaceItemPickupState[],
  activeItems: readonly ActiveItemRenderState[],
  animationSeconds: number,
  localRacerId: string | null,
  standings: RaceStandingsState,
  statusByRacerId: ReadonlyMap<string, RaceHudRacerStatus>,
  boostCameraFeedback: BoostCameraFovState
): void => {
  const pixelRatio = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const canvasWidth = Math.floor(width * pixelRatio);
  const canvasHeight = Math.floor(height * pixelRatio);

  if (target.width !== canvasWidth || target.height !== canvasHeight) {
    target.width = canvasWidth;
    target.height = canvasHeight;
    target.style.width = `${width}px`;
    target.style.height = `${height}px`;
  }

  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const cameraFeedback = createBoostCameraFeedbackFrame(boostCameraFeedback);
  const viewport = createTrackViewport(
    DEFAULT_RACE_TRACK_STATE.bounds,
    width,
    height,
    { fovMultiplier: cameraFeedback.fovMultiplier }
  );

  drawItemPickupMarkers(ctx, itemPickups, viewport, animationSeconds);
  drawShellLaunchFeedbackMarkers(
    ctx,
    getActiveShellLaunchFeedbacks(animationSeconds),
    viewport,
    animationSeconds
  );
  drawCombatFeedbackEventMarkers(
    ctx,
    getActiveCombatFeedbackEvents(animationSeconds),
    viewport,
    animationSeconds
  );

  const renderedRacers: ScreenRacerRenderEntry[] = racerEntries.map(
    (entry) => ({
      ...entry,
      screenPosition: projectTrackPoint(entry.state.position, viewport)
    })
  );

  updateBoostParticleTrailStates(
    renderedRacers.map((entry) => entry.state),
    getBoostParticleTrailDeltaSeconds(animationSeconds)
  );
  drawBoostParticleTrailMarkers(ctx, boostParticleTrailStates, viewport);

  for (const renderEntry of renderedRacers) {
    drawRacerMarker(
      ctx,
      renderEntry.state,
      renderEntry.role,
      renderEntry.screenPosition.x,
      renderEntry.screenPosition.y,
      animationSeconds,
      renderEntry.indicator,
      getRacerSpinoutVisualRotation(renderEntry.state)
    );
  }

  drawActiveShellProjectileMarkers(ctx, activeItems, viewport, animationSeconds);
  drawShellProjectileRemovalEffects(
    ctx,
    getActiveShellProjectileRemovalEffects(animationSeconds),
    viewport,
    animationSeconds
  );
  drawBoostCameraFeedbackFrame(ctx, width, height, cameraFeedback);
  drawLocalLapHudPanel(ctx, standings, width, localRacerId);
  drawRaceStandingsPanel(
    ctx,
    standings,
    statusByRacerId,
    width,
    height,
    localRacerId
  );
};

function createRaceHudStatusByRacerId(
  localRacerId: string | null
): ReadonlyMap<string, RaceHudRacerStatus> {
  const context = createRaceHudConnectionContext(localRacerId);
  const statuses = new Map<string, RaceHudRacerStatus>();

  for (const racer of raceSession.racerStates) {
    statuses.set(
      racer.id,
      createRaceHudRacerStatus(createRaceHudParticipant(racer), context)
    );
  }

  return statuses;
}

function createRaceHudConnectionContext(
  localRacerId: string | null
): RaceHudConnectionContext {
  const state = multiplayerConnectionState.state;

  return {
    localRacerId,
    localPeerId: localSignalingPeerId,
    remotePeerId: state.remotePeerId ?? activeWebRtcPeerPlan?.remotePeerId ?? null,
    phase: state.phase,
    dataChannelOpen: hasOpenDataChannel()
  };
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

function getRaceHudStatusForEntry(
  entry: RaceStandingEntry,
  statusByRacerId: ReadonlyMap<string, RaceHudRacerStatus>
): RaceHudRacerStatus {
  const status = statusByRacerId.get(entry.racerId);

  if (status !== undefined) {
    return status;
  }

  return createRaceHudRacerStatus(
    {
      racerId: entry.racerId,
      slotIndex: entry.slotIndex,
      controller: entry.controller,
      peerId: null,
      isHost: entry.slotIndex === 0
    },
    createRaceHudConnectionContext(null)
  );
}

const createRacerRenderEntries = (
  racers: readonly RaceSessionRacerState[],
  remoteTransforms: ReadonlyMap<string, SmoothedKartTransform> | null,
  localRacerId: string | null,
  standings: RaceStandingsState
): readonly RacerRenderEntry[] => {
  const indicators = createRaceIndicatorsFromStandings(standings);

  return [...racers]
    .sort((left, right) => left.slotIndex - right.slotIndex)
    .map((racer) => {
      const authoritativeTransform = remoteTransforms?.get(racer.id);
      const state = createRacerRenderState(
        racer,
        authoritativeTransform,
        racer.id !== localRacerId
      );

      return {
        state,
        indicator: indicators.get(racer.id),
        role: getRacerRenderRole(state, localRacerId)
      } satisfies RacerRenderEntry;
    });
};

const createTrackSceneRacerRenderStates = (
  entries: readonly RacerRenderEntry[]
): readonly TrackSceneRacerRenderState[] =>
  entries.map((entry) => {
    const boostVisual = createBoostVisualState(entry.state);
    const effectState = createTrackSceneRacerSharedEffectState(entry.state);

    return {
      racerId: entry.state.id,
      slotIndex: entry.state.slotIndex,
      role: entry.role,
      displayName: entry.state.displayName,
      color: entry.state.color,
      accentColor: getTrackSceneRacerAccentColor(entry),
      position: entry.state.position,
      headingRadians: entry.state.headingRadians,
      speed: entry.state.speed,
      boostActive: boostVisual.isActive || effectState.boostSeconds > 0,
      heldItem: entry.state.heldItem,
      indicatorLabel:
        entry.indicator === undefined
          ? null
          : formatRaceIndicatorLabel(entry.indicator),
      racingNumber:
        entry.state.racer.controller === "ai"
          ? entry.state.racer.visual.racingNumber
          : null,
      effectState
    } satisfies TrackSceneRacerRenderState;
  });

const createTrackSceneRacerSharedEffectState = (
  state: RaceSessionRacerState
): TrackSceneRacerEffectRenderState =>
  createTrackSceneRacerEffectRenderState({
    boostSeconds: state.boostSeconds,
    shieldSeconds: state.shieldSeconds,
    stunSeconds: state.stunSeconds,
    spinoutSeconds: state.spinoutSeconds,
    spinoutAngularVelocity: state.spinoutAngularVelocity,
    spinoutRotationRadians: getRacerSpinoutVisualRotation(state),
    itemHitImmunitySeconds: state.itemHitImmunitySeconds,
    hitFeedbackSeconds: state.hitFeedbackSeconds,
    lastHitItemType: state.lastHitItemType,
    recovering:
      state.recovering ||
      state.stunSeconds > 0 ||
      state.spinoutSeconds > 0 ||
      state.hitFeedbackSeconds > 0
  });

const getRacerRenderRole = (
  state: RaceSessionRacerState,
  localRacerId: string | null
): TrackSceneRacerRole => {
  if (state.controller === "ai") {
    return "ai";
  }

  return state.id === localRacerId ? "local-human" : "remote-human";
};

const getTrackSceneRacerAccentColor = (entry: RacerRenderEntry): string => {
  if (entry.state.racer.controller === "ai") {
    return entry.state.racer.visual.accentColor;
  }

  return getHumanRacerRoleAccentColor(entry.role);
};

const formatRaceIndicatorLabel = (indicator: RacerRaceIndicator): string =>
  `P${indicator.place} L${indicator.lap}/${indicator.lapCount}`;

const createRacerRenderState = (
  racer: RaceSessionRacerState,
  transform: SmoothedKartTransform | undefined,
  useAuthoritativeTransform: boolean
): RaceSessionRacerState => {
  if (transform === undefined) {
    return racer;
  }

  const presentationState = {
    ...racer,
    heldItem: transform.heldItem,
    boostSeconds: transform.boostSeconds,
    shieldSeconds: transform.shieldSeconds,
    stunSeconds: transform.stunSeconds,
    spinoutSeconds: transform.spinoutSeconds,
    spinoutAngularVelocity: transform.spinoutAngularVelocity,
    itemHitImmunitySeconds: transform.itemHitImmunitySeconds,
    hitFeedbackSeconds: transform.hitFeedbackSeconds,
    lastHitItemType: transform.lastHitItemType,
    itemUseCooldownSeconds: transform.itemUseCooldownSeconds
  };

  if (!useAuthoritativeTransform) {
    return presentationState;
  }

  const authoritativeState = {
    ...presentationState,
    position: transform.position,
    velocity: transform.velocity,
    forward: transform.forward,
    headingRadians: transform.headingRadians,
    speed: transform.speed,
    updateCount: transform.updateCount
  };

  refreshRacerCollisionBounds(authoritativeState);

  return authoritativeState;
};

function createRenderedActiveItemStates(
  localActiveItems: readonly ActiveRaceItemState[],
  authoritativeActiveItems: readonly KartActiveItemSnapshot[] | null,
  now: number
): readonly ActiveItemRenderState[] {
  if (authoritativeActiveItems === null) {
    return localActiveItems;
  }

  const visibleAuthoritativeActiveItems = authoritativeActiveItems.filter(
    (item) =>
      item.type !== "banana" ||
      !authoritativeRemovedBananaRenderIds.has(item.itemId)
  );
  const spawnedBananas = sampleAuthoritativeBananaSpawnRenderItems(now);

  if (spawnedBananas.length === 0) {
    return visibleAuthoritativeActiveItems;
  }

  const authoritativeItemIds = new Set(
    visibleAuthoritativeActiveItems.map(getActiveRenderItemId)
  );
  const missingSpawnedBananas = spawnedBananas.filter(
    (item) => !authoritativeItemIds.has(item.itemId)
  );

  return missingSpawnedBananas.length === 0
    ? visibleAuthoritativeActiveItems
    : [...visibleAuthoritativeActiveItems, ...missingSpawnedBananas];
}

function sampleAuthoritativeBananaSpawnRenderItems(
  now: number
): readonly KartActiveItemSnapshot[] {
  const freshEvents: AuthoritativeBananaSpawnRenderEvent[] = [];
  const items: KartActiveItemSnapshot[] = [];

  for (const entry of authoritativeBananaSpawnRenderEvents) {
    const ageSeconds = Math.max(0, (now - entry.receivedAt) / 1000);

    if (
      ageSeconds > BANANA_SPAWN_REPLAY_SECONDS ||
      authoritativeRemovedBananaRenderIds.has(entry.event.bananaId)
    ) {
      continue;
    }

    freshEvents.push(entry);
    items.push({
      itemId: entry.event.bananaId,
      networkId: entry.event.networkId,
      type: "banana",
      ownerId: entry.event.ownerId,
      ownerRacerId: entry.event.ownerRacerId,
      ownerSlotIndex: entry.event.ownerSlotIndex,
      activeState: "active",
      removed: false,
      initialPosition: entry.event.position,
      position: entry.event.position,
      direction: { x: 0, y: 0, z: 0 },
      velocity: entry.event.velocity,
      lifetimeSeconds: Math.max(
        entry.event.ttlSeconds,
        entry.event.ageSeconds + ageSeconds + entry.event.ttlSeconds
      ),
      radius: entry.event.radius,
      armedSeconds: Math.max(0, entry.event.armedSeconds - ageSeconds),
      ttlSeconds: entry.event.ttlSeconds,
      ageSeconds: entry.event.ageSeconds + ageSeconds,
      orientationRadians: entry.event.orientationRadians
    });
  }

  authoritativeBananaSpawnRenderEvents = freshEvents.slice(
    -MAX_REPLICATED_BANANA_SPAWNS
  );

  return items;
}

function rememberAuthoritativeBananaSpawnRenderEvent(
  event: KartBananaSpawnEventMessage
): void {
  const existingIndex = authoritativeBananaSpawnRenderEvents.findIndex(
    (entry) => entry.event.bananaId === event.bananaId
  );
  const nextEntry = {
    event,
    receivedAt: performance.now()
  };

  if (existingIndex >= 0) {
    authoritativeBananaSpawnRenderEvents[existingIndex] = nextEntry;
  } else {
    authoritativeBananaSpawnRenderEvents.push(nextEntry);
  }

  authoritativeBananaSpawnRenderEvents =
    authoritativeBananaSpawnRenderEvents.slice(-MAX_REPLICATED_BANANA_SPAWNS);
}

function forgetAuthoritativeBananaSpawnRenderEvent(bananaId: string): void {
  authoritativeBananaSpawnRenderEvents =
    authoritativeBananaSpawnRenderEvents.filter(
      (entry) => entry.event.bananaId !== bananaId
    );
}

function rememberAuthoritativeBananaRemovalRenderEvent(bananaId: string): void {
  authoritativeRemovedBananaRenderIds.add(bananaId);
  forgetAuthoritativeBananaSpawnRenderEvent(bananaId);
}

function getActiveRenderItemId(item: ActiveItemRenderState): string {
  return "itemId" in item ? item.itemId : item.id;
}

let lobbyUi: LobbyUi | null = null;
let scheduledRender: number | null = null;
let gameLoopFrame: number | null = null;
let lastFrameTimestamp: number | null = null;
let applicationDisposed = false;
let intentionalSignalingClose = false;
let activeHostPeerConnection: HostPeerConnection | null = null;
let activeGuestPeerConnection: GuestPeerConnection | null = null;
let activeWebRtcPeerPlan: WebRtcRacePeerPlan | null = null;
let localSignalingPeerId: SignalingPeerId | null = null;
let disposeSpinoutVerificationHooks: (() => void) | null = null;
let peerConnectionGeneration = 0;
const multiplayerConnectionState = new MultiplayerConnectionStateModel({
  now: () => performance.now()
});
let raceSession = createRaceSession();
let localInputSnapshotEmitter: LocalKartInputSnapshotEmitter | null = null;
let localInputSnapshotEmitterKey: string | null = null;
let localRemoteInputDeltaEmitter: LocalKartRemoteInputDeltaEmitter | null = null;
let localRemoteInputDeltaEmitterKey: string | null = null;
let remoteInputSnapshotBuffer: RemoteKartInputSnapshotBuffer | null = null;
let remoteInputSnapshotBufferKey: string | null = null;
const remoteInputDeltaQueues = new Map<string, RemoteKartInputDeltaQueue>();
let localTransformSnapshotEmitter: LocalKartTransformSnapshotEmitter | null = null;
let localTransformSnapshotEmitterHostPeerId: string | null = null;
let localOwnedTransformSnapshotEmitter: LocalKartOwnedTransformSnapshotEmitter | null = null;
let localOwnedTransformSnapshotEmitterKey: string | null = null;
let remoteOwnedTransformSmoother: RemoteKartOwnedTransformSmoother | null = null;
let remoteTransformSmoother: RemoteKartTransformSmoother | null = null;
let remoteTransformSmootherHostPeerId: string | null = null;
let localItemUseEventEmitter: LocalKartItemUseEventEmitter | null = null;
let localItemUseEventEmitterHostPeerId: string | null = null;
let localMultiplayerEffectEventEmitter:
  | LocalKartMultiplayerEffectEventEmitter
  | null = null;
let localMultiplayerEffectEventEmitterHostPeerId: string | null = null;
let remoteMultiplayerEffectEventBuffer:
  | RemoteKartMultiplayerEffectEventBuffer
  | null = null;
let remoteMultiplayerEffectEventBufferHostPeerId: string | null = null;
let remoteMultiplayerEffectEventDrainTimer: number | null = null;
let replicatedEffectTimingSamples: KartMultiplayerEffectEventReplicationTiming[] =
  [];
let localRaceStateSnapshotEmitter: LocalKartRaceStateSnapshotEmitter | null = null;
let localRaceStateSnapshotEmitterHostPeerId: string | null = null;
let remoteRaceStateSnapshotSynchronizer: RemoteKartRaceStateSnapshotSynchronizer | null = null;
let remoteRaceStateSnapshotSynchronizerHostPeerId: string | null = null;
const authoritativePlayerSnapshotClock =
  new FixedKartAuthoritativePlayerSnapshotClock();
const localAuthoritativePlayerSnapshotEmitters = new Map<
  string,
  LocalKartAuthoritativePlayerSnapshotEmitter
>();
let remoteAuthoritativePlayerSnapshotSynchronizer:
  | RemoteKartAuthoritativePlayerSnapshotSynchronizer
  | null = null;
let remoteAuthoritativePlayerSnapshotSynchronizerKey: string | null = null;
let remoteAuthoritativePlayerReconciler:
  | RemoteKartAuthoritativePlayerReconciler
  | null = null;
const acknowledgedRemoteInputSequencesByPlayer = new Map<string, number>();
let authoritativeRaceStandings: RaceStandingsState | null = null;
let replicatedPickupCollections: RaceItemPickupCollectionEvent[] = [];
let replicatedBoostActivations: RaceBoostActivationEvent[] = [];
let replicatedShellHits: RaceShellHitEvent[] = [];
let authoritativeItemCollisionOutcomeSequence = 0;
const emittedItemCollisionOutcomeKeys = new Set<string>();
const emittedItemCollisionOutcomeKeyOrder: string[] = [];
let replicatedBananaSpawns: KartBananaSpawnEventMessage[] = [];
let replicatedBananaCollisionEvents: KartBananaCollisionEventMessage[] = [];
let replicatedBananaRemovalEvents: KartBananaRemovalEventMessage[] = [];
let replicatedBananaHits: RaceBananaHitEvent[] = [];
let authoritativeBananaSpawnRenderEvents: AuthoritativeBananaSpawnRenderEvent[] = [];
const authoritativeRemovedBananaRenderIds = new Set<string>();
let activeShellLaunchFeedbacks: ShellLaunchFeedbackState[] = [];
let activeCombatFeedbackEvents: CombatFeedbackEventState[] = [];
const recentNearMissFeedbacks = new Map<string, number>();
const racerCombatStatusFeedbackMemory = new Map<
  string,
  RacerCombatStatusFeedbackMemory
>();
const emittedShellLaunchEffectItemIds = new Set<string>();
const emittedBananaDropEffectItemIds = new Set<string>();
const activeBoostMultiplayerEffectsByRacerId = new Map<
  string,
  ActiveBoostMultiplayerEffectState
>();
const activeSpinoutMultiplayerEffectsByRacerId = new Map<
  string,
  ActiveSpinoutMultiplayerEffectState
>();
let visibleShellProjectileRenderStates = new Map<
  string,
  ShellProjectileRenderMemory
>();
let activeShellProjectileRemovalEffects: ShellProjectileRemovalEffectState[] = [];
let shellLaunchAudioContext: AudioContext | null = null;
const seenShellLaunchItemIds = new Set<string>();
const seenShellProjectileRemovalEffectKeys = new Set<string>();
const seenShellProjectileImpactShellIds = new Set<string>();
let boostCameraFovState = createDefaultBoostCameraFovState();
let lastBoostCameraFovTimestamp: number | null = null;
const boostParticleTrailStates = new Map<string, BoostParticleTrailState>();
let lastBoostParticleTrailUpdateSeconds: number | null = null;
const racerSpinoutVisualStates = new Map<string, RacerSpinoutVisualState>();
const localKartInput = new KeyboardKartInputState();
const disposeLocalKartInput = bindKeyboardKartInput(window, localKartInput);
const disposeShellLaunchAudioUnlock = bindShellLaunchAudioUnlock(window);

interface AuthoritativeBananaSpawnRenderEvent {
  readonly event: KartBananaSpawnEventMessage;
  readonly receivedAt: number;
}

const renderGame = (): void => {
  if (applicationDisposed) {
    return;
  }

  const pixelRatio = window.devicePixelRatio || 1;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const animationNow = performance.now();
  const authoritativeTransforms =
    remoteTransformSmoother?.sample(animationNow) ?? null;
  const remoteOwnedTransform =
    remoteOwnedTransformSmoother?.sample(animationNow) ?? null;
  const networkedOpponentTransforms = createNetworkedOpponentTransformMap(
    authoritativeTransforms,
    remoteOwnedTransform
  );
  const authoritativeItemPickups =
    remoteTransformSmoother?.sampleItemPickups(animationNow) ?? null;
  const authoritativeActiveItems =
    remoteTransformSmoother?.sampleActiveItems(animationNow) ?? null;
  const renderedItemPickups = createRenderedItemPickupStates(
    raceSession.itemPickupStates,
    authoritativeItemPickups
  );
  const renderedActiveItems = updateShellProjectileVisualLifecycle(
    createRenderedActiveItemStates(
      raceSession.activeItemStates,
      authoritativeActiveItems,
      animationNow
    ),
    animationNow
  );
  const standings =
    authoritativeRaceStandings ??
    createRaceStandingsFromRaceProgress(
      raceSession.phase,
      raceSession.raceProgress
    );
  const playerRacer = resolveLocalHumanRacerForInput();
  const localRacerId = getLocalHumanRacerId() ?? playerRacer?.id ?? null;
  const raceHudStatusByRacerId = createRaceHudStatusByRacerId(localRacerId);
  const racerRenderEntries = createRacerRenderEntries(
    raceSession.racerStates,
    networkedOpponentTransforms,
    localRacerId,
    standings
  );
  const animationSeconds = animationNow / 1000;

  updateRacerSpinoutVisualStates(
    racerRenderEntries.map((entry) => entry.state),
    animationSeconds
  );
  updateCombatNearMissFeedbacks(
    renderedActiveItems,
    racerRenderEntries.map((entry) => entry.state),
    animationSeconds
  );
  updateRacerRecoveryFeedbacks(
    racerRenderEntries.map((entry) => entry.state),
    animationSeconds
  );

  const hudRacer =
    playerRacer === null
      ? null
      : createRacerRenderState(
          playerRacer,
          authoritativeTransforms?.get(playerRacer.id),
          false
        );
  const boostCameraFeedback = updateLocalBoostCameraFeedback(
    hudRacer,
    animationNow
  );
  trackSceneRenderer.updateBananaHazards(raceSession.bananaHazardEntityStates);
  trackSceneRenderer.updateRacers(
    createTrackSceneRacerRenderStates(racerRenderEntries)
  );

  trackSceneRenderer.render(
    width,
    height,
    pixelRatio,
    boostCameraFeedback.fovMultiplier
  );
  renderRaceOverlay(
    hudCanvas,
    context,
    racerRenderEntries,
    renderedItemPickups,
    renderedActiveItems,
    animationSeconds,
    localRacerId,
    standings,
    raceHudStatusByRacerId,
    boostCameraFeedback
  );

  if (playerRacer !== null && hudRacer !== null) {
    const shellLaunchFeedback = getShellLaunchHudFeedbackForRacer(
      playerRacer.id,
      animationSeconds
    );
    const shellLaunchHudRacer = applyShellLaunchFeedbackToHudRacer(
      hudRacer,
      shellLaunchFeedback,
      animationSeconds
    );

    drawBoostHudPanel(
      context,
      shellLaunchHudRacer,
      renderedItemPickups,
      height,
      animationSeconds,
      shellLaunchFeedback
    );
  }

  lobbyUi?.render(context, width, height);
};

function updateLocalBoostCameraFeedback(
  racer: RaceSessionRacerState | null,
  animationNow: number
): BoostCameraFovState {
  const deltaSeconds =
    lastBoostCameraFovTimestamp === null
      ? 1 / 60
      : (animationNow - lastBoostCameraFovTimestamp) / 1000;

  lastBoostCameraFovTimestamp = animationNow;
  boostCameraFovState = updateBoostCameraFovState(boostCameraFovState, {
    isBoostActive: racer !== null && createBoostVisualState(racer).isActive,
    deltaSeconds
  });

  return boostCameraFovState;
}

function getBoostParticleTrailDeltaSeconds(animationSeconds: number): number {
  const deltaSeconds =
    lastBoostParticleTrailUpdateSeconds === null
      ? 1 / 60
      : animationSeconds - lastBoostParticleTrailUpdateSeconds;

  lastBoostParticleTrailUpdateSeconds = animationSeconds;

  return deltaSeconds;
}

function updateBoostParticleTrailStates(
  racers: readonly RaceSessionRacerState[],
  deltaSeconds: number
): void {
  const visibleRacerIds = new Set<string>();

  for (const racer of racers) {
    visibleRacerIds.add(racer.id);

    const visual = createBoostVisualState(racer);
    const currentState =
      boostParticleTrailStates.get(racer.id) ??
      createDefaultBoostParticleTrailState();
    const nextState = updateBoostParticleTrailState(currentState, {
      position: racer.position,
      forward: racer.forward,
      isBoostActive: visual.isActive,
      intensity: visual.intensity,
      speedRatio: getRacerBoostTrailSpeedRatio(racer),
      deltaSeconds,
      accentColor: getRacerBoostTrailAccentColor(racer)
    });

    if (nextState.particles.length > 0) {
      boostParticleTrailStates.set(racer.id, nextState);
    } else {
      boostParticleTrailStates.delete(racer.id);
    }
  }

  for (const racerId of boostParticleTrailStates.keys()) {
    if (!visibleRacerIds.has(racerId)) {
      boostParticleTrailStates.delete(racerId);
    }
  }
}

function updateRacerSpinoutVisualStates(
  racers: readonly RaceSessionRacerState[],
  animationSeconds: number
): void {
  const visibleRacerIds = new Set<string>();

  for (const racer of racers) {
    visibleRacerIds.add(racer.id);

    const currentState =
      racerSpinoutVisualStates.get(racer.id) ??
      createDefaultRacerSpinoutVisualState();
    const nextState = updateRacerSpinoutVisualState(currentState, {
      spinoutSeconds: racer.spinoutSeconds,
      spinoutAngularVelocity: racer.spinoutAngularVelocity,
      animationSeconds
    });

    if (nextState.active) {
      racerSpinoutVisualStates.set(racer.id, nextState);
    } else {
      racerSpinoutVisualStates.delete(racer.id);
    }
  }

  for (const racerId of racerSpinoutVisualStates.keys()) {
    if (!visibleRacerIds.has(racerId)) {
      racerSpinoutVisualStates.delete(racerId);
    }
  }
}

function updateCombatNearMissFeedbacks(
  activeItems: readonly ActiveItemRenderState[],
  racers: readonly RaceSessionRacerState[],
  animationSeconds: number
): void {
  pruneRecentNearMissFeedbacks(animationSeconds);

  for (const item of activeItems) {
    if (item.type !== "shell" && item.type !== "banana") {
      continue;
    }

    const visual = createActiveCombatItemVisualState(item);

    if (!visual.isInteractable || !visual.isWorldVisible) {
      continue;
    }

    for (const racer of racers) {
      if (
        getActiveItemOwnerRacerId(item) === racer.id &&
        item.ageSeconds < COMBAT_NEAR_MISS_MIN_OWNER_AGE_SECONDS
      ) {
        continue;
      }

      const distance = getPlanarDistance(item.position, racer.position);
      const nearMiss = evaluateCombatNearMissFeedback({
        distance,
        itemRadius: item.radius,
        racerRadius: RACER_COLLISION_RADIUS,
        extraRadius: COMBAT_NEAR_MISS_EXTRA_RADIUS_BY_ITEM[item.type],
        itemArmed: visual.isArmed,
        itemActive: visual.isInteractable
      });

      if (!nearMiss.isNearMiss) {
        continue;
      }

      const itemId = getActiveRenderItemId(item);
      const feedbackKey = `${item.type}:${itemId}:${racer.id}`;
      const previousCueSeconds = recentNearMissFeedbacks.get(feedbackKey);

      if (
        previousCueSeconds !== undefined &&
        animationSeconds - previousCueSeconds < COMBAT_NEAR_MISS_REPEAT_SECONDS
      ) {
        continue;
      }

      recentNearMissFeedbacks.set(feedbackKey, animationSeconds);
      const racerToItem = normalizePlanarDirection({
        x: item.position.x - racer.position.x,
        y: 0,
        z: item.position.z - racer.position.z
      });
      const position = addTrackPoint(
        racer.position,
        scaleTrackPoint(racerToItem, Math.max(nearMiss.innerRadius, 0.1))
      );
      const localRacerId = getLocalHumanRacerId();

      registerCombatFeedbackEvent({
        key: `near-miss:${feedbackKey}:${Math.round(animationSeconds * 10)}`,
        kind: item.type === "shell" ? "shell-near-miss" : "banana-near-miss",
        itemType: item.type,
        label: "NEAR MISS",
        position,
        direction: item.velocity,
        startedAtSeconds: animationSeconds,
        intensity: 0.48 + nearMiss.closenessRatio * 0.52,
        isLocal: racer.id === localRacerId,
        playSound: racer.id === localRacerId
      });
    }
  }
}

function updateRacerRecoveryFeedbacks(
  racers: readonly RaceSessionRacerState[],
  animationSeconds: number
): void {
  const visibleRacerIds = new Set<string>();
  const localRacerId = getLocalHumanRacerId();

  for (const racer of racers) {
    visibleRacerIds.add(racer.id);

    const previous = racerCombatStatusFeedbackMemory.get(racer.id);
    const hasDisablingEffect =
      racer.stunSeconds > 0 ||
      racer.spinoutSeconds > 0 ||
      racer.hitFeedbackSeconds > 0;
    const hasRecoveryOnlyEffect =
      !hasDisablingEffect && racer.itemHitImmunitySeconds > 0;
    const shouldCueRecovery =
      hasRecoveryOnlyEffect &&
      previous?.hadDisablingEffect === true &&
      animationSeconds - previous.lastRecoveryCueAtSeconds >=
        COMBAT_RECOVERY_REPEAT_SECONDS;

    if (shouldCueRecovery) {
      registerCombatFeedbackEvent({
        key: `recovery:${racer.id}:${Math.round(animationSeconds * 10)}`,
        kind: "recovery",
        itemType: racer.lastHitItemType,
        label: "RECOVER",
        position: racer.position,
        direction: racer.forward,
        startedAtSeconds: animationSeconds,
        intensity: racer.id === localRacerId ? 1 : 0.74,
        isLocal: racer.id === localRacerId,
        playSound: racer.id === localRacerId
      });
    }

    racerCombatStatusFeedbackMemory.set(racer.id, {
      hadDisablingEffect: hasDisablingEffect,
      hadRecoveryOnlyEffect: hasRecoveryOnlyEffect,
      lastRecoveryCueAtSeconds: shouldCueRecovery
        ? animationSeconds
        : previous?.lastRecoveryCueAtSeconds ?? -COMBAT_RECOVERY_REPEAT_SECONDS
    });
  }

  for (const racerId of racerCombatStatusFeedbackMemory.keys()) {
    if (!visibleRacerIds.has(racerId)) {
      racerCombatStatusFeedbackMemory.delete(racerId);
    }
  }
}

function pruneRecentNearMissFeedbacks(nowSeconds: number): void {
  for (const [key, lastCueSeconds] of recentNearMissFeedbacks) {
    if (nowSeconds - lastCueSeconds > COMBAT_NEAR_MISS_REPEAT_SECONDS * 2) {
      recentNearMissFeedbacks.delete(key);
    }
  }
}

function getRacerSpinoutVisualRotation(state: RaceSessionRacerState): number {
  return racerSpinoutVisualStates.get(state.id)?.spinRadians ?? 0;
}

function synchronizeAuthoritativeItemHitPresentation(
  event: RaceShellHitEvent | RaceBananaHitEvent
): void {
  if (event.elapsedSeconds > raceSession.raceElapsedSeconds) {
    return;
  }

  const target = raceSession.getRacerState(event.targetRacerId);

  if (target === undefined) {
    return;
  }

  const elapsedSinceHitSeconds = Math.max(
    0,
    raceSession.raceElapsedSeconds - event.elapsedSeconds
  );

  synchronizeAuthoritativeSpinoutVisual(
    target,
    event,
    elapsedSinceHitSeconds
  );
  registerCombatHitFeedbackFromEvent(event, elapsedSinceHitSeconds);
}

function synchronizeAuthoritativeSpinoutVisual(
  target: RaceSessionRacerState,
  event: RaceShellHitEvent | RaceBananaHitEvent,
  elapsedSinceHitSeconds: number
): void {
  if (target.spinoutSeconds <= 0 || event.effect.spinoutSeconds <= 0) {
    return;
  }

  const visualState = createAuthoritativeRacerSpinoutVisualState({
    spinoutSeconds: event.effect.spinoutSeconds,
    spinoutAngularVelocity: event.effect.spinoutAngularVelocity,
    elapsedSinceSpinoutStartSeconds: elapsedSinceHitSeconds,
    animationSeconds: getCurrentAnimationSeconds()
  });

  if (visualState.active) {
    racerSpinoutVisualStates.set(target.id, visualState);
  }
}

function getRacerBoostTrailSpeedRatio(state: RaceSessionRacerState): number {
  const maxSpeed =
    state.racer.controller === "ai"
      ? Math.max(state.racer.driving.maxSpeed, 1)
      : HUMAN_BOOST_VISUAL_MAX_SPEED;

  return clampValue(state.speed / maxSpeed, 0, 1);
}

function getRacerBoostTrailAccentColor(state: RaceSessionRacerState): string {
  return state.racer.controller === "ai"
    ? state.racer.visual.accentColor
    : HUMAN_BOOST_ACCENT_COLOR;
}

function drawBoostParticleTrailMarkers(
  ctx: CanvasRenderingContext2D,
  trails: ReadonlyMap<string, BoostParticleTrailState>,
  viewport: TrackViewport
): void {
  if (trails.size <= 0) {
    return;
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  for (const trail of trails.values()) {
    for (const particle of trail.particles) {
      const lifeRatio = clampValue(
        1 - particle.ageSeconds / Math.max(particle.lifetimeSeconds, 0.001),
        0,
        1
      );
      const alpha = particle.opacity * lifeRatio * lifeRatio;

      if (alpha <= 0.01) {
        continue;
      }

      const position = projectTrackPoint(particle.position, viewport);
      const radius = particle.radiusPixels * (0.72 + lifeRatio * 0.48);

      drawBoostParticleMotionStreak(
        ctx,
        particle,
        position,
        viewport,
        alpha,
        lifeRatio
      );

      ctx.globalAlpha = alpha * 0.72;
      ctx.shadowColor = particle.accentColor;
      ctx.shadowBlur = 8 + lifeRatio * 12;
      ctx.fillStyle = particle.accentColor;
      ctx.beginPath();
      ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
      ctx.beginPath();
      ctx.arc(
        position.x,
        position.y,
        Math.max(1.4, radius * 0.3),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawBoostParticleMotionStreak(
  ctx: CanvasRenderingContext2D,
  particle: BoostParticleTrailParticle,
  headPosition: { readonly x: number; readonly y: number },
  viewport: TrackViewport,
  alpha: number,
  lifeRatio: number
): void {
  const velocityMagnitude = Math.hypot(particle.velocity.x, particle.velocity.z);

  if (velocityMagnitude <= 0.0001 || particle.streakLengthPixels <= 0) {
    return;
  }

  const streakWorldLength =
    particle.streakLengthPixels / Math.max(viewport.scale, 0.001);
  const tailPosition = projectTrackPoint(
    {
      x:
        particle.position.x +
        (particle.velocity.x / velocityMagnitude) * streakWorldLength,
      z:
        particle.position.z +
        (particle.velocity.z / velocityMagnitude) * streakWorldLength
    },
    viewport
  );
  const gradient = ctx.createLinearGradient(
    headPosition.x,
    headPosition.y,
    tailPosition.x,
    tailPosition.y
  );

  gradient.addColorStop(0, "rgba(255, 255, 255, 0.94)");
  gradient.addColorStop(0.34, particle.accentColor);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.globalAlpha = alpha * (0.72 + lifeRatio * 0.2);
  ctx.shadowColor = particle.accentColor;
  ctx.shadowBlur = particle.glowRadiusPixels * lifeRatio;
  ctx.strokeStyle = gradient;
  ctx.lineWidth = Math.max(1, particle.streakWidthPixels * lifeRatio);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(headPosition.x, headPosition.y);
  ctx.lineTo(tailPosition.x, tailPosition.y);
  ctx.stroke();
}

const scheduleRender = (): void => {
  if (applicationDisposed) {
    return;
  }

  if (scheduledRender !== null) {
    return;
  }

  scheduledRender = window.requestAnimationFrame(() => {
    scheduledRender = null;
    renderGame();
  });
};

function createNetworkedOpponentTransformMap(
  authoritativeTransforms: ReadonlyMap<string, SmoothedKartTransform> | null,
  remoteOwnedTransform: SmoothedKartTransform | null
): ReadonlyMap<string, SmoothedKartTransform> | null {
  if (authoritativeTransforms === null && remoteOwnedTransform === null) {
    return null;
  }

  const transforms = new Map<string, SmoothedKartTransform>();

  if (remoteOwnedTransform !== null) {
    transforms.set(remoteOwnedTransform.racerId, remoteOwnedTransform);
  }

  if (authoritativeTransforms !== null) {
    for (const [racerId, transform] of authoritativeTransforms) {
      transforms.set(racerId, transform);
    }
  }

  return transforms;
}

function advanceRaceControllerPathsForTick(
  localInput: RacerInputState,
  maxRemoteInputTickIndex: number,
  timestamp: number
): RaceControllerTickPlan {
  const remoteSnapshotTransforms =
    sampleRemoteSnapshotControllerTransforms(timestamp);
  const controllerPaths = createRaceControllerPathMap(
    remoteSnapshotTransforms !== null
  );

  if (hasControllerPath(controllerPaths, "local-input")) {
    applyLocalHumanInput(localInput);
  }

  if (hasControllerPath(controllerPaths, "remote-input")) {
    applyBufferedRemoteHumanInput(maxRemoteInputTickIndex);
    applyQueuedRemoteHumanInputDeltas(maxRemoteInputTickIndex);
  }

  return {
    controllerPaths,
    remoteSnapshotTransforms
  };
}

function sampleRemoteSnapshotControllerTransforms(
  timestamp: number
): ReadonlyMap<string, SmoothedKartTransform> | null {
  if (activeGuestPeerConnection === null) {
    return null;
  }

  return (
    remoteTransformSmoother?.sample(timestamp) ??
    new Map<string, SmoothedKartTransform>()
  );
}

function createRaceControllerPathMap(
  useRemoteSnapshotsForAuthoritativeRacers: boolean
): ReadonlyMap<string, RaceSessionRacerControllerPath> {
  const controllerPaths = new Map<string, RaceSessionRacerControllerPath>();
  const localRacerId = resolveLocalHumanRacerForInput()?.id ?? null;

  for (const racer of raceSession.racerStates) {
    controllerPaths.set(
      racer.id,
      getRaceControllerPathForRacer(
        racer,
        localRacerId,
        useRemoteSnapshotsForAuthoritativeRacers
      )
    );
  }

  return controllerPaths;
}

function getRaceControllerPathForRacer(
  racer: RaceSessionRacerState,
  localRacerId: string | null,
  useRemoteSnapshotsForAuthoritativeRacers: boolean
): RaceSessionRacerControllerPath {
  if (racer.controller === "ai") {
    return useRemoteSnapshotsForAuthoritativeRacers
      ? "remote-snapshot"
      : "ai-driver";
  }

  if (racer.id === localRacerId) {
    return "local-input";
  }

  return useRemoteSnapshotsForAuthoritativeRacers
    ? "remote-snapshot"
    : "remote-input";
}

function hasControllerPath(
  controllerPaths: ReadonlyMap<string, RaceSessionRacerControllerPath>,
  path: RaceSessionRacerControllerPath
): boolean {
  for (const controllerPath of controllerPaths.values()) {
    if (controllerPath === path) {
      return true;
    }
  }

  return false;
}

function applyRemoteSnapshotControllerTransforms(
  controllerPlan: RaceControllerTickPlan
): void {
  if (controllerPlan.remoteSnapshotTransforms === null) {
    return;
  }

  for (const racer of raceSession.racerStates) {
    if (controllerPlan.controllerPaths.get(racer.id) !== "remote-snapshot") {
      continue;
    }

    const transform = controllerPlan.remoteSnapshotTransforms.get(racer.id);

    if (transform !== undefined) {
      applyRemoteSnapshotTransformToRacer(racer, transform);
    }
  }
}

function applyAuthoritativePlayerReconciliationCorrection(
  deltaSeconds: number
): void {
  if (remoteAuthoritativePlayerReconciler === null) {
    return;
  }

  const localRacerId = getLocalHumanRacerId();

  if (localRacerId === null) {
    remoteAuthoritativePlayerReconciler.clear();
    return;
  }

  const racer = raceSession.getRacerState(localRacerId);

  if (racer === undefined) {
    remoteAuthoritativePlayerReconciler.clear();
    return;
  }

  const result = remoteAuthoritativePlayerReconciler.apply(
    createKartRacerTransformFromRaceState(racer),
    deltaSeconds
  );

  if (!result.active && !result.completed) {
    return;
  }

  applyReconciledAuthoritativeTransformToRacer(racer, result.transform);
}

function startAuthoritativePlayerReconciliation(
  snapshot: KartAuthoritativePlayerSnapshot
): void {
  const racer = raceSession.getRacerState(snapshot.racerId);

  if (racer === undefined) {
    return;
  }

  getRemoteAuthoritativePlayerReconciler().accept(
    snapshot,
    createKartRacerTransformFromRaceState(racer)
  );
}

function applyReconciledAuthoritativeTransformToRacer(
  racer: RaceSessionRacerState,
  transform: KartRacerTransform
): void {
  if (racer.id !== transform.racerId || racer.slotIndex !== transform.slotIndex) {
    return;
  }

  racer.position = copyTrackPoint(transform.position);
  racer.velocity = copyTrackPoint(transform.velocity);
  racer.forward = copyTrackPoint(transform.forward);
  racer.headingRadians = transform.headingRadians;
  racer.speed = transform.speed;
  refreshRacerCollisionBounds(racer);
}

function applyRemoteSnapshotTransformToRacer(
  racer: RaceSessionRacerState,
  transform: SmoothedKartTransform
): void {
  if (racer.id !== transform.racerId || racer.slotIndex !== transform.slotIndex) {
    return;
  }

  racer.position = copyTrackPoint(transform.position);
  racer.velocity = copyTrackPoint(transform.velocity);
  racer.knockbackVelocity = { x: 0, y: 0, z: 0 };
  racer.forward = copyTrackPoint(transform.forward);
  racer.headingRadians = transform.headingRadians;
  racer.speed = transform.speed;
  racer.heldItem = transform.heldItem;
  racer.boostSeconds = transform.boostSeconds;
  racer.shieldSeconds = transform.shieldSeconds;
  racer.stunSeconds = transform.stunSeconds;
  racer.spinoutSeconds = transform.spinoutSeconds;
  racer.spinoutAngularVelocity = transform.spinoutAngularVelocity;
  racer.itemHitImmunitySeconds = transform.itemHitImmunitySeconds;
  racer.hitFeedbackSeconds = transform.hitFeedbackSeconds;
  racer.lastHitItemType = transform.lastHitItemType;
  racer.itemUseCooldownSeconds = transform.itemUseCooldownSeconds;
  racer.recovering =
    transform.stunSeconds > 0 ||
    transform.spinoutSeconds > 0 ||
    racer.collisionControlSeconds > 0;
  racer.updateCount = transform.updateCount;
  refreshRacerCollisionBounds(racer);
}

function copyTrackPoint(point: TrackPoint3): TrackPoint3 {
  return {
    x: point.x,
    y: point.y,
    z: point.z
  };
}

function getPlanarDistance(left: TrackPoint3, right: TrackPoint3): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function getActiveItemOwnerRacerId(item: ActiveItemRenderState): string {
  return "owner" in item ? item.owner.racerId : item.ownerRacerId;
}

const runGameLoop = (timestamp: number): void => {
  gameLoopFrame = null;

  if (applicationDisposed) {
    return;
  }

  const deltaSeconds =
    lastFrameTimestamp === null ? 1 / 60 : (timestamp - lastFrameTimestamp) / 1000;

  lastFrameTimestamp = timestamp;
  const localInput = localKartInput.sample();
  const controllerPlan = advanceRaceControllerPathsForTick(
    localInput,
    raceSession.nextTickIndex,
    timestamp
  );
  const tickResult = raceSession.tick(deltaSeconds, {
    controllerPaths: controllerPlan.controllerPaths,
    itemPickupAuthority:
      activeGuestPeerConnection === null ? "authoritative" : "remote"
  });
  applyAuthoritativePlayerReconciliationCorrection(deltaSeconds);
  applyRemoteSnapshotControllerTransforms(controllerPlan);
  registerCombatFeedbacksFromTick(tickResult);
  registerShellProjectileImpactEffectsFromHits(tickResult.shellHits);
  emitAuthoritativeItemUseEvents(tickResult);
  emitAuthoritativeItemCollisionOutcomeEvents(tickResult);
  emitAuthoritativeMultiplayerEffectEvents(tickResult);
  emitAuthoritativeBananaSpawnEvents(tickResult);
  emitAuthoritativeBananaCollisionEvents(tickResult);
  emitAuthoritativeBananaRemovalEvents(tickResult);
  emitAuthoritativePlayerSnapshots(tickResult);
  if (!emitAuthoritativeRaceStateSnapshot(tickResult)) {
    emitAuthoritativeTransformSnapshot(tickResult);
  }
  emitLocalOwnedTransformSnapshot(tickResult);
  emitLocalRemoteInputDelta(localInput, tickResult);
  emitLocalInputSnapshot(localInput, tickResult);
  renderGame();
  requestGameLoopFrame();
};

function requestGameLoopFrame(): void {
  if (applicationDisposed || gameLoopFrame !== null) {
    return;
  }

  gameLoopFrame = window.requestAnimationFrame(runGameLoop);
}

function registerCombatFeedbacksFromTick(
  tickResult: RaceSessionTickResult
): void {
  registerShellLaunchFeedbacksFromTick(tickResult);
  registerBananaDropFeedbacksFromTick(tickResult);
  registerCombatHitFeedbacksFromTick(tickResult);
}

function registerShellLaunchFeedbacksFromTick(
  tickResult: RaceSessionTickResult
): void {
  for (const action of tickResult.itemUseActions) {
    if (action.itemType !== "shell") {
      continue;
    }

    registerShellLaunchFeedbackFromAction(action);
  }
}

function registerBananaDropFeedbacksFromTick(
  tickResult: RaceSessionTickResult
): void {
  for (const action of tickResult.itemUseActions) {
    if (action.itemType !== "banana") {
      continue;
    }

    registerBananaDropFeedbackFromAction(action);
  }
}

function registerCombatHitFeedbacksFromTick(
  tickResult: RaceSessionTickResult
): void {
  for (const hit of tickResult.shellHits) {
    registerCombatHitFeedbackFromEvent(hit, 0);
  }

  for (const hit of tickResult.bananaHits) {
    registerCombatHitFeedbackFromEvent(hit, 0);
  }
}

function registerShellLaunchFeedbackFromAction(
  action: RaceItemUseAction
): void {
  const racer = raceSession.getRacerState(action.racerId);

  if (racer === undefined) {
    return;
  }

  const nowSeconds = getCurrentAnimationSeconds();
  const activeShell =
    action.activeItemId === null
      ? null
      : findActiveShellById(action.activeItemId);
  const direction = activeShell?.velocity ?? racer.forward;
  const origin =
    activeShell !== null && "spawnPosition" in activeShell
      ? activeShell.spawnPosition
      : createShellLaunchOriginFromRacer(racer);
  const localRacerId = getLocalHumanRacerId();
  const isLocal = action.racerId === localRacerId;
  const hasRecentLocalCue =
    isLocal &&
    getShellLaunchHudFeedbackForRacer(action.racerId, nowSeconds) !== null;

  registerShellLaunchFeedback({
    key: action.activeItemId ?? action.actionId,
    racerId: action.racerId,
    itemId: action.activeItemId,
    origin,
    direction,
    startedAtSeconds: nowSeconds,
    isLocal,
    playSound: isLocal && !hasRecentLocalCue
  });
}

function registerBananaDropFeedbackFromAction(action: RaceItemUseAction): void {
  const racer = raceSession.getRacerState(action.racerId);

  if (racer === undefined) {
    return;
  }

  const nowSeconds = getCurrentAnimationSeconds();
  const activeBanana =
    action.activeItemId === null
      ? null
      : findActiveBananaById(action.activeItemId);
  const position = activeBanana?.position ?? racer.position;
  const direction = activeBanana?.velocity ?? scaleTrackPoint(racer.forward, -1);
  const isLocal = action.racerId === getLocalHumanRacerId();
  const hasRecentLocalCue =
    isLocal &&
    hasActiveCombatFeedbackEventForKeyPrefix(
      `banana-drop:local:${racer.id}:`,
      nowSeconds
    );

  registerCombatFeedbackEvent({
    key: `banana-drop:${action.activeItemId ?? action.actionId}`,
    kind: "banana-drop",
    itemType: "banana",
    label: "BANANA",
    position,
    direction,
    startedAtSeconds: nowSeconds,
    isLocal,
    playSound: isLocal && !hasRecentLocalCue
  });
}

function registerCombatHitFeedbackFromEvent(
  event: RaceShellHitEvent | RaceBananaHitEvent,
  elapsedSinceHitSeconds: number
): void {
  const blockedByShield = event.effect.blockedByShield === true;

  if (!blockedByShield && event.effect.hitFeedbackSeconds <= elapsedSinceHitSeconds) {
    return;
  }

  const target = raceSession.getRacerState(event.targetRacerId);
  const localRacerId = getLocalHumanRacerId();
  const kind = event.itemType === "shell" ? "shell-hit" : "banana-hit";
  const direction =
    getPlanarVectorMagnitude(event.impact.normal) > 0.0001
      ? event.impact.normal
      : target?.forward ?? { x: 0, y: 0, z: 1 };
  const label = blockedByShield ? "SHIELD" : "HIT";

  registerCombatFeedbackEvent({
    key: `hit:${event.eventId}`,
    kind,
    itemType: event.itemType,
    label,
    position: event.impact.position,
    direction,
    startedAtSeconds: getCurrentAnimationSeconds() - elapsedSinceHitSeconds,
    intensity: event.targetRacerId === localRacerId ? 1 : 0.82,
    isLocal: event.targetRacerId === localRacerId,
    playSound: event.targetRacerId === localRacerId
  });
}

function registerShellLaunchFeedbackFromItemUseEvent(
  event: KartItemUseEventMessage
): void {
  const nowSeconds = getCurrentAnimationSeconds();
  const authoritativeTransform =
    remoteTransformSmoother?.sample(performance.now()).get(event.racerId);
  const racer = raceSession.getRacerState(event.racerId);
  const direction = normalizePlanarDirection(
    authoritativeTransform?.forward ?? racer?.forward ?? { x: 0, y: 0, z: 1 }
  );
  const origin =
    authoritativeTransform === undefined
      ? racer === undefined
        ? { x: 0, y: 0, z: 0 }
        : createShellLaunchOriginFromRacer(racer)
      : createShellLaunchOrigin(authoritativeTransform.position, direction);

  registerShellLaunchFeedback({
    key: event.activeItemId ?? event.actionId,
    racerId: event.racerId,
    itemId: event.activeItemId,
    origin,
    direction,
    startedAtSeconds: nowSeconds,
    isLocal: event.racerId === getLocalHumanRacerId(),
    playSound: false
  });
}

function registerShellLaunchFeedbackFromEffectEvent(
  event: KartShellLaunchEffectEventMessage
): void {
  const nowSeconds = getCurrentAnimationSeconds();
  const direction = normalizePlanarDirection(event.velocity);

  registerShellLaunchFeedback({
    key: event.eventId,
    racerId: event.source.racerId,
    itemId: event.shellId,
    origin: event.position,
    direction,
    startedAtSeconds: nowSeconds,
    isLocal: event.source.racerId === getLocalHumanRacerId(),
    playSound: false
  });
}

function findActiveShellById(itemId: string): ActiveRaceItemState | null {
  return (
    raceSession.activeItemStates.find(
      (item) => item.type === "shell" && item.id === itemId
    ) ?? null
  );
}

function findActiveBananaById(itemId: string): ActiveRaceItemState | null {
  return (
    raceSession.activeItemStates.find(
      (item) => item.type === "banana" && item.id === itemId
    ) ?? null
  );
}

const signalingClient = new RoomSignalingClient({
  onClose: (event) => {
    if (!intentionalSignalingClose && !hasOpenDataChannel()) {
      handleFatalConnectionLoss(getSignalingCloseMessage(event), {
        closeSignaling: false
      });
    }

    intentionalSignalingClose = false;
  },
  onError: () => {
    if (!hasOpenDataChannel()) {
      handleFatalConnectionLoss("Signaling server unavailable");
    }
  },
  onInvalidMessage: () => {
    if (!hasOpenDataChannel()) {
      handleFatalConnectionLoss("Invalid signaling server message");
    }
  },
  onMessage: (message) => {
    handleSignalingMessage(message);
  }
});

const closeSignalingRoom = (): void => {
  const activeRoomId = multiplayerConnectionState.state.roomId;
  const activePeerId = localSignalingPeerId;

  if (activeRoomId !== null && activePeerId !== null) {
    try {
      signalingClient.tryLeaveRoom({
        roomCode: activeRoomId,
        peerId: activePeerId
      });
    } catch {
      // Socket close below still triggers server-side room cleanup.
    }
  }

  closePeerConnections();
  resetRaceSession();
  localSignalingPeerId = null;
  multiplayerConnectionState.reset();
  closeSignalingClientSilently();
};

function teardownApplication(): void {
  if (applicationDisposed) {
    return;
  }

  applicationDisposed = true;

  if (scheduledRender !== null) {
    window.cancelAnimationFrame(scheduledRender);
    scheduledRender = null;
  }

  if (gameLoopFrame !== null) {
    window.cancelAnimationFrame(gameLoopFrame);
    gameLoopFrame = null;
  }

  window.removeEventListener("resize", scheduleRender);
  window.removeEventListener("pagehide", teardownApplication);
  disposeSpinoutVerificationHooks?.();
  disposeSpinoutVerificationHooks = null;
  disposeLocalKartInput();
  disposeShellLaunchAudioUnlock();
  localKartInput.reset();
  closeSignalingRoom();
  closePeerConnections();
  lobbyUi?.dispose();
  lobbyUi = null;
  trackSceneRenderer.dispose();

  const audioContext = shellLaunchAudioContext;
  shellLaunchAudioContext = null;

  if (audioContext !== null && audioContext.state !== "closed") {
    void audioContext.close().catch(() => undefined);
  }
}

const hostSignalingRoom = (
  roomCode: string,
  peerId: string,
  displayName: string
): void => {
  closePeerConnections();
  resetRaceSession();
  localSignalingPeerId = peerId;
  applyMultiplayerConnectionEvent(
    {
      type: "start-host",
      roomId: roomCode,
      localPeerId: peerId,
      displayName,
      message: "Creating signaling room"
    },
    "connecting"
  );

  void signalingClient
    .createRoom({ roomCode, peerId, displayName })
    .catch((error: unknown) => {
      handleFatalConnectionLoss(
        getErrorMessage(error, "Unable to create signaling room")
      );
    });
};

const joinSignalingRoom = (
  roomCode: string,
  peerId: string,
  displayName: string
): void => {
  closePeerConnections();
  resetRaceSession();
  localSignalingPeerId = peerId;
  applyMultiplayerConnectionEvent(
    {
      type: "start-join",
      roomId: roomCode,
      localPeerId: peerId,
      displayName,
      message: `Joining room ${roomCode}`
    },
    "connecting"
  );

  void signalingClient
    .joinRoom({ roomCode, peerId, displayName })
    .catch((error: unknown) => {
      handleJoinRejected(getErrorMessage(error, "Unable to join signaling room"));
    });
};

lobbyUi = new LobbyUi(hudCanvas, scheduleRender, {
  onHostRoom: (request) => {
    hostSignalingRoom(request.roomCode, request.peerId, request.displayName);
  },
  onJoinRoom: (request) => {
    joinSignalingRoom(request.roomCode, request.peerId, request.displayName);
  },
  onLeaveRoom: closeSignalingRoom
});
disposeSpinoutVerificationHooks = installSpinoutVerificationHooks(window, {
  getRaceSession: () => raceSession,
  getLocalRacerId: getLocalHumanRacerId,
  isAuthoritative: () => activeGuestPeerConnection === null,
  onChange: () => {
    resetRacerSpinoutVisualStates();
    scheduleRender();
  },
  log: (message, ...data) => {
    console.info(message, ...data);
  }
});
renderGame();
requestGameLoopFrame();
window.addEventListener("resize", scheduleRender);
window.addEventListener("pagehide", teardownApplication);

function handleSignalingMessage(message: SignalingMessage): void {
  if (isStaleSignalingMessage(message)) {
    return;
  }

  switch (message.type) {
    case SIGNALING_MESSAGE_TYPES.ROOM_CREATED:
      handleRoomCreated(message.snapshot);
      return;
    case SIGNALING_MESSAGE_TYPES.ROOM_JOINED:
      handleJoinAccepted(message.snapshot);
      return;
    case SIGNALING_MESSAGE_TYPES.ROOM_JOIN_REJECTED:
      handleJoinRejected(
        formatSignalingFailureMessage(message.message, message.retryable)
      );
      return;
    case SIGNALING_MESSAGE_TYPES.ROOM_LEFT:
      return;
    case SIGNALING_MESSAGE_TYPES.ROOM_STATE:
      return;
    case SIGNALING_MESSAGE_TYPES.PEER_JOINED:
      handlePeerJoined(message.peer, message.snapshot);
      return;
    case SIGNALING_MESSAGE_TYPES.PEER_LEFT:
      handlePeerLeft(message.peerId, message.snapshot);
      return;
    case SIGNALING_MESSAGE_TYPES.SIGNALING_ERROR:
      handleFatalConnectionLoss(
        formatSignalingFailureMessage(message.message, message.retryable)
      );
      return;
    case SIGNALING_MESSAGE_TYPES.SDP_OFFER:
    case SIGNALING_MESSAGE_TYPES.SDP_ANSWER:
    case SIGNALING_MESSAGE_TYPES.ICE_CANDIDATE:
      void handleWebRtcSignalingMessage(message).catch((error: unknown) => {
        handlePeerTransportFailed(getErrorMessage(error, "WebRTC signaling failed"));
      });
      return;
    case SIGNALING_MESSAGE_TYPES.ROOM_CREATE:
    case SIGNALING_MESSAGE_TYPES.ROOM_JOIN:
    case SIGNALING_MESSAGE_TYPES.ROOM_LEAVE:
    case SIGNALING_MESSAGE_TYPES.ROOM_STATE_REQUEST:
      return;
  }
}

function handleRoomCreated(snapshot: SignalingRoomSnapshot): void {
  resetRaceSession();
  applyMultiplayerConnectionEvent({
    type: "host-ready",
    roomId: snapshot.roomId,
    message: `Room ${snapshot.roomId} ready`
  });
  lobbyUi?.confirmHostedRoom(snapshot.roomId);

  const plan = createLocalWebRtcPeerPlan(snapshot);

  if (plan === null) {
    return;
  }

  activeWebRtcPeerPlan = plan;

  if (plan.readiness === "waiting-for-client") {
    return;
  }

  const guestPeer =
    plan.remotePeerId === null
      ? undefined
      : findRoomPeerById(snapshot.peers, plan.remotePeerId);

  if (plan.localRole !== "host" || !plan.createsOffer || guestPeer === undefined) {
    lobbyUi?.failConnection("Hosted room snapshot did not include guest peer.");
    return;
  }

  if (!initializeRaceSessionFromRoomSnapshot(snapshot)) {
    closeSignalingClientSilently();
    localSignalingPeerId = null;
    return;
  }

  applyMultiplayerConnectionEvent({
    type: "remote-peer-joined",
    remotePeerId: guestPeer.peerId,
    message: `${guestPeer.displayName} joined`
  });
  lobbyUi?.markPeerJoined(guestPeer.peerId, guestPeer.displayName);
  startHostPeerConnection(plan);
}

function handleJoinAccepted(snapshot: SignalingRoomSnapshot): void {
  closePeerConnections();

  if (!initializeRaceSessionFromRoomSnapshot(snapshot)) {
    closeSignalingClientSilently();
    localSignalingPeerId = null;
    return;
  }

  lobbyUi?.confirmJoinedRoom(snapshot);
  const plan = createLocalWebRtcPeerPlan(snapshot);

  if (plan === null) {
    return;
  }

  activeWebRtcPeerPlan = plan;

  if (plan.localRole !== "client" || plan.remotePeerId === null) {
    handlePeerTransportFailed("Joined room did not assign this peer as WebRTC client.");
    return;
  }

  applyMultiplayerConnectionEvent({
    type: "join-accepted",
    roomId: snapshot.roomId,
    remotePeerId: plan.remotePeerId,
    message: `Joined room ${snapshot.roomId}`
  });
  startGuestPeerConnection(plan);
}

function handleJoinRejected(message: string): void {
  closePeerConnections();
  resetRaceSession();
  localSignalingPeerId = null;
  const state = multiplayerConnectionState.dispatch({
    type: "error",
    reason: message
  });
  closeSignalingClientSilently();
  lobbyUi?.rejectJoin(message, state);
}

function handlePeerJoined(
  peer: SignalingRoomPeer,
  snapshot: SignalingRoomSnapshot
): void {
  applyMultiplayerConnectionEvent({
    type: "remote-peer-joined",
    remotePeerId: peer.peerId,
    message: `${peer.displayName} joined`
  });
  lobbyUi?.markPeerJoined(peer.peerId, peer.displayName);

  if (!initializeRaceSessionFromRoomSnapshot(snapshot)) {
    closeSignalingClientSilently();
    localSignalingPeerId = null;
    return;
  }

  const plan = createLocalWebRtcPeerPlan(snapshot);

  if (plan === null) {
    return;
  }

  if (
    plan.localRole !== "host" ||
    !plan.createsOffer ||
    plan.remotePeerId !== peer.peerId
  ) {
    handlePeerTransportFailed("Peer join did not match deterministic host WebRTC role.");
    return;
  }

  startHostPeerConnection(plan);
}

function handlePeerLeft(
  peerId: SignalingPeerId,
  snapshot: SignalingRoomSnapshot | undefined
): void {
  closePeerConnections();
  resetRaceSession();

  if (snapshot !== undefined && snapshot.hostPeerId === localSignalingPeerId) {
    applyMultiplayerConnectionEvent({
      type: "disconnected",
      reason: "Peer disconnected"
    });
    lobbyUi?.markPeerLeft(peerId, "Peer disconnected; room is open");
    applyMultiplayerConnectionEvent({
      type: "host-ready",
      roomId: snapshot.roomId,
      message: `Room ${snapshot.roomId} ready`
    });
    return;
  }

  localSignalingPeerId = null;
  const state = multiplayerConnectionState.dispatch({
    type: "disconnected",
    reason: "Host disconnected"
  });
  closeSignalingClientSilently();
  lobbyUi?.endActiveLobby("Host disconnected; lobby closed", "disconnected", state);
}

function startHostPeerConnection(plan: WebRtcRacePeerPlan): void {
  const remotePeerId = plan.remotePeerId;

  if (localSignalingPeerId === null || localSignalingPeerId !== plan.localPeerId) {
    lobbyUi?.failConnection("Host peer id is unavailable");
    return;
  }

  if (
    plan.localRole !== "host" ||
    !plan.createsOffer ||
    remotePeerId === null ||
    plan.readiness !== "ready"
  ) {
    handlePeerTransportFailed("Only the deterministic room host may create WebRTC offers.");
    return;
  }

  closePeerConnections();
  activeWebRtcPeerPlan = plan;
  const generation = createPeerConnectionGeneration();

  const connection = new HostPeerConnection({
    roomId: plan.roomId,
    hostPeerId: localSignalingPeerId,
    remotePeerId,
    dataChannelOptions: createLowLatencyDataChannelOptions(),
    onSignal: sendSignalingMessage,
    onDataChannelOpen: () => {
      if (isCurrentPeerConnectionGeneration(generation)) {
        applyMultiplayerConnectionEvent({
          type: "connected",
          transport: "data-channel",
          remotePeerId,
          message: "WebRTC data channel open"
        });
      }
    },
    onDataChannelClose: () => {
      if (isCurrentPeerConnectionGeneration(generation)) {
        handlePeerTransportLost("WebRTC data channel closed");
      }
    },
    onDataChannelError: (error) => {
      if (isCurrentPeerConnectionGeneration(generation)) {
        handlePeerTransportFailed(
          getErrorMessage(error, "WebRTC data channel error")
        );
      }
    },
    onDataChannelMessage: (data) => {
      if (isCurrentPeerConnectionGeneration(generation)) {
        handleGameplayDataChannelMessage(data, remotePeerId);
      }
    },
    onConnectionStateChange: (state) => {
      if (isCurrentPeerConnectionGeneration(generation)) {
        updateWebRtcConnectionStatus(state);
      }
    },
    onIceConnectionStateChange: (state) => {
      if (isCurrentPeerConnectionGeneration(generation)) {
        updateWebRtcIceStatus(state);
      }
    }
  });
  activeHostPeerConnection = connection;
  applyMultiplayerConnectionEvent({
    type: "connecting",
    transport: "webrtc",
    remotePeerId,
    message: "Sending WebRTC offer"
  });

  void connection
    .start()
    .then(() => {
      if (isCurrentPeerConnectionGeneration(generation)) {
        applyMultiplayerConnectionEvent({
          type: "connecting",
          transport: "webrtc",
          remotePeerId,
          message: "Exchanging WebRTC ICE"
        });
      }
    })
    .catch((error: unknown) => {
      if (isCurrentPeerConnectionGeneration(generation)) {
        activeHostPeerConnection = null;
        handlePeerTransportFailed(
          getErrorMessage(error, "Unable to start host WebRTC peer")
        );
      }
    });
}

function startGuestPeerConnection(plan: WebRtcRacePeerPlan): void {
  const hostPeerId = plan.remotePeerId;

  if (localSignalingPeerId === null || localSignalingPeerId !== plan.localPeerId) {
    lobbyUi?.failConnection("Guest peer id is unavailable");
    return;
  }

  if (
    plan.localRole !== "client" ||
    plan.createsOffer ||
    hostPeerId === null ||
    plan.readiness !== "ready"
  ) {
    handlePeerTransportFailed("Only the deterministic room client may answer WebRTC offers.");
    return;
  }

  closePeerConnections();
  activeWebRtcPeerPlan = plan;
  const generation = createPeerConnectionGeneration();

  const connection = new GuestPeerConnection({
    roomId: plan.roomId,
    guestPeerId: localSignalingPeerId,
    hostPeerId,
    onSignal: sendSignalingMessage,
    onDataChannelOpen: () => {
      if (isCurrentPeerConnectionGeneration(generation)) {
        applyMultiplayerConnectionEvent({
          type: "connected",
          transport: "data-channel",
          remotePeerId: hostPeerId,
          message: "WebRTC data channel open"
        });
      }
    },
    onDataChannelClose: () => {
      if (isCurrentPeerConnectionGeneration(generation)) {
        handlePeerTransportLost("WebRTC data channel closed");
      }
    },
    onDataChannelError: (error) => {
      if (isCurrentPeerConnectionGeneration(generation)) {
        handlePeerTransportFailed(
          getErrorMessage(error, "WebRTC data channel error")
        );
      }
    },
    onDataChannelMessage: (data) => {
      if (isCurrentPeerConnectionGeneration(generation)) {
        handleGameplayDataChannelMessage(data, hostPeerId);
      }
    },
    onConnectionStateChange: (state) => {
      if (isCurrentPeerConnectionGeneration(generation)) {
        updateWebRtcConnectionStatus(state);
      }
    },
    onIceConnectionStateChange: (state) => {
      if (isCurrentPeerConnectionGeneration(generation)) {
        updateWebRtcIceStatus(state);
      }
    }
  });
  activeGuestPeerConnection = connection;
  applyMultiplayerConnectionEvent({
    type: "connecting",
    transport: "webrtc",
    remotePeerId: hostPeerId,
    message: "Waiting for WebRTC offer"
  });
}

async function handleWebRtcSignalingMessage(message: SignalingMessage): Promise<void> {
  if (message.type === SIGNALING_MESSAGE_TYPES.SDP_OFFER) {
    const plan = activeWebRtcPeerPlan;

    if (
      plan === null ||
      !canAcceptWebRtcOfferForPeer(plan, message.senderId, message.recipientId)
    ) {
      throw new Error("Inbound WebRTC offer does not match the deterministic client role.");
    }

    if (activeGuestPeerConnection === null) {
      startGuestPeerConnectionFromOffer(message, plan);
    }
  }

  let accepted = false;

  if (activeHostPeerConnection !== null) {
    accepted = await activeHostPeerConnection.acceptRemoteSignal(message);
  }

  if (!accepted && activeGuestPeerConnection !== null) {
    accepted = await activeGuestPeerConnection.acceptRemoteSignal(message);
  }

  if (!accepted) {
    throw new Error("WebRTC signaling message did not match the active peer connection.");
  }

  if (message.type === SIGNALING_MESSAGE_TYPES.SDP_OFFER) {
    applyMultiplayerConnectionEvent({
      type: "connecting",
      transport: "webrtc",
      remotePeerId: message.senderId,
      message: "Sent WebRTC answer"
    });
    return;
  }

  if (message.type === SIGNALING_MESSAGE_TYPES.SDP_ANSWER) {
    applyMultiplayerConnectionEvent({
      type: "connecting",
      transport: "webrtc",
      remotePeerId: message.senderId,
      message: "Received WebRTC answer"
    });
  }
}

function startGuestPeerConnectionFromOffer(
  message: SdpOfferSignalingMessage,
  plan: WebRtcRacePeerPlan
): void {
  if (message.roomId !== plan.roomId || message.senderId !== plan.remotePeerId) {
    throw new Error("Inbound WebRTC offer does not match the active room peer plan.");
  }

  startGuestPeerConnection(plan);
}

function createLocalWebRtcPeerPlan(
  snapshot: SignalingRoomSnapshot
): WebRtcRacePeerPlan | null {
  if (localSignalingPeerId === null) {
    handlePeerTransportFailed("Local peer id is unavailable for WebRTC role assignment.");
    return null;
  }

  try {
    return createWebRtcRacePeerPlan(snapshot, localSignalingPeerId);
  } catch (error) {
    handlePeerTransportFailed(
      getErrorMessage(error, "Unable to assign deterministic WebRTC peer roles")
    );
    return null;
  }
}

function sendSignalingMessage(message: SignalingMessage): void {
  try {
    signalingClient.send(message);
  } catch (error) {
    handlePeerTransportFailed(getErrorMessage(error, "Unable to send WebRTC signal"));
    throw error;
  }
}

function isStaleSignalingMessage(message: SignalingMessage): boolean {
  const activeRoomId = multiplayerConnectionState.state.roomId;
  const activePeerId = localSignalingPeerId;

  if (activeRoomId === null || activePeerId === null) {
    return true;
  }

  if (message.roomId !== activeRoomId) {
    return true;
  }

  return (
    message.recipientId !== undefined && message.recipientId !== activePeerId
  );
}

function formatSignalingFailureMessage(
  message: string,
  retryable: boolean
): string {
  return retryable ? `${message} Retry is allowed.` : message;
}

function handlePeerTransportLost(message: string): void {
  closePeerConnections();
  resetRaceSession();
  localSignalingPeerId = null;
  const state = multiplayerConnectionState.dispatch({
    type: "disconnected",
    reason: message,
    message: `${message}; lobby closed`
  });
  closeSignalingClientSilently();
  lobbyUi?.endActiveLobby(state.message, "disconnected", state);
}

function handlePeerTransportFailed(message: string): void {
  closePeerConnections();
  resetRaceSession();
  localSignalingPeerId = null;
  const state = multiplayerConnectionState.dispatch({
    type: "failed",
    reason: message,
    message: `${message}; lobby closed`
  });
  closeSignalingClientSilently();
  lobbyUi?.endActiveLobby(state.message, "error", state);
}

function handleFatalConnectionLoss(
  message: string,
  options: { readonly closeSignaling?: boolean } = {}
): void {
  closePeerConnections();
  resetRaceSession();
  localSignalingPeerId = null;
  const state = multiplayerConnectionState.dispatch({
    type: "error",
    reason: message
  });

  if (options.closeSignaling !== false) {
    closeSignalingClientSilently();
  }

  lobbyUi?.endActiveLobby(state.message, "error", state);
}

function closeSignalingClientSilently(): void {
  if (signalingClient.isActive) {
    intentionalSignalingClose = true;
  }

  signalingClient.close();
  intentionalSignalingClose = false;
}

function closePeerConnections(): void {
  const hostConnection = activeHostPeerConnection;
  const guestConnection = activeGuestPeerConnection;
  const hadPeerConnection = hostConnection !== null || guestConnection !== null;

  activeHostPeerConnection = null;
  activeGuestPeerConnection = null;
  activeWebRtcPeerPlan = null;
  resetLocalInputSnapshotEmitter();
  resetLocalRemoteInputDeltaEmitter();
  resetRemoteInputSnapshotBuffer();
  resetRemoteInputDeltaQueues();
  resetLocalTransformSnapshotEmitter();
  resetLocalOwnedTransformSnapshotEmitter();
  resetRemoteOwnedTransformSmoother();
  resetRemoteTransformSmoother();
  resetLocalItemUseEventEmitter();
  resetLocalMultiplayerEffectEventEmitter();
  resetRemoteMultiplayerEffectEventBuffer();
  resetLocalRaceStateSnapshotEmitter();
  resetLocalAuthoritativePlayerSnapshotEmitters();
  resetRemoteAuthoritativePlayerSnapshotSynchronizer();
  resetRemoteRaceStateSnapshotSynchronizer();
  resetAuthoritativeRaceStateSnapshot();
  resetReplicatedPickupCollections();
  resetReplicatedBoostActivations();
  resetReplicatedShellHits();
  resetAuthoritativeItemCollisionOutcomeEmissions();
  resetReplicatedBananaSpawns();
  resetReplicatedBananaCollisionEvents();
  resetReplicatedBananaRemovalEvents();
  resetMultiplayerEffectEventState();
  resetAuthoritativeBananaSpawnRenderEvents();
  resetAuthoritativeBananaRemovalRenderEvents();
  resetReplicatedBananaHits();
  resetShellLaunchFeedbacks();
  resetCombatFeedbackEvents();
  resetShellProjectileRemovalEffects();
  resetBoostParticleTrails();
  resetRacerSpinoutVisualStates();

  if (hadPeerConnection) {
    createPeerConnectionGeneration();
  }

  hostConnection?.close();
  guestConnection?.close();
}

function resetRaceSession(): void {
  raceSession.clearActiveBananaHazardsForRaceReset();
  raceSession = createRaceSession();
  trackSceneRenderer.updateBananaHazards([]);
  resetLocalInputSnapshotEmitter();
  resetLocalRemoteInputDeltaEmitter();
  resetRemoteInputSnapshotBuffer();
  resetRemoteInputDeltaQueues();
  resetLocalTransformSnapshotEmitter();
  resetLocalOwnedTransformSnapshotEmitter();
  resetRemoteOwnedTransformSmoother();
  resetRemoteTransformSmoother();
  resetLocalItemUseEventEmitter();
  resetLocalMultiplayerEffectEventEmitter();
  resetRemoteMultiplayerEffectEventBuffer();
  resetLocalRaceStateSnapshotEmitter();
  resetLocalAuthoritativePlayerSnapshotEmitters();
  resetRemoteAuthoritativePlayerSnapshotSynchronizer();
  resetRemoteRaceStateSnapshotSynchronizer();
  resetAuthoritativeRaceStateSnapshot();
  resetReplicatedPickupCollections();
  resetReplicatedBoostActivations();
  resetReplicatedShellHits();
  resetAuthoritativeItemCollisionOutcomeEmissions();
  resetReplicatedBananaSpawns();
  resetReplicatedBananaCollisionEvents();
  resetReplicatedBananaRemovalEvents();
  resetMultiplayerEffectEventState();
  resetAuthoritativeBananaSpawnRenderEvents();
  resetAuthoritativeBananaRemovalRenderEvents();
  resetReplicatedBananaHits();
  resetShellLaunchFeedbacks();
  resetCombatFeedbackEvents();
  resetShellProjectileRemovalEffects();
  resetBoostParticleTrails();
  resetRacerSpinoutVisualStates();
  lastFrameTimestamp = null;
  scheduleRender();
}

function initializeRaceSessionFromRoomSnapshot(
  snapshot: SignalingRoomSnapshot
): boolean {
  try {
    const humanRacers = createHumanRaceStartRacersFromRoomSnapshot(snapshot, {
      allowSingleHuman: false
    });

    if (humanRacers.length !== MAX_HUMAN_RACERS_PER_LOBBY) {
      lobbyUi?.failConnection(
        `Race start requires ${MAX_HUMAN_RACERS_PER_LOBBY} human racers.`
      );
      return false;
    }

    const roster = createMultiplayerRaceStartRoster(humanRacers);
    const nextRaceSession = createRaceSessionFromStartRoster(roster, {
      racerTargetRegistryOptions: {
        localPeerId: localSignalingPeerId
      }
    });

    if (
      nextRaceSession.racerStates.length !== RACE_CAPACITY ||
      nextRaceSession.humanRacerStates.length !== humanRacers.length ||
      nextRaceSession.aiRacerStates.length !== AI_RACER_SLOT_COUNT
    ) {
      lobbyUi?.failConnection("Race roster did not initialize all four racers.");
      return false;
    }

    raceSession = nextRaceSession;
    resetShellLaunchFeedbacks();
    resetCombatFeedbackEvents();
    resetShellProjectileRemovalEffects();
    resetBoostParticleTrails();
    resetRacerSpinoutVisualStates();
    lastFrameTimestamp = null;
    scheduleRender();
    return true;
  } catch (error) {
    lobbyUi?.failConnection(
      getErrorMessage(error, "Unable to initialize race roster")
    );
    return false;
  }
}

function findRoomPeerById(
  peers: readonly SignalingRoomPeer[],
  peerId: SignalingPeerId
): SignalingRoomPeer | undefined {
  return peers.find((peer) => peer.peerId === peerId);
}

function createPeerConnectionGeneration(): number {
  peerConnectionGeneration += 1;
  return peerConnectionGeneration;
}

function isCurrentPeerConnectionGeneration(generation: number): boolean {
  return generation === peerConnectionGeneration;
}

function applyMultiplayerConnectionEvent(
  event: MultiplayerConnectionEvent,
  statusOverride?: LobbyConnectionStatus
): MultiplayerConnectionState {
  const state = multiplayerConnectionState.dispatch(event);
  lobbyUi?.applyConnectionState(
    state,
    statusOverride ?? getLobbyConnectionStatusForMultiplayerState(state),
    state.message
  );
  return state;
}

function getSignalingCloseMessage(event: CloseEvent): string {
  const reason = event.reason.trim();

  if (reason.length > 0) {
    return reason;
  }

  if (event.code !== 1000 && event.code !== 1005) {
    return `Signaling server disconnected with code ${event.code}`;
  }

  return "Signaling server disconnected";
}

function getLobbyConnectionStatusForMultiplayerState(
  state: MultiplayerConnectionState
): LobbyConnectionStatus {
  switch (state.phase) {
    case MULTIPLAYER_CONNECTION_PHASES.IDLE:
      return "offline";
    case MULTIPLAYER_CONNECTION_PHASES.HOST:
      return "waiting-for-peer";
    case MULTIPLAYER_CONNECTION_PHASES.JOIN:
    case MULTIPLAYER_CONNECTION_PHASES.CONNECTING:
      return "connecting";
    case MULTIPLAYER_CONNECTION_PHASES.CONNECTED:
      return "connected";
    case MULTIPLAYER_CONNECTION_PHASES.DISCONNECTED:
      return "disconnected";
    case MULTIPLAYER_CONNECTION_PHASES.FAILED:
    case MULTIPLAYER_CONNECTION_PHASES.ERROR:
      return "error";
    case MULTIPLAYER_CONNECTION_PHASES.CLOSED:
      return "offline";
  }
}

function hasOpenDataChannel(): boolean {
  return (
    activeHostPeerConnection?.channel?.readyState === "open" ||
    activeGuestPeerConnection?.channel?.readyState === "open"
  );
}

function applyLocalHumanInput(input: RacerInputState): void {
  const racer = resolveLocalHumanRacerForInput();

  if (racer === null) {
    return;
  }

  registerImmediateLocalItemUseFeedback(input, racer);
  raceSession.setHumanInput(racer.id, input);
}

function registerImmediateLocalItemUseFeedback(
  input: RacerInputState,
  racer: RaceSessionRacerState
): void {
  registerImmediateLocalShellLaunchFeedback(input, racer);
  registerImmediateLocalBananaDropFeedback(input, racer);
}

function registerImmediateLocalShellLaunchFeedback(
  input: RacerInputState,
  racer: RaceSessionRacerState
): void {
  if (!input.useItem || racer.progress.finished) {
    return;
  }

  const nowMilliseconds = performance.now();
  const authoritativeTransform =
    remoteTransformSmoother?.sample(nowMilliseconds).get(racer.id);
  const heldItem = authoritativeTransform?.heldItem ?? racer.heldItem;
  const itemUseCooldownSeconds =
    authoritativeTransform?.itemUseCooldownSeconds ??
    racer.itemUseCooldownSeconds;

  if (heldItem !== "shell" || itemUseCooldownSeconds > 0) {
    return;
  }

  const nowSeconds = nowMilliseconds / 1000;

  if (getShellLaunchHudFeedbackForRacer(racer.id, nowSeconds) !== null) {
    return;
  }

  const direction = authoritativeTransform?.forward ?? racer.forward;
  const origin =
    authoritativeTransform === undefined
      ? createShellLaunchOriginFromRacer(racer)
      : createShellLaunchOrigin(authoritativeTransform.position, direction);

  registerShellLaunchFeedback({
    key: `local-shell:${racer.id}:${Math.round(nowMilliseconds)}`,
    racerId: racer.id,
    itemId: null,
    origin,
    direction,
    startedAtSeconds: nowSeconds,
    isLocal: true,
    playSound: true
  });
}

function registerImmediateLocalBananaDropFeedback(
  input: RacerInputState,
  racer: RaceSessionRacerState
): void {
  if (!input.useItem || racer.progress.finished) {
    return;
  }

  const nowMilliseconds = performance.now();
  const authoritativeTransform =
    remoteTransformSmoother?.sample(nowMilliseconds).get(racer.id);
  const heldItem = authoritativeTransform?.heldItem ?? racer.heldItem;
  const itemUseCooldownSeconds =
    authoritativeTransform?.itemUseCooldownSeconds ??
    racer.itemUseCooldownSeconds;

  if (heldItem !== "banana" || itemUseCooldownSeconds > 0) {
    return;
  }

  const nowSeconds = nowMilliseconds / 1000;
  const localFeedbackKeyPrefix = `banana-drop:local:${racer.id}:`;

  if (
    hasActiveCombatFeedbackEventForKeyPrefix(
      localFeedbackKeyPrefix,
      nowSeconds
    )
  ) {
    return;
  }

  const direction = normalizePlanarDirection(
    authoritativeTransform?.forward ?? racer.forward
  );
  const position =
    authoritativeTransform === undefined
      ? racer.position
      : authoritativeTransform.position;
  const dropPosition = addTrackPoint(
    position,
    scaleTrackPoint(direction, -SHELL_LAUNCH_RACER_CLEARANCE)
  );

  registerCombatFeedbackEvent({
    key: `${localFeedbackKeyPrefix}${Math.round(nowMilliseconds)}`,
    kind: "banana-drop",
    itemType: "banana",
    label: "BANANA",
    position: dropPosition,
    direction: scaleTrackPoint(direction, -1),
    startedAtSeconds: nowSeconds,
    isLocal: true,
    playSound: true
  });
}

function applyBufferedRemoteHumanInput(maxTickIndex: number): void {
  const result = applyLatestReadyRemoteKartInput({
    raceSession,
    buffer: remoteInputSnapshotBuffer,
    localPeerId: localSignalingPeerId,
    maxTickIndex
  });

  if (result.applied) {
    rememberAcknowledgedRemoteInputSequence(
      result.snapshot.peerId,
      result.snapshot.racerId,
      result.snapshot.sequence
    );
  }
}

function applyQueuedRemoteHumanInputDeltas(maxTickIndex: number): void {
  for (const queue of remoteInputDeltaQueues.values()) {
    const result = applyReadyRemoteKartInputDeltas({
      raceSession,
      queue,
      localPeerId: localSignalingPeerId,
      maxTickIndex
    });

    if (result.applied && result.latestPacket !== null) {
      rememberAcknowledgedRemoteInputSequence(
        result.latestPacket.peerId,
        result.latestPacket.racerId,
        result.latestPacket.sequence
      );
    }
  }
}

function emitLocalInputSnapshot(
  input: RacerInputState,
  tickResult: RaceSessionTickResult
): void {
  const racer = resolveLocalMultiplayerHumanRacer();

  if (racer === null || localSignalingPeerId === null) {
    return;
  }

  getLocalInputSnapshotEmitter(localSignalingPeerId, racer.id)?.emit(
    {
      tickIndex: tickResult.tickIndex,
      elapsedSeconds: tickResult.elapsedSeconds
    },
    input
  );
}

function emitLocalRemoteInputDelta(
  input: RacerInputState,
  tickResult: RaceSessionTickResult
): void {
  const racer = resolveLocalMultiplayerHumanRacer();

  if (racer === null || localSignalingPeerId === null) {
    return;
  }

  getLocalRemoteInputDeltaEmitter(localSignalingPeerId, racer.id)?.emit(
    {
      tickIndex: tickResult.tickIndex,
      elapsedSeconds: tickResult.elapsedSeconds
    },
    input
  );
}

function emitAuthoritativeItemUseEvents(
  tickResult: RaceSessionTickResult
): void {
  if (activeHostPeerConnection === null || localSignalingPeerId === null) {
    return;
  }

  const emitter = getLocalItemUseEventEmitter(localSignalingPeerId);

  for (const action of tickResult.itemUseActions) {
    emitter?.emit(action);
  }
}

function emitAuthoritativeItemCollisionOutcomeEvents(
  tickResult: RaceSessionTickResult
): void {
  if (activeHostPeerConnection === null || localSignalingPeerId === null) {
    return;
  }

  for (const hit of tickResult.shellHits) {
    if (
      !rememberAuthoritativeItemCollisionOutcomeEmission(
        "shell",
        hit.shellId,
        hit.eventId
      )
    ) {
      continue;
    }

    sendAuthoritativeItemCollisionOutcomeMessage(
      createKartItemCollisionOutcomeEventMessageFromShellHitEvent({
        event: hit,
        hostPeerId: localSignalingPeerId,
        sourceClientId: resolveItemCollisionOutcomeSourceClientId(
          hit.sourceRacerId
        ),
        sequence: authoritativeItemCollisionOutcomeSequence,
        occurredAt: performance.now()
      })
    );
    authoritativeItemCollisionOutcomeSequence += 1;
  }

  for (const hit of tickResult.bananaHits) {
    if (
      !rememberAuthoritativeItemCollisionOutcomeEmission(
        "banana",
        hit.bananaId,
        hit.eventId
      )
    ) {
      continue;
    }

    sendAuthoritativeItemCollisionOutcomeMessage(
      createKartItemCollisionOutcomeEventMessageFromBananaHitEvent({
        event: hit,
        hostPeerId: localSignalingPeerId,
        sourceClientId: resolveItemCollisionOutcomeSourceClientId(
          hit.sourceRacerId
        ),
        sequence: authoritativeItemCollisionOutcomeSequence,
        occurredAt: performance.now()
      })
    );
    authoritativeItemCollisionOutcomeSequence += 1;
  }
}

function sendAuthoritativeItemCollisionOutcomeMessage(
  message: KartItemCollisionOutcomeEventMessage
): void {
  sendGameplayDataChannelPayload(
    serializeKartItemCollisionOutcomeEventMessage(message)
  );
}

function resolveItemCollisionOutcomeSourceClientId(
  sourceRacerId: string
): SignalingPeerId {
  return (
    getHumanPeerIdFromRacerId(sourceRacerId) ??
    localSignalingPeerId ??
    "host"
  );
}

function rememberAuthoritativeItemCollisionOutcomeEmission(
  itemType: "shell" | "banana",
  itemId: string,
  eventId: string
): boolean {
  const eventKey = `event:${eventId}`;
  const itemKey = `item:${itemType}:${itemId}`;

  if (
    emittedItemCollisionOutcomeKeys.has(eventKey) ||
    emittedItemCollisionOutcomeKeys.has(itemKey)
  ) {
    return false;
  }

  rememberItemCollisionOutcomeEmissionKey(eventKey);
  rememberItemCollisionOutcomeEmissionKey(itemKey);

  return true;
}

function rememberItemCollisionOutcomeEmissionKey(key: string): void {
  emittedItemCollisionOutcomeKeys.add(key);
  emittedItemCollisionOutcomeKeyOrder.push(key);

  while (
    emittedItemCollisionOutcomeKeyOrder.length >
    MAX_EMITTED_ITEM_COLLISION_OUTCOME_KEYS
  ) {
    const expiredKey = emittedItemCollisionOutcomeKeyOrder.shift();

    if (expiredKey !== undefined) {
      emittedItemCollisionOutcomeKeys.delete(expiredKey);
    }
  }
}

function emitAuthoritativeMultiplayerEffectEvents(
  tickResult: RaceSessionTickResult
): void {
  if (activeHostPeerConnection === null || localSignalingPeerId === null) {
    return;
  }

  const emitter = getLocalMultiplayerEffectEventEmitter(localSignalingPeerId);

  if (emitter === null) {
    return;
  }

  emitBoostStartEffectEvents(tickResult, emitter);
  emitShellLaunchEffectEvents(tickResult, emitter);
  emitBananaDropEffectEvents(tickResult, emitter);
  emitItemHitEffectEvents(tickResult, emitter);
  emitTimedEffectEndEvents(tickResult, emitter);
}

function emitBoostStartEffectEvents(
  tickResult: RaceSessionTickResult,
  emitter: LocalKartMultiplayerEffectEventEmitter
): void {
  for (const activation of tickResult.boostActivations) {
    const racer = raceSession.getRacerState(activation.racerId);

    if (racer === undefined) {
      continue;
    }

    const participant = createEffectParticipantSnapshot(racer, {
      racerId: activation.racerId,
      slotIndex: racer.slotIndex
    });
    const previous = activeBoostMultiplayerEffectsByRacerId.get(racer.id);

    if (previous !== undefined && previous.effectId !== activation.eventId) {
      emitBoostEndEffectEvent(
        previous,
        tickResult,
        "interrupted",
        emitter
      );
    }

    activeBoostMultiplayerEffectsByRacerId.set(racer.id, {
      effectId: activation.eventId,
      racer: participant
    });

    emitter.emit({
      effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START,
      eventId: `effect_${activation.eventId}_start`,
      tickIndex: activation.tickIndex,
      elapsedSeconds: activation.elapsedSeconds,
      itemType: "boost",
      effectId: activation.eventId,
      racer: participant,
      durationSeconds: activation.durationSeconds,
      expiresAtElapsedSeconds: activation.expiresAtElapsedSeconds
    });
  }
}

function emitShellLaunchEffectEvents(
  tickResult: RaceSessionTickResult,
  emitter: LocalKartMultiplayerEffectEventEmitter
): void {
  for (const action of tickResult.itemUseActions) {
    if (
      action.itemType !== "shell" ||
      action.activeItemId === null ||
      emittedShellLaunchEffectItemIds.has(action.activeItemId)
    ) {
      continue;
    }

    const shell = findActiveShellById(action.activeItemId);

    if (shell === null || shell.type !== "shell") {
      continue;
    }

    emittedShellLaunchEffectItemIds.add(shell.id);
    emitter.emit({
      effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_LAUNCH,
      eventId: `effect_shell_launch_${shell.id}`,
      tickIndex: action.tickIndex,
      elapsedSeconds: action.elapsedSeconds,
      itemType: "shell",
      shellId: shell.id,
      source: createEffectParticipantSnapshotForRacerId(
        shell.owner.racerId,
        shell.owner.slotIndex
      ),
      position: shell.position,
      velocity: shell.velocity,
      radius: shell.radius,
      armedSeconds: shell.armedSeconds,
      ttlSeconds: shell.ttlSeconds
    });
  }
}

function emitBananaDropEffectEvents(
  tickResult: RaceSessionTickResult,
  emitter: LocalKartMultiplayerEffectEventEmitter
): void {
  for (const action of tickResult.itemUseActions) {
    if (
      action.itemType !== "banana" ||
      action.activeItemId === null ||
      emittedBananaDropEffectItemIds.has(action.activeItemId)
    ) {
      continue;
    }

    const banana = findActiveBananaById(action.activeItemId);

    if (banana === null || banana.type !== "banana") {
      continue;
    }

    emittedBananaDropEffectItemIds.add(banana.id);
    emitter.emit({
      effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_DROP,
      eventId: `effect_banana_drop_${banana.id}`,
      tickIndex: action.tickIndex,
      elapsedSeconds: action.elapsedSeconds,
      itemType: "banana",
      bananaId: banana.id,
      owner: createEffectParticipantSnapshotForRacerId(
        banana.owner.racerId,
        banana.owner.slotIndex
      ),
      position: banana.position,
      velocity: banana.velocity,
      radius: banana.radius,
      armedSeconds: banana.armedSeconds,
      ttlSeconds: banana.ttlSeconds,
      ageSeconds: banana.ageSeconds,
      orientationRadians: banana.orientationRadians
    });
  }
}

function emitItemHitEffectEvents(
  tickResult: RaceSessionTickResult,
  emitter: LocalKartMultiplayerEffectEventEmitter
): void {
  for (const hit of tickResult.shellHits) {
    const source = createEffectParticipantSnapshotForRacerId(
      hit.sourceRacerId,
      hit.sourceSlotIndex
    );
    const target = createEffectParticipantSnapshotForRacerId(
      hit.targetRacerId,
      hit.targetSlotIndex
    );

    emitter.emit({
      effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_HIT,
      eventId: `effect_${hit.eventId}`,
      tickIndex: hit.tickIndex,
      elapsedSeconds: hit.elapsedSeconds,
      itemType: "shell",
      shellId: hit.shellId,
      source,
      target,
      impact: createEffectImpactSnapshot(hit.impact),
      effect: createEffectHitEffectSnapshot(hit.effect)
    });
    emitSpinoutStartEffectEventFromHit(
      {
        hitEventId: hit.eventId,
        tickIndex: hit.tickIndex,
        elapsedSeconds: hit.elapsedSeconds,
        source,
        target,
        sourceItemType: "shell",
        sourceObjectId: hit.shellId,
        effect: hit.effect
      },
      emitter
    );
  }

  for (const hit of tickResult.bananaHits) {
    const source = createEffectParticipantSnapshotForRacerId(
      hit.sourceRacerId,
      hit.sourceSlotIndex
    );
    const target = createEffectParticipantSnapshotForRacerId(
      hit.targetRacerId,
      hit.targetSlotIndex
    );

    emitter.emit({
      effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_HIT,
      eventId: `effect_${hit.eventId}`,
      tickIndex: hit.tickIndex,
      elapsedSeconds: hit.elapsedSeconds,
      itemType: "banana",
      bananaId: hit.bananaId,
      source,
      target,
      impact: createEffectImpactSnapshot(hit.impact),
      effect: createEffectHitEffectSnapshot(hit.effect)
    });
    emitSpinoutStartEffectEventFromHit(
      {
        hitEventId: hit.eventId,
        tickIndex: hit.tickIndex,
        elapsedSeconds: hit.elapsedSeconds,
        source,
        target,
        sourceItemType: "banana",
        sourceObjectId: hit.bananaId,
        effect: hit.effect
      },
      emitter
    );
  }
}

function emitSpinoutStartEffectEventFromHit(
  options: {
    readonly hitEventId: string;
    readonly tickIndex: number;
    readonly elapsedSeconds: number;
    readonly source: KartEffectParticipantSnapshot;
    readonly target: KartEffectParticipantSnapshot;
    readonly sourceItemType: KartSpinoutSourceItemType;
    readonly sourceObjectId: string;
    readonly effect: RaceShellHitEvent["effect"];
  },
  emitter: LocalKartMultiplayerEffectEventEmitter
): void {
  if (options.effect.spinoutSeconds <= 0) {
    return;
  }

  const previous = activeSpinoutMultiplayerEffectsByRacerId.get(
    options.target.racerId
  );

  if (previous !== undefined) {
    emitSpinoutEndEffectEvent(
      previous,
      {
        tickIndex: options.tickIndex,
        elapsedSeconds: options.elapsedSeconds
      },
      "interrupted",
      emitter
    );
  }

  const spinoutId = `spinout_${options.sourceItemType}_${options.sourceObjectId}_${options.target.racerId}`;
  const activeSpinout = {
    spinoutId,
    target: options.target,
    source: options.source,
    sourceItemType: options.sourceItemType,
    sourceObjectId: options.sourceObjectId
  } satisfies ActiveSpinoutMultiplayerEffectState;

  activeSpinoutMultiplayerEffectsByRacerId.set(
    options.target.racerId,
    activeSpinout
  );

  emitter.emit({
    effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_START,
    eventId: `effect_spinout_start_${options.hitEventId}`,
    tickIndex: options.tickIndex,
    elapsedSeconds: options.elapsedSeconds,
    spinoutId,
    target: options.target,
    source: options.source,
    sourceItemType: options.sourceItemType,
    sourceObjectId: options.sourceObjectId,
    durationSeconds: options.effect.spinoutSeconds,
    expiresAtElapsedSeconds:
      options.elapsedSeconds + options.effect.spinoutSeconds,
    angularVelocity: options.effect.spinoutAngularVelocity
  });
}

function emitTimedEffectEndEvents(
  tickResult: RaceSessionTickResult,
  emitter: LocalKartMultiplayerEffectEventEmitter
): void {
  for (const [racerId, activeBoost] of activeBoostMultiplayerEffectsByRacerId) {
    const racer = raceSession.getRacerState(racerId);

    if (racer !== undefined && racer.boostSeconds > 0) {
      continue;
    }

    emitBoostEndEffectEvent(
      activeBoost,
      tickResult,
      "duration-expired",
      emitter
    );
    activeBoostMultiplayerEffectsByRacerId.delete(racerId);
  }

  for (const [racerId, activeSpinout] of activeSpinoutMultiplayerEffectsByRacerId) {
    const racer = raceSession.getRacerState(racerId);

    if (racer !== undefined && racer.spinoutSeconds > 0) {
      continue;
    }

    emitSpinoutEndEffectEvent(
      activeSpinout,
      tickResult,
      "duration-expired",
      emitter
    );
    activeSpinoutMultiplayerEffectsByRacerId.delete(racerId);
  }
}

function emitBoostEndEffectEvent(
  activeBoost: ActiveBoostMultiplayerEffectState,
  tick: Pick<RaceSessionTickResult, "tickIndex" | "elapsedSeconds">,
  reason: "duration-expired" | "interrupted",
  emitter: LocalKartMultiplayerEffectEventEmitter
): void {
  emitter.emit({
    effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_END,
    eventId: `effect_${activeBoost.effectId}_end_${tick.tickIndex}`,
    tickIndex: tick.tickIndex,
    elapsedSeconds: tick.elapsedSeconds,
    itemType: "boost",
    effectId: activeBoost.effectId,
    racer: activeBoost.racer,
    reason
  });
}

function emitSpinoutEndEffectEvent(
  activeSpinout: ActiveSpinoutMultiplayerEffectState,
  tick: Pick<RaceSessionTickResult, "tickIndex" | "elapsedSeconds">,
  reason: "duration-expired" | "interrupted",
  emitter: LocalKartMultiplayerEffectEventEmitter
): void {
  emitter.emit({
    effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_END,
    eventId: `effect_${activeSpinout.spinoutId}_end_${tick.tickIndex}`,
    tickIndex: tick.tickIndex,
    elapsedSeconds: tick.elapsedSeconds,
    spinoutId: activeSpinout.spinoutId,
    target: activeSpinout.target,
    source: activeSpinout.source,
    sourceItemType: activeSpinout.sourceItemType,
    sourceObjectId: activeSpinout.sourceObjectId,
    reason
  });
}

function createEffectParticipantSnapshotForRacerId(
  racerId: string,
  slotIndex: number
): KartEffectParticipantSnapshot {
  return createEffectParticipantSnapshot(raceSession.getRacerState(racerId), {
    racerId,
    slotIndex
  });
}

function createEffectParticipantSnapshot(
  racer: RaceSessionRacerState | undefined,
  fallback: Pick<KartEffectParticipantSnapshot, "racerId" | "slotIndex">
): KartEffectParticipantSnapshot {
  return {
    playerId: racer?.peerId ?? null,
    racerId: racer?.id ?? fallback.racerId,
    slotIndex: racer?.slotIndex ?? fallback.slotIndex
  };
}

function createEffectImpactSnapshot(
  impact: RaceShellHitEvent["impact"]
): KartEffectImpactSnapshot {
  return {
    position: impact.position,
    normal: impact.normal,
    objectPosition: impact.shellPosition,
    objectVelocity: impact.shellVelocity,
    objectRadius: impact.shellRadius,
    targetHitboxCenter: impact.targetHitboxCenter,
    penetrationDepth: impact.penetrationDepth,
    relativeSpeed: impact.relativeSpeed
  };
}

function createEffectHitEffectSnapshot(
  effect: RaceShellHitEvent["effect"]
): KartEffectHitEffectSnapshot {
  return {
    itemType: effect.itemType,
    stunSeconds: effect.stunSeconds,
    spinoutSeconds: effect.spinoutSeconds,
    spinoutAngularVelocity: effect.spinoutAngularVelocity,
    hitImmunitySeconds: effect.hitImmunitySeconds,
    hitFeedbackSeconds: effect.hitFeedbackSeconds,
    speedFactor: effect.speedFactor,
    speedBeforeHit: effect.speedBeforeHit,
    speedAfterHit: effect.speedAfterHit,
    headingDeltaRadians: effect.headingDeltaRadians,
    blockedByShield: effect.blockedByShield === true,
    shieldSecondsBeforeHit: effect.shieldSecondsBeforeHit ?? 0,
    shieldSecondsAfterHit: effect.shieldSecondsAfterHit ?? 0
  };
}

function emitAuthoritativeBananaSpawnEvents(
  tickResult: RaceSessionTickResult
): void {
  if (activeHostPeerConnection === null || localSignalingPeerId === null) {
    return;
  }

  const spawnEvents = getReplicatedBananaSpawnsForTick(
    tickResult,
    localSignalingPeerId
  );

  broadcastKartBananaLifecycleEventsToPeers(
    spawnEvents,
    getAuthoritativeBananaEventPeerChannels()
  );
}

function emitAuthoritativeBananaCollisionEvents(
  tickResult: RaceSessionTickResult
): void {
  if (activeHostPeerConnection === null || localSignalingPeerId === null) {
    return;
  }

  const collisionEvents = getReplicatedBananaCollisionEventsForTick(
    tickResult,
    localSignalingPeerId
  );

  for (const event of collisionEvents) {
    sendGameplayDataChannelPayload(serializeKartGameplayMessage(event));
  }
}

function emitAuthoritativeBananaRemovalEvents(
  tickResult: RaceSessionTickResult
): void {
  if (activeHostPeerConnection === null || localSignalingPeerId === null) {
    return;
  }

  const removalEvents = getReplicatedBananaRemovalEventsForTick(
    tickResult,
    localSignalingPeerId
  );

  broadcastKartBananaLifecycleEventsToPeers(
    removalEvents,
    getAuthoritativeBananaEventPeerChannels()
  );
}

function emitAuthoritativePlayerSnapshots(
  tickResult: RaceSessionTickResult
): void {
  if (activeHostPeerConnection === null || localSignalingPeerId === null) {
    return;
  }

  const hostTick = authoritativePlayerSnapshotClock.consumeDueTick(
    tickResult.elapsedSeconds
  );

  if (hostTick === null) {
    return;
  }

  for (const racer of raceSession.humanRacerStates) {
    if (racer.peerId === null || racer.peerId === localSignalingPeerId) {
      continue;
    }

    const progress = tickResult.raceProgress.find(
      (entry) => entry.racerId === racer.id
    );

    if (progress === undefined) {
      continue;
    }

    getLocalAuthoritativePlayerSnapshotEmitter(
      localSignalingPeerId,
      racer.peerId,
      racer.id
    )?.emit(
      hostTick,
      getAcknowledgedRemoteInputSequence(racer.peerId, racer.id),
      createKartAuthoritativePlayerStateFromRaceState(racer, progress)
    );
  }
}

function emitAuthoritativeRaceStateSnapshot(
  tickResult: RaceSessionTickResult
): boolean {
  if (activeHostPeerConnection === null || localSignalingPeerId === null) {
    return false;
  }

  const itemPickupCollections =
    getReplicatedPickupCollectionsForTick(tickResult);
  const boostActivations = getReplicatedBoostActivationsForTick(tickResult);
  const shellHits = getReplicatedShellHitsForTick(tickResult);
  const bananaHits = getReplicatedBananaHitsForTick(tickResult);
  const snapshot = getLocalRaceStateSnapshotEmitter(localSignalingPeerId)?.emit(
    {
      tickIndex: tickResult.tickIndex,
      elapsedSeconds: tickResult.elapsedSeconds
    },
    raceSession.phase,
    DEFAULT_RACE_TRACK_STATE.lapCount,
    tickResult.raceProgress,
    raceSession.racerStates,
    raceSession.itemPickupStates,
    itemPickupCollections,
    boostActivations,
    shellHits,
    bananaHits,
    raceSession.activeItemStates
  );

  return snapshot !== null && snapshot !== undefined;
}

function emitAuthoritativeTransformSnapshot(
  tickResult: RaceSessionTickResult
): void {
  if (activeHostPeerConnection === null || localSignalingPeerId === null) {
    return;
  }

  const itemPickupCollections =
    getReplicatedPickupCollectionsForTick(tickResult);
  const boostActivations = getReplicatedBoostActivationsForTick(tickResult);
  const shellHits = getReplicatedShellHitsForTick(tickResult);
  const bananaHits = getReplicatedBananaHitsForTick(tickResult);

  getLocalTransformSnapshotEmitter(localSignalingPeerId)?.emit(
    {
      tickIndex: tickResult.tickIndex,
      elapsedSeconds: tickResult.elapsedSeconds
    },
    raceSession.racerStates,
    raceSession.itemPickupStates,
    itemPickupCollections,
    boostActivations,
    shellHits,
    bananaHits,
    raceSession.activeItemStates
  );
}

function emitLocalOwnedTransformSnapshot(
  tickResult: RaceSessionTickResult
): void {
  const racer = resolveLocalMultiplayerHumanRacer();

  if (racer === null || localSignalingPeerId === null) {
    return;
  }

  getLocalOwnedTransformSnapshotEmitter(localSignalingPeerId, racer.id)?.emit(
    {
      tickIndex: tickResult.tickIndex,
      elapsedSeconds: tickResult.elapsedSeconds
    },
    racer
  );
}

function resolveLocalHumanRacerForInput(): RaceSessionRacerState | null {
  return (
    resolveLocalMultiplayerHumanRacer() ??
    raceSession.humanRacerStates[0] ??
    null
  );
}

function resolveLocalMultiplayerHumanRacer(): RaceSessionRacerState | null {
  if (localSignalingPeerId === null) {
    return null;
  }

  return getHumanRacerForPeer(localSignalingPeerId);
}

function getLocalHumanRacerId(): string | null {
  return localSignalingPeerId === null
    ? null
    : getHumanRacerIdForPeer(localSignalingPeerId);
}

function getLocalInputSnapshotEmitter(
  peerId: SignalingPeerId,
  racerId: string
): LocalKartInputSnapshotEmitter | null {
  if (!hasOpenDataChannel()) {
    return null;
  }

  const emitterKey = `${peerId}:${racerId}`;

  if (
    localInputSnapshotEmitter !== null &&
    localInputSnapshotEmitterKey === emitterKey
  ) {
    return localInputSnapshotEmitter;
  }

  localInputSnapshotEmitter = new LocalKartInputSnapshotEmitter({
    peerId,
    racerId,
    now: () => performance.now(),
    send: (payload) => sendGameplayDataChannelPayload(payload)
  });
  localInputSnapshotEmitterKey = emitterKey;

  return localInputSnapshotEmitter;
}

function getLocalRemoteInputDeltaEmitter(
  peerId: SignalingPeerId,
  racerId: string
): LocalKartRemoteInputDeltaEmitter | null {
  if (!hasOpenDataChannel()) {
    return null;
  }

  const emitterKey = `${peerId}:${racerId}`;

  if (
    localRemoteInputDeltaEmitter !== null &&
    localRemoteInputDeltaEmitterKey === emitterKey
  ) {
    return localRemoteInputDeltaEmitter;
  }

  localRemoteInputDeltaEmitter = new LocalKartRemoteInputDeltaEmitter({
    peerId,
    racerId,
    now: () => performance.now(),
    send: (payload) => sendGameplayDataChannelPayload(payload)
  });
  localRemoteInputDeltaEmitterKey = emitterKey;

  return localRemoteInputDeltaEmitter;
}

function getLocalTransformSnapshotEmitter(
  hostPeerId: SignalingPeerId
): LocalKartTransformSnapshotEmitter | null {
  if (!hasOpenDataChannel() || activeHostPeerConnection === null) {
    return null;
  }

  if (
    localTransformSnapshotEmitter !== null &&
    localTransformSnapshotEmitterHostPeerId === hostPeerId
  ) {
    return localTransformSnapshotEmitter;
  }

  localTransformSnapshotEmitter = new LocalKartTransformSnapshotEmitter({
    hostPeerId,
    now: () => performance.now(),
    send: (payload) => sendGameplayDataChannelPayload(payload)
  });
  localTransformSnapshotEmitterHostPeerId = hostPeerId;

  return localTransformSnapshotEmitter;
}

function getLocalOwnedTransformSnapshotEmitter(
  peerId: SignalingPeerId,
  racerId: string
): LocalKartOwnedTransformSnapshotEmitter | null {
  if (!hasOpenDataChannel()) {
    return null;
  }

  const emitterKey = `${peerId}:${racerId}`;

  if (
    localOwnedTransformSnapshotEmitter !== null &&
    localOwnedTransformSnapshotEmitterKey === emitterKey
  ) {
    return localOwnedTransformSnapshotEmitter;
  }

  localOwnedTransformSnapshotEmitter = new LocalKartOwnedTransformSnapshotEmitter({
    peerId,
    racerId,
    now: () => performance.now(),
    send: (payload) => sendGameplayDataChannelPayload(payload)
  });
  localOwnedTransformSnapshotEmitterKey = emitterKey;

  return localOwnedTransformSnapshotEmitter;
}

function getLocalItemUseEventEmitter(
  hostPeerId: SignalingPeerId
): LocalKartItemUseEventEmitter | null {
  if (!hasOpenDataChannel() || activeHostPeerConnection === null) {
    return null;
  }

  if (
    localItemUseEventEmitter !== null &&
    localItemUseEventEmitterHostPeerId === hostPeerId
  ) {
    return localItemUseEventEmitter;
  }

  localItemUseEventEmitter = new LocalKartItemUseEventEmitter({
    hostPeerId,
    now: () => performance.now(),
    send: (payload) => sendGameplayDataChannelPayload(payload)
  });
  localItemUseEventEmitterHostPeerId = hostPeerId;

  return localItemUseEventEmitter;
}

function getLocalMultiplayerEffectEventEmitter(
  hostPeerId: SignalingPeerId
): LocalKartMultiplayerEffectEventEmitter | null {
  if (!hasOpenDataChannel() || activeHostPeerConnection === null) {
    return null;
  }

  if (
    localMultiplayerEffectEventEmitter !== null &&
    localMultiplayerEffectEventEmitterHostPeerId === hostPeerId
  ) {
    return localMultiplayerEffectEventEmitter;
  }

  localMultiplayerEffectEventEmitter =
    new LocalKartMultiplayerEffectEventEmitter({
      hostPeerId,
      now: () => performance.now(),
      sendTimestampNow: () => Date.now(),
      send: (payload) => sendGameplayDataChannelPayload(payload)
    });
  localMultiplayerEffectEventEmitterHostPeerId = hostPeerId;

  return localMultiplayerEffectEventEmitter;
}

function getLocalAuthoritativePlayerSnapshotEmitter(
  hostPeerId: SignalingPeerId,
  peerId: SignalingPeerId,
  racerId: string
): LocalKartAuthoritativePlayerSnapshotEmitter | null {
  if (!hasOpenDataChannel() || activeHostPeerConnection === null) {
    return null;
  }

  const emitterKey = createPeerRacerKey(peerId, racerId);
  const existingEmitter =
    localAuthoritativePlayerSnapshotEmitters.get(emitterKey);

  if (existingEmitter !== undefined) {
    return existingEmitter;
  }

  const emitter = new LocalKartAuthoritativePlayerSnapshotEmitter({
    hostPeerId,
    peerId,
    racerId,
    now: () => performance.now(),
    send: (payload, snapshot) =>
      sendAuthoritativePlayerSnapshotPayload(peerId, payload, snapshot)
  });

  localAuthoritativePlayerSnapshotEmitters.set(emitterKey, emitter);

  return emitter;
}

function getRemoteMultiplayerEffectEventBuffer(
  hostPeerId: SignalingPeerId
): RemoteKartMultiplayerEffectEventBuffer {
  if (
    remoteMultiplayerEffectEventBuffer !== null &&
    remoteMultiplayerEffectEventBufferHostPeerId === hostPeerId
  ) {
    return remoteMultiplayerEffectEventBuffer;
  }

  remoteMultiplayerEffectEventBuffer = new RemoteKartMultiplayerEffectEventBuffer({
    expectedHostPeerId: hostPeerId,
    now: () => performance.now(),
    receiveTimestampNow: () => Date.now()
  });
  remoteMultiplayerEffectEventBufferHostPeerId = hostPeerId;

  return remoteMultiplayerEffectEventBuffer;
}

function getLocalRaceStateSnapshotEmitter(
  hostPeerId: SignalingPeerId
): LocalKartRaceStateSnapshotEmitter | null {
  if (!hasOpenDataChannel() || activeHostPeerConnection === null) {
    return null;
  }

  if (
    localRaceStateSnapshotEmitter !== null &&
    localRaceStateSnapshotEmitterHostPeerId === hostPeerId
  ) {
    return localRaceStateSnapshotEmitter;
  }

  localRaceStateSnapshotEmitter = new LocalKartRaceStateSnapshotEmitter({
    hostPeerId,
    now: () => performance.now(),
    send: (payload, snapshot) =>
      sendAuthoritativeRaceStateSnapshotPayload(payload, snapshot)
  });
  localRaceStateSnapshotEmitterHostPeerId = hostPeerId;

  return localRaceStateSnapshotEmitter;
}

function handleGameplayDataChannelMessage(
  data: unknown,
  remotePeerId: SignalingPeerId
): void {
  const decodedMessage = tryDeserializeKartGameplayMessage(data);

  if (!decodedMessage.ok) {
    console.warn(decodedMessage.message);
    return;
  }

  const message = decodedMessage.message;

  dispatchKartGameplayMessage(
    message,
    {
      onInputSnapshot: (_snapshot, context) => {
        acceptRemoteKartInputSnapshot(context.payload ?? data, remotePeerId);
      },
      onRemoteInputDelta: (packet) => {
        acceptRemoteKartInputDelta(packet, remotePeerId);
      },
      onTransformSnapshot: (_snapshot, context) => {
        acceptRemoteKartTransformSnapshot(context.payload ?? data, remotePeerId);
      },
      onOwnedTransformSnapshot: (snapshot) => {
        acceptRemoteOwnedTransformSnapshot(snapshot, remotePeerId);
      },
      onAuthoritativePlayerSnapshot: (snapshot, context) => {
        acceptRemoteAuthoritativePlayerSnapshot(
          snapshot,
          remotePeerId,
          context.receivedAt ?? performance.now()
        );
      },
      onItemUseEvent: (event) => {
        acceptRemoteItemUseEvent(event, remotePeerId);
      },
      onItemCollisionOutcomeEvent: (event) => {
        acceptRemoteItemCollisionOutcomeEvent(event, remotePeerId);
      },
      onEffectEvent: (event) => {
        acceptRemoteMultiplayerEffectEvent(event, remotePeerId);
      },
      onRaceStateSnapshot: (snapshot) => {
        acceptRemoteRaceStateSnapshot(snapshot, remotePeerId);
      },
      onBananaSpawnEvent: (event) => {
        acceptRemoteBananaSpawnEvent(event, remotePeerId);
      },
      onBananaCollisionEvent: (event) => {
        acceptRemoteBananaCollisionEvent(event, remotePeerId);
      },
      onBananaRemovalEvent: (event) => {
        acceptRemoteBananaRemovalEvent(event, remotePeerId);
      },
      onUnhandledMessage: () => {
        console.warn("Unknown gameplay data channel packet.");
      }
    },
    {
      ...(typeof data === "string" ? { payload: data } : {}),
      remotePeerId,
      receivedAt: performance.now()
    }
  );
}

function acceptRemoteItemUseEvent(
  event: KartItemUseEventMessage,
  hostPeerId: SignalingPeerId
): void {
  if (activeGuestPeerConnection === null) {
    console.warn("Ignoring non-host item-use event packet.");
    return;
  }

  if (event.hostPeerId !== hostPeerId) {
    console.warn("Item-use event came from an unexpected host peer.");
    return;
  }

  if (event.itemType === "shell") {
    registerShellLaunchFeedbackFromItemUseEvent(event);
  }
}

function acceptRemoteItemCollisionOutcomeEvent(
  event: KartItemCollisionOutcomeEventMessage,
  hostPeerId: SignalingPeerId
): void {
  if (activeGuestPeerConnection === null) {
    console.warn("Ignoring non-host item collision outcome packet.");
    return;
  }

  if (event.hostPeerId !== hostPeerId) {
    console.warn("Item collision outcome came from an unexpected host peer.");
    return;
  }

  if (event.itemType === "shell") {
    const raceEvent = createRaceShellHitEventFromItemCollisionOutcomeMessage(
      event
    );

    registerShellProjectileImpactEffectsFromHits([raceEvent]);

    if (raceSession.applyShellHitEvent(raceEvent)) {
      synchronizeAuthoritativeItemHitPresentation(raceEvent);
      scheduleRender();
    }

    return;
  }

  rememberAuthoritativeBananaRemovalRenderEvent(event.itemId);

  const raceEvent =
    createRaceBananaHitEventFromItemCollisionOutcomeMessage(event);

  if (raceSession.applyBananaHitEvent(raceEvent)) {
    synchronizeAuthoritativeItemHitPresentation(raceEvent);
    scheduleRender();
  }
}

function acceptRemoteMultiplayerEffectEvent(
  event: KartMultiplayerEffectEventMessage,
  hostPeerId: SignalingPeerId
): void {
  if (activeGuestPeerConnection === null) {
    console.warn("Ignoring non-host multiplayer effect event packet.");
    return;
  }

  if (event.hostPeerId !== hostPeerId) {
    console.warn("Multiplayer effect event came from an unexpected host peer.");
    return;
  }

  const result = getRemoteMultiplayerEffectEventBuffer(hostPeerId).accept(
    event,
    performance.now()
  );

  if (!result.accepted) {
    if (shouldReportRemotePacketRejection(result.reason)) {
      console.warn(result.message);
    }

    return;
  }

  rememberReplicatedEffectTimingSample(result.timing);
  drainRemoteMultiplayerEffectEvents(hostPeerId);
}

function rememberReplicatedEffectTimingSample(
  timing: KartMultiplayerEffectEventReplicationTiming
): void {
  replicatedEffectTimingSamples.push(timing);
  replicatedEffectTimingSamples = replicatedEffectTimingSamples.slice(
    -MAX_REPLICATED_EFFECT_TIMING_SAMPLES
  );
}

function drainRemoteMultiplayerEffectEvents(hostPeerId: SignalingPeerId): void {
  const buffer = getRemoteMultiplayerEffectEventBuffer(hostPeerId);
  const result = buffer.drainReady(performance.now());

  for (const event of result.events) {
    applyAcceptedRemoteMultiplayerEffectEvent(event);
  }

  if (result.nextReadyAt !== null) {
    scheduleRemoteMultiplayerEffectEventDrain(hostPeerId, result.nextReadyAt);
  } else if (remoteMultiplayerEffectEventDrainTimer !== null) {
    window.clearTimeout(remoteMultiplayerEffectEventDrainTimer);
    remoteMultiplayerEffectEventDrainTimer = null;
  }
}

function scheduleRemoteMultiplayerEffectEventDrain(
  hostPeerId: SignalingPeerId,
  readyAt: number
): void {
  if (remoteMultiplayerEffectEventDrainTimer !== null) {
    window.clearTimeout(remoteMultiplayerEffectEventDrainTimer);
  }

  remoteMultiplayerEffectEventDrainTimer = window.setTimeout(() => {
    remoteMultiplayerEffectEventDrainTimer = null;

    if (
      remoteMultiplayerEffectEventBuffer !== null &&
      remoteMultiplayerEffectEventBufferHostPeerId === hostPeerId
    ) {
      drainRemoteMultiplayerEffectEvents(hostPeerId);
    }
  }, Math.max(0, readyAt - performance.now()));
}

function applyAcceptedRemoteMultiplayerEffectEvent(
  event: KartMultiplayerEffectEventMessage
): void {
  switch (event.effectEventKind) {
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START:
      acceptRemoteBoostStartEffectEvent(event);
      return;
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_END:
      acceptRemoteBoostEndEffectEvent(event);
      return;
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_LAUNCH:
      registerShellLaunchFeedbackFromEffectEvent(event);
      scheduleRender();
      return;
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_HIT:
      acceptRemoteShellHitEffectEvent(event);
      return;
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_DROP:
      acceptRemoteBananaDropEffectEvent(event);
      return;
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_HIT:
      acceptRemoteBananaHitEffectEvent(event);
      return;
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_START:
      acceptRemoteSpinoutStartEffectEvent(event);
      return;
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_END:
      acceptRemoteSpinoutEndEffectEvent(event);
      return;
  }
}

function acceptRemoteBoostStartEffectEvent(
  event: KartBoostStartEffectEventMessage
): void {
  if (
    raceSession.applyBoostActivationEvent({
      eventId: event.effectId,
      racerId: event.racer.racerId,
      tickIndex: event.tickIndex,
      elapsedSeconds: event.elapsedSeconds,
      durationSeconds: event.durationSeconds,
      expiresAtElapsedSeconds: event.expiresAtElapsedSeconds,
      cooldownSeconds: 0
    })
  ) {
    scheduleRender();
  }
}

function acceptRemoteBoostEndEffectEvent(
  event: KartBoostEndEffectEventMessage
): void {
  if (
    raceSession.applyBoostEffectEndEvent({
      eventId: event.eventId,
      boostActivationEventId: event.effectId,
      racerId: event.racer.racerId,
      tickIndex: event.tickIndex,
      elapsedSeconds: event.elapsedSeconds
    })
  ) {
    scheduleRender();
  }
}

function acceptRemoteShellHitEffectEvent(
  event: KartShellHitEffectEventMessage
): void {
  const raceEvent = createRaceShellHitEventFromEffectEvent(event);

  registerShellProjectileImpactEffectsFromHits([raceEvent]);

  if (raceSession.applyShellHitEvent(raceEvent)) {
    synchronizeAuthoritativeItemHitPresentation(raceEvent);
    scheduleRender();
  }
}

function acceptRemoteBananaDropEffectEvent(
  event: KartBananaDropEffectEventMessage
): void {
  const isLocal = event.owner.racerId === getLocalHumanRacerId();
  const nowSeconds = getCurrentAnimationSeconds();
  const hasRecentLocalCue =
    isLocal &&
    hasActiveCombatFeedbackEventForKeyPrefix(
      `banana-drop:local:${event.owner.racerId}:`,
      nowSeconds
    );

  registerCombatFeedbackEvent({
    key: `banana-drop:${event.bananaId}`,
    kind: "banana-drop",
    itemType: "banana",
    label: "BANANA",
    position: event.position,
    direction: event.velocity,
    startedAtSeconds: nowSeconds,
    isLocal,
    playSound: isLocal && !hasRecentLocalCue
  });

  if (
    raceSession.applyBananaSpawnEvent({
      eventId: event.eventId,
      itemType: "banana",
      bananaId: event.bananaId,
      ownerRacerId: event.owner.racerId,
      ownerSlotIndex: event.owner.slotIndex,
      tickIndex: event.tickIndex,
      elapsedSeconds: event.elapsedSeconds,
      position: event.position,
      velocity: event.velocity,
      radius: event.radius,
      armedSeconds: event.armedSeconds,
      ttlSeconds: event.ttlSeconds,
      ageSeconds: event.ageSeconds,
      orientationRadians: event.orientationRadians
    })
  ) {
    scheduleRender();
  }
}

function acceptRemoteBananaHitEffectEvent(
  event: KartBananaHitEffectEventMessage
): void {
  rememberAuthoritativeBananaRemovalRenderEvent(event.bananaId);

  const raceEvent = createRaceBananaHitEventFromEffectEvent(event);

  if (raceSession.applyBananaHitEvent(raceEvent)) {
    synchronizeAuthoritativeItemHitPresentation(raceEvent);
    scheduleRender();
  }
}

function acceptRemoteSpinoutStartEffectEvent(
  event: KartSpinoutStartEffectEventMessage
): void {
  if (
    raceSession.applySpinoutEffectStartEvent({
      eventId: event.eventId,
      spinoutId: event.spinoutId,
      targetRacerId: event.target.racerId,
      sourceItemType: event.sourceItemType,
      tickIndex: event.tickIndex,
      elapsedSeconds: event.elapsedSeconds,
      durationSeconds: event.durationSeconds,
      expiresAtElapsedSeconds: event.expiresAtElapsedSeconds,
      spinoutAngularVelocity: event.angularVelocity
    })
  ) {
    scheduleRender();
  }
}

function acceptRemoteSpinoutEndEffectEvent(
  event: KartSpinoutEndEffectEventMessage
): void {
  if (
    raceSession.applySpinoutEffectEndEvent({
      eventId: event.eventId,
      spinoutId: event.spinoutId,
      targetRacerId: event.target.racerId,
      tickIndex: event.tickIndex,
      elapsedSeconds: event.elapsedSeconds
    })
  ) {
    scheduleRender();
  }
}

function createRaceShellHitEventFromEffectEvent(
  event: KartShellHitEffectEventMessage
): RaceShellHitEvent {
  return {
    eventId: event.eventId,
    itemType: "shell",
    shellId: event.shellId,
    sourceRacerId: event.source.racerId,
    sourceSlotIndex: event.source.slotIndex,
    targetRacerId: event.target.racerId,
    targetSlotIndex: event.target.slotIndex,
    tickIndex: event.tickIndex,
    elapsedSeconds: event.elapsedSeconds,
    impact: createRaceHitImpactFromEffectSnapshot(event.impact),
    effect: createRaceHitEffectFromEffectSnapshot(event.effect)
  };
}

function createRaceBananaHitEventFromEffectEvent(
  event: KartBananaHitEffectEventMessage
): RaceBananaHitEvent {
  return {
    eventId: event.eventId,
    itemType: "banana",
    bananaId: event.bananaId,
    sourceRacerId: event.source.racerId,
    sourceSlotIndex: event.source.slotIndex,
    targetRacerId: event.target.racerId,
    targetSlotIndex: event.target.slotIndex,
    tickIndex: event.tickIndex,
    elapsedSeconds: event.elapsedSeconds,
    impact: createRaceHitImpactFromEffectSnapshot(event.impact),
    effect: createRaceHitEffectFromEffectSnapshot(event.effect)
  };
}

function createRaceHitImpactFromEffectSnapshot(
  impact: KartEffectImpactSnapshot
): RaceShellHitEvent["impact"] {
  return {
    position: impact.position,
    normal: impact.normal,
    shellPosition: impact.objectPosition,
    shellVelocity: impact.objectVelocity,
    shellRadius: impact.objectRadius,
    targetHitboxCenter: impact.targetHitboxCenter,
    penetrationDepth: impact.penetrationDepth,
    relativeSpeed: impact.relativeSpeed
  };
}

function createRaceHitEffectFromEffectSnapshot(
  effect: KartEffectHitEffectSnapshot
): RaceShellHitEvent["effect"] {
  return {
    itemType: effect.itemType,
    stunSeconds: effect.stunSeconds,
    spinoutSeconds: effect.spinoutSeconds,
    spinoutAngularVelocity: effect.spinoutAngularVelocity,
    hitImmunitySeconds: effect.hitImmunitySeconds,
    hitFeedbackSeconds: effect.hitFeedbackSeconds,
    speedFactor: effect.speedFactor,
    speedBeforeHit: effect.speedBeforeHit,
    speedAfterHit: effect.speedAfterHit,
    headingDeltaRadians: effect.headingDeltaRadians,
    blockedByShield: effect.blockedByShield,
    shieldSecondsBeforeHit: effect.shieldSecondsBeforeHit,
    shieldSecondsAfterHit: effect.shieldSecondsAfterHit
  };
}

function acceptRemoteRaceStateSnapshot(
  snapshot: KartRaceStateSnapshot,
  hostPeerId: SignalingPeerId
): void {
  if (activeGuestPeerConnection === null) {
    console.warn("Ignoring non-host race-state snapshot packet.");
    return;
  }

  if (snapshot.hostPeerId !== hostPeerId) {
    console.warn("Race-state snapshot came from an unexpected host peer.");
    return;
  }

  const result = getRemoteRaceStateSnapshotSynchronizer(hostPeerId).accept(
    snapshot,
    performance.now()
  );

  if (!result.accepted) {
    if (shouldReportRemotePacketRejection(result.reason)) {
      console.warn(result.message);
    }

    return;
  }

  authoritativeRaceStandings = createRaceStandingsFromRaceStateSnapshot(
    result.snapshot
  );
  acceptRemoteRaceStateTransformSnapshot(result.snapshot, hostPeerId);
  scheduleRender();
}

function acceptRemoteBananaSpawnEvent(
  event: KartBananaSpawnEventMessage,
  hostPeerId: SignalingPeerId
): void {
  if (activeGuestPeerConnection === null) {
    console.warn("Ignoring non-host banana spawn event packet.");
    return;
  }

  if (event.ownerPlayerId !== hostPeerId) {
    console.warn("Banana spawn event came from an unexpected host peer.");
    return;
  }

  rememberAuthoritativeBananaSpawnRenderEvent(event);
  const isLocal = event.ownerRacerId === getLocalHumanRacerId();
  const nowSeconds = getCurrentAnimationSeconds();
  const hasRecentLocalCue =
    isLocal &&
    hasActiveCombatFeedbackEventForKeyPrefix(
      `banana-drop:local:${event.ownerRacerId}:`,
      nowSeconds
    );

  registerCombatFeedbackEvent({
    key: `banana-drop:${event.bananaId}`,
    kind: "banana-drop",
    itemType: "banana",
    label: "BANANA",
    position: event.position,
    direction: event.velocity,
    startedAtSeconds: nowSeconds,
    isLocal,
    playSound: isLocal && !hasRecentLocalCue
  });

  if (
    raceSession.applyBananaSpawnEvent(
      createRaceBananaSpawnEventFromMessage(event)
    )
  ) {
    scheduleRender();
  }
}

function acceptRemoteBananaCollisionEvent(
  event: KartBananaCollisionEventMessage,
  hostPeerId: SignalingPeerId
): void {
  if (activeGuestPeerConnection === null) {
    console.warn("Ignoring non-host banana collision event packet.");
    return;
  }

  if (event.ownerPlayerId !== hostPeerId) {
    console.warn("Banana collision event came from an unexpected host peer.");
    return;
  }

  rememberAuthoritativeBananaRemovalRenderEvent(event.bananaId);

  const raceEvent = createRaceBananaHitEventFromMessage(event);
  const appliedHit = raceSession.applyBananaHitEvent(raceEvent);
  const appliedRemoval = appliedHit
    ? false
    : raceSession.applyBananaRemovalEvent({
        eventId: `${event.eventId}:removal`,
        itemType: "banana",
        bananaId: event.bananaId,
        ownerRacerId: event.ownerRacerId,
        ownerSlotIndex: event.ownerSlotIndex,
        tickIndex: event.tickIndex,
        elapsedSeconds: event.elapsedSeconds,
        reason: "collision",
        collisionEventId: event.eventId,
        collidedRacerId: event.targetRacerId
      });

  if (appliedHit || appliedRemoval) {
    if (appliedHit) {
      synchronizeAuthoritativeItemHitPresentation(raceEvent);
    }
    scheduleRender();
  }
}

function acceptRemoteBananaRemovalEvent(
  event: KartBananaRemovalEventMessage,
  hostPeerId: SignalingPeerId
): void {
  if (activeGuestPeerConnection === null) {
    console.warn("Ignoring non-host banana removal event packet.");
    return;
  }

  if (event.ownerPlayerId !== hostPeerId) {
    console.warn("Banana removal event came from an unexpected host peer.");
    return;
  }

  rememberAuthoritativeBananaRemovalRenderEvent(event.bananaId);

  if (
    raceSession.applyBananaRemovalEvent(
      createRaceBananaRemovalEventFromMessage(event)
    )
  ) {
    scheduleRender();
    return;
  }

  scheduleRender();
}

function acceptRemoteKartInputSnapshot(
  data: unknown,
  remotePeerId: SignalingPeerId
): void {
  const remoteRacerId = getHumanRacerIdForPeer(remotePeerId);

  if (remoteRacerId === null) {
    console.warn("Remote input snapshot came from an unassigned peer.");
    return;
  }

  const result = getRemoteInputSnapshotBuffer(
    remotePeerId,
    remoteRacerId
  ).accept(data);

  if (!result.accepted && shouldReportRemotePacketRejection(result.reason)) {
    console.warn(result.message);
  }
}

function acceptRemoteKartInputDelta(
  packet: KartRemoteInputDeltaPacket,
  remotePeerId: SignalingPeerId
): void {
  const remoteRacerId = getHumanRacerIdForPeer(remotePeerId);

  if (remoteRacerId === null) {
    console.warn("Remote input delta came from an unassigned peer.");
    return;
  }

  if (packet.peerId !== remotePeerId) {
    console.warn("Remote input delta came from an unexpected peer.");
    return;
  }

  if (packet.racerId !== remoteRacerId) {
    console.warn("Remote input delta came from an unexpected racer.");
    return;
  }

  if (localSignalingPeerId !== null && packet.peerId === localSignalingPeerId) {
    return;
  }

  if (activeHostPeerConnection === null) {
    return;
  }

  const result = getRemoteInputDeltaQueue(remotePeerId, remoteRacerId).accept(
    packet
  );

  if (!result.accepted && shouldReportRemotePacketRejection(result.reason)) {
    console.warn(result.message);
  }
}

function acceptRemoteKartTransformSnapshot(
  data: unknown,
  hostPeerId: SignalingPeerId
): void {
  const result = getRemoteTransformSmoother(hostPeerId).accept(
    data,
    performance.now()
  );

  if (result.accepted) {
    handleAcceptedRemoteTransformSnapshot(result.snapshot);
    return;
  }

  if (!result.accepted && shouldReportRemotePacketRejection(result.reason)) {
    console.warn(result.message);
  }
}

function acceptRemoteRaceStateTransformSnapshot(
  snapshot: KartRaceStateSnapshot,
  hostPeerId: SignalingPeerId
): void {
  if (snapshot.racerTransforms.length === 0) {
    return;
  }

  const transformSnapshot = createKartTransformSnapshotFromRaceStateSnapshot(
    snapshot
  );
  const result = getRemoteTransformSmoother(hostPeerId).accept(
    serializeKartTransformSnapshot(transformSnapshot),
    performance.now()
  );

  if (result.accepted) {
    handleAcceptedRemoteTransformSnapshot(result.snapshot);
    return;
  }

  if (shouldReportRemotePacketRejection(result.reason)) {
    console.warn(result.message);
  }
}

function handleAcceptedRemoteTransformSnapshot(
  snapshot: KartTransformSnapshot
): void {
  registerRemoteShellLaunchFeedbacks(snapshot);
  applyAuthoritativePickupCollectionEvents(snapshot.itemPickupCollections);
  applyAuthoritativeBoostActivationEvents(snapshot.boostActivations);
  applyAuthoritativeShellHitEvents(snapshot.shellHits);
  applyAuthoritativeBananaHitEvents(snapshot.bananaHits);
  scheduleRender();
}

function acceptRemoteOwnedTransformSnapshot(
  snapshot: KartOwnedTransformSnapshot,
  remotePeerId: SignalingPeerId
): void {
  if (snapshot.peerId !== remotePeerId) {
    console.warn("Owned transform snapshot came from an unexpected peer.");
    return;
  }

  const expectedRacerId = getHumanRacerIdForPeer(remotePeerId);

  if (expectedRacerId === null) {
    console.warn("Owned transform snapshot came from an unassigned peer.");
    return;
  }

  if (snapshot.racerId !== expectedRacerId) {
    console.warn("Owned transform snapshot racer did not match its peer.");
  }
}

function acceptRemoteAuthoritativePlayerSnapshot(
  snapshot: KartAuthoritativePlayerSnapshot,
  hostPeerId: SignalingPeerId,
  receivedAt: number = performance.now()
): void {
  if (activeGuestPeerConnection === null) {
    console.warn("Ignoring non-host authoritative player snapshot packet.");
    return;
  }

  if (snapshot.hostPeerId !== hostPeerId) {
    console.warn("Authoritative player snapshot came from an unexpected host peer.");
    return;
  }

  if (localSignalingPeerId === null) {
    console.warn("Authoritative player snapshot arrived before local peer assignment.");
    return;
  }

  if (snapshot.peerId !== localSignalingPeerId) {
    console.warn("Authoritative player snapshot came for a different peer.");
    return;
  }

  const localRacerId = getLocalHumanRacerId();

  if (localRacerId === null) {
    console.warn("Authoritative player snapshot arrived before local racer assignment.");
    return;
  }

  if (snapshot.racerId !== localRacerId) {
    console.warn("Authoritative player snapshot came for a different racer.");
    return;
  }

  const result = getRemoteAuthoritativePlayerSnapshotSynchronizer(
    hostPeerId,
    localSignalingPeerId,
    localRacerId
  ).accept(snapshot, receivedAt);

  if (result.accepted) {
    startAuthoritativePlayerReconciliation(result.snapshot);
    scheduleRender();
    return;
  }

  if (!result.accepted && shouldReportRemotePacketRejection(result.reason)) {
    console.warn(result.message);
  }
}

function registerRemoteShellLaunchFeedbacks(
  snapshot: KartTransformSnapshot
): void {
  const nowSeconds = getCurrentAnimationSeconds();
  const localRacerId = getLocalHumanRacerId();

  for (const item of snapshot.activeItems) {
    if (
      item.type !== "shell" ||
      item.ageSeconds > SHELL_LAUNCH_REMOTE_MAX_AGE_SECONDS ||
      seenShellLaunchItemIds.has(item.itemId)
    ) {
      continue;
    }

    const ownerTransform = snapshot.racers.find(
      (racer) => racer.racerId === item.ownerRacerId
    );
    const direction = normalizePlanarDirection(
      getPlanarVectorMagnitude(item.velocity) > 0
        ? item.velocity
        : ownerTransform?.forward ?? { x: 0, y: 0, z: 1 }
    );
    const origin =
      ownerTransform === undefined
        ? createShellLaunchOriginFromRemoteItem(item, direction)
        : createShellLaunchOrigin(ownerTransform.position, direction);
    const isLocal = item.ownerRacerId === localRacerId;
    const hasRecentLocalCue =
      isLocal &&
      getShellLaunchHudFeedbackForRacer(item.ownerRacerId, nowSeconds) !== null;

    registerShellLaunchFeedback({
      key: item.itemId,
      racerId: item.ownerRacerId,
      itemId: item.itemId,
      origin,
      direction,
      startedAtSeconds: Math.max(0, nowSeconds - item.ageSeconds),
      isLocal,
      playSound: isLocal && !hasRecentLocalCue
    });
  }
}

function applyAuthoritativePickupCollectionEvents(
  events: readonly RaceItemPickupCollectionEvent[]
): void {
  for (const event of events) {
    raceSession.applyItemPickupCollectionEvent(event);
  }
}

function applyAuthoritativeBoostActivationEvents(
  events: readonly RaceBoostActivationEvent[]
): void {
  for (const event of events) {
    raceSession.applyBoostActivationEvent(event);
  }
}

function applyAuthoritativeShellHitEvents(
  events: readonly RaceShellHitEvent[]
): void {
  registerShellProjectileImpactEffectsFromHits(events);

  for (const event of events) {
    if (raceSession.applyShellHitEvent(event)) {
      synchronizeAuthoritativeItemHitPresentation(event);
    }
  }
}

function applyAuthoritativeBananaHitEvents(
  events: readonly RaceBananaHitEvent[]
): void {
  for (const event of events) {
    if (raceSession.applyBananaHitEvent(event)) {
      synchronizeAuthoritativeItemHitPresentation(event);
    }
  }
}

function getReplicatedPickupCollectionsForTick(
  tickResult: RaceSessionTickResult
): readonly RaceItemPickupCollectionEvent[] {
  if (tickResult.itemPickupCollections.length > 0) {
    replicatedPickupCollections.push(...tickResult.itemPickupCollections);
  }

  const earliestElapsedSeconds =
    tickResult.elapsedSeconds - PICKUP_COLLECTION_REPLAY_SECONDS;

  replicatedPickupCollections = replicatedPickupCollections
    .filter((event) => event.elapsedSeconds >= earliestElapsedSeconds)
    .slice(-MAX_REPLICATED_PICKUP_COLLECTIONS);

  return replicatedPickupCollections;
}

function getReplicatedBoostActivationsForTick(
  tickResult: RaceSessionTickResult
): readonly RaceBoostActivationEvent[] {
  if (tickResult.boostActivations.length > 0) {
    replicatedBoostActivations.push(...tickResult.boostActivations);
  }

  const earliestElapsedSeconds =
    tickResult.elapsedSeconds - BOOST_ACTIVATION_REPLAY_SECONDS;

  replicatedBoostActivations = replicatedBoostActivations
    .filter((event) => event.elapsedSeconds >= earliestElapsedSeconds)
    .slice(-MAX_REPLICATED_BOOST_ACTIVATIONS);

  return replicatedBoostActivations;
}

function getReplicatedShellHitsForTick(
  tickResult: RaceSessionTickResult
): readonly RaceShellHitEvent[] {
  if (tickResult.shellHits.length > 0) {
    replicatedShellHits.push(...tickResult.shellHits);
  }

  const earliestElapsedSeconds =
    tickResult.elapsedSeconds - SHELL_HIT_REPLAY_SECONDS;

  replicatedShellHits = replicatedShellHits
    .filter((event) => event.elapsedSeconds >= earliestElapsedSeconds)
    .slice(-MAX_REPLICATED_SHELL_HITS);

  return replicatedShellHits;
}

function getReplicatedBananaSpawnsForTick(
  tickResult: RaceSessionTickResult,
  ownerPlayerId: SignalingPeerId
): readonly KartBananaSpawnEventMessage[] {
  for (const action of tickResult.itemUseActions) {
    if (action.itemType !== "banana" || action.activeItemId === null) {
      continue;
    }

    const banana = raceSession.activeItemStates.find(
      (item) => item.id === action.activeItemId && item.type === "banana"
    );

    if (banana === undefined) {
      continue;
    }

    const eventId = `banana_spawn_${banana.id}`;
    const alreadyReplicated = replicatedBananaSpawns.some(
      (event) => event.eventId === eventId
    );

    if (alreadyReplicated) {
      continue;
    }

    replicatedBananaSpawns.push(
      createKartBananaSpawnEventMessageFromActiveItem({
        item: banana,
        ownerPlayerId,
        eventId,
        tickIndex: tickResult.tickIndex,
        elapsedSeconds: tickResult.elapsedSeconds,
        occurredAt: performance.now()
      })
    );
  }

  const earliestElapsedSeconds =
    tickResult.elapsedSeconds - BANANA_SPAWN_REPLAY_SECONDS;

  replicatedBananaSpawns = replicatedBananaSpawns
    .filter((event) => event.elapsedSeconds >= earliestElapsedSeconds)
    .slice(-MAX_REPLICATED_BANANA_SPAWNS);

  return replicatedBananaSpawns;
}

function getReplicatedBananaCollisionEventsForTick(
  tickResult: RaceSessionTickResult,
  ownerPlayerId: SignalingPeerId
): readonly KartBananaCollisionEventMessage[] {
  for (const hit of tickResult.bananaHits) {
    const alreadyReplicated = replicatedBananaCollisionEvents.some(
      (event) => event.eventId === hit.eventId
    );

    if (alreadyReplicated) {
      continue;
    }

    const targetPlayerId = getHumanPeerIdFromRacerId(hit.targetRacerId);

    replicatedBananaCollisionEvents.push(
      createKartBananaCollisionEventMessageFromRaceEvent({
        event: hit,
        ownerPlayerId,
        ...(targetPlayerId === undefined ? {} : { targetPlayerId }),
        occurredAt: performance.now()
      })
    );
  }

  const earliestElapsedSeconds =
    tickResult.elapsedSeconds - BANANA_HIT_REPLAY_SECONDS;

  replicatedBananaCollisionEvents = replicatedBananaCollisionEvents
    .filter((event) => event.elapsedSeconds >= earliestElapsedSeconds)
    .slice(-MAX_REPLICATED_BANANA_HITS);

  return replicatedBananaCollisionEvents;
}

function getReplicatedBananaRemovalEventsForTick(
  tickResult: RaceSessionTickResult,
  ownerPlayerId: SignalingPeerId
): readonly KartBananaRemovalEventMessage[] {
  for (const removal of tickResult.bananaRemovals) {
    const alreadyReplicated = replicatedBananaRemovalEvents.some(
      (event) => event.eventId === removal.eventId
    );

    if (alreadyReplicated) {
      continue;
    }

    replicatedBananaRemovalEvents.push(
      createKartBananaRemovalEventMessageFromRaceEvent({
        event: removal,
        ownerPlayerId,
        occurredAt: performance.now()
      })
    );
  }

  const earliestElapsedSeconds =
    tickResult.elapsedSeconds - BANANA_REMOVAL_REPLAY_SECONDS;

  replicatedBananaRemovalEvents = replicatedBananaRemovalEvents
    .filter((event) => event.elapsedSeconds >= earliestElapsedSeconds)
    .slice(-MAX_REPLICATED_BANANA_REMOVALS);

  return replicatedBananaRemovalEvents;
}

function getReplicatedBananaHitsForTick(
  tickResult: RaceSessionTickResult
): readonly RaceBananaHitEvent[] {
  if (tickResult.bananaHits.length > 0) {
    replicatedBananaHits.push(...tickResult.bananaHits);
  }

  const earliestElapsedSeconds =
    tickResult.elapsedSeconds - BANANA_HIT_REPLAY_SECONDS;

  replicatedBananaHits = replicatedBananaHits
    .filter((event) => event.elapsedSeconds >= earliestElapsedSeconds)
    .slice(-MAX_REPLICATED_BANANA_HITS);

  return replicatedBananaHits;
}

function getRemoteInputSnapshotBuffer(
  peerId: SignalingPeerId,
  racerId: string
): RemoteKartInputSnapshotBuffer {
  const bufferKey = `${peerId}:${racerId}`;

  if (
    remoteInputSnapshotBuffer !== null &&
    remoteInputSnapshotBufferKey === bufferKey
  ) {
    return remoteInputSnapshotBuffer;
  }

  remoteInputSnapshotBuffer = new RemoteKartInputSnapshotBuffer({
    expectedPeerId: peerId,
    expectedRacerId: racerId
  });
  remoteInputSnapshotBufferKey = bufferKey;

  return remoteInputSnapshotBuffer;
}

function getRemoteInputDeltaQueue(
  peerId: SignalingPeerId,
  racerId: string
): RemoteKartInputDeltaQueue {
  const queueKey = `${peerId}:${racerId}`;
  const existingQueue = remoteInputDeltaQueues.get(queueKey);

  if (existingQueue !== undefined) {
    return existingQueue;
  }

  const queue = new RemoteKartInputDeltaQueue({
    expectedPeerId: peerId,
    expectedRacerId: racerId
  });

  remoteInputDeltaQueues.set(queueKey, queue);

  return queue;
}

function getRemoteTransformSmoother(
  hostPeerId: SignalingPeerId
): RemoteKartTransformSmoother {
  if (
    remoteTransformSmoother !== null &&
    remoteTransformSmootherHostPeerId === hostPeerId
  ) {
    return remoteTransformSmoother;
  }

  remoteTransformSmoother = new RemoteKartTransformSmoother({
    expectedHostPeerId: hostPeerId,
    courseConstraint: {
      road: defaultTrackRoadGeometry,
      racerRadius: RACER_COLLISION_RADIUS
    },
    now: () => performance.now()
  });
  remoteTransformSmootherHostPeerId = hostPeerId;

  return remoteTransformSmoother;
}

function getRemoteRaceStateSnapshotSynchronizer(
  hostPeerId: SignalingPeerId
): RemoteKartRaceStateSnapshotSynchronizer {
  if (
    remoteRaceStateSnapshotSynchronizer !== null &&
    remoteRaceStateSnapshotSynchronizerHostPeerId === hostPeerId
  ) {
    return remoteRaceStateSnapshotSynchronizer;
  }

  remoteRaceStateSnapshotSynchronizer = new RemoteKartRaceStateSnapshotSynchronizer({
    expectedHostPeerId: hostPeerId,
    now: () => performance.now()
  });
  remoteRaceStateSnapshotSynchronizerHostPeerId = hostPeerId;

  return remoteRaceStateSnapshotSynchronizer;
}

function getRemoteAuthoritativePlayerSnapshotSynchronizer(
  hostPeerId: SignalingPeerId,
  peerId: SignalingPeerId,
  racerId: string
): RemoteKartAuthoritativePlayerSnapshotSynchronizer {
  const synchronizerKey = `${hostPeerId}:${peerId}:${racerId}`;

  if (
    remoteAuthoritativePlayerSnapshotSynchronizer !== null &&
    remoteAuthoritativePlayerSnapshotSynchronizerKey === synchronizerKey
  ) {
    return remoteAuthoritativePlayerSnapshotSynchronizer;
  }

  remoteAuthoritativePlayerSnapshotSynchronizer =
    new RemoteKartAuthoritativePlayerSnapshotSynchronizer({
      expectedHostPeerId: hostPeerId,
      expectedPeerId: peerId,
      expectedRacerId: racerId,
      now: () => performance.now()
    });
  remoteAuthoritativePlayerSnapshotSynchronizerKey = synchronizerKey;

  return remoteAuthoritativePlayerSnapshotSynchronizer;
}

function getRemoteAuthoritativePlayerReconciler(): RemoteKartAuthoritativePlayerReconciler {
  if (remoteAuthoritativePlayerReconciler !== null) {
    return remoteAuthoritativePlayerReconciler;
  }

  remoteAuthoritativePlayerReconciler =
    new RemoteKartAuthoritativePlayerReconciler();

  return remoteAuthoritativePlayerReconciler;
}

function getAuthoritativeBananaEventPeerChannels():
  readonly KartBananaEventPeerChannel[] {
  const connection = activeHostPeerConnection;

  if (connection === null) {
    return [];
  }

  return [
    {
      peerId: connection.connectedRemotePeerId ?? "remote-peer",
      send: (payload) =>
        sendGameplayDataChannelPayloadToConnection(connection, payload)
    }
  ];
}

function sendAuthoritativePlayerSnapshotPayload(
  peerId: SignalingPeerId,
  payload: string,
  _snapshot: KartAuthoritativePlayerSnapshot
): boolean {
  return sendSerializedAuthoritativeSnapshotPayload(payload, peerId);
}

function sendAuthoritativeRaceStateSnapshotPayload(
  payload: string,
  _snapshot: KartRaceStateSnapshot
): boolean {
  return sendSerializedAuthoritativeSnapshotPayload(payload);
}

function sendSerializedAuthoritativeSnapshotPayload(
  payload: string,
  expectedPeerId?: SignalingPeerId
): boolean {
  const peerChannel = createActiveHostAuthoritativeSnapshotPeerChannel(
    expectedPeerId
  );

  if (peerChannel === null) {
    return false;
  }

  const broadcastOptions =
    expectedPeerId === undefined
      ? { maxBufferedAmount: MAX_GAMEPLAY_DATA_CHANNEL_BUFFERED_BYTES }
      : {
          expectedPeerId,
          maxBufferedAmount: MAX_GAMEPLAY_DATA_CHANNEL_BUFFERED_BYTES
        };

  return broadcastSerializedKartAuthoritativeSnapshotPayloadToPeer(
    payload,
    peerChannel,
    broadcastOptions
  ).sent;
}

function createActiveHostAuthoritativeSnapshotPeerChannel(
  fallbackPeerId?: SignalingPeerId
): KartAuthoritativeSnapshotPeerChannel | null {
  const connection = activeHostPeerConnection;

  if (connection === null) {
    return null;
  }

  const peerId = connection.connectedRemotePeerId ?? fallbackPeerId;

  if (peerId === undefined) {
    return null;
  }

  return {
    peerId,
    channel: connection.channel,
    send: (payload, options) => connection.send(payload, options)
  };
}

function rememberAcknowledgedRemoteInputSequence(
  peerId: SignalingPeerId,
  racerId: string,
  sequence: number
): void {
  const key = createPeerRacerKey(peerId, racerId);
  const previousSequence = acknowledgedRemoteInputSequencesByPlayer.get(key);

  if (previousSequence === undefined || sequence > previousSequence) {
    acknowledgedRemoteInputSequencesByPlayer.set(key, sequence);
  }
}

function getAcknowledgedRemoteInputSequence(
  peerId: SignalingPeerId,
  racerId: string
): number | null {
  return acknowledgedRemoteInputSequencesByPlayer.get(
    createPeerRacerKey(peerId, racerId)
  ) ?? null;
}

function createPeerRacerKey(peerId: SignalingPeerId, racerId: string): string {
  return `${peerId}:${racerId}`;
}

function sendGameplayDataChannelPayload(payload: string): boolean {
  const connection = activeGuestPeerConnection ?? activeHostPeerConnection;

  if (connection === null) {
    return false;
  }

  return sendGameplayDataChannelPayloadToConnection(connection, payload);
}

function sendGameplayDataChannelPayloadToConnection(
  connection: HostPeerConnection | GuestPeerConnection,
  payload: string
): boolean {
  const channel = connection.channel;

  if (channel === null || channel.readyState !== "open") {
    return false;
  }

  if (channel.bufferedAmount > MAX_GAMEPLAY_DATA_CHANNEL_BUFFERED_BYTES) {
    return false;
  }

  return connection.send(payload, {
    maxBufferedAmount: MAX_GAMEPLAY_DATA_CHANNEL_BUFFERED_BYTES
  });
}

function resetLocalInputSnapshotEmitter(): void {
  localInputSnapshotEmitter = null;
  localInputSnapshotEmitterKey = null;
}

function resetLocalRemoteInputDeltaEmitter(): void {
  localRemoteInputDeltaEmitter = null;
  localRemoteInputDeltaEmitterKey = null;
}

function resetRemoteInputSnapshotBuffer(): void {
  remoteInputSnapshotBuffer?.clear();
  remoteInputSnapshotBuffer = null;
  remoteInputSnapshotBufferKey = null;
}

function resetRemoteInputDeltaQueues(): void {
  remoteInputDeltaQueues.clear();
}

function resetLocalTransformSnapshotEmitter(): void {
  localTransformSnapshotEmitter = null;
  localTransformSnapshotEmitterHostPeerId = null;
}

function resetLocalOwnedTransformSnapshotEmitter(): void {
  localOwnedTransformSnapshotEmitter = null;
  localOwnedTransformSnapshotEmitterKey = null;
}

function resetRemoteOwnedTransformSmoother(): void {
  remoteOwnedTransformSmoother?.clear();
  remoteOwnedTransformSmoother = null;
}

function resetRemoteTransformSmoother(): void {
  remoteTransformSmoother?.clear();
  remoteTransformSmoother = null;
  remoteTransformSmootherHostPeerId = null;
}

function resetLocalItemUseEventEmitter(): void {
  localItemUseEventEmitter = null;
  localItemUseEventEmitterHostPeerId = null;
}

function resetLocalMultiplayerEffectEventEmitter(): void {
  localMultiplayerEffectEventEmitter = null;
  localMultiplayerEffectEventEmitterHostPeerId = null;
}

function resetRemoteMultiplayerEffectEventBuffer(): void {
  if (remoteMultiplayerEffectEventDrainTimer !== null) {
    window.clearTimeout(remoteMultiplayerEffectEventDrainTimer);
    remoteMultiplayerEffectEventDrainTimer = null;
  }

  remoteMultiplayerEffectEventBuffer?.clear();
  remoteMultiplayerEffectEventBuffer = null;
  remoteMultiplayerEffectEventBufferHostPeerId = null;
  replicatedEffectTimingSamples = [];
}

function resetLocalRaceStateSnapshotEmitter(): void {
  localRaceStateSnapshotEmitter = null;
  localRaceStateSnapshotEmitterHostPeerId = null;
}

function resetLocalAuthoritativePlayerSnapshotEmitters(): void {
  authoritativePlayerSnapshotClock.reset();
  localAuthoritativePlayerSnapshotEmitters.clear();
  acknowledgedRemoteInputSequencesByPlayer.clear();
}

function resetRemoteAuthoritativePlayerSnapshotSynchronizer(): void {
  remoteAuthoritativePlayerSnapshotSynchronizer?.clear();
  remoteAuthoritativePlayerSnapshotSynchronizer = null;
  remoteAuthoritativePlayerSnapshotSynchronizerKey = null;
  remoteAuthoritativePlayerReconciler?.clear();
  remoteAuthoritativePlayerReconciler = null;
}

function resetRemoteRaceStateSnapshotSynchronizer(): void {
  remoteRaceStateSnapshotSynchronizer?.clear();
  remoteRaceStateSnapshotSynchronizer = null;
  remoteRaceStateSnapshotSynchronizerHostPeerId = null;
}

function resetAuthoritativeRaceStateSnapshot(): void {
  authoritativeRaceStandings = null;
}

function resetReplicatedPickupCollections(): void {
  replicatedPickupCollections = [];
}

function resetReplicatedBoostActivations(): void {
  replicatedBoostActivations = [];
}

function resetReplicatedShellHits(): void {
  replicatedShellHits = [];
}

function resetAuthoritativeItemCollisionOutcomeEmissions(): void {
  authoritativeItemCollisionOutcomeSequence = 0;
  emittedItemCollisionOutcomeKeys.clear();
  emittedItemCollisionOutcomeKeyOrder.length = 0;
}

function resetReplicatedBananaSpawns(): void {
  replicatedBananaSpawns = [];
}

function resetReplicatedBananaCollisionEvents(): void {
  replicatedBananaCollisionEvents = [];
}

function resetReplicatedBananaRemovalEvents(): void {
  replicatedBananaRemovalEvents = [];
}

function resetMultiplayerEffectEventState(): void {
  emittedShellLaunchEffectItemIds.clear();
  emittedBananaDropEffectItemIds.clear();
  activeBoostMultiplayerEffectsByRacerId.clear();
  activeSpinoutMultiplayerEffectsByRacerId.clear();
}

function resetAuthoritativeBananaSpawnRenderEvents(): void {
  authoritativeBananaSpawnRenderEvents = [];
}

function resetAuthoritativeBananaRemovalRenderEvents(): void {
  authoritativeRemovedBananaRenderIds.clear();
}

function resetReplicatedBananaHits(): void {
  replicatedBananaHits = [];
}

function resetBoostParticleTrails(): void {
  boostParticleTrailStates.clear();
  lastBoostParticleTrailUpdateSeconds = null;
}

function resetRacerSpinoutVisualStates(): void {
  racerSpinoutVisualStates.clear();
}

function shouldReportRemotePacketRejection(
  reason: string
): boolean {
  return (
    reason !== "duplicate-event" &&
    reason !== "duplicate-sequence" &&
    reason !== "out-of-order-sequence" &&
    reason !== "stale-sequence" &&
    reason !== "late-event"
  );
}

function getHumanRacerForPeer(
  peerId: SignalingPeerId
): RaceSessionRacerState | null {
  return (
    raceSession.humanRacerStates.find((racer) => racer.peerId === peerId) ??
    null
  );
}

function getHumanRacerIdForPeer(peerId: SignalingPeerId): string | null {
  return getHumanRacerForPeer(peerId)?.id ?? null;
}

function getHumanPeerIdFromRacerId(racerId: string): SignalingPeerId | undefined {
  const racer = raceSession.getRacerState(racerId);

  return racer?.controller === "human" && racer.peerId !== null
    ? racer.peerId
    : undefined;
}

function updateWebRtcConnectionStatus(state: RTCPeerConnectionState): void {
  if (state === "connected") {
    applyMultiplayerConnectionEvent({
      type: "connected",
      transport: "webrtc",
      message: "WebRTC peer connected"
    });
    return;
  }

  if (state === "connecting" || state === "new") {
    applyMultiplayerConnectionEvent({
      type: "connecting",
      transport: "webrtc",
      message: "WebRTC peer connecting"
    });
    return;
  }

  if (state === "failed") {
    handlePeerTransportFailed("WebRTC peer connection failed");
    return;
  }

  if (state === "disconnected") {
    handlePeerTransportLost("WebRTC peer disconnected");
  }
}

function updateWebRtcIceStatus(state: RTCIceConnectionState): void {
  if (state === "checking") {
    applyMultiplayerConnectionEvent({
      type: "connecting",
      transport: "webrtc",
      message: "Checking WebRTC ICE"
    });
    return;
  }

  if (state === "failed") {
    handlePeerTransportFailed("WebRTC ICE failed");
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
