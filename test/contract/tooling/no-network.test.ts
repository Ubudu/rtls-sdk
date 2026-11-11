import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { connectTarget, isLoopbackHost } from '../../../scripts/lib/no-network.mjs';

const PRELOAD = resolve(__dirname, '..', '..', '..', 'scripts', 'lib', 'no-network.mjs');
const execFileAsync = promisify(execFile);

// Runs an ES module snippet in a child Node process (asynchronously, so that the loopback server of
// this process keeps answering) and returns the JSON it prints on its last line. The child gets only the
// preload passed in `args`: an outer NODE_OPTIONS (the P0 §13 gate runs the whole suite under this same
// preload) is not inherited, so the control case really runs without it.
async function runNode(args: string[], code: string, env: Record<string, string> = {}) {
  const { NODE_OPTIONS: _outer, ...inherited } = process.env;
  const { stdout } = await execFileAsync(
    process.execPath,
    [...args, '--input-type=module', '-e', code],
    { encoding: 'utf8', env: { ...inherited, ...env }, timeout: 30_000 }
  );
  const lines = stdout.trim().split('\n');
  return JSON.parse(lines[lines.length - 1] ?? 'null') as Record<string, string>;
}

const runUnderPreload = (code: string, env: Record<string, string> = {}) =>
  runNode([`--import=${PRELOAD}`], code, env);

let server: Server;
let port = 0;

beforeAll(async () => {
  server = createServer((_req, res) => res.end('loopback-ok'));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

describe('no-network preload (P0 §13)', () => {
  it("fetch('https://example.invalid/') rejects with no-network", async () => {
    const out = await runUnderPreload(`
      let r;
      try { await fetch('https://example.invalid/'); r = 'reached'; }
      catch (e) { r = String(e.cause?.message ?? e.message); }
      console.log(JSON.stringify({ r }));
    `);
    expect(out.r).toBe('no-network: example.invalid');
  });

  it("net.connect(443, 'example.com') throws no-network", async () => {
    const out = await runUnderPreload(`
      import net from 'node:net';
      let r;
      try { net.connect(443, 'example.com'); r = 'connected'; }
      catch (e) { r = e.message; }
      console.log(JSON.stringify({ r }));
    `);
    expect(out.r).toBe('no-network: example.com');
  });

  it('blocks the other entry points: named net import, Socket.prototype.connect, tls.connect, dns.lookup, dns.promises.lookup', async () => {
    const out = await runUnderPreload(`
      import net, { createConnection } from 'node:net';
      import tls from 'node:tls';
      import dns from 'node:dns';
      const t = (fn) => { try { fn(); return 'allowed'; } catch (e) { return e.message; } };
      const r = {
        named: t(() => createConnection({ host: 'example.com', port: 80 })),
        socket: t(() => new net.Socket().connect(80, '93.184.216.34')),
        tls: t(() => tls.connect(443, 'example.com')),
        tlsOptions: t(() => tls.connect({ host: 'example.org', port: 443 })),
        lookup: t(() => dns.lookup('example.com', () => {})),
      };
      r.promises = await dns.promises.lookup('example.net').then(() => 'allowed', (e) => e.message);
      console.log(JSON.stringify(r));
    `);
    expect(out).toEqual({
      named: 'no-network: example.com',
      socket: 'no-network: 93.184.216.34',
      tls: 'no-network: example.com',
      tlsOptions: 'no-network: example.org',
      lookup: 'no-network: example.com',
      promises: 'no-network: example.net',
    });
  });

  it('a loopback server is reachable through fetch on 127.0.0.1 and localhost', async () => {
    const out = await runUnderPreload(
      `
      const port = process.env.LOOPBACK_PORT;
      const a = await fetch('http://127.0.0.1:' + port + '/').then((r) => r.text(), (e) => 'ERR ' + e.message);
      const b = await fetch('http://localhost:' + port + '/').then((r) => r.text(), (e) => 'ERR ' + e.message);
      console.log(JSON.stringify({ a, b }));
    `,
      { LOOPBACK_PORT: String(port) }
    );
    expect(out).toEqual({ a: 'loopback-ok', b: 'loopback-ok' });
  });

  it('control: without the preload the same connect call is not blocked (a stub lookup fails it, no traffic)', async () => {
    const out = await runNode(
      [],
      `import net from 'node:net';
       const s = net.connect({ host: 'example.invalid', port: 9, lookup: (h, o, cb) => cb(new Error('stub-lookup')) });
       s.on('error', (e) => console.log(JSON.stringify({ r: e.message })));`
    );
    expect(out).toEqual({ r: 'stub-lookup' });
  });

  it('connectTarget reads every argument form; isLoopbackHost accepts only the three loopback names', () => {
    expect(connectTarget([443, 'example.com'])).toEqual({ ipc: false, host: 'example.com' });
    expect(connectTarget(['443', 'example.com'])).toEqual({ ipc: false, host: 'example.com' });
    expect(connectTarget([{ host: 'a.example', port: 1 }])).toEqual({
      ipc: false,
      host: 'a.example',
    });
    expect(connectTarget([[{ host: 'b.example', port: 1 }, null]])).toEqual({
      ipc: false,
      host: 'b.example',
    });
    expect(connectTarget([443, { host: 'c.example' }])).toEqual({ ipc: false, host: 'c.example' });
    expect(connectTarget([{ port: 1 }])).toEqual({ ipc: false, host: 'localhost' });
    expect(connectTarget([{ path: join('/tmp', 'x.sock') }])).toEqual({ ipc: true });
    expect(connectTarget(['/tmp/x.sock'])).toEqual({ ipc: true });
    expect(['127.0.0.1', '::1', '[::1]', 'localhost', 'LOCALHOST'].map(isLoopbackHost)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(
      ['127.0.0.2', '0.0.0.0', 'example.com', '192.0.2.1', undefined].map(isLoopbackHost)
    ).toEqual([false, false, false, false, false]);
  });
});
