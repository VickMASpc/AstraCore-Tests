import { eq } from "drizzle-orm";
import type { DatabaseClient } from "../client.js";
import { users } from "../schema.js";

export function createUsersRepository(db: DatabaseClient) {
  return {
    async create(input: typeof users.$inferInsert) {
      await db.insert(users).values(input);
      return this.findById(input.id);
    },
    async findById(id: string) {
      return db.query.users.findFirst({ where: eq(users.id, id) });
    },
    async findByJidHash(jidHash: string) {
      return db.query.users.findFirst({ where: eq(users.jidHash, jidHash) });
    }
  };
}
