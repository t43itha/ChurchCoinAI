import { describe, expect, it } from "vitest";
import { displayNameProblem } from "../lib/displayNames";

describe("display names", () => {
  it.each([
    ["J.R. Smith", "person"],
    ["A.B. Jones", "person"],
    ["St. Mark's C of E (Anytown) & District", "church"],
    ["Holy Trinity, Clapham", "church"],
  ] as const)("accepts the real name %s", (name, kind) => {
    expect(displayNameProblem(name, kind)).toBeNull();
  });

  it.each(["example.com", "www.site.co.uk", "a@b.com", "http://x"])("refuses the address %s", (name) => {
    expect(displayNameProblem(name, "church")).toMatch(/no web or email addresses/);
  });
});
