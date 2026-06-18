import type { FactCheckReport } from "./deep-research.types.js";

export function calculateDeepResearchConfidence(input: {
  factCheckVerdict: FactCheckReport["verdict"];
  recommendedFinalConfidence?: FactCheckReport["recommendedFinalConfidence"];
  sourceCount: number;
  failedBranchCount: number;
  blockedStageCount: number;
}): "high" | "medium" | "low" {
  if (input.factCheckVerdict === "fail" || input.factCheckVerdict === "needs_revision") {
    return "low";
  }

  if (input.sourceCount < 3) {
    return "low";
  }

  if (input.failedBranchCount > 0 || input.blockedStageCount > 0) {
    if (input.recommendedFinalConfidence === "high") {
      return "medium";
    }

    return input.recommendedFinalConfidence ?? "medium";
  }

  if (
    input.recommendedFinalConfidence === "high" &&
    input.sourceCount >= 8 &&
    input.failedBranchCount === 0 &&
    input.blockedStageCount === 0
  ) {
    return "high";
  }

  return input.recommendedFinalConfidence ?? "medium";
}
