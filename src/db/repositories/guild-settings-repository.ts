import type { DatabaseHandle } from '../client.js';
import type { GuildSettingsRow, SupportedLocale } from '../types.js';

type GuildSettingsRecord = {
  guild_id: string;
  event_category_id: string | null;
  archive_category_id: string | null;
  default_timezone: string;
  language: SupportedLocale;
  updated_at: number;
};

function mapGuildSettings(row: GuildSettingsRecord): GuildSettingsRow {
  return {
    guildId: row.guild_id,
    eventCategoryId: row.event_category_id,
    archiveCategoryId: row.archive_category_id,
    defaultTimezone: row.default_timezone,
    language: row.language,
    updatedAt: row.updated_at,
  };
}

export class GuildSettingsRepository {
  constructor(private readonly db: DatabaseHandle) {}

  findByGuildId(guildId: string): GuildSettingsRow | null {
    const row = this.db.get<GuildSettingsRecord>(
      `
        SELECT guild_id, event_category_id, archive_category_id, default_timezone, language, updated_at
        FROM guild_settings
        WHERE guild_id = :guildId
      `,
      { guildId },
    );

    return row ? mapGuildSettings(row) : null;
  }

  ensureDefaults(guildId: string): GuildSettingsRow {
    const existing = this.findByGuildId(guildId);
    if (existing) {
      return existing;
    }

    const now = Date.now();
    this.db.run(
      `
        INSERT INTO guild_settings (guild_id, default_timezone, updated_at)
        VALUES (:guildId, :defaultTimezone, :updatedAt)
      `,
      {
        guildId,
        defaultTimezone: 'UTC',
        updatedAt: now,
      },
    );

    return {
      guildId,
      eventCategoryId: null,
      archiveCategoryId: null,
      defaultTimezone: 'UTC',
      language: 'en' as const,
      updatedAt: now,
    };
  }

  upsertChannels(guildId: string, eventCategoryId: string, archiveCategoryId: string) {
    const now = Date.now();
    this.db.run(
      `
        INSERT INTO guild_settings (guild_id, event_category_id, archive_category_id, default_timezone, updated_at)
        VALUES (:guildId, :eventCategoryId, :archiveCategoryId, 'UTC', :updatedAt)
        ON CONFLICT(guild_id) DO UPDATE SET
          event_category_id = excluded.event_category_id,
          archive_category_id = excluded.archive_category_id,
          updated_at = excluded.updated_at
      `,
      {
        guildId,
        eventCategoryId,
        archiveCategoryId,
        updatedAt: now,
      },
    );
  }

  upsertDefaultTimezone(guildId: string, timezone: string) {
    const now = Date.now();
    this.db.run(
      `
        INSERT INTO guild_settings (guild_id, default_timezone, updated_at)
        VALUES (:guildId, :timezone, :updatedAt)
        ON CONFLICT(guild_id) DO UPDATE SET
          default_timezone = excluded.default_timezone,
          updated_at = excluded.updated_at
      `,
      {
        guildId,
        timezone,
        updatedAt: now,
      },
    );
  }

  upsertLanguage(guildId: string, language: SupportedLocale) {
    const now = Date.now();
    this.db.run(
      `
        INSERT INTO guild_settings (guild_id, language, updated_at)
        VALUES (:guildId, :language, :updatedAt)
        ON CONFLICT(guild_id) DO UPDATE SET
          language = excluded.language,
          updated_at = excluded.updated_at
      `,
      {
        guildId,
        language,
        updatedAt: now,
      },
    );
  }
}
