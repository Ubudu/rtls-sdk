// Request guard (P0 §6.2 request-guard.ts, P5 H-P0-3): a narrowing guard on top of G1–G18, never a widening
// one. Inside `fn`, a request failing the predicate is rejected before it leaves the process (GuardViolation
// rule 'RG', recorded in violations.jsonl, so the run fails even if `fn` swallows it). `fn`'s own error is
// returned, not thrown. Nested guards: a request must pass every active predicate.
import { runWithGuardScope, type AttemptedRequest, type GuardedRequest } from './guard';

export type { AttemptedRequest, GuardedRequest };
export type RequestPredicate = (r: GuardedRequest) => boolean;

export const denyAll: RequestPredicate = () => false;
export const getOnly: RequestPredicate = (r) => r.method === 'GET' || r.method === 'HEAD';

export async function withRequestGuard<T>(
  predicate: RequestPredicate,
  fn: () => Promise<T>
): Promise<{ result: T | undefined; error: unknown; attempts: readonly AttemptedRequest[] }> {
  const attempts: AttemptedRequest[] = [];
  let result: T | undefined;
  let error: unknown;
  try {
    result = await runWithGuardScope({ kind: 'request-guard', predicate, attempts }, () =>
      Promise.resolve().then(fn)
    );
  } catch (e) {
    error = e;
  }
  return { result, error, attempts };
}
