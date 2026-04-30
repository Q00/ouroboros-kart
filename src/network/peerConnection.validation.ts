import { GuestPeerConnection } from "./guestPeer";
import {
  HOST_DATA_CHANNEL_LABEL,
  HostPeerConnection,
  createLowLatencyDataChannelOptions,
} from "./hostPeer";
import { BrowserPeerConnectionLifecycle } from "./peerConnection";
import {
  SIGNALING_MESSAGE_TYPES,
  createIceCandidateMessage,
  type SignalingMessage,
  type SignalingMessageType,
} from "./signaling";

const ROOM_ID = "ROOM42";
const HOST_PEER_ID = "host-peer";
const GUEST_PEER_ID = "guest-peer";

type MessageOfType<TType extends SignalingMessageType> = Extract<
  SignalingMessage,
  { readonly type: TType }
>;

type FakeEventListener = (event: Event) => void;

class FakeRtcDataChannel {
  public binaryType: BinaryType = "blob";
  public bufferedAmount = 0;
  public readyState: RTCDataChannelState = "connecting";
  public readonly sentData: Array<string | Blob | ArrayBuffer | ArrayBufferView> = [];
  public readonly options: RTCDataChannelInit | undefined;
  private linkedChannel: FakeRtcDataChannel | null = null;
  private nextSendError: Error | null = null;
  private readonly listeners = new Map<string, FakeEventListener[]>();

  public constructor(
    public readonly label: string,
    options?: RTCDataChannelInit,
  ) {
    this.options = options;
  }

  public addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (listener === null) {
      return;
    }

    const listeners = this.listeners.get(type) ?? [];
    listeners.push(normalizeEventListener(listener));
    this.listeners.set(type, listeners);
  }

  public removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (listener === null) {
      return;
    }

    const listeners = this.listeners.get(type);

    if (listeners === undefined) {
      return;
    }

    const normalizedListener = normalizeEventListener(listener);
    const nextListeners = listeners.filter(
      (registeredListener) => registeredListener !== normalizedListener,
    );

    if (nextListeners.length > 0) {
      this.listeners.set(type, nextListeners);
      return;
    }

    this.listeners.delete(type);
  }

  public get totalListenerCount(): number {
    let count = 0;

    for (const listeners of this.listeners.values()) {
      count += listeners.length;
    }

    return count;
  }

  public send(data: string | Blob | ArrayBuffer | ArrayBufferView): void {
    if (this.readyState !== "open") {
      throw new Error(`Cannot send while fake data channel is ${this.readyState}.`);
    }

    const nextSendError = this.nextSendError;
    this.nextSendError = null;

    if (nextSendError !== null) {
      throw nextSendError;
    }

    this.sentData.push(data);

    if (this.linkedChannel?.readyState === "open") {
      this.linkedChannel.receive(data);
    }
  }

  public failNextSend(error: Error): void {
    this.nextSendError = error;
  }

  public connect(peer: FakeRtcDataChannel): void {
    this.linkedChannel = peer;

    if (peer.linkedChannel !== this) {
      peer.connect(this);
    }
  }

  public openChannel(): void {
    if (this.readyState === "open") {
      return;
    }

    this.readyState = "open";
    this.emit("open");
  }

  public close(): void {
    if (this.readyState === "closed") {
      return;
    }

    this.readyState = "closed";
    this.emit("close");
  }

  public receive(data: unknown): void {
    this.emit("message", { data });
  }

  public emitError(error: Error): void {
    this.emit("error", { error });
  }

  private emit(type: string, eventFields: Record<string, unknown> = {}): void {
    const event = {
      type,
      ...eventFields,
    } as Event;

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

class FakeRtcPeerConnection {
  public static readonly instances: FakeRtcPeerConnection[] = [];

  public connectionState: RTCPeerConnectionState = "new";
  public iceConnectionState: RTCIceConnectionState = "new";
  public localDescription: RTCSessionDescriptionInit | null = null;
  public remoteDescription: RTCSessionDescriptionInit | null = null;
  public readonly createdDataChannels: FakeRtcDataChannel[] = [];
  public readonly addedIceCandidates: Array<RTCIceCandidateInit | null> = [];
  private readonly listeners = new Map<string, FakeEventListener[]>();

  public constructor(public readonly configuration?: RTCConfiguration) {
    FakeRtcPeerConnection.instances.push(this);
  }

  public addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (listener === null) {
      return;
    }

    const listeners = this.listeners.get(type) ?? [];
    listeners.push(normalizeEventListener(listener));
    this.listeners.set(type, listeners);
  }

  public removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    if (listener === null) {
      return;
    }

    const listeners = this.listeners.get(type);

    if (listeners === undefined) {
      return;
    }

    const normalizedListener = normalizeEventListener(listener);
    const nextListeners = listeners.filter(
      (registeredListener) => registeredListener !== normalizedListener,
    );

    if (nextListeners.length > 0) {
      this.listeners.set(type, nextListeners);
      return;
    }

    this.listeners.delete(type);
  }

  public get totalListenerCount(): number {
    let count = 0;

    for (const listeners of this.listeners.values()) {
      count += listeners.length;
    }

    return count;
  }

  public createDataChannel(
    label: string,
    options?: RTCDataChannelInit,
  ): RTCDataChannel {
    const channel = new FakeRtcDataChannel(label, options);
    this.createdDataChannels.push(channel);
    return channel as unknown as RTCDataChannel;
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    return {
      type: "offer",
      sdp: `v=0\r\no=- ${HOST_PEER_ID} 1 IN IP4 127.0.0.1\r\ns=kart-host\r\nt=0 0\r\n`,
    };
  }

  public async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return {
      type: "answer",
      sdp: `v=0\r\no=- ${GUEST_PEER_ID} 1 IN IP4 127.0.0.1\r\ns=kart-guest\r\nt=0 0\r\n`,
    };
  }

  public async setLocalDescription(
    description: RTCSessionDescriptionInit,
  ): Promise<void> {
    this.localDescription = description;
  }

  public async setRemoteDescription(
    description: RTCSessionDescriptionInit,
  ): Promise<void> {
    this.remoteDescription = description;
  }

  public async addIceCandidate(
    candidate?: RTCIceCandidate | RTCIceCandidateInit,
  ): Promise<void> {
    this.addedIceCandidates.push(candidate ?? null);
  }

  public close(): void {
    this.connectionState = "closed";
    this.iceConnectionState = "closed";
  }

  public emitIceCandidate(candidate: RTCIceCandidateInit | null): void {
    this.emit("icecandidate", { candidate });
  }

  public emitDataChannel(channel: FakeRtcDataChannel): void {
    this.emit("datachannel", {
      channel: channel as unknown as RTCDataChannel,
    });
  }

  public setConnectionState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.emit("connectionstatechange");
  }

  public setIceConnectionState(state: RTCIceConnectionState): void {
    this.iceConnectionState = state;
    this.emit("iceconnectionstatechange");
  }

  private emit(type: string, eventFields: Record<string, unknown> = {}): void {
    const event = {
      type,
      ...eventFields,
    } as Event;

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

export async function validateHostGuestPeerConnectionSetup(): Promise<void> {
  const restoreRtcPeerConnection = installFakeRtcPeerConnection();

  try {
    await validateBrowserPeerLifecycleWrapper();

    const hostSignals: SignalingMessage[] = [];
    const guestSignals: SignalingMessage[] = [];
    const hostConnectionStates: RTCPeerConnectionState[] = [];
    const guestIceStates: RTCIceConnectionState[] = [];
    let hostChannelOpenCount = 0;
    let hostChannelCloseCount = 0;
    let guestChannelOpenCount = 0;
    let guestChannelCloseCount = 0;
    const hostChannelErrors: string[] = [];
    const guestChannelErrors: string[] = [];
    let hostMessage: unknown;
    let guestMessage: unknown;

    const host = new HostPeerConnection({
      roomId: ROOM_ID,
      hostPeerId: HOST_PEER_ID,
      remotePeerId: GUEST_PEER_ID,
      onSignal: (message) => {
        hostSignals.push(message);
      },
      onDataChannelOpen: () => {
        hostChannelOpenCount += 1;
      },
      onDataChannelClose: () => {
        hostChannelCloseCount += 1;
      },
      onDataChannelError: (error) => {
        hostChannelErrors.push(error.message);
      },
      onDataChannelMessage: (data) => {
        hostMessage = data;
      },
      onConnectionStateChange: (state) => {
        hostConnectionStates.push(state);
      },
    });

    const offer = await host.start();
    const hostTransport = requireFakePeerConnection(host.connection, "host");
    const hostChannel = requireArrayItem(
      hostTransport.createdDataChannels,
      0,
      "host data channel",
    );

    assertEqual(offer.type, SIGNALING_MESSAGE_TYPES.SDP_OFFER, "host creates SDP offer");
    assertEqual(
      hostSignals.length,
      1,
      "host emits exactly one SDP signal during start",
    );
    assertEqual(hostChannel.label, HOST_DATA_CHANNEL_LABEL, "host data channel label");
    assertEqual(hostChannel.options?.ordered, true, "host data channel ordered");
    assertEqual(
      hostChannel.options?.maxRetransmits,
      undefined,
      "host data channel keeps reliable retransmits enabled",
    );
    assertEqual(
      hostChannel.options?.maxPacketLifeTime,
      undefined,
      "host data channel keeps reliable packet lifetime enabled",
    );
    assertEqual(
      hostChannel.binaryType,
      "arraybuffer",
      "host data channel is bound for binary gameplay packets",
    );
    const lowLatencyOptions = createLowLatencyDataChannelOptions();
    assertEqual(
      lowLatencyOptions.ordered,
      false,
      "low-latency gameplay channel uses unordered delivery",
    );
    assertEqual(
      lowLatencyOptions.maxPacketLifeTime,
      120,
      "low-latency gameplay channel caps packet lifetime below 150ms",
    );
    assertEqual(host.dataChannelState, "connecting", "host tracks data channel setup");
    assert(!host.send("too-soon"), "host refuses sends before the data channel opens");
    assertEqual(
      hostChannel.sentData.length,
      0,
      "host does not enqueue packets before the data channel opens",
    );

    const guest = new GuestPeerConnection({
      roomId: ROOM_ID,
      guestPeerId: GUEST_PEER_ID,
      hostPeerId: HOST_PEER_ID,
      onSignal: (message) => {
        guestSignals.push(message);
      },
      onDataChannelOpen: () => {
        guestChannelOpenCount += 1;
      },
      onDataChannelClose: () => {
        guestChannelCloseCount += 1;
      },
      onDataChannelError: (error) => {
        guestChannelErrors.push(error.message);
      },
      onDataChannelMessage: (data) => {
        guestMessage = data;

        if (data === "ping") {
          guest.send("pong");
        }
      },
      onIceConnectionStateChange: (state) => {
        guestIceStates.push(state);
      },
    });

    const earlyHostCandidate = createIceCandidateMessage(
      {
        roomId: ROOM_ID,
        senderId: HOST_PEER_ID,
        recipientId: GUEST_PEER_ID,
      },
      {
        candidate: "candidate:1 1 UDP 2122252543 127.0.0.1 50000 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0,
      },
    );
    const earlyCandidateAccepted = await guest.acceptRemoteSignal(earlyHostCandidate);

    assert(earlyCandidateAccepted, "guest accepts host ICE before offer");
    assertEqual(
      guest.queuedRemoteCandidateCount,
      1,
      "guest queues ICE until remote offer is applied",
    );

    const offerAccepted = await guest.acceptRemoteSignal(offer);
    const guestTransport = requireFakePeerConnection(guest.connection, "guest");
    const answer = requireLastMessageOfType(
      guestSignals,
      SIGNALING_MESSAGE_TYPES.SDP_ANSWER,
    );

    assert(offerAccepted, "guest accepts host SDP offer");
    assertEqual(
      guestTransport.remoteDescription?.type,
      "offer",
      "guest applies remote offer",
    );
    assertEqual(
      guestTransport.addedIceCandidates.length,
      1,
      "guest flushes queued ICE after offer",
    );
    assertEqual(
      guest.queuedRemoteCandidateCount,
      0,
      "guest clears queued ICE after offer",
    );
    assertEqual(answer.recipientId, HOST_PEER_ID, "guest answer targets host");

    const answerAccepted = await host.acceptRemoteSignal(answer);
    assert(answerAccepted, "host accepts guest SDP answer");
    assertEqual(
      hostTransport.remoteDescription?.type,
      "answer",
      "host applies remote answer",
    );

    guestTransport.emitIceCandidate({
      candidate: "candidate:2 1 UDP 2122252543 127.0.0.1 50001 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
    });
    const guestCandidate = requireLastMessageOfType(
      guestSignals,
      SIGNALING_MESSAGE_TYPES.ICE_CANDIDATE,
    );
    const guestCandidateAccepted = await host.acceptRemoteSignal(guestCandidate);

    assert(guestCandidateAccepted, "host accepts guest ICE candidate");
    assertEqual(
      hostTransport.addedIceCandidates.length,
      1,
      "host applies guest ICE immediately after answer",
    );

    hostTransport.emitIceCandidate(null);
    const hostEndOfCandidates = requireLastMessageOfType(
      hostSignals,
      SIGNALING_MESSAGE_TYPES.ICE_CANDIDATE,
    );
    const endOfCandidatesAccepted = await guest.acceptRemoteSignal(hostEndOfCandidates);

    assert(endOfCandidatesAccepted, "guest accepts host end-of-candidates");
    assertEqual(
      guestTransport.addedIceCandidates.length,
      2,
      "guest applies end-of-candidates after queued ICE",
    );
    assertEqual(
      guestTransport.addedIceCandidates[1],
      null,
      "guest stores end-of-candidates as null ICE",
    );

    const guestIncomingChannel = new FakeRtcDataChannel(HOST_DATA_CHANNEL_LABEL);
    guestTransport.emitDataChannel(guestIncomingChannel);
    hostChannel.connect(guestIncomingChannel);
    hostChannel.openChannel();
    guestIncomingChannel.openChannel();

    assertEqual(host.dataChannelState, "open", "host tracks data channel open");
    assertEqual(guest.dataChannelState, "open", "guest tracks data channel open");
    assertEqual(hostChannelOpenCount, 1, "host open callback fires once");
    assertEqual(guestChannelOpenCount, 1, "guest open callback fires once");
    assertEqual(
      guestIncomingChannel.binaryType,
      "arraybuffer",
      "guest data channel is bound for binary gameplay packets",
    );

    assert(host.send("ping"), "host sends ping on open data channel");
    assertEqual(
      guestMessage,
      "ping",
      "guest receive handler accepts host ping",
    );
    assertEqual(
      hostChannel.sentData[0],
      "ping",
      "host channel carries reliable gameplay ping",
    );
    assertEqual(
      guestIncomingChannel.sentData[0],
      "pong",
      "guest channel sends pong response",
    );
    assertEqual(
      hostMessage,
      "pong",
      "host receive handler accepts guest pong",
    );
    hostChannel.bufferedAmount = 128;
    assert(
      !host.send("buffered", { maxBufferedAmount: 64 }),
      "host refuses safe send when buffered data exceeds the limit",
    );
    assertEqual(
      hostChannel.sentData.length,
      1,
      "host does not send packets that would overrun the data channel buffer",
    );
    hostChannel.bufferedAmount = 0;
    hostChannel.failNextSend(new Error("simulated data channel send failure"));
    assert(
      !host.send("throws"),
      "host safe send returns false when RTCDataChannel.send throws",
    );
    assertEqual(
      hostChannelErrors[0],
      "simulated data channel send failure",
      "host data channel send errors are surfaced through the error callback",
    );
    assertEqual(
      hostChannel.sentData.length,
      1,
      "host does not report thrown sends as delivered packets",
    );
    guestIncomingChannel.emitError(new Error("simulated guest data channel error"));
    assertEqual(
      guestChannelErrors[0],
      "simulated guest data channel error",
      "guest data channel native errors are surfaced through the error callback",
    );

    hostTransport.setConnectionState("connecting");
    hostTransport.setConnectionState("connected");
    guestTransport.setIceConnectionState("checking");
    guestTransport.setIceConnectionState("connected");

    assertEqual(
      host.connectionState,
      "connected",
      "host tracks current peer connection state",
    );
    assertEqual(
      guest.iceConnectionState,
      "connected",
      "guest tracks current ICE state",
    );
    assertEqual(
      hostConnectionStates.join(","),
      "connecting,connected",
      "host emits connection state updates in order",
    );
    assertEqual(
      guestIceStates.join(","),
      "checking,connected",
      "guest emits ICE state updates in order",
    );

    guestIncomingChannel.close();
    hostChannel.close();

    assertEqual(guest.dataChannelState, "closed", "guest tracks data channel close");
    assertEqual(host.dataChannelState, "closed", "host tracks data channel close");
    assertEqual(guestChannelCloseCount, 1, "guest close callback fires once");
    assertEqual(hostChannelCloseCount, 1, "host close callback fires once");
    assertEqual(
      guestIncomingChannel.totalListenerCount,
      0,
      "guest data channel listeners are detached after native close",
    );
    assertEqual(
      hostChannel.totalListenerCount,
      0,
      "host data channel listeners are detached after native close",
    );

    const hostSignalCountBeforeClose = hostSignals.length;
    const fakePeerConnectionCountBeforeClose = FakeRtcPeerConnection.instances.length;
    host.close();
    guest.close();
    hostTransport.emitIceCandidate({
      candidate: "candidate:stale 1 UDP 1 127.0.0.1 9 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
    });

    assertEqual(host.connection, null, "host releases RTCPeerConnection on close");
    assertEqual(guest.connection, null, "guest releases RTCPeerConnection on close");
    assertEqual(host.channel, null, "host releases RTCDataChannel on close");
    assertEqual(guest.channel, null, "guest releases RTCDataChannel on close");
    assertEqual(host.connectionState, "closed", "host tracks closed state");
    assertEqual(guest.iceConnectionState, "closed", "guest tracks closed ICE state");
    assertEqual(
      hostConnectionStates[hostConnectionStates.length - 1],
      "closed",
      "host emits closed peer connection state during cleanup",
    );
    assertEqual(
      guestIceStates[guestIceStates.length - 1],
      "closed",
      "guest emits closed ICE state during cleanup",
    );
    assertEqual(host.dataChannelState, "none", "host clears data channel state");
    assertEqual(guest.dataChannelState, "none", "guest clears data channel state");
    assertEqual(
      hostSignals.length,
      hostSignalCountBeforeClose,
      "stale ICE events after cleanup are ignored",
    );
    assertEqual(
      hostTransport.totalListenerCount,
      0,
      "host peer connection listeners are detached during cleanup",
    );
    assertEqual(
      guestTransport.totalListenerCount,
      0,
      "guest peer connection listeners are detached during cleanup",
    );
    assert(
      !(await host.acceptRemoteSignal(answer)),
      "closed host ignores stale remote signaling without reopening",
    );
    assert(
      !(await guest.acceptRemoteSignal(offer)),
      "closed guest ignores stale remote signaling without reopening",
    );
    assertEqual(
      FakeRtcPeerConnection.instances.length,
      fakePeerConnectionCountBeforeClose,
      "closed peer wrappers do not create replacement peer connections",
    );
  } finally {
    restoreRtcPeerConnection();
  }
}

async function validateBrowserPeerLifecycleWrapper(): Promise<void> {
  const outboundCandidates: Array<RTCIceCandidate | null> = [];
  const connectionStates: RTCPeerConnectionState[] = [];
  const iceConnectionStates: RTCIceConnectionState[] = [];
  const lifecycle = new BrowserPeerConnectionLifecycle({
    rtcConfig: { iceServers: [] },
    onIceCandidate: (candidate) => {
      outboundCandidates.push(candidate);
    },
    onConnectionStateChange: (state) => {
      connectionStates.push(state);
    },
    onIceConnectionStateChange: (state) => {
      iceConnectionStates.push(state);
    },
  });
  const transport = requireFakePeerConnection(lifecycle.connection, "lifecycle");

  assertEqual(lifecycle.connectionState, "new", "lifecycle tracks initial connection state");
  assertEqual(lifecycle.iceConnectionState, "new", "lifecycle tracks initial ICE state");

  const offer = await lifecycle.createOffer();

  assertEqual(offer.type, "offer", "lifecycle creates local SDP offer");
  assertEqual(
    transport.localDescription?.type,
    "offer",
    "lifecycle applies local offer description",
  );

  await lifecycle.addRemoteIceCandidate({
    candidate: "candidate:queued 1 UDP 2122252543 127.0.0.1 50010 typ host",
    sdpMid: "0",
    sdpMLineIndex: 0,
  });

  assertEqual(
    lifecycle.queuedRemoteCandidateCount,
    1,
    "lifecycle queues remote ICE before remote SDP",
  );

  await lifecycle.applyRemoteAnswer({
    type: "answer",
    sdp: `v=0\r\no=- lifecycle-answer 1 IN IP4 127.0.0.1\r\ns=kart-lifecycle\r\nt=0 0\r\n`,
  });

  assertEqual(
    transport.remoteDescription?.type,
    "answer",
    "lifecycle applies remote SDP answer",
  );
  assertEqual(
    transport.addedIceCandidates.length,
    1,
    "lifecycle flushes queued ICE after remote SDP",
  );
  assertEqual(
    lifecycle.queuedRemoteCandidateCount,
    0,
    "lifecycle clears queued ICE after flush",
  );

  await lifecycle.addRemoteIceCandidate(null);
  assertEqual(
    transport.addedIceCandidates[1],
    null,
    "lifecycle forwards end-of-candidates after remote SDP",
  );

  transport.emitIceCandidate({
    candidate: "candidate:outbound 1 UDP 2122252543 127.0.0.1 50011 typ host",
    sdpMid: "0",
    sdpMLineIndex: 0,
  });

  assertEqual(
    outboundCandidates[0]?.candidate,
    "candidate:outbound 1 UDP 2122252543 127.0.0.1 50011 typ host",
    "lifecycle emits outbound ICE candidates",
  );

  transport.setConnectionState("connecting");
  transport.setConnectionState("connected");
  transport.setIceConnectionState("checking");
  transport.setIceConnectionState("connected");

  assertEqual(
    lifecycle.connectionState,
    "connected",
    "lifecycle tracks current connection state",
  );
  assertEqual(
    lifecycle.iceConnectionState,
    "connected",
    "lifecycle tracks current ICE connection state",
  );
  assertEqual(
    connectionStates.join(","),
    "connecting,connected",
    "lifecycle emits connection state changes in order",
  );
  assertEqual(
    iceConnectionStates.join(","),
    "checking,connected",
    "lifecycle emits ICE state changes in order",
  );

  const outboundCountBeforeClose = outboundCandidates.length;
  lifecycle.close();
  transport.emitIceCandidate({
    candidate: "candidate:stale 1 UDP 1 127.0.0.1 9 typ host",
    sdpMid: "0",
    sdpMLineIndex: 0,
  });

  assertEqual(lifecycle.connectionState, "closed", "lifecycle tracks closed state");
  assertEqual(lifecycle.iceConnectionState, "closed", "lifecycle tracks closed ICE state");
  assertEqual(
    connectionStates[connectionStates.length - 1],
    "closed",
    "lifecycle reports closed connection state",
  );
  assertEqual(
    iceConnectionStates[iceConnectionStates.length - 1],
    "closed",
    "lifecycle reports closed ICE state",
  );
  assertEqual(
    outboundCandidates.length,
    outboundCountBeforeClose,
    "lifecycle ignores stale ICE after close",
  );
  assertEqual(
    transport.totalListenerCount,
    0,
    "lifecycle removes peer connection event listeners on close",
  );

  const queuedLifecycle = new BrowserPeerConnectionLifecycle({
    rtcConfig: { iceServers: [] },
  });
  const queuedTransport = requireFakePeerConnection(
    queuedLifecycle.connection,
    "queued lifecycle",
  );

  await queuedLifecycle.addRemoteIceCandidate({
    candidate: "candidate:queued-before-close 1 UDP 2122252543 127.0.0.1 50012 typ host",
    sdpMid: "0",
    sdpMLineIndex: 0,
  });
  assertEqual(
    queuedLifecycle.queuedRemoteCandidateCount,
    1,
    "lifecycle exposes queued ICE before remote SDP",
  );
  queuedLifecycle.close();
  assertEqual(
    queuedLifecycle.queuedRemoteCandidateCount,
    0,
    "lifecycle clears queued ICE during close",
  );
  assertEqual(
    queuedTransport.totalListenerCount,
    0,
    "queued lifecycle removes peer listeners during close",
  );
}

function installFakeRtcPeerConnection(): () => void {
  const target = globalThis as typeof globalThis & {
    RTCPeerConnection?: typeof RTCPeerConnection;
  };
  const hadOriginal = Object.prototype.hasOwnProperty.call(
    target,
    "RTCPeerConnection",
  );
  const original = target.RTCPeerConnection;
  FakeRtcPeerConnection.instances.length = 0;

  Object.defineProperty(target, "RTCPeerConnection", {
    configurable: true,
    writable: true,
    value: FakeRtcPeerConnection as unknown as typeof RTCPeerConnection,
  });

  return () => {
    if (hadOriginal) {
      Object.defineProperty(target, "RTCPeerConnection", {
        configurable: true,
        writable: true,
        value: original,
      });
      return;
    }

    delete target.RTCPeerConnection;
  };
}

function normalizeEventListener(
  listener: EventListenerOrEventListenerObject,
): FakeEventListener {
  if (typeof listener === "function") {
    return listener;
  }

  return (event) => {
    listener.handleEvent(event);
  };
}

function requireFakePeerConnection(
  connection: RTCPeerConnection | null,
  label: string,
): FakeRtcPeerConnection {
  if (!(connection instanceof FakeRtcPeerConnection)) {
    throw new Error(`Expected fake ${label} RTCPeerConnection.`);
  }

  return connection;
}

function requireArrayItem<T>(
  values: readonly T[],
  index: number,
  label: string,
): T {
  const value = values[index];

  if (value === undefined) {
    throw new Error(`Missing ${label} at index ${index}.`);
  }

  return value;
}

function requireLastMessageOfType<TType extends SignalingMessageType>(
  messages: readonly SignalingMessage[],
  type: TType,
): MessageOfType<TType> {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.type === type) {
      return message as MessageOfType<TType>;
    }
  }

  throw new Error(`Missing signaling message of type ${type}.`);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

void validateHostGuestPeerConnectionSetup()
  .then(() => {
    console.info("RTCPeerConnection lifecycle validation passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
