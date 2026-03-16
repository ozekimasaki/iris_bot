import type { DatabaseHandle } from '../client.js';
import type { GuildRoleBindingRow, RoleScope } from '../types.js';

type GuildRoleBindingRecord = {
  id: number;
  guild_id: string;
  scope: RoleScope;
  role_id: string;
  created_at: number;
};

function mapGuildRoleBinding(row: GuildRoleBindingRecord): GuildRoleBindingRow {
  return {
    id: row.id,
    guildId: row.guild_id,
    scope: row.scope,
    roleId: row.role_id,
    createdAt: row.created_at,
  };
}

export class GuildRoleBindingsRepository {
  constructor(private readonly db: DatabaseHandle) {}

  add(guildId: string, scope: RoleScope, roleId: string) {
    this.db.run(
      `
        INSERT OR IGNORE INTO guild_role_bindings (guild_id, scope, role_id, created_at)
        VALUES (:guildId, :scope, :roleId, :createdAt)
      `,
      {
        guildId,
        scope,
        roleId,
        createdAt: Date.now(),
      },
    );
  }

  remove(guildId: string, scope: RoleScope, roleId: string) {
    this.db.run(
      `
        DELETE FROM guild_role_bindings
        WHERE guild_id = :guildId AND scope = :scope AND role_id = :roleId
      `,
      {
        guildId,
        scope,
        roleId,
      },
    );
  }

  listByGuildId(guildId: string) {
    const rows = this.db.all<GuildRoleBindingRecord>(
      `
        SELECT id, guild_id, scope, role_id, created_at
        FROM guild_role_bindings
        WHERE guild_id = :guildId
        ORDER BY scope ASC, role_id ASC
      `,
      { guildId },
    );

    return rows.map(mapGuildRoleBinding);
  }

  listByGuildAndScope(guildId: string, scope: RoleScope) {
    const rows = this.db.all<GuildRoleBindingRecord>(
      `
        SELECT id, guild_id, scope, role_id, created_at
        FROM guild_role_bindings
        WHERE guild_id = :guildId AND scope = :scope
        ORDER BY role_id ASC
      `,
      {
        guildId,
        scope,
      },
    );

    return rows.map(mapGuildRoleBinding);
  }
}
