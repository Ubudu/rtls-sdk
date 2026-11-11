// Known server issues (README §7.8, P0 §6.2 known-issues.ts). A live test asserts today's server behaviour through
// `expectKnownServerIssue(id, description, currentBehaviour)`: the callback holds the assertions of the current
// (defective) behaviour; when they no longer hold, the server behaves correctly and the test fails with an explicit
// instruction to update the SDK workaround, the test and UPSTREAM-ISSUES.md. The id is a USI id of the phase's
// upstream fragment (`USI-P<n>-<m>`).

export const USI_ID_RE = /^USI-P\d+-\d+$/;

/** The known issue no longer reproduces: the server changed. */
export class KnownIssueResolved extends Error {
  readonly id: string;
  constructor(id: string, description: string, options?: { cause?: unknown }) {
    super(
      `Known server issue ${id} no longer reproduces: ${description}. Update the SDK workaround, this test and UPSTREAM-ISSUES.md.`,
      options
    );
    this.name = 'KnownIssueResolved';
    this.id = id;
  }
}

/**
 * Runs the assertions that encode today's server behaviour; if they throw, fails with
 * `Known server issue <id> no longer reproduces: <description>. Update the SDK workaround, this test and
 * UPSTREAM-ISSUES.md.` (the failed assertion is the `cause`). Every caller passes all three arguments.
 */
export async function expectKnownServerIssue(
  id: string,
  description: string,
  currentBehaviour: () => void | Promise<void>
): Promise<void> {
  if (typeof id !== 'string' || !USI_ID_RE.test(id)) {
    throw new TypeError(`expectKnownServerIssue: id must match ${String(USI_ID_RE)}`);
  }
  if (typeof description !== 'string' || description.trim() === '') {
    throw new TypeError('expectKnownServerIssue: description required');
  }
  if (typeof currentBehaviour !== 'function') {
    throw new TypeError('expectKnownServerIssue: currentBehaviour must be a function');
  }
  try {
    await currentBehaviour();
  } catch (error) {
    throw new KnownIssueResolved(id, description, { cause: error });
  }
}
