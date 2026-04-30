import {
  MAX_AUTHORITATIVE_PLAYER_SNAPSHOT_PAYLOAD_BYTES,
  type KartAuthoritativePlayerSnapshot
} from "./kartAuthoritativePlayerSnapshot";
import {
  MAX_RACE_STATE_SNAPSHOT_PAYLOAD_BYTES,
  type KartRaceStateSnapshot
} from "./kartRaceStateMessage";
import { KART_GAMEPLAY_MESSAGE_TYPES } from "./kartInputSnapshot";
import {
  getKartGameplayPayloadType,
  serializeKartGameplayMessage,
  tryDeserializeKartGameplayMessage
} from "./gameplayMessage";
import type { BrowserDataChannelSendOptions } from "./peerConnection";
import type { SignalingPeerId } from "./signaling";

export const MAX_HOST_AUTHORITATIVE_SNAPSHOT_BUFFERED_BYTES = Math.max(
  MAX_AUTHORITATIVE_PLAYER_SNAPSHOT_PAYLOAD_BYTES,
  MAX_RACE_STATE_SNAPSHOT_PAYLOAD_BYTES
);

export type KartHostAuthoritativeSnapshot =
  | KartAuthoritativePlayerSnapshot
  | KartRaceStateSnapshot;

export type KartHostAuthoritativeSnapshotType =
  | typeof KART_GAMEPLAY_MESSAGE_TYPES.AUTHORITATIVE_PLAYER_SNAPSHOT
  | typeof KART_GAMEPLAY_MESSAGE_TYPES.RACE_STATE_SNAPSHOT;

export interface KartAuthoritativeSnapshotPeerChannel {
  readonly peerId: SignalingPeerId;
  readonly channel:
    | {
        readonly readyState: RTCDataChannelState;
        readonly bufferedAmount: number;
      }
    | null;
  readonly send: (
    payload: string,
    options?: BrowserDataChannelSendOptions
  ) => boolean;
}

export interface KartAuthoritativeSnapshotBroadcastOptions {
  readonly expectedPeerId?: SignalingPeerId;
  readonly maxBufferedAmount?: number;
  readonly maxPayloadBytes?: number;
}

export type KartAuthoritativeSnapshotBroadcastFailureReason =
  | "unexpected-peer"
  | "invalid-payload"
  | "channel-unavailable"
  | "channel-buffered"
  | "send-failed";

export type KartAuthoritativeSnapshotBroadcastResult =
  | {
      readonly sent: true;
      readonly peerId: SignalingPeerId;
      readonly type: KartHostAuthoritativeSnapshotType;
      readonly payload: string;
    }
  | {
      readonly sent: false;
      readonly peerId: SignalingPeerId;
      readonly reason: KartAuthoritativeSnapshotBroadcastFailureReason;
      readonly message: string;
      readonly payload: string;
    };

export function broadcastKartAuthoritativeSnapshotToPeer(
  snapshot: KartHostAuthoritativeSnapshot,
  peerChannel: KartAuthoritativeSnapshotPeerChannel,
  options: KartAuthoritativeSnapshotBroadcastOptions = {}
): KartAuthoritativeSnapshotBroadcastResult {
  return broadcastSerializedKartAuthoritativeSnapshotPayloadToPeer(
    serializeKartGameplayMessage(snapshot),
    peerChannel,
    options
  );
}

export function broadcastSerializedKartAuthoritativeSnapshotPayloadToPeer(
  payload: string,
  peerChannel: KartAuthoritativeSnapshotPeerChannel,
  options: KartAuthoritativeSnapshotBroadcastOptions = {}
): KartAuthoritativeSnapshotBroadcastResult {
  const peerId = requireNonEmptyPeerId(peerChannel.peerId, "peerChannel.peerId");
  const expectedPeerId =
    options.expectedPeerId === undefined
      ? undefined
      : requireNonEmptyPeerId(options.expectedPeerId, "expectedPeerId");

  if (expectedPeerId !== undefined && peerId !== expectedPeerId) {
    return rejectBroadcast(
      peerId,
      payload,
      "unexpected-peer",
      `Authoritative snapshot target mismatch: expected ${expectedPeerId}, got ${peerId}.`
    );
  }

  const messageType = getAuthoritativeSnapshotPayloadType(payload, options);

  if (messageType === null) {
    return rejectBroadcast(
      peerId,
      payload,
      "invalid-payload",
      "Authoritative snapshot payload must be a valid host snapshot message."
    );
  }

  const channel = peerChannel.channel;

  if (channel === null || channel.readyState !== "open") {
    return rejectBroadcast(
      peerId,
      payload,
      "channel-unavailable",
      "Authoritative snapshot data channel is not open."
    );
  }

  const maxBufferedAmount = requirePositiveWholeNumber(
    options.maxBufferedAmount ?? MAX_HOST_AUTHORITATIVE_SNAPSHOT_BUFFERED_BYTES,
    "maxBufferedAmount"
  );

  if (
    channel.bufferedAmount + estimateStringPayloadBytes(payload) >
    maxBufferedAmount
  ) {
    return rejectBroadcast(
      peerId,
      payload,
      "channel-buffered",
      "Authoritative snapshot data channel buffer is full."
    );
  }

  const sent = peerChannel.send(payload, {
    maxBufferedAmount
  });

  if (!sent) {
    return rejectBroadcast(
      peerId,
      payload,
      "send-failed",
      "Authoritative snapshot data channel send failed."
    );
  }

  return {
    sent: true,
    peerId,
    type: messageType,
    payload
  };
}

function getAuthoritativeSnapshotPayloadType(
  payload: string,
  options: KartAuthoritativeSnapshotBroadcastOptions
): KartHostAuthoritativeSnapshotType | null {
  const result = tryDeserializeKartGameplayMessage(payload, {
    maxPayloadBytes:
      options.maxPayloadBytes ?? MAX_HOST_AUTHORITATIVE_SNAPSHOT_BUFFERED_BYTES
  });

  if (!result.ok) {
    return null;
  }

  const type = getKartGameplayPayloadType(payload, {
    maxPayloadBytes:
      options.maxPayloadBytes ?? MAX_HOST_AUTHORITATIVE_SNAPSHOT_BUFFERED_BYTES
  });

  if (
    type === KART_GAMEPLAY_MESSAGE_TYPES.AUTHORITATIVE_PLAYER_SNAPSHOT ||
    type === KART_GAMEPLAY_MESSAGE_TYPES.RACE_STATE_SNAPSHOT
  ) {
    return type;
  }

  return null;
}

function rejectBroadcast(
  peerId: SignalingPeerId,
  payload: string,
  reason: KartAuthoritativeSnapshotBroadcastFailureReason,
  message: string
): KartAuthoritativeSnapshotBroadcastResult {
  return {
    sent: false,
    peerId,
    reason,
    message,
    payload
  };
}

function estimateStringPayloadBytes(payload: string): number {
  return payload.length * 2;
}

function requireNonEmptyPeerId(value: string, key: string): string {
  if (value.trim().length === 0) {
    throw new Error(`Authoritative snapshot peer id must be non-empty: ${key}.`);
  }

  return value;
}

function requirePositiveWholeNumber(value: number, key: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `Authoritative snapshot broadcast field must be a positive whole number: ${key}.`
    );
  }

  return value;
}
