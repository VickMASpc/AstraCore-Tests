import { describe, expect, it } from "vitest";
import { calculateDeepResearchConfidence } from "../../src/ai/deep-research-confidence.js";

describe("calculateDeepResearchConfidence", () => {
  it("returns low for fail", () => {
    expect(
      calculateDeepResearchConfidence({
        factCheckVerdict: "fail",
        sourceCount: 10,
        failedBranchCount: 0,
        blockedStageCount: 0
      })
    ).toBe("low");
  });

  it("returns low for needs_revision", () => {
    expect(
      calculateDeepResearchConfidence({
        factCheckVerdict: "needs_revision",
        sourceCount: 10,
        failedBranchCount: 0,
        blockedStageCount: 0
      })
    ).toBe("low");
  });

  it("returns low for fewer than 3 sources", () => {
    expect(
      calculateDeepResearchConfidence({
        factCheckVerdict: "pass",
        sourceCount: 2,
        failedBranchCount: 0,
        blockedStageCount: 0
      })
    ).toBe("low");
  });

  it("caps at medium when one branch failed", () => {
    expect(
      calculateDeepResearchConfidence({
        factCheckVerdict: "pass",
        recommendedFinalConfidence: "high",
        sourceCount: 10,
        failedBranchCount: 1,
        blockedStageCount: 0
      })
    ).toBe("medium");
  });

  it("allows high only under strong conditions", () => {
    expect(
      calculateDeepResearchConfidence({
        factCheckVerdict: "pass",
        recommendedFinalConfidence: "high",
        sourceCount: 8,
        failedBranchCount: 0,
        blockedStageCount: 0
      })
    ).toBe("high");
  });
});
