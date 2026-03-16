import type { DatabaseHandle } from '../client.js';
import type { CleanupMemberStatus, RoleCleanupMemberRow } from '../types.js';

type RoleCleanupMemberRecord = {
  job_id: string;
  user_id: string;
  status: CleanupMemberStatus;
  last_error: string | null;
  updated_at: number;
};

function mapRoleCleanupMember(row: RoleCleanupMemberRecord): RoleCleanupMemberRow {
  return {
    jobId: row.job_id,
    userId: row.user_id,
    status: row.status,
    lastError: row.last_error,
    updatedAt: row.updated_at,
  };
}

export class RoleCleanupMembersRepository {
  constructor(private readonly db: DatabaseHandle) {}

  insertMany(jobId: string, userIds: string[]) {
    const updatedAt = Date.now();
    for (const userId of userIds) {
      this.db.run(
        `
          INSERT INTO role_cleanup_members (job_id, user_id, status, last_error, updated_at)
          VALUES (:jobId, :userId, 'pending', NULL, :updatedAt)
        `,
        {
          jobId,
          userId,
          updatedAt,
        },
      );
    }
  }

  listByJob(jobId: string) {
    const rows = this.db.all<RoleCleanupMemberRecord>(
      `
        SELECT job_id, user_id, status, last_error, updated_at
        FROM role_cleanup_members
        WHERE job_id = :jobId
        ORDER BY user_id ASC
      `,
      { jobId },
    );

    return rows.map(mapRoleCleanupMember);
  }

  updateStatus(jobId: string, userId: string, status: CleanupMemberStatus, lastError?: string | null) {
    this.db.run(
      `
        UPDATE role_cleanup_members
        SET status = :status, last_error = :lastError, updated_at = :updatedAt
        WHERE job_id = :jobId AND user_id = :userId
      `,
      {
        jobId,
        userId,
        status,
        lastError: lastError ?? null,
        updatedAt: Date.now(),
      },
    );
  }
}
