export interface BrowserPeerConnectionLifecycleOptions {
  readonly rtcConfig?: RTCConfiguration;
  readonly onIceCandidate?: (
    candidate: RTCIceCandidate | null,
    event: RTCPeerConnectionIceEvent,
    connection: RTCPeerConnection,
  ) => void;
  readonly onDataChannel?: (
    channel: RTCDataChannel,
    event: RTCDataChannelEvent,
    connection: RTCPeerConnection,
  ) => void;
  readonly onConnectionStateChange?: (
    state: RTCPeerConnectionState,
    connection: RTCPeerConnection,
  ) => void;
  readonly onIceConnectionStateChange?: (
    state: RTCIceConnectionState,
    connection: RTCPeerConnection,
  ) => void;
}

export type BrowserDataChannelPayload =
  | string
  | Blob
  | ArrayBuffer
  | ArrayBufferView<ArrayBuffer>;

export interface BrowserDataChannelSendOptions {
  readonly maxBufferedAmount?: number;
}

export interface BrowserDataChannelLifecycleOptions {
  readonly binaryType?: BinaryType;
  readonly onOpen?: (channel: RTCDataChannel) => void;
  readonly onClose?: (channel: RTCDataChannel) => void;
  readonly onError?: (
    error: Error,
    channel: RTCDataChannel,
    event: Event | null,
  ) => void;
  readonly onMessage?: (
    data: unknown,
    event: MessageEvent,
    channel: RTCDataChannel,
  ) => void;
}

export class BrowserPeerConnectionLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BrowserPeerConnectionLifecycleError";
  }
}

export class BrowserDataChannelLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BrowserDataChannelLifecycleError";
  }
}

export class BrowserPeerConnectionLifecycle {
  private readonly peerConnection: RTCPeerConnection;
  private readonly remoteCandidateQueue: Array<RTCIceCandidateInit | null> = [];
  private readonly options: BrowserPeerConnectionLifecycleOptions;
  private readonly handleIceCandidate = (event: RTCPeerConnectionIceEvent): void => {
    if (this.closed) {
      return;
    }

    this.options.onIceCandidate?.(event.candidate, event, this.peerConnection);
  };
  private readonly handleDataChannel = (event: RTCDataChannelEvent): void => {
    if (this.closed) {
      return;
    }

    this.options.onDataChannel?.(event.channel, event, this.peerConnection);
  };
  private readonly handleConnectionStateChange = (): void => {
    if (this.closed) {
      return;
    }

    this.trackedConnectionState = this.peerConnection.connectionState;
    this.options.onConnectionStateChange?.(
      this.peerConnection.connectionState,
      this.peerConnection,
    );
  };
  private readonly handleIceConnectionStateChange = (): void => {
    if (this.closed) {
      return;
    }

    this.trackedIceConnectionState = this.peerConnection.iceConnectionState;
    this.options.onIceConnectionStateChange?.(
      this.peerConnection.iceConnectionState,
      this.peerConnection,
    );
  };
  private trackedConnectionState: RTCPeerConnectionState = "new";
  private trackedIceConnectionState: RTCIceConnectionState = "new";
  private closed = false;

  public constructor(options: BrowserPeerConnectionLifecycleOptions = {}) {
    if (typeof RTCPeerConnection === "undefined") {
      throw new BrowserPeerConnectionLifecycleError(
        "RTCPeerConnection is unavailable in this browser.",
      );
    }

    this.options = options;
    this.peerConnection =
      options.rtcConfig === undefined
        ? new RTCPeerConnection()
        : new RTCPeerConnection(options.rtcConfig);
    this.trackedConnectionState = this.peerConnection.connectionState;
    this.trackedIceConnectionState = this.peerConnection.iceConnectionState;
    this.bindPeerConnection();
  }

  public get connection(): RTCPeerConnection {
    return this.peerConnection;
  }

  public get localDescription(): RTCSessionDescriptionInit | null {
    return copySessionDescription(this.peerConnection.localDescription);
  }

  public get remoteDescription(): RTCSessionDescriptionInit | null {
    return copySessionDescription(this.peerConnection.remoteDescription);
  }

  public get connectionState(): RTCPeerConnectionState {
    return this.trackedConnectionState;
  }

  public get iceConnectionState(): RTCIceConnectionState {
    return this.trackedIceConnectionState;
  }

  public get queuedRemoteCandidateCount(): number {
    return this.remoteCandidateQueue.length;
  }

  public createDataChannel(
    label: string,
    options?: RTCDataChannelInit,
  ): RTCDataChannel {
    this.requireOpen();
    return this.peerConnection.createDataChannel(label, options);
  }

  public async createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    this.requireOpen();
    const offer = await this.peerConnection.createOffer(options);
    this.requireOpen();
    await this.peerConnection.setLocalDescription(offer);
    this.requireOpen();
    return this.requireLocalDescription("offer");
  }

  public async createAnswer(options?: RTCAnswerOptions): Promise<RTCSessionDescriptionInit> {
    this.requireOpen();
    const answer = await this.peerConnection.createAnswer(options);
    this.requireOpen();
    await this.peerConnection.setLocalDescription(answer);
    this.requireOpen();
    return this.requireLocalDescription("answer");
  }

  public async applyRemoteOffer(description: RTCSessionDescriptionInit): Promise<void> {
    await this.applyRemoteDescription(description, "offer");
  }

  public async applyRemoteAnswer(description: RTCSessionDescriptionInit): Promise<void> {
    await this.applyRemoteDescription(description, "answer");
  }

  public async applyRemoteDescription(
    description: RTCSessionDescriptionInit,
    expectedType?: RTCSdpType,
  ): Promise<void> {
    this.requireOpen();
    await this.peerConnection.setRemoteDescription(
      normalizeSessionDescription(description, expectedType),
    );
    this.requireOpen();
    await this.flushQueuedRemoteCandidates();
    this.requireOpen();
  }

  public async addRemoteIceCandidate(
    candidate: RTCIceCandidate | RTCIceCandidateInit | null,
  ): Promise<void> {
    this.requireOpen();
    const candidateInit = normalizeIceCandidate(candidate);

    if (this.peerConnection.remoteDescription === null) {
      this.remoteCandidateQueue.push(candidateInit);
      return;
    }

    await addIceCandidate(this.peerConnection, candidateInit);
    this.requireOpen();
  }

  public close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.remoteCandidateQueue.length = 0;
    this.trackedConnectionState = "closed";
    this.trackedIceConnectionState = "closed";
    this.unbindPeerConnection();
    this.peerConnection.close();
    this.options.onConnectionStateChange?.("closed", this.peerConnection);
    this.options.onIceConnectionStateChange?.("closed", this.peerConnection);
  }

  private bindPeerConnection(): void {
    this.peerConnection.addEventListener("icecandidate", this.handleIceCandidate);
    this.peerConnection.addEventListener("datachannel", this.handleDataChannel);
    this.peerConnection.addEventListener(
      "connectionstatechange",
      this.handleConnectionStateChange,
    );
    this.peerConnection.addEventListener(
      "iceconnectionstatechange",
      this.handleIceConnectionStateChange,
    );
  }

  private unbindPeerConnection(): void {
    this.peerConnection.removeEventListener("icecandidate", this.handleIceCandidate);
    this.peerConnection.removeEventListener("datachannel", this.handleDataChannel);
    this.peerConnection.removeEventListener(
      "connectionstatechange",
      this.handleConnectionStateChange,
    );
    this.peerConnection.removeEventListener(
      "iceconnectionstatechange",
      this.handleIceConnectionStateChange,
    );
  }

  private async flushQueuedRemoteCandidates(): Promise<void> {
    const queuedCandidates = this.remoteCandidateQueue.splice(0);

    for (const candidate of queuedCandidates) {
      this.requireOpen();
      await addIceCandidate(this.peerConnection, candidate);
      this.requireOpen();
    }
  }

  private requireLocalDescription(type: RTCSdpType): RTCSessionDescriptionInit {
    const description = copySessionDescription(this.peerConnection.localDescription);

    if (description === null) {
      throw new BrowserPeerConnectionLifecycleError(
        `Peer connection did not produce a local ${type}.`,
      );
    }

    return normalizeSessionDescription(description, type);
  }

  private requireOpen(): void {
    if (this.closed) {
      throw new BrowserPeerConnectionLifecycleError(
        "Peer connection lifecycle has already been closed.",
      );
    }
  }
}

export class BrowserDataChannelLifecycle {
  private readonly dataChannel: RTCDataChannel;
  private readonly options: BrowserDataChannelLifecycleOptions;
  private readonly handleOpen = (): void => {
    if (this.closed) {
      return;
    }

    this.trackedReadyState = this.dataChannel.readyState;
    this.options.onOpen?.(this.dataChannel);
  };
  private readonly handleClose = (): void => {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.trackedReadyState = "closed";
    this.unbindDataChannel();
    this.options.onClose?.(this.dataChannel);
  };
  private readonly handleError = (event: Event): void => {
    if (this.closed) {
      return;
    }

    this.trackedReadyState = this.dataChannel.readyState;
    this.reportError(createDataChannelEventError(event), event);
  };
  private readonly handleMessage = (event: MessageEvent): void => {
    if (this.closed) {
      return;
    }

    this.options.onMessage?.(event.data, event, this.dataChannel);
  };
  private trackedReadyState: RTCDataChannelState;
  private closed = false;

  public constructor(
    dataChannel: RTCDataChannel,
    options: BrowserDataChannelLifecycleOptions = {},
  ) {
    this.dataChannel = dataChannel;
    this.options = options;
    this.dataChannel.binaryType = options.binaryType ?? "arraybuffer";
    this.trackedReadyState = dataChannel.readyState;
    this.bindDataChannel();
  }

  public get channel(): RTCDataChannel {
    return this.dataChannel;
  }

  public get readyState(): RTCDataChannelState {
    return this.trackedReadyState;
  }

  public send(
    data: BrowserDataChannelPayload,
    options: BrowserDataChannelSendOptions = {},
  ): boolean {
    if (this.closed || this.dataChannel.readyState !== "open") {
      return false;
    }

    if (!this.hasBufferedCapacity(data, options.maxBufferedAmount)) {
      return false;
    }

    try {
      sendDataChannelPayload(this.dataChannel, data);
      return true;
    } catch (error: unknown) {
      this.reportError(toError(error, "RTCDataChannel send failed."), null);
      return false;
    }
  }

  public close(): void {
    if (this.closed) {
      return;
    }

    const shouldReportClose =
      this.trackedReadyState !== "closed" && this.dataChannel.readyState !== "closed";

    this.closed = true;
    this.trackedReadyState = "closed";
    this.unbindDataChannel();
    this.dataChannel.close();

    if (shouldReportClose) {
      this.options.onClose?.(this.dataChannel);
    }
  }

  private bindDataChannel(): void {
    this.dataChannel.addEventListener("open", this.handleOpen);
    this.dataChannel.addEventListener("close", this.handleClose);
    this.dataChannel.addEventListener("error", this.handleError);
    this.dataChannel.addEventListener("message", this.handleMessage);
  }

  private unbindDataChannel(): void {
    this.dataChannel.removeEventListener("open", this.handleOpen);
    this.dataChannel.removeEventListener("close", this.handleClose);
    this.dataChannel.removeEventListener("error", this.handleError);
    this.dataChannel.removeEventListener("message", this.handleMessage);
  }

  private hasBufferedCapacity(
    data: BrowserDataChannelPayload,
    maxBufferedAmount: number | undefined,
  ): boolean {
    if (maxBufferedAmount === undefined) {
      return true;
    }

    return (
      this.dataChannel.bufferedAmount + estimatePayloadByteLength(data) <=
      maxBufferedAmount
    );
  }

  private reportError(error: Error, event: Event | null): void {
    this.options.onError?.(error, this.dataChannel, event);
  }
}

function normalizeSessionDescription(
  description: RTCSessionDescriptionInit,
  expectedType?: RTCSdpType,
): RTCSessionDescriptionInit {
  if (
    description.type !== "offer" &&
    description.type !== "answer" &&
    description.type !== "pranswer" &&
    description.type !== "rollback"
  ) {
    throw new BrowserPeerConnectionLifecycleError(
      `Unsupported SDP description type: ${String(description.type)}.`,
    );
  }

  if (expectedType !== undefined && description.type !== expectedType) {
    throw new BrowserPeerConnectionLifecycleError(
      `Expected SDP ${expectedType}, received ${description.type}.`,
    );
  }

  if (description.type !== "rollback" && typeof description.sdp !== "string") {
    throw new BrowserPeerConnectionLifecycleError(
      "SDP description must include an sdp string.",
    );
  }

  return description.sdp === undefined
    ? { type: description.type }
    : { type: description.type, sdp: description.sdp };
}

function copySessionDescription(
  description: RTCSessionDescription | RTCSessionDescriptionInit | null,
): RTCSessionDescriptionInit | null {
  if (description === null) {
    return null;
  }

  return normalizeSessionDescription(description);
}

function normalizeIceCandidate(
  candidate: RTCIceCandidate | RTCIceCandidateInit | null,
): RTCIceCandidateInit | null {
  if (candidate === null) {
    return null;
  }

  if (typeof candidate.candidate !== "string") {
    throw new BrowserPeerConnectionLifecycleError(
      "ICE candidate must include a candidate string.",
    );
  }

  const candidateInit: Mutable<RTCIceCandidateInit> = {
    candidate: candidate.candidate,
  };

  if (candidate.sdpMid !== undefined) {
    candidateInit.sdpMid = candidate.sdpMid;
  }

  if (candidate.sdpMLineIndex !== undefined) {
    candidateInit.sdpMLineIndex = candidate.sdpMLineIndex;
  }

  if (candidate.usernameFragment !== undefined) {
    candidateInit.usernameFragment = candidate.usernameFragment;
  }

  return candidateInit;
}

async function addIceCandidate(
  peerConnection: RTCPeerConnection,
  candidate: RTCIceCandidateInit | null,
): Promise<void> {
  if (candidate === null) {
    await peerConnection.addIceCandidate();
    return;
  }

  await peerConnection.addIceCandidate(candidate);
}

function createDataChannelEventError(event: Event): Error {
  const maybeErrorEvent = event as Event & {
    readonly error?: unknown;
    readonly message?: unknown;
  };

  if (maybeErrorEvent.error instanceof Error) {
    return maybeErrorEvent.error;
  }

  if (typeof maybeErrorEvent.message === "string" && maybeErrorEvent.message.length > 0) {
    return new BrowserDataChannelLifecycleError(
      `RTCDataChannel error: ${maybeErrorEvent.message}`,
    );
  }

  return new BrowserDataChannelLifecycleError("RTCDataChannel emitted an error.");
}

function estimatePayloadByteLength(data: BrowserDataChannelPayload): number {
  if (typeof data === "string") {
    return data.length * 2;
  }

  if (data instanceof Blob) {
    return data.size;
  }

  if (data instanceof ArrayBuffer) {
    return data.byteLength;
  }

  return data.byteLength;
}

function sendDataChannelPayload(
  dataChannel: RTCDataChannel,
  data: BrowserDataChannelPayload,
): void {
  if (typeof data === "string") {
    dataChannel.send(data);
    return;
  }

  if (data instanceof Blob) {
    dataChannel.send(data);
    return;
  }

  if (data instanceof ArrayBuffer) {
    dataChannel.send(data);
    return;
  }

  dataChannel.send(data);
}

function toError(error: unknown, fallbackMessage: string): Error {
  return error instanceof Error ? error : new BrowserDataChannelLifecycleError(fallbackMessage);
}

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};
