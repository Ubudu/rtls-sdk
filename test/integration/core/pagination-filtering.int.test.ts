// Core live tests L-P1…L-P6 (P1 §9): the three pagination models and both filter grammars against production,
// tier R, GET only. They settle U1 (venue `filters=<JSON>`), U6 (documents `limit`/`offset`) and U7 (the USI-P1-1
// shapes). Venues and assets are compared by id or MAC sets and by counts; nothing live is printed.
import {
  applyFilters,
  collectAll,
  extractDataArray,
  filters,
  isArrayResponse,
  normalizeListResponse,
  normalizePage,
  paginate,
  paginateOffset,
  paginatePages,
  serializeFilters,
  type OffsetPage,
  type Page,
} from '../../../src';
import {
  createLiveClient,
  describeLive,
  expectKnownServerIssue,
  getHarness,
  recordFact,
  requestLog,
  testName,
} from '../harness';
import { sameSet } from './support/recording-fetch';
import { auditReadOnlyRequests } from './support/request-audit';

interface LiveVenue {
  id: number;
  name: string;
}

interface LiveAsset {
  user_udid: string;
  user_type?: unknown;
  user_name?: unknown;
}

const ns = (): string => getHarness().env.namespace;

function venueIds(list: readonly LiveVenue[]): string[] {
  return list.map((v) => String(v.id));
}

async function plainVenues(): Promise<LiveVenue[]> {
  return await createLiveClient().transport.request<LiveVenue[]>('GET', '/venues/{namespace}', {
    params: { namespace: ns() },
  });
}

/** L-P1: one venue → the collected array equals the plain list; more → USI-P1-2 (`total === limit`). */
async function expectPagedVenues(
  plain: readonly LiveVenue[],
  collected: readonly LiveVenue[],
  firstPage: Page<LiveVenue> | LiveVenue[]
): Promise<void> {
  if (plain.length === 1) {
    expect(sameSet(venueIds(collected), venueIds(plain))).toBe(true);
    expect(collected).toHaveLength(1);
    return;
  }
  await expectKnownServerIssue(
    'USI-P1-2',
    'venue array routes apply limit twice: pagination.total equals limit and hasNext is false',
    () => {
      const page = normalizePage(firstPage);
      expect(page.pagination.total).toBe(1);
      expect(page.pagination.hasNext).toBe(false);
    }
  );
}

/** L-P2: the venue grammar either filters (U1 holds) or USI-P1-1 also covers `filters=` (O8). */
async function expectVenueGrammar(
  plain: readonly LiveVenue[],
  byName: readonly LiveVenue[],
  byUnknownName: readonly LiveVenue[],
  venue: LiveVenue
): Promise<void> {
  const works =
    byName.length === 1 && String(byName[0]?.id) === String(venue.id) && byUnknownName.length === 0;
  if (works) {
    expect(sameSet(venueIds(byName), [String(venue.id)])).toBe(true);
    expect(byUnknownName).toEqual([]);
    return;
  }
  await expectKnownServerIssue(
    'USI-P1-1',
    'venue routes ignore or break the filters=<JSON> grammar',
    () => {
      const ignored = sameSet(venueIds(byName), venueIds(plain)) && byName.length > 1;
      const emptied = byName.length === 0;
      const unknownNotFiltered = byUnknownName.length > 0;
      expect(ignored || emptied || unknownNotFiltered).toBe(true);
    }
  );
}

describeLive('R', 'core pagination and filtering', () => {
  auditReadOnlyRequests();

  it('L-P1 paginatePages over the venue envelope makes one call', async () => {
    const plain = await plainVenues();
    expect(plain.length).toBeGreaterThanOrEqual(1);
    const client = createLiveClient();
    let firstPage: Page<LiveVenue> | LiveVenue[] = [];
    const collected = await collectAll(
      paginatePages(
        async (_page, limit) => {
          const response = await client.transport.request<Page<LiveVenue> | LiveVenue[]>(
            'GET',
            '/venues/{namespace}',
            { params: { namespace: ns() }, query: { limit } }
          );
          firstPage = response;
          return response;
        },
        { limit: 1 }
      )
    );
    const paged = requestLog().filter(
      (e) => e.template === '/venues/{namespace}' && e.query.limit === '1'
    );
    expect(paged).toHaveLength(1);
    expect(Array.isArray(firstPage)).toBe(false);
    recordFact('L-P1.venues', plain.length);
    await expectPagedVenues(plain, collected, firstPage);

    // A bare-array page shorter than the limit ends the iteration (the plain list ignores paging).
    const fromArray = await collectAll(
      paginatePages(
        async () =>
          await client.transport.request<LiveVenue[]>('GET', '/venues/{namespace}', {
            params: { namespace: ns() },
          }),
        { limit: plain.length + 1 }
      )
    );
    expect(sameSet(venueIds(fromArray), venueIds(plain)) && fromArray.length === plain.length).toBe(
      true
    );
  });

  it('L-P2 the venue grammar filters=<JSON> selects by name (U1)', async () => {
    const plain = await plainVenues();
    const venue = plain[0] as LiveVenue;
    expect(typeof venue.name === 'string' && venue.name.length > 0).toBe(true);
    const client = createLiveClient();
    const query = serializeFilters(filters.equals('name', venue.name), 'venue');
    expect(Object.keys(query)).toEqual(['filters']);
    const byName = await client.transport.request<LiveVenue[]>('GET', '/venues/{namespace}', {
      params: { namespace: ns() },
      query,
    });
    const byUnknownName = await client.transport.request<LiveVenue[]>(
      'GET',
      '/venues/{namespace}',
      {
        params: { namespace: ns() },
        query: serializeFilters(filters.equals('name', testName('no-such-venue')), 'venue'),
      }
    );
    expect(Array.isArray(byName) && Array.isArray(byUnknownName)).toBe(true);
    recordFact('U1.byNameCount', byName.length);
    recordFact('U1.byUnknownNameCount', byUnknownName.length);
    recordFact(
      'U1.venueFiltersJsonWorks',
      byName.length === 1 &&
        String(byName[0]?.id) === String(venue.id) &&
        byUnknownName.length === 0
    );
    await expectVenueGrammar(plain, byName, byUnknownName, venue);
  });

  it('L-P3 page and universal field:op keys empty venue lists (USI-P1-1, U7)', async () => {
    const plain = await plainVenues();
    expect(plain.length).toBeGreaterThanOrEqual(1);
    const venue = plain[0] as LiveVenue;
    const client = createLiveClient();
    const paged = await client.transport.request<unknown>('GET', '/venues/{namespace}', {
      params: { namespace: ns() },
      query: { page: 1 },
    });
    const universal = await client.transport.request<unknown>('GET', '/venues/{namespace}', {
      params: { namespace: ns() },
      query: serializeFilters(filters.equals('name', venue.name), 'universal'),
    });
    const pagedEnvelope =
      typeof paged === 'object' && paged !== null && !Array.isArray(paged) && 'pagination' in paged;
    recordFact('U7.pageIsEnvelope', pagedEnvelope);
    recordFact(
      'U7.pageDataCount',
      Array.isArray((paged as { data?: unknown }).data)
        ? (paged as { data: unknown[] }).data.length
        : null
    );
    recordFact(
      'U7.pageTotal',
      (paged as { pagination?: { total?: number } }).pagination?.total ?? null
    );
    recordFact('U7.universalIsArray', Array.isArray(universal));
    recordFact('U7.universalCount', Array.isArray(universal) ? universal.length : null);
    await expectKnownServerIssue(
      'USI-P1-1',
      'venue routes return no venue for page and universal field:op keys',
      () => {
        const page = paged as Page<LiveVenue>;
        expect(pagedEnvelope).toBe(true);
        expect(page.data).toEqual([]);
        expect(page.pagination.total).toBe(0);
        expect(universal).toEqual([]);
      }
    );
  });

  it('L-P4 the deprecated helpers read the same venues as L-P1', async () => {
    const plain = await plainVenues();
    const client = createLiveClient();
    const envelope = await client.transport.request<Page<LiveVenue>>('GET', '/venues/{namespace}', {
      params: { namespace: ns() },
      query: { limit: 100 },
    });
    const legacy: LiveVenue[] = [];
    for await (const venue of paginate<LiveVenue>(async (_page, limit) => {
      return await client.transport.request<Page<LiveVenue>>('GET', '/venues/{namespace}', {
        params: { namespace: ns() },
        query: { limit },
      });
    })) {
      legacy.push(venue);
    }
    const viaFetcher = await collectAll<LiveVenue>(async (_page, limit) => {
      return await client.transport.request<Page<LiveVenue>>('GET', '/venues/{namespace}', {
        params: { namespace: ns() },
        query: { limit },
      });
    });
    const ids = venueIds(plain);
    expect(sameSet(venueIds(legacy), ids) && legacy.length === plain.length).toBe(true);
    expect(sameSet(venueIds(viaFetcher), ids) && viaFetcher.length === plain.length).toBe(true);
    expect(isArrayResponse(plain)).toBe(true);
    const flat = normalizeListResponse(plain);
    expect(sameSet(venueIds(flat.data), ids)).toBe(true);
    expect(flat.total).toBe(plain.length);
    expect(flat.hasNext).toBe(false);
    expect(sameSet(venueIds(extractDataArray<LiveVenue>(envelope)), ids)).toBe(true);
    expect(sameSet(venueIds(extractDataArray<LiveVenue>(plain)), ids)).toBe(true);
    expect(extractDataArray<LiveVenue>(null)).toEqual([]);
    const page = normalizePage(envelope);
    expect(page).toBe(envelope);
    expect(sameSet(venueIds(page.data), ids)).toBe(true);
    expect(page.pagination.total).toBe(plain.length);
    const synthetic = normalizePage(plain, { page: 1, limit: 50 });
    expect(synthetic.pagination).toEqual({
      page: 1,
      limit: 50,
      total: plain.length,
      totalPages: plain.length > 0 ? 1 : 0,
      hasNext: false,
      hasPrev: false,
    });
    expect(normalizeListResponse(flat)).toBe(flat);
    const nested = normalizePage(flat);
    expect(nested.pagination.total).toBe(plain.length);
    expect(normalizePage({ data: plain }).pagination.total).toBe(plain.length);
  });

  it('L-P5 applyFilters equals the server key/value filter and pages like the server', async () => {
    const client = createLiveClient();
    const params = { app_namespace: ns() };
    const assets = await client.transport.request<LiveAsset[]>('GET', '/assets/{app_namespace}', {
      params,
    });
    const type = assets
      .map((a) => a.user_type)
      .find((t): t is string => typeof t === 'string' && t !== '');
    expect(typeof type).toBe('string');
    const server = await client.transport.request<LiveAsset[]>('GET', '/assets/{app_namespace}', {
      params,
      query: { key: 'user_type', value: type as string },
    });
    const local = applyFilters(assets, { filters: filters.equals('user_type', type as string) });
    expect(local.data.length).toBe(server.length);
    expect(
      sameSet(
        local.data.map((a) => a.user_udid),
        server.map((a) => a.user_udid)
      )
    ).toBe(true);
    recordFact('L-P5.assets', assets.length);
    recordFact('L-P5.sameTypeAssets', server.length);

    const page = applyFilters(assets, { sort: 'user_name:asc', page: 2, limit: 5 });
    expect(page.pagination).toEqual({
      page: 2,
      limit: 5,
      total: assets.length,
      totalPages: Math.ceil(assets.length / 5),
      hasNext: 2 < Math.ceil(assets.length / 5),
      hasPrev: true,
    });
    expect(page.data.length).toBe(Math.max(0, Math.min(5, assets.length - 5)));
  });

  it('L-P6 paginateOffset over asset documents; limit and offset are echoed (U6)', async () => {
    const client = createLiveClient();
    const assets = await client.transport.request<LiveAsset[]>('GET', '/assets/{app_namespace}', {
      params: { app_namespace: ns() },
    });
    const mac = assets[0]?.user_udid as string;
    expect(typeof mac).toBe('string');
    const params = { namespace: ns(), mac_address: mac };
    const direct = await client.transport.request<OffsetPage<unknown>>(
      'GET',
      '/assets/{namespace}/{mac_address}/documents',
      { params, query: { limit: 1, offset: 0 } }
    );
    expect(direct.limit).toBe(1);
    expect(direct.offset).toBe(0);
    expect(Array.isArray(direct.items)).toBe(true);
    expect(typeof direct.total).toBe('number');
    recordFact('U6.documentsLimitEchoed', direct.limit === 1);
    recordFact('U6.documentsOffsetEchoed', direct.offset === 0);
    recordFact('U6.documentsTotal', direct.total ?? null);

    const collected = await collectAll(
      paginateOffset(
        async (offset, limit) =>
          await client.transport.request<OffsetPage<unknown>>(
            'GET',
            '/assets/{namespace}/{mac_address}/documents',
            { params, query: { limit, offset } }
          ),
        { limit: 1, maxPages: 3 }
      )
    );
    expect(collected.length).toBe(Math.min(direct.total ?? 0, 3));
    const pages = requestLog().filter(
      (e) => e.template === '/assets/{namespace}/{mac_address}/documents'
    );
    expect(pages.length - 1 <= 3).toBe(true);
  });
});
