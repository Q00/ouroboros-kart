import {
  SIGNALING_MESSAGE_TYPES,
  createIceCandidateMessage,
  createSdpOfferMessage,
  serializeIceCandidate,
  serializeSessionDescription,
  type IceCandidateSignalingMessage,
  type SdpAnswerSignalingMessage,
  type SdpOfferSignalingMessage,
  type SerializableIceCandidate,
  type SerializableSessionDescription,
  type SignalingCreateOptions,
  type SignalingMessage,
  type SignalingPeerId,
  type SignalingRoomId,
} from "./signaling";
import {
  BrowserDataChannelLifecycle,
  BrowserPeerConnectionLifecycle,
  type BrowserDataChannelPayload,
  type BrowserDataChannelSendOptions,
} from "./peerConnection";

export const HOST_DATA_CHANNEL_LABEL = "kart-gameplay";

export interface HostPeerConnectionOptions {
  readonly roomId: SignalingRoomId;
  readonly hostPeerId: SignalingPeerId;
  readonly remotePeerId?: SignalingPeerId;
  readonly rtcConfig?: RTCConfiguration;
  readonly dataChannelLabel?: string;
  readonly dataChannelOptions?: RTCDataChannelInit;
  readonly onSignal: (message: SdpOfferSignalingMessage | IceCandidateSignalingMessage) => void;
  readonly onDataChannelOpen?: (channel: RTCDataChannel) => void;
  readonly onDataChannelClose?: (channel: RTCDataChannel) => void;
  readonly onDataChannelError?: (
    error: Error,
    channel: RTCDataChannel,
    event: Event | null,
  ) => void;
  readonly onDataChannelMessage?: (data: unknown, event: MessageEvent) => void;
  readonly onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  readonly onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
}

export type RemoteAnswerInput =
  | SdpAnswerSignalingMessage
  | SerializableSessionDescription
  | RTCSessionDescriptionInit;

export type RemoteIceCandidateInput =
  | IceCandidateSignalingMessage
  | SerializableIceCandidate
  | RTCIceCandidate
  | RTCIceCandidateInit
  | null;

export type PeerDataChannelPayload = BrowserDataChannelPayload;
export type PeerDataChannelSendOptions = BrowserDataChannelSendOptions;

export class HostPeerConnectionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "HostPeerConnectionError";
  }
}

export class HostPeerConnection {
  private readonly roomId: SignalingRoomId;
  private readonly hostPeerId: SignalingPeerId;
  private readonly options: HostPeerConnectionOptions;
  private remotePeerId: SignalingPeerId | undefined;
  private peerLifecycle: BrowserPeerConnectionLifecycle | null = null;
  private dataChannelLifecycle: BrowserDataChannelLifecycle | null = null;
  private trackedConnectionState: RTCPeerConnectionState = "new";
  private trackedIceConnectionState: RTCIceConnectionState = "new";
  private trackedDataChannelState: RTCDataChannelState | "none" = "none";
  private closed = false;

  public constructor(options: HostPeerConnectionOptions) {
    this.roomId = requireNonEmptyId(options.roomId, "roomId");
    this.hostPeerId = requireNonEmptyId(options.hostPeerId, "hostPeerId");
    this.remotePeerId =
      options.remotePeerId === undefined
        ? undefined
        : requireNonEmptyId(options.remotePeerId, "remotePeerId");
    this.options = options;
  }

  public get connection(): RTCPeerConnection | null {
    return this.peerLifecycle?.connection ?? null;
  }

  public get channel(): RTCDataChannel | null {
    return this.dataChannelLifecycle?.channel ?? null;
  }

  public get connectedRemotePeerId(): SignalingPeerId | undefined {
    return this.remotePeerId;
  }

  public get connectionState(): RTCPeerConnectionState {
    return this.trackedConnectionState;
  }

  public get iceConnectionState(): RTCIceConnectionState {
    return this.trackedIceConnectionState;
  }

  public get dataChannelState(): RTCDataChannelState | "none" {
    return this.trackedDataChannelState;
  }

  public get queuedRemoteCandidateCount(): number {
    return this.peerLifecycle?.queuedRemoteCandidateCount ?? 0;
  }

  public async start(): Promise<SdpOfferSignalingMessage> {
    this.requireOpen();

    if (this.peerLifecycle !== null) {
      throw new HostPeerConnectionError("Host peer setup has already been started.");
    }

    const peerLifecycle = new BrowserPeerConnectionLifecycle({
      rtcConfig: this.options.rtcConfig ?? createDefaultRtcConfig(),
      onIceCandidate: (candidate, _event, connection) => {
        if (this.peerLifecycle?.connection !== connection) {
          return;
        }

        const message = createIceCandidateMessage(this.createOutboundRoute(), candidate);
        this.options.onSignal(message);
      },
      onConnectionStateChange: (state, connection) => {
        if (this.peerLifecycle?.connection !== connection) {
          return;
        }

        this.trackedConnectionState = state;
        this.options.onConnectionStateChange?.(state);
      },
      onIceConnectionStateChange: (state, connection) => {
        if (this.peerLifecycle?.connection !== connection) {
          return;
        }

        this.trackedIceConnectionState = state;
        this.options.onIceConnectionStateChange?.(state);
      },
    });
    this.peerLifecycle = peerLifecycle;
    this.trackedConnectionState = peerLifecycle.connectionState;
    this.trackedIceConnectionState = peerLifecycle.iceConnectionState;

    try {
      const dataChannel = peerLifecycle.createDataChannel(
        this.options.dataChannelLabel ?? HOST_DATA_CHANNEL_LABEL,
        this.options.dataChannelOptions ?? createReliableGameplayDataChannelOptions(),
      );
      this.bindDataChannel(dataChannel);

      const offer = await peerLifecycle.createOffer();
      this.requireCurrentPeerLifecycle(peerLifecycle);
      const message = createSdpOfferMessage(this.createOutboundRoute(), offer);
      this.options.onSignal(message);

      return message;
    } catch (error) {
      this.close();
      throw error;
    }
  }

  public async acceptRemoteSignal(message: SignalingMessage): Promise<boolean> {
    if (this.closed) {
      return false;
    }

    if (!this.canAcceptInboundSignal(message)) {
      return false;
    }

    if (message.type === SIGNALING_MESSAGE_TYPES.SDP_ANSWER) {
      this.rememberRemotePeer(message.senderId);
      await this.applyRemoteAnswer(message.description);
      return true;
    }

    if (message.type === SIGNALING_MESSAGE_TYPES.ICE_CANDIDATE) {
      this.rememberRemotePeer(message.senderId);
      await this.applyRemoteIceCandidate(message.candidate);
      return true;
    }

    return false;
  }

  public async acceptRemoteAnswer(answer: RemoteAnswerInput): Promise<void> {
    this.requireOpen();

    if (isSdpAnswerSignalingMessage(answer)) {
      this.requireInboundSignal(answer);
      this.rememberRemotePeer(answer.senderId);
      await this.applyRemoteAnswer(answer.description);
      return;
    }

    const description = serializeSessionDescription(answer, "answer") as SerializableSessionDescription & {
      readonly type: "answer";
    };
    await this.applyRemoteAnswer(description);
  }

  public async acceptRemoteIceCandidate(candidate: RemoteIceCandidateInput): Promise<void> {
    this.requireOpen();

    if (isIceCandidateSignalingMessage(candidate)) {
      this.requireInboundSignal(candidate);
      this.rememberRemotePeer(candidate.senderId);
      await this.applyRemoteIceCandidate(candidate.candidate);
      return;
    }

    await this.applyRemoteIceCandidate(serializeIceCandidate(candidate));
  }

  public send(
    data: PeerDataChannelPayload,
    options: PeerDataChannelSendOptions = {},
  ): boolean {
    if (this.closed) {
      return false;
    }

    return this.dataChannelLifecycle?.send(data, options) ?? false;
  }

  public close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    const dataChannelLifecycle = this.dataChannelLifecycle;
    const peerLifecycle = this.peerLifecycle;
    const dataChannel = dataChannelLifecycle?.channel ?? null;
    const shouldReportDataChannelClose =
      dataChannelLifecycle !== null &&
      this.trackedDataChannelState !== "none" &&
      this.trackedDataChannelState !== "closed" &&
      dataChannel?.readyState !== "closed";
    const shouldReportConnectionClose = this.trackedConnectionState !== "closed";
    const shouldReportIceConnectionClose = this.trackedIceConnectionState !== "closed";

    this.dataChannelLifecycle = null;
    this.peerLifecycle = null;
    this.trackedDataChannelState = "none";
    this.trackedConnectionState = "closed";
    this.trackedIceConnectionState = "closed";

    if (shouldReportDataChannelClose && dataChannel !== null) {
      this.options.onDataChannelClose?.(dataChannel);
    }

    if (shouldReportConnectionClose) {
      this.options.onConnectionStateChange?.("closed");
    }

    if (shouldReportIceConnectionClose) {
      this.options.onIceConnectionStateChange?.("closed");
    }

    dataChannelLifecycle?.close();
    peerLifecycle?.close();
  }

  private bindDataChannel(dataChannel: RTCDataChannel): void {
    this.requireOpen();

    let lifecycle: BrowserDataChannelLifecycle;
    lifecycle = new BrowserDataChannelLifecycle(dataChannel, {
      binaryType: "arraybuffer",
      onOpen: (channel) => {
        this.handleDataChannelOpen(lifecycle, channel);
      },
      onClose: (channel) => {
        this.handleDataChannelClose(lifecycle, channel);
      },
      onError: (error, channel, event) => {
        this.handleDataChannelError(lifecycle, error, channel, event);
      },
      onMessage: (data, event) => {
        this.handleDataChannelMessage(lifecycle, data, event);
      },
    });
    this.dataChannelLifecycle = lifecycle;
    this.trackedDataChannelState = lifecycle.readyState;

    if (lifecycle.readyState === "open") {
      this.handleDataChannelOpen(lifecycle, dataChannel);
    }
  }

  private handleDataChannelOpen(
    lifecycle: BrowserDataChannelLifecycle,
    dataChannel: RTCDataChannel,
  ): void {
    if (lifecycle !== this.dataChannelLifecycle) {
      return;
    }

    this.trackedDataChannelState = dataChannel.readyState;
    this.options.onDataChannelOpen?.(dataChannel);
  }

  private handleDataChannelClose(
    lifecycle: BrowserDataChannelLifecycle,
    dataChannel: RTCDataChannel,
  ): void {
    if (lifecycle !== this.dataChannelLifecycle) {
      return;
    }

    this.trackedDataChannelState = dataChannel.readyState;
    this.options.onDataChannelClose?.(dataChannel);
  }

  private handleDataChannelError(
    lifecycle: BrowserDataChannelLifecycle,
    error: Error,
    dataChannel: RTCDataChannel,
    event: Event | null,
  ): void {
    if (lifecycle !== this.dataChannelLifecycle) {
      return;
    }

    this.trackedDataChannelState = dataChannel.readyState;
    this.options.onDataChannelError?.(error, dataChannel, event);
  }

  private handleDataChannelMessage(
    lifecycle: BrowserDataChannelLifecycle,
    data: unknown,
    event: MessageEvent,
  ): void {
    if (lifecycle !== this.dataChannelLifecycle) {
      return;
    }

    this.options.onDataChannelMessage?.(data, event);
  }

  private async applyRemoteAnswer(
    description: SerializableSessionDescription & { readonly type: "answer" },
  ): Promise<void> {
    const peerLifecycle = this.requirePeerLifecycle();

    if (peerLifecycle.remoteDescription !== null) {
      throw new HostPeerConnectionError("Remote answer has already been applied.");
    }

    await peerLifecycle.applyRemoteAnswer(description);
    this.requireCurrentPeerLifecycle(peerLifecycle);
  }

  private async applyRemoteIceCandidate(candidate: SerializableIceCandidate | null): Promise<void> {
    const peerLifecycle = this.requirePeerLifecycle();

    await peerLifecycle.addRemoteIceCandidate(candidate);
    this.requireCurrentPeerLifecycle(peerLifecycle);
  }

  private createOutboundRoute(): SignalingCreateOptions {
    const route: Mutable<SignalingCreateOptions> = {
      roomId: this.roomId,
      senderId: this.hostPeerId,
    };

    if (this.remotePeerId !== undefined) {
      route.recipientId = this.remotePeerId;
    }

    return route;
  }

  private canAcceptInboundSignal(message: SignalingMessage): boolean {
    if (message.roomId !== this.roomId || message.senderId === this.hostPeerId) {
      return false;
    }

    if (message.recipientId !== undefined && message.recipientId !== this.hostPeerId) {
      return false;
    }

    return this.remotePeerId === undefined || message.senderId === this.remotePeerId;
  }

  private requireInboundSignal(message: SignalingMessage): void {
    if (!this.canAcceptInboundSignal(message)) {
      throw new HostPeerConnectionError("Remote signaling message is not addressed to this host.");
    }
  }

  private rememberRemotePeer(peerId: SignalingPeerId): void {
    if (this.remotePeerId === undefined) {
      this.remotePeerId = peerId;
    }
  }

  private requirePeerLifecycle(): BrowserPeerConnectionLifecycle {
    this.requireOpen();

    if (this.peerLifecycle === null) {
      throw new HostPeerConnectionError("Host peer setup has not been started.");
    }

    return this.peerLifecycle;
  }

  private requireCurrentPeerLifecycle(
    peerLifecycle: BrowserPeerConnectionLifecycle,
  ): void {
    this.requireOpen();

    if (this.peerLifecycle !== peerLifecycle) {
      throw new HostPeerConnectionError("Host peer setup is no longer active.");
    }
  }

  private requireOpen(): void {
    if (this.closed) {
      throw new HostPeerConnectionError("Host peer connection has already been closed.");
    }
  }
}

export function createDefaultRtcConfig(): RTCConfiguration {
  return {
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
    ],
  };
}

export function createReliableGameplayDataChannelOptions(): RTCDataChannelInit {
  return {
    ordered: true,
  };
}

export function createLowLatencyDataChannelOptions(): RTCDataChannelInit {
  return {
    ordered: false,
    maxPacketLifeTime: 120,
  };
}

function isSdpAnswerSignalingMessage(value: RemoteAnswerInput): value is SdpAnswerSignalingMessage {
  return isSignalingRecord(value, SIGNALING_MESSAGE_TYPES.SDP_ANSWER) && "description" in value;
}

function isIceCandidateSignalingMessage(
  value: RemoteIceCandidateInput,
): value is IceCandidateSignalingMessage {
  return isSignalingRecord(value, SIGNALING_MESSAGE_TYPES.ICE_CANDIDATE) && "candidate" in value;
}

function isSignalingRecord(
  value: RemoteAnswerInput | RemoteIceCandidateInput,
  type: string,
): value is SdpAnswerSignalingMessage | IceCandidateSignalingMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    (value as { readonly type: unknown }).type === type &&
    "roomId" in value &&
    "senderId" in value
  );
}

function requireNonEmptyId(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HostPeerConnectionError(`Host peer option must be a non-empty string: ${key}`);
  }

  return value;
}

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};
