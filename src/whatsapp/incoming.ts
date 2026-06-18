import type { CommandRouter } from "../router/command.router.js";
import type { SafeLogger } from "../observability/logger.js";
import { GroupMetadataCache } from "./groupMetadata.js";
import { normalizeIncomingMessage } from "./normalize.js";
import { sendTextChunks } from "./send.js";
import type { BaileysSocketLike } from "./types.js";

export class MessageDeduplicator {
  private readonly maxEntries: number;
  private readonly seen = new Set<string>();
  private readonly order: string[] = [];

  public constructor(maxEntries = 1_000) {
    this.maxEntries = maxEntries;
  }

  public shouldProcess(messageId: string): boolean {
    if (this.seen.has(messageId)) {
      return false;
    }

    this.seen.add(messageId);
    this.order.push(messageId);

    if (this.order.length > this.maxEntries) {
      const removed = this.order.shift();
      if (removed) {
        this.seen.delete(removed);
      }
    }

    return true;
  }
}

export function createIncomingMessageHandler(options: {
  socket: BaileysSocketLike;
  router: CommandRouter;
  logger: SafeLogger;
  owners: readonly string[];
  replyChunkSize: number;
  botJid?: string | undefined;
  groupMetadataCache?: GroupMetadataCache;
  deduplicator?: MessageDeduplicator;
}) {
  const deduplicator = options.deduplicator ?? new MessageDeduplicator();
  const metadataCache = options.groupMetadataCache ?? new GroupMetadataCache();

  return async function handleMessageUpsert(payload: {
    messages: Array<Parameters<typeof normalizeIncomingMessage>[0]>;
  }): Promise<void> {
    for (const message of payload.messages) {
      const messageId = message.key?.id;

      if (!messageId || !deduplicator.shouldProcess(messageId)) {
        continue;
      }

      const chatJid = message.key?.remoteJid;
      const isGroup = Boolean(chatJid?.endsWith("@g.us"));
      const metadata =
        isGroup && chatJid ? await metadataCache.get(options.socket, chatJid) : undefined;

      const context = normalizeIncomingMessage(message, {
        owners: options.owners,
        botJid: options.botJid,
        groupMetadata: metadata
      });

      if (!context) {
        continue;
      }

      const result = await options.router.route(context);

      if (result.ok) {
        await sendTextChunks(
          options.socket,
          context.chatJid,
          result.result.reply,
          options.replyChunkSize
        );
      } else if (result.status !== "ignored" && result.status !== "unknown_command") {
        options.logger.safeWarn(
          {
            messageId: context.messageId,
            status: result.status
          },
          "Command rejected"
        );
      }
    }
  };
}
