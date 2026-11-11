// Unit tests of the ETL live-test pre-scrub (test/integration/etl/support.ts, P7 §8.5). No request is sent.
import { describe, expect, it } from 'vitest';
import { createPreScrub } from './support';

const RUN = 'ab12cd';
const NAMESPACE = '0123456789abcdef0123456789abcdef'; // 32 hex: longer than an id
const ID_A = '6650aa00bb11cc22dd33ee44';
const ID_B = '6650aa00bb11cc22dd33ee55';

describe('createPreScrub', () => {
  it('maps standalone 24-hex ids in order of first appearance, at any depth and in keys', () => {
    const scrub = createPreScrub(() => RUN);
    expect(
      scrub({ _id: ID_A, list: [ID_B, `${ID_A}/x`], nested: { [ID_B]: { ref: ID_A } } })
    ).toEqual({
      _id: '64b000000000000000000001',
      list: ['64b000000000000000000002', '64b000000000000000000001/x'],
      nested: { '64b000000000000000000002': { ref: '64b000000000000000000001' } },
    });
  });

  it('leaves a longer hex value (the namespace) whole for the harness scrub', () => {
    const scrub = createPreScrub(() => RUN);
    expect(scrub({ applicationId: NAMESPACE, path: `ns/${NAMESPACE}/p` })).toEqual({
      applicationId: NAMESPACE,
      path: `ns/${NAMESPACE}/p`,
    });
  });

  it('replaces the run id in sdk-test names and the run test MACs; other values are kept', () => {
    const scrub = createPreScrub(() => RUN);
    expect(
      scrub({
        name: `sdk-test-${RUN}-etl-profile`,
        filename: `sdk-test-${RUN}-etl-dry.csv`,
        mac: `025d4b${RUN.slice(0, 4)}2a`,
        other: '025d4b9999012a',
        n: 3,
        none: null,
      })
    ).toEqual({
      name: 'sdk-test-000000-etl-profile',
      filename: 'sdk-test-000000-etl-dry.csv',
      mac: '025d4b00002a',
      other: '025d4b9999012a',
      n: 3,
      none: null,
    });
  });

  it('keeps the numbering across calls of one scrub, and each scrub numbers on its own', () => {
    const first = createPreScrub(() => RUN);
    expect(first(ID_A)).toBe('64b000000000000000000001');
    expect(first([ID_B, ID_A])).toEqual(['64b000000000000000000002', '64b000000000000000000001']);
    expect(createPreScrub(() => RUN)(ID_B)).toBe('64b000000000000000000001');
  });
});
