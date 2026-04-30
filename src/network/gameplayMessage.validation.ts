import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  KART_GAMEPLAY_PROTOCOL,
  KART_GAMEPLAY_VERSION,
  createKartInputSnapshot
} from "./kartInputSnapshot";
import {
  createKartTransformSnapshot,
  type KartRacerTransform
} from "./kartTransformSnapshot";
import { createKartOwnedTransformSnapshot } from "./kartOwnedTransformSnapshot";
import { createKartAuthoritativePlayerSnapshot } from "./kartAuthoritativePlayerSnapshot";
import { createKartBananaSpawnEventMessage } from "./kartBananaEventMessage";
import {
  KART_MULTIPLAYER_EFFECT_EVENT_KINDS,
  createKartBoostStartEffectEventMessage
} from "./kartEffectEventMessage";
import { createKartRemoteInputDeltaPacket } from "./remoteInputDelta";
import { createKartItemUseEventMessageFromRaceAction } from "./kartItemUseMessage";
import {
  KART_ITEM_COLLISION_OUTCOME_TYPES,
  createKartItemCollisionOutcomeEventMessage
} from "./kartItemCollisionOutcomeEventMessage";
import { createKartRaceStateSnapshot } from "./kartRaceStateMessage";
import {
  MAX_GAMEPLAY_MESSAGE_PAYLOAD_BYTES,
  dispatchKartGameplayMessage,
  deserializeKartGameplayMessage,
  deserializeKartGameplayMessageAs,
  getKartGameplayPayloadType,
  isKartGameplayMessageOfType,
  isKartGameplayMessagePayload,
  serializeKartGameplayMessage,
  tryDeserializeKartGameplayMessage
} from "./gameplayMessage";
import type {
  RaceItemUseAction,
  RaceProgressSnapshot
} from "../race/raceSession";

function main(): void {
  validateTypedRoundTrips();
  validateMalformedPacketErrors();
  validateTypeSpecificPayloadLimits();
}

function validateTypedRoundTrips(): void {
  const input = createKartInputSnapshot({
    peerId: "guest-peer",
    racerId: "human_guest-peer",
    sequence: 12,
    tickIndex: 144,
    elapsedSeconds: 2.4,
    capturedAt: 12000,
    sentAt: 12008,
    input: {
      throttle: 1,
      brake: 0,
      steer: -0.25,
      drift: true,
      useItem: false
    }
  });
  const inputPayload = serializeKartGameplayMessage(input);
  const parsedInput = deserializeKartGameplayMessageAs(
    inputPayload,
    KART_GAMEPLAY_MESSAGE_TYPES.INPUT_SNAPSHOT
  );

  assertEqual(parsedInput.input.steer, -0.25, "typed input helper preserves input");
  assertEqual(
    parsedInput.sentAt,
    12008,
    "typed input helper preserves local send timestamp"
  );
  assertEqual(
    getKartGameplayPayloadType(inputPayload),
    KART_GAMEPLAY_MESSAGE_TYPES.INPUT_SNAPSHOT,
    "type peek reads input snapshot envelope"
  );

  const remoteInputDelta = createKartRemoteInputDeltaPacket({
    peerId: "guest-peer",
    racerId: "human_guest-peer",
    sequence: 13,
    timestamp: 12016,
    sentAt: 12024,
    tickIndex: 145,
    elapsedSeconds: 2.416,
    delta: {
      steer: 0.5,
      useItem: true
    }
  });
  const remoteInputDeltaPayload = serializeKartGameplayMessage(remoteInputDelta);
  const parsedRemoteInputDelta = deserializeKartGameplayMessageAs(
    remoteInputDeltaPayload,
    KART_GAMEPLAY_MESSAGE_TYPES.REMOTE_INPUT_DELTA
  );

  assertEqual(
    parsedRemoteInputDelta.timestamp,
    12016,
    "remote input delta timestamp round trips through generic codec"
  );
  assertEqual(
    parsedRemoteInputDelta.sentAt,
    12024,
    "remote input delta local send timestamp round trips through generic codec"
  );
  assertEqual(
    parsedRemoteInputDelta.sequence,
    13,
    "remote input delta sequence round trips through generic codec"
  );
  assertEqual(
    getKartGameplayPayloadType(remoteInputDeltaPayload),
    KART_GAMEPLAY_MESSAGE_TYPES.REMOTE_INPUT_DELTA,
    "type peek reads remote input delta envelope"
  );

  const transform = createKartTransformSnapshot({
    hostPeerId: "host-peer",
    sequence: 3,
    tickIndex: 180,
    elapsedSeconds: 3,
    capturedAt: 13000,
    racers: [createRacerTransform()]
  });
  const parsedTransform = deserializeKartGameplayMessage(
    serializeKartGameplayMessage(transform)
  );

  assert(
    isKartGameplayMessageOfType(
      parsedTransform,
      KART_GAMEPLAY_MESSAGE_TYPES.TRANSFORM_SNAPSHOT
    ),
    "typed guard narrows transform packets"
  );
  assertEqual(
    parsedTransform.racers[0]?.racerId,
    "human_host-peer",
    "transform payload round trips through generic codec"
  );

  const ownedTransform = createKartOwnedTransformSnapshot({
    peerId: "host-peer",
    racerId: "human_host-peer",
    sequence: 4,
    tickIndex: 181,
    elapsedSeconds: 3.02,
    capturedAt: 13016,
    transform: createRacerTransform()
  });
  const parsedOwnedTransform = deserializeKartGameplayMessageAs(
    serializeKartGameplayMessage(ownedTransform),
    KART_GAMEPLAY_MESSAGE_TYPES.OWNED_TRANSFORM_SNAPSHOT
  );

  assertEqual(
    parsedOwnedTransform.transform.racerId,
    "human_host-peer",
    "owned transform payload round trips through generic codec"
  );

  const authoritativePlayer = createKartAuthoritativePlayerSnapshot({
    hostPeerId: "host-peer",
    peerId: "guest-peer",
    racerId: "human_guest-peer",
    sequence: 5,
    hostTick: {
      tickIndex: 182,
      elapsedSeconds: 3.04
    },
    acknowledgedPeerInputSequence: 13,
    capturedAt: 13048,
    playerState: {
      peerId: "guest-peer",
      racerId: "human_guest-peer",
      slotIndex: 1,
      displayName: "Guest",
      controller: "human",
      progress: {
        ...createRaceProgressSnapshot(),
        racerId: "human_guest-peer",
        slotIndex: 1,
        displayName: "Guest"
      },
      transform: {
        ...createRacerTransform(),
        racerId: "human_guest-peer",
        slotIndex: 1
      }
    }
  });
  const parsedAuthoritativePlayer = deserializeKartGameplayMessageAs(
    serializeKartGameplayMessage(authoritativePlayer),
    KART_GAMEPLAY_MESSAGE_TYPES.AUTHORITATIVE_PLAYER_SNAPSHOT
  );

  assertEqual(
    parsedAuthoritativePlayer.hostTick.tickIndex,
    182,
    "authoritative player host tick round trips through generic codec"
  );
  assertEqual(
    parsedAuthoritativePlayer.acknowledgedPeerInputSequence,
    13,
    "authoritative player input acknowledgement round trips through generic codec"
  );

  const bananaSpawn = createKartBananaSpawnEventMessage({
    eventId: "banana-spawn-1",
    bananaId: "banana-1",
    ownerPlayerId: "host-peer",
    ownerRacerId: "human_host-peer",
    ownerSlotIndex: 0,
    tickIndex: 181,
    elapsedSeconds: 3.02,
    occurredAt: 13016,
    position: { x: 1, y: 0, z: 2 },
    velocity: { x: 0, y: 0, z: -1 },
    radius: 0.5,
    armedSeconds: 0.2,
    ttlSeconds: 9,
    ageSeconds: 0,
    orientationRadians: 0.75
  });
  const bananaPayload = serializeKartGameplayMessage(bananaSpawn);
  const parsedBanana = tryDeserializeKartGameplayMessage(bananaPayload);

  assert(parsedBanana.ok, "banana spawn payload is accepted by generic codec");
  assertEqual(
    parsedBanana.type,
    KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT,
    "banana spawn type is retained"
  );
  assert(isKartGameplayMessagePayload(bananaPayload), "valid gameplay payload guard");

  const itemUse = createKartItemUseEventMessageFromRaceAction({
    hostPeerId: "host-peer",
    sequence: 4,
    action: createRaceItemUseAction(),
    occurredAt: 13032
  });
  const itemUsePayload = serializeKartGameplayMessage(itemUse);
  const parsedItemUse = deserializeKartGameplayMessageAs(
    itemUsePayload,
    KART_GAMEPLAY_MESSAGE_TYPES.ITEM_USE_EVENT
  );

  assertEqual(
    parsedItemUse.activeItemId,
    "shell-1",
    "item-use payload round trips through generic codec"
  );

  const itemCollisionOutcome = createKartItemCollisionOutcomeEventMessage({
    eventId: "shell-hit-1",
    hostPeerId: "host-peer",
    sourceClientId: "host-peer",
    sequence: 5,
    itemId: "shell-1",
    itemType: "shell",
    collisionType: KART_ITEM_COLLISION_OUTCOME_TYPES.SHELL_HIT,
    sourceRacerId: "human_host-peer",
    sourceSlotIndex: 0,
    victimKartId: "human_guest-peer",
    victimSlotIndex: 1,
    tickIndex: 182,
    elapsedSeconds: 3.04,
    occurredAt: 13048,
    impact: {
      position: { x: 2, y: 0.3, z: 4 },
      normal: { x: -1, y: 0, z: 0 },
      itemPosition: { x: 1.8, y: 0.25, z: 4 },
      itemVelocity: { x: 15, y: 0, z: 0 },
      itemRadius: 0.42,
      victimHitboxCenter: { x: 2.2, y: 0.5, z: 4 },
      penetrationDepth: 0.08,
      relativeSpeed: 16
    },
    effect: {
      itemType: "shell",
      stunSeconds: 0.35,
      spinoutSeconds: 1.15,
      spinoutAngularVelocity: 7.5,
      hitImmunitySeconds: 1,
      hitFeedbackSeconds: 0.4,
      speedFactor: 0.35,
      speedBeforeHit: 18,
      speedAfterHit: 6.3,
      headingDeltaRadians: 1.25,
      blockedByShield: false,
      shieldSecondsBeforeHit: 0,
      shieldSecondsAfterHit: 0
    },
    itemConsumption: {
      activeState: "removed",
      consumed: true,
      despawned: true,
      reason: "collision",
      collisionEventId: "shell-hit-1",
      consumedByRacerId: "human_guest-peer",
      consumedBySlotIndex: 1,
      removedAtTickIndex: 182,
      removedAtElapsedSeconds: 3.04
    }
  });
  const parsedItemCollisionOutcome = deserializeKartGameplayMessageAs(
    serializeKartGameplayMessage(itemCollisionOutcome),
    KART_GAMEPLAY_MESSAGE_TYPES.ITEM_COLLISION_OUTCOME_EVENT
  );

  assertEqual(
    parsedItemCollisionOutcome.itemId,
    "shell-1",
    "item collision outcome payload round trips through generic codec"
  );
  assertEqual(
    parsedItemCollisionOutcome.victimKartId,
    "human_guest-peer",
    "item collision outcome victim kart id round trips"
  );

  const effectEvent = createKartBoostStartEffectEventMessage({
    effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START,
    eventId: "boost-start-1",
    hostPeerId: "host-peer",
    sequence: 6,
    tickIndex: 183,
    elapsedSeconds: 3.06,
    occurredAt: 13064,
    sentAt: 13072,
    itemType: "boost",
    effectId: "boost-human-host-1",
    racer: {
      playerId: "host-peer",
      racerId: "human_host-peer",
      slotIndex: 0
    },
    durationSeconds: 1.15,
    expiresAtElapsedSeconds: 4.21
  });
  const parsedEffect = deserializeKartGameplayMessageAs(
    serializeKartGameplayMessage(effectEvent),
    KART_GAMEPLAY_MESSAGE_TYPES.EFFECT_EVENT
  );

  assertEqual(
    parsedEffect.effectEventKind,
    KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START,
    "effect-event payload round trips through generic codec"
  );
  assertEqual(
    parsedEffect.sentAt,
    13072,
    "effect-event send timestamp round trips through generic codec"
  );

  const raceState = createKartRaceStateSnapshot({
    hostPeerId: "host-peer",
    sequence: 5,
    tickIndex: 182,
    elapsedSeconds: 3.04,
    capturedAt: 13048,
    phase: "running",
    lapCount: 3,
    racers: [createRaceProgressSnapshot()]
  });
  const parsedRaceState = deserializeKartGameplayMessage(
    serializeKartGameplayMessage(raceState)
  );

  assert(
    isKartGameplayMessageOfType(
      parsedRaceState,
      KART_GAMEPLAY_MESSAGE_TYPES.RACE_STATE_SNAPSHOT
    ),
    "typed guard narrows race-state packets"
  );
  assertEqual(
    parsedRaceState.racers[0]?.rank,
    1,
    "race-state payload round trips through generic codec"
  );

  const dispatchedTypes: string[] = [];
  const effectDispatchResult = dispatchKartGameplayMessage(parsedEffect, {
    onEffectEvent: (message) => {
      dispatchedTypes.push(`${message.type}:${message.effectEventKind}`);
    }
  });

  assert(effectDispatchResult.dispatched, "dispatcher routes effect-event packets");
  assertEqual(
    dispatchedTypes[0],
    "effect-event:boost-start",
    "dispatcher invokes typed effect-event handler"
  );

  const dispatchResult = dispatchKartGameplayMessage(parsedRaceState, {
    onRaceStateSnapshot: (message) => {
      dispatchedTypes.push(`${message.type}:${message.hostPeerId}`);
    }
  });

  assert(dispatchResult.dispatched, "dispatcher routes race-state packets");
  assertEqual(
    dispatchedTypes[1],
    "race-state-snapshot:host-peer",
    "dispatcher invokes typed race-state handler"
  );

  const remoteInputDeltaDispatchResult = dispatchKartGameplayMessage(
    parsedRemoteInputDelta,
    {
      onRemoteInputDelta: (message) => {
        dispatchedTypes.push(`${message.type}:${message.sequence}`);
      }
    }
  );

  assert(
    remoteInputDeltaDispatchResult.dispatched,
    "dispatcher routes remote input delta packets"
  );
  assertEqual(
    dispatchedTypes[2],
    "remote-input-delta:13",
    "dispatcher invokes typed remote input delta handler"
  );

  const authoritativePlayerDispatchResult = dispatchKartGameplayMessage(
    parsedAuthoritativePlayer,
    {
      onAuthoritativePlayerSnapshot: (message) => {
        dispatchedTypes.push(
          `${message.type}:${message.acknowledgedPeerInputSequence}`
        );
      }
    }
  );

  assert(
    authoritativePlayerDispatchResult.dispatched,
    "dispatcher routes authoritative player packets"
  );
  assertEqual(
    dispatchedTypes[3],
    "authoritative-player-snapshot:13",
    "dispatcher invokes typed authoritative player handler"
  );

  const itemCollisionOutcomeDispatchResult = dispatchKartGameplayMessage(
    parsedItemCollisionOutcome,
    {
      onItemCollisionOutcomeEvent: (message) => {
        dispatchedTypes.push(`${message.type}:${message.collisionType}`);
      }
    }
  );

  assert(
    itemCollisionOutcomeDispatchResult.dispatched,
    "dispatcher routes item collision outcome packets"
  );
  assertEqual(
    dispatchedTypes[4],
    "item-collision-outcome-event:shell-hit",
    "dispatcher invokes typed item collision outcome handler"
  );
}

function validateMalformedPacketErrors(): void {
  const nonString = tryDeserializeKartGameplayMessage(new ArrayBuffer(8));

  assert(!nonString.ok, "binary data-channel payloads are rejected");
  assertEqual(nonString.reason, "non-string-payload", "binary rejection reason");

  const invalidJson = tryDeserializeKartGameplayMessage("{");

  assert(!invalidJson.ok, "invalid JSON is rejected");
  assertEqual(invalidJson.reason, "invalid-json", "invalid JSON reason");
  assertThrows(
    () => deserializeKartGameplayMessage("{"),
    "throwing deserializer reports malformed JSON"
  );

  const wrongProtocol = tryDeserializeKartGameplayMessage(
    JSON.stringify({
      protocol: "wrong",
      version: KART_GAMEPLAY_VERSION,
      type: KART_GAMEPLAY_MESSAGE_TYPES.INPUT_SNAPSHOT
    })
  );

  assert(!wrongProtocol.ok, "wrong protocol is rejected");
  assertEqual(wrongProtocol.reason, "invalid-envelope", "wrong protocol reason");

  const unknownType = tryDeserializeKartGameplayMessage(
    JSON.stringify({
      protocol: KART_GAMEPLAY_PROTOCOL,
      version: KART_GAMEPLAY_VERSION,
      type: "kart-chat"
    })
  );

  assert(!unknownType.ok, "unknown gameplay packet type is rejected");
  assertEqual(unknownType.reason, "unknown-type", "unknown type reason");
  assertEqual(
    getKartGameplayPayloadType(
      JSON.stringify({
        protocol: KART_GAMEPLAY_PROTOCOL,
        version: KART_GAMEPLAY_VERSION,
        type: "kart-chat"
      })
    ),
    null,
    "unknown type does not pass type peek"
  );

  const malformedInput = tryDeserializeKartGameplayMessage(
    JSON.stringify({
      protocol: KART_GAMEPLAY_PROTOCOL,
      version: KART_GAMEPLAY_VERSION,
      type: KART_GAMEPLAY_MESSAGE_TYPES.INPUT_SNAPSHOT,
      peerId: "",
      racerId: "human_guest-peer",
      sequence: 1,
      tickIndex: 1,
      elapsedSeconds: 0,
      capturedAt: 1,
      input: {
        throttle: 1,
        brake: 0,
        steer: 0,
        drift: false,
        useItem: false
      }
    })
  );

  assert(!malformedInput.ok, "malformed known message is rejected");
  assertEqual(
    malformedInput.reason,
    "invalid-message",
    "malformed known message reason"
  );
  assertEqual(
    malformedInput.type,
    KART_GAMEPLAY_MESSAGE_TYPES.INPUT_SNAPSHOT,
    "malformed known message reports packet type"
  );

  const malformedRaceState = tryDeserializeKartGameplayMessage(
    JSON.stringify({
      protocol: KART_GAMEPLAY_PROTOCOL,
      version: KART_GAMEPLAY_VERSION,
      type: KART_GAMEPLAY_MESSAGE_TYPES.RACE_STATE_SNAPSHOT,
      hostPeerId: "host-peer",
      sequence: 1,
      tickIndex: 1,
      elapsedSeconds: 0,
      capturedAt: 1,
      phase: "running",
      lapCount: 3,
      racers: [
        {
          ...createRaceProgressSnapshot(),
          checkpointIndex: createRaceProgressSnapshot().checkpointCount
        }
      ]
    })
  );

  assert(!malformedRaceState.ok, "malformed race-state snapshot is rejected");
  assertEqual(
    malformedRaceState.reason,
    "invalid-message",
    "malformed race-state reason"
  );

  assertThrows(
    () =>
      deserializeKartGameplayMessageAs(
        serializeKartGameplayMessage(createKartInputSnapshot({
          peerId: "guest-peer",
          racerId: "human_guest-peer",
          sequence: 13,
          tickIndex: 145,
          elapsedSeconds: 2.42,
          capturedAt: 12016,
          input: {
            throttle: 1,
            brake: 0,
            steer: 0,
            drift: false,
            useItem: true
          }
        })),
        KART_GAMEPLAY_MESSAGE_TYPES.TRANSFORM_SNAPSHOT
      ),
    "typed deserializer rejects mismatched expected types"
  );
}

function validateTypeSpecificPayloadLimits(): void {
  const oversizedBanana = tryDeserializeKartGameplayMessage(
    JSON.stringify({
      protocol: KART_GAMEPLAY_PROTOCOL,
      version: KART_GAMEPLAY_VERSION,
      type: KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT,
      padding: "x".repeat(MAX_GAMEPLAY_MESSAGE_PAYLOAD_BYTES - 256),
      eventId: "banana-spawn-big",
      bananaId: "banana-big",
      ownerPlayerId: "host-peer",
      ownerRacerId: "human_host-peer",
      ownerSlotIndex: 0,
      tickIndex: 1,
      elapsedSeconds: 0,
      occurredAt: 1,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      radius: 0.5,
      armedSeconds: 0,
      ttlSeconds: 9,
      ageSeconds: 0,
      orientationRadians: 0
    })
  );

  assert(!oversizedBanana.ok, "banana packets enforce their own size budget");
  assertEqual(
    oversizedBanana.reason,
    "payload-too-large",
    "oversized banana packet reason"
  );

  const strictLimit = tryDeserializeKartGameplayMessage(
    serializeKartGameplayMessage(createKartInputSnapshot({
      peerId: "guest-peer",
      racerId: "human_guest-peer",
      sequence: 14,
      tickIndex: 146,
      elapsedSeconds: 2.44,
      capturedAt: 12032,
      input: {
        throttle: 0.5,
        brake: 0,
        steer: 0.1,
        drift: false,
        useItem: false
      }
    })),
    { maxPayloadBytes: 8 }
  );

  assert(!strictLimit.ok, "caller supplied size limits are enforced first");
  assertEqual(strictLimit.reason, "payload-too-large", "strict limit reason");
}

function createRacerTransform(): KartRacerTransform {
  return {
    racerId: "human_host-peer",
    slotIndex: 0,
    position: { x: 4, y: 0, z: 6 },
    velocity: { x: 0, y: 0, z: 12 },
    forward: { x: 0, y: 0, z: 1 },
    headingRadians: 0,
    speed: 12,
    heldItem: null,
    boostSeconds: 0,
    shieldSeconds: 0,
    stunSeconds: 0,
    spinoutSeconds: 0,
    spinoutAngularVelocity: 0,
    itemHitImmunitySeconds: 0,
    hitFeedbackSeconds: 0,
    lastHitItemType: null,
    itemUseCooldownSeconds: 0,
    updateCount: 1
  };
}

function createRaceItemUseAction(): RaceItemUseAction {
  return {
    actionId: "shell-use-1",
    action: "shell-use",
    racerId: "human_host-peer",
    itemType: "shell",
    tickIndex: 181,
    elapsedSeconds: 3.02,
    activeItemId: "shell-1",
    candidateAffectedRacerIds: ["human_guest-peer", "ai_rival"],
    candidateAffectedRacerIdsByKind: {
      localPlayerRacerIds: [],
      remotePlayerRacerIds: ["human_guest-peer"],
      aiOpponentRacerIds: ["ai_rival"]
    },
    targetResolution: {
      sourceRacerId: "human_host-peer",
      itemType: "shell",
      activeItemId: "shell-1",
      candidateAffectedRacerIds: ["human_guest-peer", "ai_rival"],
      candidateAffectedRacerIdsByKind: {
        localPlayerRacerIds: [],
        remotePlayerRacerIds: ["human_guest-peer"],
        aiOpponentRacerIds: ["ai_rival"]
      }
    }
  };
}

function createRaceProgressSnapshot(): RaceProgressSnapshot {
  return {
    racerId: "human_host-peer",
    slotIndex: 0,
    displayName: "Host",
    controller: "human",
    rank: 1,
    lap: 1,
    lapCount: 3,
    checkpointIndex: 2,
    checkpointCount: 8,
    trackProgress: 42,
    trackLength: 120,
    completedDistance: 162,
    totalDistance: 360,
    currentLapProgressRatio: 0.35,
    completionRatio: 0.45,
    finished: false,
    finishPlace: null,
    finishTimeSeconds: null
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

function assertThrows(action: () => void, message: string): void {
  try {
    action();
  } catch {
    return;
  }

  throw new Error(message);
}

main();
