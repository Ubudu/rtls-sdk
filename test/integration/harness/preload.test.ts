// preload.mjs in child processes (P0 §8.1 preload.test.ts, U8): every case runs `node --import preload.mjs` or
// `npx tsx --import preload.mjs` in a scratch copy of the checkout (the harness files copied, `src`, `spec` and
// `node_modules` linked, its own git repository), so the children's state folder, locks and ledger live in a
// temporary folder and never in this repository. The only server is a loopback HTTP + WebSocket server started
// here (no MSW, no other host); nothing reads the real `.env`.
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import {
  acquireConfigLock,
  acquireReadSlot,
  acquireRunLock,
  lockPaths,
  newLockToken,
} from './lock.mjs';
import { tempDir, TEST_KEY, TEST_NS } from './unit-support';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const CHILD_TIMEOUT_MS = 60_000;

// ─── Scratch checkout ──────────────────────────────────────────────────────────────────────────────

let root: string;
let preload: string;
let stateRoot: string;

const SAMPLE = String.raw`
import { createRequire } from 'node:module';
const args = process.argv.slice(2).filter((a) => a !== '--write');
const [action, ...rest] = args;
const base = process.env.RTLS_BASE_URL;
const key = process.env.RTLS_API_KEY;
const ns = process.env.APP_NAMESPACE;
const runId = process.env.RTLS_IT_RUN_ID;
const mac = '025d4b' + runId.slice(0, 4) + '4d';
const headers = { 'X-API-Key': key, 'Content-Type': 'application/json' };
const out = (o) => console.log(JSON.stringify(o));
const describe = (e) => ({ rule: e?.rule ?? null, name: e?.name ?? null, cause: e?.cause?.code ?? null });
async function attempt(label, fn) {
  try { out({ [label]: { ok: await fn() } }); } catch (e) { out({ [label]: describe(e) }); }
}
async function publish() {
  const { WebSocket } = await import('ws');
  const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws/publisher?apiKey=' + encodeURIComponent(key));
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  try {
    const acked = new Promise((r) => ws.once('message', r));
    ws.send(JSON.stringify({ app_namespace: ns, user_uuid: mac, latitude: 48.85, longitude: 2.35 }));
    await acked;
    out({ publish: { ok: 'SENT' } });
  } catch (e) {
    out({ publish: describe(e) });
  }
  if (rest.includes('hold')) { await new Promise(() => setInterval(() => {}, 1000)); }
  ws.close();
}
switch (action) {
  case 'foreign':
    await attempt('foreign', () => fetch('https://example.invalid/x').then((r) => r.status));
    break;
  case 'health':
    await attempt('health', () => fetch(base + '/health', { headers }).then((r) => r.status));
    break;
  case 'asset-write':
    await attempt('asset', () =>
      fetch(base + '/assets/' + ns + '/' + mac, {
        method: 'POST',
        headers,
        body: JSON.stringify({ user_udid: mac, user_name: 'sdk-test-' + runId + '-preload' }),
      }).then((r) => r.status)
    );
    break;
  case 'config-write':
    await attempt('config', async () => {
      const current = await (await fetch(base + '/alert_rules/' + ns, { headers })).json();
      const rule = { id: 'sdk-test-' + runId + '-ex', disabled: true, conditions: { all: [] }, event: { type: 'message', params: {} } };
      if (rest.includes('templated')) { rule.event.params = { a: '{{#nofact}}' }; rule.b = { c: '{{/nofact}}' }; }
      const next = { ...current, rules: [...current.rules, rule] };
      return (await fetch(base + '/alert_rules/' + ns, { method: 'POST', headers, body: JSON.stringify(next) })).status;
    });
    break;
  case 'ws-module': {
    const m = await import('ws');
    const r = createRequire(import.meta.url)('ws');
    let construct;
    try { new r('wss://example.invalid/api/ws/subscriber'); construct = 'constructed'; } catch (e) { construct = describe(e).rule; }
    out({ ws: { same: m.default === r && m.WebSocket === r, self: r.WebSocket === r, server: typeof r.Server, construct } });
    break;
  }
  case 'publish':
    await publish();
    break;
  case 'unreachable':
    try {
      out({ unreachable: { ok: (await fetch('http://127.0.0.1:9/api/health', { headers: { 'X-API-Key': key } })).status } });
    } catch (e) {
      out({ unreachable: { rule: e?.rule ?? null, name: e?.name ?? null, message: e?.message ?? null } });
    }
    break;
  case 'hold':
    out({ ready: true });
    await new Promise((r) => { process.stdin.on('end', r); process.stdin.resume(); });
    break;
  default:
    out({ unknown: action });
}
`;

beforeAll(() => {
  root = realpathSync(tempDir('preload'));
  const harness = join(root, 'test', 'integration', 'harness');
  mkdirSync(harness, { recursive: true });
  for (const name of readdirSync(HERE)) {
    if (/\.(ts|mjs|cjs)$/.test(name) && !name.endsWith('.test.ts')) {
      copyFileSync(join(HERE, name), join(harness, name));
    }
  }
  cpSync(join(REPO, 'examples', 'shared'), join(root, 'examples', 'shared'), { recursive: true });
  for (const link of ['src', 'spec', 'node_modules'])
    symlinkSync(join(REPO, link), join(root, link));
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'preload-scratch', private: true, type: 'module' })
  );
  mkdirSync(join(root, 'samples'));
  writeFileSync(join(root, 'samples', 'sample.js'), SAMPLE);
  writeFileSync(join(root, 'samples', 'sample.ts'), SAMPLE);
  execFileSync('git', ['init', '-q'], { cwd: root });
  preload = join(harness, 'preload.mjs');
  stateRoot = join(root, 'test', 'integration', '.state');
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

// ─── Loopback API (HTTP + WebSocket) ────────────────────────────────────────────────────────────────

const SAFE_RULES = { name: 'Demo rules', rules: [] as unknown[] };
const UNSAFE_RULES = {
  name: 'Demo rules',
  rules: [{ id: 'r-1', conditions: { all: [] }, event: { type: 'post_to_email', params: {} } }],
};

interface Loopback {
  url: string;
  log: string[];
  frames: { path: string; frame: unknown }[];
  alertRules: unknown;
}
let api: Loopback;
let server: Server;
let wss: WebSocketServer;

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

beforeEach(async () => {
  api = { url: '', log: [], frames: [], alertRules: structuredClone(SAFE_RULES) };
  server = createServer((req, res) => {
    void (async () => {
      const path = (req.url ?? '').split('?')[0] ?? '';
      api.log.push(`${req.method} ${path}`);
      const text = await body(req);
      const json = (status: number, value: unknown): void => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      if (path === `/api/alert_rules/${TEST_NS}`) {
        if (req.method === 'GET') return json(200, api.alertRules);
        api.alertRules = JSON.parse(text) as unknown;
        res.writeHead(200);
        return res.end('OK');
      }
      if (path === `/api/assets/${TEST_NS}` && req.method === 'GET') return json(200, []);
      if (path.startsWith(`/api/assets/${TEST_NS}/`) && req.method === 'POST') {
        res.writeHead(201);
        return res.end('Created');
      }
      if (path === '/api/health') return json(200, { status: 'OK' });
      return json(404, { error: 'not found' });
    })();
  });
  wss = new WebSocketServer({ server });
  wss.on('connection', (socket, req) => {
    socket.on('message', (data) => {
      api.frames.push({
        path: (req.url ?? '').split('?')[0] ?? '',
        frame: JSON.parse(String(data)),
      });
      socket.send('ack');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  api.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterEach(async () => {
  for (const c of wss.clients) c.terminate();
  wss.close();
  await new Promise<void>((r) => server.close(() => r()));
  // Locks, run registry and ledger of the scratch checkout start empty in every case.
  for (const name of ['locks', 'runs', 'ledger.json'])
    rmSync(join(stateRoot, name), { recursive: true, force: true });
  rmSync(join(root, '.env'), { force: true });
});

// ─── Children ───────────────────────────────────────────────────────────────────────────────────────

interface Child {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  events: Record<string, unknown>[];
  pid: number;
}

interface RunOptions {
  runner?: 'node' | 'tsx';
  args?: string[];
  write?: boolean;
  env?: Record<string, string>;
  runId?: string;
  /** called for every JSON line; may kill the child or end its stdin */
  onEvent?: (
    event: Record<string, unknown>,
    child: ReturnType<typeof spawn>
  ) => void | Promise<void>;
}

const newRunId = (): string => randomBytes(4).toString('hex');

function run(action: string, options: RunOptions = {}): Promise<Child> {
  const runner = options.runner ?? 'node';
  const file = join(root, 'samples', runner === 'node' ? 'sample.js' : 'sample.ts');
  const args = [action, ...(options.args ?? []), ...(options.write ? ['--write'] : [])];
  const command = runner === 'node' ? process.execPath : 'npx';
  const argv =
    runner === 'node'
      ? ['--import', preload, file, ...args]
      : ['tsx', '--import', preload, file, ...args];
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? root,
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    npm_config_update_notifier: 'false',
    NODE_NO_WARNINGS: '1',
    RTLS_API_KEY: TEST_KEY,
    APP_NAMESPACE: TEST_NS,
    RTLS_BASE_URL: api.url,
    RTLS_IT_RUN_ID: options.runId ?? newRunId(),
    ...options.env,
  };
  return new Promise((done, fail) => {
    const child = spawn(command, argv, { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
    const events: Record<string, unknown>[] = [];
    let stderr = '';
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      let i: number;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!line.startsWith('{')) continue;
        const event = JSON.parse(line) as Record<string, unknown>;
        events.push(event);
        // eslint-disable-next-line rtls-test/no-swallowed-catch -- `fail` is the run promise's reject: the error fails the test
        void Promise.resolve(options.onEvent?.(event, child)).catch(fail);
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    if (!options.onEvent) child.stdin.end();
    const timer = setTimeout(() => child.kill('SIGKILL'), CHILD_TIMEOUT_MS);
    child.on('error', fail);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      done({ code, signal, stderr, events, pid: child.pid as number });
    });
  });
}

const eventOf = (c: Child, key: string): unknown => c.events.find((e) => key in e)?.[key];
const runState = (runId: string): string => join(stateRoot, runId);
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const guardRecord = (runId: string, pid: number) =>
  readJson(join(runState(runId), 'guard', `${pid}.json`)) as {
    mode: string;
    counts: Record<string, number>;
    requests: number;
    violations: number;
  };
const violations = (runId: string): { rule: string }[] => {
  const file = join(runState(runId), 'violations.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => JSON.parse(l) as { rule: string });
};
const ledgerEntry = (runId: string) => {
  const file = join(stateRoot, 'ledger.json');
  if (!existsSync(file)) return null;
  const ledger = readJson(file) as {
    runs: { runId: string; kind: string; counts: Record<string, number> }[];
  };
  return ledger.runs.find((r) => r.runId === runId) ?? null;
};
const budgetCounts = (runId: string) =>
  (readJson(join(runState(runId), 'budget.json')) as { counts: Record<string, number> }).counts;
const locksOf = () => lockPaths(stateRoot);

async function holdRunLock(token = newLockToken()): Promise<string> {
  if (!(await acquireRunLock({ token, stateDir: stateRoot }))) throw new Error('run lock');
  return token;
}
const W = { RTLS_IT_WRITES: '1' };
const S = { RTLS_IT_WRITES: '1', RTLS_IT_SIDE_EFFECTS: '1' };

// ─── Cases ──────────────────────────────────────────────────────────────────────────────────────────

describe('preload.mjs under node --import and npx tsx --import (U8)', () => {
  it(
    'a fetch to a foreign host fails with GuardViolation (G1)',
    async () => {
      const [node, tsx] = await Promise.all([run('foreign'), run('foreign', { runner: 'tsx' })]);
      for (const c of [node, tsx]) {
        expect([c.code, eventOf(c, 'foreign')]).toEqual([
          0,
          { rule: 'G1', name: 'GuardViolation', cause: null },
        ]);
      }
      expect(api.log).toEqual([]);
    },
    CHILD_TIMEOUT_MS
  );

  it(
    "await import('ws') and require('ws') return the guarded class",
    async () => {
      const [node, tsx] = await Promise.all([
        run('ws-module'),
        run('ws-module', { runner: 'tsx' }),
      ]);
      for (const c of [node, tsx]) {
        expect([c.code, eventOf(c, 'ws')]).toEqual([
          0,
          { same: true, self: true, server: 'function', construct: 'G16' },
        ]);
      }
    },
    CHILD_TIMEOUT_MS
  );

  it(
    'a write without --write is rejected (G4); guard/<pid>.json is written with counts and requests',
    async () => {
      const runId = newRunId();
      const c = await run('asset-write', { runId, env: W });
      expect([c.code, eventOf(c, 'asset')]).toEqual([
        0,
        { rule: 'G4', name: 'GuardViolation', cause: null },
      ]);
      expect(api.log).toEqual([]);
      const record = guardRecord(runId, c.pid);
      expect(record).toMatchObject({
        mode: 'example',
        counts: { positions: 0, notifications: 0, bleActions: 0, etlWrites: 0 },
        requests: 0,
        violations: 1,
      });
      const health = await run('health', { runId });
      expect(guardRecord(runId, health.pid).requests).toBe(1);
    },
    CHILD_TIMEOUT_MS
  );

  it(
    '--write without a run-lock token, or with a token that holds no run lock → exit 2 before any request',
    async () => {
      await holdRunLock();
      const none = await run('health', { write: true, env: W });
      const wrong = await run('health', {
        write: true,
        env: { ...W, RTLS_IT_INTERNAL_LOCK_TOKEN: newLockToken() },
      });
      for (const c of [none, wrong]) {
        expect(c.code).toBe(2);
        expect(c.events).toEqual([]);
        expect(c.stderr).toContain('run lock');
      }
      expect(api.log).toEqual([]);
    },
    CHILD_TIMEOUT_MS
  );

  it(
    'a tier key in .env → exit 2 before any request (the message names the key, never a value)',
    async () => {
      writeFileSync(join(root, '.env'), 'RTLS_IT_WRITES=1\n');
      const c = await run('health');
      expect(c.code).toBe(2);
      expect(c.stderr).toContain('CONFIG INVALID: RTLS_IT_WRITES');
      expect(c.stderr).not.toContain(TEST_KEY);
      expect(c.events).toEqual([]);
      expect(api.log).toEqual([]);
    },
    CHILD_TIMEOUT_MS
  );
});

describe('example-mode G9 (config writes)', () => {
  it(
    'a config write without the config lock is rejected (G9)',
    async () => {
      const token = await holdRunLock();
      const c = await run('config-write', {
        write: true,
        env: { ...W, RTLS_IT_CONFIG: '1', RTLS_IT_INTERNAL_LOCK_TOKEN: token },
      });
      expect([c.code, eventOf(c, 'config')]).toEqual([
        0,
        { rule: 'G9', name: 'GuardViolation', cause: null },
      ]);
      expect(api.log.filter((l) => l.startsWith('POST'))).toEqual([]);
      expect(api.alertRules).toEqual(SAFE_RULES);
    },
    CHILD_TIMEOUT_MS
  );

  it(
    'with the config lock held, an added disabled rule holding a mustache tag is rejected (G9), nothing is written',
    async () => {
      const token = await holdRunLock();
      if (!(await acquireConfigLock({ token, stateDir: stateRoot })))
        throw new Error('config lock');
      const c = await run('config-write', {
        args: ['templated'],
        write: true,
        env: { ...W, RTLS_IT_CONFIG: '1', RTLS_IT_INTERNAL_LOCK_TOKEN: token },
      });
      expect([c.code, eventOf(c, 'config')]).toEqual([
        0,
        { rule: 'G9', name: 'GuardViolation', cause: null },
      ]);
      expect(api.log.filter((l) => l.startsWith('POST'))).toEqual([]);
      expect(api.alertRules).toEqual(SAFE_RULES);
    },
    CHILD_TIMEOUT_MS
  );

  it(
    'with the config lock held by the test process and its token, a valid body is admitted under node and npx tsx and restored at exit; a wrong token is refused',
    async () => {
      const token = await holdRunLock();
      if (!(await acquireConfigLock({ token, stateDir: stateRoot })))
        throw new Error('config lock');
      const env = { ...W, RTLS_IT_CONFIG: '1', RTLS_IT_INTERNAL_LOCK_TOKEN: token };
      for (const runner of ['node', 'tsx'] as const) {
        api.log.length = 0;
        const runId = newRunId();
        const c = await run('config-write', { runner, write: true, env, runId });
        expect([runner, c.code, eventOf(c, 'config')]).toEqual([runner, 0, { ok: 200 }]);
        // example write, then the preload's exit: re-read (differs) → restore → verify
        expect(api.log.filter((l) => l.includes('/alert_rules/'))).toEqual([
          `GET /api/alert_rules/${TEST_NS}`, // preflight
          `GET /api/alert_rules/${TEST_NS}`, // the example's read
          `GET /api/alert_rules/${TEST_NS}`, // the gate's before-image
          `POST /api/alert_rules/${TEST_NS}`, // the example's write
          `GET /api/alert_rules/${TEST_NS}`, // exit: re-read
          `POST /api/alert_rules/${TEST_NS}`, // exit: restore
          `GET /api/alert_rules/${TEST_NS}`, // exit: verify
        ]);
        expect(api.alertRules).toEqual(SAFE_RULES);
        expect(readJson(join(runState(runId), 'config', 'alert-rules.before.json'))).toEqual(
          SAFE_RULES
        );
        expect(existsSync(join(runState(runId), 'config', 'alert-rules.restored'))).toBe(true);
      }
      api.log.length = 0;
      const wrong = await run('config-write', {
        write: true,
        env: { ...env, RTLS_IT_INTERNAL_LOCK_TOKEN: newLockToken() },
      });
      expect(wrong.code).toBe(2);
      expect(api.log).toEqual([]);
    },
    3 * CHILD_TIMEOUT_MS
  );
});

describe('publisher frames, budgets and the ledger', () => {
  it(
    'one publisher frame from a --write S process raises guard/<pid>.json and the ledger entry by 1; read-only it is rejected (G16)',
    async () => {
      const token = await holdRunLock();
      const runId = newRunId();
      const c = await run('publish', {
        runId,
        write: true,
        env: { ...S, RTLS_IT_INTERNAL_LOCK_TOKEN: token },
      });
      expect([c.code, eventOf(c, 'publish')]).toEqual([0, { ok: 'SENT' }]);
      expect(api.frames).toHaveLength(1);
      expect(api.frames[0]?.path).toBe('/api/ws/publisher');
      expect(guardRecord(runId, c.pid).counts.positions).toBe(1);
      expect(ledgerEntry(runId)).toMatchObject({ kind: 'examples', counts: { positions: 1 } });
      const readOnly = await run('publish', { runId: newRunId(), env: S });
      expect(eventOf(readOnly, 'publish')).toEqual({
        rule: 'G16',
        name: 'GuardViolation',
        cause: null,
      });
      expect(api.frames).toHaveLength(1);
    },
    CHILD_TIMEOUT_MS
  );

  it(
    'a --write process killed with SIGKILL right after one publisher frame leaves that position in the ledger',
    async () => {
      const token = await holdRunLock();
      const runId = newRunId();
      const c = await run('publish', {
        runId,
        args: ['hold'],
        write: true,
        env: { ...S, RTLS_IT_INTERNAL_LOCK_TOKEN: token },
        onEvent: (event, child) => {
          if ('publish' in event) child.kill('SIGKILL');
        },
      });
      expect(c.signal).toBe('SIGKILL');
      expect(eventOf(c, 'publish')).toEqual({ ok: 'SENT' });
      expect(existsSync(join(runState(runId), 'guard', `${c.pid}.json`))).toBe(false);
      expect(ledgerEntry(runId)?.counts.positions).toBe(1);
      expect(budgetCounts(runId).positions).toBe(1);
    },
    CHILD_TIMEOUT_MS
  );

  it(
    'a second --write process of the same run id leaves the ledger entry equal to budget.json (nothing counted twice)',
    async () => {
      const token = await holdRunLock();
      const runId = newRunId();
      const env = { ...S, RTLS_IT_INTERNAL_LOCK_TOKEN: token };
      for (const expected of [1, 2]) {
        const c = await run('publish', { runId, write: true, env });
        expect(eventOf(c, 'publish')).toEqual({ ok: 'SENT' });
        expect(guardRecord(runId, c.pid).counts.positions).toBe(1);
        expect(budgetCounts(runId).positions).toBe(expected);
        expect(ledgerEntry(runId)?.counts).toEqual(budgetCounts(runId));
      }
    },
    2 * CHILD_TIMEOUT_MS
  );

  it(
    'with S enabled and the ledger at a cap, a --write process exits 2 before any request',
    async () => {
      const token = await holdRunLock();
      mkdirSync(stateRoot, { recursive: true });
      writeFileSync(
        join(stateRoot, 'ledger.json'),
        JSON.stringify({
          version: 1,
          runs: [
            {
              runId: 'c0ffee00',
              kind: 'integration',
              startedAt: '2026-01-01T00:00:00.000Z',
              tiers: { R: true, W: true, C: true, S: true },
              counts: { positions: 57, notifications: 0, bleActions: 0, etlWrites: 0 },
            },
          ],
        })
      );
      const c = await run('publish', {
        write: true,
        env: { ...S, RTLS_IT_INTERNAL_LOCK_TOKEN: token },
      });
      expect(c.code).toBe(2);
      expect(c.stderr).toContain('cumulative cap');
      expect(c.stderr).toContain('positions');
      expect(api.log).toEqual([]);
      expect(api.frames).toEqual([]);
      // without S the same ledger refuses nothing
      const w = await run('health', {
        write: true,
        env: { ...W, RTLS_IT_INTERNAL_LOCK_TOKEN: token },
      });
      expect(w.code).toBe(0);
    },
    CHILD_TIMEOUT_MS
  );
});

describe('preflight in example mode', () => {
  it(
    'a --write process reads the alert rules, assets and settings once, before the example code; a second process of the run reuses the file; a read-only process reads nothing',
    async () => {
      const token = await holdRunLock();
      const runId = newRunId();
      const env = { ...W, RTLS_IT_INTERNAL_LOCK_TOKEN: token };
      const first = await run('health', { runId, write: true, env });
      expect(eventOf(first, 'health')).toEqual({ ok: 200 });
      expect(api.log).toEqual([
        `GET /api/alert_rules/${TEST_NS}`,
        `GET /api/assets/${TEST_NS}`,
        `GET /api/settings/${TEST_NS}`,
        'GET /api/health',
      ]);
      // the exit of a --write process confirms the run's ledger entry, even with nothing counted
      expect(ledgerEntry(runId)).toMatchObject({
        kind: 'examples',
        counts: { positions: 0, notifications: 0, bleActions: 0, etlWrites: 0 },
      });
      expect(readJson(join(runState(runId), 'preflight.json'))).toEqual({
        ruleEngineSafe: true,
        positionSafe: true,
        declaredPositionSafe: true,
        linkedNamespaceSafe: true,
        linkedCount: 0,
        blocking: [],
      });
      api.log.length = 0;
      await run('health', { runId, write: true, env });
      expect(api.log).toEqual(['GET /api/health']);
      api.log.length = 0;
      const readOnlyRun = newRunId();
      await run('health', { runId: readOnlyRun });
      expect(api.log).toEqual(['GET /api/health']);
      expect(existsSync(join(runState(readOnlyRun), 'preflight.json'))).toBe(false);
    },
    CHILD_TIMEOUT_MS
  );

  it(
    'with an unsafe alert-rule document an asset write and a publisher frame are rejected by G18',
    async () => {
      api.alertRules = UNSAFE_RULES;
      const token = await holdRunLock();
      const runId = newRunId();
      const env = { ...S, RTLS_IT_INTERNAL_LOCK_TOKEN: token };
      const asset = await run('asset-write', { runId, write: true, env });
      const frame = await run('publish', { runId, write: true, env });
      expect(eventOf(asset, 'asset')).toEqual({ rule: 'G18', name: 'GuardViolation', cause: null });
      expect(eventOf(frame, 'publish')).toEqual({
        rule: 'G18',
        name: 'GuardViolation',
        cause: null,
      });
      expect(api.log.filter((l) => l.startsWith('POST'))).toEqual([]);
      expect(api.frames).toEqual([]);
      expect(readJson(join(runState(runId), 'preflight.json'))).toMatchObject({
        ruleEngineSafe: false,
        blocking: [{ index: 0, eventType: 'post_to_email' }],
      });
    },
    CHILD_TIMEOUT_MS
  );
});

describe('unreachable base URL and read slots', () => {
  it(
    'with the dummy key and an unreachable base URL, a read-only request fails with a network error; no violation',
    async () => {
      const runId = newRunId();
      const c = await run('unreachable', {
        runId,
        env: { RTLS_API_KEY: 'sdk-test-dummy-key', RTLS_BASE_URL: 'http://127.0.0.1:9/api' },
      });
      expect(c.code).toBe(0);
      // a network error (no response), not a guard rejection
      expect(eventOf(c, 'unreachable')).toEqual({
        rule: null,
        name: 'TypeError',
        message: 'fetch failed',
      });
      expect(violations(runId)).toEqual([]);
      expect(existsSync(locksOf().locksDir)).toBe(false);
    },
    CHILD_TIMEOUT_MS
  );

  it(
    'read slots: a process whose token holds a slot takes none; one without a token holds one while it runs and frees it; an unreachable one takes none',
    async () => {
      const slots = locksOf().readSlots;
      const holderOf = (path: string): number | null =>
        existsSync(path) ? (readJson(path) as { pid: number }).pid : null;

      const own = await run('hold', {
        onEvent: (event, child) => {
          if (!('ready' in event)) return;
          const holders = slots.map(holderOf);
          expect(holders.filter((p) => p === child.pid)).toHaveLength(1);
          child.stdin?.end();
        },
      });
      expect(own.code).toBe(0);
      expect(slots.map(holderOf)).toEqual([null, null]);

      const token = newLockToken();
      expect(await acquireReadSlot({ token, stateDir: stateRoot })).toBe(slots[0]);
      const member = await run('hold', {
        env: { RTLS_IT_INTERNAL_LOCK_TOKEN: token },
        onEvent: (event, child) => {
          if (!('ready' in event)) return;
          expect(slots.map(holderOf)).toEqual([process.pid, null]);
          child.stdin?.end();
        },
      });
      expect(member.code).toBe(0);
      expect(slots.map(holderOf)).toEqual([process.pid, null]);

      rmSync(locksOf().locksDir, { recursive: true, force: true });
      const unreachable = await run('hold', {
        env: { RTLS_API_KEY: 'sdk-test-dummy-key', RTLS_BASE_URL: 'http://127.0.0.1:9/api' },
        onEvent: (event, child) => {
          if (!('ready' in event)) return;
          expect(existsSync(locksOf().locksDir)).toBe(false);
          child.stdin?.end();
        },
      });
      expect(unreachable.code).toBe(0);
      expect(unreachable.events).toContainEqual({ ready: true });
    },
    CHILD_TIMEOUT_MS
  );
});
