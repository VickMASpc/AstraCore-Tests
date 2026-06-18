import { z } from "zod";
import type { GeminiService } from "../gemini/gemini.client.js";
import type { IncomingMessageContext } from "../router/command.types.js";
import type { PrivacyMode } from "./profile.types.js";

export const candidateProfileFactSchema = z.object({
  ownerType: z.enum(["user", "group", "user_in_group"]),
  zone: z.enum(["profile", "ai"]),
  fact: z.string().min(1),
  confidence: z.number().int().min(0).max(100),
  sensitivity: z.enum(["low", "medium", "high"]),
  source: z.enum(["explicit_user", "explicit_admin", "derived"]),
  expiresAt: z.string().optional(),
  reason: z.string().min(1)
});

export const profileExtractionResultSchema = z.object({
  facts: z.array(candidateProfileFactSchema)
});

export async function extractCandidateProfileFacts(options: {
  gemini: GeminiService;
  context: IncomingMessageContext;
  commandResultSummary: string;
  privacyMode: PrivacyMode;
  existingProfileSummary: string;
}) {
  return options.gemini.generateStructured({
    feature: "profile",
    contents: JSON.stringify({
      sender: options.context.senderDisplayName,
      isGroup: options.context.isGroup,
      rawText: options.context.rawText,
      commandResultSummary: options.commandResultSummary,
      privacyMode: options.privacyMode,
      existingProfileSummary: options.existingProfileSummary
    }),
    systemInstruction:
      "Extract only stable professional preferences and explicit memory candidates. Do not store private transcripts or RPG content.",
    schema: profileExtractionResultSchema
  });
}
