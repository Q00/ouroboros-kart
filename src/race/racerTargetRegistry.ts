import type {
  KartCollisionBounds,
  KartCollisionDimensions
} from "../physics/kartCollisionBounds";
import type {
  KartPhysicsBodyType,
  KartPhysicsCollisionLayer,
  KartPhysicsCollisionMask,
  KartPhysicsCollisionMetadata,
  KartPhysicsState
} from "../physics/kartPhysicsState";
import type {
  RacerProgressState,
  RegisteredRacerController
} from "./raceState";

export type RacerTargetKind =
  | "local-player"
  | "remote-player"
  | "ai-opponent";

export type RacerTargetCollisionLayer = KartPhysicsCollisionLayer;
export type RacerTargetCollisionBodyType = KartPhysicsBodyType;
export type RacerTargetCollisionMask = KartPhysicsCollisionMask;

export interface RacerTargetRegistryCreateOptions {
  readonly localPeerId?: string | null;
  readonly classifyPeerlessHumansAsLocal?: boolean;
}

export interface RacerTargetSource {
  readonly id: string;
  readonly slotIndex: number;
  readonly controller: RegisteredRacerController;
  readonly displayName: string;
  readonly peerId: string | null;
  readonly isHost: boolean;
  readonly body: KartPhysicsState["body"];
  readonly position: KartPhysicsState["position"];
  readonly velocity: KartPhysicsState["velocity"];
  readonly physics: KartPhysicsState;
  readonly collision: KartPhysicsCollisionMetadata;
  readonly collisionDimensions: KartCollisionDimensions;
  readonly collisionBounds: KartCollisionBounds;
  readonly heldItem: unknown | null;
  readonly itemUseCooldownSeconds: number;
  readonly itemHitImmunitySeconds: number;
  readonly progress: Pick<RacerProgressState, "finished">;
}

export type RacerTargetCollisionMetadata = KartPhysicsCollisionMetadata;

export interface RacerTargetEligibilityMetadata {
  readonly canAcceptLocalInput: boolean;
  readonly canAcceptRemoteInput: boolean;
  readonly canRunAiController: boolean;
  readonly canParticipateInRacerCollisions: boolean;
  readonly canBlockActiveItems: boolean;
  readonly canCollectItemPickups: boolean;
  readonly canUseHeldItem: boolean;
  readonly canReceiveItemHits: boolean;
  readonly canBeRanked: boolean;
}

export interface RacerTarget<
  Source extends RacerTargetSource = RacerTargetSource
> {
  readonly id: string;
  readonly stableId: string;
  readonly slotIndex: number;
  readonly kind: RacerTargetKind;
  readonly controller: RegisteredRacerController;
  readonly displayName: string;
  readonly peerId: string | null;
  readonly isHost: boolean;
  readonly isLocalPlayer: boolean;
  readonly isRemotePlayer: boolean;
  readonly isAiOpponent: boolean;
  readonly collision: RacerTargetCollisionMetadata;
  readonly eligibility: RacerTargetEligibilityMetadata;
  readonly source: Source;
}

export interface RacerTargetPair<
  Source extends RacerTargetSource = RacerTargetSource
> {
  readonly left: RacerTarget<Source>;
  readonly right: RacerTarget<Source>;
}

export class RacerTargetRegistry<
  Source extends RacerTargetSource = RacerTargetSource
> {
  private readonly allTargets: readonly RacerTarget<Source>[];
  private readonly targetsById = new Map<string, RacerTarget<Source>>();
  private readonly targetsByStableId = new Map<string, RacerTarget<Source>>();
  private readonly targetsBySlot = new Map<number, RacerTarget<Source>>();

  public constructor(targets: readonly RacerTarget<Source>[]) {
    this.allTargets = [...targets].sort(compareRacerTargets);
    assertRacerTargetRegistryIntegrity(this.allTargets);

    for (const target of this.allTargets) {
      this.targetsById.set(target.id, target);
      this.targetsByStableId.set(target.stableId, target);
      this.targetsBySlot.set(target.slotIndex, target);
    }
  }

  public get targets(): readonly RacerTarget<Source>[] {
    return this.allTargets;
  }

  public get localPlayerTargets(): readonly RacerTarget<Source>[] {
    return this.allTargets.filter((target) => target.isLocalPlayer);
  }

  public get remotePlayerTargets(): readonly RacerTarget<Source>[] {
    return this.allTargets.filter((target) => target.isRemotePlayer);
  }

  public get aiOpponentTargets(): readonly RacerTarget<Source>[] {
    return this.allTargets.filter((target) => target.isAiOpponent);
  }

  public get racerCollisionTargets(): readonly RacerTarget<Source>[] {
    return this.allTargets.filter(
      (target) => target.collision.canCollideWithRacers
    );
  }

  public get itemHitTargets(): readonly RacerTarget<Source>[] {
    return this.allTargets.filter(
      (target) => target.eligibility.canReceiveItemHits
    );
  }

  public getTarget(id: string): RacerTarget<Source> | undefined {
    return this.targetsById.get(id);
  }

  public getTargetByStableId(
    stableId: string
  ): RacerTarget<Source> | undefined {
    return this.targetsByStableId.get(stableId);
  }

  public getTargetBySlot(slotIndex: number): RacerTarget<Source> | undefined {
    return this.targetsBySlot.get(slotIndex);
  }

  public requireTarget(id: string): RacerTarget<Source> {
    const target = this.getTarget(id);

    if (target === undefined) {
      throw new Error(`Unknown racer target id: ${id}.`);
    }

    return target;
  }

  public requireTargetByStableId(stableId: string): RacerTarget<Source> {
    const target = this.getTargetByStableId(stableId);

    if (target === undefined) {
      throw new Error(`Unknown stable racer target id: ${stableId}.`);
    }

    return target;
  }

  public getItemHitCandidates(
    ownerRacerId: string
  ): readonly RacerTarget<Source>[] {
    return this.allTargets.filter((target) =>
      canRacerTargetReceiveItemHit(target, ownerRacerId)
    );
  }

  public getRacerCollisionPairs(): readonly RacerTargetPair<Source>[] {
    const targets = this.racerCollisionTargets;
    const pairs: RacerTargetPair<Source>[] = [];

    for (let leftIndex = 0; leftIndex < targets.length; leftIndex += 1) {
      const left = targets[leftIndex];

      if (left === undefined) {
        continue;
      }

      for (
        let rightIndex = leftIndex + 1;
        rightIndex < targets.length;
        rightIndex += 1
      ) {
        const right = targets[rightIndex];

        if (right !== undefined) {
          pairs.push({ left, right });
        }
      }
    }

    return pairs;
  }
}

export function createRacerTargetRegistry<
  Source extends RacerTargetSource
>(
  sources: readonly Source[],
  options: RacerTargetRegistryCreateOptions = {}
): RacerTargetRegistry<Source> {
  return new RacerTargetRegistry<Source>(
    sources.map((source) => createRacerTarget(source, options))
  );
}

export function createRacerTarget<Source extends RacerTargetSource>(
  source: Source,
  options: RacerTargetRegistryCreateOptions = {}
): RacerTarget<Source> {
  assertRacerTargetSource(source);

  const kind = resolveRacerTargetKind(source, options);
  const isLocalPlayer = kind === "local-player";
  const isRemotePlayer = kind === "remote-player";
  const isAiOpponent = kind === "ai-opponent";
  const isFinished = source.progress.finished;
  const canInteract = !isFinished;

  return {
    id: source.id,
    stableId: source.id,
    slotIndex: source.slotIndex,
    kind,
    controller: source.controller,
    displayName: source.displayName,
    peerId: source.peerId,
    isHost: source.isHost,
    isLocalPlayer,
    isRemotePlayer,
    isAiOpponent,
    collision: source.collision,
    eligibility: {
      canAcceptLocalInput:
        canInteract && isLocalPlayer && source.controller === "human",
      canAcceptRemoteInput:
        canInteract && isRemotePlayer && source.controller === "human",
      canRunAiController: canInteract && isAiOpponent,
      canParticipateInRacerCollisions:
        canInteract && source.collision.canCollideWithRacers,
      canBlockActiveItems: canInteract && source.collision.canBlockItems,
      canCollectItemPickups: canInteract && source.heldItem === null,
      canUseHeldItem:
        canInteract &&
        source.heldItem !== null &&
        source.itemUseCooldownSeconds <= 0,
      canReceiveItemHits:
        canInteract &&
        source.collision.canBlockItems &&
        source.itemHitImmunitySeconds <= 0,
      canBeRanked: true
    },
    source
  };
}

export function canRacerTargetReceiveItemHit(
  target: RacerTarget,
  ownerRacerId: string
): boolean {
  const normalizedOwnerRacerId = requireNonEmptyText(
    ownerRacerId,
    "ownerRacerId"
  );

  return (
    target.stableId !== normalizedOwnerRacerId &&
    target.eligibility.canReceiveItemHits
  );
}

function resolveRacerTargetKind(
  source: RacerTargetSource,
  options: RacerTargetRegistryCreateOptions
): RacerTargetKind {
  if (source.controller === "ai") {
    return "ai-opponent";
  }

  const localPeerId =
    options.localPeerId === undefined
      ? null
      : normalizeOptionalText(options.localPeerId, "localPeerId");
  const classifyPeerlessHumansAsLocal =
    options.classifyPeerlessHumansAsLocal ?? true;

  if (source.peerId !== null && localPeerId !== null) {
    return source.peerId === localPeerId ? "local-player" : "remote-player";
  }

  if (source.peerId === null && classifyPeerlessHumansAsLocal) {
    return "local-player";
  }

  return "remote-player";
}

function assertRacerTargetRegistryIntegrity(
  targets: readonly RacerTarget[]
): void {
  const ids = new Set<string>();
  const stableIds = new Set<string>();
  const slots = new Set<number>();

  for (const target of targets) {
    requireNonEmptyText(target.id, "target.id");
    requireNonEmptyText(target.stableId, "target.stableId");

    if (ids.has(target.id)) {
      throw new Error(`Duplicate racer target id: ${target.id}.`);
    }

    if (stableIds.has(target.stableId)) {
      throw new Error(`Duplicate stable racer target id: ${target.stableId}.`);
    }

    if (slots.has(target.slotIndex)) {
      throw new Error(`Duplicate racer target slot: ${target.slotIndex}.`);
    }

    if (target.stableId !== target.id) {
      throw new Error(
        `Racer target ${target.id} must expose its racer id as stableId.`
      );
    }

    if (target.collision.layer !== "racer") {
      throw new Error(`Racer target ${target.id} must use the racer layer.`);
    }

    if (
      !Number.isFinite(target.collision.radius) ||
      target.collision.radius <= 0
    ) {
      throw new Error(
        `Racer target ${target.id} must expose a positive collision radius.`
      );
    }

    ids.add(target.id);
    stableIds.add(target.stableId);
    slots.add(target.slotIndex);
  }
}

function assertRacerTargetSource(source: RacerTargetSource): void {
  requireNonEmptyText(source.id, "source.id");
  requireNonEmptyText(source.displayName, "source.displayName");

  if (!Number.isInteger(source.slotIndex) || source.slotIndex < 0) {
    throw new Error(`Invalid racer target slot: ${source.slotIndex}.`);
  }

  if (source.peerId !== null) {
    requireNonEmptyText(source.peerId, "source.peerId");
  }

  if (
    !Number.isFinite(source.collisionBounds.boundingRadius) ||
    source.collisionBounds.boundingRadius <= 0
  ) {
    throw new Error(
      `Racer target source ${source.id} must expose positive collision bounds.`
    );
  }

  if (source.body !== source.physics.body) {
    throw new Error(
      `Racer target source ${source.id} must share its Cannon body.`
    );
  }

  if (source.collision !== source.physics.collision) {
    throw new Error(
      `Racer target source ${source.id} must share collision metadata.`
    );
  }

  if (
    source.collision.bodyType !== "dynamic" ||
    source.collision.layer !== "racer"
  ) {
    throw new Error(
      `Racer target source ${source.id} must expose dynamic racer collision metadata.`
    );
  }

  assertFiniteBodyVector(source.body.position, `${source.id} body position`);
  assertFiniteBodyVector(source.body.velocity, `${source.id} body velocity`);
}

function compareRacerTargets(left: RacerTarget, right: RacerTarget): number {
  return left.slotIndex - right.slotIndex || left.id.localeCompare(right.id);
}

function normalizeOptionalText(
  value: string | null,
  label: string
): string | null {
  if (value === null) {
    return null;
  }

  return requireNonEmptyText(value, label);
}

function requireNonEmptyText(value: string, label: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`Racer target ${label} must be non-empty.`);
  }

  return normalized;
}

function assertFiniteBodyVector(
  value: Pick<KartPhysicsState["body"]["position"], "x" | "y" | "z">,
  label: string
): void {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new Error(`Racer target ${label} must be finite.`);
  }
}
