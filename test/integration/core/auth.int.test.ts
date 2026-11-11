// Core live tests L-A1 and L-A2 (P1 §9): exactly one credential per request (D11) against production, tier R. The
// key is sent as a Bearer value only when it has the API-key form (32 hex characters, checked without printing);
// otherwise L-A1 is skipped and allowlist entry P1-6 covers the Bearer header line (U5).
import {
  createLiveClient,
  describeLive,
  guardedFetch,
  hasCredentials,
  liveEnv,
  recordFact,
} from '../harness';
import { recordingFetch } from './support/recording-fetch';
import { auditReadOnlyRequests } from './support/request-audit';

const KEY_FORM = /^[0-9a-f]{32}$/i;

describeLive('R', 'core auth', () => {
  auditReadOnlyRequests();

  // Decided at collection, without printing: the key is sent as a Bearer value only in the API-key form.
  const keyHasApiKeyForm = hasCredentials() && KEY_FORM.test(liveEnv().apiKey);

  it.runIf(keyHasApiKeyForm)(
    'L-A1 apiKey and accessToken (auto) send only Authorization: Bearer (skipped unless the key is 32 hex; allowlist P1-6)',
    async () => {
      const key = liveEnv().apiKey;
      const rec = recordingFetch(guardedFetch);
      const client = createLiveClient({ accessToken: key, fetch: rec.fetch });
      const settings = await client.getSettings();
      expect(typeof settings === 'object' && settings !== null).toBe(true);
      expect(rec.calls).toHaveLength(1);
      expect(rec.calls[0]?.bearer).toBe(true);
      expect(rec.calls[0]?.headerNames.includes('authorization')).toBe(true);
      expect(rec.calls[0]?.headerNames.includes('x-api-key')).toBe(false);
    }
  );

  it('L-A2 the same credentials with auth: apiKey send only X-API-Key', async () => {
    recordFact('U5.keyIs32Hex', keyHasApiKeyForm);
    const rec = recordingFetch(guardedFetch);
    const key = liveEnv().apiKey;
    const client = createLiveClient({ accessToken: key, auth: 'apiKey', fetch: rec.fetch });
    const settings = await client.getSettings();
    expect(typeof settings === 'object' && settings !== null).toBe(true);
    expect(rec.calls).toHaveLength(1);
    expect(rec.calls[0]?.headerNames.includes('x-api-key')).toBe(true);
    expect(rec.calls[0]?.headerNames.includes('authorization')).toBe(false);
  });
});
