/**
 * Integration tests for context features.
 * Requires .env with RTLS_API_KEY and APP_NAMESPACE
 */

import { describe, it, expect } from 'vitest';
import { createRtlsClient, ContextError } from '../../src';
import { TEST_CONFIG, hasCredentials } from './setup';

const API_KEY = TEST_CONFIG.apiKey;
const NAMESPACE = TEST_CONFIG.namespace;

describe.skipIf(!hasCredentials())('Context Integration Tests', () => {
  describe('Client with default namespace', () => {
    const client = createRtlsClient({
      apiKey: API_KEY!,
      namespace: NAMESPACE!,
    });

    it('lists assets without explicit namespace', async () => {
      const assets = await client.assets.list();
      expect(Array.isArray(assets)).toBe(true);
    });

    it('lists cached positions without explicit namespace', async () => {
      const positions = await client.positions.listCached();
      expect(Array.isArray(positions)).toBe(true);
    });

    it('lists venues without explicit namespace', async () => {
      const venues = await client.venues.list();
      expect(Array.isArray(venues)).toBe(true);
    });

    it('allows namespace override per-call', async () => {
      // Should work with override (uses same namespace for simplicity)
      const assets = await client.assets.list({ namespace: NAMESPACE });
      expect(Array.isArray(assets)).toBe(true);
    });

    it('supports legacy explicit namespace syntax', async () => {
      const assets = await client.assets.list(NAMESPACE!);
      expect(Array.isArray(assets)).toBe(true);
    });
  });

  describe('Client without default namespace', () => {
    const client = createRtlsClient({ apiKey: API_KEY! });

    it('throws ContextError when namespace not provided', async () => {
      await expect(client.assets.list()).rejects.toThrow(ContextError);
    });

    it('works when namespace provided explicitly', async () => {
      const assets = await client.assets.list(NAMESPACE!);
      expect(Array.isArray(assets)).toBe(true);
    });

    it('works when namespace provided in options', async () => {
      const assets = await client.assets.list({ namespace: NAMESPACE });
      expect(Array.isArray(assets)).toBe(true);
    });
  });

  describe('Mutable setters', () => {
    it('setNamespace changes default namespace', async () => {
      const client = createRtlsClient({ apiKey: API_KEY! });

      // Initially no namespace
      expect(client.namespace).toBeUndefined();

      // Set namespace
      client.setNamespace(NAMESPACE!);
      expect(client.namespace).toBe(NAMESPACE);

      // Should now work without explicit namespace
      const assets = await client.assets.list();
      expect(Array.isArray(assets)).toBe(true);
    });

    it('setters are chainable', () => {
      const client = createRtlsClient({ apiKey: API_KEY! });

      const result = client.setNamespace(NAMESPACE!).setVenue(123).setLevel(0);

      expect(result).toBe(client);
      expect(client.namespace).toBe(NAMESPACE);
      expect(client.venueId).toBe(123);
      expect(client.level).toBe(0);
    });

    it('clearContext resets all defaults', () => {
      const client = createRtlsClient({
        apiKey: API_KEY!,
        namespace: NAMESPACE!,
        venueId: 123,
      });

      client.clearContext();

      expect(client.namespace).toBeUndefined();
      expect(client.venueId).toBeUndefined();
    });
  });

  describe('Scoped clients (immutable)', () => {
    it('forNamespace creates new client with different namespace', async () => {
      const client = createRtlsClient({ apiKey: API_KEY! });
      const scopedClient = client.forNamespace(NAMESPACE!);

      // Original unchanged
      expect(client.namespace).toBeUndefined();

      // Scoped client has namespace
      expect(scopedClient.namespace).toBe(NAMESPACE);

      // Scoped client works
      const assets = await scopedClient.assets.list();
      expect(Array.isArray(assets)).toBe(true);
    });

    it('withContext creates client with multiple overrides', () => {
      const client = createRtlsClient({ apiKey: API_KEY!, namespace: 'original' });

      const scopedClient = client.withContext({
        namespace: NAMESPACE!,
        venueId: 999,
        level: 2,
      });

      // Original unchanged
      expect(client.namespace).toBe('original');
      expect(client.venueId).toBeUndefined();

      // Scoped client has overrides
      expect(scopedClient.namespace).toBe(NAMESPACE);
      expect(scopedClient.venueId).toBe(999);
      expect(scopedClient.level).toBe(2);
    });
  });

  describe('Spatial queries with context', () => {
    const client = createRtlsClient({
      apiKey: API_KEY!,
      namespace: NAMESPACE!,
    });

    it('nearestZones works with default namespace', async () => {
      const result = await client.spatial.nearestZones({
        lat: 48.8566,
        lon: 2.3522,
        limit: 5,
      });
      expect(result).toHaveProperty('reference_point');
    });
  });
});
