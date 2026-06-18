import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { createSqliteConnection, initializeDatabaseSchema } from "../../src/db/client.js";
import { createProfilesRepository } from "../../src/db/repositories/profiles.repo.js";
import { schema } from "../../src/db/schema.js";
import { GeminiService } from "../../src/gemini/gemini.client.js";
import { createLogger } from "../../src/observability/logger.js";
import type { IncomingMessageContext } from "../../src/router/command.types.js";
import { ProfileService } from "../../src/profiles/profile.service.js";

function createDb() {
  const sqlite = createSqliteConnection(":memory:");
  initializeDatabaseSchema(sqlite);
  return drizzle(sqlite, { schema });
}

function createContext(overrides: Partial<IncomingMessageContext> = {}): IncomingMessageContext {
  return {
    messageId: "m1",
    chatJid: "user@s.whatsapp.net",
    senderJid: "user@s.whatsapp.net",
    senderDisplayName: "User",
    isGroup: false,
    isOwner: false,
    rawText: "message",
    commandText: "message",
    args: [],
    hasMedia: false,
    timestamp: new Date(),
    ...overrides
  };
}

function geminiForFacts(facts: unknown, shouldThrow = false) {
  return new GeminiService({
    env: {
      NODE_ENV: "test",
      BOT_NAME: "AstraCore",
      BOT_PREFIX: "!",
      OWNER_NUMBERS: [],
      DATABASE_URL: "file:test",
      DATABASE_DIALECT: "sqlite",
      WHATSAPP_AUTH_DIR: "",
      WHATSAPP_PAIRING_NUMBER: "",
      WHATSAPP_PRINT_QR: false,
      PUBLIC_STATUS_SERVER: false,
      PORT: 3000,
      GEMINI_API_KEY: "key",
      GEMINI_API_VERSION: "v1beta",
      GEMINI_AI_MODEL: "gemini-3.5-flash",
      GEMINI_FAST_MODEL: "gemini-3.1-flash-lite",
      GEMINI_RPG_MODEL: "gemini-3.1-flash-lite",
      ENABLE_GOOGLE_SEARCH: true,
      ENABLE_CODE_EXECUTION: true,
      ENABLE_PUBLIC_REPO_ANALYSIS: true,
      ENABLE_STRUCTURED_OUTPUT: true,
      AI_MAX_CONTEXT_MESSAGES: 30,
      AI_MAX_GROUP_CONTEXT_MESSAGES: 20,
      AI_MAX_RESPONSE_CHARS: 12000,
      AI_REPLY_CHUNK_SIZE: 3500,
      RESEARCH_RATE_LIMIT_PER_USER_PER_HOUR: 10,
      DEEP_RESEARCH_RATE_LIMIT_PER_USER_PER_DAY: 5,
      REPO_ANALYSIS_RATE_LIMIT_PER_USER_PER_DAY: 10,
      GENERAL_AI_RATE_LIMIT_PER_USER_PER_HOUR: 60,
      RPG_RATE_LIMIT_PER_USER_PER_MINUTE: 20,
      MAX_USER_MEMORY_ITEMS: 1000,
      MAX_GROUP_MEMORY_ITEMS: 2000,
      MAX_USER_PROFILE_FACTS: 500,
      MAX_GROUP_PROFILE_FACTS: 800,
      MEMORY_REVIEW_INTERVAL_DAYS: 30,
      LOG_LEVEL: "info"
    },
    logger: createLogger("silent"),
    client: {
      models: {
        generateContent: shouldThrow
          ? vi.fn(async () => {
              throw new Error("boom");
            })
          : vi.fn(async () => ({
              text: JSON.stringify({ facts }),
              candidates: [{ finishReason: "STOP" }],
              usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
            }))
      }
    }
  });
}

describe("profile extraction", () => {
  it("stores explicit facts", async () => {
    const db = createDb();
    const repo = createProfilesRepository(db);
    const service = new ProfileService(
      repo,
      geminiForFacts([
        {
          ownerType: "user",
          zone: "profile",
          fact: "Prefers concise technical answers",
          confidence: 90,
          sensitivity: "low",
          source: "explicit_user",
          reason: "User explicitly stated it"
        }
      ])
    );
    const context = createContext({ commandName: "ai" });

    await service.storeExtractedFacts({ context, commandResultSummary: "done" });
    const facts = await repo.listProfileFacts("user@s.whatsapp.net");

    expect(facts).toHaveLength(1);
  });

  it("minimal privacy blocks derived facts", async () => {
    const db = createDb();
    const repo = createProfilesRepository(db);
    await repo.upsertPrivacySetting({
      id: "privacy:user@s.whatsapp.net",
      scope: "user",
      ownerId: "user@s.whatsapp.net",
      mode: "minimal",
      allowAiMemory: false,
      allowRpgMemory: false
    });
    const service = new ProfileService(
      repo,
      geminiForFacts([
        {
          ownerType: "user",
          zone: "profile",
          fact: "Derived preference",
          confidence: 80,
          sensitivity: "low",
          source: "derived",
          reason: "Derived"
        }
      ])
    );

    await service.storeExtractedFacts({ context: createContext({ commandName: "ai" }), commandResultSummary: "done" });
    expect(await repo.listProfileFacts("user@s.whatsapp.net")).toHaveLength(0);
  });

  it("normal privacy allows low-sensitivity preferences and rich allows broader preferences", async () => {
    const db = createDb();
    const repo = createProfilesRepository(db);
    const normalService = new ProfileService(
      repo,
      geminiForFacts([
        {
          ownerType: "user",
          zone: "ai",
          fact: "Likes bullet lists",
          confidence: 75,
          sensitivity: "low",
          source: "derived",
          reason: "Stable preference"
        }
      ])
    );

    await normalService.storeExtractedFacts({ context: createContext({ commandName: "ai" }), commandResultSummary: "done" });
    expect((await repo.listProfileFacts("user@s.whatsapp.net")).length).toBe(1);

    await repo.upsertPrivacySetting({
      id: "privacy:user@s.whatsapp.net",
      scope: "user",
      ownerId: "user@s.whatsapp.net",
      mode: "rich",
      allowAiMemory: true,
      allowRpgMemory: false
    });

    const richService = new ProfileService(
      repo,
      geminiForFacts([
        {
          ownerType: "user",
          zone: "profile",
          fact: "Prefers architecture tradeoff analysis",
          confidence: 82,
          sensitivity: "medium",
          source: "derived",
          reason: "Broader professional preference"
        }
      ])
    );
    await richService.storeExtractedFacts({ context: createContext({ commandName: "ai" }), commandResultSummary: "done" });
    expect((await repo.listProfileFacts("user@s.whatsapp.net")).length).toBe(2);
  });

  it("rejects high sensitivity inferred facts and ignores RPG events for professional memory", async () => {
    const db = createDb();
    const repo = createProfilesRepository(db);
    const service = new ProfileService(
      repo,
      geminiForFacts([
        {
          ownerType: "user",
          zone: "ai",
          fact: "Sensitive inferred trait",
          confidence: 70,
          sensitivity: "high",
          source: "derived",
          reason: "Blocked"
        },
        {
          ownerType: "user",
          zone: "ai",
          fact: "RPG artifact",
          confidence: 70,
          sensitivity: "low",
          source: "explicit_user",
          reason: "From RPG"
        }
      ])
    );

    await service.storeExtractedFacts({ context: createContext({ commandName: "rpgmove" }), commandResultSummary: "done" });
    expect(await repo.listProfileFacts("user@s.whatsapp.net")).toHaveLength(0);
  });

  it("stores group facts separately and extraction failures are non-fatal", async () => {
    const db = createDb();
    const repo = createProfilesRepository(db);
    const groupService = new ProfileService(
      repo,
      geminiForFacts([
        {
          ownerType: "group",
          zone: "profile",
          fact: "Team prefers concise status reports",
          confidence: 85,
          sensitivity: "low",
          source: "explicit_admin",
          reason: "Admin explicitly set it"
        }
      ])
    );

    await groupService.storeExtractedFacts({
      context: createContext({ isGroup: true, groupJid: "group@g.us", chatJid: "group@g.us", commandName: "ai" }),
      commandResultSummary: "done"
    });
    expect(await repo.listProfileFacts("group@g.us")).toHaveLength(1);

    const failing = new ProfileService(repo, geminiForFacts([], true));
    await expect(
      failing.storeExtractedFacts({ context: createContext({ commandName: "ai" }), commandResultSummary: "done" })
    ).resolves.toBeUndefined();
  });
});
