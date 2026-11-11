#!/usr/bin/env node
// Public-surface walker (P0 §5.5.6): lists the callable public surface of the SDK from `src/index.ts`
// with the TypeScript compiler API. Names:
//   - public method of an object reachable from an RtlsClient instance property (depth ≤ 3) → `<prop>.<method>`
//     (`assets.list`, `notifications.rules.create`); the file and line are those of the declaring class
//   - public method of RtlsClient itself, including members inherited from its base classes → `client.<method>`
//   - public method (instance or static) of another exported class → `<Class>.<method>`; inherited members are
//     attributed to the declaring class (`RtlsError.is`, not `ValidationError.is`)
//   - exported function → `<name>`
//   - function-valued member of an exported const object → `<object>.<member>` (`filters.equals`)
// Excluded: private / protected / `#` members, constructors, accessors (an accessor is traversed when its
// value is an object, but it is not an item), members and exports tagged `@internal`, and members declared
// outside the entry's folder (node_modules, lib files).
//
// CLI: node scripts/lib/surface.mjs [--json] [--entry <file>] [--client <ClassName>]
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { UsageError, parseArgs } from './cli.mjs';
import { REPO_ROOT } from './git.mjs';

/**
 * @typedef {'client-method' | 'reachable-method' | 'class-method' | 'static-method' | 'function' | 'object-member'} SurfaceKind
 * @typedef {{ name: string; kind: SurfaceKind; file: string; line: number }} SurfaceItem
 * @typedef {{ name: string; kind: 'value'; file: string; line: number }} ExportedValue
 */

export const DEFAULT_ENTRY = 'src/index.ts';
export const DEFAULT_CLIENT_CLASS = 'RtlsClient';
const MAX_DEPTH = 3;

/**
 * @param {ts.Node} node
 */
function hasInternalTag(node) {
  return ts.getJSDocTags(node).some((t) => t.tagName.text === 'internal');
}

/**
 * @param {ts.Declaration} decl
 */
function isHidden(decl) {
  const flags = ts.getCombinedModifierFlags(decl);
  if (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) return true;
  const name = /** @type {any} */ (decl).name;
  if (name && ts.isPrivateIdentifier(name)) return true;
  return hasInternalTag(decl);
}

/**
 * @param {ts.Declaration} decl
 */
function isStatic(decl) {
  return (ts.getCombinedModifierFlags(decl) & ts.ModifierFlags.Static) !== 0;
}

/**
 * Lists the public surface.
 *
 * @param {{ root?: string; entry?: string; clientClass?: string; tsconfig?: string }} [options]
 * @returns {{ items: SurfaceItem[]; values: ExportedValue[] }}
 *   `items` are the callable surface names; `values` are the other exported runtime names (constants,
 *   non-callable objects), which manifests may list under `sdkMethods`.
 */
export function walkSurface({
  root = REPO_ROOT,
  entry = DEFAULT_ENTRY,
  clientClass = DEFAULT_CLIENT_CLASS,
  tsconfig = 'tsconfig.json',
} = {}) {
  const entryPath = isAbsolute(entry) ? entry : resolve(root, entry);
  const sourceRoot = dirname(entryPath) + sep;
  const configPath = resolve(root, tsconfig);
  const parsed = ts.getParsedCommandLineOfConfigFile(
    configPath,
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} }
  );
  const options = { ...(parsed?.options ?? {}), noEmit: true, rootDir: undefined };
  const program = ts.createProgram({ rootNames: [entryPath], options });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entryPath);
  if (!source) throw new UsageError(`surface: entry ${entry} not found`);
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) return { items: [], values: [] };

  /** @type {Map<string, SurfaceItem>} */
  const items = new Map();
  /** @type {Map<string, ExportedValue>} */
  const values = new Map();
  /** @type {Set<ts.Symbol>} classes whose members are named through the client */
  const reachedClasses = new Set();

  /** @param {ts.Node} node */
  const where = (node) => {
    const sf = node.getSourceFile();
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return { file: relative(root, sf.fileName).split(sep).join('/'), line: line + 1 };
  };
  /** @param {ts.Declaration} decl */
  const inSource = (decl) => {
    const f = decl.getSourceFile().fileName.split('/').join(sep);
    return f.startsWith(sourceRoot) && !f.includes(`${sep}node_modules${sep}`);
  };
  /**
   * @param {string} name
   * @param {SurfaceKind} kind
   * @param {ts.Node} node
   */
  const add = (name, kind, node) => {
    if (!items.has(name)) items.set(name, { name, kind, ...where(node) });
  };
  /** @param {ts.Symbol} s */
  const resolveAlias = (s) => (s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s);
  /** @param {ts.Symbol} s */
  const declOf = (s) =>
    /** @type {ts.Declaration | undefined} */ (s.valueDeclaration ?? s.declarations?.[0]);
  /** @param {ts.Type} t */
  const isCallable = (t) => t.getCallSignatures().length > 0;
  /** @param {ts.Declaration} d */
  const isMethodDecl = (d) => ts.isMethodDeclaration(d) || ts.isMethodSignature(d);
  /** @param {ts.Declaration} d */
  const isAccessor = (d) => ts.isGetAccessorDeclaration(d) || ts.isSetAccessorDeclaration(d);

  /**
   * The class that declares a member, or undefined.
   *
   * @param {ts.Declaration} decl
   * @returns {string | undefined}
   */
  const declaringClassName = (decl) => {
    const parent = decl.parent;
    if (parent && (ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) && parent.name)
      return parent.name.text;
    return undefined;
  };

  /**
   * Classes in the extends chain of a class symbol (the class itself included).
   *
   * @param {ts.Symbol} classSymbol
   * @returns {ts.Symbol[]}
   */
  const classChain = (classSymbol) => {
    /** @type {ts.Symbol[]} */
    const chain = [];
    /** @type {ts.Type | undefined} */
    let t = checker.getDeclaredTypeOfSymbol(classSymbol);
    while (t && t.symbol && chain.length < 16) {
      chain.push(t.symbol);
      /** @type {ts.BaseType[]} */
      const bases = t.isClassOrInterface()
        ? checker.getBaseTypes(/** @type {ts.InterfaceType} */ (t))
        : [];
      t = bases[0];
    }
    return chain;
  };

  /**
   * Members of an object type reachable from the client: methods become `<path>.<name>`, object-valued
   * properties and accessors are descended.
   *
   * @param {ts.Type} type
   * @param {string[]} path
   * @param {Set<ts.Symbol>} onPath
   */
  const walkReachable = (type, path, onPath) => {
    if (path.length > MAX_DEPTH) return;
    const typeSymbol = type.getSymbol();
    if (typeSymbol) {
      if (onPath.has(typeSymbol)) return;
      if (typeSymbol.flags & ts.SymbolFlags.Class)
        for (const c of classChain(typeSymbol)) reachedClasses.add(c);
    }
    const nextOnPath = new Set(onPath);
    if (typeSymbol) nextOnPath.add(typeSymbol);
    for (const prop of checker.getPropertiesOfType(type)) {
      const decl = declOf(prop);
      if (!decl || !inSource(decl) || isHidden(decl) || isStatic(decl)) continue;
      const name = prop.getName();
      const propType = checker.getTypeOfSymbolAtLocation(prop, decl);
      if (isMethodDecl(decl) || (!isAccessor(decl) && isCallable(propType))) {
        add(
          path.length ? `${path.join('.')}.${name}` : `client.${name}`,
          path.length ? 'reachable-method' : 'client-method',
          decl
        );
        continue;
      }
      const target = propType.getSymbol();
      const targetDecl = target ? declOf(target) : undefined;
      if (targetDecl && inSource(targetDecl) && path.length < MAX_DEPTH) {
        walkReachable(propType, [...path, name], nextOnPath);
      }
    }
  };

  /**
   * @param {ts.Symbol} classSymbol
   * @param {string} exportName
   */
  const walkExportedClass = (classSymbol, exportName) => {
    const decl = declOf(classSymbol);
    if (!decl || hasInternalTag(decl)) return;
    const instance = checker.getDeclaredTypeOfSymbol(classSymbol);
    for (const prop of checker.getPropertiesOfType(instance)) {
      const d = declOf(prop);
      if (!d || !inSource(d) || isHidden(d)) continue;
      if (!(
        isMethodDecl(d) ||
        (!isAccessor(d) && isCallable(checker.getTypeOfSymbolAtLocation(prop, d)))
      ))
        continue;
      const owner = declaringClassName(d) ?? exportName;
      add(`${owner}.${prop.getName()}`, 'class-method', d);
    }
    walkStatics(classSymbol, exportName);
  };

  /**
   * @param {ts.Symbol} classSymbol
   * @param {string} exportName
   */
  const walkStatics = (classSymbol, exportName) => {
    const decl = declOf(classSymbol);
    if (!decl) return;
    const ctor = checker.getTypeOfSymbolAtLocation(classSymbol, decl);
    for (const prop of checker.getPropertiesOfType(ctor)) {
      const d = declOf(prop);
      if (!d || !inSource(d) || isHidden(d) || !isStatic(d)) continue;
      if (!(
        isMethodDecl(d) ||
        (!isAccessor(d) && isCallable(checker.getTypeOfSymbolAtLocation(prop, d)))
      ))
        continue;
      const owner = declaringClassName(d) ?? exportName;
      add(`${owner}.${prop.getName()}`, 'static-method', d);
    }
  };

  /** @type {Array<[string, ts.Symbol]>} */
  const exportedClasses = [];
  /** @type {ts.Symbol | undefined} */
  let client;
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const exportName = exported.getName();
    if (exportName === 'default') continue;
    const typeOnly = exported.declarations?.some(
      (d) => ts.isExportSpecifier(d) && (d.isTypeOnly || d.parent.parent.isTypeOnly)
    );
    if (typeOnly) continue;
    const symbol = resolveAlias(exported);
    const decl = declOf(symbol);
    if (!decl || hasInternalTag(decl)) continue;
    if (symbol.flags & ts.SymbolFlags.Class) {
      if (symbol.getName() === clientClass || exportName === clientClass) client = symbol;
      else exportedClasses.push([exportName, symbol]);
      continue;
    }
    if (symbol.flags & ts.SymbolFlags.Function) {
      add(exportName, 'function', decl);
      continue;
    }
    if (symbol.flags & ts.SymbolFlags.Variable) {
      const type = checker.getTypeOfSymbolAtLocation(symbol, decl);
      if (isCallable(type)) {
        add(exportName, 'function', decl);
        continue;
      }
      let callableMembers = 0;
      for (const prop of checker.getPropertiesOfType(type)) {
        const d = declOf(prop);
        if (!d || !inSource(d) || isHidden(d)) continue;
        if (isCallable(checker.getTypeOfSymbolAtLocation(prop, d))) {
          add(`${exportName}.${prop.getName()}`, 'object-member', d);
          callableMembers++;
        }
      }
      if (callableMembers === 0 && !values.has(exportName))
        values.set(exportName, { name: exportName, kind: 'value', ...where(decl) });
    }
  }

  if (client) {
    for (const c of classChain(client)) reachedClasses.add(c);
    walkReachable(checker.getDeclaredTypeOfSymbol(client), [], new Set());
    walkStatics(client, client.getName());
  }
  for (const [exportName, symbol] of exportedClasses) {
    if (reachedClasses.has(symbol)) walkStatics(symbol, exportName);
    else walkExportedClass(symbol, exportName);
  }

  const byName = (/** @type {{ name: string }} */ a, /** @type {{ name: string }} */ b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  return { items: [...items.values()].sort(byName), values: [...values.values()].sort(byName) };
}

/**
 * The callable surface items (see walkSurface).
 *
 * @param {Parameters<typeof walkSurface>[0]} [options]
 * @returns {SurfaceItem[]}
 */
export function listSurface(options) {
  return walkSurface(options).items;
}

/**
 * @param {readonly string[]} argv
 * @returns {number}
 */
export function main(argv) {
  /** @type {ReturnType<typeof parseArgs<'json', 'entry' | 'client'>>} */
  let args;
  try {
    args = parseArgs(argv, { flags: ['json'], options: ['entry', 'client'] });
  } catch (err) {
    console.error(`surface: ${/** @type {Error} */ (err).message}`);
    return 2;
  }
  const result = walkSurface({
    entry: args.options.entry ?? DEFAULT_ENTRY,
    clientClass: args.options.client ?? DEFAULT_CLIENT_CLASS,
  });
  if (args.flags.json) console.log(JSON.stringify(result, null, 2));
  else for (const item of result.items) console.log(`${item.name}\t${item.file}:${item.line}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
