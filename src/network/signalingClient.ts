import {
  SIGNALING_MESSAGE_TYPES,
  SIGNALING_PROTOCOL,
  createRoomCreateMessage,
  createRoomJoinMessage,
  createRoomLeaveMessage,
  createRoomStateRequestMessage,
  deserializeSignalingMessage,
  serializeSignalingMessage,
  type RoomJoinRejectedSignalingMessage,
  type SignalingErrorMessage,
  type SignalingMessage,
  type SignalingPeerId,
  type SignalingRoomId,
} from "./signaling";

export type SignalingFailureMessage =
  | RoomJoinRejectedSignalingMessage
  | SignalingErrorMessage;

export interface RoomSignalingClientOptions {
  readonly url?: string;
  readonly onOpen?: () => void;
  readonly onClose?: (event: CloseEvent) => void;
  readonly onError?: (event: Event) => void;
  readonly onMessage?: (message: SignalingMessage) => void;
  readonly onInvalidMessage?: (error: unknown) => void;
  readonly onSignalingError?: (message: SignalingErrorMessage) => void;
  readonly onFailure?: (message: SignalingFailureMessage) => void;
}

export interface CreateRoomRequest {
  readonly roomCode: SignalingRoomId;
  readonly peerId: SignalingPeerId;
  readonly displayName?: string;
}

export interface JoinRoomRequest {
  readonly roomCode: SignalingRoomId;
  readonly peerId: SignalingPeerId;
  readonly displayName?: string;
}

export interface LeaveRoomRequest {
  readonly roomCode: SignalingRoomId;
  readonly peerId: SignalingPeerId;
}

export interface RoomStateRequest {
  readonly roomCode: SignalingRoomId;
  readonly peerId: SignalingPeerId;
}

export class RoomSignalingClient {
  private readonly url: string;
  private socket: WebSocket | null = null;
  private socketBinding: SignalingSocketBinding | null = null;
  private openingPromise: Promise<void> | null = null;

  public constructor(private readonly options: RoomSignalingClientOptions = {}) {
    this.url = options.url ?? getDefaultSignalingUrl();
  }

  public get isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  public get isActive(): boolean {
    return this.socket !== null;
  }

  public async createRoom(request: CreateRoomRequest): Promise<void> {
    await this.open();
    this.send(
      createRoomCreateMessage(
        {
          roomId: request.roomCode,
          senderId: request.peerId,
        },
        request.displayName,
      ),
    );
  }

  public async joinRoom(request: JoinRoomRequest): Promise<void> {
    await this.open();
    this.send(
      createRoomJoinMessage(
        {
          roomId: request.roomCode,
          senderId: request.peerId,
        },
        request.displayName,
      ),
    );
  }

  public leaveRoom(request: LeaveRoomRequest): void {
    this.send(
      createRoomLeaveMessage({
        roomId: request.roomCode,
        senderId: request.peerId,
      }),
    );
  }

  public tryLeaveRoom(request: LeaveRoomRequest): boolean {
    if (!this.isOpen) {
      return false;
    }

    this.leaveRoom(request);
    return true;
  }

  public async requestRoomState(request: RoomStateRequest): Promise<void> {
    await this.open();
    this.send(
      createRoomStateRequestMessage({
        roomId: request.roomCode,
        senderId: request.peerId,
      }),
    );
  }

  public send(message: SignalingMessage): void {
    const socket = this.socket;

    if (socket === null || socket.readyState !== WebSocket.OPEN) {
      throw new Error("Signaling socket is not open.");
    }

    socket.send(serializeSignalingMessage(message));
  }

  public close(): void {
    const socket = this.socket;
    const socketBinding = this.socketBinding;

    this.openingPromise = null;
    this.socketBinding = null;
    this.socket = null;

    if (socketBinding !== null) {
      socketBinding.cleanup();
      socketBinding.rejectOpening(new Error("Signaling socket was closed."));
    }

    if (
      socket !== null &&
      (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    ) {
      socket.close();
    }
  }

  private open(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.openingPromise !== null) {
      return this.openingPromise;
    }

    this.openingPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url, SIGNALING_PROTOCOL);
      let settled = false;
      this.socket = socket;
      socket.binaryType = "arraybuffer";

      const resolveOpening = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        this.openingPromise = null;
        resolve();
      };

      const rejectOpening = (error: Error): void => {
        if (settled) {
          return;
        }

        settled = true;
        this.openingPromise = null;
        reject(error);
      };

      const handleOpen = (): void => {
        if (this.socket !== socket) {
          return;
        }

        this.options.onOpen?.();
        resolveOpening();
      };
      const handleError = (event: Event): void => {
        if (this.socket !== socket) {
          return;
        }

        this.options.onError?.(event);
        rejectOpening(new Error(`Unable to connect to signaling server at ${this.url}.`));
      };
      const handleMessage = (event: MessageEvent): void => {
        if (this.socket !== socket) {
          return;
        }

        this.handleMessage(event, socket);
      };
      const handleClose = (event: CloseEvent): void => {
        if (this.socketBinding?.socket === socket) {
          this.socketBinding.cleanup();
          this.socketBinding = null;
        }

        if (this.socket === socket) {
          this.socket = null;
        }

        this.openingPromise = null;
        this.options.onClose?.(event);
        rejectOpening(new Error(`Signaling server closed before ${this.url} opened.`));
      };
      const cleanup = (): void => {
        socket.removeEventListener("open", handleOpen);
        socket.removeEventListener("error", handleError);
        socket.removeEventListener("message", handleMessage);
        socket.removeEventListener("close", handleClose);
      };

      this.socketBinding = {
        socket,
        cleanup,
        rejectOpening,
      };

      socket.addEventListener("open", handleOpen);
      socket.addEventListener("error", handleError);
      socket.addEventListener("message", handleMessage);
      socket.addEventListener("close", handleClose);
    });

    return this.openingPromise;
  }

  private handleMessage(event: MessageEvent, socket: WebSocket): void {
    const data = event.data;

    if (data instanceof Blob) {
      data
        .arrayBuffer()
        .then((payload) => {
          if (this.socket === socket) {
            this.handlePayload(payload);
          }
        })
        .catch((error: unknown) => {
          if (this.socket === socket) {
            this.options.onInvalidMessage?.(error);
          }
        });
      return;
    }

    if (this.socket === socket) {
      this.handlePayload(data);
    }
  }

  private handlePayload(payload: string | ArrayBuffer): void {
    try {
      const message = deserializeSignalingMessage(payload);

      if (message.type === SIGNALING_MESSAGE_TYPES.SIGNALING_ERROR) {
        this.options.onSignalingError?.(message);
        this.options.onFailure?.(message);
      } else if (message.type === SIGNALING_MESSAGE_TYPES.ROOM_JOIN_REJECTED) {
        this.options.onFailure?.(message);
      }

      this.options.onMessage?.(message);
    } catch (error) {
      this.options.onInvalidMessage?.(error);
    }
  }
}

interface SignalingSocketBinding {
  readonly socket: WebSocket;
  readonly cleanup: () => void;
  readonly rejectOpening: (error: Error) => void;
}

function getDefaultSignalingUrl(): string {
  const configuredUrl = import.meta.env.VITE_KART_SIGNALING_URL;

  if (typeof configuredUrl === "string" && configuredUrl.length > 0) {
    return configuredUrl;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const configuredPort = import.meta.env.VITE_KART_SIGNALING_PORT;
  const port =
    typeof configuredPort === "string" && configuredPort.length > 0
      ? configuredPort
      : "8787";

  return `${protocol}//${window.location.hostname}:${port}`;
}
