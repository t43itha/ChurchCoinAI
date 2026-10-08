import { describe, expect, it } from "vitest";
import * as programmeQueries from "../convex/queries/programmes";
import * as programmeMutations from "../convex/mutations/programmes";
import { fixture, invoke, type Row } from "./helpers/convexFixture";

const programme = (id: string, name: string, extra: Record<string, unknown> = {}): Row => ({
  _id: id,
  organizationId: "org",
  name,
  createdAt: 1,
  ...extra,
});

describe("programme create", () => {
  it("returns one programme for repeated and differently cased names", async () => {
    const { ctx, records } = fixture();

    const first = await invoke(programmeMutations.create, ctx, { name: "Harvest" });
    const second = await invoke(programmeMutations.create, ctx, { name: "  harvest " });

    expect(second).toBe(first);
    expect(records.programmes.map((row) => row.name)).toEqual(["Harvest"]);
  });

  it("un-archives an archived programme with the same name", async () => {
    const { ctx, records } = fixture({
      programmes: [programme("camp", "Camp", { isArchived: true })],
    });

    const id = await invoke(programmeMutations.create, ctx, { name: "camp" });

    expect(id).toBe("camp");
    expect(records.programmes).toEqual([expect.objectContaining({ _id: "camp", isArchived: false })]);
  });

  it("refuses a name shorter than two characters", async () => {
    const { ctx } = fixture();

    await expect(invoke(programmeMutations.create, ctx, { name: " a " })).rejects.toThrow(
      "Programme name must be at least 2 characters"
    );
  });
});

describe("programme list", () => {
  const programmes = () => [
    programme("harvest", "Harvest"),
    programme("camp", "Camp", { isArchived: true }),
  ];

  it("hides archived programmes unless asked", async () => {
    const { ctx } = fixture({ programmes: programmes() });

    const visible = await invoke(programmeQueries.list, ctx, {});
    const all = await invoke(programmeQueries.list, ctx, { includeArchived: true });

    expect((visible as Row[]).map((row) => row.name)).toEqual(["Harvest"]);
    expect((all as Row[]).map((row) => row.name)).toEqual(["Camp", "Harvest"]);
  });

  it("lists only the organization's programmes", async () => {
    const { ctx } = fixture({
      programmes: [...programmes(), programme("other", "Other church camp", { organizationId: "other-org" })],
    });

    const all = await invoke(programmeQueries.list, ctx, { includeArchived: true });

    expect((all as Row[]).map((row) => row._id)).toEqual(["camp", "harvest"]);
  });
});

describe("programme archiving", () => {
  it("archives a programme in the organization", async () => {
    const { ctx, get } = fixture({ programmes: [programme("harvest", "Harvest")] });

    await invoke(programmeMutations.setArchived, ctx, { programmeId: "harvest", isArchived: true });

    expect(get("harvest")?.isArchived).toBe(true);
  });

  it("refuses to archive another organization's programme", async () => {
    const { ctx, get } = fixture({
      programmes: [programme("other", "Other", { organizationId: "other-org" })],
    });

    await expect(
      invoke(programmeMutations.setArchived, ctx, { programmeId: "other", isArchived: true })
    ).rejects.toThrow("Programme not found");
    expect(get("other")?.isArchived).toBeUndefined();
  });
});
