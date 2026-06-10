import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { getConfig } from '../../backend/config/env.js';

export class AppStoreNotInitialisedError extends Error {
  constructor() {
    super(
      'Application SQLite store has not been initialised. ' +
      'Call initAppStore() at server startup before accessing the store.',
    );
    this.name = 'AppStoreNotInitialisedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

let db: Database.Database | null = null;
let storePath: string | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS metrics_cache (
    developer_id  TEXT    NOT NULL,
    start_date    TEXT    NOT NULL,
    end_date      TEXT    NOT NULL,
    metric_json   TEXT    NOT NULL,
    cached_at     INTEGER NOT NULL,
    PRIMARY KEY (developer_id, start_date, end_date)
  );

  CREATE TABLE IF NOT EXISTS sync_run_logs (
    run_id       TEXT    PRIMARY KEY,
    started_at   TEXT    NOT NULL,
    finished_at  TEXT    NOT NULL,
    duration_ms  INTEGER NOT NULL,
    total_users  INTEGER NOT NULL,
    batches_json TEXT    NOT NULL
  );
`;

function openStore(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.pragma('journal_mode = WAL');
  database.exec(SCHEMA);
  migrateMetricsCacheSchema(database);
  return database;
}

function migrateMetricsCacheSchema(database: Database.Database): void {
  const cols = database.prepare('PRAGMA table_info(metrics_cache)').all() as { name: string }[];
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('window_kind')) {
    database.exec("ALTER TABLE metrics_cache ADD COLUMN window_kind TEXT NOT NULL DEFAULT 'fixed'");
  }
  if (!names.has('current_month')) {
    database.exec('ALTER TABLE metrics_cache ADD COLUMN current_month TEXT');
  }
}

export function initAppStore(pathOverride?: string): void {
  if (db !== null) return;
  const path = pathOverride ?? getConfig().appStorePath;
  storePath = path;
  try {
    db = openStore(path);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to open application store at ${path}: ${message}`);
  }
}

/** @deprecated Use initAppStore */
export const initInMemoryDb = initAppStore;

export function getDb(): Database.Database {
  if (db === null) throw new AppStoreNotInitialisedError();
  return db;
}

export function getStorePath(): string | null {
  return storePath;
}

/** Drop and recreate tables, reset the singleton. Only for use in tests. */
export function _resetForTesting(): void {
  if (db !== null) {
    db.close();
  }
  db = null;
  storePath = null;
}
