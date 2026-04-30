import type { RacerInputState } from "../race/raceState";
import type { RaceSession } from "../race/raceSession";
import type {
  KartInputSnapshot,
  RemoteKartInputSnapshotBuffer
} from "./kartInputSnapshot";
import type {
  KartRemoteInputDeltaPacket,
  RemoteKartInputDeltaQueue
} from "./remoteInputDelta";

export type RemoteKartInputApplySkipReason =
  | "no-buffer"
  | "no-ready-snapshot"
  | "local-loopback"
  | "unknown-racer"
  | "non-human-racer";

export type RemoteKartInputApplyResult =
  | {
      readonly applied: true;
      readonly snapshot: KartInputSnapshot;
      readonly appliedInput: RacerInputState;
      readonly drainedSnapshotCount: number;
    }
  | {
      readonly applied: false;
      readonly reason: RemoteKartInputApplySkipReason;
      readonly snapshot?: KartInputSnapshot;
      readonly drainedSnapshotCount: number;
    };

export interface RemoteKartInputApplyOptions {
  readonly raceSession: Pick<
    RaceSession,
    "createRacerTargetRegistry" | "setHumanInput"
  >;
  readonly buffer: RemoteKartInputSnapshotBuffer | null | undefined;
  readonly localPeerId: string | null;
  readonly maxTickIndex?: number;
}

export type RemoteKartInputDeltaApplySkipReason =
  | "no-queue"
  | "no-ready-delta"
  | "local-loopback"
  | "unknown-racer"
  | "non-human-racer";

export type RemoteKartInputDeltaApplyResult =
  | {
      readonly applied: true;
      readonly latestPacket: KartRemoteInputDeltaPacket | null;
      readonly appliedInput: RacerInputState;
      readonly drainedDeltaCount: number;
    }
  | {
      readonly applied: false;
      readonly reason: RemoteKartInputDeltaApplySkipReason;
      readonly latestPacket?: KartRemoteInputDeltaPacket | null;
      readonly drainedDeltaCount: number;
    };

export interface RemoteKartInputDeltaApplyOptions {
  readonly raceSession: Pick<
    RaceSession,
    "createRacerTargetRegistry" | "setHumanInput"
  >;
  readonly queue: RemoteKartInputDeltaQueue | null | undefined;
  readonly localPeerId: string | null;
  readonly maxTickIndex?: number;
}

export function applyLatestReadyRemoteKartInput(
  options: RemoteKartInputApplyOptions
): RemoteKartInputApplyResult {
  if (options.buffer === null || options.buffer === undefined) {
    return {
      applied: false,
      reason: "no-buffer",
      drainedSnapshotCount: 0
    };
  }

  const readySnapshots = options.buffer.drainReady(options.maxTickIndex);
  const latestSnapshot = readySnapshots[readySnapshots.length - 1];

  if (latestSnapshot === undefined) {
    return {
      applied: false,
      reason: "no-ready-snapshot",
      drainedSnapshotCount: 0
    };
  }

  if (
    options.localPeerId !== null &&
    latestSnapshot.peerId === options.localPeerId
  ) {
    return {
      applied: false,
      reason: "local-loopback",
      snapshot: latestSnapshot,
      drainedSnapshotCount: readySnapshots.length
    };
  }

  const target = options.raceSession
    .createRacerTargetRegistry({ localPeerId: options.localPeerId })
    .getTargetByStableId(latestSnapshot.racerId);

  if (target === undefined) {
    return {
      applied: false,
      reason: "unknown-racer",
      snapshot: latestSnapshot,
      drainedSnapshotCount: readySnapshots.length
    };
  }

  if (!target.eligibility.canAcceptRemoteInput) {
    return {
      applied: false,
      reason: "non-human-racer",
      snapshot: latestSnapshot,
      drainedSnapshotCount: readySnapshots.length
    };
  }

  const appliedInput = mergeReadyRemoteInputs(readySnapshots);
  options.raceSession.setHumanInput(latestSnapshot.racerId, appliedInput);

  return {
    applied: true,
    snapshot: latestSnapshot,
    appliedInput,
    drainedSnapshotCount: readySnapshots.length
  };
}

export function applyReadyRemoteKartInputDeltas(
  options: RemoteKartInputDeltaApplyOptions
): RemoteKartInputDeltaApplyResult {
  if (options.queue === null || options.queue === undefined) {
    return {
      applied: false,
      reason: "no-queue",
      drainedDeltaCount: 0
    };
  }

  if (
    options.localPeerId !== null &&
    options.queue.peerId === options.localPeerId
  ) {
    return {
      applied: false,
      reason: "local-loopback",
      drainedDeltaCount: 0
    };
  }

  const target = options.raceSession
    .createRacerTargetRegistry({ localPeerId: options.localPeerId })
    .getTargetByStableId(options.queue.racerId);

  if (target === undefined) {
    return {
      applied: false,
      reason: "unknown-racer",
      drainedDeltaCount: 0
    };
  }

  if (!target.eligibility.canAcceptRemoteInput) {
    return {
      applied: false,
      reason: "non-human-racer",
      drainedDeltaCount: 0
    };
  }

  const drain = options.queue.drainReady(options.maxTickIndex);

  if (drain.appliedInput === null) {
    return {
      applied: false,
      reason: "no-ready-delta",
      latestPacket: drain.latestPacket,
      drainedDeltaCount: drain.drainedDeltaCount
    };
  }

  options.raceSession.setHumanInput(options.queue.racerId, drain.appliedInput);

  return {
    applied: true,
    latestPacket: drain.latestPacket,
    appliedInput: drain.appliedInput,
    drainedDeltaCount: drain.drainedDeltaCount
  };
}

function mergeReadyRemoteInputs(
  snapshots: readonly KartInputSnapshot[]
): RacerInputState {
  const latestSnapshot = snapshots[snapshots.length - 1];

  if (latestSnapshot === undefined) {
    throw new Error("Cannot merge an empty remote input snapshot set.");
  }

  return {
    ...latestSnapshot.input,
    useItem: snapshots.some((snapshot) => snapshot.input.useItem)
  };
}
