// Request audit of the core live tests (P1 §9, §13 "Live" row): after every test, each request the guard sent must be
// a GET, the bounded `POST /es/query/{ns}/alerts` of L-D4 or the oversize `POST /spatial/zones/{ns}/analyze-custom`
// of L-E13; anything else fails the test. The counts are added to the run's facts (`core.requests.*`) for the phase
// report. Requests made in `beforeAll` hooks (discovery, fixture reads) are GETs and are not in a test's log.
import { afterEach } from 'vitest';
import { readFacts, recordFact, requestLog, stateDir } from '../../harness';

const ES_QUERY = '/es/query/{appNamespace}/{dataType}';
const ANALYZE_CUSTOM = '/spatial/zones/{namespace}/analyze-custom';

export class UnexpectedRequest extends Error {
  constructor(count: number) {
    super(`a core live test sent ${count} request(s) other than GET and the two read-only POSTs`);
    this.name = 'UnexpectedRequest';
  }
}

function add(name: string, n: number): void {
  const current = readFacts(stateDir())[name];
  recordFact(name, (typeof current === 'number' ? current : 0) + n);
}

/** Registers the audit for the enclosing `describeLive` block. */
export function auditReadOnlyRequests(): void {
  afterEach(() => {
    let get = 0;
    let esQuery = 0;
    let analyzeCustom = 0;
    let other = 0;
    for (const entry of requestLog()) {
      if (entry.method === 'GET') get += 1;
      else if (
        entry.method === 'POST' &&
        entry.template === ES_QUERY &&
        entry.path.endsWith('/alerts')
      )
        esQuery += 1;
      else if (entry.method === 'POST' && entry.template === ANALYZE_CUSTOM) analyzeCustom += 1;
      else other += 1;
    }
    add('core.requests.get', get);
    add('core.requests.esQueryAlertsPost', esQuery);
    add('core.requests.analyzeCustomPost', analyzeCustom);
    add('core.requests.other', other);
    if (other > 0) throw new UnexpectedRequest(other);
  });
}
