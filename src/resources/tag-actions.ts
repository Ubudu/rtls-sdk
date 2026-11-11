/**
 * BLE and ESL tag actions (`client.tagActions`).
 *
 * @module resources/tag-actions
 */
import type { RequestOptions } from '../client/base';
import { ResourceBase } from '../client/resource';
import type { CallContext } from '../context';
import { ServerError, ValidationError } from '../errors';
import type { TagAction, TagActionsResponse, TagActionType } from '../types/assets';
import { splitCallOptions } from '../utils/args';
import { isValidMac, normalizeMac } from '../utils/mac';

export type { TagAction } from '../types/assets';

/** @deprecated since 0.3.0 — use `TagActionsResponse`. */
export type TagActionsResult = TagActionsResponse;

const ACTIONS: readonly TagActionType[] = [
  'ptlRed',
  'ptlGreen',
  'ptlBlue',
  'ptlYellow',
  'ptlWhite',
  'ptlCyan',
  'ptlMagenta',
  'ptlAquamarine',
  'uwbBlink',
  'ptlRedUwbBlink',
  'ptlGreenUwbBlink',
];

function invalid(message: string, field: string): ValidationError {
  return new ValidationError(message, undefined, { status: 0, details: [field] });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/** The body to send: every item checked, its MAC normalised; throws before any request. */
function checkedActions(actions: unknown): TagAction[] {
  if (!Array.isArray(actions)) {
    throw invalid('tagActions.send needs an array of actions', 'actions');
  }
  return actions.map((item: unknown, i) => {
    const at = `actions[${i}]`;
    if (!isPlainObject(item)) throw invalid(`${at} must be an object`, at);
    if (!isValidMac(item.macAddress)) {
      throw invalid(
        `${at}.macAddress must be a MAC address (12 hex characters, optionally separated)`,
        `${at}.macAddress`
      );
    }
    if (!ACTIONS.includes(item.action as TagActionType)) {
      throw invalid(
        `${at}.action must be one of ${ACTIONS.join(', ')}, received ${JSON.stringify(item.action)}`,
        `${at}.action`
      );
    }
    const duration = item.duration;
    if (
      duration !== undefined &&
      (typeof duration !== 'number' ||
        !Number.isInteger(duration) ||
        duration < 1 ||
        duration > 3600)
    ) {
      throw invalid(
        `${at}.duration must be an integer from 1 to 3600 (seconds), received ${String(duration)}`,
        `${at}.duration`
      );
    }
    return { ...item, macAddress: normalizeMac(item.macAddress as string) } as TagAction;
  });
}

/** A 500 that carries the per-action results of a partial failure (USI-P2-8). */
function isPartialFailure(err: unknown): err is ServerError & { body: TagActionsResponse } {
  if (!(err instanceof ServerError) || err.status !== 500 || !isPlainObject(err.body)) return false;
  return Array.isArray(err.body.results) && typeof err.body.success === 'boolean';
}

/** Sends actions to physical tags. */
export class TagActionsResource extends ResourceBase {
  /**
   * Sends the actions in one request (`POST /tag-actions/{appNamespace}`, the array as JSON body, each MAC
   * normalised to 12 lowercase hex as the product UI sends it). It drives hardware, so it is never retried,
   * whatever the client's retry policy.
   *
   * Safety: BLE actions (`ptlRed`, `ptlGreen`, `uwbBlink` and the two combinations) to a MAC that is not an ESL
   * asset are sent through every BLE gateway of the namespace. The ESL-only colours (`ptlBlue`, `ptlYellow`,
   * `ptlWhite`, `ptlCyan`, `ptlMagenta`, `ptlAquamarine`) sent to a non-ESL tag are rejected per item
   * (`statusCode: 400`) without contacting hardware.
   *
   * When some actions fail the server answers `500` with the full result body: this method resolves it as is
   * (`success: false`), so inspect `results` (USI-P2-8).
   *
   * @param actions the actions to send; `[]` is allowed and reaches no tag
   * @param options per-call `namespace` (else the client default) and request options
   * @returns the answer; `success` is `false` when at least one action failed
   * @throws {ValidationError} status 0 when `actions` is not an array, an item is not an object, a `macAddress`
   *   is not a MAC address, an `action` is unknown or a `duration` is not an integer 1..3600 (nothing is sent);
   *   status 400 when the server rejects the body
   * @throws {ServerError} a 5xx without per-action results, for example `No BLE comms configuration for
   *   namespace: …`
   * @throws {ContextError} when no namespace is given or set (nothing is sent)
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
   * const result = await client.tagActions.send([{ macAddress: 'AA:BB:CC:DD:EE:FF', action: 'ptlGreen' }]);
   * if (!result.success) console.log(result.results.filter((r) => !r.success));
   * ```
   */
  async send(
    actions: TagAction[],
    options?: CallContext & RequestOptions
  ): Promise<TagActionsResponse> {
    const body = checkedActions(actions);
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    try {
      return await this.transport.request<TagActionsResponse>(
        'POST',
        '/tag-actions/{appNamespace}',
        {
          params: { appNamespace: namespace },
          body,
          ...request,
          retry: false,
        }
      );
    } catch (err) {
      if (isPartialFailure(err)) return err.body;
      throw err;
    }
  }
}
