import { drizzle } from "drizzle-orm/better-sqlite3";
import { ProfessionalAiService } from "./ai/ai.service.js";
import { DeepResearchService } from "./ai/deep-research.service.js";
import { GitHubApiFetcher, RepoAnalysisService } from "./ai/github.service.js";
import { ResearchService } from "./ai/research.service.js";
import { createAiCommands } from "./commands/ai.commands.js";
import { createProfileCommands } from "./commands/profile.commands.js";
import { createRpgCommands } from "./commands/rpg.commands.js";
import { APP_RUNTIME } from "./config/constants.js";
import { getSafeEnvSummary, loadEnv, type AppEnv } from "./config/env.js";
import { createSqliteConnection, initializeDatabaseSchema } from "./db/client.js";
import { createAiRepository } from "./db/repositories/ai.repo.js";
import { createProfilesRepository } from "./db/repositories/profiles.repo.js";
import { createRpgRepository } from "./db/repositories/rpg.repo.js";
import { schema } from "./db/schema.js";
import { GeminiService } from "./gemini/gemini.client.js";
import { createLogger } from "./observability/logger.js";
import { pathToFileURL } from "node:url";
import { ProfileService } from "./profiles/profile.service.js";
import { createCommandRegistry } from "./router/command.registry.js";
import { CommandRouter } from "./router/command.router.js";
import { InMemoryRateLimiter } from "./router/rateLimits.js";
import { RpgService } from "./rpg/rpg.service.js";
import { connectWhatsApp } from "./whatsapp/connect.js";

function buildRateLimiter(env: AppEnv) {
  const oneMinuteMs = 60 * 1000;
  const oneHourMs = 60 * oneMinuteMs;
  const oneDayMs = 24 * oneHourMs;

  return new InMemoryRateLimiter({
    "ai.ask": { limit: env.GENERAL_AI_RATE_LIMIT_PER_USER_PER_HOUR, windowMs: oneHourMs },
    "ai.explain": { limit: env.GENERAL_AI_RATE_LIMIT_PER_USER_PER_HOUR, windowMs: oneHourMs },
    "ai.summarize": { limit: env.GENERAL_AI_RATE_LIMIT_PER_USER_PER_HOUR, windowMs: oneHourMs },
    "ai.draft": { limit: env.GENERAL_AI_RATE_LIMIT_PER_USER_PER_HOUR, windowMs: oneHourMs },
    "ai.compare": { limit: env.GENERAL_AI_RATE_LIMIT_PER_USER_PER_HOUR, windowMs: oneHourMs },
    "ai.plan": { limit: env.GENERAL_AI_RATE_LIMIT_PER_USER_PER_HOUR, windowMs: oneHourMs },
    "ai.code": { limit: env.GENERAL_AI_RATE_LIMIT_PER_USER_PER_HOUR, windowMs: oneHourMs },
    "ai.reset": { limit: env.GENERAL_AI_RATE_LIMIT_PER_USER_PER_HOUR, windowMs: oneHourMs },
    "ai.research": { limit: env.RESEARCH_RATE_LIMIT_PER_USER_PER_HOUR, windowMs: oneHourMs },
    "ai.deepresearch": { limit: env.DEEP_RESEARCH_RATE_LIMIT_PER_USER_PER_DAY, windowMs: oneDayMs },
    "ai.sources": { limit: env.RESEARCH_RATE_LIMIT_PER_USER_PER_HOUR, windowMs: oneHourMs },
    "ai.repo": { limit: env.REPO_ANALYSIS_RATE_LIMIT_PER_USER_PER_DAY, windowMs: oneDayMs },
    "ai.review": { limit: env.REPO_ANALYSIS_RATE_LIMIT_PER_USER_PER_DAY, windowMs: oneDayMs },
    "rpg.help": { limit: env.RPG_RATE_LIMIT_PER_USER_PER_MINUTE, windowMs: oneMinuteMs },
    "rpg.character.create": { limit: env.RPG_RATE_LIMIT_PER_USER_PER_MINUTE, windowMs: oneMinuteMs },
    "rpg.character.show": { limit: env.RPG_RATE_LIMIT_PER_USER_PER_MINUTE, windowMs: oneMinuteMs },
    "rpg.character.delete": { limit: env.RPG_RATE_LIMIT_PER_USER_PER_MINUTE, windowMs: oneMinuteMs },
    "rpg.session.create": { limit: env.RPG_RATE_LIMIT_PER_USER_PER_MINUTE, windowMs: oneMinuteMs },
    "rpg.session.join": { limit: env.RPG_RATE_LIMIT_PER_USER_PER_MINUTE, windowMs: oneMinuteMs },
    "rpg.session.narrate": { limit: env.RPG_RATE_LIMIT_PER_USER_PER_MINUTE, windowMs: oneMinuteMs },
    "rpg.session.close": { limit: env.RPG_RATE_LIMIT_PER_USER_PER_MINUTE, windowMs: oneMinuteMs },
    "rpg.battle.start": { limit: env.RPG_RATE_LIMIT_PER_USER_PER_MINUTE, windowMs: oneMinuteMs },
    "rpg.battle.attack": { limit: env.RPG_RATE_LIMIT_PER_USER_PER_MINUTE, windowMs: oneMinuteMs },
    "rpg.minigame.roulette": { limit: env.RPG_RATE_LIMIT_PER_USER_PER_MINUTE, windowMs: oneMinuteMs },
    "rpg.minigame.bet": { limit: env.RPG_RATE_LIMIT_PER_USER_PER_MINUTE, windowMs: oneMinuteMs },
    "rpg.minigame.coinflip": { limit: env.RPG_RATE_LIMIT_PER_USER_PER_MINUTE, windowMs: oneMinuteMs }
  });
}

export async function boot(): Promise<{ close(): Promise<void> }> {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const sqlite = createSqliteConnection(env.DATABASE_URL);
  initializeDatabaseSchema(sqlite);
  const db = drizzle(sqlite, { schema });

  const profilesRepo = createProfilesRepository(db);
  const aiRepo = createAiRepository(db);
  const rpgRepo = createRpgRepository(db);
  const gemini = new GeminiService({
    env,
    logger,
    callsRepository: aiRepo
  });
  const profileService = new ProfileService(profilesRepo, gemini);
  const aiService = new ProfessionalAiService(aiRepo, profilesRepo, gemini);
  const researchService = new ResearchService(aiRepo, gemini);
  const deepResearchService = new DeepResearchService(aiRepo, gemini, env);
  const repoAnalysisService = new RepoAnalysisService(aiRepo, gemini, new GitHubApiFetcher());
  const rpgService = new RpgService(rpgRepo, env.BOT_PREFIX, gemini);
  const router = new CommandRouter({
    commands: createCommandRegistry([
      ...createProfileCommands(profileService),
      ...createAiCommands(
        aiService,
        profileService,
        researchService,
        repoAnalysisService,
        deepResearchService
      ),
      ...createRpgCommands(rpgService)
    ]),
    prefix: env.BOT_PREFIX,
    rateLimiter: buildRateLimiter(env)
  });
  const transport = await connectWhatsApp({
    env,
    logger,
    router
  });

  logger.safeInfo(
    {
      app: APP_RUNTIME.name,
      version: APP_RUNTIME.version,
      config: getSafeEnvSummary(env)
    },
    "Application booted"
  );

  return {
    async close() {
      await transport.close();
      sqlite.close();
    }
  };
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isEntrypoint) {
  boot().catch((error: unknown) => {
    const logger = createLogger("error");
    logger.safeError({ err: error }, "Application failed to start");
    process.exitCode = 1;
  });
}
