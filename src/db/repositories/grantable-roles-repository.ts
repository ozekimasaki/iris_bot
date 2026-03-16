import type { DatabaseHandle } from '../client.js';
import type { GrantableRoleRow } from '../types.js';

type GrantableRoleRecord = {
  id: number;
  guild_id: string;
  role_id: string;
  source: string;
  source_ref: string | null;
  active: number;
  created_at: number;
  updated_at: number;
};

function mapGrantableRole(row: GrantableRoleRecord): GrantableRoleRow {
  return {
    id: row.id,
    guildId: row.guild_id,
    roleId: row.role_id,
    source: row.source,
    sourceRef: row.source_ref,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class GrantableRolesRepository {
  constructor(private readonly db: DatabaseHandle) {}

  upsertActive(guildId: string, roleId: string, source: string, sourceRef?: string | null) {
    const now = Date.now();
    this.db.run(
      `
        INSERT INTO grantable_roles (guild_id, role_id, source, source_ref, active, created_at, updated_at)
        VALUES (:guildId, :roleId, :source, :sourceRef, 1, :createdAt, :updatedAt)
        ON CONFLICT(guild_id, role_id) DO UPDATE SET
          source = excluded.source,
          source_ref = excluded.source_ref,
          active = 1,
          updated_at = excluded.updated_at
      `,
      {
        guildId,
        roleId,
        source,
        sourceRef: sourceRef ?? null,
        createdAt: now,
        updatedAt: now,
      },
    );
  }

  deactivate(guildId: string, roleId: string) {
    this.db.run(
      `
        UPDATE grantable_roles
        SET active = 0, updated_at = :updatedAt
        WHERE guild_id = :guildId AND role_id = :roleId
      `,
      {
        guildId,
        roleId,
        updatedAt: Date.now(),
      },
    );
  }

  listActiveByGuild(guildId: string) {
    const rows = this.db.all<GrantableRoleRecord>(
      `
        SELECT id, guild_id, role_id, source, source_ref, active, created_at, updated_at
        FROM grantable_roles
        WHERE guild_id = :guildId AND active = 1
        ORDER BY role_id ASC
      `,
      { guildId },
    );

    return rows.map(mapGrantableRole);
  }

  findActiveByGuildAndRole(guildId: string, roleId: string) {
    const row = this.db.get<GrantableRoleRecord>(
      `
        SELECT id, guild_id, role_id, source, source_ref, active, created_at, updated_at
        FROM grantable_roles
        WHERE guild_id = :guildId AND role_id = :roleId AND active = 1
      `,
      {
        guildId,
        roleId,
      },
    );

    return row ? mapGrantableRole(row) : null;
  }
}
