import { describe, expect, it, vi } from "vitest";
import { GitHubApiFetcher, parseGitHubUrl } from "../../src/ai/github.service.js";

describe("parseGitHubUrl", () => {
  it("accepts supported GitHub URLs", () => {
    expect(parseGitHubUrl("https://github.com/openai/openai-node")?.kind).toBe("repo");
    expect(parseGitHubUrl("https://github.com/openai/openai-node/tree/main")?.kind).toBe("tree");
    expect(parseGitHubUrl("https://github.com/openai/openai-node/blob/main/src/index.ts")?.kind).toBe("blob");
  });

  it("rejects non-GitHub and suspicious inputs", () => {
    expect(parseGitHubUrl("https://gitlab.com/openai/openai-node")).toBeNull();
    expect(parseGitHubUrl("C:\\repo")).toBeNull();
    expect(parseGitHubUrl("https://user:pass@github.com/openai/openai-node")).toBeNull();
  });
});

describe("GitHubApiFetcher", () => {
  it("fetches metadata, README, important files, and respects file size limits", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/repos/openai/openai-node")) {
        return new Response(
          JSON.stringify({
            full_name: "openai/openai-node",
            description: "SDK",
            default_branch: "main"
          }),
          { status: 200 }
        );
      }

      if (url.endsWith("/repos/openai/openai-node/readme")) {
        return new Response("# README", { status: 200, headers: { "content-length": "8" } });
      }

      if (url.endsWith("/git/trees/main?recursive=1")) {
        return new Response(
          JSON.stringify({
            tree: [
              { path: "README.md", type: "blob", size: 10 },
              { path: "package.json", type: "blob", size: 20 },
              { path: "src/index.ts", type: "blob", size: 15 },
              { path: "dist/big.js", type: "blob", size: 999999 }
            ]
          }),
          { status: 200 }
        );
      }

      if (url.includes("raw.githubusercontent.com")) {
        return new Response("file-content", { status: 200 });
      }

      return new Response("not found", { status: 404 });
    });

    const fetcher = new GitHubApiFetcher(fetchImpl as typeof fetch, 100);
    const snapshot = await fetcher.fetchRepoSnapshot({
      owner: "openai",
      repo: "openai-node",
      kind: "repo"
    });

    expect(snapshot.metadata.fullName).toBe("openai/openai-node");
    expect(snapshot.readme?.content).toBe("# README");
    expect(snapshot.files.some((file) => file.path === "package.json")).toBe(true);
    expect(snapshot.files.some((file) => file.path === "dist/big.js")).toBe(false);
  });
});
