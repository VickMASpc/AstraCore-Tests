import type { IncomingMessageContext } from "../router/command.types.js";
import { createId } from "../utils/ids.js";
import type { StorageZone } from "./profile.types.js";

export function resolveMemoryOwner(context: IncomingMessageContext): {
  ownerId: string;
  scope: "user" | "group";
} {
  return { ownerId: context.senderJid, scope: "user" };
}

export function buildExplicitMemoryRecord(
  context: IncomingMessageContext,
  content: string,
  zone: StorageZone = "profile"
) {
  const owner = resolveMemoryOwner(context);

  return {
    id: createId("mem"),
    scope: owner.scope,
    ownerId: owner.ownerId,
    zone,
    content,
    source: context.isGroup ? "explicit_admin" : "explicit_user",
    confidence: 100,
    sensitivity: "low" as const
  };
}
