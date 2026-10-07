import { describe, expect, it } from "vitest";
import { MOVEMENT_CATEGORIES, missingMovementCategories } from "../lib/movementCategories";

describe("built-in movement categories", () => {
  it("adds all three to an organisation that has none", () => {
    expect(missingMovementCategories([]).map((c) => [c.name, c.movementKind])).toEqual([
      ["Transfer between funds", "transfer"],
      ["Returned payment", "reversal"],
      ["Loan", "loan"],
    ]);
  });

  it("finds a renamed built-in by its kind", () => {
    expect(
      missingMovementCategories([{ name: "Fund transfer", movementKind: "transfer" }]).map((c) => c.movementKind)
    ).toEqual(["reversal", "loan"]);
  });

  it("leaves a user category with the same name alone", () => {
    expect(missingMovementCategories([{ name: "loan " }]).map((c) => c.movementKind)).toEqual([
      "transfer",
      "reversal",
    ]);
  });

  it("adds nothing once every kind exists", () => {
    expect(missingMovementCategories(MOVEMENT_CATEGORIES)).toEqual([]);
  });
});
