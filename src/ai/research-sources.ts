import { z } from "zod";
import type { ResearchSource } from "./deep-research.types.js";

const sourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  snippet: z.string().optional()
});

export function extractSourcesFromRaw(raw: unknown): ResearchSource[] {
  const matches: ResearchSource[] = [];

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    if (typeof value !== "object" || value === null) {
      return;
    }

    const record = value as Record<string, unknown>;
    const maybeUrl =
      typeof record.uri === "string" ? record.uri : typeof record.url === "string" ? record.url : undefined;
    const maybeTitle =
      typeof record.title === "string"
        ? record.title
        : typeof record.domain === "string"
          ? record.domain
          : undefined;
    const maybeSnippet =
      typeof record.snippet === "string"
        ? record.snippet
        : typeof record.text === "string"
          ? record.text
          : undefined;

    if (maybeUrl && maybeTitle) {
      const parsed = sourceSchema.safeParse({
        title: maybeTitle,
        url: maybeUrl,
        snippet: maybeSnippet
      });

      if (parsed.success && !matches.some((entry) => entry.url === parsed.data.url)) {
        matches.push({
          title: parsed.data.title,
          url: parsed.data.url,
          ...(parsed.data.snippet ? { snippet: parsed.data.snippet } : {})
        });
      }
    }

    for (const child of Object.values(record)) {
      visit(child);
    }
  };

  visit(raw);
  return matches;
}

export function dedupeSources(sources: ResearchSource[]): ResearchSource[] {
  const byUrl = new Map<string, ResearchSource>();

  for (const source of sources) {
    const existing = byUrl.get(source.url);
    if (!existing) {
      byUrl.set(source.url, source);
      continue;
    }

    byUrl.set(source.url, {
      title: existing.title.length >= source.title.length ? existing.title : source.title,
      url: source.url,
      ...(existing.snippet ?? source.snippet ? { snippet: existing.snippet ?? source.snippet } : {})
    });
  }

  return [...byUrl.values()];
}

export function compactSourceList(sources: ResearchSource[]): string {
  if (sources.length === 0) {
    return "No grounded source metadata was returned.";
  }

  return sources
    .slice(0, 5)
    .map((source, index) => `${index + 1}. ${source.title}`)
    .join("\n");
}
