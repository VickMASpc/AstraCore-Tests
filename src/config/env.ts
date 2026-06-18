import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv();

const nodeEnvSchema = z.enum(["development", "test", "production"]).default("development");

const logLevelSchema = z
  .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
  .default("info");

const booleanFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((value, context) => {
    if (typeof value === "boolean") {
      return value;
    }

    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid boolean value: ${value}`
    });

    return z.NEVER;
  });
const positiveIntFromEnv = z.coerce.number().int().positive();

function parseOwnerNumbers(input: string): string[] {
  return input
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

const rawEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema,
    BOT_NAME: z.string().trim().min(1).default("AstraCore"),
    BOT_PREFIX: z.string().trim().min(1, "BOT_PREFIX cannot be empty"),
    OWNER_NUMBERS: z.string().default(""),
    DATABASE_URL: z.string().trim().min(1),
    DATABASE_DIALECT: z.literal("sqlite"),
    WHATSAPP_AUTH_DIR: z.string().trim().min(1),
    WHATSAPP_PAIRING_NUMBER: z.string().trim().optional().default(""),
    WHATSAPP_PRINT_QR: booleanFromEnv.default(false),
    PUBLIC_STATUS_SERVER: booleanFromEnv.default(true),
    PORT: positiveIntFromEnv.default(3000),
    GEMINI_API_KEY: z.string().trim().default(""),
    GEMINI_API_VERSION: z.string().trim().min(1),
    GEMINI_AI_MODEL: z.string().trim().min(1),
    GEMINI_FAST_MODEL: z.string().trim().min(1),
    GEMINI_RPG_MODEL: z.string().trim().min(1),
    DEEP_RESEARCH_PLANNER_MODEL: z.string().trim().optional().default(""),
    DEEP_RESEARCH_DETAIL_MODEL: z.string().trim().optional().default(""),
    DEEP_RESEARCH_SOURCE_MODEL: z.string().trim().optional().default(""),
    DEEP_RESEARCH_WRITER_MODEL: z.string().trim().optional().default(""),
    DEEP_RESEARCH_FACTCHECK_MODEL: z.string().trim().optional().default(""),
    DEEP_RESEARCH_FINAL_MODEL: z.string().trim().optional().default(""),
    ENABLE_GOOGLE_SEARCH: booleanFromEnv.default(true),
    ENABLE_CODE_EXECUTION: booleanFromEnv.default(true),
    ENABLE_PUBLIC_REPO_ANALYSIS: booleanFromEnv.default(true),
    ENABLE_STRUCTURED_OUTPUT: booleanFromEnv.default(true),
    AI_MAX_CONTEXT_MESSAGES: positiveIntFromEnv.default(30),
    AI_MAX_GROUP_CONTEXT_MESSAGES: positiveIntFromEnv.default(20),
    AI_MAX_RESPONSE_CHARS: positiveIntFromEnv.default(12000),
    AI_REPLY_CHUNK_SIZE: positiveIntFromEnv.default(3500),
    RESEARCH_RATE_LIMIT_PER_USER_PER_HOUR: positiveIntFromEnv.default(10),
    DEEP_RESEARCH_RATE_LIMIT_PER_USER_PER_DAY: positiveIntFromEnv.default(5),
    REPO_ANALYSIS_RATE_LIMIT_PER_USER_PER_DAY: positiveIntFromEnv.default(10),
    GENERAL_AI_RATE_LIMIT_PER_USER_PER_HOUR: positiveIntFromEnv.default(60),
    RPG_RATE_LIMIT_PER_USER_PER_MINUTE: positiveIntFromEnv.default(20),
    MAX_USER_MEMORY_ITEMS: positiveIntFromEnv.default(1000),
    MAX_GROUP_MEMORY_ITEMS: positiveIntFromEnv.default(2000),
    MAX_USER_PROFILE_FACTS: positiveIntFromEnv.default(500),
    MAX_GROUP_PROFILE_FACTS: positiveIntFromEnv.default(800),
    MEMORY_REVIEW_INTERVAL_DAYS: positiveIntFromEnv.default(30),
    LOG_LEVEL: logLevelSchema
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV !== "test" && env.GEMINI_API_KEY.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "GEMINI_API_KEY is required outside test environments",
        path: ["GEMINI_API_KEY"]
      });
    }
  });

const envSchema = rawEnvSchema.transform((env) => ({
  ...env,
  OWNER_NUMBERS: parseOwnerNumbers(env.OWNER_NUMBERS),
  DEEP_RESEARCH_PLANNER_MODEL: env.DEEP_RESEARCH_PLANNER_MODEL || env.GEMINI_AI_MODEL,
  DEEP_RESEARCH_DETAIL_MODEL: env.DEEP_RESEARCH_DETAIL_MODEL || env.GEMINI_AI_MODEL,
  DEEP_RESEARCH_SOURCE_MODEL: env.DEEP_RESEARCH_SOURCE_MODEL || env.GEMINI_AI_MODEL,
  DEEP_RESEARCH_WRITER_MODEL: env.DEEP_RESEARCH_WRITER_MODEL || env.GEMINI_AI_MODEL,
  DEEP_RESEARCH_FACTCHECK_MODEL: env.DEEP_RESEARCH_FACTCHECK_MODEL || env.GEMINI_AI_MODEL,
  DEEP_RESEARCH_FINAL_MODEL: env.DEEP_RESEARCH_FINAL_MODEL || env.GEMINI_AI_MODEL
}));

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(source);
}

export function getSafeEnvSummary(env: AppEnv): Record<string, unknown> {
  return {
    botName: env.BOT_NAME,
    botPrefix: env.BOT_PREFIX,
    ownerCount: env.OWNER_NUMBERS.length,
    databaseDialect: env.DATABASE_DIALECT,
    publicStatusServer: env.PUBLIC_STATUS_SERVER,
    port: env.PORT,
    geminiApiVersion: env.GEMINI_API_VERSION,
    geminiAiModel: env.GEMINI_AI_MODEL,
    geminiFastModel: env.GEMINI_FAST_MODEL,
    geminiRpgModel: env.GEMINI_RPG_MODEL,
    deepResearchPlannerModel: env.DEEP_RESEARCH_PLANNER_MODEL,
    deepResearchDetailModel: env.DEEP_RESEARCH_DETAIL_MODEL,
    deepResearchSourceModel: env.DEEP_RESEARCH_SOURCE_MODEL,
    deepResearchWriterModel: env.DEEP_RESEARCH_WRITER_MODEL,
    deepResearchFactcheckModel: env.DEEP_RESEARCH_FACTCHECK_MODEL,
    deepResearchFinalModel: env.DEEP_RESEARCH_FINAL_MODEL,
    logLevel: env.LOG_LEVEL,
    nodeEnv: env.NODE_ENV
  };
}
