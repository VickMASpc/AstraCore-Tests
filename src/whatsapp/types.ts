import type { AnyMessageContent, GroupMetadata, WAMessage } from "@whiskeysockets/baileys";
import type { IncomingMessageContext } from "../router/command.types.js";

export type WhatsAppConnectionSnapshot = {
  connected: boolean;
  lastDisconnectReason: string | undefined;
  qr: string | undefined;
};

export type BaileysEventMapLike = {
  "messages.upsert": {
    messages: WAMessage[];
    type: string;
  };
  "connection.update": {
    connection?: string;
    qr?: string;
    lastDisconnect?: {
      error?: unknown;
    };
  };
  "creds.update": unknown;
};

export interface BaileysEventEmitterLike {
  on<T extends keyof BaileysEventMapLike>(
    event: T,
    listener: (payload: BaileysEventMapLike[T]) => void | Promise<void>
  ): void;
}

export interface BaileysSocketLike {
  ev: BaileysEventEmitterLike;
  user:
    | {
        id?: string;
      }
    | undefined;
  sendMessage(
    jid: string,
    content: AnyMessageContent,
    options?: Record<string, unknown>
  ): Promise<unknown>;
  groupMetadata(jid: string): Promise<GroupMetadata>;
  requestPairingCode?: (phoneNumber: string) => Promise<string>;
  end?: (error?: Error) => Promise<void>;
}

export type NormalizeMessageOptions = {
  owners: readonly string[];
  botJid: string | undefined;
  groupMetadata: GroupMetadata | undefined;
};

export type NormalizedMessage = IncomingMessageContext | null;
