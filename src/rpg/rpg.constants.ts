export const RPG_CLASSES = {
  combatente: {
    nome: "Combatente ⚔️",
    hp_base: 20,
    san_base: 12,
    pe_base: 2,
    atributos: { forca: 3, agilidade: 2, vigor: 3, intelecto: 1, presenca: 1 }
  },
  especialista: {
    nome: "Especialista ",
    hp_base: 16,
    san_base: 16,
    pe_base: 3,
    atributos: { forca: 1, agilidade: 3, vigor: 2, intelecto: 3, presenca: 2 }
  },
  ocultista: {
    nome: "Ocultista ",
    hp_base: 12,
    san_base: 20,
    pe_base: 4,
    atributos: { forca: 1, agilidade: 1, vigor: 2, intelecto: 3, presenca: 3 }
  },
  mago: {
    nome: "Mago Arcano ",
    hp_base: 10,
    san_base: 18,
    pe_base: 5,
    atributos: { forca: 1, agilidade: 2, vigor: 1, intelecto: 4, presenca: 2 }
  }
} as const;

export const RPG_HELP_TEXT = `╔══════════════════════════════╗
║ BLACK LOTUS: SESSÕES RPG ║
╚══════════════════════════════╝

* PERSONAGEM*
▸ {prefix}criarchar [classe] [nome]
▸ {prefix}meuchar | {prefix}deletarchar

* SESSÃO DE GRUPO*
▸ {prefix}criarsessao [tema] (Inicia mesa)
▸ {prefix}entrar (Entra na mesa atual)
▸ {prefix}narrar [ação] (IA narra a cena)
▸ {prefix}fecharsessao (Finaliza a mesa)

*⚔️ COMBATE & IA*
▸ {prefix}batalha (Inicia combate na mesa)
▸ {prefix}atacar (Ataca o monstro da mesa)

*Classes:* combatente, especialista, ocultista, mago`;

export const DEFAULT_RPG_THEME = "Investigação Paranormal";

export const MONSTERS = [
  { nome: "Zumbi de Sangue 🩸", hp: 100, atk: 10 },
  { nome: "Vulto do Medo 👻", hp: 150, atk: 15 },
  { nome: "Dragão Abissal 🐉", hp: 300, atk: 25 }
] as const;
