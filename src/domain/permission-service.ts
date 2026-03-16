import {
  PermissionFlagsBits,
  type GuildMember,
} from 'discord.js';
import type { RoleScope } from '../db/types.js';
import { GuildConfigService } from './guild-config-service.js';

export class PermissionService {
  constructor(private readonly guildConfigService: GuildConfigService) {}

  isAdministrator(member: GuildMember) {
    return member.permissions.has(PermissionFlagsBits.Administrator);
  }

  async hasAnyScope(guildId: string, member: GuildMember, scopes: RoleScope[]) {
    if (this.isAdministrator(member)) {
      return true;
    }

    const config = await this.guildConfigService.getGuildConfig(guildId);
    return scopes.some((scope) => config.roles[scope].some((roleId) => member.roles.cache.has(roleId)));
  }

  async canRunSetup(guildId: string, member: GuildMember) {
    const hasAdminBindings = await this.guildConfigService.hasAnyRolesConfigured(guildId, 'admin');
    if (!hasAdminBindings) {
      return this.isAdministrator(member);
    }

    return this.hasAnyScope(guildId, member, ['admin']);
  }

  async canRunForumAdmin(guildId: string, member: GuildMember) {
    return this.hasAnyScope(guildId, member, ['admin']);
  }

  async canRunManagerAction(guildId: string, member: GuildMember) {
    return this.hasAnyScope(guildId, member, ['admin', 'manager']);
  }
}
