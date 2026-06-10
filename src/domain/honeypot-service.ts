import { PermissionFlagsBits, type Message } from 'discord.js';
import type { Logger } from 'pino';
import { HoneypotBansRepository } from '../db/repositories/honeypot-bans-repository.js';
import type { HoneypotBanRow } from '../db/types.js';
import { GuildConfigService } from './guild-config-service.js';
import { PermissionService } from './permission-service.js';

const BAN_DELETE_MESSAGE_SECONDS = 86_400; // 24 hours

export class HoneypotService {
  constructor(
    private readonly guildConfigService: GuildConfigService,
    private readonly permissionService: PermissionService,
    private readonly honeypotBans: HoneypotBansRepository,
    private readonly logger: Logger,
  ) {}

  async handleMessage(message: Message) {
    if (!message.inGuild() || message.author.bot) {
      return;
    }

    const honeypotChannelId = await this.guildConfigService.getHoneypotChannelId(message.guildId);
    if (!honeypotChannelId || message.channelId !== honeypotChannelId) {
      return;
    }

    const guild = message.guild;
    if (message.author.id === guild.ownerId) {
      return;
    }

    const member = message.member ?? await guild.members.fetch(message.author.id).catch(() => null);
    if (!member) {
      this.logger.warn({ guildId: guild.id, userId: message.author.id }, 'honeypot target member not found');
      return;
    }

    if (await this.permissionService.canRunManagerAction(guild.id, member)) {
      return;
    }

    try {
      await guild.members.ban(message.author.id, {
        deleteMessageSeconds: BAN_DELETE_MESSAGE_SECONDS,
        reason: 'Honeypot',
      });
      this.honeypotBans.insert(
        guild.id,
        message.author.id,
        message.id,
        message.channelId,
        Date.now(),
      );
      this.logger.info({ guildId: guild.id, userId: message.author.id }, 'honeypot ban applied');
    } catch (error) {
      const botMember = guild.members.me;
      if (!botMember?.permissions.has(PermissionFlagsBits.BanMembers)) {
        this.logger.warn({ guildId: guild.id, userId: message.author.id }, 'honeypot ban failed: missing BanMembers');
      } else {
        this.logger.error({ err: error, guildId: guild.id, userId: message.author.id }, 'honeypot ban failed');
      }
    }
  }

  listBans(guildId: string, limit: number): HoneypotBanRow[] {
    return this.honeypotBans.listByGuild(guildId, limit);
  }
}
