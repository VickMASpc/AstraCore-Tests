import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { loadEnv } from "../config/env.js";
import { createSqliteConnection } from "./client.js";
import { schema } from "./schema.js";

const env = loadEnv();
const sqlite = createSqliteConnection(env.DATABASE_URL);
const db = drizzle(sqlite, { schema });

migrate(db, {
  migrationsFolder: resolve("src/db/migrations")
});
