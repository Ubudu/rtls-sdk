import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ContextMissing,
  DEFAULT_BASE_URL,
  HarnessPrecondition,
  hasCredentials,
  INTERNAL_VARIABLES,
  liveEnv,
  tiersFrom,
} from './env';
import { tempDir } from './unit-support';

const CREDS = { RTLS_API_KEY: 'unit-key-value-123', APP_NAMESPACE: 'unit-namespace-value' };

function envFile(text: string): string {
  const path = join(tempDir('env'), '.env');
  writeFileSync(path, text);
  return path;
}

describe('env.ts', () => {
  it('without credentials hasCredentials() is false and liveEnv() throws ContextMissing', () => {
    const sources = { processEnv: {}, envFile: null };
    expect(hasCredentials(sources)).toBe(false);
    expect(() => liveEnv(sources)).toThrow(ContextMissing);
    expect(() => liveEnv({ processEnv: { RTLS_API_KEY: 'k' }, envFile: null })).toThrow(
      /APP_NAMESPACE/
    );
  });

  it('credentials come from the process environment first, then .env', () => {
    const file = envFile('RTLS_API_KEY=file-key\nAPP_NAMESPACE=file-ns\n');
    expect(hasCredentials({ processEnv: {}, envFile: file })).toBe(true);
    const env = liveEnv({ processEnv: { APP_NAMESPACE: 'process-ns' }, envFile: file });
    expect(env.namespace).toBe('process-ns');
    expect(env.apiKey).toBe('file-key');
  });

  it('tier flags: only the exact value "1" enables a tier; R is always on', () => {
    expect(tiersFrom({})).toEqual({ R: true, W: false, C: false, S: false });
    for (const value of ['true', 'yes', '0', '', ' 1', '01']) {
      expect(
        tiersFrom({ RTLS_IT_WRITES: value, RTLS_IT_CONFIG: value, RTLS_IT_SIDE_EFFECTS: value })
      ).toEqual({
        R: true,
        W: false,
        C: false,
        S: false,
      });
    }
    expect(
      tiersFrom({ RTLS_IT_WRITES: '1', RTLS_IT_CONFIG: '1', RTLS_IT_SIDE_EFFECTS: '1' })
    ).toEqual({
      R: true,
      W: true,
      C: true,
      S: true,
    });
  });

  it('a tier flag in the process environment enables its tier', () => {
    const env = liveEnv({ processEnv: { ...CREDS, RTLS_IT_WRITES: '1' }, envFile: null });
    expect(env.tiers).toEqual({ R: true, W: true, C: false, S: false });
  });

  it('the same tier key in .env is a precondition error naming the key (exit 2), process.env unchanged', () => {
    const before = { ...process.env };
    for (const key of ['RTLS_IT_WRITES', 'RTLS_IT_CONFIG', 'RTLS_IT_SIDE_EFFECTS']) {
      const file = envFile(`RTLS_API_KEY=k\nAPP_NAMESPACE=n\n${key}=1\n`);
      let caught: unknown;
      try {
        liveEnv({ processEnv: {}, envFile: file });
      } catch (error) {
        caught = error;
        if (!(error instanceof HarnessPrecondition)) throw error;
      }
      expect(caught).toBeInstanceOf(HarnessPrecondition);
      expect((caught as HarnessPrecondition).exitCode).toBe(2);
      expect((caught as HarnessPrecondition).message).toContain(key);
      expect((caught as HarnessPrecondition).names).toEqual([key]);
      expect(() => hasCredentials({ processEnv: {}, envFile: file })).toThrow(HarnessPrecondition);
    }
    expect(process.env).toEqual(before);
  });

  it('an RTLS_IT_INTERNAL_ key in .env is a precondition error (exit 2)', () => {
    for (const key of [...INTERNAL_VARIABLES, 'RTLS_IT_INTERNAL_OTHER']) {
      const file = envFile(`RTLS_API_KEY=k\nAPP_NAMESPACE=n\n${key}=abc\n`);
      expect(() => liveEnv({ processEnv: {}, envFile: file })).toThrow(
        expect.objectContaining({ exitCode: 2, names: [key] })
      );
    }
  });

  it('RTLS_BASE_URL defaults to https://rtls.ubudu.com/api; origin and base path are derived', () => {
    const env = liveEnv({ processEnv: CREDS, envFile: null });
    expect(DEFAULT_BASE_URL).toBe('https://rtls.ubudu.com/api');
    expect(env.baseUrl).toBe('https://rtls.ubudu.com/api');
    expect(env.origin).toBe('https://rtls.ubudu.com');
    expect(env.basePath).toBe('/api');
    const custom = liveEnv({
      processEnv: { ...CREDS, RTLS_BASE_URL: 'http://127.0.0.1:9/api/' },
      envFile: null,
    });
    expect(custom.baseUrl).toBe('http://127.0.0.1:9/api');
    expect(custom.origin).toBe('http://127.0.0.1:9');
  });

  it('the JSON and inspection forms of liveEnv() contain no key or namespace value', async () => {
    const env = liveEnv({ processEnv: CREDS, envFile: null });
    const { inspect } = await import('node:util');
    for (const text of [JSON.stringify(env), inspect(env), String(JSON.stringify({ env }))]) {
      expect(text).not.toContain(CREDS.RTLS_API_KEY);
      expect(text).not.toContain(CREDS.APP_NAMESPACE);
    }
    expect(JSON.parse(JSON.stringify(env))).toEqual(
      expect.objectContaining({ apiKey: '<redacted>', origin: 'https://rtls.ubudu.com' })
    );
    expect(env.apiKey).toBe(CREDS.RTLS_API_KEY);
  });
});
