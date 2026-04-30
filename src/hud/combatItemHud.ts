import {
  COMBAT_ITEM_REGISTRY,
  type ActiveRaceItemState,
  type CombatItemType,
  type RaceItemPickupState,
  type RaceSessionRacerState
} from "../race/raceSession";

export interface CombatItemHudVisualConfig {
  readonly accentColor: string;
  readonly ringColor: string;
  readonly shadowColor: string;
  readonly markerSize: number;
  readonly activeMarkerSize: number;
}

export interface CombatItemPickupVisualState
  extends CombatItemHudVisualConfig {
  readonly itemType: CombatItemType;
  readonly displayName: string;
  readonly inventoryIcon: string;
  readonly inventoryIconKey: string;
  readonly inventoryIconRef: string;
  readonly worldVisualKey: string;
  readonly cooldownRatio: number;
  readonly isAvailable: boolean;
  readonly opacity: number;
}

export interface CombatItemInventorySlotState
  extends CombatItemHudVisualConfig {
  readonly itemType: CombatItemType | null;
  readonly displayName: string;
  readonly label: string;
  readonly statusLabel: string;
  readonly feedbackLabel: string;
  readonly inventoryIcon: string;
  readonly inventoryIconKey: string | null;
  readonly inventoryIconRef: string | null;
  readonly cooldownSeconds: number;
  readonly cooldownRatio: number;
  readonly isEmpty: boolean;
  readonly isReady: boolean;
  readonly isShellHeld: boolean;
}

export type ActiveCombatItemVisualStatus =
  | "arming"
  | "live"
  | "expiring"
  | "dormant";

export interface ActiveCombatItemVisualState
  extends CombatItemHudVisualConfig {
  readonly itemType: Exclude<CombatItemType, "boost">;
  readonly displayName: string;
  readonly worldVisualKey: string;
  readonly status: ActiveCombatItemVisualStatus;
  readonly statusLabel: string;
  readonly isArmed: boolean;
  readonly isInteractable: boolean;
  readonly isExpiring: boolean;
  readonly armProgressRatio: number;
  readonly ttlRatio: number;
  readonly speed: number;
  readonly opacity: number;
  readonly isWorldVisible: boolean;
  readonly renderSize: number;
  readonly ringRadius: number;
  readonly projectileGlowRadius: number;
  readonly projectileGlowOpacity: number;
  readonly trailLength: number;
  readonly trailOpacity: number;
}

type CombatItemPickupRenderState = Pick<
  RaceItemPickupState,
  "itemType" | "active" | "cooldownSeconds" | "respawnSeconds"
>;
type CombatItemInventoryRacerState = Pick<
  RaceSessionRacerState,
  "heldItem" | "itemUseCooldownSeconds"
>;
interface CombatItemPickupSnapshotLike {
  readonly pickupId: string;
  readonly itemType: CombatItemType;
  readonly cooldownSeconds: number;
  readonly active?: boolean;
  readonly respawnDeadlineElapsedSeconds?: number | null;
}
type ActiveCombatItemRenderState = Pick<
  ActiveRaceItemState,
  "type" | "armedSeconds" | "ttlSeconds" | "ageSeconds" | "radius" | "velocity"
> & {
  readonly lifetimeSeconds?: number;
};

const AVAILABLE_PICKUP_OPACITY = 0.95;
const COOLDOWN_PICKUP_OPACITY = 0.32;
const ACTIVE_SHELL_MIN_INTERACTABLE_SPEED = 0.05;
const ACTIVE_ITEM_EXPIRING_TTL_RATIO = 0.22;
const ACTIVE_ITEM_ARMING_OPACITY = 0.58;
const ACTIVE_ITEM_LIVE_OPACITY = 0.98;
const ACTIVE_ITEM_EXPIRING_OPACITY = 0.76;
const ACTIVE_ITEM_DORMANT_OPACITY = 0.34;
const ACTIVE_SHELL_MINIMUM_RENDER_SIZE = 34;
const ACTIVE_SHELL_MINIMUM_GLOW_OPACITY = 0.4;
const MAX_ITEM_USE_COOLDOWN_SECONDS = Math.max(
  ...Object.values(COMBAT_ITEM_REGISTRY).map(
    (item) => item.defaultRuntimeConfig.useCooldownSeconds
  )
);

const COMBAT_ITEM_HUD_VISUALS = {
  boost: {
    accentColor: "#ffd166",
    ringColor: "rgba(255, 209, 102, 0.78)",
    shadowColor: "rgba(255, 209, 102, 0.36)",
    markerSize: 30,
    activeMarkerSize: 30
  },
  shell: {
    accentColor: "#9ad7ff",
    ringColor: "rgba(154, 215, 255, 0.74)",
    shadowColor: "rgba(154, 215, 255, 0.3)",
    markerSize: 30,
    activeMarkerSize: 24
  },
  banana: {
    accentColor: "#ffd84a",
    ringColor: "rgba(255, 216, 74, 0.86)",
    shadowColor: "rgba(255, 216, 74, 0.42)",
    markerSize: 34,
    activeMarkerSize: 36
  }
} as const satisfies Record<CombatItemType, CombatItemHudVisualConfig>;

export function getCombatItemHudVisualConfig(
  itemType: CombatItemType
): CombatItemHudVisualConfig {
  return COMBAT_ITEM_HUD_VISUALS[itemType];
}

export function createCombatItemPickupVisualState(
  pickup: CombatItemPickupRenderState
): CombatItemPickupVisualState {
  const registryItem = COMBAT_ITEM_REGISTRY[pickup.itemType];
  const cooldownRatio = normalizeRatio(
    normalizeSeconds(pickup.cooldownSeconds),
    Math.max(0.001, pickup.respawnSeconds)
  );
  const isAvailable = pickup.active && cooldownRatio <= 0;

  return {
    itemType: registryItem.type,
    displayName: registryItem.metadata.displayName,
    inventoryIcon: registryItem.inventoryIcon,
    inventoryIconKey: registryItem.inventoryIconKey,
    inventoryIconRef: registryItem.inventoryIconRef,
    worldVisualKey: `${registryItem.inventoryIconKey}-world`,
    cooldownRatio,
    isAvailable,
    opacity: isAvailable ? AVAILABLE_PICKUP_OPACITY : COOLDOWN_PICKUP_OPACITY,
    ...getCombatItemHudVisualConfig(registryItem.type)
  };
}

export function createCombatItemInventorySlotState(
  racer: CombatItemInventoryRacerState
): CombatItemInventorySlotState {
  const cooldownSeconds = normalizeSeconds(racer.itemUseCooldownSeconds);

  if (racer.heldItem === null) {
    return {
      itemType: null,
      displayName: "Empty",
      label: "EMPTY",
      statusLabel: "NO ITEM",
      feedbackLabel: "SLOT EMPTY",
      inventoryIcon: "",
      inventoryIconKey: null,
      inventoryIconRef: null,
      cooldownSeconds,
      cooldownRatio: normalizeRatio(
        cooldownSeconds,
        MAX_ITEM_USE_COOLDOWN_SECONDS
      ),
      isEmpty: true,
      isReady: false,
      isShellHeld: false,
      accentColor: "#7b8792",
      ringColor: "rgba(245, 247, 250, 0.2)",
      shadowColor: "rgba(0, 0, 0, 0.28)",
      markerSize: 30,
      activeMarkerSize: 30
    };
  }

  const registryItem = COMBAT_ITEM_REGISTRY[racer.heldItem];

  return {
    itemType: registryItem.type,
    displayName: registryItem.metadata.displayName,
    label: registryItem.metadata.displayName.toUpperCase(),
    statusLabel: getInventorySlotStatusLabel(registryItem.type, cooldownSeconds),
    feedbackLabel: getInventorySlotFeedbackLabel(registryItem.type),
    inventoryIcon: registryItem.inventoryIcon,
    inventoryIconKey: registryItem.inventoryIconKey,
    inventoryIconRef: registryItem.inventoryIconRef,
    cooldownSeconds,
    cooldownRatio: normalizeRatio(
      cooldownSeconds,
      MAX_ITEM_USE_COOLDOWN_SECONDS
    ),
    isEmpty: false,
    isReady: cooldownSeconds <= 0,
    isShellHeld: registryItem.type === "shell",
    ...getCombatItemHudVisualConfig(registryItem.type)
  };
}

export function createRenderedItemPickupStates(
  itemPickups: readonly RaceItemPickupState[],
  authoritativePickups: readonly CombatItemPickupSnapshotLike[] | null | undefined
): readonly RaceItemPickupState[] {
  if (authoritativePickups === null || authoritativePickups === undefined) {
    return itemPickups;
  }

  const authoritativeById = new Map(
    authoritativePickups.map((pickup) => [pickup.pickupId, pickup] as const)
  );

  return itemPickups.map((pickup) => {
    const authoritativePickup = authoritativeById.get(pickup.id);

    if (
      authoritativePickup === undefined ||
      authoritativePickup.itemType !== pickup.itemType
    ) {
      return pickup;
    }

    const cooldownSeconds = normalizeSeconds(
      authoritativePickup.cooldownSeconds
    );
    const active = authoritativePickup.active ?? cooldownSeconds <= 0;

    return {
      ...pickup,
      active,
      cooldownSeconds,
      respawnDeadlineElapsedSeconds:
        active && cooldownSeconds <= 0
          ? null
          : authoritativePickup.respawnDeadlineElapsedSeconds ??
            pickup.respawnDeadlineElapsedSeconds
    };
  });
}

export function createActiveCombatItemVisualState(
  item: ActiveCombatItemRenderState
): ActiveCombatItemVisualState {
  const itemType = item.type;
  const registryItem = COMBAT_ITEM_REGISTRY[itemType];
  const visual = getCombatItemHudVisualConfig(itemType);
  const ttlSeconds = normalizeSeconds(item.ttlSeconds);
  const armedSeconds = normalizeSeconds(item.armedSeconds);
  const ageSeconds = normalizeSeconds(item.ageSeconds);
  const lifetimeSeconds = getActiveItemLifetimeSeconds(
    item,
    ageSeconds,
    ttlSeconds
  );
  const armSeconds = getActiveItemArmSeconds(itemType);
  const speed = getPlanarSpeed(item.velocity);
  const isArmed = armedSeconds <= 0;
  const isMovingShell =
    itemType !== "shell" || speed > ACTIVE_SHELL_MIN_INTERACTABLE_SPEED;
  const ttlRatio = normalizeRatio(ttlSeconds, lifetimeSeconds);
  const isExpiring =
    ttlSeconds > 0 &&
    ttlRatio > 0 &&
    ttlRatio <= ACTIVE_ITEM_EXPIRING_TTL_RATIO;
  const status = getActiveCombatItemVisualStatus(
    itemType,
    ttlSeconds,
    isArmed,
    isMovingShell,
    isExpiring
  );
  const isInteractable = status === "live" || status === "expiring";
  const statusOpacity = getActiveCombatItemStatusOpacity(status);
  const shellTravelRatio = clampRatio(
    speed / COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed
  );
  const baseRenderSize =
    visual.activeMarkerSize *
    (itemType === "shell" && isInteractable ? 1.16 : 1);
  const isWorldVisible = ttlSeconds > 0 && statusOpacity > 0;
  const shellGlowOpacity =
    itemType === "shell" && isWorldVisible
      ? Math.max(
          ACTIVE_SHELL_MINIMUM_GLOW_OPACITY,
          statusOpacity * (isInteractable ? 0.72 : 0.48)
        )
      : 0;
  const renderSize =
    itemType === "shell" && isWorldVisible
      ? Math.max(baseRenderSize, ACTIVE_SHELL_MINIMUM_RENDER_SIZE)
      : baseRenderSize;

  return {
    itemType,
    displayName: registryItem.metadata.displayName,
    worldVisualKey: `${registryItem.inventoryIconKey}-world`,
    status,
    statusLabel: getActiveCombatItemStatusLabel(itemType, status),
    isArmed,
    isInteractable,
    isExpiring,
    armProgressRatio:
      armSeconds <= 0
        ? 1
        : 1 - normalizeRatio(armedSeconds, armSeconds),
    ttlRatio,
    speed,
    opacity: statusOpacity,
    isWorldVisible,
    renderSize,
    ringRadius:
      visual.activeMarkerSize *
      (itemType === "shell" && isInteractable ? 0.86 : 0.72),
    projectileGlowRadius:
      itemType === "shell" && isWorldVisible ? renderSize * 0.72 : 0,
    projectileGlowOpacity: shellGlowOpacity,
    trailLength:
      itemType === "shell" && speed > ACTIVE_SHELL_MIN_INTERACTABLE_SPEED
        ? interpolateNumber(
            10,
            isInteractable ? 34 : 20,
            shellTravelRatio
          )
        : 0,
    trailOpacity:
      itemType === "shell" && speed > ACTIVE_SHELL_MIN_INTERACTABLE_SPEED
        ? interpolateNumber(
            0.2,
            isInteractable ? 0.68 : 0.38,
            shellTravelRatio
          ) * statusOpacity
        : 0,
    ...visual
  };
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

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 1);
}

function interpolateNumber(start: number, end: number, ratio: number): number {
  return start + (end - start) * clampRatio(ratio);
}

function getActiveItemLifetimeSeconds(
  item: ActiveCombatItemRenderState,
  ageSeconds: number,
  ttlSeconds: number
): number {
  const configuredLifetimeSeconds =
    item.lifetimeSeconds === undefined
      ? ageSeconds + ttlSeconds
      : item.lifetimeSeconds;

  if (!Number.isFinite(configuredLifetimeSeconds)) {
    return Math.max(0.001, ageSeconds + ttlSeconds);
  }

  return Math.max(0.001, configuredLifetimeSeconds);
}

function getActiveItemArmSeconds(
  itemType: Exclude<CombatItemType, "boost">
): number {
  switch (itemType) {
    case "shell":
      return COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.armSeconds;
    case "banana":
      return COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.armSeconds;
  }
}

function getPlanarSpeed(vector: {
  readonly x: number;
  readonly z: number;
}): number {
  if (!Number.isFinite(vector.x) || !Number.isFinite(vector.z)) {
    return 0;
  }

  return Math.hypot(vector.x, vector.z);
}

function getActiveCombatItemVisualStatus(
  itemType: Exclude<CombatItemType, "boost">,
  ttlSeconds: number,
  isArmed: boolean,
  isMovingShell: boolean,
  isExpiring: boolean
): ActiveCombatItemVisualStatus {
  if (ttlSeconds <= 0 || (itemType === "shell" && !isMovingShell)) {
    return "dormant";
  }

  if (!isArmed) {
    return "arming";
  }

  return isExpiring ? "expiring" : "live";
}

function getActiveCombatItemStatusOpacity(
  status: ActiveCombatItemVisualStatus
): number {
  switch (status) {
    case "arming":
      return ACTIVE_ITEM_ARMING_OPACITY;
    case "live":
      return ACTIVE_ITEM_LIVE_OPACITY;
    case "expiring":
      return ACTIVE_ITEM_EXPIRING_OPACITY;
    case "dormant":
      return ACTIVE_ITEM_DORMANT_OPACITY;
  }
}

function getActiveCombatItemStatusLabel(
  itemType: Exclude<CombatItemType, "boost">,
  status: ActiveCombatItemVisualStatus
): string {
  if (itemType === "banana") {
    switch (status) {
      case "arming":
        return "ARMING";
      case "live":
        return "SET";
      case "expiring":
        return "FADING";
      case "dormant":
        return "SPENT";
    }
  }

  switch (status) {
    case "arming":
      return "ARMING";
    case "live":
      return "LIVE";
    case "expiring":
      return "EXPIRING";
    case "dormant":
      return "DORMANT";
  }
}

function getInventorySlotStatusLabel(
  itemType: CombatItemType,
  cooldownSeconds: number
): string {
  if (cooldownSeconds > 0) {
    return "ITEM RECOVERY";
  }

  switch (itemType) {
    case "boost":
      return "BOOST READY";
    case "shell":
      return "SHELL READY";
    case "banana":
      return "BANANA READY";
  }
}

function getInventorySlotFeedbackLabel(itemType: CombatItemType): string {
  switch (itemType) {
    case "boost":
      return "SPEED ITEM";
    case "shell":
      return "PROJECTILE HELD";
    case "banana":
      return "TRAP HELD";
  }
}
