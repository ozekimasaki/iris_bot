import type { DatabaseHandle } from '../client.js';
import type { ReminderRow, ReminderStatus } from '../types.js';

type ReminderRecord = {
  id: string;
  guild_id: string;
  channel_id: string;
  creator_user_id: string;
  content: string;
  target_user_id: string | null;
  target_role_id: string | null;
  repeat_days: number | null;
  next_run_at: number;
  timezone: string;
  status: ReminderStatus;
  created_at: number;
  updated_at: number;
};

function mapReminder(row: ReminderRecord): ReminderRow {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    creatorUserId: row.creator_user_id,
    content: row.content,
    targetUserId: row.target_user_id,
    targetRoleId: row.target_role_id,
    repeatDays: row.repeat_days,
    nextRunAt: row.next_run_at,
    timezone: row.timezone,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type InsertReminderInput = {
  id: string;
  guildId: string;
  channelId: string;
  creatorUserId: string;
  content: string;
  targetUserId: string | null;
  targetRoleId: string | null;
  repeatDays: number | null;
  nextRunAt: number;
  timezone: string;
  status: ReminderStatus;
  createdAt: number;
  updatedAt: number;
};

export class RemindersRepository {
  constructor(private readonly db: DatabaseHandle) {}

  insert(input: InsertReminderInput) {
    this.db.run(
      `
        INSERT INTO reminders (
          id,
          guild_id,
          channel_id,
          creator_user_id,
          content,
          target_user_id,
          target_role_id,
          repeat_days,
          next_run_at,
          timezone,
          status,
          created_at,
          updated_at
        )
        VALUES (
          :id,
          :guildId,
          :channelId,
          :creatorUserId,
          :content,
          :targetUserId,
          :targetRoleId,
          :repeatDays,
          :nextRunAt,
          :timezone,
          :status,
          :createdAt,
          :updatedAt
        )
      `,
      input,
    );
  }

  listByCreator(guildId: string, userId: string, limit: number, offset: number) {
    const rows = this.db.all<ReminderRecord>(
      `
        SELECT id, guild_id, channel_id, creator_user_id, content, target_user_id, target_role_id,
               repeat_days, next_run_at, timezone, status, created_at, updated_at
        FROM reminders
        WHERE guild_id = :guildId AND creator_user_id = :userId AND status = 'active'
        ORDER BY next_run_at ASC
        LIMIT :limit OFFSET :offset
      `,
      {
        guildId,
        userId,
        limit,
        offset,
      },
    );

    return rows.map(mapReminder);
  }

  findByIdAndGuild(reminderId: string, guildId: string) {
    const row = this.db.get<ReminderRecord>(
      `
        SELECT id, guild_id, channel_id, creator_user_id, content, target_user_id, target_role_id,
               repeat_days, next_run_at, timezone, status, created_at, updated_at
        FROM reminders
        WHERE id = :reminderId AND guild_id = :guildId
      `,
      {
        reminderId,
        guildId,
      },
    );

    return row ? mapReminder(row) : null;
  }

  deleteById(reminderId: string) {
    this.db.run(
      `
        DELETE FROM reminders
        WHERE id = :reminderId
      `,
      { reminderId },
    );
  }

  listDue(now: number) {
    const rows = this.db.all<ReminderRecord>(
      `
        SELECT id, guild_id, channel_id, creator_user_id, content, target_user_id, target_role_id,
               repeat_days, next_run_at, timezone, status, created_at, updated_at
        FROM reminders
        WHERE status = 'active' AND next_run_at <= :now
        ORDER BY next_run_at ASC
      `,
      { now },
    );

    return rows.map(mapReminder);
  }

  updateStatus(reminderId: string, status: ReminderStatus) {
    this.db.run(
      `
        UPDATE reminders
        SET status = :status, updated_at = :updatedAt
        WHERE id = :reminderId
      `,
      {
        reminderId,
        status,
        updatedAt: Date.now(),
      },
    );
  }

  updateNextRun(reminderId: string, nextRunAt: number) {
    this.db.run(
      `
        UPDATE reminders
        SET next_run_at = :nextRunAt, updated_at = :updatedAt
        WHERE id = :reminderId
      `,
      {
        reminderId,
        nextRunAt,
        updatedAt: Date.now(),
      },
    );
  }
}
