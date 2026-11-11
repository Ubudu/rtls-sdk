// Run abort (LIVE-TESTING §4.5, P0 §6.2 abort.ts). Writes `.state/<runId>/abort.json` with the reason and a
// label (no values). Every describeLive block collected or started afterwards is skipped with reason
// 'run aborted', the guard admits only reads outside teardown, and the driver turns `report.abort =
// 'restore-failed'` into exit 4. Teardown still runs cleanup, restores and the sweep.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { activeHarness } from './active';

export function abortRun(reason: 'restore-failed' | string, label: string): void {
  if (typeof reason !== 'string' || reason === '') throw new TypeError('abortRun: reason required');
  const h = activeHarness();
  if (h.abortState()) return;
  mkdirSync(h.stateDir, { recursive: true });
  writeFileSync(
    join(h.stateDir, 'abort.json'),
    `${JSON.stringify({ reason, label: String(label) })}\n`
  );
}

/**
 * Driver exit code for `report.json.abort` (P0 §6.1): `no-credentials` 3; `ledger-cap`, `no-run-lock`,
 * `no-read-slot`, `precondition` 2; `restore-failed` 4; none or any other reason → null (the run's `ok` decides:
 * 0 or 1).
 */
export function abortExitCode(abort: string | null | undefined): 2 | 3 | 4 | null {
  switch (abort) {
    case 'no-credentials':
      return 3;
    case 'ledger-cap':
    case 'no-run-lock':
    case 'no-read-slot':
    case 'precondition':
      return 2;
    case 'restore-failed':
      return 4;
    default:
      return null;
  }
}

/** True once abortRun was called for the active run (by any process of the run). */
export function runAborted(): boolean {
  return activeHarness().abortState() !== null;
}
