import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { DeepResearchService } from "../../src/ai/deep-research.service.js";
import {
  DEEP_RESEARCH_DETAIL_SYSTEM,
  DEEP_RESEARCH_FACTCHECK_SYSTEM,
  DEEP_RESEARCH_FINAL_SYSTEM,
  DEEP_RESEARCH_SOURCE_SYSTEM,
  DEEP_RESEARCH_WRITER_SYSTEM
} from "../../src/ai/prompts/deepResearch.prompts.js";
import type { AppEnv } from "../../src/config/env.js";
import { createSqliteConnection, initializeDatabaseSchema } from "../../src/db/client.js";
import { createAiRepository } from "../../src/db/repositories/ai.repo.js";
import { schema } from "../../src/db/schema.js";
import { GeminiService } from "../../src/gemini/gemini.client.js";
import { createLogger } from "../../src/observability/logger.js";
import type { IncomingMessageContext } from "../../src/router/command.types.js";

function createEnv(): AppEnv {
  return {
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
    DEEP_RESEARCH_PLANNER_MODEL: "planner-model",
    DEEP_RESEARCH_DETAIL_MODEL: "detail-model",
    DEEP_RESEARCH_SOURCE_MODEL: "source-model",
    DEEP_RESEARCH_WRITER_MODEL: "writer-model",
    DEEP_RESEARCH_FACTCHECK_MODEL: "factcheck-model",
    DEEP_RESEARCH_FINAL_MODEL: "final-model",
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
    LOG_LEVEL: "silent"
  };
}

function createContext(overrides: Partial<IncomingMessageContext> = {}): IncomingMessageContext {
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
    timestamp: new Date("2026-06-18T00:00:00.000Z"),
    ...overrides
  };
}

type StageName = "planner" | "detail" | "source" | "writer" | "factcheck" | "final";

function detectStage(params: { config?: Record<string, unknown> }): StageName {
  const instruction = String(params.config?.systemInstruction ?? "");

  if (instruction.includes(DEEP_RESEARCH_DETAIL_SYSTEM)) {
    return "detail";
  }

  if (instruction.includes(DEEP_RESEARCH_SOURCE_SYSTEM)) {
    return "source";
  }

  if (instruction.includes(DEEP_RESEARCH_WRITER_SYSTEM)) {
    return "writer";
  }

  if (instruction.includes(DEEP_RESEARCH_FACTCHECK_SYSTEM)) {
    return "factcheck";
  }

  if (instruction.includes(DEEP_RESEARCH_FINAL_SYSTEM)) {
    return "final";
  }

  return "planner";
}

function createPlannerResponse() {
  return {
    text: JSON.stringify({
      topic: "topic",
      normalizedQuestion: "normalized question",
      scope: {
        depth: "technical"
      },
      keyQuestions: ["What matters most?"],
      requiredSourceTypes: ["primary documentation"],
      knownAmbiguities: [],
      exclusionRules: [],
      finalReportRequirements: ["Include uncertainty"]
    }),
    candidates: [{ finishReason: "STOP" }] as unknown[],
    usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
  };
}

function createGroundedResponse(text: string, sources: Array<{ url: string; title: string }> = []) {
  return {
    text,
    candidates: [
      {
        finishReason: "STOP",
        googleSearch: {},
        groundingMetadata: {
          groundingChunks: sources.map((source) => ({
            web: {
              uri: source.url,
              title: source.title
            }
          }))
        }
      }
    ] as unknown[],
    usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
  };
}

function createHarness(options?: {
  failStages?: StageName[];
  responseTextByStage?: Partial<Record<Exclude<StageName, "planner">, string>>;
  sourceMapByStage?: Partial<Record<Exclude<StageName, "planner">, Array<{ url: string; title: string }>>>;
}) {
  const sqlite = createSqliteConnection(":memory:");
  initializeDatabaseSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const repo = createAiRepository(db);
  const env = createEnv();
  const calls: Array<{ stage: StageName; params: Record<string, unknown> }> = [];
  const failStages = new Set(options?.failStages ?? []);

  const generateContent = vi.fn(async (params: Record<string, unknown>) => {
    const stage = detectStage(params as { config?: Record<string, unknown> });
    calls.push({ stage, params });

    if (failStages.has(stage)) {
      throw new Error(`${stage} failed`);
    }

    if (stage === "planner") {
      return createPlannerResponse();
    }

    return createGroundedResponse(
      options?.responseTextByStage?.[stage] ?? `${stage} text`,
      options?.sourceMapByStage?.[stage] ?? []
    );
  });

  const gemini = new GeminiService({
    env,
    logger: createLogger("silent"),
    client: {
      models: {
        generateContent
      }
    },
    callsRepository: repo
  });

  return {
    db,
    repo,
    env,
    calls,
    generateContent,
    service: new DeepResearchService(repo, gemini, env)
  };
}

describe("DeepResearchService", () => {
  it("returns the required-topic message for an empty topic", async () => {
    const { service, generateContent } = createHarness();

    const result = await service.run(createContext(), "   ");

    expect(result).toBe("A research topic is required.");
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("runs the planner before the parallel papers", async () => {
    const { service, calls } = createHarness();

    await service.run(createContext(), "topic");

    expect(calls[0]?.stage).toBe("planner");
    expect(calls.slice(1, 4).map((call) => call.stage)).toEqual(["detail", "source", "writer"]);
  });

  it("runs detail, source, and writer before fact-check", async () => {
    const { service, calls } = createHarness();

    await service.run(createContext(), "topic");

    const factcheckIndex = calls.findIndex((call) => call.stage === "factcheck");
    expect(factcheckIndex).toBeGreaterThan(calls.findIndex((call) => call.stage === "detail"));
    expect(factcheckIndex).toBeGreaterThan(calls.findIndex((call) => call.stage === "source"));
    expect(factcheckIndex).toBeGreaterThan(calls.findIndex((call) => call.stage === "writer"));
  });

  it("runs fact-check before final synthesis", async () => {
    const { service, calls } = createHarness();

    await service.run(createContext(), "topic");

    expect(calls.findIndex((call) => call.stage === "final")).toBeGreaterThan(
      calls.findIndex((call) => call.stage === "factcheck")
    );
  });

  it("stores the final report when all three papers succeed", async () => {
    const { service, repo } = createHarness({
      responseTextByStage: {
        factcheck:
          '{"verdict":"pass","recommendedFinalConfidence":"high","overallAssessment":"ok","paperAssessments":[],"contradictions":[],"claimsToRemoveOrSoften":[],"claimsNeedingCitation":[],"mustIncludeInFinal":[],"mustNotSayInFinal":[]}',
        final: "Final report for the user"
      },
      sourceMapByStage: {
        detail: [
          { url: "https://example.com/1", title: "One" },
          { url: "https://example.com/2", title: "Two" },
          { url: "https://example.com/3", title: "Three" }
        ],
        source: [
          { url: "https://example.com/4", title: "Four" },
          { url: "https://example.com/5", title: "Five" },
          { url: "https://example.com/6", title: "Six" }
        ],
        writer: [
          { url: "https://example.com/7", title: "Seven" },
          { url: "https://example.com/8", title: "Eight" }
        ]
      }
    });

    const result = await service.run(createContext(), "topic");

    expect(result).toContain("Final report for the user");
    expect(result).toContain("Confidence: high");
    const reports = await repo.listResearchReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]?.reportMarkdown).toContain("Confidence: high");
    const conversation = await repo.findConversationByScope("private", "user@s.whatsapp.net");
    const run = await repo.getLatestDeepResearchRunForConversation(conversation?.id ?? "");
    expect(run?.status).toBe("completed");
    expect(run?.finalReportMarkdown).toContain("Confidence: high");
    expect(run?.confidence).toBe("high");
    const artifacts = await repo.listDeepResearchArtifactsForRun(run?.id ?? "");
    expect(artifacts).toHaveLength(6);
  });

  it("continues when one paper fails and includes failure context in the final prompt", async () => {
    const { service, calls, repo } = createHarness({
      failStages: ["writer"],
      responseTextByStage: {
        factcheck:
          '{"verdict":"pass","recommendedFinalConfidence":"high","overallAssessment":"ok","paperAssessments":[],"contradictions":[],"claimsToRemoveOrSoften":[],"claimsNeedingCitation":[],"mustIncludeInFinal":[],"mustNotSayInFinal":[]}',
        final: "final text"
      },
      sourceMapByStage: {
        detail: [
          { url: "https://example.com/1", title: "One" },
          { url: "https://example.com/2", title: "Two" },
          { url: "https://example.com/3", title: "Three" }
        ]
      }
    });

    const result = await service.run(createContext(), "topic");

    expect(result).toContain("final text");
    expect(result).toContain("Confidence: medium");
    const finalPrompt = String(calls.find((call) => call.stage === "final")?.params.contents ?? "");
    expect(finalPrompt).toContain("WRITER STATUS: FAILED");
    expect(finalPrompt).toContain("Error: writer failed");
    expect(finalPrompt).toContain("Use this deterministic confidence level in the final report: medium.");
    const conversation = await repo.findConversationByScope("private", "user@s.whatsapp.net");
    const run = await repo.getLatestDeepResearchRunForConversation(conversation?.id ?? "");
    expect(run?.status).toBe("partial");
    expect(run?.confidence).toBe("medium");
    const artifacts = await repo.listDeepResearchArtifactsForRun(run?.id ?? "");
    expect(artifacts.some((artifact) => artifact.stage === "writer" && artifact.errorCode === "writer failed")).toBe(true);
  });

  it("aborts before fact-check if two papers fail", async () => {
    const { service, calls, repo } = createHarness({
      failStages: ["detail", "writer"]
    });

    const result = await service.run(createContext(), "topic");

    expect(result).toBe("Deep research could not complete because too many research stages failed.");
    expect(calls.some((call) => call.stage === "factcheck")).toBe(false);
    expect(await repo.listResearchReports()).toHaveLength(0);
    const conversation = await repo.findConversationByScope("private", "user@s.whatsapp.net");
    const run = await repo.getLatestDeepResearchRunForConversation(conversation?.id ?? "");
    expect(run?.status).toBe("failed");
  });

  it("aborts before final synthesis if fact-check fails", async () => {
    const { service, calls, repo } = createHarness({
      failStages: ["factcheck"]
    });

    const result = await service.run(createContext(), "topic");

    expect(result).toBe("Deep research stopped at the quality gate. Please try again.");
    expect(calls.some((call) => call.stage === "final")).toBe(false);
    expect(await repo.listResearchReports()).toHaveLength(0);
    const conversation = await repo.findConversationByScope("private", "user@s.whatsapp.net");
    const run = await repo.getLatestDeepResearchRunForConversation(conversation?.id ?? "");
    expect(run?.status).toBe("failed");
    const artifacts = await repo.listDeepResearchArtifactsForRun(run?.id ?? "");
    expect(artifacts.some((artifact) => artifact.stage === "factcheck" && artifact.errorCode === "factcheck failed")).toBe(true);
  });

  it("dedupes sources from multiple stages before storage", async () => {
    const { service, repo } = createHarness({
      sourceMapByStage: {
        detail: [
          { url: "https://example.com/shared", title: "Shared Source" },
          { url: "https://example.com/detail", title: "Detail Source" }
        ],
        source: [{ url: "https://example.com/shared", title: "Shared Source Duplicate" }],
        writer: [{ url: "https://example.com/writer", title: "Writer Source" }],
        factcheck: [{ url: "https://example.com/shared", title: "Shared Source Third Copy" }],
        final: [{ url: "https://example.com/final", title: "Final Source" }]
      }
    });

    await service.run(createContext(), "topic");

    const conversation = await repo.findConversationByScope("private", "user@s.whatsapp.net");
    const sources = await repo.listLatestResearchSources(conversation?.id ?? "");
    expect(sources).toHaveLength(4);
    expect(sources.map((source) => source.url).sort()).toEqual([
      "https://example.com/detail",
      "https://example.com/final",
      "https://example.com/shared",
      "https://example.com/writer"
    ]);
  });

  it("uses Google Search grounding for all non-structured research stages", async () => {
    const { service, calls } = createHarness();

    await service.run(createContext(), "topic");

    for (const call of calls.filter((entry) => entry.stage !== "planner")) {
      expect((call.params.config as { tools?: unknown[] }).tools).toEqual([{ googleSearch: {} }]);
    }
  });

  it("final report includes deterministic confidence", async () => {
    const { service } = createHarness({
      responseTextByStage: {
        factcheck:
          '{"verdict":"needs_revision","recommendedFinalConfidence":"high","overallAssessment":"ok","paperAssessments":[],"contradictions":[],"claimsToRemoveOrSoften":[],"claimsNeedingCitation":[],"mustIncludeInFinal":[],"mustNotSayInFinal":[]}',
        final: "Natural prose answer"
      },
      sourceMapByStage: {
        detail: [
          { url: "https://example.com/1", title: "One" },
          { url: "https://example.com/2", title: "Two" },
          { url: "https://example.com/3", title: "Three" }
        ]
      }
    });

    const result = await service.run(createContext(), "topic");

    expect(result).toContain("Natural prose answer");
    expect(result).toContain("Confidence: low");
  });

  it("creates a running run at start before planner completes", async () => {
    const sqlite = createSqliteConnection(":memory:");
    initializeDatabaseSchema(sqlite);
    const db = drizzle(sqlite, { schema });
    const repo = createAiRepository(db);
    const env = createEnv();
    let releasePlanner: (() => void) | undefined;
    const plannerGate = new Promise<void>((resolve) => {
      releasePlanner = resolve;
    });

    const gemini = new GeminiService({
      env,
      logger: createLogger("silent"),
      client: {
        models: {
          generateContent: vi.fn(async (params: Record<string, unknown>) => {
            const stage = detectStage(params as { config?: Record<string, unknown> });
            if (stage === "planner") {
              await plannerGate;
              return createPlannerResponse();
            }

            return createGroundedResponse(`${stage} text`);
          })
        }
      },
      callsRepository: repo
    });

    const service = new DeepResearchService(repo, gemini, env);
    const pending = service.run(createContext(), "topic");
    let run = undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const conversation = await repo.findConversationByScope("private", "user@s.whatsapp.net");
      run = await repo.getLatestDeepResearchRunForConversation(conversation?.id ?? "");
      if (run) {
        break;
      }
      await Promise.resolve();
    }
    expect(run?.status).toBe("running");

    releasePlanner?.();
    await pending;
  });
});
