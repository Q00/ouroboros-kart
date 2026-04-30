import type { Vector3 } from "../config/aiRacers";
import type {
  ActiveRaceItemState,
  RaceBananaHitEvent,
  RaceBananaRemovalEvent,
  RaceBananaRemovalReason,
  RaceBananaSpawnEvent,
  RaceItemHitEffectData
} from "../race/raceSession";
import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  KART_GAMEPLAY_PROTOCOL,
  KART_GAMEPLAY_VERSION
} from "./kartInputSnapshot";

export const MAX_BANANA_EVENT_PAYLOAD_BYTES = 4 * 1024;

export type KartBananaEventMessageType =
  | typeof KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT
  | typeof KART_GAMEPLAY_MESSAGE_TYPES.BANANA_COLLISION_EVENT
  | typeof KART_GAMEPLAY_MESSAGE_TYPES.BANANA_REMOVAL_EVENT;

export type KartBananaRemovalReason = RaceBananaRemovalReason;

export interface KartBananaCollisionImpactSnapshot {
  readonly position: Vector3;
  readonly normal: Vector3;
  readonly bananaPosition: Vector3;
  readonly bananaVelocity: Vector3;
  readonly bananaRadius: number;
  readonly targetHitboxCenter: Vector3;
  readonly penetrationDepth: number;
  readonly relativeSpeed: number;
}

export interface KartBananaCollisionEffectSnapshot {
  readonly itemType: "banana";
  readonly stunSeconds: number;
  readonly spinoutSeconds: number;
  readonly spinoutAngularVelocity: number;
  readonly hitImmunitySeconds: number;
  readonly hitFeedbackSeconds: number;
  readonly speedFactor: number;
  readonly speedBeforeHit: number;
  readonly speedAfterHit: number;
  readonly headingDeltaRadians: number;
  readonly blockedByShield?: boolean;
  readonly shieldSecondsBeforeHit?: number;
  readonly shieldSecondsAfterHit?: number;
}

interface KartBananaEventMessageBase {
  readonly protocol: typeof KART_GAMEPLAY_PROTOCOL;
  readonly version: typeof KART_GAMEPLAY_VERSION;
  readonly type: KartBananaEventMessageType;
  readonly eventId: string;
  readonly bananaId: string;
  readonly networkId: string;
  readonly ownerPlayerId: string;
  readonly ownerId: string;
  readonly ownerRacerId: string;
  readonly ownerSlotIndex: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly occurredAt: number;
}

export interface KartBananaSpawnEventMessage extends KartBananaEventMessageBase {
  readonly type: typeof KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT;
  readonly activeState: "active";
  readonly removed: false;
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly radius: number;
  readonly armedSeconds: number;
  readonly ttlSeconds: number;
  readonly ageSeconds: number;
  readonly orientationRadians: number;
}

export interface KartBananaCollisionEventMessage extends KartBananaEventMessageBase {
  readonly type: typeof KART_GAMEPLAY_MESSAGE_TYPES.BANANA_COLLISION_EVENT;
  readonly activeState: "removed";
  readonly removed: true;
  readonly targetPlayerId?: string;
  readonly targetRacerId: string;
  readonly targetSlotIndex: number;
  readonly impact: KartBananaCollisionImpactSnapshot;
  readonly effect: KartBananaCollisionEffectSnapshot;
}

export interface KartBananaRemovalEventMessage extends KartBananaEventMessageBase {
  readonly type: typeof KART_GAMEPLAY_MESSAGE_TYPES.BANANA_REMOVAL_EVENT;
  readonly activeState: "removed";
  readonly removed: true;
  readonly reason: KartBananaRemovalReason;
  readonly collisionEventId?: string;
  readonly collidedRacerId?: string;
}

export type KartBananaEventMessage =
  | KartBananaSpawnEventMessage
  | KartBananaCollisionEventMessage
  | KartBananaRemovalEventMessage;

export interface KartBananaEventBaseCreateOptions {
  readonly eventId: string;
  readonly bananaId: string;
  readonly ownerPlayerId: string;
  readonly ownerRacerId: string;
  readonly ownerSlotIndex: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly occurredAt: number;
}

export interface KartBananaSpawnEventCreateOptions
  extends KartBananaEventBaseCreateOptions {
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly radius: number;
  readonly armedSeconds: number;
  readonly ttlSeconds: number;
  readonly ageSeconds: number;
  readonly orientationRadians: number;
}

export interface KartBananaCollisionEventCreateOptions
  extends KartBananaEventBaseCreateOptions {
  readonly targetPlayerId?: string;
  readonly targetRacerId: string;
  readonly targetSlotIndex: number;
  readonly impact: KartBananaCollisionImpactSnapshot;
  readonly effect: KartBananaCollisionEffectSnapshot;
}

export interface KartBananaRemovalEventCreateOptions
  extends KartBananaEventBaseCreateOptions {
  readonly reason: KartBananaRemovalReason;
  readonly collisionEventId?: string;
  readonly collidedRacerId?: string;
}

export interface KartBananaSpawnEventFromActiveItemOptions {
  readonly item: ActiveRaceItemState;
  readonly ownerPlayerId: string;
  readonly eventId?: string;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly occurredAt: number;
}

export interface KartBananaCollisionEventFromRaceEventOptions {
  readonly event: RaceBananaHitEvent;
  readonly ownerPlayerId: string;
  readonly targetPlayerId?: string;
  readonly occurredAt: number;
}

export interface KartBananaRemovalEventFromRaceEventOptions {
  readonly event: RaceBananaRemovalEvent;
  readonly ownerPlayerId: string;
  readonly occurredAt: number;
}

export class KartBananaEventMessageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "KartBananaEventMessageError";
  }
}

export function createKartBananaSpawnEventMessage(
  options: KartBananaSpawnEventCreateOptions
): KartBananaSpawnEventMessage {
  return {
    ...createBananaEventBase(options),
    type: KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT,
    activeState: "active",
    removed: false,
    position: createVector3Snapshot(options.position, "position"),
    velocity: createVector3Snapshot(options.velocity, "velocity"),
    radius: requirePositiveFiniteNumber(options.radius, "radius"),
    armedSeconds: requireFiniteNonNegativeNumber(
      options.armedSeconds,
      "armedSeconds"
    ),
    ttlSeconds: requireFiniteNonNegativeNumber(options.ttlSeconds, "ttlSeconds"),
    ageSeconds: requireFiniteNonNegativeNumber(options.ageSeconds, "ageSeconds"),
    orientationRadians: requireFiniteNumber(
      options.orientationRadians,
      "orientationRadians"
    )
  };
}

export function createKartBananaCollisionEventMessage(
  options: KartBananaCollisionEventCreateOptions
): KartBananaCollisionEventMessage {
  const message: Mutable<KartBananaCollisionEventMessage> = {
    ...createBananaEventBase(options),
    type: KART_GAMEPLAY_MESSAGE_TYPES.BANANA_COLLISION_EVENT,
    activeState: "removed",
    removed: true,
    targetRacerId: requireNonEmptyText(options.targetRacerId, "targetRacerId"),
    targetSlotIndex: requireWholeNumber(
      options.targetSlotIndex,
      "targetSlotIndex"
    ),
    impact: createBananaCollisionImpactSnapshot(options.impact),
    effect: createBananaCollisionEffectSnapshot(options.effect)
  };

  if (options.targetPlayerId !== undefined) {
    message.targetPlayerId = requireNonEmptyText(
      options.targetPlayerId,
      "targetPlayerId"
    );
  }

  return message;
}

export function createKartBananaRemovalEventMessage(
  options: KartBananaRemovalEventCreateOptions
): KartBananaRemovalEventMessage {
  const message: Mutable<KartBananaRemovalEventMessage> = {
    ...createBananaEventBase(options),
    type: KART_GAMEPLAY_MESSAGE_TYPES.BANANA_REMOVAL_EVENT,
    activeState: "removed",
    removed: true,
    reason: requireBananaRemovalReason(options.reason)
  };

  if (options.collisionEventId !== undefined) {
    message.collisionEventId = requireNonEmptyText(
      options.collisionEventId,
      "collisionEventId"
    );
  }

  if (options.collidedRacerId !== undefined) {
    message.collidedRacerId = requireNonEmptyText(
      options.collidedRacerId,
      "collidedRacerId"
    );
  }

  return message;
}

export function createKartBananaSpawnEventMessageFromActiveItem(
  options: KartBananaSpawnEventFromActiveItemOptions
): KartBananaSpawnEventMessage {
  const item = options.item;

  if (item.type !== "banana") {
    throw new KartBananaEventMessageError(
      "Banana spawn event can only be created from a banana active item."
    );
  }

  return createKartBananaSpawnEventMessage({
    eventId: options.eventId ?? `banana_spawn_${item.id}`,
    bananaId: item.id,
    ownerPlayerId: options.ownerPlayerId,
    ownerRacerId: item.ownerRacerId,
    ownerSlotIndex: item.owner.slotIndex,
    tickIndex: options.tickIndex,
    elapsedSeconds: options.elapsedSeconds,
    occurredAt: options.occurredAt,
    position: item.position,
    velocity: item.velocity,
    radius: item.radius,
    armedSeconds: item.armedSeconds,
    ttlSeconds: item.ttlSeconds,
    ageSeconds: item.ageSeconds,
    orientationRadians: item.orientationRadians
  });
}

export function createRaceBananaSpawnEventFromMessage(
  message: KartBananaSpawnEventMessage
): RaceBananaSpawnEvent {
  const spawn = createKartBananaSpawnEventMessage(message);

  return {
    eventId: spawn.eventId,
    itemType: "banana",
    bananaId: spawn.bananaId,
    ownerRacerId: spawn.ownerRacerId,
    ownerSlotIndex: spawn.ownerSlotIndex,
    tickIndex: spawn.tickIndex,
    elapsedSeconds: spawn.elapsedSeconds,
    position: spawn.position,
    velocity: spawn.velocity,
    radius: spawn.radius,
    armedSeconds: spawn.armedSeconds,
    ttlSeconds: spawn.ttlSeconds,
    ageSeconds: spawn.ageSeconds,
    orientationRadians: spawn.orientationRadians
  };
}

export function createKartBananaCollisionEventMessageFromRaceEvent(
  options: KartBananaCollisionEventFromRaceEventOptions
): KartBananaCollisionEventMessage {
  const event = options.event;

  if (event.itemType !== "banana" || event.effect.itemType !== "banana") {
    throw new KartBananaEventMessageError(
      "Banana collision event can only be created from a banana hit event."
    );
  }

  const createOptions: Mutable<KartBananaCollisionEventCreateOptions> = {
    eventId: event.eventId,
    bananaId: event.bananaId,
    ownerPlayerId: options.ownerPlayerId,
    ownerRacerId: event.sourceRacerId,
    ownerSlotIndex: event.sourceSlotIndex,
    targetRacerId: event.targetRacerId,
    targetSlotIndex: event.targetSlotIndex,
    tickIndex: event.tickIndex,
    elapsedSeconds: event.elapsedSeconds,
    occurredAt: options.occurredAt,
    impact: {
      position: event.impact.position,
      normal: event.impact.normal,
      bananaPosition: event.impact.shellPosition,
      bananaVelocity: event.impact.shellVelocity,
      bananaRadius: event.impact.shellRadius,
      targetHitboxCenter: event.impact.targetHitboxCenter,
      penetrationDepth: event.impact.penetrationDepth,
      relativeSpeed: event.impact.relativeSpeed
    },
    effect: createBananaCollisionEffectSnapshot(event.effect)
  };

  if (options.targetPlayerId !== undefined) {
    createOptions.targetPlayerId = options.targetPlayerId;
  }

  return createKartBananaCollisionEventMessage(createOptions);
}

export function createRaceBananaHitEventFromMessage(
  message: KartBananaCollisionEventMessage
): RaceBananaHitEvent {
  const collision = createKartBananaCollisionEventMessage(message);

  return {
    eventId: collision.eventId,
    itemType: "banana",
    bananaId: collision.bananaId,
    sourceRacerId: collision.ownerRacerId,
    sourceSlotIndex: collision.ownerSlotIndex,
    targetRacerId: collision.targetRacerId,
    targetSlotIndex: collision.targetSlotIndex,
    tickIndex: collision.tickIndex,
    elapsedSeconds: collision.elapsedSeconds,
    impact: {
      position: collision.impact.position,
      normal: collision.impact.normal,
      shellPosition: collision.impact.bananaPosition,
      shellVelocity: collision.impact.bananaVelocity,
      shellRadius: collision.impact.bananaRadius,
      targetHitboxCenter: collision.impact.targetHitboxCenter,
      penetrationDepth: collision.impact.penetrationDepth,
      relativeSpeed: collision.impact.relativeSpeed
    },
    effect: collision.effect
  };
}

export function createKartBananaRemovalEventMessageFromRaceEvent(
  options: KartBananaRemovalEventFromRaceEventOptions
): KartBananaRemovalEventMessage {
  const event = options.event;

  if (event.itemType !== "banana") {
    throw new KartBananaEventMessageError(
      "Banana removal event can only be created from a banana removal event."
    );
  }

  return createKartBananaRemovalEventMessage({
    eventId: event.eventId,
    bananaId: event.bananaId,
    ownerPlayerId: options.ownerPlayerId,
    ownerRacerId: event.ownerRacerId,
    ownerSlotIndex: event.ownerSlotIndex,
    tickIndex: event.tickIndex,
    elapsedSeconds: event.elapsedSeconds,
    occurredAt: options.occurredAt,
    reason: event.reason,
    ...(event.collisionEventId === undefined
      ? {}
      : { collisionEventId: event.collisionEventId }),
    ...(event.collidedRacerId === undefined
      ? {}
      : { collidedRacerId: event.collidedRacerId })
  });
}

export function createRaceBananaRemovalEventFromMessage(
  message: KartBananaRemovalEventMessage
): RaceBananaRemovalEvent {
  const removal = createKartBananaRemovalEventMessage(message);
  const event: Mutable<RaceBananaRemovalEvent> = {
    eventId: removal.eventId,
    itemType: "banana",
    bananaId: removal.bananaId,
    ownerRacerId: removal.ownerRacerId,
    ownerSlotIndex: removal.ownerSlotIndex,
    tickIndex: removal.tickIndex,
    elapsedSeconds: removal.elapsedSeconds,
    reason: removal.reason
  };

  if (removal.collisionEventId !== undefined) {
    event.collisionEventId = removal.collisionEventId;
  }

  if (removal.collidedRacerId !== undefined) {
    event.collidedRacerId = removal.collidedRacerId;
  }

  return event;
}

export function serializeKartBananaEventMessage(
  message: KartBananaEventMessage
): string {
  return JSON.stringify(createKartBananaEventMessage(message));
}

export function deserializeKartBananaEventMessage(
  payload: unknown
): KartBananaEventMessage {
  if (typeof payload !== "string") {
    throw new KartBananaEventMessageError(
      "Banana event payload must be a string."
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new KartBananaEventMessageError(
      "Banana event payload is not valid JSON."
    );
  }

  if (!isRecord(parsed)) {
    throw new KartBananaEventMessageError(
      "Banana event payload must be an object."
    );
  }

  if (parsed.protocol !== KART_GAMEPLAY_PROTOCOL) {
    throw new KartBananaEventMessageError("Banana event protocol mismatch.");
  }

  if (parsed.version !== KART_GAMEPLAY_VERSION) {
    throw new KartBananaEventMessageError("Banana event version mismatch.");
  }

  if (!isKartBananaEventMessageType(parsed.type)) {
    throw new KartBananaEventMessageError("Banana event type mismatch.");
  }

  switch (parsed.type) {
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT:
      return createKartBananaSpawnEventMessage({
        ...readBananaEventBaseFields(parsed),
        position: requireVector3Field(parsed, "position"),
        velocity: requireVector3Field(parsed, "velocity"),
        radius: requireNumberField(parsed, "radius"),
        armedSeconds: requireNumberField(parsed, "armedSeconds"),
        ttlSeconds: requireNumberField(parsed, "ttlSeconds"),
        ageSeconds: requireNumberField(parsed, "ageSeconds"),
        orientationRadians: requireNumberField(parsed, "orientationRadians")
      });
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_COLLISION_EVENT:
      return createKartBananaCollisionEventMessage(
        withOptionalTextFields(
          {
            ...readBananaEventBaseFields(parsed),
            targetRacerId: requireStringField(parsed, "targetRacerId"),
            targetSlotIndex: requireNumberField(parsed, "targetSlotIndex"),
            impact: requireBananaCollisionImpactField(parsed, "impact"),
            effect: requireBananaCollisionEffectField(parsed, "effect")
          },
          {
            targetPlayerId: requireOptionalStringField(parsed, "targetPlayerId")
          }
        )
      );
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_REMOVAL_EVENT:
      return createKartBananaRemovalEventMessage(
        withOptionalTextFields(
          {
            ...readBananaEventBaseFields(parsed),
            reason: requireBananaRemovalReasonField(parsed, "reason")
          },
          {
            collisionEventId: requireOptionalStringField(parsed, "collisionEventId"),
            collidedRacerId: requireOptionalStringField(parsed, "collidedRacerId")
          }
        )
      );
  }
}

export function createKartBananaEventMessage(
  message: KartBananaEventMessage
): KartBananaEventMessage {
  switch (message.type) {
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT:
      return createKartBananaSpawnEventMessage(message);
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_COLLISION_EVENT:
      return createKartBananaCollisionEventMessage(message);
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_REMOVAL_EVENT:
      return createKartBananaRemovalEventMessage(message);
  }
}

export function isKartBananaEventMessagePayload(
  payload: unknown
): payload is string {
  if (typeof payload !== "string") {
    return false;
  }

  try {
    deserializeKartBananaEventMessage(payload);
    return true;
  } catch {
    return false;
  }
}

export function isKartBananaEventMessageType(
  value: unknown
): value is KartBananaEventMessageType {
  return (
    value === KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT ||
    value === KART_GAMEPLAY_MESSAGE_TYPES.BANANA_COLLISION_EVENT ||
    value === KART_GAMEPLAY_MESSAGE_TYPES.BANANA_REMOVAL_EVENT
  );
}

function withOptionalTextFields<Base extends object>(
  base: Base,
  optionalFields: Readonly<Record<string, string | undefined>>
): Base {
  const message: Record<string, unknown> = {
    ...(base as Record<string, unknown>)
  };

  for (const [key, value] of Object.entries(optionalFields)) {
    if (value !== undefined) {
      message[key] = value;
    }
  }

  return message as Base;
}

function createBananaEventBase(
  options: KartBananaEventBaseCreateOptions
): Omit<KartBananaEventMessageBase, "type"> {
  const bananaId = requireNonEmptyText(options.bananaId, "bananaId");
  const ownerRacerId = requireNonEmptyText(
    options.ownerRacerId,
    "ownerRacerId"
  );

  return {
    protocol: KART_GAMEPLAY_PROTOCOL,
    version: KART_GAMEPLAY_VERSION,
    eventId: requireNonEmptyText(options.eventId, "eventId"),
    bananaId,
    networkId: bananaId,
    ownerPlayerId: requireNonEmptyText(options.ownerPlayerId, "ownerPlayerId"),
    ownerId: ownerRacerId,
    ownerRacerId,
    ownerSlotIndex: requireWholeNumber(
      options.ownerSlotIndex,
      "ownerSlotIndex"
    ),
    tickIndex: requireWholeNumber(options.tickIndex, "tickIndex"),
    elapsedSeconds: requireFiniteNonNegativeNumber(
      options.elapsedSeconds,
      "elapsedSeconds"
    ),
    occurredAt: requireFiniteNonNegativeNumber(options.occurredAt, "occurredAt")
  };
}

function readBananaEventBaseFields(
  record: Readonly<Record<string, unknown>>
): KartBananaEventBaseCreateOptions {
  return {
    eventId: requireStringField(record, "eventId"),
    bananaId: requireStringField(record, "bananaId"),
    ownerPlayerId: requireStringField(record, "ownerPlayerId"),
    ownerRacerId: requireStringField(record, "ownerRacerId"),
    ownerSlotIndex: requireNumberField(record, "ownerSlotIndex"),
    tickIndex: requireNumberField(record, "tickIndex"),
    elapsedSeconds: requireNumberField(record, "elapsedSeconds"),
    occurredAt: requireNumberField(record, "occurredAt")
  };
}

function createBananaCollisionImpactSnapshot(
  impact: KartBananaCollisionImpactSnapshot
): KartBananaCollisionImpactSnapshot {
  return {
    position: createVector3Snapshot(impact.position, "impact.position"),
    normal: createVector3Snapshot(impact.normal, "impact.normal"),
    bananaPosition: createVector3Snapshot(
      impact.bananaPosition,
      "impact.bananaPosition"
    ),
    bananaVelocity: createVector3Snapshot(
      impact.bananaVelocity,
      "impact.bananaVelocity"
    ),
    bananaRadius: requirePositiveFiniteNumber(
      impact.bananaRadius,
      "impact.bananaRadius"
    ),
    targetHitboxCenter: createVector3Snapshot(
      impact.targetHitboxCenter,
      "impact.targetHitboxCenter"
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

function createBananaCollisionEffectSnapshot(
  effect: RaceItemHitEffectData | KartBananaCollisionEffectSnapshot
): KartBananaCollisionEffectSnapshot {
  if (effect.itemType !== "banana") {
    throw new KartBananaEventMessageError(
      "Banana collision effect item type must be banana."
    );
  }

  return {
    itemType: "banana",
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

function requireBananaCollisionImpactField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartBananaCollisionImpactSnapshot {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartBananaEventMessageError(
      `Banana event field must be a collision impact object: ${key}.`
    );
  }

  return {
    position: requireVector3Field(value, "position"),
    normal: requireVector3Field(value, "normal"),
    bananaPosition: requireVector3Field(value, "bananaPosition"),
    bananaVelocity: requireVector3Field(value, "bananaVelocity"),
    bananaRadius: requireNumberField(value, "bananaRadius"),
    targetHitboxCenter: requireVector3Field(value, "targetHitboxCenter"),
    penetrationDepth: requireNumberField(value, "penetrationDepth"),
    relativeSpeed: requireNumberField(value, "relativeSpeed")
  };
}

function requireBananaCollisionEffectField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartBananaCollisionEffectSnapshot {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartBananaEventMessageError(
      `Banana event field must be a collision effect object: ${key}.`
    );
  }

  return {
    itemType: requireBananaItemTypeField(value, "itemType"),
    stunSeconds: requireNumberField(value, "stunSeconds"),
    spinoutSeconds: requireNumberField(value, "spinoutSeconds"),
    spinoutAngularVelocity: requireNumberField(value, "spinoutAngularVelocity"),
    hitImmunitySeconds: requireNumberField(value, "hitImmunitySeconds"),
    hitFeedbackSeconds: requireNumberField(value, "hitFeedbackSeconds"),
    speedFactor: requireNumberField(value, "speedFactor"),
    speedBeforeHit: requireNumberField(value, "speedBeforeHit"),
    speedAfterHit: requireNumberField(value, "speedAfterHit"),
    headingDeltaRadians: requireNumberField(value, "headingDeltaRadians"),
    blockedByShield: requireOptionalBooleanField(
      value,
      "blockedByShield",
      false
    ),
    shieldSecondsBeforeHit: requireOptionalNumberField(
      value,
      "shieldSecondsBeforeHit",
      0
    ),
    shieldSecondsAfterHit: requireOptionalNumberField(
      value,
      "shieldSecondsAfterHit",
      0
    )
  };
}

function requireVector3Field(
  record: Readonly<Record<string, unknown>>,
  key: string
): Vector3 {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartBananaEventMessageError(
      `Banana event field must be a vector object: ${key}.`
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

function requireStringField(
  record: Readonly<Record<string, unknown>>,
  key: string
): string {
  const value = record[key];

  if (typeof value !== "string") {
    throw new KartBananaEventMessageError(
      `Banana event field must be a string: ${key}.`
    );
  }

  return value;
}

function requireOptionalStringField(
  record: Readonly<Record<string, unknown>>,
  key: string
): string | undefined {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new KartBananaEventMessageError(
      `Banana event field must be a string when present: ${key}.`
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
    throw new KartBananaEventMessageError(
      `Banana event field must be a number: ${key}.`
    );
  }

  return value;
}

function requireBananaItemTypeField(
  record: Readonly<Record<string, unknown>>,
  key: string
): "banana" {
  const value = record[key];

  if (value !== "banana") {
    throw new KartBananaEventMessageError(
      `Banana event field must equal banana: ${key}.`
    );
  }

  return value;
}

function requireBananaRemovalReasonField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartBananaRemovalReason {
  const value = record[key];

  if (typeof value !== "string") {
    throw new KartBananaEventMessageError(
      `Banana event field must be a string: ${key}.`
    );
  }

  return requireBananaRemovalReason(value);
}

function requireBananaRemovalReason(
  value: string
): KartBananaRemovalReason {
  if (
    value !== "collision" &&
    value !== "hazard-cap" &&
    value !== "out-of-bounds" &&
    value !== "race-reset" &&
    value !== "race-finished"
  ) {
    throw new KartBananaEventMessageError(
      `Unsupported banana removal reason: ${value}.`
    );
  }

  return value;
}

function requireNonEmptyText(value: string, key: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new KartBananaEventMessageError(
      `Banana event field must be non-empty: ${key}.`
    );
  }

  return normalized;
}

function requireWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new KartBananaEventMessageError(
      `Banana event field must be a whole non-negative number: ${key}.`
    );
  }

  return value;
}

function requireFiniteNumber(value: number, key: string): number {
  if (!Number.isFinite(value)) {
    throw new KartBananaEventMessageError(
      `Banana event field must be finite: ${key}.`
    );
  }

  return value;
}

function requireFiniteNonNegativeNumber(value: number, key: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new KartBananaEventMessageError(
      `Banana event field must be finite and non-negative: ${key}.`
    );
  }

  return value;
}

function requireOptionalNumberField(
  record: Readonly<Record<string, unknown>>,
  key: string,
  fallback: number
): number {
  return record[key] === undefined ? fallback : requireNumberField(record, key);
}

function requireOptionalBooleanField(
  record: Readonly<Record<string, unknown>>,
  key: string,
  fallback: boolean
): boolean {
  const value = record[key];

  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    throw new KartBananaEventMessageError(
      `Banana event field must be a boolean: ${key}.`
    );
  }

  return value;
}

function requirePositiveFiniteNumber(value: number, key: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new KartBananaEventMessageError(
      `Banana event field must be finite and positive: ${key}.`
    );
  }

  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key];
};
