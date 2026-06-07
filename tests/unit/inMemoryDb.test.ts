import { describe, it, expect, beforeEach } from 'vitest';
import { initInMemoryDb, getDb, _resetForTesting, AppStoreNotInitialisedError } from '../../DB/store/inMemoryDb.js';

describe('inMemoryDb', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  // @req REQ-4.12-1
  it('creates metrics_cache and sync_run_logs tables after init', () => {
    initInMemoryDb();
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('metrics_cache');
    expect(names).toContain('sync_run_logs');
  });

  // @req REQ-4.12-4
  it('getDb returns the same instance on repeated calls', () => {
    initInMemoryDb();
    const a = getDb();
    const b = getDb();
    expect(a).toBe(b);
  });

  // @req REQ-4.12-4
  it('initInMemoryDb is idempotent — calling it twice does not throw', () => {
    initInMemoryDb();
    expect(() => initInMemoryDb()).not.toThrow();
  });

  // @req REQ-4.12-1
  it('getDb throws AppStoreNotInitialisedError when called before initInMemoryDb', () => {
    expect(() => getDb()).toThrow(AppStoreNotInitialisedError);
  });
});
