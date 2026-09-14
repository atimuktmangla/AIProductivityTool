import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getConfig } from '../../backend/config/env.js';

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'];
  if (typeof key !== 'string' || !safeEqual(key, getConfig().apiKey)) {
    res.status(401).json({ error: 'Unauthorized — provide a valid X-Api-Key header' });
    return;
  }
  next();
}
