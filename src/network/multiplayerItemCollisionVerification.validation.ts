import type { Vector3 } from "../config/aiRacers";
import { DEFAULT_TRACK_DEFINITION } from "../config/tracks";
import {
  COMBAT_ITEM_REGISTRY,
  createRaceSessionFromStartRoster,
  refreshRacerCollisionBounds,
  type BananaObstacleState,
  type CombatItemType,
  type RaceBananaHitEvent,
  type RaceSession,
  type RaceSessionRacerControllerPath,
  type RaceSessionRacerState,
  type RaceTrackObstacle,
  type ShellProjectileState
} from "../race/raceSession";
import {
  createRaceStartRoster,
  type HumanRaceStartRacerInput
} from "../race/raceStartRoster";
import {
  deserializeKartGameplayMessageAs,
  serializeKartGameplayMessage
} from "./gameplayMessage";
import { KART_GAMEPLAY_MESSAGE_TYPES } from "./kartInputSnapshot";
import {
  createKartItemCollisionOutcomeEventMessageFromBananaHitEvent,
  createKartItemCollisionOutcomeEventMessageFromShellHitEvent,
  createRaceBananaHitEventFromItemCollisionOutcomeMessage,
  createRaceShellHitEventFromItemCollisionOutcomeMessage,
  type KartItemCollisionOutcomeEventMessage
} from "./kartItemCollisionOutcomeEventMessage";

function main(): void {
  const shell = validateMultiplayerShellCollisionParity();
  const banana = validateMultiplayerBananaCollisionParity();
  const edgeCases = validateItemCollisionEdgeCases();

  console.info(
    "multiplayerItemCollisionVerification=ok",
    `shellItem=${shell.itemId}`,
    `shellGuestApplied=${shell.guestAppliedCount}`,
    `bananaItem=${banana.itemId}`,
    `bananaGuestApplied=${banana.guestAppliedCount}`,
    `obstacleBlockedShells=${edgeCases.obstacleBlockedShellHitCount}`,
    `boundaryBlockedShells=${edgeCases.boundaryBlockedShellHitCount}`,
    `unarmedCloseRangeHits=${edgeCases.unarmedCloseRangeShellHitCount}`,
    `armedCloseRangeHits=${edgeCases.armedCloseRangeShellHitCount}`,
    `shieldBlockedBananas=${edgeCases.shieldBlockedBananaHitCount}`
  );
}

function validateMultiplayerShellCollisionParity(): MultiplayerCollisionSummary {
  const harness = createMultiplayerCollisionHarness("shell");
  const hostShell = requireShellProjectileState(
    harness.host.session.shellProjectileStates[0],
    "host shell before collision"
  );
  const guestShell = requireShellProjectileState(
    harness.guest.session.shellProjectileStates[0],
    "guest shell before collision"
  );

  assertStringEqual(hostShell.id, guestShell.id, "mirrored shell id before hit");
  prepareRacerForItemCollision(harness.host.owner, 7);
  prepareRacerForItemCollision(harness.guest.owner, 7);
  prepareShellCollisionTarget(harness.host.target);
  prepareShellCollisionTarget(harness.guest.target);
  placeShellAtTargetOverlap(hostShell, harness.host.target);
  placeShellAtTargetOverlap(guestShell, harness.guest.target);

  const hostTick = harness.host.session.tick(0);
  const hostHit = hostTick.shellHits[0];

  assertEqual(hostTick.shellHits.length, 1, "host shell-hit event count");
  assert(hostHit !== undefined, "host shell-hit event exists");
  assertEqual(
    hostTick.bananaHits.length,
    0,
    "host shell collision does not emit banana hits"
  );
  assertStringEqual(hostHit.shellId, hostShell.id, "host shell-hit item id");
  assertStringEqual(
    hostHit.targetRacerId,
    harness.host.target.id,
    "host shell-hit target"
  );
  assertEqual(
    harness.host.session.shellProjectileStates.length,
    0,
    "host removes shell after collision"
  );

  const guestEvent = createRaceShellHitEventFromItemCollisionOutcomeMessage(
    sendOutcomeThroughGameplayPayload(
      createKartItemCollisionOutcomeEventMessageFromShellHitEvent({
        event: hostHit,
        hostPeerId: HOST_PEER_ID,
        sourceClientId: HOST_PEER_ID,
        sequence: 1,
        occurredAt: 1000
      })
    )
  );
  const guestFirstApply = harness.guest.session.applyShellHitEvent(guestEvent);
  const guestSecondApply = harness.guest.session.applyShellHitEvent(guestEvent);
  const hostReplayApply = harness.host.session.applyShellHitEvent(guestEvent);

  assertEqual(guestFirstApply, true, "guest accepts shell outcome once");
  assertEqual(guestSecondApply, false, "guest rejects duplicate shell outcome");
  assertEqual(hostReplayApply, false, "host rejects replayed shell outcome");
  assertEqual(
    harness.guest.session.shellProjectileStates.length,
    0,
    "guest removes same shell after authoritative outcome"
  );
  assertSpinoutStateParity(
    harness.host.target,
    harness.guest.target,
    "shell",
    "shell collision"
  );

  return {
    itemId: hostHit.shellId,
    guestAppliedCount: guestFirstApply ? 1 : 0
  };
}

function validateMultiplayerBananaCollisionParity(): MultiplayerCollisionSummary {
  const harness = createMultiplayerCollisionHarness("banana");
  const hostBanana = requireBananaObstacleState(
    harness.host.session.bananaObstacleStates[0],
    "host banana before collision"
  );
  const guestBanana = requireBananaObstacleState(
    harness.guest.session.bananaObstacleStates[0],
    "guest banana before collision"
  );

  assertStringEqual(
    hostBanana.id,
    guestBanana.id,
    "mirrored banana id before hit"
  );
  prepareRacerForItemCollision(harness.host.owner, 7);
  prepareRacerForItemCollision(harness.guest.owner, 7);
  prepareBananaCollisionTarget(harness.host.target);
  prepareBananaCollisionTarget(harness.guest.target);
  placeBananaAtTargetOverlap(hostBanana, harness.host.target);
  placeBananaAtTargetOverlap(guestBanana, harness.guest.target);

  const hostTick = harness.host.session.tick(0);
  const hostHit = hostTick.bananaHits[0];

  assertEqual(hostTick.bananaHits.length, 1, "host banana-hit event count");
  assert(hostHit !== undefined, "host banana-hit event exists");
  assertEqual(
    hostTick.shellHits.length,
    0,
    "host banana collision does not emit shell hits"
  );
  assertStringEqual(hostHit.bananaId, hostBanana.id, "host banana-hit item id");
  assertEqual(
    hostTick.bananaRemovals.length,
    1,
    "host emits one banana removal for collision"
  );
  assertStringEqual(
    hostTick.bananaRemovals[0]?.bananaId ?? "",
    hostBanana.id,
    "host banana removal references hit banana"
  );
  assertEqual(
    harness.host.session.bananaObstacleStates.length,
    0,
    "host removes banana after collision"
  );

  const guestEvent = createRaceBananaHitEventFromItemCollisionOutcomeMessage(
    sendOutcomeThroughGameplayPayload(
      createKartItemCollisionOutcomeEventMessageFromBananaHitEvent({
        event: hostHit,
        hostPeerId: HOST_PEER_ID,
        sourceClientId: HOST_PEER_ID,
        sequence: 2,
        occurredAt: 1100
      })
    )
  );
  const guestFirstApply = harness.guest.session.applyBananaHitEvent(guestEvent);
  const guestSecondApply = harness.guest.session.applyBananaHitEvent(guestEvent);
  const hostReplayApply = harness.host.session.applyBananaHitEvent(guestEvent);

  assertEqual(guestFirstApply, true, "guest accepts banana outcome once");
  assertEqual(guestSecondApply, false, "guest rejects duplicate banana outcome");
  assertEqual(hostReplayApply, false, "host rejects replayed banana outcome");
  assertEqual(
    harness.guest.session.bananaObstacleStates.length,
    0,
    "guest removes same banana after authoritative outcome"
  );
  assertEqual(
    harness.guest.session.activeBananaHazardEntityStates.length,
    0,
    "guest leaves no active banana hazard entity after outcome"
  );
  assertBananaHazardRemovalParity(
    harness.host.session,
    harness.guest.session,
    hostBanana.id,
    hostHit
  );
  assertSpinoutStateParity(
    harness.host.target,
    harness.guest.target,
    "banana",
    "banana collision"
  );

  return {
    itemId: hostHit.bananaId,
    guestAppliedCount: guestFirstApply ? 1 : 0
  };
}

function validateItemCollisionEdgeCases(): ItemCollisionEdgeCaseSummary {
  const obstacleBlockedShellHitCount =
    validateShellObstacleBlocksFalsePositive();
  const boundaryBlockedShellHitCount =
    validateShellCourseBoundaryBlocksFalsePositive();
  const unarmedCloseRangeShellHitCount =
    validateUnarmedCloseRangeShellDoesNotHit();
  const armedCloseRangeShellHitCount = validateArmedCloseRangeShellStillHits();
  const shieldBlockedBananaHitCount = validateShieldBlocksBananaTrap();

  return {
    obstacleBlockedShellHitCount,
    boundaryBlockedShellHitCount,
    unarmedCloseRangeShellHitCount,
    armedCloseRangeShellHitCount,
    shieldBlockedBananaHitCount
  };
}

function validateShellObstacleBlocksFalsePositive(): number {
  const obstacle = createValidationObstacle("item-wall-oil-drum", {
    x: 25,
    y: 0.45,
    z: -55
  });
  const session = createItemCollisionRuleSession([obstacle]);
  const owner = requireRacerState(session.humanRacerStates[0], "wall owner");
  const target = requireRacerState(session.humanRacerStates[1], "wall target");

  parkOtherRacersAwayFromItemPath(session, owner.id);
  placeRacerForDirectionalShell(
    owner,
    { x: 20, y: 0.45, z: -55 },
    Math.PI / 2
  );
  placeRacerForDirectionalShell(
    target,
    { x: 29, y: 0.45, z: -55 },
    Math.PI / 2
  );

  const shell = spawnDirectionalShell(session, owner, "obstacle blocker");

  shell.armedSeconds = 0;
  shell.position = { x: 22, y: 0.45, z: -55 };
  shell.speed = 120;
  shell.velocity = { x: 120, y: 0, z: 0 };

  const tick = session.tick(1 / 15, {
    controllerPaths: createRemoteSnapshotControllerPaths(session)
  });

  assertEqual(
    tick.shellHits.length,
    0,
    "shell obstacle blocks target behind wall"
  );
  assertEqual(
    session.shellProjectileStates.length,
    0,
    "shell is destroyed by blocking oil-drum obstacle"
  );
  assertEqual(target.spinoutSeconds, 0, "blocked obstacle shell applies no hit");

  return tick.shellHits.length;
}

function validateShellCourseBoundaryBlocksFalsePositive(): number {
  const session = createItemCollisionRuleSession();
  const owner = requireRacerState(
    session.humanRacerStates[0],
    "boundary owner"
  );
  const target = requireRacerState(
    session.humanRacerStates[1],
    "boundary target"
  );

  parkOtherRacersAwayFromItemPath(session, owner.id);
  placeRacerForDirectionalShell(
    owner,
    { x: 55, y: 0.45, z: -55 },
    Math.PI / 2
  );
  placeRacerForDirectionalShell(
    target,
    { x: 90, y: 0.45, z: -55 },
    Math.PI / 2
  );

  const shell = spawnDirectionalShell(session, owner, "boundary blocker");

  shell.armedSeconds = 0;
  shell.position = { x: 55, y: 0.45, z: -55 };
  shell.speed = 900;
  shell.velocity = { x: 900, y: 0, z: 0 };

  const tick = session.tick(1 / 15, {
    controllerPaths: createRemoteSnapshotControllerPaths(session)
  });

  assertEqual(
    tick.shellHits.length,
    0,
    "course boundary blocks shell target outside the wall"
  );
  assertEqual(
    session.shellProjectileStates.length,
    0,
    "shell despawns at course boundary before target overlap"
  );
  assertEqual(target.spinoutSeconds, 0, "boundary-blocked shell applies no hit");

  return tick.shellHits.length;
}

function validateUnarmedCloseRangeShellDoesNotHit(): number {
  const session = createItemCollisionRuleSession();
  const owner = requireRacerState(
    session.humanRacerStates[0],
    "unarmed close owner"
  );
  const target = requireRacerState(
    session.humanRacerStates[1],
    "unarmed close target"
  );

  parkOtherRacersAwayFromItemPath(session, owner.id);
  placeRacerForDirectionalShell(
    owner,
    { x: 20, y: 0.45, z: -55 },
    Math.PI / 2
  );
  placeRacerForDirectionalShell(
    target,
    { x: 19, y: 0.45, z: -55 },
    Math.PI / 2
  );

  const shell = spawnDirectionalShell(session, owner, "unarmed close range");

  shell.armedSeconds = 0.05;
  shell.position = { x: 20, y: 0.45, z: -55 };
  shell.speed = COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed;
  shell.velocity = {
    x: COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed,
    y: 0,
    z: 0
  };

  const tick = session.tick(1 / 15, {
    controllerPaths: createRemoteSnapshotControllerPaths(session)
  });

  assertEqual(
    tick.shellHits.length,
    0,
    "unarmed launch overlap does not count as a close-range shell hit"
  );
  assertEqual(
    session.shellProjectileStates.length,
    1,
    "unarmed close-range shell remains active after passing the target"
  );
  assertEqual(
    target.spinoutSeconds,
    0,
    "unarmed close-range shell applies no hit"
  );

  return tick.shellHits.length;
}

function validateArmedCloseRangeShellStillHits(): number {
  const session = createItemCollisionRuleSession();
  const owner = requireRacerState(
    session.humanRacerStates[0],
    "armed close owner"
  );
  const target = requireRacerState(
    session.humanRacerStates[1],
    "armed close target"
  );

  parkOtherRacersAwayFromItemPath(session, owner.id);
  placeRacerForDirectionalShell(
    owner,
    { x: 20, y: 0.45, z: -55 },
    Math.PI / 2
  );
  placeRacerForDirectionalShell(
    target,
    { x: 20.2, y: 0.45, z: -55 },
    Math.PI / 2
  );

  const shell = spawnDirectionalShell(session, owner, "armed close range");

  shell.armedSeconds = 0;
  shell.position = { x: 20, y: 0.45, z: -55 };
  shell.speed = COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed;
  shell.velocity = {
    x: COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed,
    y: 0,
    z: 0
  };

  const tick = session.tick(0, {
    controllerPaths: createRemoteSnapshotControllerPaths(session)
  });

  assertEqual(
    tick.shellHits.length,
    1,
    "armed close-range shell overlap still resolves as a hit"
  );
  assertGreaterThan(
    target.spinoutSeconds,
    0,
    "armed close-range shell applies hit"
  );

  return tick.shellHits.length;
}

function validateShieldBlocksBananaTrap(): number {
  const session = createItemCollisionRuleSession();
  const owner = requireRacerState(
    session.humanRacerStates[0],
    "shield banana owner"
  );
  const target = requireRacerState(
    session.humanRacerStates[1],
    "shield banana target"
  );

  parkOtherRacersAwayFromItemPath(session, owner.id);
  prepareRacerForItemCollision(owner, 1);
  prepareBananaCollisionTarget(target);
  target.shieldSeconds = 1.25;

  spawnHeldRuleItem(session, owner, "banana", "shield banana");

  const banana = requireBananaObstacleState(
    session.bananaObstacleStates[0],
    "shield banana before collision"
  );

  placeBananaAtTargetOverlap(banana, target);

  const tick = session.tick(0, {
    controllerPaths: createRemoteSnapshotControllerPaths(session)
  });
  const hit = tick.bananaHits[0];

  assertEqual(tick.bananaHits.length, 1, "shielded banana hit event count");
  assert(hit !== undefined, "shielded banana hit exists");
  assertEqual(
    hit.effect.blockedByShield,
    true,
    "banana trap is blocked by shield"
  );
  assertEqual(target.shieldSeconds, 0, "banana consumes shield");
  assertEqual(target.spinoutSeconds, 0, "shield blocks banana spinout");
  assertEqual(
    session.bananaObstacleStates.length,
    0,
    "blocked banana trap is consumed"
  );

  return tick.bananaHits.length;
}

function createItemCollisionRuleSession(
  obstacles: readonly RaceTrackObstacle[] = []
): RaceSession {
  return createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs()),
    {
      obstacles,
      itemPickups: []
    }
  );
}

function createValidationObstacle(
  id: string,
  position: Vector3
): RaceTrackObstacle {
  return {
    id,
    position,
    radius: 1.2,
    halfHeight: 1,
    obstacleKind: "oil-drum",
    impactSpeedFactor: 0.35
  };
}

function placeRacerForDirectionalShell(
  racer: RaceSessionRacerState,
  position: Vector3,
  headingRadians: number
): void {
  racer.position = { ...position };
  racer.velocity = { x: 0, y: 0, z: 0 };
  racer.speed = 0;
  racer.headingRadians = headingRadians;
  racer.forward = {
    x: Math.sin(headingRadians),
    y: 0,
    z: Math.cos(headingRadians)
  };
  clearItemHitEffects(racer);
  refreshRacerCollisionBounds(racer);
}

function spawnDirectionalShell(
  session: RaceSession,
  owner: RaceSessionRacerState,
  label: string
): ShellProjectileState {
  spawnHeldRuleItem(session, owner, "shell", label);

  return requireShellProjectileState(
    session.shellProjectileStates[0],
    `${label} shell`
  );
}

function spawnHeldRuleItem(
  session: RaceSession,
  owner: RaceSessionRacerState,
  itemType: Exclude<CombatItemType, "boost">,
  label: string
): void {
  owner.itemUseCooldownSeconds = 0;
  owner.heldItem = COMBAT_ITEM_REGISTRY[itemType].type;
  session.setHumanInput(owner.id, { useItem: true });

  const tickResult = session.tick(0);

  session.setHumanInput(owner.id, { useItem: false });
  assertEqual(
    tickResult.itemUseActions.length,
    1,
    `${label} ${itemType} spawn action count`
  );
}

function createRemoteSnapshotControllerPaths(
  session: RaceSession
): Readonly<Record<string, RaceSessionRacerControllerPath>> {
  const controllerPaths: Record<string, RaceSessionRacerControllerPath> = {};

  for (const racer of session.racerStates) {
    controllerPaths[racer.id] = "remote-snapshot";
  }

  return controllerPaths;
}

function sendOutcomeThroughGameplayPayload<
  Message extends KartItemCollisionOutcomeEventMessage
>(message: Message): Message {
  assertEqual(
    message.itemConsumption.activeState,
    "removed",
    "collision outcome marks item removed"
  );
  assertEqual(
    message.itemConsumption.consumed,
    true,
    "collision outcome marks item consumed"
  );
  assertEqual(
    message.itemConsumption.despawned,
    true,
    "collision outcome marks item despawned"
  );
  assertStringEqual(
    message.itemConsumption.collisionEventId,
    message.eventId,
    "collision outcome consumption references hit event"
  );
  assertStringEqual(
    message.itemConsumption.consumedByRacerId,
    message.victimKartId,
    "collision outcome consumption target racer"
  );
  assertEqual(
    message.itemConsumption.consumedBySlotIndex,
    message.victimSlotIndex,
    "collision outcome consumption target slot"
  );

  const parsed = deserializeKartGameplayMessageAs(
    serializeKartGameplayMessage(message),
    KART_GAMEPLAY_MESSAGE_TYPES.ITEM_COLLISION_OUTCOME_EVENT
  );

  return parsed as Message;
}

function createMultiplayerCollisionHarness(
  itemType: Exclude<CombatItemType, "boost">
): MultiplayerCollisionHarness {
  const hostSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs()),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const guestSession = createRaceSessionFromStartRoster(
    createRaceStartRoster(createHumanRacerInputs()),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const host = createClientCollisionState(hostSession, "host");
  const guest = createClientCollisionState(guestSession, "guest");

  spawnHeldValidationItem(hostSession, host.owner, itemType, "host");
  spawnHeldValidationItem(guestSession, guest.owner, itemType, "guest");

  return { host, guest };
}

function createClientCollisionState(
  session: RaceSession,
  label: string
): MultiplayerClientCollisionState {
  return {
    session,
    owner: requireRacerState(session.humanRacerStates[0], `${label} owner`),
    target: requireRacerState(session.humanRacerStates[1], `${label} target`)
  };
}

function spawnHeldValidationItem(
  session: RaceSession,
  owner: RaceSessionRacerState,
  itemType: Exclude<CombatItemType, "boost">,
  label: string
): void {
  parkOtherRacersAwayFromItemPath(session, owner.id);
  prepareRacerForItemCollision(owner, 0);
  owner.itemUseCooldownSeconds = 0;
  owner.heldItem = COMBAT_ITEM_REGISTRY[itemType].type;
  session.setHumanInput(owner.id, { useItem: true });

  const tickResult = session.tick(0);

  assertEqual(
    tickResult.itemUseActions.length,
    1,
    `${label} ${itemType} spawn action count`
  );
}

function prepareShellCollisionTarget(target: RaceSessionRacerState): void {
  prepareRacerForItemCollision(target, 2);
  target.headingRadians = 0;
  target.forward = { x: 0, y: 0, z: 1 };
  target.speed = 12;
  target.velocity = { x: 0, y: 0, z: 12 };
  clearItemHitEffects(target);
  refreshRacerCollisionBounds(target);
}

function prepareBananaCollisionTarget(target: RaceSessionRacerState): void {
  prepareShellCollisionTarget(target);
}

function prepareRacerForItemCollision(
  racer: RaceSessionRacerState,
  centerPointIndex: number
): void {
  const centerPoint = requireTrackCenterPoint(centerPointIndex);

  racer.position = { ...centerPoint.position };
  racer.velocity = { x: 0, y: 0, z: 0 };
  racer.speed = 0;
  racer.headingRadians = 0;
  racer.forward = { x: 0, y: 0, z: 1 };
  refreshRacerCollisionBounds(racer);
}

function placeShellAtTargetOverlap(
  shell: ShellProjectileState,
  target: RaceSessionRacerState
): void {
  const targetBounds = refreshRacerCollisionBounds(target);

  shell.armedSeconds = 0;
  shell.position = {
    x:
      targetBounds.center.x +
      targetBounds.right.x * (targetBounds.halfWidth + shell.radius - 0.05),
    y: targetBounds.center.y,
    z:
      targetBounds.center.z +
      targetBounds.right.z * (targetBounds.halfWidth + shell.radius - 0.05)
  };
  shell.velocity = {
    x: -COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed,
    y: 0,
    z: 0
  };
}

function placeBananaAtTargetOverlap(
  banana: BananaObstacleState,
  target: RaceSessionRacerState
): void {
  const targetBounds = refreshRacerCollisionBounds(target);

  banana.armedSeconds = 0;
  banana.position = {
    x:
      targetBounds.center.x +
      targetBounds.right.x * (targetBounds.halfWidth + banana.radius - 0.05),
    y: targetBounds.center.y,
    z:
      targetBounds.center.z +
      targetBounds.right.z * (targetBounds.halfWidth + banana.radius - 0.05)
  };
  banana.velocity = { x: 0, y: 0, z: 0 };
}

function assertSpinoutStateParity(
  hostTarget: RaceSessionRacerState,
  guestTarget: RaceSessionRacerState,
  itemType: "shell" | "banana",
  label: string
): void {
  assertGreaterThan(hostTarget.spinoutSeconds, 0, `${label} host spinout`);
  assertGreaterThan(guestTarget.spinoutSeconds, 0, `${label} guest spinout`);
  assertAlmostEqual(
    guestTarget.stunSeconds,
    hostTarget.stunSeconds,
    `${label} stun timer parity`
  );
  assertAlmostEqual(
    guestTarget.spinoutSeconds,
    hostTarget.spinoutSeconds,
    `${label} spinout timer parity`
  );
  assertAlmostEqual(
    guestTarget.spinoutAngularVelocity,
    hostTarget.spinoutAngularVelocity,
    `${label} spinout angular velocity parity`
  );
  assertAlmostEqual(
    guestTarget.itemHitImmunitySeconds,
    hostTarget.itemHitImmunitySeconds,
    `${label} immunity timer parity`
  );
  assertAlmostEqual(
    guestTarget.hitFeedbackSeconds,
    hostTarget.hitFeedbackSeconds,
    `${label} feedback timer parity`
  );
  assertAlmostEqual(
    guestTarget.speed,
    hostTarget.speed,
    `${label} speed parity`
  );
  assertAlmostEqual(
    guestTarget.headingRadians,
    hostTarget.headingRadians,
    `${label} heading parity`
  );
  assertStringEqual(
    hostTarget.lastHitItemType ?? "",
    itemType,
    `${label} host last hit item`
  );
  assertStringEqual(
    guestTarget.lastHitItemType ?? "",
    itemType,
    `${label} guest last hit item`
  );

  const hostSpinout = hostTarget.timedEffects.spinout;
  const guestSpinout = guestTarget.timedEffects.spinout;

  assert(hostSpinout !== undefined, `${label} host timed spinout exists`);
  assert(guestSpinout !== undefined, `${label} guest timed spinout exists`);
  assertStringEqual(
    hostSpinout.sourceItemType ?? "",
    itemType,
    `${label} host timed spinout source`
  );
  assertStringEqual(
    guestSpinout.sourceItemType ?? "",
    itemType,
    `${label} guest timed spinout source`
  );
  assertAlmostEqual(
    guestSpinout.remainingSeconds,
    hostSpinout.remainingSeconds,
    `${label} timed spinout remaining parity`
  );
}

function assertBananaHazardRemovalParity(
  hostSession: RaceSession,
  guestSession: RaceSession,
  bananaId: string,
  hit: RaceBananaHitEvent
): void {
  const hostEntity = hostSession.bananaHazardEntityStates.find(
    (entity) => entity.id === bananaId
  );
  const guestEntity = guestSession.bananaHazardEntityStates.find(
    (entity) => entity.id === bananaId
  );

  assert(hostEntity !== undefined, "host banana entity remains inspectable");
  assert(guestEntity !== undefined, "guest banana entity remains inspectable");
  assertEqual(hostEntity.active, false, "host banana entity inactive");
  assertEqual(guestEntity.active, false, "guest banana entity inactive");
  assertStringEqual(
    hostEntity.activeState,
    guestEntity.activeState,
    "banana entity active-state removal parity"
  );
  assertStringEqual(
    guestEntity.deactivationReason ?? "",
    "collision",
    "guest banana entity collision removal reason"
  );
  assertStringEqual(
    guestEntity.collisionEventId ?? "",
    hit.eventId,
    "guest banana entity collision event id"
  );
  assertStringEqual(
    guestEntity.collidedRacerId ?? "",
    hit.targetRacerId,
    "guest banana entity collided racer id"
  );
}

function clearItemHitEffects(racer: RaceSessionRacerState): void {
  racer.stunSeconds = 0;
  racer.spinoutSeconds = 0;
  racer.spinoutAngularVelocity = 0;
  racer.itemHitImmunitySeconds = 0;
  racer.itemHitImmunityWindowSeconds = 0;
  racer.hitFeedbackSeconds = 0;
  racer.lastHitItemType = null;
  racer.recoverySeconds = 0;
  racer.recoveryDurationSeconds = 0;
  racer.recovering = false;
  racer.knockbackVelocity = { x: 0, y: 0, z: 0 };
  racer.hitSourceImmunitySecondsBySource = {};
  delete racer.timedEffects.stun;
  delete racer.timedEffects.spinout;
  delete racer.timedEffects.itemHitImmunity;
  delete racer.timedEffects.hitFeedback;
}

function parkOtherRacersAwayFromItemPath(
  session: RaceSession,
  ownerRacerId: string
): void {
  const parkingPointIndexes = [5, 6, 7] as const;
  let parkingSlot = 0;

  for (const racer of session.racerStates) {
    if (racer.id === ownerRacerId) {
      continue;
    }

    prepareRacerForItemCollision(
      racer,
      parkingPointIndexes[parkingSlot % parkingPointIndexes.length] ?? 5
    );
    parkingSlot += 1;
  }
}

function createHumanRacerInputs(): readonly HumanRaceStartRacerInput[] {
  return [
    {
      peerId: HOST_PEER_ID,
      displayName: "Host",
      slotIndex: 0,
      isHost: true
    },
    {
      peerId: GUEST_PEER_ID,
      displayName: "Guest",
      slotIndex: 1
    }
  ];
}

function requireTrackCenterPoint(index: number): {
  readonly position: Vector3;
} {
  const point = DEFAULT_TRACK_DEFINITION.road.centerline[index];

  if (point === undefined) {
    throw new Error(`Expected default track center point ${index}.`);
  }

  return point;
}

function requireRacerState(
  racer: RaceSessionRacerState | undefined,
  label: string
): RaceSessionRacerState {
  if (racer === undefined) {
    throw new Error(`Expected ${label} racer.`);
  }

  return racer;
}

function requireShellProjectileState(
  shell: ShellProjectileState | undefined,
  label: string
): ShellProjectileState {
  if (shell === undefined) {
    throw new Error(`Expected ${label}.`);
  }

  return shell;
}

function requireBananaObstacleState(
  banana: BananaObstacleState | undefined,
  label: string
): BananaObstacleState {
  if (banana === undefined) {
    throw new Error(`Expected ${label}.`);
  }

  return banana;
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

function assertStringEqual(actual: string, expected: string, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertAlmostEqual(
  actual: number,
  expected: number,
  message: string,
  epsilon = 0.000_001
): void {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertGreaterThan(actual: number, minimum: number, message: string): void {
  if (actual <= minimum) {
    throw new Error(`${message}: expected > ${minimum}, got ${actual}`);
  }
}

interface MultiplayerClientCollisionState {
  readonly session: RaceSession;
  readonly owner: RaceSessionRacerState;
  readonly target: RaceSessionRacerState;
}

interface MultiplayerCollisionHarness {
  readonly host: MultiplayerClientCollisionState;
  readonly guest: MultiplayerClientCollisionState;
}

interface MultiplayerCollisionSummary {
  readonly itemId: string;
  readonly guestAppliedCount: number;
}

interface ItemCollisionEdgeCaseSummary {
  readonly obstacleBlockedShellHitCount: number;
  readonly boundaryBlockedShellHitCount: number;
  readonly unarmedCloseRangeShellHitCount: number;
  readonly armedCloseRangeShellHitCount: number;
  readonly shieldBlockedBananaHitCount: number;
}

const HOST_PEER_ID = "host-peer";
const GUEST_PEER_ID = "guest-peer";

main();
