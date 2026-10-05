// Every write to a `transactions` row must go through convex/lib/transactionWrites
// so the completed-reconciliation lock runs. Reviewers caught bypasses twice
// (ae392d8 bulk edits, fd1a518 pledge linking); guard against those write paths.
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
  const server = program.getSourceFile(path.join(convexDir, "_generated", "server.d.ts"));
  const writerDeclaration = server?.statements.find(
    (node): node is ts.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(node) && node.name.text === "DatabaseWriter"
  );
  if (!writerDeclaration) throw new Error("Cannot resolve the generated Convex DatabaseWriter type");
  const writerType = checker.getTypeAtLocation(writerDeclaration);
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
        checker.isTypeAssignableTo(
          checker.getTypeAtLocation(node.expression.expression),
          writerType
        ) &&
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

  it("catches direct, destructured and aliased database receivers", () => {
    const fixture = path.join(convexDir, "mutations", "__directDbFixture.ts");
    const program = loadProgram({
      [fixture]: `
        import type { DatabaseWriter, MutationCtx } from "../_generated/server";
        import type { Doc, Id } from "../_generated/dataModel";
        export async function direct(db: DatabaseWriter, id: Id<"transactions">, row: Doc<"transactions">) {
          await db.patch(id, { amount: 10 });
          await db.replace(id, row);
          await db.delete(id);
        }
        export async function destructured(ctx: MutationCtx, id: Id<"transactions">) {
          const { db } = ctx;
          await db.patch(id, { amount: 10 });
          const writer = db;
          await writer.delete(id);
        }
        export async function unrelated(ctx: MutationCtx, donorId: Id<"donors">, id: Id<"transactions">) {
          const { db } = ctx;
          await db.patch(donorId, { name: "Updated" });
          const cache = new Map<Id<"transactions">, string>();
          cache.delete(id);
          const other = { db: { delete: (_id: Id<"transactions">) => true } };
          other.db.delete(id);
        }
      `,
    });
    expect(program.getSemanticDiagnostics(program.getSourceFile(fixture))).toEqual([]);
    expect(
      findDirectTransactionWrites(program).filter((site) => site.includes("__directDbFixture"))
    ).toHaveLength(5);
  }, 60_000);
});
