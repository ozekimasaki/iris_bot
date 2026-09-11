import {
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type Role,
} from 'discord.js';
import type { Logger } from 'pino';
import { MemberRegionsRepository } from '../db/repositories/member-regions-repository.js';
import { RegionRoleBindingsRepository } from '../db/repositories/region-role-bindings-repository.js';
import type { SupportedLocale } from '../db/types.js';
import {
  assertRegionKey,
  getRegionName,
  isRegionKey,
  regionKeys,
  regionRoleColors,
  type RegionKey,
} from '../lib/regions.js';

export type RegionAssignmentResult = {
  regionKey: RegionKey;
  roleId: string;
  unchanged: boolean;
  previousRegionKey: RegionKey | null;
};

export type RegionCreateResult = {
  regionKey: RegionKey;
  status: 'created' | 'bound_existing' | 'already_bound' | 'skipped';
  roleId: string | null;
  reason?: string;
};

export class RegionService {
  constructor(
    private readonly bindings: RegionRoleBindingsRepository,
    private readonly memberRegions: MemberRegionsRepository,
    private readonly logger: Logger,
  ) {}

  listBindings(guildId: string) {
    return this.bindings.listByGuild(guildId);
  }

  getBinding(guildId: string, regionKey: RegionKey) {
    return this.bindings.findByGuildAndRegion(guildId, regionKey);
  }

  getBindingByRole(guildId: string, roleId: string) {
    return this.bindings.findByGuildAndRole(guildId, roleId);
  }

  getMemberRegion(guildId: string, userId: string) {
    return this.memberRegions.findByGuildAndUser(guildId, userId);
  }

  listConfiguredRegions(guildId: string) {
    const byKey = new Map(
      this.bindings.listByGuild(guildId)
        .filter((row) => isRegionKey(row.regionKey))
        .map((row) => [row.regionKey, row.roleId] as const),
    );

    return regionKeys.flatMap((key) => {
      const roleId = byKey.get(key);
      return roleId ? [{ key, roleId }] : [];
    });
  }

  bindRole(guild: Guild, regionKey: RegionKey, role: Role) {
    if (role.id === guild.id || role.managed) {
      throw new Error('REGION_ROLE_INVALID');
    }

    const existingForRole = this.bindings.findByGuildAndRole(guild.id, role.id);
    if (existingForRole && existingForRole.regionKey !== regionKey) {
      throw new Error('REGION_ROLE_IN_USE');
    }

    this.bindings.upsert(guild.id, regionKey, role.id);
  }

  unbindRole(guildId: string, regionKey: RegionKey) {
    this.bindings.remove(guildId, regionKey);
  }

  async createMissingRoles(guild: Guild, locale: SupportedLocale): Promise<RegionCreateResult[]> {
    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      throw new Error('REGION_MISSING_MANAGE_ROLES');
    }

    const results: RegionCreateResult[] = [];

    for (const regionKey of regionKeys) {
      const existingBinding = this.bindings.findByGuildAndRegion(guild.id, regionKey);
      if (existingBinding) {
        results.push({
          regionKey,
          status: 'already_bound',
          roleId: existingBinding.roleId,
        });
        continue;
      }

      const roleName = getRegionName(locale, regionKey);
      const existingRole = guild.roles.cache.find((role) => role.name === roleName) ?? null;
      if (existingRole) {
        const boundTo = this.bindings.findByGuildAndRole(guild.id, existingRole.id);
        if (boundTo) {
          results.push({
            regionKey,
            status: 'skipped',
            roleId: existingRole.id,
            reason: 'REGION_ROLE_IN_USE',
          });
          continue;
        }

        if (existingRole.managed || existingRole.id === guild.id) {
          results.push({
            regionKey,
            status: 'skipped',
            roleId: existingRole.id,
            reason: 'REGION_ROLE_INVALID',
          });
          continue;
        }

        this.bindings.upsert(guild.id, regionKey, existingRole.id);
        results.push({
          regionKey,
          status: 'bound_existing',
          roleId: existingRole.id,
        });
        continue;
      }

      try {
        const created = await guild.roles.create({
          name: roleName,
          color: regionRoleColors[regionKey],
          mentionable: false,
          reason: `Iris region role (${regionKey})`,
        });
        this.bindings.upsert(guild.id, regionKey, created.id);
        results.push({
          regionKey,
          status: 'created',
          roleId: created.id,
        });
      } catch (error) {
        this.logger.error({ err: error, guildId: guild.id, regionKey }, 'region role create failed');
        results.push({
          regionKey,
          status: 'skipped',
          roleId: null,
          reason: 'REGION_CREATE_FAILED',
        });
      }
    }

    return results;
  }

  async assignRegion(guild: Guild, member: GuildMember, regionKeyInput: string): Promise<RegionAssignmentResult> {
    const regionKey = assertRegionKey(regionKeyInput);
    const binding = this.bindings.findByGuildAndRegion(guild.id, regionKey);
    if (!binding) {
      throw new Error('REGION_NOT_CONFIGURED');
    }

    const role = await this.resolveAssignableRole(guild, binding.roleId);
    const previous = this.memberRegions.findByGuildAndUser(guild.id, member.id);
    const previousRegionKey = previous && isRegionKey(previous.regionKey) ? previous.regionKey : null;
    const alreadyAssigned = previous?.regionKey === regionKey && member.roles.cache.has(role.id);

    const roleIdsToRemove = this.collectRemovableRoleIds(guild.id, member, previous?.roleId, role.id);
    if (roleIdsToRemove.length > 0) {
      await this.ensureBotCanManageRoles(guild, roleIdsToRemove);
      await member.roles.remove(roleIdsToRemove);
    }

    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role);
    }

    this.memberRegions.upsert(guild.id, member.id, regionKey, role.id);

    return {
      regionKey,
      roleId: role.id,
      unchanged: alreadyAssigned,
      previousRegionKey,
    };
  }

  async clearRegion(guild: Guild, member: GuildMember) {
    const previous = this.memberRegions.findByGuildAndUser(guild.id, member.id);
    const roleIdsToRemove = this.collectRemovableRoleIds(guild.id, member, previous?.roleId, null);
    if (roleIdsToRemove.length === 0 && !previous) {
      throw new Error('REGION_NOT_SET');
    }

    if (roleIdsToRemove.length > 0) {
      await this.ensureBotCanManageRoles(guild, roleIdsToRemove);
      await member.roles.remove(roleIdsToRemove);
    }

    this.memberRegions.remove(guild.id, member.id);
    return {
      previousRegionKey: previous && isRegionKey(previous.regionKey) ? previous.regionKey : null,
    };
  }

  private collectRemovableRoleIds(
    guildId: string,
    member: GuildMember,
    previousRoleId: string | undefined,
    keepRoleId: string | null,
  ) {
    const boundRoleIds = this.bindings.listByGuild(guildId).map((row) => row.roleId);
    const uniqueIds = new Set<string>([...boundRoleIds, previousRoleId].filter((roleId): roleId is string => Boolean(roleId)));
    if (keepRoleId) {
      uniqueIds.delete(keepRoleId);
    }

    return [...uniqueIds].filter((roleId) => member.roles.cache.has(roleId));
  }

  private async resolveAssignableRole(guild: Guild, roleId: string) {
    const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      throw new Error('REGION_ROLE_MISSING');
    }

    await this.ensureBotCanManageRoles(guild, [role.id]);
    return role;
  }

  private async ensureBotCanManageRoles(guild: Guild, roleIds: string[]) {
    const botMember = guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      throw new Error('REGION_MISSING_MANAGE_ROLES');
    }

    for (const roleId of roleIds) {
      const role = guild.roles.cache.get(roleId) ?? await guild.roles.fetch(roleId).catch(() => null);
      if (!role) {
        continue;
      }

      if (role.managed || role.id === guild.id) {
        throw new Error('REGION_ROLE_INVALID');
      }

      if (role.position >= botMember.roles.highest.position) {
        throw new Error('REGION_BOT_HIERARCHY');
      }
    }
  }
}
