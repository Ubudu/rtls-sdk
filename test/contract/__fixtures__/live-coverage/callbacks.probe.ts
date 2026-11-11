// Run by coverage-live-provider.test.ts with vitest.probe.config.ts: the mapping callback of mapIds never runs;
// Things.list runs, while Things.remove, the static Things.make, handlers.ping and named never run.
import { expect, it } from 'vitest';
import { mapIds } from './callbacks';
import { Things } from './things';

it('maps an empty list', () => {
  expect(mapIds([])).toEqual([]);
});

it('lists no thing (Things.list only)', () => {
  expect(Things.prototype.list.call({ items: [] })).toEqual([]);
});
