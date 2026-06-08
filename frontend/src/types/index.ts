export interface BitbucketUser {
  name: string;
  displayName: string;
  emailAddress: string;
}

export interface CodeQualityScore {
  score: number;          // 0–100 composite (4 signals × 25%)
  bugRatio: number;       // 0–1 (informational only)
  criticalScore: number | null; // null = no Jira issues in period; 0–100 otherwise
  approvalScore: number | null; // null = no merged PRs in period; 0–100 otherwise
  prFocusScore: number | null;  // null = no merged PRs in period; 0–100 otherwise
  reworkRate: number;     // avg RESCOPED events per PR
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
  cycleTimeHrs: number;
  pickupDelayHrs: number;
  reviewLifecycleHrs: number;
  reviewDepth: number;
  avgPrSizeLines: number;
  openPrsOverThreshold: number;
  prsReviewed: number;
  workType: {
    features: number;
    bugs: number;
    infraOrDebt: number;
  };
  codeQuality: CodeQualityScore;
  prs: PRSummary[];
}

// Matches RepoTarget on the backend
export interface RepoTarget {
  projectKey: string;
  repoSlug:   string;
}

export interface DashboardQueryPayload {
  developerIds:      string[];
  startDate:         string;
  endDate:           string;
  repoTargets?:      RepoTarget[]; // Tier 1: full [projectKey, repoSlug] chips
  projectKeys?:      string[];     // Tier 2: project keys only
  compareStartDate?: string;       // optional — enables period-over-period delta
  compareEndDate?:   string;
}

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

export interface SavedSession {
  users:       string[];
  repoTargets: RepoTarget[];
  projects:    string[];
  startDate:   string;
  endDate:     string;
}

// ── Sync job types ────────────────────────────────────────────────────────────

export interface SyncStatus {
  running:          boolean;
  lastRunAt:        number | null;
  nextRunAt:        number | null;
  runStartedAt:     number | null;
  activeUsers:      string[];
  completedUsers:   string[];
  failedUsers:      string[];
  totalSyncUsers:   number;
  configuredUsers:  string[];
  intervalMinutes:  number;
  scheduledTime:    string; // HH:MM (24h); empty = no wall-clock alignment
}

export interface SyncConfig {
  developerIds:    string[];
  intervalMinutes: number;
  scheduledTime?:  string; // HH:MM (24h); optional
}

export interface SyncBatchLog {
  batchIndex:  number;
  userIds:     string[];
  startedAt:   string | number;
  finishedAt:  string | number;
  durationMs:  number;
  status:      'ok' | 'error';
  error?:      string;
  source?:     'live' | 'cache';
}

export interface CacheCoverage {
  configuredUsers: number;
  cachedUsers:     number;
  uncachedUsers:   string[];
  staleUsers:      string[];
}

export interface WarmupResult {
  skipped:     number;
  queued:      number;
  queuedUsers: string[];
}

export interface SyncRunLog {
  runId:      string;
  startedAt:  string | number;
  finishedAt: string | number;
  durationMs: number;
  totalUsers: number;
  batches:    SyncBatchLog[];
}

export interface DashboardState {
  selectedUsers:       string[];
  selectedRepoTargets: RepoTarget[]; // Tier 1 chips
  selectedProjects:    string[];     // Tier 2 pills
  startDate:           string;
  endDate:             string;
  compareStartDate:    string;
  compareEndDate:      string;
  dashboardData:       MetricsResult | null;
  isLoading:           boolean;
  errorMessage:        string | null;
  savedSession:        SavedSession | null;
}
