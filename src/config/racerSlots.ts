import {
  AI_RACER_SLOT_COUNT,
  HUMAN_RACER_SLOT_COUNT,
  RACE_CAPACITY,
  assertRaceCapacityConfig
} from "./gameConfig.js";

export type RacerSlotController = "human" | "ai";

export interface RacerSlot {
  readonly slotIndex: number;
  readonly controller: RacerSlotController;
  readonly racerId: string;
  readonly displayName: string;
}

export function createStableHumanRacerId(slotIndex: number): string {
  return `human_${requireRaceSlotIndex(slotIndex) + 1}`;
}

export function createStableAiRacerId(slotIndex: number): string {
  const normalizedSlotIndex = requireRaceSlotIndex(slotIndex);

  if (normalizedSlotIndex >= HUMAN_RACER_SLOT_COUNT) {
    return `ai_${normalizedSlotIndex - HUMAN_RACER_SLOT_COUNT + 1}`;
  }

  return `ai_slot_${normalizedSlotIndex + 1}`;
}

export function createStableRacerId(
  controller: RacerSlotController,
  slotIndex: number
): string {
  return controller === "human"
    ? createStableHumanRacerId(slotIndex)
    : createStableAiRacerId(slotIndex);
}

export function getRacerSlotController(
  slotIndex: number
): RacerSlotController {
  return requireRaceSlotIndex(slotIndex) < HUMAN_RACER_SLOT_COUNT
    ? "human"
    : "ai";
}

export function getAiRacerSlotIndex(aiSlotIndex: number): number {
  if (
    !Number.isInteger(aiSlotIndex) ||
    aiSlotIndex < 0 ||
    aiSlotIndex >= AI_RACER_SLOT_COUNT
  ) {
    throw new Error(
      `AI racer slot index ${aiSlotIndex} is outside the 0-${AI_RACER_SLOT_COUNT - 1} AI slot range.`
    );
  }

  return HUMAN_RACER_SLOT_COUNT + aiSlotIndex;
}

export function createInitialRacerSlots(): readonly RacerSlot[] {
  assertRaceCapacityConfig();

  const slots = Array.from({ length: RACE_CAPACITY }, (_, slotIndex) => {
    const controller = getRacerSlotController(slotIndex);
    const controllerSlotIndex =
      controller === "human"
        ? slotIndex
        : slotIndex - HUMAN_RACER_SLOT_COUNT;
    const ordinal = controllerSlotIndex + 1;

    return {
      slotIndex,
      controller,
      racerId: createStableRacerId(controller, slotIndex),
      displayName: controller === "human" ? `Player ${ordinal}` : `AI ${ordinal}`
    } satisfies RacerSlot;
  });

  assertRacerSlotIntegrity(slots);
  return slots;
}

export const INITIAL_RACER_SLOTS = createInitialRacerSlots();

export function assertRacerSlotIntegrity(
  slots: readonly RacerSlot[] = INITIAL_RACER_SLOTS
): void {
  assertRaceCapacityConfig();

  if (slots.length !== RACE_CAPACITY) {
    throw new Error(
      `Expected exactly ${RACE_CAPACITY} racer slots, found ${slots.length}.`
    );
  }

  const slotIndexes = new Set<number>();
  const racerIds = new Set<string>();
  let humanSlots = 0;
  let aiSlots = 0;

  for (const slot of slots) {
    const expectedController = getRacerSlotController(slot.slotIndex);

    if (slot.controller !== expectedController) {
      throw new Error(
        `Racer slot ${slot.slotIndex} must be controlled by ${expectedController}, found ${slot.controller}.`
      );
    }

    if (slotIndexes.has(slot.slotIndex)) {
      throw new Error(`Duplicate racer slot index: ${slot.slotIndex}`);
    }

    if (racerIds.has(slot.racerId)) {
      throw new Error(`Duplicate racer id: ${slot.racerId}`);
    }

    slotIndexes.add(slot.slotIndex);
    racerIds.add(slot.racerId);

    if (slot.controller === "human") {
      humanSlots += 1;
    } else {
      aiSlots += 1;
    }
  }

  if (humanSlots !== HUMAN_RACER_SLOT_COUNT) {
    throw new Error(
      `Expected ${HUMAN_RACER_SLOT_COUNT} human racer slots, found ${humanSlots}.`
    );
  }

  if (aiSlots !== AI_RACER_SLOT_COUNT) {
    throw new Error(
      `Expected ${AI_RACER_SLOT_COUNT} AI racer slots, found ${aiSlots}.`
    );
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
