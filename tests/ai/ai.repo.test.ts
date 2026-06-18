import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";
import { createSqliteConnection, initializeDatabaseSchema } from "../../src/db/client.js";
import { createAiRepository } from "../../src/db/repositories/ai.repo.js";
import { schema } from "../../src/db/schema.js";

function createRepo() {
  const sqlite = createSqliteConnection(":memory:");
  initializeDatabaseSchema(sqlite);
  const db = drizzle(sqlite, { schema });
  return createAiRepository(db);
}

describe("AI repository deep research persistence", () => {
  it("creates, updates, and retrieves deep research runs", async () => {
    const repo = createRepo();
    await repo.createConversation({
      id: "conv_1",
      scope: "private",
      userId: "user@s.whatsapp.net"
    });

    const created = await repo.createDeepResearchRun({
      id: "run_1",
      conversationId: "conv_1",
      query: "topic",
      status: "running"
    });
    expect(created?.status).toBe("running");

    const updated = await repo.updateDeepResearchRun("run_1", {
      status: "completed",
      finalReportMarkdown: "Final report",
      confidence: "medium"
    });
    expect(updated?.status).toBe("completed");
    expect(updated?.finalReportMarkdown).toBe("Final report");

    const latest = await repo.getLatestDeepResearchRunForConversation("conv_1");
    expect(latest?.id).toBe("run_1");
    expect(latest?.confidence).toBe("medium");
  });

  it("creates and lists deep research artifacts", async () => {
    const repo = createRepo();
    await repo.createConversation({
      id: "conv_1",
      scope: "private",
      userId: "user@s.whatsapp.net"
    });
    await repo.createDeepResearchRun({
      id: "run_1",
      conversationId: "conv_1",
      query: "topic",
      status: "running"
    });

    await repo.createDeepResearchArtifact({
      id: "artifact_1",
      runId: "run_1",
      stage: "planner",
      model: "planner-model",
      contentJson: "{\"topic\":\"x\"}",
      blocked: false
    });
    await repo.createDeepResearchArtifact({
      id: "artifact_2",
      runId: "run_1",
      stage: "detail",
      model: "detail-model",
      contentMarkdown: "detail text",
      sourcesJson: "[{\"title\":\"A\",\"url\":\"https://example.com/a\"}]",
      blocked: false
    });

    const artifacts = await repo.listDeepResearchArtifactsForRun("run_1");
    expect(artifacts).toHaveLength(2);
    expect(artifacts.map((artifact) => artifact.stage).sort()).toEqual(["detail", "planner"]);
  });
});
