import type { Command } from "../router/command.types.js";
import { parseGitHubUrl, type RepoAnalysisService } from "../ai/github.service.js";
import type { ProfessionalAiService } from "../ai/ai.service.js";
import type { ResearchService } from "../ai/research.service.js";
import type { ProfileService } from "../profiles/profile.service.js";

export function createAiCommands(
  aiService: ProfessionalAiService,
  profileService: ProfileService,
  researchService?: ResearchService,
  repoAnalysisService?: RepoAnalysisService
): Command[] {
  const questionHandler =
    (mode: string) =>
    async (context: Parameters<Command["handler"]>[0]) => {
      const prompt =
        context.rawArgs && context.rawArgs.length > 0
          ? context.rawArgs
          : context.quotedText ?? "";

      if (!prompt.trim()) {
        return { ok: true as const, reply: "A prompt is required." };
      }

      const reply = await aiService.answer(context, prompt, mode);
      await profileService.storeExtractedFacts({
        context,
        commandResultSummary: reply
      });
      return { ok: true as const, reply };
    };

  return [
    { name: "ai", aliases: ["ask", "pro"], mode: "ai", description: "Professional AI answer", rateLimitKey: "ai.ask", handler: questionHandler("qa") },
    { name: "explain", aliases: [], mode: "ai", description: "Explain text or code", rateLimitKey: "ai.explain", handler: questionHandler("explain") },
    { name: "summarize", aliases: [], mode: "ai", description: "Summarize text", rateLimitKey: "ai.summarize", handler: questionHandler("summarize") },
    { name: "draft", aliases: [], mode: "ai", description: "Draft assistance", rateLimitKey: "ai.draft", handler: questionHandler("draft") },
    { name: "compare", aliases: [], mode: "ai", description: "Compare options", rateLimitKey: "ai.compare", handler: questionHandler("compare") },
    { name: "plan", aliases: [], mode: "ai", description: "Planning help", rateLimitKey: "ai.plan", handler: questionHandler("plan") },
    { name: "code", aliases: [], mode: "ai", description: "Static code analysis", rateLimitKey: "ai.code", handler: questionHandler("code-static-analysis-only") },
    {
      name: "aireset",
      aliases: [],
      mode: "ai",
      description: "Clear AI chat context",
      rateLimitKey: "ai.reset",
      handler: async (context) => ({ ok: true as const, reply: await aiService.resetContext(context) })
    },
    {
      name: "research",
      aliases: [],
      mode: "ai",
      description: "Source-grounded research",
      rateLimitKey: "ai.research",
      handler: async (context) => ({
        ok: true as const,
        reply: researchService
          ? await researchService.research(context, context.rawArgs ?? "")
          : "Research service unavailable."
      })
    },
    {
      name: "deepresearch",
      aliases: [],
      mode: "ai",
      description: "Deep source-grounded research",
      rateLimitKey: "ai.deepresearch",
      handler: async (context) => ({
        ok: true as const,
        reply: researchService
          ? await researchService.deepResearch(context, context.rawArgs ?? "")
          : "Research service unavailable."
      })
    },
    {
      name: "sources",
      aliases: [],
      mode: "ai",
      description: "Latest grounded sources",
      rateLimitKey: "ai.sources",
      handler: async (context) => ({
        ok: true as const,
        reply: researchService ? await researchService.latestSources(context) : "Research service unavailable."
      })
    },
    {
      name: "repo",
      aliases: [],
      mode: "ai",
      description: "Analyze a public GitHub repository",
      rateLimitKey: "ai.repo",
      handler: async (context) => ({
        ok: true as const,
        reply: repoAnalysisService
          ? await repoAnalysisService.analyze(context, (context.rawArgs ?? "").trim(), false)
          : "Repository analysis unavailable."
      })
    },
    {
      name: "review",
      aliases: [],
      mode: "ai",
      description: "Review a public GitHub repo or pasted code",
      rateLimitKey: "ai.review",
      handler: async (context) => {
        const subject = (context.rawArgs ?? context.quotedText ?? "").trim();
        if (!subject) {
          return { ok: true as const, reply: "A GitHub URL or pasted code is required." };
        }

        if (repoAnalysisService && parseGitHubUrl(subject)) {
          return { ok: true as const, reply: await repoAnalysisService.analyze(context, subject, true) };
        }

        return {
          ok: true as const,
          reply: repoAnalysisService
            ? await repoAnalysisService.reviewCode(context, subject)
            : "Repository analysis unavailable."
        };
      }
    }
  ];
}
