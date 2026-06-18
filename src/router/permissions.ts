import type { Command, IncomingMessageContext } from "./command.types.js";
import type { CommandRouteFailure } from "./command.types.js";

export function enforceCommandPermissions(
  command: Command,
  context: IncomingMessageContext
): CommandRouteFailure | null {
  if (command.groupOnly && !context.isGroup) {
    return {
      ok: false,
      status: "group_only",
      reason: "This command can only be used in groups."
    };
  }

  if (command.privateOnly && context.isGroup) {
    return {
      ok: false,
      status: "private_only",
      reason: "This command can only be used in private chats."
    };
  }

  if (command.adminOnly && !context.isSenderAdmin) {
    return {
      ok: false,
      status: "admin_only",
      reason: "This command requires group admin permissions."
    };
  }

  if (command.ownerOnly && !context.isOwner) {
    return {
      ok: false,
      status: "owner_only",
      reason: "This command is restricted to bot owners."
    };
  }

  return null;
}
