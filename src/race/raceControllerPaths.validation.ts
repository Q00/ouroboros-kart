import {
  createRaceSessionFromStartRoster,
  refreshRacerCollisionBounds,
  type RaceSession,
  type RaceSessionRacerControllerPath,
  type RaceSessionRacerState
} from "./raceSession";
import { createRaceStartRoster } from "./raceStartRoster";

const HOST_PEER_ID = "host-peer";
const GUEST_PEER_ID = "guest-peer";
const HOST_RACER_ID = "human_1";
const GUEST_RACER_ID = "human_2";

function main(): void {
  validateHostAuthoritativeTickAdvancesLocalRemoteAndAiControllers();
  validateGuestTickLeavesAuthoritativeRacersForRemoteSnapshots();
  validateHostAuthoritativeItemPickupCollisionDetection();
  validateRemotePeerDoesNotResolveItemPickups();
}

function validateHostAuthoritativeTickAdvancesLocalRemoteAndAiControllers(): void {
  const raceSession = createMultiplayerRaceSession();
  const hostRacer = requireRacer(raceSession, HOST_RACER_ID);
  const guestRacer = requireRacer(raceSession, GUEST_RACER_ID);

  raceSession.setHumanInput(HOST_RACER_ID, { throttle: 1 });
  raceSession.setHumanInput(GUEST_RACER_ID, { throttle: 1, steer: 0.35 });

  const tickResult = raceSession.tick(1 / 60, {
    controllerPaths: createHostControllerPaths(raceSession)
  });

  assertEqual(tickResult.racerUpdates, 4, "host tick covers all four racers");
  assertEqual(tickResult.aiUpdates, 2, "host tick runs both AI controllers");
  assert(hostRacer.updateCount === 1, "host local racer advances");
  assert(guestRacer.updateCount === 1, "host remote-input racer advances");
  assert(hostRacer.speed > 0, "local input drives host racer");
  assert(guestRacer.speed > 0, "remote input drives guest racer");

  for (const aiRacer of raceSession.aiRacerStates) {
    assert(aiRacer.updateCount === 1, `AI racer ${aiRacer.id} advances`);
    assert(aiRacer.speed > 0, `AI racer ${aiRacer.id} drives from AI logic`);
  }
}

function validateGuestTickLeavesAuthoritativeRacersForRemoteSnapshots(): void {
  const raceSession = createMultiplayerRaceSession();
  const hostRacer = requireRacer(raceSession, HOST_RACER_ID);
  const guestRacer = requireRacer(raceSession, GUEST_RACER_ID);

  raceSession.setHumanInput(HOST_RACER_ID, { throttle: 1 });
  raceSession.setHumanInput(GUEST_RACER_ID, { throttle: 1 });

  const tickResult = raceSession.tick(1 / 60, {
    controllerPaths: createGuestControllerPaths(raceSession)
  });

  assertEqual(tickResult.racerUpdates, 4, "guest tick still accounts for roster");
  assertEqual(tickResult.aiUpdates, 0, "guest tick does not run remote AI logic");
  assertEqual(hostRacer.updateCount, 0, "remote host racer waits for snapshots");
  assertEqual(hostRacer.speed, 0, "remote host input is not locally integrated");
  assertEqual(guestRacer.updateCount, 1, "guest local racer advances");
  assert(guestRacer.speed > 0, "guest local input drives prediction");

  for (const aiRacer of raceSession.aiRacerStates) {
    assertEqual(
      aiRacer.updateCount,
      0,
      `remote AI racer ${aiRacer.id} waits for snapshots`
    );
    assertEqual(aiRacer.speed, 0, `remote AI racer ${aiRacer.id} is not integrated`);
  }
}

function validateHostAuthoritativeItemPickupCollisionDetection(): void {
  const raceSession = createMultiplayerRaceSession();
  const pickup = requireValue(
    raceSession.itemPickupStates[0],
    "host authoritative pickup"
  );
  const guestRacer = requireRacer(raceSession, GUEST_RACER_ID);

  parkRacersAwayFromPickup(raceSession, guestRacer.id, pickup.position);
  moveRacerToPosition(guestRacer, pickup.position);

  const tickResult = raceSession.tick(0, {
    controllerPaths: createHostControllerPaths(raceSession),
    itemPickupAuthority: "authoritative"
  });
  const candidate = requireValue(
    tickResult.eligibleItemPickupCollisions[0],
    "host authoritative pickup collision candidate"
  );
  const collection = requireValue(
    tickResult.itemPickupCollections[0],
    "host authoritative pickup collection"
  );

  assertEqual(
    tickResult.eligibleItemPickupCollisions.length,
    1,
    "host identifies one eligible item-box collision"
  );
  assertEqual(candidate.pickupId, pickup.id, "host candidate pickup id");
  assertEqual(candidate.racerId, guestRacer.id, "host candidate racer id");
  assertEqual(
    candidate.racerSlotIndex,
    guestRacer.slotIndex,
    "host candidate racer slot"
  );
  assertEqual(candidate.itemType, pickup.itemType, "host candidate item type");
  assertEqual(
    tickResult.itemPickupCollections.length,
    1,
    "host collects one eligible item box"
  );
  assertEqual(collection.pickupId, pickup.id, "host collection pickup id");
  assertEqual(collection.racerId, guestRacer.id, "host collection racer id");
  assert(guestRacer.heldItem !== null, "host grants item to remote racer");
}

function validateRemotePeerDoesNotResolveItemPickups(): void {
  const raceSession = createMultiplayerRaceSession();
  const pickup = requireValue(
    raceSession.itemPickupStates[0],
    "remote authority pickup"
  );
  const guestRacer = requireRacer(raceSession, GUEST_RACER_ID);

  parkRacersAwayFromPickup(raceSession, guestRacer.id, pickup.position);
  moveRacerToPosition(guestRacer, pickup.position);

  const tickResult = raceSession.tick(0, {
    controllerPaths: createGuestControllerPaths(raceSession),
    itemPickupAuthority: "remote"
  });

  assertEqual(
    tickResult.eligibleItemPickupCollisions.length,
    0,
    "remote peer does not identify local item-box eligibility"
  );
  assertEqual(
    tickResult.itemPickupCollections.length,
    0,
    "remote peer does not collect item boxes locally"
  );
  assertEqual(pickup.active, true, "remote peer leaves pickup active");
  assertEqual(guestRacer.heldItem, null, "remote peer does not grant held item");
}

function createHostControllerPaths(
  raceSession: RaceSession
): ReadonlyMap<string, RaceSessionRacerControllerPath> {
  return createControllerPaths(raceSession, (racer) => {
    if (racer.id === HOST_RACER_ID) {
      return "local-input";
    }

    return racer.controller === "ai" ? "ai-driver" : "remote-input";
  });
}

function createGuestControllerPaths(
  raceSession: RaceSession
): ReadonlyMap<string, RaceSessionRacerControllerPath> {
  return createControllerPaths(raceSession, (racer) =>
    racer.id === GUEST_RACER_ID ? "local-input" : "remote-snapshot"
  );
}

function createControllerPaths(
  raceSession: RaceSession,
  resolvePath: (
    racer: RaceSessionRacerState
  ) => RaceSessionRacerControllerPath
): ReadonlyMap<string, RaceSessionRacerControllerPath> {
  const paths = new Map<string, RaceSessionRacerControllerPath>();

  for (const racer of raceSession.racerStates) {
    paths.set(racer.id, resolvePath(racer));
  }

  return paths;
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
    ])
  );
}

function parkRacersAwayFromPickup(
  raceSession: RaceSession,
  activeRacerId: string,
  pickupPosition: RaceSessionRacerState["position"]
): void {
  let parkedIndex = 0;

  for (const racer of raceSession.racerStates) {
    if (racer.id === activeRacerId) {
      continue;
    }

    moveRacerToPosition(racer, {
      x: pickupPosition.x + 80 + parkedIndex * 12,
      y: pickupPosition.y,
      z: pickupPosition.z + 80
    });
    parkedIndex += 1;
  }
}

function moveRacerToPosition(
  racer: RaceSessionRacerState,
  position: RaceSessionRacerState["position"]
): void {
  racer.position = { ...position };
  racer.velocity = { x: 0, y: 0, z: 0 };
  racer.knockbackVelocity = { x: 0, y: 0, z: 0 };
  racer.speed = 0;
  racer.heldItem = null;
  racer.itemUseCooldownSeconds = 0;
  refreshRacerCollisionBounds(racer);
}

function requireRacer(
  raceSession: RaceSession,
  racerId: string
): RaceSessionRacerState {
  const racer = raceSession.getRacerState(racerId);

  if (racer === undefined) {
    throw new Error(`Missing racer ${racerId}.`);
  }

  return racer;
}

function requireValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(`Missing ${message}.`);
  }

  return value;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, found ${actual}`);
  }
}

main();
