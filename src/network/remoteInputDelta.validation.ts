import type { RacerInputState } from "../race/raceState";
import {
  KART_GAMEPLAY_MESSAGE_TYPES,
  getKartGameplayPayloadType
} from "./kartInputSnapshot";
import {
  LocalKartRemoteInputDeltaEmitter,
  applyKartRemoteInputDelta,
  createKartRemoteInputDeltaPacket,
  createKartRemoteInputDeltaState,
  deserializeKartRemoteInputDeltaPacket,
  hasKartRemoteInputDeltaStateChanges,
  isKartRemoteInputDeltaPacketPayload,
  serializeKartRemoteInputDeltaPacket,
  type KartRemoteInputDeltaPacket
} from "./remoteInputDelta";

function main(): void {
  validateRemoteInputDeltaPacketShape();
  validateRemoteInputDeltaEmitterSequences();
  validateRemoteInputDeltaEmitterReadinessChecks();
  validateRemoteInputDeltaApplication();
  validateRemoteInputDeltaRejections();
}

function validateRemoteInputDeltaPacketShape(): void {
  const packet = createKartRemoteInputDeltaPacket({
    peerId: "guest-peer",
    racerId: "human_guest-peer",
    sequence: 7,
    timestamp: 1234,
    sentAt: 1248,
    tickIndex: 42,
    elapsedSeconds: 0.7,
    delta: {
      throttle: 1.2,
      brake: -0.5,
      steer: -2,
      drift: true,
      useItem: false
    }
  });

  assertEqual(
    packet.type,
    KART_GAMEPLAY_MESSAGE_TYPES.REMOTE_INPUT_DELTA,
    "delta packet type"
  );
  assertEqual(packet.sequence, 7, "sequence is present");
  assertEqual(packet.timestamp, 1234, "timestamp is present");
  assertEqual(packet.sentAt, 1248, "local send timestamp is present");
  assertEqual(packet.delta.throttle, 1, "throttle delta is clamped");
  assertEqual(packet.delta.brake, 0, "brake delta is clamped");
  assertEqual(packet.delta.steer, -1, "steer delta is clamped");

  const payload = serializeKartRemoteInputDeltaPacket(packet);
  const parsed = deserializeKartRemoteInputDeltaPacket(payload);

  assertEqual(parsed.peerId, packet.peerId, "peer id round trips");
  assertEqual(parsed.racerId, packet.racerId, "racer id round trips");
  assertEqual(parsed.sequence, packet.sequence, "sequence round trips");
  assertEqual(parsed.timestamp, packet.timestamp, "timestamp round trips");
  assertEqual(parsed.sentAt, packet.sentAt, "local send timestamp round trips");
  assertEqual(parsed.delta.useItem, false, "delta input round trips");
  assert(
    isKartRemoteInputDeltaPacketPayload(payload),
    "valid remote input delta payload is detected"
  );
  assertEqual(
    getKartGameplayPayloadType(payload),
    KART_GAMEPLAY_MESSAGE_TYPES.REMOTE_INPUT_DELTA,
    "gameplay type peeking identifies remote input delta packets"
  );
}

function validateRemoteInputDeltaEmitterSequences(): void {
  const timestamps = [9001, 9017, 9033, 9049];
  const payloads: string[] = [];
  const packets: KartRemoteInputDeltaPacket[] = [];
  const emitter = new LocalKartRemoteInputDeltaEmitter({
    peerId: "guest-peer",
    racerId: "human_guest-peer",
    now: () => timestamps[packets.length] ?? 9999,
    send: (payload, packet) => {
      payloads.push(payload);
      packets.push(packet);
      return true;
    }
  });

  const first = emitter.emit(
    { tickIndex: 1, elapsedSeconds: 1 / 60 },
    createInput({ throttle: 1 })
  );
  const second = emitter.emit(
    { tickIndex: 2, elapsedSeconds: 2 / 60 },
    createInput({ throttle: 1 })
  );
  const third = emitter.emit(
    { tickIndex: 3, elapsedSeconds: 3 / 60 },
    createInput({ throttle: 1, steer: 0.5, drift: true })
  );
  const fourth = emitter.emit(
    { tickIndex: 4, elapsedSeconds: 4 / 60 },
    createInput({ throttle: 1, steer: 0.5, drift: true, useItem: true })
  );

  assert(first !== null, "first delta packet is emitted");
  assertEqual(second, null, "unchanged input does not emit a delta packet");
  assert(third !== null, "third delta packet is emitted");
  assert(fourth !== null, "fourth delta packet is emitted");
  assertEqual(payloads.length, 3, "only changed input samples emit payloads");
  assertEqual(packets[0]?.sequence, 0, "first sequence starts at zero");
  assertEqual(
    packets[1]?.sequence,
    1,
    "skipped unchanged samples do not consume sequence numbers"
  );
  assertEqual(packets[2]?.sequence, 2, "later changed samples increment");
  assertEqual(packets[0]?.timestamp, 9001, "first timestamp uses clock");
  assertEqual(packets[1]?.timestamp, 9017, "second timestamp uses clock");
  assertEqual(packets[0]?.sentAt, 9001, "first local send timestamp uses clock");
  assertEqual(packets[1]?.sentAt, 9017, "second local send timestamp uses clock");
  assertEqual(
    deserializeKartRemoteInputDeltaPacket(payloads[2]).timestamp,
    9033,
    "serialized packet includes timestamp"
  );
  assertEqual(
    deserializeKartRemoteInputDeltaPacket(payloads[2]).sentAt,
    9033,
    "serialized packet includes local send timestamp"
  );
  assertEqual(
    packets[0]?.delta.throttle,
    1,
    "first packet includes throttle changed from neutral"
  );
  assertEqual(
    packets[0]?.delta.brake,
    undefined,
    "first packet omits neutral unchanged brake"
  );
  assertEqual(
    packets[0]?.delta.useItem,
    undefined,
    "first packet omits neutral unchanged item state"
  );
  assertEqual(
    packets[1]?.delta.throttle,
    undefined,
    "unchanged throttle is omitted from later deltas"
  );
  assertEqual(packets[1]?.delta.steer, 0.5, "changed steer is included");
  assertEqual(packets[2]?.delta.useItem, true, "item pulse is included");
}

function validateRemoteInputDeltaEmitterReadinessChecks(): void {
  let channelOpen = false;
  const payloads: string[] = [];
  const packets: KartRemoteInputDeltaPacket[] = [];
  const emitter = new LocalKartRemoteInputDeltaEmitter({
    peerId: "guest-peer",
    racerId: "human_guest-peer",
    now: () => 9200 + packets.length,
    send: (payload, packet) => {
      if (!channelOpen) {
        return false;
      }

      payloads.push(payload);
      packets.push(packet);
      return true;
    }
  });

  const blockedFirst = emitter.emit(
    { tickIndex: 1, elapsedSeconds: 1 / 60 },
    createInput({ throttle: 1 })
  );

  assertEqual(blockedFirst, null, "closed channel blocks the first delta packet");
  assertEqual(payloads.length, 0, "closed channel does not send payloads");

  channelOpen = true;
  const deliveredFirst = emitter.emit(
    { tickIndex: 2, elapsedSeconds: 2 / 60 },
    createInput({ throttle: 1 })
  );

  assert(deliveredFirst !== null, "open channel sends the pending input delta");
  assertEqual(deliveredFirst.sequence, 0, "blocked sends do not consume sequence");
  assertEqual(
    deliveredFirst.delta.throttle,
    1,
    "blocked sends do not commit the unsent input state"
  );

  channelOpen = false;
  const blockedSteer = emitter.emit(
    { tickIndex: 3, elapsedSeconds: 3 / 60 },
    createInput({ throttle: 1, steer: -0.5 })
  );

  assertEqual(blockedSteer, null, "later closed channel blocks changed input");
  channelOpen = true;
  const deliveredSteer = emitter.emit(
    { tickIndex: 4, elapsedSeconds: 4 / 60 },
    createInput({ throttle: 1, steer: -0.5 })
  );

  assert(deliveredSteer !== null, "open channel retries the latest changed input");
  assertEqual(deliveredSteer.sequence, 1, "sequence advances only after delivery");
  assertEqual(
    deliveredSteer.delta.steer,
    -0.5,
    "failed readiness sends leave the delta available for retry"
  );
  assertEqual(payloads.length, 2, "only open-channel packets are serialized");
  assertEqual(
    deserializeKartRemoteInputDeltaPacket(payloads[1]).sequence,
    1,
    "serialized retried packet keeps the committed sequence"
  );
}

function validateRemoteInputDeltaApplication(): void {
  const initial = createInput({ throttle: 1, steer: -0.25 });
  const next = createInput({ throttle: 1, steer: 0.75, drift: true });
  const delta = createKartRemoteInputDeltaState(initial, next);
  const firstDelta = createKartRemoteInputDeltaState(
    null,
    createInput({ throttle: 1 })
  );
  const unchangedDelta = createKartRemoteInputDeltaState(initial, initial);
  const applied = applyKartRemoteInputDelta(initial, delta);

  assertEqual(delta.throttle, undefined, "unchanged throttle is excluded");
  assertEqual(delta.steer, 0.75, "changed steer is included");
  assertEqual(delta.drift, true, "changed drift is included");
  assertEqual(
    firstDelta.throttle,
    1,
    "null previous input is treated as neutral throttle"
  );
  assertEqual(
    firstDelta.brake,
    undefined,
    "null previous input does not force unchanged brake into the delta"
  );
  assert(
    hasKartRemoteInputDeltaStateChanges(firstDelta),
    "changed first input is detectable"
  );
  assert(
    !hasKartRemoteInputDeltaStateChanges(unchangedDelta),
    "unchanged input produces an empty delta"
  );
  assertEqual(applied.throttle, 1, "base throttle is preserved");
  assertEqual(applied.steer, 0.75, "steer delta is applied");
  assertEqual(applied.drift, true, "drift delta is applied");
}

function validateRemoteInputDeltaRejections(): void {
  assert(!isKartRemoteInputDeltaPacketPayload("{"), "invalid JSON is rejected");
  assertThrows(
    () => deserializeKartRemoteInputDeltaPacket(JSON.stringify({ type: "unknown" })),
    "wrong message shape is rejected"
  );
  assertThrows(
    () =>
      createKartRemoteInputDeltaPacket({
        peerId: "guest-peer",
        racerId: "human_guest-peer",
        sequence: -1,
        timestamp: 1,
        tickIndex: 1,
        elapsedSeconds: 1 / 60,
        delta: {}
      }),
    "negative sequence is rejected"
  );
  assertThrows(
    () =>
      createKartRemoteInputDeltaPacket({
        peerId: "guest-peer",
        racerId: "human_guest-peer",
        sequence: 0,
        timestamp: -1,
        tickIndex: 1,
        elapsedSeconds: 1 / 60,
        delta: {}
      }),
    "negative timestamp is rejected"
  );
  assertThrows(
    () =>
      createKartRemoteInputDeltaPacket({
        peerId: "guest-peer",
        racerId: "human_guest-peer",
        sequence: 0,
        timestamp: 1,
        sentAt: -1,
        tickIndex: 1,
        elapsedSeconds: 1 / 60,
        delta: {}
      }),
    "negative local send timestamp is rejected"
  );
}

function createInput(input: Partial<RacerInputState>): RacerInputState {
  return {
    throttle: input.throttle ?? 0,
    brake: input.brake ?? 0,
    steer: input.steer ?? 0,
    drift: input.drift ?? false,
    useItem: input.useItem ?? false
  };
}

function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}.`);
  }
}

function assertThrows(action: () => void, message: string): void {
  try {
    action();
  } catch {
    return;
  }

  throw new Error(message);
}

main();
