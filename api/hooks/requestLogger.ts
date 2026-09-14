import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../backend/config/logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const data = {
      requestId: req.requestId,
      method:    req.method,
      path:      req.path,
      status:    res.statusCode,
      ms:        duration,
    };
    if (res.statusCode >= 500) logger.error(data, 'request');
    else if (res.statusCode >= 400) logger.warn(data, 'request');
    else logger.info(data, 'request');
  });

  next();
}
