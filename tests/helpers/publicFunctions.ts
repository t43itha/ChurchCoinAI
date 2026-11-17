// Static inventory of public Convex functions and the capabilities each enforces.
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

export type PublicFunction = { name: string; capabilities: string[] };

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

// Capabilities a node enforces directly, or through a same-file helper that does.
function capabilitiesIn(node: ts.Node, helpers: Map<string, string[]>): string[] {
  const found: string[] = [];
  const visit = (child: ts.Node) => {
    if (ts.isCallExpression(child)) {
      const name = calleeName(child);
      if (name && GATE_CALLS.has(name)) {
        const literal = child.arguments.find(ts.isStringLiteralLike);
        if (literal && literal.text in CAPABILITIES) found.push(literal.text);
      } else if (name && helpers.has(name)) {
        found.push(...helpers.get(name)!);
      }
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

export function functionsInSource(module: string, text: string): PublicFunction[] {
  const source = ts.createSourceFile(`${module}.ts`, text, ts.ScriptTarget.Latest, true);
  const helpers = new Map<string, string[]>();
  const exported: Array<{ name: string; definition: ts.Node }> = [];

  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      helpers.set(statement.name.text, capabilitiesIn(statement.body, helpers));
    }
    if (!ts.isVariableStatement(statement)) continue;
    const isExported = statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const init = declaration.initializer;
      if (ts.isCallExpression(init) && PUBLIC_BUILDERS.has(calleeName(init) ?? "")) {
        if (isExported) exported.push({ name: `${module}:${declaration.name.text}`, definition: init });
      } else if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
        helpers.set(declaration.name.text, capabilitiesIn(init.body, helpers));
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
