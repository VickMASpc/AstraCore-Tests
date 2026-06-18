import { and, desc, eq } from "drizzle-orm";
import type { DatabaseClient } from "../client.js";
import {
  aiCodeReviews,
  aiConversations,
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
    async listLatestResearchSources(conversationId: string) {
      const latestReport = await db.query.aiResearchReports.findFirst({
        where: eq(aiResearchReports.conversationId, conversationId),
        orderBy: [desc(aiResearchReports.createdAt)]
      });

      if (!latestReport) {
        return [];
      }

      return db.query.aiResearchSources.findMany({
        where: eq(aiResearchSources.reportId, latestReport.id)
      });
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
