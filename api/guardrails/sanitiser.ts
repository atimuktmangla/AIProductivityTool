import type { Request, Response, NextFunction } from 'express';

const MAX_DATE_RANGE_DAYS = 366; // prevent runaway queries spanning multiple years
const MAX_DEVELOPER_IDS  = 50;  // prevent absurdly large fan-outs

// Validates the POST /metrics payload beyond the basic type checks in metricsRouter:
// - enforces max date range
// - enforces max developer count
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
