CREATE TABLE IF NOT EXISTS honeypot_bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  message_id TEXT,
  channel_id TEXT NOT NULL,
  banned_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_honeypot_bans_guild_time
  ON honeypot_bans (guild_id, banned_at DESC);
