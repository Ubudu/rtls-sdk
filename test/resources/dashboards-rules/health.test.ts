// client.health() against MSW (P5 §8.1 H1–H3); the method itself is P1 code.
import { describe, it, expect } from 'vitest';
import { http } from 'msw';
import { recordRequests, server } from '../../mocks/server';
import { fixtureResponse, loadFixture } from '../../contract/fixtures';
import {
  createRtlsClient,
  RtlsError,
  ServiceUnavailableError,
  type HealthStatus,
} from '../../../src';

const HEALTH_URL = 'https://rtls.ubudu.com/api/health';

describe('client.health (H1–H3)', () => {
  it('H1 GET /health → { status: "OK" }', async () => {
    server.use(
      http.get(HEALTH_URL, () => fixtureResponse(loadFixture('dashboards-rules', 'health')))
    );
    const rec = recordRequests();
    const health: HealthStatus = await createRtlsClient({ apiKey: 'test-key' }).health();
    expect(health).toStrictEqual({ status: 'OK' });
    expect([rec.requests[0]?.method, rec.requests[0]?.url.pathname]).toStrictEqual([
      'GET',
      '/api/health',
    ]);
  });

  it('H2 503 → ServiceUnavailableError, status 503, message holds the status text, body kept', async () => {
    server.use(
      http.get(HEALTH_URL, () => fixtureResponse(loadFixture('dashboards-rules', 'health-503')))
    );
    await expect(createRtlsClient({ apiKey: 'test-key' }).health()).rejects.toSatisfy(
      (e) =>
        e instanceof ServiceUnavailableError &&
        e instanceof RtlsError &&
        e.status === 503 &&
        e.message.includes('MongoDB connection not ready') &&
        (e.body as { status?: string }).status === 'MongoDB connection not ready'
    );
  });

  it('H3 with default options a 503 is requested once (no retry)', async () => {
    server.use(
      http.get(HEALTH_URL, () => fixtureResponse(loadFixture('dashboards-rules', 'health-503')))
    );
    const rec = recordRequests();
    await expect(
      createRtlsClient({ apiKey: 'test-key', namespace: 'test-ns' }).health()
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(rec.requests).toHaveLength(1);
  });
});
