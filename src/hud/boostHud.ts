import {
  BOOST_DURATION_SECONDS,
  COMBAT_ITEM_REGISTRY,
  type CombatItemType,
  type RaceItemPickupState,
  type RaceSessionRacerState
} from "../race/raceSession";

export type BoostHudAvailability =
  | "active"
  | "ready"
  | "cooldown"
  | "blocked"
  | "seek"
  | "respawn"
  | "unavailable";

export interface BoostVisualState {
  readonly isActive: boolean;
  readonly intensity: number;
  readonly label: "BOOST" | null;
}

export interface BoostHudState {
  readonly availability: BoostHudAvailability;
  readonly availabilityLabel: string;
  readonly heldItem: CombatItemType | null;
  readonly heldBoostCount: number;
  readonly maxHeldBoostCount: number;
  readonly availablePickupCount: number;
  readonly totalPickupCount: number;
  readonly nextPickupCooldownSeconds: number;
  readonly useCooldownSeconds: number;
  readonly activeDurationSeconds: number;
  readonly activeDurationRatio: number;
  readonly pickupRespawnRatio: number;
  readonly visual: BoostVisualState;
  readonly isItemSlotBlocked: boolean;
  readonly canActivateBoost: boolean;
  readonly countLabel: string;
  readonly cooldownLabel: string;
  readonly activeDurationLabel: string;
}

type BoostHudRacerState = Pick<
  RaceSessionRacerState,
  "heldItem" | "itemUseCooldownSeconds" | "boostSeconds"
>;
type BoostHudPickupState = Pick<
  RaceItemPickupState,
  "itemType" | "cooldownSeconds"
> & {
  readonly active?: boolean;
};

const MAX_HELD_BOOST_COUNT = 1;
const BOOST_ITEM_TYPE = COMBAT_ITEM_REGISTRY.boost.type;
const BOOST_PICKUP_RESPAWN_SECONDS = COMBAT_ITEM_REGISTRY.boost.respawnSeconds;

export function createBoostHudState(
  racer: BoostHudRacerState,
  itemPickups: readonly BoostHudPickupState[]
): BoostHudState {
  const boostPickups = itemPickups.filter(
    (pickup) => pickup.itemType === BOOST_ITEM_TYPE
  );
  const totalPickupCount = boostPickups.length;
  const availablePickupCount = boostPickups.filter(
    (pickup) => isBoostPickupAvailable(pickup)
  ).length;
  const nextPickupCooldownSeconds = getNextPickupCooldownSeconds(boostPickups);
  const heldBoostCount = racer.heldItem === BOOST_ITEM_TYPE ? 1 : 0;
  const useCooldownSeconds = normalizeSeconds(racer.itemUseCooldownSeconds);
  const activeDurationSeconds = normalizeSeconds(racer.boostSeconds);
  const activeDurationRatio = normalizeRatio(
    activeDurationSeconds,
    BOOST_DURATION_SECONDS
  );
  const pickupRespawnRatio =
    nextPickupCooldownSeconds > 0
      ? 1 - normalizeRatio(nextPickupCooldownSeconds, BOOST_PICKUP_RESPAWN_SECONDS)
      : 1;
  const visual = createBoostVisualState(racer);
  const isItemSlotBlocked =
    racer.heldItem !== null && racer.heldItem !== BOOST_ITEM_TYPE;
  const availability = getBoostHudAvailability({
    heldBoostCount,
    isItemSlotBlocked,
    useCooldownSeconds,
    activeDurationSeconds,
    availablePickupCount,
    totalPickupCount,
    nextPickupCooldownSeconds
  });

  return {
    availability,
    availabilityLabel: getBoostAvailabilityLabel(availability),
    heldItem: racer.heldItem,
    heldBoostCount,
    maxHeldBoostCount: MAX_HELD_BOOST_COUNT,
    availablePickupCount,
    totalPickupCount,
    nextPickupCooldownSeconds,
    useCooldownSeconds,
    activeDurationSeconds,
    activeDurationRatio,
    pickupRespawnRatio,
    visual,
    isItemSlotBlocked,
    canActivateBoost:
      heldBoostCount > 0 && useCooldownSeconds <= 0 && !isItemSlotBlocked,
    countLabel: [
      `Held ${heldBoostCount}/${MAX_HELD_BOOST_COUNT}`,
      `Boxes ${availablePickupCount}/${totalPickupCount}`
    ].join(" | "),
    cooldownLabel: [
      `Use ${formatBoostHudCooldown(useCooldownSeconds, true)}`,
      `Box ${formatBoostHudCooldown(
        nextPickupCooldownSeconds,
        totalPickupCount > 0
      )}`
    ].join(" | "),
    activeDurationLabel: `Active ${formatBoostHudSeconds(activeDurationSeconds)}`
  };
}

export function createBoostVisualState(
  racer: BoostHudRacerState
): BoostVisualState {
  const intensity = normalizeRatio(
    normalizeSeconds(racer.boostSeconds),
    BOOST_DURATION_SECONDS
  );
  const isActive = intensity > 0;

  return {
    isActive,
    intensity,
    label: isActive ? "BOOST" : null
  };
}

export function formatBoostHudSeconds(seconds: number): string {
  return `${normalizeSeconds(seconds).toFixed(1)}s`;
}

function getNextPickupCooldownSeconds(
  boostPickups: readonly BoostHudPickupState[]
): number {
  const hasAvailablePickup = boostPickups.some(
    (pickup) => isBoostPickupAvailable(pickup)
  );

  if (hasAvailablePickup) {
    return 0;
  }

  const cooldowns = boostPickups
    .map((pickup) => normalizeSeconds(pickup.cooldownSeconds))
    .filter((cooldownSeconds) => cooldownSeconds > 0);

  return cooldowns.length > 0 ? Math.min(...cooldowns) : 0;
}

function isBoostPickupAvailable(pickup: BoostHudPickupState): boolean {
  const cooldownSeconds = normalizeSeconds(pickup.cooldownSeconds);

  return (pickup.active ?? cooldownSeconds <= 0) && cooldownSeconds <= 0;
}

function getBoostHudAvailability(
  state: Pick<
    BoostHudState,
    | "heldBoostCount"
    | "isItemSlotBlocked"
    | "useCooldownSeconds"
    | "activeDurationSeconds"
    | "availablePickupCount"
    | "totalPickupCount"
    | "nextPickupCooldownSeconds"
  >
): BoostHudAvailability {
  if (state.activeDurationSeconds > 0) {
    return "active";
  }

  if (state.heldBoostCount > 0 && state.useCooldownSeconds > 0) {
    return "cooldown";
  }

  if (state.heldBoostCount > 0) {
    return "ready";
  }

  if (state.isItemSlotBlocked) {
    return "blocked";
  }

  if (state.availablePickupCount > 0) {
    return "seek";
  }

  if (state.totalPickupCount > 0 || state.nextPickupCooldownSeconds > 0) {
    return "respawn";
  }

  return "unavailable";
}

function getBoostAvailabilityLabel(
  availability: BoostHudAvailability
): string {
  switch (availability) {
    case "active":
      return "BOOST ACTIVE";
    case "ready":
      return "BOOST READY";
    case "cooldown":
      return "BOOST WAIT";
    case "blocked":
      return "ITEM SLOT FULL";
    case "seek":
      return "BOOST AVAILABLE";
    case "respawn":
      return "BOOST RESPAWNING";
    case "unavailable":
      return "NO BOOST BOXES";
  }
}

function formatBoostHudCooldown(seconds: number, hasTimer: boolean): string {
  if (!hasTimer) {
    return "n/a";
  }

  return seconds > 0 ? formatBoostHudSeconds(seconds) : "ready";
}

function normalizeSeconds(seconds: number): number {
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

function normalizeRatio(value: number, maximum: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) {
    return 0;
  }

  return Math.min(Math.max(value / maximum, 0), 1);
}
