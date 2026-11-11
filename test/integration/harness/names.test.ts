import { afterEach, describe, expect, it } from 'vitest';
import { setActiveHarness } from './active';
import { HarnessPrecondition } from './env';
import {
  isRunTestMac,
  isTestMac,
  isTestName,
  RUN_RANGE_DIGITS,
  runId,
  runIdFrom,
  runMacPrefix,
  testMac,
  testName,
} from './names';
import { makeHarness, TEST_RUN_ID } from './unit-support';

afterEach(() => setActiveHarness(null));

describe('names.ts', () => {
  it('validates the RTLS_IT_RUN_ID override (ABC rejected) and draws a random id when absent', () => {
    expect(runIdFrom({ RTLS_IT_RUN_ID: 'deadbeef' })).toBe('deadbeef');
    for (const bad of ['ABC', 'DEADBEEF', 'deadbee', 'deadbeef0', 'xyz12345']) {
      expect(() => runIdFrom({ RTLS_IT_RUN_ID: bad })).toThrow(HarnessPrecondition);
    }
    const a = runIdFrom({});
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(runIdFrom({ RTLS_IT_RUN_ID: '' })).toMatch(/^[0-9a-f]{8}$/);
  });

  it('runId() is the active harness run id', () => {
    makeHarness();
    expect(runId()).toBe(TEST_RUN_ID);
  });

  it('testMac(0) and testMac(255) have the run-id format; 256 and -1 throw', () => {
    expect(testMac(0, 'abcd1234')).toBe('025d4babcd00');
    expect(testMac(255, 'abcd1234')).toBe('025d4babcdff');
    expect(testMac(1, TEST_RUN_ID)).toBe('025d4b3fa901');
    for (const n of [256, -1, 1.5, Number.NaN])
      expect(() => testMac(n, 'abcd1234')).toThrow(RangeError);
    makeHarness();
    expect(testMac(10)).toBe('025d4b3fa90a');
  });

  it('isTestMac ignores separators and case; other prefixes are not test MACs', () => {
    expect(isTestMac('02:5D:4B:3F:A9:01')).toBe(true);
    expect(isTestMac('02-5d-4b-3f-a9-01')).toBe(true);
    expect(isTestMac('025d.4b3f.a901')).toBe(true);
    expect(isTestMac('aabbccddeeff')).toBe(false);
    expect(isTestMac('025d4b3fa9')).toBe(false);
    expect(isTestMac('025d4b3fa90123')).toBe(false);
    expect(isTestMac(undefined)).toBe(false);
  });

  // review round 3: the proof of the time_in_zone leaf needs every run to position only its own four-digit range
  it('isRunTestMac: exactly the four leading run-id digits right after 025d4b name the run range', () => {
    expect(RUN_RANGE_DIGITS).toBe(4);
    const id = TEST_RUN_ID; // 3fa9c0de
    expect(runMacPrefix(id)).toBe('025d4b3fa9');
    for (const n of [0, 1, 128, 255]) expect(isRunTestMac(testMac(n, id), id)).toBe(true);
    expect(isRunTestMac('02:5D:4B:3F:A9:FF', id)).toBe(true);
    for (const mac of [
      '025d4b3fa801', // shares the first three digits, not the fourth
      '02:5d:4b:3f:a8:01',
      '025d4b3fa000',
      '025d4b013fa9', // the four digits at the wrong offset
      '025d4bc0de01', // later digits of the run id
      '025d4b3fa9', // too short
      'aabb3fa90101',
      undefined,
    ]) {
      expect(isRunTestMac(mac, id)).toBe(false);
    }
    // a MAC of another run's range belongs to this run exactly when the first four digits agree
    for (const other of ['3fa9ffff', '3fa80000', '3f000000', '00003fa9', 'c0de3fa9', 'ffffffff']) {
      for (const n of [0, 255]) {
        expect(isRunTestMac(testMac(n, other), id)).toBe(other.slice(0, 4) === id.slice(0, 4));
      }
    }
  });

  it('testName validates the label and isTestName checks the prefix', () => {
    expect(testName('sweep', 'abcd1234')).toBe('sdk-test-abcd1234-sweep');
    for (const bad of ['', 'Upper', '-lead', 'a b', 'x'.repeat(41), 'under_score']) {
      expect(() => testName(bad, 'abcd1234')).toThrow(TypeError);
    }
    expect(testName('a'.repeat(40), 'abcd1234')).toHaveLength('sdk-test-abcd1234-'.length + 40);
    expect(isTestName('sdk-test-x')).toBe(true);
    expect(isTestName('sdk-example-x')).toBe(false);
  });
});
