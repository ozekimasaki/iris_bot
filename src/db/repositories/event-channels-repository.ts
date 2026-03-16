import type { DatabaseHandle } from '../client.js';
import type { EventChannelRow } from '../types.js';

type EventChannelRecord = {
  id: number;
  guild_id: string;
  text_channel_id: string;
  role_id: string;
  display_name: string;
  archived_at: number | null;
  created_by: string;
  created_at: number;
};

function mapEventChannel(row: EventChannelRecord): EventChannelRow {
  return {
    id: row.id,
    guildId: row.guild_id,
    textChannelId: row.text_channel_id,
    roleId: row.role_id,
    displayName: row.display_name,
    archivedAt: row.archived_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export class EventChannelsRepository {
  constructor(private readonly db: DatabaseHandle) {}

  insert(guildId: string, textChannelId: string, roleId: string, displayName: string, createdBy: string) {
    this.db.run(
      `
        INSERT INTO event_channels (
          guild_id,
          text_channel_id,
          role_id,
          display_name,
          archived_at,
          created_by,
          created_at
        )
        VALUES (
          :guildId,
          :textChannelId,
          :roleId,
          :displayName,
          NULL,
          :createdBy,
          :createdAt
        )
      `,
      {
        guildId,
        textChannelId,
        roleId,
        displayName,
        createdBy,
        createdAt: Date.now(),
      },
    );
  }

  findActiveByGuildAndChannel(guildId: string, channelId: string) {
    const row = this.db.get<EventChannelRecord>(
      `
        SELECT id, guild_id, text_channel_id, role_id, display_name, archived_at, created_by, created_at
        FROM event_channels
        WHERE guild_id = :guildId AND text_channel_id = :channelId AND archived_at IS NULL
      `,
      {
        guildId,
        channelId,
      },
    );

    return row ? mapEventChannel(row) : null;
  }

  listActiveByGuild(guildId: string, limit: number, offset: number) {
    const rows = this.db.all<EventChannelRecord>(
      `
        SELECT id, guild_id, text_channel_id, role_id, display_name, archived_at, created_by, created_at
        FROM event_channels
        WHERE guild_id = :guildId AND archived_at IS NULL
        ORDER BY created_at DESC, id DESC
        LIMIT :limit OFFSET :offset
      `,
      {
        guildId,
        limit,
        offset,
      },
    );

    return rows.map(mapEventChannel);
  }

  archiveById(recordId: number, archivedAt: number) {
    this.db.run(
      `
        UPDATE event_channels
        SET archived_at = :archivedAt
        WHERE id = :recordId
      `,
      {
        recordId,
        archivedAt,
      },
    );
  }
}
