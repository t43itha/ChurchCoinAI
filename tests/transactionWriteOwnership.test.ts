// Every write to a `transactions` row must go through convex/lib/transactionWrites
// so the completed-reconciliation lock runs. Reviewers caught bypasses twice
// (ae392d8 bulk edits, fd1a518 pledge linking); this makes a third impossible.
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const convexDir = path.join(root, "convex");
const OWNER = path.join(convexDir, "lib", "transactionWrites.ts");
const WRITE_METHODS = new Set(["patch", "replace", "delete"]);

function loadProgram(overrides: Record<string, string> = {}) {
  const configPath = path.join(convexDir, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, convexDir);
  const host = ts.createCompilerHost(parsed.options);
  const readFile = host.readFile.bind(host);
  host.readFile = (fileName) => overrides[path.resolve(fileName)] ?? readFile(fileName);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (fileName) => path.resolve(fileName) in overrides || fileExists(fileName);
  const rootNames = [...new Set([...parsed.fileNames, ...Object.keys(overrides)])];
  return ts.createProgram(rootNames, parsed.options, host);
}

// Returns "file:line" for each db.patch/replace/delete that targets a transaction.
export function findDirectTransactionWrites(program: ts.Program): string[] {
  const checker = program.getTypeChecker();
  const offenders: string[] = [];
  for (const sourceFile of program.getSourceFiles()) {
    const file = path.resolve(sourceFile.fileName);
    if (!file.startsWith(convexDir) || file.includes(`${path.sep}_generated${path.sep}`)) continue;
    if (file === OWNER) continue;
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        WRITE_METHODS.has(node.expression.name.text) &&
        ts.isPropertyAccessExpression(node.expression.expression) &&
        node.expression.expression.name.text === "db" &&
        node.arguments.length > 0
      ) {
        const first = node.arguments[0];
        // Generic multi-table teardowns (organizations.ts) pass a union of ids
        // and are deliberately out of scope; anything typed as a transaction id
        // is not.
        const targetsTransactions =
          (ts.isStringLiteral(first) && first.text === "transactions") ||
          /^Id<"transactions">( \| (null|undefined))*$/.test(
            checker.typeToString(checker.getTypeAtLocation(first))
          );
        if (targetsTransactions) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          offenders.push(`${path.relative(root, file).replace(/\\/g, "/")}:${line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return offenders;
}

describe("transaction write ownership", () => {
  it("routes every transactions write through convex/lib/transactionWrites", () => {
    expect(
      findDirectTransactionWrites(loadProgram()),
      "Write transactions with patchTransaction / deleteTransaction from convex/lib/transactionWrites.ts " +
        "so assertNotLockedByReconciliation runs. Pass { lockOverride } only for the reasons listed in LockOverride."
    ).toEqual([]);
  }, 60_000);

  it("catches the fd1a518 pledge-link bypass", () => {
    // The pre-fd1a518 linkToPledge wrote pledgeId without the lock check.
    const fixture = path.join(convexDir, "mutations", "__lockBypassFixture.ts");
    const program = loadProgram({
      [fixture]: `
        import { mutation } from "../_generated/server";
        import { v } from "convex/values";
        export const linkToPledge = mutation({
          args: { transactionId: v.id("transactions"), pledgeId: v.id("pledges") },
          handler: async (ctx, args) => {
            await ctx.db.patch(args.transactionId, { pledgeId: args.pledgeId });
          },
        });
      `,
    });
    expect(
      findDirectTransactionWrites(program).filter((site) => site.includes("__lockBypassFixture"))
    ).toHaveLength(1);
  }, 60_000);
});
