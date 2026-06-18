import { chunkWhatsAppText } from "../utils/chunking.js";
import type { BaileysSocketLike } from "./types.js";

export async function sendTextChunks(
  socket: BaileysSocketLike,
  jid: string,
  text: string,
  maxChars: number
): Promise<void> {
  const chunks = chunkWhatsAppText(text, maxChars);

  for (const chunk of chunks) {
    await socket.sendMessage(jid, { text: chunk });
  }
}
