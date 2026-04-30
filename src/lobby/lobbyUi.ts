import {
  createMultiplayerLobbySession,
  type LobbySessionSnapshot,
  type MultiplayerLobbySession
} from "./lobbySession"
import {
  createMultiplayerFeedbackModel,
  type MultiplayerFeedbackModel
} from "../network/multiplayerFeedback"
import type { MultiplayerConnectionState } from "../network/multiplayerConnectionState"
import type { SignalingRoomSnapshot } from "../network/signaling"

export type LobbyScreen = "home" | "hosting" | "joining"

export type LobbyConnectionStatus =
  | "offline"
  | "waiting-for-peer"
  | "ready-to-connect"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"

export interface LobbySnapshot {
  readonly screen: LobbyScreen
  readonly roomCode: string
  readonly roomCodeInput: string
  readonly connectionStatus: LobbyConnectionStatus
  readonly statusText: string
  readonly session: LobbySessionSnapshot | null
}

export interface LobbyHostRoomRequest {
  readonly roomCode: string
  readonly peerId: string
  readonly displayName: string
}

export interface LobbyJoinRoomRequest {
  readonly roomCode: string
  readonly peerId: string
  readonly displayName: string
}

export interface LobbyUiOptions {
  readonly onHostRoom?: (request: LobbyHostRoomRequest) => void
  readonly onJoinRoom?: (request: LobbyJoinRoomRequest) => void
  readonly onLeaveRoom?: () => void
}

type LobbyAction =
  | "host-room"
  | "join-room"
  | "focus-code"
  | "connect"
  | "retry-last"
  | "back"

type LobbyConnectionAttempt =
  | {
      readonly role: "host"
      readonly roomCode: string
      readonly displayName: string
    }
  | {
      readonly role: "join"
      readonly roomCode: string
      readonly displayName: string
    }

interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

interface InteractiveRegion {
  readonly action: LobbyAction
  readonly bounds: Rect
}

const ROOM_CODE_LENGTH = 6
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

const STATUS_LABELS: Record<LobbyConnectionStatus, string> = {
  offline: "Offline",
  "waiting-for-peer": "Waiting for peer",
  "ready-to-connect": "Ready to connect",
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Connection error"
}

const STATUS_COLORS: Record<
  LobbyConnectionStatus,
  { readonly fill: string; readonly stroke: string; readonly text: string }
> = {
  offline: {
    fill: "rgba(35, 40, 46, 0.94)",
    stroke: "rgba(245, 247, 250, 0.18)",
    text: "#d7dde4"
  },
  "waiting-for-peer": {
    fill: "rgba(253, 185, 75, 0.18)",
    stroke: "rgba(253, 185, 75, 0.78)",
    text: "#ffe0a3"
  },
  "ready-to-connect": {
    fill: "rgba(102, 197, 255, 0.18)",
    stroke: "rgba(102, 197, 255, 0.74)",
    text: "#c4ebff"
  },
  connecting: {
    fill: "rgba(124, 255, 107, 0.16)",
    stroke: "rgba(124, 255, 107, 0.7)",
    text: "#caffc2"
  },
  connected: {
    fill: "rgba(124, 255, 107, 0.24)",
    stroke: "rgba(124, 255, 107, 0.94)",
    text: "#ecffe9"
  },
  disconnected: {
    fill: "rgba(255, 137, 77, 0.18)",
    stroke: "rgba(255, 137, 77, 0.84)",
    text: "#ffd9c2"
  },
  error: {
    fill: "rgba(255, 89, 89, 0.18)",
    stroke: "rgba(255, 89, 89, 0.84)",
    text: "#ffd2d2"
  }
}

export class LobbyUi {
  private readonly pointerDownHandler = (event: PointerEvent): void => {
    this.handlePointerDown(event)
  }

  private readonly pointerMoveHandler = (event: PointerEvent): void => {
    this.handlePointerMove(event)
  }

  private readonly keyDownHandler = (event: KeyboardEvent): void => {
    this.handleKeyDown(event)
  }

  private readonly pasteHandler = (event: ClipboardEvent): void => {
    this.handlePaste(event)
  }

  private screen: LobbyScreen = "home"
  private roomCode = ""
  private roomCodeInput = ""
  private connectionStatus: LobbyConnectionStatus = "offline"
  private statusText = STATUS_LABELS.offline
  private multiplayerState: MultiplayerConnectionState | null = null
  private lastConnectionAttempt: LobbyConnectionAttempt | null = null
  private codeInputFocused = false
  private hoveredAction: LobbyAction | null = null
  private regions: InteractiveRegion[] = []
  private hostedSession: MultiplayerLobbySession | null = null
  private localHostPeerId = createPeerId()
  private localJoinPeerId = createPeerId()

  public constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly requestRender: () => void,
    private readonly options: LobbyUiOptions = {}
  ) {
    this.canvas.tabIndex = 0
    this.canvas.setAttribute("aria-label", "Ouroboros Kart lobby")
    this.canvas.addEventListener("pointerdown", this.pointerDownHandler)
    this.canvas.addEventListener("pointermove", this.pointerMoveHandler)
    window.addEventListener("keydown", this.keyDownHandler)
    window.addEventListener("paste", this.pasteHandler)
  }

  public getSnapshot(): LobbySnapshot {
    return {
      screen: this.screen,
      roomCode: this.roomCode,
      roomCodeInput: this.roomCodeInput,
      connectionStatus: this.connectionStatus,
      statusText: this.statusText,
      session: this.hostedSession?.getSnapshot() ?? null
    }
  }

  public confirmHostedRoom(roomCode: string): void {
    if (this.screen !== "hosting") {
      return
    }

    this.roomCode = roomCode
    this.setConnectionStatus("waiting-for-peer", `Room ${roomCode} ready`)
  }

  public confirmJoinedRoom(snapshot: SignalingRoomSnapshot): void {
    this.roomCode = snapshot.roomId
    this.roomCodeInput = snapshot.roomId
    this.screen = "joining"
    this.codeInputFocused = false
    this.setConnectionStatus("connecting", `Joined room ${snapshot.roomId}`)
  }

  public rejectJoin(
    message: string,
    state: MultiplayerConnectionState | null = null
  ): void {
    if (this.screen !== "joining") {
      return
    }

    this.multiplayerState = state
    this.codeInputFocused = true
    this.setConnectionStatus("error", message)
  }

  public markPeerJoined(peerId: string, displayName: string): void {
    if (this.hostedSession === null) {
      return
    }

    if (this.hostedSession.hasHumanRacer(peerId)) {
      this.setConnectionStatus("connecting", `${displayName} rejoined`)
      return
    }

    const result = this.addHostedHumanRacer(peerId, displayName)

    if (result.accepted) {
      this.setConnectionStatus("connecting", `${displayName} joined`)
      return
    }

    this.setConnectionStatus("error", result.message)
  }

  public markPeerLeft(peerId: string, message: string): void {
    const removedRacer = this.hostedSession?.removeHumanRacer(peerId) ?? null

    if (removedRacer === null) {
      this.setConnectionStatus("error", message)
      return
    }

    this.setConnectionStatus("waiting-for-peer", message)
  }

  public failConnection(message: string): void {
    this.setConnectionStatus("error", message)
  }

  public endActiveLobby(
    message: string,
    status: Extract<LobbyConnectionStatus, "disconnected" | "error"> = "disconnected",
    state: MultiplayerConnectionState | null = null
  ): void {
    this.multiplayerState = state
    this.screen = "home"
    this.roomCode = ""
    this.roomCodeInput = ""
    this.codeInputFocused = false
    this.hoveredAction = null
    this.hostedSession = null
    this.canvas.style.cursor = "default"
    this.setConnectionStatus(status, message)
  }

  public addHostedHumanRacer(
    peerId: string,
    displayName?: string
  ): ReturnType<MultiplayerLobbySession["addHumanRacer"]> {
    if (this.hostedSession === null) {
      throw new Error("Cannot add a human racer before hosting a lobby.")
    }

    const result = this.hostedSession.addHumanRacer(
      displayName === undefined ? { peerId } : { peerId, displayName }
    )
    this.requestRender()
    return result
  }

  public setConnectionStatus(
    status: LobbyConnectionStatus,
    statusText = STATUS_LABELS[status]
  ): void {
    this.connectionStatus = status
    this.statusText = statusText
    this.requestRender()
  }

  public applyConnectionState(
    state: MultiplayerConnectionState,
    status: LobbyConnectionStatus,
    statusText = state.message
  ): void {
    this.multiplayerState = state
    this.connectionStatus = status
    this.statusText = statusText
    this.requestRender()
  }

  public render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    this.regions = []

    ctx.save()

    if (this.connectionStatus === "connected") {
      this.drawCompactConnectedStatus(ctx, width)
      ctx.restore()
      return
    }

    ctx.fillStyle = "rgba(7, 9, 11, 0.58)"
    ctx.fillRect(0, 0, width, height)

    const panelWidth = Math.min(width - 48, 560)
    const panelHeight =
      this.screen === "home" && this.isTerminalStatus()
        ? 508
        : this.screen === "joining"
          ? 430
          : this.screen === "hosting"
            ? 400
            : 402
    const panelX = (width - panelWidth) / 2
    const panelY = Math.max(28, (height - panelHeight) / 2)
    const panel: Rect = {
      x: panelX,
      y: panelY,
      width: panelWidth,
      height: panelHeight
    }

    this.drawPanel(ctx, panel)
    this.drawHeader(ctx, panel)

    if (this.screen === "home") {
      this.drawHome(ctx, panel)
    } else if (this.screen === "hosting") {
      this.drawHosting(ctx, panel)
    } else {
      this.drawJoining(ctx, panel)
    }

    ctx.restore()
  }

  public dispose(): void {
    this.canvas.removeEventListener("pointerdown", this.pointerDownHandler)
    this.canvas.removeEventListener("pointermove", this.pointerMoveHandler)
    window.removeEventListener("keydown", this.keyDownHandler)
    window.removeEventListener("paste", this.pasteHandler)
  }

  private drawPanel(ctx: CanvasRenderingContext2D, panel: Rect): void {
    ctx.fillStyle = "rgba(17, 21, 24, 0.95)"
    drawRoundedRect(ctx, panel.x, panel.y, panel.width, panel.height, 8)
    ctx.fill()

    ctx.strokeStyle = "rgba(245, 247, 250, 0.18)"
    ctx.lineWidth = 1
    drawRoundedRect(ctx, panel.x, panel.y, panel.width, panel.height, 8)
    ctx.stroke()

    ctx.fillStyle = "#fdb94b"
    ctx.fillRect(panel.x, panel.y, panel.width, 4)
  }

  private drawHeader(ctx: CanvasRenderingContext2D, panel: Rect): void {
    const centerX = panel.x + panel.width / 2

    ctx.fillStyle = "#f5f7fa"
    ctx.font = "800 34px system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("Ouroboros Kart", centerX, panel.y + 62)

    ctx.fillStyle = "#aeb7c0"
    ctx.font = "600 15px system-ui, sans-serif"
    ctx.fillText("Combat race lobby", centerX, panel.y + 90)

    this.drawStatusPill(
      ctx,
      panel.x + 28,
      panel.y + 112,
      panel.width - 56,
      this.connectionStatus,
      this.statusText
    )
  }

  private drawHome(ctx: CanvasRenderingContext2D, panel: Rect): void {
    if (this.isTerminalStatus()) {
      this.drawRecoveryHome(ctx, panel)
      return
    }

    const buttonWidth = Math.min(218, (panel.width - 90) / 2)
    const gap = 18
    const rowWidth = buttonWidth * 2 + gap
    const startX = panel.x + (panel.width - rowWidth) / 2
    const y = panel.y + 184
    const homeActionsEnabled = !this.isConnectionAttemptActive()

    this.drawButton(
      ctx,
      "host-room",
      "Host Room",
      {
        x: startX,
        y,
        width: buttonWidth,
        height: 56
      },
      homeActionsEnabled
    )

    this.drawButton(
      ctx,
      "join-room",
      "Join Room",
      {
        x: startX + buttonWidth + gap,
        y,
        width: buttonWidth,
        height: 56
      },
      homeActionsEnabled
    )

    ctx.fillStyle = "#d9dee4"
    ctx.font = "600 16px system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText("4 racers / 3 laps", panel.x + panel.width / 2, y + 96)
  }

  private drawRecoveryHome(ctx: CanvasRenderingContext2D, panel: Rect): void {
    const centerX = panel.x + panel.width / 2
    const feedback = this.getFeedbackModel()
    const summary: Rect = {
      x: panel.x + 42,
      y: panel.y + 166,
      width: panel.width - 84,
      height: 116
    }

    this.drawFeedbackSummary(ctx, summary, feedback)

    const buttonWidth = Math.min(208, (panel.width - 108) / 2)
    const gap = 18
    const rowWidth = buttonWidth * 2 + gap
    const startX = centerX - rowWidth / 2

    if (feedback.recoveryLabel !== null) {
      this.drawButton(
        ctx,
        "retry-last",
        feedback.recoveryLabel,
        {
          x: centerX - 112,
          y: panel.y + 304,
          width: 224,
          height: 50
        },
        !this.isConnectionAttemptActive()
      )
    }

    this.drawButton(
      ctx,
      "host-room",
      "New Room",
      {
        x: startX,
        y: panel.y + 372,
        width: buttonWidth,
        height: 48
      },
      !this.isConnectionAttemptActive()
    )

    this.drawButton(
      ctx,
      "join-room",
      "Join Room",
      {
        x: startX + buttonWidth + gap,
        y: panel.y + 372,
        width: buttonWidth,
        height: 48
      },
      !this.isConnectionAttemptActive()
    )
  }

  private drawHosting(ctx: CanvasRenderingContext2D, panel: Rect): void {
    const centerX = panel.x + panel.width / 2
    const hostingConnectionAttemptActive =
      this.isHostingConnectionAttemptActive()
    const codeBox: Rect = {
      x: panel.x + 56,
      y: panel.y + 172,
      width: panel.width - 112,
      height: 86
    }

    this.drawRoomCodeBox(ctx, codeBox, this.roomCode, "#f5f7fa")

    ctx.fillStyle = "#aeb7c0"
    ctx.font = "700 13px system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("ROOM CODE", centerX, codeBox.y - 16)

    this.drawButton(
      ctx,
      "back",
      hostingConnectionAttemptActive ? "Cancel" : "Back",
      {
        x: centerX - 92,
        y: panel.y + 306,
        width: 184,
        height: 52
      }
    )

    if (hostingConnectionAttemptActive) {
      this.drawLoadingDots(ctx, centerX, panel.y + 284, "#7cff6b")
    }
  }

  private drawJoining(ctx: CanvasRenderingContext2D, panel: Rect): void {
    const centerX = panel.x + panel.width / 2
    const joinInteractionLocked = this.isJoinInteractionLocked()
    const inputBox: Rect = {
      x: panel.x + 56,
      y: panel.y + 168,
      width: panel.width - 112,
      height: 86
    }

    if (!joinInteractionLocked) {
      this.addRegion("focus-code", inputBox)
    }

    ctx.save()

    if (joinInteractionLocked) {
      ctx.globalAlpha = 0.58
    }

    this.drawRoomCodeBox(
      ctx,
      inputBox,
      this.getVisibleRoomCodeInput(),
      this.roomCodeInput.length === 0 ? "#69737d" : "#f5f7fa"
    )

    ctx.restore()

    if (this.codeInputFocused && !joinInteractionLocked) {
      ctx.strokeStyle = "#7cff6b"
      ctx.lineWidth = 2
      drawRoundedRect(
        ctx,
        inputBox.x,
        inputBox.y,
        inputBox.width,
        inputBox.height,
        8
      )
      ctx.stroke()
    }

    ctx.fillStyle = "#aeb7c0"
    ctx.font = "700 13px system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    ctx.fillText("ROOM CODE", centerX, inputBox.y - 16)

    const buttonWidth = Math.min(184, (panel.width - 96) / 2)
    const gap = 20
    const rowWidth = buttonWidth * 2 + gap
    const startX = centerX - rowWidth / 2
    const y = panel.y + 308

    this.drawButton(
      ctx,
      "back",
      this.isJoinConnectionAttemptActive() ? "Cancel" : "Back",
      {
        x: startX,
        y,
        width: buttonWidth,
        height: 52
      }
    )
    this.drawButton(
      ctx,
      "connect",
      this.getConnectButtonLabel(),
      {
        x: startX + buttonWidth + gap,
        y,
        width: buttonWidth,
        height: 52
      },
      this.canSubmitJoin(),
      this.isJoinConnectionAttemptActive()
    )
  }

  private drawCompactConnectedStatus(
    ctx: CanvasRenderingContext2D,
    width: number
  ): void {
    const feedback = this.getFeedbackModel()
    const panelWidth = Math.min(344, Math.max(280, width - 36))
    const panel: Rect = {
      x: Math.max(18, width - panelWidth - 18),
      y: 18,
      width: panelWidth,
      height: 116
    }

    ctx.fillStyle = "rgba(16, 20, 24, 0.86)"
    drawRoundedRect(ctx, panel.x, panel.y, panel.width, panel.height, 8)
    ctx.fill()

    ctx.strokeStyle = "rgba(124, 255, 107, 0.78)"
    ctx.lineWidth = 1
    drawRoundedRect(ctx, panel.x, panel.y, panel.width, panel.height, 8)
    ctx.stroke()

    ctx.fillStyle = "#7cff6b"
    ctx.font = "800 13px system-ui, sans-serif"
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(feedback.title, panel.x + 16, panel.y + 28)

    ctx.fillStyle = "#f5f7fa"
    ctx.font = "700 12px system-ui, sans-serif"
    ctx.fillText(
      fitCanvasText(ctx, feedback.detail, panel.width - 116),
      panel.x + 16,
      panel.y + 51
    )

    ctx.fillStyle = "#aeb7c0"
    ctx.font = "600 11px system-ui, sans-serif"
    ctx.fillText(
      fitCanvasText(ctx, feedback.metadata.join(" / "), panel.width - 116),
      panel.x + 16,
      panel.y + 74
    )

    this.drawButton(
      ctx,
      "back",
      "Leave",
      {
        x: panel.x + panel.width - 88,
        y: panel.y + 35,
        width: 70,
        height: 42
      }
    )
  }

  private drawFeedbackSummary(
    ctx: CanvasRenderingContext2D,
    bounds: Rect,
    feedback: MultiplayerFeedbackModel
  ): void {
    const colors = getFeedbackColors(feedback.severity)

    ctx.fillStyle = colors.fill
    drawRoundedRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, 8)
    ctx.fill()

    ctx.strokeStyle = colors.stroke
    ctx.lineWidth = 1
    drawRoundedRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, 8)
    ctx.stroke()

    ctx.fillStyle = colors.text
    ctx.font = "800 16px system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "alphabetic"
    ctx.fillText(feedback.title, bounds.x + bounds.width / 2, bounds.y + 32)

    ctx.fillStyle = "#f5f7fa"
    ctx.font = "700 13px system-ui, sans-serif"
    ctx.fillText(
      fitCanvasText(ctx, feedback.detail, bounds.width - 36),
      bounds.x + bounds.width / 2,
      bounds.y + 59
    )

    const metadata = feedback.metadata.join(" / ")

    if (metadata.length > 0) {
      ctx.fillStyle = "#aeb7c0"
      ctx.font = "600 12px system-ui, sans-serif"
      ctx.fillText(
        fitCanvasText(ctx, metadata, bounds.width - 36),
        bounds.x + bounds.width / 2,
        bounds.y + 84
      )
    }
  }

  private drawRoomCodeBox(
    ctx: CanvasRenderingContext2D,
    box: Rect,
    code: string,
    textColor: string
  ): void {
    ctx.fillStyle = "rgba(245, 247, 250, 0.08)"
    drawRoundedRect(ctx, box.x, box.y, box.width, box.height, 8)
    ctx.fill()

    ctx.strokeStyle = "rgba(245, 247, 250, 0.16)"
    ctx.lineWidth = 1
    drawRoundedRect(ctx, box.x, box.y, box.width, box.height, 8)
    ctx.stroke()

    ctx.fillStyle = textColor
    ctx.font = "800 40px ui-monospace, SFMono-Regular, Menlo, monospace"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(code, box.x + box.width / 2, box.y + box.height / 2 + 2)
  }

  private drawStatusPill(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    status: LobbyConnectionStatus,
    label: string
  ): void {
    const colors = STATUS_COLORS[status]
    const displayLabel =
      status === "connecting" ? formatLoadingLabel(label) : label

    ctx.fillStyle = colors.fill
    drawRoundedRect(ctx, x, y, width, 38, 8)
    ctx.fill()

    ctx.strokeStyle = colors.stroke
    ctx.lineWidth = 1
    drawRoundedRect(ctx, x, y, width, 38, 8)
    ctx.stroke()

    ctx.fillStyle = colors.text
    ctx.font = "700 14px system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(fitCanvasText(ctx, displayLabel, width - 24), x + width / 2, y + 20)
  }

  private drawButton(
    ctx: CanvasRenderingContext2D,
    action: LobbyAction,
    label: string,
    bounds: Rect,
    enabled = true,
    loading = false
  ): void {
    const hovered = enabled && this.hoveredAction === action
    const primary =
      action === "host-room" || action === "connect" || action === "retry-last"
    const displayLabel = loading ? formatLoadingLabel(label) : label

    if (enabled) {
      this.addRegion(action, bounds)
    }

    ctx.fillStyle = !enabled
      ? "rgba(245, 247, 250, 0.08)"
      : primary
        ? hovered
          ? "#9cff8d"
          : "#7cff6b"
        : hovered
          ? "rgba(245, 247, 250, 0.18)"
          : "rgba(245, 247, 250, 0.1)"
    drawRoundedRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, 8)
    ctx.fill()

    ctx.strokeStyle = !enabled
      ? "rgba(245, 247, 250, 0.12)"
      : primary
        ? "rgba(16, 20, 24, 0.6)"
        : "rgba(245, 247, 250, 0.2)"
    ctx.lineWidth = 1
    drawRoundedRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, 8)
    ctx.stroke()

    ctx.fillStyle = !enabled ? "#7a838c" : primary ? "#101418" : "#f5f7fa"
    ctx.font = "800 16px system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(
      fitCanvasText(ctx, displayLabel, bounds.width - 18),
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2
    )
  }

  private drawLoadingDots(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    color: string
  ): void {
    const activeDotIndex = Math.floor(getAnimationNow() / 220) % 3

    ctx.save()
    ctx.fillStyle = color

    for (let index = 0; index < 3; index += 1) {
      ctx.globalAlpha = index === activeDotIndex ? 1 : 0.36
      ctx.beginPath()
      ctx.arc(centerX - 12 + index * 12, centerY, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }

  private addRegion(action: LobbyAction, bounds: Rect): void {
    this.regions.push({ action, bounds })
  }

  private handlePointerDown(event: PointerEvent): void {
    this.canvas.focus()

    const point = this.getCanvasPoint(event)
    const region = this.getRegionAt(point.x, point.y)

    if (region === null) {
      this.codeInputFocused = false
      this.requestRender()
      return
    }

    this.handleAction(region.action)
  }

  private handlePointerMove(event: PointerEvent): void {
    const point = this.getCanvasPoint(event)
    const region = this.getRegionAt(point.x, point.y)
    const nextHoveredAction = region?.action ?? null

    if (this.hoveredAction === nextHoveredAction) {
      return
    }

    this.hoveredAction = nextHoveredAction
    this.canvas.style.cursor = nextHoveredAction === null ? "default" : "pointer"
    this.requestRender()
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.screen !== "joining") {
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      this.returnHome()
      return
    }

    if (this.isJoinInteractionLocked()) {
      if (isRoomCodeEditKey(event)) {
        event.preventDefault()
      }

      return
    }

    if (event.key === "Enter") {
      event.preventDefault()
      this.tryConnect()
      return
    }

    if (event.key === "Backspace") {
      event.preventDefault()
      this.codeInputFocused = true
      this.setRoomCodeInput(this.roomCodeInput.slice(0, -1))
      return
    }

    if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1) {
      return
    }

    if (/^[a-zA-Z0-9]$/.test(event.key)) {
      event.preventDefault()
      this.codeInputFocused = true
      this.setRoomCodeInput(this.roomCodeInput + event.key)
    }
  }

  private handlePaste(event: ClipboardEvent): void {
    if (this.screen !== "joining") {
      return
    }

    if (this.isJoinInteractionLocked()) {
      event.preventDefault()
      return
    }

    const clipboardText = event.clipboardData?.getData("text") ?? ""

    if (clipboardText.length === 0) {
      return
    }

    event.preventDefault()
    this.codeInputFocused = true
    this.setRoomCodeInput(this.roomCodeInput + clipboardText)
  }

  private handleAction(action: LobbyAction): void {
    if (action === "host-room") {
      if (this.screen !== "home" || this.isConnectionAttemptActive()) {
        return
      }

      this.startHostingAttempt(createRoomCode(), "Host")
      return
    }

    if (action === "join-room") {
      if (this.screen !== "home" || this.isConnectionAttemptActive()) {
        return
      }

      this.screen = "joining"
      this.roomCode = ""
      this.roomCodeInput = ""
      this.localJoinPeerId = createPeerId()
      this.codeInputFocused = true
      this.updateJoinStatus()
      this.requestRender()
      return
    }

    if (action === "focus-code") {
      if (this.isJoinInteractionLocked()) {
        return
      }

      this.codeInputFocused = true
      this.requestRender()
      return
    }

    if (action === "connect") {
      this.tryConnect()
      return
    }

    if (action === "retry-last") {
      this.retryLastConnection()
      return
    }

    this.returnHome()
  }

  private tryConnect(): void {
    if (this.isJoinInteractionLocked()) {
      return
    }

    if (!this.canConnect()) {
      this.updateJoinStatus()
      this.requestRender()
      return
    }

    this.startJoinAttempt(this.roomCodeInput, "Player 2")
  }

  private retryLastConnection(): void {
    const lastAttempt = this.lastConnectionAttempt

    if (
      lastAttempt === null ||
      this.screen !== "home" ||
      this.isConnectionAttemptActive()
    ) {
      return
    }

    this.options.onLeaveRoom?.()

    if (lastAttempt.role === "host") {
      this.startHostingAttempt(lastAttempt.roomCode, lastAttempt.displayName)
      return
    }

    this.startJoinAttempt(lastAttempt.roomCode, lastAttempt.displayName)
  }

  private startHostingAttempt(roomCode: string, displayName: string): void {
    this.screen = "hosting"
    this.roomCode = roomCode
    this.roomCodeInput = ""
    this.localHostPeerId = createPeerId()
    this.hostedSession = createMultiplayerLobbySession({
      roomCode: this.roomCode,
      hostPeerId: this.localHostPeerId,
      hostDisplayName: displayName
    })
    this.lastConnectionAttempt = {
      role: "host",
      roomCode: this.roomCode,
      displayName
    }
    this.multiplayerState = null
    this.codeInputFocused = false
    this.setConnectionStatus("connecting", "Creating signaling room")
    this.options.onHostRoom?.({
      roomCode: this.roomCode,
      peerId: this.localHostPeerId,
      displayName
    })
  }

  private startJoinAttempt(roomCode: string, displayName: string): void {
    this.screen = "joining"
    this.roomCode = roomCode
    this.roomCodeInput = roomCode
    this.localJoinPeerId = createPeerId()
    this.lastConnectionAttempt = {
      role: "join",
      roomCode,
      displayName
    }
    this.multiplayerState = null
    this.codeInputFocused = false
    this.setConnectionStatus("connecting", `Joining room ${roomCode}`)
    this.options.onJoinRoom?.({
      roomCode,
      peerId: this.localJoinPeerId,
      displayName
    })
  }

  private returnHome(): void {
    this.screen = "home"
    this.roomCode = ""
    this.roomCodeInput = ""
    this.codeInputFocused = false
    this.hoveredAction = null
    this.hostedSession = null
    this.multiplayerState = null
    this.options.onLeaveRoom?.()
    this.canvas.style.cursor = "default"
    this.setConnectionStatus("offline")
  }

  private setRoomCodeInput(value: string): void {
    this.multiplayerState = null
    this.roomCodeInput = normalizeRoomCode(value)
    this.updateJoinStatus()
    this.requestRender()
  }

  private updateJoinStatus(): void {
    if (this.isJoinInteractionLocked()) {
      return
    }

    if (this.canConnect()) {
      this.connectionStatus = "ready-to-connect"
      this.statusText = STATUS_LABELS["ready-to-connect"]
      return
    }

    this.connectionStatus = "offline"
    this.statusText = "Room code required"
  }

  private canConnect(): boolean {
    return this.roomCodeInput.length === ROOM_CODE_LENGTH
  }

  private canSubmitJoin(): boolean {
    return this.canConnect() && !this.isJoinInteractionLocked()
  }

  private getConnectButtonLabel(): string {
    if (this.connectionStatus === "connecting") {
      return "Connecting"
    }

    if (this.connectionStatus === "connected") {
      return "Connected"
    }

    if (this.isTerminalStatus()) {
      return "Retry"
    }

    return "Connect"
  }

  private isConnectionAttemptActive(): boolean {
    return this.connectionStatus === "connecting"
  }

  private isHostingConnectionAttemptActive(): boolean {
    return this.screen === "hosting" && this.isConnectionAttemptActive()
  }

  private isJoinConnectionAttemptActive(): boolean {
    return this.screen === "joining" && this.isConnectionAttemptActive()
  }

  private isJoinInteractionLocked(): boolean {
    return (
      this.screen === "joining" &&
      (this.connectionStatus === "connecting" ||
        this.connectionStatus === "connected")
    )
  }

  private isTerminalStatus(): boolean {
    return (
      this.connectionStatus === "disconnected" ||
      this.connectionStatus === "error"
    )
  }

  private getFeedbackModel(): MultiplayerFeedbackModel {
    if (this.multiplayerState !== null) {
      return createMultiplayerFeedbackModel(this.multiplayerState, {
        canRetryLastSession: this.lastConnectionAttempt !== null,
        lastSessionRole: this.lastConnectionAttempt?.role ?? null,
        now: getAnimationNow()
      })
    }

    return {
      title: STATUS_LABELS[this.connectionStatus],
      detail: this.statusText,
      severity: getFallbackFeedbackSeverity(this.connectionStatus),
      metadata:
        this.lastConnectionAttempt === null
          ? []
          : [`Last room ${this.lastConnectionAttempt.roomCode}`],
      recoveryLabel:
        this.isTerminalStatus() && this.lastConnectionAttempt !== null
          ? this.lastConnectionAttempt.role === "host"
            ? "Retry Host"
            : "Retry Join"
          : null,
      isConnected: this.connectionStatus === "connected",
      isTerminal: this.isTerminalStatus(),
      updatedAgeSeconds: null
    }
  }

  private getVisibleRoomCodeInput(): string {
    const paddedCode = this.roomCodeInput.padEnd(ROOM_CODE_LENGTH, "-")

    if (!this.codeInputFocused || this.roomCodeInput.length >= ROOM_CODE_LENGTH) {
      return paddedCode
    }

    return `${this.roomCodeInput}|${"-".repeat(
      ROOM_CODE_LENGTH - this.roomCodeInput.length - 1
    )}`
  }

  private getRegionAt(x: number, y: number): InteractiveRegion | null {
    for (let index = this.regions.length - 1; index >= 0; index -= 1) {
      const region = this.regions[index]

      if (region !== undefined && rectContains(region.bounds, x, y)) {
        return region
      }
    }

    return null
  }

  private getCanvasPoint(event: PointerEvent): { readonly x: number; readonly y: number } {
    const rect = this.canvas.getBoundingClientRect()

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    }
  }
}

function getFallbackFeedbackSeverity(
  status: LobbyConnectionStatus
): MultiplayerFeedbackModel["severity"] {
  switch (status) {
    case "connected":
      return "success"
    case "connecting":
    case "ready-to-connect":
    case "waiting-for-peer":
      return "pending"
    case "disconnected":
      return "warning"
    case "error":
      return "danger"
    case "offline":
      return "idle"
  }
}

function getFeedbackColors(
  severity: MultiplayerFeedbackModel["severity"]
): { readonly fill: string; readonly stroke: string; readonly text: string } {
  switch (severity) {
    case "success":
      return {
        fill: "rgba(124, 255, 107, 0.14)",
        stroke: "rgba(124, 255, 107, 0.7)",
        text: "#caffc2"
      }
    case "pending":
      return {
        fill: "rgba(102, 197, 255, 0.12)",
        stroke: "rgba(102, 197, 255, 0.62)",
        text: "#c4ebff"
      }
    case "warning":
      return {
        fill: "rgba(255, 137, 77, 0.14)",
        stroke: "rgba(255, 137, 77, 0.76)",
        text: "#ffd9c2"
      }
    case "danger":
      return {
        fill: "rgba(255, 89, 89, 0.14)",
        stroke: "rgba(255, 89, 89, 0.78)",
        text: "#ffd2d2"
      }
    case "idle":
      return {
        fill: "rgba(245, 247, 250, 0.08)",
        stroke: "rgba(245, 247, 250, 0.16)",
        text: "#d7dde4"
      }
  }
}

function fitCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text
  }

  const ellipsis = "..."
  let start = 0
  let end = text.length

  while (start < end) {
    const midpoint = Math.ceil((start + end) / 2)
    const candidate = `${text.slice(0, midpoint)}${ellipsis}`

    if (ctx.measureText(candidate).width <= maxWidth) {
      start = midpoint
    } else {
      end = midpoint - 1
    }
  }

  return `${text.slice(0, start)}${ellipsis}`
}

function normalizeRoomCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, ROOM_CODE_LENGTH)
}

function createRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH)

  if (globalThis.crypto?.getRandomValues !== undefined) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  let code = ""

  for (const byte of bytes) {
    code += ROOM_CODE_ALPHABET.charAt(byte % ROOM_CODE_ALPHABET.length)
  }

  return code
}

function createPeerId(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)

  if (randomUUID !== undefined) {
    return randomUUID()
  }

  return `peer-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`
}

function formatLoadingLabel(label: string): string {
  return `${label}${".".repeat(Math.floor(getAnimationNow() / 320) % 4)}`
}

function getAnimationNow(): number {
  return globalThis.performance?.now() ?? Date.now()
}

function isRoomCodeEditKey(event: KeyboardEvent): boolean {
  return (
    event.key === "Enter" ||
    event.key === "Backspace" ||
    (!event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      event.key.length === 1 &&
      /^[a-zA-Z0-9]$/.test(event.key))
  )
}

function rectContains(rect: Rect, x: number, y: number): boolean {
  return (
    x >= rect.x &&
    x <= rect.x + rect.width &&
    y >= rect.y &&
    y <= rect.y + rect.height
  )
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const cornerRadius = Math.min(radius, width / 2, height / 2)

  ctx.beginPath()
  ctx.moveTo(x + cornerRadius, y)
  ctx.lineTo(x + width - cornerRadius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + cornerRadius)
  ctx.lineTo(x + width, y + height - cornerRadius)
  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - cornerRadius,
    y + height
  )
  ctx.lineTo(x + cornerRadius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - cornerRadius)
  ctx.lineTo(x, y + cornerRadius)
  ctx.quadraticCurveTo(x, y, x + cornerRadius, y)
  ctx.closePath()
}
