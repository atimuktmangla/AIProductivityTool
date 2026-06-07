import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}

// Attaches a unique X-Request-Id to every request and response.
// Re-uses an existing header if the upstream proxy already set one.
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const existing = req.headers['x-request-id'];
  req.requestId = typeof existing === 'string' && existing.length > 0
    ? existing
    : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
