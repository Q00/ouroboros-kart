import {
  AI_RACER_PROFILE_CONFIGS,
  type AiRacerProfileConfig
} from "../config/aiRacers.js";
import {
  AI_RACER_SLOT_COUNT,
  RACE_CAPACITY
} from "../config/gameConfig.js";
import {
  createStableAiRacerId,
  getAiRacerSlotIndex
} from "../config/racerSlots.js";

export interface AiRacerIdentity {
  readonly racerId: string;
  readonly displayName: string;
}

export interface AiRacerSlotAssignment extends AiRacerIdentity {
  readonly slotIndex: number;
  readonly profileIndex: number;
  readonly profile: AiRacerProfileConfig;
}

export function createAiRacerSlotAssignments(
  occupiedSlotIndexes: Iterable<number>,
  aiProfiles: readonly AiRacerProfileConfig[] = AI_RACER_PROFILE_CONFIGS
): readonly AiRacerSlotAssignment[] {
  const openSlots = getOpenRaceStartSlotIndexes(occupiedSlotIndexes);

  if (aiProfiles.length < openSlots.length) {
    throw new Error(
      `Race start roster needs ${openSlots.length} AI racers, but only ${aiProfiles.length} profiles are configured.`
    );
  }

  const racerIds = new Set<string>();

  return openSlots.map((slotIndex, profileIndex) => {
    const profile = aiProfiles[profileIndex];

    if (profile === undefined) {
      throw new Error(`Missing AI racer profile ${profileIndex}.`);
    }

    const identity = createAiRacerIdentity(profile, slotIndex, profileIndex);

    if (racerIds.has(identity.racerId)) {
      throw new Error(`Duplicate generated AI racer id: ${identity.racerId}`);
    }

    racerIds.add(identity.racerId);

    return {
      slotIndex,
      profileIndex,
      profile,
      ...identity
    } satisfies AiRacerSlotAssignment;
  });
}

export function createFixedAiRacerSlotAssignments(
  aiProfiles: readonly AiRacerProfileConfig[] = AI_RACER_PROFILE_CONFIGS
): readonly AiRacerSlotAssignment[] {
  if (aiProfiles.length < AI_RACER_SLOT_COUNT) {
    throw new Error(
      `Race start roster needs ${AI_RACER_SLOT_COUNT} AI racers, but only ${aiProfiles.length} profiles are configured.`
    );
  }

  return Array.from({ length: AI_RACER_SLOT_COUNT }, (_, profileIndex) => {
    const slotIndex = getAiRacerSlotIndex(profileIndex);
    const profile = aiProfiles[profileIndex];

    if (profile === undefined) {
      throw new Error(`Missing AI racer profile ${profileIndex}.`);
    }

    return {
      slotIndex,
      profileIndex,
      profile,
      ...createAiRacerIdentity(profile, slotIndex, profileIndex)
    } satisfies AiRacerSlotAssignment;
  });
}

export function getOpenRaceStartSlotIndexes(
  occupiedSlotIndexes: Iterable<number>
): readonly number[] {
  const occupiedSlots = normalizeOccupiedRaceStartSlotIndexes(occupiedSlotIndexes);
  const openSlots: number[] = [];

  for (let slotIndex = 0; slotIndex < RACE_CAPACITY; slotIndex += 1) {
    if (!occupiedSlots.has(slotIndex)) {
      openSlots.push(slotIndex);
    }
  }

  return openSlots;
}

export function createAiRacerIdentity(
  profile: AiRacerProfileConfig,
  slotIndex: number,
  profileIndex: number
): AiRacerIdentity {
  const normalizedSlotIndex = requireRaceStartSlotIndex(slotIndex);
  requireNonNegativeInteger(profileIndex, "profileIndex");
  requireNonEmptyText(profile.id, "profile.id");
  const profileName = requireNonEmptyText(profile.displayName, "profile.displayName");

  return {
    racerId: createStableAiRacerId(normalizedSlotIndex),
    displayName: profileName
  };
}

function normalizeOccupiedRaceStartSlotIndexes(
  occupiedSlotIndexes: Iterable<number>
): ReadonlySet<number> {
  const occupiedSlots = new Set<number>();

  for (const slotIndex of occupiedSlotIndexes) {
    const normalizedSlotIndex = requireRaceStartSlotIndex(slotIndex);

    if (occupiedSlots.has(normalizedSlotIndex)) {
      throw new Error(
        `Duplicate occupied race start slot: ${normalizedSlotIndex}.`
      );
    }

    occupiedSlots.add(normalizedSlotIndex);
  }

  return occupiedSlots;
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

function requireNonNegativeInteger(value: number, key: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Race start roster field must be a non-negative integer: ${key}.`);
  }

  return value;
}

function requireNonEmptyText(value: string, key: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`Race start roster field must be non-empty: ${key}.`);
  }

  return normalized;
}
