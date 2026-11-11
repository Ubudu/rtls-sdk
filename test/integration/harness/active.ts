// Registry of the active harness context (P0 §6.2): the live singleton created lazily by `getHarness()`, or
// a context installed explicitly (unit tests, the example-mode preload). Kept in its own module so that the
// harness modules can reach the active context without import cycles.
import type { Harness } from './context';

let installed: Harness | null = null;
let singleton: Harness | null = null;
let factory: (() => Harness) | null = null;

/** @internal context.ts registers the live factory. */
export function registerHarnessFactory(create: () => Harness): void {
  factory = create;
}

/**
 * Installs `harness` as the active context (unit tests, example-mode preload); `null` removes it.
 *
 * @internal
 */
export function setActiveHarness(harness: Harness | null): void {
  installed = harness;
}

/** The installed context, else the lazily created live singleton. */
export function activeHarness(): Harness {
  if (installed) return installed;
  if (!singleton) {
    if (!factory) throw new Error('harness: no context factory registered (import ./context)');
    singleton = factory();
  }
  return singleton;
}

/** The active context if one exists, without creating the live singleton. */
export function peekActiveHarness(): Harness | null {
  return installed ?? singleton;
}

let savedFetch: typeof fetch | null = null;

/** @internal installGuards saves the fetch it replaces; the live context sends through it. */
export function setOriginalFetch(fetchImpl: typeof fetch | null): void {
  savedFetch = fetchImpl;
}

/** The fetch that installGuards replaced, or null when the guards are not installed. */
export function originalFetch(): typeof fetch | null {
  return savedFetch;
}
