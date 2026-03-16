import type { Guild } from 'discord.js';
import { GrantableRolesRepository } from '../db/repositories/grantable-roles-repository.js';

export class RoleService {
  constructor(private readonly grantableRoles: GrantableRolesRepository) {}

  async addGrantableRole(guildId: string, roleId: string, source: string, sourceRef?: string | null) {
    this.grantableRoles.upsertActive(guildId, roleId, source, sourceRef ?? null);
  }

  async deactivateGrantableRole(guildId: string, roleId: string) {
    this.grantableRoles.deactivate(guildId, roleId);
  }

  async listGrantableRoles(guildId: string) {
    return this.grantableRoles.listActiveByGuild(guildId);
  }

  async resolveGrantableRoleId(guildId: string, roleId: string) {
    const row = this.grantableRoles.findActiveByGuildAndRole(guildId, roleId);

    return row?.roleId ?? null;
  }

  async buildGrantableRoleChoices(guild: Guild, query: string) {
    const active = await this.listGrantableRoles(guild.id);
    const normalized = query.toLowerCase();

    return active
      .map((row) => guild.roles.cache.get(row.roleId))
      .filter((role): role is NonNullable<typeof role> => Boolean(role))
      .filter((role) => role.name.toLowerCase().includes(normalized))
      .slice(0, 25)
      .map((role) => ({
        name: role.name,
        value: role.id,
      }));
  }
}
