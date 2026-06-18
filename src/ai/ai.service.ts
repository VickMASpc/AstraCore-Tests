import type { GeminiService } from "../gemini/gemini.client.js";
import type { IncomingMessageContext } from "../router/command.types.js";
import { createId } from "../utils/ids.js";

type AiRepository = ReturnType<typeof import("../db/repositories/ai.repo.js").createAiRepository>;
type ProfilesRepository = ReturnType<typeof import("../db/repositories/profiles.repo.js").createProfilesRepository>;

export class ProfessionalAiService {
  public constructor(
    private readonly repo: AiRepository,
    private readonly profilesRepo: ProfilesRepository,
    private readonly gemini: GeminiService
  ) {}

  public async answer(context: IncomingMessageContext, prompt: string, mode: string) {
    const scope = context.isGroup ? "group" : "private";
    const conversation = await this.ensureConversation(context, scope);
    const history = await this.repo.listMessages(conversation.id, 8);
    const reversedHistory = [...history].reverse();
    const profileFacts = await this.getAllowedProfileFacts(context);

    await this.repo.createMessage({
      id: createId("aimsg"),
      conversationId: conversation.id,
      role: "user",
      content: prompt
    });

    const response = await this.gemini.generateText({
      feature: "ai",
      contents: [
        `mode: ${mode}`,
        `question: ${prompt}`,
        profileFacts.length > 0 ? `profile facts:\n${profileFacts.join("\n")}` : "profile facts: none",
        reversedHistory.length > 0
          ? `history:\n${reversedHistory.map((item) => `${item.role}: ${item.content}`).join("\n")}`
          : "history: none"
      ].join("\n\n"),
      systemInstruction:
        "You are AstraCore Professional AI, a serious research, engineering, and decision-support assistant inside WhatsApp. Keep RPG content out. Do static analysis only for code."
    });

    await this.repo.createMessage({
      id: createId("aimsg"),
      conversationId: conversation.id,
      role: "model",
      content: response.text
    });

    return response.text;
  }

  public async resetContext(context: IncomingMessageContext) {
    const scope = context.isGroup ? "group" : "private";
    const conversation = await this.ensureConversation(context, scope);
    await this.repo.clearConversationMessages(conversation.id);
    return "AI context reset.";
  }

  private async ensureConversation(context: IncomingMessageContext, scope: "private" | "group") {
    await this.profilesRepo.upsertUserProfile({ id: context.senderJid, userId: context.senderJid });
    if (scope === "group" && context.groupJid) {
      await this.profilesRepo.upsertGroupProfile({ id: context.groupJid, groupId: context.groupJid });
    }

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
      throw new Error("Failed to create AI conversation.");
    }

    return created;
  }

  private async getAllowedProfileFacts(context: IncomingMessageContext) {
    const userFacts = await this.profilesRepo.listProfileFacts(context.senderJid);

    if (!context.isGroup || !context.groupJid) {
      return userFacts.map((fact) => fact.fact);
    }

    const groupFacts = await this.profilesRepo.listProfileFacts(context.groupJid);
    return groupFacts.map((fact) => fact.fact);
  }
}
