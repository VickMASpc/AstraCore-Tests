import pino, { type LevelWithSilent, type Logger } from "pino";
import { redactSecrets } from "../security/redaction.js";

type LogMethod = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type SafeLogger = Logger & {
  safeTrace(bindings: unknown, message?: string): void;
  safeDebug(bindings: unknown, message?: string): void;
  safeInfo(bindings: unknown, message?: string): void;
  safeWarn(bindings: unknown, message?: string): void;
  safeError(bindings: unknown, message?: string): void;
  safeFatal(bindings: unknown, message?: string): void;
};

function logSafe(logger: Logger, level: LogMethod, bindings: unknown, message?: string): void {
  const sanitized = redactSecrets(bindings);

  if (message) {
    logger[level](sanitized, message);
    return;
  }

  logger[level](sanitized);
}

export function createLogger(level: LevelWithSilent = "info"): SafeLogger {
  const logger = pino({
    level,
    base: null,
    formatters: {
      bindings: () => ({})
    }
  });

  return Object.assign(logger, {
    safeTrace(bindings: unknown, message?: string) {
      logSafe(logger, "trace", bindings, message);
    },
    safeDebug(bindings: unknown, message?: string) {
      logSafe(logger, "debug", bindings, message);
    },
    safeInfo(bindings: unknown, message?: string) {
      logSafe(logger, "info", bindings, message);
    },
    safeWarn(bindings: unknown, message?: string) {
      logSafe(logger, "warn", bindings, message);
    },
    safeError(bindings: unknown, message?: string) {
      logSafe(logger, "error", bindings, message);
    },
    safeFatal(bindings: unknown, message?: string) {
      logSafe(logger, "fatal", bindings, message);
    }
  });
}
