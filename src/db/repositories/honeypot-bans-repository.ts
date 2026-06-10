import type { DatabaseHandle } from '../client.js';
import type { HoneypotBanRow } from '../types.js';

type HoneypotBanRecord = {
  id: number;
  guild_id: string;
  user_id: string;
  message_id: string | null;
  channel_id: string;
  banned_at: number;
};

function mapHoneypotBan(row: HoneypotBanRecord): HoneypotBanRow {
  return {
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    messageId: row.message_id,
    channelId: row.channel_id,
    bannedAt: row.banned_at,
  };
}

export class HoneypotBansRepository {
  constructor(private readonly db: DatabaseHandle) {}

  insert(
    guildId: string,
    userId: string,
    messageId: string | null,
    channelId: string,
    bannedAt: number,
  ) {
    this.db.run(
      `
        INSERT INTO honeypot_bans (guild_id, user_id, message_id, channel_id, banned_at)
        VALUES (:guildId, :userId, :messageId, :channelId, :bannedAt)
      `,
      {
        guildId,
        userId,
        messageId,
        channelId,
        bannedAt,
      },
    );
  }

  listByGuild(guildId: string, limit: number): HoneypotBanRow[] {
    const rows = this.db.all<HoneypotBanRecord>(
      `
        SELECT id, guild_id, user_id, message_id, channel_id, banned_at
        FROM honeypot_bans
        WHERE guild_id = :guildId
        ORDER BY banned_at DESC
        LIMIT :limit
      `,
      { guildId, limit },
    );

    return rows.map(mapHoneypotBan);
  }
}
