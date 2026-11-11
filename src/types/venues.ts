/**
 * Venue, map and zone-presence types. Hand-written: the spec's venue components do not describe the wire
 * (USI-P4-1, USI-P4-2). The flat zone/POI/path types live in `./geojson`.
 *
 * @module types/venues
 */
import type { RequestOptions } from '../client/base';
import type { CallContext } from '../context';
import type { FilterOptions } from '../types';
import type { PathNodeType } from './geojson';

/** A position with `lng` (venue routes; navigation uses `lon`). */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Counters of a venue. */
export interface VenueStatistics {
  zones: number;
  pois: number;
  pathNodes: number;
  pathSegments: number;
  floors: number[];
}

/** Item of `GET /venues/{ns}`. Hand-written: the spec's `location`/`metadata` are never returned (USI-P4-1). */
export interface VenueSummary {
  id: number;
  name: string;
  address?: string;
  coordinates: LatLng;
  hasMetadata?: boolean;
  lastUpdated?: string;
  statistics: VenueStatistics;
}

/** Opening hours: `"HH:MM - HH:MM"` or `"Closed"`, day keys as the venue editor stores them. */
export interface VenueOpeningHours {
  week: Record<string, string>;
  specificDays: Record<string, string>;
}

/**
 * `GET /venues/{ns}/{venueId}`. Hand-written: for an unknown id the server answers 200 `{ id, statistics }`
 * (USI-P4-2), so `name` and `coordinates` are optional.
 */
export interface VenueDetails {
  id: number;
  name?: string;
  address?: string;
  coordinates?: LatLng;
  metadata?: {
    externalVenueId?: number;
    applicationNamespace?: string;
    createdAt?: string;
    updatedAt?: string;
    isActive?: boolean;
    timezone?: string;
    openingHours?: VenueOpeningHours;
    context?: { description?: string; venueType?: string; primaryActivities?: string };
    statistics?: {
      totalZones: number;
      totalPOIs: number;
      totalPathNodes: number;
      totalPathSegments: number;
      floors: number[];
      lastDataSync?: string;
    };
  };
  statistics?: VenueStatistics;
}

/** A venue (0.2 name). */
export type Venue = VenueDetails;

/** `[[lat, lng], [lat, lng]]`: latitude first, unlike GeoJSON; Leaflet accepts it as is. */
export type LatLngBounds = [[number, number], [number, number]];

/** Item of `GET /venues/{ns}/{venueId}/maps`. Hand-written: the spec has no map schema. Several maps may share a level. */
export interface IndoorMap {
  id: number;
  uuid: string;
  name: string;
  level: number;
  /**
   * Template with literal `{z}`, `{x}`, `{y}`; substitute on the raw string, never after `new URL()` (it encodes the
   * braces).
   */
  tiles_url_base: string;
  map_bounds: LatLngBounds;
  map_features?: unknown;
  beacons_positions?: unknown;
}

/** An indoor map (0.2 name). */
export type MapData = IndoorMap;

/**
 * A POI as the sample-data route `/maps/{mapId}/pois` returns it. Hand-written: the spec types that route as GeoJSON.
 * @deprecated wire shape of the sample-data endpoint `/maps/{mapId}/pois` (USI-P4-6)
 */
export interface RawPoi {
  _id: string;
  name: string;
  description?: string;
  coordinates: LatLng;
  level: number;
  tags?: string[];
  color?: string;
  index?: number;
  externalId?: number;
  externalVenueId?: number;
  externalApplicationId?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Body of `GET /venues/{ns}/{venueId}/maps/{mapId}/pois`: `{ items, total }`, not GeoJSON (spec gap).
 * @deprecated sample data only; always empty for real namespaces (USI-P4-6). Use `venues.listPois({ level })`.
 */
export interface MapPoisResponse {
  items: RawPoi[];
  total: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
}

/** Options of `venues.list` / `venues.iterate`. */
export type ListVenuesOptions = {
  /** Sent to the server as `filters=<JSON>`. */
  filters?: FilterOptions;
} & CallContext &
  RequestOptions;

/** Options of `venues.listMaps`. A per-call `level` filters by floor (the client's default level is not applied). */
export type ListMapsOptions = { filters?: FilterOptions } & CallContext & RequestOptions;

/** Options of the zone lists. A per-call `level` filters by floor (the client's default level is not applied). */
export type ListZonesOptions = {
  filters?: FilterOptions;
  /**
   * Keeps zones whose `tags` contain this exact string (sent inside `filters=<JSON>`, where the value stays a
   * string).
   */
  tag?: string;
} & CallContext &
  RequestOptions;

/** Options of the POI lists. A per-call `level` filters by floor (the client's default level is not applied). */
export type ListPoisOptions = {
  filters?: FilterOptions;
  /**
   * Keeps POIs whose `tags` contain this exact string (sent inside `filters=<JSON>`, where the value stays a
   * string).
   */
  tag?: string;
} & CallContext &
  RequestOptions;

/** Options of the path lists. A per-call `level` filters by floor (the client's default level is not applied). */
export type ListPathsOptions = {
  filters?: FilterOptions;
  /** Keeps nodes of this `node_type` (segments have no `node_type`, so they are dropped). */
  nodeType?: PathNodeType;
} & CallContext &
  RequestOptions;

/** Options of `zones.getPresence`. */
export interface ZonePresenceOptions {
  /** Epoch ms, `Date` or ISO string; default `timestampTo` − 24 h. */
  timestampFrom?: Date | number | string;
  /** Epoch ms, `Date` or ISO string; default now. */
  timestampTo?: Date | number | string;
  /**
   * Asset udid (MAC). When `key` is absent or `'user.udid'`, a valid MAC is normalised to the stored 12-lowercase-hex
   * form; anything else is sent verbatim. Omitted: the server returns the asset with the most documents in the
   * range, not all assets.
   */
  value?: string;
  /** ES fixed interval matching `/^[1-9]\d*(ms|s|m|h|d)$/`; default chosen by the server from the range. */
  interval?: string;
  /** @deprecated only `user.udid` (the default) returns data (USI-P4-18). */
  key?: string;
}

/**
 * One time slot of `zones.getPresence`. Hand-written: the spec declares no response schema. Occupied slot: the zone
 * of one position document of the slot plus `timestamp`. Empty slot: `{ id: 0, name: 'OUTSIDE_ALL_ZONES',
 * timestamp }`. Document without zone: `{ name: 'UNKNOWN_ZONE', timestamp }`.
 */
export interface ZonePresenceSlot {
  id?: number;
  name: 'OUTSIDE_ALL_ZONES' | 'UNKNOWN_ZONE' | (string & {});
  tags?: string[] | null;
  color?: string | null;
  /** Slot start, epoch ms. */
  timestamp: number;
}
