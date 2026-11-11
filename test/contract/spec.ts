// Spec loader and response validator for the contract tests (P0 §5.5.1, D-10).
// Validates fixture bodies against the response schemas of the vendored OpenAPI 3.0 spec with Ajv 8:
// `strict: false`, `allErrors: true`, ajv-formats, and the OpenAPI-only formats (int32, int64, float,
// double, byte, binary) registered as always valid. `nullable` is an Ajv built-in keyword. `$ref`s into
// `#/components/...` are resolved against the spec's components, registered once under SPEC_SCHEMA_ID.
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const SPEC_PATH = resolve(__dirname, '..', '..', 'spec', 'rtls-api.swagger.json');
const SPEC_SCHEMA_ID = 'https://spec.invalid/openapi.json';
const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;
const OPENAPI_FORMATS = ['int32', 'int64', 'float', 'double', 'byte', 'binary'] as const;

export interface OpenApiResponse {
  description?: string;
  content?: Record<string, { schema?: unknown }>;
}
export interface OpenApiOperation {
  tags?: string[];
  responses?: Record<string, OpenApiResponse>;
  [key: string]: unknown;
}
export interface OpenApiSpec {
  info?: { version?: string };
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: Record<string, unknown>;
}
export interface ValidationIssue {
  /** JSON pointer into the body, '' for the root. */
  path: string;
  message: string;
}
export interface ValidationResult {
  /** No schema errors (additional properties do not count). */
  valid: boolean;
  errors: ValidationIssue[];
  /** JSON pointers of body properties that the schema does not declare (reported, never failed). */
  additional: string[];
}

export function loadSpec(path: string = SPEC_PATH): OpenApiSpec {
  return JSON.parse(readFileSync(path, 'utf8')) as OpenApiSpec;
}

/** Operation ids ("METHOD path") of a spec, in path order then method order. */
export function listOperationIds(spec: OpenApiSpec): string[] {
  const ids: string[] = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const m of HTTP_METHODS) if (item?.[m]) ids.push(`${m.toUpperCase()} ${path}`);
  }
  return ids;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Deep copy whose local `$ref`s (`#/…`) point into the registered spec document. */
function rebaseRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rebaseRefs);
  if (!isObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] =
      k === '$ref' && typeof v === 'string' && v.startsWith('#')
        ? SPEC_SCHEMA_ID + v
        : rebaseRefs(v);
  }
  return out;
}

function pointerEscape(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

export class SpecValidator {
  readonly spec: OpenApiSpec;
  private readonly ajv: Ajv;
  private readonly cache = new Map<string, ValidateFunction>();

  constructor(spec: OpenApiSpec) {
    this.spec = spec;
    this.ajv = new Ajv({ strict: false, allErrors: true, validateSchema: false });
    addFormats(this.ajv);
    for (const f of OPENAPI_FORMATS) this.ajv.addFormat(f, true);
    this.ajv.addSchema(
      { $id: SPEC_SCHEMA_ID, components: spec.components ?? {} },
      undefined,
      undefined,
      false
    );
  }

  operation(id: string): OpenApiOperation | undefined {
    const space = id.indexOf(' ');
    if (space === -1) return undefined;
    const method = id.slice(0, space).toLowerCase();
    const path = id.slice(space + 1);
    return this.spec.paths?.[path]?.[method];
  }

  hasOperation(id: string): boolean {
    return this.operation(id) !== undefined;
  }

  /** The response object declared for a status: exact code, then `2XX`-style range, then `default`. */
  response(id: string, status: number): OpenApiResponse | undefined {
    const responses = this.operation(id)?.responses ?? {};
    return responses[String(status)] ?? responses[`${String(status)[0]}XX`] ?? responses.default;
  }

  isStatusDeclared(id: string, status: number): boolean {
    return this.response(id, status) !== undefined;
  }

  contentTypes(id: string, status: number): string[] {
    return Object.keys(this.response(id, status)?.content ?? {});
  }

  responseSchema(
    id: string,
    status: number,
    contentType = 'application/json'
  ): unknown | undefined {
    const content = this.response(id, status)?.content ?? {};
    const base = contentType.split(';')[0]?.trim().toLowerCase() ?? contentType;
    const key = Object.keys(content).find((k) => k.toLowerCase() === base);
    return key === undefined ? undefined : content[key]?.schema;
  }

  /** Validates a value against an arbitrary schema (local `$ref`s resolve against the spec). */
  validateSchema(schema: unknown, value: unknown): ValidationResult {
    const key = JSON.stringify(schema);
    let validate = this.cache.get(key);
    if (!validate) {
      validate = this.ajv.compile(rebaseRefs(schema) as object);
      this.cache.set(key, validate);
    }
    const ok = validate(value) as boolean;
    const errors: ValidationIssue[] = [];
    const additional = new Set<string>();
    for (const e of (ok ? [] : (validate.errors ?? [])) as ErrorObject[]) {
      if (e.keyword === 'additionalProperties') {
        const prop = String((e.params as { additionalProperty?: string }).additionalProperty);
        additional.add(`${e.instancePath}/${pointerEscape(prop)}`);
        continue;
      }
      errors.push({ path: e.instancePath, message: `${e.message ?? e.keyword}` });
    }
    for (const p of this.undeclaredProperties(schema, value, '')) additional.add(p);
    return { valid: errors.length === 0, errors, additional: [...additional].sort() };
  }

  /** Validates a body against the response schema of an operation and status. */
  validateResponse(
    id: string,
    status: number,
    body: unknown,
    contentType = 'application/json'
  ): ValidationResult | undefined {
    const schema = this.responseSchema(id, status, contentType);
    return schema === undefined ? undefined : this.validateSchema(schema, body);
  }

  private resolve(schema: unknown, depth = 0): Record<string, unknown> | undefined {
    if (!isObject(schema) || depth > 32) return undefined;
    const ref = schema.$ref;
    if (typeof ref === 'string' && ref.startsWith('#/')) {
      let target: unknown = this.spec;
      for (const seg of ref.slice(2).split('/')) {
        target = isObject(target) ? target[seg.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined;
      }
      return this.resolve(target, depth + 1);
    }
    return schema;
  }

  /**
   * Body properties the schema does not declare (objects with `properties` and no explicit
   * `additionalProperties`). Composition keywords (`oneOf`/`anyOf`/`allOf`) are not descended.
   */
  private undeclaredProperties(schema: unknown, value: unknown, path: string, depth = 0): string[] {
    const s = this.resolve(schema);
    if (!s || depth > 32) return [];
    const out: string[] = [];
    if (Array.isArray(value)) {
      if (s.items !== undefined)
        value.forEach((v, i) =>
          out.push(...this.undeclaredProperties(s.items, v, `${path}/${i}`, depth + 1))
        );
      return out;
    }
    if (!isObject(value) || !isObject(s.properties)) return out;
    const props = s.properties;
    for (const [k, v] of Object.entries(value)) {
      const child = `${path}/${pointerEscape(k)}`;
      if (k in props) out.push(...this.undeclaredProperties(props[k], v, child, depth + 1));
      else if (s.additionalProperties === undefined) out.push(child);
    }
    return out;
  }
}

let cached: SpecValidator | undefined;

/** Validator for the vendored spec (cached). */
export function specValidator(): SpecValidator {
  cached ??= new SpecValidator(loadSpec());
  return cached;
}
