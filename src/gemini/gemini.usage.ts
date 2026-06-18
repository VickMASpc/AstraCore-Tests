import type {
  GeminiGenerateContentResponse,
  GeminiToolName,
  GeminiUsage
} from "./gemini.types.js";

function deepScan(value: unknown, predicate: (input: string) => boolean, found = new Set<string>()) {
  if (typeof value === "string") {
    if (predicate(value)) {
      found.add(value);
    }
    return found;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      deepScan(item, predicate, found);
    }
    return found;
  }

  if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      if (predicate(key)) {
        found.add(key);
      }
      deepScan(entry, predicate, found);
    }
  }

  return found;
}

export function extractUsage(response: GeminiGenerateContentResponse): GeminiUsage {
  return {
    promptTokenCount: response.usageMetadata?.promptTokenCount,
    candidateTokenCount: response.usageMetadata?.candidateTokenCount,
    totalTokenCount: response.usageMetadata?.totalTokenCount
  };
}

export function extractFinishReason(response: GeminiGenerateContentResponse): string | undefined {
  const firstCandidate = response.candidates?.[0] as { finishReason?: string } | undefined;
  return firstCandidate?.finishReason;
}

export function extractBlocked(response: GeminiGenerateContentResponse): boolean {
  return response.candidates?.some((candidate) =>
    JSON.stringify(candidate).toLowerCase().includes("safety")
  ) ?? false;
}

export function extractUsedTools(response: GeminiGenerateContentResponse): GeminiToolName[] {
  const haystack = [response.candidates, response].map((value) =>
    JSON.stringify(value)?.toLowerCase() ?? ""
  );
  const tools = new Set<GeminiToolName>();

  for (const entry of haystack) {
    if (entry.includes("googlesearch")) {
      tools.add("googleSearch");
    }
    if (entry.includes("codeexecution")) {
      tools.add("codeExecution");
    }
  }

  return [...tools];
}

export function extractText(response: GeminiGenerateContentResponse): string {
  if (typeof response.text === "string") {
    return response.text;
  }

  const candidateText = deepScan(response.candidates, (value) => value === "text");
  if (candidateText.size > 0) {
    const serialized = JSON.stringify(response.candidates);
    return serialized;
  }

  return "";
}
