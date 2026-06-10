import type { RepoTarget, IssueLinkingMode } from "../../types/index.js";
import type { LlmProvider } from "../../AI/providers/llmProvider.js";

export type { RepoTarget, IssueLinkingMode };

export interface AppConfig {
  jiraBaseUrl: string;
  jiraToken: string;
  bitbucketBaseUrl: string;
  bitbucketToken: string;
  apiKey: string;
  allowedOrigin: string;
  botUserPattern: string;
  stalePrThresholdDays: number;
  port: number;
  jiraPageSize: number;
  metricsConcurrency: number;
  /** Max simultaneous in-flight HTTP requests to Bitbucket/Jira (global semaphore). */
  httpConcurrency: number;
  /** Axios request timeout in milliseconds. */
  httpTimeoutMs: number;
  /** Max concurrent repo-level API calls per developer aggregation. */
  repoConcurrency: number;
  /** Root directory for the JSON file cache. */
  cacheDir: string;
  /** Number of months of cache to retain before eviction. */
  cacheRetentionMonths: number;
  /** Tier 1: full PROJECT/repo-slug pairs from BITBUCKET_PROJECTS. Empty = fall to tier 2/3. */
  repoTargets: RepoTarget[];
  /** Tier 2: project keys from BITBUCKET_PROJECT_KEYS. Empty = fall to tier 3. */
  bitbucketProjectKeys: string[];
  /** Whether AI-generated narrative summaries are enabled. */
  aiInsightsEnabled: boolean;
  /** Which LLM provider to use when AI insights are enabled. */
  aiProvider: LlmProvider;
  /** API key for the selected provider. Empty string when disabled. */
  aiApiKey: string;
  /** Comma-separated slugs to pre-compute metrics for on the scheduled sync job. */
  syncDeveloperIds: string[];
  /** How often the background sync job runs, in minutes. 0 = disabled. */
  syncIntervalMinutes: number;
  /** Whether spec-driven metrics (phased lead time, spec regressions) are computed. */
  specMetricsEnabled: boolean;
  /** Jira status name (case-insensitive) that marks a spec as approved/locked. */
  specApprovedStatus: string;
  /** Jira status name (case-insensitive) that marks the start of verification/QA. */
  specVerificationStatus: string;
  /** Jira status name (case-insensitive) that marks a ticket as fully done. */
  specDoneStatus: string;
  /** Jira status name (case-insensitive) that means blocked/awaiting clarification. */
  specBlockedStatus: string;
  /** How Jira issues are discovered for work-type and code-quality metrics. */
  issueLinkingMode: IssueLinkingMode;
  /** File path for the persistent SQLite application store. */
  appStorePath: string;
}

let cached: AppConfig | null = null;

export function _resetConfigForTesting(): void {
  cached = null;
}

export function parseIssueLinkingMode(raw: string): IssueLinkingMode {
  const v = raw.trim().toLowerCase();
  if (v === 'connector' || v === 'assignee' || v === 'hybrid') return v;
  throw new Error(
    `Invalid JIRA_ISSUE_LINKING_MODE "${raw}": expected connector, assignee, or hybrid`,
  );
}

export function getConfig(): AppConfig {
  if (cached) return cached;

  const required = [
    "JIRA_BASE_URL",
    "JIRA_TOKEN",
    "BITBUCKET_BASE_URL",
    "BITBUCKET_TOKEN",
    "API_KEY",
  ] as const;
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }

  const repoTargets = parseRepoTargets(process.env.BITBUCKET_PROJECTS ?? "");
  const bitbucketProjectKeys = parseKeys(
    process.env.BITBUCKET_PROJECT_KEYS ?? "",
  );

  cached = {
    jiraBaseUrl: process.env.JIRA_BASE_URL!.replace(/\/$/, ""),
    jiraToken: process.env.JIRA_TOKEN!,
    bitbucketBaseUrl: process.env.BITBUCKET_BASE_URL!.replace(/\/$/, ""),
    bitbucketToken: process.env.BITBUCKET_TOKEN!,
    apiKey: process.env.API_KEY!,
    allowedOrigin: process.env.ALLOWED_ORIGIN ?? "http://localhost:5173",
    botUserPattern:
      process.env.BOT_USER_PATTERN ??
      "sonarqube|jenkins|deploymentbot|renovate|dependabot|buildbot|ci-bot",
    stalePrThresholdDays: parseInt(
      process.env.STALE_PR_THRESHOLD_DAYS ?? "3",
      10,
    ),
    port: parseInt(process.env.PORT ?? "3000", 10),
    jiraPageSize: parseInt(process.env.JIRA_PAGE_SIZE ?? "500", 10),
    metricsConcurrency: parseInt(process.env.METRICS_CONCURRENCY ?? "3", 10),
    httpConcurrency: parseInt(process.env.HTTP_CONCURRENCY ?? "12", 10),
    httpTimeoutMs: parseInt(process.env.HTTP_TIMEOUT_MS ?? "60000", 10),
    repoConcurrency: parseInt(process.env.REPO_CONCURRENCY ?? "4", 10),
    cacheDir: process.env.CACHE_DIR ?? "data/cache",
    cacheRetentionMonths: parseInt(
      process.env.CACHE_RETENTION_MONTHS ?? "6",
      10,
    ),
    repoTargets,
    bitbucketProjectKeys,
    aiInsightsEnabled: process.env.AI_INSIGHTS_ENABLED === "true",
    aiProvider: parseProvider(process.env.AI_PROVIDER ?? "anthropic"),
    aiApiKey: process.env.AI_API_KEY ?? "",
    syncDeveloperIds: parseKeys(process.env.SYNC_DEVELOPER_IDS ?? ""),
    syncIntervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES ?? "0", 10),
    specMetricsEnabled: process.env.SPEC_METRICS_ENABLED === "true",
    specApprovedStatus: process.env.SPEC_APPROVED_STATUS ?? "spec approved",
    specVerificationStatus: process.env.SPEC_VERIFICATION_STATUS ?? "verification",
    specDoneStatus: process.env.SPEC_DONE_STATUS ?? "done",
    specBlockedStatus: process.env.SPEC_BLOCKED_STATUS ?? "blocked",
    issueLinkingMode: parseIssueLinkingMode(process.env.JIRA_ISSUE_LINKING_MODE ?? "hybrid"),
    appStorePath: process.env.APP_STORE_PATH ?? "data/cache/app-store.sqlite",
  };

  return cached;
}

// Parses "SS/react-Test,SS/core" → [{projectKey:"SS",repoSlug:"react-Test"}, ...]
function parseRepoTargets(raw: string): RepoTarget[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const slash = entry.indexOf("/");
      if (slash < 1) return null;
      const projectKey = entry.slice(0, slash).trim();
      const repoSlug = entry.slice(slash + 1).trim();
      if (!projectKey || !repoSlug) return null;
      return { projectKey, repoSlug };
    })
    .filter((t): t is RepoTarget => t !== null);
}

function parseKeys(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseProvider(raw: string): LlmProvider {
  const v = raw.toLowerCase().trim();
  if (v === "openai" || v === "gemini" || v === "anthropic") return v;
  return "anthropic";
}
