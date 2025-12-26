import { describe, it, expect, vi } from 'vitest';
import {
  resolveNamespaceArgs,
  resolveVenueArgs,
  resolveMapArgs,
  stripContextFromOptions,
} from '../../src/utils/args';
import { ContextError } from '../../src/context';

// Mock client
function createMockClient(
  context: {
    namespace?: string;
    venueId?: number;
    mapId?: number;
  } = {}
) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
