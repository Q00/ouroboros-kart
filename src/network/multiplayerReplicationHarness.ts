import type { Vector3 } from "../config/aiRacers";
import { DEFAULT_TRACK_DEFINITION } from "../config/tracks";
import {
  COMBAT_ITEM_REGISTRY,
  createRaceSessionFromStartRoster,
  refreshRacerCollisionBounds,
  type BananaObstacleState,
  type CombatItemType,
  type RaceBananaHitEvent,
  type RaceItemUseAction,
  type RaceSession,
  type RaceSessionRacerState,
  type RaceSessionTickResult,
  type RaceShellHitEvent,
  type ShellProjectileState
} from "../race/raceSession";
import {
  createMultiplayerRaceStartRoster,
  type HumanRaceStartRacerInput
} from "../race/raceStartRoster";
import {
  dispatchKartGameplayMessage,
  deserializeKartGameplayMessage,
  serializeKartGameplayMessage,
  type KartGameplayMessageDispatchContext
} from "./gameplayMessage";
import {
  KART_MULTIPLAYER_EFFECT_EVENT_KINDS,
  LocalKartMultiplayerEffectEventEmitter,
  RemoteKartMultiplayerEffectEventBuffer,
  type KartBananaDropEffectEventMessage,
  type KartBananaHitEffectEventMessage,
  type KartBoostEndEffectEventMessage,
  type KartBoostStartEffectEventMessage,
  type KartEffectHitEffectSnapshot,
  type KartEffectImpactSnapshot,
  type KartEffectParticipantSnapshot,
  type KartMultiplayerEffectEventReplicationTiming,
  type KartMultiplayerEffectEventKind,
  type KartMultiplayerEffectEventMessage,
  type KartShellHitEffectEventMessage,
  type KartShellLaunchEffectEventMessage,
  type KartSpinoutEndEffectEventMessage,
  type KartSpinoutStartEffectEventMessage
} from "./kartEffectEventMessage";
import {
  createKartItemCollisionOutcomeEventMessageFromBananaHitEvent,
  createKartItemCollisionOutcomeEventMessageFromShellHitEvent,
  createRaceBananaHitEventFromItemCollisionOutcomeMessage,
  createRaceShellHitEventFromItemCollisionOutcomeMessage,
  type KartItemCollisionOutcomeEventMessage
} from "./kartItemCollisionOutcomeEventMessage";
import { LocalKartItemUseEventEmitter } from "./kartItemUseMessage";

const HOST_PEER_ID = "host-peer";
const GUEST_PEER_ID = "guest-peer";
const HOST_TO_GUEST_DELAYS_MS = [72, 32, 32, 80, 40, 64] as const;
const HOST_ACTION_GAP_MS = 16;
const EFFECT_REORDER_WINDOW_SECONDS = 0.08;
const EFFECT_LATE_TOLERANCE_SECONDS = 0.35;
export const REPLICATED_EFFECT_LATENCY_TARGET_MS = 150;

type ReplicatedCombatItemType = Exclude<CombatItemType, "boost">;

export interface DeterministicMultiplayerReplicationHarnessOptions {
  readonly hostToGuestDelaysMs?: readonly number[];
  readonly hostActionGapMs?: number;
  readonly effectReorderWindowSeconds?: number;
  readonly effectLateToleranceSeconds?: number;
  readonly effectReplicationTargetMs?: number;
}

export interface DeterministicMultiplayerReplicationHarnessResult {
  readonly manualBrowserCoordinationRequired: false;
  readonly hostPeerId: string;
  readonly guestPeerId: string;
  readonly humanRacerCount: number;
  readonly aiRacerCount: number;
  readonly scenarios: readonly MultiplayerReplicationScenarioResult[];
  readonly maxObservedOneWayLatencyMs: number;
  readonly effectReplicationLatencyReport: MultiplayerEffectReplicationLatencyReport;
}

export interface MultiplayerEffectReplicationLatencyReport {
  readonly sessionMode: "deterministic-simulated-2-player";
  readonly targetLatencyMs: number;
  readonly humanRacerCount: number;
  readonly aiRacerCount: number;
  readonly scenarioCount: number;
  readonly sampleCount: number;
  readonly maxLatencyMs: number;
  readonly averageLatencyMs: number;
  readonly p95LatencyMs: number;
  readonly withinTarget: boolean;
  readonly scenarios: readonly MultiplayerEffectReplicationLatencyScenarioReport[];
  readonly violations: readonly MultiplayerEffectReplicationLatencySampleReport[];
}

export interface MultiplayerEffectReplicationLatencyScenarioReport {
  readonly itemType: ReplicatedCombatItemType;
  readonly targetLatencyMs: number;
  readonly sampleCount: number;
  readonly maxLatencyMs: number;
  readonly averageLatencyMs: number;
  readonly p95LatencyMs: number;
  readonly withinTarget: boolean;
  readonly samples: readonly MultiplayerEffectReplicationLatencySampleReport[];
  readonly violations: readonly MultiplayerEffectReplicationLatencySampleReport[];
}

export interface MultiplayerEffectReplicationLatencySampleReport {
  readonly itemType: ReplicatedCombatItemType;
  readonly eventId: string;
  readonly effectEventKind: KartMultiplayerEffectEventKind;
  readonly sequence: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly sentAt: number;
  readonly receivedAt: number;
  readonly latencyMs: number;
  readonly targetLatencyMs: number;
  readonly overTargetByMs: number;
  readonly withinTarget: boolean;
}

export interface MultiplayerReplicationScenarioResult {
  readonly itemType: ReplicatedCombatItemType;
  readonly sentGameplayPackets: number;
  readonly deliveredGameplayPackets: number;
  readonly itemUseEventsReceived: number;
  readonly itemCollisionOutcomeEventsReceived: number;
  readonly itemCollisionOutcomeEventsApplied: number;
  readonly effectEventsAccepted: number;
  readonly effectEventsRejected: number;
  readonly effectEventsDrained: number;
  readonly effectEventsAppliedToRaceState: number;
  readonly maxOneWayLatencyMs: number;
  readonly maxEffectReplicationLatencyMs: number;
  readonly effectReplicationTimings: readonly KartMultiplayerEffectEventReplicationTiming[];
  readonly deliveredEffectKinds: readonly KartMultiplayerEffectEventKind[];
  readonly appliedEffectKinds: readonly KartMultiplayerEffectEventKind[];
  readonly hostTargetSpinoutSeconds: number;
  readonly guestTargetSpinoutSeconds: number;
  readonly guestLastHitItemType: ReplicatedCombatItemType | null;
  readonly guestBananaHazardRemoved: boolean;
  readonly guestShellLaunchObserved: boolean;
}

interface ReplicationScenarioRuntime {
  readonly host: MultiplayerClientState;
  readonly guest: MultiplayerClientState;
  readonly network: DeterministicLatencyDataChannel;
  readonly guestReceiver: GuestGameplayPacketReceiver;
  readonly effectEmitter: LocalKartMultiplayerEffectEventEmitter;
  readonly itemUseEmitter: LocalKartItemUseEventEmitter;
}

interface MultiplayerClientState {
  readonly session: RaceSession;
  readonly owner: RaceSessionRacerState;
  readonly target: RaceSessionRacerState;
}

interface ScheduledGameplayPacket {
  readonly payload: string;
  readonly sentAtMs: number;
  readonly deliverAtMs: number;
  readonly order: number;
}

interface DeliveredGameplayPacket {
  readonly payload: string;
  readonly sentAtMs: number;
  readonly deliveredAtMs: number;
  readonly latencyMs: number;
}

interface GuestGameplayPacketReceiverStats {
  readonly itemUseEventsReceived: number;
  readonly itemCollisionOutcomeEventsReceived: number;
  readonly itemCollisionOutcomeEventsApplied: number;
  readonly effectEventsAccepted: number;
  readonly effectEventsRejected: number;
  readonly effectEventsDrained: number;
  readonly effectEventsAppliedToRaceState: number;
  readonly maxEffectReplicationLatencyMs: number;
  readonly effectReplicationTimings: readonly KartMultiplayerEffectEventReplicationTiming[];
  readonly deliveredEffectKinds: readonly KartMultiplayerEffectEventKind[];
  readonly appliedEffectKinds: readonly KartMultiplayerEffectEventKind[];
  readonly guestShellLaunchObserved: boolean;
}

export function runDeterministicMultiplayerReplicationHarness(
  options: DeterministicMultiplayerReplicationHarnessOptions = {}
): DeterministicMultiplayerReplicationHarnessResult {
  const shell = runReplicationScenario("shell", options);
  const banana = runReplicationScenario("banana", options);
  const scenarios = [shell, banana] as const;
  const humanRacerCount = 2;
  const aiRacerCount = 2;
  const effectLatencyTargetMs = normalizeLatencyTargetMs(
    options.effectReplicationTargetMs
  );
  const effectReplicationLatencyReport =
    createMultiplayerEffectReplicationLatencyReport({
      scenarios,
      targetLatencyMs: effectLatencyTargetMs,
      humanRacerCount,
      aiRacerCount
    });

  return {
    manualBrowserCoordinationRequired: false,
    hostPeerId: HOST_PEER_ID,
    guestPeerId: GUEST_PEER_ID,
    humanRacerCount,
    aiRacerCount,
    scenarios,
    maxObservedOneWayLatencyMs: Math.max(
      ...scenarios.map((scenario) => scenario.maxOneWayLatencyMs)
    ),
    effectReplicationLatencyReport
  };
}

function createMultiplayerEffectReplicationLatencyReport(options: {
  readonly scenarios: readonly MultiplayerReplicationScenarioResult[];
  readonly targetLatencyMs: number;
  readonly humanRacerCount: number;
  readonly aiRacerCount: number;
}): MultiplayerEffectReplicationLatencyReport {
  const scenarioReports = options.scenarios.map((scenario) =>
    createMultiplayerEffectReplicationLatencyScenarioReport(
      scenario,
      options.targetLatencyMs
    )
  );
  const samples = scenarioReports.flatMap((scenario) => scenario.samples);
  const latencies = samples.map((sample) => sample.latencyMs);
  const violations = scenarioReports.flatMap((scenario) => scenario.violations);

  return {
    sessionMode: "deterministic-simulated-2-player",
    targetLatencyMs: options.targetLatencyMs,
    humanRacerCount: options.humanRacerCount,
    aiRacerCount: options.aiRacerCount,
    scenarioCount: scenarioReports.length,
    sampleCount: samples.length,
    maxLatencyMs: calculateMaxLatencyMs(latencies),
    averageLatencyMs: calculateAverageLatencyMs(latencies),
    p95LatencyMs: calculateP95LatencyMs(latencies),
    withinTarget: violations.length === 0,
    scenarios: scenarioReports,
    violations
  };
}

function createMultiplayerEffectReplicationLatencyScenarioReport(
  scenario: MultiplayerReplicationScenarioResult,
  targetLatencyMs: number
): MultiplayerEffectReplicationLatencyScenarioReport {
  const samples = scenario.effectReplicationTimings.map((timing) =>
    createMultiplayerEffectReplicationLatencySampleReport(
      scenario.itemType,
      timing,
      targetLatencyMs
    )
  );
  const latencies = samples.map((sample) => sample.latencyMs);
  const violations = samples.filter((sample) => !sample.withinTarget);

  return {
    itemType: scenario.itemType,
    targetLatencyMs,
    sampleCount: samples.length,
    maxLatencyMs: calculateMaxLatencyMs(latencies),
    averageLatencyMs: calculateAverageLatencyMs(latencies),
    p95LatencyMs: calculateP95LatencyMs(latencies),
    withinTarget: violations.length === 0,
    samples,
    violations
  };
}

function createMultiplayerEffectReplicationLatencySampleReport(
  itemType: ReplicatedCombatItemType,
  timing: KartMultiplayerEffectEventReplicationTiming,
  targetLatencyMs: number
): MultiplayerEffectReplicationLatencySampleReport {
  const latencyMs = Math.max(0, timing.latencyMs);

  return {
    itemType,
    eventId: timing.eventId,
    effectEventKind: timing.effectEventKind,
    sequence: timing.sequence,
    tickIndex: timing.tickIndex,
    elapsedSeconds: timing.elapsedSeconds,
    sentAt: timing.sentAt,
    receivedAt: timing.receivedAt,
    latencyMs,
    targetLatencyMs,
    overTargetByMs: Math.max(0, latencyMs - targetLatencyMs),
    withinTarget: latencyMs <= targetLatencyMs
  };
}

function normalizeLatencyTargetMs(targetLatencyMs: number | undefined): number {
  const normalizedTargetMs =
    targetLatencyMs ?? REPLICATED_EFFECT_LATENCY_TARGET_MS;

  if (!Number.isFinite(normalizedTargetMs) || normalizedTargetMs <= 0) {
    throw new Error("Effect replication latency target must be a positive number.");
  }

  return normalizedTargetMs;
}

function calculateMaxLatencyMs(latencies: readonly number[]): number {
  return latencies.reduce(
    (maxLatencyMs, latencyMs) => Math.max(maxLatencyMs, latencyMs),
    0
  );
}

function calculateAverageLatencyMs(latencies: readonly number[]): number {
  if (latencies.length === 0) {
    return 0;
  }

  return (
    latencies.reduce((totalLatencyMs, latencyMs) => totalLatencyMs + latencyMs, 0) /
    latencies.length
  );
}

function calculateP95LatencyMs(latencies: readonly number[]): number {
  if (latencies.length === 0) {
    return 0;
  }

  const sortedLatencies = [...latencies].sort((left, right) => left - right);
  const index = Math.min(
    sortedLatencies.length - 1,
    Math.max(0, Math.ceil(sortedLatencies.length * 0.95) - 1)
  );

  return sortedLatencies[index] ?? 0;
}

function runReplicationScenario(
  itemType: ReplicatedCombatItemType,
  options: DeterministicMultiplayerReplicationHarnessOptions
): MultiplayerReplicationScenarioResult {
  const runtime = createReplicationScenarioRuntime(options);
  const launchTick = spawnHeldValidationItem(
    runtime.host.session,
    runtime.host.owner,
    itemType
  );

  emitItemUseEvents(launchTick.itemUseActions, runtime.itemUseEmitter);
  emitItemLaunchEffectEvents(runtime.host.session, launchTick, runtime.effectEmitter);
  runtime.network.elapse(options.hostActionGapMs ?? HOST_ACTION_GAP_MS);
  prepareRacerForItemCollision(runtime.host.owner, 7);
  prepareRacerForItemCollision(runtime.guest.owner, 7);
  prepareCollisionTarget(runtime.host.target);
  prepareCollisionTarget(runtime.guest.target);
  resolveHostItemCollision(runtime.host, itemType);

  const collisionTick = runtime.host.session.tick(0);

  emitItemCollisionOutcomeEvents(collisionTick, runtime.network);
  emitItemHitEffectEvents(collisionTick, runtime.effectEmitter);
  runtime.network.flush((packet) => {
    runtime.guestReceiver.receive(packet);
  });
  runtime.guestReceiver.flushEffectBuffer();

  return createReplicationScenarioResult(itemType, runtime);
}

function createReplicationScenarioRuntime(
  options: DeterministicMultiplayerReplicationHarnessOptions
): ReplicationScenarioRuntime {
  const hostSession = createHarnessRaceSession();
  const guestSession = createHarnessRaceSession();
  const host = createMultiplayerClientState(hostSession, "host");
  const guest = createMultiplayerClientState(guestSession, "guest");
  const network = new DeterministicLatencyDataChannel(
    options.hostToGuestDelaysMs ?? HOST_TO_GUEST_DELAYS_MS
  );
  const guestReceiver = new GuestGameplayPacketReceiver(guest.session, {
    effectReorderWindowSeconds:
      options.effectReorderWindowSeconds ?? EFFECT_REORDER_WINDOW_SECONDS,
    effectLateToleranceSeconds:
      options.effectLateToleranceSeconds ?? EFFECT_LATE_TOLERANCE_SECONDS,
    now: () => network.nowMs
  });
  const effectEmitter = new LocalKartMultiplayerEffectEventEmitter({
    hostPeerId: HOST_PEER_ID,
    now: () => network.nowMs,
    send: (payload) => network.sendHostToGuest(payload)
  });
  const itemUseEmitter = new LocalKartItemUseEventEmitter({
    hostPeerId: HOST_PEER_ID,
    now: () => network.nowMs,
    send: (payload) => network.sendHostToGuest(payload)
  });

  return {
    host,
    guest,
    network,
    guestReceiver,
    effectEmitter,
    itemUseEmitter
  };
}

function createHarnessRaceSession(): RaceSession {
  return createRaceSessionFromStartRoster(
    createMultiplayerRaceStartRoster(createHumanRacerInputs()),
    {
      obstacles: [],
      itemPickups: []
    }
  );
}

function createMultiplayerClientState(
  session: RaceSession,
  label: string
): MultiplayerClientState {
  return {
    session,
    owner: requireRacerState(session.humanRacerStates[0], `${label} owner`),
    target: requireRacerState(session.humanRacerStates[1], `${label} target`)
  };
}

function createHumanRacerInputs(): readonly HumanRaceStartRacerInput[] {
  return [
    {
      peerId: HOST_PEER_ID,
      displayName: "Host",
      slotIndex: 0,
      isHost: true
    },
    {
      peerId: GUEST_PEER_ID,
      displayName: "Guest",
      slotIndex: 1
    }
  ];
}

function spawnHeldValidationItem(
  session: RaceSession,
  owner: RaceSessionRacerState,
  itemType: ReplicatedCombatItemType
): RaceSessionTickResult {
  parkOtherRacersAwayFromItemPath(session, owner.id);
  prepareRacerForItemCollision(owner, 0);
  owner.itemUseCooldownSeconds = 0;
  owner.heldItem = COMBAT_ITEM_REGISTRY[itemType].type;
  session.setHumanInput(owner.id, { useItem: true });

  const tickResult = session.tick(0);

  session.setHumanInput(owner.id, { useItem: false });

  return tickResult;
}

function emitItemUseEvents(
  actions: readonly RaceItemUseAction[],
  emitter: LocalKartItemUseEventEmitter
): void {
  for (const action of actions) {
    emitter.emit(action);
  }
}

function emitItemLaunchEffectEvents(
  session: RaceSession,
  tickResult: RaceSessionTickResult,
  emitter: LocalKartMultiplayerEffectEventEmitter
): void {
  for (const action of tickResult.itemUseActions) {
    if (action.itemType === "shell" && action.activeItemId !== null) {
      const shell = session.shellProjectileStates.find(
        (candidate) => candidate.id === action.activeItemId
      );

      if (shell !== undefined) {
        emitter.emit({
          effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_LAUNCH,
          eventId: `effect_shell_launch_${shell.id}`,
          tickIndex: action.tickIndex,
          elapsedSeconds: action.elapsedSeconds,
          itemType: "shell",
          shellId: shell.id,
          source: createEffectParticipantSnapshot(
            session,
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

    if (action.itemType === "banana" && action.activeItemId !== null) {
      const banana = session.bananaObstacleStates.find(
        (candidate) => candidate.id === action.activeItemId
      );

      if (banana !== undefined) {
        emitter.emit({
          effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_DROP,
          eventId: `effect_banana_drop_${banana.id}`,
          tickIndex: action.tickIndex,
          elapsedSeconds: action.elapsedSeconds,
          itemType: "banana",
          bananaId: banana.id,
          owner: createEffectParticipantSnapshot(
            session,
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
  }
}

function emitItemCollisionOutcomeEvents(
  tickResult: RaceSessionTickResult,
  network: DeterministicLatencyDataChannel
): void {
  let sequence = 0;

  for (const hit of tickResult.shellHits) {
    network.sendHostToGuest(
      serializeKartGameplayMessage(
        createKartItemCollisionOutcomeEventMessageFromShellHitEvent({
          event: hit,
          hostPeerId: HOST_PEER_ID,
          sourceClientId: HOST_PEER_ID,
          sequence,
          occurredAt: network.nowMs
        })
      )
    );
    sequence += 1;
  }

  for (const hit of tickResult.bananaHits) {
    network.sendHostToGuest(
      serializeKartGameplayMessage(
        createKartItemCollisionOutcomeEventMessageFromBananaHitEvent({
          event: hit,
          hostPeerId: HOST_PEER_ID,
          sourceClientId: HOST_PEER_ID,
          sequence,
          occurredAt: network.nowMs
        })
      )
    );
    sequence += 1;
  }
}

function emitItemHitEffectEvents(
  tickResult: RaceSessionTickResult,
  emitter: LocalKartMultiplayerEffectEventEmitter
): void {
  for (const hit of tickResult.shellHits) {
    const source = createEffectParticipantSnapshotFromHitSource(hit);
    const target = createEffectParticipantSnapshotFromHitTarget(hit);

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
    const source = createEffectParticipantSnapshotFromHitSource(hit);
    const target = createEffectParticipantSnapshotFromHitTarget(hit);

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
    readonly sourceItemType: ReplicatedCombatItemType;
    readonly sourceObjectId: string;
    readonly effect: RaceShellHitEvent["effect"];
  },
  emitter: LocalKartMultiplayerEffectEventEmitter
): void {
  if (options.effect.spinoutSeconds <= 0) {
    return;
  }

  const spinoutId =
    `spinout_${options.sourceItemType}_${options.sourceObjectId}_${options.target.racerId}`;

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

function resolveHostItemCollision(
  host: MultiplayerClientState,
  itemType: ReplicatedCombatItemType
): void {
  if (itemType === "shell") {
    const shell = requireShellProjectileState(
      host.session.shellProjectileStates[0],
      "host shell before collision"
    );

    placeShellAtTargetOverlap(shell, host.target);
    return;
  }

  const banana = requireBananaObstacleState(
    host.session.bananaObstacleStates[0],
    "host banana before collision"
  );

  placeBananaAtTargetOverlap(banana, host.target);
}

function createReplicationScenarioResult(
  itemType: ReplicatedCombatItemType,
  runtime: ReplicationScenarioRuntime
): MultiplayerReplicationScenarioResult {
  const stats = runtime.guestReceiver.stats;

  return {
    itemType,
    sentGameplayPackets: runtime.network.sentPacketCount,
    deliveredGameplayPackets: runtime.network.deliveredPacketCount,
    itemUseEventsReceived: stats.itemUseEventsReceived,
    itemCollisionOutcomeEventsReceived: stats.itemCollisionOutcomeEventsReceived,
    itemCollisionOutcomeEventsApplied: stats.itemCollisionOutcomeEventsApplied,
    effectEventsAccepted: stats.effectEventsAccepted,
    effectEventsRejected: stats.effectEventsRejected,
    effectEventsDrained: stats.effectEventsDrained,
    effectEventsAppliedToRaceState: stats.effectEventsAppliedToRaceState,
    maxOneWayLatencyMs: runtime.network.maxObservedOneWayLatencyMs,
    maxEffectReplicationLatencyMs: stats.maxEffectReplicationLatencyMs,
    effectReplicationTimings: stats.effectReplicationTimings,
    deliveredEffectKinds: stats.deliveredEffectKinds,
    appliedEffectKinds: stats.appliedEffectKinds,
    hostTargetSpinoutSeconds: runtime.host.target.spinoutSeconds,
    guestTargetSpinoutSeconds: runtime.guest.target.spinoutSeconds,
    guestLastHitItemType:
      runtime.guest.target.lastHitItemType === "shell" ||
      runtime.guest.target.lastHitItemType === "banana"
        ? runtime.guest.target.lastHitItemType
        : null,
    guestBananaHazardRemoved:
      itemType === "banana" &&
      runtime.guest.session.bananaObstacleStates.length === 0 &&
      runtime.guest.session.activeBananaHazardEntityStates.every(
        (entity) => !entity.active
      ),
    guestShellLaunchObserved: stats.guestShellLaunchObserved
  };
}

class DeterministicLatencyDataChannel {
  private readonly delaysMs: readonly number[];
  private readonly queue: ScheduledGameplayPacket[] = [];
  private nextDelayIndex = 0;
  private nextOrder = 0;
  private deliveredPackets = 0;
  private maxLatencyMs = 0;
  public nowMs = 0;

  public constructor(delaysMs: readonly number[]) {
    if (delaysMs.length === 0 || delaysMs.some((delay) => delay < 0)) {
      throw new Error("Latency harness requires at least one non-negative delay.");
    }

    this.delaysMs = delaysMs;
  }

  public get sentPacketCount(): number {
    return this.nextOrder;
  }

  public get deliveredPacketCount(): number {
    return this.deliveredPackets;
  }

  public get maxObservedOneWayLatencyMs(): number {
    return this.maxLatencyMs;
  }

  public sendHostToGuest(payload: string): boolean {
    const delayMs = this.delaysMs[this.nextDelayIndex % this.delaysMs.length] ?? 0;

    this.queue.push({
      payload,
      sentAtMs: this.nowMs,
      deliverAtMs: this.nowMs + delayMs,
      order: this.nextOrder
    });
    this.nextDelayIndex += 1;
    this.nextOrder += 1;

    return true;
  }

  public elapse(milliseconds: number): void {
    this.nowMs += Math.max(0, milliseconds);
  }

  public flush(receive: (packet: DeliveredGameplayPacket) => void): void {
    while (this.queue.length > 0) {
      this.queue.sort(compareScheduledGameplayPackets);

      const packet = this.queue.shift();

      if (packet === undefined) {
        return;
      }

      this.nowMs = Math.max(this.nowMs, packet.deliverAtMs);

      const deliveredPacket = {
        payload: packet.payload,
        sentAtMs: packet.sentAtMs,
        deliveredAtMs: this.nowMs,
        latencyMs: this.nowMs - packet.sentAtMs
      } satisfies DeliveredGameplayPacket;

      this.maxLatencyMs = Math.max(this.maxLatencyMs, deliveredPacket.latencyMs);
      this.deliveredPackets += 1;
      receive(deliveredPacket);
    }
  }
}

class GuestGameplayPacketReceiver {
  private readonly session: RaceSession;
  private readonly effectBuffer: RemoteKartMultiplayerEffectEventBuffer;
  private readonly effectReorderWindowMs: number;
  private readonly now: () => number;
  private readonly deliveredEffectKinds: KartMultiplayerEffectEventKind[] = [];
  private readonly appliedEffectKinds: KartMultiplayerEffectEventKind[] = [];
  private readonly effectReplicationTimings: KartMultiplayerEffectEventReplicationTiming[] =
    [];
  private itemUseEvents = 0;
  private itemCollisionOutcomeEvents = 0;
  private itemCollisionOutcomeAppliedEvents = 0;
  private effectAcceptedEvents = 0;
  private effectRejectedEvents = 0;
  private effectDrainedEvents = 0;
  private effectStateAppliedEvents = 0;
  private maxEffectReplicationLatency = 0;
  private shellLaunchObserved = false;

  public constructor(
    session: RaceSession,
    options: {
      readonly effectReorderWindowSeconds: number;
      readonly effectLateToleranceSeconds: number;
      readonly now: () => number;
    }
  ) {
    this.session = session;
    this.effectReorderWindowMs = options.effectReorderWindowSeconds * 1000;
    this.now = options.now;
    this.effectBuffer = new RemoteKartMultiplayerEffectEventBuffer({
      expectedHostPeerId: HOST_PEER_ID,
      reorderWindowSeconds: options.effectReorderWindowSeconds,
      lateEventToleranceSeconds: options.effectLateToleranceSeconds,
      now: options.now,
      receiveTimestampNow: options.now
    });
  }

  public get stats(): GuestGameplayPacketReceiverStats {
    return {
      itemUseEventsReceived: this.itemUseEvents,
      itemCollisionOutcomeEventsReceived: this.itemCollisionOutcomeEvents,
      itemCollisionOutcomeEventsApplied: this.itemCollisionOutcomeAppliedEvents,
      effectEventsAccepted: this.effectAcceptedEvents,
      effectEventsRejected: this.effectRejectedEvents,
      effectEventsDrained: this.effectDrainedEvents,
      effectEventsAppliedToRaceState: this.effectStateAppliedEvents,
      maxEffectReplicationLatencyMs: this.maxEffectReplicationLatency,
      effectReplicationTimings: [...this.effectReplicationTimings],
      deliveredEffectKinds: [...this.deliveredEffectKinds],
      appliedEffectKinds: [...this.appliedEffectKinds],
      guestShellLaunchObserved: this.shellLaunchObserved
    };
  }

  public receive(packet: DeliveredGameplayPacket): void {
    const message = deserializeKartGameplayMessage(packet.payload);

    dispatchKartGameplayMessage(
      message,
      {
        onItemUseEvent: (event) => {
          if (event.hostPeerId === HOST_PEER_ID) {
            this.itemUseEvents += 1;
          }
        },
        onItemCollisionOutcomeEvent: (event) => {
          this.acceptItemCollisionOutcomeEvent(event);
        },
        onEffectEvent: (_event, context) => {
          this.acceptEffectEvent(context, packet);
        }
      },
      {
        payload: packet.payload,
        remotePeerId: HOST_PEER_ID,
        receivedAt: packet.deliveredAtMs
      }
    );
  }

  public flushEffectBuffer(): void {
    this.drainEffectBuffer(this.now() + this.effectReorderWindowMs);
  }

  private acceptItemCollisionOutcomeEvent(
    event: KartItemCollisionOutcomeEventMessage
  ): void {
    if (event.hostPeerId !== HOST_PEER_ID) {
      return;
    }

    this.itemCollisionOutcomeEvents += 1;

    if (event.itemType === "shell") {
      const applied = this.session.applyShellHitEvent(
        createRaceShellHitEventFromItemCollisionOutcomeMessage(event)
      );

      if (applied) {
        this.itemCollisionOutcomeAppliedEvents += 1;
      }

      return;
    }

    const applied = this.session.applyBananaHitEvent(
      createRaceBananaHitEventFromItemCollisionOutcomeMessage(event)
    );

    if (applied) {
      this.itemCollisionOutcomeAppliedEvents += 1;
    }
  }

  private acceptEffectEvent(
    context: KartGameplayMessageDispatchContext,
    packet: DeliveredGameplayPacket
  ): void {
    const result = this.effectBuffer.accept(
      context.payload ?? packet.payload,
      packet.deliveredAtMs
    );

    if (!result.accepted) {
      this.effectRejectedEvents += 1;
      return;
    }

    this.effectAcceptedEvents += 1;
    this.drainEffectBuffer(packet.deliveredAtMs);
  }

  private drainEffectBuffer(nowMs: number): void {
    const result = this.effectBuffer.drainReady(nowMs);

    for (const [index, event] of result.events.entries()) {
      const timing = result.timings[index];

      if (timing !== undefined) {
        this.effectReplicationTimings.push(timing);
      }

      this.effectDrainedEvents += 1;
      this.deliveredEffectKinds.push(event.effectEventKind);
      this.maxEffectReplicationLatency = Math.max(
        this.maxEffectReplicationLatency,
        timing?.latencyMs ?? Math.max(0, nowMs - event.sentAt)
      );

      if (this.applyEffectEvent(event)) {
        this.effectStateAppliedEvents += 1;
        this.appliedEffectKinds.push(event.effectEventKind);
      }
    }
  }

  private applyEffectEvent(event: KartMultiplayerEffectEventMessage): boolean {
    switch (event.effectEventKind) {
      case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START:
        return this.applyBoostStartEffectEvent(event);
      case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_END:
        return this.applyBoostEndEffectEvent(event);
      case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_LAUNCH:
        return this.applyShellLaunchEffectEvent(event);
      case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_HIT:
        return this.applyShellHitEffectEvent(event);
      case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_DROP:
        return this.applyBananaDropEffectEvent(event);
      case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_HIT:
        return this.applyBananaHitEffectEvent(event);
      case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_START:
        return this.applySpinoutStartEffectEvent(event);
      case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_END:
        return this.applySpinoutEndEffectEvent(event);
    }
  }

  private applyBoostStartEffectEvent(
    event: KartBoostStartEffectEventMessage
  ): boolean {
    return this.session.applyBoostActivationEvent({
      eventId: event.effectId,
      racerId: event.racer.racerId,
      tickIndex: event.tickIndex,
      elapsedSeconds: event.elapsedSeconds,
      durationSeconds: event.durationSeconds,
      expiresAtElapsedSeconds: event.expiresAtElapsedSeconds,
      cooldownSeconds: 0
    });
  }

  private applyBoostEndEffectEvent(event: KartBoostEndEffectEventMessage): boolean {
    return this.session.applyBoostEffectEndEvent({
      eventId: event.eventId,
      boostActivationEventId: event.effectId,
      racerId: event.racer.racerId,
      tickIndex: event.tickIndex,
      elapsedSeconds: event.elapsedSeconds
    });
  }

  private applyShellLaunchEffectEvent(
    event: KartShellLaunchEffectEventMessage
  ): boolean {
    this.shellLaunchObserved = event.shellId.trim().length > 0;

    return false;
  }

  private applyShellHitEffectEvent(event: KartShellHitEffectEventMessage): boolean {
    return this.session.applyShellHitEvent(createRaceShellHitEventFromEffectEvent(event));
  }

  private applyBananaDropEffectEvent(
    event: KartBananaDropEffectEventMessage
  ): boolean {
    return this.session.applyBananaSpawnEvent({
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
    });
  }

  private applyBananaHitEffectEvent(event: KartBananaHitEffectEventMessage): boolean {
    return this.session.applyBananaHitEvent(
      createRaceBananaHitEventFromEffectEvent(event)
    );
  }

  private applySpinoutStartEffectEvent(
    event: KartSpinoutStartEffectEventMessage
  ): boolean {
    return this.session.applySpinoutEffectStartEvent({
      eventId: event.eventId,
      spinoutId: event.spinoutId,
      targetRacerId: event.target.racerId,
      sourceItemType: event.sourceItemType,
      tickIndex: event.tickIndex,
      elapsedSeconds: event.elapsedSeconds,
      durationSeconds: event.durationSeconds,
      expiresAtElapsedSeconds: event.expiresAtElapsedSeconds,
      spinoutAngularVelocity: event.angularVelocity
    });
  }

  private applySpinoutEndEffectEvent(
    event: KartSpinoutEndEffectEventMessage
  ): boolean {
    return this.session.applySpinoutEffectEndEvent({
      eventId: event.eventId,
      spinoutId: event.spinoutId,
      targetRacerId: event.target.racerId,
      tickIndex: event.tickIndex,
      elapsedSeconds: event.elapsedSeconds
    });
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

function createEffectParticipantSnapshot(
  session: RaceSession,
  racerId: string,
  slotIndex: number
): KartEffectParticipantSnapshot {
  const racer = session.getRacerState(racerId);

  return {
    playerId: racer?.peerId ?? null,
    racerId: racer?.id ?? racerId,
    slotIndex: racer?.slotIndex ?? slotIndex
  };
}

function createEffectParticipantSnapshotFromHitSource(
  hit: RaceShellHitEvent | RaceBananaHitEvent
): KartEffectParticipantSnapshot {
  return {
    playerId: getHumanPeerIdFromRacerId(hit.sourceRacerId),
    racerId: hit.sourceRacerId,
    slotIndex: hit.sourceSlotIndex
  };
}

function createEffectParticipantSnapshotFromHitTarget(
  hit: RaceShellHitEvent | RaceBananaHitEvent
): KartEffectParticipantSnapshot {
  return {
    playerId: getHumanPeerIdFromRacerId(hit.targetRacerId),
    racerId: hit.targetRacerId,
    slotIndex: hit.targetSlotIndex
  };
}

function getHumanPeerIdFromRacerId(racerId: string): string | null {
  if (racerId === "human_1") {
    return HOST_PEER_ID;
  }

  if (racerId === "human_2") {
    return GUEST_PEER_ID;
  }

  return null;
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

function prepareCollisionTarget(target: RaceSessionRacerState): void {
  prepareRacerForItemCollision(target, 2);
  target.headingRadians = 0;
  target.forward = { x: 0, y: 0, z: 1 };
  target.speed = 12;
  target.velocity = { x: 0, y: 0, z: 12 };
  clearItemHitEffects(target);
  refreshRacerCollisionBounds(target);
}

function prepareRacerForItemCollision(
  racer: RaceSessionRacerState,
  centerPointIndex: number
): void {
  const centerPoint = requireTrackCenterPoint(centerPointIndex);

  racer.position = { ...centerPoint.position };
  racer.velocity = { x: 0, y: 0, z: 0 };
  racer.speed = 0;
  racer.headingRadians = 0;
  racer.forward = { x: 0, y: 0, z: 1 };
  refreshRacerCollisionBounds(racer);
}

function placeShellAtTargetOverlap(
  shell: ShellProjectileState,
  target: RaceSessionRacerState
): void {
  const targetBounds = refreshRacerCollisionBounds(target);

  shell.armedSeconds = 0;
  shell.position = {
    x:
      targetBounds.center.x +
      targetBounds.right.x * (targetBounds.halfWidth + shell.radius - 0.05),
    y: targetBounds.center.y,
    z:
      targetBounds.center.z +
      targetBounds.right.z * (targetBounds.halfWidth + shell.radius - 0.05)
  };
  shell.velocity = {
    x: -COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed,
    y: 0,
    z: 0
  };
}

function placeBananaAtTargetOverlap(
  banana: BananaObstacleState,
  target: RaceSessionRacerState
): void {
  const targetBounds = refreshRacerCollisionBounds(target);

  banana.armedSeconds = 0;
  banana.position = {
    x:
      targetBounds.center.x +
      targetBounds.right.x * (targetBounds.halfWidth + banana.radius - 0.05),
    y: targetBounds.center.y,
    z:
      targetBounds.center.z +
      targetBounds.right.z * (targetBounds.halfWidth + banana.radius - 0.05)
  };
  banana.velocity = { x: 0, y: 0, z: 0 };
}

function clearItemHitEffects(racer: RaceSessionRacerState): void {
  racer.stunSeconds = 0;
  racer.spinoutSeconds = 0;
  racer.spinoutAngularVelocity = 0;
  racer.itemHitImmunitySeconds = 0;
  racer.itemHitImmunityWindowSeconds = 0;
  racer.hitFeedbackSeconds = 0;
  racer.lastHitItemType = null;
  racer.recoverySeconds = 0;
  racer.recoveryDurationSeconds = 0;
  racer.recovering = false;
  racer.knockbackVelocity = { x: 0, y: 0, z: 0 };
  racer.hitSourceImmunitySecondsBySource = {};
  delete racer.timedEffects.stun;
  delete racer.timedEffects.spinout;
  delete racer.timedEffects.itemHitImmunity;
  delete racer.timedEffects.hitFeedback;
}

function parkOtherRacersAwayFromItemPath(
  session: RaceSession,
  ownerRacerId: string
): void {
  const parkingPointIndexes = [5, 6, 7] as const;
  let parkingSlot = 0;

  for (const racer of session.racerStates) {
    if (racer.id === ownerRacerId) {
      continue;
    }

    prepareRacerForItemCollision(
      racer,
      parkingPointIndexes[parkingSlot % parkingPointIndexes.length] ?? 5
    );
    parkingSlot += 1;
  }
}

function requireTrackCenterPoint(index: number): {
  readonly position: Vector3;
} {
  const point = DEFAULT_TRACK_DEFINITION.road.centerline[index];

  if (point === undefined) {
    throw new Error(`Expected default track center point ${index}.`);
  }

  return point;
}

function requireRacerState(
  racer: RaceSessionRacerState | undefined,
  label: string
): RaceSessionRacerState {
  if (racer === undefined) {
    throw new Error(`Expected ${label} racer.`);
  }

  return racer;
}

function requireShellProjectileState(
  shell: ShellProjectileState | undefined,
  label: string
): ShellProjectileState {
  if (shell === undefined) {
    throw new Error(`Expected ${label}.`);
  }

  return shell;
}

function requireBananaObstacleState(
  banana: BananaObstacleState | undefined,
  label: string
): BananaObstacleState {
  if (banana === undefined) {
    throw new Error(`Expected ${label}.`);
  }

  return banana;
}

function compareScheduledGameplayPackets(
  left: ScheduledGameplayPacket,
  right: ScheduledGameplayPacket
): number {
  if (left.deliverAtMs !== right.deliverAtMs) {
    return left.deliverAtMs - right.deliverAtMs;
  }

  return left.order - right.order;
}
