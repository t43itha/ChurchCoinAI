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

  it.each(["A.Smith", "J. R. R. Tolkien", "Christ Church 1662"])("accepts %s", (name) => {
    expect(displayNameProblem(name, "person")).toBeNull();
  });

  it.each(["example.com", "www.site.co.uk", "a@b.com", "http://x", "Visit 203.0.113.10/login", "x.co", "go to q.io now"])("refuses the address %s", (name) => {
    expect(displayNameProblem(name, "church")).toMatch(/no web or email addresses/);
  });
});
