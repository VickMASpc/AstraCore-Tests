import { z } from "zod";
import type { GeminiService } from "../gemini/gemini.client.js";
import type { IncomingMessageContext } from "../router/command.types.js";
import { createId } from "../utils/ids.js";

type AiRepository = ReturnType<typeof import("../db/repositories/ai.repo.js").createAiRepository>;

const sourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  snippet: z.string().optional()
});

function extractSourcesFromRaw(raw: unknown): Array<z.infer<typeof sourceSchema>> {
  const matches: Array<z.infer<typeof sourceSchema>> = [];

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
    const maybeUrl = typeof record.uri === "string" ? record.uri : typeof record.url === "string" ? record.url : undefined;
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
        matches.push(parsed.data);
      }
    }

    for (const child of Object.values(record)) {
      visit(child);
    }
  };

  visit(raw);
  return matches;
}

function compactSourceList(sources: Array<{ title: string; url: string }>): string {
  if (sources.length === 0) {
    return "No grounded source metadata was returned.";
  }

  return sources
    .slice(0, 5)
    .map((source, index) => `${index + 1}. ${source.title}`)
    .join("\n");
}

export class ResearchService {
  public constructor(
    private readonly repo: AiRepository,
    private readonly gemini: GeminiService
  ) {}

  public async research(context: IncomingMessageContext, topic: string) {
    const conversation = await this.ensureConversation(context);
    const response = await this.gemini.generateWithGoogleSearch({
      feature: "ai",
      contents: `Research topic: ${topic}\nReturn compact key points, uncertainty, and confidence.`
    });
    const sources = extractSourcesFromRaw(response.raw);
    const report = [
      "Research answer",
      response.text,
      "",
      "Key points",
      "- Grounded search used",
      "",
      "Sources checked",
      compactSourceList(sources),
      "",
      `Confidence: ${response.blocked ? "low" : "medium"}`
    ].join("\n");

    const stored = await this.repo.createResearchReport({
      id: createId("rpt"),
      conversationId: conversation.id,
      query: topic,
      reportMarkdown: report
    });

    if (stored) {
      for (const source of sources) {
        await this.repo.createResearchSource({
          id: createId("src"),
          reportId: stored.id,
          title: source.title,
          url: source.url,
          snippet: source.snippet
        });
      }
    }

    return report;
  }

  public async deepResearch(context: IncomingMessageContext, topic: string) {
    const conversation = await this.ensureConversation(context);
    const subquestionSchema = z
      .object({
        subquestions: z.array(z.string()).min(1).max(5)
      })
      .strict();
    const subquestions = await this.gemini.generateStructured({
      feature: "ai",
      contents: [
        `Generate exactly 3 short subquestions for deep research on: ${topic}`,
        "Return JSON only.",
        "The JSON must be exactly this shape:",
        "{\"subquestions\":[\"question 1\",\"question 2\",\"question 3\"]}",
        "Do not return a bare array."
      ].join("\n"),
      schema: subquestionSchema
    });

    const grounded = await this.gemini.generateWithGoogleSearch({
      feature: "ai",
      contents: `Topic: ${topic}\nSubquestions:\n${subquestions.subquestions.join("\n")}\nReturn executive answer, findings, uncertainties, practical implications, and confidence.`
    });
    const sources = extractSourcesFromRaw(grounded.raw);
    const report = [
      `Deep Research: ${topic}`,
      "Executive answer",
      grounded.text,
      "",
      "Findings",
      subquestions.subquestions.map((question) => `- ${question}`).join("\n"),
      "",
      "Evidence / sources",
      compactSourceList(sources),
      "",
      "Uncertainties",
      grounded.blocked ? "- Safety or grounding limits affected the answer." : "- Evidence coverage may still be incomplete.",
      "",
      "Practical implications",
      "- Validate critical claims against primary sources before acting.",
      "",
      `Confidence: ${sources.length > 0 ? "medium" : "low"}`
    ].join("\n");

    const stored = await this.repo.createResearchReport({
      id: createId("rpt"),
      conversationId: conversation.id,
      query: topic,
      reportMarkdown: report
    });

    if (stored) {
      for (const source of sources) {
        await this.repo.createResearchSource({
          id: createId("src"),
          reportId: stored.id,
          title: source.title,
          url: source.url,
          snippet: source.snippet
        });
      }
    }

    return report;
  }

  public async latestSources(context: IncomingMessageContext) {
    const conversation = await this.ensureConversation(context);
    const sources = await this.repo.listLatestResearchSources(conversation.id);

    if (sources.length === 0) {
      return "No stored sources for this chat.";
    }

    return sources.map((source, index) => `${index + 1}. ${source.title}\n${source.url}`).join("\n");
  }

  private async ensureConversation(context: IncomingMessageContext) {
    const scope = context.isGroup ? "group" : "private";
    const existing = await this.repo.findConversationByScope(
      scope,
      scope === "private" ? context.senderJid : undefined,
      scope === "group" ? context.groupJid : undefined
    );

    if (existing) {
      return existing;
    }

    const created = await this.repo.createConversation({
      id: createId("conv"),
      scope,
      userId: scope === "private" ? context.senderJid : undefined,
      groupId: scope === "group" ? context.groupJid : undefined
    });

    if (!created) {
      throw new Error("Failed to create research conversation.");
    }

    return created;
  }
}
