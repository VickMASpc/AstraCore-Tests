import type { z } from "zod";

export type GeminiFeature = "ai" | "profile" | "rpg";
export type GeminiRequestKind = "text" | "search" | "code" | "structured";

export type GeminiBaseRequest = {
  contents: string;
  systemInstruction?: string;
  modelOverride?: string;
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  userHash?: string;
  groupHash?: string;
  feature?: GeminiFeature;
};

export type GeminiTextRequest = GeminiBaseRequest;

export type GeminiSearchRequest = GeminiBaseRequest & {
  feature?: GeminiFeature;
};

export type GeminiCodeExecutionRequest = GeminiBaseRequest & {
  feature?: GeminiFeature;
};

export type GeminiStructuredRequest<T> = GeminiBaseRequest & {
  schema: z.ZodType<T>;
};

export type GeminiUsage = {
  promptTokenCount: number | undefined;
  candidateTokenCount: number | undefined;
  totalTokenCount: number | undefined;
};

export type GeminiToolName = "googleSearch" | "codeExecution";

export type GeminiTextResponse = {
  text: string;
  model: string;
  latencyMs: number;
  finishReason: string | undefined;
  blocked: boolean;
  usedTools: GeminiToolName[];
  usage: GeminiUsage;
  raw: GeminiGenerateContentResponse;
};

export type GeminiSearchResponse = GeminiTextResponse;
export type GeminiCodeExecutionResponse = GeminiTextResponse;

export type GeminiGenerateContentParams = {
  model: string;
  contents: string;
  config: Record<string, unknown>;
  abortSignal?: AbortSignal;
};

export type GeminiGenerateContentResponse = {
  text: string | undefined;
  candidates: unknown[] | undefined;
  usageMetadata: GeminiUsage | undefined;
};

export interface GoogleGenAIClientLike {
  models: {
    generateContent(params: GeminiGenerateContentParams): Promise<GeminiGenerateContentResponse>;
  };
}

export interface GeminiCallsRepositoryLike {
  createGeminiCall(input: Record<string, unknown>): Promise<unknown>;
}
