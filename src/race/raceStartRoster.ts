import {
  AI_RACER_PROFILE_CONFIGS,
  type AiRacerProfileConfig
} from "../config/aiRacers.js";
import {
  HUMAN_RACER_SLOT_COUNT,
  RACE_CAPACITY
} from "../config/gameConfig.js";
import { createStableHumanRacerId } from "../config/racerSlots.js";
import {
  createAiRacerSlotAssignments,
  createFixedAiRacerSlotAssignments
} from "./aiRacerAssignments.js";

export {
  createAiRacerIdentity,
  createFixedAiRacerSlotAssignments,
  createAiRacerSlotAssignments,
  getOpenRaceStartSlotIndexes,
  type AiRacerIdentity,
  type AiRacerSlotAssignment
} from "./aiRacerAssignments.js";

export interface HumanRaceStartRacerInput {
  readonly peerId: string;
  readonly displayName: string;
  readonly slotIndex: number;
  readonly isHost?: boolean;
}

export interface RaceStartHumanRacer {
  readonly controller: "human";
  readonly slotIndex: number;
  readonly racerId: string;
  readonly peerId: string;
  readonly displayName: string;
  readonly isHost: boolean;
}

export interface RaceStartAiRacer {
  readonly controller: "ai";
  readonly slotIndex: number;
  readonly racerId: string;
  readonly displayName: string;
  readonly profileIndex: number;
  readonly profile: AiRacerProfileConfig;
}

export type RaceStartRacer = RaceStartHumanRacer | RaceStartAiRacer;

export interface RaceStartRoster {
  readonly racers: readonly RaceStartRacer[];
  readonly humanRacers: readonly RaceStartHumanRacer[];
  readonly aiRacers: readonly RaceStartAiRacer[];
  readonly humanRacerCount: number;
  readonly aiRacerCount: number;
}

export interface RaceStartRosterOptions {
  readonly requireFullMultiplayerRoster?: boolean;
}

export function createRaceStartRoster(
  humanRacers: readonly HumanRaceStartRacerInput[],
  aiProfiles: readonly AiRacerProfileConfig[] = AI_RACER_PROFILE_CONFIGS,
  options: RaceStartRosterOptions = {}
): RaceStartRoster {
  const normalizedHumans = normalizeHumanRaceStartRacers(humanRacers);

  if (normalizedHumans.length > RACE_CAPACITY) {
    throw new Error(
      `Race start roster cannot exceed ${RACE_CAPACITY} racers; found ${normalizedHumans.length} human racers.`
    );
  }

  if (options.requireFullMultiplayerRoster === true) {
    assertFullMultiplayerHumanRoster(normalizedHumans);
  }

  const aiAssignments =
    options.requireFullMultiplayerRoster === true
      ? createFixedAiRacerSlotAssignments(aiProfiles)
      : createAiRacerSlotAssignments(
          normalizedHumans.map((racer) => racer.slotIndex),
          aiProfiles
        );

  const aiRacers = aiAssignments.map((assignment) => {
    return {
      controller: "ai",
      slotIndex: assignment.slotIndex,
      racerId: assignment.racerId,
      displayName: assignment.displayName,
      profileIndex: assignment.profileIndex,
      profile: assignment.profile
    } satisfies RaceStartAiRacer;
  });
  const racers = [...normalizedHumans, ...aiRacers].sort(
    (left, right) => left.slotIndex - right.slotIndex
  );

  if (racers.length !== RACE_CAPACITY) {
    throw new Error(
      `Race start roster must contain exactly ${RACE_CAPACITY} racers, found ${racers.length}.`
    );
  }

  return {
    racers,
    humanRacers: normalizedHumans,
    aiRacers,
    humanRacerCount: normalizedHumans.length,
    aiRacerCount: aiRacers.length
  };
}

export function createMultiplayerRaceStartRoster(
  humanRacers: readonly HumanRaceStartRacerInput[],
  aiProfiles: readonly AiRacerProfileConfig[] = AI_RACER_PROFILE_CONFIGS
): RaceStartRoster {
  return createRaceStartRoster(humanRacers, aiProfiles, {
    requireFullMultiplayerRoster: true
  });
}

function normalizeHumanRaceStartRacers(
  humanRacers: readonly HumanRaceStartRacerInput[]
): readonly RaceStartHumanRacer[] {
  const peerIds = new Set<string>();
  const slotIndexes = new Set<number>();

  return humanRacers
    .map((racer) => {
      const peerId = requireNonEmptyText(racer.peerId, "peerId");
      const displayName = requireNonEmptyText(racer.displayName, "displayName");
      const slotIndex = requireRaceStartSlotIndex(racer.slotIndex);

      if (peerIds.has(peerId)) {
        throw new Error(`Duplicate human racer peer id in race roster: ${peerId}`);
      }

      if (slotIndexes.has(slotIndex)) {
        throw new Error(`Duplicate human racer slot in race roster: ${slotIndex}`);
      }

      peerIds.add(peerId);
      slotIndexes.add(slotIndex);

      return {
        controller: "human",
        slotIndex,
        racerId: createStableHumanRacerId(slotIndex),
        peerId,
        displayName,
        isHost: racer.isHost ?? false
      } satisfies RaceStartHumanRacer;
    })
    .sort((left, right) => left.slotIndex - right.slotIndex);
}

function requireRaceStartSlotIndex(slotIndex: number): number {
  if (
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= RACE_CAPACITY
  ) {
    throw new Error(
      `Race start slot index ${slotIndex} is outside the 0-${RACE_CAPACITY - 1} range.`
    );
  }

  return slotIndex;
}

function assertFullMultiplayerHumanRoster(
  humanRacers: readonly RaceStartHumanRacer[]
): void {
  if (humanRacers.length !== HUMAN_RACER_SLOT_COUNT) {
    throw new Error(
      `Multiplayer race start requires exactly ${HUMAN_RACER_SLOT_COUNT} human racers, found ${humanRacers.length}.`
    );
  }

  for (const racer of humanRacers) {
    if (racer.slotIndex >= HUMAN_RACER_SLOT_COUNT) {
      throw new Error(
        `Human racer ${racer.racerId} is assigned to AI-owned slot ${racer.slotIndex}.`
      );
    }
  }
}

function requireNonEmptyText(value: string, key: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`Race start roster field must be non-empty: ${key}.`);
  }

  return normalized;
}
