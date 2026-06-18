import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { createDatabaseClient, createSqliteConnection, initializeDatabaseSchema } from "../../src/db/client.js";
import { createAuditRepository } from "../../src/db/repositories/audit.repo.js";
import { createGroupsRepository } from "../../src/db/repositories/groups.repo.js";
import { createProfilesRepository } from "../../src/db/repositories/profiles.repo.js";
import { createRpgRepository } from "../../src/db/repositories/rpg.repo.js";
import { createUsersRepository } from "../../src/db/repositories/users.repo.js";
import { schema } from "../../src/db/schema.js";

function createTestDb() {
  const sqlite = createSqliteConnection(":memory:");
  initializeDatabaseSchema(sqlite);
  return drizzle(sqlite, { schema });
}

describe("database foundation", () => {
  it("imports schema and initializes the client", () => {
    expect(schema.users).toBeDefined();
    expect(schema.aiConversations).toBeDefined();
    expect(schema.rpgSessions).toBeDefined();
    expect(createDatabaseClient(":memory:")).toBeDefined();
  });

  it("creates a user", async () => {
    const db = createTestDb();
    const usersRepo = createUsersRepository(db);
    const created = await usersRepo.create({
      id: "user_1",
      jidHash: "hash_user_1",
      displayName: "Victor",
      isOwner: true
    });

    expect(created?.jidHash).toBe("hash_user_1");
  });

  it("creates a group", async () => {
    const db = createTestDb();
    const groupsRepo = createGroupsRepository(db);
    const created = await groupsRepo.create({
      id: "group_1",
      jidHash: "hash_group_1",
      name: "Core Group",
      participantCount: 3
    });

    expect(created?.name).toBe("Core Group");
  });

  it("creates a profile fact", async () => {
    const db = createTestDb();
    const repo = createProfilesRepository(db);
    const created = await repo.createProfileFact({
      id: "fact_1",
      scope: "user",
      profileId: "profile_1",
      zone: "profile",
      fact: "Prefers short replies",
      sensitivity: "low"
    });

    expect(created?.zone).toBe("profile");
  });

  it("creates an audit event", async () => {
    const db = createTestDb();
    const repo = createAuditRepository(db);
    const created = await repo.createAuditEvent({
      id: "audit_1",
      eventType: "command_denied",
      actorUserHash: "user_hash",
      groupHash: "group_hash",
      message: "Denied owner-only command"
    });

    expect(created?.actorUserHash).toBe("user_hash");
  });

  it("enforces one RPG character per user", async () => {
    const db = createTestDb();
    const usersRepo = createUsersRepository(db);
    const rpgRepo = createRpgRepository(db);

    await usersRepo.create({
      id: "user_1",
      jidHash: "hash_user_1"
    });
    await usersRepo.create({
      id: "master_1",
      jidHash: "hash_master_1"
    });

    await rpgRepo.createCharacter({
      id: "char_1",
      userId: "user_1",
      name: "Astra"
    });

    await expect(
      rpgRepo.createCharacter({
        id: "char_2",
        userId: "user_1",
        name: "Nova"
      })
    ).rejects.toThrow();
  });

  it("enforces one active RPG session per group", async () => {
    const db = createTestDb();
    const groupsRepo = createGroupsRepository(db);
    const rpgRepo = createRpgRepository(db);

    await groupsRepo.create({
      id: "group_1",
      jidHash: "hash_group_1"
    });

    await rpgRepo.createSession({
      id: "session_1",
      groupId: "group_1",
      masterUserId: "master_1",
      theme: "Investigação",
      activeGroupKey: "group_1",
      status: "active"
    });

    await expect(
      rpgRepo.createSession({
        id: "session_2",
        groupId: "group_1",
        masterUserId: "master_1",
        theme: "Investigação",
        activeGroupKey: "group_1",
        status: "active"
      })
    ).rejects.toThrow();
  });

  it("keeps AI and RPG tables separate", () => {
    expect(schema.aiConversations[Symbol.for("drizzle:Name") as never]).not.toBe(
      schema.rpgSessions[Symbol.for("drizzle:Name") as never]
    );
  });
});
