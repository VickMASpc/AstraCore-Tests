import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { AppEnv } from "../config/env.js";
import type { SafeLogger } from "../observability/logger.js";
import { redactSecrets } from "../security/redaction.js";
import { createId } from "../utils/ids.js";
import { ExternalServiceError } from "../utils/errors.js";
import { GeminiResponseParseError, GeminiTimeoutError, GeminiToolDisabledError } from "./gemini.errors.js";
import type {
  GeminiCallsRepositoryLike,
  GeminiCodeExecutionRequest,
  GeminiCodeExecutionResponse,
  GeminiFeature,
  GeminiGenerateContentParams,
  GeminiGenerateContentResponse,
  GeminiRequestKind,
  GeminiSearchRequest,
  GeminiSearchResponse,
  GeminiStructuredRequest,
  GeminiTextRequest,
  GeminiTextResponse,
  GoogleGenAIClientLike
} from "./gemini.types.js";
import { extractBlocked, extractFinishReason, extractText, extractUsage, extractUsedTools } from "./gemini.usage.js";

type ServiceDeps = {
  env: AppEnv;
  logger: SafeLogger;
  client?: GoogleGenAIClientLike;
  callsRepository?: GeminiCallsRepositoryLike;
  maxRetries?: number;
  defaultTimeoutMs?: number;
};

const STRUCTURED_JSON_SYSTEM_INSTRUCTION =
  "Respond with a single valid JSON document only. Do not include markdown, code fences, commentary, or any text before or after the JSON.";

function getModelForFeature(env: AppEnv, feature: GeminiFeature): string {
  if (feature === "profile") {
    return env.GEMINI_FAST_MODEL;
  }

  if (feature === "rpg") {
    return env.GEMINI_RPG_MODEL;
  }

  return env.GEMINI_AI_MODEL;
}

function isRetryableError(error: unknown): boolean {
  const status =
    typeof error === "object" && error !== null
      ? ((error as { status?: number; statusCode?: number }).status ??
          (error as { status?: number; statusCode?: number }).statusCode)
      : undefined;

  return status === 429 || status === 500 || status === 503;
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return String(redactSecrets(error.message));
  }

  return String(redactSecrets(String(error)));
}

function buildStructuredSystemInstruction(systemInstruction: string | undefined): string {
  if (!systemInstruction) {
    return STRUCTURED_JSON_SYSTEM_INSTRUCTION;
  }

  return [systemInstruction, STRUCTURED_JSON_SYSTEM_INSTRUCTION].join("\n\n");
}

function extractFencedJsonBlock(text: string): string | undefined {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (!match) {
    return undefined;
  }

  return match[1]?.trim() || undefined;
}

function extractLeadingJsonDocument(text: string): string | undefined {
  const start = text.search(/\S/);
  if (start < 0) {
    return undefined;
  }

  const first = text[start];
  if (first !== "{" && first !== "[") {
    return undefined;
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }

    if (char === "}" || char === "]") {
      const opener = stack.pop();
      if (!opener) {
        return undefined;
      }

      if ((opener === "{" && char !== "}") || (opener === "[" && char !== "]")) {
        return undefined;
      }

      if (stack.length === 0) {
        const trailing = text.slice(index + 1).trimStart();
        if (trailing.startsWith("{") || trailing.startsWith("[")) {
          return undefined;
        }

        return text.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

function parseStructuredJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (primaryError: unknown) {
    const fenced = extractFencedJsonBlock(text);
    if (fenced !== undefined) {
      try {
        return JSON.parse(fenced);
      } catch {
        // Fall through to the leading-document fallback.
      }
    }

    const leadingDocument = extractLeadingJsonDocument(text);
    if (leadingDocument !== undefined) {
      try {
        return JSON.parse(leadingDocument);
      } catch {
        // Fall through to the original parse error.
      }
    }

    throw primaryError;
  }
}

export class GeminiService {
  private readonly env: AppEnv;
  private readonly logger: SafeLogger;
  private readonly client: GoogleGenAIClientLike;
  private readonly callsRepository: GeminiCallsRepositoryLike | undefined;
  private readonly maxRetries: number;
  private readonly defaultTimeoutMs: number;

  public constructor(deps: ServiceDeps) {
    this.env = deps.env;
    this.logger = deps.logger;
    this.client =
      deps.client ??
      (new GoogleGenAI({
        apiKey: deps.env.GEMINI_API_KEY,
        apiVersion: deps.env.GEMINI_API_VERSION
      }) as unknown as GoogleGenAIClientLike);
    this.callsRepository = deps.callsRepository;
    this.maxRetries = deps.maxRetries ?? 2;
    this.defaultTimeoutMs = deps.defaultTimeoutMs ?? 30_000;
  }

  public generateText(request: GeminiTextRequest): Promise<GeminiTextResponse> {
    return this.generate("text", request, {});
  }

  public generateWithGoogleSearch(
    request: GeminiSearchRequest
  ): Promise<GeminiSearchResponse> {
    if (!this.env.ENABLE_GOOGLE_SEARCH) {
      throw new GeminiToolDisabledError("Google Search grounding is disabled.");
    }

    if ((request.feature ?? "ai") === "rpg") {
      throw new GeminiToolDisabledError("RPG requests cannot use Google Search.");
    }

    return this.generate("search", request, {
      tools: [{ googleSearch: {} }]
    });
  }

  public generateWithCodeExecution(
    request: GeminiCodeExecutionRequest
  ): Promise<GeminiCodeExecutionResponse> {
    if (!this.env.ENABLE_CODE_EXECUTION) {
      throw new GeminiToolDisabledError("Gemini code execution is disabled.");
    }

    if ((request.feature ?? "ai") === "rpg") {
      throw new GeminiToolDisabledError("RPG requests cannot use code execution.");
    }

    return this.generate("code", request, {
      tools: [{ codeExecution: {} }]
    });
  }

  public async generateStructured<T>(request: GeminiStructuredRequest<T>): Promise<T> {
    const responseJsonSchema = z.toJSONSchema(request.schema);
    const response = await this.generate(
      "structured",
      {
        ...request,
        temperature: request.temperature ?? 0,
        systemInstruction: buildStructuredSystemInstruction(request.systemInstruction)
      },
      {
        responseMimeType: "application/json",
        responseJsonSchema
      }
    );

    try {
      const parsed = parseStructuredJson(response.text);
      return request.schema.parse(parsed);
    } catch (error: unknown) {
      throw new GeminiResponseParseError(sanitizeErrorMessage(error));
    }
  }

  private async generate(
    kind: GeminiRequestKind,
    request: GeminiTextRequest,
    extraConfig: Record<string, unknown>
  ): Promise<GeminiTextResponse> {
    const feature = request.feature ?? "ai";
    const model = getModelForFeature(this.env, feature);
    const startedAt = Date.now();
    const params: GeminiGenerateContentParams = {
      model,
      contents: request.contents,
      config: {
        systemInstruction: request.systemInstruction,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
        ...extraConfig
      }
    };

    let response: GeminiGenerateContentResponse | undefined;
    let errorCode: string | undefined;

    try {
      response = await this.withRetries(params, request.timeoutMs ?? this.defaultTimeoutMs);
      const latencyMs = Date.now() - startedAt;
      const result: GeminiTextResponse = {
        text: extractText(response),
        model,
        latencyMs,
        finishReason: extractFinishReason(response),
        blocked: extractBlocked(response),
        usedTools: extractUsedTools(response),
        usage: extractUsage(response),
        raw: response
      };

      await this.persistCall({
        feature,
        kind,
        model,
        request,
        response,
        latencyMs,
        errorCode: undefined
      });

      return result;
    } catch (error: unknown) {
      errorCode = error instanceof Error ? error.name : "GeminiError";
      await this.persistCall({
        feature,
        kind,
        model,
        request,
        response,
        latencyMs: Date.now() - startedAt,
        errorCode
      });

      const sanitizedMessage = sanitizeErrorMessage(error);
      this.logger.safeError({ error: sanitizedMessage, model, kind }, "Gemini request failed");
      throw error instanceof Error ? new ExternalServiceError(sanitizedMessage) : new ExternalServiceError(sanitizedMessage);
    }
  }

  private async withRetries(
    params: GeminiGenerateContentParams,
    timeoutMs: number
  ): Promise<GeminiGenerateContentResponse> {
    let attempt = 0;

    while (true) {
      attempt += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        return await this.client.models.generateContent({
          ...params,
          abortSignal: controller.signal
        });
      } catch (error: unknown) {
        if (
          typeof error === "object" &&
          error !== null &&
          "name" in error &&
          (error as { name?: string }).name === "AbortError"
        ) {
          throw new GeminiTimeoutError();
        }

        if (attempt > this.maxRetries || !isRetryableError(error)) {
          throw error;
        }
      } finally {
        clearTimeout(timer);
      }
    }
  }

  private async persistCall(options: {
    feature: GeminiFeature;
    kind: GeminiRequestKind;
    model: string;
    request: GeminiTextRequest;
    response: GeminiGenerateContentResponse | undefined;
    latencyMs: number;
    errorCode: string | undefined;
  }): Promise<void> {
    if (!this.callsRepository) {
      return;
    }

    await this.callsRepository.createGeminiCall({
      id: createId("gcall"),
      feature: options.feature,
      model: options.model,
      requestKind: options.kind,
      toolsRequestedJson: JSON.stringify((options.response ? extractUsedTools(options.response) : [])),
      toolsUsedJson: JSON.stringify(options.response ? extractUsedTools(options.response) : []),
      finishReason: options.response ? extractFinishReason(options.response) : undefined,
      blocked: options.response ? extractBlocked(options.response) : false,
      latencyMs: options.latencyMs,
      promptTokenCount: options.response ? extractUsage(options.response).promptTokenCount : undefined,
      candidateTokenCount: options.response
        ? extractUsage(options.response).candidateTokenCount
        : undefined,
      totalTokenCount: options.response ? extractUsage(options.response).totalTokenCount : undefined,
      userHash: options.request.userHash,
      groupHash: options.request.groupHash,
      errorCode: options.errorCode
    });
  }
}
