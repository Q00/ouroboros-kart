import { DEFAULT_KART_COLLISION_DIMENSIONS } from "../physics/kartCollisionBounds";
import {
  BANANA_DROP_DISTANCE_BEHIND_RACER,
  COMBAT_ITEM_REGISTRY,
  DEFAULT_RACE_TRACK_STATE,
  createBananaObstacleState,
  createRaceSessionFromStartRoster,
  createShellProjectileState,
  evaluateAiHeldItemUseDecision,
  refreshRacerCollisionBounds,
  type RaceSessionRacerState
} from "./raceSession";
import { createRacerProgressState } from "./raceState";
import { createRaceStartRoster } from "./raceStartRoster";

interface ItemBehaviorTuningValidationResult {
  readonly boost: BoostRoleValidationResult;
  readonly shell: ShellRoleValidationResult;
  readonly banana: BananaRoleValidationResult;
  readonly spawns: ItemSpawnRoleValidationResult;
  readonly aiTargeting: AiTargetingRoleValidationResult;
}

interface BoostRoleValidationResult {
  readonly durationSeconds: number;
  readonly speedMultiplier: number;
  readonly accelerationBonus: number;
  readonly useCooldownSeconds: number;
  readonly respawnSeconds: number;
}

interface ShellRoleValidationResult {
  readonly speed: number;
  readonly ttlSeconds: number;
  readonly rangeMeters: number;
  readonly radius: number;
  readonly armSeconds: number;
  readonly hitStunSeconds: number;
  readonly hitSpeedFactor: number;
  readonly hitImmunitySeconds: number;
  readonly hitFeedbackSeconds: number;
  readonly postHitImmunityMarginSeconds: number;
  readonly useCooldownSeconds: number;
}

interface BananaRoleValidationResult {
  readonly ttlSeconds: number;
  readonly radius: number;
  readonly armSeconds: number;
  readonly hitStunSeconds: number;
  readonly hitSpeedFactor: number;
  readonly hitImmunitySeconds: number;
  readonly hitFeedbackSeconds: number;
  readonly postHitImmunityMarginSeconds: number;
  readonly spinRadians: number;
  readonly spinoutSeconds: number;
  readonly useCooldownSeconds: number;
  readonly respawnSeconds: number;
  readonly dropDistanceBehindRacer: number;
}

interface ItemSpawnRoleValidationResult {
  readonly shellForwardOffset: number;
  readonly shellArmSeconds: number;
  readonly shellSpeed: number;
  readonly bananaRearOffset: number;
  readonly bananaArmSeconds: number;
  readonly bananaSpeed: number;
}

interface AiTargetingRoleValidationResult {
  readonly shellAheadReason: string;
  readonly shellBehindReason: string;
  readonly bananaBehindReason: string;
  readonly bananaAheadReason: string;
}

function main(): void {
  const result = validateCombatItemBehaviorTuning();

  console.info(
    [
      "itemBehaviorTuning=ok",
      `boost=${result.boost.durationSeconds.toFixed(2)}s@${result.boost.speedMultiplier.toFixed(2)}x`,
      `shellRange=${result.shell.rangeMeters.toFixed(1)}`,
      `shellCooldown=${result.shell.useCooldownSeconds.toFixed(2)}`,
      `bananaTtl=${result.banana.ttlSeconds.toFixed(1)}`,
      `bananaRadius=${result.banana.radius.toFixed(2)}`,
      `bananaDrop=${result.banana.dropDistanceBehindRacer.toFixed(2)}`,
      `shellTarget=${result.aiTargeting.shellAheadReason}`,
      `bananaTarget=${result.aiTargeting.bananaBehindReason}`
    ].join(" ")
  );
}

export function validateCombatItemBehaviorTuning(): ItemBehaviorTuningValidationResult {
  const boost = validateBoostMobilityRole();
  const shell = validateShellProjectileRole();
  const banana = validateBananaTrapRole();
  const spawns = validateItemSpawnRoles();
  const aiTargeting = validateAiTargetingRoles();

  return {
    boost,
    shell,
    banana,
    spawns,
    aiTargeting
  };
}

function validateBoostMobilityRole(): BoostRoleValidationResult {
  const boost = COMBAT_ITEM_REGISTRY.boost;
  const shell = COMBAT_ITEM_REGISTRY.shell;
  const config = boost.defaultRuntimeConfig;

  assertEqual(boost.behaviorType, "instant", "boost behavior type");
  assertBetween(config.durationSeconds, 1, 1.7, "boost burst duration");
  assertGreaterThan(config.speedMultiplier, 1.2, "boost speed multiplier");
  assertGreaterThan(config.accelerationBonus, 0, "boost acceleration bonus");
  assertLessThanOrEqual(
    config.useCooldownSeconds,
    shell.defaultRuntimeConfig.useCooldownSeconds,
    "boost use cooldown stays lighter than shell"
  );
  assertLessThanOrEqual(
    boost.respawnSeconds,
    shell.respawnSeconds,
    "boost respawns at least as quickly as shell"
  );

  return {
    durationSeconds: config.durationSeconds,
    speedMultiplier: config.speedMultiplier,
    accelerationBonus: config.accelerationBonus,
    useCooldownSeconds: config.useCooldownSeconds,
    respawnSeconds: boost.respawnSeconds
  };
}

function validateShellProjectileRole(): ShellRoleValidationResult {
  const shell = COMBAT_ITEM_REGISTRY.shell;
  const banana = COMBAT_ITEM_REGISTRY.banana;
  const config = shell.defaultRuntimeConfig;
  const bananaConfig = banana.defaultRuntimeConfig;
  const rangeMeters = config.speed * config.ttlSeconds;

  assertEqual(shell.behaviorType, "projectile", "shell behavior type");
  assertGreaterThan(config.speed, 35, "shell moves faster than racers");
  assertBetween(rangeMeters, 90, 135, "shell useful straightaway range");
  assertLessThanOrEqual(config.armSeconds, 0.12, "shell quick arming time");
  assertLessThan(config.ttlSeconds, bananaConfig.ttlSeconds / 5, "shell lifetime is short");
  assertLessThan(config.radius, bananaConfig.radius, "shell hitbox is narrower than banana");
  assertBetween(config.hitStunSeconds, 0.45, 0.9, "shell stun stays punishing but brief");
  assertLessThan(
    config.hitStunSeconds,
    config.spinoutSeconds,
    "shell control lock ends before the full spinout recovery"
  );
  assertBetween(config.hitSpeedFactor, 0.25, 0.42, "shell speed cut remains recoverable");
  assertGreaterThan(
    config.hitStunSeconds,
    bananaConfig.hitStunSeconds,
    "shell hit stun is stronger than banana"
  );
  assertLessThan(
    config.hitSpeedFactor,
    bananaConfig.hitSpeedFactor,
    "shell speed cut is harsher than banana"
  );
  assertGreaterThan(
    config.hitImmunitySeconds,
    config.spinoutSeconds,
    "shell post-hit immunity outlasts the spinout"
  );
  assertLessThanOrEqual(
    config.hitImmunitySeconds,
    config.spinoutSeconds + 0.75,
    "shell post-hit immunity does not overstay recovery"
  );
  assertGreaterThanOrEqual(
    config.hitFeedbackSeconds,
    0.45,
    "shell hit feedback remains readable"
  );
  assertGreaterThan(
    config.useCooldownSeconds,
    bananaConfig.useCooldownSeconds,
    "shell use cooldown is heavier than banana"
  );

  return {
    speed: config.speed,
    ttlSeconds: config.ttlSeconds,
    rangeMeters,
    radius: config.radius,
    armSeconds: config.armSeconds,
    hitStunSeconds: config.hitStunSeconds,
    hitSpeedFactor: config.hitSpeedFactor,
    hitImmunitySeconds: config.hitImmunitySeconds,
    hitFeedbackSeconds: config.hitFeedbackSeconds,
    postHitImmunityMarginSeconds:
      config.hitImmunitySeconds - config.spinoutSeconds,
    useCooldownSeconds: config.useCooldownSeconds
  };
}

function validateBananaTrapRole(): BananaRoleValidationResult {
  const shell = COMBAT_ITEM_REGISTRY.shell;
  const banana = COMBAT_ITEM_REGISTRY.banana;
  const shellConfig = shell.defaultRuntimeConfig;
  const config = banana.defaultRuntimeConfig;

  assertEqual(banana.behaviorType, "dropped-trap", "banana behavior type");
  assertGreaterThan(
    config.ttlSeconds,
    shellConfig.ttlSeconds * 6,
    "banana remains as persistent lane denial"
  );
  assertGreaterThan(config.radius, shellConfig.radius, "banana trap catch radius");
  assertGreaterThan(config.armSeconds, shellConfig.armSeconds, "banana safer arm delay");
  assertBetween(config.hitStunSeconds, 0.25, 0.65, "banana stun stays light but noticeable");
  assertLessThan(
    config.hitStunSeconds,
    config.spinoutSeconds,
    "banana control lock ends before the full spinout recovery"
  );
  assertGreaterThan(config.hitSpeedFactor, shellConfig.hitSpeedFactor, "banana hit is lighter than shell");
  assertLessThan(config.hitSpeedFactor, 0.6, "banana still slows meaningfully");
  assertGreaterThan(config.spinRadians, 0, "banana has immediate hit spin");
  assertLessThan(
    config.spinoutSeconds,
    shellConfig.spinoutSeconds,
    "banana spinout is shorter than shell"
  );
  assertGreaterThan(
    config.hitImmunitySeconds,
    config.spinoutSeconds,
    "banana post-hit immunity outlasts the spinout"
  );
  assertLessThanOrEqual(
    config.hitImmunitySeconds,
    config.spinoutSeconds + 0.55,
    "banana post-hit immunity does not overstay recovery"
  );
  assertGreaterThanOrEqual(
    config.hitFeedbackSeconds,
    0.35,
    "banana hit feedback remains readable"
  );
  assertLessThanOrEqual(
    config.useCooldownSeconds,
    shellConfig.useCooldownSeconds,
    "banana use cooldown is lighter than shell"
  );
  assertLessThanOrEqual(
    banana.respawnSeconds,
    shell.respawnSeconds,
    "banana respawns no slower than shell"
  );
  assertGreaterThanOrEqual(
    BANANA_DROP_DISTANCE_BEHIND_RACER,
    DEFAULT_KART_COLLISION_DIMENSIONS.length / 2 + config.radius + 0.3,
    "banana drops clearly behind the kart"
  );

  return {
    ttlSeconds: config.ttlSeconds,
    radius: config.radius,
    armSeconds: config.armSeconds,
    hitStunSeconds: config.hitStunSeconds,
    hitSpeedFactor: config.hitSpeedFactor,
    hitImmunitySeconds: config.hitImmunitySeconds,
    hitFeedbackSeconds: config.hitFeedbackSeconds,
    postHitImmunityMarginSeconds:
      config.hitImmunitySeconds - config.spinoutSeconds,
    spinRadians: config.spinRadians,
    spinoutSeconds: config.spinoutSeconds,
    useCooldownSeconds: config.useCooldownSeconds,
    respawnSeconds: banana.respawnSeconds,
    dropDistanceBehindRacer: BANANA_DROP_DISTANCE_BEHIND_RACER
  };
}

function validateItemSpawnRoles(): ItemSpawnRoleValidationResult {
  const { source } = createItemRoleValidationRacePair();

  source.position = { x: 0, y: 0.45, z: 0 };
  source.velocity = { x: 0, y: 0, z: 0 };
  source.forward = { x: 0, y: 0, z: 1 };
  source.headingRadians = 0;
  refreshRacerCollisionBounds(source);

  const shell = createShellProjectileState(source, "validation-shell");
  const banana = createBananaObstacleState(source, "validation-banana");
  const shellForwardOffset = getForwardOffset(source, shell.position, shell.direction);
  const bananaRearOffset = -getForwardOffset(source, banana.position, shell.direction);
  const bananaSpeed = getPlanarSpeed(banana.velocity);

  assertGreaterThan(
    shellForwardOffset,
    DEFAULT_KART_COLLISION_DIMENSIONS.length / 2 + shell.radius,
    "shell spawns in front of the kart"
  );
  assertAlmostEqual(
    shell.speed,
    COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.speed,
    "shell spawn speed uses runtime tuning"
  );
  assertAlmostEqual(
    shell.armedSeconds,
    COMBAT_ITEM_REGISTRY.shell.defaultRuntimeConfig.armSeconds,
    "shell spawn arm time uses runtime tuning"
  );
  assertGreaterThan(
    bananaRearOffset,
    DEFAULT_KART_COLLISION_DIMENSIONS.length / 2 + banana.radius,
    "banana spawns behind the kart"
  );
  assertAlmostEqual(bananaSpeed, 0, "banana trap is stationary after spawn");
  assertAlmostEqual(
    banana.armedSeconds,
    COMBAT_ITEM_REGISTRY.banana.defaultRuntimeConfig.armSeconds,
    "banana spawn arm time uses runtime tuning"
  );

  return {
    shellForwardOffset,
    shellArmSeconds: shell.armedSeconds,
    shellSpeed: shell.speed,
    bananaRearOffset,
    bananaArmSeconds: banana.armedSeconds,
    bananaSpeed
  };
}

function validateAiTargetingRoles(): AiTargetingRoleValidationResult {
  const { source, target } = createItemRoleValidationRacePair();

  source.heldItem = "shell";
  source.itemUseCooldownSeconds = 0;
  placeTargetingRacer(source, 10, 0, 2);
  placeTargetingRacer(target, 22, 12, 1);
  const shellAhead = evaluateAiHeldItemUseDecision({
    racer: source,
    racers: [source, target],
    track: { totalLength: DEFAULT_RACE_TRACK_STATE.totalLength }
  });

  placeTargetingRacer(target, 2, -8, 3);
  const shellBehind = evaluateAiHeldItemUseDecision({
    racer: source,
    racers: [source, target],
    track: { totalLength: DEFAULT_RACE_TRACK_STATE.totalLength }
  });

  source.heldItem = "banana";
  placeTargetingRacer(target, 2, -8, 3);
  const bananaBehind = evaluateAiHeldItemUseDecision({
    racer: source,
    racers: [source, target],
    track: { totalLength: DEFAULT_RACE_TRACK_STATE.totalLength }
  });

  placeTargetingRacer(target, 22, 12, 1);
  const bananaAhead = evaluateAiHeldItemUseDecision({
    racer: source,
    racers: [source, target],
    track: { totalLength: DEFAULT_RACE_TRACK_STATE.totalLength }
  });

  assertEqual(
    shellAhead.reason,
    "offensive-target-ahead",
    "AI shell targets racers ahead"
  );
  assertEqual(shellAhead.useItem, true, "AI shell fires at forward targets");
  assertEqual(
    shellBehind.useItem,
    false,
    "AI shell does not fire at rear targets"
  );
  assertEqual(
    bananaBehind.reason,
    "defensive-target-behind",
    "AI banana targets racers behind"
  );
  assertEqual(bananaBehind.useItem, true, "AI banana drops for rear threats");
  assertEqual(
    bananaAhead.useItem,
    false,
    "AI banana does not drop for forward targets"
  );

  return {
    shellAheadReason: shellAhead.reason,
    shellBehindReason: shellBehind.reason,
    bananaBehindReason: bananaBehind.reason,
    bananaAheadReason: bananaAhead.reason
  };
}

function createItemRoleValidationRacePair(): {
  readonly source: RaceSessionRacerState;
  readonly target: RaceSessionRacerState;
} {
  const raceSession = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: "item-role-human",
        displayName: "Item Role Human",
        slotIndex: 0,
        isHost: true
      }
    ]),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const source = requireRacerState(
    raceSession.aiRacerStates[0],
    "item role validation AI source"
  );
  const target = requireRacerState(
    raceSession.humanRacerStates[0],
    "item role validation human target"
  );

  for (const racer of raceSession.racerStates) {
    if (racer.id !== source.id && racer.id !== target.id) {
      racer.progress = createRacerProgressState(
        { finished: true },
        {
          lapCount: DEFAULT_RACE_TRACK_STATE.lapCount,
          trackLength: DEFAULT_RACE_TRACK_STATE.totalLength
        }
      );
    }
  }

  return { source, target };
}

function placeTargetingRacer(
  racer: RaceSessionRacerState,
  trackProgress: number,
  z: number,
  rank: number
): void {
  racer.position = { x: 0, y: 0.45, z };
  racer.velocity = { x: 0, y: 0, z: 0 };
  racer.knockbackVelocity = { x: 0, y: 0, z: 0 };
  racer.forward = { x: 0, y: 0, z: 1 };
  racer.headingRadians = 0;
  racer.rank = rank;
  racer.speed = 20;
  racer.itemHitImmunitySeconds = 0;
  racer.progress = createRacerProgressState(
    {
      lap: 0,
      currentLap: 1,
      checkpointIndex: 0,
      trackProgress,
      finished: false
    },
    {
      lapCount: DEFAULT_RACE_TRACK_STATE.lapCount,
      trackLength: DEFAULT_RACE_TRACK_STATE.totalLength
    }
  );
  refreshRacerCollisionBounds(racer);
}

function getForwardOffset(
  source: RaceSessionRacerState,
  position: { readonly x: number; readonly z: number },
  direction: { readonly x: number; readonly z: number }
): number {
  return (
    (position.x - source.position.x) * direction.x +
    (position.z - source.position.z) * direction.z
  );
}

function getPlanarSpeed(vector: { readonly x: number; readonly z: number }): number {
  return Math.hypot(vector.x, vector.z);
}

function requireRacerState(
  racer: RaceSessionRacerState | undefined,
  label: string
): RaceSessionRacerState {
  if (racer === undefined) {
    throw new Error(`Expected ${label}.`);
  }

  return racer;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertAlmostEqual(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 0.000001) {
    throw new Error(`${label}: expected ${expected}, got ${actual}.`);
  }
}

function assertBetween(
  actual: number,
  min: number,
  max: number,
  label: string
): void {
  assertGreaterThanOrEqual(actual, min, `${label} lower bound`);
  assertLessThanOrEqual(actual, max, `${label} upper bound`);
}

function assertGreaterThan(actual: number, expected: number, label: string): void {
  if (actual <= expected) {
    throw new Error(`${label}: expected > ${expected}, got ${actual}.`);
  }
}

function assertGreaterThanOrEqual(
  actual: number,
  expected: number,
  label: string
): void {
  if (actual < expected) {
    throw new Error(`${label}: expected >= ${expected}, got ${actual}.`);
  }
}

function assertLessThan(actual: number, expected: number, label: string): void {
  if (actual >= expected) {
    throw new Error(`${label}: expected < ${expected}, got ${actual}.`);
  }
}

function assertLessThanOrEqual(
  actual: number,
  expected: number,
  label: string
): void {
  if (actual > expected) {
    throw new Error(`${label}: expected <= ${expected}, got ${actual}.`);
  }
}

main();
