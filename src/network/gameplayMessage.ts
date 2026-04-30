import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  KART_GAMEPLAY_PROTOCOL,
  KART_GAMEPLAY_VERSION,
  MAX_INPUT_SNAPSHOT_PAYLOAD_BYTES,
  deserializeKartInputSnapshot,
  serializeKartInputSnapshot,
  type KartGameplayMessageType,
  type KartInputSnapshot
} from "./kartInputSnapshot";
import {
  MAX_REMOTE_INPUT_DELTA_PAYLOAD_BYTES,
  deserializeKartRemoteInputDeltaPacket,
  serializeKartRemoteInputDeltaPacket,
  type KartRemoteInputDeltaPacket
} from "./remoteInputDelta";
import {
  MAX_TRANSFORM_SNAPSHOT_PAYLOAD_BYTES,
  deserializeKartTransformSnapshot,
  serializeKartTransformSnapshot,
  type KartTransformSnapshot
} from "./kartTransformSnapshot";
import {
  MAX_OWNED_TRANSFORM_SNAPSHOT_PAYLOAD_BYTES,
  deserializeKartOwnedTransformSnapshot,
  serializeKartOwnedTransformSnapshot,
  type KartOwnedTransformSnapshot
} from "./kartOwnedTransformSnapshot";
import {
  MAX_AUTHORITATIVE_PLAYER_SNAPSHOT_PAYLOAD_BYTES,
  deserializeKartAuthoritativePlayerSnapshot,
  serializeKartAuthoritativePlayerSnapshot,
  type KartAuthoritativePlayerSnapshot
} from "./kartAuthoritativePlayerSnapshot";
import {
  MAX_ITEM_USE_EVENT_PAYLOAD_BYTES,
  deserializeKartItemUseEventMessage,
  serializeKartItemUseEventMessage,
  type KartItemUseEventMessage
} from "./kartItemUseMessage";
import {
  MAX_ITEM_COLLISION_OUTCOME_EVENT_PAYLOAD_BYTES,
  deserializeKartItemCollisionOutcomeEventMessage,
  serializeKartItemCollisionOutcomeEventMessage,
  type KartItemCollisionOutcomeEventMessage
} from "./kartItemCollisionOutcomeEventMessage";
import {
  MAX_EFFECT_EVENT_PAYLOAD_BYTES,
  deserializeKartMultiplayerEffectEventMessage,
  serializeKartMultiplayerEffectEventMessage,
  type KartMultiplayerEffectEventMessage
} from "./kartEffectEventMessage";
import {
  MAX_RACE_STATE_SNAPSHOT_PAYLOAD_BYTES,
  deserializeKartRaceStateSnapshot,
  serializeKartRaceStateSnapshot,
  type KartRaceStateSnapshot
} from "./kartRaceStateMessage";
import {
  MAX_BANANA_EVENT_PAYLOAD_BYTES,
  deserializeKartBananaEventMessage,
  serializeKartBananaEventMessage,
  type KartBananaCollisionEventMessage,
  type KartBananaEventMessage,
  type KartBananaRemovalEventMessage,
  type KartBananaSpawnEventMessage
} from "./kartBananaEventMessage";

export const MAX_GAMEPLAY_MESSAGE_PAYLOAD_BYTES = Math.max(
  MAX_INPUT_SNAPSHOT_PAYLOAD_BYTES,
  MAX_REMOTE_INPUT_DELTA_PAYLOAD_BYTES,
  MAX_TRANSFORM_SNAPSHOT_PAYLOAD_BYTES,
  MAX_OWNED_TRANSFORM_SNAPSHOT_PAYLOAD_BYTES,
  MAX_AUTHORITATIVE_PLAYER_SNAPSHOT_PAYLOAD_BYTES,
  MAX_ITEM_USE_EVENT_PAYLOAD_BYTES,
  MAX_ITEM_COLLISION_OUTCOME_EVENT_PAYLOAD_BYTES,
  MAX_EFFECT_EVENT_PAYLOAD_BYTES,
  MAX_RACE_STATE_SNAPSHOT_PAYLOAD_BYTES,
  MAX_BANANA_EVENT_PAYLOAD_BYTES
);

export type KartGameplayMessage =
  | KartInputSnapshot
  | KartRemoteInputDeltaPacket
  | KartTransformSnapshot
  | KartOwnedTransformSnapshot
  | KartAuthoritativePlayerSnapshot
  | KartItemUseEventMessage
  | KartItemCollisionOutcomeEventMessage
  | KartMultiplayerEffectEventMessage
  | KartRaceStateSnapshot
  | KartBananaEventMessage;

export interface KartGameplayMessageByType {
  readonly [KART_GAMEPLAY_MESSAGE_TYPES.INPUT_SNAPSHOT]: KartInputSnapshot;
  readonly [KART_GAMEPLAY_MESSAGE_TYPES.REMOTE_INPUT_DELTA]: KartRemoteInputDeltaPacket;
  readonly [KART_GAMEPLAY_MESSAGE_TYPES.TRANSFORM_SNAPSHOT]: KartTransformSnapshot;
  readonly [KART_GAMEPLAY_MESSAGE_TYPES.OWNED_TRANSFORM_SNAPSHOT]: KartOwnedTransformSnapshot;
  readonly [KART_GAMEPLAY_MESSAGE_TYPES.AUTHORITATIVE_PLAYER_SNAPSHOT]: KartAuthoritativePlayerSnapshot;
  readonly [KART_GAMEPLAY_MESSAGE_TYPES.ITEM_USE_EVENT]: KartItemUseEventMessage;
  readonly [KART_GAMEPLAY_MESSAGE_TYPES.ITEM_COLLISION_OUTCOME_EVENT]: KartItemCollisionOutcomeEventMessage;
  readonly [KART_GAMEPLAY_MESSAGE_TYPES.EFFECT_EVENT]: KartMultiplayerEffectEventMessage;
  readonly [KART_GAMEPLAY_MESSAGE_TYPES.RACE_STATE_SNAPSHOT]: KartRaceStateSnapshot;
  readonly [KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT]: KartBananaSpawnEventMessage;
  readonly [KART_GAMEPLAY_MESSAGE_TYPES.BANANA_COLLISION_EVENT]: KartBananaCollisionEventMessage;
  readonly [KART_GAMEPLAY_MESSAGE_TYPES.BANANA_REMOVAL_EVENT]: KartBananaRemovalEventMessage;
}

export type KartGameplayMessageDecodeFailureReason =
  | "non-string-payload"
  | "payload-too-large"
  | "invalid-json"
  | "invalid-envelope"
  | "unknown-type"
  | "invalid-message";

export interface KartGameplayMessageDeserializeOptions {
  readonly maxPayloadBytes?: number;
}

export type KartGameplayMessageDeserializeResult =
  | {
      readonly ok: true;
      readonly type: KartGameplayMessageType;
      readonly message: KartGameplayMessage;
    }
  | {
      readonly ok: false;
      readonly reason: KartGameplayMessageDecodeFailureReason;
      readonly type: KartGameplayMessageType | null;
      readonly message: string;
      readonly error: KartGameplayMessageError;
    };

export interface KartGameplayMessageDispatchContext {
  readonly payload?: string;
  readonly remotePeerId?: string;
  readonly receivedAt?: number;
}

export type KartGameplayMessageHandler<Message extends KartGameplayMessage> = (
  message: Message,
  context: KartGameplayMessageDispatchContext
) => void;

export interface KartGameplayMessageRouteHandlers {
  readonly onInputSnapshot?: KartGameplayMessageHandler<KartInputSnapshot>;
  readonly onRemoteInputDelta?: KartGameplayMessageHandler<KartRemoteInputDeltaPacket>;
  readonly onTransformSnapshot?: KartGameplayMessageHandler<KartTransformSnapshot>;
  readonly onOwnedTransformSnapshot?: KartGameplayMessageHandler<KartOwnedTransformSnapshot>;
  readonly onAuthoritativePlayerSnapshot?: KartGameplayMessageHandler<KartAuthoritativePlayerSnapshot>;
  readonly onItemUseEvent?: KartGameplayMessageHandler<KartItemUseEventMessage>;
  readonly onItemCollisionOutcomeEvent?: KartGameplayMessageHandler<KartItemCollisionOutcomeEventMessage>;
  readonly onEffectEvent?: KartGameplayMessageHandler<KartMultiplayerEffectEventMessage>;
  readonly onRaceStateSnapshot?: KartGameplayMessageHandler<KartRaceStateSnapshot>;
  readonly onBananaSpawnEvent?: KartGameplayMessageHandler<KartBananaSpawnEventMessage>;
  readonly onBananaCollisionEvent?: KartGameplayMessageHandler<KartBananaCollisionEventMessage>;
  readonly onBananaRemovalEvent?: KartGameplayMessageHandler<KartBananaRemovalEventMessage>;
  readonly onUnhandledMessage?: KartGameplayMessageHandler<KartGameplayMessage>;
}

export type KartGameplayMessageDispatchResult =
  | {
      readonly dispatched: true;
      readonly type: KartGameplayMessageType;
    }
  | {
      readonly dispatched: false;
      readonly type: KartGameplayMessageType;
      readonly message: KartGameplayMessage;
    };

export class KartGameplayMessageError extends Error {
  public readonly reason: KartGameplayMessageDecodeFailureReason;
  public readonly type: KartGameplayMessageType | null;

  public constructor(
    reason: KartGameplayMessageDecodeFailureReason,
    message: string,
    type: KartGameplayMessageType | null = null
  ) {
    super(message);
    this.name = "KartGameplayMessageError";
    this.reason = reason;
    this.type = type;
  }
}

export function serializeKartGameplayMessage(
  message: KartGameplayMessage
): string {
  switch (message.type) {
    case KART_GAMEPLAY_MESSAGE_TYPES.INPUT_SNAPSHOT:
      return serializeKartInputSnapshot(message);
    case KART_GAMEPLAY_MESSAGE_TYPES.REMOTE_INPUT_DELTA:
      return serializeKartRemoteInputDeltaPacket(message);
    case KART_GAMEPLAY_MESSAGE_TYPES.TRANSFORM_SNAPSHOT:
      return serializeKartTransformSnapshot(message);
    case KART_GAMEPLAY_MESSAGE_TYPES.OWNED_TRANSFORM_SNAPSHOT:
      return serializeKartOwnedTransformSnapshot(message);
    case KART_GAMEPLAY_MESSAGE_TYPES.AUTHORITATIVE_PLAYER_SNAPSHOT:
      return serializeKartAuthoritativePlayerSnapshot(message);
    case KART_GAMEPLAY_MESSAGE_TYPES.ITEM_USE_EVENT:
      return serializeKartItemUseEventMessage(message);
    case KART_GAMEPLAY_MESSAGE_TYPES.ITEM_COLLISION_OUTCOME_EVENT:
      return serializeKartItemCollisionOutcomeEventMessage(message);
    case KART_GAMEPLAY_MESSAGE_TYPES.EFFECT_EVENT:
      return serializeKartMultiplayerEffectEventMessage(message);
    case KART_GAMEPLAY_MESSAGE_TYPES.RACE_STATE_SNAPSHOT:
      return serializeKartRaceStateSnapshot(message);
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT:
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_COLLISION_EVENT:
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_REMOVAL_EVENT:
      return serializeKartBananaEventMessage(message);
  }
}

export function deserializeKartGameplayMessage(
  payload: unknown,
  options: KartGameplayMessageDeserializeOptions = {}
): KartGameplayMessage {
  const result = tryDeserializeKartGameplayMessage(payload, options);

  if (!result.ok) {
    throw result.error;
  }

  return result.message;
}

export function deserializeKartGameplayMessageAs<
  Type extends KartGameplayMessageType
>(
  payload: unknown,
  type: Type,
  options: KartGameplayMessageDeserializeOptions = {}
): KartGameplayMessageByType[Type] {
  const message = deserializeKartGameplayMessage(payload, options);

  if (message.type !== type) {
    throw new KartGameplayMessageError(
      "invalid-message",
      `Gameplay packet type mismatch: expected ${type}, received ${message.type}.`,
      message.type
    );
  }

  return message as KartGameplayMessageByType[Type];
}

export function tryDeserializeKartGameplayMessage(
  payload: unknown,
  options: KartGameplayMessageDeserializeOptions = {}
): KartGameplayMessageDeserializeResult {
  try {
    const envelope = parseGameplayEnvelope(payload, options);
    enforceMessageSpecificPayloadLimit(envelope.payload, envelope.type);
    const message = deserializeKnownGameplayMessage(envelope.payload, envelope.type);

    return {
      ok: true,
      type: message.type,
      message
    };
  } catch (error) {
    const normalizedError = normalizeGameplayMessageError(error);

    return {
      ok: false,
      reason: normalizedError.reason,
      type: normalizedError.type,
      message: normalizedError.message,
      error: normalizedError
    };
  }
}

export function isKartGameplayMessagePayload(
  payload: unknown,
  options: KartGameplayMessageDeserializeOptions = {}
): payload is string {
  return tryDeserializeKartGameplayMessage(payload, options).ok;
}

export function getKartGameplayPayloadType(
  payload: unknown,
  options: KartGameplayMessageDeserializeOptions = {}
): KartGameplayMessageType | null {
  const result = parseGameplayEnvelopeResult(payload, options);

  return result.ok ? result.type : null;
}

export function isKartGameplayMessageOfType<Type extends KartGameplayMessageType>(
  message: KartGameplayMessage,
  type: Type
): message is KartGameplayMessageByType[Type] {
  return message.type === type;
}

export function dispatchKartGameplayMessage(
  message: KartGameplayMessage,
  handlers: KartGameplayMessageRouteHandlers,
  context: KartGameplayMessageDispatchContext = {}
): KartGameplayMessageDispatchResult {
  switch (message.type) {
    case KART_GAMEPLAY_MESSAGE_TYPES.INPUT_SNAPSHOT:
      return dispatchToGameplayHandler(
        message,
        handlers.onInputSnapshot,
        handlers.onUnhandledMessage,
        context
      );
    case KART_GAMEPLAY_MESSAGE_TYPES.REMOTE_INPUT_DELTA:
      return dispatchToGameplayHandler(
        message,
        handlers.onRemoteInputDelta,
        handlers.onUnhandledMessage,
        context
      );
    case KART_GAMEPLAY_MESSAGE_TYPES.TRANSFORM_SNAPSHOT:
      return dispatchToGameplayHandler(
        message,
        handlers.onTransformSnapshot,
        handlers.onUnhandledMessage,
        context
      );
    case KART_GAMEPLAY_MESSAGE_TYPES.OWNED_TRANSFORM_SNAPSHOT:
      return dispatchToGameplayHandler(
        message,
        handlers.onOwnedTransformSnapshot,
        handlers.onUnhandledMessage,
        context
      );
    case KART_GAMEPLAY_MESSAGE_TYPES.AUTHORITATIVE_PLAYER_SNAPSHOT:
      return dispatchToGameplayHandler(
        message,
        handlers.onAuthoritativePlayerSnapshot,
        handlers.onUnhandledMessage,
        context
      );
    case KART_GAMEPLAY_MESSAGE_TYPES.ITEM_USE_EVENT:
      return dispatchToGameplayHandler(
        message,
        handlers.onItemUseEvent,
        handlers.onUnhandledMessage,
        context
      );
    case KART_GAMEPLAY_MESSAGE_TYPES.ITEM_COLLISION_OUTCOME_EVENT:
      return dispatchToGameplayHandler(
        message,
        handlers.onItemCollisionOutcomeEvent,
        handlers.onUnhandledMessage,
        context
      );
    case KART_GAMEPLAY_MESSAGE_TYPES.EFFECT_EVENT:
      return dispatchToGameplayHandler(
        message,
        handlers.onEffectEvent,
        handlers.onUnhandledMessage,
        context
      );
    case KART_GAMEPLAY_MESSAGE_TYPES.RACE_STATE_SNAPSHOT:
      return dispatchToGameplayHandler(
        message,
        handlers.onRaceStateSnapshot,
        handlers.onUnhandledMessage,
        context
      );
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT:
      return dispatchToGameplayHandler(
        message,
        handlers.onBananaSpawnEvent,
        handlers.onUnhandledMessage,
        context
      );
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_COLLISION_EVENT:
      return dispatchToGameplayHandler(
        message,
        handlers.onBananaCollisionEvent,
        handlers.onUnhandledMessage,
        context
      );
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_REMOVAL_EVENT:
      return dispatchToGameplayHandler(
        message,
        handlers.onBananaRemovalEvent,
        handlers.onUnhandledMessage,
        context
      );
  }
}

function deserializeKnownGameplayMessage(
  payload: unknown,
  type: KartGameplayMessageType
): KartGameplayMessage {
  try {
    switch (type) {
      case KART_GAMEPLAY_MESSAGE_TYPES.INPUT_SNAPSHOT:
        return deserializeKartInputSnapshot(payload);
      case KART_GAMEPLAY_MESSAGE_TYPES.REMOTE_INPUT_DELTA:
        return deserializeKartRemoteInputDeltaPacket(payload);
      case KART_GAMEPLAY_MESSAGE_TYPES.TRANSFORM_SNAPSHOT:
        return deserializeKartTransformSnapshot(payload);
      case KART_GAMEPLAY_MESSAGE_TYPES.OWNED_TRANSFORM_SNAPSHOT:
        return deserializeKartOwnedTransformSnapshot(payload);
      case KART_GAMEPLAY_MESSAGE_TYPES.AUTHORITATIVE_PLAYER_SNAPSHOT:
        return deserializeKartAuthoritativePlayerSnapshot(payload);
      case KART_GAMEPLAY_MESSAGE_TYPES.ITEM_USE_EVENT:
        return deserializeKartItemUseEventMessage(payload);
      case KART_GAMEPLAY_MESSAGE_TYPES.ITEM_COLLISION_OUTCOME_EVENT:
        return deserializeKartItemCollisionOutcomeEventMessage(payload);
      case KART_GAMEPLAY_MESSAGE_TYPES.EFFECT_EVENT:
        return deserializeKartMultiplayerEffectEventMessage(payload);
      case KART_GAMEPLAY_MESSAGE_TYPES.RACE_STATE_SNAPSHOT:
        return deserializeKartRaceStateSnapshot(payload);
      case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT:
      case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_COLLISION_EVENT:
      case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_REMOVAL_EVENT:
        return deserializeKartBananaEventMessage(payload);
    }
  } catch (error) {
    throw new KartGameplayMessageError(
      "invalid-message",
      getErrorMessage(error, "Gameplay packet failed message validation."),
      type
    );
  }
}

function parseGameplayEnvelope(
  payload: unknown,
  options: KartGameplayMessageDeserializeOptions
): Readonly<{ payload: string; type: KartGameplayMessageType }> {
  const result = parseGameplayEnvelopeResult(payload, options);

  if (!result.ok) {
    throw result.error;
  }

  return {
    payload: result.payload,
    type: result.type
  };
}

function parseGameplayEnvelopeResult(
  payload: unknown,
  options: KartGameplayMessageDeserializeOptions
):
  | {
      readonly ok: true;
      readonly payload: string;
      readonly type: KartGameplayMessageType;
    }
  | {
      readonly ok: false;
      readonly error: KartGameplayMessageError;
    } {
  if (typeof payload !== "string") {
    return createEnvelopeFailure(
      "non-string-payload",
      "Gameplay packet payload must be a string."
    );
  }

  const maxPayloadBytes = requirePositiveWholeNumber(
    options.maxPayloadBytes ?? MAX_GAMEPLAY_MESSAGE_PAYLOAD_BYTES,
    "maxPayloadBytes"
  );

  if (getUtf8ByteLength(payload) > maxPayloadBytes) {
    return createEnvelopeFailure(
      "payload-too-large",
      "Gameplay packet payload exceeds the packet size limit."
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    return createEnvelopeFailure(
      "invalid-json",
      "Gameplay packet payload is not valid JSON."
    );
  }

  if (!isRecord(parsed)) {
    return createEnvelopeFailure(
      "invalid-envelope",
      "Gameplay packet payload must be an object."
    );
  }

  if (parsed.protocol !== KART_GAMEPLAY_PROTOCOL) {
    return createEnvelopeFailure(
      "invalid-envelope",
      "Gameplay packet protocol mismatch."
    );
  }

  if (parsed.version !== KART_GAMEPLAY_VERSION) {
    return createEnvelopeFailure(
      "invalid-envelope",
      "Gameplay packet version mismatch."
    );
  }

  if (!isKartGameplayMessageType(parsed.type)) {
    return createEnvelopeFailure(
      "unknown-type",
      "Gameplay packet type is not recognized."
    );
  }

  return {
    ok: true,
    payload,
    type: parsed.type
  };
}

function enforceMessageSpecificPayloadLimit(
  payload: string,
  type: KartGameplayMessageType
): void {
  const maxPayloadBytes = getGameplayMessagePayloadByteLimit(type);

  if (getUtf8ByteLength(payload) > maxPayloadBytes) {
    throw new KartGameplayMessageError(
      "payload-too-large",
      `Gameplay ${type} packet exceeds the packet size limit.`,
      type
    );
  }
}

function getGameplayMessagePayloadByteLimit(
  type: KartGameplayMessageType
): number {
  switch (type) {
    case KART_GAMEPLAY_MESSAGE_TYPES.INPUT_SNAPSHOT:
      return MAX_INPUT_SNAPSHOT_PAYLOAD_BYTES;
    case KART_GAMEPLAY_MESSAGE_TYPES.REMOTE_INPUT_DELTA:
      return MAX_REMOTE_INPUT_DELTA_PAYLOAD_BYTES;
    case KART_GAMEPLAY_MESSAGE_TYPES.TRANSFORM_SNAPSHOT:
      return MAX_TRANSFORM_SNAPSHOT_PAYLOAD_BYTES;
    case KART_GAMEPLAY_MESSAGE_TYPES.OWNED_TRANSFORM_SNAPSHOT:
      return MAX_OWNED_TRANSFORM_SNAPSHOT_PAYLOAD_BYTES;
    case KART_GAMEPLAY_MESSAGE_TYPES.AUTHORITATIVE_PLAYER_SNAPSHOT:
      return MAX_AUTHORITATIVE_PLAYER_SNAPSHOT_PAYLOAD_BYTES;
    case KART_GAMEPLAY_MESSAGE_TYPES.ITEM_USE_EVENT:
      return MAX_ITEM_USE_EVENT_PAYLOAD_BYTES;
    case KART_GAMEPLAY_MESSAGE_TYPES.ITEM_COLLISION_OUTCOME_EVENT:
      return MAX_ITEM_COLLISION_OUTCOME_EVENT_PAYLOAD_BYTES;
    case KART_GAMEPLAY_MESSAGE_TYPES.EFFECT_EVENT:
      return MAX_EFFECT_EVENT_PAYLOAD_BYTES;
    case KART_GAMEPLAY_MESSAGE_TYPES.RACE_STATE_SNAPSHOT:
      return MAX_RACE_STATE_SNAPSHOT_PAYLOAD_BYTES;
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT:
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_COLLISION_EVENT:
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_REMOVAL_EVENT:
      return MAX_BANANA_EVENT_PAYLOAD_BYTES;
  }

  throw new KartGameplayMessageError(
    "unknown-type",
    "Gameplay packet type is not recognized.",
    type
  );
}

function dispatchToGameplayHandler<Message extends KartGameplayMessage>(
  message: Message,
  handler: KartGameplayMessageHandler<Message> | undefined,
  unhandled: KartGameplayMessageHandler<KartGameplayMessage> | undefined,
  context: KartGameplayMessageDispatchContext
): KartGameplayMessageDispatchResult {
  if (handler !== undefined) {
    handler(message, context);

    return {
      dispatched: true,
      type: message.type
    };
  }

  unhandled?.(message, context);

  return {
    dispatched: false,
    type: message.type,
    message
  };
}

function createEnvelopeFailure(
  reason: KartGameplayMessageDecodeFailureReason,
  message: string,
  type: KartGameplayMessageType | null = null
): {
  readonly ok: false;
  readonly error: KartGameplayMessageError;
} {
  return {
    ok: false,
    error: new KartGameplayMessageError(reason, message, type)
  };
}

function isKartGameplayMessageType(
  value: unknown
): value is KartGameplayMessageType {
  return (
    typeof value === "string" &&
    (Object.values(KART_GAMEPLAY_MESSAGE_TYPES) as readonly string[]).includes(value)
  );
}

function normalizeGameplayMessageError(error: unknown): KartGameplayMessageError {
  if (error instanceof KartGameplayMessageError) {
    return error;
  }

  return new KartGameplayMessageError(
    "invalid-message",
    getErrorMessage(error, "Gameplay packet is malformed.")
  );
}

function requirePositiveWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new KartGameplayMessageError(
      "invalid-envelope",
      `Gameplay packet option must be a positive whole number: ${key}.`
    );
  }

  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
