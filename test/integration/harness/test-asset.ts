// Test-asset helper (P0 §6.2 test-asset.ts, P7 H-P0-1). Creates an asset on the run's test MAC `testMac(n)`,
// named `testName(label)`, independent of the SDK. The MAC must be free (`GET` answers 404), else nothing is
// created. The delete is registered with the cleanup registry, verified by a 404. Allowed in any block where
// W-class writes are admitted (a W block, or an S block with tier W enabled); the guard rejects it elsewhere
// (G4) and when the preflight forbids asset writes (G18), so the block declares `ruleEngine: true`.
import { registerCleanup } from './cleanup';
import { testMac, testName } from './names';
import { rawRequest } from './raw';

export interface TestAsset {
  mac: string;
  /** status of the create (201 `Created` for a new asset) */
  status: number;
  /** body text of the create */
  body: string;
  /** `Content-Type` of the create response, or null when absent (U6) */
  contentType: string | null;
}

export async function createTestAsset(n: number, label: string): Promise<TestAsset> {
  const mac = testMac(n);
  const name = testName(label);
  const path = `/assets/{ns}/${mac}`;
  const existing = await rawRequest('GET', path);
  if (existing.status !== 404) {
    throw new Error(`createTestAsset: ${mac} is not free (GET answered ${existing.status})`);
  }
  const created = await rawRequest('POST', path, { body: { user_udid: mac, user_name: name } });
  // Registered as soon as the create was answered: a 404 on the undo counts as already gone.
  registerCleanup({
    label: `test asset ${mac}`,
    request: { method: 'DELETE', path },
    verify: { path, goneStatus: [404] },
  });
  if (created.status !== 200 && created.status !== 201) {
    throw new Error(`createTestAsset: the create of ${mac} answered ${created.status}`);
  }
  return {
    mac,
    status: created.status,
    body: created.text,
    contentType: created.headers.get('content-type'),
  };
}
