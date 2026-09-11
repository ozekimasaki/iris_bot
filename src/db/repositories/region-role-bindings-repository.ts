import type { DatabaseHandle } from '../client.js';
import type { RegionRoleBindingRow } from '../types.js';

type RegionRoleBindingRecord = {
  guild_id: string;
  region_key: string;
  role_id: string;
  created_at: number;
  updated_at: number;
};

function mapRegionRoleBinding(row: RegionRoleBindingRecord): RegionRoleBindingRow {
  return {
    guildId: row.guild_id,
    regionKey: row.region_key,
    roleId: row.role_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class RegionRoleBindingsRepository {
  constructor(private readonly db: DatabaseHandle) {}

  upsert(guildId: string, regionKey: string, roleId: string) {
    const now = Date.now();
    this.db.run(
      `
        INSERT INTO region_role_bindings (guild_id, region_key, role_id, created_at, updated_at)
        VALUES (:guildId, :regionKey, :roleId, :createdAt, :updatedAt)
        ON CONFLICT(guild_id, region_key) DO UPDATE SET
          role_id = excluded.role_id,
          updated_at = excluded.updated_at
      `,
      {
        guildId,
        regionKey,
        roleId,
        createdAt: now,
        updatedAt: now,
      },
    );
  }

  remove(guildId: string, regionKey: string) {
    this.db.run(
      `
        DELETE FROM region_role_bindings
        WHERE guild_id = :guildId AND region_key = :regionKey
      `,
      {
        guildId,
        regionKey,
      },
    );
  }

  listByGuild(guildId: string) {
    const rows = this.db.all<RegionRoleBindingRecord>(
      `
        SELECT guild_id, region_key, role_id, created_at, updated_at
        FROM region_role_bindings
        WHERE guild_id = :guildId
        ORDER BY region_key ASC
      `,
      { guildId },
    );

    return rows.map(mapRegionRoleBinding);
  }

  findByGuildAndRegion(guildId: string, regionKey: string) {
    const row = this.db.get<RegionRoleBindingRecord>(
      `
        SELECT guild_id, region_key, role_id, created_at, updated_at
        FROM region_role_bindings
        WHERE guild_id = :guildId AND region_key = :regionKey
      `,
      {
        guildId,
        regionKey,
      },
    );

    return row ? mapRegionRoleBinding(row) : null;
  }

  findByGuildAndRole(guildId: string, roleId: string) {
    const row = this.db.get<RegionRoleBindingRecord>(
      `
        SELECT guild_id, region_key, role_id, created_at, updated_at
        FROM region_role_bindings
        WHERE guild_id = :guildId AND role_id = :roleId
      `,
      {
        guildId,
        roleId,
      },
    );

    return row ? mapRegionRoleBinding(row) : null;
  }
}
