import { KART_MULTIPLAYER_EFFECT_EVENT_KINDS } from "./kartEffectEventMessage";
import {
  REPLICATED_EFFECT_LATENCY_TARGET_MS,
  runDeterministicMultiplayerReplicationHarness,
  type MultiplayerEffectReplicationLatencyReport,
  type MultiplayerReplicationScenarioResult
} from "./multiplayerReplicationHarness";

const MAX_EXPECTED_ONE_WAY_LATENCY_MS = 120;
const EXPECTED_PACKETS_PER_SCENARIO = 5;

function main(): void {
  const result = runDeterministicMultiplayerReplicationHarness();
  const shell = requireScenario(result.scenarios, "shell");
  const banana = requireScenario(result.scenarios, "banana");
  const effectLatencyReport = result.effectReplicationLatencyReport;

  assertEqual(
    result.manualBrowserCoordinationRequired,
    false,
    "harness is fully automated"
  );
  assertEqual(result.humanRacerCount, 2, "two human peers participate");
  assertEqual(result.aiRacerCount, 2, "two AI racers remain in the roster");
  assertLessThanOrEqual(
    result.maxObservedOneWayLatencyMs,
    MAX_EXPECTED_ONE_WAY_LATENCY_MS,
    "default simulated one-way latency budget"
  );

  validateSharedScenarioExpectations(shell);
  validateSharedScenarioExpectations(banana);
  validateEffectReplicationLatencyReport(effectLatencyReport);
  validateEffectReplicationLatencyReportFlagsOverBudget();
  assertEqual(shell.guestShellLaunchObserved, true, "shell launch is observed");
  assertEqual(
    banana.guestBananaHazardRemoved,
    true,
    "banana hazard is removed after replicated hit"
  );
  assertIncludes(
    shell.deliveredEffectKinds,
    KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_LAUNCH,
    "shell launch effect drains"
  );
  assertIncludes(
    shell.deliveredEffectKinds,
    KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SHELL_HIT,
    "shell hit effect drains"
  );
  assertIncludes(
    banana.deliveredEffectKinds,
    KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_DROP,
    "banana drop effect drains"
  );
  assertIncludes(
    banana.deliveredEffectKinds,
    KART_MULTIPLAYER_EFFECT_EVENT_KINDS.BANANA_HIT,
    "banana hit effect drains"
  );

  console.info(
    "multiplayerReplicationHarness=ok",
    `scenarios=${result.scenarios.length}`,
    `maxLatencyMs=${result.maxObservedOneWayLatencyMs}`,
    `effectTargetMs=${effectLatencyReport.targetLatencyMs}`,
    `effectSamples=${effectLatencyReport.sampleCount}`,
    `effectMaxMs=${effectLatencyReport.maxLatencyMs}`,
    `effectP95Ms=${effectLatencyReport.p95LatencyMs}`,
    `effectReport=${formatEffectReplicationLatencyReport(effectLatencyReport)}`,
    `shellEffects=${shell.deliveredEffectKinds.join(",")}`,
    `bananaEffects=${banana.deliveredEffectKinds.join(",")}`
  );
}

function validateSharedScenarioExpectations(
  scenario: MultiplayerReplicationScenarioResult
): void {
  assertEqual(
    scenario.sentGameplayPackets,
    EXPECTED_PACKETS_PER_SCENARIO,
    `${scenario.itemType} packet count`
  );
  assertEqual(
    scenario.deliveredGameplayPackets,
    scenario.sentGameplayPackets,
    `${scenario.itemType} packets are delivered`
  );
  assertEqual(
    scenario.itemUseEventsReceived,
    1,
    `${scenario.itemType} item-use event is received`
  );
  assertEqual(
    scenario.itemCollisionOutcomeEventsReceived,
    1,
    `${scenario.itemType} collision outcome event is received`
  );
  assertEqual(
    scenario.itemCollisionOutcomeEventsApplied,
    1,
    `${scenario.itemType} collision outcome applies before duplicate effects`
  );
  assertEqual(
    scenario.effectEventsAccepted,
    3,
    `${scenario.itemType} effect events accepted`
  );
  assertEqual(
    scenario.effectEventsRejected,
    0,
    `${scenario.itemType} effect events are not rejected`
  );
  assertEqual(
    scenario.effectEventsDrained,
    3,
    `${scenario.itemType} effect events drain under reordering`
  );
  assertEqual(
    scenario.effectReplicationTimings.length,
    scenario.effectEventsDrained,
    `${scenario.itemType} effect timings are recorded per drained event`
  );
  for (const timing of scenario.effectReplicationTimings) {
    assertEqual(
      timing.receivedAt - timing.sentAt,
      timing.latencyMs,
      `${scenario.itemType} effect latency is send-to-receive`
    );
    assertGreaterThan(
      timing.receivedAt,
      timing.sentAt,
      `${scenario.itemType} effect receive timestamp follows send timestamp`
    );
    assertLessThanOrEqual(
      timing.latencyMs,
      REPLICATED_EFFECT_LATENCY_TARGET_MS,
      `${scenario.itemType} ${timing.effectEventKind} replicated effect latency target`
    );
  }
  assertLessThanOrEqual(
    scenario.maxOneWayLatencyMs,
    MAX_EXPECTED_ONE_WAY_LATENCY_MS,
    `${scenario.itemType} one-way latency budget`
  );
  assertLessThanOrEqual(
    scenario.maxEffectReplicationLatencyMs,
    MAX_EXPECTED_ONE_WAY_LATENCY_MS,
    `${scenario.itemType} effect replication latency budget`
  );
  assertGreaterThan(
    scenario.hostTargetSpinoutSeconds,
    0,
    `${scenario.itemType} host target spins out`
  );
  assertGreaterThan(
    scenario.guestTargetSpinoutSeconds,
    0,
    `${scenario.itemType} guest target receives spinout`
  );
  assertEqual(
    scenario.guestLastHitItemType,
    scenario.itemType,
    `${scenario.itemType} guest last-hit item type`
  );
  assertIncludes(
    scenario.deliveredEffectKinds,
    KART_MULTIPLAYER_EFFECT_EVENT_KINDS.SPINOUT_START,
    `${scenario.itemType} spinout-start effect drains`
  );
}

function validateEffectReplicationLatencyReport(
  report: MultiplayerEffectReplicationLatencyReport
): void {
  assertEqual(
    report.sessionMode,
    "deterministic-simulated-2-player",
    "effect latency report identifies the automated two-player session"
  );
  assertEqual(
    report.targetLatencyMs,
    REPLICATED_EFFECT_LATENCY_TARGET_MS,
    "effect latency report uses the multiplayer target"
  );
  assertEqual(report.humanRacerCount, 2, "effect report covers both human peers");
  assertEqual(report.aiRacerCount, 2, "effect report covers the full race roster");
  assertEqual(report.scenarioCount, 2, "effect report covers shell and banana");
  assertEqual(
    report.sampleCount,
    report.scenarios.reduce((total, scenario) => total + scenario.sampleCount, 0),
    "effect report sample count is derived from scenarios"
  );
  assertEqual(
    report.violations.length,
    0,
    "default effect replication has no latency violations"
  );
  assertEqual(
    report.withinTarget,
    true,
    "default effect replication report stays within target"
  );
  assertLessThanOrEqual(
    report.maxLatencyMs,
    REPLICATED_EFFECT_LATENCY_TARGET_MS,
    "effect report max latency stays within target"
  );
  assertLessThanOrEqual(
    report.p95LatencyMs,
    REPLICATED_EFFECT_LATENCY_TARGET_MS,
    "effect report p95 latency stays within target"
  );
  assertGreaterThan(
    report.averageLatencyMs,
    0,
    "effect report records a non-zero average latency"
  );

  for (const scenario of report.scenarios) {
    validateEffectReplicationLatencyScenarioReport(scenario);
  }
}

function validateEffectReplicationLatencyScenarioReport(
  scenario: MultiplayerEffectReplicationLatencyReport["scenarios"][number]
): void {
  assertEqual(
    scenario.targetLatencyMs,
    REPLICATED_EFFECT_LATENCY_TARGET_MS,
    `${scenario.itemType} effect report target`
  );
  assertEqual(
    scenario.violations.length,
    0,
    `${scenario.itemType} effect report has no violations`
  );
  assertEqual(
    scenario.withinTarget,
    true,
    `${scenario.itemType} effect report stays within target`
  );
  assertLessThanOrEqual(
    scenario.maxLatencyMs,
    REPLICATED_EFFECT_LATENCY_TARGET_MS,
    `${scenario.itemType} effect report max latency`
  );
  assertEqual(
    scenario.sampleCount,
    scenario.samples.length,
    `${scenario.itemType} effect report sample count`
  );

  for (const sample of scenario.samples) {
    assertEqual(
      sample.targetLatencyMs,
      REPLICATED_EFFECT_LATENCY_TARGET_MS,
      `${scenario.itemType} ${sample.effectEventKind} sample target`
    );
    assertEqual(
      sample.withinTarget,
      true,
      `${scenario.itemType} ${sample.effectEventKind} sample stays within target`
    );
    assertEqual(
      sample.overTargetByMs,
      0,
      `${scenario.itemType} ${sample.effectEventKind} sample has no overage`
    );
    assertLessThanOrEqual(
      sample.latencyMs,
      REPLICATED_EFFECT_LATENCY_TARGET_MS,
      `${scenario.itemType} ${sample.effectEventKind} sample latency`
    );
  }
}

function validateEffectReplicationLatencyReportFlagsOverBudget(): void {
  const overBudget = runDeterministicMultiplayerReplicationHarness({
    hostToGuestDelaysMs: [REPLICATED_EFFECT_LATENCY_TARGET_MS + 1]
  }).effectReplicationLatencyReport;
  const firstViolation = overBudget.violations[0];

  assertEqual(
    overBudget.withinTarget,
    false,
    "effect report fails when every replicated effect exceeds the target"
  );
  assertGreaterThan(
    overBudget.violations.length,
    0,
    "effect report lists over-target replicated effects"
  );

  if (firstViolation === undefined) {
    throw new Error("Expected at least one over-target effect latency violation.");
  }

  assertGreaterThan(
    firstViolation.latencyMs,
    REPLICATED_EFFECT_LATENCY_TARGET_MS,
    "effect report violation records the measured latency"
  );
  assertGreaterThan(
    firstViolation.overTargetByMs,
    0,
    "effect report violation records the over-target margin"
  );
}

function formatEffectReplicationLatencyReport(
  report: MultiplayerEffectReplicationLatencyReport
): string {
  return report.scenarios
    .map(
      (scenario) =>
        `${scenario.itemType}:${scenario.maxLatencyMs}/${scenario.targetLatencyMs}ms:${scenario.sampleCount}effects`
    )
    .join("|");
}

function requireScenario(
  scenarios: readonly MultiplayerReplicationScenarioResult[],
  itemType: MultiplayerReplicationScenarioResult["itemType"]
): MultiplayerReplicationScenarioResult {
  const scenario = scenarios.find((candidate) => candidate.itemType === itemType);

  if (scenario === undefined) {
    throw new Error(`Expected ${itemType} replication scenario.`);
  }

  return scenario;
}

function assertIncludes<T>(values: readonly T[], expected: T, message: string): void {
  if (!values.includes(expected)) {
    throw new Error(`${message}: expected ${String(expected)} in ${values.join(",")}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertGreaterThan(actual: number, expected: number, message: string): void {
  if (!(actual > expected)) {
    throw new Error(`${message}: expected > ${expected}, got ${actual}`);
  }
}

function assertLessThanOrEqual(
  actual: number,
  expected: number,
  message: string
): void {
  if (!(actual <= expected)) {
    throw new Error(`${message}: expected <= ${expected}, got ${actual}`);
  }
}

main();
