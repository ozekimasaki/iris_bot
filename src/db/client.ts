import fs from 'node:fs';
import path from 'node:path';
import { Database } from 'bun:sqlite';
import { applyMigrations } from './migrations.js';

type SqlValue = string | number | bigint | Uint8Array | null;
type SqlParams = Record<string, SqlValue>;

function ensureParentDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function configure(raw: Database) {
  raw.run(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
}

export type DatabaseHandle = {
  raw: Database;
  run: (sql: string, params?: SqlParams) => void;
  get: <T>(sql: string, params?: SqlParams) => T | null;
  all: <T>(sql: string, params?: SqlParams) => T[];
  transaction: <T>(operation: () => T) => T;
  close: () => void;
};

export function createDatabase(databasePath: string): DatabaseHandle {
  ensureParentDir(databasePath);

  const raw = new Database(databasePath, {
    create: true,
    strict: true,
  });
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
      return raw.transaction(() => operation())();
    },
    close() {
      raw.close(false);
    },
  };

  return handle;
}
