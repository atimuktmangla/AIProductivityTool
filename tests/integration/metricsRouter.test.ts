import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initInMemoryDb, _resetForTesting } from '../../databaselayer/store/inMemoryDb.js';
import express from 'express';
import { metricsRouter } from '../../api/routes/metricsRouter.js';
import { errorHandler } from '../../api/middleware/errorHandler.js';
import { AtlassianHttpError } from '../../databaselayer/errors/AtlassianHttpError.js';
import type { AggregatedDeveloperMetric } from '../../types/index.js';

// ── Mock the HTTP client layer ────────────────────────────────────────────────
vi.mock('../../databaselayer/client/atlassianFetch.js', () => ({
  atlassianGet:  vi.fn(),
  atlassianPost: vi.fn(),
}));

// ── Mock the cache layer — delegate straight to the live service fns so the
//    existing atlassianGet mock handles everything without touching the filesystem.
vi.mock('../../databaselayer/cache/bitbucketCache.js', async () => {
  const svc = await import('../../databaselayer/services/bitbucketService.js');
  return {
    getCachedCommitsByAuthor:  svc.getCommitsByAuthor,
    getCachedMergedPRsByAuthor: (projectKey: string, repoSlug: string, authorSlug: string, startDate: string) =>
      svc.getMergedPullRequestsByAuthor(projectKey, repoSlug, authorSlug, startDate),
    getCachedPRDetails: (projectKey: string, repoSlug: string, pr: { id: number }) =>
      Promise.all([
        svc.getPRActivities(projectKey, repoSlug, pr.id),
        svc.getPRDiffStat(projectKey, repoSlug, pr.id),
      ]).then(([activities, diff]) => ({ activities, diff })),
  };
});

// ── Mock env so getConfig() doesn't throw ────────────────────────────────────
vi.mock('../../backend/config/env.js', () => ({
  getConfig: () => ({
    jiraBaseUrl:             'http://jira.local',
    jiraToken:               'jira-token',
    bitbucketBaseUrl:        'http://bb.local',
    bitbucketToken:          'bb-token',
    apiKey:                  'test-api-key',
    allowedOrigin:           'http://localhost:5173',
    port:                    3000,
    jiraPageSize:            500,
    metricsConcurrency:      3,
    httpConcurrency:         12,
    httpTimeoutMs:           60000,
    repoConcurrency:         4,
    stalePrThresholdDays:    3,
    botUserPattern:          'bot',
    aiInsightsEnabled:       false,
    aiProvider:              'anthropic',
    aiApiKey:                '',
    cacheDir:                'data/cache',
    cacheRetentionMonths:    6,
    repoTargets:             [{ projectKey: 'SS', repoSlug: 'api' }],
    bitbucketProjectKeys:    [],
  }),
}));

import { atlassianGet, atlassianPost } from '../../databaselayer/client/atlassianFetch.js';

const mockedGet  = vi.mocked(atlassianGet);
const mockedPost = vi.mocked(atlassianPost);

// ── App factory (no global rate-limiter — test each in isolation) ─────────────
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/dashboard', metricsRouter);
  app.use(errorHandler);
  return app;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function post(app: ReturnType<typeof buildApp>, path: string, body: unknown) {
  const { default: supertest } = await import('supertest');
  return supertest(app).post(path).send(body).set('Content-Type', 'application/json');
}

// ── Minimal Bitbucket mock responses ─────────────────────────────────────────
const emptyPage = { values: [], isLastPage: true, size: 0, limit: 100, start: 0 };

function setupHappyPath() {
  mockedGet.mockImplementation(async (_base, _token, path) => {
    if (path.includes('/commits'))       return emptyPage;
    if (path.includes('/pull-requests')) return emptyPage;
    if (path.includes('/profile'))       return emptyPage;
    if (path.includes('/projects'))      return { values: [{ key: 'SS' }], isLastPage: true, size: 1, limit: 100, start: 0 };
    if (path.includes('/repos'))         return { values: [{ slug: 'api', project: { key: 'SS' } }], isLastPage: true, size: 1, limit: 100, start: 0 };
    if (path.includes('/admin/users'))   return { values: [{ name: 'alice', displayName: 'Alice', emailAddress: 'alice@example.com' }], isLastPage: true, size: 1, limit: 100, start: 0 };
    return emptyPage;
  });
  mockedPost.mockResolvedValue({ issues: [], total: 0, maxResults: 500, startAt: 0 });
}

describe('POST /api/dashboard/metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTesting();
    initInMemoryDb();
  });

  // @req REQ-4.4.1-1 REQ-4.4.2-1 REQ-4.4.3-1
  it('200 with MetricsResult for valid payload', async () => {
    setupHappyPath();
    const app = buildApp();
    const res = await post(app, '/api/dashboard/metrics', {
      developerIds: ['alice'],
      startDate:    '2024-01-01',
      endDate:      '2024-01-31',
    });
    expect(res.status).toBe(200);
    const body = res.body as { current: AggregatedDeveloperMetric[] };
    expect(Array.isArray(body.current)).toBe(true);
    expect(body.current.every((m) => typeof m.developerId === 'string')).toBe(true);
  });

  // @req REQ-4.9-1 REQ-4.7-3
  it('400 when developerIds is missing', async () => {
    const app = buildApp();
    const res = await post(app, '/api/dashboard/metrics', {
      startDate: '2024-01-01',
      endDate:   '2024-01-31',
    });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // @req REQ-4.9-1 REQ-4.7-3
  it('400 when developerIds is empty', async () => {
    const app = buildApp();
    const res = await post(app, '/api/dashboard/metrics', {
      developerIds: [],
      startDate:    '2024-01-01',
      endDate:      '2024-01-31',
    });
    expect(res.status).toBe(400);
  });

  // @req REQ-4.7-1
  it('502 with credential hint when Jira returns 401', async () => {
    // atlassianGet happy path (Bitbucket); atlassianPost (Jira search) throws 401
    mockedGet.mockImplementation(async (_base, _token, path) => {
      if (path.includes('/commits'))       return emptyPage;
      if (path.includes('/pull-requests')) return emptyPage;
      if (path.includes('/profile'))       return emptyPage;
      return emptyPage;
    });
    mockedPost.mockRejectedValue(
      new AtlassianHttpError(401, 'Unauthorized', 'Bad token', 'http://jira.local/rest/api/2/search'),
    );

    const app = buildApp();
    const res = await post(app, '/api/dashboard/metrics', {
      developerIds: ['alice'],
      startDate:    '2024-01-01',
      endDate:      '2024-01-31',
    });
    expect(res.status).toBe(502);
    expect((res.body as { detail?: string }).detail).toMatch(/JIRA_TOKEN|BITBUCKET_TOKEN/i);
  });

  // @req REQ-4.7-4
  it('429 on the 11th request within the metrics rate-limit window', async () => {
    setupHappyPath();
    const app = buildApp();
    const payload = { developerIds: ['alice'], startDate: '2024-01-01', endDate: '2024-01-31' };

    // Fire 10 requests (metricsRateLimiter allows max 10)
    for (let i = 0; i < 10; i++) {
      await post(app, '/api/dashboard/metrics', payload);
    }
    const res = await post(app, '/api/dashboard/metrics', payload);
    expect(res.status).toBe(429);
  });
});
