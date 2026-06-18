import { describe, expect, it } from "vitest";
import { loadEnv } from "../../src/config/env.js";

function createValidEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "development",
    BOT_NAME: "AstraCore",
    BOT_PREFIX: "!",
    OWNER_NUMBERS: "5511999999999,5511888888888",
    DATABASE_URL: "file:./data/astracore.sqlite",
    DATABASE_DIALECT: "sqlite",
    WHATSAPP_AUTH_DIR: "./data/wa-auth",
    WHATSAPP_PAIRING_NUMBER: "",
    WHATSAPP_PRINT_QR: "false",
    PUBLIC_STATUS_SERVER: "true",
    PORT: "3000",
    GEMINI_API_KEY: "AIzaSyTestKey0000000000000000000",
    GEMINI_API_VERSION: "v1beta",
    GEMINI_AI_MODEL: "gemini-3.5-flash",
    GEMINI_FAST_MODEL: "gemini-3.1-flash-lite",
    GEMINI_RPG_MODEL: "gemini-3.1-flash-lite",
    ENABLE_GOOGLE_SEARCH: "true",
    ENABLE_CODE_EXECUTION: "true",
    ENABLE_PUBLIC_REPO_ANALYSIS: "true",
    ENABLE_STRUCTURED_OUTPUT: "true",
    AI_MAX_CONTEXT_MESSAGES: "30",
    AI_MAX_GROUP_CONTEXT_MESSAGES: "20",
    AI_MAX_RESPONSE_CHARS: "12000",
    AI_REPLY_CHUNK_SIZE: "3500",
    RESEARCH_RATE_LIMIT_PER_USER_PER_HOUR: "10",
    DEEP_RESEARCH_RATE_LIMIT_PER_USER_PER_DAY: "5",
    REPO_ANALYSIS_RATE_LIMIT_PER_USER_PER_DAY: "10",
    GENERAL_AI_RATE_LIMIT_PER_USER_PER_HOUR: "60",
    RPG_RATE_LIMIT_PER_USER_PER_MINUTE: "20",
    MAX_USER_MEMORY_ITEMS: "1000",
    MAX_GROUP_MEMORY_ITEMS: "2000",
    MAX_USER_PROFILE_FACTS: "500",
    MAX_GROUP_PROFILE_FACTS: "800",
    MEMORY_REVIEW_INTERVAL_DAYS: "30",
    LOG_LEVEL: "info",
    ...overrides
  };
}

describe("loadEnv", () => {
  it("loads a valid env and coerces types", () => {
    const env = loadEnv(createValidEnv());

    expect(env.BOT_NAME).toBe("AstraCore");
    expect(env.BOT_PREFIX).toBe("!");
    expect(env.WHATSAPP_PRINT_QR).toBe(false);
    expect(env.PUBLIC_STATUS_SERVER).toBe(true);
    expect(env.PORT).toBe(3000);
  });

  it("rejects an empty prefix", () => {
    expect(() =>
      loadEnv(createValidEnv({ BOT_PREFIX: "   " }))
    ).toThrowError(/BOT_PREFIX/i);
  });

  it("requires a Gemini key outside test", () => {
    expect(() =>
      loadEnv(createValidEnv({ GEMINI_API_KEY: "", NODE_ENV: "production" }))
    ).toThrowError(/GEMINI_API_KEY/i);
  });

  it("allows a missing Gemini key in test", () => {
    const env = loadEnv(createValidEnv({ GEMINI_API_KEY: "", NODE_ENV: "test" }));

    expect(env.NODE_ENV).toBe("test");
    expect(env.GEMINI_API_KEY).toBe("");
  });

  it("parses owner numbers into an array", () => {
    const env = loadEnv(createValidEnv({ OWNER_NUMBERS: "5511, 5522 ,,5533" }));

    expect(env.OWNER_NUMBERS).toEqual(["5511", "5522", "5533"]);
  });
});
