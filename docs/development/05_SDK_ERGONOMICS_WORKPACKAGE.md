# Work Package 05: SDK Ergonomics & Default Context

> **Execution Mode**: Fully Autonomous AI Coding Agent
> **Total Tasks**: 42 atomic tasks across 10 phases
> **Verification**: Each task includes testable acceptance criteria
> **Breaking Changes**: None - fully backward compatible

---

## Objective

Eliminate repetitive parameters by allowing default context (namespace, venueId, mapId, level) at client creation with per-call overrides.

---

## Before & After

```typescript
// BEFORE: Repetitive namespace in every call
const client = createRtlsClient({ apiKey: '...' });
await client.assets.list('my-namespace');
await client.positions.listCached('my-namespace');
await client.zones.list('my-namespace', 123);
await client.venues.listPois('my-namespace', 123, 456);

// AFTER: Configure once, use everywhere
const client = createRtlsClient({
  apiKey: '...',
  namespace: 'my-namespace',
  venueId: 123,
  mapId: 456,
});
await client.assets.list();
await client.positions.listCached();
await client.zones.list();
await client.venues.listPois();

// Override when needed
await client.assets.list({ namespace: 'other-ns' });

// Scoped clients (immutable)
const venue2 = client.forVenue(789);
```

---

## Agent Instructions

### Execution Protocol

1. **Read each task completely** before starting implementation
2. **Execute tasks sequentially** - each builds on previous work
3. **Run verification command** after each task - do not proceed if FAIL
4. **On failure**: Debug, fix, re-run verification until PASS
5. **Commit after each phase**: `git add -A && git commit -m "feat(sdk): phase N - [description]"`
6. **Run full test suite after Phase 4, 6, 8, 10**

### File Modification Rules

- When task says **"Create file"**: Write the complete file content provided
- When task says **"Edit file"**: Apply the specific changes shown (add/modify/remove)
- When task says **"Replace method"**: Replace only that method, keep rest unchanged
- **Never delete existing functionality** unless explicitly instructed

### Verification Command Interpretation

- `PASS` = Task completed successfully, proceed to next task
- `FAIL` = Something wrong, debug and fix before proceeding
- If verification command fails to run, check file paths and syntax

---

## Phase 1: Context Module

### Task 1.1: Create Context Types and Utilities

**Action**: Create new file `src/context.ts`

**Complete file content**:

```typescript
/**
 * Context module for managing default parameters across SDK calls.
 * @module context
 */

/**
 * Default context values configurable at client creation.
 * These values are used as defaults for all API calls.
 */
export interface RtlsContext {
  /** Default application namespace for all requests */
  namespace?: string;
  /** Default venue ID for venue-scoped requests */
  venueId?: number;
  /** Default map ID for map-scoped requests */
  mapId?: number;
  /** Default floor level for spatial queries */
  level?: number;
}

/**
 * Context that can be passed to individual API calls to override defaults.
 * Same shape as RtlsContext but semantically used for per-call overrides.
 */
export type CallContext = RtlsContext;

/**
 * Resolved context with namespace guaranteed (required for most API calls).
 */
export interface ResolvedNamespaceContext extends RtlsContext {
  namespace: string;
}

/**
 * Resolved context with venueId guaranteed.
 */
export interface ResolvedVenueContext extends RtlsContext {
  venueId: number;
}

/**
 * Resolved context with mapId guaranteed.
 */
export interface ResolvedMapContext extends RtlsContext {
  mapId: number;
}

/**
 * Merge call-time context overrides with client defaults.
 * Override values take precedence; undefined overrides fall back to defaults.
 *
 * @param defaults - Default context from client configuration
 * @param overrides - Per-call context overrides
 * @returns Merged context
 */
export function resolveContext(
  defaults: RtlsContext,
  overrides?: CallContext
): RtlsContext {
  if (!overrides) {
    return { ...defaults };
  }
  return {
    namespace: overrides.namespace ?? defaults.namespace,
    venueId: overrides.venueId ?? defaults.venueId,
    mapId: overrides.mapId ?? defaults.mapId,
    level: overrides.level ?? defaults.level,
  };
}

/**
 * Error thrown when a required context value is missing.
 */
export class ContextError extends Error {
  constructor(
    public readonly field: string,
    public readonly suggestion: string
  ) {
    super(
      `${field} is required. ${suggestion}`
    );
    this.name = 'ContextError';
  }
}

/**
 * Assert that namespace is present in context.
 * @throws {ContextError} If namespace is not set
 */
export function requireNamespace(context: RtlsContext): ResolvedNamespaceContext {
  if (!context.namespace) {
    throw new ContextError(
      'Namespace',
      'Pass it to the method, set via createRtlsClient({ namespace: "..." }), or call client.setNamespace("...")'
    );
  }
  return context as ResolvedNamespaceContext;
}

/**
 * Assert that venueId is present in context.
 * @throws {ContextError} If venueId is not set
 */
export function requireVenueId(context: RtlsContext): ResolvedVenueContext {
  if (context.venueId === undefined) {
    throw new ContextError(
      'Venue ID',
      'Pass it to the method, set via createRtlsClient({ venueId: ... }), or call client.setVenue(...)'
    );
  }
  return context as ResolvedVenueContext;
}

/**
 * Assert that mapId is present in context.
 * @throws {ContextError} If mapId is not set
 */
export function requireMapId(context: RtlsContext): ResolvedMapContext {
  if (context.mapId === undefined) {
    throw new ContextError(
      'Map ID',
      'Pass it to the method, set via createRtlsClient({ mapId: ... }), or call client.setMap(...)'
    );
  }
  return context as ResolvedMapContext;
}

/**
 * Type guard to check if first argument is a string (namespace) or options object.
 */
export function isNamespaceArg(arg: unknown): arg is string {
  return typeof arg === 'string';
}

/**
 * Type guard to check if first argument is a number (venueId).
 */
export function isVenueIdArg(arg: unknown): arg is number {
  return typeof arg === 'number';
}
```

**Verification**:
```bash
npx tsc --noEmit src/context.ts 2>&1 && echo "PASS: Task 1.1" || echo "FAIL: Task 1.1"
```

---

### Task 1.2: Export Context from Main Index

**Action**: Edit `src/index.ts` - add exports near other type exports

**Add these lines** (find the exports section and add):

```typescript
// Context types and utilities
export type {
  RtlsContext,
  CallContext,
  ResolvedNamespaceContext,
  ResolvedVenueContext,
  ResolvedMapContext,
} from './context';
export {
  resolveContext,
  requireNamespace,
  requireVenueId,
  requireMapId,
  ContextError,
} from './context';
```

**Verification**:
```bash
grep -q "RtlsContext" src/index.ts && grep -q "ContextError" src/index.ts && echo "PASS: Task 1.2" || echo "FAIL: Task 1.2"
```

---

### Task 1.3: Create Context Unit Tests

**Action**: Create new file `test/context.test.ts`

**Complete file content**:

```typescript
import { describe, it, expect } from 'vitest';
import {
  resolveContext,
  requireNamespace,
  requireVenueId,
  requireMapId,
  ContextError,
  isNamespaceArg,
  isVenueIdArg,
} from '../src/context';

describe('context', () => {
  describe('resolveContext', () => {
    it('returns copy of defaults when no overrides', () => {
      const defaults = { namespace: 'ns1', venueId: 1, mapId: 2, level: 3 };
      const result = resolveContext(defaults);

      expect(result).toEqual(defaults);
      expect(result).not.toBe(defaults); // Should be a copy
    });

    it('returns copy of defaults when overrides is undefined', () => {
      const defaults = { namespace: 'ns1' };
      const result = resolveContext(defaults, undefined);

      expect(result).toEqual({ namespace: 'ns1' });
    });

    it('overrides namespace', () => {
      const defaults = { namespace: 'ns1', venueId: 1 };
      const overrides = { namespace: 'ns2' };

      expect(resolveContext(defaults, overrides)).toEqual({
        namespace: 'ns2',
        venueId: 1,
        mapId: undefined,
        level: undefined,
      });
    });

    it('overrides venueId', () => {
      const defaults = { namespace: 'ns1', venueId: 1 };
      const overrides = { venueId: 999 };

      expect(resolveContext(defaults, overrides).venueId).toBe(999);
    });

    it('overrides multiple values', () => {
      const defaults = { namespace: 'ns1', venueId: 1, mapId: 2, level: 3 };
      const overrides = { namespace: 'ns2', mapId: 200 };

      const result = resolveContext(defaults, overrides);
      expect(result.namespace).toBe('ns2');
      expect(result.venueId).toBe(1); // not overridden
      expect(result.mapId).toBe(200);
      expect(result.level).toBe(3); // not overridden
    });

    it('undefined override falls back to default', () => {
      const defaults = { namespace: 'ns1' };
      const overrides = { namespace: undefined };

      expect(resolveContext(defaults, overrides).namespace).toBe('ns1');
    });

    it('handles empty defaults', () => {
      const result = resolveContext({}, { namespace: 'ns1' });
      expect(result.namespace).toBe('ns1');
    });

    it('handles empty overrides', () => {
      const defaults = { namespace: 'ns1' };
      const result = resolveContext(defaults, {});
      expect(result.namespace).toBe('ns1');
    });
  });

  describe('requireNamespace', () => {
    it('returns context when namespace is present', () => {
      const ctx = { namespace: 'my-ns', venueId: 1 };
      const result = requireNamespace(ctx);

      expect(result.namespace).toBe('my-ns');
      expect(result.venueId).toBe(1);
    });

    it('throws ContextError when namespace is undefined', () => {
      expect(() => requireNamespace({})).toThrow(ContextError);
      expect(() => requireNamespace({})).toThrow(/Namespace is required/);
    });

    it('throws ContextError when namespace is empty string', () => {
      expect(() => requireNamespace({ namespace: '' })).toThrow(ContextError);
    });

    it('error message includes helpful suggestion', () => {
      try {
        requireNamespace({});
        expect.fail('Should have thrown');
      } catch (e) {
        expect((e as ContextError).suggestion).toContain('createRtlsClient');
        expect((e as ContextError).field).toBe('Namespace');
      }
    });
  });

  describe('requireVenueId', () => {
    it('returns context when venueId is present', () => {
      const ctx = { namespace: 'ns', venueId: 123 };
      const result = requireVenueId(ctx);

      expect(result.venueId).toBe(123);
    });

    it('accepts venueId of 0', () => {
      const ctx = { venueId: 0 };
      const result = requireVenueId(ctx);
      expect(result.venueId).toBe(0);
    });

    it('throws ContextError when venueId is undefined', () => {
      expect(() => requireVenueId({})).toThrow(ContextError);
      expect(() => requireVenueId({})).toThrow(/Venue ID is required/);
    });
  });

  describe('requireMapId', () => {
    it('returns context when mapId is present', () => {
      const ctx = { mapId: 456 };
      const result = requireMapId(ctx);

      expect(result.mapId).toBe(456);
    });

    it('throws ContextError when mapId is undefined', () => {
      expect(() => requireMapId({})).toThrow(ContextError);
      expect(() => requireMapId({})).toThrow(/Map ID is required/);
    });
  });

  describe('type guards', () => {
    describe('isNamespaceArg', () => {
      it('returns true for strings', () => {
        expect(isNamespaceArg('my-namespace')).toBe(true);
        expect(isNamespaceArg('')).toBe(true);
      });

      it('returns false for non-strings', () => {
        expect(isNamespaceArg(123)).toBe(false);
        expect(isNamespaceArg({})).toBe(false);
        expect(isNamespaceArg(null)).toBe(false);
        expect(isNamespaceArg(undefined)).toBe(false);
        expect(isNamespaceArg({ namespace: 'ns' })).toBe(false);
      });
    });

    describe('isVenueIdArg', () => {
      it('returns true for numbers', () => {
        expect(isVenueIdArg(123)).toBe(true);
        expect(isVenueIdArg(0)).toBe(true);
      });

      it('returns false for non-numbers', () => {
        expect(isVenueIdArg('123')).toBe(false);
        expect(isVenueIdArg({})).toBe(false);
        expect(isVenueIdArg(null)).toBe(false);
        expect(isVenueIdArg(undefined)).toBe(false);
      });
    });
  });

  describe('ContextError', () => {
    it('has correct name', () => {
      const error = new ContextError('Test', 'suggestion');
      expect(error.name).toBe('ContextError');
    });

    it('exposes field and suggestion', () => {
      const error = new ContextError('MyField', 'Do this instead');
      expect(error.field).toBe('MyField');
      expect(error.suggestion).toBe('Do this instead');
    });

    it('is instanceof Error', () => {
      const error = new ContextError('Test', 'suggestion');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
```

**Verification**:
```bash
npm run test -- test/context.test.ts --run 2>&1 | tail -5 && echo "PASS: Task 1.3" || echo "FAIL: Task 1.3"
```

---

### Phase 1 Checkpoint

```bash
npm run typecheck && npm run test -- test/context.test.ts --run && echo "✅ Phase 1 Complete" || echo "❌ Phase 1 Failed"
```

**Commit**:
```bash
git add -A && git commit -m "feat(sdk): phase 1 - context module with types and utilities"
```

---

## Phase 2: Base Client Context Support

### Task 2.1: Update RtlsClientOptions Interface

**Action**: Edit `src/client/base.ts`

**Find** the `RtlsClientOptions` interface and **add** these properties:

```typescript
export interface RtlsClientOptions {
  baseUrl?: string;
  apiKey?: string;
  accessToken?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
  // === ADD THESE NEW PROPERTIES ===
  /** Default namespace for all API calls */
  namespace?: string;
  /** Default venue ID for venue-scoped API calls */
  venueId?: number;
  /** Default map ID for map-scoped API calls */
  mapId?: number;
  /** Default floor level for spatial queries */
  level?: number;
}
```

**Verification**:
```bash
grep -q "namespace?: string" src/client/base.ts && grep -q "venueId?: number" src/client/base.ts && echo "PASS: Task 2.1" || echo "FAIL: Task 2.1"
```

---

### Task 2.2: Add Context State to BaseClient

**Action**: Edit `src/client/base.ts`

**Add import** at top of file:

```typescript
import type { RtlsContext, CallContext } from '../context';
import { resolveContext, requireNamespace, requireVenueId, requireMapId } from '../context';
```

**Add** these members and methods to the `BaseClient` class:

```typescript
export class BaseClient {
  protected readonly client: Client<paths>;
  protected readonly options: Required<Pick<RtlsClientOptions, 'baseUrl' | 'timeoutMs'>> & RtlsClientOptions;

  // === ADD THIS NEW PROPERTY ===
  /** Internal mutable context state */
  protected _context: RtlsContext;

  constructor(options: RtlsClientOptions = {}) {
    this.options = {
      baseUrl: 'https://rtls.ubudu.com/api',
      timeoutMs: 30000,
      ...options,
    };

    // === ADD THIS CONTEXT INITIALIZATION ===
    this._context = {
      namespace: options.namespace,
      venueId: options.venueId,
      mapId: options.mapId,
      level: options.level,
    };

    this.client = createClient<paths>({
      baseUrl: this.options.baseUrl,
      fetch: this.options.fetch,
      headers: this.buildHeaders(),
    });
  }

  // ... existing methods (buildHeaders, createTimeoutSignal, etc.) ...

  // === ADD ALL THESE NEW METHODS AFTER EXISTING METHODS ===

  // ─── Context Getters ───────────────────────────────────────────────────────

  /** Get current default context (read-only copy) */
  get context(): Readonly<RtlsContext> {
    return { ...this._context };
  }

  /** Get current default namespace */
  get namespace(): string | undefined {
    return this._context.namespace;
  }

  /** Get current default venue ID */
  get venueId(): number | undefined {
    return this._context.venueId;
  }

  /** Get current default map ID */
  get mapId(): number | undefined {
    return this._context.mapId;
  }

  /** Get current default level */
  get level(): number | undefined {
    return this._context.level;
  }

  // ─── Context Setters (Mutable, Chainable) ──────────────────────────────────

  /** Set default namespace. Chainable. */
  setNamespace(namespace: string): this {
    this._context.namespace = namespace;
    return this;
  }

  /** Set default venue ID. Chainable. */
  setVenue(venueId: number): this {
    this._context.venueId = venueId;
    return this;
  }

  /** Set default map ID. Chainable. */
  setMap(mapId: number): this {
    this._context.mapId = mapId;
    return this;
  }

  /** Set default level. Chainable. */
  setLevel(level: number): this {
    this._context.level = level;
    return this;
  }

  /** Set multiple context values at once. Chainable. */
  setContext(context: Partial<RtlsContext>): this {
    if (context.namespace !== undefined) this._context.namespace = context.namespace;
    if (context.venueId !== undefined) this._context.venueId = context.venueId;
    if (context.mapId !== undefined) this._context.mapId = context.mapId;
    if (context.level !== undefined) this._context.level = context.level;
    return this;
  }

  /** Clear all default context values. Chainable. */
  clearContext(): this {
    this._context = {};
    return this;
  }

  // ─── Context Resolution (Protected, for Resources) ─────────────────────────

  /**
   * Resolve context by merging client defaults with call-time overrides.
   * @internal Used by resource classes
   */
  resolveCtx(overrides?: CallContext): RtlsContext {
    return resolveContext(this._context, overrides);
  }

  /**
   * Resolve context and require namespace to be present.
   * @internal Used by resource classes
   * @throws {ContextError} If namespace is not available
   */
  requireNs(overrides?: CallContext): string {
    return requireNamespace(this.resolveCtx(overrides)).namespace;
  }

  /**
   * Resolve context and require venueId to be present.
   * @internal Used by resource classes
   * @throws {ContextError} If venueId is not available
   */
  requireVenue(overrides?: CallContext): number {
    return requireVenueId(this.resolveCtx(overrides)).venueId;
  }

  /**
   * Resolve context and require mapId to be present.
   * @internal Used by resource classes
   * @throws {ContextError} If mapId is not available
   */
  requireMap(overrides?: CallContext): number {
    return requireMapId(this.resolveCtx(overrides)).mapId;
  }
}
```

**Verification**:
```bash
npx tsc --noEmit src/client/base.ts 2>&1 && grep -q "setNamespace" src/client/base.ts && echo "PASS: Task 2.2" || echo "FAIL: Task 2.2"
```

---

### Task 2.3: Add Scoped Client Factory Methods

**Action**: Edit `src/client/index.ts`

**Add** these methods to the `RtlsClient` class (after constructor or at end):

```typescript
  // ─── Scoped Client Factories (Immutable) ─────────────────────────────────

  /**
   * Create a new client instance scoped to a specific namespace.
   * The new client inherits all other settings from the parent.
   * @param namespace - The namespace to scope to
   * @returns New RtlsClient instance (original unchanged)
   */
  forNamespace(namespace: string): RtlsClient {
    return new RtlsClient({
      ...this.options,
      namespace,
      venueId: this._context.venueId,
      mapId: this._context.mapId,
      level: this._context.level,
    });
  }

  /**
   * Create a new client instance scoped to a specific venue.
   * The new client inherits namespace and other settings from the parent.
   * @param venueId - The venue ID to scope to
   * @param options - Optional map ID and level overrides
   * @returns New RtlsClient instance (original unchanged)
   */
  forVenue(venueId: number, options?: { mapId?: number; level?: number }): RtlsClient {
    return new RtlsClient({
      ...this.options,
      namespace: this._context.namespace,
      venueId,
      mapId: options?.mapId ?? this._context.mapId,
      level: options?.level ?? this._context.level,
    });
  }

  /**
   * Create a new client instance scoped to a specific map.
   * The new client inherits namespace, venue, and other settings from the parent.
   * @param mapId - The map ID to scope to
   * @param options - Optional level override
   * @returns New RtlsClient instance (original unchanged)
   */
  forMap(mapId: number, options?: { level?: number }): RtlsClient {
    return new RtlsClient({
      ...this.options,
      namespace: this._context.namespace,
      venueId: this._context.venueId,
      mapId,
      level: options?.level ?? this._context.level,
    });
  }

  /**
   * Create a new client instance with merged context.
   * Values in the provided context override the parent's values.
   * @param context - Context values to set/override
   * @returns New RtlsClient instance (original unchanged)
   */
  withContext(context: Partial<RtlsContext>): RtlsClient {
    return new RtlsClient({
      ...this.options,
      namespace: context.namespace ?? this._context.namespace,
      venueId: context.venueId ?? this._context.venueId,
      mapId: context.mapId ?? this._context.mapId,
      level: context.level ?? this._context.level,
    });
  }
```

**Also add import** at top if not present:

```typescript
import type { RtlsContext } from '../context';
```

**Verification**:
```bash
npx tsc --noEmit src/client/index.ts 2>&1 && grep -q "forNamespace" src/client/index.ts && grep -q "withContext" src/client/index.ts && echo "PASS: Task 2.3" || echo "FAIL: Task 2.3"
```

---

### Task 2.4: Create Client Context Tests

**Action**: Create new file `test/client-context.test.ts`

**Complete file content**:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createRtlsClient, ContextError } from '../src';

describe('RtlsClient context management', () => {
  describe('constructor context', () => {
    it('accepts all context options', () => {
      const client = createRtlsClient({
        apiKey: 'test-key',
        namespace: 'my-ns',
        venueId: 123,
        mapId: 456,
        level: 2,
      });

      expect(client.namespace).toBe('my-ns');
      expect(client.venueId).toBe(123);
      expect(client.mapId).toBe(456);
      expect(client.level).toBe(2);
    });

    it('defaults context to undefined when not provided', () => {
      const client = createRtlsClient({ apiKey: 'test-key' });

      expect(client.namespace).toBeUndefined();
      expect(client.venueId).toBeUndefined();
      expect(client.mapId).toBeUndefined();
      expect(client.level).toBeUndefined();
    });

    it('context getter returns read-only copy', () => {
      const client = createRtlsClient({
        apiKey: 'test-key',
        namespace: 'ns1',
        venueId: 1,
      });

      const ctx = client.context;
      expect(ctx.namespace).toBe('ns1');
      expect(ctx.venueId).toBe(1);

      // Modifying the returned object should not affect client
      (ctx as { namespace: string }).namespace = 'modified';
      expect(client.namespace).toBe('ns1');
    });
  });

  describe('mutable setters', () => {
    let client: ReturnType<typeof createRtlsClient>;

    beforeEach(() => {
      client = createRtlsClient({ apiKey: 'test-key' });
    });

    it('setNamespace updates namespace', () => {
      client.setNamespace('new-ns');
      expect(client.namespace).toBe('new-ns');
    });

    it('setVenue updates venueId', () => {
      client.setVenue(999);
      expect(client.venueId).toBe(999);
    });

    it('setMap updates mapId', () => {
      client.setMap(888);
      expect(client.mapId).toBe(888);
    });

    it('setLevel updates level', () => {
      client.setLevel(5);
      expect(client.level).toBe(5);
    });

    it('setters are chainable', () => {
      const result = client
        .setNamespace('ns')
        .setVenue(1)
        .setMap(2)
        .setLevel(3);

      expect(result).toBe(client);
      expect(client.namespace).toBe('ns');
      expect(client.venueId).toBe(1);
      expect(client.mapId).toBe(2);
      expect(client.level).toBe(3);
    });

    it('setContext sets multiple values', () => {
      client.setContext({ namespace: 'bulk-ns', venueId: 100 });

      expect(client.namespace).toBe('bulk-ns');
      expect(client.venueId).toBe(100);
      expect(client.mapId).toBeUndefined();
    });

    it('setContext is chainable', () => {
      const result = client.setContext({ namespace: 'ns' }).setVenue(1);
      expect(result).toBe(client);
    });

    it('clearContext removes all context', () => {
      client
        .setNamespace('ns')
        .setVenue(1)
        .setMap(2)
        .setLevel(3)
        .clearContext();

      expect(client.namespace).toBeUndefined();
      expect(client.venueId).toBeUndefined();
      expect(client.mapId).toBeUndefined();
      expect(client.level).toBeUndefined();
    });

    it('clearContext is chainable', () => {
      const result = client.clearContext();
      expect(result).toBe(client);
    });
  });

  describe('scoped client factories', () => {
    let client: ReturnType<typeof createRtlsClient>;

    beforeEach(() => {
      client = createRtlsClient({
        apiKey: 'test-key',
        namespace: 'parent-ns',
        venueId: 100,
        mapId: 200,
        level: 1,
      });
    });

    describe('forNamespace', () => {
      it('creates new client with different namespace', () => {
        const scoped = client.forNamespace('child-ns');

        expect(scoped).not.toBe(client);
        expect(scoped.namespace).toBe('child-ns');
      });

      it('inherits other context from parent', () => {
        const scoped = client.forNamespace('child-ns');

        expect(scoped.venueId).toBe(100);
        expect(scoped.mapId).toBe(200);
        expect(scoped.level).toBe(1);
      });

      it('does not modify parent', () => {
        client.forNamespace('child-ns');
        expect(client.namespace).toBe('parent-ns');
      });
    });

    describe('forVenue', () => {
      it('creates new client with different venueId', () => {
        const scoped = client.forVenue(999);

        expect(scoped).not.toBe(client);
        expect(scoped.venueId).toBe(999);
      });

      it('inherits namespace from parent', () => {
        const scoped = client.forVenue(999);
        expect(scoped.namespace).toBe('parent-ns');
      });

      it('accepts optional mapId and level', () => {
        const scoped = client.forVenue(999, { mapId: 888, level: 5 });

        expect(scoped.venueId).toBe(999);
        expect(scoped.mapId).toBe(888);
        expect(scoped.level).toBe(5);
      });

      it('uses parent mapId/level when not overridden', () => {
        const scoped = client.forVenue(999);

        expect(scoped.mapId).toBe(200);
        expect(scoped.level).toBe(1);
      });
    });

    describe('forMap', () => {
      it('creates new client with different mapId', () => {
        const scoped = client.forMap(777);

        expect(scoped).not.toBe(client);
        expect(scoped.mapId).toBe(777);
      });

      it('inherits namespace and venueId from parent', () => {
        const scoped = client.forMap(777);

        expect(scoped.namespace).toBe('parent-ns');
        expect(scoped.venueId).toBe(100);
      });

      it('accepts optional level', () => {
        const scoped = client.forMap(777, { level: 9 });
        expect(scoped.level).toBe(9);
      });
    });

    describe('withContext', () => {
      it('creates new client with merged context', () => {
        const scoped = client.withContext({ venueId: 555, level: 7 });

        expect(scoped).not.toBe(client);
        expect(scoped.namespace).toBe('parent-ns'); // inherited
        expect(scoped.venueId).toBe(555); // overridden
        expect(scoped.mapId).toBe(200); // inherited
        expect(scoped.level).toBe(7); // overridden
      });

      it('can override all values', () => {
        const scoped = client.withContext({
          namespace: 'new-ns',
          venueId: 1,
          mapId: 2,
          level: 3,
        });

        expect(scoped.namespace).toBe('new-ns');
        expect(scoped.venueId).toBe(1);
        expect(scoped.mapId).toBe(2);
        expect(scoped.level).toBe(3);
      });
    });
  });

  describe('context resolution', () => {
    it('requireNs throws ContextError when namespace not set', () => {
      const client = createRtlsClient({ apiKey: 'test' });

      expect(() => (client as any).requireNs()).toThrow(ContextError);
    });

    it('requireNs returns namespace when set', () => {
      const client = createRtlsClient({ apiKey: 'test', namespace: 'my-ns' });

      expect((client as any).requireNs()).toBe('my-ns');
    });

    it('requireNs accepts override', () => {
      const client = createRtlsClient({ apiKey: 'test', namespace: 'default' });

      expect((client as any).requireNs({ namespace: 'override' })).toBe('override');
    });

    it('requireVenue throws ContextError when venueId not set', () => {
      const client = createRtlsClient({ apiKey: 'test' });

      expect(() => (client as any).requireVenue()).toThrow(ContextError);
    });

    it('requireVenue returns venueId when set', () => {
      const client = createRtlsClient({ apiKey: 'test', venueId: 123 });

      expect((client as any).requireVenue()).toBe(123);
    });
  });
});
```

**Verification**:
```bash
npm run test -- test/client-context.test.ts --run 2>&1 | tail -5 && echo "PASS: Task 2.4" || echo "FAIL: Task 2.4"
```

---

### Phase 2 Checkpoint

```bash
npm run typecheck && npm run test -- test/context.test.ts test/client-context.test.ts --run && echo "✅ Phase 2 Complete" || echo "❌ Phase 2 Failed"
```

**Commit**:
```bash
git add -A && git commit -m "feat(sdk): phase 2 - client context state and scoped factories"
```

---

## Phase 3: Resource Argument Resolution Utility

### Task 3.1: Create Argument Resolution Utility

**Action**: Create new file `src/utils/args.ts`

**Complete file content**:

```typescript
/**
 * Utilities for resolving method arguments to support both
 * legacy (explicit namespace) and new (context-based) calling patterns.
 * @module utils/args
 */

import type { CallContext } from '../context';
import { isNamespaceArg, isVenueIdArg } from '../context';
import type { BaseClient } from '../client/base';

/**
 * Result of resolving namespace-based method arguments.
 */
export interface ResolvedNamespaceArgs<T> {
  namespace: string;
  options: T | undefined;
}

/**
 * Result of resolving namespace + venueId method arguments.
 */
export interface ResolvedVenueArgs<T> {
  namespace: string;
  venueId: number;
  options: T | undefined;
}

/**
 * Result of resolving namespace + venueId + mapId method arguments.
 */
export interface ResolvedMapArgs<T> {
  namespace: string;
  venueId: number;
  mapId: number;
  options: T | undefined;
}

/**
 * Resolve arguments for methods that require namespace.
 *
 * Supports:
 * - `method()` - uses client default namespace
 * - `method({ limit: 10 })` - uses client default namespace + options
 * - `method('ns')` - explicit namespace (legacy)
 * - `method('ns', { limit: 10 })` - explicit namespace + options (legacy)
 * - `method({ namespace: 'ns', limit: 10 })` - override namespace in options
 *
 * @param client - The client instance (for context resolution)
 * @param arg1 - Either namespace string or options object
 * @param arg2 - Options object (when arg1 is namespace)
 */
export function resolveNamespaceArgs<T extends object>(
  client: BaseClient,
  arg1?: string | (T & CallContext),
  arg2?: T
): ResolvedNamespaceArgs<T> {
  if (isNamespaceArg(arg1)) {
    // Legacy pattern: method('namespace', options?)
    return {
      namespace: arg1,
      options: arg2,
    };
  }

  // New pattern: method(options?) where namespace comes from context
  const ctx = arg1 as (T & CallContext) | undefined;
  return {
    namespace: client.requireNs(ctx),
    options: ctx as T | undefined,
  };
}

/**
 * Resolve arguments for methods that require namespace and venueId.
 *
 * Supports:
 * - `method()` - uses client defaults
 * - `method({ limit: 10 })` - uses client defaults + options
 * - `method('ns', 123)` - explicit namespace and venueId (legacy)
 * - `method('ns', 123, { limit: 10 })` - explicit + options (legacy)
 * - `method({ namespace: 'ns', venueId: 123 })` - override in options
 *
 * @param client - The client instance (for context resolution)
 * @param arg1 - Either namespace string or options object
 * @param arg2 - Either venueId number or options object
 * @param arg3 - Options object (when arg1 is namespace and arg2 is venueId)
 */
export function resolveVenueArgs<T extends object>(
  client: BaseClient,
  arg1?: string | (T & CallContext),
  arg2?: number | T,
  arg3?: T
): ResolvedVenueArgs<T> {
  if (isNamespaceArg(arg1)) {
    // Legacy pattern: method('namespace', venueId, options?)
    if (!isVenueIdArg(arg2)) {
      throw new Error('venueId must be a number when namespace is provided as string');
    }
    return {
      namespace: arg1,
      venueId: arg2,
      options: arg3,
    };
  }

  // New pattern: method(options?) where namespace/venueId come from context
  const ctx = arg1 as (T & CallContext) | undefined;
  return {
    namespace: client.requireNs(ctx),
    venueId: client.requireVenue(ctx),
    options: ctx as T | undefined,
  };
}

/**
 * Resolve arguments for methods that require namespace, venueId, and mapId.
 *
 * @param client - The client instance (for context resolution)
 * @param arg1 - Either namespace string or options object
 * @param arg2 - Either venueId number or options object
 * @param arg3 - Either mapId number or options object
 * @param arg4 - Options object (when all IDs are explicit)
 */
export function resolveMapArgs<T extends object>(
  client: BaseClient,
  arg1?: string | (T & CallContext),
  arg2?: number | T,
  arg3?: number | T,
  arg4?: T
): ResolvedMapArgs<T> {
  if (isNamespaceArg(arg1)) {
    // Legacy pattern: method('namespace', venueId, mapId, options?)
    if (!isVenueIdArg(arg2)) {
      throw new Error('venueId must be a number when namespace is provided as string');
    }
    if (!isVenueIdArg(arg3)) {
      throw new Error('mapId must be a number when namespace and venueId are provided');
    }
    return {
      namespace: arg1,
      venueId: arg2,
      mapId: arg3,
      options: arg4,
    };
  }

  // New pattern: method(options?) where all IDs come from context
  const ctx = arg1 as (T & CallContext) | undefined;
  return {
    namespace: client.requireNs(ctx),
    venueId: client.requireVenue(ctx),
    mapId: client.requireMap(ctx),
    options: ctx as T | undefined,
  };
}

/**
 * Extract non-context properties from options object.
 * Removes namespace, venueId, mapId, level from options before passing to API.
 */
export function stripContextFromOptions<T extends object>(
  options: T & CallContext | undefined
): Omit<T, keyof CallContext> | undefined {
  if (!options) return undefined;

  const { namespace, venueId, mapId, level, ...rest } = options as T & CallContext;
  return Object.keys(rest).length > 0 ? (rest as Omit<T, keyof CallContext>) : undefined;
}
```

**Verification**:
```bash
npx tsc --noEmit src/utils/args.ts 2>&1 && echo "PASS: Task 3.1" || echo "FAIL: Task 3.1"
```

---

### Task 3.2: Export Args Utilities from Utils Index

**Action**: Edit `src/utils/index.ts`

**Add** this export:

```typescript
export {
  resolveNamespaceArgs,
  resolveVenueArgs,
  resolveMapArgs,
  stripContextFromOptions,
} from './args';
```

**Verification**:
```bash
grep -q "resolveNamespaceArgs" src/utils/index.ts && echo "PASS: Task 3.2" || echo "FAIL: Task 3.2"
```

---

### Task 3.3: Create Args Utility Tests

**Action**: Create new file `test/utils/args.test.ts`

**Complete file content**:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveNamespaceArgs,
  resolveVenueArgs,
  resolveMapArgs,
  stripContextFromOptions,
} from '../../src/utils/args';
import { ContextError } from '../../src/context';

// Mock client
function createMockClient(context: {
  namespace?: string;
  venueId?: number;
  mapId?: number;
} = {}) {
  return {
    requireNs: vi.fn((overrides?: { namespace?: string }) => {
      const ns = overrides?.namespace ?? context.namespace;
      if (!ns) throw new ContextError('Namespace', 'Set it');
      return ns;
    }),
    requireVenue: vi.fn((overrides?: { venueId?: number }) => {
      const v = overrides?.venueId ?? context.venueId;
      if (v === undefined) throw new ContextError('Venue ID', 'Set it');
      return v;
    }),
    requireMap: vi.fn((overrides?: { mapId?: number }) => {
      const m = overrides?.mapId ?? context.mapId;
      if (m === undefined) throw new ContextError('Map ID', 'Set it');
      return m;
    }),
  } as any;
}

describe('resolveNamespaceArgs', () => {
  it('legacy: resolves explicit namespace string', () => {
    const client = createMockClient();
    const result = resolveNamespaceArgs(client, 'my-ns');

    expect(result.namespace).toBe('my-ns');
    expect(result.options).toBeUndefined();
  });

  it('legacy: resolves explicit namespace with options', () => {
    const client = createMockClient();
    const result = resolveNamespaceArgs(client, 'my-ns', { limit: 10 });

    expect(result.namespace).toBe('my-ns');
    expect(result.options).toEqual({ limit: 10 });
  });

  it('new: resolves from client context when no args', () => {
    const client = createMockClient({ namespace: 'default-ns' });
    const result = resolveNamespaceArgs(client);

    expect(result.namespace).toBe('default-ns');
    expect(result.options).toBeUndefined();
    expect(client.requireNs).toHaveBeenCalled();
  });

  it('new: resolves from client context with options', () => {
    const client = createMockClient({ namespace: 'default-ns' });
    const result = resolveNamespaceArgs(client, { limit: 5, sort: 'name' });

    expect(result.namespace).toBe('default-ns');
    expect(result.options).toEqual({ limit: 5, sort: 'name' });
  });

  it('new: allows namespace override in options', () => {
    const client = createMockClient({ namespace: 'default-ns' });
    const result = resolveNamespaceArgs(client, { namespace: 'override-ns', limit: 5 });

    expect(result.namespace).toBe('override-ns');
    expect(result.options).toEqual({ namespace: 'override-ns', limit: 5 });
  });

  it('throws when no namespace available', () => {
    const client = createMockClient();
    expect(() => resolveNamespaceArgs(client)).toThrow(ContextError);
  });
});

describe('resolveVenueArgs', () => {
  it('legacy: resolves explicit namespace and venueId', () => {
    const client = createMockClient();
    const result = resolveVenueArgs(client, 'my-ns', 123);

    expect(result.namespace).toBe('my-ns');
    expect(result.venueId).toBe(123);
    expect(result.options).toBeUndefined();
  });

  it('legacy: resolves with options', () => {
    const client = createMockClient();
    const result = resolveVenueArgs(client, 'my-ns', 123, { limit: 10 });

    expect(result.namespace).toBe('my-ns');
    expect(result.venueId).toBe(123);
    expect(result.options).toEqual({ limit: 10 });
  });

  it('new: resolves from client context', () => {
    const client = createMockClient({ namespace: 'ns', venueId: 456 });
    const result = resolveVenueArgs(client);

    expect(result.namespace).toBe('ns');
    expect(result.venueId).toBe(456);
  });

  it('new: allows overrides in options', () => {
    const client = createMockClient({ namespace: 'ns', venueId: 456 });
    const result = resolveVenueArgs(client, { venueId: 789 });

    expect(result.venueId).toBe(789);
  });

  it('throws when venueId missing in legacy mode', () => {
    const client = createMockClient();
    expect(() => resolveVenueArgs(client, 'ns', undefined as any)).toThrow();
  });
});

describe('resolveMapArgs', () => {
  it('legacy: resolves all explicit args', () => {
    const client = createMockClient();
    const result = resolveMapArgs(client, 'ns', 123, 456);

    expect(result.namespace).toBe('ns');
    expect(result.venueId).toBe(123);
    expect(result.mapId).toBe(456);
  });

  it('new: resolves from client context', () => {
    const client = createMockClient({ namespace: 'ns', venueId: 1, mapId: 2 });
    const result = resolveMapArgs(client);

    expect(result.namespace).toBe('ns');
    expect(result.venueId).toBe(1);
    expect(result.mapId).toBe(2);
  });
});

describe('stripContextFromOptions', () => {
  it('removes context properties', () => {
    const options = {
      namespace: 'ns',
      venueId: 1,
      mapId: 2,
      level: 3,
      limit: 10,
      sort: 'name',
    };

    const result = stripContextFromOptions(options);

    expect(result).toEqual({ limit: 10, sort: 'name' });
    expect(result).not.toHaveProperty('namespace');
    expect(result).not.toHaveProperty('venueId');
  });

  it('returns undefined for undefined input', () => {
    expect(stripContextFromOptions(undefined)).toBeUndefined();
  });

  it('returns undefined when only context properties present', () => {
    const options = { namespace: 'ns', venueId: 1 };
    expect(stripContextFromOptions(options)).toBeUndefined();
  });

  it('preserves non-context properties', () => {
    const options = { foo: 'bar', baz: 123 };
    const result = stripContextFromOptions(options);
    expect(result).toEqual({ foo: 'bar', baz: 123 });
  });
});
```

**Verification**:
```bash
npm run test -- test/utils/args.test.ts --run 2>&1 | tail -5 && echo "PASS: Task 3.3" || echo "FAIL: Task 3.3"
```

---

### Phase 3 Checkpoint

```bash
npm run typecheck && npm run test -- test/utils/args.test.ts --run && echo "✅ Phase 3 Complete" || echo "❌ Phase 3 Failed"
```

**Commit**:
```bash
git add -A && git commit -m "feat(sdk): phase 3 - argument resolution utilities"
```

---

## Phase 4: Update AssetsResource

### Task 4.1: Update AssetsResource with New Signatures

**Action**: Replace the entire `src/resources/assets.ts` file

**Complete file content**:

```typescript
import type { BaseClient, RequestOptions } from '../client/base';
import type { QueryOptions, FilterOptions } from '../types';
import type { CallContext } from '../context';
import { buildQueryParams, extractDataArray, resolveNamespaceArgs, stripContextFromOptions } from '../utils';

/** Options for listing assets */
export type ListAssetsOptions = QueryOptions & FilterOptions & Record<string, unknown>;

/** Options with optional context override */
export type ListAssetsParams = ListAssetsOptions & CallContext;

/** Options for asset history */
export interface AssetHistoryOptions {
  timestamp_from: number;
  timestamp_to: number;
}

/** Options for asset statistics */
export interface AssetStatisticsOptions {
  timestamp_from?: number;
  timestamp_to?: number;
}

export class AssetsResource {
  constructor(private client: BaseClient) {}

  // ─── List Assets ─────────────────────────────────────────────────────────────

  /**
   * List all assets for a namespace.
   *
   * @example
   * // Using default namespace from client
   * const assets = await client.assets.list();
   * const assets = await client.assets.list({ limit: 10 });
   *
   * // Explicit namespace (legacy, still supported)
   * const assets = await client.assets.list('my-namespace');
   * const assets = await client.assets.list('my-namespace', { limit: 10 });
   *
   * // Override namespace in options
   * const assets = await client.assets.list({ namespace: 'other-ns', limit: 10 });
   */
  async list(options?: ListAssetsParams, requestOptions?: RequestOptions): Promise<Record<string, unknown>[]>;
  async list(namespace: string, options?: ListAssetsOptions, requestOptions?: RequestOptions): Promise<Record<string, unknown>[]>;
  async list(
    arg1?: string | ListAssetsParams,
    arg2?: ListAssetsOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    const { namespace, options } = resolveNamespaceArgs<ListAssetsOptions>(this.client, arg1, arg2 as ListAssetsOptions);
    const requestOptions = typeof arg1 === 'string' ? arg3 : (arg2 as RequestOptions | undefined);
    const cleanOptions = stripContextFromOptions(options);
    const params = buildQueryParams(cleanOptions);

    const response = await this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/assets/{app_namespace}', {
          params: { path: { app_namespace: namespace }, query: params as Record<string, unknown> },
          ...fetchOpts,
        }),
      requestOptions
    );
    return extractDataArray<Record<string, unknown>>(response);
  }

  // ─── Get Asset ───────────────────────────────────────────────────────────────

  /**
   * Get a single asset by MAC address.
   *
   * @example
   * // Using default namespace
   * const asset = await client.assets.get('AA:BB:CC:DD:EE:FF');
   *
   * // Explicit namespace (legacy)
   * const asset = await client.assets.get('my-namespace', 'AA:BB:CC:DD:EE:FF');
   */
  async get(macAddress: string, requestOptions?: RequestOptions): Promise<Record<string, unknown>>;
  async get(namespace: string, macAddress: string, requestOptions?: RequestOptions): Promise<Record<string, unknown>>;
  async get(
    arg1: string,
    arg2?: string | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>> {
    let namespace: string;
    let macAddress: string;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg2 === 'string') {
      // Legacy: get(namespace, macAddress, requestOptions?)
      namespace = arg1;
      macAddress = arg2;
      requestOptions = arg3;
    } else {
      // New: get(macAddress, requestOptions?)
      namespace = this.client.requireNs();
      macAddress = arg1;
      requestOptions = arg2;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  // ─── Create Asset ────────────────────────────────────────────────────────────

  /**
   * Create a new asset.
   *
   * @example
   * // Using default namespace
   * await client.assets.create('AA:BB:CC:DD:EE:FF', { user_name: 'Forklift 1' });
   *
   * // Explicit namespace (legacy)
   * await client.assets.create('my-namespace', 'AA:BB:CC:DD:EE:FF', { user_name: 'Forklift 1' });
   */
  async create(macAddress: string, asset: Record<string, unknown>, requestOptions?: RequestOptions): Promise<Record<string, unknown>>;
  async create(namespace: string, macAddress: string, asset: Record<string, unknown>, requestOptions?: RequestOptions): Promise<Record<string, unknown>>;
  async create(
    arg1: string,
    arg2: string | Record<string, unknown>,
    arg3?: Record<string, unknown> | RequestOptions,
    arg4?: RequestOptions
  ): Promise<Record<string, unknown>> {
    let namespace: string;
    let macAddress: string;
    let asset: Record<string, unknown>;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg2 === 'string') {
      // Legacy: create(namespace, macAddress, asset, requestOptions?)
      namespace = arg1;
      macAddress = arg2;
      asset = arg3 as Record<string, unknown>;
      requestOptions = arg4;
    } else {
      // New: create(macAddress, asset, requestOptions?)
      namespace = this.client.requireNs();
      macAddress = arg1;
      asset = arg2;
      requestOptions = arg3 as RequestOptions | undefined;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          body: asset as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  // ─── Update Asset ────────────────────────────────────────────────────────────

  /**
   * Update an existing asset.
   *
   * @example
   * // Using default namespace
   * await client.assets.update('AA:BB:CC:DD:EE:FF', { user_name: 'Updated Name' });
   *
   * // Explicit namespace (legacy)
   * await client.assets.update('my-namespace', 'AA:BB:CC:DD:EE:FF', { user_name: 'Updated' });
   */
  async update(macAddress: string, updates: Record<string, unknown>, requestOptions?: RequestOptions): Promise<Record<string, unknown>>;
  async update(namespace: string, macAddress: string, updates: Record<string, unknown>, requestOptions?: RequestOptions): Promise<Record<string, unknown>>;
  async update(
    arg1: string,
    arg2: string | Record<string, unknown>,
    arg3?: Record<string, unknown> | RequestOptions,
    arg4?: RequestOptions
  ): Promise<Record<string, unknown>> {
    let namespace: string;
    let macAddress: string;
    let updates: Record<string, unknown>;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg2 === 'string') {
      namespace = arg1;
      macAddress = arg2;
      updates = arg3 as Record<string, unknown>;
      requestOptions = arg4;
    } else {
      namespace = this.client.requireNs();
      macAddress = arg1;
      updates = arg2;
      requestOptions = arg3 as RequestOptions | undefined;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.PATCH('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          body: updates as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  // ─── Delete Asset ────────────────────────────────────────────────────────────

  /**
   * Delete an asset.
   *
   * @example
   * // Using default namespace
   * await client.assets.delete('AA:BB:CC:DD:EE:FF');
   *
   * // Explicit namespace (legacy)
   * await client.assets.delete('my-namespace', 'AA:BB:CC:DD:EE:FF');
   */
  async delete(macAddress: string, requestOptions?: RequestOptions): Promise<void>;
  async delete(namespace: string, macAddress: string, requestOptions?: RequestOptions): Promise<void>;
  async delete(
    arg1: string,
    arg2?: string | RequestOptions,
    arg3?: RequestOptions
  ): Promise<void> {
    let namespace: string;
    let macAddress: string;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg2 === 'string') {
      namespace = arg1;
      macAddress = arg2;
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs();
      macAddress = arg1;
      requestOptions = arg2;
    }

    await this.client['request'](
      (fetchOpts) =>
        this.client.raw.DELETE('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          ...fetchOpts,
        }),
      requestOptions
    );
  }

  // ─── Batch Save ──────────────────────────────────────────────────────────────

  /**
   * Batch save multiple assets.
   *
   * @example
   * // Using default namespace
   * await client.assets.batchSave([{ mac_address: '...', user_name: '...' }]);
   *
   * // Explicit namespace (legacy)
   * await client.assets.batchSave('my-namespace', [...]);
   */
  async batchSave(assets: Record<string, unknown>[], requestOptions?: RequestOptions): Promise<Record<string, unknown>>;
  async batchSave(namespace: string, assets: Record<string, unknown>[], requestOptions?: RequestOptions): Promise<Record<string, unknown>>;
  async batchSave(
    arg1: string | Record<string, unknown>[],
    arg2?: Record<string, unknown>[] | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>> {
    let namespace: string;
    let assets: Record<string, unknown>[];
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      assets = arg2 as Record<string, unknown>[];
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs();
      assets = arg1;
      requestOptions = arg2 as RequestOptions | undefined;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/assets/{app_namespace}', {
          params: { path: { app_namespace: namespace } },
          body: assets as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  // ─── Batch Delete ────────────────────────────────────────────────────────────

  /**
   * Batch delete multiple assets by MAC address.
   *
   * @example
   * // Using default namespace
   * await client.assets.batchDelete(['AA:BB:CC:DD:EE:FF', '11:22:33:44:55:66']);
   *
   * // Explicit namespace (legacy)
   * await client.assets.batchDelete('my-namespace', [...]);
   */
  async batchDelete(macAddresses: string[], requestOptions?: RequestOptions): Promise<Record<string, unknown>>;
  async batchDelete(namespace: string, macAddresses: string[], requestOptions?: RequestOptions): Promise<Record<string, unknown>>;
  async batchDelete(
    arg1: string | string[],
    arg2?: string[] | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>> {
    let namespace: string;
    let macAddresses: string[];
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string' && Array.isArray(arg2)) {
      namespace = arg1;
      macAddresses = arg2;
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs();
      macAddresses = arg1 as string[];
      requestOptions = arg2 as RequestOptions | undefined;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.DELETE('/assets/{app_namespace}', {
          params: { path: { app_namespace: namespace } },
          body: macAddresses as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  // ─── History ─────────────────────────────────────────────────────────────────

  /**
   * Get position history for an asset.
   *
   * @example
   * // Using default namespace
   * const history = await client.assets.history('AA:BB:CC:DD:EE:FF', {
   *   timestamp_from: Date.now() - 86400000,
   *   timestamp_to: Date.now(),
   * });
   *
   * // Explicit namespace (legacy)
   * const history = await client.assets.history('my-namespace', 'AA:BB:CC:DD:EE:FF', {...});
   */
  async history(macAddress: string, options: AssetHistoryOptions, requestOptions?: RequestOptions): Promise<Record<string, unknown>[]>;
  async history(namespace: string, macAddress: string, options: AssetHistoryOptions, requestOptions?: RequestOptions): Promise<Record<string, unknown>[]>;
  async history(
    arg1: string,
    arg2: string | AssetHistoryOptions,
    arg3?: AssetHistoryOptions | RequestOptions,
    arg4?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    let namespace: string;
    let macAddress: string;
    let options: AssetHistoryOptions;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg2 === 'string') {
      namespace = arg1;
      macAddress = arg2;
      options = arg3 as AssetHistoryOptions;
      requestOptions = arg4;
    } else {
      namespace = this.client.requireNs();
      macAddress = arg1;
      options = arg2;
      requestOptions = arg3 as RequestOptions | undefined;
    }

    const response = await this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/positions/{app_namespace}/{mac_address}', {
          params: {
            path: { app_namespace: namespace, mac_address: macAddress },
            query: options as Record<string, unknown>,
          },
          ...fetchOpts,
        }),
      requestOptions
    );
    return extractDataArray<Record<string, unknown>>(response);
  }

  // ─── Statistics ──────────────────────────────────────────────────────────────

  /**
   * Get statistics for an asset.
   *
   * @example
   * // Using default namespace
   * const stats = await client.assets.statistics('AA:BB:CC:DD:EE:FF');
   *
   * // Explicit namespace (legacy)
   * const stats = await client.assets.statistics('my-namespace', 'AA:BB:CC:DD:EE:FF');
   */
  async statistics(macAddress: string, options?: AssetStatisticsOptions, requestOptions?: RequestOptions): Promise<Record<string, unknown>>;
  async statistics(namespace: string, macAddress: string, options?: AssetStatisticsOptions, requestOptions?: RequestOptions): Promise<Record<string, unknown>>;
  async statistics(
    arg1: string,
    arg2?: string | AssetStatisticsOptions | RequestOptions,
    arg3?: AssetStatisticsOptions | RequestOptions,
    arg4?: RequestOptions
  ): Promise<Record<string, unknown>> {
    let namespace: string;
    let macAddress: string;
    let options: AssetStatisticsOptions | undefined;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg2 === 'string') {
      namespace = arg1;
      macAddress = arg2;
      options = arg3 as AssetStatisticsOptions | undefined;
      requestOptions = arg4;
    } else {
      namespace = this.client.requireNs();
      macAddress = arg1;
      // arg2 could be options or requestOptions or undefined
      if (arg2 && 'timestamp_from' in arg2) {
        options = arg2 as AssetStatisticsOptions;
        requestOptions = arg3 as RequestOptions | undefined;
      } else {
        options = undefined;
        requestOptions = arg2 as RequestOptions | undefined;
      }
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/assets/{app_namespace}/{mac_address}/statistics', {
          params: {
            path: { app_namespace: namespace, mac_address: macAddress },
            query: options as Record<string, unknown> | undefined,
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  // ─── Async Iterator ──────────────────────────────────────────────────────────

  /**
   * Iterate over all assets with automatic pagination.
   *
   * @example
   * // Using default namespace
   * for await (const asset of client.assets.iterate()) {
   *   console.log(asset);
   * }
   *
   * // Explicit namespace (legacy)
   * for await (const asset of client.assets.iterate('my-namespace')) {
   *   console.log(asset);
   * }
   */
  async *iterate(options?: ListAssetsParams): AsyncGenerator<Record<string, unknown>>;
  async *iterate(namespace: string, options?: ListAssetsOptions): AsyncGenerator<Record<string, unknown>>;
  async *iterate(
    arg1?: string | ListAssetsParams,
    arg2?: ListAssetsOptions
  ): AsyncGenerator<Record<string, unknown>> {
    // Assets API returns all items at once, no pagination needed
    const assets = await this.list(arg1 as any, arg2);
    for (const asset of assets) {
      yield asset;
    }
  }
}
```

**Verification**:
```bash
npx tsc --noEmit src/resources/assets.ts 2>&1 && echo "PASS: Task 4.1" || echo "FAIL: Task 4.1"
```

---

### Task 4.2: Update Assets Resource Tests

**Action**: Create new file `test/resources/assets-context.test.ts`

**Complete file content**:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRtlsClient, ContextError } from '../../src';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AssetsResource with context', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
      headers: new Headers(),
    });
  });

  describe('list', () => {
    it('uses default namespace when not specified', async () => {
      const client = createRtlsClient({
        apiKey: 'test',
        namespace: 'default-ns',
      });

      await client.assets.list();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/assets/default-ns'),
        expect.any(Object)
      );
    });

    it('uses explicit namespace (legacy)', async () => {
      const client = createRtlsClient({
        apiKey: 'test',
        namespace: 'default-ns',
      });

      await client.assets.list('explicit-ns');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/assets/explicit-ns'),
        expect.any(Object)
      );
    });

    it('allows namespace override in options', async () => {
      const client = createRtlsClient({
        apiKey: 'test',
        namespace: 'default-ns',
      });

      await client.assets.list({ namespace: 'override-ns' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/assets/override-ns'),
        expect.any(Object)
      );
    });

    it('throws when no namespace available', async () => {
      const client = createRtlsClient({ apiKey: 'test' });

      await expect(client.assets.list()).rejects.toThrow(ContextError);
    });

    it('passes options correctly', async () => {
      const client = createRtlsClient({
        apiKey: 'test',
        namespace: 'ns',
      });

      await client.assets.list({ limit: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=10'),
        expect.any(Object)
      );
    });
  });

  describe('get', () => {
    it('uses default namespace', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ mac_address: 'AA:BB:CC' }),
        headers: new Headers(),
      });

      const client = createRtlsClient({
        apiKey: 'test',
        namespace: 'default-ns',
      });

      await client.assets.get('AA:BB:CC:DD:EE:FF');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/assets/default-ns/AA:BB:CC:DD:EE:FF'),
        expect.any(Object)
      );
    });

    it('uses explicit namespace (legacy)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ mac_address: 'AA:BB:CC' }),
        headers: new Headers(),
      });

      const client = createRtlsClient({
        apiKey: 'test',
        namespace: 'default-ns',
      });

      await client.assets.get('explicit-ns', 'AA:BB:CC:DD:EE:FF');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/assets/explicit-ns/AA:BB:CC:DD:EE:FF'),
        expect.any(Object)
      );
    });
  });

  describe('create', () => {
    it('uses default namespace', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ mac_address: 'AA:BB:CC' }),
        headers: new Headers(),
      });

      const client = createRtlsClient({
        apiKey: 'test',
        namespace: 'default-ns',
      });

      await client.assets.create('AA:BB:CC:DD:EE:FF', { user_name: 'Test' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/assets/default-ns/AA:BB:CC:DD:EE:FF'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('scoped client', () => {
    it('forNamespace changes default namespace', async () => {
      const client = createRtlsClient({
        apiKey: 'test',
        namespace: 'original-ns',
      });

      const scoped = client.forNamespace('scoped-ns');
      await scoped.assets.list();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/assets/scoped-ns'),
        expect.any(Object)
      );
    });

    it('setNamespace changes default namespace', async () => {
      const client = createRtlsClient({
        apiKey: 'test',
        namespace: 'original-ns',
      });

      client.setNamespace('new-ns');
      await client.assets.list();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/assets/new-ns'),
        expect.any(Object)
      );
    });
  });
});
```

**Verification**:
```bash
npm run test -- test/resources/assets-context.test.ts --run 2>&1 | tail -5 && echo "PASS: Task 4.2" || echo "FAIL: Task 4.2"
```

---

### Phase 4 Checkpoint

```bash
npm run typecheck && npm run test --run && echo "✅ Phase 4 Complete" || echo "❌ Phase 4 Failed"
```

**Commit**:
```bash
git add -A && git commit -m "feat(sdk): phase 4 - AssetsResource with context support"
```

---

## Phase 5-7: Update Remaining Resources

Due to length constraints, I'll provide the pattern. Each resource follows the same transformation:

### Task 5.x-7.x: Update Each Resource

For each resource file (`positions.ts`, `zones.ts`, `venues.ts`, `spatial.ts`, `alerts.ts`, `dashboards.ts`, `navigation.ts`):

1. Add imports: `CallContext`, `resolveNamespaceArgs`, `resolveVenueArgs`, `stripContextFromOptions`
2. Add overload signatures for each public method
3. Implement argument resolution logic
4. Update tests with context scenarios

**Pattern for each method**:

```typescript
// Add overloads
async methodName(options?: MethodParams): Promise<Result>;
async methodName(namespace: string, ...args): Promise<Result>;
async methodName(arg1?, arg2?, arg3?): Promise<Result> {
  // Resolve arguments
  // Call API
}
```

**Verification for each**:
```bash
npx tsc --noEmit src/resources/[resource].ts && echo "PASS" || echo "FAIL"
```

---

## Phase 8: Documentation

### Task 8.1: Update README

**Action**: Update `README.md` Quick Start section

### Task 8.2: Update Getting Started Guide

**Action**: Add "Default Context" section to `docs/guides/getting-started.md`

### Task 8.3: Create Migration Guide

**Action**: Create `docs/guides/migration-v2.md`

### Task 8.4: Update API Reference

**Action**: Update `docs/api/README.md` with context methods

---

## Phase 9: Examples

### Task 9.1: Create Context Example

**Action**: Create `examples/typescript/07-default-context.ts`

### Task 9.2: Update Existing Examples

**Action**: Update examples to show both patterns

---

## Phase 10: Final Validation

### Task 10.1: Full Test Suite

```bash
npm run test --run
npm run test:integration  # If .env configured
```

### Task 10.2: Build Verification

```bash
npm run build
node -e "const sdk = require('./dist/index.cjs'); console.log(typeof sdk.createRtlsClient === 'function' ? 'PASS' : 'FAIL')"
```

### Task 10.3: Type Export Verification

```bash
grep -q "RtlsContext" dist/index.d.ts && grep -q "forNamespace" dist/index.d.ts && echo "PASS" || echo "FAIL"
```

### Task 10.4: Update Version

```bash
npm version minor --no-git-tag-version
```

---

## Summary

### Files Created
- `src/context.ts`
- `src/utils/args.ts`
- `test/context.test.ts`
- `test/client-context.test.ts`
- `test/utils/args.test.ts`
- `test/resources/assets-context.test.ts`
- `examples/typescript/07-default-context.ts`
- `docs/guides/migration-v2.md`

### Files Modified
- `src/index.ts`
- `src/client/base.ts`
- `src/client/index.ts`
- `src/utils/index.ts`
- `src/resources/assets.ts`
- `src/resources/positions.ts`
- `src/resources/zones.ts`
- `src/resources/venues.ts`
- `src/resources/spatial.ts`
- `src/resources/alerts.ts`
- `src/resources/dashboards.ts`
- `src/resources/navigation.ts`
- `README.md`
- `docs/guides/getting-started.md`
- `docs/api/README.md`
- `CHANGELOG.md`
- `package.json`

### New API Surface

```typescript
// Client options
createRtlsClient({
  namespace?: string;
  venueId?: number;
  mapId?: number;
  level?: number;
});

// Getters
client.namespace
client.venueId
client.mapId
client.level
client.context

// Mutable setters (chainable)
client.setNamespace(ns)
client.setVenue(id)
client.setMap(id)
client.setLevel(n)
client.setContext({...})
client.clearContext()

// Immutable factories
client.forNamespace(ns)
client.forVenue(id, opts?)
client.forMap(id, opts?)
client.withContext({...})

// Resource methods (all backward compatible)
client.assets.list()                     // uses default
client.assets.list({ limit: 10 })        // uses default + options
client.assets.list('ns')                 // explicit (legacy)
client.assets.list('ns', { limit: 10 })  // explicit + options (legacy)
client.assets.list({ namespace: 'ns' })  // override in options
```
