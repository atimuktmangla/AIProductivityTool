// ─── Public API types ────────────────────────────────────────────────────────

export interface RepoTarget {
  projectKey: string;
  repoSlug: string;
}

export interface BitbucketUser {
  name: string;          // slug / login — used as developer ID on-prem
  displayName: string;
  emailAddress: string;
}

export interface CodeQualityScore {
  score: number;                // 0–100 composite (only signals with data are weighted in)
  bugRatio: number;             // bugs / total issues (0–1); informational only
  criticalScore: number | null; // null = no Jira issues in period; 0–100 otherwise
  approvalScore: number | null; // null = no merged PRs in period; 0–100 otherwise
  prFocusScore: number | null;  // null = no merged PRs in period; 0–100 otherwise
  reworkRate: number;           // avg RESCOPED events per PR (used for exponential penalty)
}

export interface PRSummary {
  id:             number;
  title:          string;
  projectKey:     string;
  repoSlug:       string;
  state:          'MERGED' | 'OPEN' | 'DECLINED';
  createdDate:    number;  // epoch ms
  closedDate?:    number;  // epoch ms
  linesAdded:     number;
  linesRemoved:   number;
  cycleTimeHrs:   number;
  pickupDelayHrs: number;
  reviewDepth:    number;
  url:            string;
}

export interface AggregatedDeveloperMetric {
  developerId: string;
  name: string;
  totalCommits: number;
  totalPRs: number;
  linesChanged: { added: number; deleted: number };
  cycleTimeHrs: number;          // avg working hours from PR creation to merge (leave-adjusted)
  pickupDelayHrs: number;        // avg working hours from PR creation to first reviewer action
  reviewLifecycleHrs: number;    // avg working hours from first comment to merge
  reviewDepth: number;           // avg human review actions per PR
  avgPrSizeLines: number;        // avg (linesAdded + linesDeleted) per merged PR
  openPrsOverThreshold: number;  // count of open PRs older than stalePrThresholdDays business days
  prsReviewed: number;           // count of merged PRs authored by others where this dev was a reviewer
  workType: {
    features: number;
    bugs: number;
    infraOrDebt: number;
  };
  codeQuality: CodeQualityScore;
  prs: PRSummary[];
}

export interface DashboardQueryPayload {
  developerIds:       string[];
  startDate:          string;       // YYYY-MM-DD
  endDate:            string;       // YYYY-MM-DD
  repoTargets?:       RepoTarget[]; // Tier 1: explicit [projectKey, repoSlug] pairs from UI chips
  projectKeys?:       string[];     // Tier 2: project keys from UI pills — repos discovered + filtered
  // Tier 3 (implicit): both absent → auto-discover from user profile
  compareStartDate?:  string;       // YYYY-MM-DD — when present, also returns previous period data
  compareEndDate?:    string;       // YYYY-MM-DD
}

// ─── Bitbucket Server (Stash) raw API shapes (/rest/api/1.0) ────────────────

export interface BitbucketPagedResponse<T> {
  values: T[];
  size: number;
  limit: number;
  isLastPage: boolean;
  nextPageStart?: number;
  start: number;
}

export interface RawCommit {
  id: string;
  displayId: string;
  author: BitbucketUser;
  authorTimestamp: number; // epoch ms
  message: string;
}

export interface RawPullRequest {
  id: number;
  title: string;
  state: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED';
  author: { user: BitbucketUser };
  createdDate: number;
  updatedDate: number;
  closedDate?: number;
  fromRef: { repository: { slug: string; project: { key: string } } };
  toRef:   { repository: { slug: string; project: { key: string } } };
  links: { self: Array<{ href: string }> };
}

export interface RawActivity {
  id: number;
  createdDate: number;
  action: 'OPENED' | 'MERGED' | 'DECLINED' | 'COMMENTED' | 'REVIEWED' | 'RESCOPED' | 'APPROVED' | 'UNAPPROVED';
  user: BitbucketUser;
  comment?: { text: string };
}

export interface RawDiffStat {
  linesAdded: number;
  linesRemoved: number;
}

// ─── Jira Server raw API shapes (/rest/api/2) ────────────────────────────────

export interface RawJiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    issuetype: { name: string };
    status: { name: string };
    assignee: { name: string; displayName: string; emailAddress: string } | null;
    created: string;
    updated: string;
    resolutiondate: string | null;
    labels: string[] | null; // Jira Server returns null for labelless issues
  };
}

export interface JiraSearchResponse {
  issues: RawJiraIssue[];
  total: number;
  maxResults: number;
  startAt: number;
}

// ─── Insights ────────────────────────────────────────────────────────────────

export interface TeamInsights {
  topContributor:    string;
  bottleneck:        'pickup' | 'review' | 'none';
  bottleneckDetail:  string;
  workTypeImbalance: boolean;
  workTypeDetail:    string;
  teamHealthScore:   number;
  summary:           string;
  aiGenerated:       boolean;
  aiProvider?:       string;
}

export interface MetricsResult {
  current:      AggregatedDeveloperMetric[];
  previous?:    AggregatedDeveloperMetric[];
  insights?:    TeamInsights;
  cacheStatus?: 'full' | 'partial' | 'none';
  cachedAt?:    number; // epoch ms of oldest cache entry used
}

// ─── Internal ────────────────────────────────────────────────────────────────

export interface PRReference {
  projectKey: string;
  repoSlug: string;
  prId: number;
}
