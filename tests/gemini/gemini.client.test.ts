import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { GeminiService } from "../../src/gemini/gemini.client.js";
import { createLogger } from "../../src/observability/logger.js";
import type { AppEnv } from "../../src/config/env.js";

function createEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    NODE_ENV: "test",
    BOT_NAME: "AstraCore",
    BOT_PREFIX: "!",
    OWNER_NUMBERS: [],
    DATABASE_URL: "file:./data/test.sqlite",
    DATABASE_DIALECT: "sqlite",
    WHATSAPP_AUTH_DIR: "./data/wa-auth",
    WHATSAPP_PAIRING_NUMBER: "",
    WHATSAPP_PRINT_QR: false,
    PUBLIC_STATUS_SERVER: false,
    PORT: 3000,
    GEMINI_API_KEY: "AIzaSySecret0000000000000000000",
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
    LOG_LEVEL: "info",
    ...overrides
  };
}

function createService(options?: {
  env?: Partial<AppEnv>;
  generateContent?: ReturnType<typeof vi.fn>;
  callsRepository?: { createGeminiCall: ReturnType<typeof vi.fn> };
}) {
  const generateContent =
    options?.generateContent ??
    vi.fn(async (params) => ({
      text: JSON.stringify({ ok: true }),
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: "done" }] }, params }],
      usageMetadata: { promptTokenCount: 1, candidateTokenCount: 2, totalTokenCount: 3 }
    }));
  const client = {
    models: {
      generateContent
    }
  };
  const serviceOptions = {
    env: createEnv(options?.env),
    logger: createLogger("silent"),
    client,
    ...(options?.callsRepository ? { callsRepository: options.callsRepository } : {})
  };

  return {
    service: new GeminiService(serviceOptions),
    generateContent
  };
}

describe("GeminiService", () => {
  it("uses no tools for normal generation", async () => {
    const { service, generateContent } = createService();
    await service.generateText({ contents: "hello" });

    expect(generateContent.mock.calls[0]?.[0].config.tools).toBeUndefined();
  });

  it("uses feature-based model selection when override is absent", async () => {
    const { service, generateContent } = createService();
    await service.generateText({ contents: "hello", feature: "profile" });

    expect(generateContent.mock.calls[0]?.[0].model).toBe("gemini-3.1-flash-lite");
  });

  it("uses modelOverride when provided", async () => {
    const { service, generateContent } = createService();
    await service.generateText({
      contents: "hello",
      feature: "profile",
      modelOverride: "gemini-2.5-pro"
    });

    expect(generateContent.mock.calls[0]?.[0].model).toBe("gemini-2.5-pro");
  });

  it("uses googleSearch for search generation", async () => {
    const { service, generateContent } = createService();
    await service.generateWithGoogleSearch({ contents: "latest docs" });

    expect(generateContent.mock.calls[0]?.[0].config.tools).toEqual([{ googleSearch: {} }]);
  });

  it("uses codeExecution for code generation", async () => {
    const { service, generateContent } = createService();
    await service.generateWithCodeExecution({ contents: "run python?" });

    expect(generateContent.mock.calls[0]?.[0].config.tools).toEqual([{ codeExecution: {} }]);
  });

  it("fails closed when search is disabled", async () => {
    const { service } = createService({ env: { ENABLE_GOOGLE_SEARCH: false } });
    await expect(
      Promise.resolve().then(() => service.generateWithGoogleSearch({ contents: "x" }))
    ).rejects.toThrow(/disabled/i);
  });

  it("fails closed when code execution is disabled", async () => {
    const { service } = createService({ env: { ENABLE_CODE_EXECUTION: false } });
    await expect(
      Promise.resolve().then(() => service.generateWithCodeExecution({ contents: "x" }))
    ).rejects.toThrow(/disabled/i);
  });

  it("rejects RPG tool use", async () => {
    const { service } = createService();
    await expect(
      Promise.resolve().then(() =>
        service.generateWithGoogleSearch({ contents: "x", feature: "rpg" })
      )
    ).rejects.toThrow(/RPG/i);
  });

  it("retries retryable failures", async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce({ status: 429, message: "rate limited" })
      .mockResolvedValueOnce({
        text: "ok",
        candidates: [{ finishReason: "STOP" }]
      });
    const { service } = createService({ generateContent });

    const response = await service.generateText({ contents: "hello" });

    expect(response.text).toBe("ok");
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("fails on timeout", async () => {
    const generateContent = vi.fn(
      async ({ abortSignal }: { abortSignal?: AbortSignal }) =>
        await new Promise((resolve, reject) => {
          abortSignal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
          setTimeout(() => resolve({ text: "late", candidates: [] }), 50);
        })
    );
    const { service } = createService({ generateContent });

    await expect(service.generateText({ contents: "hello", timeoutMs: 1 })).rejects.toThrow(
      /timed out/i
    );
  });

  it("validates structured JSON", async () => {
    const { service, generateContent } = createService({
      generateContent: vi.fn(async () => ({ text: "{\"answer\":42}", candidates: [] }))
    });

    const result = await service.generateStructured({
      contents: "json",
      schema: z.object({ answer: z.number() })
    });

    expect(result.answer).toBe(42);
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          responseMimeType: "application/json",
          responseSchema: expect.objectContaining({
            type: "object",
            additionalProperties: false,
            properties: {
              answer: { type: "number" }
            }
          })
        })
      })
    );
  });

  it("rejects bad structured JSON", async () => {
    const { service } = createService({
      generateContent: vi.fn(async () => ({ text: "not-json", candidates: [] }))
    });

    await expect(
      service.generateStructured({
        contents: "json",
        schema: z.object({ answer: z.number() })
      })
    ).rejects.toThrow();
  });

  it("keeps API keys out of stored errors", async () => {
    const callsRepository = {
      createGeminiCall: vi.fn(async () => undefined)
    };
    const { service } = createService({
      callsRepository,
      generateContent: vi.fn(async () => {
        throw new Error("failed with key AIzaSySecret0000000000000000000");
      })
    });

    await expect(service.generateText({ contents: "x" })).rejects.toThrow(/\[REDACTED\]/);
    expect(JSON.stringify(callsRepository.createGeminiCall.mock.calls)).not.toContain("AIzaSy");
  });
});
