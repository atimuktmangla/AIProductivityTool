import Database from 'better-sqlite3';

export class AppStoreNotInitialisedError extends Error {
  constructor() {
    super(
      'In-memory SQLite store has not been initialised. ' +
      'Call initInMemoryDb() at server startup before accessing the store.',
    );
    this.name = 'AppStoreNotInitialisedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

let db: Database.Database | null = null;

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

export function initInMemoryDb(): void {
  if (db !== null) return;
  db = new Database(':memory:');
  db.exec(SCHEMA);
}

export function getDb(): Database.Database {
  if (db === null) throw new AppStoreNotInitialisedError();
  return db;
}

/** Drop and recreate tables, reset the singleton. Only for use in tests. */
export function _resetForTesting(): void {
  if (db !== null) {
    db.exec('DROP TABLE IF EXISTS metrics_cache; DROP TABLE IF EXISTS sync_run_logs;');
    db.close();
  }
  db = null;
}
