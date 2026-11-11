// Default MSW handlers of the unit suites: the handler arrays of every domain file (CONVENTIONS §6), concatenated.
// Each domain owns its file (README §6); this index only imports and concatenates them (P1-T21).
import type { HttpHandler } from 'msw';
import { handlers as coreHandlers } from './core';
import { handlers as assetsHandlers } from './assets';
import { handlers as positionsSpatialHandlers } from './positions-spatial';
import { handlers as venuesNavigationHandlers } from './venues-navigation';
import { handlers as dashboardsRulesHandlers } from './dashboards-rules';
import { handlers as notificationsHandlers } from './notifications';
import { handlers as etlHandlers } from './etl';
import { handlers as websocketHandlers } from './websocket';

export const handlers: HttpHandler[] = [
  ...coreHandlers,
  ...assetsHandlers,
  ...positionsSpatialHandlers,
  ...venuesNavigationHandlers,
  ...dashboardsRulesHandlers,
  ...notificationsHandlers,
  ...etlHandlers,
  ...websocketHandlers,
];
