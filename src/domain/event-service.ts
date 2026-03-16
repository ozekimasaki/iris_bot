import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
} from 'discord.js';
import { EventChannelsRepository } from '../db/repositories/event-channels-repository.js';
import { GuildConfigService } from './guild-config-service.js';
import { RoleService } from './role-service.js';

function sanitizeChannelName(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_ぁ-んァ-ン一-龠]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
}

function buildDisplayName(name: string, date?: string | null) {
  return date ? `${date}_${name}` : name;
}

export class EventService {
  constructor(
    private readonly eventChannels: EventChannelsRepository,
    private readonly guildConfigService: GuildConfigService,
    private readonly roleService: RoleService,
  ) {}

  async createEvent(guild: Guild, actorUserId: string, name: string, date?: string | null) {
    const config = await this.guildConfigService.getGuildConfig(guild.id);
    if (!config.eventCategoryId) {
      throw new Error('EVENT_CATEGORY_NOT_CONFIGURED');
    }

    const displayName = buildDisplayName(name, date);
    const channelName = sanitizeChannelName(displayName) || `event-${Date.now()}`;
    const roleName = displayName.slice(0, 100);

    const eventRole = await guild.roles.create({
      name: roleName,
      mentionable: true,
      reason: `Event role for ${displayName}`,
    });

    const permissionOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: eventRole.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
    ];

    for (const roleId of [...config.roles.admin, ...config.roles.manager]) {
      permissionOverwrites.push({
        id: roleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels],
      });
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: config.eventCategoryId,
      permissionOverwrites,
      reason: `Event channel for ${displayName}`,
    });

    this.eventChannels.insert(guild.id, channel.id, eventRole.id, displayName, actorUserId);

    await this.roleService.addGrantableRole(guild.id, eventRole.id, 'event', channel.id);

    return {
      channel,
      role: eventRole,
      displayName,
    };
  }

  async getActiveEventByChannel(guildId: string, channelId: string) {
    return this.eventChannels.findActiveByGuildAndChannel(guildId, channelId);
  }

  async listActiveEvents(guildId: string, page: number, pageSize = 10) {
    const offset = Math.max(0, (page - 1) * pageSize);
    return this.eventChannels.listActiveByGuild(guildId, pageSize, offset);
  }

  async listAllActiveEvents(guildId: string) {
    return this.eventChannels.listActiveByGuild(guildId, 1000, 0);
  }

  async archiveEvent(guild: Guild, channelId: string) {
    const config = await this.guildConfigService.getGuildConfig(guild.id);
    if (!config.archiveCategoryId) {
      throw new Error('ARCHIVE_CATEGORY_NOT_CONFIGURED');
    }

    const record = await this.getActiveEventByChannel(guild.id, channelId);
    if (!record) {
      throw new Error('EVENT_NOT_FOUND');
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error('EVENT_CHANNEL_NOT_FOUND');
    }

    await channel.setParent(config.archiveCategoryId, { lockPermissions: false });

    this.eventChannels.archiveById(record.id, Date.now());

    await this.roleService.deactivateGrantableRole(guild.id, record.roleId);

    return record;
  }
}
