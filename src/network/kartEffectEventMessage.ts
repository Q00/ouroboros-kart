import type { Vector3 } from "../config/aiRacers";
import type { CombatItemType, RaceItemHitEffectData } from "../race/raceSession";
import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  KART_GAMEPLAY_PROTOCOL,
  KART_GAMEPLAY_VERSION
} from "./kartInputSnapshot";

export const MAX_EFFECT_EVENT_PAYLOAD_BYTES = 4 * 1024;
export const MAX_REMOTE_EFFECT_EVENT_BUFFER_SIZE = 16;
export const MAX_REMOTE_EFFECT_EVENT_ID_CACHE_SIZE = 128;
export const REMOTE_EFFECT_EVENT_REORDER_WINDOW_SECONDS = 0.08;
export const REMOTE_EFFECT_EVENT_LATE_TOLERANCE_SECONDS = 0.35;

export const KART_MULTIPLAYER_EFFECT_EVENT_KINDS = {
  BOOST_START: "boost-start",
  BOOST_END: "boost-end",
  SHELL_LAUNCH: "shell-launch",
  SHELL_HIT: "shell-hit",
  BANANA_DROP: "banana-drop",
  BANANA_HIT: "banana-hit",
  SPINOUT_START: "spinout-start",
  SPINOUT_END: "spinout-end"
} as const;

export type KartMultiplayerEffectEventKind =
  (typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS)[keyof typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS];

export type KartTimedEffectEndReason =
  | "duration-expired"
  | "interrupted"
  | "race-reset"
  | "authoritative-correction";

export type KartSpinoutSourceItemType = Exclude<CombatItemType, "boost">;

export interface KartEffectParticipantSnapshot {
  readonly playerId: string | null;
  readonly racerId: string;
  readonly slotIndex: number;
}

export interface KartEffectImpactSnapshot {
  readonly position: Vector3;
  readonly normal: Vector3;
  readonly objectPosition: Vector3;
  readonly objectVelocity: Vector3;
  readonly objectRadius: number;
  readonly targetHitboxCenter: Vector3;
  readonly penetrationDepth: number;
  readonly relativeSpeed: number;
}

export interface KartEffectHitEffectSnapshot {
  readonly itemType: KartSpinoutSourceItemType;
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

interface KartMultiplayerEffectEventMessageBase<
  Kind extends KartMultiplayerEffectEventKind
> {
  readonly protocol: typeof KART_GAMEPLAY_PROTOCOL;
  readonly version: typeof KART_GAMEPLAY_VERSION;
  readonly type: typeof KART_GAMEPLAY_MESSAGE_TYPES.EFFECT_EVENT;
  readonly effectEventKind: Kind;
  readonly eventId: string;
  readonly hostPeerId: string;
  readonly sequence: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly occurredAt: number;
  readonly sentAt: number;
}

type KartEffectEventBaseCreateOptions<
  Kind extends KartMultiplayerEffectEventKind
> = Omit<
  KartMultiplayerEffectEventMessageBase<Kind>,
  "protocol" | "version" | "type" | "sentAt"
> & {
  readonly sentAt?: number;
};

export interface KartBoostStartEffectEventMessage
  extends KartMultiplayerEffectEventMessageBase<
    typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START
  > {
  readonly itemType: "boost";
  readonly effectId: string;
  readonly racer: KartEffectParticipantSnapshot;
  readonly durationSeconds: number;
  readonly expiresAtElapsedSeconds: number;
}

export interface KartBoostEndEffectEventMessage
  extends KartMultiplayerEffectEventMessageBase<
    typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_END
  > {
  readonly itemType: "boost";
  readonly effectId: string;
  readonly racer: KartEffectParticipantSnapshot;
  readonly reason: KartTimedEffectEndReason;
}

export interface KartShellLaunchEffectEventMessage
  extends KartMultiplayerEffectEventMessageBase<
    typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_LAUNCH
  > {
  readonly itemType: "shell";
  readonly shellId: string;
  readonly source: KartEffectParticipantSnapshot;
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly radius: number;
  readonly armedSeconds: number;
  readonly ttlSeconds: number;
}

export interface KartShellHitEffectEventMessage
  extends KartMultiplayerEffectEventMessageBase<
    typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_HIT
  > {
  readonly itemType: "shell";
  readonly shellId: string;
  readonly source: KartEffectParticipantSnapshot;
  readonly target: KartEffectParticipantSnapshot;
  readonly impact: KartEffectImpactSnapshot;
  readonly effect: KartEffectHitEffectSnapshot;
}

export interface KartBananaDropEffectEventMessage
  extends KartMultiplayerEffectEventMessageBase<
    typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_DROP
  > {
  readonly itemType: "banana";
  readonly bananaId: string;
  readonly owner: KartEffectParticipantSnapshot;
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly radius: number;
  readonly armedSeconds: number;
  readonly ttlSeconds: number;
  readonly ageSeconds: number;
  readonly orientationRadians: number;
}

export interface KartBananaHitEffectEventMessage
  extends KartMultiplayerEffectEventMessageBase<
    typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_HIT
  > {
  readonly itemType: "banana";
  readonly bananaId: string;
  readonly source: KartEffectParticipantSnapshot;
  readonly target: KartEffectParticipantSnapshot;
  readonly impact: KartEffectImpactSnapshot;
  readonly effect: KartEffectHitEffectSnapshot;
}

export interface KartSpinoutStartEffectEventMessage
  extends KartMultiplayerEffectEventMessageBase<
    typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_START
  > {
  readonly spinoutId: string;
  readonly target: KartEffectParticipantSnapshot;
  readonly source: KartEffectParticipantSnapshot | null;
  readonly sourceItemType: KartSpinoutSourceItemType;
  readonly sourceObjectId: string;
  readonly durationSeconds: number;
  readonly expiresAtElapsedSeconds: number;
  readonly angularVelocity: number;
}

export interface KartSpinoutEndEffectEventMessage
  extends KartMultiplayerEffectEventMessageBase<
    typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_END
  > {
  readonly spinoutId: string;
  readonly target: KartEffectParticipantSnapshot;
  readonly source: KartEffectParticipantSnapshot | null;
  readonly sourceItemType: KartSpinoutSourceItemType;
  readonly sourceObjectId: string;
  readonly reason: KartTimedEffectEndReason;
}

export type KartMultiplayerEffectEventMessage =
  | KartBoostStartEffectEventMessage
  | KartBoostEndEffectEventMessage
  | KartShellLaunchEffectEventMessage
  | KartShellHitEffectEventMessage
  | KartBananaDropEffectEventMessage
  | KartBananaHitEffectEventMessage
  | KartSpinoutStartEffectEventMessage
  | KartSpinoutEndEffectEventMessage;

export type KartBoostStartEffectEventCreateOptions =
  KartEffectEventBaseCreateOptions<
    typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START
  > &
    Omit<
      KartBoostStartEffectEventMessage,
      keyof KartMultiplayerEffectEventMessageBase<
        typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START
      >
    >;

export type KartBoostEndEffectEventCreateOptions =
  KartEffectEventBaseCreateOptions<
    typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_END
  > &
    Omit<
      KartBoostEndEffectEventMessage,
      keyof KartMultiplayerEffectEventMessageBase<
        typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_END
      >
    >;

export type KartShellLaunchEffectEventCreateOptions =
  KartEffectEventBaseCreateOptions<
    typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_LAUNCH
  > &
    Omit<
      KartShellLaunchEffectEventMessage,
      keyof KartMultiplayerEffectEventMessageBase<
        typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_LAUNCH
      >
    >;

export type KartShellHitEffectEventCreateOptions =
  KartEffectEventBaseCreateOptions<
    typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_HIT
  > &
    Omit<
      KartShellHitEffectEventMessage,
      keyof KartMultiplayerEffectEventMessageBase<
        typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_HIT
      >
    >;

export type KartBananaDropEffectEventCreateOptions =
  KartEffectEventBaseCreateOptions<
    typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_DROP
  > &
    Omit<
      KartBananaDropEffectEventMessage,
      keyof KartMultiplayerEffectEventMessageBase<
        typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_DROP
      >
    >;

export type KartBananaHitEffectEventCreateOptions =
  KartEffectEventBaseCreateOptions<
    typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_HIT
  > &
    Omit<
      KartBananaHitEffectEventMessage,
      keyof KartMultiplayerEffectEventMessageBase<
        typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_HIT
      >
    >;

export type KartSpinoutStartEffectEventCreateOptions =
  KartEffectEventBaseCreateOptions<
    typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_START
  > &
    Omit<
      KartSpinoutStartEffectEventMessage,
      keyof KartMultiplayerEffectEventMessageBase<
        typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_START
      >
    >;

export type KartSpinoutEndEffectEventCreateOptions =
  KartEffectEventBaseCreateOptions<
    typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_END
  > &
    Omit<
      KartSpinoutEndEffectEventMessage,
      keyof KartMultiplayerEffectEventMessageBase<
        typeof KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_END
      >
    >;

export type KartMultiplayerEffectEventCreateOptions =
  | KartBoostStartEffectEventCreateOptions
  | KartBoostEndEffectEventCreateOptions
  | KartShellLaunchEffectEventCreateOptions
  | KartShellHitEffectEventCreateOptions
  | KartBananaDropEffectEventCreateOptions
  | KartBananaHitEffectEventCreateOptions
  | KartSpinoutStartEffectEventCreateOptions
  | KartSpinoutEndEffectEventCreateOptions;

type DistributiveOmit<Source, Keys extends keyof any> = Source extends unknown
  ? Omit<Source, Keys>
  : never;

export type LocalKartMultiplayerEffectEventEmissionOptions =
  DistributiveOmit<
    KartMultiplayerEffectEventCreateOptions,
    "hostPeerId" | "sequence" | "occurredAt" | "sentAt"
  >;

export interface LocalKartMultiplayerEffectEventEmitterOptions {
  readonly hostPeerId: string;
  readonly send: (
    payload: string,
    message: KartMultiplayerEffectEventMessage
  ) => boolean;
  readonly now?: () => number;
  readonly sendTimestampNow?: () => number;
}

export interface RemoteKartMultiplayerEffectEventBufferOptions {
  readonly expectedHostPeerId?: string;
  readonly maxBufferedEvents?: number;
  readonly maxPayloadBytes?: number;
  readonly maxRememberedEventIds?: number;
  readonly reorderWindowSeconds?: number;
  readonly lateEventToleranceSeconds?: number;
  readonly now?: () => number;
  readonly receiveTimestampNow?: () => number;
}

export type RemoteKartMultiplayerEffectEventRejectionReason =
  | "non-string-payload"
  | "payload-too-large"
  | "invalid-payload"
  | "unexpected-host"
  | "duplicate-event"
  | "duplicate-sequence"
  | "stale-sequence"
  | "late-event";

export type RemoteKartMultiplayerEffectEventAcceptResult =
  | {
      readonly accepted: true;
      readonly event: KartMultiplayerEffectEventMessage;
      readonly timing: KartMultiplayerEffectEventReplicationTiming;
      readonly bufferedCount: number;
      readonly droppedEvents: readonly KartMultiplayerEffectEventMessage[];
    }
  | {
      readonly accepted: false;
      readonly reason: RemoteKartMultiplayerEffectEventRejectionReason;
      readonly message: string;
      readonly bufferedCount: number;
      readonly rejectedCount: number;
    };

export interface RemoteKartMultiplayerEffectEventDrainResult {
  readonly events: readonly KartMultiplayerEffectEventMessage[];
  readonly timings: readonly KartMultiplayerEffectEventReplicationTiming[];
  readonly bufferedCount: number;
  readonly nextReadyAt: number | null;
}

export interface KartMultiplayerEffectEventReplicationTiming {
  readonly eventId: string;
  readonly effectEventKind: KartMultiplayerEffectEventKind;
  readonly hostPeerId: string;
  readonly sequence: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly occurredAt: number;
  readonly sentAt: number;
  readonly receivedAt: number;
  readonly latencyMs: number;
}

interface ReceivedKartMultiplayerEffectEvent {
  readonly event: KartMultiplayerEffectEventMessage;
  readonly receivedAt: number;
  readonly receivedTimestamp: number;
}

export class KartMultiplayerEffectEventMessageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "KartMultiplayerEffectEventMessageError";
  }
}

export class LocalKartMultiplayerEffectEventEmitter {
  private readonly hostPeerId: string;
  private readonly send: (
    payload: string,
    message: KartMultiplayerEffectEventMessage
  ) => boolean;
  private readonly now: () => number;
  private readonly sendTimestampNow: () => number;
  private nextSequence = 0;

  public constructor(options: LocalKartMultiplayerEffectEventEmitterOptions) {
    this.hostPeerId = requireNonEmptyText(options.hostPeerId, "hostPeerId");
    this.send = options.send;
    this.now = options.now ?? Date.now;
    this.sendTimestampNow = options.sendTimestampNow ?? this.now;
  }

  public emit(
    options: LocalKartMultiplayerEffectEventEmissionOptions
  ): KartMultiplayerEffectEventMessage | null {
    const occurredAt = this.now();
    const sentAt = this.sendTimestampNow();
    const message = createKartMultiplayerEffectEventMessage({
      ...options,
      hostPeerId: this.hostPeerId,
      sequence: this.nextSequence,
      occurredAt,
      sentAt
    } as KartMultiplayerEffectEventCreateOptions);
    const payload = serializeKartMultiplayerEffectEventMessage(message);

    this.nextSequence += 1;

    if (!this.send(payload, message)) {
      return null;
    }

    return message;
  }
}

export class RemoteKartMultiplayerEffectEventBuffer {
  private readonly expectedHostPeerId: string | undefined;
  private readonly maxBufferedEvents: number;
  private readonly maxPayloadBytes: number;
  private readonly maxRememberedEventIds: number;
  private readonly reorderWindowSeconds: number;
  private readonly lateEventToleranceSeconds: number;
  private readonly now: () => number;
  private readonly receiveTimestampNow: () => number;
  private readonly events: ReceivedKartMultiplayerEffectEvent[] = [];
  private readonly rememberedEventIds = new Set<string>();
  private readonly rememberedEventIdOrder: string[] = [];
  private lastDispatchedSequence = -1;
  private lastDispatchedElapsedSeconds = -1;
  private lastDispatchedOccurredAt = -1;
  private rejectedEvents = 0;
  private droppedEvents = 0;

  public constructor(
    options: RemoteKartMultiplayerEffectEventBufferOptions = {}
  ) {
    this.expectedHostPeerId =
      options.expectedHostPeerId === undefined
        ? undefined
        : requireNonEmptyText(options.expectedHostPeerId, "expectedHostPeerId");
    this.maxBufferedEvents = requirePositiveWholeNumber(
      options.maxBufferedEvents ?? MAX_REMOTE_EFFECT_EVENT_BUFFER_SIZE,
      "maxBufferedEvents"
    );
    this.maxPayloadBytes = requirePositiveWholeNumber(
      options.maxPayloadBytes ?? MAX_EFFECT_EVENT_PAYLOAD_BYTES,
      "maxPayloadBytes"
    );
    this.maxRememberedEventIds = requirePositiveWholeNumber(
      options.maxRememberedEventIds ?? MAX_REMOTE_EFFECT_EVENT_ID_CACHE_SIZE,
      "maxRememberedEventIds"
    );
    this.reorderWindowSeconds = requireFiniteNonNegativeNumber(
      options.reorderWindowSeconds ?? REMOTE_EFFECT_EVENT_REORDER_WINDOW_SECONDS,
      "reorderWindowSeconds"
    );
    this.lateEventToleranceSeconds = requireFiniteNonNegativeNumber(
      options.lateEventToleranceSeconds ??
        REMOTE_EFFECT_EVENT_LATE_TOLERANCE_SECONDS,
      "lateEventToleranceSeconds"
    );
    this.now = options.now ?? Date.now;
    this.receiveTimestampNow = options.receiveTimestampNow ?? Date.now;
  }

  public get bufferedCount(): number {
    return this.events.length;
  }

  public get rejectedCount(): number {
    return this.rejectedEvents;
  }

  public get droppedCount(): number {
    return this.droppedEvents;
  }

  public accept(
    input: unknown,
    receivedAt: number = this.now(),
    receivedTimestamp: number = this.receiveTimestampNow()
  ): RemoteKartMultiplayerEffectEventAcceptResult {
    let event: KartMultiplayerEffectEventMessage;

    if (typeof input === "string") {
      if (getUtf8ByteLength(input) > this.maxPayloadBytes) {
        return this.reject(
          "payload-too-large",
          "Remote effect-event payload exceeds the packet size limit."
        );
      }

      try {
        event = deserializeKartMultiplayerEffectEventMessage(input);
      } catch (error) {
        return this.reject(
          "invalid-payload",
          getErrorMessage(error, "Remote effect-event payload is invalid.")
        );
      }
    } else {
      if (!isRecord(input)) {
        return this.reject(
          "non-string-payload",
          "Remote effect event must be a payload string or event object."
        );
      }

      try {
        event = createKartMultiplayerEffectEventMessage(
          input as KartMultiplayerEffectEventCreateOptions
        );
      } catch (error) {
        return this.reject(
          "invalid-payload",
          getErrorMessage(error, "Remote effect event is invalid.")
        );
      }
    }

    if (
      this.expectedHostPeerId !== undefined &&
      event.hostPeerId !== this.expectedHostPeerId
    ) {
      return this.reject(
        "unexpected-host",
        `Remote effect event host mismatch: ${event.hostPeerId}.`
      );
    }

    if (this.rememberedEventIds.has(event.eventId)) {
      return this.reject(
        "duplicate-event",
        `Remote effect event ${event.eventId} has already been received.`
      );
    }

    if (event.sequence <= this.lastDispatchedSequence) {
      return this.reject(
        "stale-sequence",
        `Remote effect event sequence ${event.sequence} has already been dispatched.`
      );
    }

    if (
      this.events.some(
        (receivedEvent) => receivedEvent.event.sequence === event.sequence
      )
    ) {
      return this.reject(
        "duplicate-sequence",
        `Remote effect event sequence ${event.sequence} is already buffered.`
      );
    }

    if (this.isLateAgainstDispatchedTimeline(event)) {
      return this.reject(
        "late-event",
        `Remote effect event ${event.eventId} arrived after its authoritative effect window.`
      );
    }

    this.rememberEventId(event.eventId);
    const normalizedReceivedAt = requireFiniteNonNegativeNumber(
      receivedAt,
      "receivedAt"
    );
    const normalizedReceivedTimestamp = requireFiniteNonNegativeNumber(
      receivedTimestamp,
      "receivedTimestamp"
    );
    const timing = createKartMultiplayerEffectEventReplicationTiming(
      event,
      normalizedReceivedTimestamp
    );

    this.events.push({
      event,
      receivedAt: normalizedReceivedAt,
      receivedTimestamp: normalizedReceivedTimestamp
    });
    this.events.sort(compareReceivedEffectEventsBySequence);

    const droppedEvents = this.trimBufferedEvents();

    return {
      accepted: true,
      event,
      timing,
      bufferedCount: this.events.length,
      droppedEvents
    };
  }

  public drainReady(
    now: number = this.now()
  ): RemoteKartMultiplayerEffectEventDrainResult {
    const drainedEvents: KartMultiplayerEffectEventMessage[] = [];
    const drainedTimings: KartMultiplayerEffectEventReplicationTiming[] = [];
    const drainNow = requireFiniteNonNegativeNumber(now, "now");

    while (this.events.length > 0) {
      const nextEvent = this.events[0];

      if (nextEvent === undefined) {
        break;
      }

      if (!this.isReadyToDrain(nextEvent, drainNow)) {
        return {
          events: drainedEvents,
          timings: drainedTimings,
          bufferedCount: this.events.length,
          nextReadyAt: this.createNextReadyAt(nextEvent)
        };
      }

      this.events.shift();
      drainedEvents.push(nextEvent.event);
      drainedTimings.push(
        createKartMultiplayerEffectEventReplicationTiming(
          nextEvent.event,
          nextEvent.receivedTimestamp
        )
      );
      this.rememberDispatchedEvent(nextEvent.event);
    }

    return {
      events: drainedEvents,
      timings: drainedTimings,
      bufferedCount: this.events.length,
      nextReadyAt: null
    };
  }

  public clear(): void {
    this.events.length = 0;
    this.rememberedEventIds.clear();
    this.rememberedEventIdOrder.length = 0;
    this.lastDispatchedSequence = -1;
    this.lastDispatchedElapsedSeconds = -1;
    this.lastDispatchedOccurredAt = -1;
    this.rejectedEvents = 0;
    this.droppedEvents = 0;
  }

  private reject(
    reason: RemoteKartMultiplayerEffectEventRejectionReason,
    message: string
  ): RemoteKartMultiplayerEffectEventAcceptResult {
    this.rejectedEvents += 1;

    return {
      accepted: false,
      reason,
      message,
      bufferedCount: this.events.length,
      rejectedCount: this.rejectedEvents
    };
  }

  private isReadyToDrain(
    receivedEvent: ReceivedKartMultiplayerEffectEvent,
    now: number
  ): boolean {
    const event = receivedEvent.event;
    const expectedSequence = this.lastDispatchedSequence + 1;

    if (event.sequence === expectedSequence) {
      return true;
    }

    if (this.lastDispatchedSequence < 0 && event.sequence === 0) {
      return true;
    }

    return now >= this.createNextReadyAt(receivedEvent);
  }

  private createNextReadyAt(
    receivedEvent: ReceivedKartMultiplayerEffectEvent
  ): number {
    return receivedEvent.receivedAt + this.reorderWindowSeconds * 1000;
  }

  private isLateAgainstDispatchedTimeline(
    event: KartMultiplayerEffectEventMessage
  ): boolean {
    if (
      this.lastDispatchedElapsedSeconds >= 0 &&
      event.elapsedSeconds + this.lateEventToleranceSeconds <
        this.lastDispatchedElapsedSeconds
    ) {
      return true;
    }

    return (
      this.lastDispatchedOccurredAt >= 0 &&
      event.occurredAt + this.lateEventToleranceSeconds * 1000 <
        this.lastDispatchedOccurredAt
    );
  }

  private rememberDispatchedEvent(
    event: KartMultiplayerEffectEventMessage
  ): void {
    this.lastDispatchedSequence = Math.max(
      this.lastDispatchedSequence,
      event.sequence
    );
    this.lastDispatchedElapsedSeconds = Math.max(
      this.lastDispatchedElapsedSeconds,
      event.elapsedSeconds
    );
    this.lastDispatchedOccurredAt = Math.max(
      this.lastDispatchedOccurredAt,
      event.occurredAt
    );
  }

  private rememberEventId(eventId: string): void {
    this.rememberedEventIds.add(eventId);
    this.rememberedEventIdOrder.push(eventId);

    while (this.rememberedEventIdOrder.length > this.maxRememberedEventIds) {
      const forgottenEventId = this.rememberedEventIdOrder.shift();

      if (forgottenEventId !== undefined) {
        this.rememberedEventIds.delete(forgottenEventId);
      }
    }
  }

  private trimBufferedEvents(): readonly KartMultiplayerEffectEventMessage[] {
    const droppedEvents: KartMultiplayerEffectEventMessage[] = [];

    while (this.events.length > this.maxBufferedEvents) {
      const droppedEvent = this.events.shift();

      if (droppedEvent !== undefined) {
        droppedEvents.push(droppedEvent.event);
        this.rememberDispatchedEvent(droppedEvent.event);
      }
    }

    this.droppedEvents += droppedEvents.length;

    return droppedEvents;
  }
}

export function createKartMultiplayerEffectEventMessage(
  options: KartMultiplayerEffectEventCreateOptions
): KartMultiplayerEffectEventMessage {
  switch (options.effectEventKind) {
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START:
      return createKartBoostStartEffectEventMessage(options);
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_END:
      return createKartBoostEndEffectEventMessage(options);
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_LAUNCH:
      return createKartShellLaunchEffectEventMessage(options);
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_HIT:
      return createKartShellHitEffectEventMessage(options);
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_DROP:
      return createKartBananaDropEffectEventMessage(options);
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_HIT:
      return createKartBananaHitEffectEventMessage(options);
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_START:
      return createKartSpinoutStartEffectEventMessage(options);
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_END:
      return createKartSpinoutEndEffectEventMessage(options);
  }
}

export function createKartBoostStartEffectEventMessage(
  options: KartBoostStartEffectEventCreateOptions
): KartBoostStartEffectEventMessage {
  return {
    ...createEffectEventBase(options),
    itemType: requireExactItemType(options.itemType, "boost", "itemType"),
    effectId: requireNonEmptyText(options.effectId, "effectId"),
    racer: createParticipantSnapshot(options.racer, "racer"),
    durationSeconds: requireFiniteNonNegativeNumber(
      options.durationSeconds,
      "durationSeconds"
    ),
    expiresAtElapsedSeconds: requireFiniteNonNegativeNumber(
      options.expiresAtElapsedSeconds,
      "expiresAtElapsedSeconds"
    )
  };
}

export function createKartBoostEndEffectEventMessage(
  options: KartBoostEndEffectEventCreateOptions
): KartBoostEndEffectEventMessage {
  return {
    ...createEffectEventBase(options),
    itemType: requireExactItemType(options.itemType, "boost", "itemType"),
    effectId: requireNonEmptyText(options.effectId, "effectId"),
    racer: createParticipantSnapshot(options.racer, "racer"),
    reason: requireTimedEffectEndReason(options.reason, "reason")
  };
}

export function createKartShellLaunchEffectEventMessage(
  options: KartShellLaunchEffectEventCreateOptions
): KartShellLaunchEffectEventMessage {
  return {
    ...createEffectEventBase(options),
    itemType: requireExactItemType(options.itemType, "shell", "itemType"),
    shellId: requireNonEmptyText(options.shellId, "shellId"),
    source: createParticipantSnapshot(options.source, "source"),
    position: createVector3Snapshot(options.position, "position"),
    velocity: createVector3Snapshot(options.velocity, "velocity"),
    radius: requirePositiveFiniteNumber(options.radius, "radius"),
    armedSeconds: requireFiniteNonNegativeNumber(
      options.armedSeconds,
      "armedSeconds"
    ),
    ttlSeconds: requireFiniteNonNegativeNumber(options.ttlSeconds, "ttlSeconds")
  };
}

export function createKartShellHitEffectEventMessage(
  options: KartShellHitEffectEventCreateOptions
): KartShellHitEffectEventMessage {
  return {
    ...createEffectEventBase(options),
    itemType: requireExactItemType(options.itemType, "shell", "itemType"),
    shellId: requireNonEmptyText(options.shellId, "shellId"),
    source: createParticipantSnapshot(options.source, "source"),
    target: createParticipantSnapshot(options.target, "target"),
    impact: createImpactSnapshot(options.impact, "impact"),
    effect: createHitEffectSnapshot(options.effect, "shell")
  };
}

export function createKartBananaDropEffectEventMessage(
  options: KartBananaDropEffectEventCreateOptions
): KartBananaDropEffectEventMessage {
  return {
    ...createEffectEventBase(options),
    itemType: requireExactItemType(options.itemType, "banana", "itemType"),
    bananaId: requireNonEmptyText(options.bananaId, "bananaId"),
    owner: createParticipantSnapshot(options.owner, "owner"),
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

export function createKartBananaHitEffectEventMessage(
  options: KartBananaHitEffectEventCreateOptions
): KartBananaHitEffectEventMessage {
  return {
    ...createEffectEventBase(options),
    itemType: requireExactItemType(options.itemType, "banana", "itemType"),
    bananaId: requireNonEmptyText(options.bananaId, "bananaId"),
    source: createParticipantSnapshot(options.source, "source"),
    target: createParticipantSnapshot(options.target, "target"),
    impact: createImpactSnapshot(options.impact, "impact"),
    effect: createHitEffectSnapshot(options.effect, "banana")
  };
}

export function createKartSpinoutStartEffectEventMessage(
  options: KartSpinoutStartEffectEventCreateOptions
): KartSpinoutStartEffectEventMessage {
  return {
    ...createEffectEventBase(options),
    spinoutId: requireNonEmptyText(options.spinoutId, "spinoutId"),
    target: createParticipantSnapshot(options.target, "target"),
    source: createNullableParticipantSnapshot(options.source, "source"),
    sourceItemType: requireSpinoutSourceItemType(
      options.sourceItemType,
      "sourceItemType"
    ),
    sourceObjectId: requireNonEmptyText(options.sourceObjectId, "sourceObjectId"),
    durationSeconds: requireFiniteNonNegativeNumber(
      options.durationSeconds,
      "durationSeconds"
    ),
    expiresAtElapsedSeconds: requireFiniteNonNegativeNumber(
      options.expiresAtElapsedSeconds,
      "expiresAtElapsedSeconds"
    ),
    angularVelocity: requireFiniteNumber(options.angularVelocity, "angularVelocity")
  };
}

export function createKartSpinoutEndEffectEventMessage(
  options: KartSpinoutEndEffectEventCreateOptions
): KartSpinoutEndEffectEventMessage {
  return {
    ...createEffectEventBase(options),
    spinoutId: requireNonEmptyText(options.spinoutId, "spinoutId"),
    target: createParticipantSnapshot(options.target, "target"),
    source: createNullableParticipantSnapshot(options.source, "source"),
    sourceItemType: requireSpinoutSourceItemType(
      options.sourceItemType,
      "sourceItemType"
    ),
    sourceObjectId: requireNonEmptyText(options.sourceObjectId, "sourceObjectId"),
    reason: requireTimedEffectEndReason(options.reason, "reason")
  };
}

export function serializeKartMultiplayerEffectEventMessage(
  message: KartMultiplayerEffectEventMessage
): string {
  return JSON.stringify(createKartMultiplayerEffectEventMessage(message));
}

export function deserializeKartMultiplayerEffectEventMessage(
  payload: unknown
): KartMultiplayerEffectEventMessage {
  if (typeof payload !== "string") {
    throw new KartMultiplayerEffectEventMessageError(
      "Effect-event payload must be a string."
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new KartMultiplayerEffectEventMessageError(
      "Effect-event payload is not valid JSON."
    );
  }

  if (!isRecord(parsed)) {
    throw new KartMultiplayerEffectEventMessageError(
      "Effect-event payload must be an object."
    );
  }

  if (parsed.protocol !== KART_GAMEPLAY_PROTOCOL) {
    throw new KartMultiplayerEffectEventMessageError(
      "Effect-event protocol mismatch."
    );
  }

  if (parsed.version !== KART_GAMEPLAY_VERSION) {
    throw new KartMultiplayerEffectEventMessageError(
      "Effect-event version mismatch."
    );
  }

  if (parsed.type !== KART_GAMEPLAY_MESSAGE_TYPES.EFFECT_EVENT) {
    throw new KartMultiplayerEffectEventMessageError(
      "Effect-event message type mismatch."
    );
  }

  return createKartMultiplayerEffectEventMessage(readEffectEventCreateOptions(parsed));
}

export function isKartMultiplayerEffectEventMessagePayload(
  payload: unknown
): payload is string {
  if (typeof payload !== "string") {
    return false;
  }

  try {
    deserializeKartMultiplayerEffectEventMessage(payload);
    return true;
  } catch {
    return false;
  }
}

export function isKartMultiplayerEffectEventKind(
  value: unknown
): value is KartMultiplayerEffectEventKind {
  return (
    typeof value === "string" &&
    (Object.values(KART_MULTIPLAYER_EFFECT_EVENT_KINDS) as readonly string[]).includes(
      value
    )
  );
}

export function createKartMultiplayerEffectEventReplicationTiming(
  event: KartMultiplayerEffectEventMessage,
  receivedAt: number
): KartMultiplayerEffectEventReplicationTiming {
  const normalizedReceivedAt = requireFiniteNonNegativeNumber(
    receivedAt,
    "receivedAt"
  );

  return {
    eventId: event.eventId,
    effectEventKind: event.effectEventKind,
    hostPeerId: event.hostPeerId,
    sequence: event.sequence,
    tickIndex: event.tickIndex,
    elapsedSeconds: event.elapsedSeconds,
    occurredAt: event.occurredAt,
    sentAt: event.sentAt,
    receivedAt: normalizedReceivedAt,
    latencyMs: Math.max(0, normalizedReceivedAt - event.sentAt)
  };
}

function createEffectEventBase<Kind extends KartMultiplayerEffectEventKind>(
  options: KartEffectEventBaseCreateOptions<Kind>
): KartMultiplayerEffectEventMessageBase<Kind> {
  const occurredAt = requireFiniteNonNegativeNumber(
    options.occurredAt,
    "occurredAt"
  );

  return {
    protocol: KART_GAMEPLAY_PROTOCOL,
    version: KART_GAMEPLAY_VERSION,
    type: KART_GAMEPLAY_MESSAGE_TYPES.EFFECT_EVENT,
    effectEventKind: requireEffectEventKind(
      options.effectEventKind,
      "effectEventKind"
    ) as Kind,
    eventId: requireNonEmptyText(options.eventId, "eventId"),
    hostPeerId: requireNonEmptyText(options.hostPeerId, "hostPeerId"),
    sequence: requireWholeNumber(options.sequence, "sequence"),
    tickIndex: requireWholeNumber(options.tickIndex, "tickIndex"),
    elapsedSeconds: requireFiniteNonNegativeNumber(
      options.elapsedSeconds,
      "elapsedSeconds"
    ),
    occurredAt,
    sentAt: requireFiniteNonNegativeNumber(
      options.sentAt ?? occurredAt,
      "sentAt"
    )
  };
}

function readEffectEventCreateOptions(
  record: Readonly<Record<string, unknown>>
): KartMultiplayerEffectEventCreateOptions {
  const base = readEffectEventBaseFields(record);

  switch (base.effectEventKind) {
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START:
      return {
        ...base,
        effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START,
        itemType: requireExactItemType(
          requireItemTypeField(record, "itemType"),
          "boost",
          "itemType"
        ),
        effectId: requireStringField(record, "effectId"),
        racer: requireParticipantField(record, "racer"),
        durationSeconds: requireNumberField(record, "durationSeconds"),
        expiresAtElapsedSeconds: requireNumberField(
          record,
          "expiresAtElapsedSeconds"
        )
      };
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_END:
      return {
        ...base,
        effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_END,
        itemType: requireExactItemType(
          requireItemTypeField(record, "itemType"),
          "boost",
          "itemType"
        ),
        effectId: requireStringField(record, "effectId"),
        racer: requireParticipantField(record, "racer"),
        reason: requireStringField(record, "reason") as KartTimedEffectEndReason
      };
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_LAUNCH:
      return {
        ...base,
        effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_LAUNCH,
        itemType: requireExactItemType(
          requireItemTypeField(record, "itemType"),
          "shell",
          "itemType"
        ),
        shellId: requireStringField(record, "shellId"),
        source: requireParticipantField(record, "source"),
        position: requireVector3Field(record, "position"),
        velocity: requireVector3Field(record, "velocity"),
        radius: requireNumberField(record, "radius"),
        armedSeconds: requireNumberField(record, "armedSeconds"),
        ttlSeconds: requireNumberField(record, "ttlSeconds")
      };
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_HIT:
      return {
        ...base,
        effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_HIT,
        itemType: requireExactItemType(
          requireItemTypeField(record, "itemType"),
          "shell",
          "itemType"
        ),
        shellId: requireStringField(record, "shellId"),
        source: requireParticipantField(record, "source"),
        target: requireParticipantField(record, "target"),
        impact: requireImpactField(record, "impact"),
        effect: requireHitEffectField(record, "effect")
      };
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_DROP:
      return {
        ...base,
        effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_DROP,
        itemType: requireExactItemType(
          requireItemTypeField(record, "itemType"),
          "banana",
          "itemType"
        ),
        bananaId: requireStringField(record, "bananaId"),
        owner: requireParticipantField(record, "owner"),
        position: requireVector3Field(record, "position"),
        velocity: requireVector3Field(record, "velocity"),
        radius: requireNumberField(record, "radius"),
        armedSeconds: requireNumberField(record, "armedSeconds"),
        ttlSeconds: requireNumberField(record, "ttlSeconds"),
        ageSeconds: requireNumberField(record, "ageSeconds"),
        orientationRadians: requireNumberField(record, "orientationRadians")
      };
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_HIT:
      return {
        ...base,
        effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_HIT,
        itemType: requireExactItemType(
          requireItemTypeField(record, "itemType"),
          "banana",
          "itemType"
        ),
        bananaId: requireStringField(record, "bananaId"),
        source: requireParticipantField(record, "source"),
        target: requireParticipantField(record, "target"),
        impact: requireImpactField(record, "impact"),
        effect: requireHitEffectField(record, "effect")
      };
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_START:
      return {
        ...base,
        effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_START,
        spinoutId: requireStringField(record, "spinoutId"),
        target: requireParticipantField(record, "target"),
        source: requireNullableParticipantField(record, "source"),
        sourceItemType: requireSpinoutSourceItemTypeField(
          record,
          "sourceItemType"
        ),
        sourceObjectId: requireStringField(record, "sourceObjectId"),
        durationSeconds: requireNumberField(record, "durationSeconds"),
        expiresAtElapsedSeconds: requireNumberField(
          record,
          "expiresAtElapsedSeconds"
        ),
        angularVelocity: requireNumberField(record, "angularVelocity")
      };
    case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_END:
      return {
        ...base,
        effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_END,
        spinoutId: requireStringField(record, "spinoutId"),
        target: requireParticipantField(record, "target"),
        source: requireNullableParticipantField(record, "source"),
        sourceItemType: requireSpinoutSourceItemTypeField(
          record,
          "sourceItemType"
        ),
        sourceObjectId: requireStringField(record, "sourceObjectId"),
        reason: requireStringField(record, "reason") as KartTimedEffectEndReason
      };
  }
}

function readEffectEventBaseFields(
  record: Readonly<Record<string, unknown>>
): KartEffectEventBaseCreateOptions<KartMultiplayerEffectEventKind> {
  const sentAt = getOptionalNumberField(record, "sentAt");

  return {
    effectEventKind: requireEffectEventKindField(record, "effectEventKind"),
    eventId: requireStringField(record, "eventId"),
    hostPeerId: requireStringField(record, "hostPeerId"),
    sequence: requireNumberField(record, "sequence"),
    tickIndex: requireNumberField(record, "tickIndex"),
    elapsedSeconds: requireNumberField(record, "elapsedSeconds"),
    occurredAt: requireNumberField(record, "occurredAt"),
    ...(sentAt === undefined ? {} : { sentAt })
  };
}

function createParticipantSnapshot(
  participant: KartEffectParticipantSnapshot,
  key: string
): KartEffectParticipantSnapshot {
  return {
    playerId:
      participant.playerId === null
        ? null
        : requireNonEmptyText(participant.playerId, `${key}.playerId`),
    racerId: requireNonEmptyText(participant.racerId, `${key}.racerId`),
    slotIndex: requireWholeNumber(participant.slotIndex, `${key}.slotIndex`)
  };
}

function createNullableParticipantSnapshot(
  participant: KartEffectParticipantSnapshot | null,
  key: string
): KartEffectParticipantSnapshot | null {
  return participant === null ? null : createParticipantSnapshot(participant, key);
}

function createImpactSnapshot(
  impact: KartEffectImpactSnapshot,
  key: string
): KartEffectImpactSnapshot {
  return {
    position: createVector3Snapshot(impact.position, `${key}.position`),
    normal: createVector3Snapshot(impact.normal, `${key}.normal`),
    objectPosition: createVector3Snapshot(
      impact.objectPosition,
      `${key}.objectPosition`
    ),
    objectVelocity: createVector3Snapshot(
      impact.objectVelocity,
      `${key}.objectVelocity`
    ),
    objectRadius: requirePositiveFiniteNumber(
      impact.objectRadius,
      `${key}.objectRadius`
    ),
    targetHitboxCenter: createVector3Snapshot(
      impact.targetHitboxCenter,
      `${key}.targetHitboxCenter`
    ),
    penetrationDepth: requireFiniteNonNegativeNumber(
      impact.penetrationDepth,
      `${key}.penetrationDepth`
    ),
    relativeSpeed: requireFiniteNonNegativeNumber(
      impact.relativeSpeed,
      `${key}.relativeSpeed`
    )
  };
}

function createHitEffectSnapshot(
  effect: RaceItemHitEffectData | KartEffectHitEffectSnapshot,
  expectedItemType: KartSpinoutSourceItemType
): KartEffectHitEffectSnapshot {
  if (effect.itemType !== expectedItemType) {
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event hit effect item type must be ${expectedItemType}.`
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

function requireParticipantField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartEffectParticipantSnapshot {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be a participant object: ${key}.`
    );
  }

  return {
    playerId: requireNullableStringField(value, "playerId"),
    racerId: requireStringField(value, "racerId"),
    slotIndex: requireNumberField(value, "slotIndex")
  };
}

function requireNullableParticipantField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartEffectParticipantSnapshot | null {
  const value = record[key];

  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be a participant object or null: ${key}.`
    );
  }

  return {
    playerId: requireNullableStringField(value, "playerId"),
    racerId: requireStringField(value, "racerId"),
    slotIndex: requireNumberField(value, "slotIndex")
  };
}

function requireImpactField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartEffectImpactSnapshot {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be an impact object: ${key}.`
    );
  }

  return {
    position: requireVector3Field(value, "position"),
    normal: requireVector3Field(value, "normal"),
    objectPosition: requireVector3Field(value, "objectPosition"),
    objectVelocity: requireVector3Field(value, "objectVelocity"),
    objectRadius: requireNumberField(value, "objectRadius"),
    targetHitboxCenter: requireVector3Field(value, "targetHitboxCenter"),
    penetrationDepth: requireNumberField(value, "penetrationDepth"),
    relativeSpeed: requireNumberField(value, "relativeSpeed")
  };
}

function requireHitEffectField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartEffectHitEffectSnapshot {
  const value = record[key];

  if (!isRecord(value)) {
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be a hit effect object: ${key}.`
    );
  }

  return {
    itemType: requireSpinoutSourceItemTypeField(value, "itemType"),
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
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be a vector object: ${key}.`
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

function requireEffectEventKindField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartMultiplayerEffectEventKind {
  const value = record[key];

  if (typeof value !== "string") {
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be a string: ${key}.`
    );
  }

  return requireEffectEventKind(value, key);
}

function requireEffectEventKind(
  value: string,
  key: string
): KartMultiplayerEffectEventKind {
  if (!isKartMultiplayerEffectEventKind(value)) {
    throw new KartMultiplayerEffectEventMessageError(
      `Unsupported effect-event kind for ${key}: ${value}.`
    );
  }

  return value;
}

function requireItemTypeField(
  record: Readonly<Record<string, unknown>>,
  key: string
): CombatItemType {
  const value = record[key];

  if (value !== "boost" && value !== "shell" && value !== "banana") {
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be a combat item type: ${key}.`
    );
  }

  return value;
}

function requireSpinoutSourceItemTypeField(
  record: Readonly<Record<string, unknown>>,
  key: string
): KartSpinoutSourceItemType {
  return requireSpinoutSourceItemType(requireItemTypeField(record, key), key);
}

function requireSpinoutSourceItemType(
  value: CombatItemType,
  key: string
): KartSpinoutSourceItemType {
  if (value !== "shell" && value !== "banana") {
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be shell or banana: ${key}.`
    );
  }

  return value;
}

function requireExactItemType<Item extends CombatItemType>(
  value: CombatItemType,
  expected: Item,
  key: string
): Item {
  if (value !== expected) {
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be ${expected}: ${key}.`
    );
  }

  return expected;
}

function requireTimedEffectEndReason(
  value: string,
  key: string
): KartTimedEffectEndReason {
  if (
    value !== "duration-expired" &&
    value !== "interrupted" &&
    value !== "race-reset" &&
    value !== "authoritative-correction"
  ) {
    throw new KartMultiplayerEffectEventMessageError(
      `Unsupported timed effect end reason for ${key}: ${value}.`
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
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be a string: ${key}.`
    );
  }

  return value;
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
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be a string or null: ${key}.`
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
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be a number: ${key}.`
    );
  }

  return value;
}

function getOptionalNumberField(
  record: Readonly<Record<string, unknown>>,
  key: string
): number | undefined {
  if (!(key in record)) {
    return undefined;
  }

  return requireNumberField(record, key);
}

function requireBooleanField(
  record: Readonly<Record<string, unknown>>,
  key: string
): boolean {
  const value = record[key];

  if (typeof value !== "boolean") {
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be a boolean: ${key}.`
    );
  }

  return value;
}

function requireNonEmptyText(value: string, key: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be non-empty: ${key}.`
    );
  }

  return normalized;
}

function requireWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be a whole non-negative number: ${key}.`
    );
  }

  return value;
}

function requirePositiveWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be a positive whole number: ${key}.`
    );
  }

  return value;
}

function requireFiniteNumber(value: number, key: string): number {
  if (!Number.isFinite(value)) {
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be finite: ${key}.`
    );
  }

  return value;
}

function requireFiniteNonNegativeNumber(value: number, key: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be finite and non-negative: ${key}.`
    );
  }

  return value;
}

function requirePositiveFiniteNumber(value: number, key: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new KartMultiplayerEffectEventMessageError(
      `Effect-event field must be finite and positive: ${key}.`
    );
  }

  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareReceivedEffectEventsBySequence(
  left: ReceivedKartMultiplayerEffectEvent,
  right: ReceivedKartMultiplayerEffectEvent
): number {
  return (
    left.event.sequence - right.event.sequence ||
    left.event.elapsedSeconds - right.event.elapsedSeconds ||
    left.event.occurredAt - right.event.occurredAt
  );
}

function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
