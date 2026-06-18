import { and, desc, eq, sql } from "drizzle-orm";
import type { DatabaseClient } from "../client.js";
import {
  aiCodeReviews,
  aiConversations,
  aiDeepResearchArtifacts,
  aiDeepResearchRuns,
  aiMessages,
  aiRepoFiles,
  aiRepoReports,
  aiResearchReports,
  aiResearchSources,
  geminiCalls
  ,
  groups,
  users
} from "../schema.js";
import { dedupeSources } from "../../ai/research-sources.js";
import type { ResearchSource } from "../../ai/deep-research.types.js";

export function createAiRepository(db: DatabaseClient) {
  return {
    async createConversation(input: typeof aiConversations.$inferInsert) {
      if (input.userId) {
        await db.insert(users).values({ id: input.userId, jidHash: input.userId }).onConflictDoNothing();
      }
      if (input.groupId) {
        await db.insert(groups).values({ id: input.groupId, jidHash: input.groupId }).onConflictDoNothing();
      }
      await db.insert(aiConversations).values(input);
      return db.query.aiConversations.findFirst({
        where: eq(aiConversations.id, input.id)
      });
    },
    async findConversationByScope(scope: "private" | "group", userId?: string, groupId?: string) {
      const filters = [eq(aiConversations.scope, scope)];
      if (userId) {
        filters.push(eq(aiConversations.userId, userId));
      }
      if (groupId) {
        filters.push(eq(aiConversations.groupId, groupId));
      }

      return db.query.aiConversations.findFirst({
        where: and(...filters)
      });
    },
    async createMessage(input: typeof aiMessages.$inferInsert) {
      await db.insert(aiMessages).values(input);
      return db.query.aiMessages.findFirst({ where: eq(aiMessages.id, input.id) });
    },
    async listMessages(conversationId: string, limit = 20) {
      return db.query.aiMessages.findMany({
        where: eq(aiMessages.conversationId, conversationId),
        orderBy: [desc(aiMessages.createdAt)],
        limit
      });
    },
    async clearConversationMessages(conversationId: string) {
      await db.delete(aiMessages).where(eq(aiMessages.conversationId, conversationId));
    },
    async createGeminiCall(input: typeof geminiCalls.$inferInsert) {
      await db.insert(geminiCalls).values(input);
      return db.query.geminiCalls.findFirst({
        where: eq(geminiCalls.id, input.id)
      });
    },
    async listGeminiCalls() {
      return db.query.geminiCalls.findMany();
    },
    async createResearchReport(input: typeof aiResearchReports.$inferInsert) {
      await db.insert(aiResearchReports).values(input);
      return db.query.aiResearchReports.findFirst({ where: eq(aiResearchReports.id, input.id) });
    },
    async createResearchSource(input: typeof aiResearchSources.$inferInsert) {
      await db.insert(aiResearchSources).values(input);
      return db.query.aiResearchSources.findFirst({ where: eq(aiResearchSources.id, input.id) });
    },
    async createDeepResearchRun(input: typeof aiDeepResearchRuns.$inferInsert) {
      await db.insert(aiDeepResearchRuns).values(input);
      return db.query.aiDeepResearchRuns.findFirst({ where: eq(aiDeepResearchRuns.id, input.id) });
    },
    async updateDeepResearchRun(
      runId: string,
      updates: Partial<typeof aiDeepResearchRuns.$inferInsert>
    ) {
      await db
        .update(aiDeepResearchRuns)
        .set({
          ...updates,
          updatedAt: sql`CURRENT_TIMESTAMP`
        })
        .where(eq(aiDeepResearchRuns.id, runId));

      return db.query.aiDeepResearchRuns.findFirst({ where: eq(aiDeepResearchRuns.id, runId) });
    },
    async createDeepResearchArtifact(input: typeof aiDeepResearchArtifacts.$inferInsert) {
      await db.insert(aiDeepResearchArtifacts).values(input);
      return db.query.aiDeepResearchArtifacts.findFirst({
        where: eq(aiDeepResearchArtifacts.id, input.id)
      });
    },
    async listDeepResearchArtifactsForRun(runId: string) {
      return db.query.aiDeepResearchArtifacts.findMany({
        where: eq(aiDeepResearchArtifacts.runId, runId),
        orderBy: [desc(aiDeepResearchArtifacts.createdAt)]
      });
    },
    async getLatestDeepResearchRunForConversation(conversationId: string) {
      return db
        .select()
        .from(aiDeepResearchRuns)
        .where(eq(aiDeepResearchRuns.conversationId, conversationId))
        .orderBy(desc(aiDeepResearchRuns.createdAt), sql`rowid desc`)
        .limit(1)
        .then((rows) => rows[0]);
    },
    async listLatestResearchSources(conversationId: string) {
      const latestReport = await db
        .select()
        .from(aiResearchReports)
        .where(eq(aiResearchReports.conversationId, conversationId))
        .orderBy(desc(aiResearchReports.createdAt), sql`rowid desc`)
        .limit(1)
        .then((rows) => rows[0]);

      if (!latestReport) {
        return [];
      }

      return db.query.aiResearchSources.findMany({
        where: eq(aiResearchSources.reportId, latestReport.id)
      });
    },
    async listLatestSourcesForConversation(conversationId: string, limit = 20): Promise<ResearchSource[]> {
      const latestReport = await db
        .select()
        .from(aiResearchReports)
        .where(eq(aiResearchReports.conversationId, conversationId))
        .orderBy(desc(aiResearchReports.createdAt), sql`rowid desc`)
        .limit(1)
        .then((rows) => rows[0]);
      const latestDeepRun = await db
        .select()
        .from(aiDeepResearchRuns)
        .where(
          and(
            eq(aiDeepResearchRuns.conversationId, conversationId),
            sql`${aiDeepResearchRuns.status} in ('completed', 'partial')`
          )
        )
        .orderBy(desc(aiDeepResearchRuns.createdAt), sql`rowid desc`)
        .limit(1)
        .then((rows) => rows[0]);

      const latestReportCreatedAt = latestReport?.createdAt ?? "";
      const latestRunCreatedAt = latestDeepRun?.createdAt ?? "";

      if (latestDeepRun && latestRunCreatedAt > latestReportCreatedAt) {
        const artifacts = await db.query.aiDeepResearchArtifacts.findMany({
          where: eq(aiDeepResearchArtifacts.runId, latestDeepRun.id)
        });
        const merged = dedupeSources(
          artifacts.flatMap((artifact) => {
            if (!artifact.sourcesJson) {
              return [];
            }

            try {
              const parsed = JSON.parse(artifact.sourcesJson) as ResearchSource[];
              return Array.isArray(parsed) ? parsed : [];
            } catch {
              return [];
            }
          })
        );

        return merged.slice(0, limit);
      }

      if (!latestReport) {
        return [];
      }

      const reportSources = await db.query.aiResearchSources.findMany({
        where: eq(aiResearchSources.reportId, latestReport.id)
      });

      return dedupeSources(
        reportSources.map((source) => ({
          title: source.title,
          url: source.url,
          ...(source.snippet ? { snippet: source.snippet } : {})
        }))
      ).slice(0, limit);
    },
    async listResearchReports() {
      return db.query.aiResearchReports.findMany();
    },
    async createRepoReport(input: typeof aiRepoReports.$inferInsert) {
      await db.insert(aiRepoReports).values(input);
      return db.query.aiRepoReports.findFirst({ where: eq(aiRepoReports.id, input.id) });
    },
    async createRepoFile(input: typeof aiRepoFiles.$inferInsert) {
      await db.insert(aiRepoFiles).values(input);
      return db.query.aiRepoFiles.findFirst({ where: eq(aiRepoFiles.id, input.id) });
    },
    async createCodeReview(input: typeof aiCodeReviews.$inferInsert) {
      await db.insert(aiCodeReviews).values(input);
      return db.query.aiCodeReviews.findFirst({ where: eq(aiCodeReviews.id, input.id) });
    },
    async listRepoReports() {
      return db.query.aiRepoReports.findMany();
    },
    async listRepoFiles(reportId: string) {
      return db.query.aiRepoFiles.findMany({ where: eq(aiRepoFiles.reportId, reportId) });
    },
    async listCodeReviews() {
      return db.query.aiCodeReviews.findMany();
    }
  };
}
