import { KeyboardKartInputState } from "../input/localKartInput";
import type { RacerInputState } from "../race/raceState";
import {
  INPUT_USE_ITEM_REPLAY_SNAPSHOT_COUNT,
  KART_GAMEPLAY_MESSAGE_TYPES,
  LocalKartInputSnapshotEmitter,
  RemoteKartInputSnapshotBuffer,
  createKartInputSnapshot,
  deserializeKartInputSnapshot,
  getKartGameplayPayloadType,
  isKartInputSnapshotPayload,
  serializeKartInputSnapshot,
  type KartInputSnapshot
} from "./kartInputSnapshot";

function main(): void {
  validateKeyboardSampling();
  validateSnapshotSerialization();
  validateLocalEmitterSequencesPerTick();
  validateLocalEmitterReplaysItemUsePulse();
  validateRemoteSnapshotBuffer();
}

function validateKeyboardSampling(): void {
  const input = new KeyboardKartInputState();

  input.press({ code: "KeyW" });
  input.press({ code: "ArrowRight" });
  input.press({ code: "Space" });

  const firstSample = input.sample();
  assertEqual(firstSample.throttle, 1, "W maps to throttle");
  assertEqual(firstSample.brake, 0, "brake remains released");
  assertEqual(firstSample.steer, 1, "right arrow maps to positive steer");
  assertEqual(firstSample.useItem, true, "space queues one item-use pulse");

  const secondSample = input.sample();
  assertEqual(secondSample.useItem, false, "item-use pulse is consumed after one tick");

  input.press({ code: "Space", repeat: true });
  assertEqual(
    input.sample().useItem,
    false,
    "held item key repeat does not queue extra pulses"
  );

  input.release({ code: "ArrowRight" });
  input.press({ code: "KeyA" });
  assertEqual(input.sample().steer, -1, "A maps to negative steer");

  input.reset();
  assertEqual(input.sample().throttle, 0, "reset clears pressed keys");
}

function validateSnapshotSerialization(): void {
  const snapshot = createKartInputSnapshot({
    peerId: "guest-peer",
    racerId: "human_guest-peer",
    sequence: 7,
    tickIndex: 42,
    elapsedSeconds: 0.7,
    capturedAt: 1234,
    sentAt: 1248,
    input: {
      throttle: 1.2,
      brake: -0.5,
      steer: -2,
      drift: true,
      useItem: false
    }
  });

  assertEqual(snapshot.type, KART_GAMEPLAY_MESSAGE_TYPES.INPUT_SNAPSHOT, "snapshot type");
  assertEqual(snapshot.input.throttle, 1, "throttle is clamped");
  assertEqual(snapshot.input.brake, 0, "brake is clamped");
  assertEqual(snapshot.input.steer, -1, "steer is clamped");

  const payload = serializeKartInputSnapshot(snapshot);
  const parsed = deserializeKartInputSnapshot(payload);

  assertEqual(parsed.peerId, snapshot.peerId, "peer id round trips");
  assertEqual(parsed.racerId, snapshot.racerId, "racer id round trips");
  assertEqual(parsed.sequence, snapshot.sequence, "sequence round trips");
  assertEqual(parsed.tickIndex, snapshot.tickIndex, "tick index round trips");
  assertEqual(parsed.capturedAt, 1234, "captured timestamp round trips");
  assertEqual(parsed.sentAt, 1248, "local send timestamp round trips");
  assertEqual(parsed.input.useItem, false, "input round trips");
  assert(isKartInputSnapshotPayload(payload), "valid payload is detected");
  assertEqual(
    getKartGameplayPayloadType(payload),
    KART_GAMEPLAY_MESSAGE_TYPES.INPUT_SNAPSHOT,
    "gameplay type peeking identifies input packets"
  );
  assert(!isKartInputSnapshotPayload("{"), "invalid JSON is rejected");
  assertThrows(
    () => deserializeKartInputSnapshot(JSON.stringify({ type: "unknown" })),
    "wrong message shape is rejected"
  );
}

function validateLocalEmitterSequencesPerTick(): void {
  const payloads: string[] = [];
  const snapshots: KartInputSnapshot[] = [];
  const emitter = new LocalKartInputSnapshotEmitter({
    peerId: "host-peer",
    racerId: "human_host-peer",
    now: () => 9001,
    send: (payload, snapshot) => {
      payloads.push(payload);
      snapshots.push(snapshot);
      return true;
    }
  });

  const first = emitter.emit(
    { tickIndex: 1, elapsedSeconds: 1 / 60 },
    {
      throttle: 1,
      brake: 0,
      steer: 0,
      drift: false,
      useItem: false
    }
  );
  const second = emitter.emit(
    { tickIndex: 2, elapsedSeconds: 2 / 60 },
    {
      throttle: 1,
      brake: 0,
      steer: 0.25,
      drift: true,
      useItem: true
    }
  );

  assert(first !== null, "first tick is emitted");
  assert(second !== null, "second tick is emitted");
  assertEqual(payloads.length, 2, "one payload is emitted per tick");
  assertEqual(snapshots[0]?.sequence, 0, "first sequence starts at zero");
  assertEqual(snapshots[1]?.sequence, 1, "second sequence increments");
  assertEqual(snapshots[1]?.tickIndex, 2, "tick index is preserved");
  assertEqual(
    deserializeKartInputSnapshot(payloads[1]).capturedAt,
    9001,
    "captured timestamp is included"
  );
  assertEqual(
    deserializeKartInputSnapshot(payloads[1]).sentAt,
    9001,
    "local send timestamp is included"
  );
}

function validateLocalEmitterReplaysItemUsePulse(): void {
  const snapshots: KartInputSnapshot[] = [];
  const emitter = new LocalKartInputSnapshotEmitter({
    peerId: "guest-peer",
    racerId: "human_guest-peer",
    now: () => 9100,
    send: (_payload, snapshot) => {
      snapshots.push(snapshot);
      return true;
    }
  });

  emitter.emit(
    { tickIndex: 1, elapsedSeconds: 1 / 60 },
    createInput({ useItem: true, steer: -0.5 })
  );

  for (let index = 0; index < INPUT_USE_ITEM_REPLAY_SNAPSHOT_COUNT; index += 1) {
    emitter.emit(
      { tickIndex: index + 2, elapsedSeconds: (index + 2) / 60 },
      createInput({ throttle: 1, useItem: false })
    );
  }

  const replayedSnapshots = snapshots.slice(0, INPUT_USE_ITEM_REPLAY_SNAPSHOT_COUNT);

  assertEqual(
    replayedSnapshots.length,
    INPUT_USE_ITEM_REPLAY_SNAPSHOT_COUNT,
    "item-use replay window emits expected snapshot count"
  );

  for (const snapshot of replayedSnapshots) {
    assert(snapshot.input.useItem, "item-use pulse is replayed for network delivery");
  }

  assertEqual(
    snapshots[INPUT_USE_ITEM_REPLAY_SNAPSHOT_COUNT]?.input.useItem,
    false,
    "item-use replay expires after the short reliability window"
  );
  assertEqual(
    snapshots[0]?.input.steer,
    -0.5,
    "item-use replay preserves first sampled steering"
  );
  assertEqual(
    snapshots[1]?.input.throttle,
    1,
    "item-use replay still carries latest throttle on later snapshots"
  );
}

function validateRemoteSnapshotBuffer(): void {
  const buffer = new RemoteKartInputSnapshotBuffer({
    expectedPeerId: "guest-peer",
    expectedRacerId: "human_guest-peer",
    maxBufferedSnapshots: 2,
    maxPayloadBytes: 1024
  });

  const snapshotOne = createSnapshot(1, 11, 0.25);
  const snapshotThree = createSnapshot(3, 13, -0.5);
  const snapshotTwo = createSnapshot(2, 12, 0.75);

  const acceptedOne = buffer.accept(serializeKartInputSnapshot(snapshotOne));
  const acceptedThree = buffer.accept(serializeKartInputSnapshot(snapshotThree));
  const acceptedTwo = buffer.accept(serializeKartInputSnapshot(snapshotTwo));

  assert(acceptedOne.accepted, "first remote snapshot is accepted");
  assert(acceptedThree.accepted, "out-of-order future snapshot is accepted");
  assert(acceptedTwo.accepted, "out-of-order gap snapshot is accepted");
  assertEqual(buffer.bufferedCount, 2, "buffer is capped to the latest packets");
  assertEqual(buffer.droppedCount, 1, "oldest buffered packet is dropped");
  assertEqual(
    acceptedTwo.droppedSnapshots[0]?.sequence,
    1,
    "buffer reports dropped snapshots"
  );

  const readySnapshots = buffer.drainReady(12);
  assertEqual(readySnapshots.length, 1, "drain only returns ready ticks");
  assertEqual(readySnapshots[0]?.sequence, 2, "ready snapshots are sequence ordered");
  assertEqual(buffer.bufferedCount, 1, "future tick remains buffered");

  const duplicate = buffer.accept(serializeKartInputSnapshot(snapshotTwo));
  assert(!duplicate.accepted, "drained duplicate snapshot is rejected");
  assertEqual(duplicate.reason, "stale-sequence", "drained sequence is stale");

  const latest = buffer.consumeLatestReady(99);
  assertEqual(latest?.sequence, 3, "latest ready packet is consumed");
  assertEqual(latest?.input.steer, -0.5, "consumed packet preserves input");
  assertEqual(buffer.bufferedCount, 0, "consume clears ready packets");

  const duplicatePendingBuffer = new RemoteKartInputSnapshotBuffer();
  const pendingPayload = serializeKartInputSnapshot(snapshotOne);
  assert(
    duplicatePendingBuffer.accept(pendingPayload).accepted,
    "pending duplicate setup snapshot is accepted"
  );
  const duplicatePending = duplicatePendingBuffer.accept(pendingPayload);
  assert(!duplicatePending.accepted, "pending duplicate snapshot is rejected");
  assertEqual(
    duplicatePending.reason,
    "duplicate-sequence",
    "pending duplicate reason is reported"
  );

  const wrongPeer = buffer.accept(
    serializeKartInputSnapshot({
      ...snapshotThree,
      peerId: "intruder-peer",
      sequence: 4
    })
  );
  assert(!wrongPeer.accepted, "unexpected peer is rejected");
  assertEqual(wrongPeer.reason, "unexpected-peer", "peer rejection reason");

  const wrongRacer = buffer.accept(
    serializeKartInputSnapshot({
      ...snapshotThree,
      racerId: "human_intruder-peer",
      sequence: 5
    })
  );
  assert(!wrongRacer.accepted, "unexpected racer is rejected");
  assertEqual(wrongRacer.reason, "unexpected-racer", "racer rejection reason");

  const nonString = buffer.accept(new ArrayBuffer(8));
  assert(!nonString.accepted, "binary packets are rejected");
  assertEqual(nonString.reason, "non-string-payload", "binary rejection reason");

  const tooLarge = new RemoteKartInputSnapshotBuffer({
    expectedPeerId: "guest-peer",
    expectedRacerId: "human_guest-peer",
    maxPayloadBytes: 8
  }).accept(serializeKartInputSnapshot(createSnapshot(6, 16, 0)));
  assert(!tooLarge.accepted, "oversized packets are rejected");
  assertEqual(tooLarge.reason, "payload-too-large", "size rejection reason");

  const invalidJson = buffer.accept("{");
  assert(!invalidJson.accepted, "malformed packets are rejected");
  assertEqual(invalidJson.reason, "invalid-payload", "invalid rejection reason");
}

function createSnapshot(
  sequence: number,
  tickIndex: number,
  steer: number
): KartInputSnapshot {
  return createKartInputSnapshot({
    peerId: "guest-peer",
    racerId: "human_guest-peer",
    sequence,
    tickIndex,
    elapsedSeconds: tickIndex / 60,
    capturedAt: 1000 + sequence,
    input: {
      throttle: 1,
      brake: 0,
      steer,
      drift: false,
      useItem: sequence % 2 === 0
    }
  });
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
