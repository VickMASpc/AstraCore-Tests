import { eq } from "drizzle-orm";
import type { DatabaseClient } from "../client.js";
import { groups } from "../schema.js";

export function createGroupsRepository(db: DatabaseClient) {
  return {
    async create(input: typeof groups.$inferInsert) {
      await db.insert(groups).values(input);
      return this.findById(input.id);
    },
    async findById(id: string) {
      return db.query.groups.findFirst({ where: eq(groups.id, id) });
    },
    async findByJidHash(jidHash: string) {
      return db.query.groups.findFirst({ where: eq(groups.jidHash, jidHash) });
    }
  };
}
