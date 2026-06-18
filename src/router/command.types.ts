export type CommandMode = "system" | "profile" | "ai" | "rpg";

export type IncomingMessageContext = {
  messageId: string;
  chatJid: string;
  senderJid: string;
  senderDisplayName: string;
  isGroup: boolean;
  groupJid?: string;
  groupName?: string;
  groupParticipantCount?: number;
  isSenderAdmin?: boolean;
  isBotAdmin?: boolean;
  isOwner: boolean;
  rawText: string;
  commandText: string;
  commandName?: string;
  args: string[];
  rawArgs?: string;
  quotedText?: string;
  quotedMimeType?: string;
  hasMedia: boolean;
  timestamp: Date;
};

export type CommandHandlerResult = {
  ok: true;
  reply: string;
};

export type CommandHandler = (
  context: IncomingMessageContext
) => Promise<CommandHandlerResult> | CommandHandlerResult;

export type Command = {
  name: string;
  aliases: string[];
  mode: CommandMode;
  description: string;
  groupOnly?: boolean;
  privateOnly?: boolean;
  adminOnly?: boolean;
  ownerOnly?: boolean;
  rateLimitKey: string;
  handler: CommandHandler;
};

export type CommandRouteSuccess = {
  ok: true;
  status: "handled";
  command: Command;
  result: CommandHandlerResult;
};

export type CommandRouteFailureStatus =
  | "ignored"
  | "unknown_command"
  | "group_only"
  | "private_only"
  | "admin_only"
  | "owner_only"
  | "rate_limited";

export type CommandRouteFailure = {
  ok: false;
  status: CommandRouteFailureStatus;
  reason: string;
};

export type CommandRouteResult = CommandRouteSuccess | CommandRouteFailure;
