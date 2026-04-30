import bananaInventoryIconUrl from "./items/combat-item-banana-icon.svg?url";
import bananaWorldVisualUrl from "./items/combat-item-banana-world.svg?url";
import shellInventoryIconUrl from "./items/combat-item-shell-icon.svg?url";
import shellWorldVisualUrl from "./items/combat-item-shell-world.svg?url";
import {
  COMBAT_ITEM_REGISTRY,
  type CombatItemType
} from "../race/raceSession";

export interface CombatItemVisualAsset {
  readonly itemType: CombatItemType;
  readonly inventoryIconKey: string;
  readonly inventoryIconSourcePath: string;
  readonly inventoryIconUrl: string;
  readonly worldVisualKey: string;
  readonly worldVisualSourcePath: string;
  readonly worldVisualUrl: string;
}

const BANANA_INVENTORY_ICON_KEY =
  COMBAT_ITEM_REGISTRY.banana.inventoryIconKey;
const SHELL_INVENTORY_ICON_KEY =
  COMBAT_ITEM_REGISTRY.shell.inventoryIconKey;

const BANANA_COMBAT_ITEM_VISUAL_ASSET = {
  itemType: COMBAT_ITEM_REGISTRY.banana.type,
  inventoryIconKey: BANANA_INVENTORY_ICON_KEY,
  inventoryIconSourcePath: `items/${BANANA_INVENTORY_ICON_KEY}-icon.svg`,
  inventoryIconUrl: bananaInventoryIconUrl,
  worldVisualKey: `${BANANA_INVENTORY_ICON_KEY}-world`,
  worldVisualSourcePath: `items/${BANANA_INVENTORY_ICON_KEY}-world.svg`,
  worldVisualUrl: bananaWorldVisualUrl
} as const satisfies CombatItemVisualAsset;

const SHELL_COMBAT_ITEM_VISUAL_ASSET = {
  itemType: COMBAT_ITEM_REGISTRY.shell.type,
  inventoryIconKey: SHELL_INVENTORY_ICON_KEY,
  inventoryIconSourcePath: `items/${SHELL_INVENTORY_ICON_KEY}-icon.svg`,
  inventoryIconUrl: shellInventoryIconUrl,
  worldVisualKey: `${SHELL_INVENTORY_ICON_KEY}-world`,
  worldVisualSourcePath: `items/${SHELL_INVENTORY_ICON_KEY}-world.svg`,
  worldVisualUrl: shellWorldVisualUrl
} as const satisfies CombatItemVisualAsset;

export const COMBAT_ITEM_VISUAL_ASSET_LIST = [
  SHELL_COMBAT_ITEM_VISUAL_ASSET,
  BANANA_COMBAT_ITEM_VISUAL_ASSET
] as const satisfies readonly CombatItemVisualAsset[];

const COMBAT_ITEM_VISUAL_ASSET_LOOKUP: ReadonlyMap<
  CombatItemType,
  CombatItemVisualAsset
> = new Map<CombatItemType, CombatItemVisualAsset>(
  COMBAT_ITEM_VISUAL_ASSET_LIST.map((asset) => [asset.itemType, asset] as const)
);

export function getCombatItemVisualAsset(
  itemType: CombatItemType
): CombatItemVisualAsset | null {
  return COMBAT_ITEM_VISUAL_ASSET_LOOKUP.get(itemType) ?? null;
}
