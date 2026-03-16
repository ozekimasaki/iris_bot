import type { DatabaseHandle } from '../client.js';
import type { CleanupJobStatus, RoleCleanupJobRow } from '../types.js';

type RoleCleanupJobRecord = {
  id: string;
  guild_id: string;
  channel_id: string;
  message_id: string;
  role_id: string;
  emoji: string;
  deadline_at: number;
  created_by: string;
  status: CleanupJobStatus;
  retry_count: number;
  error_code: string | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
};

function mapRoleCleanupJob(row: RoleCleanupJobRecord): RoleCleanupJobRow {
  return {
    id: row.id,
    guildId: row.guild_id,
    channelId: row.channel_id,
    messageId: row.message_id,
    roleId: row.role_id,
    emoji: row.emoji,
    deadlineAt: row.deadline_at,
    createdBy: row.created_by,
    status: row.status,
    retryCount: row.retry_count,
    errorCode: row.error_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

export class RoleCleanupJobsRepository {
  constructor(private readonly db: DatabaseHandle) {}

  insert(row: RoleCleanupJobRow) {
    this.db.run(
      `
        INSERT INTO role_cleanup_jobs (
          id,
          guild_id,
          channel_id,
          message_id,
          role_id,
          emoji,
          deadline_at,
          created_by,
          status,
          retry_count,
          error_code,
          created_at,
          updated_at,
          completed_at
        )
        VALUES (
          :id,
          :guildId,
          :channelId,
          :messageId,
          :roleId,
          :emoji,
          :deadlineAt,
          :createdBy,
          :status,
          :retryCount,
          :errorCode,
          :createdAt,
          :updatedAt,
          :completedAt
        )
      `,
      {
        id: row.id,
        guildId: row.guildId,
        channelId: row.channelId,
        messageId: row.messageId,
        roleId: row.roleId,
        emoji: row.emoji,
        deadlineAt: row.deadlineAt,
        createdBy: row.createdBy,
        status: row.status,
        retryCount: row.retryCount,
        errorCode: row.errorCode,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        completedAt: row.completedAt,
      },
    );
  }

  findByGuildAndId(guildId: string, id: string) {
    const row = this.db.get<RoleCleanupJobRecord>(
      `
        SELECT
          id,
          guild_id,
          channel_id,
          message_id,
          role_id,
          emoji,
          deadline_at,
          created_by,
          status,
          retry_count,
          error_code,
          created_at,
          updated_at,
          completed_at
        FROM role_cleanup_jobs
        WHERE guild_id = :guildId AND id = :id
      `,
      { guildId, id },
    );

    return row ? mapRoleCleanupJob(row) : null;
  }

  listDue(now = Date.now()) {
    const rows = this.db.all<RoleCleanupJobRecord>(
      `
        SELECT
          id,
          guild_id,
          channel_id,
          message_id,
          role_id,
          emoji,
          deadline_at,
          created_by,
          status,
          retry_count,
          error_code,
          created_at,
          updated_at,
          completed_at
        FROM role_cleanup_jobs
        WHERE status = 'active' AND deadline_at <= :now
        ORDER BY deadline_at ASC, created_at ASC
      `,
      { now },
    );

    return rows.map(mapRoleCleanupJob);
  }

  listActiveByGuild(guildId: string, limit: number, offset: number) {
    const rows = this.db.all<RoleCleanupJobRecord>(
      `
        SELECT
          id,
          guild_id,
          channel_id,
          message_id,
          role_id,
          emoji,
          deadline_at,
          created_by,
          status,
          retry_count,
          error_code,
          created_at,
          updated_at,
          completed_at
        FROM role_cleanup_jobs
        WHERE guild_id = :guildId AND status IN ('active', 'processing')
        ORDER BY deadline_at ASC, created_at ASC
        LIMIT :limit OFFSET :offset
      `,
      { guildId, limit, offset },
    );

    return rows.map(mapRoleCleanupJob);
  }

  listRecentTerminalByGuild(guildId: string, limit: number, offset: number) {
    const rows = this.db.all<RoleCleanupJobRecord>(
      `
        SELECT
          id,
          guild_id,
          channel_id,
          message_id,
          role_id,
          emoji,
          deadline_at,
          created_by,
          status,
          retry_count,
          error_code,
          created_at,
          updated_at,
          completed_at
        FROM role_cleanup_jobs
        WHERE guild_id = :guildId AND status IN ('completed', 'cancelled')
        ORDER BY COALESCE(completed_at, updated_at) DESC, created_at DESC
        LIMIT :limit OFFSET :offset
      `,
      { guildId, limit, offset },
    );

    return rows.map(mapRoleCleanupJob);
  }

  listPendingByGuild(guildId: string) {
    const rows = this.db.all<RoleCleanupJobRecord>(
      `
        SELECT
          id,
          guild_id,
          channel_id,
          message_id,
          role_id,
          emoji,
          deadline_at,
          created_by,
          status,
          retry_count,
          error_code,
          created_at,
          updated_at,
          completed_at
        FROM role_cleanup_jobs
        WHERE guild_id = :guildId AND status IN ('active', 'processing')
        ORDER BY deadline_at ASC, created_at ASC
      `,
      { guildId },
    );

    return rows.map(mapRoleCleanupJob);
  }

  markProcessing(id: string) {
    this.db.run(
      `
        UPDATE role_cleanup_jobs
        SET status = 'processing', updated_at = :updatedAt
        WHERE id = :id AND status = 'active'
      `,
      {
        id,
        updatedAt: Date.now(),
      },
    );
  }

  complete(id: string, errorCode?: string | null) {
    const completedAt = Date.now();
    this.db.run(
      `
        UPDATE role_cleanup_jobs
        SET status = 'completed',
            error_code = :errorCode,
            updated_at = :updatedAt,
            completed_at = :completedAt
        WHERE id = :id
      `,
      {
        id,
        errorCode: errorCode ?? null,
        updatedAt: completedAt,
        completedAt,
      },
    );
  }

  cancel(id: string) {
    const completedAt = Date.now();
    this.db.run(
      `
        UPDATE role_cleanup_jobs
        SET status = 'cancelled',
            updated_at = :updatedAt,
            completed_at = :completedAt
        WHERE id = :id AND status = 'active'
      `,
      {
        id,
        updatedAt: completedAt,
        completedAt,
      },
    );
  }

  rescheduleForRetry(id: string, deadlineAt: number) {
    this.db.run(
      `
        UPDATE role_cleanup_jobs
        SET status = 'active',
            deadline_at = :deadlineAt,
            retry_count = retry_count + 1,
            error_code = NULL,
            completed_at = NULL,
            updated_at = :updatedAt
        WHERE id = :id
      `,
      {
        id,
        deadlineAt,
        updatedAt: Date.now(),
      },
    );
  }

  setErrorCode(id: string, errorCode: string | null) {
    this.db.run(
      `
        UPDATE role_cleanup_jobs
        SET error_code = :errorCode, updated_at = :updatedAt
        WHERE id = :id
      `,
      {
        id,
        errorCode,
        updatedAt: Date.now(),
      },
    );
  }

  deleteTerminalBefore(cutoff: number) {
    this.db.run(
      `
        DELETE FROM role_cleanup_jobs
        WHERE status IN ('completed', 'cancelled') AND COALESCE(completed_at, updated_at) < :cutoff
      `,
      { cutoff },
    );
  }

  listTerminalIdsNewestFirst() {
    const rows = this.db.all<{ id: string }>(
      `
        SELECT id
        FROM role_cleanup_jobs
        WHERE status IN ('completed', 'cancelled')
        ORDER BY COALESCE(completed_at, updated_at) DESC, created_at DESC
      `,
    );

    return rows.map((row) => row.id);
  }

  deleteByIds(ids: string[]) {
    if (ids.length === 0) {
      return;
    }

    const params: Record<string, string> = {};
    const placeholders = ids.map((id, index) => {
      const key = `id${index}`;
      params[key] = id;
      return `:${key}`;
    }).join(', ');

    this.db.run(
      `
        DELETE FROM role_cleanup_jobs
        WHERE id IN (${placeholders})
      `,
      params,
    );
  }
}
