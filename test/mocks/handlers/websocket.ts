// MSW handlers of the websocket domain, owned by P8 (README §6). Created by P1 (P1-T21) as an empty array, wired into
// handlers/index.ts. The WebSocket tests do not use MSW, so it stays empty (P8 §3).
import type { HttpHandler } from 'msw';

export const handlers: HttpHandler[] = [];
