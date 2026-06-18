export type StorageZone = "system" | "profile" | "ai" | "rpg";
export type PrivacyMode = "minimal" | "normal" | "rich";
export type FactSensitivity = "low" | "medium" | "high";
export type FactSource = "explicit_user" | "explicit_admin" | "derived";
export type ProfileOwnerType = "user" | "group" | "user_in_group";

export type CandidateProfileFact = {
  ownerType: ProfileOwnerType;
  zone: "profile" | "ai";
  fact: string;
  confidence: number;
  sensitivity: FactSensitivity;
  source: FactSource;
  expiresAt: string | undefined;
  reason: string;
};

export type PrivacyPolicyDecision = {
  allowed: boolean;
  reason: string;
};
