import { describe, it, expect } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import { sanitiseMetricsPayload } from '../../WEB/guardrails/sanitiser.js';

// Minimal harness: runs the middleware and resolves with { status, body }
function run(body: unknown): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve) => {
    const req = { body } as Request;
    const res = {
      _status: 200,
      _body: null as unknown,
      status(code: number) { this._status = code; return this; },
      json(data: unknown) { this._body = data; resolve({ status: this._status, body: this._body }); },
    } as unknown as Response;
    const next: NextFunction = () => resolve({ status: 200, body: (req as Request).body });
    sanitiseMetricsPayload(req, res, next);
  });
}

describe('sanitiseMetricsPayload', () => {
  // @req REQ-4.9-1
  it('51 developerIds → 400', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `user${i}`);
    const result = await run({ developerIds: ids, startDate: '2024-01-01', endDate: '2024-01-31' });
    expect(result.status).toBe(400);
  });

  // @req REQ-4.9-1
  it('50 developerIds → passes through', async () => {
    const ids = Array.from({ length: 50 }, (_, i) => `user${i}`);
    const result = await run({ developerIds: ids, startDate: '2024-01-01', endDate: '2024-01-31' });
    expect(result.status).toBe(200);
  });

  // @req REQ-4.9-2
  it('date range 367 days → 400', async () => {
    const result = await run({
      developerIds: ['alice'],
      startDate: '2024-01-01',
      endDate: '2025-01-03', // 368 days
    });
    expect(result.status).toBe(400);
  });

  // @req REQ-4.9-2
  it('date range 365 days → passes through', async () => {
    const result = await run({
      developerIds: ['alice'],
      startDate: '2024-01-01',
      endDate: '2024-12-31', // 365 days
    });
    expect(result.status).toBe(200);
  });

  // @req REQ-4.9-3
  it('developerIds with whitespace → trimmed', async () => {
    const result = await run({
      developerIds: ['  alice  ', ' bob'],
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    });
    expect(result.status).toBe(200);
    const passed = result.body as { developerIds: string[] };
    expect(passed.developerIds).toEqual(['alice', 'bob']);
  });

  // @req REQ-4.9-1
  it('valid payload → passes through unchanged IDs', async () => {
    const result = await run({
      developerIds: ['alice', 'bob'],
      startDate: '2024-01-01',
      endDate: '2024-02-01',
    });
    expect(result.status).toBe(200);
  });
});
