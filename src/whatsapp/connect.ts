import { createServer, type Server } from "node:http";
import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidNormalizedUser,
  makeWASocket
} from "@whiskeysockets/baileys";
import type { AppEnv } from "../config/env.js";
import type { SafeLogger } from "../observability/logger.js";
import type { CommandRouter } from "../router/command.router.js";
import { loadWhatsAppAuthState } from "./auth.js";
import { createIncomingMessageHandler, MessageDeduplicator } from "./incoming.js";
import { GroupMetadataCache } from "./groupMetadata.js";
import type { WhatsAppConnectionSnapshot } from "./types.js";

function getDisconnectReason(error: unknown): DisconnectReason | undefined {
  if (typeof error === "object" && error !== null) {
    const statusCode = (error as { output?: { statusCode?: number } }).output?.statusCode;
    if (typeof statusCode === "number") {
      return statusCode as DisconnectReason;
    }
  }

  return undefined;
}

function createStatusServer(
  env: AppEnv,
  state: WhatsAppConnectionSnapshot,
  logger: SafeLogger
): Server {
  return createServer((request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");

    if (request.url === "/health") {
      response.writeHead(200);
      response.end(JSON.stringify({ ok: true, connected: state.connected }));
      return;
    }

    if (request.url === "/") {
      const payload = {
        connected: state.connected,
        lastDisconnectReason: state.lastDisconnectReason,
        qr: env.WHATSAPP_PRINT_QR ? state.qr : undefined
      };

      response.writeHead(200);
      response.end(JSON.stringify(payload));
      return;
    }

    response.writeHead(404);
    response.end(JSON.stringify({ error: "Not found" }));
  }).listen(env.PORT, () => {
    logger.safeInfo({ port: env.PORT }, "WhatsApp status server started");
  });
}

export async function connectWhatsApp(options: {
  env: AppEnv;
  logger: SafeLogger;
  router: CommandRouter;
}): Promise<{
  state: WhatsAppConnectionSnapshot;
  close(): Promise<void>;
}> {
  const { env, logger, router } = options;
  const { state: authState, saveCreds } = await loadWhatsAppAuthState(env.WHATSAPP_AUTH_DIR);
  const version = await fetchLatestBaileysVersion();
  const connectionState: WhatsAppConnectionSnapshot = {
    connected: false,
    lastDisconnectReason: undefined,
    qr: undefined
  };
  const metadataCache = new GroupMetadataCache();
  const deduplicator = new MessageDeduplicator();
  const socket = makeWASocket({
    auth: authState,
    version: version.version,
    printQRInTerminal: env.WHATSAPP_PRINT_QR
  }) as unknown as import("./types.js").BaileysSocketLike;
  const statusServer = env.PUBLIC_STATUS_SERVER
    ? createStatusServer(env, connectionState, logger)
    : undefined;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let reconnectAttempt = 0;

  const handleMessages = createIncomingMessageHandler({
    socket,
    router,
    logger,
    owners: env.OWNER_NUMBERS,
    replyChunkSize: env.AI_REPLY_CHUNK_SIZE,
    botJid: socket.user?.id ? jidNormalizedUser(socket.user.id) : undefined,
    groupMetadataCache: metadataCache,
    deduplicator
  });

  const reconnect = () => {
    reconnectAttempt += 1;
    const delayMs = Math.min(30_000, 1_000 * 2 ** reconnectAttempt);
    reconnectTimer = setTimeout(() => {
      const startNextConnection = () => {
        void connectWhatsApp(options);
      };

      if (statusServer) {
        statusServer.close(startNextConnection);
      } else {
        startNextConnection();
      }
    }, delayMs);
  };

  socket.ev.on("creds.update", saveCreds);
  socket.ev.on("messages.upsert", handleMessages);
  socket.ev.on("connection.update", async (update) => {
    connectionState.connected = update.connection === "open";
    connectionState.qr = update.qr;

    if (update.connection === "open") {
      reconnectAttempt = 0;
      logger.safeInfo({ connected: true }, "WhatsApp connected");
      if (env.WHATSAPP_PAIRING_NUMBER && socket.requestPairingCode) {
        await socket.requestPairingCode(env.WHATSAPP_PAIRING_NUMBER);
        logger.safeInfo({ pairingCodeGenerated: true }, "Pairing code generated");
      }
      return;
    }

    if (update.connection === "close") {
      const reason = getDisconnectReason(update.lastDisconnect?.error);
      connectionState.lastDisconnectReason = reason ? String(reason) : "unknown";

      if (reason !== DisconnectReason.loggedOut) {
        reconnect();
      }
    }
  });

  const close = async () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    statusServer?.close();
    await socket.end?.(undefined);
  };

  process.once("SIGINT", () => {
    void close();
  });
  process.once("SIGTERM", () => {
    void close();
  });

  return {
    state: connectionState,
    close
  };
}
