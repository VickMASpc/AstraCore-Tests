import type { RPG_CLASSES } from "./rpg.constants.js";

export type RpgClassKey = keyof typeof RPG_CLASSES;

export type RpgCharacterSheet = {
  nome: string;
  classe: RpgClassKey;
  nex: number;
  xp: number;
  hp: number;
  hp_max: number;
  san: number;
  san_max: number;
  pe: number;
  pe_max: number;
  atributos: {
    forca: number;
    agilidade: number;
    vigor: number;
    intelecto: number;
    presenca: number;
  };
  vitorias: number;
  derrotas: number;
  ouro: number;
};

export type RpgMonsterState = {
  nome: string;
  hp: number;
  atk: number;
  hp_atual: number;
};
