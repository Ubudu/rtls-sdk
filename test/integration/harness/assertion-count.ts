// Assertion count of the harness helpers (P0 §5.4 runtime complement). Both setup files call
// `expect.hasAssertions()` before each test, and vitest counts only its own `expect(...)` calls. The harness helpers
// that assert by throwing (`expectGuardViolation`, `expectDeepEqualRedacted`) register one assertion each when they
// pass, so a test whose only assertion is such a helper does not fail with "expected any number of assertion". No
// vitest import: the guard also runs in example mode (preload), where there is no vitest and this is a no-op.

/** vitest's global `expect` lives under this registered symbol (`@vitest/expect` GLOBAL_EXPECT). */
const GLOBAL_EXPECT = Symbol.for('expect-global');

interface ExpectState {
  assertionCalls?: number;
}
interface GlobalExpect {
  getState(): ExpectState;
  setState(state: ExpectState): void;
}

/** Adds one to vitest's assertion count of the running test; does nothing outside vitest. */
export function countAssertion(): void {
  const candidate = (globalThis as Record<PropertyKey, unknown>)[GLOBAL_EXPECT] as
    Partial<GlobalExpect> | undefined;
  if (typeof candidate?.getState !== 'function' || typeof candidate.setState !== 'function') return;
  const state = candidate.getState();
  candidate.setState({ assertionCalls: (state?.assertionCalls ?? 0) + 1 });
}
