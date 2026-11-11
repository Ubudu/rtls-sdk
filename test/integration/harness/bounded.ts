// Bounded reads (LIVE-TESTING §2.8, P0 §6.2 bounded.ts, G12).
import { HOUR_MS } from './policy';

export const BOUNDED_SIZE = 50;

/** The last hour: `{ timestampFrom: now − 1 h, timestampTo: now }` (epoch ms). */
export function lastHour(now: number = Date.now()): { timestampFrom: number; timestampTo: number } {
  return boundedRange(1, now);
}

/** The last `hours` hours (0 < hours ≤ 168, the G12 span cap of 7 days). */
export function boundedRange(
  hours: number,
  now: number = Date.now()
): { timestampFrom: number; timestampTo: number } {
  if (!(typeof hours === 'number' && hours > 0 && hours <= 168)) {
    throw new RangeError('boundedRange: hours must be > 0 and ≤ 168');
  }
  return { timestampFrom: Math.round(now - hours * HOUR_MS), timestampTo: Math.round(now) };
}
