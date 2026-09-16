import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../../api/middleware/errorHandler.js';
import { AtlassianHttpError } from '../../databaselayer/errors/AtlassianHttpError.js';

function mockRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: null as unknown,
    status(code: number) { res.statusCode = code; return res; },
    set(key: string, val: string) { res.headers[key] = val; return res; },
    json(data: unknown) { res.body = data; return res; },
  };
  return res as unknown as Response;
}

const req = {} as Request;
const next = vi.fn() as NextFunction;

describe('errorHandler', () => {
  // @req REQ-4.7-5
  it('returns 429 with Retry-After header for upstream rate limit', () => {
    const err = new AtlassianHttpError(429, 'Too Many Requests', 'rate limited', 'http://bb/api');
    const res = mockRes();
    errorHandler(err, req, res, next);
    expect((res as any).statusCode).toBe(429);
    expect((res as any).headers['Retry-After']).toBe('60');
    expect((res as any).body.error).toBe('Upstream rate limit exceeded');
  });

  // @req REQ-4.7-3
  it('returns 502 for upstream 401/403 auth failures', () => {
    const err = new AtlassianHttpError(401, 'Unauthorized', 'bad token', 'http://jira/api');
    const res = mockRes();
    errorHandler(err, req, res, next);
    expect((res as any).statusCode).toBe(502);
    expect((res as any).body.error).toBe('Upstream authentication failure');
  });

  // @req REQ-4.7-4
  it('returns 502 for upstream 5xx server errors', () => {
    const err = new AtlassianHttpError(503, 'Service Unavailable', 'down', 'http://bb/api');
    const res = mockRes();
    errorHandler(err, req, res, next);
    expect((res as any).statusCode).toBe(502);
    expect((res as any).body.error).toBe('Upstream server error');
  });

  // @req REQ-4.7-2
  it('returns 502 for upstream unreachable (status 0)', () => {
    const err = new AtlassianHttpError(0, 'ECONNREFUSED', 'connection refused', 'http://bb/api');
    const res = mockRes();
    errorHandler(err, req, res, next);
    expect((res as any).statusCode).toBe(502);
    expect((res as any).body.error).toBe('Upstream unreachable');
  });

  // @req REQ-4.7-4
  it('returns 500 for generic unknown errors', () => {
    const err = new Error('something broke');
    const res = mockRes();
    errorHandler(err, req, res, next);
    expect((res as any).statusCode).toBe(500);
    expect((res as any).body.error).toBe('Internal server error');
  });
});
