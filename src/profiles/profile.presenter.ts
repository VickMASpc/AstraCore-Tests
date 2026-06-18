import type { PrivacyMode } from "./profile.types.js";

export function formatPrivacyMode(mode: PrivacyMode): string {
  return `privacy: ${mode}`;
}

export function formatMemoryList(
  items: Array<{ id: string; content: string; zone: string; source: string; sensitivity: string }>
): string {
  if (items.length === 0) {
    return "No memory facts stored.";
  }

  return items.map((item) => `${item.id}: [${item.zone}] ${item.content}`).join("\n");
}

export function formatProfileView(title: string, facts: Array<{ fact: string; zone: string }>, full: boolean): string {
  if (facts.length === 0) {
    return `${title}\nNo facts stored.`;
  }

  const selected = full ? facts : facts.slice(0, 5);
  return `${title}\n${selected.map((fact) => `- [${fact.zone}] ${fact.fact}`).join("\n")}`;
}
