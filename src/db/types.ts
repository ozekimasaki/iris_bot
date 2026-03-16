export const supportedLocales = ['en', 'ja', 'zh-CN'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export const roleScopes = ['admin', 'manager', 'forum_notice'] as const;
export type RoleScope = (typeof roleScopes)[number];

export const reminderStatuses = ['active', 'completed'] as const;
export type ReminderStatus = (typeof reminderStatuses)[number];

export const cleanupJobStatuses = ['active', 'processing', 'completed', 'cancelled'] as const;
export type CleanupJobStatus = (typeof cleanupJobStatuses)[number];

export const cleanupMemberStatuses = [
  'pending',
  'confirmed',
  'skipped',
  'removed',
  'remove_failed',
  'restored',
  'restore_failed',
] as const;
export type CleanupMemberStatus = (typeof cleanupMemberStatuses)[number];

export type GuildSettingsRow = {
  guildId: string;
  eventCategoryId: string | null;
  archiveCategoryId: string | null;
  defaultTimezone: string;
  language: SupportedLocale;
  updatedAt: number;
};

export type GuildRoleBindingRow = {
  id: number;
  guildId: string;
  scope: RoleScope;
  roleId: string;
  createdAt: number;
};

export type GrantableRoleRow = {
  id: number;
  guildId: string;
  roleId: string;
  source: string;
  sourceRef: string | null;
  active: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ForumWatchRow = {
  id: number;
  guildId: string;
  forumChannelId: string;
  notificationChannelId: string;
  lastSeenThreadTs: number | null;
  createdAt: number;
  updatedAt: number;
};

export type UserTimezoneRow = {
  id: number;
  guildId: string;
  userId: string;
  timezone: string;
  updatedAt: number;
};

export type ReminderRow = {
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

export type EventChannelRow = {
  id: number;
  guildId: string;
  textChannelId: string;
  roleId: string;
  displayName: string;
  archivedAt: number | null;
  createdBy: string;
  createdAt: number;
};

export type RoleCleanupJobRow = {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  roleId: string;
  emoji: string;
  deadlineAt: number;
  createdBy: string;
  status: CleanupJobStatus;
  retryCount: number;
  errorCode: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
};

export type RoleCleanupMemberRow = {
  jobId: string;
  userId: string;
  status: CleanupMemberStatus;
  lastError: string | null;
  updatedAt: number;
};
