import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
} from 'discord.js';
import { EventService } from './event-service.js';
import { ForumWatchService } from './forum-watch-service.js';
import { GuildConfigService } from './guild-config-service.js';
import { RoleCleanupService } from './role-cleanup-service.js';
import { RoleService } from './role-service.js';
import { isValidTimeZone } from '../lib/time.js';

export type GuildHealthReport = {
  blocking: string[];
  warnings: string[];
};

export class GuildHealthService {
  constructor(
    private readonly guildConfigService: GuildConfigService,
    private readonly roleService: RoleService,
    private readonly forumWatchService: ForumWatchService,
    private readonly eventService: EventService,
    private readonly roleCleanupService: RoleCleanupService,
  ) {}

  async validateGuild(guild: Guild): Promise<GuildHealthReport> {
    const report: GuildHealthReport = {
      blocking: [],
      warnings: [],
    };

    const config = await this.guildConfigService.getGuildConfig(guild.id);
    const botMember = guild.members.me;
    const botPermissions = botMember?.permissions;
    const activeEvents = await this.eventService.listAllActiveEvents(guild.id);
    const grantableRoles = await this.roleService.listGrantableRoles(guild.id);
    const forumWatches = await this.forumWatchService.listWatches(guild.id);
    const pendingCleanupJobs = this.roleCleanupService.listPendingJobs(guild.id);

    if (config.roles.admin.length === 0) {
      report.blocking.push('No admin roles are configured.');
    }
    if (config.roles.manager.length === 0) {
      report.blocking.push('No manager roles are configured.');
    }
    if (!config.eventCategoryId) {
      report.blocking.push('Event category is not configured.');
    } else {
      const channel = await guild.channels.fetch(config.eventCategoryId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildCategory) {
        report.blocking.push(`Configured event category ${config.eventCategoryId} is missing or not a category.`);
      }
    }
    if (!config.archiveCategoryId) {
      report.blocking.push('Archive category is not configured.');
    } else {
      const channel = await guild.channels.fetch(config.archiveCategoryId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildCategory) {
        report.blocking.push(`Configured archive category ${config.archiveCategoryId} is missing or not a category.`);
      }
    }
    if (!config.defaultTimezone || !isValidTimeZone(config.defaultTimezone)) {
      report.blocking.push('Default timezone is missing or invalid.');
    }

    for (const roleId of config.roles.admin) {
      if (!guild.roles.cache.has(roleId)) {
        report.blocking.push(`Configured admin role ${roleId} no longer exists.`);
      }
    }
    for (const roleId of config.roles.manager) {
      if (!guild.roles.cache.has(roleId)) {
        report.blocking.push(`Configured manager role ${roleId} no longer exists.`);
      }
    }
    for (const roleId of config.roles.forum_notice) {
      if (!guild.roles.cache.has(roleId)) {
        report.warnings.push(`Configured forum notice role ${roleId} no longer exists.`);
      }
    }
    if (forumWatches.length > 0 && config.roles.forum_notice.length === 0) {
      report.warnings.push('Forum watches exist but no forum notice roles are configured.');
    }

    if ((grantableRoles.length > 0 || pendingCleanupJobs.length > 0) && !botPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      report.blocking.push('Bot is missing Manage Roles while role operations are configured.');
    }
    if ((activeEvents.length > 0 || config.eventCategoryId || config.archiveCategoryId) && !botPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      report.blocking.push('Bot is missing Manage Channels while event operations are configured.');
    }
    if (forumWatches.length > 0 && !botPermissions?.has(PermissionFlagsBits.SendMessages)) {
      report.blocking.push('Bot is missing Send Messages while forum watches are configured.');
    }

    for (const row of grantableRoles) {
      const role = guild.roles.cache.get(row.roleId);
      if (!role) {
        report.warnings.push(`Grantable role ${row.roleId} no longer exists.`);
        continue;
      }
      if (botMember && role.position >= botMember.roles.highest.position) {
        report.warnings.push(`Grantable role ${role.name} is above the bot role.`);
      }
    }

    for (const row of forumWatches) {
      const forum = await guild.channels.fetch(row.forumChannelId).catch(() => null);
      const notification = await guild.channels.fetch(row.notificationChannelId).catch(() => null);
      if (!forum || forum.type !== ChannelType.GuildForum) {
        report.blocking.push(`Forum watch target ${row.forumChannelId} is missing or not a forum.`);
      }
      if (!notification || notification.type !== ChannelType.GuildText) {
        report.blocking.push(`Forum watch notification channel ${row.notificationChannelId} is missing or not a text channel.`);
      }
    }

    for (const row of activeEvents) {
      const channel = await guild.channels.fetch(row.textChannelId).catch(() => null);
      const role = guild.roles.cache.get(row.roleId) ?? await guild.roles.fetch(row.roleId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildText) {
        report.warnings.push(`Active event ${row.displayName} points to a missing text channel (${row.textChannelId}).`);
      }
      if (!role) {
        report.warnings.push(`Active event ${row.displayName} points to a missing role (${row.roleId}).`);
      }
    }

    for (const job of pendingCleanupJobs) {
      const role = guild.roles.cache.get(job.roleId) ?? await guild.roles.fetch(job.roleId).catch(() => null);
      const channel = await guild.channels.fetch(job.channelId).catch(() => null);
      if (!role) {
        report.warnings.push(`Pending cleanup job ${job.id} points to a missing role (${job.roleId}).`);
      }
      if (!channel || !channel.isTextBased() || !('messages' in channel)) {
        report.warnings.push(`Pending cleanup job ${job.id} points to a missing text channel (${job.channelId}).`);
        continue;
      }
      const message = await channel.messages.fetch(job.messageId).catch(() => null);
      if (!message) {
        report.warnings.push(`Pending cleanup job ${job.id} points to a missing prompt message (${job.messageId}).`);
      }
    }

    return report;
  }
}
