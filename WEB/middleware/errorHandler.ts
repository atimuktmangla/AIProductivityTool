import type { Request, Response, NextFunction } from 'express';
import { AtlassianHttpError } from '../../DB/errors/AtlassianHttpError.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error(err instanceof Error ? err.stack : err);

  if (err instanceof AtlassianHttpError) {
    if (err.status === 401 || err.status === 403) {
      res.status(502).json({
        error: 'Upstream authentication failure',
        detail: 'Check that JIRA_TOKEN / BITBUCKET_TOKEN are valid and have sufficient permissions.',
      });
      return;
    }
    if (err.status === 0) {
      res.status(502).json({
        error: 'Upstream unreachable',
        detail: err.detail,
        code: err.statusText,
        url: err.url,
      });
      return;
    }
    if (err.status >= 500) {
      res.status(502).json({
        error: 'Upstream server error',
        detail: err.detail,
      });
      return;
    }
    res.status(502).json({
      error: `Upstream API error ${err.status}`,
      detail: err.detail,
      url: err.url,
    });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
}
