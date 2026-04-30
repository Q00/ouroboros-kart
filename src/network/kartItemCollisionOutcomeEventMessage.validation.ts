import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  getKartGameplayPayloadType
} from "./kartInputSnapshot";
import {
  KART_ITEM_COLLISION_OUTCOME_TYPES,
  MAX_ITEM_COLLISION_OUTCOME_EVENT_PAYLOAD_BYTES,
  createKartItemCollisionOutcomeEventMessage,
  createKartItemCollisionOutcomeEventMessageFromBananaHitEvent,
  createKartItemCollisionOutcomeEventMessageFromShellHitEvent,
  createRaceBananaHitEventFromItemCollisionOutcomeMessage,
  createRaceShellHitEventFromItemCollisionOutcomeMessage,
  deserializeKartItemCollisionOutcomeEventMessage,
  isKartItemCollisionOutcomeEventMessagePayload,
  serializeKartItemCollisionOutcomeEventMessage,
  type KartBananaCollisionOutcomeEventMessage,
  type KartItemCollisionOutcomeEventMessage,
  type KartShellCollisionOutcomeEventMessage
} from "./kartItemCollisionOutcomeEventMessage";
import {
  deserializeKartGameplayMessageAs,
  dispatchKartGameplayMessage,
  serializeKartGameplayMessage
} from "./gameplayMessage";
import {
  createRaceSessionFromStartRoster,
  type RaceBananaHitEvent,
  type RaceItemHitEffectData,
  type RaceSessionRacerState,
  type RaceShellHitEvent,
  type RaceShellHitImpactData
} from "../race/raceSession";
import { createRaceStartRoster } from "../race/raceStartRoster";

function main(): void {
  const shellOutcome = validateShellCollisionOutcomeSchema();
  const bananaOutcome = validateBananaCollisionOutcomeSchema();

  validateGenericGameplayCodec(shellOutcome);
  validateMalformedCollisionOutcomes(shellOutcome, bananaOutcome);
  validateCollisionOutcomeApplicationUsesAuthoritativeEffectAge();

  console.info(
    "itemCollisionOutcomeSchema=ok",
    `shellCollisionType=${shellOutcome.collisionType}`,
    `bananaCollisionType=${bananaOutcome.collisionType}`,
    `messageType=${KART_GAMEPLAY_MESSAGE_TYPES.ITEM_COLLISION_OUTCOME_EVENT}`
  );
}

function validateShellCollisionOutcomeSchema(): KartShellCollisionOutcomeEventMessage {
  const raceEvent = createRaceShellHitEvent();
  const outcome = createKartItemCollisionOutcomeEventMessageFromShellHitEvent({
    event: raceEvent,
    hostPeerId: "host-peer",
    sourceClientId: "host-peer",
    sequence: 42,
    occurredAt: 15000
  });
  const payload = serializeKartItemCollisionOutcomeEventMessage(outcome);
  const parsed = deserializeKartItemCollisionOutcomeEventMessage(payload);

  if (parsed.itemType !== "shell") {
    throw new Error("Expected a shell collision outcome.");
  }

  assertEqual(parsed.eventId, raceEvent.eventId, "shell outcome event id");
  assertEqual(parsed.itemId, raceEvent.shellId, "shell outcome item id");
  assertEqual(
    parsed.victimKartId,
    raceEvent.targetRacerId,
    "shell outcome victim kart id"
  );
  assertEqual(
    parsed.collisionType,
    KART_ITEM_COLLISION_OUTCOME_TYPES.SHELL_HIT,
    "shell outcome collision type"
  );
  assertEqual(parsed.sourceClientId, "host-peer", "shell outcome source client");
  assertEqual(parsed.sequence, 42, "shell outcome sequence");
  assertEqual(parsed.tickIndex, raceEvent.tickIndex, "shell outcome tick index");
  assertEqual(
    parsed.effect.blockedByShield,
    false,
    "shell outcome normalizes shield flag"
  );
  assertEqual(
    parsed.effect.shieldSecondsAfterHit,
    0,
    "shell outcome normalizes shield timer"
  );
  assertEqual(
    parsed.itemConsumption.activeState,
    "removed",
    "shell outcome item is removed after hit"
  );
  assertEqual(
    parsed.itemConsumption.consumed,
    true,
    "shell outcome item is consumed after hit"
  );
  assertEqual(
    parsed.itemConsumption.despawned,
    true,
    "shell outcome item despawns after hit"
  );
  assertEqual(
    parsed.itemConsumption.collisionEventId,
    raceEvent.eventId,
    "shell outcome consumption references collision"
  );
  assertEqual(
    parsed.itemConsumption.consumedByRacerId,
    raceEvent.targetRacerId,
    "shell outcome consumption target"
  );
  assert(
    payload.length < MAX_ITEM_COLLISION_OUTCOME_EVENT_PAYLOAD_BYTES,
    "shell outcome payload fits packet budget"
  );
  assert(
    isKartItemCollisionOutcomeEventMessagePayload(payload),
    "shell outcome payload guard accepts valid payload"
  );
  assertEqual(
    getKartGameplayPayloadType(payload),
    KART_GAMEPLAY_MESSAGE_TYPES.ITEM_COLLISION_OUTCOME_EVENT,
    "gameplay type peeking identifies item collision outcomes"
  );

  const reconstructed = createRaceShellHitEventFromItemCollisionOutcomeMessage(parsed);

  assertEqual(reconstructed.shellId, raceEvent.shellId, "shell id reconstructs");
  assertEqual(
    reconstructed.targetRacerId,
    raceEvent.targetRacerId,
    "shell victim reconstructs"
  );
  assertEqual(
    reconstructed.impact.shellRadius,
    raceEvent.impact.shellRadius,
    "shell impact reconstructs"
  );

  return parsed;
}

function validateBananaCollisionOutcomeSchema(): KartBananaCollisionOutcomeEventMessage {
  const raceEvent = createRaceBananaHitEvent();
  const outcome = createKartItemCollisionOutcomeEventMessageFromBananaHitEvent({
    event: raceEvent,
    hostPeerId: "host-peer",
    sourceClientId: "guest-peer",
    sequence: 43,
    occurredAt: 15100
  });
  const payload = serializeKartItemCollisionOutcomeEventMessage(outcome);
  const parsed = deserializeKartItemCollisionOutcomeEventMessage(payload);

  if (parsed.itemType !== "banana") {
    throw new Error("Expected a banana collision outcome.");
  }

  assertEqual(parsed.eventId, raceEvent.eventId, "banana outcome event id");
  assertEqual(parsed.itemId, raceEvent.bananaId, "banana outcome item id");
  assertEqual(
    parsed.victimKartId,
    raceEvent.targetRacerId,
    "banana outcome victim kart id"
  );
  assertEqual(
    parsed.collisionType,
    KART_ITEM_COLLISION_OUTCOME_TYPES.BANANA_HIT,
    "banana outcome collision type"
  );
  assertEqual(
    parsed.sourceClientId,
    "guest-peer",
    "banana outcome source client"
  );
  assertEqual(parsed.sequence, 43, "banana outcome sequence");
  assertEqual(parsed.tickIndex, raceEvent.tickIndex, "banana outcome tick index");
  assertEqual(parsed.effect.itemType, "banana", "banana effect item type");
  assertEqual(
    parsed.effect.blockedByShield,
    true,
    "banana outcome preserves shield flag"
  );
  assertEqual(
    parsed.itemConsumption.activeState,
    "removed",
    "banana outcome item is removed after hit"
  );
  assertEqual(
    parsed.itemConsumption.reason,
    "collision",
    "banana outcome consumption reason"
  );
  assertEqual(
    parsed.itemConsumption.consumedBySlotIndex,
    raceEvent.targetSlotIndex,
    "banana outcome consumption slot"
  );

  const reconstructed =
    createRaceBananaHitEventFromItemCollisionOutcomeMessage(parsed);

  assertEqual(reconstructed.bananaId, raceEvent.bananaId, "banana id reconstructs");
  assertEqual(
    reconstructed.targetSlotIndex,
    raceEvent.targetSlotIndex,
    "banana victim slot reconstructs"
  );

  return parsed;
}

function validateGenericGameplayCodec(
  outcome: KartItemCollisionOutcomeEventMessage
): void {
  const payload = serializeKartGameplayMessage(outcome);
  const parsed = deserializeKartGameplayMessageAs(
    payload,
    KART_GAMEPLAY_MESSAGE_TYPES.ITEM_COLLISION_OUTCOME_EVENT
  );
  const dispatchedTypes: string[] = [];
  const result = dispatchKartGameplayMessage(parsed, {
    onItemCollisionOutcomeEvent: (message) => {
      dispatchedTypes.push(`${message.type}:${message.collisionType}`);
    }
  });

  assert(result.dispatched, "generic dispatcher routes collision outcomes");
  assertEqual(
    dispatchedTypes[0],
    "item-collision-outcome-event:shell-hit",
    "generic dispatcher invokes typed item collision outcome handler"
  );
}

function validateCollisionOutcomeApplicationUsesAuthoritativeEffectAge(): void {
  validateShellOutcomeApplicationUsesAuthoritativeEffectAge();
  validateBananaOutcomeApplicationUsesAuthoritativeEffectAge();
}

function validateShellOutcomeApplicationUsesAuthoritativeEffectAge(): void {
  const harness = createOutcomeApplicationHarness();
  const eventElapsedSeconds = 0.1;
  const currentElapsedSeconds = harness.advanceToElapsedSeconds(0.28);
  const effect = {
    ...createEffect("shell"),
    speedBeforeHit: 18,
    speedAfterHit: 6.3
  };
  const raceEvent: RaceShellHitEvent = {
    eventId: "shell-hit-authoritative-aged",
    itemType: "shell",
    shellId: "shell-aged-1",
    sourceRacerId: harness.source.id,
    sourceSlotIndex: harness.source.slotIndex,
    targetRacerId: harness.target.id,
    targetSlotIndex: harness.target.slotIndex,
    tickIndex: 18,
    elapsedSeconds: eventElapsedSeconds,
    impact: createImpact(),
    effect
  };
  const outcome = createKartItemCollisionOutcomeEventMessageFromShellHitEvent({
    event: raceEvent,
    hostPeerId: "host-peer",
    sourceClientId: "host-peer",
    sequence: 70,
    occurredAt: 17000
  });
  const reconstructed =
    createRaceShellHitEventFromItemCollisionOutcomeMessage(outcome);
  const elapsedSinceEventSeconds =
    currentElapsedSeconds - eventElapsedSeconds;

  harness.target.speed = effect.speedBeforeHit;

  assert(
    harness.session.applyShellHitEvent(reconstructed),
    "authoritative shell outcome applies to local race state"
  );
  assertClose(
    harness.target.stunSeconds,
    effect.stunSeconds - elapsedSinceEventSeconds,
    0.000001,
    "shell outcome stun timer is aligned to host event age"
  );
  assertClose(
    harness.target.spinoutSeconds,
    effect.spinoutSeconds - elapsedSinceEventSeconds,
    0.000001,
    "shell outcome spinout timer is aligned to host event age"
  );
  assertClose(
    harness.target.itemHitImmunitySeconds,
    effect.hitImmunitySeconds - elapsedSinceEventSeconds,
    0.000001,
    "shell outcome immunity timer is aligned to host event age"
  );
  assertClose(
    harness.target.hitFeedbackSeconds,
    effect.hitFeedbackSeconds - elapsedSinceEventSeconds,
    0.000001,
    "shell outcome feedback timer is aligned to host event age"
  );
  assertClose(
    harness.target.speed,
    effect.speedAfterHit,
    0.000001,
    "shell outcome applies authoritative speed penalty exactly"
  );
}

function validateBananaOutcomeApplicationUsesAuthoritativeEffectAge(): void {
  const harness = createOutcomeApplicationHarness();
  const eventElapsedSeconds = 0.12;
  const currentElapsedSeconds = harness.advanceToElapsedSeconds(0.31);
  const effect = {
    ...createEffect("banana"),
    speedBeforeHit: 14,
    speedAfterHit: 7
  };
  const raceEvent: RaceBananaHitEvent = {
    eventId: "banana-hit-authoritative-aged",
    itemType: "banana",
    bananaId: "banana-aged-1",
    sourceRacerId: harness.source.id,
    sourceSlotIndex: harness.source.slotIndex,
    targetRacerId: harness.target.id,
    targetSlotIndex: harness.target.slotIndex,
    tickIndex: 19,
    elapsedSeconds: eventElapsedSeconds,
    impact: createImpact(),
    effect
  };
  const outcome = createKartItemCollisionOutcomeEventMessageFromBananaHitEvent({
    event: raceEvent,
    hostPeerId: "host-peer",
    sourceClientId: "guest-peer",
    sequence: 71,
    occurredAt: 17100
  });
  const reconstructed =
    createRaceBananaHitEventFromItemCollisionOutcomeMessage(outcome);
  const elapsedSinceEventSeconds =
    currentElapsedSeconds - eventElapsedSeconds;

  harness.target.speed = effect.speedBeforeHit;

  assert(
    harness.session.applyBananaHitEvent(reconstructed),
    "authoritative banana outcome applies to local race state"
  );
  assertClose(
    harness.target.stunSeconds,
    effect.stunSeconds - elapsedSinceEventSeconds,
    0.000001,
    "banana outcome stun timer is aligned to host event age"
  );
  assertClose(
    harness.target.spinoutSeconds,
    effect.spinoutSeconds - elapsedSinceEventSeconds,
    0.000001,
    "banana outcome spinout timer is aligned to host event age"
  );
  assertClose(
    harness.target.itemHitImmunitySeconds,
    effect.hitImmunitySeconds - elapsedSinceEventSeconds,
    0.000001,
    "banana outcome immunity timer is aligned to host event age"
  );
  assertClose(
    harness.target.hitFeedbackSeconds,
    effect.hitFeedbackSeconds - elapsedSinceEventSeconds,
    0.000001,
    "banana outcome feedback timer is aligned to host event age"
  );
  assertClose(
    harness.target.speed,
    effect.speedAfterHit,
    0.000001,
    "banana outcome applies authoritative speed penalty exactly"
  );
}

function validateMalformedCollisionOutcomes(
  shellOutcome: KartShellCollisionOutcomeEventMessage,
  bananaOutcome: KartBananaCollisionOutcomeEventMessage
): void {
  assertThrows(
    () =>
      createKartItemCollisionOutcomeEventMessage({
        ...shellOutcome,
        collisionType: KART_ITEM_COLLISION_OUTCOME_TYPES.BANANA_HIT
      } as unknown as Parameters<
        typeof createKartItemCollisionOutcomeEventMessage
      >[0]),
    "mismatched shell collision type is rejected"
  );
  assertThrows(
    () =>
      deserializeKartItemCollisionOutcomeEventMessage(
        JSON.stringify({
          ...bananaOutcome,
          sourceClientId: ""
        })
      ),
    "empty source client is rejected"
  );
  assertThrows(
    () =>
      deserializeKartItemCollisionOutcomeEventMessage(
        JSON.stringify({
          ...shellOutcome,
          effect: {
            ...shellOutcome.effect,
            itemType: "banana"
          }
        })
      ),
    "mismatched effect item type is rejected"
  );
  assertThrows(
    () =>
      deserializeKartItemCollisionOutcomeEventMessage(
        JSON.stringify({
          ...shellOutcome,
          itemConsumption: {
            ...shellOutcome.itemConsumption,
            consumed: false
          }
        })
      ),
    "non-consumed outcome state is rejected"
  );
  assertThrows(
    () =>
      deserializeKartItemCollisionOutcomeEventMessage(
        JSON.stringify({
          ...bananaOutcome,
          itemConsumption: {
            ...bananaOutcome.itemConsumption,
            collisionEventId: "banana-hit-other"
          }
        })
      ),
    "mismatched consumption collision id is rejected"
  );
}

function createOutcomeApplicationHarness(): {
  readonly session: ReturnType<typeof createRaceSessionFromStartRoster>;
  readonly source: RaceSessionRacerState;
  readonly target: RaceSessionRacerState;
  readonly advanceToElapsedSeconds: (elapsedSeconds: number) => number;
} {
  const session = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs()),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const source = session.humanRacerStates[0];
  const target = session.humanRacerStates[1];

  if (source === undefined || target === undefined) {
    throw new Error("Expected two human racers in outcome application harness.");
  }

  return {
    session,
    source,
    target,
    advanceToElapsedSeconds: (elapsedSeconds) => {
      while (session.raceElapsedSeconds < elapsedSeconds) {
        const remainingSeconds = elapsedSeconds - session.raceElapsedSeconds;

        session.tick(remainingSeconds, {
          controllerPaths: new Map(
            session.racerStates.map((racer) => [
              racer.id,
              "remote-snapshot" as const
            ])
          )
        });
      }

      return session.raceElapsedSeconds;
    }
  };
}

function createHumanRacerInputs(): Parameters<typeof createRaceStartRoster>[0] {
  return [
    {
      peerId: "host-peer",
      displayName: "Host",
      slotIndex: 0,
      isHost: true
    },
    {
      peerId: "guest-peer",
      displayName: "Guest",
      slotIndex: 1
    }
  ];
}

function createRaceShellHitEvent(): RaceShellHitEvent {
  return {
    eventId: "shell-hit-authoritative-1",
    itemType: "shell",
    shellId: "shell-active-1",
    sourceRacerId: "human_1",
    sourceSlotIndex: 0,
    targetRacerId: "human_2",
    targetSlotIndex: 1,
    tickIndex: 240,
    elapsedSeconds: 4,
    impact: createImpact(),
    effect: createEffect("shell")
  };
}

function createRaceBananaHitEvent(): RaceBananaHitEvent {
  return {
    eventId: "banana-hit-authoritative-1",
    itemType: "banana",
    bananaId: "banana-active-1",
    sourceRacerId: "human_2",
    sourceSlotIndex: 1,
    targetRacerId: "ai_rival_1",
    targetSlotIndex: 2,
    tickIndex: 246,
    elapsedSeconds: 4.1,
    impact: createImpact(),
    effect: {
      ...createEffect("banana"),
      blockedByShield: true,
      shieldSecondsBeforeHit: 0.4,
      shieldSecondsAfterHit: 0.1
    }
  };
}

function createImpact(): RaceShellHitImpactData {
  return {
    position: { x: 8, y: 0.35, z: 12 },
    normal: { x: -1, y: 0, z: 0 },
    shellPosition: { x: 7.8, y: 0.25, z: 11.7 },
    shellVelocity: { x: 16, y: 0, z: 2 },
    shellRadius: 0.42,
    targetHitboxCenter: { x: 8.2, y: 0.45, z: 12.1 },
    penetrationDepth: 0.08,
    relativeSpeed: 18
  };
}

function createEffect(
  itemType: RaceItemHitEffectData["itemType"]
): RaceItemHitEffectData {
  return {
    itemType,
    stunSeconds: 0.35,
    spinoutSeconds: 1.15,
    spinoutAngularVelocity: 7.5,
    hitImmunitySeconds: 1,
    hitFeedbackSeconds: 0.4,
    speedFactor: 0.35,
    speedBeforeHit: 18,
    speedAfterHit: 6.3,
    headingDeltaRadians: 1.25
  };
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertClose(
  actual: number,
  expected: number,
  tolerance: number,
  message: string
): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertThrows(action: () => void, message: string): void {
  try {
    action();
  } catch {
    return;
  }

  throw new Error(message);
}

main();
