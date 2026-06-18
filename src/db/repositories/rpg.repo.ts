import { and, eq } from "drizzle-orm";
import type { DatabaseClient } from "../client.js";
import {
  groups,
  rpgCharacters,
  rpgHistory,
  rpgMonsters,
  rpgSessionPlayers,
  rpgSessions,
  users
} from "../schema.js";

export function createRpgRepository(db: DatabaseClient) {
  return {
    async createCharacter(input: typeof rpgCharacters.$inferInsert) {
      await db.insert(users).values({ id: input.userId, jidHash: input.userId }).onConflictDoNothing();
      await db.insert(rpgCharacters).values(input);
      return db.query.rpgCharacters.findFirst({
        where: eq(rpgCharacters.id, input.id)
      });
    },
    async findCharacterByUserId(userId: string) {
      return db.query.rpgCharacters.findFirst({
        where: eq(rpgCharacters.userId, userId)
      });
    },
    async deleteCharacterByUserId(userId: string) {
      await db.delete(rpgCharacters).where(eq(rpgCharacters.userId, userId));
    },
    async updateCharacterStats(characterId: string, statsJson: string) {
      await db
        .update(rpgCharacters)
        .set({ statsJson, updatedAt: new Date().toISOString() })
        .where(eq(rpgCharacters.id, characterId));
      return db.query.rpgCharacters.findFirst({ where: eq(rpgCharacters.id, characterId) });
    },
    async createSession(input: typeof rpgSessions.$inferInsert) {
      await db.insert(groups).values({ id: input.groupId, jidHash: input.groupId }).onConflictDoNothing();
      await db.insert(users).values({ id: input.masterUserId, jidHash: input.masterUserId }).onConflictDoNothing();
      await db.insert(rpgSessions).values(input);
      return db.query.rpgSessions.findFirst({
        where: eq(rpgSessions.id, input.id)
      });
    },
    async findActiveSessionByGroupId(groupId: string) {
      return db.query.rpgSessions.findFirst({
        where: and(eq(rpgSessions.groupId, groupId), eq(rpgSessions.status, "active"))
      });
    },
    async addPlayerToSession(input: typeof rpgSessionPlayers.$inferInsert) {
      await db.insert(rpgSessionPlayers).values(input);
      return db.query.rpgSessionPlayers.findFirst({
        where: and(
          eq(rpgSessionPlayers.sessionId, input.sessionId),
          eq(rpgSessionPlayers.characterId, input.characterId)
        )
      });
    },
    async findSessionPlayer(sessionId: string, characterId: string) {
      return db.query.rpgSessionPlayers.findFirst({
        where: and(eq(rpgSessionPlayers.sessionId, sessionId), eq(rpgSessionPlayers.characterId, characterId))
      });
    },
    async listSessionPlayers(sessionId: string) {
      return db.query.rpgSessionPlayers.findMany({
        where: eq(rpgSessionPlayers.sessionId, sessionId)
      });
    },
    async createHistoryEntry(input: typeof rpgHistory.$inferInsert) {
      await db.insert(rpgHistory).values(input);
      return db.query.rpgHistory.findFirst({
        where: eq(rpgHistory.id, input.id)
      });
    },
    async listHistory(sessionId: string) {
      return db.query.rpgHistory.findMany({
        where: eq(rpgHistory.sessionId, sessionId)
      });
    },
    async createMonster(input: typeof rpgMonsters.$inferInsert) {
      await db.insert(rpgMonsters).values(input);
      return db.query.rpgMonsters.findFirst({ where: eq(rpgMonsters.id, input.id) });
    },
    async findMonsterById(id: string) {
      return db.query.rpgMonsters.findFirst({ where: eq(rpgMonsters.id, id) });
    },
    async updateMonsterStats(monsterId: string, statsJson: string) {
      await db
        .update(rpgMonsters)
        .set({ statsJson, updatedAt: new Date().toISOString() })
        .where(eq(rpgMonsters.id, monsterId));
      return db.query.rpgMonsters.findFirst({ where: eq(rpgMonsters.id, monsterId) });
    },
    async attachMonsterToSession(sessionId: string, monsterId: string) {
      await db
        .update(rpgSessions)
        .set({ activeMonsterId: monsterId, updatedAt: new Date().toISOString() })
        .where(eq(rpgSessions.id, sessionId));
      return db.query.rpgSessions.findFirst({ where: eq(rpgSessions.id, sessionId) });
    },
    async clearActiveMonster(sessionId: string) {
      const session = await db.query.rpgSessions.findFirst({ where: eq(rpgSessions.id, sessionId) });
      await db
        .update(rpgSessions)
        .set({ activeMonsterId: null, updatedAt: new Date().toISOString() })
        .where(eq(rpgSessions.id, sessionId));
      if (session?.activeMonsterId) {
        await db.delete(rpgMonsters).where(eq(rpgMonsters.id, session.activeMonsterId));
      }
    },
    async deleteSession(sessionId: string) {
      const session = await db.query.rpgSessions.findFirst({ where: eq(rpgSessions.id, sessionId) });
      await db.delete(rpgSessionPlayers).where(eq(rpgSessionPlayers.sessionId, sessionId));
      await db.delete(rpgHistory).where(eq(rpgHistory.sessionId, sessionId));
      if (session?.activeMonsterId) {
        await db.delete(rpgMonsters).where(eq(rpgMonsters.id, session.activeMonsterId));
      }
      await db.delete(rpgSessions).where(eq(rpgSessions.id, sessionId));
    }
  };
}
