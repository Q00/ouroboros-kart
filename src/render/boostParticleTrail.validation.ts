import {
  BOOST_PARTICLE_TRAIL_MAX_EMISSIONS_PER_FRAME,
  BOOST_PARTICLE_TRAIL_MAX_PARTICLES,
  BOOST_PARTICLE_TRAIL_MAX_SPAWNED_PARTICLES_PER_FRAME,
  createDefaultBoostParticleTrailState,
  updateBoostParticleTrailState,
  type BoostParticleTrailParticle,
  type BoostParticleTrailState,
  type BoostParticleTrailUpdate
} from "./boostParticleTrail";

function main(): void {
  validateBoostStartsParticleTrailImmediately();
  validateBoostTrailParticlesAgeAndStayBounded();
  validateBoostTrailKeepsSimpleParticleBudget();
  validateBoostTrailParticlesCarryMotionStreaks();
  validateBoostTrailSpawnsBehindRacer();
  validateBoostExpiryCleansTrail();

  console.info("boostParticleTrail=ok");
}

function validateBoostStartsParticleTrailImmediately(): void {
  const state = updateBoostParticleTrailState(
    createDefaultBoostParticleTrailState(),
    createActiveUpdate({ deltaSeconds: 1 / 60 })
  );

  assertGreaterThan(
    state.particles.length,
    0,
    "active boost primes visible particle trail immediately"
  );
}

function validateBoostTrailParticlesAgeAndStayBounded(): void {
  let state = createDefaultBoostParticleTrailState();

  for (let frame = 0; frame < 240; frame += 1) {
    state = updateBoostParticleTrailState(
      state,
      createActiveUpdate({ deltaSeconds: 1 / 60 })
    );
  }

  assertLessThanOrEqual(
    state.particles.length,
    BOOST_PARTICLE_TRAIL_MAX_PARTICLES,
    "particle trail stays capped for long boosts"
  );
  assert(
    state.particles.some((particle) => particle.ageSeconds > 0),
    "active trail keeps aging particles"
  );
}

function validateBoostTrailKeepsSimpleParticleBudget(): void {
  let state = updateBoostParticleTrailState(
    createDefaultBoostParticleTrailState(),
    createActiveUpdate({ deltaSeconds: 1 / 60 })
  );
  const particlesBeforeLargeFrame = state.particles.length;

  state = updateBoostParticleTrailState(
    state,
    createActiveUpdate({ deltaSeconds: 0.3 })
  );

  assertLessThanOrEqual(
    BOOST_PARTICLE_TRAIL_MAX_PARTICLES,
    48,
    "v1 boost trail keeps a simple total particle budget"
  );
  assertLessThanOrEqual(
    BOOST_PARTICLE_TRAIL_MAX_EMISSIONS_PER_FRAME,
    5,
    "v1 boost trail caps emission bursts for simple particles"
  );
  assertLessThanOrEqual(
    state.particles.length - particlesBeforeLargeFrame,
    BOOST_PARTICLE_TRAIL_MAX_SPAWNED_PARTICLES_PER_FRAME,
    "large frames spawn only a bounded simple burst of particles"
  );
}

function validateBoostTrailParticlesCarryMotionStreaks(): void {
  const lowIntensityState = updateBoostParticleTrailState(
    createDefaultBoostParticleTrailState(),
    createActiveUpdate({
      intensity: 0.25,
      speedRatio: 0.15,
      deltaSeconds: 1 / 60
    })
  );
  const highIntensityState = updateBoostParticleTrailState(
    createDefaultBoostParticleTrailState(),
    createActiveUpdate({
      intensity: 1,
      speedRatio: 1,
      deltaSeconds: 1 / 60
    })
  );
  const lowIntensityParticle = requireParticle(lowIntensityState);
  const highIntensityParticle = requireParticle(highIntensityState);

  assertGreaterThan(
    highIntensityParticle.streakLengthPixels,
    highIntensityParticle.radiusPixels,
    "active boost particles render as motion streaks rather than only puffs"
  );
  assertGreaterThan(
    highIntensityParticle.streakLengthPixels,
    lowIntensityParticle.streakLengthPixels,
    "boost motion streak length scales with active boost intensity"
  );
  assertGreaterThan(
    highIntensityParticle.streakWidthPixels,
    lowIntensityParticle.streakWidthPixels,
    "boost motion streak width scales with active boost intensity"
  );
  assertGreaterThan(
    highIntensityParticle.glowRadiusPixels,
    highIntensityParticle.radiusPixels,
    "boost motion streaks carry a larger glow radius"
  );
}

function validateBoostTrailSpawnsBehindRacer(): void {
  const state = updateBoostParticleTrailState(
    createDefaultBoostParticleTrailState(),
    createActiveUpdate({
      position: { x: 10, z: 10 },
      forward: { x: 0, z: 1 },
      deltaSeconds: 1 / 60
    })
  );
  const firstParticle = requireParticle(state);

  assertLessThan(
    firstParticle.position.z,
    10,
    "boost particles spawn behind forward-moving racer"
  );
}

function validateBoostExpiryCleansTrail(): void {
  const activeState = updateBoostParticleTrailState(
    createDefaultBoostParticleTrailState(),
    createActiveUpdate({ deltaSeconds: 1 / 60 })
  );
  const expiredState = updateBoostParticleTrailState(activeState, {
    ...createActiveUpdate({ deltaSeconds: 1 / 60 }),
    isBoostActive: false,
    intensity: 0
  });

  assertEqual(
    expiredState.particles.length,
    0,
    "boost expiry removes particle trail state"
  );
  assertEqual(
    expiredState.emitAccumulatorSeconds,
    0,
    "boost expiry clears particle emission accumulator"
  );
}

function createActiveUpdate(
  overrides: Partial<BoostParticleTrailUpdate>
): BoostParticleTrailUpdate {
  return {
    position: { x: 0, z: 0 },
    forward: { x: 0, z: 1 },
    isBoostActive: true,
    intensity: 1,
    speedRatio: 1,
    deltaSeconds: 1 / 60,
    accentColor: "#ffd166",
    ...overrides
  };
}

function requireParticle(
  state: BoostParticleTrailState
): BoostParticleTrailParticle {
  const particle = state.particles[0];

  if (particle === undefined) {
    throw new Error("Expected at least one boost particle.");
  }

  return particle;
}

function assert(condition: boolean, label: string): void {
  if (!condition) {
    throw new Error(label);
  }
}

function assertEqual(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertGreaterThan(actual: number, expected: number, label: string): void {
  if (actual <= expected) {
    throw new Error(`${label}: expected > ${expected}, got ${actual}`);
  }
}

function assertLessThan(actual: number, expected: number, label: string): void {
  if (actual >= expected) {
    throw new Error(`${label}: expected < ${expected}, got ${actual}`);
  }
}

function assertLessThanOrEqual(
  actual: number,
  expected: number,
  label: string
): void {
  if (actual > expected) {
    throw new Error(`${label}: expected <= ${expected}, got ${actual}`);
  }
}

main();
