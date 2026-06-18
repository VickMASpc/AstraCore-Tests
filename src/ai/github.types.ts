export type ParsedGitHubUrl = {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
  kind: "repo" | "tree" | "blob";
};

export type GitHubRepoFile = {
  path: string;
  content: string;
  size: number;
};

export type GitHubRepoSnapshot = {
  metadata: { fullName: string; description?: string; defaultBranch: string };
  readme?: GitHubRepoFile;
  files: GitHubRepoFile[];
};

export interface GitHubFetcher {
  fetchRepoSnapshot(url: ParsedGitHubUrl): Promise<GitHubRepoSnapshot>;
}
