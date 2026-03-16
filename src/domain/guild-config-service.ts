import { GuildRoleBindingsRepository } from '../db/repositories/guild-role-bindings-repository.js';
import { GuildSettingsRepository } from '../db/repositories/guild-settings-repository.js';
import { isSupportedLocale } from '../lib/i18n.js';
import type { GuildSettingsRow, RoleScope, SupportedLocale } from '../db/types.js';
import { isValidTimeZone } from '../lib/time.js';

export type GuildConfig = {
  guildId: string;
  defaultTimezone: string;
  eventCategoryId: string | null;
  archiveCategoryId: string | null;
  language: SupportedLocale;
  roles: Record<RoleScope, string[]>;
};

const ALL_SCOPES: RoleScope[] = ['admin', 'manager', 'forum_notice'];

export class GuildConfigService {
  constructor(
    private readonly guildSettings: GuildSettingsRepository,
    private readonly roleBindings: GuildRoleBindingsRepository,
  ) {}

  async ensureGuildSettings(guildId: string): Promise<GuildSettingsRow> {
    return this.guildSettings.ensureDefaults(guildId);
  }

  async getGuildConfig(guildId: string): Promise<GuildConfig> {
    const settings = await this.ensureGuildSettings(guildId);
    const bindings = this.roleBindings.listByGuildId(guildId);

    const roles = {
      admin: [] as string[],
      manager: [] as string[],
      forum_notice: [] as string[],
    };

    for (const binding of bindings) {
      roles[binding.scope].push(binding.roleId);
    }

    return {
      guildId,
      defaultTimezone: settings.defaultTimezone,
      eventCategoryId: settings.eventCategoryId,
      archiveCategoryId: settings.archiveCategoryId,
      language: settings.language,
      roles,
    };
  }

  async addRoleBinding(guildId: string, scope: RoleScope, roleId: string) {
    await this.ensureGuildSettings(guildId);
    this.roleBindings.add(guildId, scope, roleId);
  }

  async removeRoleBinding(guildId: string, scope: RoleScope, roleId: string) {
    this.roleBindings.remove(guildId, scope, roleId);
  }

  async listRoleBindings(guildId: string, scope?: RoleScope) {
    if (!scope) {
      return this.roleBindings.listByGuildId(guildId);
    }

    return this.roleBindings.listByGuildAndScope(guildId, scope);
  }

  async setChannels(guildId: string, eventCategoryId: string, archiveCategoryId: string) {
    await this.ensureGuildSettings(guildId);
    this.guildSettings.upsertChannels(guildId, eventCategoryId, archiveCategoryId);
  }

  async setDefaultTimezone(guildId: string, timezone: string) {
    if (!isValidTimeZone(timezone)) {
      throw new Error('Invalid timezone.');
    }

    await this.ensureGuildSettings(guildId);
    this.guildSettings.upsertDefaultTimezone(guildId, timezone);
  }

  async setLanguage(guildId: string, language: SupportedLocale) {
    if (!isSupportedLocale(language)) {
      throw new Error('Invalid language.');
    }

    await this.ensureGuildSettings(guildId);
    this.guildSettings.upsertLanguage(guildId, language);
  }

  async getLanguage(guildId: string): Promise<SupportedLocale> {
    const settings = await this.ensureGuildSettings(guildId);
    return settings.language;
  }

  async listRolesForScope(guildId: string, scope: RoleScope) {
    const rows = await this.listRoleBindings(guildId, scope);
    return rows.map((row) => row.roleId);
  }

  async hasAnyRolesConfigured(guildId: string, scope: RoleScope) {
    const rows = await this.listRoleBindings(guildId, scope);
    return rows.length > 0;
  }

  async getSetupMissing(guildId: string) {
    const config = await this.getGuildConfig(guildId);
    const missing: string[] = [];

    if (config.roles.admin.length === 0) {
      missing.push('/setup role add scope:admin role:<role>');
    }

    if (config.roles.manager.length === 0) {
      missing.push('/setup role add scope:manager role:<role>');
    }

    if (!config.eventCategoryId || !config.archiveCategoryId) {
      missing.push('/setup event_categories event_category:<category> archive_category:<category>');
    }

    if (!config.defaultTimezone || !isValidTimeZone(config.defaultTimezone)) {
      missing.push('/setup timezone zone:<IANA>');
    }

    return { config, missing };
  }

  listScopes() {
    return ALL_SCOPES;
  }
}
