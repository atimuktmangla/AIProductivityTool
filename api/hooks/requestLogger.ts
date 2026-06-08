import type { Request, Response, NextFunction } from 'express';

// Structured request/response logger.
// Logs: method, path, requestId, status, duration (ms).
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(
      JSON.stringify({
        level,
        ts:        new Date().toISOString(),
        requestId: req.requestId,
        method:    req.method,
        path:      req.path,
        status:    res.statusCode,
        ms:        duration,
      }),
    );
  });

  next();
}
