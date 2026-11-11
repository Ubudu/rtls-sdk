// Live harness API (P0 §6.2). Live tests import from here; the plain-JavaScript entry points (ledger.mjs,
// lock.mjs, state-io.mjs, preload.mjs and ws-hook.mjs) serve callers outside vitest. Global setup
// (global-setup.ts) and the report helpers (report.ts) load no vitest module and are imported directly.
export { abortExitCode, abortRun, runAborted } from './abort';
export { activeHarness, setActiveHarness } from './active';
export { expectDeepEqualRedacted, diffRedacted, RedactedAssertionError } from './assert';
export type { Difference, DifferenceKind } from './assert';
export { BOUNDED_SIZE, boundedRange, lastHour } from './bounded';
export {
  BudgetExceeded,
  budgetReport,
  consumeBudget,
  CUMULATIVE_CAPS,
  DOMAIN_CAPS,
  EXAMPLES_SHARE,
  integrationShare,
  ledgerRefusal,
  RUN_LIMITS,
} from './budgets';
export type { BudgetCounts, BudgetName } from './budgets';
export { registerCleanup, runCleanup } from './cleanup';
export type { CleanupResult, CleanupSpec } from './cleanup';
export { createLiveClient, createUnreachableClient } from './client';
export { discover, DiscoveryError, safePublishPoint } from './discover';
export type { Discovery, GeoJsonFeature } from './discover';
export { configCycle, ConfigRestoreFailed, withConfigLock } from './config-cycle';
export type { ConfigCycle, ConfigCycleOptions, SkipContext } from './config-cycle';
export { CONFIG_RESOURCES, validateChange } from './config-resources';
export type { ConfigResourceName } from './config-resources';
export { withExistingEntityGuard } from './existing-entity';
export type { ExistingEntityKind, ExistingEntityOptions } from './existing-entity';
export { activateRunAllowlist } from './run-allowlist';
export { createHarnessContext, getHarness, Harness, stateDir } from './context';
export type {
  HarnessContextOptions,
  LiveBlockRuntime,
  RequestLogEntry,
  SocketRecord,
  WebSocketLike,
} from './context';
export { ContextMissing, hasCredentials, HarnessPrecondition, liveEnv } from './env';
export type { LiveEnv, Tier } from './env';
export { feature } from './features';
export { readFacts, recordFact } from './facts';
export type { FactValue } from './facts';
export {
  expectGuardViolation,
  guardedFetch,
  GuardViolation,
  requestLog,
  resetRequestLog,
  trackCreated,
} from './guard';
export type { AttemptedRequest, GuardedRequest } from './guard';
export { installGuards } from './install';
export { expectKnownServerIssue, KnownIssueResolved } from './known-issues';
export { isTestMac, isTestName, runId, testMac, testName } from './names';
export { DUMMY_API_KEY, UNREACHABLE_BASE_URLS, unroutableBaseUrl } from './policy';
export type { DomainKey, PreflightVerdicts } from './policy';
export { rawRequest } from './raw';
export { recordFixture, RecorderRefusal } from './recorder';
export type { RecordedResponse } from './recorder';
export { scrub } from './scrub';
export { compareSnapshots, stateDiffOf, takeSnapshot } from './state';
export { sweep } from './sweeper';
export type { Residue, SweepOptions, SweepResult, SweepTarget } from './sweeper';
export { createTestAsset } from './test-asset';
export type { TestAsset } from './test-asset';
export type { StateDiff, StateDifference, StateSnapshot } from './state';
export type { RawResponse } from './raw';
export { denyAll, getOnly, withRequestGuard } from './request-guard';
export type { RequestPredicate } from './request-guard';
export { currentBlock, currentTier, describeLive } from './tiers';
export type { DescribeLiveOptions } from './tiers';
export {
  allowLocalWebSocketServer,
  guardedWsModule,
  guardWebSocket,
  socketRecords,
} from './ws-guard';
