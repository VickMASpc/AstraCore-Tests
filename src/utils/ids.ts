import { createHash, randomUUID } from "node:crypto";
import { normalizeCommandName } from "./text.js";

export function createId(prefix?: string): string {
  const id = randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function hashJid(jid: string): string {
  return createHash("sha256").update(jid).digest("hex");
}

export function stableId(prefix: string, raw: string): string {
  const normalizedPrefix = normalizeCommandName(prefix).replace(/[^a-z0-9]+/g, "-");
  const digest = createHash("sha256").update(raw).digest("hex").slice(0, 16);

  return `${normalizedPrefix}-${digest}`;
}
