import { RemindersRepository } from '../db/repositories/reminders-repository.js';
import { UserTimezonesRepository } from '../db/repositories/user-timezones-repository.js';
import { advanceReminderTimestamp, isValidTimeZone } from '../lib/time.js';
import { GuildConfigService } from './guild-config-service.js';

export type CreateReminderInput = {
  id: string;
  guildId: string;
  channelId: string;
  creatorUserId: string;
  content: string;
  targetUserId?: string | null;
  targetRoleId?: string | null;
  repeatDays?: number | null;
  nextRunAt: number;
  timezone: string;
};

export class ReminderService {
  constructor(
    private readonly reminders: RemindersRepository,
    private readonly userTimezones: UserTimezonesRepository,
    private readonly guildConfigService: GuildConfigService,
  ) {}

  async setUserTimezone(guildId: string, userId: string, timezone: string) {
    if (!isValidTimeZone(timezone)) {
      throw new Error('Invalid timezone.');
    }

    this.userTimezones.upsert(guildId, userId, timezone);
  }

  async getEffectiveTimezone(guildId: string, userId: string) {
    const userTimezone = this.userTimezones.findByGuildAndUser(guildId, userId);

    if (userTimezone) {
      return {
        timezone: userTimezone.timezone,
        source: 'user' as const,
      };
    }

    const config = await this.guildConfigService.getGuildConfig(guildId);
    return {
      timezone: config.defaultTimezone,
      source: 'guild' as const,
    };
  }

  async createReminder(input: CreateReminderInput) {
    this.reminders.insert({
      id: input.id,
      guildId: input.guildId,
      channelId: input.channelId,
      creatorUserId: input.creatorUserId,
      content: input.content,
      targetUserId: input.targetUserId ?? null,
      targetRoleId: input.targetRoleId ?? null,
      repeatDays: input.repeatDays ?? null,
      nextRunAt: input.nextRunAt,
      timezone: input.timezone,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  async listUserReminders(guildId: string, userId: string, page: number, pageSize = 10) {
    const offset = Math.max(0, (page - 1) * pageSize);
    return this.reminders.listByCreator(guildId, userId, pageSize, offset);
  }

  async deleteReminder(guildId: string, userId: string, reminderId: string) {
    const existing = this.reminders.findByIdAndGuild(reminderId, guildId);

    if (!existing) {
      return false;
    }

    if (existing.creatorUserId !== userId) {
      throw new Error('REMINDER_DELETE_FORBIDDEN');
    }

    this.reminders.deleteById(reminderId);
    return true;
  }

  async getDueReminders(now = Date.now()) {
    return this.reminders.listDue(now);
  }

  async completeReminder(reminderId: string) {
    this.reminders.updateStatus(reminderId, 'completed');
  }

  async rescheduleReminder(reminderId: string, currentUtcMillis: number, timezone: string, repeatDays: number) {
    this.reminders.updateNextRun(
      reminderId,
      advanceReminderTimestamp(currentUtcMillis, timezone, repeatDays),
    );
  }
}
