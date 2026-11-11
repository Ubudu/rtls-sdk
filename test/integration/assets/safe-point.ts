// P2 §9.5 safe-point fixture: a thin adapter over the harness's discover() + safePublishPoint() (P0 §6.2). It returns
// the declared-location fields of a point outside every zone of the discovered map, or null when there is none
// (the declared-locations S block then skips with "no safe publish point"; never an arbitrary fallback point).
import { discover, safePublishPoint } from '../harness';

export interface SafePoint {
  lat: number;
  lng: number;
  level: number;
  map_uuid: string;
  venue_id: number;
}

export async function safePoint(): Promise<SafePoint | null> {
  const d = await discover();
  const p = safePublishPoint(d);
  if (p === null) return null;
  return { lat: p.lat, lng: p.lng, level: p.level, map_uuid: d.mapUuid, venue_id: d.venueId };
}

/** The block's location, or a skip of the current test with "no safe publish point" (vitest's skip throws). */
export function locationOrSkip<T>(ctx: { skip: (note?: string) => void }, location: T | null): T {
  if (location === null) {
    ctx.skip('no safe publish point');
    throw new Error('no safe publish point');
  }
  return location;
}
