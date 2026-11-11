// The rejection value of a promise that must reject, for tests that assert several fields of one error (P1 §9).
// A promise that resolves fails the test.

export class ExpectedRejection extends Error {
  constructor() {
    super('expected the promise to reject, but it resolved');
    this.name = 'ExpectedRejection';
  }
}

/** Awaits `promise` and returns what it rejected with; throws `ExpectedRejection` when it resolves. */
export async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new ExpectedRejection();
}

/** Calls `fn` and returns what it threw synchronously; throws `ExpectedRejection` when it returns. */
export function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new ExpectedRejection();
}
