import { MAX_HUMAN_RACERS_PER_LOBBY } from "../config/gameConfig.js"
import {
  createMultiplayerRaceStartRoster,
  type RaceStartRoster
} from "../race/raceStartRoster.js"

export { MAX_HUMAN_RACERS_PER_LOBBY } from "../config/gameConfig.js"
export {
  createRaceStartRoster,
  createMultiplayerRaceStartRoster,
  type HumanRaceStartRacerInput,
  type RaceStartAiRacer,
  type RaceStartHumanRacer,
  type RaceStartRacer,
  type RaceStartRoster
} from "../race/raceStartRoster.js"

export type LobbyJoinRejectionReason = "duplicate-peer" | "lobby-full"

export interface HumanLobbyRacer {
  readonly peerId: string
  readonly displayName: string
  readonly slotIndex: number
  readonly joinedAt: number
  readonly isHost: boolean
}

export interface MultiplayerLobbySessionOptions {
  readonly roomCode: string
  readonly hostPeerId: string
  readonly hostDisplayName?: string
  readonly now?: () => number
}

export interface HumanLobbyJoinOptions {
  readonly peerId: string
  readonly displayName?: string
  readonly joinedAt?: number
}

export interface LobbySessionSnapshot {
  readonly roomCode: string
  readonly hostPeerId: string
  readonly maxHumanRacers: number
  readonly humanRacerCount: number
  readonly availableHumanRacerSlots: number
  readonly isHumanLobbyFull: boolean
  readonly humanRacers: readonly HumanLobbyRacer[]
}

export type HumanLobbyJoinResult =
  | {
      readonly accepted: true
      readonly racer: HumanLobbyRacer
      readonly snapshot: LobbySessionSnapshot
    }
  | {
      readonly accepted: false
      readonly reason: LobbyJoinRejectionReason
      readonly message: string
      readonly snapshot: LobbySessionSnapshot
    }

export class MultiplayerLobbySession {
  private readonly now: () => number
  private readonly racersByPeerId = new Map<string, HumanLobbyRacer>()

  public readonly roomCode: string
  public readonly hostPeerId: string

  public constructor(options: MultiplayerLobbySessionOptions) {
    this.roomCode = requireNonEmptyText(options.roomCode, "roomCode")
    this.hostPeerId = requireNonEmptyText(options.hostPeerId, "hostPeerId")
    this.now = options.now ?? Date.now

    const hostRacer = this.createHumanLobbyRacer({
      peerId: this.hostPeerId,
      displayName: options.hostDisplayName ?? "Host",
      isHost: true,
      joinedAt: this.now()
    })
    this.racersByPeerId.set(hostRacer.peerId, hostRacer)
  }

  public get humanRacerCount(): number {
    return this.racersByPeerId.size
  }

  public get availableHumanRacerSlots(): number {
    return MAX_HUMAN_RACERS_PER_LOBBY - this.humanRacerCount
  }

  public get isHumanLobbyFull(): boolean {
    return this.humanRacerCount >= MAX_HUMAN_RACERS_PER_LOBBY
  }

  public getSnapshot(): LobbySessionSnapshot {
    const humanRacers = [...this.racersByPeerId.values()].sort(
      (left, right) => left.slotIndex - right.slotIndex
    )

    return {
      roomCode: this.roomCode,
      hostPeerId: this.hostPeerId,
      maxHumanRacers: MAX_HUMAN_RACERS_PER_LOBBY,
      humanRacerCount: humanRacers.length,
      availableHumanRacerSlots:
        MAX_HUMAN_RACERS_PER_LOBBY - humanRacers.length,
      isHumanLobbyFull: humanRacers.length >= MAX_HUMAN_RACERS_PER_LOBBY,
      humanRacers
    }
  }

  public createRaceStartRoster(): RaceStartRoster {
    return createMultiplayerRaceStartRoster(this.getSnapshot().humanRacers)
  }

  public hasHumanRacer(peerId: string): boolean {
    return this.racersByPeerId.has(requireNonEmptyText(peerId, "peerId"))
  }

  public canAcceptHumanRacer(peerId: string): boolean {
    const normalizedPeerId = requireNonEmptyText(peerId, "peerId")

    return (
      !this.racersByPeerId.has(normalizedPeerId) &&
      this.humanRacerCount < MAX_HUMAN_RACERS_PER_LOBBY
    )
  }

  public addHumanRacer(options: HumanLobbyJoinOptions): HumanLobbyJoinResult {
    const peerId = requireNonEmptyText(options.peerId, "peerId")

    if (this.racersByPeerId.has(peerId)) {
      return this.rejectJoin(
        "duplicate-peer",
        `Peer ${peerId} is already in this lobby.`
      )
    }

    if (this.isHumanLobbyFull) {
      return this.rejectJoin(
        "lobby-full",
        `Lobby ${this.roomCode} already has ${MAX_HUMAN_RACERS_PER_LOBBY} human racers.`
      )
    }

    const racer = this.createHumanLobbyRacer({
      peerId,
      displayName: options.displayName ?? `Player ${this.humanRacerCount + 1}`,
      isHost: false,
      joinedAt: options.joinedAt ?? this.now()
    })
    this.racersByPeerId.set(racer.peerId, racer)

    return {
      accepted: true,
      racer,
      snapshot: this.getSnapshot()
    }
  }

  public removeHumanRacer(peerId: string): HumanLobbyRacer | null {
    const normalizedPeerId = requireNonEmptyText(peerId, "peerId")
    const racer = this.racersByPeerId.get(normalizedPeerId)

    if (racer === undefined) {
      return null
    }

    this.racersByPeerId.delete(normalizedPeerId)
    return racer
  }

  private createHumanLobbyRacer(options: {
    readonly peerId: string
    readonly displayName: string
    readonly isHost: boolean
    readonly joinedAt: number
  }): HumanLobbyRacer {
    return {
      peerId: options.peerId,
      displayName: requireNonEmptyText(options.displayName, "displayName"),
      slotIndex: this.getNextOpenHumanSlotIndex(),
      joinedAt: requireFiniteTimestamp(options.joinedAt, "joinedAt"),
      isHost: options.isHost
    }
  }

  private getNextOpenHumanSlotIndex(): number {
    const occupiedSlots = new Set<number>()

    for (const racer of this.racersByPeerId.values()) {
      occupiedSlots.add(racer.slotIndex)
    }

    for (
      let slotIndex = 0;
      slotIndex < MAX_HUMAN_RACERS_PER_LOBBY;
      slotIndex += 1
    ) {
      if (!occupiedSlots.has(slotIndex)) {
        return slotIndex
      }
    }

    throw new Error("Human lobby has no open racer slots.")
  }

  private rejectJoin(
    reason: LobbyJoinRejectionReason,
    message: string
  ): HumanLobbyJoinResult {
    return {
      accepted: false,
      reason,
      message,
      snapshot: this.getSnapshot()
    }
  }
}

export function createMultiplayerLobbySession(
  options: MultiplayerLobbySessionOptions
): MultiplayerLobbySession {
  return new MultiplayerLobbySession(options)
}

function requireNonEmptyText(value: string, key: string): string {
  const normalized = value.trim()

  if (normalized.length === 0) {
    throw new Error(`Lobby session field must be non-empty: ${key}.`)
  }

  return normalized
}

function requireFiniteTimestamp(value: number, key: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `Lobby session timestamp must be finite and non-negative: ${key}.`
    )
  }

  return value
}
