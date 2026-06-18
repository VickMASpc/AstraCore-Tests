import { mkdirSync } from "node:fs";

export async function loadWhatsAppAuthState(authDir: string) {
  mkdirSync(authDir, { recursive: true });
  const { useMultiFileAuthState } = await import("@whiskeysockets/baileys");
  return useMultiFileAuthState(authDir);
}
