import type { GeminiService } from "../gemini/gemini.client.js";
import type { IncomingMessageContext } from "../router/command.types.js";
import { createId } from "../utils/ids.js";
import { DEFAULT_RPG_THEME, MONSTERS, RPG_CLASSES, RPG_HELP_TEXT } from "./rpg.constants.js";
import type { RpgCharacterSheet, RpgClassKey, RpgMonsterState } from "./rpg.types.js";

type RpgRepository = ReturnType<typeof import("../db/repositories/rpg.repo.js").createRpgRepository>;

const pendingSessionCreations = new Set<string>();

function isSqliteUniqueConstraintError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

const RPG_NARRATOR_PROMPT =
  "Você é o Mestre de RPG do modo legado do bot.\n" +
  "Narre uma sessão de RPG em português brasileiro.\n" +
  "Mantenha tom sombrio, investigativo e paranormal.\n" +
  "Responda como mestre de mesa.\n" +
  "Não use memória, contexto ou perfil do modo profissional de IA.\n" +
  "Não dê respostas profissionais, de pesquisa, programação ou consultoria.\n" +
  "Continue a cena com tensão, consequência e clareza.\n" +
  "Não altere regras mecânicas do sistema.\n" +
  "Não crie novas regras, moedas, classes, testes ou atributos.\n" +
  "Não resolva combate automaticamente.\n" +
  "Não mate personagens automaticamente.\n" +
  "Não substitua as mensagens mecânicas do bot.";

function normalizeClassKey(input: string): RpgClassKey | null {
  const lowered = input.trim().toLowerCase() as RpgClassKey;
  return lowered in RPG_CLASSES ? lowered : null;
}

function buildCharacterSheet(classKey: RpgClassKey, nome: string): RpgCharacterSheet {
  const base = RPG_CLASSES[classKey];
  return {
    nome,
    classe: classKey,
    nex: 5,
    xp: 0,
    hp: base.hp_base,
    hp_max: base.hp_base,
    san: base.san_base,
    san_max: base.san_base,
    pe: base.pe_base,
    pe_max: base.pe_base,
    atributos: base.atributos,
    vitorias: 0,
    derrotas: 0,
    ouro: 0
  };
}

function displayClassName(classKey: RpgClassKey): string {
  return RPG_CLASSES[classKey].nome;
}

export class RpgService {
  public constructor(
    private readonly repo: RpgRepository,
    private readonly prefix: string,
    private readonly gemini?: GeminiService,
    private readonly random: () => number = Math.random
  ) {}

  public help() {
    return RPG_HELP_TEXT.replaceAll("{prefix}", this.prefix);
  }

  public async createCharacter(
    context: IncomingMessageContext,
    classInput?: string,
    nameInput?: string
  ) {
    const existing = await this.repo.findCharacterByUserId(context.senderJid);
    if (existing) {
      return "❌ Você já possui uma ficha.";
    }

    const classKey = classInput ? normalizeClassKey(classInput) : null;
    if (!classKey) {
      return "❌ Escolha: combatente, especialista, ocultista ou mago.";
    }

    const nome = nameInput?.trim() || context.senderDisplayName;
    const sheet = buildCharacterSheet(classKey, nome);

    await this.repo.createCharacter({
      id: createId("char"),
      userId: context.senderJid,
      name: nome,
      className: classKey,
      level: 1,
      statsJson: JSON.stringify(sheet)
    });

    return `✅ *Ficha de ${nome} criada!* NEX: 5%`;
  }

  public async showCharacter(context: IncomingMessageContext) {
    const character = await this.repo.findCharacterByUserId(context.senderJid);
    if (!character) {
      return `❌ Crie sua ficha com ${this.prefix}criarchar`;
    }

    const sheet = JSON.parse(character.statsJson ?? "{}") as RpgCharacterSheet;
    return `✅ *${sheet.nome.toUpperCase()}* (${displayClassName(sheet.classe)})
⭐ NEX: ${sheet.nex}% | PV: ${sheet.hp}/${sheet.hp_max}
🧠 SAN: ${sheet.san}/${sheet.san_max}
⚡ PE: ${sheet.pe}/${sheet.pe_max}`;
  }

  public async deleteCharacter(context: IncomingMessageContext) {
    await this.repo.deleteCharacterByUserId(context.senderJid);
    return "🗑️ Ficha apagada.";
  }

  public async createSession(context: IncomingMessageContext, themeInput?: string) {
    if (!context.isGroup || !context.groupJid) {
      return "❌ Apenas em grupos!";
    }

    const lockKey = context.groupJid;

    if (pendingSessionCreations.has(lockKey)) {
      return "⏳ Já estou criando uma sessão neste grupo. Aguarde alguns segundos.";
    }

    pendingSessionCreations.add(lockKey);

    try {
    const existing = await this.repo.findActiveSessionByGroupId(context.groupJid);
    if (existing) {
      return "❌ Já existe uma sessão ativa neste grupo!";
    }

    const character = await this.repo.findCharacterByUserId(context.senderJid);
    if (!character) {
      return `❌ Crie sua ficha primeiro com ${this.prefix}criarchar`;
    }

    const theme = themeInput?.trim() || DEFAULT_RPG_THEME;
    let intro = "A noite cai sobre o grupo, e o silêncio do desconhecido pesa no ar.";

    if (this.gemini) {
      try {
        intro = (
          await this.gemini.generateText({
            feature: "rpg",
            contents: `Inicie uma sessão de RPG para um grupo de jogadores.
O tema é: ${theme}.
Descreva o cenário inicial onde os jogadores se encontram.`,
            systemInstruction: RPG_NARRATOR_PROMPT
          })
        ).text;
      } catch (error) {
        console.error("Gemini failed while creating RPG session. Using fallback intro.", error);
      }
    }

    const session = await this.repo.createSession({
      id: createId("sess"),
      groupId: context.groupJid,
      masterUserId: context.senderJid,
      theme,
      activeGroupKey: context.groupJid,
      status: "active"
    });

    if (!session) {
      throw new Error("Falha ao criar sessão.");
    }

    await this.repo.addPlayerToSession({
      sessionId: session.id,
      characterId: character.id
    });

    return `✅ *SESSÃO INICIADA: ${theme.toUpperCase()}* *MESTRE:* ${intro} _Jogadores podem entrar com ${this.prefix}entrar_`;
    } catch (error) {
      if (isSqliteUniqueConstraintError(error)) {
        return "❌ Já existe uma sessão ativa neste grupo!";
      }

      throw error;
    } finally {
      pendingSessionCreations.delete(lockKey);
    }
  }

  public async joinSession(context: IncomingMessageContext) {
    if (!context.isGroup || !context.groupJid) {
      return "❌ Nenhuma sessão ativa.";
    }

    const session = await this.repo.findActiveSessionByGroupId(context.groupJid);
    if (!session) {
      return "❌ Nenhuma sessão ativa.";
    }

    const character = await this.repo.findCharacterByUserId(context.senderJid);
    if (!character) {
      return `❌ Crie sua ficha primeiro com ${this.prefix}criarchar`;
    }

    const existing = await this.repo.findSessionPlayer(session.id, character.id);
    if (existing) {
      return "❌ Você já está na sessão.";
    }

    await this.repo.addPlayerToSession({
      sessionId: session.id,
      characterId: character.id
    });

    const sheet = JSON.parse(character.statsJson ?? "{}") as RpgCharacterSheet;
    return `✅ *${sheet.nome}* entrou na sessão!`;
  }

  public async narrate(context: IncomingMessageContext, action?: string) {
    if (!context.isGroup || !context.groupJid) {
      return "❌ Nenhuma sessão ativa.";
    }

    const session = await this.repo.findActiveSessionByGroupId(context.groupJid);
    if (!session) {
      return "❌ Nenhuma sessão ativa.";
    }

    const character = await this.repo.findCharacterByUserId(context.senderJid);
    if (!character) {
      return `❌ Crie sua ficha primeiro com ${this.prefix}criarchar`;
    }

    const existing = await this.repo.findSessionPlayer(session.id, character.id);
    if (!existing) {
      return "❌ Você não está na sessão.";
    }

    if (!action?.trim()) {
      return `Ex: ${this.prefix}narrar Eu entro na casa abandonada.`;
    }

    const sheet = JSON.parse(character.statsJson ?? "{}") as RpgCharacterSheet;
    const response = this.gemini
      ? (
          await this.gemini.generateText({
            feature: "rpg",
            contents: `O jogador ${sheet.nome} realizou a seguinte ação: "${action}".
Continue a história considerando os outros jogadores na mesa.`,
            systemInstruction: RPG_NARRATOR_PROMPT
          })
        ).text
      : "A tensão cresce enquanto a cena se desenrola diante do grupo.";

    await this.repo.createHistoryEntry({
      id: createId("hist"),
      sessionId: session.id,
      entry: `Ação: ${action} | Mestre: ${response}`
    });

    return `📖 *HISTÓRIA:*

${response}`;
  }

  public async closeSession(context: IncomingMessageContext) {
    if (!context.isGroup || !context.groupJid) {
      return "❌ Nenhuma sessão ativa.";
    }

    const session = await this.repo.findActiveSessionByGroupId(context.groupJid);
    if (!session) {
      return "❌ Nenhuma sessão ativa.";
    }

    if (session.masterUserId !== context.senderJid) {
      return "❌ Apenas o mestre pode fechar a sessão.";
    }

    await this.repo.deleteSession(session.id);
    return "✅ *Sessão finalizada.* Até a próxima aventura!";
  }

  public async startBattle(context: IncomingMessageContext) {
    if (!context.isGroup || !context.groupJid) {
      return "❌ Nenhuma sessão ativa.";
    }

    const session = await this.repo.findActiveSessionByGroupId(context.groupJid);
    if (!session) {
      return "❌ Nenhuma sessão ativa.";
    }

    const monsterTemplate = MONSTERS[Math.floor(this.random() * MONSTERS.length)] ?? MONSTERS[0];
    const monsterState: RpgMonsterState = {
      ...monsterTemplate,
      hp_atual: monsterTemplate.hp
    };
    const storedMonster = await this.repo.createMonster({
      id: createId("mon"),
      name: monsterState.nome,
      level: 1,
      statsJson: JSON.stringify(monsterState)
    });

    if (!storedMonster) {
      throw new Error("Falha ao iniciar combate.");
    }

    await this.repo.attachMonsterToSession(session.id, storedMonster.id);

    const description = this.gemini
      ? (
          await this.gemini.generateText({
            feature: "rpg",
            contents: `Um ${monsterState.nome} aparece para atacar o grupo! Descreva a ameaça.`,
            systemInstruction: RPG_NARRATOR_PROMPT
          })
        ).text
      : `O ${monsterState.nome} surge das sombras, pronto para atacar.`;

    return `⚔️ *COMBATE DE GRUPO*

${description}

❤️ HP Inimigo: ${monsterState.hp}

_Todos os jogadores na sessão podem ${this.prefix}atacar!_`;
  }

  public async attack(context: IncomingMessageContext) {
    if (!context.isGroup || !context.groupJid) {
      return "❌ Nenhuma sessão ativa.";
    }

    const session = await this.repo.findActiveSessionByGroupId(context.groupJid);
    if (!session) {
      return "❌ Nenhuma sessão ativa.";
    }

    const character = await this.repo.findCharacterByUserId(context.senderJid);
    if (!character) {
      return `❌ Crie sua ficha primeiro com ${this.prefix}criarchar`;
    }

    const membership = await this.repo.findSessionPlayer(session.id, character.id);
    if (!membership) {
      return "❌ Você não está nesta sessão.";
    }

    if (!session.activeMonsterId) {
      return "❌ Nenhum combate ativo.";
    }

    const monster = await this.repo.findMonsterById(session.activeMonsterId);
    if (!monster) {
      return "❌ Nenhum combate ativo.";
    }

    const sheet = JSON.parse(character.statsJson ?? "{}") as RpgCharacterSheet;
    const monsterState = JSON.parse(monster.statsJson ?? "{}") as RpgMonsterState;
    const damage = this.randomIntInclusive(1, 10) + (sheet.atributos?.forca ?? 2);
    monsterState.hp_atual -= damage;

    const attackerName = sheet.nome || context.senderDisplayName;
    const base = `⚔️ *${attackerName}* atacou o ${monsterState.nome} e causou *${damage}* de dano!`;

    if (monsterState.hp_atual <= 0) {
      await this.repo.clearActiveMonster(session.id);
      return `${base}

🏆 *VITÓRIA!* O grupo derrotou o inimigo!`;
    }

    await this.repo.updateMonsterStats(monster.id, JSON.stringify(monsterState));
    return `${base}

❤️ HP restante: ${monsterState.hp_atual}`;
  }

  public async russianRoulette(context: IncomingMessageContext) {
    if (!context.isGroup) {
      return "❌ Apenas em grupos!";
    }

    const chance = Math.floor(this.random() * 6);
    if (chance !== 0) {
      return "*CLIQUE...* A câmara estava vazia.\nVocê sobreviveu!";
    }

    const character = await this.repo.findCharacterByUserId(context.senderJid);
    if (!character) {
      return "*POW!* Você perdeu.";
    }

    const sheet = JSON.parse(character.statsJson ?? "{}") as RpgCharacterSheet;
    const perda = Math.floor(sheet.xp * 0.05);
    const updatedSheet = { ...sheet, xp: Math.max(0, sheet.xp - perda) };
    await this.repo.updateCharacterStats(character.id, JSON.stringify(updatedSheet));

    return `*POW!* Você perdeu.

💀 Você perdeu ${perda} de XP por morrer na roleta!`;
  }

  public async bet(context: IncomingMessageContext, amountInput?: string) {
    const character = await this.repo.findCharacterByUserId(context.senderJid);
    if (!character) {
      return "❌ Você precisa de um personagem no RPG para apostar!";
    }

    const amount = Number(amountInput);
    if (!Number.isInteger(amount) || amount <= 0) {
      return `Use: ${this.prefix}apostar [quantia]`;
    }

    const sheet = JSON.parse(character.statsJson ?? "{}") as RpgCharacterSheet;
    if (sheet.ouro < amount) {
      return "❌ Você não tem ouro suficiente!";
    }

    const win = this.random() > 0.55;
    const updatedSheet: RpgCharacterSheet = { ...sheet };
    if (win) {
      updatedSheet.ouro = sheet.ouro + amount;
      await this.repo.updateCharacterStats(character.id, JSON.stringify(updatedSheet));
      return `🎰 *GANHOU!* Você apostou ${amount} e recebeu ${amount * 2} moedas!`;
    }

    updatedSheet.ouro = sheet.ouro - amount;
    await this.repo.updateCharacterStats(character.id, JSON.stringify(updatedSheet));
    return `💸 *PERDEU!* A casa sempre vence.
Você perdeu ${amount} moedas.`;
  }

  public async coinFlip(choice?: string) {
    if (choice !== "cara" && choice !== "coroa") {
      return `Use: ${this.prefix}caraoucoroa [cara/coroa]`;
    }

    const result = this.random() > 0.5 ? "cara" : "coroa";
    if (result === choice) {
      return `🪙 O resultado foi *${result.toUpperCase()}*! Você venceu!`;
    }

    return `🪙 O resultado foi *${result.toUpperCase()}*! Você perdeu.`;
  }

  private randomIntInclusive(min: number, max: number) {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }
}
