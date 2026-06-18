import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "./schema.js";

export type DatabaseClient = BetterSQLite3Database<typeof schema>;

export function resolveSqlitePath(databaseUrl: string): string {
  if (databaseUrl === ":memory:" || databaseUrl === "file::memory:" || databaseUrl === "file::memory:?cache=shared") {
    return ":memory:";
  }

  if (databaseUrl.startsWith("file:")) {
    return resolve(databaseUrl.slice("file:".length));
  }

  return resolve(databaseUrl);
}

export function createSqliteConnection(databaseUrl: string): Database.Database {
  const path = resolveSqlitePath(databaseUrl);

  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const sqlite = new Database(path);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("journal_mode = WAL");
  return sqlite;
}

export function createDatabaseClient(databaseUrl: string): DatabaseClient {
  const sqlite = createSqliteConnection(databaseUrl);
  return drizzle(sqlite, { schema });
}

export function initializeDatabaseSchema(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      jid_hash TEXT NOT NULL UNIQUE,
      display_name TEXT,
      is_owner INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY NOT NULL,
      jid_hash TEXT NOT NULL UNIQUE,
      name TEXT,
      participant_count INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS group_members (
      group_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_id, user_id),
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      summary TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS group_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      group_id TEXT NOT NULL UNIQUE,
      summary TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );
    CREATE TABLE IF NOT EXISTS user_group_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      summary TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS user_group_profiles_unique
      ON user_group_profiles(user_id, group_id);
    CREATE TABLE IF NOT EXISTS profile_facts (
      id TEXT PRIMARY KEY NOT NULL,
      scope TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      zone TEXT NOT NULL,
      fact TEXT NOT NULL,
      confidence INTEGER NOT NULL DEFAULT 100,
      source TEXT,
      sensitivity TEXT NOT NULL DEFAULT 'low',
      reason TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS memory_facts (
      id TEXT PRIMARY KEY NOT NULL,
      scope TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      zone TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'explicit_user',
      confidence INTEGER NOT NULL DEFAULT 100,
      sensitivity TEXT NOT NULL DEFAULT 'low',
      reviewed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS privacy_settings (
      id TEXT PRIMARY KEY NOT NULL,
      scope TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'normal',
      allow_ai_memory INTEGER NOT NULL DEFAULT 1,
      allow_rpg_memory INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS privacy_settings_scope_owner_unique
      ON privacy_settings(scope, owner_id);
    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY NOT NULL,
      event_type TEXT NOT NULL,
      user_hash TEXT,
      group_hash TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY NOT NULL,
      event_type TEXT NOT NULL,
      actor_user_hash TEXT NOT NULL,
      group_hash TEXT,
      target_hash TEXT,
      message TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS rate_limit_events (
      id TEXT PRIMARY KEY NOT NULL,
      key TEXT NOT NULL,
      user_hash TEXT NOT NULL,
      group_hash TEXT,
      allowed INTEGER NOT NULL,
      retry_after_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id TEXT PRIMARY KEY NOT NULL,
      scope TEXT NOT NULL,
      user_id TEXT,
      group_id TEXT,
      title TEXT,
      last_message_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (group_id) REFERENCES groups(id)
    );
    CREATE TABLE IF NOT EXISTS ai_messages (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
    );
    CREATE TABLE IF NOT EXISTS ai_context_summaries (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      window_start_message_id TEXT,
      window_end_message_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
    );
    CREATE TABLE IF NOT EXISTS ai_research_reports (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT,
      query TEXT NOT NULL,
      report_markdown TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
    );
    CREATE TABLE IF NOT EXISTS ai_research_sources (
      id TEXT PRIMARY KEY NOT NULL,
      report_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      snippet TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES ai_research_reports(id)
    );
    CREATE TABLE IF NOT EXISTS ai_deep_research_runs (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT,
      query TEXT NOT NULL,
      status TEXT NOT NULL,
      final_report_markdown TEXT,
      confidence TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
    );
    CREATE TABLE IF NOT EXISTS ai_deep_research_artifacts (
      id TEXT PRIMARY KEY NOT NULL,
      run_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      model TEXT NOT NULL,
      content_markdown TEXT,
      content_json TEXT,
      sources_json TEXT,
      blocked INTEGER NOT NULL DEFAULT 0,
      error_code TEXT,
      latency_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (run_id) REFERENCES ai_deep_research_runs(id)
    );
    CREATE TABLE IF NOT EXISTS ai_repo_reports (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT,
      repo_url TEXT NOT NULL,
      report_markdown TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
    );
    CREATE TABLE IF NOT EXISTS ai_repo_files (
      id TEXT PRIMARY KEY NOT NULL,
      report_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      summary TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (report_id) REFERENCES ai_repo_reports(id)
    );
    CREATE TABLE IF NOT EXISTS ai_code_reviews (
      id TEXT PRIMARY KEY NOT NULL,
      conversation_id TEXT,
      subject TEXT NOT NULL,
      review_markdown TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
    );
    CREATE TABLE IF NOT EXISTS gemini_calls (
      id TEXT PRIMARY KEY NOT NULL,
      feature TEXT NOT NULL,
      model TEXT NOT NULL,
      request_kind TEXT NOT NULL,
      tools_requested_json TEXT,
      tools_used_json TEXT,
      finish_reason TEXT,
      blocked INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL,
      prompt_token_count INTEGER,
      candidate_token_count INTEGER,
      total_token_count INTEGER,
      user_hash TEXT,
      group_hash TEXT,
      error_code TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS rpg_monsters (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 1,
      stats_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS rpg_characters (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      class_name TEXT,
      level INTEGER NOT NULL DEFAULT 1,
      stats_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS rpg_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      group_id TEXT NOT NULL,
      master_user_id TEXT NOT NULL,
      theme TEXT NOT NULL DEFAULT 'Investigacao Paranormal',
      active_group_key TEXT UNIQUE,
      active_monster_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES groups(id),
      FOREIGN KEY (master_user_id) REFERENCES users(id),
      FOREIGN KEY (active_monster_id) REFERENCES rpg_monsters(id)
    );
    CREATE TABLE IF NOT EXISTS rpg_session_players (
      session_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (session_id, character_id),
      FOREIGN KEY (session_id) REFERENCES rpg_sessions(id),
      FOREIGN KEY (character_id) REFERENCES rpg_characters(id)
    );
    CREATE TABLE IF NOT EXISTS rpg_history (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      entry TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES rpg_sessions(id)
    );
    CREATE TABLE IF NOT EXISTS rpg_game_events (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES rpg_sessions(id)
    );
  `);
}
