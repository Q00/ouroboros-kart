import { Body } from "cannon-es";

import {
  COMBAT_ITEM_REGISTRY,
  createRaceSessionFromStartRoster,
  refreshRacerCollisionBounds,
  type RaceSession,
  type RaceSessionRacerEligibilityState,
  type RaceSessionRacerState
} from "./raceSession";
import { createRaceStartRoster } from "./raceStartRoster";
import {
  createRacerTargetRegistry,
  type RacerTarget,
  type RacerTargetRegistry
} from "./racerTargetRegistry";

const HOST_PEER_ID = "host-peer";
const GUEST_PEER_ID = "guest-peer";
const HOST_RACER_ID = "human_1";
const GUEST_RACER_ID = "human_2";

interface MultiplayerTargetRegistryValidationResult {
  readonly targetCount: number;
  readonly localTargetId: string;
  readonly remoteTargetId: string;
  readonly aiTargetCount: number;
  readonly collisionPairCount: number;
  readonly remotePeerId: string | null;
}

interface ItemEligibilityValidationResult {
  readonly candidatesWhileImmune: number;
  readonly candidatesAfterImmunity: number;
  readonly includesOwner: boolean;
  readonly includesRemoteAfterImmunity: boolean;
}

interface ItemActivationTargetResolutionValidationResult {
  readonly boostCandidateCount: number;
  readonly shellRemoteCandidateCount: number;
  readonly shellAiCandidateCount: number;
  readonly bananaLocalCandidateCount: number;
  readonly bananaAiCandidateCount: number;
  readonly aiOwnedCandidateCount: number;
}

interface SharedPhysicsStateValidationResult {
  readonly humanBodyType: number;
  readonly aiBodyType: number;
  readonly aiCollisionBodyType: string;
  readonly aiBodyPositionSyncedAfterTick: boolean;
}

interface PerRacerEligibilitySystemsValidationResult {
  readonly eligibilityStateCount: number;
  readonly eligibleCollisionPairChecks: number;
  readonly collisionContactsWithFinishedRacer: number;
  readonly finishedPickupCollections: number;
  readonly finishedItemUseActions: number;
  readonly finishedShellHits: number;
  readonly activeShellsAfterFinishedOverlap: number;
}

function main(): void {
  const session = createMultiplayerRaceSession();
  const registry = session.createRacerTargetRegistry({
    localPeerId: HOST_PEER_ID
  });
  const multiplayer = validateMultiplayerTargetRegistry(session, registry);
  const itemEligibility = validateSharedItemEligibility(session);
  const itemActivationTargets = validateItemActivationTargetResolution();
  const sharedPhysicsState = validateSharedRacerPhysicsState(session);
  const perRacerEligibilitySystems = validatePerRacerEligibilitySystems();
  validateDuplicateTargetRejection(session);

  console.info(
    [
      "racerTargetRegistry=ok",
      `targets=${multiplayer.targetCount}`,
      `local=${multiplayer.localTargetId}`,
      `remote=${multiplayer.remoteTargetId}`,
      `remotePeer=${multiplayer.remotePeerId ?? "none"}`,
      `ai=${multiplayer.aiTargetCount}`,
      `pairs=${multiplayer.collisionPairCount}`,
      `immuneCandidates=${itemEligibility.candidatesWhileImmune}`,
      `readyCandidates=${itemEligibility.candidatesAfterImmunity}`,
      `boostTargets=${itemActivationTargets.boostCandidateCount}`,
      `shellRemoteTargets=${itemActivationTargets.shellRemoteCandidateCount}`,
      `shellAiTargets=${itemActivationTargets.shellAiCandidateCount}`,
      `bananaLocalTargets=${itemActivationTargets.bananaLocalCandidateCount}`,
      `bananaAiTargets=${itemActivationTargets.bananaAiCandidateCount}`,
      `aiOwnedTargets=${itemActivationTargets.aiOwnedCandidateCount}`,
      `humanBodyType=${sharedPhysicsState.humanBodyType}`,
      `aiBodyType=${sharedPhysicsState.aiBodyType}`,
      `aiCollisionBodyType=${sharedPhysicsState.aiCollisionBodyType}`,
      `aiBodySynced=${sharedPhysicsState.aiBodyPositionSyncedAfterTick}`,
      `eligibilityStates=${perRacerEligibilitySystems.eligibilityStateCount}`,
      `eligibleCollisionPairChecks=${
        perRacerEligibilitySystems.eligibleCollisionPairChecks
      }`,
      `finishedCollisionContacts=${
        perRacerEligibilitySystems.collisionContactsWithFinishedRacer
      }`,
      `finishedPickupCollections=${
        perRacerEligibilitySystems.finishedPickupCollections
      }`,
      `finishedItemUseActions=${
        perRacerEligibilitySystems.finishedItemUseActions
      }`,
      `finishedShellHits=${perRacerEligibilitySystems.finishedShellHits}`,
      `activeShellsAfterFinishedOverlap=${
        perRacerEligibilitySystems.activeShellsAfterFinishedOverlap
      }`
    ].join(" ")
  );
}

function validateMultiplayerTargetRegistry(
  session: RaceSession,
  registry: RacerTargetRegistry<RaceSessionRacerState>
): MultiplayerTargetRegistryValidationResult {
  assertEqual(registry.targets.length, 4, "all four racers are targetable");
  assertEqual(
    registry.localPlayerTargets.length,
    1,
    "host is the single local target"
  );
  assertEqual(
    registry.remotePlayerTargets.length,
    1,
    "guest is the single remote target"
  );
  assertEqual(
    registry.aiOpponentTargets.length,
    2,
    "remaining racers are AI targets"
  );

  const localTarget = registry.requireTarget(HOST_RACER_ID);
  const remoteTarget = registry.requireTarget(GUEST_RACER_ID);
  const aiTarget = requireValue(
    registry.aiOpponentTargets[0],
    "expected an AI target"
  );

  assertTargetCollisionMetadata(localTarget);
  assertTargetCollisionMetadata(remoteTarget);
  assertTargetCollisionMetadata(aiTarget);
  assertEqual(localTarget.kind, "local-player", "host target kind");
  assertEqual(remoteTarget.kind, "remote-player", "guest target kind");
  assertEqual(aiTarget.kind, "ai-opponent", "AI target kind");
  assertEqual(
    localTarget.stableId,
    HOST_RACER_ID,
    "host target exposes a network-stable racer id"
  );
  assertEqual(
    remoteTarget.stableId,
    GUEST_RACER_ID,
    "remote target exposes a network-stable racer id"
  );
  assertEqual(localTarget.peerId, HOST_PEER_ID, "host peer id is retained");
  assertEqual(remoteTarget.peerId, GUEST_PEER_ID, "guest peer id is retained");
  assertEqual(localTarget.isHost, true, "host flag is retained");
  assertEqual(remoteTarget.isHost, false, "guest host flag is false");
  assertEqual(
    localTarget.eligibility.canAcceptLocalInput,
    true,
    "local target accepts keyboard input"
  );
  assertEqual(
    localTarget.eligibility.canAcceptRemoteInput,
    false,
    "local target rejects remote input"
  );
  assertEqual(
    remoteTarget.eligibility.canAcceptRemoteInput,
    true,
    "remote target accepts RTC input"
  );
  assertEqual(
    aiTarget.eligibility.canRunAiController,
    true,
    "AI target can run AI controller"
  );
  assertEqual(
    registry.getTargetBySlot(localTarget.slotIndex)?.id,
    localTarget.id,
    "slot lookup resolves the same local target"
  );
  assertEqual(
    registry.getTargetByStableId(remoteTarget.stableId)?.id,
    remoteTarget.id,
    "stable id lookup resolves the same remote target"
  );
  assertEqual(
    registry.requireTargetByStableId(remoteTarget.stableId).kind,
    "remote-player",
    "required stable id lookup preserves remote target kind"
  );
  assertEqual(
    registry.getRacerCollisionPairs().length,
    6,
    "four racers expose six collision pairs"
  );
  assertEqual(
    session.getRacerTarget(GUEST_RACER_ID, {
      localPeerId: HOST_PEER_ID
    })?.kind,
    "remote-player",
    "race session exposes target lookup"
  );

  return {
    targetCount: registry.targets.length,
    localTargetId: localTarget.id,
    remoteTargetId: remoteTarget.id,
    aiTargetCount: registry.aiOpponentTargets.length,
    collisionPairCount: registry.getRacerCollisionPairs().length,
    remotePeerId: remoteTarget.peerId
  };
}

function validateSharedRacerPhysicsState(
  session: RaceSession
): SharedPhysicsStateValidationResult {
  const humanRacer = requireRacer(session, HOST_RACER_ID);
  const aiRacer = requireValue(
    session.aiRacerStates[0],
    "expected AI racer for shared physics state validation"
  );

  assertSharedPhysicsState(humanRacer, "human");
  assertSharedPhysicsState(aiRacer, "AI");

  session.tick(1 / 60);
  assertSharedPhysicsState(aiRacer, "AI after tick");

  const aiBodyPositionSyncedAfterTick =
    aiRacer.body.position.x === aiRacer.position.x &&
    aiRacer.body.position.y === aiRacer.position.y &&
    aiRacer.body.position.z === aiRacer.position.z;

  assertEqual(
    aiBodyPositionSyncedAfterTick,
    true,
    "AI Cannon body remains synchronized with race position after tick"
  );

  return {
    humanBodyType: humanRacer.body.type,
    aiBodyType: aiRacer.body.type,
    aiCollisionBodyType: aiRacer.collision.bodyType,
    aiBodyPositionSyncedAfterTick
  };
}

function validateSharedItemEligibility(
  session: RaceSession
): ItemEligibilityValidationResult {
  const guestRacer = requireRacer(session, GUEST_RACER_ID);

  guestRacer.itemHitImmunitySeconds = 1;

  const immuneRegistry = session.createRacerTargetRegistry({
    localPeerId: HOST_PEER_ID
  });
  const immuneCandidates = immuneRegistry.getItemHitCandidates(HOST_RACER_ID);

  assertEqual(
    immuneCandidates.some((target) => target.id === HOST_RACER_ID),
    false,
    "item targets exclude the item owner"
  );
  assertEqual(
    immuneCandidates.some((target) => target.id === GUEST_RACER_ID),
    false,
    "immune remote target is not eligible for item hits"
  );

  guestRacer.itemHitImmunitySeconds = 0;

  const readyRegistry = session.createRacerTargetRegistry({
    localPeerId: HOST_PEER_ID
  });
  const readyCandidates = readyRegistry.getItemHitCandidates(HOST_RACER_ID);
  const includesRemoteAfterImmunity = readyCandidates.some(
    (target) => target.id === GUEST_RACER_ID
  );

  assertEqual(
    includesRemoteAfterImmunity,
    true,
    "remote target becomes item-hit eligible after immunity"
  );

  return {
    candidatesWhileImmune: immuneCandidates.length,
    candidatesAfterImmunity: readyCandidates.length,
    includesOwner: immuneCandidates.some(
      (target) => target.id === HOST_RACER_ID
    ),
    includesRemoteAfterImmunity
  };
}

function validateItemActivationTargetResolution(): ItemActivationTargetResolutionValidationResult {
  const boostSession = createMultiplayerRaceSession();
  const boostOwner = requireRacer(boostSession, HOST_RACER_ID);

  boostOwner.heldItem = COMBAT_ITEM_REGISTRY.boost.type;
  boostSession.setHumanInput(boostOwner.id, { useItem: true });

  const boostAction = requireItemUseAction(
    boostSession.tick(0).itemUseActions[0],
    "boost activation action"
  );

  assertStringArrayEqual(
    boostAction.candidateAffectedRacerIds,
    [HOST_RACER_ID],
    "boost activation affects only the activating local racer"
  );
  assertStringArrayEqual(
    boostAction.candidateAffectedRacerIdsByKind.localPlayerRacerIds,
    [HOST_RACER_ID],
    "boost activation local target map"
  );

  const shellSession = createMultiplayerRaceSession();
  const shellOwner = requireRacer(shellSession, HOST_RACER_ID);
  const shellAiIds = shellSession.aiRacerStates.map((racer) => racer.id);

  shellOwner.heldItem = COMBAT_ITEM_REGISTRY.shell.type;
  shellSession.setHumanInput(shellOwner.id, { useItem: true });

  const shellAction = requireItemUseAction(
    shellSession.tick(0).itemUseActions[0],
    "shell activation action"
  );

  assertStringArrayEqual(
    shellAction.candidateAffectedRacerIdsByKind.localPlayerRacerIds,
    [],
    "shell activation excludes the local owner"
  );
  assertStringArrayEqual(
    shellAction.candidateAffectedRacerIdsByKind.remotePlayerRacerIds,
    [GUEST_RACER_ID],
    "shell activation maps remote racer candidates"
  );
  assertStringArrayEqual(
    shellAction.candidateAffectedRacerIdsByKind.aiOpponentRacerIds,
    shellAiIds,
    "shell activation maps AI racer candidates"
  );
  assertStringArrayEqual(
    shellAction.targetResolution.candidateAffectedRacerIds,
    [GUEST_RACER_ID, ...shellAiIds],
    "shell activation target resolution preserves slot order"
  );

  const bananaSession = createMultiplayerRaceSession();
  const bananaOwner = requireRacer(bananaSession, GUEST_RACER_ID);
  const bananaAiIds = bananaSession.aiRacerStates.map((racer) => racer.id);

  bananaOwner.heldItem = COMBAT_ITEM_REGISTRY.banana.type;
  bananaSession.setHumanInput(bananaOwner.id, { useItem: true });

  const bananaAction = requireItemUseAction(
    bananaSession.tick(0).itemUseActions[0],
    "banana activation action"
  );

  assertStringArrayEqual(
    bananaAction.candidateAffectedRacerIdsByKind.localPlayerRacerIds,
    [HOST_RACER_ID],
    "banana activation maps local racer candidates"
  );
  assertStringArrayEqual(
    bananaAction.candidateAffectedRacerIdsByKind.remotePlayerRacerIds,
    [],
    "banana activation excludes the remote owner"
  );
  assertStringArrayEqual(
    bananaAction.candidateAffectedRacerIdsByKind.aiOpponentRacerIds,
    bananaAiIds,
    "banana activation maps AI racer candidates"
  );

  const aiOwner = requireValue(
    bananaSession.aiRacerStates[0],
    "expected AI racer for activation target validation"
  );
  const otherAiIds = bananaSession.aiRacerStates
    .filter((racer) => racer.id !== aiOwner.id)
    .map((racer) => racer.id);
  const aiOwnedResolution = bananaSession.resolveItemActivationTargets(
    aiOwner.id,
    COMBAT_ITEM_REGISTRY.shell.type,
    "validation-ai-shell"
  );

  assertStringArrayEqual(
    aiOwnedResolution.candidateAffectedRacerIdsByKind.localPlayerRacerIds,
    [HOST_RACER_ID],
    "AI-owned activation maps local player candidates"
  );
  assertStringArrayEqual(
    aiOwnedResolution.candidateAffectedRacerIdsByKind.remotePlayerRacerIds,
    [GUEST_RACER_ID],
    "AI-owned activation maps remote player candidates"
  );
  assertStringArrayEqual(
    aiOwnedResolution.candidateAffectedRacerIdsByKind.aiOpponentRacerIds,
    otherAiIds,
    "AI-owned activation maps other AI candidates"
  );

  return {
    boostCandidateCount: boostAction.candidateAffectedRacerIds.length,
    shellRemoteCandidateCount:
      shellAction.candidateAffectedRacerIdsByKind.remotePlayerRacerIds.length,
    shellAiCandidateCount:
      shellAction.candidateAffectedRacerIdsByKind.aiOpponentRacerIds.length,
    bananaLocalCandidateCount:
      bananaAction.candidateAffectedRacerIdsByKind.localPlayerRacerIds.length,
    bananaAiCandidateCount:
      bananaAction.candidateAffectedRacerIdsByKind.aiOpponentRacerIds.length,
    aiOwnedCandidateCount: aiOwnedResolution.candidateAffectedRacerIds.length
  };
}

function validatePerRacerEligibilitySystems(): PerRacerEligibilitySystemsValidationResult {
  const eligibilitySession = createMultiplayerRaceSession();
  const eligibilityStates = configureMixedEligibilityRoster(eligibilitySession);
  const hostEligibility = requireEligibilityState(
    eligibilityStates,
    HOST_RACER_ID
  );
  const guestEligibility = requireEligibilityState(
    eligibilityStates,
    GUEST_RACER_ID
  );
  const finishedAi = requireValue(
    eligibilitySession.aiRacerStates[0],
    "finished AI eligibility validation racer"
  );
  const finishedEligibility = requireEligibilityState(
    eligibilityStates,
    finishedAi.id
  );

  assertEqual(
    eligibilityStates.length,
    4,
    "eligibility snapshot covers all four racer slots"
  );
  assertStringArrayEqual(
    eligibilityStates.map((state) => String(state.slotIndex)),
    ["0", "1", "2", "3"],
    "eligibility snapshot is ordered by racer slot"
  );
  assertEqual(
    hostEligibility.canUseHeldItem,
    true,
    "ready host item eligibility is per-racer"
  );
  assertEqual(
    hostEligibility.canCollectItemPickups,
    false,
    "ready host with full inventory cannot collect pickups"
  );
  assertEqual(
    guestEligibility.canReceiveItemHits,
    false,
    "immune guest item-hit eligibility is per-racer"
  );
  assertEqual(
    finishedEligibility.canRunAiController,
    false,
    "finished AI cannot run controller"
  );
  assertEqual(
    finishedEligibility.canParticipateInRacerCollisions,
    false,
    "finished AI is removed from racer collision eligibility"
  );
  assertEqual(
    finishedEligibility.canBlockActiveItems,
    false,
    "finished AI cannot block active items"
  );
  assertEqual(
    finishedEligibility.canCollectItemPickups,
    false,
    "finished AI cannot collect item pickups"
  );
  assertEqual(
    finishedEligibility.canUseHeldItem,
    false,
    "finished AI cannot use held items"
  );
  assertEqual(
    finishedEligibility.canReceiveItemHits,
    false,
    "finished AI cannot receive item hits"
  );

  const collision = validateFinishedRacerCollisionEligibility();
  const pickup = validateFinishedRacerPickupEligibility();
  const itemUse = validateFinishedRacerItemUseEligibility();
  const itemHit = validateFinishedRacerItemHitEligibility();

  return {
    eligibilityStateCount: eligibilityStates.length,
    eligibleCollisionPairChecks: collision.pairChecks,
    collisionContactsWithFinishedRacer: collision.contacts,
    finishedPickupCollections: pickup.collections,
    finishedItemUseActions: itemUse.itemUseActions,
    finishedShellHits: itemHit.shellHits,
    activeShellsAfterFinishedOverlap: itemHit.activeShells
  };
}

function configureMixedEligibilityRoster(
  session: RaceSession
): readonly RaceSessionRacerEligibilityState[] {
  const host = requireRacer(session, HOST_RACER_ID);
  const guest = requireRacer(session, GUEST_RACER_ID);
  const finishedAi = requireValue(
    session.aiRacerStates[0],
    "mixed eligibility finished AI"
  );

  host.heldItem = COMBAT_ITEM_REGISTRY.boost.type;
  host.itemUseCooldownSeconds = 0;
  guest.itemHitImmunitySeconds = 1;
  finishedAi.progress = {
    ...finishedAi.progress,
    finished: true
  };
  finishedAi.heldItem = COMBAT_ITEM_REGISTRY.shell.type;
  finishedAi.itemUseCooldownSeconds = 0;
  finishedAi.itemHitImmunitySeconds = 0;

  return session.createRacerEligibilitySnapshot({
    localPeerId: HOST_PEER_ID
  }).states;
}

function validateFinishedRacerCollisionEligibility(): {
  readonly pairChecks: number;
  readonly contacts: number;
} {
  const session = createMultiplayerRaceSession();
  const host = requireRacer(session, HOST_RACER_ID);
  const finishedAi = requireValue(
    session.aiRacerStates[0],
    "finished collision AI"
  );

  finishedAi.progress = {
    ...finishedAi.progress,
    finished: true
  };
  moveRacerToPosition(finishedAi, host.position);
  parkRacersAwayFromPoint(session, [host.id, finishedAi.id]);

  const tick = session.tick(0);

  assertEqual(
    tick.kartCollisionContacts,
    0,
    "finished overlapping racer is skipped by racer collision resolution"
  );

  return {
    pairChecks: tick.kartCollisionPairChecks,
    contacts: tick.kartCollisionContacts
  };
}

function validateFinishedRacerPickupEligibility(): {
  readonly collections: number;
} {
  const session = createMultiplayerRaceSession();
  const finishedAi = requireValue(
    session.aiRacerStates[0],
    "finished pickup AI"
  );
  const pickup = requireValue(
    session.itemPickupStates[0],
    "finished pickup validation item box"
  );

  finishedAi.progress = {
    ...finishedAi.progress,
    finished: true
  };
  finishedAi.heldItem = null;
  moveRacerToPosition(finishedAi, pickup.position);
  parkRacersAwayFromPoint(session, [finishedAi.id]);

  const tick = session.tick(0);

  assertEqual(
    tick.itemPickupCollections.length,
    0,
    "finished racer does not collect available item box"
  );
  assertEqual(
    finishedAi.heldItem,
    null,
    "finished racer inventory remains empty after blocked pickup"
  );

  return {
    collections: tick.itemPickupCollections.length
  };
}

function validateFinishedRacerItemUseEligibility(): {
  readonly itemUseActions: number;
} {
  const session = createMultiplayerRaceSession();
  const guest = requireRacer(session, GUEST_RACER_ID);

  guest.progress = {
    ...guest.progress,
    finished: true
  };
  guest.heldItem = COMBAT_ITEM_REGISTRY.shell.type;
  guest.itemUseCooldownSeconds = 0;
  session.setHumanInput(guest.id, { useItem: true });

  const tick = session.tick(0);

  assertEqual(
    tick.itemUseActions.length,
    0,
    "finished human racer cannot activate held item"
  );
  assertEqual(
    guest.heldItem,
    COMBAT_ITEM_REGISTRY.shell.type,
    "finished item-use block does not consume inventory"
  );

  return {
    itemUseActions: tick.itemUseActions.length
  };
}

function validateFinishedRacerItemHitEligibility(): {
  readonly shellHits: number;
  readonly activeShells: number;
} {
  const session = createMultiplayerRaceSession();
  const owner = requireRacer(session, HOST_RACER_ID);
  const finishedTarget = requireRacer(session, GUEST_RACER_ID);

  finishedTarget.progress = {
    ...finishedTarget.progress,
    finished: true
  };
  finishedTarget.itemHitImmunitySeconds = 0;
  owner.heldItem = COMBAT_ITEM_REGISTRY.shell.type;
  owner.itemUseCooldownSeconds = 0;
  session.setHumanInput(owner.id, { useItem: true });

  const spawnTick = session.tick(0);

  assertEqual(
    spawnTick.itemUseActions.length,
    1,
    "owner shell activation creates item-use action"
  );

  const shell = requireValue(
    session.shellProjectileStates[0],
    "finished target shell projectile"
  );
  const targetBounds = refreshRacerCollisionBounds(finishedTarget);

  shell.armedSeconds = 0;
  shell.position = { ...targetBounds.center };
  shell.velocity = {
    x: -COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed,
    y: 0,
    z: 0
  };

  const hitTick = session.tick(0);

  assertEqual(
    hitTick.shellHits.length,
    0,
    "finished racer does not receive active shell hit"
  );
  assertEqual(
    session.shellProjectileStates.length,
    1,
    "finished target does not consume overlapping shell"
  );

  return {
    shellHits: hitTick.shellHits.length,
    activeShells: session.shellProjectileStates.length
  };
}

function validateDuplicateTargetRejection(session: RaceSession): void {
  const duplicateSource = requireRacer(session, HOST_RACER_ID);

  assertThrows(
    () => createRacerTargetRegistry([duplicateSource, duplicateSource]),
    "duplicate target ids are rejected"
  );
}

function createMultiplayerRaceSession(): RaceSession {
  return createRaceSessionFromStartRoster(
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
    ]),
    {
      racerTargetRegistryOptions: {
        localPeerId: HOST_PEER_ID
      }
    }
  );
}

function assertTargetCollisionMetadata(
  target: RacerTarget<RaceSessionRacerState>
): void {
  assertEqual(target.stableId, target.id, "stable id mirrors racer id");
  assertEqual(target.collision.layer, "racer", "target collision layer");
  assertEqual(target.collision.bodyType, "dynamic", "target body type");
  assertEqual(
    target.collision.canCollideWithRacers,
    true,
    "target can collide with racers"
  );
  assertEqual(
    target.collision.canBlockItems,
    true,
    "target can block active items"
  );
  assertGreaterThan(
    target.collision.radius,
    0,
    "target collision radius is positive"
  );
  assertGreaterThan(
    target.collision.dimensions.length,
    0,
    "target collision dimensions are shared"
  );
  assertGreaterThan(
    target.collision.bounds.boundingRadius,
    0,
    "target collision bounds are shared"
  );
}

function assertSharedPhysicsState(
  racer: RaceSessionRacerState,
  label: string
): void {
  assertEqual(racer.body instanceof Body, true, `${label} body is Cannon body`);
  assertEqual(racer.body, racer.physics.body, `${label} body is shared`);
  assertEqual(
    racer.body.type,
    Body.DYNAMIC,
    `${label} body is dynamic`
  );
  assertEqual(
    racer.physics.position.x,
    racer.position.x,
    `${label} physics position x`
  );
  assertEqual(
    racer.physics.position.y,
    racer.position.y,
    `${label} physics position y`
  );
  assertEqual(
    racer.physics.position.z,
    racer.position.z,
    `${label} physics position z`
  );
  assertEqual(
    racer.physics.velocity.x,
    racer.velocity.x,
    `${label} physics velocity x`
  );
  assertEqual(
    racer.physics.velocity.y,
    racer.velocity.y,
    `${label} physics velocity y`
  );
  assertEqual(
    racer.physics.velocity.z,
    racer.velocity.z,
    `${label} physics velocity z`
  );
  assertEqual(
    racer.collision,
    racer.physics.collision,
    `${label} collision metadata is shared`
  );
  assertEqual(
    racer.collision.bounds,
    racer.collisionBounds,
    `${label} collision bounds are shared`
  );
  assertEqual(
    racer.collision.bodyType,
    "dynamic",
    `${label} collision body type`
  );
  assertEqual(racer.collision.layer, "racer", `${label} collision layer`);
  assertGreaterThan(
    racer.collision.radius,
    0,
    `${label} collision radius`
  );
}

function requireEligibilityState(
  states: readonly RaceSessionRacerEligibilityState[],
  racerId: string
): RaceSessionRacerEligibilityState {
  const state = states.find((candidate) => candidate.racerId === racerId);

  if (state === undefined) {
    throw new Error(`Expected eligibility state for racer: ${racerId}.`);
  }

  return state;
}

function requireRacer(
  session: RaceSession,
  racerId: string
): RaceSessionRacerState {
  const racer = session.getRacerState(racerId);

  if (racer === undefined) {
    throw new Error(`Expected racer to exist: ${racerId}.`);
  }

  return racer;
}

function moveRacerToPosition(
  racer: RaceSessionRacerState,
  position: Pick<RaceSessionRacerState["position"], "x" | "y" | "z">
): void {
  racer.position = { ...position };
  racer.velocity = { x: 0, y: 0, z: 0 };
  racer.knockbackVelocity = { x: 0, y: 0, z: 0 };
  racer.speed = 0;
  racer.body.position.set(position.x, position.y, position.z);
  racer.body.velocity.set(0, 0, 0);
  refreshRacerCollisionBounds(racer);
}

function parkRacersAwayFromPoint(
  session: RaceSession,
  activeRacerIds: readonly string[]
): void {
  const activeIds = new Set(activeRacerIds);

  for (const racer of session.racerStates) {
    if (activeIds.has(racer.id)) {
      continue;
    }

    racer.heldItem = COMBAT_ITEM_REGISTRY.boost.type;
    racer.itemUseCooldownSeconds = 999;
    refreshRacerCollisionBounds(racer);
  }
}

function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(label);
  }

  return value;
}

function requireItemUseAction<T>(value: T | null | undefined, label: string): T {
  return requireValue(value, `Expected item-use action: ${label}.`);
}

function assertStringArrayEqual(
  actual: readonly string[],
  expected: readonly string[],
  label: string
): void {
  assertEqual(actual.length, expected.length, `${label} length`);

  for (let index = 0; index < expected.length; index += 1) {
    assertEqual(actual[index], expected[index], `${label} item ${index}`);
  }
}

function assertThrows(action: () => void, label: string): void {
  let didThrow = false;

  try {
    action();
  } catch {
    didThrow = true;
  }

  if (!didThrow) {
    throw new Error(label);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`
    );
  }
}

function assertGreaterThan(
  actual: number,
  expected: number,
  label: string
): void {
  if (actual <= expected) {
    throw new Error(`${label}: expected > ${expected}, got ${actual}`);
  }
}

main();
