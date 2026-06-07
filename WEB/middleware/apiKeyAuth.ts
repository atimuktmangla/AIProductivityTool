import type { Request, Response, NextFunction } from 'express';
import { getConfig } from '../../BL/config/env.js';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-api-key'];
  if (!key || key !== getConfig().apiKey) {
    res.status(401).json({ error: 'Unauthorized — provide a valid X-Api-Key header' });
    return;
  }
  next();
}
