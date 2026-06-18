import { describe, expect, it } from "vitest";
import { createCommandRegistry } from "../../src/router/command.registry.js";
import { CommandRouter } from "../../src/router/command.router.js";
import type { Command, IncomingMessageContext } from "../../src/router/command.types.js";
import { InMemoryRateLimiter } from "../../src/router/rateLimits.js";

function createContext(overrides: Partial<IncomingMessageContext> = {}): IncomingMessageContext {
  return {
    messageId: "msg-1",
    chatJid: "chat@s.whatsapp.net",
    senderJid: "user@s.whatsapp.net",
    senderDisplayName: "User",
    isGroup: false,
    isOwner: false,
    rawText: "!ping",
    commandText: "!ping",
    args: [],
    hasMedia: false,
    timestamp: new Date("2026-06-17T00:00:00.000Z"),
    ...overrides
  };
}

function createRouter(extraCommands: Command[] = [], limit = 10): CommandRouter {
  return new CommandRouter({
    commands: createCommandRegistry(extraCommands),
    prefix: "!",
    rateLimiter: new InMemoryRateLimiter({
      "system.ping": { limit, windowMs: 60_000 },
      "system.help": { limit, windowMs: 60_000 },
      "test.group": { limit, windowMs: 60_000 },
      "test.private": { limit, windowMs: 60_000 },
      "test.admin": { limit, windowMs: 60_000 },
      "test.owner": { limit, windowMs: 60_000 }
    })
  });
}

describe("CommandRouter", () => {
  it("dispatches !ping", async () => {
    const router = createRouter();
    const result = await router.route(createContext());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.reply).toBe("pong");
    }
  });

  it("dispatches !help", async () => {
    const router = createRouter();
    const result = await router.route(createContext({ rawText: "!help", commandText: "!help" }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.reply).toContain("system:");
      expect(result.result.reply).toContain("!ping");
      expect(result.result.reply).toContain("!help");
    }
  });

  it("rejects unknown commands", async () => {
    const router = createRouter();
    const result = await router.route(
      createContext({ rawText: "!missing", commandText: "!missing" })
    );

    expect(result).toEqual({
      ok: false,
      status: "unknown_command",
      reason: "Unknown command: missing"
    });
  });

  it("resolves aliases", async () => {
    const router = createRouter();
    const result = await router.route(
      createContext({ rawText: "!commands", commandText: "!commands" })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.name).toBe("help");
    }
  });

  it("enforces group-only commands", async () => {
    const router = createRouter([
      {
        name: "group",
        aliases: [],
        mode: "system",
        description: "group only",
        groupOnly: true,
        rateLimitKey: "test.group",
        handler: () => ({ ok: true, reply: "ok" })
      }
    ]);

    const result = await router.route(
      createContext({ rawText: "!group", commandText: "!group", isGroup: false })
    );

    expect(result.status).toBe("group_only");
  });

  it("enforces private-only commands", async () => {
    const router = createRouter([
      {
        name: "private",
        aliases: [],
        mode: "system",
        description: "private only",
        privateOnly: true,
        rateLimitKey: "test.private",
        handler: () => ({ ok: true, reply: "ok" })
      }
    ]);

    const result = await router.route(
      createContext({ rawText: "!private", commandText: "!private", isGroup: true })
    );

    expect(result.status).toBe("private_only");
  });

  it("enforces admin-only commands", async () => {
    const router = createRouter([
      {
        name: "admin",
        aliases: [],
        mode: "system",
        description: "admin only",
        adminOnly: true,
        groupOnly: true,
        rateLimitKey: "test.admin",
        handler: () => ({ ok: true, reply: "ok" })
      }
    ]);

    const result = await router.route(
      createContext({ rawText: "!admin", commandText: "!admin", isGroup: true, isSenderAdmin: false })
    );

    expect(result.status).toBe("admin_only");
  });

  it("enforces owner-only commands", async () => {
    const router = createRouter([
      {
        name: "owner",
        aliases: [],
        mode: "system",
        description: "owner only",
        ownerOnly: true,
        rateLimitKey: "test.owner",
        handler: () => ({ ok: true, reply: "ok" })
      }
    ]);

    const result = await router.route(
      createContext({ rawText: "!owner", commandText: "!owner", isOwner: false })
    );

    expect(result.status).toBe("owner_only");
  });

  it("rejects rate-limited commands", async () => {
    const router = createRouter([], 1);
    const context = createContext();

    const first = await router.route(context);
    const second = await router.route(
      createContext({
        timestamp: new Date("2026-06-17T00:00:01.000Z")
      })
    );

    expect(first.ok).toBe(true);
    expect(second).toEqual({
      ok: false,
      status: "rate_limited",
      reason: "Rate limit exceeded for system.ping."
    });
  });
});
