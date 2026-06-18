import { eq } from "drizzle-orm";
import type { DatabaseClient } from "../client.js";
import { auditEvents, rateLimitEvents, usageEvents } from "../schema.js";

export function createAuditRepository(db: DatabaseClient) {
  return {
    async createAuditEvent(input: typeof auditEvents.$inferInsert) {
      await db.insert(auditEvents).values(input);
      return db.query.auditEvents.findFirst({
        where: eq(auditEvents.id, input.id)
      });
    },
    async createUsageEvent(input: typeof usageEvents.$inferInsert) {
      await db.insert(usageEvents).values(input);
      return db.query.usageEvents.findFirst({
        where: eq(usageEvents.id, input.id)
      });
    },
    async createRateLimitEvent(input: typeof rateLimitEvents.$inferInsert) {
      await db.insert(rateLimitEvents).values(input);
      return db.query.rateLimitEvents.findFirst({
        where: eq(rateLimitEvents.id, input.id)
      });
    }
  };
}
