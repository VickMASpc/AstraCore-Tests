import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it, vi } from "vitest";
import { createRpgCommands } from "../../src/commands/rpg.commands.js";
import { createSqliteConnection, initializeDatabaseSchema } from "../../src/db/client.js";
import { createRpgRepository } from "../../src/db/repositories/rpg.repo.js";
import { schema } from "../../src/db/schema.js";
import { GeminiService } from "../../src/gemini/gemini.client.js";
import { createLogger } from "../../src/observability/logger.js";
import { createCommandRegistry } from "../../src/router/command.registry.js";
import { CommandRouter } from "../../src/router/command.router.js";
import type { IncomingMessageContext } from "../../src/router/command.types.js";
import { InMemoryRateLimiter } from "../../src/router/rateLimits.js";
import { RpgService } from "../../src/rpg/rpg.service.js";

function createContext(overrides: Partial<IncomingMessageContext> = {}): IncomingMessageContext {
  return {
    messageId: "m1",
    chatJid: "user@s.whatsapp.net",
    senderJid: "user@s.whatsapp.net",
    senderDisplayName: "Jogador",
    isGroup: false,
    isOwner: false,
    rawText: "",
    commandText: "",
    args: [],
    hasMedia: false,
    timestamp: new Date("2026-06-17T00:00:00.000Z"),
    ...overrides
  };
}

function setup(randomValues: number[] = [0.5]) {
  const sqlite = createSqliteConnection(":memory:");
  initializeDatabaseSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  const rpgRepo = createRpgRepository(db);
  const randomQueue = [...randomValues];
  const random = () => randomQueue.shift() ?? 0.5;
  const generateContent = vi.fn(async () => ({
    text: "Uma névoa fria cobre o cenário enquanto a tensão cresce.",
    candidates: [{ finishReason: "STOP" }] as unknown[],
    usageMetadata: { promptTokenCount: 1, candidateTokenCount: 1, totalTokenCount: 2 }
  }));
  const gemini = new GeminiService({
    env: {
      NODE_ENV: "test",
      BOT_NAME: "AstraCore",
      BOT_PREFIX: "!",
      OWNER_NUMBERS: [],
      DATABASE_URL: "file:test",
      DATABASE_DIALECT: "sqlite",
      WHATSAPP_AUTH_DIR: "",
      WHATSAPP_PAIRING_NUMBER: "",
      WHATSAPP_PRINT_QR: false,
      PUBLIC_STATUS_SERVER: false,
      PORT: 3000,
      GEMINI_API_KEY: "key",
      GEMINI_API_VERSION: "v1beta",
      GEMINI_AI_MODEL: "gemini-3.5-flash",
      GEMINI_FAST_MODEL: "gemini-3.1-flash-lite",
      GEMINI_RPG_MODEL: "gemini-3.1-flash-lite",
      ENABLE_GOOGLE_SEARCH: true,
      ENABLE_CODE_EXECUTION: true,
      ENABLE_PUBLIC_REPO_ANALYSIS: true,
      ENABLE_STRUCTURED_OUTPUT: true,
      AI_MAX_CONTEXT_MESSAGES: 30,
      AI_MAX_GROUP_CONTEXT_MESSAGES: 20,
      AI_MAX_RESPONSE_CHARS: 12000,
      AI_REPLY_CHUNK_SIZE: 3500,
      RESEARCH_RATE_LIMIT_PER_USER_PER_HOUR: 10,
      DEEP_RESEARCH_RATE_LIMIT_PER_USER_PER_DAY: 5,
      REPO_ANALYSIS_RATE_LIMIT_PER_USER_PER_DAY: 10,
      GENERAL_AI_RATE_LIMIT_PER_USER_PER_HOUR: 60,
      RPG_RATE_LIMIT_PER_USER_PER_MINUTE: 20,
      MAX_USER_MEMORY_ITEMS: 1000,
      MAX_GROUP_MEMORY_ITEMS: 2000,
      MAX_USER_PROFILE_FACTS: 500,
      MAX_GROUP_PROFILE_FACTS: 800,
      MEMORY_REVIEW_INTERVAL_DAYS: 30,
      LOG_LEVEL: "info"
    },
    logger: createLogger("silent"),
    client: { models: { generateContent } }
  });
  const rpgService = new RpgService(rpgRepo, "!", gemini, random);
  const router = new CommandRouter({
    commands: createCommandRegistry(createRpgCommands(rpgService)),
    prefix: "!",
    rateLimiter: new InMemoryRateLimiter({})
  });

  return { db, rpgRepo, router, generateContent };
}

async function createCharacter(
  router: CommandRouter,
  overrides: Partial<IncomingMessageContext> = {},
  className = "combatente",
  name = "Arthur"
) {
  return router.route(
    createContext({
      ...overrides,
      commandText: `!criarchar ${className} ${name}`.trim(),
      rawText: `!criarchar ${className} ${name}`.trim()
    })
  );
}

async function createSession(
  router: CommandRouter,
  overrides: Partial<IncomingMessageContext> = {},
  theme = ""
) {
  const suffix = theme ? ` ${theme}` : "";
  return router.route(
    createContext({
      isGroup: true,
      groupJid: "grupo@g.us",
      chatJid: "grupo@g.us",
      ...overrides,
      commandText: `!criarsessao${suffix}`,
      rawText: `!criarsessao${suffix}`
    })
  );
}

describe("rpg commands", () => {
  it("renders help with dynamic prefix", async () => {
    const { router } = setup();
    const result = await router.route(createContext({ commandText: "!rpg", rawText: "!rpg" }));

    expect(result.ok && result.result.reply).toContain("BLACK LOTUS: SESSÕES RPG");
    expect(result.ok && result.result.reply).toContain("!criarchar [classe] [nome]");
  });

  it("creates all classes with exact stats and fallback name", async () => {
    const { rpgRepo, router } = setup();
    const cases = [
      ["combatente", { hp: 20, san: 12, pe: 2 }],
      ["especialista", { hp: 16, san: 16, pe: 3 }],
      ["ocultista", { hp: 12, san: 20, pe: 4 }],
      ["mago", { hp: 10, san: 18, pe: 5 }]
    ] as const;

    for (const [index, [className, expected]] of cases.entries()) {
      const userId = `user${index}@s.whatsapp.net`;
      const result = await router.route(
        createContext({
          senderJid: userId,
          chatJid: userId,
          senderDisplayName: `Jogador ${index}`,
          commandText: `!criarchar ${className}`,
          rawText: `!criarchar ${className}`
        })
      );

      expect(result.ok && result.result.reply).toContain(`Ficha de Jogador ${index} criada`);
      const character = await rpgRepo.findCharacterByUserId(userId);
      const stats = JSON.parse(character?.statsJson ?? "{}");
      expect(stats.hp).toBe(expected.hp);
      expect(stats.hp_max).toBe(expected.hp);
      expect(stats.san).toBe(expected.san);
      expect(stats.san_max).toBe(expected.san);
      expect(stats.pe).toBe(expected.pe);
      expect(stats.pe_max).toBe(expected.pe);
    }
  });

  it("rejects duplicate and invalid classes, shows exact display, and delete works", async () => {
    const { router, rpgRepo } = setup();
    await createCharacter(router);

    const duplicate = await createCharacter(router);
    expect(duplicate.ok && duplicate.result.reply).toBe("❌ Você já possui uma ficha.");

    const invalid = await router.route(
      createContext({
        senderJid: "other@s.whatsapp.net",
        chatJid: "other@s.whatsapp.net",
        commandText: "!criarchar guerreiro Teste",
        rawText: "!criarchar guerreiro Teste"
      })
    );
    expect(invalid.ok && invalid.result.reply).toBe(
      "❌ Escolha: combatente, especialista, ocultista ou mago."
    );

    const show = await router.route(createContext({ commandText: "!meuchar", rawText: "!meuchar" }));
    expect(show.ok && show.result.reply).toBe(
      "✅ *ARTHUR* (Combatente ⚔️)\n⭐ NEX: 5% | PV: 20/20\n🧠 SAN: 12/12\n⚡ PE: 2/2"
    );

    const deleted = await router.route(
      createContext({ commandText: "!deletarchar", rawText: "!deletarchar" })
    );
    expect(deleted.ok && deleted.result.reply).toBe("🗑️ Ficha apagada.");
    expect(await rpgRepo.findCharacterByUserId("user@s.whatsapp.net")).toBeUndefined();
  });

  it("session flow works and narration uses only the RPG model without tools", async () => {
    const { router, rpgRepo, generateContent, db } = setup();
    const privateResult = await router.route(
      createContext({ commandText: "!criarsessao", rawText: "!criarsessao" })
    );
    expect(privateResult.ok && privateResult.result.reply).toBe("❌ Apenas em grupos!");

    await createCharacter(router, {}, "ocultista", "Dante");
    const created = await createSession(router);
    expect(created.ok && created.result.reply).toContain("SESSÃO INICIADA: INVESTIGAÇÃO PARANORMAL");

    const session = await rpgRepo.findActiveSessionByGroupId("grupo@g.us");
    expect(session?.masterUserId).toBe("user@s.whatsapp.net");
    const character = await rpgRepo.findCharacterByUserId("user@s.whatsapp.net");
    const player = await rpgRepo.findSessionPlayer(session?.id ?? "", character?.id ?? "");
    expect(player).toBeTruthy();

    const duplicateSession = await createSession(router, {}, "tema");
    expect(duplicateSession.ok && duplicateSession.result.reply).toBe(
      "❌ Já existe uma sessão ativa neste grupo!"
    );

    const noCharacter = await router.route(
      createContext({
        senderJid: "semficha@s.whatsapp.net",
        chatJid: "grupo@g.us",
        isGroup: true,
        groupJid: "grupo@g.us",
        senderDisplayName: "Sem Ficha",
        commandText: "!entrar",
        rawText: "!entrar"
      })
    );
    expect(noCharacter.ok && noCharacter.result.reply).toBe("❌ Crie sua ficha primeiro com !criarchar");

    await createCharacter(
      router,
      {
        senderJid: "player@s.whatsapp.net",
        chatJid: "player@s.whatsapp.net",
        senderDisplayName: "Player"
      },
      "especialista",
      "Vera"
    );
    const joined = await router.route(
      createContext({
        senderJid: "player@s.whatsapp.net",
        chatJid: "grupo@g.us",
        isGroup: true,
        groupJid: "grupo@g.us",
        senderDisplayName: "Player",
        commandText: "!entrar",
        rawText: "!entrar"
      })
    );
    expect(joined.ok && joined.result.reply).toBe("✅ *Vera* entrou na sessão!");

    const duplicateJoin = await router.route(
      createContext({
        senderJid: "player@s.whatsapp.net",
        chatJid: "grupo@g.us",
        isGroup: true,
        groupJid: "grupo@g.us",
        senderDisplayName: "Player",
        commandText: "!entrar",
        rawText: "!entrar"
      })
    );
    expect(duplicateJoin.ok && duplicateJoin.result.reply).toBe("❌ Você já está na sessão.");

    const narrate = await router.route(
      createContext({
        senderJid: "player@s.whatsapp.net",
        chatJid: "grupo@g.us",
        isGroup: true,
        groupJid: "grupo@g.us",
        senderDisplayName: "Player",
        commandText: "!narrar Eu examino a porta antiga.",
        rawText: "!narrar Eu examino a porta antiga."
      })
    );
    expect(narrate.ok && narrate.result.reply).toContain("*HISTÓRIA:*");
    const geminiCalls = generateContent.mock.calls as unknown as Array<unknown[]>;
    expect(
      geminiCalls.some((call) => (call[0] as { model?: string }).model === "gemini-3.1-flash-lite")
    ).toBe(true);
    expect(
      geminiCalls.every((call) => (call[0] as { config?: { tools?: unknown } }).config?.tools === undefined)
    ).toBe(true);

    const history = await rpgRepo.listHistory(session?.id ?? "");
    expect(history).toHaveLength(1);
    expect(history[0]?.entry).toContain("Ação: Eu examino a porta antiga.");

    const notMaster = await router.route(
      createContext({
        senderJid: "player@s.whatsapp.net",
        chatJid: "grupo@g.us",
        isGroup: true,
        groupJid: "grupo@g.us",
        senderDisplayName: "Player",
        commandText: "!fecharsessao",
        rawText: "!fecharsessao"
      })
    );
    expect(notMaster.ok && notMaster.result.reply).toBe("❌ Apenas o mestre pode fechar a sessão.");

    const closed = await router.route(
      createContext({
        chatJid: "grupo@g.us",
        isGroup: true,
        groupJid: "grupo@g.us",
        commandText: "!fecharsessao",
        rawText: "!fecharsessao"
      })
    );
    expect(closed.ok && closed.result.reply).toBe("✅ *Sessão finalizada.* Até a próxima aventura!");
    expect(await rpgRepo.findActiveSessionByGroupId("grupo@g.us")).toBeUndefined();
    expect(await db.query.memoryFacts.findMany()).toHaveLength(0);
  });

  it("battle requires session, stores monster state, uses RPG model only, and attacks update HP with victory cleanup", async () => {
    const { router, rpgRepo, generateContent, db } = setup([
      0,
      0.4,
      0.9,
      0.9,
      0.9,
      0.9,
      0.9,
      0.9,
      0.9,
      0.9,
      0.9,
      0.9,
      0.9
    ]);

    const noSessionBattle = await router.route(
      createContext({
        isGroup: true,
        groupJid: "grupo@g.us",
        chatJid: "grupo@g.us",
        commandText: "!batalha",
        rawText: "!batalha"
      })
    );
    expect(noSessionBattle.ok && noSessionBattle.result.reply).toBe("❌ Nenhuma sessão ativa.");

    await createCharacter(router, {}, "combatente", "Arthur");
    await createSession(router);

    const started = await router.route(
      createContext({
        isGroup: true,
        groupJid: "grupo@g.us",
        chatJid: "grupo@g.us",
        commandText: "!batalha",
        rawText: "!batalha"
      })
    );
    expect(started.ok && started.result.reply).toContain("❤️ HP Inimigo: 100");

    const session = await rpgRepo.findActiveSessionByGroupId("grupo@g.us");
    expect(session?.activeMonsterId).toBeTruthy();
    const monster = await rpgRepo.findMonsterById(session?.activeMonsterId ?? "");
    const monsterState = JSON.parse(monster?.statsJson ?? "{}");
    expect(monsterState.nome).toContain("Zumbi de Sangue");
    expect(monsterState.hp_atual).toBe(100);

    const geminiCalls = generateContent.mock.calls as unknown as Array<unknown[]>;
    expect(
      geminiCalls.some((call) => (call[0] as { model?: string }).model === "gemini-3.1-flash-lite")
    ).toBe(true);
    expect(
      geminiCalls.every((call) => (call[0] as { config?: { tools?: unknown } }).config?.tools === undefined)
    ).toBe(true);

    const noCombat = await router.route(
      createContext({
        senderJid: "other@s.whatsapp.net",
        chatJid: "other@s.whatsapp.net",
        commandText: "!atacar",
        rawText: "!atacar"
      })
    );
    expect(noCombat.ok && noCombat.result.reply).toBe("❌ Nenhuma sessão ativa.");

    const notInSession = await router.route(
      createContext({
        senderJid: "outsider@s.whatsapp.net",
        chatJid: "grupo@g.us",
        isGroup: true,
        groupJid: "grupo@g.us",
        senderDisplayName: "Outsider",
        commandText: "!atacar",
        rawText: "!atacar"
      })
    );
    expect(notInSession.ok && notInSession.result.reply).toBe("❌ Crie sua ficha primeiro com !criarchar");

    const firstAttack = await router.route(
      createContext({
        isGroup: true,
        groupJid: "grupo@g.us",
        chatJid: "grupo@g.us",
        commandText: "!atacar",
        rawText: "!atacar"
      })
    );
    expect(firstAttack.ok && firstAttack.result.reply).toContain("causou *8* de dano");
    expect(firstAttack.ok && firstAttack.result.reply).toContain("❤️ HP restante: 92");

    let lastReply = "";
    let sawVictory = false;
    for (let index = 0; index < 20; index += 1) {
      const attack = await router.route(
        createContext({
          isGroup: true,
          groupJid: "grupo@g.us",
          chatJid: "grupo@g.us",
          commandText: "!atacar",
          rawText: "!atacar"
        })
      );

      if (!attack.ok) {
        continue;
      }

      lastReply = attack.result.reply;
      if (lastReply.includes("*VITÓRIA!*")) {
        sawVictory = true;
        break;
      }
    }

    expect(sawVictory).toBe(true);
    expect(lastReply).toContain("*VITÓRIA!*");
    expect((await rpgRepo.findActiveSessionByGroupId("grupo@g.us"))?.activeMonsterId).toBeNull();
    expect(await db.query.memoryFacts.findMany()).toHaveLength(0);
  });

  it("mini-games cover all branches and never call Gemini", async () => {
    const { router, rpgRepo, generateContent, db } = setup([0, 0.2, 0.7, 0.2, 0.8, 0.1, 0.9]);

    const privateRoulette = await router.route(
      createContext({ commandText: "!roletarussa", rawText: "!roletarussa" })
    );
    expect(privateRoulette.ok && privateRoulette.result.reply).toBe("❌ Apenas em grupos!");

    await createCharacter(router, {}, "combatente", "Arthur");
    const character = await rpgRepo.findCharacterByUserId("user@s.whatsapp.net");
    const sheet = JSON.parse(character?.statsJson ?? "{}");
    sheet.xp = 200;
    sheet.ouro = 50;
    await rpgRepo.updateCharacterStats(character?.id ?? "", JSON.stringify(sheet));

    const death = await router.route(
      createContext({
        isGroup: true,
        groupJid: "grupo@g.us",
        chatJid: "grupo@g.us",
        commandText: "!roletarussa",
        rawText: "!roletarussa"
      })
    );
    expect(death.ok && death.result.reply).toContain("Você perdeu 10 de XP");

    const survive = await router.route(
      createContext({
        isGroup: true,
        groupJid: "grupo@g.us",
        chatJid: "grupo@g.us",
        commandText: "!roletarussa",
        rawText: "!roletarussa"
      })
    );
    expect(survive.ok && survive.result.reply).toContain("Você sobreviveu!");

    const noCharacterBet = await router.route(
      createContext({
        senderJid: "semficha@s.whatsapp.net",
        chatJid: "semficha@s.whatsapp.net",
        commandText: "!apostar 10",
        rawText: "!apostar 10"
      })
    );
    expect(noCharacterBet.ok && noCharacterBet.result.reply).toBe(
      "❌ Você precisa de um personagem no RPG para apostar!"
    );

    const invalidBet = await router.route(
      createContext({ commandText: "!apostar abc", rawText: "!apostar abc" })
    );
    expect(invalidBet.ok && invalidBet.result.reply).toBe("Use: !apostar [quantia]");

    const insufficientGold = await router.route(
      createContext({ commandText: "!apostar 999", rawText: "!apostar 999" })
    );
    expect(insufficientGold.ok && insufficientGold.result.reply).toBe("❌ Você não tem ouro suficiente!");

    const winBet = await router.route(
      createContext({ commandText: "!apostar 10", rawText: "!apostar 10" })
    );
    expect(winBet.ok && winBet.result.reply).toBe(
      "🎰 *GANHOU!* Você apostou 10 e recebeu 20 moedas!"
    );

    const loseBet = await router.route(
      createContext({ commandText: "!apostar 10", rawText: "!apostar 10" })
    );
    expect(loseBet.ok && loseBet.result.reply).toBe(
      "💸 *PERDEU!* A casa sempre vence.\nVocê perdeu 10 moedas."
    );

    const invalidCoin = await router.route(
      createContext({ commandText: "!caraoucoroa", rawText: "!caraoucoroa" })
    );
    expect(invalidCoin.ok && invalidCoin.result.reply).toBe("Use: !caraoucoroa [cara/coroa]");

    const winCoin = await router.route(
      createContext({ commandText: "!caraoucoroa cara", rawText: "!caraoucoroa cara" })
    );
    expect(winCoin.ok && winCoin.result.reply).toBe("🪙 O resultado foi *CARA*! Você venceu!");

    const loseCoin = await router.route(
      createContext({ commandText: "!caraoucoroa cara", rawText: "!caraoucoroa cara" })
    );
    expect(loseCoin.ok && loseCoin.result.reply).toBe("🪙 O resultado foi *COROA*! Você perdeu.");

    expect(generateContent.mock.calls.length).toBe(0);
    expect(await db.query.memoryFacts.findMany()).toHaveLength(0);
  });
});
