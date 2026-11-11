// Route table of the guard (P0 §5.3 G3): the path templates of the vendored spec plus the string-literal
// keys of `export interface ExtraPaths` in `src/generated/overrides.ts` (absent file = none). Express-style
// spec paths are normalised (a leading `/api` dropped, `:param` → `{param}`); literal segments win over
// parameters.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHECKOUT_ROOT } from './state-io.mjs';

export const SPEC_PATH = join(CHECKOUT_ROOT, 'spec', 'rtls-api.swagger.json');
export const OVERRIDES_PATH = join(CHECKOUT_ROOT, 'src', 'generated', 'overrides.ts');
export const BASE_MANIFEST_PATH = join(CHECKOUT_ROOT, 'spec', 'manifest', 'base.json');

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'];

type Segment = { literal: string } | { param: string };

export interface RouteTemplate {
  /** Normalised template, e.g. `/assets/{app_namespace}/{mac_address}`. */
  template: string;
  /** Upper-case methods the spec declares; `null` for ExtraPaths keys (methods unknown). */
  methods: Set<string> | null;
  source: 'spec' | 'extra';
  segments: Segment[];
}

export interface RouteMatch {
  template: string;
  params: Record<string, string>;
  methods: Set<string> | null;
  source: 'spec' | 'extra';
}

export interface RouteTable {
  templates: RouteTemplate[];
  /** `"METHOD template"` of every operation whose base.json decision is `exclude`. */
  excluded: Set<string>;
}

/** `/api/spatial/assets/:namespace/x` → `/spatial/assets/{namespace}/x`. */
export function normalizeTemplate(path: string): string {
  let out = path.trim();
  if (out === '/api' || out.startsWith('/api/')) out = out.slice(4) || '/';
  out = out.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}');
  if (out.length > 1) out = out.replace(/\/+$/, '');
  return out;
}

function segmentsOf(template: string): Segment[] {
  return template
    .split('/')
    .filter((part) => part !== '')
    .map((part) => {
      const m = /^\{([^}]+)\}$/.exec(part);
      return m ? { param: m[1] as string } : { literal: part };
    });
}

/** String-literal keys starting with `/` inside `export interface ExtraPaths { … }`. */
export function parseExtraPathKeys(source: string): string[] {
  const start = /export\s+interface\s+ExtraPaths\b[^{]*\{/.exec(source);
  if (!start) return [];
  let depth = 1;
  let i = start.index + start[0].length;
  const bodyStart = i;
  for (; i < source.length && depth > 0; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
  }
  const body = source.slice(bodyStart, i - 1);
  const keys: string[] = [];
  const re = /(['"])(\/[^'"\n]*)\1\s*\??\s*:/g;
  for (let m = re.exec(body); m; m = re.exec(body)) keys.push(m[2] as string);
  return [...new Set(keys)];
}

export function buildRouteTable(input: {
  spec: { paths?: Record<string, Record<string, unknown>> };
  extraKeys?: string[];
  excludedOperations?: string[];
}): RouteTable {
  const byTemplate = new Map<string, RouteTemplate>();
  for (const [path, item] of Object.entries(input.spec.paths ?? {})) {
    const template = normalizeTemplate(path);
    const methods = new Set(
      Object.keys(item)
        .filter((k) => HTTP_METHODS.includes(k))
        .map((k) => k.toUpperCase())
    );
    const existing = byTemplate.get(template);
    if (existing?.methods) for (const m of methods) existing.methods.add(m);
    else
      byTemplate.set(template, {
        template,
        methods,
        source: 'spec',
        segments: segmentsOf(template),
      });
  }
  for (const key of input.extraKeys ?? []) {
    const template = normalizeTemplate(key);
    if (!byTemplate.has(template)) {
      byTemplate.set(template, {
        template,
        methods: null,
        source: 'extra',
        segments: segmentsOf(template),
      });
    }
  }
  const excluded = new Set<string>();
  for (const id of input.excludedOperations ?? []) {
    const space = id.indexOf(' ');
    excluded.add(`${id.slice(0, space).toUpperCase()} ${normalizeTemplate(id.slice(space + 1))}`);
  }
  return { templates: [...byTemplate.values()], excluded };
}

const tableCache = new Map<string, RouteTable>();

/** Route table from the vendored spec, the overrides file and base.json (cached per file set). */
export function loadRouteTable(
  options: { specPath?: string; overridesPath?: string; baseManifestPath?: string } = {}
): RouteTable {
  const specPath = options.specPath ?? SPEC_PATH;
  const overridesPath = options.overridesPath ?? OVERRIDES_PATH;
  const basePath = options.baseManifestPath ?? BASE_MANIFEST_PATH;
  const key = `${specPath}\0${overridesPath}\0${basePath}`;
  const cached = tableCache.get(key);
  if (cached) return cached;
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  const extraKeys = existsSync(overridesPath)
    ? parseExtraPathKeys(readFileSync(overridesPath, 'utf8'))
    : [];
  const excludedOperations: string[] = existsSync(basePath)
    ? (
        JSON.parse(readFileSync(basePath, 'utf8')) as {
          operations: { id: string; decision: string }[];
        }
      ).operations
        .filter((op) => op.decision === 'exclude')
        .map((op) => op.id)
    : [];
  const table = buildRouteTable({ spec, extraKeys, excludedOperations });
  tableCache.set(key, table);
  return table;
}

/** Splits a relative path into decoded segments; `null` when a segment cannot be decoded. */
function pathSegments(relPath: string): string[] | null {
  let path = relPath.startsWith('/') ? relPath.slice(1) : relPath;
  if (path.endsWith('/')) path = path.slice(0, -1);
  if (path === '') return [];
  const parts = path.split('/');
  if (parts.some((p) => p === '')) return null;
  try {
    return parts.map((p) => decodeURIComponent(p));
  } catch {
    return null;
  }
}

/** Matches a path relative to the base path; literal segments win over parameters; unknown → null. */
export function matchRoute(table: RouteTable, relPath: string): RouteMatch | null {
  const segments = pathSegments(relPath);
  if (!segments) return null;
  let best: { route: RouteTemplate; params: Record<string, string>; rank: number[] } | null = null;
  for (const route of table.templates) {
    if (route.segments.length !== segments.length) continue;
    const params: Record<string, string> = {};
    const rank: number[] = [];
    let ok = true;
    for (let i = 0; i < segments.length; i += 1) {
      const seg = route.segments[i] as Segment;
      const value = segments[i] as string;
      if ('literal' in seg) {
        if (seg.literal !== value) {
          ok = false;
          break;
        }
        rank.push(1);
      } else {
        params[seg.param] = value;
        rank.push(0);
      }
    }
    if (!ok) continue;
    if (!best || compareRank(rank, best.rank) > 0) best = { route, params, rank };
  }
  if (!best) return null;
  return {
    template: best.route.template,
    params: best.params,
    methods: best.route.methods,
    source: best.route.source,
  };
}

function compareRank(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
