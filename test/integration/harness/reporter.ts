// vitest reporter of the integration run (P0 §5.5.7, §5.8): hands the test outcomes of the run to
// `report.json` (`domains`: passed, failed, skipped with reasons, per-tier counts). It runs in the vitest main
// process and loads no vitest module at run time. Global teardown builds the report and reads `outcomes.json`;
// `finalizeRunReport` works in either order (outcomes before or after teardown). The run id comes from
// `RTLS_IT_RUN_ID`, which the driver exports and global setup sets when vitest is started without the driver.
import { join } from 'node:path';
import { outcomesFromTasks, type LiveTestOutcome, type TaskLike } from './outcomes';
import { finalizeRunReport } from './report';
import { checkoutStateDir } from './state-io.mjs';

const RUN_ID_RE = /^[0-9a-f]{8}$/;

/** State folder of the run whose outcomes are reported, or null when no valid run id is set. */
export function reportStateDir(
  processEnv: NodeJS.ProcessEnv = process.env,
  stateRoot: string = checkoutStateDir()
): string | null {
  const runId = processEnv.RTLS_IT_RUN_ID;
  return typeof runId === 'string' && RUN_ID_RE.test(runId) ? join(stateRoot, runId) : null;
}

/**
 * Outcomes of the run: every test, plus one failed entry `(file)` for a file that failed outside its tests (an
 * import or collection error, a failing hook), so that such a file turns `report.json.ok` false too.
 */
export function runOutcomes(files: readonly TaskLike[]): LiveTestOutcome[] {
  const outcomes = outcomesFromTasks(files);
  for (const file of files) {
    const path = file.filepath ?? file.name;
    const failedTest = outcomes.some((o) => o.file === path && o.state === 'fail');
    if (file.result?.state === 'fail' && !failedTest)
      outcomes.push({ file: path, suites: [], test: '(file)', state: 'fail' });
  }
  return outcomes;
}

export default class HarnessReporter {
  private readonly stateRoot: string | undefined;

  /** `stateRoot`: folder of the run state folders (default `test/integration/.state` of this checkout). */
  constructor(options: { stateRoot?: string } = {}) {
    this.stateRoot = options.stateRoot;
  }

  onFinished(files: readonly TaskLike[] = []): void {
    const dir = reportStateDir(process.env, this.stateRoot);
    if (dir === null) return;
    finalizeRunReport(dir, runOutcomes(files));
  }
}
