import type { Request, Response, NextFunction } from 'express';

const MAX_DATE_RANGE_DAYS = 366; // prevent runaway queries spanning multiple years
const MAX_DEVELOPER_IDS  = 50;  // prevent absurdly large fan-outs
const MAX_REPO_TARGETS   = 50;
const MAX_PROJECT_KEYS   = 20;
const PROJECT_KEY_RE     = /^[A-Z][A-Z0-9_]{0,9}$/;
const REPO_SLUG_RE       = /^[a-z0-9_.\-]{1,128}$/;

// Validates the POST /metrics payload beyond the basic type checks in metricsRouter:
// - enforces max date range
// - enforces max developer count
// - validates repoTargets and projectKeys format
// - strips leading/trailing whitespace from string fields
export function sanitiseMetricsPayload(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as Record<string, unknown>;

  // Trim developer IDs
  if (Array.isArray(body.developerIds)) {
    const cleaned = (body.developerIds as unknown[])
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.trim());
    body.developerIds = cleaned;

    if (cleaned.length > MAX_DEVELOPER_IDS) {
      res.status(400).json({
        error: `developerIds exceeds maximum of ${MAX_DEVELOPER_IDS} entries`,
      });
      return;
    }
  }

  // Validate repoTargets (REQ-4.9-4)
  if (Array.isArray(body.repoTargets)) {
    if (body.repoTargets.length > MAX_REPO_TARGETS) {
      res.status(400).json({ error: `repoTargets exceeds maximum of ${MAX_REPO_TARGETS} entries` });
      return;
    }
    for (const target of body.repoTargets as unknown[]) {
      if (typeof target !== 'object' || target === null) {
        res.status(400).json({ error: 'Each repoTarget must be an object with projectKey and repoSlug' });
        return;
      }
      const { projectKey, repoSlug } = target as Record<string, unknown>;
      if (typeof projectKey !== 'string' || !PROJECT_KEY_RE.test(projectKey)) {
        res.status(400).json({ error: `Invalid projectKey: must match ${PROJECT_KEY_RE.source}` });
        return;
      }
      if (typeof repoSlug !== 'string' || !REPO_SLUG_RE.test(repoSlug)) {
        res.status(400).json({ error: `Invalid repoSlug: must match ${REPO_SLUG_RE.source}` });
        return;
      }
    }
  }

  // Validate projectKeys (REQ-4.9-5)
  if (Array.isArray(body.projectKeys)) {
    if (body.projectKeys.length > MAX_PROJECT_KEYS) {
      res.status(400).json({ error: `projectKeys exceeds maximum of ${MAX_PROJECT_KEYS} entries` });
      return;
    }
    for (const key of body.projectKeys as unknown[]) {
      if (typeof key !== 'string' || !PROJECT_KEY_RE.test(key)) {
        res.status(400).json({ error: `Invalid projectKey in projectKeys: must match ${PROJECT_KEY_RE.source}` });
        return;
      }
    }
  }

  // Trim date strings
  if (typeof body.startDate === 'string') body.startDate = body.startDate.trim();
  if (typeof body.endDate   === 'string') body.endDate   = body.endDate.trim();

  // Enforce max date range
  if (typeof body.startDate === 'string' && typeof body.endDate === 'string') {
    const start = Date.parse(body.startDate);
    const end   = Date.parse(body.endDate);
    if (!isNaN(start) && !isNaN(end)) {
      const days = (end - start) / 86_400_000;
      if (days > MAX_DATE_RANGE_DAYS) {
        res.status(400).json({
          error: `Date range exceeds maximum of ${MAX_DATE_RANGE_DAYS} days`,
        });
        return;
      }
    }
  }

  next();
}
