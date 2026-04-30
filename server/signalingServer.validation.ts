import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createServer } from "node:net";
import type { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { WebSocket, type RawData } from "ws";
import {
  MAX_SIGNALING_MESSAGE_AGE_MS,
  SIGNALING_MESSAGE_TYPES,
  SIGNALING_PROTOCOL,
  createIceCandidateMessage,
  createRoomCreateMessage,
  createRoomJoinMessage,
  createRoomLeaveMessage,
  createRoomStateRequestMessage,
  createSdpAnswerMessage,
  createSdpOfferMessage,
  deserializeSignalingMessage,
  serializeSignalingMessage,
  type SignalingMessage,
  type SignalingMessageType,
  type SignalingPeerId,
} from "../src/network/signaling.js";

const SERVER_READY_TIMEOUT_MS = 5_000;
const MESSAGE_TIMEOUT_MS = 3_000;
const NO_MESSAGE_WINDOW_MS = 150;
const ROOM_ID = "FLOW01";
const SECOND_ROOM_ID = "FLOW02";
const HOST_PEER_ID = "host-peer";
const GUEST_PEER_ID = "guest-peer";
const THIRD_PEER_ID = "third-peer";
const SECOND_HOST_PEER_ID = "second-host-peer";
const SECOND_GUEST_PEER_ID = "second-guest-peer";
const SECOND_ROOM_PROBE_PEER_ID = "second-room-probe-peer";
const RECONNECT_ROOM_ID = "FLOW03";
const RECONNECT_HOST_PEER_ID = "reconnect-host-peer";
const RECONNECT_GUEST_PEER_ID = "reconnect-guest-peer";

type MessageOfType<TType extends SignalingMessageType> = Extract<
  SignalingMessage,
  { readonly type: TType }
>;
type SignalingServerProcess = ChildProcessByStdio<null, Readable, Readable>;

interface PendingMessageWaiter {
  readonly type: SignalingMessageType;
  readonly resolve: (message: SignalingMessage) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

class SignalingValidationClient {
  private readonly receivedMessages: SignalingMessage[] = [];
  private readonly pendingWaiters: PendingMessageWaiter[] = [];

  private constructor(
    private readonly socket: WebSocket,
    public readonly peerId: SignalingPeerId,
  ) {
    this.socket.on("message", (data) => {
      this.receiveMessage(data);
    });
    this.socket.on("close", () => {
      this.rejectPendingWaiters(
        new Error(`Socket closed before expected signaling message for ${this.peerId}.`),
      );
    });
    this.socket.on("error", (error) => {
      this.rejectPendingWaiters(error);
    });
  }

  public static async connect(
    port: number,
    peerId: SignalingPeerId,
  ): Promise<SignalingValidationClient> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, SIGNALING_PROTOCOL);
    const client = new SignalingValidationClient(socket, peerId);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out connecting ${peerId} to signaling server.`));
      }, SERVER_READY_TIMEOUT_MS);

      socket.once("open", () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    return client;
  }

  public send(message: SignalingMessage): void {
    this.socket.send(serializeSignalingMessage(message));
  }

  public async waitForType<TType extends SignalingMessageType>(
    type: TType,
  ): Promise<MessageOfType<TType>> {
    const receivedIndex = this.receivedMessages.findIndex(
      (message) => message.type === type,
    );

    if (receivedIndex >= 0) {
      const [message] = this.receivedMessages.splice(receivedIndex, 1);

      if (message === undefined) {
        throw new Error(`Queued signaling message disappeared for ${this.peerId}.`);
      }

      return message as MessageOfType<TType>;
    }

    return new Promise<MessageOfType<TType>>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            `Timed out waiting for ${type} signaling message for ${this.peerId}.`,
          ),
        );
      }, MESSAGE_TIMEOUT_MS);

      this.pendingWaiters.push({
        type,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message as MessageOfType<TType>);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
        timer,
      });
    });
  }

  public async expectNoType(
    type: SignalingMessageType,
    timeoutMs = NO_MESSAGE_WINDOW_MS,
  ): Promise<void> {
    const receivedIndex = this.receivedMessages.findIndex(
      (message) => message.type === type,
    );

    if (receivedIndex >= 0) {
      throw new Error(
        `Unexpected queued ${type} signaling message for ${this.peerId}.`,
      );
    }

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiterIndex = this.pendingWaiters.findIndex(
          (waiter) => waiter.type === type && waiter.timer === timer,
        );

        if (waiterIndex >= 0) {
          this.pendingWaiters.splice(waiterIndex, 1);
        }

        resolve();
      }, timeoutMs);

      this.pendingWaiters.push({
        type,
        resolve: (message) => {
          clearTimeout(timer);
          reject(
            new Error(
              `Unexpected ${message.type} signaling message for ${this.peerId}.`,
            ),
          );
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
        timer,
      });
    });
  }

  public close(): void {
    this.rejectPendingWaiters(new Error(`Closed signaling validation client ${this.peerId}.`));

    if (
      this.socket.readyState === WebSocket.OPEN ||
      this.socket.readyState === WebSocket.CONNECTING
    ) {
      this.socket.close();
    }
  }

  public terminate(): void {
    this.rejectPendingWaiters(
      new Error(`Terminated signaling validation client ${this.peerId}.`),
    );

    if (this.socket.readyState !== WebSocket.CLOSED) {
      this.socket.terminate();
    }
  }

  private receiveMessage(data: RawData): void {
    const message = deserializeSignalingMessage(rawDataToPayload(data));
    const waiterIndex = this.pendingWaiters.findIndex(
      (waiter) => waiter.type === message.type,
    );

    if (waiterIndex < 0) {
      this.receivedMessages.push(message);
      return;
    }

    const [waiter] = this.pendingWaiters.splice(waiterIndex, 1);

    if (waiter === undefined) {
      this.receivedMessages.push(message);
      return;
    }

    waiter.resolve(message);
  }

  private rejectPendingWaiters(error: Error): void {
    const waiters = this.pendingWaiters.splice(0);

    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }
}

async function main(): Promise<void> {
  const port = await findOpenPort();
  const serverProcess = await startSignalingServer(port);
  const clients: SignalingValidationClient[] = [];

  try {
    const host = await SignalingValidationClient.connect(port, HOST_PEER_ID);
    const guest = await SignalingValidationClient.connect(port, GUEST_PEER_ID);
    const third = await SignalingValidationClient.connect(port, THIRD_PEER_ID);
    const secondHost = await SignalingValidationClient.connect(
      port,
      SECOND_HOST_PEER_ID,
    );
    const secondGuest = await SignalingValidationClient.connect(
      port,
      SECOND_GUEST_PEER_ID,
    );
    clients.push(host, guest, third, secondHost, secondGuest);

    host.send(
      createRoomCreateMessage(
        { roomId: ROOM_ID, senderId: HOST_PEER_ID },
        "Host",
      ),
    );
    const created = await host.waitForType(SIGNALING_MESSAGE_TYPES.ROOM_CREATED);
    assert(created.snapshot.roomId === ROOM_ID, "Host should create the requested room.");
    assert(created.snapshot.peers.length === 1, "Created room should contain only host.");
    assert(created.snapshot.peerCount === 1, "Created room peer metadata should count host.");
    assert(created.snapshot.isOpen, "Created room should be marked open for a guest.");
    assert(created.snapshot.hostPeerId === HOST_PEER_ID, "Host peer should own created room.");
    assert(
      created.snapshot.peers[0]?.displayName === "Host",
      "Host display name should be preserved in peer metadata.",
    );
    assert(
      created.snapshot.createdAt <= created.snapshot.updatedAt,
      "Room timestamps should be ordered.",
    );

    host.send(
      createRoomCreateMessage(
        { roomId: ROOM_ID, senderId: HOST_PEER_ID },
        "Host",
      ),
    );
    const duplicateCreated = await host.waitForType(
      SIGNALING_MESSAGE_TYPES.ROOM_CREATED,
    );
    assert(
      duplicateCreated.snapshot.roomId === ROOM_ID,
      "Duplicate host create should idempotently return the current room.",
    );
    assert(
      duplicateCreated.snapshot.peerCount === 1,
      "Duplicate host create should not add a peer.",
    );

    third.send(
      createRoomCreateMessage(
        { roomId: ROOM_ID, senderId: THIRD_PEER_ID },
        "Conflicting Host",
      ),
    );
    const roomExistsRejected = await third.waitForType(
      SIGNALING_MESSAGE_TYPES.SIGNALING_ERROR,
    );
    assert(
      roomExistsRejected.reason === "room-exists",
      "Creating a room owned by another peer should be rejected.",
    );
    assert(
      roomExistsRejected.retryable,
      "Room-exists signaling failures should be marked retryable.",
    );

    third.send(
      createRoomStateRequestMessage({
        roomId: ROOM_ID,
        senderId: THIRD_PEER_ID,
        sentAt: Date.now() - MAX_SIGNALING_MESSAGE_AGE_MS - 1_000,
      }),
    );
    const staleTimestampRejected = await third.waitForType(
      SIGNALING_MESSAGE_TYPES.SIGNALING_ERROR,
    );
    assert(
      staleTimestampRejected.reason === "stale-message",
      "Messages older than the freshness window should be rejected as stale.",
    );
    assert(
      staleTimestampRejected.retryable,
      "Stale signaling messages should be retryable.",
    );

    secondHost.send(
      createRoomCreateMessage(
        { roomId: SECOND_ROOM_ID, senderId: SECOND_HOST_PEER_ID },
        "Second Host",
      ),
    );
    const secondCreated = await secondHost.waitForType(
      SIGNALING_MESSAGE_TYPES.ROOM_CREATED,
    );
    assert(
      secondCreated.snapshot.roomId === SECOND_ROOM_ID,
      "Second host should create an independent room.",
    );
    assert(
      secondCreated.snapshot.peerCount === 1,
      "Second room should initially contain only its host.",
    );

    guest.send(
      createRoomJoinMessage(
        { roomId: ROOM_ID, senderId: GUEST_PEER_ID },
        "Guest",
      ),
    );
    const joined = await guest.waitForType(SIGNALING_MESSAGE_TYPES.ROOM_JOINED);
    const peerJoined = await host.waitForType(SIGNALING_MESSAGE_TYPES.PEER_JOINED);
    assert(joined.snapshot.peers.length === 2, "Guest join should fill the two-slot room.");
    assert(joined.snapshot.peerCount === 2, "Joined room peer metadata should count both peers.");
    assert(!joined.snapshot.isOpen, "Joined room should be marked full.");
    assert(joined.snapshot.guestPeerId === GUEST_PEER_ID, "Guest peer id should be recorded.");
    assert(peerJoined.peer.peerId === GUEST_PEER_ID, "Host should be notified of guest join.");
    assert(peerJoined.peer.displayName === "Guest", "Guest display name should be relayed.");
    assert(peerJoined.snapshot.peers.length === 2, "Peer joined snapshot should contain both peers.");
    await secondHost.expectNoType(SIGNALING_MESSAGE_TYPES.PEER_JOINED);

    guest.send(
      createRoomJoinMessage(
        { roomId: ROOM_ID, senderId: GUEST_PEER_ID },
        "Guest",
      ),
    );
    const duplicateJoined = await guest.waitForType(
      SIGNALING_MESSAGE_TYPES.ROOM_JOINED,
    );
    assert(
      duplicateJoined.snapshot.guestPeerId === GUEST_PEER_ID,
      "Duplicate guest join should idempotently return the current room.",
    );
    assert(
      duplicateJoined.snapshot.peerCount === 2,
      "Duplicate guest join should not add another peer.",
    );
    await host.expectNoType(SIGNALING_MESSAGE_TYPES.PEER_JOINED);

    secondGuest.send(
      createRoomJoinMessage(
        { roomId: SECOND_ROOM_ID, senderId: SECOND_GUEST_PEER_ID },
        "Second Guest",
      ),
    );
    const secondJoined = await secondGuest.waitForType(
      SIGNALING_MESSAGE_TYPES.ROOM_JOINED,
    );
    const secondPeerJoined = await secondHost.waitForType(
      SIGNALING_MESSAGE_TYPES.PEER_JOINED,
    );
    assert(
      secondJoined.snapshot.roomId === SECOND_ROOM_ID,
      "Second guest should join the second room only.",
    );
    assert(
      secondJoined.snapshot.peers.length === 2,
      "Second room peer list should contain its two members.",
    );
    assert(
      secondPeerJoined.peer.peerId === SECOND_GUEST_PEER_ID,
      "Second host should be notified of its own guest.",
    );
    await host.expectNoType(SIGNALING_MESSAGE_TYPES.PEER_JOINED);

    third.send(
      createRoomStateRequestMessage({
        roomId: ROOM_ID,
        senderId: THIRD_PEER_ID,
      }),
    );
    const scopedRoomStateRejected = await third.waitForType(
      SIGNALING_MESSAGE_TYPES.SIGNALING_ERROR,
    );
    assert(
      scopedRoomStateRejected.reason === "not-in-room",
      "Non-members must not receive another room's peer list.",
    );
    assert(
      scopedRoomStateRejected.retryable,
      "Not-in-room signaling failures should be marked retryable.",
    );

    secondHost.send(
      createRoomStateRequestMessage({
        roomId: ROOM_ID,
        senderId: SECOND_HOST_PEER_ID,
      }),
    );
    const crossRoomStateRejected = await secondHost.waitForType(
      SIGNALING_MESSAGE_TYPES.SIGNALING_ERROR,
    );
    assert(
      crossRoomStateRejected.reason === "not-in-room",
      "Room members must not discover peers from a different room.",
    );

    host.send(
      createRoomStateRequestMessage({
        roomId: ROOM_ID,
        senderId: HOST_PEER_ID,
      }),
    );
    const fullRoomState = await host.waitForType(SIGNALING_MESSAGE_TYPES.ROOM_STATE);
    assert(fullRoomState.exists, "Room state request should report existing room.");
    assert(fullRoomState.snapshot?.peerCount === 2, "Room state should include room metadata.");

    third.send(
      createRoomJoinMessage(
        { roomId: ROOM_ID, senderId: THIRD_PEER_ID },
        "Third",
      ),
    );
    const rejected = await third.waitForType(
      SIGNALING_MESSAGE_TYPES.ROOM_JOIN_REJECTED,
    );
    assert(rejected.reason === "room-full", "Third human player should be rejected.");
    assert(rejected.retryable, "Room-full join failures should be marked retryable.");
    assert(
      rejected.snapshot === undefined,
      "Room-full rejection should not disclose a peer list to a non-member.",
    );

    const offerDescription = {
      type: "offer" as const,
      sdp: "v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=kart\r\nt=0 0\r\n",
    };
    host.send(
      createSdpOfferMessage(
        {
          roomId: ROOM_ID,
          senderId: HOST_PEER_ID,
          recipientId: GUEST_PEER_ID,
        },
        offerDescription,
      ),
    );
    const relayedOffer = await guest.waitForType(SIGNALING_MESSAGE_TYPES.SDP_OFFER);
    assert(relayedOffer.senderId === HOST_PEER_ID, "Guest should receive host SDP offer.");
    assert(relayedOffer.description.sdp === offerDescription.sdp, "Relayed offer SDP should match.");

    const answerDescription = {
      type: "answer" as const,
      sdp: "v=0\r\no=- 2 1 IN IP4 127.0.0.1\r\ns=kart\r\nt=0 0\r\n",
    };
    guest.send(
      createSdpAnswerMessage(
        {
          roomId: ROOM_ID,
          senderId: GUEST_PEER_ID,
          recipientId: HOST_PEER_ID,
        },
        answerDescription,
      ),
    );
    const relayedAnswer = await host.waitForType(SIGNALING_MESSAGE_TYPES.SDP_ANSWER);
    assert(relayedAnswer.senderId === GUEST_PEER_ID, "Host should receive guest SDP answer.");
    assert(relayedAnswer.description.sdp === answerDescription.sdp, "Relayed answer SDP should match.");

    const candidate = {
      candidate: "candidate:0 1 UDP 2122252543 127.0.0.1 50000 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
    };
    guest.send(
      createIceCandidateMessage(
        {
          roomId: ROOM_ID,
          senderId: GUEST_PEER_ID,
          recipientId: HOST_PEER_ID,
        },
        candidate,
      ),
    );
    const relayedCandidate = await host.waitForType(
      SIGNALING_MESSAGE_TYPES.ICE_CANDIDATE,
    );
    assert(
      relayedCandidate.candidate?.candidate === candidate.candidate,
      "Host should receive guest ICE candidate.",
    );

    host.send(
      createIceCandidateMessage(
        {
          roomId: ROOM_ID,
          senderId: HOST_PEER_ID,
          recipientId: GUEST_PEER_ID,
        },
        null,
      ),
    );
    const relayedEndOfCandidates = await guest.waitForType(
      SIGNALING_MESSAGE_TYPES.ICE_CANDIDATE,
    );
    assert(
      relayedEndOfCandidates.candidate === null,
      "Guest should receive host end-of-candidates signal.",
    );

    host.send(
      createSdpOfferMessage(
        {
          roomId: ROOM_ID,
          senderId: HOST_PEER_ID,
          recipientId: "missing-peer",
        },
        offerDescription,
      ),
    );
    const unknownRecipientRejected = await host.waitForType(
      SIGNALING_MESSAGE_TYPES.SIGNALING_ERROR,
    );
    assert(
      unknownRecipientRejected.reason === "peer-not-found",
      "WebRTC signaling to an unknown room peer should be rejected.",
    );
    assert(
      unknownRecipientRejected.retryable,
      "Unknown WebRTC recipients should be marked retryable.",
    );
    await guest.expectNoType(SIGNALING_MESSAGE_TYPES.SDP_OFFER);

    secondHost.send(
      createSdpOfferMessage(
        {
          roomId: ROOM_ID,
          senderId: SECOND_HOST_PEER_ID,
          recipientId: GUEST_PEER_ID,
        },
        offerDescription,
      ),
    );
    const crossRoomOfferRejected = await secondHost.waitForType(
      SIGNALING_MESSAGE_TYPES.SIGNALING_ERROR,
    );
    assert(
      crossRoomOfferRejected.reason === "not-in-room",
      "Peers must not relay WebRTC signaling into a different room.",
    );
    await guest.expectNoType(SIGNALING_MESSAGE_TYPES.SDP_OFFER);

    guest.send(
      createSdpOfferMessage(
        {
          roomId: ROOM_ID,
          senderId: GUEST_PEER_ID,
          recipientId: HOST_PEER_ID,
        },
        offerDescription,
      ),
    );
    const guestOfferRejected = await guest.waitForType(
      SIGNALING_MESSAGE_TYPES.SIGNALING_ERROR,
    );
    assert(
      guestOfferRejected.reason === "invalid-message",
      "Guest-originated SDP offers should be rejected in host-authoritative setup.",
    );
    await host.expectNoType(SIGNALING_MESSAGE_TYPES.SDP_OFFER);

    host.send(
      createSdpOfferMessage(
        {
          roomId: ROOM_ID,
          senderId: HOST_PEER_ID,
          recipientId: GUEST_PEER_ID,
        },
        { type: "offer" as const, sdp: "not-an-sdp-payload" },
      ),
    );
    const invalidSdpRejected = await host.waitForType(
      SIGNALING_MESSAGE_TYPES.SIGNALING_ERROR,
    );
    assert(
      invalidSdpRejected.reason === "invalid-message",
      "Malformed SDP payloads should be rejected before relay.",
    );
    assert(
      !invalidSdpRejected.retryable,
      "Malformed SDP payloads should not be marked retryable.",
    );
    await guest.expectNoType(SIGNALING_MESSAGE_TYPES.SDP_OFFER);

    guest.send(
      createIceCandidateMessage(
        {
          roomId: ROOM_ID,
          senderId: GUEST_PEER_ID,
          recipientId: HOST_PEER_ID,
        },
        {
          candidate: "not-an-ice-candidate",
          sdpMid: "0",
          sdpMLineIndex: 0,
        },
      ),
    );
    const invalidIceRejected = await guest.waitForType(
      SIGNALING_MESSAGE_TYPES.SIGNALING_ERROR,
    );
    assert(
      invalidIceRejected.reason === "invalid-message",
      "Malformed ICE payloads should be rejected before relay.",
    );
    await host.expectNoType(SIGNALING_MESSAGE_TYPES.ICE_CANDIDATE);

    guest.send(
      createRoomLeaveMessage({
        roomId: ROOM_ID,
        senderId: GUEST_PEER_ID,
      }),
    );
    const guestLeft = await guest.waitForType(SIGNALING_MESSAGE_TYPES.ROOM_LEFT);
    const hostSawGuestLeave = await host.waitForType(SIGNALING_MESSAGE_TYPES.PEER_LEFT);
    assert(guestLeft.peerId === GUEST_PEER_ID, "Guest should receive room-left ack.");
    assert(
      guestLeft.snapshot?.peerCount === 1,
      "Guest leave ack should include remaining host snapshot.",
    );
    assert(
      hostSawGuestLeave.peerId === GUEST_PEER_ID,
      "Host should be notified that guest left.",
    );
    assert(
      hostSawGuestLeave.snapshot?.isOpen,
      "Host room should reopen after guest leaves.",
    );
    await secondHost.expectNoType(SIGNALING_MESSAGE_TYPES.PEER_LEFT);
    await secondGuest.expectNoType(SIGNALING_MESSAGE_TYPES.PEER_LEFT);

    host.send(
      createIceCandidateMessage(
        {
          roomId: ROOM_ID,
          senderId: HOST_PEER_ID,
          recipientId: GUEST_PEER_ID,
        },
        candidate,
      ),
    );
    const staleRecipientRejected = await host.waitForType(
      SIGNALING_MESSAGE_TYPES.SIGNALING_ERROR,
    );
    assert(
      staleRecipientRejected.reason === "peer-not-found",
      "WebRTC signaling to a stale departed peer should be rejected.",
    );
    assert(
      staleRecipientRejected.retryable,
      "Stale departed recipients should be retryable failures.",
    );
    await guest.expectNoType(SIGNALING_MESSAGE_TYPES.ICE_CANDIDATE);

    guest.send(
      createIceCandidateMessage(
        {
          roomId: ROOM_ID,
          senderId: GUEST_PEER_ID,
          recipientId: HOST_PEER_ID,
        },
        candidate,
      ),
    );
    const staleSenderRejected = await guest.waitForType(
      SIGNALING_MESSAGE_TYPES.SIGNALING_ERROR,
    );
    assert(
      staleSenderRejected.reason === "not-in-room",
      "Departed peers should not be allowed to send stale WebRTC signaling.",
    );
    await host.expectNoType(SIGNALING_MESSAGE_TYPES.ICE_CANDIDATE);

    guest.send(
      createRoomLeaveMessage({
        roomId: ROOM_ID,
        senderId: GUEST_PEER_ID,
      }),
    );
    const invalidGuestLeave = await guest.waitForType(
      SIGNALING_MESSAGE_TYPES.SIGNALING_ERROR,
    );
    assert(
      invalidGuestLeave.reason === "not-in-room",
      "Leaving without membership should be rejected.",
    );
    assert(
      invalidGuestLeave.retryable,
      "Invalid leave due to missing membership should be retryable.",
    );

    third.send(
      createRoomJoinMessage(
        { roomId: ROOM_ID, senderId: THIRD_PEER_ID },
        "Third",
      ),
    );
    const replacementJoined = await third.waitForType(
      SIGNALING_MESSAGE_TYPES.ROOM_JOINED,
    );
    const replacementPeerJoined = await host.waitForType(
      SIGNALING_MESSAGE_TYPES.PEER_JOINED,
    );
    assert(
      replacementJoined.snapshot.guestPeerId === THIRD_PEER_ID,
      "Room should accept a replacement guest after leave.",
    );
    assert(
      replacementPeerJoined.peer.peerId === THIRD_PEER_ID,
      "Host should be notified of replacement guest join.",
    );
    await secondHost.expectNoType(SIGNALING_MESSAGE_TYPES.PEER_JOINED);

    host.send(
      createRoomStateRequestMessage({
        roomId: ROOM_ID,
        senderId: HOST_PEER_ID,
      }),
    );
    const replacementRoomState = await host.waitForType(
      SIGNALING_MESSAGE_TYPES.ROOM_STATE,
    );
    assert(
      replacementRoomState.snapshot?.guestPeerId === THIRD_PEER_ID,
      "Room state should reflect replacement guest.",
    );

    host.send(
      createRoomLeaveMessage({
        roomId: ROOM_ID,
        senderId: HOST_PEER_ID,
      }),
    );
    const hostLeft = await host.waitForType(SIGNALING_MESSAGE_TYPES.ROOM_LEFT);
    const thirdSawHostLeave = await third.waitForType(SIGNALING_MESSAGE_TYPES.PEER_LEFT);
    assert(hostLeft.peerId === HOST_PEER_ID, "Host should receive room-left ack.");
    assert(
      thirdSawHostLeave.peerId === HOST_PEER_ID,
      "Guest should be notified when host closes the room.",
    );
    assert(
      thirdSawHostLeave.snapshot === undefined,
      "Host departure should close the room without a remaining snapshot.",
    );
    await secondHost.expectNoType(SIGNALING_MESSAGE_TYPES.PEER_LEFT);
    await secondGuest.expectNoType(SIGNALING_MESSAGE_TYPES.PEER_LEFT);

    guest.send(
      createRoomStateRequestMessage({
        roomId: ROOM_ID,
        senderId: GUEST_PEER_ID,
      }),
    );
    const closedRoomState = await guest.waitForType(SIGNALING_MESSAGE_TYPES.ROOM_STATE);
    assert(!closedRoomState.exists, "Closed room should no longer be listed.");
    assert(
      closedRoomState.snapshot === undefined,
      "Closed room state should not include a snapshot.",
    );

    secondGuest.terminate();
    const secondHostSawGuestDisconnect = await secondHost.waitForType(
      SIGNALING_MESSAGE_TYPES.PEER_LEFT,
    );
    assert(
      secondHostSawGuestDisconnect.peerId === SECOND_GUEST_PEER_ID,
      "Remaining host should be notified when a guest socket disconnects abruptly.",
    );
    assert(
      secondHostSawGuestDisconnect.snapshot?.peerCount === 1,
      "Abrupt guest disconnect should remove the guest from the room snapshot.",
    );
    assert(
      secondHostSawGuestDisconnect.snapshot?.isOpen,
      "Abrupt guest disconnect should reopen the room for another guest.",
    );
    await secondHost.expectNoType(SIGNALING_MESSAGE_TYPES.PEER_LEFT);

    const secondReplacementGuest = await SignalingValidationClient.connect(
      port,
      SECOND_GUEST_PEER_ID,
    );
    clients.push(secondReplacementGuest);
    secondReplacementGuest.send(
      createRoomJoinMessage(
        { roomId: SECOND_ROOM_ID, senderId: SECOND_GUEST_PEER_ID },
        "Second Guest Replacement",
      ),
    );
    const secondReplacementJoined = await secondReplacementGuest.waitForType(
      SIGNALING_MESSAGE_TYPES.ROOM_JOINED,
    );
    const secondHostSawReplacementJoin = await secondHost.waitForType(
      SIGNALING_MESSAGE_TYPES.PEER_JOINED,
    );
    assert(
      secondReplacementJoined.snapshot.guestPeerId === SECOND_GUEST_PEER_ID,
      "Closed guest sockets should be removed so the same peer id can rejoin.",
    );
    assert(
      secondHostSawReplacementJoin.peer.peerId === SECOND_GUEST_PEER_ID,
      "Host should be notified when a replacement guest joins after disconnect cleanup.",
    );

    secondHost.terminate();
    const replacementSawHostDisconnect = await secondReplacementGuest.waitForType(
      SIGNALING_MESSAGE_TYPES.PEER_LEFT,
    );
    assert(
      replacementSawHostDisconnect.peerId === SECOND_HOST_PEER_ID,
      "Guest should be notified when host socket disconnects abruptly.",
    );
    assert(
      replacementSawHostDisconnect.snapshot === undefined,
      "Abrupt host disconnect should tear down the room without a remaining snapshot.",
    );

    const secondRoomProbe = await SignalingValidationClient.connect(
      port,
      SECOND_ROOM_PROBE_PEER_ID,
    );
    clients.push(secondRoomProbe);
    secondRoomProbe.send(
      createRoomStateRequestMessage({
        roomId: SECOND_ROOM_ID,
        senderId: SECOND_ROOM_PROBE_PEER_ID,
      }),
    );
    const secondClosedRoomState = await secondRoomProbe.waitForType(
      SIGNALING_MESSAGE_TYPES.ROOM_STATE,
    );
    assert(
      !secondClosedRoomState.exists,
      "Abrupt host disconnect should remove the empty room.",
    );
    assert(
      secondClosedRoomState.snapshot === undefined,
      "Removed rooms should not expose stale peer snapshots.",
    );

    const reconnectHost = await SignalingValidationClient.connect(
      port,
      RECONNECT_HOST_PEER_ID,
    );
    const reconnectGuest = await SignalingValidationClient.connect(
      port,
      RECONNECT_GUEST_PEER_ID,
    );
    clients.push(reconnectHost, reconnectGuest);

    reconnectHost.send(
      createRoomCreateMessage(
        { roomId: RECONNECT_ROOM_ID, senderId: RECONNECT_HOST_PEER_ID },
        "Reconnect Host",
      ),
    );
    await reconnectHost.waitForType(SIGNALING_MESSAGE_TYPES.ROOM_CREATED);

    reconnectGuest.send(
      createRoomJoinMessage(
        { roomId: RECONNECT_ROOM_ID, senderId: RECONNECT_GUEST_PEER_ID },
        "Reconnect Guest",
      ),
    );
    await reconnectGuest.waitForType(SIGNALING_MESSAGE_TYPES.ROOM_JOINED);
    await reconnectHost.waitForType(SIGNALING_MESSAGE_TYPES.PEER_JOINED);

    const reconnectHostReplacement = await SignalingValidationClient.connect(
      port,
      RECONNECT_HOST_PEER_ID,
    );
    clients.push(reconnectHostReplacement);
    reconnectHostReplacement.send(
      createRoomCreateMessage(
        { roomId: RECONNECT_ROOM_ID, senderId: RECONNECT_HOST_PEER_ID },
        "Reconnect Host",
      ),
    );
    const reconnectedHostCreated = await reconnectHostReplacement.waitForType(
      SIGNALING_MESSAGE_TYPES.ROOM_CREATED,
    );
    assert(
      reconnectedHostCreated.snapshot.peerCount === 2,
      "Reconnected hosts should recover the existing room snapshot.",
    );
    assert(
      reconnectedHostCreated.snapshot.guestPeerId === RECONNECT_GUEST_PEER_ID,
      "Reconnected hosts should keep the existing guest assignment.",
    );

    const reconnectGuestReplacement = await SignalingValidationClient.connect(
      port,
      RECONNECT_GUEST_PEER_ID,
    );
    clients.push(reconnectGuestReplacement);
    reconnectGuestReplacement.send(
      createRoomJoinMessage(
        { roomId: RECONNECT_ROOM_ID, senderId: RECONNECT_GUEST_PEER_ID },
        "Reconnect Guest",
      ),
    );
    const reconnectedGuestJoined = await reconnectGuestReplacement.waitForType(
      SIGNALING_MESSAGE_TYPES.ROOM_JOINED,
    );
    const hostSawGuestReconnect = await reconnectHostReplacement.waitForType(
      SIGNALING_MESSAGE_TYPES.PEER_JOINED,
    );
    assert(
      reconnectedGuestJoined.snapshot.peerCount === 2,
      "Reconnected guests should rejoin the occupied slot idempotently.",
    );
    assert(
      hostSawGuestReconnect.peer.peerId === RECONNECT_GUEST_PEER_ID,
      "Hosts should receive a clear reconnect join event for renegotiation.",
    );

    console.info("Signaling room flow validation passed.");
  } finally {
    for (const client of clients) {
      client.close();
    }

    stopSignalingServer(serverProcess);
  }
}

async function startSignalingServer(
  port: number,
): Promise<SignalingServerProcess> {
  const serverProcess = spawn(
    process.execPath,
    ["server/dist/server/signalingServer.js"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        KART_SIGNALING_PORT: String(port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  ) as SignalingServerProcess;
  let stdout = "";
  let stderr = "";

  serverProcess.stdout.setEncoding("utf8");
  serverProcess.stderr.setEncoding("utf8");
  serverProcess.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  serverProcess.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  await waitForServerReady(serverProcess, () => stdout, () => stderr);
  return serverProcess;
}

async function waitForServerReady(
  serverProcess: SignalingServerProcess,
  getStdout: () => string,
  getStderr: () => string,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < SERVER_READY_TIMEOUT_MS) {
    if (getStdout().includes("[kart-signaling] listening")) {
      return;
    }

    if (serverProcess.exitCode !== null) {
      throw new Error(
        `Signaling server exited early with code ${serverProcess.exitCode}: ${getStderr()}`,
      );
    }

    await delay(25);
  }

  throw new Error(
    `Timed out waiting for signaling server. stdout=${getStdout()} stderr=${getStderr()}`,
  );
}

function stopSignalingServer(serverProcess: SignalingServerProcess): void {
  if (serverProcess.exitCode === null) {
    serverProcess.kill();
  }
}

async function findOpenPort(): Promise<number> {
  const probe = createServer();

  await new Promise<void>((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });

  const address = probe.address();

  if (address === null || typeof address === "string") {
    throw new Error("Unable to allocate validation port.");
  }

  await new Promise<void>((resolve, reject) => {
    probe.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  return address.port;
}

function rawDataToPayload(data: RawData): string | Uint8Array {
  if (typeof data === "string") {
    return data;
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }

  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  return data;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
