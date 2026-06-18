import { describe, expect, it } from "vitest";
import { redactSecrets } from "../../src/security/redaction.js";

describe("redactSecrets", () => {
  it("redacts known secret fields in objects", () => {
    const result = redactSecrets({
      geminiApiKey: "AIzaSyExample0000000000000000000",
      nested: {
        sessionData: "wa:auth:secret"
      }
    });

    expect(result).toEqual({
      geminiApiKey: "[REDACTED]",
      nested: {
        sessionData: "[REDACTED]"
      }
    });
  });

  it("redacts bearer tokens in strings", () => {
    const result = redactSecrets("Authorization: Bearer abc.def.ghi");

    expect(result).toBe("Authorization: [REDACTED]");
  });

  it("redacts private keys in strings", () => {
    const result = redactSecrets(
      "-----BEGIN PRIVATE KEY-----\nsecret-data\n-----END PRIVATE KEY-----"
    );

    expect(result).toBe("[REDACTED]");
  });

  it("redacts env-style secrets and WhatsApp auth strings", () => {
    const result = redactSecrets("GEMINI_API_KEY=secret123 whatsappAuthToken=WAabcd123456");

    expect(result).toBe("[REDACTED] [REDACTED]");
  });
});
