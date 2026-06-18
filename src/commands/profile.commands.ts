import type { Command } from "../router/command.types.js";
import type { ProfileService } from "../profiles/profile.service.js";

export function createProfileCommands(profileService: ProfileService): Command[] {
  return [
    {
      name: "profile",
      aliases: [],
      mode: "profile",
      description: "Inspect or reset profile data.",
      rateLimitKey: "profile.profile",
      handler: async (context) => {
        await profileService.ensureProfiles(context);
        const target = context.args[0];
        const modifier = context.args[1];

        if (target === "reset" && modifier === "me") {
          return { ok: true, reply: await profileService.resetProfile(context, "me") };
        }

        if (target === "reset" && modifier === "group") {
          return { ok: true, reply: await profileService.resetProfile(context, "group") };
        }

        if (target === "me") {
          return {
            ok: true,
            reply: await profileService.viewProfile(context, "me", modifier === "full")
          };
        }

        if (target === "group") {
          return {
            ok: true,
            reply: await profileService.viewProfile(context, "group", modifier === "full")
          };
        }

        return { ok: true, reply: "usage: !profile me|group [full] or !profile reset me|group" };
      }
    },
    {
      name: "memory",
      aliases: [],
      mode: "profile",
      description: "Manage explicit memory facts.",
      rateLimitKey: "profile.memory",
      handler: async (context) => {
        await profileService.ensureProfiles(context);
        const action = context.args[0];
        const body = context.rawArgs?.replace(/^\S+\s*/, "") ?? "";

        if (action === "add" && body.trim().length > 0) {
          return { ok: true, reply: await profileService.addExplicitMemory(context, body.trim()) };
        }

        if (action === "list") {
          return { ok: true, reply: await profileService.listOwnMemory(context) };
        }

        if (action === "delete" && context.args[1]) {
          return { ok: true, reply: await profileService.deleteOwnMemory(context, context.args[1]) };
        }

        if (action === "clear") {
          return { ok: true, reply: await profileService.clearOwnMemory(context) };
        }

        return { ok: true, reply: "usage: !memory add|list|delete|clear" };
      }
    },
    {
      name: "privacy",
      aliases: [],
      mode: "profile",
      description: "View or update privacy mode.",
      rateLimitKey: "profile.privacy",
      handler: async (context) => {
        await profileService.ensureProfiles(context);
        const mode = context.args[0];
        if (mode === "minimal" || mode === "normal" || mode === "rich") {
          return { ok: true, reply: await profileService.setPrivacyMode(context, mode) };
        }

        return { ok: true, reply: await profileService.getPrivacyMode(context) };
      }
    }
  ];
}
