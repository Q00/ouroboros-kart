import {
  AI_RACER_CONFIGS,
  assertAiRacerConfigIntegrity,
  createAiRacerConfigFromProfile,
  getStartingGridSpawn,
  type AiBehaviorProfile,
  type AiRacerConfig,
  type AiRacerVisualIdentity,
  type DrivingStats,
  type SpawnPose,
  type Vector3
} from "../config/aiRacers";
import {
  AI_RACER_SLOT_COUNT,
  HUMAN_RACER_SLOT_COUNT,
  RACE_CAPACITY
} from "../config/gameConfig";
import {
  INITIAL_RACER_SLOTS,
  assertRacerSlotIntegrity,
  type RacerSlot
} from "../config/racerSlots";
import { RACE_LAP_COUNT } from "../config/tracks";
import {
  createRaceStartRoster,
  type HumanRaceStartRacerInput,
  type RaceStartHumanRacer,
  type RaceStartRoster
} from "./raceStartRoster";

export type RacePhase =
  | "setup"
  | "countdown"
  | "running"
  | "final-lap"
  | "finished";
export type RegisteredRacerController = "human" | "ai";
export type RaceParticipantRole = "local-human" | "remote-human" | "ai";
export type RaceParticipantLifecycleStatus = "ready" | "racing" | "finished";
export const DEFAULT_RACE_PHASE: RacePhase = "setup";
export const DEFAULT_RACE_LAP_COUNT = RACE_LAP_COUNT;

export interface RacerInputState {
  readonly throttle: number;
  readonly brake: number;
  readonly steer: number;
  readonly drift: boolean;
  readonly useItem: boolean;
}

export interface RacerProgressState {
  /** Completed laps. A racer starts at 0 and finishes at the race lap count. */
  readonly lap: number;
  /** One-based lap for UI/race state display. */
  readonly currentLap: number;
  readonly checkpointIndex: number;
  readonly trackProgress: number;
  /** Normalized 0..1 progress through the full race distance. */
  readonly raceProgress: number;
  readonly finished: boolean;
}

export interface RacerPlacementState {
  readonly rank: number;
  readonly finishPlace: number | null;
  readonly finishTimeSeconds: number | null;
}

export interface RaceParticipantState {
  readonly stableId: string;
  readonly racerId: string;
  readonly slotIndex: number;
  readonly role: RaceParticipantRole;
  readonly controller: RegisteredRacerController;
  readonly displayName: string;
  readonly peerId: string | null;
  readonly isHost: boolean;
  readonly position: Vector3;
  readonly rank: number;
  readonly finishPlace: number | null;
  readonly finishTimeSeconds: number | null;
  readonly lifecycleStatus: RaceParticipantLifecycleStatus;
}

export interface RaceParticipantStateOptions {
  readonly localPeerId?: string | null;
  readonly phase?: RacePhase;
}

export interface RaceParticipantStateSource {
  readonly id: string;
  readonly slotIndex: number;
  readonly controller: RegisteredRacerController;
  readonly displayName: string;
  readonly peerId: string | null;
  readonly isHost: boolean;
  readonly spawn?: SpawnPose;
  readonly position?: Vector3;
  readonly progress: Pick<RacerProgressState, "finished">;
  readonly placement?: Pick<
    RacerPlacementState,
    "rank" | "finishPlace" | "finishTimeSeconds"
  >;
  readonly rank?: number;
  readonly finishPlace?: number | null;
  readonly finishTimeSeconds?: number | null;
}

export interface RaceParticipantStateIndex {
  readonly participants: readonly RaceParticipantState[];
  readonly participantsById: Readonly<Record<string, RaceParticipantState>>;
  readonly participantsBySlot: Readonly<Record<number, RaceParticipantState>>;
}

export interface RegisteredRacerBase {
  readonly slotIndex: number;
  readonly id: string;
  readonly controller: RegisteredRacerController;
  readonly displayName: string;
  readonly peerId: string | null;
  readonly isHost: boolean;
  readonly color: string;
  readonly spawn: SpawnPose;
  readonly input: RacerInputState;
  readonly progress: RacerProgressState;
  readonly placement: RacerPlacementState;
  readonly heldItem: null;
}

export interface HumanRacerInstance extends RegisteredRacerBase {
  readonly controller: "human";
}

export interface AiRacerInstance extends RegisteredRacerBase {
  readonly controller: "ai";
  readonly visual: AiRacerVisualIdentity;
  readonly driving: DrivingStats;
  readonly behavior: AiBehaviorProfile;
}

export type RegisteredRacer = HumanRacerInstance | AiRacerInstance;

export interface RaceState {
  readonly phase: RacePhase;
  readonly lapCount: number;
  readonly slots: readonly RacerSlot[];
  readonly racers: readonly RegisteredRacer[];
  readonly humanRacers: readonly HumanRacerInstance[];
  readonly aiRacers: readonly AiRacerInstance[];
  readonly racersById: Readonly<Record<string, RegisteredRacer>>;
  readonly racersBySlot: Readonly<Record<number, RegisteredRacer>>;
  readonly participants: readonly RaceParticipantState[];
  readonly participantsById: Readonly<Record<string, RaceParticipantState>>;
  readonly participantsBySlot: Readonly<Record<number, RaceParticipantState>>;
}

const DEFAULT_INPUT_STATE: RacerInputState = {
  throttle: 0,
  brake: 0,
  steer: 0,
  drift: false,
  useItem: false
};

const DEFAULT_PROGRESS_STATE: RacerProgressState = {
  lap: 0,
  currentLap: 1,
  checkpointIndex: 0,
  trackProgress: 0,
  raceProgress: 0,
  finished: false
};

const HUMAN_RACER_COLORS = [
  "#f5f7fa",
  "#7cff6b",
  "#ffd166",
  "#ff8bd1"
] as const;

export function createInitialRacerProgressState(): RacerProgressState {
  return { ...DEFAULT_PROGRESS_STATE };
}

export interface RacerProgressStateInput {
  readonly lap?: number;
  readonly currentLap?: number;
  readonly checkpointIndex?: number;
  readonly trackProgress?: number;
  readonly raceProgress?: number;
  readonly finished?: boolean;
}

export interface RacerProgressStateOptions {
  readonly lapCount?: number;
  readonly trackLength?: number;
}

export function createRacerProgressState(
  input: RacerProgressStateInput = {},
  options: RacerProgressStateOptions = {}
): RacerProgressState {
  const lapCount = clampWholeNumber(
    options.lapCount ?? DEFAULT_RACE_LAP_COUNT,
    0,
    Number.MAX_SAFE_INTEGER
  );
  const finished = input.finished ?? false;
  const lap = clampWholeNumber(
    input.lap ?? (finished ? lapCount : DEFAULT_PROGRESS_STATE.lap),
    0,
    lapCount
  );
  const checkpointIndex = clampWholeNumber(
    input.checkpointIndex ?? DEFAULT_PROGRESS_STATE.checkpointIndex,
    0,
    Number.MAX_SAFE_INTEGER
  );
  const trackProgress = Math.max(
    0,
    getFiniteNumber(input.trackProgress, DEFAULT_PROGRESS_STATE.trackProgress)
  );
  const currentLap = clampWholeNumber(
    input.currentLap ?? deriveCurrentRaceLap(lap, finished, lapCount),
    lapCount <= 0 ? 0 : 1,
    Math.max(lapCount, 1)
  );
  const raceProgress = clamp(
    input.raceProgress ??
      deriveRaceProgressRatio(lap, trackProgress, finished, lapCount, options),
    0,
    1
  );

  return {
    lap,
    currentLap,
    checkpointIndex,
    trackProgress,
    raceProgress,
    finished
  };
}

export function createInitialRacerPlacementState(
  slotIndex: number
): RacerPlacementState {
  return {
    rank: slotIndex + 1,
    finishPlace: null,
    finishTimeSeconds: null
  };
}

export interface RaceStateBuilder {
  readonly racers: RegisteredRacer[];
  readonly humanRacers: HumanRacerInstance[];
  readonly aiRacers: AiRacerInstance[];
  readonly racersById: Record<string, RegisteredRacer>;
  readonly racersBySlot: Record<number, RegisteredRacer>;
}

export function createInitialRaceState(
  slots: readonly RacerSlot[] = INITIAL_RACER_SLOTS,
  aiConfigs: readonly AiRacerConfig[] = AI_RACER_CONFIGS
): RaceState {
  const raceSlots = slots.map((slot) => ({ ...slot }));
  assertRacerSlotIntegrity(raceSlots);
  assertAiRacerConfigIntegrity(aiConfigs);

  const builder: RaceStateBuilder = {
    racers: [],
    humanRacers: [],
    aiRacers: [],
    racersById: {},
    racersBySlot: {}
  };

  for (const slot of raceSlots) {
    if (slot.controller === "human") {
      registerRacer(builder, createHumanRacerInstance(slot));
    }
  }

  registerAiRacers(builder, aiConfigs);
  assertRaceStateIntegrity(builder, raceSlots);
  const participantIndex = createRaceParticipantStateIndex(builder.racers, {
    phase: DEFAULT_RACE_PHASE
  });

  return {
    phase: DEFAULT_RACE_PHASE,
    lapCount: DEFAULT_RACE_LAP_COUNT,
    slots: raceSlots,
    racers: builder.racers,
    humanRacers: builder.humanRacers,
    aiRacers: builder.aiRacers,
    racersById: builder.racersById,
    racersBySlot: builder.racersBySlot,
    ...participantIndex
  };
}

export const INITIAL_RACE_STATE = createInitialRaceState();
export const setupRaceState = createInitialRaceState;

export function createRaceStateFromHumanRacers(
  humanRacers: readonly HumanRaceStartRacerInput[]
): RaceState {
  return createRaceStateFromStartRoster(createRaceStartRoster(humanRacers));
}

export function createRaceStateFromStartRoster(
  roster: RaceStartRoster
): RaceState {
  const raceSlots = roster.racers.map((racer) => ({
    slotIndex: racer.slotIndex,
    controller: racer.controller,
    racerId: racer.racerId,
    displayName: racer.displayName
  })) satisfies readonly RacerSlot[];
  const builder: RaceStateBuilder = {
    racers: [],
    humanRacers: [],
    aiRacers: [],
    racersById: {},
    racersBySlot: {}
  };

  for (const racer of roster.racers) {
    if (racer.controller === "human") {
      registerRacer(builder, createHumanRacerInstanceFromRoster(racer));
    } else {
      const config = createAiRacerConfigFromProfile(
        racer.profile,
        racer.slotIndex
      );

      registerRacer(
        builder,
        instantiateAiRacer({
          ...config,
          id: racer.racerId,
          displayName: racer.displayName
        })
      );
    }
  }

  assertRaceStateIntegrity(builder, raceSlots, {
    expectedHumanRacerCount: roster.humanRacerCount,
    expectedAiRacerCount: roster.aiRacerCount
  });
  const participantIndex = createRaceParticipantStateIndex(builder.racers, {
    phase: DEFAULT_RACE_PHASE
  });

  return {
    phase: DEFAULT_RACE_PHASE,
    lapCount: DEFAULT_RACE_LAP_COUNT,
    slots: raceSlots,
    racers: builder.racers,
    humanRacers: builder.humanRacers,
    aiRacers: builder.aiRacers,
    racersById: builder.racersById,
    racersBySlot: builder.racersBySlot,
    ...participantIndex
  };
}

export function resetRaceStatePhase(
  state: RaceState,
  phase: RacePhase = DEFAULT_RACE_PHASE
): RaceState {
  const builder: RaceStateBuilder = {
    racers: [],
    humanRacers: [],
    aiRacers: [],
    racersById: {},
    racersBySlot: {}
  };

  for (const racer of state.racers) {
    registerRacer(builder, resetRegisteredRacerRaceState(racer));
  }

  assertRaceStateIntegrity(builder, state.slots, {
    expectedHumanRacerCount: state.humanRacers.length,
    expectedAiRacerCount: state.aiRacers.length
  });
  const participantIndex = createRaceParticipantStateIndex(builder.racers, {
    phase
  });

  return {
    phase,
    lapCount: state.lapCount,
    slots: state.slots.map((slot) => ({ ...slot })),
    racers: builder.racers,
    humanRacers: builder.humanRacers,
    aiRacers: builder.aiRacers,
    racersById: builder.racersById,
    racersBySlot: builder.racersBySlot,
    ...participantIndex
  };
}

export function createRaceParticipantStateIndex(
  sources: readonly RaceParticipantStateSource[],
  options: RaceParticipantStateOptions = {}
): RaceParticipantStateIndex {
  const participants = sources
    .map((source) => createRaceParticipantState(source, options))
    .sort((left, right) => left.slotIndex - right.slotIndex);
  const participantsById: Record<string, RaceParticipantState> = {};
  const participantsBySlot: Record<number, RaceParticipantState> = {};

  assertRaceParticipantStateIntegrity(participants);

  for (const participant of participants) {
    participantsById[participant.racerId] = participant;
    participantsBySlot[participant.slotIndex] = participant;
  }

  return {
    participants,
    participantsById,
    participantsBySlot
  };
}

export function createRaceParticipantState(
  source: RaceParticipantStateSource,
  options: RaceParticipantStateOptions = {}
): RaceParticipantState {
  const rank = source.rank ?? source.placement?.rank;
  const finishPlace =
    source.finishPlace !== undefined
      ? source.finishPlace
      : source.placement?.finishPlace ?? null;
  const finishTimeSeconds =
    source.finishTimeSeconds !== undefined
      ? source.finishTimeSeconds
      : source.placement?.finishTimeSeconds ?? null;

  if (rank === undefined) {
    throw new Error(`Race participant ${source.id} is missing rank state.`);
  }

  return {
    stableId: requireNonEmptyText(source.id, "participant.id"),
    racerId: requireNonEmptyText(source.id, "participant.id"),
    slotIndex: requireRaceParticipantSlotIndex(source.slotIndex),
    role: resolveRaceParticipantRole(source, options),
    controller: source.controller,
    displayName: requireNonEmptyText(
      source.displayName,
      "participant.displayName"
    ),
    peerId:
      source.peerId === null
        ? null
        : requireNonEmptyText(source.peerId, "participant.peerId"),
    isHost: source.isHost,
    position: cloneRaceParticipantPosition(source),
    rank: requireRaceParticipantRank(rank, source.id),
    finishPlace: normalizeNullableWholeNumber(
      finishPlace,
      "participant.finishPlace"
    ),
    finishTimeSeconds: normalizeNullableFiniteNonNegativeNumber(
      finishTimeSeconds,
      "participant.finishTimeSeconds"
    ),
    lifecycleStatus: resolveRaceParticipantLifecycleStatus(
      source.progress,
      finishPlace,
      options.phase
    )
  };
}

export function resetRegisteredRacerRaceState<T extends RegisteredRacer>(
  racer: T
): T {
  return {
    ...racer,
    input: { ...DEFAULT_INPUT_STATE },
    progress: createInitialRacerProgressState(),
    placement: createInitialRacerPlacementState(racer.slotIndex),
    heldItem: null
  };
}

export function registerAiRacers(
  builder: RaceStateBuilder,
  aiConfigs: readonly AiRacerConfig[] = AI_RACER_CONFIGS
): void {
  for (const config of aiConfigs) {
    registerRacer(builder, instantiateAiRacer(config));
  }
}

export function instantiateAiRacer(config: AiRacerConfig): AiRacerInstance {
  return {
    slotIndex: config.slotIndex,
    id: config.id,
    controller: "ai",
    displayName: config.displayName,
    peerId: null,
    isHost: false,
    color: config.color,
    visual: config.visual,
    spawn: config.spawn,
    driving: config.driving,
    behavior: config.behavior,
    input: { ...DEFAULT_INPUT_STATE },
    progress: createInitialRacerProgressState(),
    placement: createInitialRacerPlacementState(config.slotIndex),
    heldItem: null
  };
}

function createHumanRacerInstance(slot: RacerSlot): HumanRacerInstance {
  return createHumanRacerInstanceFromDetails(
    slot.slotIndex,
    slot.racerId,
    slot.displayName
  );
}

function createHumanRacerInstanceFromRoster(
  racer: RaceStartHumanRacer
): HumanRacerInstance {
  return createHumanRacerInstanceFromDetails(
    racer.slotIndex,
    racer.racerId,
    racer.displayName,
    racer.peerId,
    racer.isHost
  );
}

function createHumanRacerInstanceFromDetails(
  slotIndex: number,
  racerId: string,
  displayName: string,
  peerId: string | null = null,
  isHost = false
): HumanRacerInstance {
  return {
    slotIndex,
    id: racerId,
    controller: "human",
    displayName,
    peerId,
    isHost,
    color: HUMAN_RACER_COLORS[slotIndex] ?? "#f5f7fa",
    spawn: getStartingGridSpawn(slotIndex),
    input: { ...DEFAULT_INPUT_STATE },
    progress: createInitialRacerProgressState(),
    placement: createInitialRacerPlacementState(slotIndex),
    heldItem: null
  };
}

function registerRacer(
  builder: RaceStateBuilder,
  racer: RegisteredRacer
): void {
  if (builder.racersById[racer.id] !== undefined) {
    throw new Error(`Duplicate race-state racer id: ${racer.id}`);
  }

  if (builder.racersBySlot[racer.slotIndex] !== undefined) {
    throw new Error(`Duplicate race-state racer slot: ${racer.slotIndex}`);
  }

  builder.racers.push(racer);
  builder.racersById[racer.id] = racer;
  builder.racersBySlot[racer.slotIndex] = racer;

  if (racer.controller === "ai") {
    builder.aiRacers.push(racer);
  } else {
    builder.humanRacers.push(racer);
  }
}

function assertRaceStateIntegrity(
  builder: RaceStateBuilder,
  slots: readonly RacerSlot[],
  expectations: {
    readonly expectedHumanRacerCount?: number;
    readonly expectedAiRacerCount?: number;
  } = {}
): void {
  const expectedHumanRacerCount =
    expectations.expectedHumanRacerCount ?? HUMAN_RACER_SLOT_COUNT;
  const expectedAiRacerCount =
    expectations.expectedAiRacerCount ?? AI_RACER_SLOT_COUNT;

  if (slots.length !== RACE_CAPACITY) {
    throw new Error(
      `Expected ${RACE_CAPACITY} race-state racer slots, found ${slots.length}.`
    );
  }

  if (builder.racers.length !== RACE_CAPACITY) {
    throw new Error(
      `Expected ${RACE_CAPACITY} registered racers, found ${builder.racers.length}.`
    );
  }

  if (builder.humanRacers.length !== expectedHumanRacerCount) {
    throw new Error(
      `Expected ${expectedHumanRacerCount} registered human racers, found ${builder.humanRacers.length}.`
    );
  }

  if (builder.aiRacers.length !== expectedAiRacerCount) {
    throw new Error(
      `Expected ${expectedAiRacerCount} registered AI racers, found ${builder.aiRacers.length}.`
    );
  }

  assertAiRacerInstanceIntegrity(builder.aiRacers);
  assertRacerProgressStateIntegrity(builder.racers);
  assertRacerPlacementStateIntegrity(builder.racers);

  for (let slotIndex = 0; slotIndex < RACE_CAPACITY; slotIndex += 1) {
    if (builder.racersBySlot[slotIndex] === undefined) {
      throw new Error(`Race state is missing racer slot ${slotIndex}.`);
    }
  }
}

function assertRacerProgressStateIntegrity(
  racers: readonly RegisteredRacer[]
): void {
  for (const racer of racers) {
    if (racer.progress.lap !== 0) {
      throw new Error(`Racer ${racer.id} must start on completed lap 0.`);
    }

    if (racer.progress.currentLap !== 1) {
      throw new Error(`Racer ${racer.id} must start on current lap 1.`);
    }

    if (racer.progress.checkpointIndex !== 0) {
      throw new Error(`Racer ${racer.id} must start at checkpoint 0.`);
    }

    if (racer.progress.trackProgress !== 0) {
      throw new Error(`Racer ${racer.id} must start at track progress 0.`);
    }

    if (racer.progress.raceProgress !== 0) {
      throw new Error(`Racer ${racer.id} must start at race progress 0.`);
    }

    if (racer.progress.finished) {
      throw new Error(`Racer ${racer.id} must not start finished.`);
    }
  }
}

function assertRacerPlacementStateIntegrity(
  racers: readonly RegisteredRacer[]
): void {
  const ranks = new Set<number>();

  for (const racer of racers) {
    if (
      !Number.isInteger(racer.placement.rank) ||
      racer.placement.rank < 1 ||
      racer.placement.rank > RACE_CAPACITY
    ) {
      throw new Error(
        `Racer ${racer.id} has invalid initial rank ${racer.placement.rank}.`
      );
    }

    if (ranks.has(racer.placement.rank)) {
      throw new Error(`Duplicate initial racer rank: ${racer.placement.rank}`);
    }

    if (racer.placement.finishPlace !== null) {
      throw new Error(`Racer ${racer.id} must not start with a finish place.`);
    }

    if (racer.placement.finishTimeSeconds !== null) {
      throw new Error(`Racer ${racer.id} must not start with a finish time.`);
    }

    ranks.add(racer.placement.rank);
  }
}

function assertAiRacerInstanceIntegrity(
  aiRacers: readonly AiRacerInstance[]
): void {
  const ids = new Set<string>();
  const visualKeys = new Set<string>();
  const spawnKeys = new Set<string>();

  for (const racer of aiRacers) {
    const visualKey = [
      racer.color,
      racer.visual.accentColor,
      racer.visual.racingNumber,
      racer.visual.decal
    ].join(":");
    const spawnKey = [
      racer.spawn.position.x,
      racer.spawn.position.y,
      racer.spawn.position.z
    ].join(":");

    if (ids.has(racer.id)) {
      throw new Error(`Duplicate AI racer instance id: ${racer.id}`);
    }

    if (visualKeys.has(visualKey)) {
      throw new Error(`Duplicate AI racer visual signature: ${visualKey}`);
    }

    if (spawnKeys.has(spawnKey)) {
      throw new Error(`Duplicate AI racer grid spawn: ${spawnKey}`);
    }

    ids.add(racer.id);
    visualKeys.add(visualKey);
    spawnKeys.add(spawnKey);
  }
}

function assertRaceParticipantStateIntegrity(
  participants: readonly RaceParticipantState[]
): void {
  if (participants.length !== RACE_CAPACITY) {
    throw new Error(
      `Expected ${RACE_CAPACITY} race participants, found ${participants.length}.`
    );
  }

  const racerIds = new Set<string>();
  const stableIds = new Set<string>();
  const slotIndexes = new Set<number>();
  const ranks = new Set<number>();

  for (const participant of participants) {
    if (participant.stableId !== participant.racerId) {
      throw new Error(
        `Race participant ${participant.racerId} must expose racerId as stableId.`
      );
    }

    if (participant.controller === "ai" && participant.role !== "ai") {
      throw new Error(
        `AI participant ${participant.racerId} must use the AI role.`
      );
    }

    if (participant.controller === "human" && participant.role === "ai") {
      throw new Error(
        `Human participant ${participant.racerId} cannot use the AI role.`
      );
    }

    if (racerIds.has(participant.racerId)) {
      throw new Error(
        `Duplicate race participant racer id: ${participant.racerId}`
      );
    }

    if (stableIds.has(participant.stableId)) {
      throw new Error(
        `Duplicate race participant stable id: ${participant.stableId}`
      );
    }

    if (slotIndexes.has(participant.slotIndex)) {
      throw new Error(
        `Duplicate race participant slot: ${participant.slotIndex}`
      );
    }

    if (ranks.has(participant.rank)) {
      throw new Error(`Duplicate race participant rank: ${participant.rank}`);
    }

    assertFiniteVector(participant.position, `participant ${participant.racerId}`);
    racerIds.add(participant.racerId);
    stableIds.add(participant.stableId);
    slotIndexes.add(participant.slotIndex);
    ranks.add(participant.rank);
  }

  for (let slotIndex = 0; slotIndex < RACE_CAPACITY; slotIndex += 1) {
    if (!slotIndexes.has(slotIndex)) {
      throw new Error(`Race participants are missing slot ${slotIndex}.`);
    }
  }
}

function resolveRaceParticipantRole(
  source: RaceParticipantStateSource,
  options: RaceParticipantStateOptions
): RaceParticipantRole {
  if (source.controller === "ai") {
    return "ai";
  }

  const localPeerId =
    options.localPeerId === undefined
      ? null
      : normalizeOptionalText(options.localPeerId, "localPeerId");

  if (source.peerId !== null && localPeerId !== null) {
    return source.peerId === localPeerId ? "local-human" : "remote-human";
  }

  if (source.peerId !== null) {
    return source.isHost ? "local-human" : "remote-human";
  }

  return source.slotIndex === 0 ? "local-human" : "remote-human";
}

function resolveRaceParticipantLifecycleStatus(
  progress: Pick<RacerProgressState, "finished">,
  finishPlace: number | null,
  phase: RacePhase = DEFAULT_RACE_PHASE
): RaceParticipantLifecycleStatus {
  if (progress.finished || finishPlace !== null || phase === "finished") {
    return "finished";
  }

  return phase === "setup" || phase === "countdown" ? "ready" : "racing";
}

function cloneRaceParticipantPosition(
  source: RaceParticipantStateSource
): Vector3 {
  const position = source.position ?? source.spawn?.position;

  if (position === undefined) {
    throw new Error(
      `Race participant ${source.id} is missing position state.`
    );
  }

  assertFiniteVector(position, `participant ${source.id} position`);

  return {
    x: position.x,
    y: position.y,
    z: position.z
  };
}

function requireRaceParticipantSlotIndex(slotIndex: number): number {
  if (
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= RACE_CAPACITY
  ) {
    throw new Error(
      `Race participant slot ${slotIndex} is outside the 0-${RACE_CAPACITY - 1} range.`
    );
  }

  return slotIndex;
}

function requireRaceParticipantRank(rank: number, racerId: string): number {
  if (!Number.isInteger(rank) || rank < 1 || rank > RACE_CAPACITY) {
    throw new Error(`Race participant ${racerId} has invalid rank ${rank}.`);
  }

  return rank;
}

function normalizeNullableWholeNumber(
  value: number | null,
  key: string
): number | null {
  if (value === null) {
    return null;
  }

  if (!Number.isInteger(value) || value < 1 || value > RACE_CAPACITY) {
    throw new Error(`${key} must be null or a 1-${RACE_CAPACITY} integer.`);
  }

  return value;
}

function normalizeNullableFiniteNonNegativeNumber(
  value: number | null,
  key: string
): number | null {
  if (value === null) {
    return null;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${key} must be null or a finite non-negative number.`);
  }

  return value;
}

function normalizeOptionalText(
  value: string | null,
  key: string
): string | null {
  if (value === null) {
    return null;
  }

  return requireNonEmptyText(value, key);
}

function requireNonEmptyText(value: string, key: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`Race participant field must be non-empty: ${key}.`);
  }

  return normalized;
}

function assertFiniteVector(vector: Vector3, label: string): void {
  if (
    !Number.isFinite(vector.x) ||
    !Number.isFinite(vector.y) ||
    !Number.isFinite(vector.z)
  ) {
    throw new Error(`Expected ${label} to contain finite coordinates.`);
  }
}

function deriveCurrentRaceLap(
  completedLap: number,
  finished: boolean,
  lapCount: number
): number {
  if (lapCount <= 0) {
    return 0;
  }

  return finished ? lapCount : clampWholeNumber(completedLap + 1, 1, lapCount);
}

function deriveRaceProgressRatio(
  completedLap: number,
  trackProgress: number,
  finished: boolean,
  lapCount: number,
  options: RacerProgressStateOptions
): number {
  if (finished || completedLap >= lapCount) {
    return 1;
  }

  const trackLength = options.trackLength;

  if (trackLength === undefined || trackLength <= 0 || lapCount <= 0) {
    return DEFAULT_PROGRESS_STATE.raceProgress;
  }

  const safeTrackLength = Math.max(trackLength, 1);
  const totalDistance = lapCount * safeTrackLength;

  return totalDistance <= 0
    ? 1
    : (completedLap * safeTrackLength +
        normalizeTrackProgress(trackProgress, safeTrackLength)) /
        totalDistance;
}

function normalizeTrackProgress(progress: number, trackLength: number): number {
  const safeTrackLength = Math.max(trackLength, 1);
  const normalized = progress % safeTrackLength;

  return normalized < 0 ? normalized + safeTrackLength : normalized;
}

function clampWholeNumber(value: number, min: number, max: number): number {
  return Math.trunc(clamp(getFiniteNumber(value, min), min, max));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getFiniteNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}
