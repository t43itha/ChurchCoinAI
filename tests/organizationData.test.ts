import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GLOBAL_OPERATIONAL_TABLES,
  ORGANIZATION_DATA_TABLES,
  ORGANIZATION_DELETION_TABLES,
} from "../lib/organizationData";

describe("organization data lifecycle table coverage", () => {
  it("keeps the export inventory aligned with the Convex schema", () => {
    const schema = readFileSync(
      new URL("../convex/schema.ts", import.meta.url),
      "utf8"
    );
    const schemaTables = Array.from(
      schema.matchAll(/^[ ]{2}([A-Za-z][A-Za-z0-9]*): defineTable/gm),
      (match) => match[1]
    );

    expect(
      [...ORGANIZATION_DATA_TABLES, ...GLOBAL_OPERATIONAL_TABLES].sort()
    ).toEqual(schemaTables.sort());
  });

  it("deletes every tenant table exactly once before the organization", () => {
    expect(new Set(ORGANIZATION_DELETION_TABLES).size).toBe(
      ORGANIZATION_DELETION_TABLES.length
    );
    expect([...ORGANIZATION_DELETION_TABLES].sort()).toEqual(
      ORGANIZATION_DATA_TABLES.filter(
        (table) => table !== "organizations"
      ).sort()
    );
  });
});
