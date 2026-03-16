import {
  type AnyThreadChannel,
  ChannelType,
  EmbedBuilder,
  type Client,
  type ForumChannel,
  type Guild,
  type MessageCreateOptions,
} from 'discord.js';
import type { Logger } from 'pino';
import { ForumWatchesRepository } from '../db/repositories/forum-watches-repository.js';
import type { ForumWatchRow } from '../db/types.js';
import { t } from '../lib/i18n.js';
import { GuildConfigService } from './guild-config-service.js';

export class ForumWatchService {
  private readonly inFlightThreads = new Set<string>();

  constructor(
    private readonly forumWatches: ForumWatchesRepository,
    private readonly guildConfigService: GuildConfigService,
    private readonly logger: Logger,
  ) {}

  async addWatch(guildId: string, forumChannelId: string, notificationChannelId: string, lastSeenThreadTs: number | null) {
    this.forumWatches.upsert(guildId, forumChannelId, notificationChannelId, lastSeenThreadTs);
  }

  async removeWatch(guildId: string, forumChannelId: string) {
    this.forumWatches.remove(guildId, forumChannelId);
  }

  async listWatches(guildId: string) {
    return this.forumWatches.listByGuild(guildId);
  }

  async updateLastSeen(guildId: string, forumChannelId: string, lastSeenThreadTs: number) {
    this.forumWatches.updateLastSeen(guildId, forumChannelId, lastSeenThreadTs);
  }

  async primeLastSeen(channel: ForumChannel) {
    const activeThreads = await channel.threads.fetchActive();
    const archivedThreads = await channel.threads.fetchArchived();
    const latest = [...activeThreads.threads.values(), ...archivedThreads.threads.values()].reduce<number | null>((acc, thread) => {
      const created = thread.createdTimestamp ?? 0;
      if (!acc || created > acc) {
        return created;
      }
      return acc;
    }, null);

    return latest;
  }

  async handleThreadCreate(thread: AnyThreadChannel) {
    if (!thread.guildId || !thread.parentId) {
      return;
    }

    const watch = this.forumWatches.findByGuildAndForum(thread.guildId, thread.parentId);
    if (!watch) {
      return;
    }

    if (watch.lastSeenThreadTs && (thread.createdTimestamp ?? 0) <= watch.lastSeenThreadTs) {
      return;
    }

    try {
      const guild = thread.guild ?? await thread.client.guilds.fetch(thread.guildId).then((item) => item.fetch());
      const forum = thread.parent ?? await guild.channels.fetch(watch.forumChannelId);
      const notification = await guild.channels.fetch(watch.notificationChannelId);

      if (!forum || forum.type !== ChannelType.GuildForum || !notification?.isTextBased() || !('send' in notification)) {
        this.logger.warn({ watch, threadId: thread.id }, 'forum watch target is invalid');
        return;
      }

      await this.notifyThread(watch, forum, notification, thread);
    } catch (error) {
      this.logger.error({ err: error, watch, threadId: thread.id }, 'forum thread notification failed');
    }
  }

  async reconcileMissedThreads(client: Client) {
    const watches = this.forumWatches.listAll();

    for (const watch of watches) {
      try {
        const guild = await client.guilds.fetch(watch.guildId).then((item) => item.fetch());
        const forum = await guild.channels.fetch(watch.forumChannelId);
        const notification = await guild.channels.fetch(watch.notificationChannelId);

        if (!forum || forum.type !== ChannelType.GuildForum || !notification?.isTextBased() || !('send' in notification)) {
          this.logger.warn({ watch }, 'forum watch target is invalid during startup reconciliation');
          continue;
        }

        const active = await forum.threads.fetchActive();
        const archived = await forum.threads.fetchArchived();
        const candidates = [
          ...active.threads.values(),
          ...archived.threads.values(),
        ]
          .filter((thread) => (thread.createdTimestamp ?? 0) > (watch.lastSeenThreadTs ?? 0))
          .sort((left, right) => (left.createdTimestamp ?? 0) - (right.createdTimestamp ?? 0));

        for (const thread of candidates) {
          await this.notifyThread(watch, forum, notification, thread);
        }
      } catch (error) {
        this.logger.error({ err: error, watch }, 'forum startup reconciliation failed');
      }
    }
  }

  async resyncWatch(guild: Guild, forumChannelId: string, lookbackHours: number) {
    const watch = this.forumWatches.findByGuildAndForum(guild.id, forumChannelId);
    if (!watch) {
      throw new Error('FORUM_WATCH_NOT_FOUND');
    }

    const forum = await guild.channels.fetch(watch.forumChannelId);
    const notification = await guild.channels.fetch(watch.notificationChannelId);
    if (!forum || forum.type !== ChannelType.GuildForum || !notification?.isTextBased() || !('send' in notification)) {
      throw new Error('FORUM_WATCH_TARGET_INVALID');
    }

    const cutoff = Math.max(watch.lastSeenThreadTs ?? 0, Date.now() - lookbackHours * 60 * 60 * 1000);
    const active = await forum.threads.fetchActive();
    const archived = await forum.threads.fetchArchived();
    const candidates = [
      ...active.threads.values(),
      ...archived.threads.values(),
    ]
      .filter((thread) => (thread.createdTimestamp ?? 0) > cutoff)
      .sort((left, right) => (left.createdTimestamp ?? 0) - (right.createdTimestamp ?? 0));

    let delivered = 0;
    for (const thread of candidates) {
      try {
        await this.notifyThread(watch, forum, notification, thread);
        delivered += 1;
      } catch (error) {
        this.logger.error({ err: error, watch, threadId: thread.id }, 'forum manual resync failed');
        return {
          delivered,
          remaining: Math.max(0, candidates.length - delivered),
          cutoff,
        };
      }
    }

    return {
      delivered,
      remaining: 0,
      cutoff,
    };
  }

  private async notifyThread(
    watch: ForumWatchRow,
    forum: ForumChannel,
    notification: { send: (options: MessageCreateOptions) => Promise<unknown> },
    thread: AnyThreadChannel,
  ) {
    const key = `${watch.guildId}:${thread.id}`;
    if (this.inFlightThreads.has(key)) {
      return;
    }

    this.inFlightThreads.add(key);

    try {
      const config = await this.guildConfigService.getGuildConfig(watch.guildId);
      const mentions = config.roles.forum_notice.map((roleId) => `<@&${roleId}>`).join(' ');
      const embed = new EmbedBuilder()
        .setTitle(t(config.language, 'forum.newThreadTitle'))
        .setDescription(`[${thread.name}](${thread.url})`)
        .addFields(
          { name: t(config.language, 'forum.forumField'), value: `<#${forum.id}>`, inline: true },
          { name: t(config.language, 'forum.authorField'), value: thread.ownerId ? `<@${thread.ownerId}>` : t(config.language, 'forum.unknownAuthor'), inline: true },
        )
        .setColor(0x57f287)
        .setTimestamp();

      await notification.send({
        content: mentions || undefined,
        embeds: [embed],
        allowedMentions: {
          roles: config.roles.forum_notice,
        },
      });

      if (thread.createdTimestamp) {
        await this.updateLastSeen(watch.guildId, watch.forumChannelId, thread.createdTimestamp);
      }
    } finally {
      this.inFlightThreads.delete(key);
    }
  }
}
