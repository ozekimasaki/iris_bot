CREATE TABLE IF NOT EXISTS region_role_bindings (
  guild_id TEXT NOT NULL,
  region_key TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, region_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_region_role_bindings_role
  ON region_role_bindings (guild_id, role_id);

CREATE INDEX IF NOT EXISTS idx_region_role_bindings_lookup
  ON region_role_bindings (guild_id, region_key);

CREATE TABLE IF NOT EXISTS member_regions (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  region_key TEXT NOT NULL,
  role_id TEXT NOT NULL,
  confirmed_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_member_regions_lookup
  ON member_regions (guild_id, user_id, region_key);
