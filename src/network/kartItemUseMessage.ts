import type {
  CombatItemType,
  RaceItemActivationTargetCandidateRacerIdsByKind,
  RaceItemActivationTargetResolution,
  RaceItemUseAction,
  RaceItemUseActionType
} from "../race/raceSession";
import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  KART_GAMEPLAY_PROTOCOL,
  KART_GAMEPLAY_VERSION
} from "./kartInputSnapshot";

export const MAX_ITEM_USE_EVENT_PAYLOAD_BYTES = 4 * 1024;

export interface KartItemUseEventMessage {
  readonly protocol: typeof KART_GAMEPLAY_PROTOCOL;
  readonly version: typeof KART_GAMEPLAY_VERSION;
  readonly type: typeof KART_GAMEPLAY_MESSAGE_TYPES.ITEM_USE_EVENT;
  readonly hostPeerId: string;
  readonly sequence: number;
  readonly actionId: string;
  readonly action: RaceItemUseActionType;
  readonly racerId: string;
  readonly itemType: CombatItemType;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly occurredAt: number;
  readonly activeItemId: string | null;
  readonly candidateAffectedRacerIds: readonly string[];
  readonly candidateAffectedRacerIdsByKind: RaceItemActivationTargetCandidateRacerIdsByKind;
  readonly targetResolution: RaceItemActivationTargetResolution;
}

export interface KartItemUseEventMessageCreateOptions {
  readonly hostPeerId: string;
  readonly sequence: number;
  readonly actionId: string;
  readonly action: RaceItemUseActionType;
  readonly racerId: string;
  readonly itemType: CombatItemType;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly occurredAt: number;
  readonly activeItemId: string | null;
  readonly candidateAffectedRacerIds: readonly string[];
  readonly candidateAffectedRacerIdsByKind: RaceItemActivationTargetCandidateRacerIdsByKind;
  readonly targetResolution: RaceItemActivationTargetResolution;
}

export interface KartItemUseEventMessageFromRaceActionOptions {
  readonly hostPeerId: string;
  readonly sequence: number;
  readonly action: RaceItemUseAction;
  readonly occurredAt: number;
}

export interface LocalKartItemUseEventEmitterOptions {
  readonly hostPeerId: string;
  readonly send: (payload: string, message: KartItemUseEventMessage) => boolean;
  readonly now?: () => number;
}

export class KartItemUseEventMessageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "KartItemUseEventMessageError";
  }
}

export class LocalKartItemUseEventEmitter {
  private readonly hostPeerId: string;
  private readonly send: (payload: string, message: KartItemUseEventMessage) => boolean;
  private readonly now: () => number;
  private nextSequence = 0;

  public constructor(options: LocalKartItemUseEventEmitterOptions) {
    this.hostPeerId = requireNonEmptyText(options.hostPeerId, "hostPeerId");
    this.send = options.send;
    this.now = options.now ?? Date.now;
  }

  public emit(action: RaceItemUseAction): KartItemUseEventMessage | null {
    const message = createKartItemUseEventMessageFromRaceAction({
      hostPeerId: this.hostPeerId,
      sequence: this.nextSequence,
      action,
      occurredAt: this.now()
    });
    const payload = serializeKartItemUseEventMessage(message);

    this.nextSequence += 1;

    if (!this.send(payload, message)) {
      return null;
    }

    return message;
  }
}

export function createKartItemUseEventMessageFromRaceAction(
  options: KartItemUseEventMessageFromRaceActionOptions
): KartItemUseEventMessage {
  const action = options.action;

  return createKartItemUseEventMessage({
    hostPeerId: options.hostPeerId,
    sequence: options.sequence,
    actionId: action.actionId,
    action: action.action,
    racerId: action.racerId,
    itemType: action.itemType,
    tickIndex: action.tickIndex,
    elapsedSeconds: action.elapsedSeconds,
    occurredAt: options.occurredAt,
    activeItemId: action.activeItemId,
    candidateAffectedRacerIds: action.candidateAffectedRacerIds,
    candidateAffectedRacerIdsByKind: action.candidateAffectedRacerIdsByKind,
    targetResolution: action.targetResolution
  });
}

export function createKartItemUseEventMessage(
  options: KartItemUseEventMessageCreateOptions
): KartItemUseEventMessage {
  const itemType = requireCombatItemType(options.itemType, "itemType");
  const action = requireItemUseActionType(options.action, itemType, "action");
  const racerId = requireNonEmptyText(options.racerId, "racerId");
  const activeItemId =
    options.activeItemId === null
      ? null
      : requireNonEmptyText(options.activeItemId, "activeItemId");
  const targetResolution = createTargetResolutionSnapshot(
    options.targetResolution,
    racerId,
    itemType,
    activeItemId
  );
  const candidateAffectedRacerIds = createRacerIdList(
    options.candidateAffectedRacerIds,
    "candidateAffectedRacerIds"
  );
  const candidateAffectedRacerIdsByKind = createCandidateIdsByKindSnapshot(
    options.candidateAffectedRacerIdsByKind
  );

  return {
    protocol: KART_GAMEPLAY_PROTOCOL,
    version: KART_GAMEPLAY_VERSION,
    type: KART_GAMEPLAY_MESSAGE_TYPES.ITEM_USE_EVENT,
    hostPeerId: requireNonEmptyText(options.hostPeerId, "hostPeerId"),
    sequence: requireWholeNumber(options.sequence, "sequence"),
    actionId: requireNonEmptyText(options.actionId, "actionId"),
    action,
    racerId,
    itemType,
    tickIndex: requireWholeNumber(options.tickIndex, "tickIndex"),
    elapsedSeconds: requireFiniteNonNegativeNumber(
      options.elapsedSeconds,
      "elapsedSeconds"
    ),
    occurredAt: requireFiniteNonNegativeNumber(options.occurredAt, "occurredAt"),
    activeItemId,
    candidateAffectedRacerIds,
    candidateAffectedRacerIdsByKind,
    targetResolution
  };
}

export function serializeKartItemUseEventMessage(
  message: KartItemUseEventMessage
): string {
  return JSON.stringify(createKartItemUseEventMessage(message));
}

export function deserializeKartItemUseEventMessage(
  payload: unknown
): KartItemUseEventMessage {
  if (typeof payload !== "string") {
    throw new KartItemUseEventMessageError("Item-use event payload must be a string.");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new KartItemUseEventMessageError(
      "Item-use event payload is not valid JSON."
    );
  }

  if (!isRecord(parsed)) {
    throw new KartItemUseEventMessageError(
      "Item-use event payload must be an object."
    );
  }

  if (parsed.protocol !== KART_GAMEPLAY_PROTOCOL) {
    throw new KartItemUseEventMessageError("Item-use event protocol mismatch.");
  }

  if (parsed.version !== KART_GAMEPLAY_VERSION) {
    throw new KartItemUseEventMessageError("Item-use event version mismatch.");
  }

  if (parsed.type !== KART_GAMEPLAY_MESSAGE_TYPES.ITEM_USE_EVENT) {
    throw new KartItemUseEventMessageError("Item-use event type mismatch.");
  }

  return createKartItemUseEventMessage({
    hostPeerId: requireStringField(parsed, "hostPeerId"),
    sequence: requireNumberField(parsed, "sequence"),
    actionId: requireStringField(parsed, "actionId"),
    action: requireStringField(parsed, "action") as RaceItemUseActionType,
    racerId: requireStringField(parsed, "racerId"),
    itemType: requireStringField(parsed, "itemType") as CombatItemType,
    tickIndex: requireNumberField(parsed, "tickIndex"),
    elapsedSeconds: requireNumberField(parsed, "elapsedSeconds"),
    occurredAt: requireNumberField(parsed, "occurredAt"),
    activeItemId: requireNullableStringField(parsed, "activeItemId"),
    candidateAffectedRacerIds: requireStringArrayField(
      parsed,
      "candidateAffectedRacerIds"
    ),
    candidateAffectedRacerIdsByKind: requireCandidateIdsByKindField(
      parsed,
      "candidateAffectedRacerIdsByKind"
    ),
    targetResolution: requireTargetResolutionField(parsed, "targetResolution")
  });
}

export function isKartItemUseEventMessagePayload(
  payload: unknown
): payload is string {
  if (typeof payload !== "string") {
    return false;
  }

  try {
    deserializeKartItemUseEventMessage(payload);
    return true;
  } catch {
    return false;
  }
}

function createTargetResolutionSnapshot(
  value: RaceItemActivationTargetResolution,
  expectedRacerId: string,
  expectedItemType: CombatItemType,
  expectedActiveItemId: string | null
): RaceItemActivationTargetResolution {
  const activeItemId =
    value.activeItemId === null
      ? null
      : requireNonEmptyText(value.activeItemId, "targetResolution.activeItemId");

  if (value.sourceRacerId !== expectedRacerId) {
    throw new KartItemUseEventMessageError(
      "Item-use target resolution source racer must match the action racer."
    );
  }

  if (value.itemType !== expectedItemType) {
    throw new KartItemUseEventMessageError(
      "Item-use target resolution item type must match the action item type."
    );
  }

  if (activeItemId !== expectedActiveItemId) {
    throw new KartItemUseEventMessageError(
      "Item-use target resolution active item id must match the action active item id."
    );
  }

  return {
    sourceRacerId: requireNonEmptyText(
      value.sourceRacerId,
      "targetResolution.sourceRacerId"
    ),
    itemType: requireCombatItemType(
      value.itemType,
      "targetResolution.itemType"
    ),
    activeItemId,
    candidateAffectedRacerIds: createRacerIdList(
      value.candidateAffectedRacerIds,
      "targetResolution.candidateAffectedRacerIds"
    ),
    candidateAffectedRacerIdsByKind: createCandidateIdsByKindSnapshot(
      value.candidateAffectedRacerIdsByKind
    )
  };
}

function createCandidateIdsByKindSnapshot(
  value: RaceItemActivationTargetCandidateRacerIdsByKind
): RaceItemActivationTargetCandidateRacerIdsByKind {
  return {
    localPlayerRacerIds: createRacerIdList(
      value.localPlayerRacerIds,
      "candidateAffectedRacerIdsByKind.localPlayerRacerIds"
    ),
    remotePlayerRacerIds: createRacerIdList(
      value.remotePlayerRacerIds,
      "candidateAffectedRacerIdsByKind.remotePlayerRacerIds"
    ),
    aiOpponentRacerIds: createRacerIdList(
      value.aiOpponentRacerIds,
      "candidateAffectedRacerIdsByKind.aiOpponentRacerIds"
    )
  };
}

function requireTargetResolutionField(
  record: Readonly<Record<string, unknown>>,
  key: string
): RaceItemActivationTargetResolution {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartItemUseEventMessageError(
      `Item-use event field must be an object: ${key}.`
    );
  }

  return {
    sourceRacerId: requireStringField(value, "sourceRacerId"),
    itemType: requireStringField(value, "itemType") as CombatItemType,
    activeItemId: requireNullableStringField(value, "activeItemId"),
    candidateAffectedRacerIds: requireStringArrayField(
      value,
      "candidateAffectedRacerIds"
    ),
    candidateAffectedRacerIdsByKind: requireCandidateIdsByKindField(
      value,
      "candidateAffectedRacerIdsByKind"
    )
  };
}

function requireCandidateIdsByKindField(
  record: Readonly<Record<string, unknown>>,
  key: string
): RaceItemActivationTargetCandidateRacerIdsByKind {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartItemUseEventMessageError(
      `Item-use event field must be an object: ${key}.`
    );
  }

  return {
    localPlayerRacerIds: requireStringArrayField(value, "localPlayerRacerIds"),
    remotePlayerRacerIds: requireStringArrayField(value, "remotePlayerRacerIds"),
    aiOpponentRacerIds: requireStringArrayField(value, "aiOpponentRacerIds")
  };
}

function createRacerIdList(
  values: readonly string[],
  key: string
): readonly string[] {
  const ids = values.map((value) => requireNonEmptyText(value, key));

  if (new Set(ids).size !== ids.length) {
    throw new KartItemUseEventMessageError(
      `Item-use event racer ids must be unique: ${key}.`
    );
  }

  return ids;
}

function requireStringArrayField(
  record: Readonly<Record<string, unknown>>,
  key: string
): readonly string[] {
  const value = record[key];

  if (!Array.isArray(value)) {
    throw new KartItemUseEventMessageError(
      `Item-use event field must be a string array: ${key}.`
    );
  }

  return value.map((entry) => {
    if (typeof entry !== "string") {
      throw new KartItemUseEventMessageError(
        `Item-use event array entry must be a string: ${key}.`
      );
    }

    return entry;
  });
}

function requireNullableStringField(
  record: Readonly<Record<string, unknown>>,
  key: string
): string | null {
  const value = record[key];

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new KartItemUseEventMessageError(
      `Item-use event field must be a string or null: ${key}.`
    );
  }

  return value;
}

function requireStringField(
  record: Readonly<Record<string, unknown>>,
  key: string
): string {
  const value = record[key];

  if (typeof value !== "string") {
    throw new KartItemUseEventMessageError(
      `Item-use event field must be a string: ${key}.`
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
    throw new KartItemUseEventMessageError(
      `Item-use event field must be a number: ${key}.`
    );
  }

  return value;
}

function requireCombatItemType(value: string, key: string): CombatItemType {
  if (value !== "boost" && value !== "shell" && value !== "banana") {
    throw new KartItemUseEventMessageError(
      `Item-use event field must be a known combat item type: ${key}.`
    );
  }

  return value;
}

function requireItemUseActionType(
  value: string,
  itemType: CombatItemType,
  key: string
): RaceItemUseActionType {
  const expectedAction = `${itemType}-use` as RaceItemUseActionType;

  if (value !== expectedAction) {
    throw new KartItemUseEventMessageError(
      `Item-use event action must match item type: ${key}.`
    );
  }

  return value as RaceItemUseActionType;
}

function requireNonEmptyText(value: string, key: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new KartItemUseEventMessageError(
      `Item-use event field must be non-empty: ${key}.`
    );
  }

  return normalized;
}

function requireWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new KartItemUseEventMessageError(
      `Item-use event field must be a non-negative whole number: ${key}.`
    );
  }

  return value;
}

function requireFiniteNonNegativeNumber(value: number, key: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new KartItemUseEventMessageError(
      `Item-use event field must be a finite non-negative number: ${key}.`
    );
  }

  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
