import { Body, Box, Quaternion, Vec3 } from "cannon-es";

import type { Vector3 } from "../config/aiRacers";
import type {
  KartCollisionBounds,
  KartCollisionDimensions
} from "./kartCollisionBounds";

export type KartPhysicsCollisionLayer = "racer";
export type KartPhysicsBodyType = "dynamic";
export type KartPhysicsCollisionMask = "racer" | "track" | "item";

export interface KartPhysicsCollisionMetadata {
  readonly layer: KartPhysicsCollisionLayer;
  readonly bodyType: KartPhysicsBodyType;
  readonly masks: readonly KartPhysicsCollisionMask[];
  readonly dimensions: KartCollisionDimensions;
  readonly bounds: KartCollisionBounds;
  readonly radius: number;
  readonly canCollideWithRacers: boolean;
  readonly canBlockItems: boolean;
}

export interface KartPhysicsState {
  readonly body: Body;
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly collision: KartPhysicsCollisionMetadata;
}

export interface KartPhysicsStateInput {
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly headingRadians: number;
  readonly collisionDimensions: KartCollisionDimensions;
  readonly collisionBounds: KartCollisionBounds;
}

export const KART_PHYSICS_COLLISION_MASKS = [
  "racer",
  "track",
  "item"
] as const satisfies readonly KartPhysicsCollisionMask[];

const KART_PHYSICS_BODY_MASS = 120;
const KART_PHYSICS_LINEAR_DAMPING = 0.35;
const KART_PHYSICS_ANGULAR_DAMPING = 0.9;

export function createKartPhysicsState(
  input: KartPhysicsStateInput
): KartPhysicsState {
  const body = createKartPhysicsBody(input);

  return {
    body,
    position: { ...input.position },
    velocity: { ...input.velocity },
    collision: createKartPhysicsCollisionMetadata(
      input.collisionDimensions,
      input.collisionBounds
    )
  };
}

export function syncKartPhysicsState(
  state: KartPhysicsState,
  input: KartPhysicsStateInput
): KartPhysicsState {
  syncKartPhysicsBody(state.body, input);

  return {
    body: state.body,
    position: { ...input.position },
    velocity: { ...input.velocity },
    collision: createKartPhysicsCollisionMetadata(
      input.collisionDimensions,
      input.collisionBounds
    )
  };
}

export function createKartPhysicsCollisionMetadata(
  dimensions: KartCollisionDimensions,
  bounds: KartCollisionBounds
): KartPhysicsCollisionMetadata {
  return {
    layer: "racer",
    bodyType: "dynamic",
    masks: KART_PHYSICS_COLLISION_MASKS,
    dimensions,
    bounds,
    radius: bounds.boundingRadius,
    canCollideWithRacers: true,
    canBlockItems: true
  };
}

function createKartPhysicsBody(input: KartPhysicsStateInput): Body {
  const body = new Body({
    mass: KART_PHYSICS_BODY_MASS,
    type: Body.DYNAMIC,
    shape: new Box(
      new Vec3(
        input.collisionDimensions.width / 2,
        input.collisionDimensions.height / 2,
        input.collisionDimensions.length / 2
      )
    ),
    linearDamping: KART_PHYSICS_LINEAR_DAMPING,
    angularDamping: KART_PHYSICS_ANGULAR_DAMPING
  });

  syncKartPhysicsBody(body, input);

  return body;
}

function syncKartPhysicsBody(body: Body, input: KartPhysicsStateInput): void {
  body.position.set(input.position.x, input.position.y, input.position.z);
  body.velocity.set(input.velocity.x, input.velocity.y, input.velocity.z);
  body.quaternion.copy(getHeadingQuaternion(input.headingRadians));
  body.angularVelocity.set(0, 0, 0);
}

function getHeadingQuaternion(headingRadians: number): Quaternion {
  const quaternion = new Quaternion();

  quaternion.setFromAxisAngle(new Vec3(0, 1, 0), headingRadians);

  return quaternion;
}
