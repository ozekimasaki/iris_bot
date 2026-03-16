CREATE TABLE IF NOT EXISTS role_cleanup_jobs (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  deadline_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  status TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS role_cleanup_members (
  job_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  last_error TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (job_id, user_id),
  FOREIGN KEY (job_id) REFERENCES role_cleanup_jobs (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_role_cleanup_jobs_due
  ON role_cleanup_jobs (status, deadline_at);

CREATE INDEX IF NOT EXISTS idx_role_cleanup_jobs_guild_status
  ON role_cleanup_jobs (guild_id, status, updated_at);

CREATE INDEX IF NOT EXISTS idx_role_cleanup_members_job_status
  ON role_cleanup_members (job_id, status, user_id);
