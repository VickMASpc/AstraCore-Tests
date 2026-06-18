import { isJidGroup, jidNormalizedUser, type GroupMetadata, type WAMessage } from "@whiskeysockets/baileys";
import type { IncomingMessageContext } from "../router/command.types.js";
import type { NormalizeMessageOptions, NormalizedMessage } from "./types.js";

function getMessageText(message: WAMessage): string | null {
  const content = message.message;

  if (!content) {
    return null;
  }

  if (typeof content.conversation === "string") {
    return content.conversation;
  }

  if (content.extendedTextMessage?.text) {
    return content.extendedTextMessage.text;
  }

  return null;
}

function getQuotedText(message: WAMessage): string | undefined {
  const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

  if (!quoted) {
    return undefined;
  }

  if (quoted.conversation) {
    return quoted.conversation;
  }

  if (quoted.extendedTextMessage?.text) {
    return quoted.extendedTextMessage.text;
  }

  return undefined;
}

function getQuotedMimeType(message: WAMessage): string | undefined {
  return message.message?.extendedTextMessage?.contextInfo?.quotedMessage
    ? "text/plain"
    : undefined;
}

function hasMediaMessage(message: WAMessage): boolean {
  const content = message.message;

  if (!content) {
    return false;
  }

  return Boolean(
    content.imageMessage ||
      content.videoMessage ||
      content.audioMessage ||
      content.documentMessage ||
      content.stickerMessage
  );
}

function getParticipantAdminFlags(
  metadata: GroupMetadata | undefined,
  senderJid: string,
  botJid: string | undefined
): { isSenderAdmin: boolean; isBotAdmin: boolean } {
  const participants = metadata?.participants ?? [];
  const normalizedSender = jidNormalizedUser(senderJid);
  const normalizedBot = botJid ? jidNormalizedUser(botJid) : undefined;

  const isAdmin = (jid: string | undefined) =>
    participants.some((participant) => {
      if (!jid || !participant.id) {
        return false;
      }

      const normalizedParticipant = jidNormalizedUser(participant.id);
      return normalizedParticipant === jid && participant.admin != null;
    });

  return {
    isSenderAdmin: isAdmin(normalizedSender),
    isBotAdmin: isAdmin(normalizedBot)
  };
}

function jidToPhone(jid: string): string {
  return jid.split("@")[0] ?? jid;
}

export function normalizeIncomingMessage(
  message: WAMessage,
  options: NormalizeMessageOptions
): NormalizedMessage {
  const text = getMessageText(message);

  if (!text || !message.key?.id || !message.key.remoteJid) {
    return null;
  }

  const chatJid = message.key.remoteJid;
  const isGroup = Boolean(isJidGroup(chatJid));
  const senderJid = isGroup ? message.key.participant ?? chatJid : chatJid;
  const groupMetadata = options.groupMetadata;
  const participantFlags = getParticipantAdminFlags(groupMetadata, senderJid, options.botJid);
  const quotedText = getQuotedText(message);
  const quotedMimeType = getQuotedMimeType(message);

  const normalized: IncomingMessageContext = {
    messageId: message.key.id,
    chatJid,
    senderJid,
    senderDisplayName:
      message.pushName ??
      groupMetadata?.participants?.find((participant) => participant.id === senderJid)?.name ??
      jidToPhone(senderJid),
    isGroup,
    isOwner: options.owners.includes(jidToPhone(senderJid)),
    rawText: text,
    commandText: text,
    args: [],
    hasMedia: hasMediaMessage(message),
    timestamp: new Date(Number(message.messageTimestamp ?? Date.now()) * 1000)
  };

  if (isGroup) {
    normalized.groupJid = chatJid;
    normalized.isSenderAdmin = participantFlags.isSenderAdmin;
    normalized.isBotAdmin = participantFlags.isBotAdmin;

    if (groupMetadata?.subject) {
      normalized.groupName = groupMetadata.subject;
    }

    if (typeof groupMetadata?.participants?.length === "number") {
      normalized.groupParticipantCount = groupMetadata.participants.length;
    }
  }

  if (quotedText) {
    normalized.quotedText = quotedText;
  }

  if (quotedMimeType) {
    normalized.quotedMimeType = quotedMimeType;
  }

  return normalized;
}
