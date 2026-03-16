import type { Client } from 'discord.js';
import type { Logger } from 'pino';
import type { AppEnv } from './env.js';
import { createDatabase, type DatabaseHandle } from '../db/client.js';
import { EventChannelsRepository } from '../db/repositories/event-channels-repository.js';
import { ForumWatchesRepository } from '../db/repositories/forum-watches-repository.js';
import { GrantableRolesRepository } from '../db/repositories/grantable-roles-repository.js';
import { GuildRoleBindingsRepository } from '../db/repositories/guild-role-bindings-repository.js';
import { GuildSettingsRepository } from '../db/repositories/guild-settings-repository.js';
import { RemindersRepository } from '../db/repositories/reminders-repository.js';
import { RoleCleanupJobsRepository } from '../db/repositories/role-cleanup-jobs-repository.js';
import { RoleCleanupMembersRepository } from '../db/repositories/role-cleanup-members-repository.js';
import { UserTimezonesRepository } from '../db/repositories/user-timezones-repository.js';
import { EventService } from '../domain/event-service.js';
import { ForumWatchService } from '../domain/forum-watch-service.js';
import { GuildConfigService } from '../domain/guild-config-service.js';
import { GuildHealthService } from '../domain/guild-health-service.js';
import { PermissionService } from '../domain/permission-service.js';
import { ReminderService } from '../domain/reminder-service.js';
import { RoleCleanupService } from '../domain/role-cleanup-service.js';
import { RoleService } from '../domain/role-service.js';

export type AppServices = {
  guildConfig: GuildConfigService;
  health: GuildHealthService;
  permissions: PermissionService;
  reminders: ReminderService;
  roleCleanup: RoleCleanupService;
  roles: RoleService;
  forums: ForumWatchService;
  events: EventService;
};

export type RuntimeContext = {
  env: AppEnv;
  logger: Logger;
  db: DatabaseHandle;
  client: Client;
  services: AppServices;
};

export function createRuntimeContext(env: AppEnv, logger: Logger, client: Client): RuntimeContext {
  const database = createDatabase(env.DATABASE_PATH);
  const guildSettings = new GuildSettingsRepository(database);
  const roleBindings = new GuildRoleBindingsRepository(database);
  const grantableRoles = new GrantableRolesRepository(database);
  const forumWatches = new ForumWatchesRepository(database);
  const remindersRepository = new RemindersRepository(database);
  const userTimezones = new UserTimezonesRepository(database);
  const eventChannels = new EventChannelsRepository(database);
  const roleCleanupJobs = new RoleCleanupJobsRepository(database);
  const roleCleanupMembers = new RoleCleanupMembersRepository(database);

  const guildConfig = new GuildConfigService(guildSettings, roleBindings);
  const roles = new RoleService(grantableRoles);
  const permissions = new PermissionService(guildConfig);
  const reminders = new ReminderService(remindersRepository, userTimezones, guildConfig);
  const forums = new ForumWatchService(forumWatches, guildConfig, logger);
  const events = new EventService(eventChannels, guildConfig, roles);
  const roleCleanup = new RoleCleanupService(database, roleCleanupJobs, roleCleanupMembers, guildConfig, logger);
  const health = new GuildHealthService(guildConfig, roles, forums, events, roleCleanup);

  return {
    env,
    logger,
    db: database,
    client,
    services: {
      guildConfig,
      health,
      permissions,
      reminders,
      roleCleanup,
      roles,
      forums,
      events,
    },
  };
}
