import { AI_RACER_SLOT_COUNT, RACE_CAPACITY } from "./gameConfig.js";
import {
  createStableAiRacerId,
  getAiRacerSlotIndex,
  getRacerSlotController
} from "./racerSlots.js";
import { DEFAULT_TRACK_START_GRID } from "./tracks.js";

export type TrackLane = "inside" | "outside";

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SpawnPose {
  readonly position: Vector3;
  readonly headingRadians: number;
}

export interface DrivingStats {
  readonly maxSpeed: number;
  readonly acceleration: number;
  readonly braking: number;
  readonly steeringResponsiveness: number;
  readonly traction: number;
  readonly recovery: number;
  readonly itemAggression: number;
}

export interface AiBehaviorProfile {
  readonly preferredLane: TrackLane;
  readonly overtakeBias: number;
  readonly itemUseRange: number;
}

export type AiRacerDecal = "flame" | "bolt" | "comet" | "wing";

export interface AiRacerVisualIdentity {
  readonly accentColor: string;
  readonly racingNumber: number;
  readonly decal: AiRacerDecal;
}

export interface AiRacerConfig {
  readonly slotIndex: number;
  readonly id: string;
  readonly displayName: string;
  readonly color: string;
  readonly visual: AiRacerVisualIdentity;
  readonly spawn: SpawnPose;
  readonly driving: DrivingStats;
  readonly behavior: AiBehaviorProfile;
}

export type AiRacerProfileConfig = Omit<AiRacerConfig, "slotIndex" | "spawn">;

export const STARTING_GRID_SPAWNS: readonly SpawnPose[] =
  DEFAULT_TRACK_START_GRID.map(createSpawnPoseFromGridSlot);

export const AI_RACER_PROFILE_CONFIGS = [
  {
    id: "ai_ember",
    displayName: "Ember",
    color: "#f45d48",
    visual: {
      accentColor: "#ffd166",
      racingNumber: 7,
      decal: "flame"
    },
    driving: {
      maxSpeed: 31,
      acceleration: 18,
      braking: 22,
      steeringResponsiveness: 0.82,
      traction: 0.76,
      recovery: 0.68,
      itemAggression: 0.9
    },
    behavior: {
      preferredLane: "inside",
      overtakeBias: 0.72,
      itemUseRange: 18
    }
  },
  {
    id: "ai_vex",
    displayName: "Vex",
    color: "#3db7ff",
    visual: {
      accentColor: "#9fffe0",
      racingNumber: 22,
      decal: "bolt"
    },
    driving: {
      maxSpeed: 28,
      acceleration: 21,
      braking: 18,
      steeringResponsiveness: 0.94,
      traction: 0.88,
      recovery: 0.82,
      itemAggression: 0.58
    },
    behavior: {
      preferredLane: "outside",
      overtakeBias: 0.46,
      itemUseRange: 12
    }
  },
  {
    id: "ai_nova",
    displayName: "Nova",
    color: "#b36bff",
    visual: {
      accentColor: "#ff8bd1",
      racingNumber: 13,
      decal: "comet"
    },
    driving: {
      maxSpeed: 30,
      acceleration: 19,
      braking: 20,
      steeringResponsiveness: 0.88,
      traction: 0.8,
      recovery: 0.76,
      itemAggression: 0.7
    },
    behavior: {
      preferredLane: "outside",
      overtakeBias: 0.64,
      itemUseRange: 15
    }
  },
  {
    id: "ai_ridge",
    displayName: "Ridge",
    color: "#4fd18b",
    visual: {
      accentColor: "#fff071",
      racingNumber: 41,
      decal: "wing"
    },
    driving: {
      maxSpeed: 29,
      acceleration: 20,
      braking: 21,
      steeringResponsiveness: 0.84,
      traction: 0.86,
      recovery: 0.8,
      itemAggression: 0.62
    },
    behavior: {
      preferredLane: "inside",
      overtakeBias: 0.52,
      itemUseRange: 14
    }
  }
] as const satisfies readonly AiRacerProfileConfig[];

export const AI_RACER_CONFIGS = createDefaultAiRacerConfigs();

export function createDefaultAiRacerConfigs(): readonly AiRacerConfig[] {
  assertAiRacerProfilePoolIntegrity();

  return Array.from({ length: AI_RACER_SLOT_COUNT }, (_, aiSlotIndex) => {
    const profile = AI_RACER_PROFILE_CONFIGS[aiSlotIndex];

    if (profile === undefined) {
      throw new Error(
        `Missing AI racer profile for default AI slot ${aiSlotIndex}.`
      );
    }

    return createAiRacerConfigFromProfile(
      profile,
      getAiRacerSlotIndex(aiSlotIndex)
    );
  });
}

export function createAiRacerConfigFromProfile(
  profile: AiRacerProfileConfig,
  slotIndex: number
): AiRacerConfig {
  const normalizedSlotIndex = requireRaceSlotIndex(slotIndex);

  return {
    slotIndex: normalizedSlotIndex,
    id: createStableAiRacerId(normalizedSlotIndex),
    displayName: profile.displayName,
    color: profile.color,
    visual: profile.visual,
    spawn: getStartingGridSpawn(normalizedSlotIndex),
    driving: profile.driving,
    behavior: profile.behavior
  };
}

export function getStartingGridSpawn(slotIndex: number): SpawnPose {
  const spawn = STARTING_GRID_SPAWNS[requireRaceSlotIndex(slotIndex)];

  if (spawn === undefined) {
    throw new Error(`Missing starting grid spawn for slot ${slotIndex}.`);
  }

  return cloneSpawnPose(spawn);
}

function createSpawnPoseFromGridSlot(
  slot: (typeof DEFAULT_TRACK_START_GRID)[number]
): SpawnPose {
  return {
    position: { ...slot.position },
    headingRadians: slot.headingRadians
  };
}

function cloneSpawnPose(spawn: SpawnPose): SpawnPose {
  return {
    position: { ...spawn.position },
    headingRadians: spawn.headingRadians
  };
}

export function assertAiRacerProfilePoolIntegrity(
  profiles: readonly AiRacerProfileConfig[] = AI_RACER_PROFILE_CONFIGS
): void {
  if (profiles.length < RACE_CAPACITY) {
    throw new Error(
      `Expected at least ${RACE_CAPACITY} AI racer profiles for race-start backfill, found ${profiles.length}.`
    );
  }

  assertAiRacerIdentityIntegrity(profiles);
}

export function assertAiRacerConfigIntegrity(
  configs: readonly AiRacerConfig[] = AI_RACER_CONFIGS
): void {
  if (configs.length !== AI_RACER_SLOT_COUNT) {
    throw new Error(
      `Expected exactly ${AI_RACER_SLOT_COUNT} AI racers, found ${configs.length}.`
    );
  }

  const ids = new Set<string>();
  const slotIndexes = new Set<number>();
  const spawnKeys = new Set<string>();
  const colors = new Set<string>();
  const accentColors = new Set<string>();
  const racingNumbers = new Set<number>();
  const decals = new Set<AiRacerDecal>();

  for (const config of configs) {
    if (getRacerSlotController(config.slotIndex) !== "ai") {
      throw new Error(
        `AI racer ${config.id} is assigned to non-AI slot ${config.slotIndex}.`
      );
    }

    if (slotIndexes.has(config.slotIndex)) {
      throw new Error(`Duplicate AI racer slot index: ${config.slotIndex}`);
    }

    if (ids.has(config.id)) {
      throw new Error(`Duplicate AI racer id: ${config.id}`);
    }

    const spawnKey = [
      config.spawn.position.x,
      config.spawn.position.y,
      config.spawn.position.z
    ].join(":");

    if (spawnKeys.has(spawnKey)) {
      throw new Error(`Duplicate AI spawn position: ${spawnKey}`);
    }

    const color = config.color.toLowerCase();
    const accentColor = config.visual.accentColor.toLowerCase();

    if (colors.has(color)) {
      throw new Error(`Duplicate AI racer color: ${config.color}`);
    }

    if (accentColors.has(accentColor)) {
      throw new Error(`Duplicate AI racer accent color: ${config.visual.accentColor}`);
    }

    if (color === accentColor) {
      throw new Error(`AI racer ${config.id} must use a distinct accent color.`);
    }

    if (racingNumbers.has(config.visual.racingNumber)) {
      throw new Error(`Duplicate AI racer number: ${config.visual.racingNumber}`);
    }

    if (decals.has(config.visual.decal)) {
      throw new Error(`Duplicate AI racer decal: ${config.visual.decal}`);
    }

    slotIndexes.add(config.slotIndex);
    ids.add(config.id);
    spawnKeys.add(spawnKey);
    colors.add(color);
    accentColors.add(accentColor);
    racingNumbers.add(config.visual.racingNumber);
    decals.add(config.visual.decal);
  }
}

function assertAiRacerIdentityIntegrity(
  profiles: readonly AiRacerProfileConfig[]
): void {
  const ids = new Set<string>();
  const colors = new Set<string>();
  const accentColors = new Set<string>();
  const racingNumbers = new Set<number>();
  const decals = new Set<AiRacerDecal>();

  for (const profile of profiles) {
    if (ids.has(profile.id)) {
      throw new Error(`Duplicate AI racer profile id: ${profile.id}`);
    }

    const color = profile.color.toLowerCase();
    const accentColor = profile.visual.accentColor.toLowerCase();

    if (colors.has(color)) {
      throw new Error(`Duplicate AI racer profile color: ${profile.color}`);
    }

    if (accentColors.has(accentColor)) {
      throw new Error(
        `Duplicate AI racer profile accent color: ${profile.visual.accentColor}`
      );
    }

    if (color === accentColor) {
      throw new Error(
        `AI racer profile ${profile.id} must use a distinct accent color.`
      );
    }

    if (racingNumbers.has(profile.visual.racingNumber)) {
      throw new Error(
        `Duplicate AI racer profile number: ${profile.visual.racingNumber}`
      );
    }

    if (decals.has(profile.visual.decal)) {
      throw new Error(
        `Duplicate AI racer profile decal: ${profile.visual.decal}`
      );
    }

    ids.add(profile.id);
    colors.add(color);
    accentColors.add(accentColor);
    racingNumbers.add(profile.visual.racingNumber);
    decals.add(profile.visual.decal);
  }
}

function requireRaceSlotIndex(slotIndex: number): number {
  if (
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= RACE_CAPACITY
  ) {
    throw new Error(
      `Racer slot index ${slotIndex} is outside the 0-${RACE_CAPACITY - 1} race capacity range.`
    );
  }

  return slotIndex;
}
