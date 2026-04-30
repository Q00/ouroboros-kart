import { serializeKartGameplayMessage } from "./gameplayMessage";
import type {
  KartBananaRemovalEventMessage,
  KartBananaSpawnEventMessage
} from "./kartBananaEventMessage";

export type KartBananaLifecycleEventMessage =
  | KartBananaSpawnEventMessage
  | KartBananaRemovalEventMessage;

export interface KartBananaEventPeerChannel {
  readonly peerId: string;
  readonly send: (
    payload: string,
    event: KartBananaLifecycleEventMessage
  ) => boolean;
}

export interface KartBananaEventPeerDelivery {
  readonly peerId: string;
  readonly eventId: string;
  readonly bananaId: string;
  readonly sent: boolean;
}

export interface KartBananaEventBroadcastResult {
  readonly attemptedCount: number;
  readonly sentCount: number;
  readonly droppedCount: number;
  readonly deliveries: readonly KartBananaEventPeerDelivery[];
}

export function broadcastKartBananaLifecycleEventsToPeers(
  events: readonly KartBananaLifecycleEventMessage[],
  peerChannels: readonly KartBananaEventPeerChannel[]
): KartBananaEventBroadcastResult {
  const deliveries: KartBananaEventPeerDelivery[] = [];
  let sentCount = 0;

  for (const event of events) {
    const payload = serializeKartGameplayMessage(event);

    for (const peerChannel of peerChannels) {
      const sent = peerChannel.send(payload, event);

      if (sent) {
        sentCount += 1;
      }

      deliveries.push({
        peerId: peerChannel.peerId,
        eventId: event.eventId,
        bananaId: event.bananaId,
        sent
      });
    }
  }

  return {
    attemptedCount: deliveries.length,
    sentCount,
    droppedCount: deliveries.length - sentCount,
    deliveries
  };
}
