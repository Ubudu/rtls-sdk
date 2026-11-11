// Type declarations of the endpoint-coverage generator (docs/api/tools/gen-endpoint-coverage.mjs).

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Tier = 'R' | 'W' | 'C' | 'S';

export interface CoverageRow {
  tag: string;
  method: HttpMethod;
  path: string;
  operationId?: string;
  /** owning phase from base.json: "P2"…"P8", or "none" for the tags excluded as a whole */
  phase: string;
  decision: 'wrap' | 'exclude';
  /** rendered and joined SDK names, e.g. "client.assets.list()"; required when decision = wrap */
  sdkMethod?: string;
  tier?: Tier;
  /** a wrap with `allowlist` and no `tier` is rendered "not live (allowlist <id>)" */
  allowlist?: string;
  /** required when decision = exclude */
  reason?: string;
}

export interface NonHttpRow {
  id: string;
  kind: 'ws-endpoint' | 'ws-command' | 'ws-message';
  decision: 'wrap' | 'exclude';
  sdkMethod?: string;
  tier?: Tier;
  allowlist?: string;
  reason?: string;
}

export interface CoverageSummary {
  specVersion: string;
  total: number;
  wrapped: number;
  excluded: number;
  byTag: Record<string, { total: number; wrapped: number; excluded: number }>;
}

export interface CoverageInputs {
  spec: unknown;
  base: unknown;
  phases: Record<string, unknown>;
}

export interface Coverage {
  rows: CoverageRow[];
  nonHttp: NonHttpRow[];
  summary: CoverageSummary;
  markdown: string;
  json: string;
}

export class CoverageError extends Error {
  constructor(problems: string[]);
  readonly problems: string[];
}

export function loadInputs(root?: string): CoverageInputs;
export function buildCoverage(inputs: CoverageInputs): Coverage;
export function renderSdkName(name: string): string;
export function outputPaths(root?: string): { markdown: string; json: string };
export function main(
  argv: readonly string[],
  deps?: { root?: string; log?: (line: string) => void; error?: (line: string) => void }
): number;
