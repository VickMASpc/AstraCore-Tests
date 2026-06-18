import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { ProfessionalAiService } from "../../src/ai/ai.service.js";
import { DeepResearchService } from "../../src/ai/deep-research.service.js";
import { GitHubApiFetcher, RepoAnalysisService } from "../../src/ai/github.service.js";
import { ResearchService } from "../../src/ai/research.service.js";
import { createAiCommands } from "../../src/commands/ai.commands.js";
import { createProfileCommands } from "../../src/commands/profile.commands.js";
import { createSqliteConnection, initializeDatabaseSchema } from "../../src/db/client.js";
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

function setup() {
  const sqlite = createSqliteConnection(":memory:");
  initializeDatabaseSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const profilesRepo = createProfilesRepository(db);
  const aiRepo = createAiRepository(db);
  const env = {
    NODE_ENV: "test" as const,
    BOT_NAME: "AstraCore",
    BOT_PREFIX: "!",
    OWNER_NUMBERS: [],
    DATABASE_URL: "file:test",
    DATABASE_DIALECT: "sqlite" as const,
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
    LOG_LEVEL: "info" as const
  };
  const generateContent = vi.fn(async (params) => ({
    text: `response:${params.contents}`,
    candidates: [{ finishReason: "STOP" }] as unknown[],
    usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
  }));
  const gemini = new GeminiService({
    env,
    logger: createLogger("silent"),
    client: { models: { generateContent } },
    callsRepository: aiRepo
  });
  const profileService = new ProfileService(profilesRepo);
  const aiService = new ProfessionalAiService(aiRepo, profilesRepo, gemini);
  const researchService = new ResearchService(aiRepo, gemini);
  const deepResearchService = new DeepResearchService(aiRepo, gemini, env);
  const repoFetcher = {
      fetchRepoSnapshot: vi.fn(async () => ({
        metadata: { fullName: "owner/repo", description: "Demo repo", defaultBranch: "main" },
        readme: { path: "README.md", content: "# demo", size: 10 },
        files: [{ path: "package.json", content: "{\"name\":\"demo\"}", size: 20 }]
      }))
    };
  const repoAnalysisService = new RepoAnalysisService(
    aiRepo,
    gemini,
    repoFetcher
  );
  const router = new CommandRouter({
    commands: createCommandRegistry([
      ...createProfileCommands(profileService),
      ...createAiCommands(
        aiService,
        profileService,
        researchService,
        repoAnalysisService,
        deepResearchService
      )
    ]),
    prefix: "!",
    rateLimiter: new InMemoryRateLimiter({})
  });

  return {
    db,
    profilesRepo,
    aiRepo,
    router,
    generateContent,
    gemini,
    repoFetcher,
    aiService,
    profileService,
    researchService,
    repoAnalysisService,
    deepResearchService
  };
}

function ctx(overrides: Partial<IncomingMessageContext> = {}): IncomingMessageContext {
  return {
    messageId: "m1",
    chatJid: "user@s.whatsapp.net",
    senderJid: "user@s.whatsapp.net",
    senderDisplayName: "User",
    isGroup: false,
    isOwner: false,
    rawText: "",
    commandText: "",
    args: [],
    hasMedia: false,
    timestamp: new Date(),
    ...overrides
  };
}

describe("professional ai commands", () => {
  it("selects the AI model, stores context, and reuses context", async () => {
    const { router, generateContent, aiRepo } = setup();
    await router.route(ctx({ commandText: "!ai first question", rawText: "!ai first question" }));
    await router.route(ctx({ commandText: "!ask second question", rawText: "!ask second question" }));

    expect(generateContent.mock.calls[0]?.[0].model).toBe("gemini-3.5-flash");
    expect((await aiRepo.listMessages((await aiRepo.findConversationByScope("private", "user@s.whatsapp.net"))?.id ?? "")).length).toBeGreaterThan(0);
    expect(String(generateContent.mock.calls[1]?.[0].contents)).toContain("history:");
  });

  it("includes allowed profile facts only when applicable and does not reveal private memory in groups", async () => {
    const { router, profilesRepo, generateContent } = setup();
    await profilesRepo.createProfileFact({
      id: "userfact",
      scope: "user",
      profileId: "user@s.whatsapp.net",
      zone: "profile",
      fact: "Private preference",
      sensitivity: "low"
    });
    await profilesRepo.createProfileFact({
      id: "groupfact",
      scope: "group",
      profileId: "group@g.us",
      zone: "profile",
      fact: "Group wants bullet summaries",
      sensitivity: "low"
    });

    await router.route(
      ctx({
        isGroup: true,
        groupJid: "group@g.us",
        chatJid: "group@g.us",
        commandText: "!ai status update",
        rawText: "!ai status update"
      })
    );

    const prompt = String(generateContent.mock.calls[0]?.[0].contents);
    expect(prompt).toContain("Group wants bullet summaries");
    expect(prompt).not.toContain("Private preference");
  });

  it("code command performs only static analysis and aireset clears AI context only", async () => {
    const { router, aiRepo, db } = setup();
    const code = await router.route(
      ctx({ commandText: "!code const x = 1", rawText: "!code const x = 1" })
    );
    expect(code.ok && code.result.reply).toContain("response:");

    const beforeResetConversation = await aiRepo.findConversationByScope("private", "user@s.whatsapp.net");
    expect((await aiRepo.listMessages(beforeResetConversation?.id ?? "")).length).toBeGreaterThan(0);

    const reset = await router.route(ctx({ commandText: "!aireset", rawText: "!aireset" }));
    expect(reset.ok && reset.result.reply).toBe("AI context reset.");
    expect((await aiRepo.listMessages(beforeResetConversation?.id ?? "")).length).toBe(0);
    expect(await db.query.rpgSessions.findMany()).toHaveLength(0);
  });

  it("research uses grounded search, stores sources, and returns latest sources", async () => {
    const { router, generateContent, aiRepo } = setup();
    generateContent.mockResolvedValueOnce({
      text: "Grounded answer",
      candidates: [
        {
          finishReason: "STOP",
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://example.com/a", title: "Source A" } },
              { web: { uri: "https://example.com/b", title: "Source B" } }
            ]
          },
          googleSearch: {}
        }
      ] as unknown[],
      usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
    });

    const result = await router.route(ctx({ commandText: "!research typed arrays", rawText: "!research typed arrays" }));
    expect(result.ok && result.result.reply).toContain("Confidence:");
    expect(generateContent.mock.calls[0]?.[0].config.tools).toEqual([{ googleSearch: {} }]);
    expect((await aiRepo.listLatestResearchSources((await aiRepo.findConversationByScope("private", "user@s.whatsapp.net"))?.id ?? "")).length).toBe(2);

    const sources = await router.route(ctx({ commandText: "!sources", rawText: "!sources" }));
    expect(sources.ok && sources.result.reply).toContain("Sources for latest research:");
    expect(sources.ok && sources.result.reply).toContain("https://example.com/a");
  });

  it("deep research uses the multi-stage pipeline and stores the final report", async () => {
    const { router, aiRepo, generateContent } = setup();
    generateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          topic: "sqlite wal mode",
          normalizedQuestion: "How does SQLite WAL mode work?",
          scope: { depth: "technical" },
          keyQuestions: ["How does WAL mode work?"],
          requiredSourceTypes: ["primary docs"],
          knownAmbiguities: [],
          exclusionRules: [],
          finalReportRequirements: ["Include uncertainty"]
        }),
        candidates: [{ finishReason: "STOP" }] as unknown[],
        usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
      })
      .mockResolvedValueOnce({
        text: "Detail paper",
        candidates: [{ finishReason: "STOP", googleSearch: {} }] as unknown[],
        usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
      })
      .mockResolvedValueOnce({
        text: "Source paper",
        candidates: [{ finishReason: "STOP", googleSearch: {} }] as unknown[],
        usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
      })
      .mockResolvedValueOnce({
        text: "Writer paper",
        candidates: [{ finishReason: "STOP", googleSearch: {} }] as unknown[],
        usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
      })
      .mockResolvedValueOnce({
        text: "Fact-check report",
        candidates: [{ finishReason: "STOP", googleSearch: {} }] as unknown[],
        usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
      })
      .mockResolvedValueOnce({
        text: "Final deep research report",
        candidates: [{ finishReason: "STOP", googleSearch: {} }] as unknown[],
        usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
      });

    const result = await router.route(ctx({ commandText: "!deepresearch sqlite wal mode", rawText: "!deepresearch sqlite wal mode" }));
    expect(result.ok && result.result.reply).toContain("Final deep research report");
    expect(result.ok && result.result.reply).toContain("Confidence: low");
    expect(generateContent.mock.calls[0]?.[0].config.responseMimeType).toBe("application/json");
    expect(generateContent.mock.calls[0]?.[0].config.responseSchema).toMatchObject({
      type: "object",
      properties: {
        topic: {
          type: "string"
        }
      },
      required: ["topic", "normalizedQuestion", "scope", "keyQuestions", "requiredSourceTypes", "knownAmbiguities", "exclusionRules", "finalReportRequirements"],
      additionalProperties: false
    });
    expect(generateContent.mock.calls.slice(1).every((call) => call[0]?.config.tools?.[0]?.googleSearch)).toBe(true);
    expect((await aiRepo.listResearchReports()).length).toBe(1);
  });

  it("sources after deep research returns the deep research source list", async () => {
    const { router, generateContent } = setup();
    generateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          topic: "topic",
          normalizedQuestion: "normalized",
          scope: { depth: "technical" },
          keyQuestions: ["k1"],
          requiredSourceTypes: ["primary"],
          knownAmbiguities: [],
          exclusionRules: [],
          finalReportRequirements: ["uncertainty"]
        }),
        candidates: [{ finishReason: "STOP" }] as unknown[],
        usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
      })
      .mockResolvedValueOnce({
        text: "Detail paper",
        candidates: [{ finishReason: "STOP", googleSearch: {}, groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/detail", title: "Detail Source" } }] } }] as unknown[],
        usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
      })
      .mockResolvedValueOnce({
        text: "Source paper",
        candidates: [{ finishReason: "STOP", googleSearch: {}, groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/shared", title: "Shared Source" } }] } }] as unknown[],
        usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
      })
      .mockResolvedValueOnce({
        text: "Writer paper",
        candidates: [{ finishReason: "STOP", googleSearch: {}, groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/shared", title: "Shared Source Duplicate" } }] } }] as unknown[],
        usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
      })
      .mockResolvedValueOnce({
        text: "Fact-check report",
        candidates: [{ finishReason: "STOP", googleSearch: {}, groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/fact", title: "Fact Source" } }] } }] as unknown[],
        usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
      })
      .mockResolvedValueOnce({
        text: "Final report",
        candidates: [{ finishReason: "STOP", googleSearch: {}, groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/final", title: "Final Source" } }] } }] as unknown[],
        usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
      });

    await router.route(ctx({ commandText: "!deepresearch topic", rawText: "!deepresearch topic" }));
    const sources = await router.route(ctx({ commandText: "!sources", rawText: "!sources" }));

    expect(sources.ok && sources.result.reply).toContain("https://example.com/detail");
    expect(sources.ok && sources.result.reply).toContain("https://example.com/final");
    const lines = sources.ok ? sources.result.reply.split("\n") : [];
    expect(lines.filter((line) => line === "https://example.com/shared")).toHaveLength(1);
  });

  it("sources chooses the latest result between research modes", async () => {
    const { router, generateContent } = setup();
    generateContent
      .mockResolvedValueOnce({
        text: "Grounded answer",
        candidates: [{ finishReason: "STOP", groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/old", title: "Old Source" } }] }, googleSearch: {} }] as unknown[],
        usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          topic: "topic",
          normalizedQuestion: "normalized",
          scope: { depth: "technical" },
          keyQuestions: ["k1"],
          requiredSourceTypes: ["primary"],
          knownAmbiguities: [],
          exclusionRules: [],
          finalReportRequirements: ["uncertainty"]
        }),
        candidates: [{ finishReason: "STOP" }] as unknown[],
        usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
      })
      .mockResolvedValueOnce({ text: "Detail paper", candidates: [{ finishReason: "STOP", googleSearch: {}, groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/new", title: "New Source" } }] } }] as unknown[], usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 } })
      .mockResolvedValueOnce({ text: "Source paper", candidates: [{ finishReason: "STOP", googleSearch: {} }] as unknown[], usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 } })
      .mockResolvedValueOnce({ text: "Writer paper", candidates: [{ finishReason: "STOP", googleSearch: {} }] as unknown[], usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 } })
      .mockResolvedValueOnce({ text: "Fact-check report", candidates: [{ finishReason: "STOP", googleSearch: {} }] as unknown[], usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 } })
      .mockResolvedValueOnce({ text: "Final report", candidates: [{ finishReason: "STOP", googleSearch: {} }] as unknown[], usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 } });

    await router.route(ctx({ commandText: "!research first", rawText: "!research first" }));
    await router.route(ctx({ commandText: "!deepresearch second", rawText: "!deepresearch second" }));
    const sources = await router.route(ctx({ commandText: "!sources", rawText: "!sources" }));

    expect(sources.ok && sources.result.reply).toContain("https://example.com/new");
    expect(sources.ok && sources.result.reply).not.toContain("https://example.com/old");
  });

  it("sources returns the no-sources message when nothing exists", async () => {
    const { router } = setup();

    const sources = await router.route(ctx({ commandText: "!sources", rawText: "!sources" }));

    expect(sources.ok && sources.result.reply).toBe("No stored sources for this chat.");
  });

  it("deep research with no topic returns the required-topic message without calling Gemini", async () => {
    const { router, generateContent } = setup();

    const result = await router.route(ctx({ commandText: "!deepresearch", rawText: "!deepresearch" }));

    expect(result.ok && result.result.reply).toBe("A research topic is required.");
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("keeps the ai.deepresearch rate-limit key on the deepresearch command", () => {
    const { aiService, profileService, researchService, repoAnalysisService, deepResearchService } = setup();
    const commands = createAiCommands(
      aiService,
      profileService,
      researchService,
      repoAnalysisService,
      deepResearchService
    );

    expect(commands.find((command) => command.name === "deepresearch")?.rateLimitKey).toBe(
      "ai.deepresearch"
    );
  });

  it("repo analysis stores reports and review produces severity findings", async () => {
    const { router, aiRepo, generateContent } = setup();
    const repo = await router.route(
      ctx({
        commandText: "!repo https://github.com/openai/openai-node",
        rawText: "!repo https://github.com/openai/openai-node"
      })
    );
    expect(repo.ok && repo.result.reply).toContain("Repository Analysis");
    expect((await aiRepo.listRepoReports()).length).toBe(1);
    expect(String(generateContent.mock.calls[0]?.[0].contents)).toContain("# demo");
    expect(String(generateContent.mock.calls[0]?.[0].contents)).not.toContain("C:\\");

    const review = await router.route(
      ctx({
        commandText: "!review const a = 1",
        rawText: "!review const a = 1"
      })
    );
    expect(review.ok && review.result.reply).toContain("Review Findings");
  });

  it("repo rejects non-GitHub URLs", async () => {
    const { router } = setup();
    const result = await router.route(
      ctx({
        commandText: "!repo https://gitlab.com/openai/openai-node",
        rawText: "!repo https://gitlab.com/openai/openai-node"
      })
    );
    expect(result.ok && result.result.reply).toContain("Only public GitHub URLs");
  });
});
