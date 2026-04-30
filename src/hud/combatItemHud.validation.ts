import { pathToFileURL } from "node:url";

import {
  COMBAT_ITEM_REGISTRY,
  DEFAULT_RACE_ITEM_PICKUPS,
  type RaceItemPickupState
} from "../race/raceSession";
import {
  createActiveCombatItemVisualState,
  createCombatItemInventorySlotState,
  createCombatItemPickupVisualState,
  createRenderedItemPickupStates,
  getCombatItemHudVisualConfig
} from "./combatItemHud";

export interface BananaPickupUiValidationResult {
  readonly itemType: string;
  readonly displayName: string;
  readonly inventoryIconKey: string;
  readonly worldVisualKey: string;
  readonly availableOpacity: number;
  readonly collectedOpacity: number;
  readonly collectedCooldownRatio: number;
  readonly markerSize: number;
}

export interface BananaInventoryUiValidationResult {
  readonly itemType: string | null;
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
  readonly accentColor: string;
}

export interface ShellInventoryUiValidationResult {
  readonly itemType: string | null;
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
  readonly accentColor: string;
  readonly activeMarkerSize: number;
}

export interface BananaAuthoritativePickupUiValidationResult {
  readonly pickupId: string;
  readonly localCooldownSeconds: number;
  readonly renderedCooldownSeconds: number;
  readonly itemType: string;
}

export interface ActiveShellWorldVisualValidationResult {
  readonly armingStatus: string;
  readonly liveStatus: string;
  readonly expiringStatus: string;
  readonly dormantStatus: string;
  readonly armingInteractable: boolean;
  readonly liveInteractable: boolean;
  readonly expiringInteractable: boolean;
  readonly dormantInteractable: boolean;
  readonly liveWorldVisible: boolean;
  readonly dormantWorldVisible: boolean;
  readonly expiredWorldVisible: boolean;
  readonly liveRenderSize: number;
  readonly armingTrailLength: number;
  readonly liveTrailLength: number;
  readonly liveProjectileGlowOpacity: number;
  readonly dormantProjectileGlowOpacity: number;
  readonly liveOpacity: number;
  readonly dormantOpacity: number;
}

export function validateBananaPickupUiState(): BananaPickupUiValidationResult {
  const bananaPickup = requireDefaultBananaPickupState();
  const available = createCombatItemPickupVisualState(bananaPickup);
  const collected = createCombatItemPickupVisualState({
    ...bananaPickup,
    cooldownSeconds: bananaPickup.respawnSeconds / 2
  });
  const bananaVisual = getCombatItemHudVisualConfig(
    COMBAT_ITEM_REGISTRY.banana.type
  );

  assertStringEqual(available.itemType, "banana", "banana pickup item type");
  assertStringEqual(
    available.displayName,
    "Banana",
    "banana pickup display name"
  );
  assertStringEqual(
    available.inventoryIconKey,
    "combat-item-banana",
    "banana pickup inventory icon key"
  );
  assertStringEqual(
    available.worldVisualKey,
    "combat-item-banana-world",
    "banana pickup world visual key"
  );
  assertEqual(available.isAvailable, true, "available banana pickup state");
  assertEqual(collected.isAvailable, false, "collected banana pickup state");
  assertGreaterThan(
    available.opacity,
    collected.opacity,
    "collected banana pickup is dimmed"
  );
  assertAlmostEqual(
    collected.cooldownRatio,
    0.5,
    "collected banana pickup cooldown ratio"
  );
  assertEqual(
    available.markerSize,
    bananaVisual.markerSize,
    "banana pickup marker size uses visual config"
  );

  return {
    itemType: available.itemType,
    displayName: available.displayName,
    inventoryIconKey: available.inventoryIconKey,
    worldVisualKey: available.worldVisualKey,
    availableOpacity: available.opacity,
    collectedOpacity: collected.opacity,
    collectedCooldownRatio: collected.cooldownRatio,
    markerSize: available.markerSize
  };
}

export function validateBananaInventoryUiState(): BananaInventoryUiValidationResult {
  const inventory = createCombatItemInventorySlotState({
    heldItem: COMBAT_ITEM_REGISTRY.banana.type,
    itemUseCooldownSeconds: 0.18
  });

  assertEqual(inventory.isEmpty, false, "banana inventory slot is not empty");
  assertStringEqual(inventory.itemType, "banana", "banana inventory item type");
  assertStringEqual(
    inventory.displayName,
    "Banana",
    "banana inventory display name"
  );
  assertStringEqual(inventory.label, "BANANA", "banana inventory label");
  assertStringEqual(
    inventory.statusLabel,
    "ITEM RECOVERY",
    "banana inventory status label"
  );
  assertStringEqual(
    inventory.feedbackLabel,
    "TRAP HELD",
    "banana inventory feedback label"
  );
  assertStringEqual(
    inventory.inventoryIcon,
    "N",
    "banana inventory fallback icon"
  );
  assertStringEqual(
    inventory.inventoryIconKey,
    "combat-item-banana",
    "banana inventory icon key"
  );
  assertStringEqual(
    inventory.inventoryIconRef,
    "combat-item-banana",
    "banana inventory icon ref"
  );
  assertAlmostEqual(
    inventory.cooldownSeconds,
    0.18,
    "banana inventory cooldown seconds"
  );
  assertGreaterThan(
    inventory.cooldownRatio,
    0,
    "banana inventory cooldown ratio"
  );
  assertEqual(inventory.isReady, false, "banana inventory cooldown not ready");
  assertEqual(inventory.isShellHeld, false, "banana inventory shell flag");
  assertStringEqual(
    inventory.accentColor,
    getCombatItemHudVisualConfig(COMBAT_ITEM_REGISTRY.banana.type).accentColor,
    "banana inventory accent color"
  );

  return {
    itemType: inventory.itemType,
    displayName: inventory.displayName,
    label: inventory.label,
    statusLabel: inventory.statusLabel,
    feedbackLabel: inventory.feedbackLabel,
    inventoryIcon: inventory.inventoryIcon,
    inventoryIconKey: inventory.inventoryIconKey,
    inventoryIconRef: inventory.inventoryIconRef,
    cooldownSeconds: inventory.cooldownSeconds,
    cooldownRatio: inventory.cooldownRatio,
    isEmpty: inventory.isEmpty,
    isReady: inventory.isReady,
    isShellHeld: inventory.isShellHeld,
    accentColor: inventory.accentColor
  };
}

export function validateShellInventoryUiState(): ShellInventoryUiValidationResult {
  const inventory = createCombatItemInventorySlotState({
    heldItem: COMBAT_ITEM_REGISTRY.shell.type,
    itemUseCooldownSeconds: 0
  });
  const shellVisual = getCombatItemHudVisualConfig(
    COMBAT_ITEM_REGISTRY.shell.type
  );

  assertEqual(inventory.isEmpty, false, "shell inventory slot is not empty");
  assertStringEqual(inventory.itemType, "shell", "shell inventory item type");
  assertStringEqual(
    inventory.displayName,
    "Shell",
    "shell inventory display name"
  );
  assertStringEqual(inventory.label, "SHELL", "shell inventory label");
  assertStringEqual(
    inventory.statusLabel,
    "SHELL READY",
    "shell inventory status label"
  );
  assertStringEqual(
    inventory.feedbackLabel,
    "PROJECTILE HELD",
    "shell inventory feedback label"
  );
  assertStringEqual(
    inventory.inventoryIcon,
    "S",
    "shell inventory fallback icon"
  );
  assertStringEqual(
    inventory.inventoryIconKey,
    "combat-item-shell",
    "shell inventory icon key"
  );
  assertStringEqual(
    inventory.inventoryIconRef,
    "combat-item-shell",
    "shell inventory icon ref"
  );
  assertAlmostEqual(
    inventory.cooldownSeconds,
    0,
    "shell inventory cooldown seconds"
  );
  assertAlmostEqual(
    inventory.cooldownRatio,
    0,
    "shell inventory cooldown ratio"
  );
  assertEqual(inventory.isReady, true, "shell inventory ready flag");
  assertEqual(inventory.isShellHeld, true, "shell inventory shell flag");
  assertStringEqual(
    inventory.accentColor,
    shellVisual.accentColor,
    "shell inventory accent color"
  );
  assertEqual(
    inventory.activeMarkerSize,
    shellVisual.activeMarkerSize,
    "shell inventory active marker size uses visual config"
  );

  return {
    itemType: inventory.itemType,
    displayName: inventory.displayName,
    label: inventory.label,
    statusLabel: inventory.statusLabel,
    feedbackLabel: inventory.feedbackLabel,
    inventoryIcon: inventory.inventoryIcon,
    inventoryIconKey: inventory.inventoryIconKey,
    inventoryIconRef: inventory.inventoryIconRef,
    cooldownSeconds: inventory.cooldownSeconds,
    cooldownRatio: inventory.cooldownRatio,
    isEmpty: inventory.isEmpty,
    isReady: inventory.isReady,
    isShellHeld: inventory.isShellHeld,
    accentColor: inventory.accentColor,
    activeMarkerSize: inventory.activeMarkerSize
  };
}

export function validateAuthoritativeBananaPickupUiMerge(): BananaAuthoritativePickupUiValidationResult {
  const bananaPickup = requireDefaultBananaPickupState();
  const authoritativeCooldownSeconds = 3.25;
  const renderedPickups = createRenderedItemPickupStates(
    [bananaPickup],
    [
      {
        pickupId: bananaPickup.id,
        itemType: COMBAT_ITEM_REGISTRY.banana.type,
        cooldownSeconds: authoritativeCooldownSeconds
      }
    ]
  );
  const renderedBananaPickup = renderedPickups[0];

  if (renderedBananaPickup === undefined) {
    throw new Error("Expected rendered banana pickup state.");
  }

  assertAlmostEqual(
    bananaPickup.cooldownSeconds,
    0,
    "local banana pickup state remains unchanged"
  );
  assertAlmostEqual(
    renderedBananaPickup.cooldownSeconds,
    authoritativeCooldownSeconds,
    "rendered banana pickup uses authoritative cooldown"
  );
  assertStringEqual(
    renderedBananaPickup.itemType,
    "banana",
    "rendered banana pickup item type"
  );

  return {
    pickupId: renderedBananaPickup.id,
    localCooldownSeconds: bananaPickup.cooldownSeconds,
    renderedCooldownSeconds: renderedBananaPickup.cooldownSeconds,
    itemType: renderedBananaPickup.itemType
  };
}

export function validateActiveShellWorldVisualState(): ActiveShellWorldVisualValidationResult {
  const shell = COMBAT_ITEM_REGISTRY.shell;
  const shellConfig = shell.defaultRuntimeConfig;
  const arming = createActiveCombatItemVisualState({
    type: shell.type,
    armedSeconds: shellConfig.armSeconds,
    ttlSeconds: shellConfig.ttlSeconds,
    ageSeconds: 0,
    radius: shellConfig.radius,
    velocity: { x: shellConfig.speed, y: 0, z: 0 },
    lifetimeSeconds: shellConfig.ttlSeconds
  });
  const live = createActiveCombatItemVisualState({
    type: shell.type,
    armedSeconds: 0,
    ttlSeconds: shellConfig.ttlSeconds - shellConfig.armSeconds,
    ageSeconds: shellConfig.armSeconds,
    radius: shellConfig.radius,
    velocity: { x: shellConfig.speed, y: 0, z: 0 },
    lifetimeSeconds: shellConfig.ttlSeconds
  });
  const expiring = createActiveCombatItemVisualState({
    type: shell.type,
    armedSeconds: 0,
    ttlSeconds: shellConfig.ttlSeconds * 0.1,
    ageSeconds: shellConfig.ttlSeconds * 0.9,
    radius: shellConfig.radius,
    velocity: { x: shellConfig.speed, y: 0, z: 0 },
    lifetimeSeconds: shellConfig.ttlSeconds
  });
  const dormant = createActiveCombatItemVisualState({
    type: shell.type,
    armedSeconds: 0,
    ttlSeconds: 0.2,
    ageSeconds: shellConfig.ttlSeconds - 0.2,
    radius: shellConfig.radius,
    velocity: { x: 0, y: 0, z: 0 },
    lifetimeSeconds: shellConfig.ttlSeconds
  });
  const expired = createActiveCombatItemVisualState({
    type: shell.type,
    armedSeconds: 0,
    ttlSeconds: 0,
    ageSeconds: shellConfig.ttlSeconds,
    radius: shellConfig.radius,
    velocity: { x: shellConfig.speed, y: 0, z: 0 },
    lifetimeSeconds: shellConfig.ttlSeconds
  });

  assertStringEqual(arming.status, "arming", "arming shell world status");
  assertStringEqual(arming.statusLabel, "ARMING", "arming shell label");
  assertEqual(arming.isInteractable, false, "arming shell not interactable");
  assertEqual(arming.isWorldVisible, true, "arming shell is world visible");
  assertGreaterThan(
    arming.trailLength,
    0,
    "arming shell keeps travel trail while moving"
  );
  assertGreaterThan(
    live.armProgressRatio,
    arming.armProgressRatio,
    "live shell arm progress is complete"
  );
  assertStringEqual(live.status, "live", "live shell world status");
  assertStringEqual(live.statusLabel, "LIVE", "live shell label");
  assertEqual(live.isInteractable, true, "live shell interactable");
  assertEqual(live.isWorldVisible, true, "live shell is world visible");
  assertGreaterThan(live.renderSize, 0, "live shell has visible render size");
  assertGreaterThan(
    live.projectileGlowOpacity,
    0,
    "live shell has foreground projectile glow"
  );
  assertGreaterThan(
    live.trailLength,
    arming.trailLength,
    "live shell travel trail is stronger than arming trail"
  );
  assertGreaterThan(
    live.opacity,
    arming.opacity,
    "live shell is brighter than arming shell"
  );
  assertStringEqual(expiring.status, "expiring", "expiring shell world status");
  assertStringEqual(
    expiring.statusLabel,
    "EXPIRING",
    "expiring shell label"
  );
  assertEqual(expiring.isInteractable, true, "expiring shell interactable");
  assertStringEqual(dormant.status, "dormant", "dormant shell world status");
  assertEqual(dormant.isInteractable, false, "dormant shell not interactable");
  assertEqual(
    dormant.isWorldVisible,
    true,
    "active dormant shell remains world visible"
  );
  assertAlmostEqual(dormant.trailLength, 0, "dormant shell has no trail");
  assertGreaterThan(
    dormant.projectileGlowOpacity,
    0,
    "active dormant shell keeps a visible projectile glow"
  );
  assertGreaterThan(
    live.projectileGlowOpacity,
    dormant.projectileGlowOpacity,
    "live shell glow is stronger than dormant shell glow"
  );
  assertGreaterThan(
    live.opacity,
    dormant.opacity,
    "live shell is brighter than dormant shell"
  );
  assertEqual(expired.isWorldVisible, false, "expired shell is not world visible");

  return {
    armingStatus: arming.status,
    liveStatus: live.status,
    expiringStatus: expiring.status,
    dormantStatus: dormant.status,
    armingInteractable: arming.isInteractable,
    liveInteractable: live.isInteractable,
    expiringInteractable: expiring.isInteractable,
    dormantInteractable: dormant.isInteractable,
    liveWorldVisible: live.isWorldVisible,
    dormantWorldVisible: dormant.isWorldVisible,
    expiredWorldVisible: expired.isWorldVisible,
    liveRenderSize: live.renderSize,
    armingTrailLength: arming.trailLength,
    liveTrailLength: live.trailLength,
    liveProjectileGlowOpacity: live.projectileGlowOpacity,
    dormantProjectileGlowOpacity: dormant.projectileGlowOpacity,
    liveOpacity: live.opacity,
    dormantOpacity: dormant.opacity
  };
}

if (isDirectExecution()) {
  const pickup = validateBananaPickupUiState();
  const inventory = validateBananaInventoryUiState();
  const shellInventory = validateShellInventoryUiState();
  const authoritativePickup = validateAuthoritativeBananaPickupUiMerge();
  const activeShellWorld = validateActiveShellWorldVisualState();

  console.info(
    [
      "bananaPickupUi=ok",
      `itemType=${pickup.itemType}`,
      `displayName=${pickup.displayName}`,
      `inventoryIconKey=${pickup.inventoryIconKey}`,
      `worldVisualKey=${pickup.worldVisualKey}`,
      `availableOpacity=${pickup.availableOpacity}`,
      `collectedOpacity=${pickup.collectedOpacity}`,
      `collectedCooldownRatio=${pickup.collectedCooldownRatio}`,
      `markerSize=${pickup.markerSize}`
    ].join(" ")
  );
  console.info(
    [
      "bananaInventoryUi=ok",
      `itemType=${inventory.itemType}`,
      `displayName=${inventory.displayName}`,
      `label=${inventory.label}`,
      `statusLabel=${inventory.statusLabel}`,
      `feedbackLabel=${inventory.feedbackLabel}`,
      `inventoryIcon=${inventory.inventoryIcon}`,
      `inventoryIconKey=${inventory.inventoryIconKey}`,
      `inventoryIconRef=${inventory.inventoryIconRef}`,
      `cooldownSeconds=${inventory.cooldownSeconds}`,
      `cooldownRatio=${inventory.cooldownRatio}`,
      `isEmpty=${inventory.isEmpty}`,
      `isReady=${inventory.isReady}`,
      `isShellHeld=${inventory.isShellHeld}`,
      `accentColor=${inventory.accentColor}`
    ].join(" ")
  );
  console.info(
    [
      "shellInventoryUi=ok",
      `itemType=${shellInventory.itemType}`,
      `displayName=${shellInventory.displayName}`,
      `label=${shellInventory.label}`,
      `statusLabel=${shellInventory.statusLabel}`,
      `feedbackLabel=${shellInventory.feedbackLabel}`,
      `inventoryIcon=${shellInventory.inventoryIcon}`,
      `inventoryIconKey=${shellInventory.inventoryIconKey}`,
      `inventoryIconRef=${shellInventory.inventoryIconRef}`,
      `cooldownSeconds=${shellInventory.cooldownSeconds}`,
      `cooldownRatio=${shellInventory.cooldownRatio}`,
      `isEmpty=${shellInventory.isEmpty}`,
      `isReady=${shellInventory.isReady}`,
      `isShellHeld=${shellInventory.isShellHeld}`,
      `accentColor=${shellInventory.accentColor}`,
      `activeMarkerSize=${shellInventory.activeMarkerSize}`
    ].join(" ")
  );
  console.info(
    [
      "bananaAuthoritativePickupUi=ok",
      `pickupId=${authoritativePickup.pickupId}`,
      `localCooldown=${authoritativePickup.localCooldownSeconds}`,
      `renderedCooldown=${authoritativePickup.renderedCooldownSeconds}`,
      `itemType=${authoritativePickup.itemType}`
    ].join(" ")
  );
  console.info(
    [
      "activeShellWorldVisual=ok",
      `armingStatus=${activeShellWorld.armingStatus}`,
      `liveStatus=${activeShellWorld.liveStatus}`,
      `expiringStatus=${activeShellWorld.expiringStatus}`,
      `dormantStatus=${activeShellWorld.dormantStatus}`,
      `armingInteractable=${activeShellWorld.armingInteractable}`,
      `liveInteractable=${activeShellWorld.liveInteractable}`,
      `expiringInteractable=${activeShellWorld.expiringInteractable}`,
      `dormantInteractable=${activeShellWorld.dormantInteractable}`,
      `liveWorldVisible=${activeShellWorld.liveWorldVisible}`,
      `dormantWorldVisible=${activeShellWorld.dormantWorldVisible}`,
      `expiredWorldVisible=${activeShellWorld.expiredWorldVisible}`,
      `liveRenderSize=${activeShellWorld.liveRenderSize.toFixed(2)}`,
      `armingTrail=${activeShellWorld.armingTrailLength.toFixed(2)}`,
      `liveTrail=${activeShellWorld.liveTrailLength.toFixed(2)}`,
      `liveGlow=${activeShellWorld.liveProjectileGlowOpacity}`,
      `dormantGlow=${activeShellWorld.dormantProjectileGlowOpacity}`,
      `liveOpacity=${activeShellWorld.liveOpacity}`,
      `dormantOpacity=${activeShellWorld.dormantOpacity}`
    ].join(" ")
  );
}

function requireDefaultBananaPickupState(): RaceItemPickupState {
  const bananaPickup = DEFAULT_RACE_ITEM_PICKUPS.find(
    (pickup) => pickup.itemType === COMBAT_ITEM_REGISTRY.banana.type
  );

  if (bananaPickup === undefined) {
    throw new Error("Expected default item pickup table to include banana.");
  }

  return {
    ...bananaPickup,
    active: true,
    cooldownSeconds: 0,
    respawnDeadlineElapsedSeconds: null
  };
}

function assertEqual<T>(actual: T, expected: T, context: string): void {
  if (actual !== expected) {
    throw new Error(`${context}: expected ${expected}, received ${actual}.`);
  }
}

function assertStringEqual(
  actual: string | null,
  expected: string,
  context: string
): void {
  if (actual !== expected) {
    throw new Error(`${context}: expected ${expected}, received ${actual}.`);
  }
}

function assertGreaterThan(
  actual: number,
  expectedMinimum: number,
  context: string
): void {
  if (actual <= expectedMinimum) {
    throw new Error(
      `${context}: expected ${actual} to be greater than ${expectedMinimum}.`
    );
  }
}

function assertAlmostEqual(
  actual: number,
  expected: number,
  context: string
): void {
  if (Math.abs(actual - expected) > 0.000001) {
    throw new Error(`${context}: expected ${expected}, received ${actual}.`);
  }
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1];

  return (
    entryPath !== undefined &&
    import.meta.url === pathToFileURL(entryPath).href
  );
}
