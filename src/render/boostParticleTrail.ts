export interface BoostParticleTrailPoint {
  readonly x: number;
  readonly z: number;
}

export interface BoostParticleTrailParticle {
  readonly id: number;
  readonly position: BoostParticleTrailPoint;
  readonly velocity: BoostParticleTrailPoint;
  readonly ageSeconds: number;
  readonly lifetimeSeconds: number;
  readonly radiusPixels: number;
  readonly streakLengthPixels: number;
  readonly streakWidthPixels: number;
  readonly glowRadiusPixels: number;
  readonly opacity: number;
  readonly accentColor: string;
}

export interface BoostParticleTrailState {
  readonly particles: readonly BoostParticleTrailParticle[];
  readonly emitAccumulatorSeconds: number;
  readonly nextParticleId: number;
}

export interface BoostParticleTrailUpdate {
  readonly position: BoostParticleTrailPoint;
  readonly forward: BoostParticleTrailPoint;
  readonly isBoostActive: boolean;
  readonly intensity: number;
  readonly speedRatio: number;
  readonly deltaSeconds: number;
  readonly accentColor: string;
}

export const BOOST_PARTICLE_TRAIL_MAX_PARTICLES = 42;
export const BOOST_PARTICLE_TRAIL_PARTICLES_PER_EMISSION = 2;
export const BOOST_PARTICLE_TRAIL_MAX_EMISSIONS_PER_FRAME = 5;
export const BOOST_PARTICLE_TRAIL_MAX_SPAWNED_PARTICLES_PER_FRAME =
  BOOST_PARTICLE_TRAIL_PARTICLES_PER_EMISSION *
  BOOST_PARTICLE_TRAIL_MAX_EMISSIONS_PER_FRAME;

const MIN_FRAME_SECONDS = 0;
const MAX_FRAME_SECONDS = 0.12;
const EMIT_INTERVAL_SECONDS = 1 / 36;

export function createDefaultBoostParticleTrailState(): BoostParticleTrailState {
  return {
    particles: [],
    emitAccumulatorSeconds: 0,
    nextParticleId: 1
  };
}

export function updateBoostParticleTrailState(
  state: BoostParticleTrailState,
  update: BoostParticleTrailUpdate
): BoostParticleTrailState {
  const intensity = clampValue(update.intensity, 0, 1);

  if (!update.isBoostActive || intensity <= 0) {
    return {
      particles: [],
      emitAccumulatorSeconds: 0,
      nextParticleId: state.nextParticleId
    };
  }

  const deltaSeconds = clampValue(
    update.deltaSeconds,
    MIN_FRAME_SECONDS,
    MAX_FRAME_SECONDS
  );
  const speedRatio = clampValue(update.speedRatio, 0, 1);
  const agedParticles = state.particles
    .map((particle) => ageBoostParticle(particle, deltaSeconds))
    .filter((particle) => particle.ageSeconds < particle.lifetimeSeconds);
  const emitAccumulatorSeconds = state.emitAccumulatorSeconds + deltaSeconds;
  const shouldPrimeTrail =
    agedParticles.length === 0 && state.emitAccumulatorSeconds <= 0;
  const emissionCount = shouldPrimeTrail
    ? 1
    : Math.min(
        Math.floor(emitAccumulatorSeconds / EMIT_INTERVAL_SECONDS),
        BOOST_PARTICLE_TRAIL_MAX_EMISSIONS_PER_FRAME
      );
  const nextAccumulatorSeconds = shouldPrimeTrail
    ? 0
    : emitAccumulatorSeconds - emissionCount * EMIT_INTERVAL_SECONDS;
  let nextParticleId = state.nextParticleId;
  const spawnedParticles: BoostParticleTrailParticle[] = [];

  for (
    let emissionIndex = 0;
    emissionIndex < emissionCount;
    emissionIndex += 1
  ) {
    for (
      let particleIndex = 0;
      particleIndex < BOOST_PARTICLE_TRAIL_PARTICLES_PER_EMISSION;
      particleIndex += 1
    ) {
      spawnedParticles.push(
        createBoostParticle({
          id: nextParticleId,
          position: update.position,
          forward: update.forward,
          intensity,
          speedRatio,
          accentColor: update.accentColor
        })
      );
      nextParticleId += 1;
    }
  }

  const particles = [...agedParticles, ...spawnedParticles].slice(
    -BOOST_PARTICLE_TRAIL_MAX_PARTICLES
  );

  return {
    particles,
    emitAccumulatorSeconds: nextAccumulatorSeconds,
    nextParticleId
  };
}

function ageBoostParticle(
  particle: BoostParticleTrailParticle,
  deltaSeconds: number
): BoostParticleTrailParticle {
  return {
    ...particle,
    ageSeconds: particle.ageSeconds + deltaSeconds,
    position: {
      x: particle.position.x + particle.velocity.x * deltaSeconds,
      z: particle.position.z + particle.velocity.z * deltaSeconds
    }
  };
}

function createBoostParticle(options: {
  readonly id: number;
  readonly position: BoostParticleTrailPoint;
  readonly forward: BoostParticleTrailPoint;
  readonly intensity: number;
  readonly speedRatio: number;
  readonly accentColor: string;
}): BoostParticleTrailParticle {
  const forward = normalizePlanarPoint(options.forward);
  const normal = {
    x: -forward.z,
    z: forward.x
  };
  const jitter = createParticleJitter(options.id);
  const lateralOffset =
    (jitter.lateral * 2 - 1) * (0.45 + options.speedRatio * 0.75);
  const rearOffset =
    2.15 + options.speedRatio * 1.65 + jitter.rear * 0.95;
  const driftSpeed = 3.8 + options.speedRatio * 5.4;
  const lateralDrift =
    (jitter.drift * 2 - 1) * (0.8 + options.speedRatio * 1.4);
  const radiusPixels = 4.2 + options.intensity * 4.8 + jitter.radius * 3.4;
  const streakLengthPixels =
    16 + options.intensity * 18 + options.speedRatio * 22 + jitter.radius * 8;
  const streakWidthPixels =
    2.4 + options.intensity * 2.4 + options.speedRatio * 1.6;

  return {
    id: options.id,
    position: {
      x: options.position.x - forward.x * rearOffset + normal.x * lateralOffset,
      z: options.position.z - forward.z * rearOffset + normal.z * lateralOffset
    },
    velocity: {
      x: -forward.x * driftSpeed + normal.x * lateralDrift,
      z: -forward.z * driftSpeed + normal.z * lateralDrift
    },
    ageSeconds: 0,
    lifetimeSeconds: 0.34 + options.intensity * 0.28 + jitter.life * 0.14,
    radiusPixels,
    streakLengthPixels,
    streakWidthPixels,
    glowRadiusPixels: radiusPixels * (2.4 + options.intensity * 0.8),
    opacity: 0.36 + options.intensity * 0.52,
    accentColor: options.accentColor
  };
}

function normalizePlanarPoint(
  point: BoostParticleTrailPoint
): BoostParticleTrailPoint {
  const length = Math.hypot(point.x, point.z);

  if (!Number.isFinite(length) || length <= 0.0001) {
    return { x: 0, z: 1 };
  }

  return {
    x: point.x / length,
    z: point.z / length
  };
}

function createParticleJitter(id: number): {
  readonly lateral: number;
  readonly rear: number;
  readonly drift: number;
  readonly life: number;
  readonly radius: number;
} {
  return {
    lateral: pseudoRandom(id * 5 + 1),
    rear: pseudoRandom(id * 5 + 2),
    drift: pseudoRandom(id * 5 + 3),
    life: pseudoRandom(id * 5 + 4),
    radius: pseudoRandom(id * 5 + 5)
  };
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;

  return value - Math.floor(value);
}

function clampValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}
