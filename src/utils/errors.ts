export class AppError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  public constructor(message: string, code = "APP_ERROR", details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  public constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class PermissionError extends AppError {
  public constructor(message: string, details?: unknown) {
    super(message, "PERMISSION_ERROR", details);
    this.name = "PermissionError";
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfterMs: number | undefined;

  public constructor(message: string, retryAfterMs?: number, details?: unknown) {
    super(message, "RATE_LIMIT_ERROR", details);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class ExternalServiceError extends AppError {
  public constructor(message: string, details?: unknown) {
    super(message, "EXTERNAL_SERVICE_ERROR", details);
    this.name = "ExternalServiceError";
  }
}

export function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  return new Error(typeof value === "string" ? value : "Unknown error");
}
