import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
};

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  jidHash: text("jid_hash").notNull().unique(),
  displayName: text("display_name"),
  isOwner: integer("is_owner", { mode: "boolean" }).notNull().default(false),
  ...timestamps
});

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  jidHash: text("jid_hash").notNull().unique(),
  name: text("name"),
  participantCount: integer("participant_count"),
  ...timestamps
});

export const groupMembers = sqliteTable(
  "group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
    ...timestamps
  },
  (table) => [primaryKey({ columns: [table.groupId, table.userId] })]
);

export const userProfiles = sqliteTable("user_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id)
    .unique(),
  summary: text("summary"),
  ...timestamps
});

export const groupProfiles = sqliteTable("group_profiles", {
  id: text("id").primaryKey(),
  groupId: text("group_id")
    .notNull()
    .references(() => groups.id)
    .unique(),
  summary: text("summary"),
  ...timestamps
});

export const userGroupProfiles = sqliteTable(
  "user_group_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
    summary: text("summary"),
    ...timestamps
  },
  (table) => [uniqueIndex("user_group_profiles_unique").on(table.userId, table.groupId)]
);

export const profileFacts = sqliteTable("profile_facts", {
  id: text("id").primaryKey(),
  scope: text("scope", { enum: ["user", "group", "user_group"] }).notNull(),
  profileId: text("profile_id").notNull(),
  zone: text("zone", { enum: ["system", "profile", "ai", "rpg"] }).notNull(),
  fact: text("fact").notNull(),
  confidence: integer("confidence").notNull().default(100),
  source: text("source"),
  sensitivity: text("sensitivity", { enum: ["low", "medium", "high"] }).notNull().default("low"),
  reason: text("reason"),
  expiresAt: text("expires_at"),
  ...timestamps
});

export const memoryFacts = sqliteTable("memory_facts", {
  id: text("id").primaryKey(),
  scope: text("scope", { enum: ["user", "group"] }).notNull(),
  ownerId: text("owner_id").notNull(),
  zone: text("zone", { enum: ["system", "profile", "ai", "rpg"] }).notNull(),
  content: text("content").notNull(),
  source: text("source").notNull(),
  confidence: integer("confidence").notNull().default(100),
  sensitivity: text("sensitivity", { enum: ["low", "medium", "high"] }).notNull().default("low"),
  reviewedAt: text("reviewed_at"),
  ...timestamps
});

export const privacySettings = sqliteTable(
  "privacy_settings",
  {
    id: text("id").primaryKey(),
    scope: text("scope", { enum: ["user", "group"] }).notNull(),
    ownerId: text("owner_id").notNull(),
    mode: text("mode", { enum: ["minimal", "normal", "rich"] }).notNull().default("normal"),
    allowAiMemory: integer("allow_ai_memory", { mode: "boolean" }).notNull().default(true),
    allowRpgMemory: integer("allow_rpg_memory", { mode: "boolean" }).notNull().default(false),
    ...timestamps
  },
  (table) => [uniqueIndex("privacy_settings_scope_owner_unique").on(table.scope, table.ownerId)]
);

export const usageEvents = sqliteTable("usage_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  userHash: text("user_hash"),
  groupHash: text("group_hash"),
  payloadJson: text("payload_json"),
  ...timestamps
});

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  actorUserHash: text("actor_user_hash").notNull(),
  groupHash: text("group_hash"),
  targetHash: text("target_hash"),
  message: text("message").notNull(),
  payloadJson: text("payload_json"),
  ...timestamps
});

export const rateLimitEvents = sqliteTable("rate_limit_events", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  userHash: text("user_hash").notNull(),
  groupHash: text("group_hash"),
  allowed: integer("allowed", { mode: "boolean" }).notNull(),
  retryAfterMs: integer("retry_after_ms"),
  ...timestamps
});

export const aiConversations = sqliteTable("ai_conversations", {
  id: text("id").primaryKey(),
  scope: text("scope", { enum: ["private", "group"] }).notNull(),
  userId: text("user_id").references(() => users.id),
  groupId: text("group_id").references(() => groups.id),
  title: text("title"),
  lastMessageAt: text("last_message_at"),
  ...timestamps
});

export const aiMessages = sqliteTable("ai_messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => aiConversations.id),
  role: text("role", { enum: ["user", "model", "system"] }).notNull(),
  content: text("content").notNull(),
  ...timestamps
});

export const aiContextSummaries = sqliteTable("ai_context_summaries", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => aiConversations.id),
  summary: text("summary").notNull(),
  windowStartMessageId: text("window_start_message_id"),
  windowEndMessageId: text("window_end_message_id"),
  ...timestamps
});

export const aiResearchReports = sqliteTable("ai_research_reports", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").references(() => aiConversations.id),
  query: text("query").notNull(),
  reportMarkdown: text("report_markdown").notNull(),
  ...timestamps
});

export const aiResearchSources = sqliteTable("ai_research_sources", {
  id: text("id").primaryKey(),
  reportId: text("report_id")
    .notNull()
    .references(() => aiResearchReports.id),
  title: text("title").notNull(),
  url: text("url").notNull(),
  snippet: text("snippet"),
  ...timestamps
});

export const aiRepoReports = sqliteTable("ai_repo_reports", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").references(() => aiConversations.id),
  repoUrl: text("repo_url").notNull(),
  reportMarkdown: text("report_markdown").notNull(),
  ...timestamps
});

export const aiRepoFiles = sqliteTable("ai_repo_files", {
  id: text("id").primaryKey(),
  reportId: text("report_id")
    .notNull()
    .references(() => aiRepoReports.id),
  filePath: text("file_path").notNull(),
  summary: text("summary"),
  ...timestamps
});

export const aiCodeReviews = sqliteTable("ai_code_reviews", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").references(() => aiConversations.id),
  subject: text("subject").notNull(),
  reviewMarkdown: text("review_markdown").notNull(),
  ...timestamps
});

export const geminiCalls = sqliteTable("gemini_calls", {
  id: text("id").primaryKey(),
  feature: text("feature", { enum: ["ai", "profile", "rpg"] }).notNull(),
  model: text("model").notNull(),
  requestKind: text("request_kind", { enum: ["text", "search", "code", "structured"] }).notNull(),
  toolsRequestedJson: text("tools_requested_json"),
  toolsUsedJson: text("tools_used_json"),
  finishReason: text("finish_reason"),
  blocked: integer("blocked", { mode: "boolean" }).notNull().default(false),
  latencyMs: integer("latency_ms").notNull(),
  promptTokenCount: integer("prompt_token_count"),
  candidateTokenCount: integer("candidate_token_count"),
  totalTokenCount: integer("total_token_count"),
  userHash: text("user_hash"),
  groupHash: text("group_hash"),
  errorCode: text("error_code"),
  ...timestamps
});

export const rpgMonsters = sqliteTable("rpg_monsters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  level: integer("level").notNull().default(1),
  statsJson: text("stats_json"),
  ...timestamps
});

export const rpgCharacters = sqliteTable("rpg_characters", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id)
    .unique(),
  name: text("name").notNull(),
  className: text("class_name"),
  level: integer("level").notNull().default(1),
  statsJson: text("stats_json"),
  ...timestamps
});

export const rpgSessions = sqliteTable(
  "rpg_sessions",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id),
    masterUserId: text("master_user_id")
      .notNull()
      .references(() => users.id),
    theme: text("theme").notNull().default("Investigacao Paranormal"),
    activeGroupKey: text("active_group_key").unique(),
    activeMonsterId: text("active_monster_id").references(() => rpgMonsters.id),
    status: text("status", { enum: ["active", "ended"] }).notNull().default("active"),
    startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    endedAt: text("ended_at"),
    ...timestamps
  },
  (table) => [index("rpg_sessions_group_idx").on(table.groupId)]
);

export const rpgSessionPlayers = sqliteTable(
  "rpg_session_players",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => rpgSessions.id),
    characterId: text("character_id")
      .notNull()
      .references(() => rpgCharacters.id),
    joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    ...timestamps
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.characterId] })]
);

export const rpgHistory = sqliteTable("rpg_history", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => rpgSessions.id),
  entry: text("entry").notNull(),
  ...timestamps
});

export const rpgGameEvents = sqliteTable("rpg_game_events", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => rpgSessions.id),
  eventType: text("event_type").notNull(),
  payloadJson: text("payload_json"),
  ...timestamps
});

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles),
  memberships: many(groupMembers),
  aiConversations: many(aiConversations),
  rpgCharacter: one(rpgCharacters)
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  profile: one(groupProfiles),
  memberships: many(groupMembers),
  aiConversations: many(aiConversations),
  rpgSessions: many(rpgSessions)
}));

export const rpgSessionsRelations = relations(rpgSessions, ({ one, many }) => ({
  group: one(groups, {
    fields: [rpgSessions.groupId],
    references: [groups.id]
  }),
  master: one(users, {
    fields: [rpgSessions.masterUserId],
    references: [users.id]
  }),
  activeMonster: one(rpgMonsters, {
    fields: [rpgSessions.activeMonsterId],
    references: [rpgMonsters.id]
  }),
  players: many(rpgSessionPlayers)
}));

export const schema = {
  users,
  groups,
  groupMembers,
  userProfiles,
  groupProfiles,
  userGroupProfiles,
  profileFacts,
  memoryFacts,
  privacySettings,
  usageEvents,
  auditEvents,
  rateLimitEvents,
  aiConversations,
  aiMessages,
  aiContextSummaries,
  aiResearchReports,
  aiResearchSources,
  aiRepoReports,
  aiRepoFiles,
  aiCodeReviews,
  geminiCalls,
  rpgCharacters,
  rpgSessions,
  rpgSessionPlayers,
  rpgHistory,
  rpgMonsters,
  rpgGameEvents
} as const;

export type DBSchema = typeof schema;
