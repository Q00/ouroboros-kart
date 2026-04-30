import { pathToFileURL } from "node:url";
import {
  COMBAT_ITEM_VISUAL_ASSET_LIST,
  getCombatItemVisualAsset
} from "./combatItemAssets";
import { COMBAT_ITEM_REGISTRY } from "../race/raceSession";

export interface BananaCombatItemAssetValidationResult {
  readonly itemType: string;
  readonly inventoryIconKey: string;
  readonly inventoryIconSourcePath: string;
  readonly worldVisualKey: string;
  readonly worldVisualSourcePath: string;
}

export interface ShellCombatItemAssetValidationResult {
  readonly itemType: string;
  readonly inventoryIconKey: string;
  readonly inventoryIconSourcePath: string;
  readonly worldVisualKey: string;
  readonly worldVisualSourcePath: string;
}

export function validateBananaCombatItemAssetRegistration(): BananaCombatItemAssetValidationResult {
  return validateCombatItemAssetRegistration(COMBAT_ITEM_REGISTRY.banana);
}

export function validateShellCombatItemAssetRegistration(): ShellCombatItemAssetValidationResult {
  return validateCombatItemAssetRegistration(COMBAT_ITEM_REGISTRY.shell);
}

function validateCombatItemAssetRegistration(
  item: typeof COMBAT_ITEM_REGISTRY.banana | typeof COMBAT_ITEM_REGISTRY.shell
): BananaCombatItemAssetValidationResult {
  const asset = getCombatItemVisualAsset(item.type);

  if (asset === null) {
    throw new Error(
      `Expected ${item.type} combat item visual asset registration.`
    );
  }

  assert(
    COMBAT_ITEM_VISUAL_ASSET_LIST.some((entry) => entry.itemType === item.type),
    `${item.type} asset list registration`
  );
  assertStringEqual(asset.itemType, item.type, `${item.type} asset item type`);
  assertStringEqual(
    asset.inventoryIconKey,
    item.inventoryIconKey,
    `${item.type} asset inventory icon key`
  );
  assertStringEqual(
    asset.inventoryIconSourcePath,
    `items/${item.inventoryIconKey}-icon.svg`,
    `${item.type} inventory icon source path`
  );
  assertStringEqual(
    asset.worldVisualKey,
    `${item.inventoryIconKey}-world`,
    `${item.type} world visual key`
  );
  assertStringEqual(
    asset.worldVisualSourcePath,
    `items/${item.inventoryIconKey}-world.svg`,
    `${item.type} world visual source path`
  );
  assertNonEmptyText(
    asset.inventoryIconUrl,
    `${item.type} inventory icon asset url`
  );
  assertNonEmptyText(asset.worldVisualUrl, `${item.type} world visual asset url`);

  return {
    itemType: asset.itemType,
    inventoryIconKey: asset.inventoryIconKey,
    inventoryIconSourcePath: asset.inventoryIconSourcePath,
    worldVisualKey: asset.worldVisualKey,
    worldVisualSourcePath: asset.worldVisualSourcePath
  };
}

if (isDirectExecution()) {
  const bananaAsset = validateBananaCombatItemAssetRegistration();
  const shellAsset = validateShellCombatItemAssetRegistration();

  console.info(
    [
      "bananaAssets=ok",
      `itemType=${bananaAsset.itemType}`,
      `inventoryIconKey=${bananaAsset.inventoryIconKey}`,
      `inventoryIconSource=${bananaAsset.inventoryIconSourcePath}`,
      `worldVisualKey=${bananaAsset.worldVisualKey}`,
      `worldVisualSource=${bananaAsset.worldVisualSourcePath}`
    ].join(" ")
  );
  console.info(
    [
      "shellAssets=ok",
      `itemType=${shellAsset.itemType}`,
      `inventoryIconKey=${shellAsset.inventoryIconKey}`,
      `inventoryIconSource=${shellAsset.inventoryIconSourcePath}`,
      `worldVisualKey=${shellAsset.worldVisualKey}`,
      `worldVisualSource=${shellAsset.worldVisualSourcePath}`
    ].join(" ")
  );
}

function assert(condition: boolean, context: string): void {
  if (!condition) {
    throw new Error(`${context}: expected condition to pass.`);
  }
}

function assertStringEqual(
  actual: string,
  expected: string,
  context: string
): void {
  if (actual !== expected) {
    throw new Error(`${context}: expected ${expected}, received ${actual}.`);
  }
}

function assertNonEmptyText(value: string, context: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${context}: expected a non-empty string.`);
  }
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1];

  return (
    entryPath !== undefined &&
    import.meta.url === pathToFileURL(entryPath).href
  );
}
