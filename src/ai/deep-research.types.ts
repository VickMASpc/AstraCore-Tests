export type DeepResearchStage = "planner" | "detail" | "source" | "writer" | "factcheck" | "final";

export type ResearchSource = {
  title: string;
  url: string;
  snippet?: string;
};

export type DeepResearchArtifact = {
  stage: DeepResearchStage;
  model: string;
  text: string;
  raw?: unknown;
  sources: ResearchSource[];
  latencyMs?: number;
  blocked: boolean;
  error?: string;
};

export type DeepResearchBrief = {
  topic: string;
  normalizedQuestion: string;
  scope: {
    geography?: string;
    timeRange?: string;
    audience?: string;
    depth: "high" | "expert" | "technical";
  };
  keyQuestions: string[];
  requiredSourceTypes: string[];
  knownAmbiguities: string[];
  exclusionRules: string[];
  finalReportRequirements: string[];
};

export type FactCheckReport = {
  verdict: "pass" | "pass_with_cautions" | "needs_revision" | "fail";
  overallAssessment: string;
  paperAssessments: Array<{
    paperName: "detail" | "source" | "writer";
    strengths: string[];
    weaknesses: string[];
    unsupportedClaims: string[];
    questionableClaims: string[];
    missingContext: string[];
  }>;
  contradictions: Array<{
    issue: string;
    paperA: string;
    paperB: string;
    likelyResolution: string;
    confidence: "high" | "medium" | "low";
  }>;
  claimsToRemoveOrSoften: string[];
  claimsNeedingCitation: string[];
  mustIncludeInFinal: string[];
  mustNotSayInFinal: string[];
  recommendedFinalConfidence: "high" | "medium" | "low";
};
