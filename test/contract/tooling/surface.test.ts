import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { listSurface, walkSurface } from '../../../scripts/lib/surface.mjs';

const REPO = resolve(__dirname, '..', '..', '..');
const SAMPLE_DIR = 'test/contract/__fixtures__/surface';
const sample = () => walkSurface({ entry: `${SAMPLE_DIR}/index.ts`, clientClass: 'SampleClient' });

describe('public-surface walker on a sample module (P0 §5.5.6)', () => {
  const { items, values } = sample();
  const names = items.map((i) => i.name);
  const at = (name: string) => items.find((i) => i.name === name);

  it('lists exactly the expected callable surface', () => {
    expect(names).toEqual([
      'Base.baseMethod',
      'Base.build',
      'Foo.bar',
      'Foo.make',
      'SampleClient.version',
      'aliasHelper',
      'arrowHelper',
      'assets.get',
      'assets.list',
      'assets.onEvent',
      'builders.equals',
      'builders.notEquals',
      'client.health',
      'client.setNamespace',
      'createSampleClient',
      'helper',
      'notifications.rules.create',
      'notifications.rules.list',
      'notifications.rules.remove',
      'notifications.send',
    ]);
  });

  it('client props → <prop>.<method>, nested to notifications.rules.create, root methods → client.<method>', () => {
    expect(at('assets.list')).toEqual({
      name: 'assets.list',
      kind: 'reachable-method',
      file: `${SAMPLE_DIR}/client.ts`,
      line: 4,
    });
    expect(at('notifications.rules.create')?.kind).toBe('reachable-method');
    expect(at('client.health')).toMatchObject({
      kind: 'client-method',
      file: `${SAMPLE_DIR}/client.ts`,
    });
  });

  it('classes: instance Foo.bar, static Foo.make, functions and object members', () => {
    expect(at('Foo.bar')?.kind).toBe('class-method');
    expect(at('Foo.make')?.kind).toBe('static-method');
    expect(at('helper')).toMatchObject({
      kind: 'function',
      file: `${SAMPLE_DIR}/functions.ts`,
      line: 1,
    });
    expect(at('arrowHelper')?.kind).toBe('function');
    expect(at('aliasHelper')?.kind).toBe('function');
    expect(at('builders.equals')).toMatchObject({
      kind: 'object-member',
      file: `${SAMPLE_DIR}/builders.ts`,
    });
    expect(at('builders.notEquals')?.kind).toBe('object-member');
  });

  it('excludes private, protected, #, @internal, accessors, constructors, non-callables and type-only exports', () => {
    for (const hidden of [
      'assets.secret',
      'assets.guarded',
      'assets.#hidden',
      'assets.internalOnly',
      'assets.count',
      'assets.label',
      'client.requireNs',
      'client.request',
      'client.raw',
      'client.constructor',
      'Foo.p',
      'Foo.q',
      'Foo.s',
      'Foo.value',
      'Foo.constructor',
      'Hidden.m',
      'internalHelper',
      'builders.label',
      'TypeOnlyClass.t',
      'Shape.area',
      'VERSION',
      'secretApi.list',
    ]) {
      expect(names).not.toContain(hidden);
    }
    expect(values.map((v) => v.name)).toEqual(['VERSION']);
  });

  it('inherited members are attributed to the declaring class', () => {
    expect(names).not.toContain('Foo.baseMethod');
    expect(names).not.toContain('Foo.build');
    expect(at('Base.baseMethod')).toMatchObject({
      kind: 'class-method',
      file: `${SAMPLE_DIR}/classes.ts`,
    });
    expect(at('Base.build')).toMatchObject({
      kind: 'static-method',
      file: `${SAMPLE_DIR}/classes.ts`,
    });
    // Reached through the client: named by the path, located in the declaring class's file.
    expect(at('notifications.rules.list')).toMatchObject({
      file: `${SAMPLE_DIR}/crud.ts`,
      line: 3,
    });
    expect(at('client.setNamespace')).toMatchObject({ file: `${SAMPLE_DIR}/client.ts` });
  });
});

describe('public-surface walker on the SDK (P0-T12)', () => {
  const items = listSurface();
  const names = items.map((i) => i.name);

  it('lists client.health, assets.list, RtlsWebSocketSubscriber.subscribe and filters.equals', () => {
    expect(names).toEqual(
      expect.arrayContaining([
        'client.health',
        'assets.list',
        'RtlsWebSocketSubscriber.subscribe',
        'filters.equals',
      ])
    );
    expect(items.find((i) => i.name === 'client.health')).toMatchObject({
      file: 'src/client/index.ts',
    });
    expect(items.find((i) => i.name === 'filters.equals')).toMatchObject({
      file: 'src/utils/filtering.ts',
    });
  });

  it('excludes the @internal requireNs and the other internal helpers', () => {
    expect(names.filter((n) => /require(Ns|Venue|Map)$|resolveCtx$/.test(n))).toEqual([]);
    expect(names).not.toContain('client.raw');
    expect(new Set(names).size).toBe(names.length);
  });

  it('CLI prints one "<name>\\t<file>:<line>" line per item', () => {
    const res = spawnSync(process.execPath, [join(REPO, 'scripts', 'lib', 'surface.mjs')], {
      cwd: REPO,
      encoding: 'utf8',
    });
    expect(res.status).toBe(0);
    const lines = res.stdout.trim().split('\n');
    expect(lines).toHaveLength(items.length);
    expect(lines).toContain(
      `client.health\tsrc/client/index.ts:${items.find((i) => i.name === 'client.health')?.line}`
    );
  });
});
