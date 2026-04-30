import type { RaceProgressSnapshot } from "../race/raceSession";
import {
  broadcastKartAuthoritativeSnapshotToPeer,
  broadcastSerializedKartAuthoritativeSnapshotPayloadToPeer,
  MAX_HOST_AUTHORITATIVE_SNAPSHOT_BUFFERED_BYTES,
  type KartAuthoritativeSnapshotPeerChannel
} from "./hostAuthoritativeSnapshotBroadcast";
import {
  createKartAuthoritativePlayerSnapshot,
  type KartAuthoritativePlayerSnapshot
} from "./kartAuthoritativePlayerSnapshot";
import { createKartRaceStateSnapshot } from "./kartRaceStateMessage";
import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  createKartInputSnapshot
} from "./kartInputSnapshot";
import {
  deserializeKartGameplayMessageAs,
  serializeKartGameplayMessage
} from "./gameplayMessage";
import type { BrowserDataChannelSendOptions } from "./peerConnection";
import type { KartRacerTransform } from "./kartTransformSnapshot";

const HOST_PEER_ID = "host-peer";
const GUEST_PEER_ID = "guest-peer";
const WRONG_PEER_ID = "wrong-peer";
const GUEST_RACER_ID = "human_guest-peer";

function main(): void {
  validateRaceStateSnapshotBroadcastSerializesToOpenPeerChannel();
  validateAuthoritativePlayerSnapshotBroadcastRoutesOnlyExpectedPeer();
  validateBroadcastRejectsBackpressureClosedChannelsAndInvalidPayloads();
}

function validateRaceStateSnapshotBroadcastSerializesToOpenPeerChannel(): void {
  const snapshot = createKartRaceStateSnapshot({
    hostPeerId: HOST_PEER_ID,
    sequence: 3,
    tickIndex: 180,
    elapsedSeconds: 3,
    capturedAt: 9000,
    phase: "running",
    lapCount: 3,
    racers: [createRaceProgressSnapshot(GUEST_RACER_ID, 1, "Guest")],
    racerTransforms: [createRacerTransform(GUEST_RACER_ID, 1)]
  });
  const peer = new FakeAuthoritativeSnapshotPeerChannel(GUEST_PEER_ID);
  const result = broadcastKartAuthoritativeSnapshotToPeer(snapshot, peer, {
    expectedPeerId: GUEST_PEER_ID
  });

  assert(result.sent, "host race-state snapshot is broadcast");
  assertEqual(peer.sentPayloads.length, 1, "one serialized payload is sent");
  assertEqual(
    peer.sentPayloads[0],
    result.payload,
    "broadcast result exposes the sent payload"
  );
  assertEqual(
    result.type,
    KART_GAMEPLAY_MESSAGE_TYPES.RACE_STATE_SNAPSHOT,
    "broadcast reports race-state snapshot type"
  );

  const parsed = deserializeKartGameplayMessageAs(
    result.payload,
    KART_GAMEPLAY_MESSAGE_TYPES.RACE_STATE_SNAPSHOT
  );

  assertEqual(parsed.hostPeerId, HOST_PEER_ID, "host id survives broadcast");
  assertEqual(
    parsed.racerTransforms[0]?.racerId,
    GUEST_RACER_ID,
    "serialized broadcast carries authoritative racer transforms"
  );
}

function validateAuthoritativePlayerSnapshotBroadcastRoutesOnlyExpectedPeer(): void {
  const snapshot = createAuthoritativePlayerSnapshot();
  const wrongPeer = new FakeAuthoritativeSnapshotPeerChannel(WRONG_PEER_ID);
  const rejected = broadcastKartAuthoritativeSnapshotToPeer(snapshot, wrongPeer, {
    expectedPeerId: GUEST_PEER_ID
  });

  assert(!rejected.sent, "unexpected authoritative snapshot peer is rejected");
  assertEqual(
    rejected.reason,
    "unexpected-peer",
    "unexpected peer rejection reason"
  );
  assertEqual(wrongPeer.sentPayloads.length, 0, "unexpected peer is not sent to");

  const guestPeer = new FakeAuthoritativeSnapshotPeerChannel(GUEST_PEER_ID);
  const sent = broadcastKartAuthoritativeSnapshotToPeer(snapshot, guestPeer, {
    expectedPeerId: GUEST_PEER_ID
  });

  assert(sent.sent, "authoritative player snapshot is sent to expected peer");
  assertEqual(
    sent.type,
    KART_GAMEPLAY_MESSAGE_TYPES.AUTHORITATIVE_PLAYER_SNAPSHOT,
    "broadcast reports authoritative-player snapshot type"
  );
  assertEqual(
    deserializeKartGameplayMessageAs(
      sent.payload,
      KART_GAMEPLAY_MESSAGE_TYPES.AUTHORITATIVE_PLAYER_SNAPSHOT
    ).acknowledgedPeerInputSequence,
    17,
    "broadcast carries acknowledged peer input sequence"
  );
}

function validateBroadcastRejectsBackpressureClosedChannelsAndInvalidPayloads(): void {
  const snapshotPayload = serializeKartGameplayMessage(
    createAuthoritativePlayerSnapshot()
  );
  const bufferedPeer = new FakeAuthoritativeSnapshotPeerChannel(GUEST_PEER_ID);
  bufferedPeer.channel.bufferedAmount =
    MAX_HOST_AUTHORITATIVE_SNAPSHOT_BUFFERED_BYTES;

  const buffered = broadcastSerializedKartAuthoritativeSnapshotPayloadToPeer(
    snapshotPayload,
    bufferedPeer
  );

  assert(!buffered.sent, "buffered channel rejects authoritative snapshot");
  assertEqual(
    buffered.reason,
    "channel-buffered",
    "buffered channel rejection reason"
  );

  const closedPeer = new FakeAuthoritativeSnapshotPeerChannel(GUEST_PEER_ID);
  closedPeer.channel.readyState = "closed";
  const closed = broadcastSerializedKartAuthoritativeSnapshotPayloadToPeer(
    snapshotPayload,
    closedPeer
  );

  assert(!closed.sent, "closed channel rejects authoritative snapshot");
  assertEqual(
    closed.reason,
    "channel-unavailable",
    "closed channel rejection reason"
  );

  const sendFailurePeer = new FakeAuthoritativeSnapshotPeerChannel(GUEST_PEER_ID);
  sendFailurePeer.failSends = true;
  const sendFailure = broadcastSerializedKartAuthoritativeSnapshotPayloadToPeer(
    snapshotPayload,
    sendFailurePeer
  );

  assert(!sendFailure.sent, "send failure is reported");
  assertEqual(sendFailure.reason, "send-failed", "send failure reason");

  const inputPayload = serializeKartGameplayMessage(
    createKartInputSnapshot({
      peerId: GUEST_PEER_ID,
      racerId: GUEST_RACER_ID,
      sequence: 1,
      tickIndex: 1,
      elapsedSeconds: 1 / 60,
      capturedAt: 1000,
      input: {
        throttle: 1,
        brake: 0,
        steer: 0,
        drift: false,
        useItem: false
      }
    })
  );
  const invalid = broadcastSerializedKartAuthoritativeSnapshotPayloadToPeer(
    inputPayload,
    new FakeAuthoritativeSnapshotPeerChannel(GUEST_PEER_ID)
  );

  assert(!invalid.sent, "non-authoritative gameplay payload is rejected");
  assertEqual(
    invalid.reason,
    "invalid-payload",
    "non-authoritative payload rejection reason"
  );
}

class FakeAuthoritativeSnapshotPeerChannel
  implements KartAuthoritativeSnapshotPeerChannel
{
  public channel: {
    readyState: RTCDataChannelState;
    bufferedAmount: number;
  } = {
    readyState: "open",
    bufferedAmount: 0
  };
  public readonly sentPayloads: string[] = [];
  public readonly sendOptions: BrowserDataChannelSendOptions[] = [];
  public failSends = false;

  public constructor(public readonly peerId: string) {}

  public send(
    payload: string,
    options: BrowserDataChannelSendOptions = {}
  ): boolean {
    if (this.failSends) {
      return false;
    }

    if (
      options.maxBufferedAmount !== undefined &&
      this.channel.bufferedAmount + payload.length * 2 >
        options.maxBufferedAmount
    ) {
      return false;
    }

    this.sentPayloads.push(payload);
    this.sendOptions.push(options);

    return true;
  }
}

function createAuthoritativePlayerSnapshot(): KartAuthoritativePlayerSnapshot {
  const progress = createRaceProgressSnapshot(GUEST_RACER_ID, 1, "Guest");
  const transform = createRacerTransform(GUEST_RACER_ID, 1);

  return createKartAuthoritativePlayerSnapshot({
    hostPeerId: HOST_PEER_ID,
    peerId: GUEST_PEER_ID,
    racerId: GUEST_RACER_ID,
    sequence: 5,
    hostTick: {
      tickIndex: 120,
      elapsedSeconds: 2
    },
    acknowledgedPeerInputSequence: 17,
    capturedAt: 8000,
    playerState: {
      peerId: GUEST_PEER_ID,
      racerId: GUEST_RACER_ID,
      slotIndex: 1,
      displayName: "Guest",
      controller: "human",
      progress,
      transform
    }
  });
}

function createRaceProgressSnapshot(
  racerId: string,
  slotIndex: number,
  displayName: string
): RaceProgressSnapshot {
  return {
    racerId,
    slotIndex,
    displayName,
    controller: "human",
    rank: slotIndex + 1,
    lap: 1,
    lapCount: 3,
    checkpointIndex: 1,
    checkpointCount: 8,
    trackProgress: 20,
    trackLength: 120,
    completedDistance: 140,
    totalDistance: 360,
    currentLapProgressRatio: 0.166,
    completionRatio: 0.388,
    finished: false,
    finishPlace: null,
    finishTimeSeconds: null
  };
}

function createRacerTransform(
  racerId: string,
  slotIndex: number
): KartRacerTransform {
  return {
    racerId,
    slotIndex,
    position: { x: slotIndex * 2, y: 0, z: 6 },
    velocity: { x: 0, y: 0, z: 12 },
    forward: { x: 0, y: 0, z: 1 },
    headingRadians: 0,
    speed: 12,
    heldItem: "shell",
    boostSeconds: 0,
    shieldSeconds: 0,
    stunSeconds: 0,
    spinoutSeconds: 0,
    spinoutAngularVelocity: 0,
    itemHitImmunitySeconds: 0,
    hitFeedbackSeconds: 0,
    lastHitItemType: null,
    itemUseCooldownSeconds: 0,
    updateCount: 1
  };
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

main();
