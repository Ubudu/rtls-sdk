// Core live tests L-H1…L-H3 (P1 §9): `client.health()` against production, tier R. `GET /health` is public.
import { createLiveClient, describeLive, guardedFetch, requestLog } from '../harness';
import { recordingFetch } from './support/recording-fetch';
import { auditReadOnlyRequests } from './support/request-audit';

describeLive('R', 'core health', () => {
  auditReadOnlyRequests();

  it('L-H1 health() resolves { status: "OK" }', async () => {
    const health = await createLiveClient().health();
    expect(health).toEqual({ status: 'OK' });
    expect(requestLog().map((e) => `${e.method} ${e.template} ${e.status}`)).toEqual([
      'GET /health 200',
    ]);
  });

  it('L-H2 health() without any credential sends no credential header', async () => {
    const rec = recordingFetch(guardedFetch);
    const client = createLiveClient({ apiKey: undefined, fetch: rec.fetch });
    const health = await client.health();
    expect(health).toEqual({ status: 'OK' });
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]?.headerNames.includes('x-api-key')).toBe(false);
    expect(rec.calls[0]?.headerNames.includes('authorization')).toBe(false);
    expect(rec.calls[0]?.headerNames.includes('content-type')).toBe(false);
  });

  it('L-H3 health({ timeoutMs: 0 }) resolves with the timeout disabled', async () => {
    const health = await createLiveClient().health({ timeoutMs: 0 });
    expect(health.status).toBe('OK');
  });
});
