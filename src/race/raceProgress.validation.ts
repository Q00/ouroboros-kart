import type { Vector3 } from "../config/aiRacers";
import {
  DEFAULT_TRACK_DEFINITION,
  RACE_LAP_COUNT,
  type TrackLapMarker
} from "../config/tracks";
import {
  RACER_COLLISION_RADIUS,
  createRaceSessionFromStartRoster,
  debugAdvanceRacerProgress,
  type RaceRankingEntry,
  type RaceSessionRacerState
} from "./raceSession";
import {
  createRacerProgressState,
  createInitialRacerProgressState,
  type RacerProgressState,
  type RacePhase
} from "./raceState";
import { createRaceStartRoster } from "./raceStartRoster";

interface ValidLapSequenceValidationResult {
  readonly completedLaps: number;
  readonly checkpointCount: number;
  readonly finalLap: number;
  readonly finalCheckpointIndex: number;
  readonly finished: boolean;
}

interface SkippedCheckpointValidationResult {
  readonly attemptedMarkerOrder: number;
  readonly lap: number;
  readonly checkpointIndex: number;
  readonly trackProgress: number;
}

interface ReverseCrossingValidationResult {
  readonly forwardLap: number;
  readonly reverseLap: number;
  readonly reverseCheckpointIndex: number;
  readonly reverseFinished: boolean;
}

interface LiveRaceRankingValidationResult {
  readonly rankingSignature: string;
  readonly leadLap: number;
  readonly leadTrackProgress: number;
  readonly lastPlaceLap: number;
}

interface IndependentRacerCheckpointValidationResult {
  readonly hostCheckpointIndex: number;
  readonly guestCheckpointIndex: number;
  readonly firstAiCheckpointIndex: number;
  readonly secondAiCheckpointIndex: number;
}

interface StartLineExactOnceValidationResult {
  readonly hostLapAfterCrossing: number;
  readonly hostLapAfterRepeat: number;
  readonly guestLapAfterRepeat: number;
  readonly firstAiLapAfterRepeat: number;
  readonly secondAiLapAfterRepeat: number;
}

interface FinalLapFinishTransitionValidationResult {
  readonly finalLapPhase: RacePhase;
  readonly finalLapCurrentLap: number;
  readonly finalLapFinished: boolean;
  readonly finishPhase: RacePhase;
  readonly finishOrderSignature: string;
  readonly finalRankingSignature: string;
  readonly finishTimesSignature: string;
  readonly activeBananasBeforeFinish: number;
  readonly activeBananasAfterFinish: number;
  readonly activeBananaEntitiesAfterFinish: number;
  readonly finishBananaRemovalReason: string;
}

interface RaceResetBananaHazardValidationResult {
  readonly activeBananasBeforeReset: number;
  readonly activeBananaEntitiesBeforeReset: number;
  readonly resetBananaRemovalCount: number;
  readonly activeBananasAfterReset: number;
  readonly activeBananaEntitiesAfterReset: number;
  readonly totalBananaEntitiesAfterReset: number;
  readonly resetBananaRemovalReason: string;
  readonly secondResetBananaRemovalCount: number;
}

interface RaceProgressValidationResult {
  readonly validLapSequence: ValidLapSequenceValidationResult;
  readonly skippedCheckpoint: SkippedCheckpointValidationResult;
  readonly reverseCrossing: ReverseCrossingValidationResult;
  readonly liveRaceRanking: LiveRaceRankingValidationResult;
  readonly independentRacers: IndependentRacerCheckpointValidationResult;
  readonly startLineExactOnce: StartLineExactOnceValidationResult;
  readonly finalLapFinishTransitions: FinalLapFinishTransitionValidationResult;
  readonly raceResetBananaHazards: RaceResetBananaHazardValidationResult;
}

function main(): void {
  const result = validateRaceProgressCheckpointRules();

  console.info(
    [
      "raceProgress=ok",
      `completedLaps=${result.validLapSequence.completedLaps}`,
      `checkpoints=${result.validLapSequence.checkpointCount}`,
      `finalLap=${result.validLapSequence.finalLap}`,
      `finalCheckpoint=${result.validLapSequence.finalCheckpointIndex}`,
      `finished=${result.validLapSequence.finished}`,
      `skippedAttempt=${result.skippedCheckpoint.attemptedMarkerOrder}`,
      `skippedCheckpoint=${result.skippedCheckpoint.checkpointIndex}`,
      `skippedProgress=${result.skippedCheckpoint.trackProgress.toFixed(3)}`,
      `reverseLap=${result.reverseCrossing.reverseLap}`,
      `reverseCheckpoint=${result.reverseCrossing.reverseCheckpointIndex}`,
      `reverseFinished=${result.reverseCrossing.reverseFinished}`,
      `forwardLap=${result.reverseCrossing.forwardLap}`,
      `liveRanking=${result.liveRaceRanking.rankingSignature}`,
      `leadLap=${result.liveRaceRanking.leadLap}`,
      `leadProgress=${result.liveRaceRanking.leadTrackProgress.toFixed(1)}`,
      `lastPlaceLap=${result.liveRaceRanking.lastPlaceLap}`,
      `repeatStartLineLaps=${
        result.startLineExactOnce.hostLapAfterRepeat
      },${result.startLineExactOnce.guestLapAfterRepeat},${
        result.startLineExactOnce.firstAiLapAfterRepeat
      },${result.startLineExactOnce.secondAiLapAfterRepeat}`,
      `finalLapPhase=${result.finalLapFinishTransitions.finalLapPhase}`,
      `finalLapCurrent=${result.finalLapFinishTransitions.finalLapCurrentLap}`,
      `finishPhase=${result.finalLapFinishTransitions.finishPhase}`,
      `finishOrder=${result.finalLapFinishTransitions.finishOrderSignature}`,
      `finalRanking=${result.finalLapFinishTransitions.finalRankingSignature}`,
      `finishTimes=${result.finalLapFinishTransitions.finishTimesSignature}`,
      `finishBananas=${result.finalLapFinishTransitions.activeBananasBeforeFinish}->${result.finalLapFinishTransitions.activeBananasAfterFinish}`,
      `finishBananaEntities=${result.finalLapFinishTransitions.activeBananaEntitiesAfterFinish}`,
      `finishBananaReason=${result.finalLapFinishTransitions.finishBananaRemovalReason}`,
      `resetBananas=${result.raceResetBananaHazards.activeBananasBeforeReset}->${result.raceResetBananaHazards.activeBananasAfterReset}`,
      `resetBananaEntities=${result.raceResetBananaHazards.activeBananaEntitiesBeforeReset}->${result.raceResetBananaHazards.activeBananaEntitiesAfterReset}`,
      `resetBananaTotalEntities=${result.raceResetBananaHazards.totalBananaEntitiesAfterReset}`,
      `resetBananaRemovals=${result.raceResetBananaHazards.resetBananaRemovalCount}`,
      `resetBananaReason=${result.raceResetBananaHazards.resetBananaRemovalReason}`,
      `multiRacerCheckpoints=${
        result.independentRacers.hostCheckpointIndex
      },${result.independentRacers.guestCheckpointIndex},${
        result.independentRacers.firstAiCheckpointIndex
      },${result.independentRacers.secondAiCheckpointIndex}`
    ].join(" ")
  );
}

function validateRaceProgressCheckpointRules(): RaceProgressValidationResult {
  const validLapSequence = validateValidLapSequence();
  const skippedCheckpoint = validateSkippedCheckpointDoesNotAdvance();
  const reverseCrossing = validateReverseStartFinishCrossingDoesNotLap();
  const liveRaceRanking = validateLiveRaceRankingUsesLapAndTrackProgress();
  const independentRacers = validateIndependentMultiRacerCheckpointState();
  const startLineExactOnce =
    validateStartLineCrossingIncrementsEachRacerExactlyOnce();
  const finalLapFinishTransitions = validateFinalLapAndFinishTransitions();
  const raceResetBananaHazards = validateRaceResetClearsBananaHazards();

  return {
    validLapSequence,
    skippedCheckpoint,
    reverseCrossing,
    liveRaceRanking,
    independentRacers,
    startLineExactOnce,
    finalLapFinishTransitions,
    raceResetBananaHazards
  };
}

function validateValidLapSequence(): ValidLapSequenceValidationResult {
  const markers = getLapMarkers();
  let progress = createInitialRacerProgressState();

  for (let lap = 1; lap <= RACE_LAP_COUNT; lap += 1) {
    for (let order = 1; order < markers.length; order += 1) {
      progress = advanceBetweenMarkers(progress, order - 1, order);

      assertEqual(progress.lap, lap - 1, `lap ${lap} checkpoint ${order} lap`);
      assertEqual(
        progress.checkpointIndex,
        order,
        `lap ${lap} checkpoint ${order} order`
      );
      assertEqual(
        progress.finished,
        false,
        `lap ${lap} checkpoint ${order} finish state`
      );
    }

    progress = advanceBetweenMarkers(progress, markers.length - 1, 0);

    assertEqual(progress.lap, lap, `lap ${lap} start/finish lap`);
    assertEqual(
      progress.checkpointIndex,
      0,
      `lap ${lap} start/finish checkpoint`
    );
    assertEqual(
      progress.finished,
      lap === RACE_LAP_COUNT,
      `lap ${lap} start/finish finish state`
    );
  }

  assertEqual(progress.lap, RACE_LAP_COUNT, "final completed lap count");
  assertEqual(progress.checkpointIndex, 0, "final checkpoint index");
  assertEqual(progress.finished, true, "final finish state");

  return {
    completedLaps: RACE_LAP_COUNT,
    checkpointCount: markers.length,
    finalLap: progress.lap,
    finalCheckpointIndex: progress.checkpointIndex,
    finished: progress.finished
  };
}

function validateSkippedCheckpointDoesNotAdvance(): SkippedCheckpointValidationResult {
  const skippedMarkerOrder = 3;
  const progress = advanceBetweenMarkers(
    createInitialRacerProgressState(),
    0,
    skippedMarkerOrder
  );

  assertEqual(progress.lap, 0, "skipped checkpoint lap");
  assertEqual(progress.checkpointIndex, 0, "skipped checkpoint index");
  assertAlmostEqual(progress.trackProgress, 0, "skipped checkpoint progress");
  assertEqual(progress.finished, false, "skipped checkpoint finish state");

  return {
    attemptedMarkerOrder: skippedMarkerOrder,
    lap: progress.lap,
    checkpointIndex: progress.checkpointIndex,
    trackProgress: progress.trackProgress
  };
}

function validateReverseStartFinishCrossingDoesNotLap(): ReverseCrossingValidationResult {
  const markers = getLapMarkers();
  const startFinish = getMarker(0);
  const finalMarker = getMarker(markers.length - 1);
  const crossing = createStartFinishCrossingPositions(finalMarker, startFinish);
  const beforeReverseProgress: RacerProgressState = createRacerProgressState({
    lap: 0,
    checkpointIndex: finalMarker.order,
    trackProgress: finalMarker.trackProgress,
    finished: false
  });
  const forwardProgress = debugAdvanceRacerProgress({
    progress: beforeReverseProgress,
    previousPosition: crossing.beforeStartFinish,
    currentPosition: crossing.afterStartFinish,
    collisionRadius: RACER_COLLISION_RADIUS
  });
  const reverseProgress = debugAdvanceRacerProgress({
    progress: beforeReverseProgress,
    previousPosition: crossing.afterStartFinish,
    currentPosition: crossing.beforeStartFinish,
    collisionRadius: RACER_COLLISION_RADIUS
  });

  assertEqual(forwardProgress.lap, 1, "forward start/finish crossing lap");
  assertEqual(
    reverseProgress.lap,
    beforeReverseProgress.lap,
    "reverse start/finish crossing lap"
  );
  assertEqual(
    reverseProgress.checkpointIndex,
    finalMarker.order,
    "reverse start/finish checkpoint"
  );
  assertEqual(
    reverseProgress.finished,
    false,
    "reverse start/finish finish state"
  );

  return {
    forwardLap: forwardProgress.lap,
    reverseLap: reverseProgress.lap,
    reverseCheckpointIndex: reverseProgress.checkpointIndex,
    reverseFinished: reverseProgress.finished
  };
}

function validateLiveRaceRankingUsesLapAndTrackProgress(): LiveRaceRankingValidationResult {
  const session = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: "host-peer",
        displayName: "Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: "guest-peer",
        displayName: "Guest",
        slotIndex: 1
      }
    ]),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const host = requireRacer(session.getRacerStateBySlot(0), "ranking host");
  const guest = requireRacer(session.getRacerStateBySlot(1), "ranking guest");
  const firstAi = requireRacer(
    session.getRacerStateBySlot(2),
    "ranking first AI"
  );
  const secondAi = requireRacer(
    session.getRacerStateBySlot(3),
    "ranking second AI"
  );
  const trackLength = DEFAULT_TRACK_DEFINITION.road.totalLength;

  host.progress = createRacerProgressState(
    {
      lap: 1,
      checkpointIndex: 1,
      trackProgress: 20,
      finished: false
    },
    { lapCount: RACE_LAP_COUNT, trackLength }
  );
  guest.progress = createRacerProgressState(
    {
      lap: 2,
      checkpointIndex: 1,
      trackProgress: 10,
      finished: false
    },
    { lapCount: RACE_LAP_COUNT, trackLength }
  );
  firstAi.progress = createRacerProgressState(
    {
      lap: 1,
      checkpointIndex: 2,
      trackProgress: 60,
      finished: false
    },
    { lapCount: RACE_LAP_COUNT, trackLength }
  );
  secondAi.progress = createRacerProgressState(
    {
      lap: 0,
      checkpointIndex: 3,
      trackProgress: 95,
      finished: false
    },
    { lapCount: RACE_LAP_COUNT, trackLength }
  );

  const tickResult = session.tick(0);
  const rankingSignature = createRankingSignature(session.raceRankings);
  const progressRankSignature = createRankingSignature(
    tickResult.raceProgress
      .slice()
      .sort((left, right) => left.rank - right.rank)
      .map((progress) => ({
        slotIndex: progress.slotIndex,
        rank: progress.rank
      }))
  );

  assertEqual(
    rankingSignature,
    "1:1,2:2,0:3,3:4",
    "live ranking by lap and track progress"
  );
  assertEqual(
    progressRankSignature,
    rankingSignature,
    "race progress snapshots expose live ranking"
  );

  const leader = requireRankingAt(session.raceRankings, 0);
  const lastPlace = requireRankingAt(session.raceRankings, 3);

  return {
    rankingSignature,
    leadLap: leader.lap,
    leadTrackProgress: leader.trackProgress,
    lastPlaceLap: lastPlace.lap
  };
}

function validateIndependentMultiRacerCheckpointState(): IndependentRacerCheckpointValidationResult {
  const session = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: "host-peer",
        displayName: "Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: "guest-peer",
        displayName: "Guest",
        slotIndex: 1
      }
    ]),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const host = requireRacer(session.getRacerStateBySlot(0), "host racer");
  const guest = requireRacer(session.getRacerStateBySlot(1), "guest racer");
  const firstAi = requireRacer(session.getRacerStateBySlot(2), "first AI racer");
  const secondAi = requireRacer(
    session.getRacerStateBySlot(3),
    "second AI racer"
  );

  host.progress = advanceBetweenMarkers(host.progress, 0, 1);
  guest.progress = advanceBetweenMarkers(guest.progress, 0, 3);
  firstAi.progress = advanceBetweenMarkers(firstAi.progress, 0, 1);
  firstAi.progress = advanceBetweenMarkers(firstAi.progress, 1, 2);

  assertEqual(host.progress.checkpointIndex, 1, "host checkpoint advances");
  assertEqual(
    guest.progress.checkpointIndex,
    0,
    "guest skipped checkpoint remains gated"
  );
  assertEqual(firstAi.progress.checkpointIndex, 2, "first AI checkpoint");
  assertEqual(secondAi.progress.checkpointIndex, 0, "second AI checkpoint");

  host.progress = advanceBetweenMarkers(host.progress, 1, 2);

  assertEqual(host.progress.checkpointIndex, 2, "host second checkpoint");
  assertEqual(
    guest.progress.checkpointIndex,
    0,
    "guest checkpoint remains independent"
  );
  assertEqual(
    firstAi.progress.checkpointIndex,
    2,
    "first AI checkpoint remains independent"
  );
  assertEqual(
    secondAi.progress.checkpointIndex,
    0,
    "second AI checkpoint remains independent"
  );

  return {
    hostCheckpointIndex: host.progress.checkpointIndex,
    guestCheckpointIndex: guest.progress.checkpointIndex,
    firstAiCheckpointIndex: firstAi.progress.checkpointIndex,
    secondAiCheckpointIndex: secondAi.progress.checkpointIndex
  };
}

function validateStartLineCrossingIncrementsEachRacerExactlyOnce(): StartLineExactOnceValidationResult {
  const session = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: "host-peer",
        displayName: "Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: "guest-peer",
        displayName: "Guest",
        slotIndex: 1
      }
    ]),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const host = requireRacer(session.getRacerStateBySlot(0), "host racer");
  const guest = requireRacer(session.getRacerStateBySlot(1), "guest racer");
  const firstAi = requireRacer(session.getRacerStateBySlot(2), "first AI racer");
  const secondAi = requireRacer(
    session.getRacerStateBySlot(3),
    "second AI racer"
  );
  const crossing = createStartFinishCrossingPositions(
    getMarker(getLapMarkers().length - 1),
    getMarker(0)
  );
  const repeatedResults = [host, guest, firstAi, secondAi].map((racer) =>
    completeStartLineCrossingAndRepeat(racer, crossing)
  );

  assertEqual(
    repeatedResults[0]?.lapAfterFirstCrossing,
    1,
    "host first start-line crossing"
  );

  for (const result of repeatedResults) {
    assertEqual(
      result.lapAfterRepeat,
      1,
      `${result.racerId} repeated start-line crossing`
    );
    assertEqual(
      result.finishedAfterRepeat,
      false,
      `${result.racerId} repeated start-line finish state`
    );
  }

  return {
    hostLapAfterCrossing: repeatedResults[0]?.lapAfterFirstCrossing ?? -1,
    hostLapAfterRepeat: repeatedResults[0]?.lapAfterRepeat ?? -1,
    guestLapAfterRepeat: repeatedResults[1]?.lapAfterRepeat ?? -1,
    firstAiLapAfterRepeat: repeatedResults[2]?.lapAfterRepeat ?? -1,
    secondAiLapAfterRepeat: repeatedResults[3]?.lapAfterRepeat ?? -1
  };
}

function validateFinalLapAndFinishTransitions(): FinalLapFinishTransitionValidationResult {
  const session = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: "host-peer",
        displayName: "Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: "guest-peer",
        displayName: "Guest",
        slotIndex: 1
      }
    ]),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const finalLapRacer = requireRacer(
    session.getRacerStateBySlot(0),
    "final-lap racer"
  );
  const firstCheckpoint = getMarker(1);

  finalLapRacer.progress = createRacerProgressState(
    {
      lap: RACE_LAP_COUNT - 1,
      checkpointIndex: firstCheckpoint.order,
      trackProgress: firstCheckpoint.trackProgress,
      finished: false
    },
    {
      lapCount: RACE_LAP_COUNT,
      trackLength: DEFAULT_TRACK_DEFINITION.road.totalLength
    }
  );
  session.tick(0);

  assertEqual(session.phase, "final-lap", "final-lap race phase");
  assertEqual(
    finalLapRacer.progress.currentLap,
    RACE_LAP_COUNT,
    "final-lap display lap"
  );
  assertEqual(
    finalLapRacer.progress.finished,
    false,
    "final-lap racer remains unfinished"
  );
  assertEqual(
    finalLapRacer.finishPlace,
    null,
    "final-lap racer has no finish place"
  );
  assertEqual(
    finalLapRacer.finishTimeSeconds,
    null,
    "final-lap racer has no finish time"
  );

  finalLapRacer.heldItem = "banana";
  session.setHumanInput(finalLapRacer.id, { useItem: true });
  session.tick(0);

  const activeBananaBeforeFinish = session.bananaObstacleStates[0];

  if (activeBananaBeforeFinish === undefined) {
    throw new Error("Expected active banana before race finish transition.");
  }

  assertEqual(
    session.bananaObstacleStates.length,
    1,
    "active banana count before finish transition"
  );
  assertEqual(
    session.activeBananaHazardEntityStates.length,
    1,
    "active banana hazard entity count before finish transition"
  );

  const finishSchedule = [
    { slotIndex: 1, finishTimeSeconds: 0.01 },
    { slotIndex: 3, finishTimeSeconds: 0.02 },
    { slotIndex: 0, finishTimeSeconds: 0.03 },
    { slotIndex: 2, finishTimeSeconds: 0.04 }
  ] as const;

  for (const finish of finishSchedule) {
    const racer = requireRacer(
      session.getRacerStateBySlot(finish.slotIndex),
      `finish-order racer slot ${finish.slotIndex}`
    );

    racer.progress = createRacerProgressState(
      {
        lap: RACE_LAP_COUNT,
        checkpointIndex: 0,
        trackProgress: 0,
        finished: true
      },
      {
        lapCount: RACE_LAP_COUNT,
        trackLength: DEFAULT_TRACK_DEFINITION.road.totalLength
      }
    );
    racer.pendingFinishTimeSeconds = finish.finishTimeSeconds;
  }

  const finishTickResult = session.tick(1 / 15);
  const finishBananaRemoval = finishTickResult.bananaRemovals.find(
    (removal) => removal.bananaId === activeBananaBeforeFinish.id
  );

  if (finishBananaRemoval === undefined) {
    throw new Error("Expected banana removal event on race finish transition.");
  }

  const inactiveBananaEntity = session.bananaHazardEntityStates.find(
    (entity) => entity.id === activeBananaBeforeFinish.id
  );

  if (inactiveBananaEntity === undefined) {
    throw new Error("Expected banana hazard entity to remain after finish cleanup.");
  }

  const finishOrder: string[] = [];
  const finishTimes: string[] = [];
  const finalRankingSignature = createRankingSignature(session.raceRankings);

  assertEqual(
    finalRankingSignature,
    "1:1,3:2,0:3,2:4",
    "final results ranking follows finish order"
  );

  for (let index = 0; index < finishSchedule.length; index += 1) {
    const finish = finishSchedule[index];

    if (finish === undefined) {
      throw new Error(`Missing finish schedule entry at ${index}.`);
    }

    const racer = requireRacer(
      session.getRacerStateBySlot(finish.slotIndex),
      `placed racer slot ${finish.slotIndex}`
    );
    const expectedPlace = index + 1;

    assertEqual(
      racer.finishPlace,
      expectedPlace,
      `slot ${finish.slotIndex} finish place`
    );
    assertAlmostEqual(
      racer.finishTimeSeconds ?? -1,
      finish.finishTimeSeconds,
      `slot ${finish.slotIndex} finish time`
    );

    finishOrder.push(`${finish.slotIndex}:${racer.finishPlace ?? -1}`);
    finishTimes.push(
      `${finish.slotIndex}:${(racer.finishTimeSeconds ?? -1).toFixed(2)}`
    );
  }

  assertEqual(session.phase, "finished", "finished race phase");
  assertEqual(
    session.bananaObstacleStates.length,
    0,
    "race finish clears active banana obstacles"
  );
  assertEqual(
    session.activeBananaHazardEntityStates.length,
    0,
    "race finish clears active banana hazard entities"
  );
  assertEqual(
    inactiveBananaEntity.active,
    false,
    "race finish deactivates banana hazard entity"
  );
  assertEqual(
    inactiveBananaEntity.deactivationReason,
    "race-finished",
    "race finish banana deactivation reason"
  );
  assertEqual(
    finishBananaRemoval.reason,
    "race-finished",
    "race finish banana removal reason"
  );

  return {
    finalLapPhase: "final-lap",
    finalLapCurrentLap: finalLapRacer.progress.currentLap,
    finalLapFinished: finalLapRacer.progress.finished,
    finishPhase: session.phase,
    finishOrderSignature: finishOrder.join(","),
    finalRankingSignature,
    finishTimesSignature: finishTimes.join(","),
    activeBananasBeforeFinish: 1,
    activeBananasAfterFinish: session.bananaObstacleStates.length,
    activeBananaEntitiesAfterFinish:
      session.activeBananaHazardEntityStates.length,
    finishBananaRemovalReason: finishBananaRemoval.reason
  };
}

function validateRaceResetClearsBananaHazards():
  RaceResetBananaHazardValidationResult {
  const session = createRaceSessionFromStartRoster(
    createRaceStartRoster([
      {
        peerId: "host-peer",
        displayName: "Host",
        slotIndex: 0,
        isHost: true
      },
      {
        peerId: "guest-peer",
        displayName: "Guest",
        slotIndex: 1
      }
    ]),
    {
      obstacles: [],
      itemPickups: []
    }
  );
  const resetRacer = requireRacer(
    session.getRacerStateBySlot(0),
    "reset banana racer"
  );

  resetRacer.heldItem = "banana";
  session.setHumanInput(resetRacer.id, { useItem: true });
  session.tick(0);

  const activeBananaBeforeReset = session.bananaObstacleStates[0];

  if (activeBananaBeforeReset === undefined) {
    throw new Error("Expected active banana before race reset cleanup.");
  }

  assertEqual(
    session.bananaObstacleStates.length,
    1,
    "active banana count before race reset cleanup"
  );
  assertEqual(
    session.activeBananaHazardEntityStates.length,
    1,
    "active banana hazard entity count before race reset cleanup"
  );

  const resetBananaRemovals = session.clearActiveBananaHazardsForRaceReset();
  const resetBananaRemoval = resetBananaRemovals[0];

  if (resetBananaRemoval === undefined) {
    throw new Error("Expected banana removal event during race reset cleanup.");
  }

  assertEqual(
    resetBananaRemoval.bananaId,
    activeBananaBeforeReset.id,
    "race reset banana removal id"
  );
  assertEqual(
    resetBananaRemoval.reason,
    "race-reset",
    "race reset banana removal reason"
  );
  assertEqual(
    session.bananaObstacleStates.length,
    0,
    "race reset clears active banana obstacles"
  );
  assertEqual(
    session.activeBananaHazardEntityStates.length,
    0,
    "race reset clears active banana hazard entities"
  );
  assertEqual(
    session.bananaHazardEntityStates.length,
    0,
    "race reset clears stored banana hazard entities"
  );

  const secondResetBananaRemovals =
    session.clearActiveBananaHazardsForRaceReset();

  assertEqual(
    secondResetBananaRemovals.length,
    0,
    "race reset banana cleanup is idempotent"
  );

  return {
    activeBananasBeforeReset: 1,
    activeBananaEntitiesBeforeReset: 1,
    resetBananaRemovalCount: resetBananaRemovals.length,
    activeBananasAfterReset: session.bananaObstacleStates.length,
    activeBananaEntitiesAfterReset:
      session.activeBananaHazardEntityStates.length,
    totalBananaEntitiesAfterReset: session.bananaHazardEntityStates.length,
    resetBananaRemovalReason: resetBananaRemoval.reason,
    secondResetBananaRemovalCount: secondResetBananaRemovals.length
  };
}

function completeStartLineCrossingAndRepeat(
  racer: RaceSessionRacerState,
  crossing: ReturnType<typeof createStartFinishCrossingPositions>
): {
  readonly racerId: string;
  readonly lapAfterFirstCrossing: number;
  readonly lapAfterRepeat: number;
  readonly finishedAfterRepeat: boolean;
} {
  const finalMarker = getMarker(getLapMarkers().length - 1);
  const beforeCrossingProgress = createRacerProgressState({
    lap: 0,
    checkpointIndex: finalMarker.order,
    trackProgress: finalMarker.trackProgress,
    finished: false
  });
  const afterFirstCrossing = debugAdvanceRacerProgress({
    progress: beforeCrossingProgress,
    previousPosition: crossing.beforeStartFinish,
    currentPosition: crossing.afterStartFinish,
    collisionRadius: RACER_COLLISION_RADIUS
  });
  const afterRepeatCrossing = debugAdvanceRacerProgress({
    progress: afterFirstCrossing,
    previousPosition: crossing.afterStartFinish,
    currentPosition: crossing.afterStartFinish,
    collisionRadius: RACER_COLLISION_RADIUS
  });

  racer.progress = afterRepeatCrossing;

  return {
    racerId: racer.id,
    lapAfterFirstCrossing: afterFirstCrossing.lap,
    lapAfterRepeat: afterRepeatCrossing.lap,
    finishedAfterRepeat: afterRepeatCrossing.finished
  };
}

function advanceBetweenMarkers(
  progress: RacerProgressState,
  fromOrder: number,
  toOrder: number
): RacerProgressState {
  return debugAdvanceRacerProgress({
    progress,
    previousPosition: getMarker(fromOrder).position,
    currentPosition: getMarker(toOrder).position,
    collisionRadius: RACER_COLLISION_RADIUS
  });
}

function createStartFinishCrossingPositions(
  finalMarker: TrackLapMarker,
  startFinish: TrackLapMarker
): {
  readonly beforeStartFinish: Vector3;
  readonly afterStartFinish: Vector3;
} {
  const forward = normalizePlanarVector(
    startFinish.position.x - finalMarker.position.x,
    startFinish.position.z - finalMarker.position.z
  );
  const reachDistance =
    startFinish.triggerZone.radius + RACER_COLLISION_RADIUS + 2;

  return {
    beforeStartFinish: offsetPlanarPosition(
      startFinish.position,
      forward,
      -reachDistance
    ),
    afterStartFinish: offsetPlanarPosition(
      startFinish.position,
      forward,
      reachDistance
    )
  };
}

function offsetPlanarPosition(
  position: Vector3,
  direction: Pick<Vector3, "x" | "z">,
  distance: number
): Vector3 {
  return {
    x: position.x + direction.x * distance,
    y: position.y,
    z: position.z + direction.z * distance
  };
}

function normalizePlanarVector(x: number, z: number): Vector3 {
  const length = Math.hypot(x, z);

  if (length <= Number.EPSILON) {
    throw new Error("Cannot normalize zero-length race progress vector.");
  }

  return {
    x: x / length,
    y: 0,
    z: z / length
  };
}

function getLapMarkers(): readonly TrackLapMarker[] {
  const markers = DEFAULT_TRACK_DEFINITION.lapMarkers;

  assertGreaterThan(markers.length, 1, "lap marker count");

  return markers;
}

function getMarker(order: number): TrackLapMarker {
  const marker = getLapMarkers().find((candidate) => candidate.order === order);

  if (marker === undefined) {
    throw new Error(`Missing lap marker at order ${order}.`);
  }

  return marker;
}

function requireRacer(
  racer: RaceSessionRacerState | undefined,
  label: string
): RaceSessionRacerState {
  if (racer === undefined) {
    throw new Error(`Missing ${label}.`);
  }

  return racer;
}

function createRankingSignature(
  rankings: readonly Pick<RaceRankingEntry, "slotIndex" | "rank">[]
): string {
  return rankings
    .map((ranking) => `${ranking.slotIndex}:${ranking.rank}`)
    .join(",");
}

function requireRankingAt(
  rankings: readonly RaceRankingEntry[],
  index: number
): RaceRankingEntry {
  const ranking = rankings[index];

  if (ranking === undefined) {
    throw new Error(`Missing ranking at index ${index}.`);
  }

  return ranking;
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}.`);
  }
}

function assertAlmostEqual(
  actual: number,
  expected: number,
  label: string,
  tolerance = 0.0001
): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${actual} to be within ${tolerance} of ${expected}.`);
  }
}

function assertGreaterThan(actual: number, expected: number, label: string): void {
  if (!(actual > expected)) {
    throw new Error(`${label}: expected ${actual} to be greater than ${expected}.`);
  }
}

main();
