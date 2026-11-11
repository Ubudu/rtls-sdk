// MSW handlers of the positions-spatial domain, owned by P3 (README §6). A thin aggregator: the positions half
// (group A) and the spatial half (group B) live in test/resources/positions-spatial/support/, so the two groups
// never edit one file. Handlers only answer: request assertions use recordRequests() from test/mocks/server.ts.
import type { HttpHandler } from 'msw';
import { positionsHandlers } from '../../resources/positions-spatial/support/positions-handlers';
import { spatialHandlers } from '../../resources/positions-spatial/support/spatial-handlers';

export const handlers: HttpHandler[] = [...positionsHandlers, ...spatialHandlers];
