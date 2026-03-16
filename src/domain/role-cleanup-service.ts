import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Channel,
  type Client,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type Message,
  type Role,
  type TextBasedChannel,
} from 'discord.js';
import { DateTime } from 'luxon';
import type { DatabaseHandle } from '../db/client.js';
import { RoleCleanupJobsRepository } from '../db/repositories/role-cleanup-jobs-repository.js';
import { RoleCleanupMembersRepository } from '../db/repositories/role-cleanup-members-repository.js';
import type { RoleCleanupJobRow, SupportedLocale } from '../db/types.js';
import { makeOpaqueId } from '../lib/discord.js';
import { t } from '../lib/i18n.js';
import { GuildConfigService } from './guild-config-service.js';

const CLEANUP_EMOJI = '✅';
const TERMINAL_JOB_LIMIT = 200;
const TERMINAL_JOB_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

type CleanupTargetChannel = GuildBasedChannel & TextBasedChannel & {
  id: string;
  send: (options: {
    content?: string;
    embeds?: EmbedBuilder[];
    allowedMentions?: {
      roles?: string[];
    };
  }) => Promise<Message>;
  messages: {
    fetch: (messageId: string) => Promise<Message>;
  };
};

function isCleanupTargetChannel(channel: Channel | null): channel is CleanupTargetChannel {
  return Boolean(channel?.isTextBased() && 'guild' in channel && 'send' in channel);
}

async function collectReactionUserIds(message: Message, emoji: string) {
  const reaction = message.reactions.cache.find((entry) => (entry.emoji.name ?? '') === emoji);
  if (!reaction) {
    return new Set<string>();
  }

  const reactedUserIds = new Set<string>();
  let after: string | undefined;

  while (true) {
    const page = await reaction.users.fetch({ limit: 100, after });
    if (page.size === 0) {
      break;
    }

    for (const user of page.values()) {
      if (!user.bot) {
        reactedUserIds.add(user.id);
      }
    }

    if (page.size < 100) {
      break;
    }

    after = page.last()?.id;
    if (!after) {
      break;
    }
  }

  return reactedUserIds;
}

function getCleanupErrorCode(error: unknown) {
  return error instanceof Error ? error.message : 'CLEANUP_UNKNOWN_ERROR';
}

export class RoleCleanupService {
  constructor(
    private readonly db: DatabaseHandle,
    private readonly jobs: RoleCleanupJobsRepository,
    private readonly members: RoleCleanupMembersRepository,
    private readonly guildConfigService: GuildConfigService,
    private readonly logger: import('pino').Logger,
  ) {}

  async startCleanup(
    guild: Guild,
    actor: GuildMember,
    role: Role,
    channel: Channel | null,
    deadlineAt: number,
  ) {
    if (role.managed) {
      throw new Error('CLEANUP_ROLE_MANAGED');
    }

    const config = await this.guildConfigService.getGuildConfig(guild.id);
    if (config.roles.admin.includes(role.id)) {
      throw new Error('CLEANUP_ROLE_ADMIN_SCOPE');
    }

    const botMember = guild.members.me;
    if (!botMember || role.position >= botMember.roles.highest.position) {
      throw new Error('CLEANUP_ROLE_BOT_HIERARCHY');
    }

    if (guild.ownerId !== actor.id && role.position >= actor.roles.highest.position) {
      throw new Error('CLEANUP_ROLE_USER_HIERARCHY');
    }

    if (deadlineAt <= Date.now()) {
      throw new Error('CLEANUP_DEADLINE_PAST');
    }

    if (!isCleanupTargetChannel(channel)) {
      throw new Error('CLEANUP_CHANNEL_INVALID');
    }

    const allMembers = await guild.members.fetch();
    const targetMembers = [...allMembers.values()]
      .filter((member) => member.roles.cache.has(role.id))
      .sort((left, right) => left.id.localeCompare(right.id));
    const targetMemberIds = targetMembers.map((member) => member.id);

    const hiddenTargetExists = targetMembers.some((member) => !channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel));
    if (hiddenTargetExists) {
      throw new Error('CLEANUP_CHANNEL_NOT_VISIBLE_TO_TARGETS');
    }

    const locale = await this.guildConfigService.getLanguage(guild.id);
    const promptMessage = await channel.send({
      content: `<@&${role.id}>`,
      embeds: [
        new EmbedBuilder()
          .setTitle(t(locale, 'role.cleanupPromptTitle'))
          .setDescription(t(locale, 'role.cleanupPromptDescription', {
            role: `<@&${role.id}>`,
            emoji: CLEANUP_EMOJI,
            deadline: DateTime.fromMillis(deadlineAt, { zone: config.defaultTimezone }).toFormat('yyyy-LL-dd HH:mm ZZZZ'),
          }))
          .setColor(0x5865f2)
          .setTimestamp(),
      ],
      allowedMentions: {
        roles: [role.id],
      },
    });

    try {
      await promptMessage.react(CLEANUP_EMOJI);
    } catch (error) {
      try {
        await promptMessage.delete();
      } catch {
        // Best effort cleanup.
      }
      this.logger.error({ err: error, guildId: guild.id, channelId: channel.id, roleId: role.id }, 'failed to initialize cleanup prompt');
      throw new Error('CLEANUP_REACTION_INIT_FAILED');
    }

    const jobId = makeOpaqueId('cleanup');
    const now = Date.now();
    const job: RoleCleanupJobRow = {
      id: jobId,
      guildId: guild.id,
      channelId: channel.id,
      messageId: promptMessage.id,
      roleId: role.id,
      emoji: CLEANUP_EMOJI,
      deadlineAt,
      createdBy: actor.id,
      status: 'active',
      retryCount: 0,
      errorCode: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };

    this.db.transaction(() => {
      this.jobs.insert(job);
      this.members.insertMany(jobId, targetMemberIds);
    });
    this.pruneOldJobs();

    return {
      jobId,
      messageUrl: promptMessage.url,
      targetCount: targetMemberIds.length,
    };
  }

  async listJobs(guildId: string, page: number, pageSize = 10) {
    const safePage = Math.max(1, page);
    const offset = (safePage - 1) * pageSize;
    return {
      active: this.jobs.listActiveByGuild(guildId, pageSize, offset),
      recent: this.jobs.listRecentTerminalByGuild(guildId, pageSize, offset),
    };
  }

  async cancelJob(guildId: string, jobId: string) {
    const job = this.jobs.findByGuildAndId(guildId, jobId);
    if (!job) {
      throw new Error('CLEANUP_JOB_NOT_FOUND');
    }

    if (job.status !== 'active') {
      throw new Error('CLEANUP_JOB_NOT_ACTIVE');
    }

    this.jobs.cancel(jobId);
    this.pruneOldJobs();
  }

  async retryJob(guildId: string, jobId: string) {
    const job = this.jobs.findByGuildAndId(guildId, jobId);
    if (!job) {
      throw new Error('CLEANUP_JOB_NOT_FOUND');
    }

    const members = this.members.listByJob(jobId);
    const retryable = members.some((member) => member.status === 'pending' || member.status === 'remove_failed');
    if (!retryable) {
      throw new Error('CLEANUP_JOB_NOT_RETRYABLE');
    }

    this.jobs.rescheduleForRetry(jobId, Date.now());
  }

  async restoreJob(guild: Guild, actor: GuildMember, jobId: string) {
    const job = this.jobs.findByGuildAndId(guild.id, jobId);
    if (!job) {
      throw new Error('CLEANUP_JOB_NOT_FOUND');
    }

    const role = guild.roles.cache.get(job.roleId);
    if (!role) {
      throw new Error('CLEANUP_ROLE_MISSING');
    }

    const botMember = guild.members.me;
    if (!botMember || role.position >= botMember.roles.highest.position) {
      throw new Error('CLEANUP_ROLE_BOT_HIERARCHY');
    }

    const config = await this.guildConfigService.getGuildConfig(guild.id);
    if (config.roles.admin.includes(role.id)) {
      throw new Error('CLEANUP_ROLE_ADMIN_SCOPE');
    }

    if (guild.ownerId !== actor.id && role.position >= actor.roles.highest.position) {
      throw new Error('CLEANUP_ROLE_USER_HIERARCHY');
    }

    const rows = this.members.listByJob(jobId).filter((row) => row.status === 'removed');
    if (rows.length === 0) {
      throw new Error('CLEANUP_JOB_NOT_RESTORABLE');
    }

    let restored = 0;
    let failed = 0;
    for (const row of rows) {
      const member = await guild.members.fetch(row.userId).catch(() => null);
      if (!member) {
        this.members.updateStatus(jobId, row.userId, 'restore_failed', 'MEMBER_NOT_FOUND');
        failed += 1;
        continue;
      }

      if (member.roles.cache.has(role.id)) {
        this.members.updateStatus(jobId, row.userId, 'restored', null);
        restored += 1;
        continue;
      }

      try {
        await member.roles.add(role, 'Role cleanup restore');
        this.members.updateStatus(jobId, row.userId, 'restored', null);
        restored += 1;
      } catch (error) {
        this.logger.error({ err: error, guildId: guild.id, jobId, userId: row.userId }, 'failed to restore cleanup role');
        this.members.updateStatus(jobId, row.userId, 'restore_failed', getCleanupErrorCode(error));
        failed += 1;
      }
    }

    return { restored, failed };
  }

  listPendingJobs(guildId: string) {
    return this.jobs.listPendingByGuild(guildId);
  }

  async processDueJobs(client: Client) {
    const dueJobs = this.jobs.listDue(Date.now());
    for (const job of dueJobs) {
      await this.processJob(client, job);
    }
    this.pruneOldJobs();
  }

  private async processJob(client: Client, job: RoleCleanupJobRow) {
    this.jobs.markProcessing(job.id);

    let errorCode: string | null = null;
    let removed = 0;
    let confirmed = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const guild = await client.guilds.fetch(job.guildId).then((entry) => entry.fetch()).catch(() => null);
      if (!guild) {
        errorCode = 'GUILD_NOT_FOUND';
        return;
      }

      const locale = await this.guildConfigService.getLanguage(guild.id);
      const channel = await guild.channels.fetch(job.channelId).catch(() => null);
      const role = guild.roles.cache.get(job.roleId) ?? await guild.roles.fetch(job.roleId).catch(() => null);
      if (!isCleanupTargetChannel(channel)) {
        errorCode = 'CLEANUP_CHANNEL_INVALID';
        return;
      }

      if (!role) {
        await this.sendProcessorSummary(channel, locale, job.id, job.roleId, confirmed, removed, skipped, failed, 'CLEANUP_ROLE_MISSING');
        errorCode = 'CLEANUP_ROLE_MISSING';
        return;
      }

      const botMember = guild.members.me;
      if (!botMember || role.position >= botMember.roles.highest.position) {
        await this.sendProcessorSummary(channel, locale, job.id, role.id, confirmed, removed, skipped, failed, 'CLEANUP_ROLE_BOT_HIERARCHY');
        errorCode = 'CLEANUP_ROLE_BOT_HIERARCHY';
        return;
      }

      const message = await channel.messages.fetch(job.messageId).catch(() => null);
      if (!message) {
        await this.sendProcessorSummary(channel, locale, job.id, role.id, confirmed, removed, skipped, failed, 'CLEANUP_PROMPT_MISSING');
        errorCode = 'CLEANUP_PROMPT_MISSING';
        return;
      }

      const reactedUserIds = await collectReactionUserIds(message, job.emoji);
      const memberRows = this.members.listByJob(job.id);
      const targetRows = memberRows.filter((row) => row.status === 'pending' || row.status === 'remove_failed');
      const allMembers = await guild.members.fetch();

      for (const row of targetRows) {
        if (reactedUserIds.has(row.userId)) {
          this.members.updateStatus(job.id, row.userId, 'confirmed', null);
          confirmed += 1;
          continue;
        }

        const member = allMembers.get(row.userId);
        if (!member || !member.roles.cache.has(role.id)) {
          this.members.updateStatus(job.id, row.userId, 'skipped', !member ? 'MEMBER_NOT_FOUND' : null);
          skipped += 1;
          continue;
        }

        try {
          await member.roles.remove(role, 'Role cleanup confirmation timeout');
          this.members.updateStatus(job.id, row.userId, 'removed', null);
          removed += 1;
        } catch (error) {
          this.logger.error({ err: error, guildId: guild.id, jobId: job.id, userId: row.userId }, 'failed to remove cleanup role');
          this.members.updateStatus(job.id, row.userId, 'remove_failed', getCleanupErrorCode(error));
          failed += 1;
        }
      }

      if (failed > 0) {
        errorCode = 'CLEANUP_PARTIAL_FAILURE';
      }

      await this.sendProcessorSummary(channel, locale, job.id, role.id, confirmed, removed, skipped, failed, errorCode);
    } catch (error) {
      errorCode = getCleanupErrorCode(error);
      this.logger.error({ err: error, jobId: job.id }, 'role cleanup processor failed');
    } finally {
      this.jobs.complete(job.id, errorCode);
    }
  }

  private async sendProcessorSummary(
    channel: CleanupTargetChannel,
    locale: SupportedLocale,
    jobId: string,
    roleId: string,
    confirmed: number,
    removed: number,
    skipped: number,
    failed: number,
    errorCode: string | null,
  ) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle(t(locale, 'role.cleanupResultTitle'))
          .setDescription(t(locale, 'role.cleanupResultDescription', { jobId, role: `<@&${roleId}>` }))
          .addFields(
            { name: t(locale, 'role.cleanupConfirmedField'), value: String(confirmed), inline: true },
            { name: t(locale, 'role.cleanupRemovedField'), value: String(removed), inline: true },
            { name: t(locale, 'role.cleanupSkippedField'), value: String(skipped), inline: true },
            { name: t(locale, 'role.cleanupFailedField'), value: String(failed), inline: true },
            { name: t(locale, 'role.cleanupStatusField'), value: errorCode ? errorCode : t(locale, 'role.cleanupStatusOk') },
          )
          .setColor(errorCode ? 0xed4245 : 0x57f287)
          .setTimestamp(),
      ],
    });
  }

  private pruneOldJobs() {
    const cutoff = Date.now() - TERMINAL_JOB_MAX_AGE_MS;
    this.jobs.deleteTerminalBefore(cutoff);

    const terminalIds = this.jobs.listTerminalIdsNewestFirst();
    if (terminalIds.length <= TERMINAL_JOB_LIMIT) {
      return;
    }

    this.jobs.deleteByIds(terminalIds.slice(TERMINAL_JOB_LIMIT));
  }
}
