import type { DatabaseHandle } from '../client.js';
import type { MemberRegionRow } from '../types.js';

type MemberRegionRecord = {
  guild_id: string;
  user_id: string;
  region_key: string;
  role_id: string;
  confirmed_at: number;
};

function mapMemberRegion(row: MemberRegionRecord): MemberRegionRow {
  return {
    guildId: row.guild_id,
    userId: row.user_id,
    regionKey: row.region_key,
    roleId: row.role_id,
    confirmedAt: row.confirmed_at,
  };
}

export class MemberRegionsRepository {
  constructor(private readonly db: DatabaseHandle) {}

  upsert(guildId: string, userId: string, regionKey: string, roleId: string, confirmedAt = Date.now()) {
    this.db.run(
      `
        INSERT INTO member_regions (guild_id, user_id, region_key, role_id, confirmed_at)
        VALUES (:guildId, :userId, :regionKey, :roleId, :confirmedAt)
        ON CONFLICT(guild_id, user_id) DO UPDATE SET
          region_key = excluded.region_key,
          role_id = excluded.role_id,
          confirmed_at = excluded.confirmed_at
      `,
      {
        guildId,
        userId,
        regionKey,
        roleId,
        confirmedAt,
      },
    );
  }

  remove(guildId: string, userId: string) {
    this.db.run(
      `
        DELETE FROM member_regions
        WHERE guild_id = :guildId AND user_id = :userId
      `,
      {
        guildId,
        userId,
      },
    );
  }

  findByGuildAndUser(guildId: string, userId: string) {
    const row = this.db.get<MemberRegionRecord>(
      `
        SELECT guild_id, user_id, region_key, role_id, confirmed_at
        FROM member_regions
        WHERE guild_id = :guildId AND user_id = :userId
      `,
      {
        guildId,
        userId,
      },
    );

    return row ? mapMemberRegion(row) : null;
  }
}
