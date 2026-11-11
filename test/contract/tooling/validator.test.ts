import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { SpecValidator, listOperationIds, loadSpec, specValidator } from '../../contract/spec';

const SAMPLE = resolve(__dirname, '..', '__fixtures__', 'sample-spec.json');
const sample = () => new SpecValidator(loadSpec(SAMPLE));
const LIST = 'GET /things/{ns}';
const THING = { id: 't1', name: 'one', weight: 1.5, owner: { kind: 'user' } };

describe('spec validator (P0 §5.5.1)', () => {
  it('a valid body passes', () => {
    const result = sample().validateResponse(LIST, 200, { items: [THING], total: 1 });
    expect(result).toEqual({ valid: true, errors: [], additional: [] });
  });

  it('an invalid body fails with the JSON path of each problem', () => {
    const result = sample().validateResponse(LIST, 200, {
      items: [{ id: 3, name: 'x' }, { name: 'missing id' }],
      total: 'one',
    });
    expect(result?.valid).toBe(false);
    expect(result?.errors).toEqual(
      expect.arrayContaining([
        { path: '/items/0/id', message: 'must be string' },
        { path: '/items/1', message: "must have required property 'id'" },
        { path: '/total', message: 'must be integer' },
      ])
    );
    expect(result?.errors).toHaveLength(3);
  });

  it('nullable: true accepts null, and null elsewhere is rejected', () => {
    const v = sample();
    expect(v.validateResponse('GET /things/{ns}/{id}', 200, { ...THING, note: null })?.valid).toBe(
      true
    );
    const bad = v.validateResponse('GET /things/{ns}/{id}', 200, { ...THING, name: null });
    expect(bad?.errors).toEqual([{ path: '/name', message: 'must be string' }]);
  });

  it('$ref is resolved, also nested refs inside components', () => {
    const v = sample();
    const bad = v.validateResponse('GET /things/{ns}/{id}', 200, {
      ...THING,
      owner: { kind: 'robot' },
    });
    expect(bad?.valid).toBe(false);
    expect(bad?.errors).toEqual([
      { path: '/owner/kind', message: 'must be equal to one of the allowed values' },
    ]);
    expect(
      v.validateResponse(LIST, 200, { items: [{ ...THING, owner: {} }], total: 1 })?.errors
    ).toEqual([{ path: '/items/0/owner', message: "must have required property 'kind'" }]);
  });

  it('formats: date-time checked, OpenAPI-only formats (int64, double, binary) accepted', () => {
    const v = sample();
    expect(
      v.validateResponse('GET /things/{ns}/{id}', 200, {
        ...THING,
        createdAt: '2026-01-02T03:04:05Z',
      })?.valid
    ).toBe(true);
    expect(
      v.validateResponse('GET /things/{ns}/{id}', 200, { ...THING, createdAt: 'yesterday' })?.errors
    ).toEqual([{ path: '/createdAt', message: 'must match format "date-time"' }]);
    expect(
      v.validateResponse('GET /files/{ns}/{id}', 200, 'bytes', 'application/octet-stream')?.valid
    ).toBe(true);
  });

  it('additional properties are reported, not failed', () => {
    const v = sample();
    const result = v.validateResponse(LIST, 200, {
      items: [{ ...THING, extra: true, owner: { kind: 'user', since: 1 } }],
      total: 1,
      meta: {},
    });
    expect(result?.valid).toBe(true);
    expect(result?.errors).toEqual([]);
    expect(result?.additional).toEqual(['/items/0/extra', '/items/0/owner/since', '/meta']);
    // Explicit additionalProperties: false is reported the same way.
    const strict = v.validateResponse('GET /strict/{ns}', 200, { a: 1, b: 2 });
    expect(strict).toEqual({ valid: true, errors: [], additional: ['/b'] });
  });

  it('operations, statuses and content types are looked up as declared', () => {
    const v = sample();
    expect(v.hasOperation(LIST)).toBe(true);
    expect(v.hasOperation('GET /nope')).toBe(false);
    expect(v.isStatusDeclared(LIST, 404)).toBe(true);
    expect(v.isStatusDeclared(LIST, 500)).toBe(false);
    expect(v.contentTypes('POST /things/{ns}', 201)).toEqual(['text/plain']);
    expect(v.responseSchema(LIST, 404)).toBeUndefined();
    expect(v.validateResponse(LIST, 404, {})).toBeUndefined();
    expect(v.responseSchema(LIST, 200, 'application/json; charset=utf-8')).toEqual({
      $ref: '#/components/schemas/ThingList',
    });
    expect(listOperationIds(v.spec)).toEqual([
      'GET /things/{ns}',
      'POST /things/{ns}',
      'GET /things/{ns}/{id}',
      'DELETE /things/{ns}/{id}',
      'GET /files/{ns}/{id}',
      'GET /strict/{ns}',
    ]);
  });

  it('every response schema of the vendored spec compiles (176 operations)', () => {
    const v = specValidator();
    const ids = listOperationIds(v.spec);
    expect(ids).toHaveLength(176);
    let compiled = 0;
    for (const id of ids) {
      for (const response of Object.values(v.operation(id)?.responses ?? {})) {
        for (const media of Object.values(response.content ?? {})) {
          // A schema Ajv cannot compile throws here and fails the test.
          expect(typeof v.validateSchema(media.schema, null).valid).toBe('boolean');
          compiled++;
        }
      }
    }
    expect(compiled).toBe(190);
  });
});
