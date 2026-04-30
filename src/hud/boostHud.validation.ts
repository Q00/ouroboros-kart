import {
  createBoostHudState,
  createBoostVisualState,
  formatBoostHudSeconds
} from "./boostHud";
import {
  BOOST_DURATION_SECONDS,
  COMBAT_ITEM_REGISTRY,
  DEFAULT_RACE_ITEM_PICKUPS,
  createRaceSessionFromStartRoster
} from "../race/raceSession";
import { createRaceStartRoster } from "../race/raceStartRoster";

function main(): void {
  validateAvailableBoostPickupState();
  validateHeldBoostReadyState();
  validateBoostUseCooldownState();
  validateActiveBoostDurationState();
  validateBoostPickupRespawnState();
  validateNonBoostHeldItemBlocksBoostIndicator();
  validateBoostActivationPresentationSync();
  validateBoostSecondFormatting();

  console.info("boostHud=ok");
}

function validateAvailableBoostPickupState(): void {
  const raceSession = createValidationRaceSession();
  const racer = requireFirstHumanRacer(raceSession);
  const state = createBoostHudState(racer, raceSession.itemPickupStates);
  const boostPickupCount = raceSession.itemPickupStates.length;

  assertEqual(state.availability, "seek", "boost pickup availability");
  assertEqual(state.availabilityLabel, "BOOST AVAILABLE", "availability label");
  assertEqual(state.visual.isActive, false, "available boost visual inactive");
  assertEqual(state.visual.intensity, 0, "available boost visual intensity");
  assertEqual(state.heldBoostCount, 0, "held boost count");
  assertEqual(
    state.availablePickupCount,
    boostPickupCount,
    "available boost pickup count"
  );
  assertEqual(state.totalPickupCount, boostPickupCount, "total boost pickup count");
  assertEqual(
    state.countLabel,
    `Held 0/1 | Boxes ${boostPickupCount}/${boostPickupCount}`,
    "count label"
  );
  assertEqual(state.cooldownLabel, "Use ready | Box ready", "cooldown label");
  assertEqual(state.activeDurationLabel, "Active 0.0s", "active duration label");
}

function validateHeldBoostReadyState(): void {
  const raceSession = createValidationRaceSession();
  const racer = requireFirstHumanRacer(raceSession);

  racer.heldItem = COMBAT_ITEM_REGISTRY.boost.type;
  const state = createBoostHudState(racer, raceSession.itemPickupStates);
  const boostPickupCount = raceSession.itemPickupStates.length;

  assertEqual(state.availability, "ready", "held boost availability");
  assertEqual(state.availabilityLabel, "BOOST READY", "held boost label");
  assertEqual(state.heldBoostCount, 1, "held boost count");
  assertEqual(state.canActivateBoost, true, "held boost can activate");
  assertEqual(state.visual.isActive, false, "held boost visual inactive");
  assertEqual(
    state.countLabel,
    `Held 1/1 | Boxes ${boostPickupCount}/${boostPickupCount}`,
    "held count label"
  );
}

function validateBoostUseCooldownState(): void {
  const raceSession = createValidationRaceSession();
  const racer = requireFirstHumanRacer(raceSession);

  racer.heldItem = COMBAT_ITEM_REGISTRY.boost.type;
  racer.itemUseCooldownSeconds = 0.18;
  const state = createBoostHudState(racer, raceSession.itemPickupStates);

  assertEqual(state.availability, "cooldown", "use cooldown availability");
  assertEqual(state.availabilityLabel, "BOOST WAIT", "use cooldown label");
  assertEqual(state.cooldownLabel, "Use 0.2s | Box ready", "use cooldown text");
  assertEqual(state.canActivateBoost, false, "cooldown blocks activation");
}

function validateActiveBoostDurationState(): void {
  const raceSession = createValidationRaceSession();
  const racer = requireFirstHumanRacer(raceSession);

  racer.boostSeconds = 0.72;
  racer.itemUseCooldownSeconds = 0.06;
  const state = createBoostHudState(racer, raceSession.itemPickupStates);

  assertEqual(state.availability, "active", "active boost availability");
  assertEqual(state.availabilityLabel, "BOOST ACTIVE", "active boost label");
  assertEqual(state.activeDurationSeconds, 0.72, "active duration seconds");
  assertClose(
    state.activeDurationRatio,
    0.72 / BOOST_DURATION_SECONDS,
    "active duration ratio"
  );
  assertClose(
    state.visual.intensity,
    state.activeDurationRatio,
    "active boost HUD/visual ratio sync"
  );
  assertEqual(state.visual.isActive, true, "active boost visual active");
  assertEqual(state.visual.label, "BOOST", "active boost visual label");
  assertEqual(state.activeDurationLabel, "Active 0.7s", "active duration text");
  assertEqual(state.cooldownLabel, "Use 0.1s | Box ready", "active cooldown text");
}

function validateBoostPickupRespawnState(): void {
  const raceSession = createValidationRaceSession();
  const racer = requireFirstHumanRacer(raceSession);
  const boostPickupCount = raceSession.itemPickupStates.length;

  for (const boostPickup of raceSession.itemPickupStates) {
    boostPickup.cooldownSeconds = 3.24;
  }

  const state = createBoostHudState(racer, raceSession.itemPickupStates);

  assertEqual(state.availability, "respawn", "respawning boost availability");
  assertEqual(state.availabilityLabel, "BOOST RESPAWNING", "respawn label");
  assertEqual(state.availablePickupCount, 0, "respawning available count");
  assertEqual(state.nextPickupCooldownSeconds, 3.24, "next pickup cooldown");
  assertClose(
    state.pickupRespawnRatio,
    1 - 3.24 / COMBAT_ITEM_REGISTRY.boost.respawnSeconds,
    "pickup respawn ratio"
  );
  assertEqual(
    state.countLabel,
    `Held 0/1 | Boxes 0/${boostPickupCount}`,
    "respawn count label"
  );
  assertEqual(state.cooldownLabel, "Use ready | Box 3.2s", "respawn cooldown label");
}

function validateNonBoostHeldItemBlocksBoostIndicator(): void {
  const raceSession = createValidationRaceSession();
  const racer = requireFirstHumanRacer(raceSession);

  racer.heldItem = COMBAT_ITEM_REGISTRY.shell.type;
  const state = createBoostHudState(racer, raceSession.itemPickupStates);

  assertEqual(state.availability, "blocked", "non-boost item blocks boost seek");
  assertEqual(state.availabilityLabel, "ITEM SLOT FULL", "blocked boost label");
  assertEqual(state.heldBoostCount, 0, "blocked held boost count");
  assertEqual(state.canActivateBoost, false, "blocked boost cannot activate");
  assertEqual(state.isItemSlotBlocked, true, "blocked item slot state");
  assertEqual(state.visual.isActive, false, "blocked boost visual inactive");
  assertEqual(state.visual.intensity, 0, "blocked boost visual intensity");
}

function validateBoostActivationPresentationSync(): void {
  const tickSeconds = 1 / 60;
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: "boost-sync-player",
        displayName: "Boost Sync Player",
        slotIndex: 0,
        isHost: true
      }
    ]),
    {
      itemPickups: []
    }
  );
  const racer = requireFirstHumanRacer(raceSession);

  racer.heldItem = COMBAT_ITEM_REGISTRY.boost.type;
  const readyState = createBoostHudState(racer, raceSession.itemPickupStates);

  assertEqual(readyState.availability, "ready", "pre-activation boost state");
  assertEqual(readyState.visual.isActive, false, "pre-activation visual state");

  raceSession.setHumanInput(racer.id, {
    throttle: 1,
    useItem: true
  });
  raceSession.tick(tickSeconds);

  const activatedHud = createBoostHudState(racer, raceSession.itemPickupStates);
  const activatedVisual = createBoostVisualState(racer);

  assertEqual(activatedHud.availability, "active", "activated HUD state");
  assertNull(racer.heldItem, "activated boost consumes held item");
  assertEqual(activatedHud.heldBoostCount, 0, "activated HUD held boost count");
  assertEqual(activatedHud.visual.isActive, true, "activated HUD visual flag");
  assertEqual(activatedVisual.isActive, true, "activated kart visual flag");
  assertClose(
    activatedHud.activeDurationRatio,
    activatedHud.visual.intensity,
    "activated HUD visual intensity"
  );
  assertClose(
    activatedHud.visual.intensity,
    activatedVisual.intensity,
    "activated kart visual intensity"
  );

  for (
    let tickIndex = 0;
    tickIndex < Math.ceil((BOOST_DURATION_SECONDS + tickSeconds) / tickSeconds);
    tickIndex += 1
  ) {
    raceSession.tick(tickSeconds);
  }

  const expiredHud = createBoostHudState(racer, raceSession.itemPickupStates);
  const expiredVisual = createBoostVisualState(racer);

  assertEqual(expiredHud.availability, "unavailable", "expired HUD state");
  assertEqual(expiredHud.activeDurationSeconds, 0, "expired active duration");
  assertEqual(expiredHud.activeDurationRatio, 0, "expired active ratio");
  assertEqual(expiredHud.visual.isActive, false, "expired HUD visual flag");
  assertEqual(expiredVisual.isActive, false, "expired kart visual flag");
  assertEqual(expiredVisual.intensity, 0, "expired kart visual intensity");
}

function validateBoostSecondFormatting(): void {
  assertEqual(formatBoostHudSeconds(1.16), "1.2s", "rounded seconds");
  assertEqual(formatBoostHudSeconds(-1), "0.0s", "negative seconds clamp");
  assertEqual(
    formatBoostHudSeconds(Number.NaN),
    "0.0s",
    "non-finite seconds clamp"
  );
}

function createValidationRaceSession(): ReturnType<typeof createRaceSessionFromStartRoster> {
  return createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: "hud-player",
        displayName: "HUD Player",
        slotIndex: 0,
        isHost: true
      }
    ]),
    {
      itemPickups: DEFAULT_RACE_ITEM_PICKUPS.filter(
        (pickup) => pickup.itemType === COMBAT_ITEM_REGISTRY.boost.type
      )
    }
  );
}

function requireFirstHumanRacer(
  raceSession: ReturnType<typeof createRaceSessionFromStartRoster>
) {
  const racer = raceSession.humanRacerStates[0];

  if (racer === undefined) {
    throw new Error("Expected validation race session to include a human racer.");
  }

  return racer;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertClose(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 0.000001) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertNull(actual: unknown, label: string): void {
  if (actual !== null) {
    throw new Error(`${label}: expected null, got ${String(actual)}.`);
  }
}

main();
