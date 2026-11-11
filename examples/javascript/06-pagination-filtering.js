// Write section: tier none; budget positions=0 notifications=0 ble=0 etl=0; read skips none
/**
 * 06 - Pagination and filtering
 *
 * The three listing models of the SDK and the filter DSL:
 *   1. the server returns everything (assets): only key/value reach the server, filters, sort and limit are
 *      evaluated by the SDK, exactly as applyFilters() does locally;
 *   2. venue listings: a whole array, iterated with collectAll() and a bound;
 *   3. offset pages (asset documents): OffsetPage with total, limit and offset, iterated with paginateOffset();
 *   4. venue-route filters and the level shorthand;
 *   5. the two filter serialisations.
 * Read-only.
 *
 *   npm run js -- javascript/06-pagination-filtering.js      (from examples/)
 */
import {
  applyFilters,
  collectAll,
  combineFilters,
  filters,
  paginateOffset,
  serializeFilters,
} from 'ubudu-rtls-sdk';
import { runExample } from '../shared/config.js';

await runExample('06-pagination-filtering', async ({ client, log }) => {
  // 1. Server returns everything: GET /assets/{namespace} answers with every asset.
  const all = await client.assets.list();
  log(`assets: ${all.length}`);

  // key/value is the one server-side filter of the asset list (exact match on a field).
  const [cached] = await client.positions.listCached();
  if (cached) {
    const byUdid = await client.assets.list({ key: 'user_udid', value: cached.user_udid });
    log(`assets with the udid of the first cached position: ${byUdid.length}`);
  }

  // filters, sort and limit are applied by the SDK; applyFilters() gives the same result on the full list.
  const typed = all.find((a) => typeof a.user_type === 'string' && a.user_type !== '');
  if (typed?.user_type) {
    const query = {
      filters: filters.equals('user_type', typed.user_type),
      sort: 'user_name:asc',
      limit: 5,
    };
    const listed = await client.assets.list(query);
    const local = applyFilters(all, query).data;
    const same = listed.map((a) => a.user_udid).join() === local.map((a) => a.user_udid).join();
    log(
      `first 5 assets of one type, sorted by name: ${listed.length} (local evaluation identical: ${same})`
    );
    if (!same) throw new Error('assets.list() and applyFilters() disagree');
  } else {
    log('no asset has a user_type: filter comparison not run');
  }

  // 2. Venue listing: venues.list() returns the whole array (the SDK sends no page or limit to venue routes);
  //    iterate() yields the same items, and collectAll() bounds any iteration.
  const venues = await client.venues.list();
  const firstTen = await collectAll(client.venues.iterate(), { maxItems: 10 });
  log(`venues: ${venues.length}, collected with maxItems 10: ${firstTen.length}`);
  if (firstTen.length !== Math.min(venues.length, 10))
    throw new Error('collectAll() bound not respected');

  // 3. Offset model: the documents of one asset, two at a time.
  const firstAsset = all[0];
  if (firstAsset) {
    const page = await client.assetDocuments.listPage(firstAsset.user_udid, {
      limit: 2,
      offset: 0,
    });
    log(
      `documents of the first asset: ${page.items.length} item(s), total=${page.total ?? 'unknown'} limit=${page.limit} offset=${page.offset}`
    );

    // paginateOffset() turns any limit/offset call into a lazy iterator; maxPages bounds the requests.
    const docs = await collectAll(
      paginateOffset(
        (offset, limit, signal) =>
          client.assetDocuments.listPage(firstAsset.user_udid, { limit, offset, signal }),
        { limit: 2, maxPages: 3 }
      ),
      { maxItems: 6 }
    );
    log(`documents through paginateOffset (at most 3 pages of 2): ${docs.length}`);
  }

  // 4. Venue-route filters: an explicit filter and the level shorthand build the same query.
  const venue = venues[0];
  if (!venue) throw new Error('the namespace has no venue');
  client.setVenue(venue.id);
  const [map] = await client.venues.listMaps();
  if (!map) throw new Error('the venue has no map');
  const byFilter = await client.zones.list({
    filters: filters.equals('properties.level', map.level),
  });
  const byLevel = await client.zones.list({ level: map.level });
  log(
    `zones on level ${map.level}: filter ${byFilter.features.length}, shorthand ${byLevel.features.length}`
  );
  if (byFilter.features.length !== byLevel.features.length)
    throw new Error('filter and level shorthand disagree');

  // 5. Serialisation: universal routes take field:op keys, venue routes one JSON filter parameter.
  const f = combineFilters(
    filters.equals('properties.level', 0),
    filters.contains('properties.name', 'dock')
  );
  log(`universal: ${JSON.stringify(serializeFilters(f, 'universal'))}`);
  log(`venue: ${JSON.stringify(serializeFilters(f, 'venue'))}`);
});
