import type { CandidateProfileFact, PrivacyMode, PrivacyPolicyDecision } from "./profile.types.js";

export function isFactAllowedByPrivacy(
  mode: PrivacyMode,
  fact: CandidateProfileFact
): PrivacyPolicyDecision {
  if (fact.source === "derived" && fact.sensitivity === "high") {
    return { allowed: false, reason: "High-sensitivity inferred facts are blocked." };
  }

  if (mode === "minimal") {
    return {
      allowed: fact.source !== "derived",
      reason: fact.source === "derived" ? "Minimal privacy blocks derived facts." : "Allowed."
    };
  }

  if (mode === "normal") {
    return {
      allowed: !(fact.source === "derived" && fact.sensitivity !== "low"),
      reason:
        fact.source === "derived" && fact.sensitivity !== "low"
          ? "Normal privacy allows only low-sensitivity derived facts."
          : "Allowed."
    };
  }

  return {
    allowed: fact.sensitivity !== "high",
    reason: fact.sensitivity === "high" ? "Rich privacy still blocks high sensitivity." : "Allowed."
  };
}
