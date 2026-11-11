// Type declarations of the example catalogue runner (examples/run-all.mjs).

export type SkipCategory = 'feature-off' | 'role' | 'tier' | 'no-fixture' | 'preflight';
export type Lang = 'ts' | 'js';

export interface Budget {
  positions: number;
  notifications: number;
  bleActions: number;
  etlWrites: number;
}

export interface WriteSection {
  tier: 'W' | 'C' | 'S';
  budget: Budget;
  /** what the write section creates, in one line */
  creates: string;
}

export interface CatalogueEntry {
  /** "01".."24", unique, two digits */
  id: string;
  /** kebab-case; files are typescript/<id>-<name>.ts and javascript/<id>-<name>.js */
  name: string;
  title: string;
  summary: string;
  owner: 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'P9';
  guide: string;
  recipe?: string;
  readAllowedSkips: SkipCategory[];
  write: WriteSection | null;
  /** default 90000 */
  timeoutMs?: number;
}

export interface Catalogue {
  examples: CatalogueEntry[];
}

export interface RunResult {
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  guardCounts?: Budget;
  /** guard violations recorded while the entry ran (any fails it) */
  violations?: number;
  /** budget refusals recorded while the entry ran (any fails it) */
  budgetRefusals?: number;
}

export interface Verdict {
  status: 'pass' | 'skip' | 'fail';
  reason?: string;
  budgetUsed?: Budget;
}

export interface RunAllDeps {
  root?: string;
  env?: NodeJS.ProcessEnv;
  stateRoot?: string;
  lockStateDir?: string;
  ledgerPath?: string;
  lockWait?: { wait: boolean; pollMs?: number; maxWaitMs?: number };
  childCommand?: (lang: Lang, file: string, args: string[]) => { command: string; args: string[] };
  preloadPath?: string;
  sweepCheck?: (runId: string, env: NodeJS.ProcessEnv, cwd: string) => Promise<number>;
  snapshot?: (argv: string[], env: NodeJS.ProcessEnv, cwd: string) => Promise<number>;
  graceMs?: number;
  log?: (line: string) => void;
  error?: (line: string) => void;
}

export const EXAMPLES_DIR: string;
export const REPO_ROOT: string;
export const CATALOGUE_PATH: string;
export const DEFAULT_ENTRY_TIMEOUT_MS: number;
export const INDEX_START: string;
export const INDEX_END: string;

export function catalogueProblems(data: unknown): string[];
export function loadCatalogue(file?: string): Catalogue;
export function stripComments(text: string): string;
export function writeSectionCalls(source: string): string[] | null;
export function checkParity(catalogue: Catalogue, examplesDir: string): string[];
export function renderIndex(catalogue: Catalogue): string;
export function replaceIndex(readme: string, index: string): string | null;
export function indexBlock(readme: string): string | null;
export function sumBudgets(entries: CatalogueEntry[]): Budget;
export function entryHeaderProblem(entry: CatalogueEntry, firstLine: string): string | null;
export function classify(r: RunResult, entry: CatalogueEntry, pass: 'read' | 'write'): Verdict;
export function writePassCommands(runId: string): {
  snapshotBefore: string[];
  sweep: string[];
  snapshotAfter: string[];
};
export function afterPassVerdict(r: {
  sweepExit: number;
  compareExit: number;
  ledgerCounts: Budget | null;
  guardSum: Budget;
}): { ok: boolean; problems: string[] };
export function defaultCommand(
  argv: string[],
  env: NodeJS.ProcessEnv,
  cwd: string
): Promise<number>;
export function parseRunAllArgs(argv: readonly string[]): {
  write: boolean;
  only: string[];
  lang: 'ts' | 'js' | 'both';
  checkIndex: boolean;
  writeIndex: boolean;
  list: boolean;
};
export function main(argv: readonly string[], deps?: RunAllDeps): Promise<number>;
