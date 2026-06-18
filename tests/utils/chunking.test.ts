import { describe, expect, it } from "vitest";
import { chunkWhatsAppText } from "../../src/utils/chunking.js";

describe("chunkWhatsAppText", () => {
  it("never exceeds max chars", () => {
    const chunks = chunkWhatsAppText("alpha beta gamma delta", 10);

    expect(chunks.every((chunk) => chunk.length <= 10)).toBe(true);
  });

  it("prefers paragraph and newline boundaries", () => {
    const chunks = chunkWhatsAppText("line1\nline2\n\nline3", 12);

    expect(chunks).toEqual(["line1\nline2\n", "\nline3"]);
  });
});
