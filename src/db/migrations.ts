import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Database } from 'bun:sqlite';

type AppliedMigrationRow = {
  filename: string;
};

function getMigrationsDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations');
}

function ensureMigrationTable(raw: Database) {
  raw.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
}

export function applyMigrations(raw: Database) {
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
  const recordMigration = raw.prepare(
    'INSERT INTO _migrations (filename, applied_at) VALUES (:filename, :appliedAt)',
  );

  for (const filename of files) {
    if (applied.has(filename)) {
      continue;
    }

    const migrationSql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    raw.transaction(() => {
      raw.run(migrationSql);
      recordMigration.run({
        filename,
        appliedAt: Date.now(),
      });
    })();
    executed.push(filename);
  }

  return executed;
}
