import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  getKartGameplayPayloadType
} from "./kartInputSnapshot";
import { broadcastKartBananaLifecycleEventsToPeers } from "./kartBananaEventChannel";
import {
  MAX_BANANA_EVENT_PAYLOAD_BYTES,
  createKartBananaCollisionEventMessage,
  createKartBananaCollisionEventMessageFromRaceEvent,
  createKartBananaRemovalEventMessage,
  createKartBananaRemovalEventMessageFromRaceEvent,
  createKartBananaSpawnEventMessage,
  createKartBananaSpawnEventMessageFromActiveItem,
  createRaceBananaHitEventFromMessage,
  createRaceBananaRemovalEventFromMessage,
  createRaceBananaSpawnEventFromMessage,
  deserializeKartBananaEventMessage,
  isKartBananaEventMessagePayload,
  isKartBananaEventMessageType,
  serializeKartBananaEventMessage,
  type KartBananaEventMessage,
  type KartBananaCollisionEventMessage,
  type KartBananaSpawnEventMessage
} from "./kartBananaEventMessage";
import {
  COMBAT_ITEM_REGISTRY,
  createBananaObstacleState,
  createRaceSessionFromStartRoster,
  type BananaObstacleState,
  type RaceBananaHitEvent,
  type RaceBananaRemovalEvent,
  type RaceSessionRacerState
} from "../race/raceSession";
import { createRaceStartRoster } from "../race/raceStartRoster";

const OWNER_PLAYER_ID = "host-peer";
const OWNER_RACER_ID = "human_1";
const TARGET_PLAYER_ID = "guest-peer";
const TARGET_RACER_ID = "human_2";

function main(): void {
  validateBananaSpawnSchema();
  validateBananaSpawnApplication();
  validateBananaCollisionSchema();
  validateBananaCollisionApplication();
  validateBananaRemovalSchema();
  validateBananaRemovalApplication();
  validateBananaLifecycleBroadcast();
  validateRemoteBananaLifecycleApplication();
  validateBananaPersistentHazardTick();
  validateBananaEventPayloadGuards();
}

function validateBananaSpawnSchema(): void {
  const spawn = createSpawnMessage();
  const payload = serializeKartBananaEventMessage(spawn);
  const parsed = deserializeKartBananaEventMessage(payload);

  if (parsed.type !== KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT) {
    throw new Error("Expected parsed banana spawn event.");
  }

  assertEqual(
    parsed.type,
    KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT,
    "spawn event type"
  );
  assertEqual(parsed.bananaId, "banana-stable-1", "stable banana id round trips");
  assertEqual(
    parsed.networkId,
    "banana-stable-1",
    "stable banana network id round trips"
  );
  assertEqual(parsed.ownerPlayerId, OWNER_PLAYER_ID, "owner player id streams");
  assertEqual(parsed.ownerId, OWNER_RACER_ID, "owner id streams");
  assertEqual(parsed.ownerRacerId, OWNER_RACER_ID, "owner racer id streams");
  assertEqual(parsed.activeState, "active", "spawn active state streams");
  assertEqual(parsed.removed, false, "spawn removed flag streams");
  assertEqual(parsed.ownerSlotIndex, 0, "owner slot index streams");
  assert(isKartBananaEventMessagePayload(payload), "spawn payload is detected");
  assertEqual(
    getKartGameplayPayloadType(payload),
    KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT,
    "gameplay type peeking identifies banana spawn packets"
  );
  assert(
    payload.length < MAX_BANANA_EVENT_PAYLOAD_BYTES,
    "spawn payload fits banana event packet budget"
  );

  const racer = createRacerState();
  const item = createBananaObstacleState(racer, "banana-from-active-state");
  const activeItemSpawn = createKartBananaSpawnEventMessageFromActiveItem({
    item,
    ownerPlayerId: OWNER_PLAYER_ID,
    tickIndex: 32,
    elapsedSeconds: 0.53,
    occurredAt: 5000
  });

  assertEqual(
    activeItemSpawn.eventId,
    "banana_spawn_banana-from-active-state",
    "active item spawn event id is derived from stable banana id"
  );
  assertEqual(
    activeItemSpawn.bananaId,
    item.id,
    "active item spawn keeps stable banana id"
  );
  assertEqual(
    activeItemSpawn.ownerPlayerId,
    OWNER_PLAYER_ID,
    "active item spawn keeps owner player id"
  );
}

function validateBananaSpawnApplication(): void {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: OWNER_PLAYER_ID,
        displayName: "Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: TARGET_PLAYER_ID,
        displayName: "Guest",
        slotIndex: 1,
        isHost: false
      }
    ])
  );
  const spawn = createSpawnMessage();
  const raceEvent = createRaceBananaSpawnEventFromMessage(spawn);

  assert(
    raceSession.applyBananaSpawnEvent(raceEvent),
    "authoritative banana spawn event is applied"
  );

  const banana = requireFirstBananaObstacle(raceSession.bananaObstacleStates);

  assertEqual(banana.id, spawn.bananaId, "applied banana keeps stable id");
  assertEqual(
    banana.networkId,
    spawn.bananaId,
    "applied banana exposes stable network id"
  );
  assertEqual(
    banana.ownerId,
    spawn.ownerRacerId,
    "applied banana exposes owner id"
  );
  assertEqual(banana.state, "active", "applied banana state is active");
  assertEqual(banana.activeState, "active", "applied banana active state");
  assertEqual(banana.removed, false, "applied banana is not removed");
  assertEqual(
    banana.ownerRacerId,
    spawn.ownerRacerId,
    "applied banana keeps owner racer"
  );
  assertClose(
    banana.position.x,
    spawn.position.x,
    0.000001,
    "applied banana keeps host position x"
  );
  assertClose(
    banana.position.z,
    spawn.position.z,
    0.000001,
    "applied banana keeps host position z"
  );
  assertClose(
    banana.orientationRadians,
    spawn.orientationRadians,
    0.000001,
    "applied banana keeps orientation"
  );
  assert(
    !raceSession.applyBananaSpawnEvent(raceEvent),
    "duplicate banana spawn event is ignored"
  );
  assertEqual(
    raceSession.bananaObstacleStates.length,
    1,
    "duplicate spawn does not add another banana"
  );

  const movedSpawn = createKartBananaSpawnEventMessage({
    ...spawn,
    eventId: "banana-spawn-update",
    position: { x: spawn.position.x + 2, y: 0, z: spawn.position.z - 1 }
  });

  assert(
    raceSession.applyBananaSpawnEvent(
      createRaceBananaSpawnEventFromMessage(movedSpawn)
    ),
    "new authoritative spawn event updates existing banana id"
  );
  assertEqual(
    raceSession.bananaObstacleStates.length,
    1,
    "authoritative spawn update keeps one banana"
  );
  assertClose(
    requireFirstBananaObstacle(raceSession.bananaObstacleStates).position.x,
    movedSpawn.position.x,
    0.000001,
    "authoritative spawn update applies host position"
  );
}

function validateBananaCollisionSchema(): void {
  const collision = createCollisionMessage();
  const payload = serializeKartBananaEventMessage(collision);
  const parsed = deserializeKartBananaEventMessage(payload);

  if (parsed.type !== KART_GAMEPLAY_MESSAGE_TYPES.BANANA_COLLISION_EVENT) {
    throw new Error("Expected parsed banana collision event.");
  }

  assertEqual(
    parsed.type,
    KART_GAMEPLAY_MESSAGE_TYPES.BANANA_COLLISION_EVENT,
    "collision event type"
  );
  assertEqual(parsed.bananaId, collision.bananaId, "collision banana id streams");
  assertEqual(
    parsed.networkId,
    collision.bananaId,
    "collision banana network id streams"
  );
  assertEqual(
    parsed.ownerPlayerId,
    OWNER_PLAYER_ID,
    "collision owner player id streams"
  );
  assertEqual(parsed.ownerId, OWNER_RACER_ID, "collision owner id streams");
  assertEqual(parsed.activeState, "removed", "collision removed state streams");
  assertEqual(parsed.removed, true, "collision removed flag streams");
  assertEqual(
    parsed.targetPlayerId,
    TARGET_PLAYER_ID,
    "collision target player id streams"
  );
  assertEqual(
    parsed.targetRacerId,
    TARGET_RACER_ID,
    "collision target racer id streams"
  );
  assertEqual(
    parsed.impact.bananaRadius,
    COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.radius,
    "collision banana radius streams"
  );
  assertEqual(parsed.effect.itemType, "banana", "collision effect item type streams");
  assertEqual(
    getKartGameplayPayloadType(payload),
    KART_GAMEPLAY_MESSAGE_TYPES.BANANA_COLLISION_EVENT,
    "gameplay type peeking identifies banana collision packets"
  );

  const raceEvent = createRaceBananaHitEvent();
  const fromRaceEvent = createKartBananaCollisionEventMessageFromRaceEvent({
    event: raceEvent,
    ownerPlayerId: OWNER_PLAYER_ID,
    targetPlayerId: TARGET_PLAYER_ID,
    occurredAt: 6200
  });

  assertEqual(
    fromRaceEvent.eventId,
    raceEvent.eventId,
    "race banana hit event id is preserved"
  );
  assertEqual(
    fromRaceEvent.bananaId,
    raceEvent.bananaId,
    "race banana hit stable id is preserved"
  );
  assertEqual(
    fromRaceEvent.ownerRacerId,
    raceEvent.sourceRacerId,
    "race banana owner racer is preserved"
  );
  assertEqual(
    createRaceBananaHitEventFromMessage(fromRaceEvent).effect.speedAfterHit,
    raceEvent.effect.speedAfterHit,
    "collision packet recreates authoritative hit effect"
  );
}

function validateBananaCollisionApplication(): void {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: OWNER_PLAYER_ID,
        displayName: "Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: TARGET_PLAYER_ID,
        displayName: "Guest",
        slotIndex: 1,
        isHost: false
      }
    ])
  );
  const spawn = createKartBananaSpawnEventMessage({
    ...createSpawnMessage(),
    tickIndex: 0,
    elapsedSeconds: 0
  });
  const collision = createKartBananaCollisionEventMessage({
    ...createCollisionMessage(),
    tickIndex: 0,
    elapsedSeconds: 0
  });
  const target = raceSession.getRacerState(TARGET_RACER_ID);

  if (target === undefined) {
    throw new Error("Expected target racer for banana collision application.");
  }

  assert(
    raceSession.applyBananaSpawnEvent(
      createRaceBananaSpawnEventFromMessage(spawn)
    ),
    "authoritative banana exists before collision"
  );
  assertEqual(
    raceSession.bananaObstacleStates.length,
    1,
    "authoritative banana spawn is active before collision"
  );

  target.speed = collision.effect.speedBeforeHit;

  const hitEvent = createRaceBananaHitEventFromMessage(collision);

  assert(
    raceSession.applyBananaHitEvent(hitEvent),
    "authoritative banana collision event is applied"
  );
  assertEqual(
    raceSession.bananaObstacleStates.length,
    0,
    "authoritative banana collision consumes the active banana"
  );
  assertClose(
    target.speed,
    collision.effect.speedAfterHit,
    0.000001,
    "authoritative banana collision applies the same speed effect"
  );
  assertClose(
    target.spinoutSeconds,
    collision.effect.spinoutSeconds,
    0.000001,
    "authoritative banana collision applies the same spinout duration"
  );
  assertClose(
    target.hitFeedbackSeconds,
    collision.effect.hitFeedbackSeconds,
    0.000001,
    "authoritative banana collision applies the same feedback duration"
  );

  const speedAfterFirstApply = target.speed;

  assert(
    !raceSession.applyBananaHitEvent(hitEvent),
    "duplicate authoritative banana collision event is ignored"
  );
  assertClose(
    target.speed,
    speedAfterFirstApply,
    0.000001,
    "duplicate banana collision does not reapply speed damping"
  );

  const duplicateCollisionWithNewEventId = createRaceBananaHitEventFromMessage(
    createKartBananaCollisionEventMessage({
      ...collision,
      eventId: "banana-collision-duplicate-id"
    })
  );

  assert(
    !raceSession.applyBananaHitEvent(duplicateCollisionWithNewEventId),
    "second collision for consumed banana id is ignored"
  );
  assert(
    !raceSession.applyBananaSpawnEvent(
      createRaceBananaSpawnEventFromMessage(
        createKartBananaSpawnEventMessage({
          ...spawn,
          eventId: "banana-spawn-after-collision"
        })
      )
    ),
    "late replayed banana spawn is ignored after collision"
  );
  assertEqual(
    raceSession.bananaObstacleStates.length,
    0,
    "late replayed banana spawn does not restore consumed banana"
  );
}

function validateBananaRemovalSchema(): void {
  const removal = createKartBananaRemovalEventMessage({
    eventId: "banana-removal-1",
    bananaId: "banana-stable-1",
    ownerPlayerId: OWNER_PLAYER_ID,
    ownerRacerId: OWNER_RACER_ID,
    ownerSlotIndex: 0,
    tickIndex: 46,
    elapsedSeconds: 0.77,
    occurredAt: 7100,
    reason: "collision",
    collisionEventId: "banana-collision-1",
    collidedRacerId: TARGET_RACER_ID
  });
  const payload = serializeKartBananaEventMessage(removal);
  const parsed = deserializeKartBananaEventMessage(payload);

  if (parsed.type !== KART_GAMEPLAY_MESSAGE_TYPES.BANANA_REMOVAL_EVENT) {
    throw new Error("Expected parsed banana removal event.");
  }

  assertEqual(
    parsed.type,
    KART_GAMEPLAY_MESSAGE_TYPES.BANANA_REMOVAL_EVENT,
    "removal event type"
  );
  assertEqual(parsed.bananaId, removal.bananaId, "removal banana id streams");
  assertEqual(
    parsed.networkId,
    removal.bananaId,
    "removal banana network id streams"
  );
  assertEqual(
    parsed.ownerPlayerId,
    OWNER_PLAYER_ID,
    "removal owner player id streams"
  );
  assertEqual(parsed.ownerId, OWNER_RACER_ID, "removal owner id streams");
  assertEqual(parsed.activeState, "removed", "removal state streams");
  assertEqual(parsed.removed, true, "removal removed flag streams");
  assertEqual(parsed.reason, "collision", "removal reason streams");
  assertEqual(
    parsed.collisionEventId,
    "banana-collision-1",
    "removal links collision event"
  );
  assertEqual(
    parsed.collidedRacerId,
    TARGET_RACER_ID,
    "removal identifies collided racer"
  );
  assertEqual(
    getKartGameplayPayloadType(payload),
    KART_GAMEPLAY_MESSAGE_TYPES.BANANA_REMOVAL_EVENT,
    "gameplay type peeking identifies banana removal packets"
  );

  const raceEvent: RaceBananaRemovalEvent = {
    eventId: "banana-removal-from-race",
    itemType: "banana",
    bananaId: "banana-stable-1",
    ownerRacerId: OWNER_RACER_ID,
    ownerSlotIndex: 0,
    tickIndex: 47,
    elapsedSeconds: 0.78,
    reason: "collision",
    collisionEventId: "banana-collision-1",
    collidedRacerId: TARGET_RACER_ID
  };
  const fromRaceEvent = createKartBananaRemovalEventMessageFromRaceEvent({
    event: raceEvent,
    ownerPlayerId: OWNER_PLAYER_ID,
    occurredAt: 7200
  });

  assertEqual(
    fromRaceEvent.reason,
    raceEvent.reason,
    "race banana removal reason converts to gameplay message"
  );
  assertEqual(
    createRaceBananaRemovalEventFromMessage(fromRaceEvent).collisionEventId,
    "banana-collision-1",
    "banana removal message converts back to race event"
  );

  assertEqual(
    createKartBananaRemovalEventMessage({
      ...removal,
      eventId: "banana-removal-hazard-cap",
      reason: "hazard-cap"
    }).reason,
    "hazard-cap",
    "hazard-cap banana removal reason serializes"
  );
  assertEqual(
    createKartBananaRemovalEventMessage({
      ...removal,
      eventId: "banana-removal-out-of-bounds",
      reason: "out-of-bounds"
    }).reason,
    "out-of-bounds",
    "out-of-bounds banana removal reason serializes"
  );
  assertEqual(
    createKartBananaRemovalEventMessage({
      ...removal,
      eventId: "banana-removal-race-finished",
      reason: "race-finished"
    }).reason,
    "race-finished",
    "race-finished banana removal reason serializes"
  );
}

function validateBananaRemovalApplication(): void {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: OWNER_PLAYER_ID,
        displayName: "Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: TARGET_PLAYER_ID,
        displayName: "Guest",
        slotIndex: 1,
        isHost: false
      }
    ])
  );
  const spawn = createSpawnMessage();

  assert(
    raceSession.applyBananaSpawnEvent(
      createRaceBananaSpawnEventFromMessage(spawn)
    ),
    "banana exists before authoritative removal"
  );

  const removal = createRaceBananaRemovalEventFromMessage(
    createKartBananaRemovalEventMessage({
      eventId: "banana-removal-out-of-bounds",
      bananaId: spawn.bananaId,
      ownerPlayerId: OWNER_PLAYER_ID,
      ownerRacerId: OWNER_RACER_ID,
      ownerSlotIndex: 0,
      tickIndex: 80,
      elapsedSeconds: 1.33,
      occurredAt: 9000,
      reason: "out-of-bounds"
    })
  );

  assert(
    raceSession.applyBananaRemovalEvent(removal),
    "authoritative banana removal event is applied"
  );
  assertEqual(
    raceSession.bananaObstacleStates.length,
    0,
    "authoritative banana removal consumes the active banana"
  );
  const removedEntity = raceSession.bananaHazardEntityStates.find(
    (entity) => entity.networkId === spawn.bananaId
  );

  assert(removedEntity !== undefined, "removed banana entity remains persistent");
  assertEqual(
    removedEntity.networkId,
    spawn.bananaId,
    "removed banana entity keeps network id"
  );
  assertEqual(
    removedEntity.ownerId,
    spawn.ownerRacerId,
    "removed banana entity keeps owner id"
  );
  assertEqual(removedEntity.state, "removed", "removed banana entity state");
  assertEqual(
    removedEntity.activeState,
    "removed",
    "removed banana entity active state"
  );
  assertEqual(removedEntity.removed, true, "removed banana entity flag");
  assert(
    !raceSession.applyBananaRemovalEvent(removal),
    "duplicate authoritative banana removal event is ignored"
  );
  assert(
    !raceSession.applyBananaSpawnEvent(
      createRaceBananaSpawnEventFromMessage(
        createKartBananaSpawnEventMessage({
          ...spawn,
          eventId: "banana-spawn-after-removal"
        })
      )
    ),
    "late replayed banana spawn is ignored after removal"
  );
}

function validateBananaPersistentHazardTick(): void {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: OWNER_PLAYER_ID,
        displayName: "Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: TARGET_PLAYER_ID,
        displayName: "Guest",
        slotIndex: 1,
        isHost: false
      }
    ])
  );
  const owner = raceSession.getRacerState(OWNER_RACER_ID);

  assert(owner !== undefined, "short ttl banana owner exists");

  const deployedBanana = createBananaObstacleState(
    owner,
    "banana-short-ttl"
  );
  const spawn = createKartBananaSpawnEventMessage({
    ...createSpawnMessage(),
    eventId: "banana-short-ttl-spawn",
    bananaId: "banana-short-ttl",
    tickIndex: 0,
    elapsedSeconds: 0,
    position: deployedBanana.position,
    orientationRadians: deployedBanana.orientationRadians,
    armedSeconds: 0,
    ttlSeconds: 0.01
  });

  assert(
    raceSession.applyBananaSpawnEvent(
      createRaceBananaSpawnEventFromMessage(spawn)
    ),
    "short ttl banana spawn is applied"
  );

  const tickResult = raceSession.tick(1 / 60);
  const banana = raceSession.bananaObstacleStates[0];
  const entity = raceSession.activeBananaHazardEntityStates[0];

  assertEqual(
    tickResult.bananaRemovals.length,
    0,
    "short ttl banana does not emit timer-based removal"
  );
  assert(banana !== undefined, "short ttl banana remains an active obstacle");
  assert(entity !== undefined, "short ttl banana remains an active hazard entity");
  assertEqual(
    banana.id,
    spawn.bananaId,
    "persistent banana obstacle references source banana"
  );
  assertEqual(
    raceSession.bananaObstacleStates.length,
    1,
    "short ttl banana is not removed from active obstacles"
  );
  assertEqual(
    entity.id,
    spawn.bananaId,
    "persistent banana hazard entity references source banana"
  );
  assertEqual(
    entity.networkId,
    spawn.bananaId,
    "persistent banana hazard entity exposes network id"
  );
  assertEqual(
    entity.ownerId,
    spawn.ownerRacerId,
    "persistent banana hazard entity exposes owner id"
  );
  assertEqual(entity.state, "active", "persistent banana entity state is active");
  assertEqual(
    entity.removed,
    false,
    "persistent banana entity is not removed while active"
  );
}

function validateBananaEventPayloadGuards(): void {
  assert(isKartBananaEventMessageType(
    KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT
  ), "banana spawn type guard accepts spawn type");
  assert(!isKartBananaEventMessagePayload("{"), "invalid JSON is rejected");
  assertThrows(
    () =>
      deserializeKartBananaEventMessage(
        JSON.stringify({
          ...createSpawnMessage(),
          bananaId: "   "
        })
      ),
    "blank banana ids are rejected"
  );
  assertThrows(
    () =>
      createKartBananaCollisionEventMessage({
        ...createCollisionMessage(),
        bananaId: "banana-stable-1",
        effect: {
          ...createCollisionMessage().effect,
          itemType: "shell" as "banana"
        }
      }),
    "non-banana collision effects are rejected"
  );
  assertThrows(
    () =>
      createKartBananaRemovalEventMessage({
        eventId: "bad-removal",
        bananaId: "banana-stable-1",
        ownerPlayerId: OWNER_PLAYER_ID,
        ownerRacerId: OWNER_RACER_ID,
        ownerSlotIndex: 0,
        tickIndex: 50,
        elapsedSeconds: 0.83,
        occurredAt: 8000,
        reason: "unknown" as "out-of-bounds"
      }),
    "unknown removal reasons are rejected"
  );
}

function validateBananaLifecycleBroadcast(): void {
  const spawn = createSpawnMessage();
  const removal = createKartBananaRemovalEventMessage({
    eventId: "banana-removal-broadcast",
    bananaId: spawn.bananaId,
    ownerPlayerId: OWNER_PLAYER_ID,
    ownerRacerId: OWNER_RACER_ID,
    ownerSlotIndex: 0,
    tickIndex: 60,
    elapsedSeconds: 1,
    occurredAt: 10000,
    reason: "out-of-bounds"
  });
  const payloadsByPeer = new Map<string, string[]>();
  const result = broadcastKartBananaLifecycleEventsToPeers(
    [spawn, removal],
    [
      {
        peerId: TARGET_PLAYER_ID,
        send: (payload, event) => {
          rememberPeerPayload(payloadsByPeer, TARGET_PLAYER_ID, payload);
          assertEqual(
            getKartGameplayPayloadType(payload),
            event.type,
            "broadcast payload envelope matches banana event type"
          );
          return true;
        }
      },
      {
        peerId: "spectator-peer",
        send: (payload, event) => {
          rememberPeerPayload(payloadsByPeer, "spectator-peer", payload);
          assertEqual(
            getKartGameplayPayloadType(payload),
            event.type,
            "broadcast payload envelope matches second peer event type"
          );
          return true;
        }
      }
    ]
  );

  assertEqual(result.attemptedCount, 4, "banana lifecycle broadcast fans out");
  assertEqual(result.sentCount, 4, "banana lifecycle broadcast reports sent packets");
  assertEqual(
    result.droppedCount,
    0,
    "banana lifecycle broadcast reports no dropped packets"
  );
  assertEqual(
    requirePeerPayloads(payloadsByPeer, TARGET_PLAYER_ID).length,
    2,
    "guest receives spawn and removal banana lifecycle packets"
  );
  assertEqual(
    requirePeerPayloads(payloadsByPeer, "spectator-peer").length,
    2,
    "each connected peer receives spawn and removal banana lifecycle packets"
  );
}

function validateRemoteBananaLifecycleApplication(): void {
  const remoteSession = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: OWNER_PLAYER_ID,
        displayName: "Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: TARGET_PLAYER_ID,
        displayName: "Guest",
        slotIndex: 1,
        isHost: false
      }
    ])
  );
  const spawn = createSpawnMessage();
  const removal = createKartBananaRemovalEventMessage({
    eventId: "banana-remote-removal",
    bananaId: spawn.bananaId,
    ownerPlayerId: OWNER_PLAYER_ID,
    ownerRacerId: OWNER_RACER_ID,
    ownerSlotIndex: 0,
    tickIndex: 90,
    elapsedSeconds: 1.5,
    occurredAt: 9100,
    reason: "out-of-bounds"
  });
  const lifecyclePayloads: string[] = [];

  broadcastKartBananaLifecycleEventsToPeers(
    [spawn, removal],
    [
      {
        peerId: TARGET_PLAYER_ID,
        send: (payload) => {
          lifecyclePayloads.push(payload);
          return true;
        }
      }
    ]
  );

  assert(
    applyRemoteBananaEventPayloadToRaceSession(
      remoteSession,
      requirePayload(lifecyclePayloads, 0)
    ),
    "non-dropping client applies remote banana spawn packet"
  );

  const remoteBanana = requireFirstBananaObstacle(
    remoteSession.bananaObstacleStates
  );

  assertEqual(
    remoteBanana.id,
    spawn.bananaId,
    "non-dropping client keeps remote banana id"
  );
  assertClose(
    remoteBanana.stablePosition.x,
    spawn.position.x,
    0.000001,
    "non-dropping client keeps remote banana stable x"
  );
  assertClose(
    remoteBanana.stablePosition.z,
    spawn.position.z,
    0.000001,
    "non-dropping client keeps remote banana stable z"
  );
  assertClose(
    remoteSession.activeBananaHazardEntityStates[0]?.stablePosition.x ?? NaN,
    spawn.position.x,
    0.000001,
    "non-dropping client renders remote banana at host x"
  );
  assertClose(
    remoteSession.activeBananaHazardEntityStates[0]?.stablePosition.z ?? NaN,
    spawn.position.z,
    0.000001,
    "non-dropping client renders remote banana at host z"
  );

  assert(
    applyRemoteBananaEventPayloadToRaceSession(
      remoteSession,
      requirePayload(lifecyclePayloads, 1)
    ),
    "non-dropping client applies remote banana removal packet"
  );
  assertEqual(
    remoteSession.bananaObstacleStates.length,
    0,
    "non-dropping client removes remote banana after removal packet"
  );
  assertEqual(
    remoteSession.bananaHazardEntityStates[0]?.removed,
    true,
    "non-dropping client marks remote banana entity removed"
  );

  const consumedSession = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: OWNER_PLAYER_ID,
        displayName: "Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: TARGET_PLAYER_ID,
        displayName: "Guest",
        slotIndex: 1,
        isHost: false
      }
    ])
  );

  assert(
    applyRemoteBananaEventPayloadToRaceSession(
      consumedSession,
      serializeKartBananaEventMessage(spawn)
    ),
    "non-dropping client applies remote banana spawn before consumption"
  );
  assert(
    applyRemoteBananaEventPayloadToRaceSession(
      consumedSession,
      serializeKartBananaEventMessage(
        createKartBananaCollisionEventMessage({
          ...createCollisionMessage(),
          tickIndex: 0,
          elapsedSeconds: 0
        })
      )
    ),
    "non-dropping client applies remote banana collision packet"
  );
  assertEqual(
    consumedSession.bananaObstacleStates.length,
    0,
    "non-dropping client removes remote banana after consumption packet"
  );
  assert(
    (consumedSession.getRacerState(TARGET_RACER_ID)?.spinoutSeconds ?? 0) > 0,
    "non-dropping client applies remote banana hit spinout"
  );
}

function applyRemoteBananaEventPayloadToRaceSession(
  raceSession: ReturnType<typeof createRaceSessionFromStartRoster>,
  payload: string
): boolean {
  return applyRemoteBananaEventToRaceSession(
    raceSession,
    deserializeKartBananaEventMessage(payload)
  );
}

function applyRemoteBananaEventToRaceSession(
  raceSession: ReturnType<typeof createRaceSessionFromStartRoster>,
  event: KartBananaEventMessage
): boolean {
  switch (event.type) {
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT:
      return raceSession.applyBananaSpawnEvent(
        createRaceBananaSpawnEventFromMessage(event)
      );
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_COLLISION_EVENT:
      return raceSession.applyBananaHitEvent(
        createRaceBananaHitEventFromMessage(event)
      );
    case KART_GAMEPLAY_MESSAGE_TYPES.BANANA_REMOVAL_EVENT:
      return raceSession.applyBananaRemovalEvent(
        createRaceBananaRemovalEventFromMessage(event)
      );
  }
}

function createSpawnMessage(): KartBananaSpawnEventMessage {
  return createKartBananaSpawnEventMessage({
    eventId: "banana-spawn-1",
    bananaId: "banana-stable-1",
    ownerPlayerId: OWNER_PLAYER_ID,
    ownerRacerId: OWNER_RACER_ID,
    ownerSlotIndex: 0,
    tickIndex: 30,
    elapsedSeconds: 0.5,
    occurredAt: 4000,
    position: { x: 12, y: 0, z: -4 },
    velocity: { x: 0, y: 0, z: 0 },
    radius: COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.radius,
    armedSeconds: COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.armSeconds,
    ttlSeconds: COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.ttlSeconds,
    ageSeconds: 0,
    orientationRadians: Math.PI / 2
  });
}

function createCollisionMessage(): KartBananaCollisionEventMessage {
  return createKartBananaCollisionEventMessage({
    eventId: "banana-collision-1",
    bananaId: "banana-stable-1",
    ownerPlayerId: OWNER_PLAYER_ID,
    ownerRacerId: OWNER_RACER_ID,
    ownerSlotIndex: 0,
    targetPlayerId: TARGET_PLAYER_ID,
    targetRacerId: TARGET_RACER_ID,
    targetSlotIndex: 1,
    tickIndex: 45,
    elapsedSeconds: 0.75,
    occurredAt: 6000,
    impact: {
      position: { x: 13, y: 0, z: -4 },
      normal: { x: -1, y: 0, z: 0 },
      bananaPosition: { x: 12, y: 0, z: -4 },
      bananaVelocity: { x: 0, y: 0, z: 0 },
      bananaRadius: COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.radius,
      targetHitboxCenter: { x: 13.2, y: 0.65, z: -4 },
      penetrationDepth: 0.25,
      relativeSpeed: 18
    },
    effect: {
      itemType: "banana",
      stunSeconds: COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.hitStunSeconds,
      spinoutSeconds:
        COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.spinoutSeconds,
      spinoutAngularVelocity:
        COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.spinoutRadians /
        COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.spinoutSeconds,
      hitImmunitySeconds:
        COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.hitImmunitySeconds,
      hitFeedbackSeconds:
        COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.hitFeedbackSeconds,
      speedFactor: COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.hitSpeedFactor,
      speedBeforeHit: 18,
      speedAfterHit:
        18 * COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.hitSpeedFactor,
      headingDeltaRadians:
        COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.spinRadians
    }
  });
}

function createRaceBananaHitEvent(): RaceBananaHitEvent {
  const collision = createCollisionMessage();

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

function createRacerState(): RaceSessionRacerState {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: OWNER_PLAYER_ID,
        displayName: "Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: TARGET_PLAYER_ID,
        displayName: "Guest",
        slotIndex: 1,
        isHost: false
      }
    ])
  );
  const racer = raceSession.getRacerState(OWNER_RACER_ID);

  if (racer === undefined) {
    throw new Error("Expected host racer state for banana event validation.");
  }

  return racer;
}

function requireFirstBananaObstacle(
  bananas: readonly BananaObstacleState[]
): BananaObstacleState {
  const banana = bananas[0];

  if (banana === undefined) {
    throw new Error("Expected applied banana obstacle.");
  }

  return banana;
}

function rememberPeerPayload(
  payloadsByPeer: Map<string, string[]>,
  peerId: string,
  payload: string
): void {
  const existingPayloads = payloadsByPeer.get(peerId) ?? [];

  existingPayloads.push(payload);
  payloadsByPeer.set(peerId, existingPayloads);
}

function requirePeerPayloads(
  payloadsByPeer: ReadonlyMap<string, readonly string[]>,
  peerId: string
): readonly string[] {
  const payloads = payloadsByPeer.get(peerId);

  if (payloads === undefined) {
    throw new Error(`Expected banana lifecycle payloads for ${peerId}.`);
  }

  return payloads;
}

function requirePayload(payloads: readonly string[], index: number): string {
  const payload = payloads[index];

  if (payload === undefined) {
    throw new Error(`Expected banana payload at index ${index}.`);
  }

  return payload;
}

function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

function assertClose(
  actual: number,
  expected: number,
  tolerance: number,
  message: string
): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

function assertThrows(callback: () => void, message: string): void {
  let thrown = false;

  try {
    callback();
  } catch {
    thrown = true;
  }

  if (!thrown) {
    throw new Error(message);
  }
}

main();

console.log(
  [
    "bananaEventSchemas=ok",
    "bananaSpawnApply=ok",
    "bananaCollisionApply=ok",
    "bananaRemovalApply=ok",
    "bananaLifecycleBroadcast=ok",
    "remoteBananaApply=ok",
    "bananaPersistentHazard=ok",
    `spawnType=${KART_GAMEPLAY_MESSAGE_TYPES.BANANA_SPAWN_EVENT}`,
    `collisionType=${KART_GAMEPLAY_MESSAGE_TYPES.BANANA_COLLISION_EVENT}`,
    `removalType=${KART_GAMEPLAY_MESSAGE_TYPES.BANANA_REMOVAL_EVENT}`
  ].join(" ")
);
