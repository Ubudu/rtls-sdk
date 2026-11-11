// Feature flags of the run (P0 §6.2 features.ts): read from `.state/<runId>/features.json`, which global
// setup writes from its feature probes (notifications: unread_count 200; ETL: mapping-profiles 200).
import { activeHarness } from './active';

export type FeatureName = 'notifications' | 'etl';

export function feature(name: FeatureName): boolean {
  if (name !== 'notifications' && name !== 'etl')
    throw new TypeError(`unknown feature ${String(name)}`);
  return activeHarness().feature(name);
}
