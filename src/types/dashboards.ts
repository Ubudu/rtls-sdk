/**
 * Dashboard types. Hand-written: they replace the generated `Dashboard*` schemas, which do not
 * describe what the server stores and returns (spec defects USI-P5-5 and USI-P5-6: `data` typed as an object,
 * `permissions` enum `['view', 'edit']`, `dynamicVariables` items untyped, `__v`, `selected`, `can_edit` and the
 * creator-only `shared_with` / `selected_by` undocumented).
 *
 * @module types/dashboards
 */

/**
 * The only permission the server stores (USI-P5-5: the spec enum also lists `'view'`, which the server rejects).
 * View access is implied by being in `shared_with`.
 */
export type DashboardPermission = 'edit';

/**
 * Widget configuration of a dashboard. Opaque to the SDK and owned by the product UI, which stores an array of
 * widget configs (USI-P5-6: the spec types it as an object).
 */
export type DashboardData = unknown[] | Record<string, unknown>;

/** A dashboard variable (USI-P5-6: the spec leaves the items untyped). Extra keys are kept as stored. */
export interface DynamicVariable {
  id: string;
  name: string;
  [key: string]: unknown;
}

/** One entry of `shared_with`: membership grants view access, `'edit'` grants editing. */
export interface DashboardShare {
  /** Sub-document id added by the store (USI-P5-6: undocumented). */
  _id?: string;
  /** Username of the person the dashboard is shared with. */
  username: string;
  permissions: DashboardPermission[];
}

/**
 * A dashboard as the server returns it (USI-P5-6). There is no `id` field: the identifier is `_id`.
 */
export interface Dashboard {
  /** 24-hex document id. */
  _id: string;
  name: string;
  description?: string;
  application_namespace: string;
  /**
   * Widget configuration, opaque (an array in the product UI). Absent on a dashboard stored with `data: {}`, which
   * the server drops (USI-P5-10), for example one created by SDK 0.2.0 `create()` without `data`.
   */
  data?: DashboardData;
  /** Absent unless set. */
  dynamicVariables?: DynamicVariable[];
  /** ISO date-time. */
  created_at: string;
  /** ISO date-time, bumped by every save. */
  updated_at: string;
  /** Username of the creator (the user of the API key for dashboards created through the SDK). */
  created_by: string;
  /** Present only when the caller is the creator. */
  shared_with?: DashboardShare[];
  /** Present only when the caller is the creator. */
  selected_by?: string[];
  /** The caller is in `selected_by`. */
  selected: boolean;
  /** The caller is the creator or has `'edit'`. */
  can_edit: boolean;
  /** Version key of the store. */
  __v?: number;
}

/** A share entry as the SDK accepts it. `'view'` is stripped before sending (view is implied by membership). */
export interface DashboardShareInput {
  username: string;
  permissions?: Array<'view' | 'edit'>;
}

/** Input of `dashboards.create()`. */
export interface CreateDashboardInput {
  name: string;
  /** Default `[]` (the product UI's widget array). An empty object `{}` is rejected client-side (USI-P5-10). */
  data?: DashboardData;
  description?: string;
  /** Stored only when a non-empty array. */
  dynamicVariables?: DynamicVariable[];
  shared_with?: DashboardShareInput[];
  /** The server keeps only the creator and users the dashboard is shared with. */
  selected_by?: string[];
  /** @deprecated use `options.namespace` or the client default */
  namespace?: string;
}

/** Input of `dashboards.update()`: an absent key leaves the stored value untouched. */
export interface UpdateDashboardInput {
  name?: string;
  description?: string;
  /** An empty object `{}` is rejected client-side: the server drops it and every later update fails (USI-P5-10). */
  data?: DashboardData;
  /** `[]` clears; omit to keep; `null` is rejected client-side (the server would clear them, USI-P5-9). */
  dynamicVariables?: DynamicVariable[];
  /** Moves the dashboard to another namespace. */
  application_namespace?: string;
  /** Creator only; full replace. */
  shared_with?: DashboardShareInput[];
  selected_by?: string[];
}

/**
 * Argument of the legacy `share(id, username, permissions)` overload; only `write` has an effect (`write: true`
 * grants `'edit'`).
 * @deprecated use `share(id, { username, permissions })`
 */
export interface SharePermissions {
  read?: boolean;
  write?: boolean;
  delete?: boolean;
}

/** @deprecated use {@link CreateDashboardInput} */
export type CreateDashboardData = CreateDashboardInput;

/** @deprecated use {@link UpdateDashboardInput} */
export type UpdateDashboardData = UpdateDashboardInput;
