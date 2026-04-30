import {
  HOST_DATA_CHANNEL_LABEL,
  type PeerDataChannelPayload,
  type PeerDataChannelSendOptions,
  createDefaultRtcConfig,
} from "./hostPeer";
import {
  BrowserDataChannelLifecycle,
  BrowserPeerConnectionLifecycle,
} from "./peerConnection";
import {
  SIGNALING_MESSAGE_TYPES,
  createIceCandidateMessage,
  createSdpAnswerMessage,
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

export interface GuestPeerConnectionOptions {
  readonly roomId: SignalingRoomId;
  readonly guestPeerId: SignalingPeerId;
  readonly hostPeerId?: SignalingPeerId;
  readonly rtcConfig?: RTCConfiguration;
  readonly expectedDataChannelLabel?: string;
  readonly onSignal: (message: SdpAnswerSignalingMessage | IceCandidateSignalingMessage) => void;
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

export type RemoteOfferInput =
  | SdpOfferSignalingMessage
  | SerializableSessionDescription
  | RTCSessionDescriptionInit;

export type GuestRemoteIceCandidateInput =
  | IceCandidateSignalingMessage
  | SerializableIceCandidate
  | RTCIceCandidate
  | RTCIceCandidateInit
  | null;

export class GuestPeerConnectionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "GuestPeerConnectionError";
  }
}

export class GuestPeerConnection {
  private readonly roomId: SignalingRoomId;
  private readonly guestPeerId: SignalingPeerId;
  private readonly options: GuestPeerConnectionOptions;
  private hostPeerId: SignalingPeerId | undefined;
  private peerLifecycle: BrowserPeerConnectionLifecycle | null = null;
  private dataChannelLifecycle: BrowserDataChannelLifecycle | null = null;
  private trackedConnectionState: RTCPeerConnectionState = "new";
  private trackedIceConnectionState: RTCIceConnectionState = "new";
  private trackedDataChannelState: RTCDataChannelState | "none" = "none";
  private closed = false;

  public constructor(options: GuestPeerConnectionOptions) {
    this.roomId = requireNonEmptyId(options.roomId, "roomId");
    this.guestPeerId = requireNonEmptyId(options.guestPeerId, "guestPeerId");
    this.hostPeerId =
      options.hostPeerId === undefined
        ? undefined
        : requireNonEmptyId(options.hostPeerId, "hostPeerId");
    this.options = options;
  }

  public get connection(): RTCPeerConnection | null {
    return this.peerLifecycle?.connection ?? null;
  }

  public get channel(): RTCDataChannel | null {
    return this.dataChannelLifecycle?.channel ?? null;
  }

  public get connectedHostPeerId(): SignalingPeerId | undefined {
    return this.hostPeerId;
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

  public async acceptRemoteSignal(message: SignalingMessage): Promise<boolean> {
    if (this.closed) {
      return false;
    }

    if (!this.canAcceptInboundSignal(message)) {
      return false;
    }

    if (message.type === SIGNALING_MESSAGE_TYPES.SDP_OFFER) {
      this.rememberHostPeer(message.senderId);
      await this.acceptRemoteOffer(message);
      return true;
    }

    if (message.type === SIGNALING_MESSAGE_TYPES.ICE_CANDIDATE) {
      this.rememberHostPeer(message.senderId);
      await this.acceptRemoteIceCandidate(message);
      return true;
    }

    return false;
  }

  public async acceptRemoteOffer(offer: RemoteOfferInput): Promise<SdpAnswerSignalingMessage> {
    this.requireOpen();

    if (isSdpOfferSignalingMessage(offer)) {
      this.requireInboundSignal(offer);
      this.rememberHostPeer(offer.senderId);
      return this.applyRemoteOffer(offer.description);
    }

    const description = serializeSessionDescription(offer, "offer") as SerializableSessionDescription & {
      readonly type: "offer";
    };
    return this.applyRemoteOffer(description);
  }

  public async acceptRemoteIceCandidate(candidate: GuestRemoteIceCandidateInput): Promise<void> {
    this.requireOpen();

    if (isIceCandidateSignalingMessage(candidate)) {
      this.requireInboundSignal(candidate);
      this.rememberHostPeer(candidate.senderId);
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

  private async applyRemoteOffer(
    description: SerializableSessionDescription & { readonly type: "offer" },
  ): Promise<SdpAnswerSignalingMessage> {
    const peerLifecycle = this.requireOrCreatePeerLifecycle();

    if (peerLifecycle.remoteDescription !== null) {
      throw new GuestPeerConnectionError("Remote offer has already been applied.");
    }

    await peerLifecycle.applyRemoteOffer(description);
    this.requireCurrentPeerLifecycle(peerLifecycle);
    const answer = await peerLifecycle.createAnswer();
    this.requireCurrentPeerLifecycle(peerLifecycle);
    const message = createSdpAnswerMessage(this.createOutboundRoute(), answer);
    this.options.onSignal(message);

    return message;
  }

  private async applyRemoteIceCandidate(candidate: SerializableIceCandidate | null): Promise<void> {
    const peerLifecycle = this.requireOrCreatePeerLifecycle();

    await peerLifecycle.addRemoteIceCandidate(candidate);
    this.requireCurrentPeerLifecycle(peerLifecycle);
  }

  private requireOrCreatePeerLifecycle(): BrowserPeerConnectionLifecycle {
    this.requireOpen();

    if (this.peerLifecycle !== null) {
      return this.peerLifecycle;
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
      onDataChannel: (channel, _event, connection) => {
        if (this.peerLifecycle?.connection !== connection) {
          return;
        }

        this.bindIncomingDataChannel(channel);
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

    return peerLifecycle;
  }

  private bindIncomingDataChannel(dataChannel: RTCDataChannel): void {
    if (this.closed) {
      dataChannel.close();
      return;
    }

    const expectedLabel = this.options.expectedDataChannelLabel ?? HOST_DATA_CHANNEL_LABEL;

    if (dataChannel.label !== expectedLabel) {
      dataChannel.close();
      return;
    }

    this.dataChannelLifecycle?.close();
    this.bindDataChannel(dataChannel);
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

  private createOutboundRoute(): SignalingCreateOptions {
    const route: Mutable<SignalingCreateOptions> = {
      roomId: this.roomId,
      senderId: this.guestPeerId,
    };

    if (this.hostPeerId !== undefined) {
      route.recipientId = this.hostPeerId;
    }

    return route;
  }

  private canAcceptInboundSignal(message: SignalingMessage): boolean {
    if (message.roomId !== this.roomId || message.senderId === this.guestPeerId) {
      return false;
    }

    if (message.recipientId !== undefined && message.recipientId !== this.guestPeerId) {
      return false;
    }

    return this.hostPeerId === undefined || message.senderId === this.hostPeerId;
  }

  private requireInboundSignal(message: SignalingMessage): void {
    if (!this.canAcceptInboundSignal(message)) {
      throw new GuestPeerConnectionError("Remote signaling message is not addressed to this guest.");
    }
  }

  private rememberHostPeer(peerId: SignalingPeerId): void {
    if (this.hostPeerId === undefined) {
      this.hostPeerId = peerId;
    }
  }

  private requireCurrentPeerLifecycle(
    peerLifecycle: BrowserPeerConnectionLifecycle,
  ): void {
    this.requireOpen();

    if (this.peerLifecycle !== peerLifecycle) {
      throw new GuestPeerConnectionError("Guest peer setup is no longer active.");
    }
  }

  private requireOpen(): void {
    if (this.closed) {
      throw new GuestPeerConnectionError("Guest peer connection has already been closed.");
    }
  }
}

function isSdpOfferSignalingMessage(value: RemoteOfferInput): value is SdpOfferSignalingMessage {
  return isSignalingRecord(value, SIGNALING_MESSAGE_TYPES.SDP_OFFER) && "description" in value;
}

function isIceCandidateSignalingMessage(
  value: GuestRemoteIceCandidateInput,
): value is IceCandidateSignalingMessage {
  return isSignalingRecord(value, SIGNALING_MESSAGE_TYPES.ICE_CANDIDATE) && "candidate" in value;
}

function isSignalingRecord(
  value: RemoteOfferInput | GuestRemoteIceCandidateInput,
  type: string,
): value is SdpOfferSignalingMessage | IceCandidateSignalingMessage {
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
    throw new GuestPeerConnectionError(`Guest peer option must be a non-empty string: ${key}`);
  }

  return value;
}

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};
