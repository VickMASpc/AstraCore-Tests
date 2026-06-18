import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { ProfessionalAiService } from "../../src/ai/ai.service.js";
import { createAiCommands } from "../../src/commands/ai.commands.js";
import { createProfileCommands } from "../../src/commands/profile.commands.js";
import { createDatabaseClient, createSqliteConnection, initializeDatabaseSchema } from "../../src/db/client.js";
import { createAiRepository } from "../../src/db/repositories/ai.repo.js";
import { createProfilesRepository } from "../../src/db/repositories/profiles.repo.js";
import { schema } from "../../src/db/schema.js";
import { GeminiService } from "../../src/gemini/gemini.client.js";
import { createLogger } from "../../src/observability/logger.js";
import { createCommandRegistry } from "../../src/router/command.registry.js";
import { CommandRouter } from "../../src/router/command.router.js";
import type { IncomingMessageContext } from "../../src/router/command.types.js";
import { InMemoryRateLimiter } from "../../src/router/rateLimits.js";
import { ProfileService } from "../../src/profiles/profile.service.js";

function createTestDb() {
  const sqlite = createSqliteConnection(":memory:");
  initializeDatabaseSchema(sqlite);
  return drizzle(sqlite, { schema });
}

function createContext(overrides: Partial<IncomingMessageContext> = {}): IncomingMessageContext {
  return {
    messageId: "msg-1",
    chatJid: "user@s.whatsapp.net",
    senderJid: "user@s.whatsapp.net",
    senderDisplayName: "User",
    isGroup: false,
    isOwner: false,
    rawText: "",
    commandText: "",
    args: [],
    hasMedia: false,
    timestamp: new Date("2026-06-17T00:00:00.000Z"),
    ...overrides
  };
}

function createGeminiMock(text = "default reply") {
  return new GeminiService({
    env: {
      NODE_ENV: "test",
      BOT_NAME: "AstraCore",
      BOT_PREFIX: "!",
      OWNER_NUMBERS: [],
      DATABASE_URL: "file:test",
      DATABASE_DIALECT: "sqlite",
      WHATSAPP_AUTH_DIR: "./data/wa-auth",
      WHATSAPP_PAIRING_NUMBER: "",
      WHATSAPP_PRINT_QR: false,
      PUBLIC_STATUS_SERVER: false,
      PORT: 3000,
      GEMINI_API_KEY: "key",
      GEMINI_API_VERSION: "v1beta",
      GEMINI_AI_MODEL: "gemini-3.5-flash",
      GEMINI_FAST_MODEL: "gemini-3.1-flash-lite",
      GEMINI_RPG_MODEL: "gemini-3.1-flash-lite",
      DEEP_RESEARCH_PLANNER_MODEL: "gemini-3.5-flash",
      DEEP_RESEARCH_DETAIL_MODEL: "gemini-3.5-flash",
      DEEP_RESEARCH_SOURCE_MODEL: "gemini-3.5-flash",
      DEEP_RESEARCH_WRITER_MODEL: "gemini-3.5-flash",
      DEEP_RESEARCH_FACTCHECK_MODEL: "gemini-3.5-flash",
      DEEP_RESEARCH_FINAL_MODEL: "gemini-3.5-flash",
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
        generateContent: vi.fn(async (params) => ({
          text,
          candidates: [{ finishReason: "STOP", params }],
          usageMetadata: {
            promptTokenCount: 1,
            candidateTokenCount: 1,
            totalTokenCount: 2
          }
        }))
      }
    }
  });
}

function createRouterWithServices() {
  const db = createTestDb();
  const profilesRepo = createProfilesRepository(db);
  const aiRepo = createAiRepository(db);
  const profileService = new ProfileService(profilesRepo, createGeminiMock('{"facts":[]}'));
  const aiService = new ProfessionalAiService(aiRepo, profilesRepo, createGeminiMock("AI reply"));
  const commands = [
    ...createProfileCommands(profileService),
    ...createAiCommands(aiService, profileService)
  ];

  return {
    db,
    profilesRepo,
    aiRepo,
    profileService,
    aiService,
    router: new CommandRouter({
      commands: createCommandRegistry(commands),
      prefix: "!",
      rateLimiter: new InMemoryRateLimiter({})
    })
  };
}

describe("profile commands", () => {
  it("creates user, group, and user-in-group profiles", async () => {
    const { profileService, profilesRepo } = createRouterWithServices();
    const context = createContext({
      isGroup: true,
      groupJid: "group@g.us",
      chatJid: "group@g.us"
    });

    await profileService.ensureProfiles(context);

    expect(await profilesRepo.findUserProfileByUserId("user@s.whatsapp.net")).toBeTruthy();
    expect(await profilesRepo.findGroupProfileByGroupId("group@g.us")).toBeTruthy();
    expect(await profilesRepo.findUserInGroupProfile("user@s.whatsapp.net", "group@g.us")).toBeTruthy();
  });

  it("supports explicit memory add/list/delete and clear", async () => {
    const { router, profilesRepo } = createRouterWithServices();
    const add = await router.route(createContext({ commandText: "!memory add Bring concise updates", rawText: "!memory add Bring concise updates" }));
    expect(add.ok).toBe(true);

    const memory = await profilesRepo.listMemoryFacts("user@s.whatsapp.net");
    expect(memory).toHaveLength(1);
    expect(memory[0]?.zone).toBe("profile");

    const list = await router.route(createContext({ commandText: "!memory list", rawText: "!memory list" }));
    expect(list.ok && list.result.reply).toContain("Bring concise updates");

    const deleteResult = await router.route(
      createContext({
        commandText: `!memory delete ${memory[0]?.id}`,
        rawText: `!memory delete ${memory[0]?.id}`
      })
    );
    expect(deleteResult.ok && deleteResult.result.reply).toContain("memory deleted");

    await router.route(createContext({ commandText: "!memory add Keep code snippets short", rawText: "!memory add Keep code snippets short" }));
    const cleared = await router.route(createContext({ commandText: "!memory clear", rawText: "!memory clear" }));
    expect(cleared.ok && cleared.result.reply).toBe("memory cleared");
  });

  it("shows and sets privacy modes", async () => {
    const { router } = createRouterWithServices();
    const initial = await router.route(createContext({ commandText: "!privacy", rawText: "!privacy" }));
    expect(initial.ok && initial.result.reply).toBe("privacy: normal");

    const changed = await router.route(createContext({ commandText: "!privacy minimal", rawText: "!privacy minimal" }));
    expect(changed.ok && changed.result.reply).toBe("privacy: minimal");
  });

  it("allows group admin reset and rejects non-admin reset", async () => {
    const { router, profilesRepo } = createRouterWithServices();
    await profilesRepo.createProfileFact({
      id: "gfact",
      scope: "group",
      profileId: "group@g.us",
      zone: "profile",
      fact: "Group prefers direct updates",
      sensitivity: "low"
    });

    const nonAdmin = await router.route(
      createContext({
        isGroup: true,
        groupJid: "group@g.us",
        chatJid: "group@g.us",
        isSenderAdmin: false,
        commandText: "!profile reset group",
        rawText: "!profile reset group"
      })
    );
    expect(nonAdmin.ok && nonAdmin.result.reply).toContain("Only group admins");

    const admin = await router.route(
      createContext({
        isGroup: true,
        groupJid: "group@g.us",
        chatJid: "group@g.us",
        isSenderAdmin: true,
        commandText: "!profile reset group",
        rawText: "!profile reset group"
      })
    );
    expect(admin.ok && admin.result.reply).toBe("group profile reset");
  });

  it("prevents normal group users from viewing full group profile", async () => {
    const { router } = createRouterWithServices();
    const result = await router.route(
      createContext({
        isGroup: true,
        groupJid: "group@g.us",
        chatJid: "group@g.us",
        isSenderAdmin: false,
        commandText: "!profile group full",
        rawText: "!profile group full"
      })
    );

    expect(result.ok && result.result.reply).toContain("Only group admins");
  });

  it("does not expose another user's private memory", async () => {
    const { profilesRepo, router } = createRouterWithServices();
    await profilesRepo.createMemoryFact({
      id: "private_mem",
      scope: "user",
      ownerId: "other@s.whatsapp.net",
      zone: "profile",
      content: "Other person's memory",
      source: "explicit_user",
      confidence: 100,
      sensitivity: "low"
    });

    const result = await router.route(createContext({ commandText: "!memory list", rawText: "!memory list" }));
    expect(result.ok && result.result.reply).not.toContain("Other person's memory");
  });
});
