import { z } from "zod";
import type { GeminiService } from "../gemini/gemini.client.js";
import type { IncomingMessageContext } from "../router/command.types.js";
import { createId } from "../utils/ids.js";
import type { GitHubFetcher, GitHubRepoFile, GitHubRepoSnapshot, ParsedGitHubUrl } from "./github.types.js";

type AiRepository = ReturnType<typeof import("../db/repositories/ai.repo.js").createAiRepository>;

const GITHUB_HOST = "github.com";
const REPO_URL_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/(tree|blob)\/([^/]+)(?:\/(.+))?)?\/?$/i;

export function parseGitHubUrl(input: string): ParsedGitHubUrl | null {
  if (!input.startsWith("https://github.com/")) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  if (url.hostname !== GITHUB_HOST || url.username || url.password) {
    return null;
  }

  const match = input.match(REPO_URL_RE);
  if (!match) {
    return null;
  }

  const [, owner, repo, kind, branch, path] = match;
  if (!owner || !repo) {
    return null;
  }
  return {
    owner,
    repo,
    kind: (kind as "tree" | "blob" | undefined) ?? "repo",
    ...(branch ? { branch } : {}),
    ...(path ? { path } : {})
  };
}

function isImportantFile(path: string): boolean {
  const lowered = path.toLowerCase();
  return [
    "readme",
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "dockerfile",
    "docker-compose",
    "tsconfig",
    "vite.config",
    "next.config",
    "vercel.json",
    "drizzle",
    "schema",
    "src/",
    "test",
    "auth",
    "security"
  ].some((needle) => lowered.includes(needle));
}

export class GitHubApiFetcher implements GitHubFetcher {
  public constructor(private readonly fetchImpl: typeof fetch = fetch, private readonly maxFileBytes = 20_000) {}

  public async fetchRepoSnapshot(url: ParsedGitHubUrl): Promise<GitHubRepoSnapshot> {
    const repoBase = `https://api.github.com/repos/${url.owner}/${url.repo}`;
    const metadataResponse = await this.fetchImpl(repoBase, {
      headers: { Accept: "application/vnd.github+json" }
    });
    if (!metadataResponse.ok) {
      throw new Error(`GitHub metadata fetch failed: ${metadataResponse.status}`);
    }
    const metadataJson = (await metadataResponse.json()) as {
      full_name: string;
      description?: string;
      default_branch: string;
    };

    const readmeResponse = await this.fetchImpl(`${repoBase}/readme`, {
      headers: { Accept: "application/vnd.github.raw+json" }
    });
    const readme = readmeResponse.ok
      ? {
          path: "README",
          content: await readmeResponse.text(),
          size: Number(readmeResponse.headers.get("content-length") ?? 0)
        }
      : undefined;

    const branch = url.branch ?? metadataJson.default_branch;
    const treeResponse = await this.fetchImpl(`${repoBase}/git/trees/${branch}?recursive=1`, {
      headers: { Accept: "application/vnd.github+json" }
    });
    if (!treeResponse.ok) {
      throw new Error(`GitHub tree fetch failed: ${treeResponse.status}`);
    }
    const treeJson = (await treeResponse.json()) as {
      tree: Array<{ path: string; type: string; size?: number }>;
    };

    const selectedPaths = treeJson.tree
      .filter((entry) => entry.type === "blob" && isImportantFile(entry.path))
      .slice(0, 25);

    const files: GitHubRepoFile[] = [];
    for (const entry of selectedPaths) {
      if ((entry.size ?? 0) > this.maxFileBytes) {
        continue;
      }
      const contentResponse = await this.fetchImpl(
        `https://raw.githubusercontent.com/${url.owner}/${url.repo}/${branch}/${entry.path}`
      );
      if (!contentResponse.ok) {
        continue;
      }
      files.push({
        path: entry.path,
        content: await contentResponse.text(),
        size: entry.size ?? 0
      });
    }

    return {
      metadata: {
        fullName: metadataJson.full_name,
        ...(metadataJson.description ? { description: metadataJson.description } : {}),
        defaultBranch: metadataJson.default_branch
      },
      ...(readme ? { readme } : {}),
      files
    };
  }
}

export class RepoAnalysisService {
  public constructor(
    private readonly repo: AiRepository,
    private readonly gemini: GeminiService,
    private readonly fetcher: GitHubFetcher
  ) {}

  public async analyze(context: IncomingMessageContext, rawUrl: string, reviewMode = false) {
    const parsed = parseGitHubUrl(rawUrl);
    if (!parsed) {
      return "Only public GitHub URLs are supported.";
    }

    const conversation = await this.ensureConversation(context);
    const snapshot = await this.fetcher.fetchRepoSnapshot(parsed);
    const prompt = this.buildRepoPrompt(parsed, snapshot, reviewMode);
    const response = await this.gemini.generateText({
      feature: "ai",
      contents: prompt,
      systemInstruction:
        "Synthesize strictly from the fetched repository content provided. Do not assume private repo access. Do not execute code."
    });
    const report = reviewMode
      ? `Review Findings\nHigh/Medium/Low findings expected.\n${response.text}`
      : `Repository Analysis\n${response.text}`;

    const stored = await this.repo.createRepoReport({
      id: createId("repo"),
      conversationId: conversation.id,
      repoUrl: rawUrl,
      reportMarkdown: report
    });
    if (stored) {
      for (const file of snapshot.files) {
        await this.repo.createRepoFile({
          id: createId("rfile"),
          reportId: stored.id,
          filePath: file.path,
          summary: file.content.slice(0, 500)
        });
      }
    }

    if (reviewMode) {
      await this.repo.createCodeReview({
        id: createId("review"),
        conversationId: conversation.id,
        subject: rawUrl,
        reviewMarkdown: report
      });
    }

    return report;
  }

  public async reviewCode(context: IncomingMessageContext, code: string) {
    const conversation = await this.ensureConversation(context);
    const response = await this.gemini.generateText({
      feature: "ai",
      contents: `Static review only. Do not execute anything.\nCode:\n${code}`,
      systemInstruction:
        "Return severity findings first, then a short summary. Do not claim execution."
    });
    const report = `Review Findings\n${response.text}`;
    await this.repo.createCodeReview({
      id: createId("review"),
      conversationId: conversation.id,
      subject: "pasted_code",
      reviewMarkdown: report
    });
    return report;
  }

  private buildRepoPrompt(parsed: ParsedGitHubUrl, snapshot: GitHubRepoSnapshot, reviewMode: boolean) {
    const filesBlock = snapshot.files
      .map((file) => `FILE: ${file.path}\n${file.content.slice(0, 4_000)}`)
      .join("\n\n");
    return [
      `Repository: ${parsed.owner}/${parsed.repo}`,
      `Mode: ${reviewMode ? "review" : "analysis"}`,
      `Description: ${snapshot.metadata.description ?? "n/a"}`,
      snapshot.readme ? `README:\n${snapshot.readme.content.slice(0, 4_000)}` : "README: missing",
      `Fetched files:\n${filesBlock}`
    ].join("\n\n");
  }

  private async ensureConversation(context: IncomingMessageContext) {
    const scope = context.isGroup ? "group" : "private";
    const existing = await this.repo.findConversationByScope(
      scope,
      scope === "private" ? context.senderJid : undefined,
      scope === "group" ? context.groupJid : undefined
    );
    if (existing) {
      return existing;
    }
    const created = await this.repo.createConversation({
      id: createId("conv"),
      scope,
      userId: scope === "private" ? context.senderJid : undefined,
      groupId: scope === "group" ? context.groupJid : undefined
    });
    if (!created) {
      throw new Error("Failed to create repo analysis conversation.");
    }
    return created;
  }
}
