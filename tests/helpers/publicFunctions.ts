// Static inventory of public Convex functions and the capabilities each names.
// It reads source, so it shows a gate is present, not that it holds: an
// unreachable (`if (false)`) or un-awaited async gate is not counted, but a
// conditional one is. The behaviour tests are the guarantee.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { CAPABILITIES } from "../../lib/permissions";

export const PUBLIC_FUNCTION_DIRS = ["queries", "mutations", "actions", "intelligence"] as const;
const PUBLIC_BUILDERS = new Set(["query", "mutation", "action"]);
// Calls that authorize a capability given as a string literal:
// requireCapability(ctx, cap), assertCapability(user, cap), and the action
// helpers requireUser(ctx, cap, ...). A bare requireAuth names no capability.
const GATE_CALLS = new Set(["requireCapability", "assertCapability", "requireUser"]);
// Gates that return a promise: they only block when the caller waits for them.
const ASYNC_GATES = new Set(["requireCapability", "requireUser"]);

export type PublicFunction = { name: string; capabilities: string[] };
type Helper = { capabilities: string[]; isAsync: boolean };

const convexDir = path.resolve(__dirname, "..", "..", "convex");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.ts$/.test(entry.name) ? [full] : [];
  });
}

const calleeName = (call: ts.CallExpression) =>
  ts.isIdentifier(call.expression) ? call.expression.text : undefined;

// The promise reaches a caller that waits for it: awaited, returned, or the
// whole body of an arrow function.
function isAwaited(call: ts.CallExpression): boolean {
  let node: ts.Node = call;
  while (ts.isParenthesizedExpression(node.parent)) node = node.parent;
  const parent = node.parent;
  return ts.isAwaitExpression(parent) || ts.isReturnStatement(parent) || (ts.isArrowFunction(parent) && parent.body === node);
}

// Inside the then-branch of `if (false)`, somewhere below `root`.
function isUnreachable(node: ts.Node, root: ts.Node): boolean {
  for (let child = node, parent = node.parent; parent && child !== root; child = parent, parent = parent.parent) {
    if (ts.isIfStatement(parent) && parent.thenStatement === child && parent.expression.kind === ts.SyntaxKind.FalseKeyword) {
      return true;
    }
  }
  return false;
}

const isAsyncFunction = (fn: ts.FunctionLikeDeclaration) =>
  fn.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ?? false;

// Capabilities a node checks directly, or through a same-file helper that does.
function capabilitiesIn(node: ts.Node, helpers: Map<string, Helper>): string[] {
  const found: string[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child) && !isUnreachable(child, node)) {
      const name = calleeName(child);
      if (name && GATE_CALLS.has(name)) {
        const literal = child.arguments.find(ts.isStringLiteralLike);
        const waited = !ASYNC_GATES.has(name) || isAwaited(child);
        if (literal && literal.text in CAPABILITIES && waited) found.push(literal.text);
      } else if (name && helpers.has(name)) {
        const helper = helpers.get(name)!;
        if (!helper.isAsync || isAwaited(child)) found.push(...helper.capabilities);
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

export function functionsInSource(module: string, text: string): PublicFunction[] {
  const source = ts.createSourceFile(`${module}.ts`, text, ts.ScriptTarget.Latest, true);
  const helpers = new Map<string, Helper>();
  const exported: Array<{ name: string; definition: ts.Node }> = [];

  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      helpers.set(statement.name.text, {
        capabilities: capabilitiesIn(statement.body, helpers),
        isAsync: isAsyncFunction(statement),
      });
    }
    if (!ts.isVariableStatement(statement)) continue;
    const isExported = statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const init = declaration.initializer;
      if (ts.isCallExpression(init) && PUBLIC_BUILDERS.has(calleeName(init) ?? "")) {
        if (isExported) exported.push({ name: `${module}:${declaration.name.text}`, definition: init });
      } else if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
        helpers.set(declaration.name.text, { capabilities: capabilitiesIn(init.body, helpers), isAsync: isAsyncFunction(init) });
      }
    }
  }
  return exported.map(({ name, definition }) => ({ name, capabilities: capabilitiesIn(definition, helpers) }));
}

export function publicFunctions(): PublicFunction[] {
  return PUBLIC_FUNCTION_DIRS.flatMap((dir) =>
    sourceFiles(path.join(convexDir, dir)).flatMap((file) =>
      functionsInSource(
        path.relative(convexDir, file).replace(/\\/g, "/").replace(/\.ts$/, ""),
        readFileSync(file, "utf8")
      )
    )
  );
}
