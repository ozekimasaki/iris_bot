import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations } from './migrations.js';

type SqlValue = string | number | bigint | Uint8Array | null;
type SqlParams = Record<string, SqlValue>;

function ensureParentDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function configure(raw: DatabaseSync) {
  raw.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
}

export type DatabaseHandle = {
  raw: DatabaseSync;
  run: (sql: string, params?: SqlParams) => void;
  get: <T>(sql: string, params?: SqlParams) => T | null;
  all: <T>(sql: string, params?: SqlParams) => T[];
  transaction: <T>(operation: () => T) => T;
  close: () => void;
};

export function createDatabase(databasePath: string): DatabaseHandle {
  ensureParentDir(databasePath);

  const raw = new DatabaseSync(databasePath);
  configure(raw);
  applyMigrations(raw);

  const handle: DatabaseHandle = {
    raw,
    run(sql, params = {}) {
      raw.prepare(sql).run(params);
    },
    get<T>(sql: string, params: SqlParams = {}) {
      return (raw.prepare(sql).get(params) as T | undefined) ?? null;
    },
    all<T>(sql: string, params: SqlParams = {}) {
      return raw.prepare(sql).all(params) as T[];
    },
    transaction(operation) {
      raw.exec('BEGIN');
      try {
        const result = operation();
        raw.exec('COMMIT');
        return result;
      } catch (error) {
        try {
          raw.exec('ROLLBACK');
        } catch {
          // Ignore rollback failures and preserve the original error.
        }
        throw error;
      }
    },
    close() {
      raw.close();
    },
  };

  return handle;
}
