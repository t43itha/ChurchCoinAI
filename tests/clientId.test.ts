import { describe, expect, it } from "vitest";
import { createClientAttemptId } from "../lib/clientId";

describe("client checkout attempt IDs", () => {
  it("creates IDs accepted by the checkout action validator", () => {
    const attemptId = createClientAttemptId();
    expect(attemptId).toMatch(/^[a-zA-Z0-9_-]{16,100}$/);
  });

  it("creates a different value for each attempt", () => {
    expect(createClientAttemptId()).not.toBe(createClientAttemptId());
  });
});
