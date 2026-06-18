import { z } from "zod";
import type { GeminiService } from "../gemini/gemini.client.js";
import type { IncomingMessageContext } from "../router/command.types.js";
import { createId } from "../utils/ids.js";
import { compactSourceList, extractSourcesFromRaw } from "./research-sources.js";

type AiRepository = ReturnType<typeof import("../db/repositories/ai.repo.js").createAiRepository>;

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
    const sources = await this.repo.listLatestSourcesForConversation(conversation.id);

    if (sources.length === 0) {
      return "No stored sources for this chat.";
    }

    return [
      "Sources for latest research:",
      "",
      sources.map((source, index) => `${index + 1}. ${source.title}\n${source.url}`).join("\n\n")
    ].join("\n");
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
