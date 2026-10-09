import { describe, expect, it } from "vitest";
import {
  RAIL_ORDER,
  previousStepFor,
  railStateFor,
  resolveStep,
  stepReady,
  type StepFacts,
} from "../components/banking/steps";

const ready: StepFacts = {
  selectedCollections: 1,
  collectionErrors: 0,
  selectedCredits: 1,
  creditErrors: 0,
  variance: 0,
  varianceType: "",
  varianceNote: "",
};

describe("banking rail", () => {
  it("runs collections, bank, check, done in that order", () => {
    expect(RAIL_ORDER).toEqual(["collections", "bank", "check", "done"]);
  });

  it("marks the steps before the current one done, the current one now and the rest to do", () => {
    expect(railStateFor("collections", "bank")).toBe("done");
    expect(railStateFor("bank", "bank")).toBe("now");
    expect(railStateFor("check", "bank")).toBe("todo");
    expect(railStateFor("done", "bank")).toBe("todo");
  });

  it("marks every step done once the walkthrough reaches done", () => {
    for (const kind of RAIL_ORDER) expect(railStateFor(kind, "done")).toBe("done");
  });
});

describe("resolveStep", () => {
  it("opens on collections when no step is asked for", () => {
    expect(resolveStep(null, false)).toBe("collections");
  });

  it("opens the step asked for while the banking is open", () => {
    expect(resolveStep("check", false)).toBe("check");
  });

  it("only shows done after a successful completion", () => {
    expect(resolveStep("done", false)).toBe("collections");
    expect(resolveStep("done", true)).toBe("done");
  });
});

describe("previousStepFor", () => {
  it("steps back one place at a time", () => {
    expect(previousStepFor("check")).toBe("bank");
    expect(previousStepFor("bank")).toBe("collections");
  });

  it("has no step before the first, or before done", () => {
    expect(previousStepFor("collections")).toBeUndefined();
    expect(previousStepFor("done")).toBeUndefined();
  });
});

describe("stepReady", () => {
  it("needs at least one collection ticked, with valid amounts, to leave collections", () => {
    expect(stepReady("collections", { ...ready, selectedCollections: 0 })).toBe(false);
    expect(stepReady("collections", { ...ready, collectionErrors: 1 })).toBe(false);
    expect(stepReady("collections", ready)).toBe(true);
  });

  it("needs at least one bank credit ticked, with valid amounts, to leave the bank step", () => {
    expect(stepReady("bank", { ...ready, selectedCredits: 0 })).toBe(false);
    expect(stepReady("bank", { ...ready, creditErrors: 2 })).toBe(false);
    expect(stepReady("bank", ready)).toBe(true);
  });

  it("lets a matching count through the check step with no reason given", () => {
    expect(stepReady("check", ready)).toBe(true);
  });

  it("blocks the check step while the difference cannot be worked out", () => {
    expect(stepReady("check", { ...ready, variance: null })).toBe(false);
  });

  it("blocks the check step when a collection or credit amount is invalid, even if the variance reads zero", () => {
    expect(stepReady("check", { ...ready, collectionErrors: 1 })).toBe(false);
    expect(stepReady("check", { ...ready, creditErrors: 1 })).toBe(false);
  });

  it("needs a reason and a note of three characters for a difference", () => {
    const off = { ...ready, variance: 50 };
    expect(stepReady("check", off)).toBe(false);
    expect(stepReady("check", { ...off, varianceType: "other" })).toBe(false);
    expect(stepReady("check", { ...off, varianceType: "other", varianceNote: "ab" })).toBe(false);
    expect(stepReady("check", { ...off, varianceType: "other", varianceNote: "abc" })).toBe(true);
  });

  it("does not ask for a reason when the variance is only a fraction of a penny", () => {
    expect(stepReady("check", { ...ready, variance: 0.001 })).toBe(true);
  });

  it("never lets the walkthrough move on from done", () => {
    expect(stepReady("done", ready)).toBe(false);
  });
});
