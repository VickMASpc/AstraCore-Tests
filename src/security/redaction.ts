const REDACTED = "[REDACTED]";

const KEY_PATTERN =
  /(gemini|api|auth|token|secret|password|session|cookie|bearer|private|key)/i;

const VALUE_PATTERNS = [
  /AIza[0-9A-Za-z\-_]{20,}/g,
  /\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b[A-Z][A-Z0-9_]{2,}\s*=\s*["']?[^\s"']{6,}["']?/g,
  /\b(?:eyJ[a-zA-Z0-9_\-]+=*\.eyJ[a-zA-Z0-9_\-]+=*\.?[a-zA-Z0-9_\-+/=]*)\b/g,
  /\b(?:WA|whatsapp)[A-Za-z0-9:_\-=/+]{8,}\b/gi
] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactStringValue(value: string): string {
  return VALUE_PATTERNS.reduce((currentValue, pattern) => {
    return currentValue.replace(pattern, REDACTED);
  }, value);
}

export function redactSecrets(input: unknown): unknown {
  if (typeof input === "string") {
    return redactStringValue(input);
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactSecrets(item));
  }

  if (!isPlainObject(input)) {
    return input;
  }

  const entries = Object.entries(input).map(([key, value]) => {
    if (KEY_PATTERN.test(key)) {
      return [key, REDACTED];
    }

    return [key, redactSecrets(value)];
  });

  return Object.fromEntries(entries);
}
