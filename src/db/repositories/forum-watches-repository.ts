import type { DatabaseHandle } from '../client.js';
import type { ForumWatchRow } from '../types.js';

type ForumWatchRecord = {
  id: number;
  guild_id: string;
  forum_channel_id: string;
  notification_channel_id: string;
  last_seen_thread_ts: number | null;
  created_at: number;
  updated_at: number;
};

function mapForumWatch(row: ForumWatchRecord): ForumWatchRow {
  return {
    id: row.id,
    guildId: row.guild_id,
    forumChannelId: row.forum_channel_id,
    notificationChannelId: row.notification_channel_id,
    lastSeenThreadTs: row.last_seen_thread_ts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ForumWatchesRepository {
  constructor(private readonly db: DatabaseHandle) {}

  upsert(guildId: string, forumChannelId: string, notificationChannelId: string, lastSeenThreadTs: number | null) {
    const now = Date.now();
    this.db.run(
      `
        INSERT INTO forum_watches (
          guild_id,
          forum_channel_id,
          notification_channel_id,
          last_seen_thread_ts,
          created_at,
          updated_at
        )
        VALUES (:guildId, :forumChannelId, :notificationChannelId, :lastSeenThreadTs, :createdAt, :updatedAt)
        ON CONFLICT(guild_id, forum_channel_id) DO UPDATE SET
          notification_channel_id = excluded.notification_channel_id,
          last_seen_thread_ts = excluded.last_seen_thread_ts,
          updated_at = excluded.updated_at
      `,
      {
        guildId,
        forumChannelId,
        notificationChannelId,
        lastSeenThreadTs,
        createdAt: now,
        updatedAt: now,
      },
    );
  }

  remove(guildId: string, forumChannelId: string) {
    this.db.run(
      `
        DELETE FROM forum_watches
        WHERE guild_id = :guildId AND forum_channel_id = :forumChannelId
      `,
      {
        guildId,
        forumChannelId,
      },
    );
  }

  listByGuild(guildId: string) {
    const rows = this.db.all<ForumWatchRecord>(
      `
        SELECT id, guild_id, forum_channel_id, notification_channel_id, last_seen_thread_ts, created_at, updated_at
        FROM forum_watches
        WHERE guild_id = :guildId
        ORDER BY forum_channel_id ASC
      `,
      { guildId },
    );

    return rows.map(mapForumWatch);
  }

  findByGuildAndForum(guildId: string, forumChannelId: string) {
    const row = this.db.get<ForumWatchRecord>(
      `
        SELECT id, guild_id, forum_channel_id, notification_channel_id, last_seen_thread_ts, created_at, updated_at
        FROM forum_watches
        WHERE guild_id = :guildId AND forum_channel_id = :forumChannelId
      `,
      {
        guildId,
        forumChannelId,
      },
    );

    return row ? mapForumWatch(row) : null;
  }

  listAll() {
    const rows = this.db.all<ForumWatchRecord>(
      `
        SELECT id, guild_id, forum_channel_id, notification_channel_id, last_seen_thread_ts, created_at, updated_at
        FROM forum_watches
        ORDER BY guild_id ASC, forum_channel_id ASC
      `,
    );

    return rows.map(mapForumWatch);
  }

  updateLastSeen(guildId: string, forumChannelId: string, lastSeenThreadTs: number) {
    this.db.run(
      `
        UPDATE forum_watches
        SET last_seen_thread_ts = :lastSeenThreadTs, updated_at = :updatedAt
        WHERE guild_id = :guildId AND forum_channel_id = :forumChannelId
      `,
      {
        guildId,
        forumChannelId,
        lastSeenThreadTs,
        updatedAt: Date.now(),
      },
    );
  }
}
