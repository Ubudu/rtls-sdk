/**
 * Dashboards (`client.dashboards`): the dashboards of the API key's user, their sharing and their lists.
 *
 * The API key acts as the user who created it: dashboards created through the SDK belong to that user and appear
 * in that user's product UI. A dashboard is identified by `_id` (there is no `id` field). Id-addressed methods
 * accept `CallContext & RequestOptions` but use no context field.
 *
 * @module resources/dashboards
 */
import type { RequestOptions } from '../client/base';
import { ResourceBase } from '../client/resource';
import type { CallContext } from '../context';
import { ValidationError } from '../errors';
import type {
  CreateDashboardInput,
  Dashboard,
  DashboardData,
  DashboardPermission,
  DashboardShareInput,
  DynamicVariable,
  SharePermissions,
  UpdateDashboardInput,
} from '../types/dashboards';
import { splitCallOptions } from '../utils/args';

export type {
  SharePermissions,
  CreateDashboardData,
  UpdateDashboardData,
} from '../types/dashboards';

type ListPath =
  '/dashboards' | '/dashboards/created' | '/dashboards/shared' | '/dashboards/selected';

/** A share entry as sent on the wire. */
interface ShareBody {
  username: string;
  permissions: DashboardPermission[];
}

/** The body of `POST /dashboards` and `PUT /dashboards/{id}`: only defined keys are set. */
interface DashboardBody {
  name?: string;
  application_namespace?: string;
  data?: DashboardData;
  description?: string;
  dynamicVariables?: DynamicVariable[];
  shared_with?: ShareBody[];
  selected_by?: string[];
}

/** One client-side input problem: the field path and what is wrong with it. */
interface Issue {
  path: string;
  problem: string;
}

function isPlainObject(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** `ValidationError` thrown before any request (status 0; `details` lists the offending field paths). */
function invalid(what: string, issues: readonly Issue[]): ValidationError {
  const text = issues.map((issue) => `${issue.path} ${issue.problem}`).join('; ');
  return new ValidationError(`Invalid ${what}: ${text}`, undefined, {
    status: 0,
    details: issues.map((issue) => issue.path),
  });
}

/** Rejects an id that is not a non-empty string (an empty id would address the list route). */
function checkId(id: unknown): string {
  if (!isNonBlankString(id)) {
    throw invalid('dashboard id', [{ path: 'id', problem: 'must be a non-empty string' }]);
  }
  return id;
}

/** A per-call value that is `undefined`, `null` or `''` counts as not given (as for the client context). */
function given<T>(value: T | null | undefined): T | undefined {
  return value === undefined || value === null || value === '' ? undefined : value;
}

/**
 * Checks share entries and maps them to the wire form: `'view'` is stripped (membership already grants view) and
 * `'edit'` is sent once.
 */
function mapShares(entries: readonly unknown[], path: string, issues: Issue[]): ShareBody[] {
  const mapped: ShareBody[] = [];
  entries.forEach((entry, i) => {
    const at = `${path}[${i}]`;
    if (!isPlainObject(entry)) {
      issues.push({ path: at, problem: 'must be an object { username, permissions? }' });
      return;
    }
    const { username, permissions } = entry;
    if (!isNonBlankString(username)) {
      issues.push({ path: `${at}.username`, problem: 'must be a non-empty string' });
    }
    let edit = false;
    if (permissions !== undefined) {
      if (!Array.isArray(permissions)) {
        issues.push({ path: `${at}.permissions`, problem: "must be an array of 'view' | 'edit'" });
      } else {
        permissions.forEach((permission: unknown, j) => {
          if (permission === 'edit') edit = true;
          else if (permission !== 'view') {
            issues.push({ path: `${at}.permissions[${j}]`, problem: "must be 'view' or 'edit'" });
          }
        });
      }
    }
    if (typeof username === 'string') mapped.push({ username, permissions: edit ? ['edit'] : [] });
  });
  return mapped;
}

/**
 * Checks the keys of a create or update input that are not `undefined` and builds the body from them. Unknown
 * keys (for example the deprecated `namespace`) are never sent.
 */
function buildBody(
  input: CreateDashboardInput | UpdateDashboardInput,
  issues: Issue[]
): DashboardBody {
  const body: DashboardBody = {};
  const { name, description, data, dynamicVariables, shared_with, selected_by } = input;
  if (name !== undefined) {
    if (isNonBlankString(name)) body.name = name;
    else issues.push({ path: 'name', problem: 'must be a non-empty string' });
  }
  if (description !== undefined) {
    if (typeof description === 'string') body.description = description;
    else issues.push({ path: 'description', problem: 'must be a string' });
  }
  if (data !== undefined) {
    if (isPlainObject(data) && Object.keys(data).length === 0) {
      // USI-P5-10: the server drops an empty object and every later update of the dashboard fails.
      issues.push({ path: 'data', problem: 'must not be an empty object (use [])' });
    } else if (Array.isArray(data) || isPlainObject(data)) body.data = data;
    else issues.push({ path: 'data', problem: 'must be an array or a plain object' });
  }
  if (dynamicVariables !== undefined) {
    if (!Array.isArray(dynamicVariables)) {
      issues.push({ path: 'dynamicVariables', problem: 'must be an array ([] clears them)' });
    } else {
      dynamicVariables.forEach((variable: unknown, i) => {
        if (!isPlainObject(variable)) {
          issues.push({ path: `dynamicVariables[${i}]`, problem: 'must be an object' });
        }
      });
      body.dynamicVariables = dynamicVariables;
    }
  }
  if (shared_with !== undefined) {
    if (Array.isArray(shared_with))
      body.shared_with = mapShares(shared_with, 'shared_with', issues);
    else issues.push({ path: 'shared_with', problem: 'must be an array' });
  }
  if (selected_by !== undefined) {
    if (!Array.isArray(selected_by)) {
      issues.push({ path: 'selected_by', problem: 'must be an array of usernames' });
    } else {
      selected_by.forEach((username: unknown, i) => {
        if (!isNonBlankString(username)) {
          issues.push({ path: `selected_by[${i}]`, problem: 'must be a non-empty string' });
        }
      });
      body.selected_by = selected_by;
    }
  }
  return body;
}

/**
 * Dashboards of the API key's user (`/dashboards`). Server rules the methods rely on: no pagination, sort or
 * filters on the lists; only the creator sees `shared_with` / `selected_by`; editing needs the creator or
 * `'edit'`; deleting, sharing and unsharing are creator-only; request bodies are limited to 100 kB
 * (`PayloadTooLargeError` above).
 */
export class DashboardsResource extends ResourceBase {
  // ─── Lists ──────────────────────────────────────────────────────────────────

  /**
   * Dashboards created by the caller or shared with the caller (`GET /dashboards`), in no particular order.
   * The namespace (`options.namespace`, else the client default) filters the list; with no namespace at all the
   * list spans every namespace the user can see.
   *
   * @example
   * ```typescript
   * const dashboards = await client.dashboards.list();
   * for (const d of dashboards) console.log(d._id, d.name, d.can_edit);
   * ```
   */
  list(options?: CallContext & RequestOptions): Promise<Dashboard[]>;
  /** @deprecated 0.2.0 two-object form: pass request options in `options` */
  list(
    options: (CallContext & RequestOptions) | undefined,
    requestOptions: RequestOptions
  ): Promise<Dashboard[]>;
  /** Legacy positional namespace. */
  list(namespace: string, requestOptions?: RequestOptions): Promise<Dashboard[]>;
  list(
    arg1?: string | (CallContext & RequestOptions),
    arg2?: RequestOptions
  ): Promise<Dashboard[]> {
    return this.listAt('/dashboards', arg1, arg2);
  }

  /**
   * Dashboards created by the caller (`GET /dashboards/created`); namespace filter as for {@link list}.
   */
  listCreated(options?: CallContext & RequestOptions): Promise<Dashboard[]>;
  /** @deprecated 0.2.0 two-object form: pass request options in `options` */
  listCreated(
    options: (CallContext & RequestOptions) | undefined,
    requestOptions: RequestOptions
  ): Promise<Dashboard[]>;
  /** Legacy positional namespace. */
  listCreated(namespace: string, requestOptions?: RequestOptions): Promise<Dashboard[]>;
  listCreated(
    arg1?: string | (CallContext & RequestOptions),
    arg2?: RequestOptions
  ): Promise<Dashboard[]> {
    return this.listAt('/dashboards/created', arg1, arg2);
  }

  /**
   * Dashboards other users shared with the caller (`GET /dashboards/shared`); namespace filter as for
   * {@link list}. Items are the non-creator view (no `shared_with` / `selected_by`).
   */
  listShared(options?: CallContext & RequestOptions): Promise<Dashboard[]>;
  /** @deprecated 0.2.0 two-object form: pass request options in `options` */
  listShared(
    options: (CallContext & RequestOptions) | undefined,
    requestOptions: RequestOptions
  ): Promise<Dashboard[]>;
  /** Legacy positional namespace. */
  listShared(namespace: string, requestOptions?: RequestOptions): Promise<Dashboard[]>;
  listShared(
    arg1?: string | (CallContext & RequestOptions),
    arg2?: RequestOptions
  ): Promise<Dashboard[]> {
    return this.listAt('/dashboards/shared', arg1, arg2);
  }

  /**
   * Dashboards the caller selected (`GET /dashboards/selected`); namespace filter as for {@link list}. It may hold
   * several dashboards of one namespace: selecting one does not unselect the others.
   */
  listSelected(options?: CallContext & RequestOptions): Promise<Dashboard[]>;
  /** @deprecated 0.2.0 two-object form: pass request options in `options` */
  listSelected(
    options: (CallContext & RequestOptions) | undefined,
    requestOptions: RequestOptions
  ): Promise<Dashboard[]>;
  /** Legacy positional namespace. */
  listSelected(namespace: string, requestOptions?: RequestOptions): Promise<Dashboard[]>;
  listSelected(
    arg1?: string | (CallContext & RequestOptions),
    arg2?: RequestOptions
  ): Promise<Dashboard[]> {
    return this.listAt('/dashboards/selected', arg1, arg2);
  }

  // ─── Single dashboard ───────────────────────────────────────────────────────

  /**
   * One dashboard (`GET /dashboards/{id}`). The server answers 403 `Access denied` unless the caller is the creator
   * or the dashboard is shared with the caller, 400 `Invalid dashboard ID` for an id that is not an ObjectId and 404
   * `Dashboard not found` for an unknown id.
   *
   * @param id - the dashboard's `_id`
   * @param options - request options; no context field is used
   * @throws {ValidationError} `id` is not a non-empty string (status 0, no request)
   */
  async get(id: string, options?: CallContext & RequestOptions): Promise<Dashboard> {
    const dashboardId = checkId(id);
    const { request } = splitCallOptions(options);
    return this.transport.request<Dashboard>('GET', '/dashboards/{id}', {
      params: { id: dashboardId },
      ...request,
    });
  }

  /**
   * Creates a dashboard (`POST /dashboards`, 201) owned by the API key's user. `application_namespace` is
   * `options.namespace`, else the deprecated `input.namespace`, else the client default. `data` defaults to `[]`
   * (the product UI's widget array); `{}` is rejected, because the server drops it and every later update of the
   * dashboard then fails (USI-P5-10). `shared_with` permissions: `'view'` is dropped (membership grants view) and
   * `'edit'` is sent once. The server stores `dynamicVariables` only when non-empty and keeps in `selected_by` only
   * the creator and users the dashboard is shared with.
   *
   * @example
   * ```typescript
   * const d = await client.dashboards.create({ name: 'Floor 1', description: 'Live view' });
   * console.log(d._id);
   * ```
   * @throws {ValidationError} invalid input (status 0, `details` = field paths, no request)
   * @throws {ContextError} no namespace in `options`, `input` or the client
   */
  async create(
    input: CreateDashboardInput,
    options?: CallContext & RequestOptions
  ): Promise<Dashboard> {
    if (!isPlainObject(input)) {
      throw invalid('dashboard input', [{ path: 'input', problem: 'must be an object' }]);
    }
    const issues: Issue[] = [];
    if (input.name === undefined)
      issues.push({ path: 'name', problem: 'must be a non-empty string' });
    const fields = buildBody(input, issues);
    if (issues.length > 0) throw invalid('dashboard input', issues);
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns({ namespace: given(ctx.namespace) ?? given(input.namespace) });
    const body: DashboardBody = {
      ...fields,
      application_namespace: namespace,
      data: fields.data ?? [],
    };
    return this.transport.request<Dashboard>('POST', '/dashboards', { body, ...request });
  }

  /**
   * Updates a dashboard (`PUT /dashboards/{id}`): only the keys of `input` that are not `undefined` are sent, and
   * an absent key leaves the stored value untouched (`{}` only bumps `updated_at`). `dynamicVariables: []` clears
   * them; `null` is rejected because the server would clear them too. `data: {}` is rejected as for `create()`
   * (USI-P5-10). `application_namespace` moves the dashboard.
   * `shared_with` is creator-only and replaces the whole list. The server answers 403 `You do not have permission
   * to edit this dashboard` unless the caller is the creator or has `'edit'`.
   *
   * @param options - request options; no context field is used
   * @throws {ValidationError} invalid input, including `null` for any key (status 0, no request)
   */
  async update(
    id: string,
    input: UpdateDashboardInput,
    options?: CallContext & RequestOptions
  ): Promise<Dashboard> {
    const dashboardId = checkId(id);
    if (!isPlainObject(input)) {
      throw invalid('dashboard update', [{ path: 'input', problem: 'must be an object' }]);
    }
    const issues: Issue[] = [];
    const body = buildBody(input, issues);
    const target = input.application_namespace;
    if (target !== undefined) {
      if (isNonBlankString(target)) body.application_namespace = target;
      else issues.push({ path: 'application_namespace', problem: 'must be a non-empty string' });
    }
    if (issues.length > 0) throw invalid('dashboard update', issues);
    const { request } = splitCallOptions(options);
    return this.transport.request<Dashboard>('PUT', '/dashboards/{id}', {
      params: { id: dashboardId },
      body,
      ...request,
    });
  }

  /**
   * Deletes a dashboard (`DELETE /dashboards/{id}`, 204). Creator only (403 `Only the creator can delete the
   * dashboard`); a hard delete, so a second call gives `NotFoundError`.
   *
   * @param options - request options; no context field is used
   * @throws {ValidationError} `id` is not a non-empty string (status 0, no request)
   */
  async delete(id: string, options?: CallContext & RequestOptions): Promise<void> {
    const dashboardId = checkId(id);
    const { request } = splitCallOptions(options);
    await this.transport.request<void>('DELETE', '/dashboards/{id}', {
      params: { id: dashboardId },
      ...request,
    });
  }

  // ─── Sharing ────────────────────────────────────────────────────────────────

  /**
   * Shares a dashboard (`POST /dashboards/{id}/share`). Being in `shared_with` grants view access; `'edit'` grants
   * editing; `'view'` is dropped before sending. The server merges by username: an existing entry gets the new
   * permissions, a new one is appended. It does not check that the username exists and sends no notification.
   * Creator only (403 `Only the creator can share the dashboard`).
   *
   * @example
   * ```typescript
   * await client.dashboards.share(d._id, { username: 'colleague', permissions: ['edit'] });
   * ```
   * @param options - request options; no context field is used
   * @throws {ValidationError} empty list, blank username or unknown permission (status 0, no request)
   */
  share(
    id: string,
    users: DashboardShareInput | DashboardShareInput[],
    options?: CallContext & RequestOptions
  ): Promise<Dashboard>;
  /**
   * @deprecated use `share(id, { username, permissions })`. `permissions.write === true` grants `'edit'`; `read`
   * and `delete` have no server meaning (0.2.0 sent the object and the server granted view only).
   */
  share(
    id: string,
    username: string,
    permissions: SharePermissions,
    requestOptions?: RequestOptions
  ): Promise<Dashboard>;
  async share(
    id: string,
    users: string | DashboardShareInput | DashboardShareInput[],
    options?: SharePermissions | (CallContext & RequestOptions),
    requestOptions?: RequestOptions
  ): Promise<Dashboard> {
    const dashboardId = checkId(id);
    const issues: Issue[] = [];
    let mapped: ShareBody[];
    let request: RequestOptions;
    if (typeof users === 'string') {
      if (!isNonBlankString(users))
        issues.push({ path: 'username', problem: 'must be a non-empty string' });
      const permissions = options as SharePermissions | null | undefined;
      mapped = [{ username: users, permissions: permissions?.write === true ? ['edit'] : [] }];
      request = splitCallOptions(undefined, requestOptions).request;
    } else {
      const list: unknown[] = Array.isArray(users) ? users : [users];
      if (list.length === 0) issues.push({ path: 'users', problem: 'must hold at least one user' });
      mapped = mapShares(list, 'users', issues);
      request = splitCallOptions(options as (CallContext & RequestOptions) | undefined).request;
    }
    if (issues.length > 0) throw invalid('share input', issues);
    return this.transport.request<Dashboard>('POST', '/dashboards/{id}/share', {
      params: { id: dashboardId },
      body: { users: mapped },
      ...request,
    });
  }

  /**
   * Removes users from `shared_with` and `selected_by` (`POST /dashboards/{id}/unshare`); unknown names are a
   * no-op. Creator only (403 `Only the creator can unshare the dashboard`).
   *
   * @param usernames - one username or a list
   * @param options - request options; no context field is used
   * @throws {ValidationError} empty list or a username that is not a non-empty string (status 0, no request)
   */
  async unshare(
    id: string,
    usernames: string | string[],
    options?: CallContext & RequestOptions
  ): Promise<Dashboard> {
    const dashboardId = checkId(id);
    const list: unknown = typeof usernames === 'string' ? [usernames] : usernames;
    const issues: Issue[] = [];
    if (!Array.isArray(list) || list.length === 0) {
      issues.push({
        path: 'usernames',
        problem: 'must be a username or a non-empty list of usernames',
      });
    } else {
      list.forEach((username: unknown, i) => {
        if (!isNonBlankString(username)) {
          issues.push({ path: `usernames[${i}]`, problem: 'must be a non-empty string' });
        }
      });
    }
    if (issues.length > 0) throw invalid('unshare input', issues);
    const { request } = splitCallOptions(options);
    return this.transport.request<Dashboard>('POST', '/dashboards/{id}/unshare', {
      params: { id: dashboardId },
      body: { usernames: list as string[] },
      ...request,
    });
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  /** `GET <path>[?namespace=<ns>]`: the legacy string, else `options.namespace`, else the client default. */
  private async listAt(
    path: ListPath,
    arg1: string | (CallContext & RequestOptions) | undefined,
    arg2: RequestOptions | undefined
  ): Promise<Dashboard[]> {
    const legacy = typeof arg1 === 'string';
    const { ctx, request } = splitCallOptions(legacy ? undefined : arg1, arg2);
    const { namespace } = this.client.resolveCtx(legacy ? { namespace: arg1 } : ctx);
    return this.transport.request<Dashboard[]>('GET', path, {
      query: { namespace },
      ...request,
    });
  }
}
