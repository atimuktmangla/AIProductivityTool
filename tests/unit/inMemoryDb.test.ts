import { describe, it, expect, beforeEach } from 'vitest';
import { initAppStore, getDb, _resetForTesting, AppStoreNotInitialisedError } from '../../databaselayer/store/appStore.js';

describe('appStore', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  // @req REQ-4.12-1
  it('creates metrics_cache and sync_run_logs tables after init', () => {
    initAppStore(':memory:');
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
    initAppStore(':memory:');
    const a = getDb();
    const b = getDb();
    expect(a).toBe(b);
  });

  // @req REQ-4.12-4
  it('initAppStore is idempotent — calling it twice does not throw', () => {
    initAppStore(':memory:');
    expect(() => initAppStore(':memory:')).not.toThrow();
  });

  // @req REQ-4.12-1
  it('getDb throws AppStoreNotInitialisedError when called before initAppStore', () => {
    expect(() => getDb()).toThrow(AppStoreNotInitialisedError);
  });
});
