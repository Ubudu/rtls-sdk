# Work Package: Ubudu RTLS TypeScript SDK

> **Execution Mode**: Fully Autonomous AI Coding Agent
> **Estimated Tasks**: 47 atomic tasks across 9 phases
> **Verification**: Each task includes testable acceptance criteria

---

## Agent Instructions

### Execution Protocol

1. **Execute tasks sequentially** within each phase
2. **Run verification commands** after each task before proceeding
3. **Do not skip tasks** - each builds on previous work
4. **On failure**: Fix the issue, re-run verification, then proceed
5. **Commit after each phase** with message format: `feat(sdk): complete phase N - [description]`

### Environment Requirements

```bash
# Verify before starting
node --version  # Must be >= 18.0.0
npm --version   # Must be >= 9.0.0
```

### Project Location

```
Base Directory: rtls-sdk/
API Spec URL: https://rtls.ubudu.com/api/docs/swagger.json
```

---

## Phase 1: Project Scaffolding

### Task 1.1: Create Directory Structure

**Action**: Create all directories

```bash
mkdir -p rtls-sdk && cd rtls-sdk
mkdir -p src/{generated,client,resources,utils}
mkdir -p test/{mocks,resources,utils}
mkdir -p examples/{node-basic,browser-vite/src}
mkdir -p .github/workflows
```

**Verification**:
```bash
test -d src/generated && test -d src/client && test -d src/resources && test -d src/utils && \
test -d test/mocks && test -d test/resources && test -d .github/workflows && echo "PASS" || echo "FAIL"
```

---

### Task 1.2: Create package.json

**Action**: Write file `package.json`

```json
{
  "name": "@ubudu/rtls-sdk",
  "version": "0.1.0",
  "description": "Official TypeScript SDK for the Ubudu RTLS API",
  "author": "Ubudu",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/ubudu/rtls-sdk.git"
  },
  "keywords": ["ubudu", "rtls", "real-time-location", "indoor-positioning", "asset-tracking", "typescript"],
  "engines": {
    "node": ">=18"
  },
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
      },
      "require": {
        "types": "./dist/index.d.cts",
        "default": "./dist/index.cjs"
      }
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "sideEffects": false,
  "scripts": {
    "generate": "openapi-typescript \"https://rtls.ubudu.com/api/docs/swagger.json\" -o src/generated/schema.ts",
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src test --ext .ts",
    "lint:fix": "eslint src test --ext .ts --fix",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\" \"test/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build",
    "prepare": "npm run generate || true"
  },
  "dependencies": {
    "openapi-fetch": "^0.13.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@typescript-eslint/eslint-plugin": "^6.19.0",
    "@typescript-eslint/parser": "^6.19.0",
    "@vitest/coverage-v8": "^2.0.0",
    "eslint": "^8.56.0",
    "msw": "^2.1.0",
    "openapi-typescript": "^7.4.0",
    "prettier": "^3.2.0",
    "tsup": "^8.0.0",
    "typescript": "^5.3.0",
    "vitest": "^2.0.0"
  }
}
```

**Verification**:
```bash
node -e "const p = require('./package.json'); console.log(p.name === '@ubudu/rtls-sdk' ? 'PASS' : 'FAIL')"
```

---

### Task 1.3: Create tsconfig.json

**Action**: Write file `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test", "examples"]
}
```

**Verification**:
```bash
test -f tsconfig.json && echo "PASS" || echo "FAIL"
```

---

### Task 1.4: Create tsup.config.ts

**Action**: Write file `tsup.config.ts`

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  minify: false,
  target: 'es2022',
  outDir: 'dist',
});
```

**Verification**:
```bash
test -f tsup.config.ts && echo "PASS" || echo "FAIL"
```

---

### Task 1.5: Create vitest.config.ts

**Action**: Write file `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/generated/**', 'src/index.ts'],
    },
    setupFiles: ['./test/setup.ts'],
  },
});
```

**Verification**:
```bash
test -f vitest.config.ts && echo "PASS" || echo "FAIL"
```

---

### Task 1.6: Create .eslintrc.cjs

**Action**: Write file `.eslintrc.cjs`

```javascript
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'warn',
  },
  ignorePatterns: ['dist/', 'node_modules/', 'src/generated/', 'examples/'],
};
```

**Verification**:
```bash
test -f .eslintrc.cjs && echo "PASS" || echo "FAIL"
```

---

### Task 1.7: Create .prettierrc

**Action**: Write file `.prettierrc`

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
```

**Verification**:
```bash
test -f .prettierrc && echo "PASS" || echo "FAIL"
```

---

### Task 1.8: Create .gitignore

**Action**: Write file `.gitignore`

```
node_modules/
dist/
src/generated/schema.ts
coverage/
.idea/
.vscode/
*.swp
*.swo
.DS_Store
Thumbs.db
.env
.env.local
*.log
npm-debug.log*
*.tgz
```

**Verification**:
```bash
test -f .gitignore && echo "PASS" || echo "FAIL"
```

---

### Task 1.9: Create .npmignore

**Action**: Write file `.npmignore`

```
src/
test/
coverage/
vitest.config.ts
.eslintrc.cjs
.prettierrc
tsconfig.json
tsup.config.ts
.github/
.idea/
.vscode/
*.tgz
WORK_PACKAGE.md
examples/
```

**Verification**:
```bash
test -f .npmignore && echo "PASS" || echo "FAIL"
```

---

### Task 1.10: Install Dependencies

**Action**: Run npm install

```bash
npm install
```

**Verification**:
```bash
test -d node_modules && test -f package-lock.json && echo "PASS" || echo "FAIL"
```

---

### Phase 1 Checkpoint

**Verification**:
```bash
npm run typecheck 2>/dev/null || echo "Expected to fail - no source files yet"
ls -la src/ test/ .github/
echo "Phase 1 Complete"
```

---

## Phase 2: Code Generation

### Task 2.1: Generate OpenAPI Types

**Action**: Run code generation

```bash
npm run generate
```

**Verification**:
```bash
test -f src/generated/schema.ts && grep -q "export type paths" src/generated/schema.ts && echo "PASS" || echo "FAIL"
```

---

### Task 2.2: Create Type Re-exports

**Action**: Write file `src/types.ts`

```typescript
import type { components, paths, operations } from './generated/schema';

// Core data types - using index signature for flexibility with generated types
export type Asset = components['schemas'] extends { Asset: infer T } ? T : Record<string, unknown>;
export type AssetPosition = components['schemas'] extends { AssetPosition: infer T } ? T : Record<string, unknown>;
export type CachedAssetPosition = components['schemas'] extends { CachedAssetPosition: infer T } ? T : Record<string, unknown>;
export type Zone = components['schemas'] extends { Zone: infer T } ? T : Record<string, unknown>;
export type Venue = components['schemas'] extends { Venue: infer T } ? T : Record<string, unknown>;
export type MapData = components['schemas'] extends { Map: infer T } ? T : Record<string, unknown>;
export type POI = components['schemas'] extends { POI: infer T } ? T : Record<string, unknown>;
export type Dashboard = components['schemas'] extends { Dashboard: infer T } ? T : Record<string, unknown>;
export type AlertRule = components['schemas'] extends { AlertRule: infer T } ? T : Record<string, unknown>;
export type NavigationResponse = components['schemas'] extends { NavigationResponse: infer T } ? T : Record<string, unknown>;
export type HealthStatus = components['schemas'] extends { HealthStatus: infer T } ? T : Record<string, unknown>;
export type BatchSaveResult = components['schemas'] extends { BatchSaveResult: infer T } ? T : Record<string, unknown>;
export type BatchDeleteResult = components['schemas'] extends { BatchDeleteResult: infer T } ? T : Record<string, unknown>;

// Path types for internal use
export type { paths, operations, components };

// Pagination response wrapper
export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Filter operators supported by the API
export type FilterOperator =
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'starts' | 'ends' | 'regex'
  | 'in' | 'nin' | 'exists' | 'between' | 'size' | 'all' | 'elem';

// Query options for list endpoints
export interface QueryOptions {
  page?: number;
  limit?: number;
  sort?: string | string[];
  fields?: string[];
}

// Filter options type
export type FilterOptions = {
  [K in `${string}:${FilterOperator}`]?: string | number | boolean;
};
```

**Verification**:
```bash
test -f src/types.ts && grep -q "PaginatedResponse" src/types.ts && echo "PASS" || echo "FAIL"
```

---

### Phase 2 Checkpoint

**Verification**:
```bash
npx tsc --noEmit src/types.ts 2>&1 | head -5
echo "Phase 2 Complete"
```

---

## Phase 3: Core Client Implementation

### Task 3.1: Create Error Classes

**Action**: Write file `src/errors.ts`

```typescript
/**
 * Base error class for all RTLS SDK errors
 */
export class RtlsError extends Error {
  public readonly status: number;
  public readonly body: unknown;
  public readonly code: string;

  constructor(message: string, status: number, body: unknown, code?: string) {
    super(message);
    this.name = 'RtlsError';
    this.status = status;
    this.body = body;
    this.code = code ?? 'RTLS_ERROR';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RtlsError);
    }
  }

  isStatus(status: number): boolean {
    return this.status === status;
  }

  isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  isServerError(): boolean {
    return this.status >= 500;
  }
}

export class AuthenticationError extends RtlsError {
  constructor(message = 'Authentication failed', body?: unknown) {
    super(message, 401, body, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends RtlsError {
  constructor(message = 'Access denied', body?: unknown) {
    super(message, 403, body, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends RtlsError {
  constructor(message = 'Resource not found', body?: unknown) {
    super(message, 404, body, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends RtlsError {
  public readonly errors: Record<string, string[]>;

  constructor(message = 'Validation failed', body?: unknown) {
    super(message, 422, body, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.errors = this.extractErrors(body);
  }

  private extractErrors(body: unknown): Record<string, string[]> {
    if (body && typeof body === 'object' && 'errors' in body) {
      return body.errors as Record<string, string[]>;
    }
    return {};
  }
}

export class RateLimitError extends RtlsError {
  public readonly retryAfter?: number;

  constructor(message = 'Rate limit exceeded', body?: unknown, retryAfter?: number) {
    super(message, 429, body, 'RATE_LIMIT');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class TimeoutError extends RtlsError {
  constructor(message = 'Request timed out') {
    super(message, 0, null, 'TIMEOUT');
    this.name = 'TimeoutError';
  }
}

export class NetworkError extends RtlsError {
  constructor(message = 'Network error', cause?: Error) {
    super(message, 0, null, 'NETWORK_ERROR');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export function createError(status: number, body: unknown, message?: string): RtlsError {
  const defaultMessage = typeof body === 'object' && body !== null && 'error' in body
    ? String((body as { error: unknown }).error)
    : `HTTP ${status} error`;

  const errorMessage = message ?? defaultMessage;

  switch (status) {
    case 401:
      return new AuthenticationError(errorMessage, body);
    case 403:
      return new AuthorizationError(errorMessage, body);
    case 404:
      return new NotFoundError(errorMessage, body);
    case 422:
    case 400:
      return new ValidationError(errorMessage, body);
    case 429:
      return new RateLimitError(errorMessage, body);
    default:
      return new RtlsError(errorMessage, status, body);
  }
}
```

**Verification**:
```bash
npx tsc --noEmit src/errors.ts && echo "PASS" || echo "FAIL"
```

---

### Task 3.2: Create Utility Functions

**Action**: Write file `src/utils/pagination.ts`

```typescript
import type { QueryOptions, PaginatedResponse } from '../types';

export function buildQueryParams(
  options?: QueryOptions & Record<string, unknown>
): Record<string, string> {
  if (!options) return {};

  const params: Record<string, string> = {};

  if (options.page !== undefined) {
    params.page = String(options.page);
  }

  if (options.limit !== undefined) {
    params.limit = String(options.limit);
  }

  if (options.sort !== undefined) {
    params.sort = Array.isArray(options.sort) ? options.sort.join(',') : options.sort;
  }

  if (options.fields !== undefined) {
    params.fields = options.fields.join(',');
  }

  for (const [key, value] of Object.entries(options)) {
    if (['page', 'limit', 'sort', 'fields'].includes(key)) continue;
    if (value === undefined || value === null) continue;
    if (key.includes(':')) {
      params[key] = String(value);
    }
  }

  return params;
}

export async function* paginate<T>(
  fetcher: (page: number, limit: number) => Promise<PaginatedResponse<T>>,
  options?: { pageSize?: number; startPage?: number }
): AsyncGenerator<T, void, unknown> {
  const pageSize = options?.pageSize ?? 100;
  let currentPage = options?.startPage ?? 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetcher(currentPage, pageSize);
    for (const item of response.data) {
      yield item;
    }
    hasMore = response.hasNext;
    currentPage++;
  }
}

export async function collectAll<T>(
  fetcher: (page: number, limit: number) => Promise<PaginatedResponse<T>>,
  options?: { pageSize?: number; maxItems?: number }
): Promise<T[]> {
  const items: T[] = [];
  const maxItems = options?.maxItems ?? Infinity;

  for await (const item of paginate(fetcher, { pageSize: options?.pageSize })) {
    items.push(item);
    if (items.length >= maxItems) break;
  }

  return items;
}
```

**Verification**:
```bash
npx tsc --noEmit src/utils/pagination.ts && echo "PASS" || echo "FAIL"
```

---

### Task 3.3: Create Filter Utilities

**Action**: Write file `src/utils/filtering.ts`

```typescript
import type { FilterOperator, FilterOptions } from '../types';

export function filter(
  field: string,
  operator: FilterOperator,
  value: string | number | boolean | string[] | number[]
): FilterOptions {
  const key = `${field}:${operator}` as `${string}:${FilterOperator}`;
  const stringValue = Array.isArray(value) ? value.join(',') : String(value);
  return { [key]: stringValue } as FilterOptions;
}

export function combineFilters(...filters: FilterOptions[]): FilterOptions {
  return Object.assign({}, ...filters);
}

export const filters = {
  equals: (field: string, value: string | number | boolean) => filter(field, 'eq', value),
  notEquals: (field: string, value: string | number | boolean) => filter(field, 'ne', value),
  greaterThan: (field: string, value: number) => filter(field, 'gt', value),
  greaterThanOrEqual: (field: string, value: number) => filter(field, 'gte', value),
  lessThan: (field: string, value: number) => filter(field, 'lt', value),
  lessThanOrEqual: (field: string, value: number) => filter(field, 'lte', value),
  contains: (field: string, value: string) => filter(field, 'contains', value),
  startsWith: (field: string, value: string) => filter(field, 'starts', value),
  endsWith: (field: string, value: string) => filter(field, 'ends', value),
  matches: (field: string, pattern: string) => filter(field, 'regex', pattern),
  in: (field: string, values: (string | number)[]) => filter(field, 'in', values),
  notIn: (field: string, values: (string | number)[]) => filter(field, 'nin', values),
  exists: (field: string, exists = true) => filter(field, 'exists', exists),
  between: (field: string, min: number, max: number) => filter(field, 'between', `${min},${max}`),
  size: (field: string, size: number) => filter(field, 'size', size),
  all: (field: string, values: string[]) => filter(field, 'all', values),
  elemMatch: (field: string, value: string) => filter(field, 'elem', value),
};
```

**Verification**:
```bash
npx tsc --noEmit src/utils/filtering.ts && echo "PASS" || echo "FAIL"
```

---

### Task 3.4: Create Utils Index

**Action**: Write file `src/utils/index.ts`

```typescript
export { buildQueryParams, paginate, collectAll } from './pagination';
export { filter, filters, combineFilters } from './filtering';
```

**Verification**:
```bash
npx tsc --noEmit src/utils/index.ts && echo "PASS" || echo "FAIL"
```

---

### Task 3.5: Create Base Client

**Action**: Write file `src/client/base.ts`

```typescript
import createClient, { type Client } from 'openapi-fetch';
import type { paths } from '../generated/schema';
import { createError, NetworkError, TimeoutError, RtlsError } from '../errors';

export interface RtlsClientOptions {
  baseUrl?: string;
  apiKey?: string;
  accessToken?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export class BaseClient {
  protected readonly client: Client<paths>;
  protected readonly options: Required<Pick<RtlsClientOptions, 'baseUrl' | 'timeoutMs'>> & RtlsClientOptions;

  constructor(options: RtlsClientOptions = {}) {
    this.options = {
      baseUrl: 'https://rtls.ubudu.com/api',
      timeoutMs: 30000,
      ...options,
    };

    this.client = createClient<paths>({
      baseUrl: this.options.baseUrl,
      fetch: this.options.fetch,
      headers: this.buildHeaders(),
    });
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.options.headers,
    };

    if (this.options.apiKey) {
      headers['X-API-Key'] = this.options.apiKey;
    }

    if (this.options.accessToken) {
      headers['Authorization'] = `Bearer ${this.options.accessToken}`;
    }

    return headers;
  }

  protected createTimeoutSignal(timeoutMs?: number): AbortSignal {
    const timeout = timeoutMs ?? this.options.timeoutMs;
    return AbortSignal.timeout(timeout);
  }

  protected mergeSignals(userSignal?: AbortSignal, timeoutMs?: number): AbortSignal {
    const timeoutSignal = this.createTimeoutSignal(timeoutMs);
    if (!userSignal) {
      return timeoutSignal;
    }
    if ('any' in AbortSignal) {
      return (AbortSignal as typeof AbortSignal & { any: (signals: AbortSignal[]) => AbortSignal }).any([userSignal, timeoutSignal]);
    }
    return timeoutSignal;
  }

  protected async handleResponse<T>(
    response: { data?: T; error?: unknown; response: Response }
  ): Promise<T> {
    if (response.error !== undefined || !response.response.ok) {
      const status = response.response.status;
      let body = response.error;

      if (body === undefined) {
        try {
          body = await response.response.clone().json();
        } catch {
          try {
            body = await response.response.clone().text();
          } catch {
            body = null;
          }
        }
      }

      throw createError(status, body);
    }

    return response.data as T;
  }

  protected async request<T>(
    executor: (options: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ data?: T; error?: unknown; response: Response }>,
    requestOptions?: RequestOptions
  ): Promise<T> {
    const signal = this.mergeSignals(requestOptions?.signal, requestOptions?.timeoutMs);

    try {
      const response = await executor({ signal, headers: requestOptions?.headers });
      return this.handleResponse(response);
    } catch (error) {
      if (error instanceof RtlsError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
          throw new TimeoutError();
        }
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          throw new NetworkError(error.message, error);
        }
      }

      throw new NetworkError('Unknown error occurred', error as Error);
    }
  }

  get raw(): Client<paths> {
    return this.client;
  }
}
```

**Verification**:
```bash
npx tsc --noEmit src/client/base.ts && echo "PASS" || echo "FAIL"
```

---

### Phase 3 Checkpoint

**Verification**:
```bash
npx tsc --noEmit src/errors.ts src/utils/index.ts src/client/base.ts && echo "Phase 3 Complete - PASS" || echo "FAIL"
```

---

## Phase 4: Resource Implementations

### Task 4.1: Create Assets Resource

**Action**: Write file `src/resources/assets.ts`

```typescript
import { BaseClient, type RequestOptions } from '../client/base';
import type { QueryOptions, FilterOptions, PaginatedResponse } from '../types';
import { buildQueryParams, paginate, collectAll } from '../utils';

export interface ListAssetsOptions extends QueryOptions, FilterOptions {}

export class AssetsResource {
  constructor(private client: BaseClient) {}

  async list(
    namespace: string,
    options?: ListAssetsOptions,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const params = buildQueryParams(options);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/assets/{app_namespace}', {
          params: { path: { app_namespace: namespace }, query: params as Record<string, unknown> },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<PaginatedResponse<Record<string, unknown>>>;
  }

  async get(
    namespace: string,
    macAddress: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async create(
    namespace: string,
    macAddress: string,
    asset: Record<string, unknown>,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          body: asset as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async update(
    namespace: string,
    macAddress: string,
    updates: Record<string, unknown>,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.PATCH('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          body: updates as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async delete(
    namespace: string,
    macAddress: string,
    requestOptions?: RequestOptions
  ): Promise<void> {
    await this.client['request'](
      (fetchOpts) =>
        this.client.raw.DELETE('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          ...fetchOpts,
        }),
      requestOptions
    );
  }

  async batchSave(
    namespace: string,
    assets: Record<string, unknown>[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/assets/{app_namespace}', {
          params: { path: { app_namespace: namespace } },
          body: assets as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async batchDelete(
    namespace: string,
    macAddresses: string[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.DELETE('/assets/{app_namespace}', {
          params: { path: { app_namespace: namespace } },
          body: macAddresses as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async getHistory(
    namespace: string,
    macAddress: string,
    options: { startTime: number; endTime: number },
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/asset_history/{app_namespace}/{mac_address}', {
          params: {
            path: { app_namespace: namespace, mac_address: macAddress },
            query: { start_time: options.startTime, end_time: options.endTime },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  async getStats(
    namespace: string,
    options: { startTime: number; endTime: number },
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/asset_stats/{app_namespace}/{start_time}/{end_time}', {
          params: {
            path: {
              app_namespace: namespace,
              start_time: options.startTime,
              end_time: options.endTime,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  iterate(
    namespace: string,
    options?: Omit<ListAssetsOptions, 'page' | 'limit'> & { pageSize?: number }
  ): AsyncGenerator<Record<string, unknown>, void, unknown> {
    const { pageSize, ...filterOptions } = options ?? {};
    return paginate(
      (page, limit) => this.list(namespace, { ...filterOptions, page, limit }),
      { pageSize }
    );
  }

  async getAll(
    namespace: string,
    options?: Omit<ListAssetsOptions, 'page' | 'limit'> & { pageSize?: number; maxItems?: number }
  ): Promise<Record<string, unknown>[]> {
    const { pageSize, maxItems, ...filterOptions } = options ?? {};
    return collectAll(
      (page, limit) => this.list(namespace, { ...filterOptions, page, limit }),
      { pageSize, maxItems }
    );
  }
}
```

**Verification**:
```bash
npx tsc --noEmit src/resources/assets.ts && echo "PASS" || echo "FAIL"
```

---

### Task 4.2: Create Positions Resource

**Action**: Write file `src/resources/positions.ts`

```typescript
import { BaseClient, type RequestOptions } from '../client/base';
import type { QueryOptions, FilterOptions } from '../types';
import { buildQueryParams } from '../utils';

export interface ListPositionsOptions extends QueryOptions, FilterOptions {}

export interface PositionHistoryOptions {
  timestampFrom: number;
  timestampTo: number;
  key?: string;
  value: string;
}

export interface PublishPositionData {
  user_udid: string;
  lat?: number;
  lon?: number;
  map_uuid?: string;
  user_name?: string;
}

export class PositionsResource {
  constructor(private client: BaseClient) {}

  async listCached(
    namespace: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/cache/{app_namespace}/positions', {
          params: { path: { app_namespace: namespace } },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  async getCached(
    namespace: string,
    macAddress: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/cache/{app_namespace}/positions/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async getLast(
    namespace: string,
    macAddress: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/asset_last_position/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async listLast(
    namespace: string,
    options?: ListPositionsOptions & {
      key?: string;
      queryString?: string;
      mapUuids?: string[];
      timestampFrom?: number;
      timestampTo?: number;
    },
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    const { key, queryString, mapUuids, timestampFrom, timestampTo, ...queryOptions } = options ?? {};

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/es/last_positions/{appNamespace}', {
          params: {
            path: { appNamespace: namespace },
            query: {
              key,
              queryString,
              mapUuids: mapUuids?.join(','),
              timestampFrom,
              timestampTo,
              ...buildQueryParams(queryOptions),
            } as Record<string, unknown>,
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  async getHistory(
    namespace: string,
    options: PositionHistoryOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/es/position_history/{appNamespace}', {
          params: {
            path: { appNamespace: namespace },
            query: {
              key: options.key ?? 'user.udid',
              value: options.value,
              timestampFrom: options.timestampFrom,
              timestampTo: options.timestampTo,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  async publish(
    namespace: string,
    position: PublishPositionData,
    options?: { patchAssetData?: boolean },
    requestOptions?: RequestOptions
  ): Promise<void> {
    await this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/publisher/{app_namespace}', {
          params: {
            path: { app_namespace: namespace },
            query: options?.patchAssetData ? { patch_asset_data: true } : undefined,
          },
          body: position as never,
          ...fetchOpts,
        }),
      requestOptions
    );
  }
}
```

**Verification**:
```bash
npx tsc --noEmit src/resources/positions.ts && echo "PASS" || echo "FAIL"
```

---

### Task 4.3: Create Zones Resource

**Action**: Write file `src/resources/zones.ts`

```typescript
import { BaseClient, type RequestOptions } from '../client/base';
import type { QueryOptions, FilterOptions, PaginatedResponse } from '../types';
import { buildQueryParams, paginate, collectAll } from '../utils';

export interface ListZonesOptions extends QueryOptions, FilterOptions {}

export interface ZonePresenceOptions {
  timestampFrom: number;
  timestampTo: number;
  key?: string;
  value?: string;
  interval?: string;
}

export class ZonesResource {
  constructor(private client: BaseClient) {}

  async list(
    namespace: string,
    venueId: string,
    options?: ListZonesOptions,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const params = buildQueryParams(options);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/zones', {
          params: {
            path: { namespace, venueId },
            query: params as Record<string, unknown>,
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<PaginatedResponse<Record<string, unknown>>>;
  }

  async listByMap(
    namespace: string,
    venueId: string,
    mapId: string,
    options?: ListZonesOptions,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const params = buildQueryParams(options);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/maps/{mapId}/zones', {
          params: {
            path: { namespace, venueId, mapId },
            query: params as Record<string, unknown>,
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<PaginatedResponse<Record<string, unknown>>>;
  }

  async getPresence(
    namespace: string,
    options: ZonePresenceOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/es/zone_presence/{appNamespace}', {
          params: {
            path: { appNamespace: namespace },
            query: {
              timestampFrom: options.timestampFrom,
              timestampTo: options.timestampTo,
              key: options.key,
              value: options.value,
              interval: options.interval,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  iterate(
    namespace: string,
    venueId: string,
    options?: Omit<ListZonesOptions, 'page' | 'limit'> & { pageSize?: number }
  ): AsyncGenerator<Record<string, unknown>, void, unknown> {
    const { pageSize, ...filterOptions } = options ?? {};
    return paginate(
      (page, limit) => this.list(namespace, venueId, { ...filterOptions, page, limit }),
      { pageSize }
    );
  }

  async getAll(
    namespace: string,
    venueId: string,
    options?: Omit<ListZonesOptions, 'page' | 'limit'> & { pageSize?: number; maxItems?: number }
  ): Promise<Record<string, unknown>[]> {
    const { pageSize, maxItems, ...filterOptions } = options ?? {};
    return collectAll(
      (page, limit) => this.list(namespace, venueId, { ...filterOptions, page, limit }),
      { pageSize, maxItems }
    );
  }
}
```

**Verification**:
```bash
npx tsc --noEmit src/resources/zones.ts && echo "PASS" || echo "FAIL"
```

---

### Task 4.4: Create Venues Resource

**Action**: Write file `src/resources/venues.ts`

```typescript
import { BaseClient, type RequestOptions } from '../client/base';
import type { QueryOptions, FilterOptions, PaginatedResponse } from '../types';
import { buildQueryParams, paginate } from '../utils';

export interface ListVenuesOptions extends QueryOptions, FilterOptions {}

export class VenuesResource {
  constructor(private client: BaseClient) {}

  async list(
    namespace: string,
    options?: ListVenuesOptions,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const params = buildQueryParams(options);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}', {
          params: { path: { namespace }, query: params as Record<string, unknown> },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<PaginatedResponse<Record<string, unknown>>>;
  }

  async get(
    namespace: string,
    venueId: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}', {
          params: { path: { namespace, venueId } },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async listMaps(
    namespace: string,
    venueId: string,
    options?: ListVenuesOptions,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const params = buildQueryParams(options);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/maps', {
          params: { path: { namespace, venueId }, query: params as Record<string, unknown> },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<PaginatedResponse<Record<string, unknown>>>;
  }

  async listPois(
    namespace: string,
    venueId: string,
    options?: ListVenuesOptions,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const params = buildQueryParams(options);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/pois', {
          params: { path: { namespace, venueId }, query: params as Record<string, unknown> },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<PaginatedResponse<Record<string, unknown>>>;
  }

  async listMapPois(
    namespace: string,
    venueId: string,
    mapId: string,
    options?: ListVenuesOptions,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const params = buildQueryParams(options);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/maps/{mapId}/pois', {
          params: { path: { namespace, venueId, mapId }, query: params as Record<string, unknown> },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<PaginatedResponse<Record<string, unknown>>>;
  }

  async listPaths(
    namespace: string,
    venueId: string,
    options?: ListVenuesOptions,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const params = buildQueryParams(options);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/paths', {
          params: { path: { namespace, venueId }, query: params as Record<string, unknown> },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<PaginatedResponse<Record<string, unknown>>>;
  }

  iterate(
    namespace: string,
    options?: Omit<ListVenuesOptions, 'page' | 'limit'> & { pageSize?: number }
  ): AsyncGenerator<Record<string, unknown>, void, unknown> {
    const { pageSize, ...filterOptions } = options ?? {};
    return paginate(
      (page, limit) => this.list(namespace, { ...filterOptions, page, limit }),
      { pageSize }
    );
  }
}
```

**Verification**:
```bash
npx tsc --noEmit src/resources/venues.ts && echo "PASS" || echo "FAIL"
```

---

### Task 4.5: Create Alerts Resource

**Action**: Write file `src/resources/alerts.ts`

```typescript
import { BaseClient, type RequestOptions } from '../client/base';

export interface GetAlertsOptions {
  timestampFrom: number;
  timestampTo: number;
  size?: number;
}

export class AlertsResource {
  constructor(private client: BaseClient) {}

  async getRules(
    namespace: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/alert_rules/{app_namespace}', {
          params: { path: { app_namespace: namespace } },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  async saveRules(
    namespace: string,
    rules: Record<string, unknown>[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/alert_rules/{app_namespace}', {
          params: { path: { app_namespace: namespace } },
          body: rules as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  async list(
    namespace: string,
    options: GetAlertsOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/es/alerts/{appNamespace}', {
          params: {
            path: { appNamespace: namespace },
            query: {
              timestampFrom: options.timestampFrom,
              timestampTo: options.timestampTo,
              size: options.size,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }
}
```

**Verification**:
```bash
npx tsc --noEmit src/resources/alerts.ts && echo "PASS" || echo "FAIL"
```

---

### Task 4.6: Create Dashboards Resource

**Action**: Write file `src/resources/dashboards.ts`

```typescript
import { BaseClient, type RequestOptions } from '../client/base';

export interface CreateDashboardData {
  name: string;
  namespace: string;
  data?: Record<string, unknown>;
}

export interface UpdateDashboardData {
  name?: string;
  data?: Record<string, unknown>;
}

export interface SharePermissions {
  read?: boolean;
  write?: boolean;
  delete?: boolean;
}

export class DashboardsResource {
  constructor(private client: BaseClient) {}

  async list(
    namespace?: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/dashboards', {
          params: { query: namespace ? { namespace } : undefined },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  async listCreated(
    namespace?: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/dashboards/created', {
          params: { query: namespace ? { namespace } : undefined },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  async listShared(
    namespace?: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/dashboards/shared', {
          params: { query: namespace ? { namespace } : undefined },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  async listSelected(
    namespace?: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/dashboards/selected', {
          params: { query: namespace ? { namespace } : undefined },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  async get(
    id: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/dashboards/{id}', {
          params: { path: { id } },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async create(
    data: CreateDashboardData,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/dashboards', {
          body: data as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async update(
    id: string,
    data: UpdateDashboardData,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.PUT('/dashboards/{id}', {
          params: { path: { id } },
          body: data as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async delete(
    id: string,
    requestOptions?: RequestOptions
  ): Promise<void> {
    await this.client['request'](
      (fetchOpts) =>
        this.client.raw.DELETE('/dashboards/{id}', {
          params: { path: { id } },
          ...fetchOpts,
        }),
      requestOptions
    );
  }

  async share(
    id: string,
    users: Array<{ username: string; permissions: SharePermissions }>,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/dashboards/{id}/share', {
          params: { path: { id } },
          body: { users } as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async unshare(
    id: string,
    usernames: string[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/dashboards/{id}/unshare', {
          params: { path: { id } },
          body: { usernames } as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }
}
```

**Verification**:
```bash
npx tsc --noEmit src/resources/dashboards.ts && echo "PASS" || echo "FAIL"
```

---

### Task 4.7: Create Navigation Resource

**Action**: Write file `src/resources/navigation.ts`

```typescript
import { BaseClient, type RequestOptions } from '../client/base';

export interface ShortestPathRequest {
  startNodeId: string;
  endNodeId: string;
  options?: {
    avoidStairs?: boolean;
    avoidElevators?: boolean;
  };
}

export interface AccessiblePathRequest {
  startNodeId: string;
  endNodeId: string;
  accessibility: 'wheelchair' | 'visuallyImpaired';
  preferElevator?: boolean;
}

export interface MultiStopRequest {
  nodeIds: string[];
  algorithm: 'nearest' | 'optimal';
  options?: {
    returnToStart?: boolean;
  };
}

export class NavigationResource {
  constructor(private client: BaseClient) {}

  async shortestPath(
    namespace: string,
    request: ShortestPathRequest,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/navigation/shortest-path/{namespace}', {
          params: { path: { namespace } },
          body: {
            start_node_id: request.startNodeId,
            end_node_id: request.endNodeId,
            options: request.options,
          } as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async accessiblePath(
    namespace: string,
    request: AccessiblePathRequest,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/navigation/accessible-path/{namespace}', {
          params: { path: { namespace } },
          body: {
            start_node_id: request.startNodeId,
            end_node_id: request.endNodeId,
            accessibility: request.accessibility,
            prefer_elevator: request.preferElevator,
          } as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async multiStop(
    namespace: string,
    request: MultiStopRequest,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/navigation/multi-stop/{namespace}', {
          params: { path: { namespace } },
          body: {
            node_ids: request.nodeIds,
            algorithm: request.algorithm,
            options: request.options,
          } as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async nearestPoi(
    namespace: string,
    startNodeId: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/navigation/nearest-poi/{namespace}', {
          params: { path: { namespace } },
          body: { start_node_id: startNodeId } as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async evacuation(
    namespace: string,
    startNodeId: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/navigation/evacuation/{namespace}', {
          params: { path: { namespace } },
          body: { start_node_id: startNodeId } as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }
}
```

**Verification**:
```bash
npx tsc --noEmit src/resources/navigation.ts && echo "PASS" || echo "FAIL"
```

---

### Task 4.8: Create Spatial Resource

**Action**: Write file `src/resources/spatial.ts`

```typescript
import { BaseClient, type RequestOptions } from '../client/base';
import type { QueryOptions, FilterOptions } from '../types';
import { buildQueryParams } from '../utils';

export interface SpatialQueryOptions extends QueryOptions, FilterOptions {
  lat: number;
  lon: number;
  limit?: number;
}

export interface RadiusQueryOptions extends SpatialQueryOptions {
  radiusMeters: number;
}

export class SpatialResource {
  constructor(private client: BaseClient) {}

  async nearestAssets(
    namespace: string,
    options: SpatialQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    const { lat, lon, limit, ...filterOptions } = options;
    const params = buildQueryParams(filterOptions);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/spatial/assets/{namespace}/nearest-to-point', {
          params: {
            path: { namespace },
            query: { lat, lon, limit, ...params } as Record<string, unknown>,
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async nearestAssetsRealtime(
    namespace: string,
    options: SpatialQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    const { lat, lon, limit, ...filterOptions } = options;
    const params = buildQueryParams(filterOptions);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/spatial/assets/{namespace}/nearest-realtime', {
          params: {
            path: { namespace },
            query: { lat, lon, limit, ...params } as Record<string, unknown>,
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async zonesContainingPoint(
    namespace: string,
    options: Omit<SpatialQueryOptions, 'limit'>,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    const { lat, lon, ...filterOptions } = options;
    const params = buildQueryParams(filterOptions);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/spatial/zones/{namespace}/containing-point', {
          params: {
            path: { namespace },
            query: { lat, lon, ...params } as Record<string, unknown>,
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  async nearestZones(
    namespace: string,
    options: SpatialQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    const { lat, lon, limit, ...filterOptions } = options;
    const params = buildQueryParams(filterOptions);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/spatial/zones/{namespace}/nearest-to-point', {
          params: {
            path: { namespace },
            query: { lat, lon, limit, ...params } as Record<string, unknown>,
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  async zonesWithinRadius(
    namespace: string,
    options: RadiusQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    const { lat, lon, radiusMeters, ...filterOptions } = options;
    const params = buildQueryParams(filterOptions);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/spatial/zones/{namespace}/within-radius', {
          params: {
            path: { namespace },
            query: { lat, lon, radius_meters: radiusMeters, ...params } as Record<string, unknown>,
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  async analyzeCustomZones(
    namespace: string,
    zones: Record<string, unknown>[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/spatial/zones/{namespace}/analyze-custom', {
          params: { path: { namespace } },
          body: zones as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  async nearestPois(
    namespace: string,
    options: SpatialQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    const { lat, lon, limit, ...filterOptions } = options;
    const params = buildQueryParams(filterOptions);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/spatial/pois/{namespace}/nearest-to-point', {
          params: {
            path: { namespace },
            query: { lat, lon, limit, ...params } as Record<string, unknown>,
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  async poisWithinRadius(
    namespace: string,
    options: RadiusQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    const { lat, lon, radiusMeters, ...filterOptions } = options;
    const params = buildQueryParams(filterOptions);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/spatial/pois/{namespace}/within-radius', {
          params: {
            path: { namespace },
            query: { lat, lon, radius_meters: radiusMeters, ...params } as Record<string, unknown>,
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  async analyzeCustomPois(
    namespace: string,
    pois: Record<string, unknown>[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/spatial/pois/{namespace}/analyze-custom', {
          params: { path: { namespace } },
          body: pois as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }
}
```

**Verification**:
```bash
npx tsc --noEmit src/resources/spatial.ts && echo "PASS" || echo "FAIL"
```

---

### Task 4.9: Create Resources Index

**Action**: Write file `src/resources/index.ts`

```typescript
export { AssetsResource, type ListAssetsOptions } from './assets';
export { PositionsResource, type ListPositionsOptions, type PositionHistoryOptions, type PublishPositionData } from './positions';
export { ZonesResource, type ListZonesOptions, type ZonePresenceOptions } from './zones';
export { VenuesResource, type ListVenuesOptions } from './venues';
export { AlertsResource, type GetAlertsOptions } from './alerts';
export { DashboardsResource, type CreateDashboardData, type UpdateDashboardData, type SharePermissions } from './dashboards';
export { NavigationResource, type ShortestPathRequest, type AccessiblePathRequest, type MultiStopRequest } from './navigation';
export { SpatialResource, type SpatialQueryOptions, type RadiusQueryOptions } from './spatial';
```

**Verification**:
```bash
npx tsc --noEmit src/resources/index.ts && echo "PASS" || echo "FAIL"
```

---

### Phase 4 Checkpoint

**Verification**:
```bash
npx tsc --noEmit src/resources/*.ts && echo "Phase 4 Complete - PASS" || echo "FAIL"
```

---

## Phase 5: Main Client Assembly

### Task 5.1: Create Main Client

**Action**: Write file `src/client/index.ts`

```typescript
import { BaseClient, type RtlsClientOptions, type RequestOptions } from './base';
import { AssetsResource } from '../resources/assets';
import { PositionsResource } from '../resources/positions';
import { ZonesResource } from '../resources/zones';
import { VenuesResource } from '../resources/venues';
import { AlertsResource } from '../resources/alerts';
import { DashboardsResource } from '../resources/dashboards';
import { NavigationResource } from '../resources/navigation';
import { SpatialResource } from '../resources/spatial';

export { type RtlsClientOptions, type RequestOptions } from './base';

export class RtlsClient extends BaseClient {
  readonly assets: AssetsResource;
  readonly positions: PositionsResource;
  readonly zones: ZonesResource;
  readonly venues: VenuesResource;
  readonly alerts: AlertsResource;
  readonly dashboards: DashboardsResource;
  readonly navigation: NavigationResource;
  readonly spatial: SpatialResource;

  constructor(options?: RtlsClientOptions) {
    super(options);

    this.assets = new AssetsResource(this);
    this.positions = new PositionsResource(this);
    this.zones = new ZonesResource(this);
    this.venues = new VenuesResource(this);
    this.alerts = new AlertsResource(this);
    this.dashboards = new DashboardsResource(this);
    this.navigation = new NavigationResource(this);
    this.spatial = new SpatialResource(this);
  }

  async health(requestOptions?: RequestOptions): Promise<Record<string, unknown>> {
    return this.request(
      (fetchOpts) => this.raw.GET('/health', fetchOpts),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async getSettings(
    namespace: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.request(
      (fetchOpts) =>
        this.raw.GET('/settings/{namespace}', {
          params: { path: { namespace } },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async esQuery(
    namespace: string,
    dataType: 'alerts' | 'positions' | 'zone_visits',
    query: Record<string, unknown>,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.request(
      (fetchOpts) =>
        this.raw.POST('/es/query/{appNamespace}/{dataType}', {
          params: { path: { appNamespace: namespace, dataType } },
          body: query as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async sendTagActions(
    namespace: string,
    actions: Array<{
      macAddress: string;
      action: 'ptlRed' | 'ptlGreen' | 'uwbBlink' | 'ptlRedUwbBlink' | 'ptlGreenUwbBlink';
    }>,
    requestOptions?: RequestOptions
  ): Promise<{ message: string; tagCount: number }> {
    return this.request(
      (fetchOpts) =>
        this.raw.POST('/tag-actions/{appNamespace}', {
          params: { path: { appNamespace: namespace } },
          body: actions as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<{ message: string; tagCount: number }>;
  }
}

export function createRtlsClient(options?: RtlsClientOptions): RtlsClient {
  return new RtlsClient(options);
}
```

**Verification**:
```bash
npx tsc --noEmit src/client/index.ts && echo "PASS" || echo "FAIL"
```

---

### Task 5.2: Create Main Exports

**Action**: Write file `src/index.ts`

```typescript
// Main client
export { RtlsClient, createRtlsClient, type RtlsClientOptions, type RequestOptions } from './client';

// Error classes
export {
  RtlsError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  TimeoutError,
  NetworkError,
  createError,
} from './errors';

// Type exports
export type {
  Asset,
  AssetPosition,
  CachedAssetPosition,
  Zone,
  Venue,
  MapData,
  POI,
  Dashboard,
  AlertRule,
  NavigationResponse,
  HealthStatus,
  BatchSaveResult,
  BatchDeleteResult,
  PaginatedResponse,
  QueryOptions,
  FilterOptions,
  FilterOperator,
} from './types';

// Utility exports
export { paginate, collectAll, buildQueryParams, filter, filters, combineFilters } from './utils';

// Resource exports
export {
  AssetsResource,
  PositionsResource,
  ZonesResource,
  VenuesResource,
  AlertsResource,
  DashboardsResource,
  NavigationResource,
  SpatialResource,
} from './resources';

// Resource type exports
export type {
  ListAssetsOptions,
  ListPositionsOptions,
  PositionHistoryOptions,
  PublishPositionData,
  ListZonesOptions,
  ZonePresenceOptions,
  ListVenuesOptions,
  GetAlertsOptions,
  CreateDashboardData,
  UpdateDashboardData,
  SharePermissions,
  ShortestPathRequest,
  AccessiblePathRequest,
  MultiStopRequest,
  SpatialQueryOptions,
  RadiusQueryOptions,
} from './resources';
```

**Verification**:
```bash
npx tsc --noEmit src/index.ts && echo "PASS" || echo "FAIL"
```

---

### Phase 5 Checkpoint

**Verification**:
```bash
npm run typecheck && echo "Phase 5 Complete - PASS" || echo "FAIL"
```

---

## Phase 6: Testing

### Task 6.1: Create Test Setup

**Action**: Write file `test/setup.ts`

```typescript
import { beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

**Verification**:
```bash
test -f test/setup.ts && echo "PASS" || echo "FAIL"
```

---

### Task 6.2: Create Mock Handlers

**Action**: Write file `test/mocks/handlers.ts`

```typescript
import { http, HttpResponse } from 'msw';

const BASE_URL = 'https://rtls.ubudu.com/api';

export const handlers = [
  // Health check
  http.get(`${BASE_URL}/health`, () => {
    return HttpResponse.json({ status: 'healthy', version: '2.5.5' });
  }),

  // Assets list
  http.get(`${BASE_URL}/assets/:namespace`, ({ request }) => {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get('page') ?? 1);
    const limit = Number(url.searchParams.get('limit') ?? 20);

    return HttpResponse.json({
      data: [
        { mac_address: 'AABBCCDDEEFF', name: 'Asset 1' },
        { mac_address: '112233445566', name: 'Asset 2' },
      ],
      page,
      limit,
      total: 2,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });
  }),

  // Asset get
  http.get(`${BASE_URL}/assets/:namespace/:mac`, ({ params }) => {
    return HttpResponse.json({
      mac_address: params.mac,
      name: 'Test Asset',
    });
  }),

  // Asset create
  http.post(`${BASE_URL}/assets/:namespace/:mac`, async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json(body, { status: 201 });
  }),

  // Asset update
  http.patch(`${BASE_URL}/assets/:namespace/:mac`, async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      mac_address: params.mac,
      ...body,
    });
  }),

  // Asset delete
  http.delete(`${BASE_URL}/assets/:namespace/:mac`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Positions
  http.get(`${BASE_URL}/cache/:namespace/positions`, () => {
    return HttpResponse.json([
      { mac_address: 'AABBCCDDEEFF', lat: 48.8566, lon: 2.3522 },
    ]);
  }),

  http.get(`${BASE_URL}/cache/:namespace/positions/:mac`, ({ params }) => {
    return HttpResponse.json({
      mac_address: params.mac,
      lat: 48.8566,
      lon: 2.3522,
    });
  }),

  // Venues
  http.get(`${BASE_URL}/venues/:namespace`, () => {
    return HttpResponse.json({
      data: [{ id: 'venue-1', name: 'Test Venue' }],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });
  }),

  http.get(`${BASE_URL}/venues/:namespace/:venueId`, ({ params }) => {
    return HttpResponse.json({
      id: params.venueId,
      name: 'Test Venue',
    });
  }),

  // Zones
  http.get(`${BASE_URL}/venues/:namespace/:venueId/zones`, () => {
    return HttpResponse.json({
      data: [{ id: 'zone-1', name: 'Test Zone' }],
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });
  }),

  // Error responses for testing
  http.get(`${BASE_URL}/test/error/401`, () => {
    return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }),

  http.get(`${BASE_URL}/test/error/404`, () => {
    return HttpResponse.json({ error: 'Not found' }, { status: 404 });
  }),

  http.get(`${BASE_URL}/test/error/500`, () => {
    return HttpResponse.json({ error: 'Internal server error' }, { status: 500 });
  }),
];
```

**Verification**:
```bash
test -f test/mocks/handlers.ts && echo "PASS" || echo "FAIL"
```

---

### Task 6.3: Create Client Tests

**Action**: Write file `test/client.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createRtlsClient, RtlsClient } from '../src';

describe('RtlsClient', () => {
  let client: RtlsClient;

  beforeEach(() => {
    client = createRtlsClient({
      apiKey: 'test-api-key',
    });
  });

  describe('initialization', () => {
    it('should create client with default options', () => {
      const defaultClient = createRtlsClient();
      expect(defaultClient).toBeInstanceOf(RtlsClient);
    });

    it('should create client with custom options', () => {
      const customClient = createRtlsClient({
        baseUrl: 'https://custom.api.com',
        apiKey: 'custom-key',
        timeoutMs: 5000,
      });
      expect(customClient).toBeInstanceOf(RtlsClient);
    });

    it('should expose resource instances', () => {
      expect(client.assets).toBeDefined();
      expect(client.positions).toBeDefined();
      expect(client.zones).toBeDefined();
      expect(client.venues).toBeDefined();
      expect(client.alerts).toBeDefined();
      expect(client.dashboards).toBeDefined();
      expect(client.navigation).toBeDefined();
      expect(client.spatial).toBeDefined();
    });

    it('should expose raw client', () => {
      expect(client.raw).toBeDefined();
    });
  });

  describe('health check', () => {
    it('should return health status', async () => {
      const health = await client.health();
      expect(health).toHaveProperty('status', 'healthy');
    });
  });
});
```

**Verification**:
```bash
npm run test -- test/client.test.ts && echo "PASS" || echo "FAIL"
```

---

### Task 6.4: Create Error Tests

**Action**: Write file `test/errors.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  RtlsError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  createError,
} from '../src';

describe('Error classes', () => {
  describe('RtlsError', () => {
    it('should create error with all properties', () => {
      const error = new RtlsError('Test error', 500, { detail: 'test' });

      expect(error.message).toBe('Test error');
      expect(error.status).toBe(500);
      expect(error.body).toEqual({ detail: 'test' });
      expect(error.name).toBe('RtlsError');
    });

    it('should identify client errors', () => {
      const error = new RtlsError('Bad request', 400, null);
      expect(error.isClientError()).toBe(true);
      expect(error.isServerError()).toBe(false);
    });

    it('should identify server errors', () => {
      const error = new RtlsError('Server error', 500, null);
      expect(error.isClientError()).toBe(false);
      expect(error.isServerError()).toBe(true);
    });
  });

  describe('createError', () => {
    it('should create AuthenticationError for 401', () => {
      const error = createError(401, { error: 'Invalid token' });
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.status).toBe(401);
    });

    it('should create AuthorizationError for 403', () => {
      const error = createError(403, { error: 'Forbidden' });
      expect(error).toBeInstanceOf(AuthorizationError);
      expect(error.status).toBe(403);
    });

    it('should create NotFoundError for 404', () => {
      const error = createError(404, { error: 'Not found' });
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.status).toBe(404);
    });

    it('should create ValidationError for 422', () => {
      const error = createError(422, { error: 'Validation failed' });
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.status).toBe(422);
    });

    it('should create RateLimitError for 429', () => {
      const error = createError(429, { error: 'Too many requests' });
      expect(error).toBeInstanceOf(RateLimitError);
      expect(error.status).toBe(429);
    });

    it('should create generic RtlsError for other status codes', () => {
      const error = createError(500, { error: 'Server error' });
      expect(error).toBeInstanceOf(RtlsError);
      expect(error).not.toBeInstanceOf(AuthenticationError);
    });
  });
});
```

**Verification**:
```bash
npm run test -- test/errors.test.ts && echo "PASS" || echo "FAIL"
```

---

### Task 6.5: Create Assets Resource Tests

**Action**: Write file `test/resources/assets.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createRtlsClient, RtlsClient } from '../../src';

describe('AssetsResource', () => {
  let client: RtlsClient;
  const namespace = 'test-namespace';

  beforeEach(() => {
    client = createRtlsClient({ apiKey: 'test-key' });
  });

  describe('list', () => {
    it('should list assets', async () => {
      const result = await client.assets.list(namespace);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should support pagination options', async () => {
      const result = await client.assets.list(namespace, { page: 1, limit: 10 });

      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });
  });

  describe('get', () => {
    it('should get single asset', async () => {
      const result = await client.assets.get(namespace, 'AABBCCDDEEFF');

      expect(result).toHaveProperty('mac_address');
    });
  });

  describe('iterate', () => {
    it('should iterate through all assets', async () => {
      const assets: Record<string, unknown>[] = [];
      for await (const asset of client.assets.iterate(namespace)) {
        assets.push(asset);
      }

      expect(assets.length).toBeGreaterThan(0);
    });
  });

  describe('getAll', () => {
    it('should collect all assets', async () => {
      const assets = await client.assets.getAll(namespace);

      expect(Array.isArray(assets)).toBe(true);
    });

    it('should respect maxItems option', async () => {
      const assets = await client.assets.getAll(namespace, { maxItems: 1 });

      expect(assets.length).toBeLessThanOrEqual(1);
    });
  });
});
```

**Verification**:
```bash
npm run test -- test/resources/assets.test.ts && echo "PASS" || echo "FAIL"
```

---

### Task 6.6: Create Utility Tests

**Action**: Write file `test/utils/pagination.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { buildQueryParams, paginate, collectAll } from '../../src/utils';

describe('pagination utilities', () => {
  describe('buildQueryParams', () => {
    it('should build empty params for undefined options', () => {
      expect(buildQueryParams()).toEqual({});
      expect(buildQueryParams(undefined)).toEqual({});
    });

    it('should build pagination params', () => {
      const params = buildQueryParams({ page: 2, limit: 50 });

      expect(params.page).toBe('2');
      expect(params.limit).toBe('50');
    });

    it('should build sort params', () => {
      const params = buildQueryParams({ sort: 'name:asc' });
      expect(params.sort).toBe('name:asc');

      const arrayParams = buildQueryParams({ sort: ['name:asc', 'date:desc'] });
      expect(arrayParams.sort).toBe('name:asc,date:desc');
    });

    it('should build fields params', () => {
      const params = buildQueryParams({ fields: ['name', 'mac_address'] });
      expect(params.fields).toBe('name,mac_address');
    });

    it('should include filter operators', () => {
      const params = buildQueryParams({
        'name:contains': 'test',
        'status:eq': 'active',
      });

      expect(params['name:contains']).toBe('test');
      expect(params['status:eq']).toBe('active');
    });
  });

  describe('paginate', () => {
    it('should iterate through pages', async () => {
      const mockFetcher = vi.fn()
        .mockResolvedValueOnce({
          data: [{ id: 1 }, { id: 2 }],
          hasNext: true,
        })
        .mockResolvedValueOnce({
          data: [{ id: 3 }],
          hasNext: false,
        });

      const items: { id: number }[] = [];
      for await (const item of paginate(mockFetcher, { pageSize: 2 })) {
        items.push(item as { id: number });
      }

      expect(items).toHaveLength(3);
      expect(mockFetcher).toHaveBeenCalledTimes(2);
    });
  });

  describe('collectAll', () => {
    it('should collect all items', async () => {
      const mockFetcher = vi.fn()
        .mockResolvedValueOnce({
          data: [{ id: 1 }, { id: 2 }],
          hasNext: true,
        })
        .mockResolvedValueOnce({
          data: [{ id: 3 }],
          hasNext: false,
        });

      const items = await collectAll(mockFetcher);

      expect(items).toHaveLength(3);
    });

    it('should respect maxItems', async () => {
      const mockFetcher = vi.fn().mockResolvedValue({
        data: [{ id: 1 }, { id: 2 }, { id: 3 }],
        hasNext: true,
      });

      const items = await collectAll(mockFetcher, { maxItems: 2 });

      expect(items).toHaveLength(2);
    });
  });
});
```

**Verification**:
```bash
npm run test -- test/utils/pagination.test.ts && echo "PASS" || echo "FAIL"
```

---

### Phase 6 Checkpoint

**Verification**:
```bash
npm run test && echo "Phase 6 Complete - PASS" || echo "FAIL"
```

---

## Phase 7: CI/CD Configuration

### Task 7.1: Create CI Workflow

**Action**: Write file `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18, 20, 22]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Generate types
        run: npm run generate

      - name: Lint
        run: npm run lint

      - name: Type check
        run: npm run typecheck

      - name: Test
        run: npm run test:coverage

      - name: Build
        run: npm run build

  publish-dry-run:
    runs-on: ubuntu-latest
    needs: build

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - run: npm ci
      - run: npm run generate
      - run: npm run build
      - run: npm pack --dry-run
```

**Verification**:
```bash
test -f .github/workflows/ci.yml && echo "PASS" || echo "FAIL"
```

---

### Task 7.2: Create Release Workflow

**Action**: Write file `.github/workflows/release.yml`

```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to release (e.g., 0.1.0)'
        required: true
        type: string

jobs:
  release:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
          cache: 'npm'

      - run: npm ci
      - run: npm run generate
      - run: npm run lint
      - run: npm run test
      - run: npm run build

      - name: Configure Git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Bump version
        run: npm version ${{ inputs.version }} --no-git-tag-version

      - name: Commit and tag
        run: |
          git add package.json package-lock.json
          git commit -m "chore: release v${{ inputs.version }}"
          git tag "v${{ inputs.version }}"

      - name: Push changes
        run: |
          git push origin main
          git push origin "v${{ inputs.version }}"

      - name: Publish to npm
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          tag_name: "v${{ inputs.version }}"
          generate_release_notes: true
```

**Verification**:
```bash
test -f .github/workflows/release.yml && echo "PASS" || echo "FAIL"
```

---

### Phase 7 Checkpoint

**Verification**:
```bash
ls -la .github/workflows/ && echo "Phase 7 Complete"
```

---

## Phase 8: Documentation

### Task 8.1: Create README

**Action**: Write file `README.md`

```markdown
# @ubudu/rtls-sdk

Official TypeScript SDK for the [Ubudu RTLS API](https://rtls.ubudu.com/api/docs).

[![npm version](https://badge.fury.io/js/%40ubudu%2Frtls-sdk.svg)](https://www.npmjs.com/package/@ubudu/rtls-sdk)
[![CI](https://github.com/ubudu/rtls-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/ubudu/rtls-sdk/actions/workflows/ci.yml)

## Features

- Full TypeScript support with auto-generated types from OpenAPI spec
- Works in Node.js (>=18) and modern browsers
- Simple, ergonomic API design
- Built-in pagination helpers and async iterators
- Comprehensive error handling
- Request timeout and cancellation support
- Tree-shakeable ESM and CJS builds

## Installation

```bash
npm install @ubudu/rtls-sdk
```

## Quick Start

```typescript
import { createRtlsClient } from '@ubudu/rtls-sdk';

const rtls = createRtlsClient({
  apiKey: process.env.UBUDU_API_KEY,
});

// List assets
const { data: assets } = await rtls.assets.list('my-namespace', {
  page: 1,
  limit: 20,
});

// Get single asset
const asset = await rtls.assets.get('my-namespace', 'AABBCCDDEEFF');

// Get positions
const positions = await rtls.positions.listCached('my-namespace');
```

## Configuration

```typescript
const rtls = createRtlsClient({
  baseUrl: 'https://rtls.ubudu.com/api', // default
  apiKey: 'your-api-key',                // X-API-Key header
  accessToken: 'your-jwt-token',         // Bearer token
  timeoutMs: 10000,                       // request timeout
});
```

## Resources

### Assets

```typescript
// List with pagination
const result = await rtls.assets.list('namespace', { page: 1, limit: 50 });

// CRUD operations
const asset = await rtls.assets.get('namespace', 'MAC_ADDRESS');
await rtls.assets.create('namespace', 'MAC_ADDRESS', { name: 'My Asset' });
await rtls.assets.update('namespace', 'MAC_ADDRESS', { name: 'Updated' });
await rtls.assets.delete('namespace', 'MAC_ADDRESS');

// Batch operations
await rtls.assets.batchSave('namespace', [asset1, asset2]);
await rtls.assets.batchDelete('namespace', ['MAC1', 'MAC2']);

// Auto-pagination
for await (const asset of rtls.assets.iterate('namespace')) {
  console.log(asset);
}
const all = await rtls.assets.getAll('namespace', { maxItems: 1000 });
```

### Positions

```typescript
const positions = await rtls.positions.listCached('namespace');
const position = await rtls.positions.getCached('namespace', 'MAC');
const history = await rtls.positions.getHistory('namespace', {
  value: 'asset-udid',
  timestampFrom: Date.now() - 3600000,
  timestampTo: Date.now(),
});
```

### Venues & Zones

```typescript
const { data: venues } = await rtls.venues.list('namespace');
const venue = await rtls.venues.get('namespace', 'venue-id');
const { data: zones } = await rtls.zones.list('namespace', 'venue-id');
```

### Navigation

```typescript
const route = await rtls.navigation.shortestPath('namespace', {
  startNodeId: 'node-a',
  endNodeId: 'node-b',
});
```

### Spatial Analysis

```typescript
const nearest = await rtls.spatial.nearestAssets('namespace', {
  lat: 48.8566,
  lon: 2.3522,
  limit: 5,
});
```

## Filtering

```typescript
import { filters, combineFilters } from '@ubudu/rtls-sdk';

const result = await rtls.assets.list('namespace', {
  ...filters.contains('name', 'forklift'),
  ...filters.greaterThan('battery', 20),
});

// Direct syntax
const result = await rtls.assets.list('namespace', {
  'name:contains': 'warehouse',
  'battery:gte': 50,
});
```

## Error Handling

```typescript
import { RtlsError, NotFoundError } from '@ubudu/rtls-sdk';

try {
  await rtls.assets.get('namespace', 'unknown');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Asset not found');
  } else if (error instanceof RtlsError) {
    console.log(`HTTP ${error.status}:`, error.body);
  }
}
```

## Request Cancellation

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

const assets = await rtls.assets.list('namespace', {}, {
  signal: controller.signal,
});
```

## License

MIT
```

**Verification**:
```bash
test -f README.md && wc -l README.md | awk '{print ($1 > 100 ? "PASS" : "FAIL")}'
```

---

### Task 8.2: Create LICENSE

**Action**: Write file `LICENSE`

```
MIT License

Copyright (c) 2024 Ubudu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Verification**:
```bash
test -f LICENSE && echo "PASS" || echo "FAIL"
```

---

### Task 8.3: Create CHANGELOG

**Action**: Write file `CHANGELOG.md`

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - YYYY-MM-DD

### Added
- Initial release
- Full TypeScript support with OpenAPI-generated types
- Asset management (CRUD, batch, history, stats)
- Position tracking (cached, historical, publishing)
- Zone management and presence tracking
- Venue, map, and POI operations
- Alert management
- Dashboard operations
- Navigation (shortest path, accessible, multi-stop, evacuation)
- Spatial analysis (proximity, containment, radius)
- Pagination helpers with async iterators
- Comprehensive error handling
- Request timeout and cancellation
- ESM and CJS builds
```

**Verification**:
```bash
test -f CHANGELOG.md && echo "PASS" || echo "FAIL"
```

---

### Task 8.4: Create Node Example

**Action**: Write file `examples/node-basic/package.json`

```json
{
  "name": "rtls-sdk-example-node",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "npx tsx index.ts"
  },
  "dependencies": {
    "@ubudu/rtls-sdk": "file:../.."
  },
  "devDependencies": {
    "tsx": "^4.7.0"
  }
}
```

**Verification**:
```bash
test -f examples/node-basic/package.json && echo "PASS" || echo "FAIL"
```

---

### Task 8.5: Create Node Example Script

**Action**: Write file `examples/node-basic/index.ts`

```typescript
import { createRtlsClient, RtlsError, NotFoundError, filters } from '@ubudu/rtls-sdk';

const NAMESPACE = process.env.RTLS_NAMESPACE ?? 'demo-namespace';
const API_KEY = process.env.RTLS_API_KEY;

if (!API_KEY) {
  console.error('Please set RTLS_API_KEY environment variable');
  process.exit(1);
}

const rtls = createRtlsClient({
  apiKey: API_KEY,
  timeoutMs: 10000,
});

async function main() {
  console.log('Ubudu RTLS SDK Example\n');

  // Health check
  console.log('1. Checking API health...');
  try {
    const health = await rtls.health();
    console.log('   Status:', health);
  } catch (error) {
    console.error('   Failed:', error);
  }

  // List assets
  console.log('\n2. Listing assets...');
  try {
    const { data: assets, total } = await rtls.assets.list(NAMESPACE, { limit: 10 });
    console.log(`   Found ${total} assets`);
    assets.slice(0, 3).forEach((a) => console.log(`   - ${a.name} (${a.mac_address})`));
  } catch (error) {
    console.error('   Failed:', error);
  }

  // Filter assets
  console.log('\n3. Filtering assets...');
  try {
    const { data } = await rtls.assets.list(NAMESPACE, {
      ...filters.contains('name', 'test'),
      limit: 5,
    });
    console.log(`   Found ${data.length} matching assets`);
  } catch (error) {
    console.error('   Failed:', error);
  }

  // Error handling
  console.log('\n4. Error handling...');
  try {
    await rtls.assets.get(NAMESPACE, 'NONEXISTENT');
  } catch (error) {
    if (error instanceof NotFoundError) {
      console.log('   Caught NotFoundError (expected)');
    } else if (error instanceof RtlsError) {
      console.log(`   Caught RtlsError: ${error.status}`);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
```

**Verification**:
```bash
test -f examples/node-basic/index.ts && echo "PASS" || echo "FAIL"
```

---

### Phase 8 Checkpoint

**Verification**:
```bash
test -f README.md && test -f LICENSE && test -f CHANGELOG.md && \
test -f examples/node-basic/index.ts && echo "Phase 8 Complete - PASS" || echo "FAIL"
```

---

## Phase 9: Build and Validation

### Task 9.1: Build Package

**Action**: Run build

```bash
npm run build
```

**Verification**:
```bash
test -f dist/index.js && test -f dist/index.cjs && test -f dist/index.d.ts && echo "PASS" || echo "FAIL"
```

---

### Task 9.2: Verify Package Contents

**Action**: Check package

```bash
npm pack --dry-run
```

**Verification**:
```bash
npm pack --dry-run 2>&1 | grep -q "dist/index.js" && echo "PASS" || echo "FAIL"
```

---

### Task 9.3: Run Full Test Suite

**Action**: Run all tests with coverage

```bash
npm run test:coverage
```

**Verification**:
```bash
npm run test:coverage && echo "PASS" || echo "FAIL"
```

---

### Task 9.4: Final Lint Check

**Action**: Run linter

```bash
npm run lint
```

**Verification**:
```bash
npm run lint && echo "PASS" || echo "FAIL"
```

---

### Phase 9 Checkpoint

**Final Verification**:
```bash
echo "=== Final Validation ==="
npm run generate && \
npm run lint && \
npm run typecheck && \
npm run test && \
npm run build && \
npm pack --dry-run && \
echo "=== ALL CHECKS PASSED ===" || echo "=== VALIDATION FAILED ==="
```

---

## Completion Checklist

| # | Criterion | Verification Command |
|---|-----------|---------------------|
| 1 | Types generated from OpenAPI | `test -f src/generated/schema.ts` |
| 2 | ESM bundle exists | `test -f dist/index.js` |
| 3 | CJS bundle exists | `test -f dist/index.cjs` |
| 4 | Type declarations exist | `test -f dist/index.d.ts` |
| 5 | All tests pass | `npm run test` |
| 6 | No lint errors | `npm run lint` |
| 7 | Type check passes | `npm run typecheck` |
| 8 | README exists | `test -f README.md` |
| 9 | LICENSE exists | `test -f LICENSE` |
| 10 | Package can be packed | `npm pack --dry-run` |

---

## Recovery Procedures

### If code generation fails:

```bash
# Check network connectivity
curl -I https://rtls.ubudu.com/api/docs/swagger.json

# Retry with verbose output
npx openapi-typescript "https://rtls.ubudu.com/api/docs/swagger.json" -o src/generated/schema.ts
```

### If tests fail:

```bash
# Run single test for debugging
npm run test -- --reporter=verbose test/client.test.ts

# Check MSW setup
npm run test -- test/setup.ts
```

### If build fails:

```bash
# Check TypeScript errors
npx tsc --noEmit

# Clean and rebuild
rm -rf dist node_modules/.cache
npm run build
```

### If type errors in generated code:

```bash
# Regenerate types
rm src/generated/schema.ts
npm run generate

# If still failing, check openapi-typescript version
npm ls openapi-typescript
```

---

## Agent Execution Summary

**Total Tasks**: 47
**Estimated Execution**: Sequential, ~30 minutes for experienced agent

**Phase Summary**:
1. Phase 1 (10 tasks): Project scaffolding
2. Phase 2 (2 tasks): Code generation
3. Phase 3 (5 tasks): Core implementation
4. Phase 4 (9 tasks): Resources
5. Phase 5 (2 tasks): Client assembly
6. Phase 6 (6 tasks): Testing
7. Phase 7 (2 tasks): CI/CD
8. Phase 8 (5 tasks): Documentation
9. Phase 9 (4 tasks): Build validation

**Success Criteria**: All verification commands return "PASS"
