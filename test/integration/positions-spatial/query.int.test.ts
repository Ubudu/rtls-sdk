// P3 live tests L-Q-1, 2, 5…8 (P3 §9.3): `positions.query()` and the deprecated `client.esQuery()` against
// production, tier R. Every body carries a time range and an explicit integer `size` (guard G12), the invalid
// data type of L-Q-7 included; no test probes the `/es/query` guard (U-Q-4/U-Q-5 are unit-only, R18).
import { ServerError, type AssetPosition, type EsDataType, type RtlsClient } from '../../../src';
import {
  createLiveClient,
  describeLive,
  expectKnownServerIssue,
  getHarness,
  recordFact,
} from '../harness';
import { recordP3 } from './support/fixture-scrub';

const HOUR = 3_600_000;
const ES = { timeoutMs: 60_000 };
const OP = 'POST /es/query/{appNamespace}/{dataType}';

function range(ms: number, now = Date.now()): Record<string, unknown> {
  return { range: { timestamp: { gte: now - ms, lte: now, format: 'epoch_millis' } } };
}

interface PerHour {
  per_hour: { buckets: Array<{ key: number; doc_count: number }> };
}

describeLive('R', 'positions query', () => {
  let client: RtlsClient;

  beforeAll(() => {
    client = createLiveClient();
  });

  it('L-Q-1 one recent position document (U3)', async () => {
    const res = await client.positions.query<AssetPosition>(
      'positions',
      { size: 1, query: range(HOUR), sort: [{ timestamp: 'desc' }] },
      ES
    );
    expect(typeof res.took).toBe('number');
    expect(res.timed_out).toBe(false);
    expect(res.hits.hits.length).toBe(1);
    expect(res.hits.hits.every((h) => typeof h._source.user.udid === 'string')).toBe(true);
    const keys = Object.keys(res);
    recordFact('positions-spatial.U3.topLevelKeyCount', keys.length);
    for (const k of ['took', 'timed_out', 'terminated_early', '_shards', 'hits', 'aggregations']) {
      recordFact(
        `positions-spatial.U3.has.${k.replace(/^_/, '').replace(/_/g, '-')}`,
        keys.includes(k)
      );
    }
    await recordP3('es-query-hits', OP, res, 'L-Q-1');
  });

  it('L-Q-2 an hourly date_histogram over 24 h with size 0', async () => {
    const res = await client.positions.query<Record<string, unknown>, PerHour>(
      'positions',
      {
        size: 0,
        query: range(24 * HOUR),
        aggs: { per_hour: { date_histogram: { field: 'timestamp', fixed_interval: '1h' } } },
      },
      ES
    );
    const buckets = res.aggregations?.per_hour.buckets ?? [];
    expect(buckets.length).toBeGreaterThanOrEqual(1);
    expect(buckets.length).toBeLessThanOrEqual(26);
    expect(res.hits.hits).toHaveLength(0);
    recordFact('positions-spatial.query.hourBuckets', buckets.length);
    await recordP3('es-query-aggs', OP, res, 'L-Q-2');
  });

  it('L-Q-5 the alerts and zone_visits data types', async () => {
    const alerts = await client.positions.query(
      'alerts',
      { size: 1, query: range(7 * 24 * HOUR) },
      ES
    );
    expect(Array.isArray(alerts.hits.hits)).toBe(true);
    expect(alerts.hits.hits.length).toBeLessThanOrEqual(1);
    const visits = await client.positions.query(
      'zone_visits',
      { size: 0, query: range(24 * HOUR) },
      ES
    );
    expect(Array.isArray(visits.hits.hits)).toBe(true);
    expect(visits.hits.hits).toHaveLength(0);
  });

  it('L-Q-6 the deprecated client.esQuery() returns the same shape', async () => {
    const ns = getHarness().env.namespace;
    const res = (await client.esQuery(ns, 'positions', { size: 1, query: range(HOUR) }, ES)) as {
      took?: unknown;
      timed_out?: unknown;
      hits?: { hits?: unknown[] };
    };
    expect(typeof res.took).toBe('number');
    expect(res.timed_out).toBe(false);
    expect(res.hits?.hits?.length).toBe(1);
  });

  it('L-Q-7 an invalid data type answers 500 (USI-P3-9)', async () => {
    await expectKnownServerIssue(
      'USI-P3-9',
      'POST /es/query answers 500 for an invalid dataType',
      async () => {
        await expect(
          client.positions.query('nope' as EsDataType, { size: 0, query: range(HOUR) }, ES)
        ).rejects.toSatisfy(
          (e: unknown) =>
            e instanceof ServerError && e.status === 500 && e.message.startsWith('Invalid dataType')
        );
      }
    );
  });

  it('L-Q-8 track_total_hits gives a numeric total', async () => {
    const res = await client.positions.query(
      'positions',
      { size: 0, track_total_hits: true, query: range(HOUR) },
      ES
    );
    expect(typeof res.hits.total?.value).toBe('number');
    expect(res.hits.total?.value).toBeGreaterThanOrEqual(0);
  });
});
