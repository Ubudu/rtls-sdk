import { describe, expect, it } from 'vitest';
import { expectKnownServerIssue, KnownIssueResolved } from './known-issues';

describe('expectKnownServerIssue', () => {
  it('passes while the behaviour is still present (sync and async callbacks)', async () => {
    const observed: string[] = [];
    await expectKnownServerIssue('USI-P2-1', 'create answers text/plain', () => {
      observed.push('sync');
      expect('Created').toBe('Created');
    });
    await expectKnownServerIssue('USI-P10-12', 'ignores page and limit', async () => {
      await Promise.resolve();
      observed.push('async');
      expect([1, 2, 3]).toHaveLength(3);
    });
    expect(observed).toEqual(['sync', 'async']);
  });

  it('fails with the id and the instruction when the assertions no longer hold', async () => {
    const run = expectKnownServerIssue('USI-P5-3', 'saveRules drops the name', () => {
      expect({ name: 'kept' }).toEqual({});
    });
    await expect(run).rejects.toBeInstanceOf(KnownIssueResolved);
    await expect(run).rejects.toThrow(
      'Known server issue USI-P5-3 no longer reproduces: saveRules drops the name. Update the SDK workaround, this test and UPSTREAM-ISSUES.md.'
    );
    await expect(run).rejects.toMatchObject({ id: 'USI-P5-3', cause: expect.any(Error) });
  });

  it('a rejected promise counts as "no longer reproduces" too', async () => {
    await expect(
      // eslint-disable-next-line rtls-test/no-weak-only-assertions -- tests the helper itself: the callback is the input under test
      expectKnownServerIssue('USI-P3-4', 'zones array empty', () => Promise.reject(new Error('x')))
    ).rejects.toThrow(/USI-P3-4 no longer reproduces/);
  });

  it('a bad id format (or a missing description or callback) throws before running anything', async () => {
    let ran = false;
    const mark = (): void => {
      ran = true;
    };
    for (const id of ['USI-1', 'usi-p2-1', 'USI-P2', 'P2-1', 'USI-P2-1 ']) {
      // eslint-disable-next-line rtls-test/no-weak-only-assertions -- tests the helper itself: the callback is the input under test
      await expect(expectKnownServerIssue(id, 'x', mark)).rejects.toThrow(TypeError);
    }
    // eslint-disable-next-line rtls-test/no-weak-only-assertions -- tests the helper itself: the callback is the input under test
    await expect(expectKnownServerIssue('USI-P2-1', ' ', mark)).rejects.toThrow(TypeError);
    await expect(
      // eslint-disable-next-line rtls-test/no-weak-only-assertions -- tests the helper itself: the callback is the input under test
      expectKnownServerIssue('USI-P2-1', 'x', undefined as unknown as () => void)
    ).rejects.toThrow(TypeError);
    expect(ran).toBe(false);
  });
});
