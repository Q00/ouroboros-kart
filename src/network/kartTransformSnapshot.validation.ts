import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  getKartGameplayPayloadType
} from "./kartInputSnapshot";
import {
  LocalKartTransformSnapshotEmitter,
  RemoteKartTransformSmoother,
  createKartTransformSnapshot,
  deserializeKartTransformSnapshot,
  isKartTransformSnapshotPayload,
  serializeKartTransformSnapshot,
  type KartBoostActivationSnapshot,
  type KartActiveItemSnapshot,
  type KartBananaHitSnapshot,
  type KartItemPickupCollectionSnapshot,
  type KartItemPickupSnapshot,
  type KartRacerTransform,
  type KartShellHitSnapshot,
  type SmoothedKartTransform,
  type KartTransformSnapshot
} from "./kartTransformSnapshot";
import { createBoostHudState, createBoostVisualState } from "../hud/boostHud";
import {
  BOOST_DURATION_SECONDS,
  COMBAT_ITEM_REGISTRY,
  DEFAULT_RACE_TRACK_STATE,
  RACER_COLLISION_RADIUS,
  createRaceSessionFromStartRoster
} from "../race/raceSession";
import { createRaceStartRoster } from "../race/raceStartRoster";
import { queryTrackSurfaceAtPoint } from "../config/tracks";

const HOST_PEER_ID = "host-peer";
const GUEST_PEER_ID = "guest-peer";
const HOST_RACER_ID = "human_1";
const GUEST_RACER_ID = "human_2";

function main(): void {
  validateTransformSnapshotSerialization();
  validateLocalEmitterStreamsRaceTransforms();
  validateSmootherInterpolatesRemoteTransforms();
  validateSmootherUsesConfigurableRenderDelay();
  validateSmootherExtrapolatesRemoteTransformsWithCap();
  validateSmootherFallsBackWhenRemoteStateIsStale();
  validateSmootherConstrainsRemoteTransformsToCourse();
  validateSmootherSynchronizesBoostPresentation();
  validateSmootherReplicatesBoostLifecycleWithDelayedOutOfOrderMessages();
  validateSmootherRetainsSharedBoostExpiryAfterEventSnapshotDrops();
  validateSmootherReplicatesShellHitPresentationState();
  validateSmootherReplaysStackedItemHitEffectsDeterministically();
  validateSmootherSynchronizesShellHitCollisionTiming();
  validateSmootherAdvancesActiveShellProjectilesEveryFrame();
  validateTransformSnapshotsReplicateBananaHitSpinoutEvents();
  validateTransformSnapshotsReplicateActiveBananaObstacles();
  validateSmootherRejectsBadPackets();
}

function validateTransformSnapshotSerialization(): void {
  const snapshot = createSnapshot({
    sequence: 7,
    tickIndex: 120,
    elapsedSeconds: 2,
    positionX: 12,
    velocityX: 8,
    headingRadians: Math.PI / 2
  });
  const payload = serializeKartTransformSnapshot(snapshot);
  const parsed = deserializeKartTransformSnapshot(payload);

  assertEqual(
    parsed.type,
    KART_GAMEPLAY_MESSAGE_TYPES.TRANSFORM_SNAPSHOT,
    "snapshot type"
  );
  assertEqual(parsed.hostPeerId, HOST_PEER_ID, "host id round trips");
  assertEqual(parsed.racers[0]?.racerId, HOST_RACER_ID, "racer id round trips");
  assertEqual(parsed.racers[0]?.position.x, 12, "position round trips");
  assertEqual(parsed.racers[0]?.heldItem, null, "held item round trips");
  assertEqual(parsed.racers[0]?.boostSeconds, 0, "boost timer round trips");
  assertEqual(parsed.racers[0]?.shieldSeconds, 0, "shield timer round trips");
  assertEqual(parsed.racers[0]?.stunSeconds, 0, "stun timer round trips");
  assertEqual(
    parsed.racers[0]?.spinoutSeconds,
    0,
    "spinout timer round trips"
  );
  assertEqual(
    parsed.racers[0]?.itemHitImmunitySeconds,
    0,
    "hit immunity timer round trips"
  );
  assertEqual(
    parsed.racers[0]?.hitFeedbackSeconds,
    0,
    "hit feedback timer round trips"
  );
  assertEqual(
    parsed.racers[0]?.itemUseCooldownSeconds,
    0,
    "item use cooldown round trips"
  );
  assertEqual(parsed.itemPickups.length, 0, "item pickup snapshots default empty");
  assertEqual(
    parsed.itemPickupCollections.length,
    0,
    "pickup collection snapshots default empty"
  );
  assertEqual(
    parsed.boostActivations.length,
    0,
    "boost activation snapshots default empty"
  );
  assertEqual(parsed.shellHits.length, 0, "shell-hit snapshots default empty");
  assertEqual(parsed.bananaHits.length, 0, "banana-hit snapshots default empty");
  assertEqual(parsed.activeItems.length, 0, "active item snapshots default empty");
  const boostActivation = createBoostActivation(12, 12.2);
  const shellHit = createShellHit(12, 12.2);
  const bananaHit = createBananaHit(12, 12.2);
  const bananaObstacle = createBananaActiveItemSnapshot("banana-12");

  assertClose(
    boostActivation.expiresAtElapsedSeconds,
    boostActivation.elapsedSeconds + boostActivation.durationSeconds,
    0.000001,
    "boost activation exposes shared expiry time"
  );
  assertClose(
    shellHit.effect.spinoutSeconds,
    COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.spinoutSeconds,
    0.000001,
    "shell hit exposes spinout effect duration"
  );
  assertClose(
    bananaHit.effect.spinoutSeconds,
    COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.spinoutSeconds,
    0.000001,
    "banana hit exposes spinout effect duration"
  );
  assert(isKartTransformSnapshotPayload(payload), "valid payload is detected");
  assertEqual(
    getKartGameplayPayloadType(payload),
    KART_GAMEPLAY_MESSAGE_TYPES.TRANSFORM_SNAPSHOT,
    "gameplay type peeking identifies transform packets"
  );
  const racerTransform = requireFirstRacerTransform(snapshot);

  assertThrows(
    () =>
      createKartTransformSnapshot({
        ...snapshot,
        racers: [racerTransform, racerTransform]
      }),
    "duplicate racer ids are rejected"
  );
  assertThrows(
    () =>
      createKartTransformSnapshot({
        ...snapshot,
        itemPickupCollections: [
          createBoostPickupCollection(12, 12.2),
          createBoostPickupCollection(12, 12.2)
        ]
      }),
    "duplicate pickup collection event ids are rejected"
  );
  assertThrows(
    () =>
      createKartTransformSnapshot({
        ...snapshot,
        boostActivations: [
          createBoostActivation(12, 12.2),
          createBoostActivation(12, 12.2)
        ]
    }),
    "duplicate boost activation event ids are rejected"
  );
  assertThrows(
    () =>
      createKartTransformSnapshot({
        ...snapshot,
        shellHits: [shellHit, shellHit]
      }),
    "duplicate shell-hit event ids are rejected"
  );
  assertThrows(
    () =>
      createKartTransformSnapshot({
        ...snapshot,
        bananaHits: [bananaHit, bananaHit]
      }),
    "duplicate banana-hit event ids are rejected"
  );
  assertThrows(
    () =>
      createKartTransformSnapshot({
        ...snapshot,
        activeItems: [bananaObstacle, bananaObstacle]
      }),
    "duplicate active item ids are rejected"
  );
}

function validateLocalEmitterStreamsRaceTransforms(): void {
  const payloads: string[] = [];
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: HOST_PEER_ID,
        displayName: "Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: GUEST_PEER_ID,
        displayName: "Guest",
        slotIndex: 1,
        isHost: false
      }
    ])
  );
  const tickResult = raceSession.tick(1 / 60);
  const emitter = new LocalKartTransformSnapshotEmitter({
    hostPeerId: HOST_PEER_ID,
    now: () => 3000,
    send: (payload) => {
      payloads.push(payload);
      return true;
    }
  });
  const emitted = emitter.emit(
    {
      tickIndex: tickResult.tickIndex,
      elapsedSeconds: tickResult.elapsedSeconds
    },
    raceSession.racerStates,
    raceSession.itemPickupStates,
    [
      createBoostPickupCollection(
        tickResult.tickIndex,
        tickResult.elapsedSeconds
      )
    ],
    [
      createBoostActivation(
        tickResult.tickIndex,
        tickResult.elapsedSeconds
      )
    ],
    [
      createShellHit(
        tickResult.tickIndex,
        tickResult.elapsedSeconds
      )
    ],
    [
      createBananaHit(
        tickResult.tickIndex,
        tickResult.elapsedSeconds
      )
    ]
  );

  assert(emitted !== null, "transform snapshot is emitted");
  assertEqual(payloads.length, 1, "one transform payload is sent");
  assertEqual(emitted.racers.length, 4, "all four racer transforms are streamed");
  assertEqual(emitted.sequence, 0, "transform sequence starts at zero");
  assertEqual(
    emitted.itemPickups.length,
    raceSession.itemPickupStates.length,
    "item pickup cooldowns are streamed"
  );
  assertEqual(
    emitted.itemPickupCollections.length,
    1,
    "pickup collection events are streamed"
  );
  assertEqual(
    emitted.itemPickupCollections[0]?.racerId,
    HOST_RACER_ID,
    "pickup collection racer id is streamed"
  );
  assertEqual(
    emitted.boostActivations.length,
    1,
    "boost activation events are streamed"
  );
  assertEqual(
    emitted.boostActivations[0]?.racerId,
    HOST_RACER_ID,
    "boost activation racer id is streamed"
  );
  assertClose(
    emitted.boostActivations[0]?.expiresAtElapsedSeconds ?? 0,
    tickResult.elapsedSeconds + BOOST_DURATION_SECONDS,
    0.000001,
    "boost activation shared expiry is streamed"
  );
  assertEqual(
    emitted.shellHits.length,
    1,
    "shell-hit events are streamed"
  );
  assertEqual(
    emitted.shellHits[0]?.targetRacerId,
    GUEST_RACER_ID,
    "shell-hit target racer id is streamed"
  );
  assertClose(
    emitted.shellHits[0]?.impact.penetrationDepth ?? 0,
    0.25,
    0.000001,
    "shell-hit impact data is streamed"
  );
  assertClose(
    emitted.shellHits[0]?.effect.hitImmunitySeconds ?? 0,
    COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.hitImmunitySeconds,
    0.000001,
    "shell-hit immunity effect is streamed"
  );
  assertEqual(
    emitted.bananaHits.length,
    1,
    "banana-hit events are streamed"
  );
  assertEqual(
    emitted.bananaHits[0]?.targetRacerId,
    GUEST_RACER_ID,
    "banana-hit target racer id is streamed"
  );
  assertClose(
    emitted.bananaHits[0]?.effect.spinoutSeconds ?? 0,
    COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.spinoutSeconds,
    0.000001,
    "banana-hit spinout effect is streamed"
  );
  assert(
    emitted.racers.every(
      (racer) =>
        racer.heldItem === null &&
        racer.boostSeconds === 0 &&
        racer.shieldSeconds === 0 &&
        racer.stunSeconds === 0 &&
        racer.spinoutSeconds === 0 &&
        racer.itemHitImmunitySeconds === 0 &&
        racer.hitFeedbackSeconds === 0 &&
        racer.itemUseCooldownSeconds === 0
    ),
    "transform stream includes combat presentation state"
  );
  const payload = payloads[0];

  assert(payload !== undefined, "serialized transform payload is available");
  assertEqual(
    deserializeKartTransformSnapshot(payload).racers.length,
    4,
    "serialized payload includes all racers"
  );
  assertEqual(
    deserializeKartTransformSnapshot(payload).itemPickupCollections[0]?.pickupId,
    "boost-box",
    "serialized payload includes pickup collection events"
  );
  assertEqual(
    deserializeKartTransformSnapshot(payload).boostActivations[0]?.eventId,
    `boost-${tickResult.tickIndex}`,
    "serialized payload includes boost activation events"
  );
  assertClose(
    deserializeKartTransformSnapshot(payload).boostActivations[0]
      ?.expiresAtElapsedSeconds ?? 0,
    tickResult.elapsedSeconds + BOOST_DURATION_SECONDS,
    0.000001,
    "serialized payload includes boost activation expiry"
  );
  assertEqual(
    deserializeKartTransformSnapshot(payload).shellHits[0]?.shellId,
    `shell-${tickResult.tickIndex}`,
    "serialized payload includes shell-hit events"
  );
  assertClose(
    deserializeKartTransformSnapshot(payload).shellHits[0]?.effect
      .spinoutSeconds ?? 0,
    COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.spinoutSeconds,
    0.000001,
    "serialized payload includes shell-hit spinout effect"
  );
  assertEqual(
    deserializeKartTransformSnapshot(payload).bananaHits[0]?.bananaId,
    `banana-${tickResult.tickIndex}`,
    "serialized payload includes banana-hit events"
  );
  assertClose(
    deserializeKartTransformSnapshot(payload).bananaHits[0]?.effect
      .spinoutSeconds ?? 0,
    COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.spinoutSeconds,
    0.000001,
    "serialized payload includes banana-hit spinout effect"
  );
}

function validateSmootherInterpolatesRemoteTransforms(): void {
  const smoother = new RemoteKartTransformSmoother({
    expectedHostPeerId: HOST_PEER_ID,
    interpolationDelaySeconds: 0.1,
    maxExtrapolationSeconds: 0.12
  });

  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 0,
      tickIndex: 600,
      elapsedSeconds: 10,
      positionX: 0,
      velocityX: 100,
      headingRadians: 0
    }),
    1000
  );
  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 1,
      tickIndex: 606,
      elapsedSeconds: 10.1,
      positionX: 10,
      velocityX: 100,
      headingRadians: Math.PI / 2
    }),
    1100
  );

  const transform = requireSmoothedTransform(smoother.sample(1150));

  assertClose(transform.position.x, 5, 0.0001, "position interpolates halfway");
  assertClose(
    transform.headingRadians,
    Math.PI / 4,
    0.0001,
    "heading interpolates on the shortest arc"
  );
  assert(transform.interpolated, "sample is marked interpolated");
  assert(!transform.extrapolated, "interpolated sample is not extrapolated");
}

function validateSmootherUsesConfigurableRenderDelay(): void {
  const shortDelaySmoother = createSmootherWithBufferedMovement(0.05);
  const longDelaySmoother = createSmootherWithBufferedMovement(0.12);

  assertClose(
    shortDelaySmoother.renderDelaySeconds,
    0.05,
    0.000001,
    "render delay exposes the configured short buffer"
  );
  assertClose(
    longDelaySmoother.renderDelaySeconds,
    0.12,
    0.000001,
    "render delay exposes the configured long buffer"
  );

  const shortDelayTransform = requireSmoothedTransform(
    shortDelaySmoother.sample(1130)
  );
  const longDelayTransform = requireSmoothedTransform(
    longDelaySmoother.sample(1130)
  );

  assertClose(
    shortDelayTransform.position.x,
    8,
    0.000001,
    "shorter render delay samples later in the buffered timeline"
  );
  assertClose(
    longDelayTransform.position.x,
    1,
    0.000001,
    "longer render delay samples earlier in the buffered timeline"
  );
  assert(
    shortDelayTransform.interpolated && longDelayTransform.interpolated,
    "configurable render delay still uses buffered interpolation"
  );
}

function createSmootherWithBufferedMovement(
  renderDelaySeconds: number
): RemoteKartTransformSmoother {
  const smoother = new RemoteKartTransformSmoother({
    expectedHostPeerId: HOST_PEER_ID,
    renderDelaySeconds,
    maxExtrapolationSeconds: 0.12
  });

  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 0,
      tickIndex: 600,
      elapsedSeconds: 10,
      positionX: 0,
      velocityX: 100,
      headingRadians: 0
    }),
    1000
  );
  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 1,
      tickIndex: 606,
      elapsedSeconds: 10.1,
      positionX: 10,
      velocityX: 100,
      headingRadians: 0
    }),
    1100
  );

  return smoother;
}

function validateSmootherExtrapolatesRemoteTransformsWithCap(): void {
  const smoother = new RemoteKartTransformSmoother({
    expectedHostPeerId: HOST_PEER_ID,
    interpolationDelaySeconds: 0.1,
    maxExtrapolationSeconds: 0.12
  });

  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 0,
      tickIndex: 600,
      elapsedSeconds: 10,
      positionX: 0,
      velocityX: 20,
      headingRadians: 0
    }),
    1000
  );
  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 1,
      tickIndex: 606,
      elapsedSeconds: 10.1,
      positionX: 10,
      velocityX: 20,
      headingRadians: 0.1
    }),
    1100
  );

  const transform = requireSmoothedTransform(smoother.sample(1400));

  assertClose(
    transform.position.x,
    12.4,
    0.0001,
    "extrapolation is capped at 120ms"
  );
  assert(transform.extrapolated, "sample is marked extrapolated");
  assert(!transform.stale, "short-gap extrapolation is not stale fallback");
}

function validateSmootherFallsBackWhenRemoteStateIsStale(): void {
  const smoother = new RemoteKartTransformSmoother({
    expectedHostPeerId: HOST_PEER_ID,
    interpolationDelaySeconds: 0.1,
    maxExtrapolationSeconds: 0.12,
    staleFallbackSeconds: 0.25
  });

  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 0,
      tickIndex: 600,
      elapsedSeconds: 10,
      positionX: 0,
      velocityX: 20,
      headingRadians: 0
    }),
    1000
  );
  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 1,
      tickIndex: 606,
      elapsedSeconds: 10.1,
      positionX: 10,
      velocityX: 20,
      headingRadians: 0.1
    }),
    1100
  );

  const shortGap = requireSmoothedTransform(smoother.sample(1400));
  const stale = requireSmoothedTransform(smoother.sample(1500));

  assertClose(
    shortGap.position.x,
    12.4,
    0.0001,
    "short packet gap uses the capped extrapolated position"
  );
  assert(shortGap.extrapolated, "short packet gap remains active extrapolation");
  assert(!shortGap.stale, "short packet gap is not stale");
  assertClose(
    stale.position.x,
    shortGap.position.x,
    0.000001,
    "stale fallback freezes at the capped extrapolated position"
  );
  assertClose(stale.velocity.x, 0, 0.000001, "stale fallback clears velocity");
  assertClose(stale.speed, 0, 0.000001, "stale fallback clears speed");
  assert(!stale.interpolated, "stale fallback is not interpolation");
  assert(!stale.extrapolated, "stale fallback stops active extrapolation");
  assert(stale.stale, "stale fallback is marked for render/gameplay consumers");
}

function validateSmootherConstrainsRemoteTransformsToCourse(): void {
  const road = DEFAULT_RACE_TRACK_STATE.road;

  assert(road !== undefined, "default road geometry is available");

  const smoother = new RemoteKartTransformSmoother({
    expectedHostPeerId: HOST_PEER_ID,
    interpolationDelaySeconds: 0,
    maxExtrapolationSeconds: 0.12,
    staleFallbackSeconds: 0.5,
    courseConstraint: {
      road,
      racerRadius: RACER_COLLISION_RADIUS
    }
  });
  const outOfCourseSnapshot = smoother.accept(
    serializeKartTransformSnapshot(
      createSnapshot({
        sequence: 0,
        tickIndex: 700,
        elapsedSeconds: 11,
        positionX: 500,
        velocityX: 0,
        headingRadians: Math.PI / 2
      })
    ),
    1000
  );

  assert(outOfCourseSnapshot.accepted, "out-of-course packet keeps sequence flow");
  assertEqual(outOfCourseSnapshot.snapshot.sequence, 0, "sequence is preserved");
  assertCoursePosition(
    requireFirstRacerTransform(outOfCourseSnapshot.snapshot).position,
    "accepted snapshot position is course constrained"
  );
  assertEqual(smoother.rejectedCount, 0, "course correction does not reject packet");

  const nextSnapshot = smoother.accept(
    serializeKartTransformSnapshot(
      createSnapshot({
        sequence: 1,
        tickIndex: 701,
        elapsedSeconds: 11.016,
        positionX: 0,
        velocityX: 4000,
        headingRadians: Math.PI / 2
      })
    ),
    1016
  );

  assert(nextSnapshot.accepted, "next sequence still accepts after correction");
  assertEqual(smoother.bufferedCount, 2, "corrected snapshots remain buffered");
  assertEqual(smoother.droppedCount, 0, "correction does not drop snapshots");

  const transform = requireSmoothedTransform(smoother.sample(1400));

  assert(transform.extrapolated, "sample still reports extrapolation");
  assertCoursePosition(
    transform.position,
    "extrapolated presentation position is course constrained"
  );
}

function validateSmootherSynchronizesBoostPresentation(): void {
  const smoother = new RemoteKartTransformSmoother({
    expectedHostPeerId: HOST_PEER_ID,
    interpolationDelaySeconds: 0.1,
    maxExtrapolationSeconds: 0.12
  });

  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 0,
      tickIndex: 600,
      elapsedSeconds: 10,
      positionX: 0,
      velocityX: 20,
      headingRadians: 0,
      heldItem: COMBAT_ITEM_REGISTRY.boost.type,
      itemPickups: [
        {
          pickupId: "boost-box",
          itemType: COMBAT_ITEM_REGISTRY.boost.type,
          cooldownSeconds: 0
        }
      ]
    }),
    1000
  );
  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 1,
      tickIndex: 606,
      elapsedSeconds: 10.1,
      positionX: 2,
      velocityX: 20,
      headingRadians: 0,
      heldItem: null,
      boostSeconds: BOOST_DURATION_SECONDS,
      itemUseCooldownSeconds:
        COMBAT_ITEM_REGISTRY.boost.defaultRuntimeConfig.useCooldownSeconds,
      itemPickups: [
        {
          pickupId: "boost-box",
          itemType: COMBAT_ITEM_REGISTRY.boost.type,
          cooldownSeconds: COMBAT_ITEM_REGISTRY.boost.respawnSeconds
        }
      ],
      itemPickupCollections: [createBoostPickupCollection(606, 10.1)],
      boostActivations: [createBoostActivation(606, 10.1)]
    }),
    1100
  );

  const latestCollection = smoother.latestItemPickupCollections[0];
  const latestActivation = smoother.latestBoostActivations[0];
  const beforeActivation = requireSmoothedTransform(smoother.sample(1150));
  const activated = requireSmoothedTransform(smoother.sample(1200));
  const activatedHud = createBoostHudState(
    activated,
    smoother.sampleItemPickups(1200)
  );
  const activatedVisual = createBoostVisualState(activated);

  assertEqual(
    beforeActivation.boostSeconds,
    0,
    "boost waits for synchronized activation tick"
  );
  assertEqual(activated.heldItem, null, "boost activation consumes held item");
  assertEqual(
    latestCollection?.pickupId,
    "boost-box",
    "smoother exposes latest pickup collection event"
  );
  assertEqual(
    latestCollection?.racerId,
    HOST_RACER_ID,
    "smoother exposes pickup collection racer"
  );
  assertEqual(
    latestActivation?.eventId,
    "boost-606",
    "smoother exposes latest boost activation event"
  );
  assertEqual(
    latestActivation?.tickIndex,
    606,
    "boost activation event preserves host tick"
  );
  assertClose(
    activated.boostSeconds,
    BOOST_DURATION_SECONDS,
    0.000001,
    "boost timer activates at synchronized host time"
  );
  assertEqual(activatedHud.availability, "active", "HUD reflects active boost");
  assertEqual(activatedHud.visual.isActive, true, "HUD boost visual is active");
  assertEqual(activatedVisual.isActive, true, "kart boost visual is active");
  assertClose(
    activatedHud.visual.intensity,
    activatedVisual.intensity,
    0.000001,
    "HUD and kart boost visuals share intensity"
  );

  const expired = requireSmoothedTransform(smoother.sample(2500));
  const expiredPickups = smoother.sampleItemPickups(2500);
  const expiredHud = createBoostHudState(expired, expiredPickups);
  const expiredVisual = createBoostVisualState(expired);
  const expiredBoostPickup = expiredPickups[0];

  assertEqual(expired.boostSeconds, 0, "boost timer expires during smoothing");
  assertEqual(expiredHud.availability, "respawn", "HUD reflects boost expiry");
  assertEqual(expiredHud.visual.isActive, false, "HUD boost visual expires");
  assertEqual(expiredVisual.isActive, false, "kart boost visual expires");
  assert(expiredBoostPickup !== undefined, "boost pickup sample is available");
  assert(
    expiredBoostPickup.cooldownSeconds > 0,
    "HUD pickup state stays on authoritative respawn timer"
  );
}

function validateSmootherReplicatesBoostLifecycleWithDelayedOutOfOrderMessages(): void {
  const smoother = new RemoteKartTransformSmoother({
    expectedHostPeerId: HOST_PEER_ID,
    interpolationDelaySeconds: 0.1,
    maxExtrapolationSeconds: 0.12
  });
  const pickupCollection = createBoostPickupCollection(1206, 20.1);
  const boostActivation = createBoostActivation(1212, 20.2);
  const activationReceivedAt = 1240;

  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 0,
      tickIndex: 1200,
      elapsedSeconds: 20,
      positionX: 0,
      velocityX: 26,
      headingRadians: 0,
      heldItem: null,
      itemPickups: [
        {
          pickupId: "boost-box",
          itemType: COMBAT_ITEM_REGISTRY.boost.type,
          cooldownSeconds: 0
        }
      ]
    }),
    1000
  );

  const activationPacket = smoother.accept(
    serializeKartTransformSnapshot(
      createSnapshot({
        sequence: 2,
        tickIndex: 1212,
        elapsedSeconds: 20.2,
        positionX: 5.2,
        velocityX: 34,
        headingRadians: 0,
        heldItem: null,
        boostSeconds: BOOST_DURATION_SECONDS,
        itemUseCooldownSeconds:
          COMBAT_ITEM_REGISTRY.boost.defaultRuntimeConfig.useCooldownSeconds,
        itemPickups: [
          {
            pickupId: "boost-box",
            itemType: COMBAT_ITEM_REGISTRY.boost.type,
            cooldownSeconds: COMBAT_ITEM_REGISTRY.boost.respawnSeconds - 0.1
          }
        ],
        itemPickupCollections: [pickupCollection],
        boostActivations: [boostActivation]
      })
    ),
    activationReceivedAt
  );

  assert(activationPacket.accepted, "out-of-order boost activation packet accepts");
  assertEqual(
    activationPacket.snapshot.sequence,
    2,
    "activation packet arrives before delayed pickup packet"
  );

  const activeBeforeDelayedPickup = requireSmoothedTransform(
    smoother.sample(activationReceivedAt + 100)
  );

  assertEqual(
    activeBeforeDelayedPickup.heldItem,
    null,
    "boost activation consumes held item before delayed pickup packet arrives"
  );
  assertClose(
    activeBeforeDelayedPickup.boostSeconds,
    BOOST_DURATION_SECONDS,
    0.000001,
    "boost activates at synchronized host time from out-of-order packet"
  );

  const delayedPickupPacket = smoother.accept(
    serializeKartTransformSnapshot(
      createSnapshot({
        sequence: 1,
        tickIndex: 1206,
        elapsedSeconds: 20.1,
        positionX: 2.6,
        velocityX: 26,
        headingRadians: 0,
        heldItem: COMBAT_ITEM_REGISTRY.boost.type,
        itemPickups: [
          {
            pickupId: "boost-box",
            itemType: COMBAT_ITEM_REGISTRY.boost.type,
            cooldownSeconds: COMBAT_ITEM_REGISTRY.boost.respawnSeconds
          }
        ],
        itemPickupCollections: [pickupCollection]
      })
    ),
    1380
  );

  assert(delayedPickupPacket.accepted, "delayed boost pickup packet accepts");
  assertEqual(
    delayedPickupPacket.snapshot.sequence,
    1,
    "delayed pickup packet keeps original host sequence"
  );
  assertEqual(
    smoother.bufferedCount,
    3,
    "out-of-order boost packets stay buffered"
  );
  assertEqual(
    smoother.latestItemPickupCollections[0]?.eventId,
    pickupCollection.eventId,
    "pickup collection event remains replicated after delayed delivery"
  );
  assertEqual(
    smoother.latestBoostActivations[0]?.eventId,
    boostActivation.eventId,
    "boost activation event remains replicated after delayed delivery"
  );

  const activeAfterDelayedPickup = requireSmoothedTransform(
    smoother.sample(activationReceivedAt + 220)
  );
  const activePickupState =
    smoother.sampleItemPickups(activationReceivedAt + 220)[0];

  assertEqual(
    activeAfterDelayedPickup.heldItem,
    null,
    "delayed pickup packet does not restore consumed boost item"
  );
  assert(
    activeAfterDelayedPickup.boostSeconds > 0,
    "boost remains active after delayed pickup packet is inserted"
  );
  assert(
    activePickupState !== undefined,
    "replicated boost pickup state is present"
  );
  assert(
    activePickupState.cooldownSeconds > 0 &&
      activePickupState.cooldownSeconds < COMBAT_ITEM_REGISTRY.boost.respawnSeconds,
    "replicated boost pickup cooldown decays under delayed delivery"
  );

  const expirySampleTime =
    activationReceivedAt + (BOOST_DURATION_SECONDS + 0.5) * 1000;
  const expired = requireSmoothedTransform(smoother.sample(expirySampleTime));
  const expiredHud = createBoostHudState(
    expired,
    smoother.sampleItemPickups(expirySampleTime)
  );
  const expiredVisual = createBoostVisualState(expired);

  assertClose(
    expired.boostSeconds,
    0,
    0.000001,
    "boost expires at shared host expiry after delayed out-of-order delivery"
  );
  assertEqual(expiredHud.visual.isActive, false, "HUD boost visual expires");
  assertEqual(expiredVisual.isActive, false, "kart boost visual expires");
}

function validateSmootherRetainsSharedBoostExpiryAfterEventSnapshotDrops(): void {
  const smoother = new RemoteKartTransformSmoother({
    expectedHostPeerId: HOST_PEER_ID,
    interpolationDelaySeconds: 0,
    maxBufferedSnapshots: 2,
    maxExtrapolationSeconds: 0.12
  });
  const activation = createBoostActivation(600, 10);

  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 0,
      tickIndex: 600,
      elapsedSeconds: 10,
      positionX: 0,
      velocityX: 24,
      headingRadians: 0,
      heldItem: null,
      boostSeconds: BOOST_DURATION_SECONDS,
      itemUseCooldownSeconds:
        COMBAT_ITEM_REGISTRY.boost.defaultRuntimeConfig.useCooldownSeconds,
      boostActivations: [activation]
    }),
    1000
  );
  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 1,
      tickIndex: 624,
      elapsedSeconds: 10.4,
      positionX: 9.6,
      velocityX: 24,
      headingRadians: 0,
      heldItem: null,
      boostSeconds: 0.9,
      itemUseCooldownSeconds: 0
    }),
    1400
  );
  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 2,
      tickIndex: 648,
      elapsedSeconds: 10.8,
      positionX: 19.2,
      velocityX: 24,
      headingRadians: 0,
      heldItem: null,
      boostSeconds: 0.9,
      itemUseCooldownSeconds: 0
    }),
    1800
  );

  assertEqual(
    smoother.bufferedCount,
    2,
    "activation source snapshot is dropped from transform buffer"
  );
  assertEqual(
    smoother.latestBoostActivations[0]?.eventId,
    activation.eventId,
    "shared boost expiry event remains cached"
  );

  const beforeExpiry = requireSmoothedTransform(smoother.sample(2000));
  const atExpiry = requireSmoothedTransform(
    smoother.sample(
      1800 + (activation.expiresAtElapsedSeconds - 10.8) * 1000
    )
  );

  assertClose(
    beforeExpiry.boostSeconds,
    activation.expiresAtElapsedSeconds - 11,
    0.000001,
    "cached shared expiry controls boost duration after source snapshot drops"
  );
  assertClose(
    atExpiry.boostSeconds,
    0,
    0.000001,
    "boost expires exactly at the shared host expiry time"
  );
  assertEqual(
    createBoostVisualState(atExpiry).isActive,
    false,
    "boost visual ends at shared expiry"
  );
}

function validateSmootherReplicatesShellHitPresentationState(): void {
  const smoother = new RemoteKartTransformSmoother({
    expectedHostPeerId: HOST_PEER_ID,
    interpolationDelaySeconds: 0,
    maxExtrapolationSeconds: 0.12
  });
  const shellHit = createShellHit(720, 12.1);

  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 0,
      tickIndex: 714,
      elapsedSeconds: 12,
      positionX: 0,
      velocityX: 20,
      headingRadians: 0
    }),
    1000
  );
  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 1,
      tickIndex: 720,
      elapsedSeconds: 12.1,
      positionX: 2,
      velocityX: 5.6,
      headingRadians: 0.2,
      stunSeconds: shellHit.effect.stunSeconds,
      spinoutSeconds: shellHit.effect.spinoutSeconds,
      spinoutAngularVelocity: shellHit.effect.spinoutAngularVelocity,
      itemHitImmunitySeconds: shellHit.effect.hitImmunitySeconds,
      hitFeedbackSeconds: shellHit.effect.hitFeedbackSeconds,
      lastHitItemType: shellHit.effect.itemType,
      shellHits: [shellHit]
    }),
    1100
  );

  const activeHit = requireSmoothedTransform(smoother.sample(1100));
  const decayedHit = requireSmoothedTransform(smoother.sample(1600));

  assertEqual(
    activeHit.lastHitItemType,
    "shell",
    "shell-hit feedback item type streams to smoother"
  );
  assertClose(
    activeHit.stunSeconds,
    shellHit.effect.stunSeconds,
    0.000001,
    "shell-hit stun timer streams to smoother"
  );
  assertClose(
    activeHit.spinoutSeconds,
    shellHit.effect.spinoutSeconds,
    0.000001,
    "shell-hit spinout timer streams to smoother"
  );
  assertClose(
    activeHit.itemHitImmunitySeconds,
    shellHit.effect.hitImmunitySeconds,
    0.000001,
    "shell-hit immunity timer streams to smoother"
  );
  assert(
    Math.abs(activeHit.spinoutAngularVelocity) > 0,
    "shell-hit spinout angular velocity streams to smoother"
  );
  assert(
    decayedHit.hitFeedbackSeconds < activeHit.hitFeedbackSeconds,
    "shell-hit feedback timer decays in smoother presentation"
  );
  assert(
    decayedHit.itemHitImmunitySeconds < activeHit.itemHitImmunitySeconds,
    "shell-hit immunity timer decays in smoother presentation"
  );
}

function validateSmootherReplaysStackedItemHitEffectsDeterministically(): void {
  const smoother = new RemoteKartTransformSmoother({
    expectedHostPeerId: HOST_PEER_ID,
    interpolationDelaySeconds: 0,
    maxExtrapolationSeconds: 0.12
  });
  const firstHit = createShellHit(1800, 30);
  const secondHit = createShellHit(1806, 30.1);
  const secondHitWithOppositeSpin = {
    ...secondHit,
    effect: {
      ...secondHit.effect,
      spinoutAngularVelocity: -secondHit.effect.spinoutAngularVelocity
    }
  } satisfies KartShellHitSnapshot;
  const secondsBetweenHits = secondHit.elapsedSeconds - firstHit.elapsedSeconds;
  const expectedStunSeconds = Math.max(
    0,
    firstHit.effect.stunSeconds - secondsBetweenHits
  );
  const expectedSpinoutSeconds = Math.max(
    0,
    firstHit.effect.spinoutSeconds - secondsBetweenHits
  );
  const expectedFeedbackSeconds = Math.max(
    0,
    firstHit.effect.hitFeedbackSeconds - secondsBetweenHits
  );
  const expectedImmunitySeconds = Math.max(
    0,
    firstHit.effect.hitImmunitySeconds - secondsBetweenHits
  );

  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 0,
      tickIndex: 1806,
      elapsedSeconds: 30.1,
      positionX: 12,
      velocityX: 20,
      headingRadians: 0,
      shellHits: [secondHitWithOppositeSpin, firstHit],
      extraRacers: [
        createGuestRacerTransform({
          positionX: 16,
          velocityX: 5,
          headingRadians: 0.2
        })
      ]
    }),
    1000
  );

  const stackedHit = requireSmoothedTransformForRacer(
    smoother.sample(1000),
    GUEST_RACER_ID
  );

  assertClose(
    stackedHit.stunSeconds,
    expectedStunSeconds,
    0.000001,
    "duplicate shell hit replay leaves active stun on its original timer"
  );
  assertClose(
    stackedHit.spinoutSeconds,
    expectedSpinoutSeconds,
    0.000001,
    "duplicate shell hit replay leaves active spinout on its original timer"
  );
  assertClose(
    stackedHit.spinoutAngularVelocity,
    firstHit.effect.spinoutAngularVelocity,
    0.000001,
    "duplicate shell hit replay does not replace spinout angular velocity"
  );
  assertClose(
    stackedHit.hitFeedbackSeconds,
    expectedFeedbackSeconds,
    0.000001,
    "duplicate shell hit replay does not extend feedback during spinout"
  );
  assertClose(
    stackedHit.itemHitImmunitySeconds,
    expectedImmunitySeconds,
    0.000001,
    "duplicate shell hit replay does not extend immunity during spinout"
  );
  assertEqual(
    stackedHit.lastHitItemType,
    "shell",
    "stacked shell hit replay keeps the active hit marker"
  );

  const expiredHit = requireSmoothedTransformForRacer(
    smoother.sample(3000),
    GUEST_RACER_ID
  );

  assertEqual(
    expiredHit.stunSeconds,
    0,
    "stacked stun expires deterministically"
  );
  assertEqual(
    expiredHit.spinoutSeconds,
    0,
    "stacked spinout expires deterministically"
  );
  assertEqual(
    expiredHit.spinoutAngularVelocity,
    0,
    "stacked spinout angular velocity clears on expiry"
  );
  assertEqual(
    expiredHit.itemHitImmunitySeconds,
    0,
    "stacked hit immunity expires deterministically"
  );
  assertEqual(
    expiredHit.hitFeedbackSeconds,
    0,
    "stacked hit feedback expires deterministically"
  );
  assertEqual(
    expiredHit.lastHitItemType,
    null,
    "stacked hit marker clears after all replayed effects expire"
  );
}

function validateSmootherSynchronizesShellHitCollisionTiming(): void {
  const smoother = new RemoteKartTransformSmoother({
    expectedHostPeerId: HOST_PEER_ID,
    interpolationDelaySeconds: 0.1,
    maxExtrapolationSeconds: 0.12
  });
  const shellHit = createShellHit(720, 12.1);
  const activeShell = createShellActiveItemSnapshot(shellHit.shellId, {
    positionX: 2,
    velocityX: 42,
    ttlSeconds: 2.5,
    ageSeconds: 0.1
  });
  const preHitSnapshot = createSnapshot({
    sequence: 0,
    tickIndex: 714,
    elapsedSeconds: 12,
    positionX: 0,
    velocityX: 20,
    headingRadians: 0,
    activeItems: [activeShell],
    extraRacers: [
      createGuestRacerTransform({
        positionX: 4,
        velocityX: 24,
        headingRadians: 0
      })
    ]
  });
  const hitSnapshot = createSnapshot({
    sequence: 1,
    tickIndex: 720,
    elapsedSeconds: 12.1,
    positionX: 2,
    velocityX: 20,
    headingRadians: 0,
    shellHits: [shellHit],
    extraRacers: [
      createGuestRacerTransform({
        positionX: 4.2,
        velocityX: 5.6,
        headingRadians: 0.2,
        stunSeconds: shellHit.effect.stunSeconds,
        spinoutSeconds: shellHit.effect.spinoutSeconds,
        spinoutAngularVelocity: shellHit.effect.spinoutAngularVelocity,
        itemHitImmunitySeconds: shellHit.effect.hitImmunitySeconds,
        hitFeedbackSeconds: shellHit.effect.hitFeedbackSeconds,
        lastHitItemType: shellHit.effect.itemType
      })
    ]
  });

  acceptSnapshot(smoother, hitSnapshot, 1100);
  acceptSnapshot(smoother, preHitSnapshot, 1110);

  const beforeHit = requireSmoothedTransformForRacer(
    smoother.sample(1140),
    GUEST_RACER_ID
  );
  const beforeHitShell = requireActiveItemSnapshot(
    smoother.sampleActiveItems(1140)
  );

  assertEqual(
    beforeHit.lastHitItemType,
    null,
    "future shell hit does not leak item type before host hit time"
  );
  assertEqual(
    beforeHit.hitFeedbackSeconds,
    0,
    "future shell hit does not leak feedback before host hit time"
  );
  assertEqual(
    beforeHit.stunSeconds,
    0,
    "future shell hit does not leak stun before host hit time"
  );
  assertEqual(
    beforeHitShell.itemId,
    shellHit.shellId,
    "shell remains renderable before synchronized hit time"
  );

  const afterHit = requireSmoothedTransformForRacer(
    smoother.sample(1200),
    GUEST_RACER_ID
  );
  const afterHitItems = smoother.sampleActiveItems(1200);

  assertEqual(
    afterHit.lastHitItemType,
    "shell",
    "shell hit item type starts at host hit time"
  );
  assertClose(
    afterHit.hitFeedbackSeconds,
    shellHit.effect.hitFeedbackSeconds,
    0.000001,
    "shell hit feedback starts from authoritative event duration"
  );
  assertClose(
    afterHit.itemHitImmunitySeconds,
    shellHit.effect.hitImmunitySeconds,
    0.000001,
    "shell hit immunity starts from authoritative event duration"
  );
  assertEqual(
    afterHitItems.length,
    0,
    "shell active item is removed at synchronized hit time"
  );
}

function validateSmootherAdvancesActiveShellProjectilesEveryFrame(): void {
  const smoother = new RemoteKartTransformSmoother({
    expectedHostPeerId: HOST_PEER_ID,
    interpolationDelaySeconds: 0,
    maxExtrapolationSeconds: 0.12
  });
  const activeShell = createShellActiveItemSnapshot("shell-moving-1", {
    positionX: 2,
    velocityX: 42,
    armedSeconds: 0.08,
    ttlSeconds: 2,
    ageSeconds: 0
  });
  const snapshot = createSnapshot({
    sequence: 2,
    tickIndex: 60,
    elapsedSeconds: 1,
    positionX: 0,
    velocityX: 12,
    headingRadians: 0,
    activeItems: [activeShell]
  });

  acceptSnapshot(smoother, snapshot, 1000);

  const launchFrame = requireActiveItemSnapshot(
    smoother.sampleActiveItems(1000)
  );
  const nextFrame = requireActiveItemSnapshot(smoother.sampleActiveItems(1016));

  assert(
    nextFrame.position.x > launchFrame.position.x,
    "active shell projectile render position advances between frames"
  );
  assert(
    nextFrame.ageSeconds > launchFrame.ageSeconds,
    "active shell projectile render age advances between frames"
  );
  assert(
    nextFrame.armedSeconds < launchFrame.armedSeconds,
    "active shell projectile arming timer decays between frames"
  );
}

function validateTransformSnapshotsReplicateBananaHitSpinoutEvents(): void {
  const bananaHit = createBananaHit(840, 14.1);
  const snapshot = createSnapshot({
    sequence: 8,
    tickIndex: 840,
    elapsedSeconds: 14.1,
    positionX: 3,
    velocityX: 4,
    headingRadians: 0.4,
    stunSeconds: bananaHit.effect.stunSeconds,
    spinoutSeconds: bananaHit.effect.spinoutSeconds,
    spinoutAngularVelocity: bananaHit.effect.spinoutAngularVelocity,
    itemHitImmunitySeconds: bananaHit.effect.hitImmunitySeconds,
    hitFeedbackSeconds: bananaHit.effect.hitFeedbackSeconds,
    lastHitItemType: bananaHit.effect.itemType,
    bananaHits: [bananaHit]
  });
  const parsed = deserializeKartTransformSnapshot(
    serializeKartTransformSnapshot(snapshot)
  );
  const parsedBananaHit = parsed.bananaHits[0];

  assert(parsedBananaHit !== undefined, "banana-hit event snapshot round trips");
  assertEqual(
    parsedBananaHit.itemType,
    COMBAT_ITEM_REGISTRY.banana.type,
    "banana-hit item type streams"
  );
  assertEqual(
    parsedBananaHit.bananaId,
    bananaHit.bananaId,
    "banana-hit source banana id streams"
  );
  assertClose(
    parsedBananaHit.effect.spinoutSeconds,
    COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.spinoutSeconds,
    0.000001,
    "banana-hit spinout duration streams"
  );
  assertClose(
    parsedBananaHit.effect.hitFeedbackSeconds,
    COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.hitFeedbackSeconds,
    0.000001,
    "banana-hit feedback duration streams"
  );

  const smoother = new RemoteKartTransformSmoother({
    expectedHostPeerId: HOST_PEER_ID,
    interpolationDelaySeconds: 0,
    maxExtrapolationSeconds: 0.12
  });

  acceptSnapshot(smoother, snapshot, 1000);

  const activeHit = requireSmoothedTransform(smoother.sample(1000));
  const decayedHit = requireSmoothedTransform(smoother.sample(1300));

  assertEqual(
    activeHit.lastHitItemType,
    "banana",
    "banana-hit feedback item type streams to smoother"
  );
  assertClose(
    activeHit.spinoutSeconds,
    bananaHit.effect.spinoutSeconds,
    0.000001,
    "banana-hit spinout timer streams to smoother"
  );
  assert(
    Math.abs(activeHit.spinoutAngularVelocity) > 0,
    "banana-hit spinout angular velocity streams to smoother"
  );
  assert(
    decayedHit.hitFeedbackSeconds < activeHit.hitFeedbackSeconds,
    "banana-hit feedback timer decays in smoother presentation"
  );
}

function validateTransformSnapshotsReplicateActiveBananaObstacles(): void {
  const bananaObstacle = createBananaActiveItemSnapshot("banana-remote-1", {
    positionX: -4,
    positionZ: 8,
    orientationRadians: Math.PI / 3,
    armedSeconds: 0.35,
    ttlSeconds: 12,
    ageSeconds: 0
  });
  const snapshot = createSnapshot({
    sequence: 3,
    tickIndex: 900,
    elapsedSeconds: 15,
    positionX: 0,
    velocityX: 0,
    headingRadians: 0,
    activeItems: [bananaObstacle]
  });
  const parsed = deserializeKartTransformSnapshot(
    serializeKartTransformSnapshot(snapshot)
  );
  const parsedBanana = parsed.activeItems[0];

  assert(parsedBanana !== undefined, "banana active item snapshot round trips");
  assertEqual(parsedBanana.itemId, bananaObstacle.itemId, "banana item id streams");
  assertEqual(
    parsedBanana.networkId,
    bananaObstacle.itemId,
    "banana network id streams"
  );
  assertEqual(parsedBanana.type, "banana", "banana item type streams");
  assertEqual(parsedBanana.ownerId, HOST_RACER_ID, "banana owner id streams");
  assertEqual(parsedBanana.activeState, "active", "banana active state streams");
  assertEqual(parsedBanana.removed, false, "banana removed state streams");
  assertEqual(
    parsedBanana.ownerRacerId,
    HOST_RACER_ID,
    "banana owner streams"
  );
  assertClose(
    parsedBanana.position.x,
    bananaObstacle.position.x,
    0.000001,
    "banana position x streams"
  );
  assertClose(
    parsedBanana.orientationRadians ?? 0,
    bananaObstacle.orientationRadians ?? 0,
    0.000001,
    "banana orientation streams"
  );

  const smoother = new RemoteKartTransformSmoother({
    expectedHostPeerId: HOST_PEER_ID,
    interpolationDelaySeconds: 0,
    maxExtrapolationSeconds: 0.12
  });

  acceptSnapshot(smoother, snapshot, 1000);

  const initialRenderBanana = requireActiveItemSnapshot(
    smoother.sampleActiveItems(1040)
  );

  assertEqual(
    initialRenderBanana.itemId,
    bananaObstacle.itemId,
    "banana remains renderable after spawn packet"
  );
  assertClose(
    initialRenderBanana.armedSeconds,
    0.31,
    0.000001,
    "banana arm timer decays for presentation"
  );
  assertClose(
    initialRenderBanana.ttlSeconds,
    12,
    0.000001,
    "banana ttl remains stable for persistent hazard presentation"
  );

  const postLifetimeRenderBanana = requireActiveItemSnapshot(
    smoother.sampleActiveItems(13200)
  );

  assertEqual(
    postLifetimeRenderBanana.itemId,
    bananaObstacle.itemId,
    "banana remains renderable beyond its runtime ttl window"
  );
  assertClose(
    postLifetimeRenderBanana.ttlSeconds,
    12,
    0.000001,
    "banana ttl does not drive smoother despawn"
  );

  const nextBanana = createBananaActiveItemSnapshot("banana-remote-1", {
    positionX: -4,
    positionZ: 8,
    orientationRadians: Math.PI / 3,
    armedSeconds: 0.25,
    ttlSeconds: 11.9,
    ageSeconds: 0.1
  });

  acceptSnapshot(
    smoother,
    createSnapshot({
      sequence: 4,
      tickIndex: 906,
      elapsedSeconds: 15.1,
      positionX: 1,
      velocityX: 0,
      headingRadians: 0,
      activeItems: [nextBanana]
    }),
    1100
  );

  const persistedRenderBanana = requireActiveItemSnapshot(
    smoother.sampleActiveItems(1120)
  );

  assertEqual(
    persistedRenderBanana.itemId,
    bananaObstacle.itemId,
    "banana keeps stable id across race updates"
  );
  assertClose(
    persistedRenderBanana.position.x,
    nextBanana.position.x,
    0.000001,
    "banana keeps authoritative position across race updates"
  );
  assertClose(
    persistedRenderBanana.orientationRadians ?? 0,
    nextBanana.orientationRadians ?? 0,
    0.000001,
    "banana keeps orientation across race updates"
  );
}

function validateSmootherRejectsBadPackets(): void {
  const smoother = new RemoteKartTransformSmoother({
    expectedHostPeerId: HOST_PEER_ID,
    maxPayloadBytes: 1024
  });
  const wrongHost = smoother.accept(
    serializeKartTransformSnapshot({
      ...createSnapshot({
        sequence: 0,
        tickIndex: 1,
        elapsedSeconds: 0.1,
        positionX: 0,
        velocityX: 0,
        headingRadians: 0
      }),
      hostPeerId: "intruder"
    }),
    1000
  );

  assert(!wrongHost.accepted, "unexpected host is rejected");
  assertEqual(wrongHost.reason, "unexpected-host", "host rejection reason");

  const accepted = smoother.accept(
    serializeKartTransformSnapshot(
      createSnapshot({
        sequence: 1,
        tickIndex: 2,
        elapsedSeconds: 0.2,
        positionX: 1,
        velocityX: 0,
        headingRadians: 0
      })
    ),
    1010
  );

  assert(accepted.accepted, "valid transform snapshot is accepted");

  const duplicate = smoother.accept(
    serializeKartTransformSnapshot(
      createSnapshot({
        sequence: 1,
        tickIndex: 2,
        elapsedSeconds: 0.2,
        positionX: 1,
        velocityX: 0,
        headingRadians: 0
      })
    ),
    1020
  );

  assert(!duplicate.accepted, "duplicate transform snapshot is rejected");
  assertEqual(
    duplicate.reason,
    "duplicate-sequence",
    "duplicate rejection reason"
  );
}

function acceptSnapshot(
  smoother: RemoteKartTransformSmoother,
  snapshot: KartTransformSnapshot,
  receivedAt: number
): void {
  const result = smoother.accept(
    serializeKartTransformSnapshot(snapshot),
    receivedAt
  );

  assert(result.accepted, "snapshot should be accepted into transform smoother");
}

function createSnapshot(options: {
  readonly sequence: number;
  readonly tickIndex: number;
  readonly elapsedSeconds: number;
  readonly positionX: number;
  readonly positionZ?: number;
  readonly velocityX: number;
  readonly velocityZ?: number;
  readonly headingRadians: number;
  readonly heldItem?: KartRacerTransform["heldItem"];
  readonly boostSeconds?: number;
  readonly shieldSeconds?: number;
  readonly stunSeconds?: number;
  readonly spinoutSeconds?: number;
  readonly spinoutAngularVelocity?: number;
  readonly itemHitImmunitySeconds?: number;
  readonly hitFeedbackSeconds?: number;
  readonly lastHitItemType?: KartRacerTransform["lastHitItemType"];
  readonly itemUseCooldownSeconds?: number;
  readonly itemPickups?: readonly KartItemPickupSnapshot[];
  readonly itemPickupCollections?: readonly KartItemPickupCollectionSnapshot[];
  readonly boostActivations?: readonly KartBoostActivationSnapshot[];
  readonly shellHits?: readonly KartShellHitSnapshot[];
  readonly bananaHits?: readonly KartBananaHitSnapshot[];
  readonly activeItems?: readonly KartActiveItemSnapshot[];
  readonly extraRacers?: readonly KartRacerTransform[];
}): KartTransformSnapshot {
  return createKartTransformSnapshot({
    hostPeerId: HOST_PEER_ID,
    sequence: options.sequence,
    tickIndex: options.tickIndex,
    elapsedSeconds: options.elapsedSeconds,
    capturedAt: 1000 + options.sequence,
    racers: [
      {
        racerId: HOST_RACER_ID,
        slotIndex: 0,
        position: {
          x: options.positionX,
          y: 0.45,
          z: options.positionZ ?? 0
        },
        velocity: {
          x: options.velocityX,
          y: 0,
          z: options.velocityZ ?? 0
        },
        forward: forwardFromHeading(options.headingRadians),
        headingRadians: options.headingRadians,
        speed: Math.abs(options.velocityX),
        heldItem: options.heldItem ?? null,
        boostSeconds: options.boostSeconds ?? 0,
        shieldSeconds: options.shieldSeconds ?? 0,
        stunSeconds: options.stunSeconds ?? 0,
        spinoutSeconds: options.spinoutSeconds ?? 0,
        spinoutAngularVelocity: options.spinoutAngularVelocity ?? 0,
        itemHitImmunitySeconds: options.itemHitImmunitySeconds ?? 0,
        hitFeedbackSeconds: options.hitFeedbackSeconds ?? 0,
        lastHitItemType: options.lastHitItemType ?? null,
        itemUseCooldownSeconds: options.itemUseCooldownSeconds ?? 0,
        updateCount: options.sequence
      },
      ...(options.extraRacers ?? [])
    ],
    ...(options.itemPickups === undefined
      ? {}
      : { itemPickups: options.itemPickups }),
    ...(options.itemPickupCollections === undefined
      ? {}
      : { itemPickupCollections: options.itemPickupCollections }),
    ...(options.boostActivations === undefined
      ? {}
      : { boostActivations: options.boostActivations }),
    ...(options.shellHits === undefined
      ? {}
      : { shellHits: options.shellHits }),
    ...(options.bananaHits === undefined
      ? {}
      : { bananaHits: options.bananaHits }),
    ...(options.activeItems === undefined
      ? {}
      : { activeItems: options.activeItems })
  });
}

function assertCoursePosition(
  position: { readonly x: number; readonly z: number },
  message: string
): void {
  const road = DEFAULT_RACE_TRACK_STATE.road;

  assert(road !== undefined, "default road geometry is available");
  assert(
    queryTrackSurfaceAtPoint(road, position, RACER_COLLISION_RADIUS)
      .withinCourseBoundary,
    message
  );
}

function createBoostPickupCollection(
  tickIndex: number,
  elapsedSeconds: number
): KartItemPickupCollectionSnapshot {
  return {
    eventId: `pickup-${tickIndex}`,
    pickupId: "boost-box",
    racerId: HOST_RACER_ID,
    itemType: COMBAT_ITEM_REGISTRY.boost.type,
    tickIndex,
    elapsedSeconds,
    cooldownSeconds: COMBAT_ITEM_REGISTRY.boost.respawnSeconds,
    respawnDeadlineElapsedSeconds:
      elapsedSeconds + COMBAT_ITEM_REGISTRY.boost.respawnSeconds
  };
}

function createBoostActivation(
  tickIndex: number,
  elapsedSeconds: number
): KartBoostActivationSnapshot {
  return {
    eventId: `boost-${tickIndex}`,
    racerId: HOST_RACER_ID,
    tickIndex,
    elapsedSeconds,
    durationSeconds: BOOST_DURATION_SECONDS,
    expiresAtElapsedSeconds: elapsedSeconds + BOOST_DURATION_SECONDS,
    cooldownSeconds:
      COMBAT_ITEM_REGISTRY.boost.defaultRuntimeConfig.useCooldownSeconds
  };
}

function createShellHit(
  tickIndex: number,
  elapsedSeconds: number
): KartShellHitSnapshot {
  return {
    eventId: `shell-hit-${tickIndex}`,
    itemType: COMBAT_ITEM_REGISTRY.shell.type,
    shellId: `shell-${tickIndex}`,
    sourceRacerId: HOST_RACER_ID,
    sourceSlotIndex: 0,
    targetRacerId: GUEST_RACER_ID,
    targetSlotIndex: 1,
    tickIndex,
    elapsedSeconds,
    impact: {
      position: { x: 4, y: 0.45, z: 8 },
      normal: { x: 1, y: 0, z: 0 },
      shellPosition: { x: 4.9, y: 0.45, z: 8 },
      shellVelocity: { x: 42, y: 0, z: 0 },
      shellRadius: COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.radius,
      targetHitboxCenter: { x: 4, y: 0.45, z: 8 },
      penetrationDepth: 0.25,
      relativeSpeed: 42
    },
    effect: {
      itemType: COMBAT_ITEM_REGISTRY.shell.type,
      stunSeconds: COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.hitStunSeconds,
      spinoutSeconds:
        COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.spinoutSeconds,
      spinoutAngularVelocity:
        COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.spinoutRadians /
        COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.spinoutSeconds,
      hitImmunitySeconds:
        COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.hitImmunitySeconds,
      hitFeedbackSeconds:
        COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.hitFeedbackSeconds,
      speedFactor: COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.hitSpeedFactor,
      speedBeforeHit: 24,
      speedAfterHit:
        24 * COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.hitSpeedFactor,
      headingDeltaRadians: 0
    }
  };
}

function createBananaHit(
  tickIndex: number,
  elapsedSeconds: number
): KartBananaHitSnapshot {
  return {
    eventId: `banana-hit-${tickIndex}`,
    itemType: COMBAT_ITEM_REGISTRY.banana.type,
    bananaId: `banana-${tickIndex}`,
    sourceRacerId: HOST_RACER_ID,
    sourceSlotIndex: 0,
    targetRacerId: GUEST_RACER_ID,
    targetSlotIndex: 1,
    tickIndex,
    elapsedSeconds,
    impact: {
      position: { x: 3, y: 0.45, z: 7 },
      normal: { x: -1, y: 0, z: 0 },
      shellPosition: { x: 2.2, y: 0.45, z: 7 },
      shellVelocity: { x: 0, y: 0, z: 0 },
      shellRadius: COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.radius,
      targetHitboxCenter: { x: 3, y: 0.45, z: 7 },
      penetrationDepth: 0.32,
      relativeSpeed: 16
    },
    effect: {
      itemType: COMBAT_ITEM_REGISTRY.banana.type,
      stunSeconds:
        COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.hitStunSeconds,
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
  };
}

function createGuestRacerTransform(options: {
  readonly positionX: number;
  readonly positionZ?: number;
  readonly velocityX: number;
  readonly velocityZ?: number;
  readonly headingRadians: number;
  readonly heldItem?: KartRacerTransform["heldItem"];
  readonly boostSeconds?: number;
  readonly shieldSeconds?: number;
  readonly stunSeconds?: number;
  readonly spinoutSeconds?: number;
  readonly spinoutAngularVelocity?: number;
  readonly itemHitImmunitySeconds?: number;
  readonly hitFeedbackSeconds?: number;
  readonly lastHitItemType?: KartRacerTransform["lastHitItemType"];
  readonly itemUseCooldownSeconds?: number;
}): KartRacerTransform {
  return {
    racerId: GUEST_RACER_ID,
    slotIndex: 1,
    position: {
      x: options.positionX,
      y: 0.45,
      z: options.positionZ ?? 0
    },
    velocity: {
      x: options.velocityX,
      y: 0,
      z: options.velocityZ ?? 0
    },
    forward: forwardFromHeading(options.headingRadians),
    headingRadians: options.headingRadians,
    speed: Math.abs(options.velocityX),
    heldItem: options.heldItem ?? null,
    boostSeconds: options.boostSeconds ?? 0,
    shieldSeconds: options.shieldSeconds ?? 0,
    stunSeconds: options.stunSeconds ?? 0,
    spinoutSeconds: options.spinoutSeconds ?? 0,
    spinoutAngularVelocity: options.spinoutAngularVelocity ?? 0,
    itemHitImmunitySeconds: options.itemHitImmunitySeconds ?? 0,
    hitFeedbackSeconds: options.hitFeedbackSeconds ?? 0,
    lastHitItemType: options.lastHitItemType ?? null,
    itemUseCooldownSeconds: options.itemUseCooldownSeconds ?? 0,
    updateCount: 0
  };
}

function createShellActiveItemSnapshot(
  itemId: string,
  options: {
    readonly positionX?: number;
    readonly positionZ?: number;
    readonly velocityX?: number;
    readonly velocityZ?: number;
    readonly armedSeconds?: number;
    readonly ttlSeconds?: number;
    readonly ageSeconds?: number;
  } = {}
): KartActiveItemSnapshot {
  const position = {
    x: options.positionX ?? 0,
    y: 0.45,
    z: options.positionZ ?? 0
  };
  const velocity = {
    x: options.velocityX ?? COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed,
    y: 0,
    z: options.velocityZ ?? 0
  };
  const ageSeconds = options.ageSeconds ?? 0;
  const ttlSeconds =
    options.ttlSeconds ??
    COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.ttlSeconds;
  const velocitySpeed = Math.hypot(velocity.x, velocity.z);
  const direction =
    velocitySpeed > Number.EPSILON
      ? { x: velocity.x / velocitySpeed, y: 0, z: velocity.z / velocitySpeed }
      : { x: 0, y: 0, z: 1 };

  return {
    itemId,
    networkId: itemId,
    type: COMBAT_ITEM_REGISTRY.shell.type,
    ownerId: HOST_RACER_ID,
    ownerRacerId: HOST_RACER_ID,
    ownerSlotIndex: 0,
    activeState: "active",
    removed: false,
    initialPosition: {
      x: position.x - velocity.x * ageSeconds,
      y: position.y - velocity.y * ageSeconds,
      z: position.z - velocity.z * ageSeconds
    },
    position,
    direction,
    velocity,
    lifetimeSeconds: Math.max(ageSeconds + ttlSeconds, ttlSeconds),
    radius: COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.radius,
    armedSeconds: options.armedSeconds ?? 0,
    ttlSeconds,
    ageSeconds,
    orientationRadians: null
  };
}

function createBananaActiveItemSnapshot(
  itemId: string,
  options: {
    readonly positionX?: number;
    readonly positionZ?: number;
    readonly orientationRadians?: number;
    readonly armedSeconds?: number;
    readonly ttlSeconds?: number;
    readonly ageSeconds?: number;
  } = {}
): KartActiveItemSnapshot {
  const position = {
    x: options.positionX ?? -3,
    y: 0.45,
    z: options.positionZ ?? 7
  };
  const ageSeconds = options.ageSeconds ?? 0;
  const ttlSeconds =
    options.ttlSeconds ??
    COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.ttlSeconds;

  return {
    itemId,
    networkId: itemId,
    type: COMBAT_ITEM_REGISTRY.banana.type,
    ownerId: HOST_RACER_ID,
    ownerRacerId: HOST_RACER_ID,
    ownerSlotIndex: 0,
    activeState: "active",
    removed: false,
    initialPosition: position,
    position,
    direction: { x: 0, y: 0, z: 0 },
    velocity: {
      x: 0,
      y: 0,
      z: 0
    },
    lifetimeSeconds: Math.max(ageSeconds + ttlSeconds, ttlSeconds),
    radius: COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.radius,
    armedSeconds:
      options.armedSeconds ??
      COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.armSeconds,
    ttlSeconds,
    ageSeconds,
    orientationRadians: options.orientationRadians ?? 0
  };
}

function requireActiveItemSnapshot(
  snapshots: readonly KartActiveItemSnapshot[]
): KartActiveItemSnapshot {
  const snapshot = snapshots[0];

  if (snapshot === undefined) {
    throw new Error("Expected active item snapshot.");
  }

  return snapshot;
}

function requireSmoothedTransform(
  transforms: ReadonlyMap<string, SmoothedKartTransform>
): SmoothedKartTransform {
  return requireSmoothedTransformForRacer(transforms, HOST_RACER_ID);
}

function requireSmoothedTransformForRacer(
  transforms: ReadonlyMap<string, SmoothedKartTransform>,
  racerId: string
): SmoothedKartTransform {
  const transform = transforms.get(racerId);

  if (transform === undefined) {
    throw new Error(`Expected smoothed racer transform for ${racerId}.`);
  }

  return transform;
}

function requireFirstRacerTransform(
  snapshot: KartTransformSnapshot
): KartRacerTransform {
  const transform = snapshot.racers[0];

  if (transform === undefined) {
    throw new Error("Expected snapshot to include a racer transform.");
  }

  return transform;
}

function forwardFromHeading(headingRadians: number): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
} {
  return {
    x: Math.sin(headingRadians),
    y: 0,
    z: Math.cos(headingRadians)
  };
}

function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertClose(
  actual: number,
  expected: number,
  tolerance: number,
  message: string
): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message}: expected ${expected}, got ${actual}.`);
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
