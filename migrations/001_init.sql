CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  event_category_id TEXT,
  archive_category_id TEXT,
  default_timezone TEXT NOT NULL DEFAULT 'UTC',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS guild_role_bindings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(guild_id, scope, role_id)
);

CREATE TABLE IF NOT EXISTS grantable_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS forum_watches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  forum_channel_id TEXT NOT NULL,
  notification_channel_id TEXT NOT NULL,
  last_seen_thread_ts INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(guild_id, forum_channel_id)
);

CREATE TABLE IF NOT EXISTS user_timezones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  timezone TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  creator_user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  target_user_id TEXT,
  target_role_id TEXT,
  repeat_days INTEGER,
  next_run_at INTEGER NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS event_channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  text_channel_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  archived_at INTEGER,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(guild_id, text_channel_id)
);

CREATE INDEX IF NOT EXISTS idx_guild_role_bindings_lookup
  ON guild_role_bindings (guild_id, scope, role_id);

CREATE INDEX IF NOT EXISTS idx_grantable_roles_active
  ON grantable_roles (guild_id, active, role_id);

CREATE INDEX IF NOT EXISTS idx_forum_watches_lookup
  ON forum_watches (guild_id, forum_channel_id);

CREATE INDEX IF NOT EXISTS idx_user_timezones_lookup
  ON user_timezones (guild_id, user_id);

CREATE INDEX IF NOT EXISTS idx_reminders_due
  ON reminders (status, next_run_at);

CREATE INDEX IF NOT EXISTS idx_reminders_creator
  ON reminders (guild_id, creator_user_id, status, next_run_at);

CREATE INDEX IF NOT EXISTS idx_event_channels_active
  ON event_channels (guild_id, text_channel_id, archived_at);
