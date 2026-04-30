import {
  KART_MULTIPLAYER_EFFECT_EVENT_KINDS,
  LocalKartMultiplayerEffectEventEmitter,
  RemoteKartMultiplayerEffectEventBuffer,
  createKartBananaDropEffectEventMessage,
  createKartBananaHitEffectEventMessage,
  createKartBoostEndEffectEventMessage,
  createKartBoostStartEffectEventMessage,
  createKartShellHitEffectEventMessage,
  createKartShellLaunchEffectEventMessage,
  createKartSpinoutEndEffectEventMessage,
  createKartSpinoutStartEffectEventMessage,
  deserializeKartMultiplayerEffectEventMessage,
  isKartMultiplayerEffectEventKind,
  isKartMultiplayerEffectEventMessagePayload,
  serializeKartMultiplayerEffectEventMessage,
  type KartEffectHitEffectSnapshot,
  type KartEffectImpactSnapshot,
  type KartEffectParticipantSnapshot,
  type KartMultiplayerEffectEventKind,
  type KartMultiplayerEffectEventMessage
} from "./kartEffectEventMessage";
import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  KART_GAMEPLAY_PROTOCOL,
  KART_GAMEPLAY_VERSION
} from "./kartInputSnapshot";
import {
  createRaceSessionFromStartRoster,
  type RaceSession
} from "../race/raceSession";
import { createRaceStartRoster } from "../race/raceStartRoster";

function main(): void {
  const events = createAllEffectEvents();
  const emitterResult = validateLocalEffectEventEmitter();

  validateEffectEventRoundTrips(events);
  validateRequiredIdentifiers(events);
  validateRemoteEffectEventBuffer(events);
  validateRemoteEffectEventsApplyToRaceState();
  validateMalformedEffectEvents();

  console.info(
    "effectEventSchemas=ok",
    `eventKinds=${events.length}`,
    `emitted=${emitterResult.emittedCount}`,
    `emittedSequences=${emitterResult.sequences.join(",")}`,
    `messageType=${KART_GAMEPLAY_MESSAGE_TYPES.EFFECT_EVENT}`
  );
}

function validateRemoteEffectEventsApplyToRaceState(): void {
  const raceSession = createMultiplayerRaceSession();
  const host = requireRacer(raceSession, "human_1");
  const guest = requireRacer(raceSession, "human_2");
  const ai = requireRacer(raceSession, "ai_1");
  const boostStart = createKartBoostStartEffectEventMessage({
    ...createRaceBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START, 0),
    itemType: "boost",
    effectId: "remote-boost-human-1",
    racer: raceHostParticipant(),
    durationSeconds: 1.15,
    expiresAtElapsedSeconds: 1.15
  });
  const boostEnd = createKartBoostEndEffectEventMessage({
    ...createRaceBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_END, 1),
    itemType: "boost",
    effectId: boostStart.effectId,
    racer: raceHostParticipant(),
    reason: "duration-expired"
  });
  const shellHit = createKartShellHitEffectEventMessage({
    ...createRaceBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_HIT, 2),
    itemType: "shell",
    shellId: "remote-shell-1",
    source: raceHostParticipant(),
    target: raceGuestParticipant(),
    impact: impactSnapshot("shell"),
    effect: hitEffect("shell")
  });
  const bananaDrop = createKartBananaDropEffectEventMessage({
    ...createRaceBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_DROP, 3),
    itemType: "banana",
    bananaId: "remote-banana-1",
    owner: raceGuestParticipant(),
    position: { x: -3, y: 0.2, z: 8 },
    velocity: { x: 0, y: 0, z: -1 },
    radius: 0.42,
    armedSeconds: 0.1,
    ttlSeconds: 9,
    ageSeconds: 0,
    orientationRadians: 0.2
  });
  const bananaHit = createKartBananaHitEffectEventMessage({
    ...createRaceBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_HIT, 4),
    itemType: "banana",
    bananaId: bananaDrop.bananaId,
    source: raceGuestParticipant(),
    target: raceAiParticipant(),
    impact: impactSnapshot("banana"),
    effect: hitEffect("banana")
  });
  const spinoutStart = createKartSpinoutStartEffectEventMessage({
    ...createRaceBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_START, 5),
    spinoutId: "remote-spinout-ai-1",
    target: raceAiParticipant(),
    source: raceHostParticipant(),
    sourceItemType: "shell",
    sourceObjectId: shellHit.shellId,
    durationSeconds: 1.25,
    expiresAtElapsedSeconds: 1.25,
    angularVelocity: 7.5
  });
  const spinoutEnd = createKartSpinoutEndEffectEventMessage({
    ...createRaceBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_END, 6),
    spinoutId: spinoutStart.spinoutId,
    target: raceAiParticipant(),
    source: raceHostParticipant(),
    sourceItemType: "shell",
    sourceObjectId: shellHit.shellId,
    reason: "duration-expired"
  });

  assert(
    raceSession.applyBoostActivationEvent({
      eventId: boostStart.effectId,
      racerId: boostStart.racer.racerId,
      tickIndex: boostStart.tickIndex,
      elapsedSeconds: boostStart.elapsedSeconds,
      durationSeconds: boostStart.durationSeconds,
      expiresAtElapsedSeconds: boostStart.expiresAtElapsedSeconds,
      cooldownSeconds: 0
    }),
    "remote boost-start effect applies to race state"
  );
  assert(host.boostSeconds > 0, "remote boost-start makes the racer boost");
  assert(
    raceSession.applyBoostEffectEndEvent({
      eventId: boostEnd.eventId,
      boostActivationEventId: boostEnd.effectId,
      racerId: boostEnd.racer.racerId,
      tickIndex: boostEnd.tickIndex,
      elapsedSeconds: boostEnd.elapsedSeconds
    }),
    "remote boost-end effect applies to race state"
  );
  assertEqual(host.boostSeconds, 0, "remote boost-end clears the boost timer");
  assert(
    raceSession.applyBoostActivationEvent({
      eventId: "remote-boost-human-2",
      racerId: boostStart.racer.racerId,
      tickIndex: boostStart.tickIndex + 1,
      elapsedSeconds: boostStart.elapsedSeconds,
      durationSeconds: boostStart.durationSeconds,
      expiresAtElapsedSeconds: boostStart.expiresAtElapsedSeconds,
      cooldownSeconds: 0
    }),
    "second remote boost-start applies to race state"
  );
  assert(
    !raceSession.applyBoostEffectEndEvent({
      eventId: "remote-stale-boost-end",
      boostActivationEventId: boostStart.effectId,
      racerId: boostEnd.racer.racerId,
      tickIndex: boostEnd.tickIndex + 1,
      elapsedSeconds: boostEnd.elapsedSeconds
    }),
    "stale remote boost-end does not clear a newer boost"
  );
  assert(host.boostSeconds > 0, "newer boost survives stale boost-end");

  assert(
    raceSession.applyShellHitEvent({
      eventId: shellHit.eventId,
      itemType: "shell",
      shellId: shellHit.shellId,
      sourceRacerId: shellHit.source.racerId,
      sourceSlotIndex: shellHit.source.slotIndex,
      targetRacerId: shellHit.target.racerId,
      targetSlotIndex: shellHit.target.slotIndex,
      tickIndex: shellHit.tickIndex,
      elapsedSeconds: shellHit.elapsedSeconds,
      impact: {
        position: shellHit.impact.position,
        normal: shellHit.impact.normal,
        shellPosition: shellHit.impact.objectPosition,
        shellVelocity: shellHit.impact.objectVelocity,
        shellRadius: shellHit.impact.objectRadius,
        targetHitboxCenter: shellHit.impact.targetHitboxCenter,
        penetrationDepth: shellHit.impact.penetrationDepth,
        relativeSpeed: shellHit.impact.relativeSpeed
      },
      effect: shellHit.effect
    }),
    "remote shell-hit effect applies to race state"
  );
  assert(
    guest.spinoutSeconds > 0 && guest.lastHitItemType === "shell",
    "remote shell-hit starts visible shell spinout state"
  );

  assert(
    raceSession.applyBananaSpawnEvent({
      eventId: bananaDrop.eventId,
      itemType: "banana",
      bananaId: bananaDrop.bananaId,
      ownerRacerId: bananaDrop.owner.racerId,
      ownerSlotIndex: bananaDrop.owner.slotIndex,
      tickIndex: bananaDrop.tickIndex,
      elapsedSeconds: bananaDrop.elapsedSeconds,
      position: bananaDrop.position,
      velocity: bananaDrop.velocity,
      radius: bananaDrop.radius,
      armedSeconds: bananaDrop.armedSeconds,
      ttlSeconds: bananaDrop.ttlSeconds,
      ageSeconds: bananaDrop.ageSeconds,
      orientationRadians: bananaDrop.orientationRadians
    }),
    "remote banana-drop effect applies to race state"
  );
  assertEqual(
    raceSession.bananaObstacleStates[0]?.id,
    bananaDrop.bananaId,
    "remote banana-drop creates the persistent hazard"
  );

  assert(
    raceSession.applyBananaHitEvent({
      eventId: bananaHit.eventId,
      itemType: "banana",
      bananaId: bananaHit.bananaId,
      sourceRacerId: bananaHit.source.racerId,
      sourceSlotIndex: bananaHit.source.slotIndex,
      targetRacerId: bananaHit.target.racerId,
      targetSlotIndex: bananaHit.target.slotIndex,
      tickIndex: bananaHit.tickIndex,
      elapsedSeconds: bananaHit.elapsedSeconds,
      impact: {
        position: bananaHit.impact.position,
        normal: bananaHit.impact.normal,
        shellPosition: bananaHit.impact.objectPosition,
        shellVelocity: bananaHit.impact.objectVelocity,
        shellRadius: bananaHit.impact.objectRadius,
        targetHitboxCenter: bananaHit.impact.targetHitboxCenter,
        penetrationDepth: bananaHit.impact.penetrationDepth,
        relativeSpeed: bananaHit.impact.relativeSpeed
      },
      effect: bananaHit.effect
    }),
    "remote banana-hit effect applies to race state"
  );
  assertEqual(
    raceSession.bananaObstacleStates.length,
    0,
    "remote banana-hit consumes the persistent hazard"
  );
  assert(
    ai.spinoutSeconds > 0 && ai.lastHitItemType === "banana",
    "remote banana-hit starts visible banana spinout state"
  );

  raceSession.applySpinoutEffectEndEvent({
    eventId: "remote-banana-spinout-clear",
    spinoutId: "remote-banana-spinout",
    targetRacerId: ai.id,
    tickIndex: 8,
    elapsedSeconds: 0
  });
  assert(
    raceSession.applySpinoutEffectStartEvent({
      eventId: spinoutStart.eventId,
      spinoutId: spinoutStart.spinoutId,
      targetRacerId: spinoutStart.target.racerId,
      sourceItemType: spinoutStart.sourceItemType,
      tickIndex: spinoutStart.tickIndex,
      elapsedSeconds: spinoutStart.elapsedSeconds,
      durationSeconds: spinoutStart.durationSeconds,
      expiresAtElapsedSeconds: spinoutStart.expiresAtElapsedSeconds,
      spinoutAngularVelocity: spinoutStart.angularVelocity
    }),
    "remote spinout-start effect applies to race state"
  );
  assertEqual(
    ai.spinoutAngularVelocity,
    spinoutStart.angularVelocity,
    "remote spinout-start preserves authoritative angular velocity"
  );
  assert(
    !raceSession.applySpinoutEffectEndEvent({
      eventId: "remote-stale-spinout-end",
      spinoutId: "older-spinout",
      targetRacerId: spinoutEnd.target.racerId,
      tickIndex: spinoutEnd.tickIndex,
      elapsedSeconds: spinoutEnd.elapsedSeconds
    }),
    "stale remote spinout-end does not clear a newer spinout"
  );
  assertEqual(
    ai.spinoutAngularVelocity,
    spinoutStart.angularVelocity,
    "newer spinout survives stale spinout-end"
  );
  assert(
    raceSession.applySpinoutEffectEndEvent({
      eventId: spinoutEnd.eventId,
      spinoutId: spinoutEnd.spinoutId,
      targetRacerId: spinoutEnd.target.racerId,
      tickIndex: spinoutEnd.tickIndex,
      elapsedSeconds: spinoutEnd.elapsedSeconds
    }),
    "remote spinout-end effect applies to race state"
  );
  assertEqual(ai.spinoutSeconds, 0, "remote spinout-end clears spinout timer");
  assertEqual(
    ai.spinoutAngularVelocity,
    0,
    "remote spinout-end clears spinout angular velocity"
  );
}

function validateLocalEffectEventEmitter(): {
  readonly emittedCount: number;
  readonly sequences: readonly number[];
} {
  const emittedMessages: KartMultiplayerEffectEventMessage[] = [];
  const emittedPayloads: string[] = [];
  const emitter = new LocalKartMultiplayerEffectEventEmitter({
    hostPeerId: "host-peer",
    now: () => 1234,
    send: (payload, message) => {
      emittedPayloads.push(payload);
      emittedMessages.push(message);
      return true;
    }
  });

  const boostStart = emitter.emit({
    effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START,
    eventId: "effect-boost-start",
    tickIndex: 4,
    elapsedSeconds: 0.2,
    itemType: "boost",
    effectId: "boost-human-host-1",
    racer: hostParticipant(),
    durationSeconds: 1.15,
    expiresAtElapsedSeconds: 1.35
  });
  const shellLaunch = emitter.emit({
    effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_LAUNCH,
    eventId: "effect-shell-launch",
    tickIndex: 5,
    elapsedSeconds: 0.25,
    itemType: "shell",
    shellId: "shell-human-host-1",
    source: hostParticipant(),
    position: { x: 0, y: 0.4, z: 1 },
    velocity: { x: 0, y: 0, z: 42 },
    radius: 0.9,
    armedSeconds: 0.12,
    ttlSeconds: 2.6
  });

  assert(boostStart !== null, "boost-start effect event emitter sends");
  assert(shellLaunch !== null, "shell-launch effect event emitter sends");
  assertEqual(emittedMessages.length, 2, "effect emitter sends every event");
  assertEqual(emittedMessages[0]?.sequence, 0, "first effect sequence starts at zero");
  assertEqual(emittedMessages[1]?.sequence, 1, "effect sequence increments");
  assertEqual(
    emittedMessages[0]?.hostPeerId,
    "host-peer",
    "effect emitter stamps host peer"
  );
  assertEqual(
    emittedMessages[0]?.occurredAt,
    1234,
    "effect emitter stamps occurrence timestamp"
  );
  assertEqual(
    emittedMessages[0]?.sentAt,
    1234,
    "effect emitter stamps send timestamp"
  );

  for (const payload of emittedPayloads) {
    assert(
      isKartMultiplayerEffectEventMessagePayload(payload),
      "emitted effect payload is valid"
    );
  }

  return {
    emittedCount: emittedMessages.length,
    sequences: emittedMessages.map((message) => message.sequence)
  };
}

function validateEffectEventRoundTrips(
  events: readonly KartMultiplayerEffectEventMessage[]
): void {
  for (const event of events) {
    const payload = serializeKartMultiplayerEffectEventMessage(event);
    const parsed = deserializeKartMultiplayerEffectEventMessage(payload);

    assertEqual(parsed.type, KART_GAMEPLAY_MESSAGE_TYPES.EFFECT_EVENT, "message type");
    assertEqual(parsed.effectEventKind, event.effectEventKind, "effect kind");
    assertEqual(parsed.eventId, event.eventId, "event id");
    assertEqual(parsed.hostPeerId, "host-peer", "host peer id");
    assertEqual(parsed.sequence, event.sequence, "sequence id");
    assertEqual(parsed.tickIndex, event.tickIndex, "tick index");
    assertEqual(parsed.elapsedSeconds, event.elapsedSeconds, "elapsed seconds");
    assertEqual(parsed.occurredAt, event.occurredAt, "occurred timestamp");
    assertEqual(parsed.sentAt, event.sentAt, "send timestamp");
    assert(
      isKartMultiplayerEffectEventMessagePayload(payload),
      "serialized effect-event payload passes guard"
    );
  }
}

function validateRequiredIdentifiers(
  events: readonly KartMultiplayerEffectEventMessage[]
): void {
  const coveredKinds = new Set(events.map((event) => event.effectEventKind));

  for (const kind of Object.values(KART_MULTIPLAYER_EFFECT_EVENT_KINDS)) {
    assert(coveredKinds.has(kind), `effect-event kind is covered: ${kind}`);
    assert(isKartMultiplayerEffectEventKind(kind), `effect kind guard accepts ${kind}`);
  }

  for (const event of events) {
    assertNonEmpty(event.eventId, "eventId");
    assertNonEmpty(event.hostPeerId, "hostPeerId");
    assert(Number.isInteger(event.sequence), "effect event has sequence id");
    assert(event.occurredAt >= 0, "effect event has timestamp");
    assert(event.sentAt >= 0, "effect event has send timestamp");

    switch (event.effectEventKind) {
      case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START:
      case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_END:
        assertNonEmpty(event.effectId, "boost effect id");
        assertParticipant(event.racer, "boost racer");
        break;
      case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_LAUNCH:
        assertNonEmpty(event.shellId, "shell launch object id");
        assertParticipant(event.source, "shell launch source");
        break;
      case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_HIT:
        assertNonEmpty(event.shellId, "shell hit object id");
        assertParticipant(event.source, "shell hit source");
        assertParticipant(event.target, "shell hit target");
        assertEqual(event.effect.itemType, "shell", "shell hit effect type");
        break;
      case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_DROP:
        assertNonEmpty(event.bananaId, "banana drop object id");
        assertParticipant(event.owner, "banana drop owner");
        break;
      case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_HIT:
        assertNonEmpty(event.bananaId, "banana hit object id");
        assertParticipant(event.source, "banana hit source");
        assertParticipant(event.target, "banana hit target");
        assertEqual(event.effect.itemType, "banana", "banana hit effect type");
        break;
      case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_START:
        assertNonEmpty(event.spinoutId, "spinout start id");
        assertParticipant(event.target, "spinout start target");
        assertNonEmpty(event.sourceObjectId, "spinout start source object id");
        assert(event.durationSeconds > 0, "spinout start duration is present");
        break;
      case KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_END:
        assertNonEmpty(event.spinoutId, "spinout end id");
        assertParticipant(event.target, "spinout end target");
        assertNonEmpty(event.sourceObjectId, "spinout end source object id");
        assertEqual(event.reason, "duration-expired", "spinout end reason");
        break;
    }
  }
}

function validateRemoteEffectEventBuffer(
  events: readonly KartMultiplayerEffectEventMessage[]
): void {
  const buffer = new RemoteKartMultiplayerEffectEventBuffer({
    expectedHostPeerId: "host-peer",
    maxBufferedEvents: 3,
    reorderWindowSeconds: 0.05,
    lateEventToleranceSeconds: 0.1
  });
  const first = requireEvent(events, 0);
  const second = requireEvent(events, 1);
  const third = requireEvent(events, 2);

  const acceptedFirst = buffer.accept(
    serializeKartMultiplayerEffectEventMessage(first),
    1000,
    first.sentAt + 72
  );

  assert(
    acceptedFirst.accepted,
    "serialized effect event is accepted by the remote buffer"
  );

  if (!acceptedFirst.accepted) {
    throw new Error("first effect event should be accepted");
  }

  assertEqual(
    acceptedFirst.timing.sentAt,
    first.sentAt,
    "accepted effect timing preserves send timestamp"
  );
  assertEqual(
    acceptedFirst.timing.receivedAt,
    first.sentAt + 72,
    "accepted effect timing records receive timestamp"
  );
  assertEqual(
    acceptedFirst.timing.latencyMs,
    72,
    "accepted effect timing measures send-to-receive latency"
  );
  const firstDrain = buffer.drainReady(1000);

  assertEqual(
    firstDrain.events[0]?.sequence,
    0,
    "first effect event drains immediately when sequence starts at zero"
  );
  assertEqual(
    firstDrain.timings[0]?.latencyMs,
    72,
    "drained effect timing keeps per-event latency"
  );

  assert(
    buffer.accept(third, 1010, third.sentAt + 32).accepted,
    "out-of-order future effect accepts"
  );
  assertEqual(
    buffer.drainReady(1010).events.length,
    0,
    "out-of-order effect waits inside the reorder window"
  );
  assert(
    buffer.accept(second, 1020, second.sentAt + 48).accepted,
    "missing gap effect accepts"
  );
  const gapDrain = buffer.drainReady(1020);

  assertEqual(
    gapDrain.events.map((event) => event.sequence).join(","),
    "1,2",
    "effect events drain in sequence order after a gap is filled"
  );
  assertEqual(
    gapDrain.timings.map((timing) => timing.latencyMs).join(","),
    "48,32",
    "effect timings drain in event order"
  );

  const duplicateEvent = buffer.accept(second, 1030);

  if (duplicateEvent.accepted) {
    throw new Error("duplicate event should be rejected");
  }

  assertEqual(
    duplicateEvent.reason,
    "duplicate-event",
    "duplicate effect event ids are rejected"
  );

  const staleSequence = buffer.accept(
    createKartBoostEndEffectEventMessage({
      ...createBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_END, 1),
      eventId: "effect-event-stale-sequence",
      itemType: "boost",
      effectId: "boost-human-host-stale",
      racer: hostParticipant(),
      reason: "duration-expired"
    }),
    1040
  );

  if (staleSequence.accepted) {
    throw new Error("stale sequence should be rejected");
  }

  assertEqual(
    staleSequence.reason,
    "stale-sequence",
    "already dispatched sequence ids are rejected"
  );

  const lateEvent = buffer.accept(
    createKartBoostStartEffectEventMessage({
      ...createBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START, 8),
      eventId: "effect-event-late-timestamp",
      elapsedSeconds: 1,
      occurredAt: 1000,
      itemType: "boost",
      effectId: "boost-human-host-late",
      racer: hostParticipant(),
      durationSeconds: 1,
      expiresAtElapsedSeconds: 2
    }),
    1050
  );

  if (lateEvent.accepted) {
    throw new Error("late effect event should be rejected");
  }

  assertEqual(
    lateEvent.reason,
    "late-event",
    "old effect timestamps are rejected after newer effects dispatch"
  );

  const wrongHost = buffer.accept(
    createKartBoostStartEffectEventMessage({
      ...createBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START, 9),
      hostPeerId: "guest-peer",
      itemType: "boost",
      effectId: "boost-wrong-host",
      racer: hostParticipant(),
      durationSeconds: 1,
      expiresAtElapsedSeconds: 12
    }),
    1060
  );

  if (wrongHost.accepted) {
    throw new Error("wrong host effect event should be rejected");
  }

  assertEqual(
    wrongHost.reason,
    "unexpected-host",
    "effect buffer rejects events from unexpected hosts"
  );

  const gapBuffer = new RemoteKartMultiplayerEffectEventBuffer({
    expectedHostPeerId: "host-peer",
    reorderWindowSeconds: 0.05
  });

  assert(gapBuffer.accept(third, 2000).accepted, "future first packet accepts");
  assertEqual(
    gapBuffer.drainReady(2030).events.length,
    0,
    "future first packet waits until the reorder window expires"
  );
  assertEqual(
    gapBuffer.drainReady(2051).events[0]?.sequence,
    2,
    "missing lower sequence is skipped after the reorder window"
  );
}

function validateMalformedEffectEvents(): void {
  assertThrows(
    () => deserializeKartMultiplayerEffectEventMessage("{"),
    "invalid JSON effect-event payload is rejected"
  );

  assertThrows(
    () =>
      deserializeKartMultiplayerEffectEventMessage(
        JSON.stringify({
          ...createEnvelope("missing-sequence"),
          effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START,
          itemType: "boost",
          effectId: "boost-effect-1",
          racer: hostParticipant(),
          durationSeconds: 1,
          expiresAtElapsedSeconds: 2
        })
      ),
    "effect events require sequence ids"
  );

  assertThrows(
    () =>
      deserializeKartMultiplayerEffectEventMessage(
        JSON.stringify({
          ...createEnvelope("missing-player-id", 7),
          effectEventKind: KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START,
          itemType: "boost",
          effectId: "boost-effect-1",
          racer: {
            racerId: "human_host",
            slotIndex: 0
          },
          durationSeconds: 1,
          expiresAtElapsedSeconds: 2
        })
      ),
    "effect participants require player id fields"
  );

  assertThrows(
    () =>
      createKartBoostEndEffectEventMessage({
        ...createBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_END, 8),
        itemType: "boost",
        effectId: "boost-effect-1",
        racer: hostParticipant(),
        reason: "finished" as "duration-expired"
      }),
    "unsupported timed effect end reasons are rejected"
  );

  assertThrows(
    () =>
      createKartSpinoutStartEffectEventMessage({
        ...createBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_START, 9),
        spinoutId: "spinout-1",
        target: guestParticipant(),
        source: hostParticipant(),
        sourceItemType: "boost" as "shell",
        sourceObjectId: "boost-effect-1",
        durationSeconds: 1,
        expiresAtElapsedSeconds: 2,
        angularVelocity: 7
      }),
    "spinouts cannot use boost as their source item"
  );

  assert(
    !isKartMultiplayerEffectEventMessagePayload("not-json"),
    "payload guard rejects malformed effect packets"
  );
}

function createAllEffectEvents(): readonly KartMultiplayerEffectEventMessage[] {
  return [
    createKartBoostStartEffectEventMessage({
      ...createBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_START, 0),
      itemType: "boost",
      effectId: "boost-human-host-1",
      racer: hostParticipant(),
      durationSeconds: 1.15,
      expiresAtElapsedSeconds: 12.15
    }),
    createKartBoostEndEffectEventMessage({
      ...createBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BOOST_END, 1),
      itemType: "boost",
      effectId: "boost-human-host-1",
      racer: hostParticipant(),
      reason: "duration-expired"
    }),
    createKartShellLaunchEffectEventMessage({
      ...createBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_LAUNCH, 2),
      itemType: "shell",
      shellId: "shell-human-host-1",
      source: hostParticipant(),
      position: { x: 3, y: 0.4, z: 12 },
      velocity: { x: 0, y: 0, z: 28 },
      radius: 0.36,
      armedSeconds: 0.15,
      ttlSeconds: 4
    }),
    createKartShellHitEffectEventMessage({
      ...createBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_HIT, 3),
      itemType: "shell",
      shellId: "shell-human-host-1",
      source: hostParticipant(),
      target: guestParticipant(),
      impact: impactSnapshot("shell"),
      effect: hitEffect("shell")
    }),
    createKartBananaDropEffectEventMessage({
      ...createBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_DROP, 4),
      itemType: "banana",
      bananaId: "banana-human-guest-1",
      owner: guestParticipant(),
      position: { x: -2, y: 0.2, z: 8 },
      velocity: { x: 0, y: 0, z: -1 },
      radius: 0.42,
      armedSeconds: 0.1,
      ttlSeconds: 9,
      ageSeconds: 0,
      orientationRadians: 0.2
    }),
    createKartBananaHitEffectEventMessage({
      ...createBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_HIT, 5),
      itemType: "banana",
      bananaId: "banana-human-guest-1",
      source: guestParticipant(),
      target: aiParticipant(),
      impact: impactSnapshot("banana"),
      effect: hitEffect("banana")
    }),
    createKartSpinoutStartEffectEventMessage({
      ...createBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_START, 6),
      spinoutId: "spinout-ai-rival-shell-1",
      target: aiParticipant(),
      source: hostParticipant(),
      sourceItemType: "shell",
      sourceObjectId: "shell-human-host-1",
      durationSeconds: 1.35,
      expiresAtElapsedSeconds: 13.35,
      angularVelocity: 8.5
    }),
    createKartSpinoutEndEffectEventMessage({
      ...createBase(KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_END, 7),
      spinoutId: "spinout-ai-rival-shell-1",
      target: aiParticipant(),
      source: hostParticipant(),
      sourceItemType: "shell",
      sourceObjectId: "shell-human-host-1",
      reason: "duration-expired"
    })
  ];
}

function requireEvent(
  events: readonly KartMultiplayerEffectEventMessage[],
  sequence: number
): KartMultiplayerEffectEventMessage {
  const event = events.find((candidate) => candidate.sequence === sequence);

  if (event === undefined) {
    throw new Error(`Missing effect event sequence ${sequence}`);
  }

  return event;
}

function createBase<Kind extends KartMultiplayerEffectEventKind>(
  effectEventKind: Kind,
  sequence: number
): {
  readonly effectEventKind: Kind;
  readonly eventId: string;
  readonly hostPeerId: string;
  readonly sequence: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly occurredAt: number;
  readonly sentAt: number;
} {
  return {
    effectEventKind,
    eventId: `effect-event-${sequence}`,
    hostPeerId: "host-peer",
    sequence,
    tickIndex: 300 + sequence,
    elapsedSeconds: 11 + sequence * 0.03,
    occurredAt: 46000 + sequence * 16,
    sentAt: 46004 + sequence * 16
  };
}

function createRaceBase<Kind extends KartMultiplayerEffectEventKind>(
  effectEventKind: Kind,
  sequence: number
): {
  readonly effectEventKind: Kind;
  readonly eventId: string;
  readonly hostPeerId: string;
  readonly sequence: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly occurredAt: number;
  readonly sentAt: number;
} {
  return {
    effectEventKind,
    eventId: `remote-race-effect-${sequence}`,
    hostPeerId: "host-peer",
    sequence,
    tickIndex: sequence,
    elapsedSeconds: 0,
    occurredAt: 1000 + sequence * 16,
    sentAt: 1004 + sequence * 16
  };
}

function createEnvelope(
  eventId: string,
  sequence?: number
): Readonly<Record<string, unknown>> {
  return {
    protocol: KART_GAMEPLAY_PROTOCOL,
    version: KART_GAMEPLAY_VERSION,
    type: KART_GAMEPLAY_MESSAGE_TYPES.EFFECT_EVENT,
    eventId,
    hostPeerId: "host-peer",
    sequence,
    tickIndex: 300,
    elapsedSeconds: 11,
    occurredAt: 46000,
    sentAt: 46004
  };
}

function createMultiplayerRaceSession(): RaceSession {
  return createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: "host-peer",
        displayName: "Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: "guest-peer",
        displayName: "Guest",
        slotIndex: 1,
        isHost: false
      }
    ])
  );
}

function requireRacer(
  raceSession: RaceSession,
  racerId: string
): RaceSession["racerStates"][number] {
  const racer = raceSession.getRacerState(racerId);

  if (racer === undefined) {
    throw new Error(`Missing racer: ${racerId}`);
  }

  return racer;
}

function hostParticipant(): KartEffectParticipantSnapshot {
  return {
    playerId: "host-peer",
    racerId: "human_host",
    slotIndex: 0
  };
}

function guestParticipant(): KartEffectParticipantSnapshot {
  return {
    playerId: "guest-peer",
    racerId: "human_guest",
    slotIndex: 1
  };
}

function aiParticipant(): KartEffectParticipantSnapshot {
  return {
    playerId: null,
    racerId: "ai_rival",
    slotIndex: 2
  };
}

function raceHostParticipant(): KartEffectParticipantSnapshot {
  return {
    playerId: "host-peer",
    racerId: "human_1",
    slotIndex: 0
  };
}

function raceGuestParticipant(): KartEffectParticipantSnapshot {
  return {
    playerId: "guest-peer",
    racerId: "human_2",
    slotIndex: 1
  };
}

function raceAiParticipant(): KartEffectParticipantSnapshot {
  return {
    playerId: null,
    racerId: "ai_1",
    slotIndex: 2
  };
}

function impactSnapshot(kind: "shell" | "banana"): KartEffectImpactSnapshot {
  const objectRadius = kind === "shell" ? 0.36 : 0.42;

  return {
    position: { x: 2, y: 0.5, z: 10 },
    normal: { x: -1, y: 0, z: 0 },
    objectPosition: { x: 2.1, y: 0.35, z: 9.8 },
    objectVelocity: { x: 0, y: 0, z: 24 },
    objectRadius,
    targetHitboxCenter: { x: 2.4, y: 0.5, z: 10 },
    penetrationDepth: 0.12,
    relativeSpeed: 22
  };
}

function hitEffect(itemType: "shell" | "banana"): KartEffectHitEffectSnapshot {
  return {
    itemType,
    stunSeconds: itemType === "shell" ? 0.4 : 0.25,
    spinoutSeconds: itemType === "shell" ? 1.2 : 1,
    spinoutAngularVelocity: itemType === "shell" ? 8 : -7,
    hitImmunitySeconds: 0.8,
    hitFeedbackSeconds: 0.5,
    speedFactor: itemType === "shell" ? 0.45 : 0.55,
    speedBeforeHit: 18,
    speedAfterHit: itemType === "shell" ? 8.1 : 9.9,
    headingDeltaRadians: itemType === "shell" ? 0.3 : -0.45,
    blockedByShield: false,
    shieldSecondsBeforeHit: 0,
    shieldSecondsAfterHit: 0
  };
}

function assertParticipant(
  participant: KartEffectParticipantSnapshot,
  label: string
): void {
  if (participant.playerId !== null) {
    assertNonEmpty(participant.playerId, `${label}.playerId`);
  }

  assertNonEmpty(participant.racerId, `${label}.racerId`);
  assert(Number.isInteger(participant.slotIndex), `${label}.slotIndex`);
}

function assertNonEmpty(value: string, label: string): void {
  assert(value.trim().length > 0, `${label} is non-empty`);
}

function assert(condition: boolean, message: string): void {
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
