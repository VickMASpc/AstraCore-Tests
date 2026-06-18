import type { IncomingMessageContext } from "../router/command.types.js";
import type { GeminiService } from "../gemini/gemini.client.js";
import { createId } from "../utils/ids.js";
import { extractCandidateProfileFacts } from "./profile.extractor.js";
import { buildExplicitMemoryRecord } from "./profile.memory.js";
import { isFactAllowedByPrivacy } from "./profile.policy.js";
import { formatMemoryList, formatPrivacyMode, formatProfileView } from "./profile.presenter.js";
import type { CandidateProfileFact, PrivacyMode, ProfileOwnerType } from "./profile.types.js";

type ProfilesRepository = ReturnType<typeof import("../db/repositories/profiles.repo.js").createProfilesRepository>;

function ownerProfileId(ownerType: ProfileOwnerType, context: IncomingMessageContext): string {
  if (ownerType === "user") {
    return context.senderJid;
  }

  if (ownerType === "group") {
    return context.groupJid ?? context.chatJid;
  }

  return `${context.senderJid}:${context.groupJid ?? context.chatJid}`;
}

export class ProfileService {
  public constructor(
    private readonly repo: ProfilesRepository,
    private readonly gemini?: GeminiService
  ) {}

  public async ensureProfiles(context: IncomingMessageContext): Promise<void> {
    await this.repo.upsertUserProfile({ id: context.senderJid, userId: context.senderJid });
    if (context.groupJid) {
      await this.repo.upsertGroupProfile({ id: context.groupJid, groupId: context.groupJid });
      await this.repo.upsertUserInGroupProfile({
        id: `${context.senderJid}:${context.groupJid}`,
        userId: context.senderJid,
        groupId: context.groupJid
      });
    }
  }

  public async setPrivacyMode(context: IncomingMessageContext, mode: PrivacyMode) {
    const ownerId = context.senderJid;
    await this.repo.upsertPrivacySetting({
      id: `privacy:${ownerId}`,
      scope: "user",
      ownerId,
      mode,
      allowAiMemory: mode !== "minimal",
      allowRpgMemory: false
    });
    return formatPrivacyMode(mode);
  }

  public async getPrivacyMode(context: IncomingMessageContext) {
    const setting = await this.repo.findPrivacySetting("user", context.senderJid);
    return formatPrivacyMode((setting?.mode as PrivacyMode | undefined) ?? "normal");
  }

  public async addExplicitMemory(context: IncomingMessageContext, content: string) {
    const record = buildExplicitMemoryRecord(context, content);
    await this.repo.createMemoryFact(record);
    return `memory stored: ${record.id}`;
  }

  public async listOwnMemory(context: IncomingMessageContext) {
    const items = await this.repo.listMemoryFacts(context.senderJid);
    return formatMemoryList(items);
  }

  public async deleteOwnMemory(context: IncomingMessageContext, id: string) {
    await this.repo.deleteMemoryFact(id, context.senderJid);
    return `memory deleted: ${id}`;
  }

  public async clearOwnMemory(context: IncomingMessageContext) {
    await this.repo.clearMemoryFacts(context.senderJid);
    return "memory cleared";
  }

  public async viewProfile(context: IncomingMessageContext, scope: "me" | "group", full: boolean) {
    if (scope === "group") {
      if (!context.isGroup || !context.groupJid) {
        return "This command requires a group chat.";
      }
      if (full && !context.isSenderAdmin) {
        return "Only group admins can view the full group profile.";
      }
      const facts = await this.repo.listProfileFacts(context.groupJid);
      return formatProfileView("group profile", facts, full);
    }

    const facts = await this.repo.listProfileFacts(context.senderJid);
    return formatProfileView("your profile", facts, full);
  }

  public async resetProfile(context: IncomingMessageContext, scope: "me" | "group") {
    if (scope === "group") {
      if (!context.isGroup || !context.groupJid) {
        return "This command requires a group chat.";
      }
      if (!context.isSenderAdmin) {
        return "Only group admins can reset the group profile.";
      }
      const facts = await this.repo.listProfileFacts(context.groupJid);
      await Promise.all(facts.map((fact) => this.repo.deleteProfileFact(fact.id)));
      return "group profile reset";
    }

    const facts = await this.repo.listProfileFacts(context.senderJid);
    await Promise.all(facts.map((fact) => this.repo.deleteProfileFact(fact.id)));
    return "profile reset";
  }

  public async storeExtractedFacts(options: {
    context: IncomingMessageContext;
    commandResultSummary: string;
  }) {
    if (!this.gemini) {
      return;
    }

    try {
      const setting = await this.repo.findPrivacySetting("user", options.context.senderJid);
      const privacyMode = (setting?.mode as PrivacyMode | undefined) ?? "normal";
      const existingFacts = await this.repo.listProfileFacts(options.context.senderJid);
      const result = await extractCandidateProfileFacts({
        gemini: this.gemini,
        context: options.context,
        commandResultSummary: options.commandResultSummary,
        privacyMode,
        existingProfileSummary: existingFacts.map((fact) => fact.fact).join("; ")
      });

      for (const fact of result.facts) {
        const normalizedFact: CandidateProfileFact = {
          ...fact,
          expiresAt: fact.expiresAt
        };

        if (normalizedFact.zone === "ai" && options.context.commandName?.startsWith("rpg")) {
          continue;
        }
        const decision = isFactAllowedByPrivacy(privacyMode, normalizedFact);
        if (!decision.allowed) {
          continue;
        }
        await this.storeCandidateFact(options.context, normalizedFact);
      }
    } catch {
      return;
    }
  }

  private async storeCandidateFact(context: IncomingMessageContext, fact: CandidateProfileFact) {
    const profileId = ownerProfileId(fact.ownerType, context);
    if (fact.ownerType === "user") {
      await this.repo.upsertUserProfile({ id: profileId, userId: context.senderJid });
    } else if (fact.ownerType === "group" && context.groupJid) {
      await this.repo.upsertGroupProfile({ id: profileId, groupId: context.groupJid });
    } else if (fact.ownerType === "user_in_group" && context.groupJid) {
      await this.repo.upsertUserInGroupProfile({
        id: profileId,
        userId: context.senderJid,
        groupId: context.groupJid
      });
    } else {
      return;
    }

    await this.repo.createProfileFact({
      id: createId("pfact"),
      scope: fact.ownerType === "user_in_group" ? "user_group" : fact.ownerType,
      profileId,
      zone: fact.zone,
      fact: fact.fact,
      confidence: fact.confidence,
      source: fact.source,
      sensitivity: fact.sensitivity,
      reason: fact.reason,
      expiresAt: fact.expiresAt
    });
  }
}
