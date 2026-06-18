import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashJid, stableId } from "../../src/utils/ids.js";

describe("hashJid", () => {
  it("uses sha-256 hashing", () => {
    const jid = "5511999999999@s.whatsapp.net";
    const expected = createHash("sha256").update(jid).digest("hex");

    expect(hashJid(jid)).toBe(expected);
    expect(hashJid(jid)).not.toContain(jid);
  });
});

describe("stableId", () => {
  it("returns a stable prefixed digest", () => {
    expect(stableId("Profile Cache", "same-input")).toBe(stableId("Profile Cache", "same-input"));
  });
});
