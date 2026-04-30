import type { Vector3 } from "../config/aiRacers";
import type {
  RaceBananaHitEvent,
  RaceItemHitEffectData,
  RaceShellHitEvent,
  RaceShellHitImpactData
} from "../race/raceSession";
import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  KART_GAMEPLAY_PROTOCOL,
  KART_GAMEPLAY_VERSION
} from "./kartInputSnapshot";

export const MAX_ITEM_COLLISION_OUTCOME_EVENT_PAYLOAD_BYTES = 4 * 1024;

export const KART_ITEM_COLLISION_OUTCOME_TYPES = {
  SHELL_HIT: "shell-hit",
  BANANA_HIT: "banana-hit"
} as const;

export type KartItemCollisionOutcomeType =
  (typeof KART_ITEM_COLLISION_OUTCOME_TYPES)[keyof typeof KART_ITEM_COLLISION_OUTCOME_TYPES];

export type KartItemCollisionOutcomeItemType = "shell" | "banana";
export type KartItemCollisionOutcomeItemActiveState = "removed";
export type KartItemCollisionOutcomeItemConsumptionReason = "collision";

export interface KartItemCollisionOutcomeImpactSnapshot {
  readonly position: Vector3;
  readonly normal: Vector3;
  readonly itemPosition: Vector3;
  readonly itemVelocity: Vector3;
  readonly itemRadius: number;
  readonly victimHitboxCenter: Vector3;
  readonly penetrationDepth: number;
  readonly relativeSpeed: number;
}

export interface KartItemCollisionOutcomeEffectParameters {
  readonly itemType: KartItemCollisionOutcomeItemType;
  readonly stunSeconds: number;
  readonly spinoutSeconds: number;
  readonly spinoutAngularVelocity: number;
  readonly hitImmunitySeconds: number;
  readonly hitFeedbackSeconds: number;
  readonly speedFactor: number;
  readonly speedBeforeHit: number;
  readonly speedAfterHit: number;
  readonly headingDeltaRadians: number;
  readonly blockedByShield: boolean;
  readonly shieldSecondsBeforeHit: number;
  readonly shieldSecondsAfterHit: number;
}

export interface KartItemCollisionOutcomeItemConsumptionState {
  readonly activeState: KartItemCollisionOutcomeItemActiveState;
  readonly consumed: true;
  readonly despawned: true;
  readonly reason: KartItemCollisionOutcomeItemConsumptionReason;
  readonly collisionEventId: string;
  readonly consumedByRacerId: string;
  readonly consumedBySlotIndex: number;
  readonly removedAtTickIndex: number;
  readonly removedAtElapsedSeconds: number;
}

interface KartItemCollisionOutcomeEventMessageBase<
  ItemType extends KartItemCollisionOutcomeItemType,
  CollisionType extends KartItemCollisionOutcomeType
> {
  readonly protocol: typeof KART_GAMEPLAY_PROTOCOL;
  readonly version: typeof KART_GAMEPLAY_VERSION;
  readonly type: typeof KART_GAMEPLAY_MESSAGE_TYPES.ITEM_COLLISION_OUTCOME_EVENT;
  readonly eventId: string;
  readonly hostPeerId: string;
  readonly sourceClientId: string;
  readonly sequence: number;
  readonly itemId: string;
  readonly itemType: ItemType;
  readonly collisionType: CollisionType;
  readonly sourceRacerId: string;
  readonly sourceSlotIndex: number;
  readonly victimKartId: string;
  readonly victimSlotIndex: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly occurredAt: number;
  readonly impact: KartItemCollisionOutcomeImpactSnapshot;
  readonly effect: KartItemCollisionOutcomeEffectParameters & {
    readonly itemType: ItemType;
  };
  readonly itemConsumption: KartItemCollisionOutcomeItemConsumptionState;
}

export interface KartShellCollisionOutcomeEventMessage
  extends KartItemCollisionOutcomeEventMessageBase<
    "shell",
    typeof KART_ITEM_COLLISION_OUTCOME_TYPES.SHELL_HIT
  > {}

export interface KartBananaCollisionOutcomeEventMessage
  extends KartItemCollisionOutcomeEventMessageBase<
    "banana",
    typeof KART_ITEM_COLLISION_OUTCOME_TYPES.BANANA_HIT
  > {}

export type KartItemCollisionOutcomeEventMessage =
  | KartShellCollisionOutcomeEventMessage
  | KartBananaCollisionOutcomeEventMessage;

type KartItemCollisionOutcomeEventCreateOptions =
  | Omit<
      KartShellCollisionOutcomeEventMessage,
      "protocol" | "version" | "type"
    >
  | Omit<
      KartBananaCollisionOutcomeEventMessage,
      "protocol" | "version" | "type"
    >;

export interface KartItemCollisionOutcomeFromShellHitEventOptions {
  readonly event: RaceShellHitEvent;
  readonly hostPeerId: string;
  readonly sourceClientId: string;
  readonly sequence: number;
  readonly occurredAt: number;
}

export interface KartItemCollisionOutcomeFromBananaHitEventOptions {
  readonly event: RaceBananaHitEvent;
  readonly hostPeerId: string;
  readonly sourceClientId: string;
  readonly sequence: number;
  readonly occurredAt: number;
}

export class KartItemCollisionOutcomeEventMessageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "KartItemCollisionOutcomeEventMessageError";
  }
}

export function createKartItemCollisionOutcomeEventMessage(
  options: KartItemCollisionOutcomeEventCreateOptions
): KartItemCollisionOutcomeEventMessage {
  const itemType = requireItemType(options.itemType, "itemType");
  const collisionType = requireCollisionTypeForItemType(
    options.collisionType,
    itemType,
    "collisionType"
  );
  const effect = createEffectParametersSnapshot(options.effect, itemType);
  const eventId = requireNonEmptyText(options.eventId, "eventId");
  const victimKartId = requireNonEmptyText(options.victimKartId, "victimKartId");
  const victimSlotIndex = requireWholeNumber(
    options.victimSlotIndex,
    "victimSlotIndex"
  );
  const tickIndex = requireWholeNumber(options.tickIndex, "tickIndex");
  const elapsedSeconds = requireFiniteNonNegativeNumber(
    options.elapsedSeconds,
    "elapsedSeconds"
  );
  const itemConsumption = createItemConsumptionStateSnapshot(
    options.itemConsumption,
    "itemConsumption"
  );

  assertItemConsumptionMatchesCollision(itemConsumption, {
    eventId,
    victimKartId,
    victimSlotIndex,
    tickIndex,
    elapsedSeconds
  });

  const message = {
    protocol: KART_GAMEPLAY_PROTOCOL,
    version: KART_GAMEPLAY_VERSION,
    type: KART_GAMEPLAY_MESSAGE_TYPES.ITEM_COLLISION_OUTCOME_EVENT,
    eventId,
    hostPeerId: requireNonEmptyText(options.hostPeerId, "hostPeerId"),
    sourceClientId: requireNonEmptyText(
      options.sourceClientId,
      "sourceClientId"
    ),
    sequence: requireWholeNumber(options.sequence, "sequence"),
    itemId: requireNonEmptyText(options.itemId, "itemId"),
    itemType,
    collisionType,
    sourceRacerId: requireNonEmptyText(
      options.sourceRacerId,
      "sourceRacerId"
    ),
    sourceSlotIndex: requireWholeNumber(
      options.sourceSlotIndex,
      "sourceSlotIndex"
    ),
    victimKartId,
    victimSlotIndex,
    tickIndex,
    elapsedSeconds,
    occurredAt: requireFiniteNonNegativeNumber(options.occurredAt, "occurredAt"),
    impact: createImpactSnapshot(options.impact),
    effect,
    itemConsumption
  };

  return message as KartItemCollisionOutcomeEventMessage;
}

export function createKartItemCollisionOutcomeEventMessageFromShellHitEvent(
  options: KartItemCollisionOutcomeFromShellHitEventOptions
): KartShellCollisionOutcomeEventMessage {
  const event = options.event;

  if (event.itemType !== "shell" || event.effect.itemType !== "shell") {
    throw new KartItemCollisionOutcomeEventMessageError(
      "Shell collision outcome can only be created from a shell hit event."
    );
  }

  return createKartItemCollisionOutcomeEventMessage({
    eventId: event.eventId,
    hostPeerId: options.hostPeerId,
    sourceClientId: options.sourceClientId,
    sequence: options.sequence,
    itemId: event.shellId,
    itemType: "shell",
    collisionType: KART_ITEM_COLLISION_OUTCOME_TYPES.SHELL_HIT,
    sourceRacerId: event.sourceRacerId,
    sourceSlotIndex: event.sourceSlotIndex,
    victimKartId: event.targetRacerId,
    victimSlotIndex: event.targetSlotIndex,
    tickIndex: event.tickIndex,
    elapsedSeconds: event.elapsedSeconds,
    occurredAt: options.occurredAt,
    impact: createImpactSnapshotFromRaceImpact(event.impact),
    effect: createEffectParametersSnapshot(event.effect, "shell"),
    itemConsumption: createItemConsumptionStateFromRaceEvent(event)
  }) as KartShellCollisionOutcomeEventMessage;
}

export function createKartItemCollisionOutcomeEventMessageFromBananaHitEvent(
  options: KartItemCollisionOutcomeFromBananaHitEventOptions
): KartBananaCollisionOutcomeEventMessage {
  const event = options.event;

  if (event.itemType !== "banana" || event.effect.itemType !== "banana") {
    throw new KartItemCollisionOutcomeEventMessageError(
      "Banana collision outcome can only be created from a banana hit event."
    );
  }

  return createKartItemCollisionOutcomeEventMessage({
    eventId: event.eventId,
    hostPeerId: options.hostPeerId,
    sourceClientId: options.sourceClientId,
    sequence: options.sequence,
    itemId: event.bananaId,
    itemType: "banana",
    collisionType: KART_ITEM_COLLISION_OUTCOME_TYPES.BANANA_HIT,
    sourceRacerId: event.sourceRacerId,
    sourceSlotIndex: event.sourceSlotIndex,
    victimKartId: event.targetRacerId,
    victimSlotIndex: event.targetSlotIndex,
    tickIndex: event.tickIndex,
    elapsedSeconds: event.elapsedSeconds,
    occurredAt: options.occurredAt,
    impact: createImpactSnapshotFromRaceImpact(event.impact),
    effect: createEffectParametersSnapshot(event.effect, "banana"),
    itemConsumption: createItemConsumptionStateFromRaceEvent(event)
  }) as KartBananaCollisionOutcomeEventMessage;
}

export function createRaceShellHitEventFromItemCollisionOutcomeMessage(
  message: KartShellCollisionOutcomeEventMessage
): RaceShellHitEvent {
  const outcome = createKartItemCollisionOutcomeEventMessage(message);

  if (outcome.itemType !== "shell") {
    throw new KartItemCollisionOutcomeEventMessageError(
      "Shell hit race event requires a shell collision outcome."
    );
  }

  return {
    eventId: outcome.eventId,
    itemType: "shell",
    shellId: outcome.itemId,
    sourceRacerId: outcome.sourceRacerId,
    sourceSlotIndex: outcome.sourceSlotIndex,
    targetRacerId: outcome.victimKartId,
    targetSlotIndex: outcome.victimSlotIndex,
    tickIndex: outcome.tickIndex,
    elapsedSeconds: outcome.elapsedSeconds,
    impact: createRaceImpactFromOutcomeImpact(outcome.impact),
    effect: outcome.effect
  };
}

export function createRaceBananaHitEventFromItemCollisionOutcomeMessage(
  message: KartBananaCollisionOutcomeEventMessage
): RaceBananaHitEvent {
  const outcome = createKartItemCollisionOutcomeEventMessage(message);

  if (outcome.itemType !== "banana") {
    throw new KartItemCollisionOutcomeEventMessageError(
      "Banana hit race event requires a banana collision outcome."
    );
  }

  return {
    eventId: outcome.eventId,
    itemType: "banana",
    bananaId: outcome.itemId,
    sourceRacerId: outcome.sourceRacerId,
    sourceSlotIndex: outcome.sourceSlotIndex,
    targetRacerId: outcome.victimKartId,
    targetSlotIndex: outcome.victimSlotIndex,
    tickIndex: outcome.tickIndex,
    elapsedSeconds: outcome.elapsedSeconds,
    impact: createRaceImpactFromOutcomeImpact(outcome.impact),
    effect: outcome.effect
  };
}

export function serializeKartItemCollisionOutcomeEventMessage(
  message: KartItemCollisionOutcomeEventMessage
): string {
  return JSON.stringify(createKartItemCollisionOutcomeEventMessage(message));
}

export function deserializeKartItemCollisionOutcomeEventMessage(
  payload: unknown
): KartItemCollisionOutcomeEventMessage {
  if (typeof payload !== "string") {
    throw new KartItemCollisionOutcomeEventMessageError(
      "Item collision outcome payload must be a string."
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new KartItemCollisionOutcomeEventMessageError(
      "Item collision outcome payload is not valid JSON."
    );
  }

  if (!isRecord(parsed)) {
    throw new KartItemCollisionOutcomeEventMessageError(
      "Item collision outcome payload must be an object."
    );
  }

  if (parsed.protocol !== KART_GAMEPLAY_PROTOCOL) {
    throw new KartItemCollisionOutcomeEventMessageError(
      "Item collision outcome protocol mismatch."
    );
  }

  if (parsed.version !== KART_GAMEPLAY_VERSION) {
    throw new KartItemCollisionOutcomeEventMessageError(
      "Item collision outcome version mismatch."
    );
  }

  if (parsed.type !== KART_GAMEPLAY_MESSAGE_TYPES.ITEM_COLLISION_OUTCOME_EVENT) {
    throw new KartItemCollisionOutcomeEventMessageError(
      "Item collision outcome message type mismatch."
    );
  }

  return createKartItemCollisionOutcomeEventMessage({
    eventId: requireStringField(parsed, "eventId"),
    hostPeerId: requireStringField(parsed, "hostPeerId"),
    sourceClientId: requireStringField(parsed, "sourceClientId"),
    sequence: requireNumberField(parsed, "sequence"),
    itemId: requireStringField(parsed, "itemId"),
    itemType: requireItemTypeField(parsed, "itemType"),
    collisionType: requireCollisionTypeField(parsed, "collisionType"),
    sourceRacerId: requireStringField(parsed, "sourceRacerId"),
    sourceSlotIndex: requireNumberField(parsed, "sourceSlotIndex"),
    victimKartId: requireStringField(parsed, "victimKartId"),
    victimSlotIndex: requireNumberField(parsed, "victimSlotIndex"),
    tickIndex: requireNumberField(parsed, "tickIndex"),
    elapsedSeconds: requireNumberField(parsed, "elapsedSeconds"),
    occurredAt: requireNumberField(parsed, "occurredAt"),
    impact: requireImpactField(parsed, "impact"),
    effect: requireEffectParametersField(parsed, "effect"),
    itemConsumption: requireItemConsumptionStateField(parsed, "itemConsumption")
  } as KartItemCollisionOutcomeEventCreateOptions);
}

export function isKartItemCollisionOutcomeEventMessagePayload(
  payload: unknown
): payload is string {
  if (typeof payload !== "string") {
    return false;
  }

  try {
    deserializeKartItemCollisionOutcomeEventMessage(payload);
    return true;
  } catch {
    return false;
  }
}

export function isKartItemCollisionOutcomeType(
  value: unknown
): value is KartItemCollisionOutcomeType {
  return (
    value === KART_ITEM_COLLISION_OUTCOME_TYPES.SHELL_HIT ||
    value === KART_ITEM_COLLISION_OUTCOME_TYPES.BANANA_HIT
  );
}

function createImpactSnapshot(
  impact: KartItemCollisionOutcomeImpactSnapshot
): KartItemCollisionOutcomeImpactSnapshot {
  return {
    position: createVector3Snapshot(impact.position, "impact.position"),
    normal: createVector3Snapshot(impact.normal, "impact.normal"),
    itemPosition: createVector3Snapshot(
      impact.itemPosition,
      "impact.itemPosition"
    ),
    itemVelocity: createVector3Snapshot(
      impact.itemVelocity,
      "impact.itemVelocity"
    ),
    itemRadius: requirePositiveFiniteNumber(
      impact.itemRadius,
      "impact.itemRadius"
    ),
    victimHitboxCenter: createVector3Snapshot(
      impact.victimHitboxCenter,
      "impact.victimHitboxCenter"
    ),
    penetrationDepth: requireFiniteNonNegativeNumber(
      impact.penetrationDepth,
      "impact.penetrationDepth"
    ),
    relativeSpeed: requireFiniteNonNegativeNumber(
      impact.relativeSpeed,
      "impact.relativeSpeed"
    )
  };
}

function createImpactSnapshotFromRaceImpact(
  impact: RaceShellHitImpactData
): KartItemCollisionOutcomeImpactSnapshot {
  return createImpactSnapshot({
    position: impact.position,
    normal: impact.normal,
    itemPosition: impact.shellPosition,
    itemVelocity: impact.shellVelocity,
    itemRadius: impact.shellRadius,
    victimHitboxCenter: impact.targetHitboxCenter,
    penetrationDepth: impact.penetrationDepth,
    relativeSpeed: impact.relativeSpeed
  });
}

function createRaceImpactFromOutcomeImpact(
  impact: KartItemCollisionOutcomeImpactSnapshot
): RaceShellHitImpactData {
  const normalized = createImpactSnapshot(impact);

  return {
    position: normalized.position,
    normal: normalized.normal,
    shellPosition: normalized.itemPosition,
    shellVelocity: normalized.itemVelocity,
    shellRadius: normalized.itemRadius,
    targetHitboxCenter: normalized.victimHitboxCenter,
    penetrationDepth: normalized.penetrationDepth,
    relativeSpeed: normalized.relativeSpeed
  };
}

function createEffectParametersSnapshot<ItemType extends KartItemCollisionOutcomeItemType>(
  effect: RaceItemHitEffectData | KartItemCollisionOutcomeEffectParameters,
  expectedItemType: ItemType
): KartItemCollisionOutcomeEffectParameters & { readonly itemType: ItemType } {
  if (effect.itemType !== expectedItemType) {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome effect item type must be ${expectedItemType}.`
    );
  }

  return {
    itemType: expectedItemType,
    stunSeconds: requireFiniteNonNegativeNumber(
      effect.stunSeconds,
      "effect.stunSeconds"
    ),
    spinoutSeconds: requireFiniteNonNegativeNumber(
      effect.spinoutSeconds,
      "effect.spinoutSeconds"
    ),
    spinoutAngularVelocity: requireFiniteNumber(
      effect.spinoutAngularVelocity,
      "effect.spinoutAngularVelocity"
    ),
    hitImmunitySeconds: requireFiniteNonNegativeNumber(
      effect.hitImmunitySeconds,
      "effect.hitImmunitySeconds"
    ),
    hitFeedbackSeconds: requireFiniteNonNegativeNumber(
      effect.hitFeedbackSeconds,
      "effect.hitFeedbackSeconds"
    ),
    speedFactor: requireFiniteNonNegativeNumber(
      effect.speedFactor,
      "effect.speedFactor"
    ),
    speedBeforeHit: requireFiniteNonNegativeNumber(
      effect.speedBeforeHit,
      "effect.speedBeforeHit"
    ),
    speedAfterHit: requireFiniteNonNegativeNumber(
      effect.speedAfterHit,
      "effect.speedAfterHit"
    ),
    headingDeltaRadians: requireFiniteNumber(
      effect.headingDeltaRadians,
      "effect.headingDeltaRadians"
    ),
    blockedByShield: effect.blockedByShield === true,
    shieldSecondsBeforeHit: requireFiniteNonNegativeNumber(
      effect.shieldSecondsBeforeHit ?? 0,
      "effect.shieldSecondsBeforeHit"
    ),
    shieldSecondsAfterHit: requireFiniteNonNegativeNumber(
      effect.shieldSecondsAfterHit ?? 0,
      "effect.shieldSecondsAfterHit"
    )
  };
}

function createItemConsumptionStateFromRaceEvent(
  event: RaceShellHitEvent | RaceBananaHitEvent
): KartItemCollisionOutcomeItemConsumptionState {
  return {
    activeState: "removed",
    consumed: true,
    despawned: true,
    reason: "collision",
    collisionEventId: event.eventId,
    consumedByRacerId: event.targetRacerId,
    consumedBySlotIndex: event.targetSlotIndex,
    removedAtTickIndex: event.tickIndex,
    removedAtElapsedSeconds: event.elapsedSeconds
  };
}

function createItemConsumptionStateSnapshot(
  itemConsumption: unknown,
  key: string
): KartItemCollisionOutcomeItemConsumptionState {
  if (!isRecord(itemConsumption)) {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome field must be an item consumption object: ${key}.`
    );
  }

  return {
    activeState: requireItemActiveState(
      itemConsumption.activeState,
      `${key}.activeState`
    ),
    consumed: requireTrue(itemConsumption.consumed, `${key}.consumed`),
    despawned: requireTrue(itemConsumption.despawned, `${key}.despawned`),
    reason: requireItemConsumptionReason(
      itemConsumption.reason,
      `${key}.reason`
    ),
    collisionEventId: requireNonEmptyText(
      requireStringField(itemConsumption, "collisionEventId"),
      `${key}.collisionEventId`
    ),
    consumedByRacerId: requireNonEmptyText(
      requireStringField(itemConsumption, "consumedByRacerId"),
      `${key}.consumedByRacerId`
    ),
    consumedBySlotIndex: requireWholeNumber(
      requireNumberField(itemConsumption, "consumedBySlotIndex"),
      `${key}.consumedBySlotIndex`
    ),
    removedAtTickIndex: requireWholeNumber(
      requireNumberField(itemConsumption, "removedAtTickIndex"),
      `${key}.removedAtTickIndex`
    ),
    removedAtElapsedSeconds: requireFiniteNonNegativeNumber(
      requireNumberField(itemConsumption, "removedAtElapsedSeconds"),
      `${key}.removedAtElapsedSeconds`
    )
  };
}

function assertItemConsumptionMatchesCollision(
  itemConsumption: KartItemCollisionOutcomeItemConsumptionState,
  collision: {
    readonly eventId: string;
    readonly victimKartId: string;
    readonly victimSlotIndex: number;
    readonly tickIndex: number;
    readonly elapsedSeconds: number;
  }
): void {
  if (itemConsumption.collisionEventId !== collision.eventId) {
    throw new KartItemCollisionOutcomeEventMessageError(
      "Item collision outcome consumption event id must match the collision event."
    );
  }

  if (
    itemConsumption.consumedByRacerId !== collision.victimKartId ||
    itemConsumption.consumedBySlotIndex !== collision.victimSlotIndex
  ) {
    throw new KartItemCollisionOutcomeEventMessageError(
      "Item collision outcome consumption target must match the collision victim."
    );
  }

  if (
    itemConsumption.removedAtTickIndex !== collision.tickIndex ||
    itemConsumption.removedAtElapsedSeconds !== collision.elapsedSeconds
  ) {
    throw new KartItemCollisionOutcomeEventMessageError(
      "Item collision outcome consumption timing must match the collision timing."
    );
  }
}

function requireImpactField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartItemCollisionOutcomeImpactSnapshot {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome field must be an impact object: ${key}.`
    );
  }

  return {
    position: requireVector3Field(value, "position"),
    normal: requireVector3Field(value, "normal"),
    itemPosition: requireVector3Field(value, "itemPosition"),
    itemVelocity: requireVector3Field(value, "itemVelocity"),
    itemRadius: requireNumberField(value, "itemRadius"),
    victimHitboxCenter: requireVector3Field(value, "victimHitboxCenter"),
    penetrationDepth: requireNumberField(value, "penetrationDepth"),
    relativeSpeed: requireNumberField(value, "relativeSpeed")
  };
}

function requireItemConsumptionStateField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartItemCollisionOutcomeItemConsumptionState {
  return createItemConsumptionStateSnapshot(record[key], key);
}

function requireEffectParametersField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartItemCollisionOutcomeEffectParameters {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome field must be an effect parameters object: ${key}.`
    );
  }

  return {
    itemType: requireItemTypeField(value, "itemType"),
    stunSeconds: requireNumberField(value, "stunSeconds"),
    spinoutSeconds: requireNumberField(value, "spinoutSeconds"),
    spinoutAngularVelocity: requireNumberField(value, "spinoutAngularVelocity"),
    hitImmunitySeconds: requireNumberField(value, "hitImmunitySeconds"),
    hitFeedbackSeconds: requireNumberField(value, "hitFeedbackSeconds"),
    speedFactor: requireNumberField(value, "speedFactor"),
    speedBeforeHit: requireNumberField(value, "speedBeforeHit"),
    speedAfterHit: requireNumberField(value, "speedAfterHit"),
    headingDeltaRadians: requireNumberField(value, "headingDeltaRadians"),
    blockedByShield: requireBooleanField(value, "blockedByShield"),
    shieldSecondsBeforeHit: requireNumberField(value, "shieldSecondsBeforeHit"),
    shieldSecondsAfterHit: requireNumberField(value, "shieldSecondsAfterHit")
  };
}

function requireVector3Field(
  record: Readonly<Record<string, unknown>>,
  key: string
): Vector3 {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome field must be a vector object: ${key}.`
    );
  }

  return {
    x: requireNumberField(value, "x"),
    y: requireNumberField(value, "y"),
    z: requireNumberField(value, "z")
  };
}

function createVector3Snapshot(vector: Vector3, key: string): Vector3 {
  return {
    x: requireFiniteNumber(vector.x, `${key}.x`),
    y: requireFiniteNumber(vector.y, `${key}.y`),
    z: requireFiniteNumber(vector.z, `${key}.z`)
  };
}

function requireItemTypeField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartItemCollisionOutcomeItemType {
  return requireItemType(record[key], key);
}

function requireItemType(
  value: unknown,
  key: string
): KartItemCollisionOutcomeItemType {
  if (value !== "shell" && value !== "banana") {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome field must be shell or banana: ${key}.`
    );
  }

  return value;
}

function requireCollisionTypeField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartItemCollisionOutcomeType {
  const value = record[key];

  if (!isKartItemCollisionOutcomeType(value)) {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Unsupported item collision outcome type for ${key}: ${String(value)}.`
    );
  }

  return value;
}

function requireCollisionTypeForItemType<ItemType extends KartItemCollisionOutcomeItemType>(
  value: KartItemCollisionOutcomeType,
  itemType: ItemType,
  key: string
): ItemType extends "shell"
  ? typeof KART_ITEM_COLLISION_OUTCOME_TYPES.SHELL_HIT
  : typeof KART_ITEM_COLLISION_OUTCOME_TYPES.BANANA_HIT {
  const expected =
    itemType === "shell"
      ? KART_ITEM_COLLISION_OUTCOME_TYPES.SHELL_HIT
      : KART_ITEM_COLLISION_OUTCOME_TYPES.BANANA_HIT;

  if (value !== expected) {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome ${key} must be ${expected} for ${itemType}.`
    );
  }

  return expected as ItemType extends "shell"
    ? typeof KART_ITEM_COLLISION_OUTCOME_TYPES.SHELL_HIT
    : typeof KART_ITEM_COLLISION_OUTCOME_TYPES.BANANA_HIT;
}

function requireItemActiveState(
  value: unknown,
  key: string
): KartItemCollisionOutcomeItemActiveState {
  if (value !== "removed") {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome field must be removed: ${key}.`
    );
  }

  return value;
}

function requireItemConsumptionReason(
  value: unknown,
  key: string
): KartItemCollisionOutcomeItemConsumptionReason {
  if (value !== "collision") {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome field must be collision: ${key}.`
    );
  }

  return value;
}

function requireTrue(value: unknown, key: string): true {
  if (value !== true) {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome field must be true: ${key}.`
    );
  }

  return true;
}

function requireStringField(
  record: Readonly<Record<string, unknown>>,
  key: string
): string {
  const value = record[key];

  if (typeof value !== "string") {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome field must be a string: ${key}.`
    );
  }

  return value;
}

function requireNumberField(
  record: Readonly<Record<string, unknown>>,
  key: string
): number {
  const value = record[key];

  if (typeof value !== "number") {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome field must be a number: ${key}.`
    );
  }

  return value;
}

function requireBooleanField(
  record: Readonly<Record<string, unknown>>,
  key: string
): boolean {
  const value = record[key];

  if (typeof value !== "boolean") {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome field must be a boolean: ${key}.`
    );
  }

  return value;
}

function requireNonEmptyText(value: string, key: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome field must be non-empty: ${key}.`
    );
  }

  return normalized;
}

function requireWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome field must be a whole non-negative number: ${key}.`
    );
  }

  return value;
}

function requireFiniteNumber(value: number, key: string): number {
  if (!Number.isFinite(value)) {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome field must be finite: ${key}.`
    );
  }

  return value;
}

function requireFiniteNonNegativeNumber(value: number, key: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome field must be a finite non-negative number: ${key}.`
    );
  }

  return value;
}

function requirePositiveFiniteNumber(value: number, key: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new KartItemCollisionOutcomeEventMessageError(
      `Item collision outcome field must be a finite positive number: ${key}.`
    );
  }

  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
