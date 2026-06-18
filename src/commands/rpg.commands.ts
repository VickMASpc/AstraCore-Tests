import type { Command } from "../router/command.types.js";
import type { RpgService } from "../rpg/rpg.service.js";

export function createRpgCommands(rpgService: RpgService): Command[] {
  return [
    {
      name: "rpg",
      aliases: ["rpgajuda"],
      mode: "rpg",
      description: "Ajuda do RPG.",
      rateLimitKey: "rpg.help",
      handler: async () => ({ ok: true as const, reply: rpgService.help() })
    },
    {
      name: "criarchar",
      aliases: [],
      mode: "rpg",
      description: "Cria a ficha do personagem.",
      rateLimitKey: "rpg.character.create",
      handler: async (context) => ({
        ok: true as const,
        reply: await rpgService.createCharacter(
          context,
          context.args[0],
          context.rawArgs?.split(/\s+/).slice(1).join(" ")
        )
      })
    },
    {
      name: "meuchar",
      aliases: [],
      mode: "rpg",
      description: "Mostra sua ficha.",
      rateLimitKey: "rpg.character.show",
      handler: async (context) => ({ ok: true as const, reply: await rpgService.showCharacter(context) })
    },
    {
      name: "deletarchar",
      aliases: [],
      mode: "rpg",
      description: "Apaga a ficha.",
      rateLimitKey: "rpg.character.delete",
      handler: async (context) => ({ ok: true as const, reply: await rpgService.deleteCharacter(context) })
    },
    {
      name: "criarsessao",
      aliases: [],
      mode: "rpg",
      description: "Cria uma sessão de grupo.",
      rateLimitKey: "rpg.session.create",
      handler: async (context) => ({
        ok: true as const,
        reply: await rpgService.createSession(context, context.rawArgs)
      })
    },
    {
      name: "entrar",
      aliases: [],
      mode: "rpg",
      description: "Entra na sessão.",
      rateLimitKey: "rpg.session.join",
      handler: async (context) => ({ ok: true as const, reply: await rpgService.joinSession(context) })
    },
    {
      name: "narrar",
      aliases: [],
      mode: "rpg",
      description: "Narra uma ação.",
      rateLimitKey: "rpg.session.narrate",
      handler: async (context) => ({ ok: true as const, reply: await rpgService.narrate(context, context.rawArgs) })
    },
    {
      name: "fecharsessao",
      aliases: [],
      mode: "rpg",
      description: "Fecha a sessão.",
      rateLimitKey: "rpg.session.close",
      handler: async (context) => ({ ok: true as const, reply: await rpgService.closeSession(context) })
    },
    {
      name: "batalha",
      aliases: [],
      mode: "rpg",
      description: "Inicia um combate em grupo.",
      rateLimitKey: "rpg.battle.start",
      handler: async (context) => ({ ok: true as const, reply: await rpgService.startBattle(context) })
    },
    {
      name: "atacar",
      aliases: [],
      mode: "rpg",
      description: "Ataca o monstro da sessão.",
      rateLimitKey: "rpg.battle.attack",
      handler: async (context) => ({ ok: true as const, reply: await rpgService.attack(context) })
    },
    {
      name: "roletarussa",
      aliases: [],
      mode: "rpg",
      description: "Mini-game de risco.",
      rateLimitKey: "rpg.minigame.roulette",
      handler: async (context) => ({ ok: true as const, reply: await rpgService.russianRoulette(context) })
    },
    {
      name: "apostar",
      aliases: [],
      mode: "rpg",
      description: "Aposta ouro do personagem.",
      rateLimitKey: "rpg.minigame.bet",
      handler: async (context) => ({ ok: true as const, reply: await rpgService.bet(context, context.args[0]) })
    },
    {
      name: "caraoucoroa",
      aliases: [],
      mode: "rpg",
      description: "Cara ou coroa.",
      rateLimitKey: "rpg.minigame.coinflip",
      handler: async (context) => ({ ok: true as const, reply: await rpgService.coinFlip(context.args[0]) })
    }
  ];
}
