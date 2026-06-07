import { Router, type Request, type Response, type NextFunction } from 'express';
import { getAllUsers, getAllProjectKeys, getReposInProjectPublic } from '../../DB/services/bitbucketService.js';
import { aggregateMetrics } from '../../BL/metrics/aggregator.js';
import { validateMetrics } from '../../BL/evals/metricsValidator.js';
import { generateInsightsSummary } from '../../AI/skills/insightsSummary.js';
import { metricsRateLimiter } from '../guardrails/rateLimiter.js';
import { sanitiseMetricsPayload } from '../guardrails/sanitiser.js';
import { getConfig } from '../../BL/config/env.js';
import { getCachedMetrics } from '../../DB/cache/metricsCache.js';
import type { DashboardQueryPayload, MetricsResult } from '../../types/index.js';

const METRICS_CACHE_TTL_MS = 60 * 60 * 1000; // serve pre-computed results for up to 1 hour

export const metricsRouter = Router();

// ── GET /api/dashboard/users ──────────────────────────────────────────────────
metricsRouter.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await getAllUsers();
    const start = Math.max(0, Number(req.query.start ?? 0) || 0);
    const limit = Number(req.query.limit ?? 0) || 0;
    res.json(limit > 0 ? users.slice(start, start + limit) : users.slice(start));
  } catch (err) {
    next(err);
  }
});

// ── GET /api/dashboard/projects ───────────────────────────────────────────────
// Always returns ALL projects from Bitbucket for the UI picker.
metricsRouter.get('/projects', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const keys = await getAllProjectKeys();
    res.json(keys);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/dashboard/repos?projectKeys=A,B ─────────────────────────────────
metricsRouter.get('/repos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const raw = typeof req.query.projectKeys === 'string' ? req.query.projectKeys : '';
    const keys = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (keys.length === 0) {
      res.status(400).json({ error: 'projectKeys query param is required' });
      return;
    }
    const slugsPerProject = await Promise.all(keys.map(getReposInProjectPublic));
    const repos = keys.flatMap((key, i) =>
      slugsPerProject[i].map((slug) => ({ projectKey: key, repoSlug: slug })),
    );
    res.json(repos);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/dashboard/metrics ───────────────────────────────────────────────
metricsRouter.post(
  '/metrics',
  metricsRateLimiter,
  sanitiseMetricsPayload,
  async (req: Request, res: Response, next: NextFunction) => {
    const body = req.body as Partial<DashboardQueryPayload>;

    const validationError = validatePayload(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    try {
      const payload = body as DashboardQueryPayload;

      // Serve pre-computed result from sync job cache when available and fresh.
      // Supports partial hits: cached devs are returned immediately; uncached devs
      // are computed live and merged in. Skip when a compare period is requested.
      if (!payload.compareStartDate) {
        const { hits, misses, oldestCachedAt } = await getCachedMetrics(
          payload.developerIds,
          payload.startDate,
          payload.endDate,
          METRICS_CACHE_TTL_MS,
        );
        if (misses.length === 0 && hits.length > 0) {
          // Full cache hit — return without any live computation
          const result: MetricsResult = { current: hits, cacheStatus: 'full', cachedAt: oldestCachedAt };
          const { aiInsightsEnabled } = getConfig();
          if (aiInsightsEnabled) result.insights = await generateInsightsSummary(hits);
          res.json(result);
          return;
        }
        if (hits.length > 0 && misses.length > 0) {
          // Partial hit — compute only the missing developers, then merge
          const partial = await aggregateMetrics({ ...payload, developerIds: misses });
          validateMetrics(partial.current);
          const merged = [...hits, ...partial.current];
          const result: MetricsResult = { current: merged, cacheStatus: 'partial', cachedAt: oldestCachedAt };
          const { aiInsightsEnabled } = getConfig();
          if (aiInsightsEnabled) result.insights = await generateInsightsSummary(merged);
          res.json(result);
          return;
        }
      }

      const result: MetricsResult = await aggregateMetrics(payload);

      // Eval — sanity-check output; warnings are logged, never block the response
      validateMetrics(result.current);

      // Attach AI insights when enabled — failures fall back to rule-based silently
      const { aiInsightsEnabled } = getConfig();
      if (aiInsightsEnabled) {
        result.insights = await generateInsightsSummary(result.current);
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /api/dashboard/insights  (standalone AI skill endpoint) ──────────────
metricsRouter.post(
  '/insights',
  metricsRateLimiter,
  sanitiseMetricsPayload,
  async (req: Request, res: Response, next: NextFunction) => {
    const body = req.body as Partial<DashboardQueryPayload>;

    const validationError = validatePayload(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    try {
      const result: MetricsResult = await aggregateMetrics(body as DashboardQueryPayload);
      validateMetrics(result.current);
      const insights = await generateInsightsSummary(result.current);
      res.json({ metrics: result, insights });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Validation ───────────────────────────────────────────────────────────────

function validatePayload(body: Partial<DashboardQueryPayload>): string | null {
  if (!Array.isArray(body.developerIds) || body.developerIds.length === 0) {
    return 'developerIds must be a non-empty array of strings';
  }
  if (body.developerIds.some((id) => typeof id !== 'string' || !id.trim())) {
    return 'every entry in developerIds must be a non-empty string';
  }
  if (!body.startDate || !isValidDate(body.startDate)) {
    return 'startDate must be a valid YYYY-MM-DD date';
  }
  if (!body.endDate || !isValidDate(body.endDate)) {
    return 'endDate must be a valid YYYY-MM-DD date';
  }
  if (body.endDate < body.startDate) {
    return 'endDate must not be before startDate';
  }
  return null;
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
}
