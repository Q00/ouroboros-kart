import {
  createMultiplayerLobbySession,
  type HumanLobbyJoinResult,
  type LobbySessionSnapshot,
  type MultiplayerLobbySession,
  type RaceStartRoster
} from "../src/lobby/lobbySession.js"

export interface HostLobbyOptions {
  readonly roomCode: string
  readonly hostPeerId: string
  readonly hostDisplayName?: string
}

export interface JoinLobbyOptions {
  readonly roomCode: string
  readonly peerId: string
  readonly displayName?: string
}

export type LobbyRegistryJoinResult =
  | HumanLobbyJoinResult
  | {
      readonly accepted: false
      readonly reason: "room-not-found"
      readonly message: string
      readonly snapshot: null
    }

export class MultiplayerLobbyRegistry {
  private readonly sessionsByRoomCode = new Map<string, MultiplayerLobbySession>()

  public hostLobby(options: HostLobbyOptions): LobbySessionSnapshot {
    const roomCode = requireNonEmptyText(options.roomCode, "roomCode")

    if (this.sessionsByRoomCode.has(roomCode)) {
      throw new Error(`Lobby room already exists: ${roomCode}.`)
    }

    const session = createMultiplayerLobbySession(
      options.hostDisplayName === undefined
        ? { roomCode, hostPeerId: options.hostPeerId }
        : {
            roomCode,
            hostPeerId: options.hostPeerId,
            hostDisplayName: options.hostDisplayName
          }
    )
    this.sessionsByRoomCode.set(session.roomCode, session)
    return session.getSnapshot()
  }

  public joinLobby(options: JoinLobbyOptions): LobbyRegistryJoinResult {
    const roomCode = requireNonEmptyText(options.roomCode, "roomCode")
    const session = this.sessionsByRoomCode.get(roomCode)

    if (session === undefined) {
      return {
        accepted: false,
        reason: "room-not-found",
        message: `Lobby room does not exist: ${roomCode}.`,
        snapshot: null
      }
    }

    return session.addHumanRacer(
      options.displayName === undefined
        ? { peerId: options.peerId }
        : { peerId: options.peerId, displayName: options.displayName }
    )
  }

  public removeHumanRacer(roomCode: string, peerId: string): boolean {
    const normalizedRoomCode = requireNonEmptyText(roomCode, "roomCode")
    const session = this.sessionsByRoomCode.get(normalizedRoomCode)

    if (session === undefined) {
      return false
    }

    const removedRacer = session.removeHumanRacer(peerId)

    if (removedRacer === null) {
      return false
    }

    if (removedRacer.isHost || session.humanRacerCount === 0) {
      this.sessionsByRoomCode.delete(normalizedRoomCode)
    }

    return true
  }

  public closeLobby(roomCode: string): LobbySessionSnapshot | null {
    const normalizedRoomCode = requireNonEmptyText(roomCode, "roomCode")
    const session = this.sessionsByRoomCode.get(normalizedRoomCode)

    if (session === undefined) {
      return null
    }

    this.sessionsByRoomCode.delete(normalizedRoomCode)
    return session.getSnapshot()
  }

  public getLobbySnapshot(roomCode: string): LobbySessionSnapshot | null {
    return (
      this.sessionsByRoomCode
        .get(requireNonEmptyText(roomCode, "roomCode"))
        ?.getSnapshot() ?? null
    )
  }

  public createRaceStartRoster(roomCode: string): RaceStartRoster | null {
    return (
      this.sessionsByRoomCode
        .get(requireNonEmptyText(roomCode, "roomCode"))
        ?.createRaceStartRoster() ?? null
    )
  }
}

function requireNonEmptyText(value: string, key: string): string {
  const normalized = value.trim()

  if (normalized.length === 0) {
    throw new Error(`Lobby registry field must be non-empty: ${key}.`)
  }

  return normalized
}
