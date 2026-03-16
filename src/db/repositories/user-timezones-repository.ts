import type { DatabaseHandle } from '../client.js';
import type { UserTimezoneRow } from '../types.js';

type UserTimezoneRecord = {
  id: number;
  guild_id: string;
  user_id: string;
  timezone: string;
  updated_at: number;
};

function mapUserTimezone(row: UserTimezoneRecord): UserTimezoneRow {
  return {
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    timezone: row.timezone,
    updatedAt: row.updated_at,
  };
}

export class UserTimezonesRepository {
  constructor(private readonly db: DatabaseHandle) {}

  upsert(guildId: string, userId: string, timezone: string) {
    this.db.run(
      `
        INSERT INTO user_timezones (guild_id, user_id, timezone, updated_at)
        VALUES (:guildId, :userId, :timezone, :updatedAt)
        ON CONFLICT(guild_id, user_id) DO UPDATE SET
          timezone = excluded.timezone,
          updated_at = excluded.updated_at
      `,
      {
        guildId,
        userId,
        timezone,
        updatedAt: Date.now(),
      },
    );
  }

  findByGuildAndUser(guildId: string, userId: string) {
    const row = this.db.get<UserTimezoneRecord>(
      `
        SELECT id, guild_id, user_id, timezone, updated_at
        FROM user_timezones
        WHERE guild_id = :guildId AND user_id = :userId
      `,
      {
        guildId,
        userId,
      },
    );

    return row ? mapUserTimezone(row) : null;
  }
}
