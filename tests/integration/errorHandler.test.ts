import { describe, it, expect } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import { errorHandler } from '../../api/middleware/errorHandler.js';
import { AtlassianHttpError } from '../../databaselayer/errors/AtlassianHttpError.js';

function buildApp(thrownError: unknown) {
  const app = express();
  app.use(express.json());
  app.get('/test', (_req: Request, _res: Response, next: NextFunction) => next(thrownError));
  app.use(errorHandler);
  return app;
}

async function get(app: ReturnType<typeof buildApp>) {
  const { default: supertest } = await import('supertest');
  return supertest(app).get('/test');
}

describe('errorHandler middleware', () => {
  // @req REQ-4.7-1
  it('upstream 401 → 502 with credential hint', async () => {
    const err = new AtlassianHttpError(401, 'Unauthorized', 'Bad token', 'http://jira.local');
    const res = await get(buildApp(err));
    expect(res.status).toBe(502);
    expect((res.body as { detail?: string }).detail).toMatch(/JIRA_TOKEN|BITBUCKET_TOKEN/i);
  });

  // @req REQ-4.7-1
  it('upstream 403 → 502 with credential hint', async () => {
    const err = new AtlassianHttpError(403, 'Forbidden', 'Insufficient permissions', 'http://bb.local');
    const res = await get(buildApp(err));
    expect(res.status).toBe(502);
    expect((res.body as { detail?: string }).detail).toMatch(/JIRA_TOKEN|BITBUCKET_TOKEN/i);
  });

  // @req REQ-4.7-2
  it('upstream 500 → 502 with upstream detail', async () => {
    const err = new AtlassianHttpError(500, 'Internal Server Error', 'DB unavailable', 'http://jira.local');
    const res = await get(buildApp(err));
    expect(res.status).toBe(502);
    expect((res.body as { detail?: string }).detail).toBe('DB unavailable');
  });

  // @req REQ-4.7-2
  it('upstream 503 → 502 with upstream detail', async () => {
    const err = new AtlassianHttpError(503, 'Service Unavailable', 'Jira is down', 'http://jira.local');
    const res = await get(buildApp(err));
    expect(res.status).toBe(502);
  });

  // @req REQ-4.7-4
  it('unknown error → 500', async () => {
    const err = new Error('something unexpected');
    const res = await get(buildApp(err));
    expect(res.status).toBe(500);
    expect((res.body as { error?: string }).error).toBe('Internal server error');
  });
});
