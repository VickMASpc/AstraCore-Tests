import { z } from "zod";
import { calculateDeepResearchConfidence } from "./deep-research-confidence.js";
import type { AppEnv } from "../config/env.js";
import type { GeminiService } from "../gemini/gemini.client.js";
import type { GeminiSearchResponse } from "../gemini/gemini.types.js";
import type { IncomingMessageContext } from "../router/command.types.js";
import { createId } from "../utils/ids.js";
import type {
  DeepResearchArtifact,
  DeepResearchBrief,
  FactCheckReport,
  DeepResearchStage
} from "./deep-research.types.js";
import {
  DEEP_RESEARCH_DETAIL_SYSTEM,
  DEEP_RESEARCH_FACTCHECK_SYSTEM,
  DEEP_RESEARCH_FINAL_SYSTEM,
  DEEP_RESEARCH_PLANNER_SYSTEM,
  DEEP_RESEARCH_SOURCE_SYSTEM,
  DEEP_RESEARCH_WRITER_SYSTEM
} from "./prompts/deepResearch.prompts.js";
import { dedupeSources, extractSourcesFromRaw } from "./research-sources.js";

type AiRepository = ReturnType<typeof import("../db/repositories/ai.repo.js").createAiRepository>;
type DeepResearchModelKey =
  | "DEEP_RESEARCH_PLANNER_MODEL"
  | "DEEP_RESEARCH_DETAIL_MODEL"
  | "DEEP_RESEARCH_SOURCE_MODEL"
  | "DEEP_RESEARCH_WRITER_MODEL"
  | "DEEP_RESEARCH_FACTCHECK_MODEL"
  | "DEEP_RESEARCH_FINAL_MODEL";

const deepResearchBriefSchema = z
  .object({
    topic: z.string().min(1),
    normalizedQuestion: z.string().min(1),
    scope: z
      .object({
        geography: z.string().min(1).optional(),
        timeRange: z.string().min(1).optional(),
        audience: z.string().min(1).optional(),
        depth: z.enum(["high", "expert", "technical"])
      })
      .strict(),
    keyQuestions: z.array(z.string().min(1)),
    requiredSourceTypes: z.array(z.string().min(1)),
    knownAmbiguities: z.array(z.string().min(1)),
    exclusionRules: z.array(z.string().min(1)),
    finalReportRequirements: z.array(z.string().min(1))
  })
  .strict();

const STAGE_MODELS: Record<DeepResearchStage, DeepResearchModelKey> = {
  planner: "DEEP_RESEARCH_PLANNER_MODEL",
  detail: "DEEP_RESEARCH_DETAIL_MODEL",
  source: "DEEP_RESEARCH_SOURCE_MODEL",
  writer: "DEEP_RESEARCH_WRITER_MODEL",
  factcheck: "DEEP_RESEARCH_FACTCHECK_MODEL",
  final: "DEEP_RESEARCH_FINAL_MODEL"
};

const STAGE_SYSTEMS: Record<Exclude<DeepResearchStage, "planner">, string> = {
  detail: DEEP_RESEARCH_DETAIL_SYSTEM,
  source: DEEP_RESEARCH_SOURCE_SYSTEM,
  writer: DEEP_RESEARCH_WRITER_SYSTEM,
  factcheck: DEEP_RESEARCH_FACTCHECK_SYSTEM,
  final: DEEP_RESEARCH_FINAL_SYSTEM
};

type PaperStage = "detail" | "source" | "writer";

function serializeBrief(brief: DeepResearchBrief): string {
  return JSON.stringify(brief, null, 2);
}

function normalizeBrief(brief: z.infer<typeof deepResearchBriefSchema>): DeepResearchBrief {
  return {
    topic: brief.topic,
    normalizedQuestion: brief.normalizedQuestion,
    scope: {
      depth: brief.scope.depth,
      ...(brief.scope.geography ? { geography: brief.scope.geography } : {}),
      ...(brief.scope.timeRange ? { timeRange: brief.scope.timeRange } : {}),
      ...(brief.scope.audience ? { audience: brief.scope.audience } : {})
    },
    keyQuestions: brief.keyQuestions,
    requiredSourceTypes: brief.requiredSourceTypes,
    knownAmbiguities: brief.knownAmbiguities,
    exclusionRules: brief.exclusionRules,
    finalReportRequirements: brief.finalReportRequirements
  };
}

function formatArtifactSection(stage: DeepResearchStage, artifact: DeepResearchArtifact | undefined): string {
  const label = stage.toUpperCase();

  if (!artifact) {
    return `${label} STATUS: NOT RUN`;
  }

  if (artifact.error) {
    return `${label} STATUS: FAILED\nModel: ${artifact.model}\nError: ${artifact.error}`;
  }

  return `${label} STATUS: OK\nModel: ${artifact.model}\n${artifact.text}`;
}

function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function inferConfidence(text: string): "high" | "medium" | "low" | undefined {
  const normalized = text.toLowerCase();

  if (normalized.includes("confidence: high") || normalized.includes("recommendedfinalconfidence\":\"high")) {
    return "high";
  }

  if (normalized.includes("confidence: low") || normalized.includes("recommendedfinalconfidence\":\"low")) {
    return "low";
  }

  if (normalized.includes("confidence: medium") || normalized.includes("recommendedfinalconfidence\":\"medium")) {
    return "medium";
  }

  return undefined;
}

function inferVerdict(
  text: string
): FactCheckReport["verdict"] {
  const normalized = text.toLowerCase();

  if (normalized.includes("\"verdict\":\"fail\"") || normalized.includes("verdict: fail")) {
    return "fail";
  }

  if (
    normalized.includes("\"verdict\":\"needs_revision\"") ||
    normalized.includes("verdict: needs_revision")
  ) {
    return "needs_revision";
  }

  if (
    normalized.includes("\"verdict\":\"pass_with_cautions\"") ||
    normalized.includes("verdict: pass_with_cautions")
  ) {
    return "pass_with_cautions";
  }

  return "pass";
}

function applyDeterministicConfidence(report: string, confidence: "high" | "medium" | "low"): string {
  const confidenceLine = `Confidence: ${confidence}`;
  const replaced = report.replace(/^confidence:\s*(high|medium|low)\s*$/im, confidenceLine);

  if (replaced !== report) {
    return replaced;
  }

  return `${report.trimEnd()}\n\n${confidenceLine}`;
}

export class DeepResearchService {
  public constructor(
    private readonly repo: AiRepository,
    private readonly gemini: GeminiService,
    private readonly env: AppEnv
  ) {}

  public async run(context: IncomingMessageContext, topic: string): Promise<string> {
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      return "A research topic is required.";
    }

    const conversation = await this.ensureConversation(context);
    const run = await this.repo.createDeepResearchRun({
      id: createId("drrun"),
      conversationId: conversation.id,
      query: trimmedTopic,
      status: "running"
    });
    const runId = run?.id ?? createId("drrun_fallback");

    let plannerBrief: DeepResearchBrief;
    try {
      plannerBrief = await this.runPlanner(runId, trimmedTopic);
    } catch (error: unknown) {
      await this.repo.updateDeepResearchRun(runId, {
        status: "failed"
      });
      await this.persistFailedArtifact("planner", runId, this.env[STAGE_MODELS.planner], error);
      return "Deep research could not start because planning failed.";
    }

    const paperResults = await Promise.allSettled([
      this.runPaper(runId, "detail", trimmedTopic, plannerBrief),
      this.runPaper(runId, "source", trimmedTopic, plannerBrief),
      this.runPaper(runId, "writer", trimmedTopic, plannerBrief)
    ]);

    const papers: Record<PaperStage, DeepResearchArtifact> = {
      detail: this.toArtifact("detail", paperResults[0]),
      source: this.toArtifact("source", paperResults[1]),
      writer: this.toArtifact("writer", paperResults[2])
    };

    const successfulPapers = Object.values(papers).filter((artifact) => !artifact.error);
    if (successfulPapers.length < 2) {
      await this.repo.updateDeepResearchRun(runId, {
        status: "failed"
      });
      return "Deep research could not complete because too many research stages failed.";
    }

    let factCheck: DeepResearchArtifact;
    try {
      factCheck = await this.runStage(
        runId,
        "factcheck",
        this.buildFactCheckPrompt(trimmedTopic, plannerBrief, papers)
      );
    } catch (error: unknown) {
      await this.repo.updateDeepResearchRun(runId, {
        status: "failed"
      });
      await this.persistFailedArtifact(
        "factcheck",
        runId,
        this.env[STAGE_MODELS.factcheck],
        error
      );
      return "Deep research stopped at the quality gate. Please try again.";
    }

    let finalArtifact: DeepResearchArtifact;
    const preFinalSources = dedupeSources(
      [...Object.values(papers), factCheck].flatMap((artifact) => artifact.sources)
    );
    const failedBranchCount = Object.values(papers).filter((artifact) => artifact.error).length;
    const blockedStageCount = [...Object.values(papers), factCheck].filter((artifact) => artifact.blocked).length;
    const recommendedFinalConfidence = inferConfidence(factCheck.text);
    const deterministicConfidence = calculateDeepResearchConfidence({
      factCheckVerdict: inferVerdict(factCheck.text),
      sourceCount: preFinalSources.length,
      failedBranchCount,
      blockedStageCount,
      ...(recommendedFinalConfidence ? { recommendedFinalConfidence } : {})
    });
    try {
      finalArtifact = await this.runStage(
        runId,
        "final",
        this.buildFinalPrompt(
          trimmedTopic,
          plannerBrief,
          papers,
          factCheck,
          deterministicConfidence
        )
      );
    } catch (error: unknown) {
      await this.repo.updateDeepResearchRun(runId, {
        status: "failed"
      });
      await this.persistFailedArtifact("final", runId, this.env[STAGE_MODELS.final], error);
      return "Deep research could not produce a final report. Please try again.";
    }

    const dedupedSources = dedupeSources(
      [
        ...Object.values(papers),
        factCheck,
        finalArtifact
      ].flatMap((artifact) => artifact.sources)
    );
    const finalReportText = applyDeterministicConfidence(finalArtifact.text, deterministicConfidence);

    const stored = await this.repo.createResearchReport({
      id: createId("rpt"),
      conversationId: conversation.id,
      query: trimmedTopic,
      reportMarkdown: finalReportText
    });

    if (stored) {
      for (const source of dedupedSources) {
        await this.repo.createResearchSource({
          id: createId("src"),
          reportId: stored.id,
          title: source.title,
          url: source.url,
          ...(source.snippet ? { snippet: source.snippet } : {})
        });
      }
    }

    const inferredConfidence = inferConfidence(factCheck.text) ?? inferConfidence(finalArtifact.text);
    await this.repo.updateDeepResearchRun(runId, {
      status: successfulPapers.length === 3 ? "completed" : "partial",
      finalReportMarkdown: finalReportText,
      confidence: deterministicConfidence
    });

    return finalReportText;
  }

  private async runPlanner(runId: string, topic: string): Promise<DeepResearchBrief> {
    const startedAt = Date.now();
    const parsed = await this.gemini.generateStructured({
      feature: "ai",
      modelOverride: this.env[STAGE_MODELS.planner],
      systemInstruction: DEEP_RESEARCH_PLANNER_SYSTEM,
      contents: [
        `User topic: ${topic}`,
        "Create a research brief for the downstream deep research pipeline.",
        "Return a DeepResearchBrief-compatible JSON object."
      ].join("\n"),
      schema: deepResearchBriefSchema
    });
    const brief = normalizeBrief(parsed);
    await this.repo.createDeepResearchArtifact({
      id: createId("drart"),
      runId,
      stage: "planner",
      model: this.env[STAGE_MODELS.planner],
      contentJson: JSON.stringify(brief),
      blocked: false,
      latencyMs: Date.now() - startedAt
    });

    return brief;
  }

  private async runPaper(
    runId: string,
    stage: PaperStage,
    topic: string,
    brief: DeepResearchBrief
  ): Promise<DeepResearchArtifact> {
    return this.runStage(
      runId,
      stage,
      [
        `Original topic: ${topic}`,
        "Planner brief JSON:",
        serializeBrief(brief),
        "",
        "Stay within the brief and produce a stage-appropriate paper."
      ].join("\n")
    );
  }

  private async runStage(
    runId: string,
    stage: Exclude<DeepResearchStage, "planner">,
    contents: string
  ): Promise<DeepResearchArtifact> {
    try {
      const response = await this.gemini.generateWithGoogleSearch({
        feature: "ai",
        systemInstruction: STAGE_SYSTEMS[stage],
        modelOverride: this.env[STAGE_MODELS[stage]],
        contents
      });

      const artifact = this.toSuccessArtifact(stage, response);
      await this.repo.createDeepResearchArtifact({
        id: createId("drart"),
        runId,
        stage,
        model: artifact.model,
        contentMarkdown: artifact.text,
        ...(artifact.sources.length > 0 ? { sourcesJson: JSON.stringify(artifact.sources) } : {}),
        blocked: artifact.blocked,
        ...(artifact.latencyMs !== undefined ? { latencyMs: artifact.latencyMs } : {})
      });

      return artifact;
    } catch (error: unknown) {
      await this.persistFailedArtifact(stage, runId, this.env[STAGE_MODELS[stage]], error);
      throw error;
    }
  }

  private toSuccessArtifact(stage: Exclude<DeepResearchStage, "planner">, response: GeminiSearchResponse): DeepResearchArtifact {
    return {
      stage,
      model: response.model,
      text: response.text,
      raw: response.raw,
      sources: extractSourcesFromRaw(response.raw),
      latencyMs: response.latencyMs,
      blocked: response.blocked
    };
  }

  private toArtifact(stage: PaperStage, result: PromiseSettledResult<DeepResearchArtifact>): DeepResearchArtifact {
    if (result.status === "fulfilled") {
      return result.value;
    }

    const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
    return {
      stage,
      model: this.env[STAGE_MODELS[stage]],
      text: "",
      sources: [],
      blocked: true,
      error
    };
  }

  private async persistFailedArtifact(
    stage: DeepResearchStage,
    runId: string,
    model: string,
    error: unknown
  ): Promise<void> {
    await this.repo.createDeepResearchArtifact({
      id: createId("drart"),
      runId,
      stage,
      model,
      blocked: true,
      errorCode: sanitizeError(error)
    });
  }

  private buildFactCheckPrompt(
    topic: string,
    brief: DeepResearchBrief,
    papers: Record<PaperStage, DeepResearchArtifact>
  ): string {
    return [
      `Original user topic: ${topic}`,
      "Planner brief JSON:",
      serializeBrief(brief),
      "",
      formatArtifactSection("detail", papers.detail),
      "",
      formatArtifactSection("source", papers.source),
      "",
      formatArtifactSection("writer", papers.writer),
      "",
      "Use fresh Google Search evidence to audit the three papers. Produce a strict quality gate report."
    ].join("\n");
  }

  private buildFinalPrompt(
    topic: string,
    brief: DeepResearchBrief,
    papers: Record<PaperStage, DeepResearchArtifact>,
    factCheck: DeepResearchArtifact,
    deterministicConfidence: "high" | "medium" | "low"
  ): string {
    return [
      `Original user topic: ${topic}`,
      "Planner brief JSON:",
      serializeBrief(brief),
      "",
      formatArtifactSection("detail", papers.detail),
      "",
      formatArtifactSection("source", papers.source),
      "",
      formatArtifactSection("writer", papers.writer),
      "",
      "FACTCHECK REPORT:",
      factCheck.text,
      "",
      "The fact-check report is binding unless fresh search evidence clearly disproves it.",
      "Include uncertainty, confidence framing, and source quality discussion in the final report.",
      `Use this deterministic confidence level in the final report: ${deterministicConfidence}.`,
      "Do not claim a higher confidence level than the deterministic confidence above.",
      "Only produce the final user-facing report."
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
