import { describe, expect, it } from "vitest";
import {
  normalizeCommandName,
  normalizeWhitespace,
  splitCommand,
  truncateText
} from "../../src/utils/text.js";

describe("normalizeWhitespace", () => {
  it("collapses whitespace", () => {
    expect(normalizeWhitespace("  hello \n world\t ")).toBe("hello world");
  });
});

describe("normalizeCommandName", () => {
  it("normalizes case and accents", () => {
    expect(normalizeCommandName("  ÁJúDa  ")).toBe("ajuda");
  });
});

describe("splitCommand", () => {
  it("parses prefixed commands", () => {
    expect(splitCommand("!Ping one two", "!")).toEqual({
      name: "ping",
      args: ["one", "two"],
      rawArgs: "one two"
    });
  });

  it("preserves argument casing and spacing in raw args", () => {
    const result = splitCommand("!echo   Keep  THIS   spacing", "!");

    expect(result?.rawArgs).toBe("Keep  THIS   spacing");
  });

  it("returns null when the prefix does not match", () => {
    expect(splitCommand("/ping", "!")).toBeNull();
  });
});

describe("truncateText", () => {
  it("truncates long text with ellipsis", () => {
    expect(truncateText("hello world", 8)).toBe("hello...");
  });
});
