import { afterAll, afterEach, beforeAll, beforeEach, expect } from 'vitest';
import { server } from './mocks/server';

export { server };

// Requests to loopback servers that a test starts itself (for example a local WebSocket server) pass
// through; any other request without an MSW handler fails the test.
const LOOPBACK_HOSTNAMES = ['127.0.0.1', 'localhost', '[::1]'];

beforeAll(() =>
  server.listen({
    onUnhandledRequest(req, print) {
      if (LOOPBACK_HOSTNAMES.includes(new URL(req.url).hostname)) return;
      print.error();
    },
  })
);

// A test without a single assertion fails (P0 §5.4 runtime complement of the lint rules).
beforeEach(() => {
  expect.hasAssertions();
});

afterEach(() => server.resetHandlers());

afterAll(() => server.close());
