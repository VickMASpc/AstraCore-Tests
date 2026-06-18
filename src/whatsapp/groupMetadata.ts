import type { GroupMetadata } from "@whiskeysockets/baileys";
import type { BaileysSocketLike } from "./types.js";

type CacheEntry = {
  expiresAt: number;
  value: GroupMetadata;
};

export class GroupMetadataCache {
  private readonly ttlMs: number;
  private readonly entries = new Map<string, CacheEntry>();

  public constructor(ttlMs = 60_000) {
    this.ttlMs = ttlMs;
  }

  public async get(socket: BaileysSocketLike, groupJid: string): Promise<GroupMetadata> {
    const now = Date.now();
    const cached = this.entries.get(groupJid);

    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const metadata = await socket.groupMetadata(groupJid);
    this.entries.set(groupJid, {
      value: metadata,
      expiresAt: now + this.ttlMs
    });
    return metadata;
  }
}
