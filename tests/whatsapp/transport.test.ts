import { describe, expect, it, vi } from "vitest";
import { createCommandRegistry } from "../../src/router/command.registry.js";
import { CommandRouter } from "../../src/router/command.router.js";
import { InMemoryRateLimiter } from "../../src/router/rateLimits.js";
import { createLogger } from "../../src/observability/logger.js";
import { createIncomingMessageHandler, MessageDeduplicator } from "../../src/whatsapp/incoming.js";
import { normalizeIncomingMessage } from "../../src/whatsapp/normalize.js";
import { sendTextChunks } from "../../src/whatsapp/send.js";
import type { BaileysSocketLike } from "../../src/whatsapp/types.js";

function createRouter() {
  return new CommandRouter({
    commands: createCommandRegistry(),
    prefix: "!",
    rateLimiter: new InMemoryRateLimiter({
      "system.ping": { limit: 20, windowMs: 60_000 },
      "system.help": { limit: 20, windowMs: 60_000 }
    })
  });
}

function createSocket(): BaileysSocketLike {
  return {
    ev: { on: vi.fn() },
    user: { id: "bot@s.whatsapp.net" },
    sendMessage: vi.fn(async () => undefined),
    groupMetadata: vi.fn(async () => ({
      id: "123@g.us",
      owner: "owner@s.whatsapp.net",
      subject: "Group Name",
      participants: [
        { id: "5511999999999@s.whatsapp.net", admin: "admin" as const },
        { id: "bot@s.whatsapp.net", admin: "admin" as const }
      ]
    }))
  };
}

describe("whatsapp normalization", () => {
  it("normalizes a private text message", () => {
    const context = normalizeIncomingMessage(
      {
        key: { id: "msg_1", remoteJid: "5511000000000@s.whatsapp.net" },
        message: { conversation: "!ping" },
        messageTimestamp: 1,
        pushName: "Victor"
      } as never,
      { owners: ["5511999999999"], botJid: undefined, groupMetadata: undefined }
    );

    expect(context?.isGroup).toBe(false);
    expect(context?.senderDisplayName).toBe("Victor");
    expect(context?.commandText).toBe("!ping");
  });

  it("normalizes a group text message", () => {
    const context = normalizeIncomingMessage(
      {
        key: {
          id: "msg_2",
          remoteJid: "123@g.us",
          participant: "5511999999999@s.whatsapp.net"
        },
        message: { conversation: "!help" },
        messageTimestamp: 1
      } as never,
      {
        owners: ["5511999999999"],
        botJid: "bot@s.whatsapp.net",
        groupMetadata: {
          id: "123@g.us",
          owner: "owner@s.whatsapp.net",
          subject: "Group Name",
          participants: [
            { id: "5511999999999@s.whatsapp.net", admin: "admin" as const },
            { id: "bot@s.whatsapp.net", admin: "admin" as const }
          ]
        } as never
      }
    );

    expect(context?.isGroup).toBe(true);
    expect(context?.groupName).toBe("Group Name");
    expect(context?.isSenderAdmin).toBe(true);
    expect(context?.isBotAdmin).toBe(true);
  });

  it("extracts quoted text", () => {
    const context = normalizeIncomingMessage(
      {
        key: { id: "msg_3", remoteJid: "5511000000000@s.whatsapp.net" },
        message: {
          extendedTextMessage: {
            text: "!ping",
            contextInfo: {
              quotedMessage: {
                conversation: "quoted body"
              }
            }
          }
        },
        messageTimestamp: 1
      } as never,
      { owners: [], botJid: undefined, groupMetadata: undefined }
    );

    expect(context?.quotedText).toBe("quoted body");
  });

  it("extracts the media flag", () => {
    const context = normalizeIncomingMessage(
      {
        key: { id: "msg_4", remoteJid: "5511000000000@s.whatsapp.net" },
        message: {
          extendedTextMessage: { text: "!ping" },
          imageMessage: { mimetype: "image/png" }
        },
        messageTimestamp: 1
      } as never,
      { owners: [], botJid: undefined, groupMetadata: undefined }
    );

    expect(context?.hasMedia).toBe(true);
  });
});

describe("whatsapp transport helpers", () => {
  it("suppresses duplicate messages", () => {
    const deduplicator = new MessageDeduplicator();

    expect(deduplicator.shouldProcess("msg_1")).toBe(true);
    expect(deduplicator.shouldProcess("msg_1")).toBe(false);
  });

  it("sends text in chunks", async () => {
    const socket = createSocket();
    await sendTextChunks(socket, "chat@s.whatsapp.net", "alpha beta gamma delta", 10);

    expect(socket.sendMessage).toHaveBeenCalledTimes(4);
  });

  it("integrates normalized messages with the router", async () => {
    const socket = createSocket();
    const handler = createIncomingMessageHandler({
      socket,
      router: createRouter(),
      logger: createLogger("silent"),
      owners: [],
      replyChunkSize: 100
    });

    await handler({
      messages: [
        {
          key: { id: "msg_5", remoteJid: "5511000000000@s.whatsapp.net" },
          message: { conversation: "!ping" },
          messageTimestamp: 1
        } as never
      ]
    });

    expect(socket.sendMessage).toHaveBeenCalledWith(
      "5511000000000@s.whatsapp.net",
      { text: "pong" }
    );
  });
});
