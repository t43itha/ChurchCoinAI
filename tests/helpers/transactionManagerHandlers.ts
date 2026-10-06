import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../../components/TransactionManager.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("TransactionManager.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Runs a handler from TransactionManager's source with its closure supplied by
// the test, so import flows are exercised without rendering the component.
export function uiFunction(name: string, scope: Record<string, unknown>): (...args: any[]) => any {
  let expression = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer) {
      expression = node.initializer.getText(ast);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!expression) throw new Error(`Missing source handler ${name}`);
  const js = ts.transpileModule(`const extracted = ${expression};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(scope), `${js}; return extracted;`)(...Object.values(scope));
}
