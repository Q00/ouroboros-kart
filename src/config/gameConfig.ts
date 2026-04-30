export const RACE_CAPACITY = 4 as const;

export const HUMAN_RACER_SLOT_COUNT = RACE_CAPACITY / 2;
export const MAX_HUMAN_RACERS_PER_LOBBY = HUMAN_RACER_SLOT_COUNT;
export const AI_RACER_SLOT_COUNT =
  RACE_CAPACITY - HUMAN_RACER_SLOT_COUNT;

export function assertRaceCapacityConfig(): void {
  if (!Number.isInteger(HUMAN_RACER_SLOT_COUNT) || HUMAN_RACER_SLOT_COUNT < 1) {
    throw new Error(
      `Race capacity ${RACE_CAPACITY} must provide at least 1 whole human racer slot.`
    );
  }

  if (!Number.isInteger(AI_RACER_SLOT_COUNT) || AI_RACER_SLOT_COUNT < 1) {
    throw new Error(
      `Race capacity ${RACE_CAPACITY} must provide at least 1 whole AI racer slot.`
    );
  }

  if (HUMAN_RACER_SLOT_COUNT + AI_RACER_SLOT_COUNT !== RACE_CAPACITY) {
    throw new Error(
      `Race slot counts must sum to ${RACE_CAPACITY}; found ${HUMAN_RACER_SLOT_COUNT} human and ${AI_RACER_SLOT_COUNT} AI.`
    );
  }
}
