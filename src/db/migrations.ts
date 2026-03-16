import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';

type AppliedMigrationRow = {
  filename: string;
};

function getMigrationsDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
}

function ensureMigrationTable(raw: DatabaseSync) {
  raw.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
}

export function applyMigrations(raw: DatabaseSync) {
  ensureMigrationTable(raw);

  const migrationsDir = getMigrationsDir();
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const applied = new Set(
    (raw
      .prepare('SELECT filename FROM _migrations ORDER BY filename ASC')
      .all() as AppliedMigrationRow[]).map((row) => row.filename),
  );
  const files = fs
    .readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  const executed: string[] = [];

  for (const filename of files) {
    if (applied.has(filename)) {
      continue;
    }

    const migrationSql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    raw.exec('BEGIN');

    try {
      raw.exec(migrationSql);
      raw
        .prepare('INSERT INTO _migrations (filename, applied_at) VALUES (:filename, :appliedAt)')
        .run({
          filename,
          appliedAt: Date.now(),
        });
      raw.exec('COMMIT');
      executed.push(filename);
    } catch (error) {
      try {
        raw.exec('ROLLBACK');
      } catch {
        // Ignore rollback failures and preserve the original error.
      }
      throw error;
    }
  }

  return executed;
}
