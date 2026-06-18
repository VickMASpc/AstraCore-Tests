import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseClient } from "../client.js";
import {
  groupProfiles,
  groups,
  memoryFacts,
  privacySettings,
  profileFacts,
  userGroupProfiles,
  userProfiles,
  users
} from "../schema.js";

export function createProfilesRepository(db: DatabaseClient) {
  return {
    async upsertUserProfile(input: typeof userProfiles.$inferInsert) {
      await db
        .insert(users)
        .values({ id: input.userId, jidHash: input.userId })
        .onConflictDoNothing();
      await db
        .insert(userProfiles)
        .values(input)
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            summary: input.summary,
            updatedAt: new Date().toISOString()
          }
        });
      return this.findUserProfileByUserId(input.userId);
    },
    async findUserProfileByUserId(userId: string) {
      return db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, userId) });
    },
    async upsertGroupProfile(input: typeof groupProfiles.$inferInsert) {
      await db
        .insert(groups)
        .values({ id: input.groupId, jidHash: input.groupId })
        .onConflictDoNothing();
      await db
        .insert(groupProfiles)
        .values(input)
        .onConflictDoUpdate({
          target: groupProfiles.groupId,
          set: {
            summary: input.summary,
            updatedAt: new Date().toISOString()
          }
        });
      return this.findGroupProfileByGroupId(input.groupId);
    },
    async findGroupProfileByGroupId(groupId: string) {
      return db.query.groupProfiles.findFirst({ where: eq(groupProfiles.groupId, groupId) });
    },
    async upsertUserInGroupProfile(input: typeof userGroupProfiles.$inferInsert) {
      await db
        .insert(users)
        .values({ id: input.userId, jidHash: input.userId })
        .onConflictDoNothing();
      await db
        .insert(groups)
        .values({ id: input.groupId, jidHash: input.groupId })
        .onConflictDoNothing();
      await db
        .insert(userGroupProfiles)
        .values(input)
        .onConflictDoUpdate({
          target: [userGroupProfiles.userId, userGroupProfiles.groupId],
          set: {
            summary: input.summary,
            updatedAt: new Date().toISOString()
          }
        });
      return this.findUserInGroupProfile(input.userId, input.groupId);
    },
    async findUserInGroupProfile(userId: string, groupId: string) {
      return db.query.userGroupProfiles.findFirst({
        where: and(eq(userGroupProfiles.userId, userId), eq(userGroupProfiles.groupId, groupId))
      });
    },
    async createProfileFact(input: typeof profileFacts.$inferInsert) {
      await db.insert(profileFacts).values(input);
      return this.findProfileFactById(input.id);
    },
    async listProfileFacts(profileId: string) {
      return db.query.profileFacts.findMany({ where: eq(profileFacts.profileId, profileId) });
    },
    async deleteProfileFact(id: string) {
      await db.delete(profileFacts).where(eq(profileFacts.id, id));
    },
    async findProfileFactById(id: string) {
      return db.query.profileFacts.findFirst({ where: eq(profileFacts.id, id) });
    },
    async createMemoryFact(input: typeof memoryFacts.$inferInsert) {
      await db.insert(memoryFacts).values(input);
      return this.findMemoryFactById(input.id);
    },
    async findMemoryFactById(id: string) {
      return db.query.memoryFacts.findFirst({ where: eq(memoryFacts.id, id) });
    },
    async listMemoryFacts(ownerId: string) {
      return db.query.memoryFacts.findMany({ where: eq(memoryFacts.ownerId, ownerId) });
    },
    async deleteMemoryFact(id: string, ownerId: string) {
      await db.delete(memoryFacts).where(and(eq(memoryFacts.id, id), eq(memoryFacts.ownerId, ownerId)));
    },
    async clearMemoryFacts(ownerId: string) {
      await db.delete(memoryFacts).where(eq(memoryFacts.ownerId, ownerId));
    },
    async upsertPrivacySetting(input: typeof privacySettings.$inferInsert) {
      await db
        .insert(privacySettings)
        .values(input)
        .onConflictDoUpdate({
          target: [privacySettings.scope, privacySettings.ownerId],
          set: {
            mode: input.mode,
            allowAiMemory: input.allowAiMemory,
            allowRpgMemory: input.allowRpgMemory,
            updatedAt: new Date().toISOString()
          }
        });
      return this.findPrivacySetting(input.scope, input.ownerId);
    },
    async findPrivacySetting(scope: "user" | "group", ownerId: string) {
      return db.query.privacySettings.findFirst({
        where: and(eq(privacySettings.scope, scope), eq(privacySettings.ownerId, ownerId))
      });
    },
    async listMemoryFactsByIds(ids: string[]) {
      if (ids.length === 0) {
        return [];
      }

      return db.query.memoryFacts.findMany({ where: inArray(memoryFacts.id, ids) });
    }
  };
}
