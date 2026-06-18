import type { IncomingMessageContext } from "./command.types.js";

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; reason: string; retryAfterMs?: number };

export interface RateLimiter {
  check(key: string, context: IncomingMessageContext): RateLimitDecision;
}

export type InMemoryRateLimitRule = {
  limit: number;
  windowMs: number;
};

type UsageWindow = {
  count: number;
  windowStartedAt: number;
};

export class InMemoryRateLimiter implements RateLimiter {
  private readonly rules: Readonly<Record<string, InMemoryRateLimitRule>>;
  private readonly usage = new Map<string, UsageWindow>();

  public constructor(rules: Readonly<Record<string, InMemoryRateLimitRule>>) {
    this.rules = rules;
  }

  public check(key: string, context: IncomingMessageContext): RateLimitDecision {
    const rule = this.rules[key];

    if (!rule) {
      return { allowed: true };
    }

    const bucketKey = `${key}:${context.senderJid}`;
    const now = context.timestamp.getTime();
    const current = this.usage.get(bucketKey);

    if (!current || now - current.windowStartedAt >= rule.windowMs) {
      this.usage.set(bucketKey, { count: 1, windowStartedAt: now });
      return { allowed: true };
    }

    if (current.count >= rule.limit) {
      return {
        allowed: false,
        reason: `Rate limit exceeded for ${key}.`,
        retryAfterMs: rule.windowMs - (now - current.windowStartedAt)
      };
    }

    current.count += 1;
    return { allowed: true };
  }
}
