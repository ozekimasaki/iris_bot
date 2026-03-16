import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DateTime } from 'luxon';
import { createDatabase } from '../db/client.js';
import { EventChannelsRepository } from '../db/repositories/event-channels-repository.js';
import { GuildRoleBindingsRepository } from '../db/repositories/guild-role-bindings-repository.js';
import { GuildSettingsRepository } from '../db/repositories/guild-settings-repository.js';
import { RoleCleanupJobsRepository } from '../db/repositories/role-cleanup-jobs-repository.js';
import { RoleCleanupMembersRepository } from '../db/repositories/role-cleanup-members-repository.js';
import { advanceReminderTimestamp, parseHumanTimeInput } from '../lib/time.js';
import { GuildConfigService } from '../domain/guild-config-service.js';

const now = DateTime.fromISO('2026-03-15T18:30:00', { zone: 'Asia/Tokyo' });
const nextDay = parseHumanTimeInput('18:00', 'Asia/Tokyo', now);
const expectedNextDay = DateTime.fromISO('2026-03-16T18:00:00', { zone: 'Asia/Tokyo' }).toUTC().toMillis();
assert.equal(nextDay.utcMillis, expectedNextDay);

const relative = parseHumanTimeInput('in 10 minutes', 'UTC', DateTime.fromISO('2026-03-15T18:30:00Z'));
assert.equal(relative.utcMillis, DateTime.fromISO('2026-03-15T18:40:00Z').toMillis());

const current = DateTime.fromISO('2026-03-15T09:00:00', { zone: 'Asia/Tokyo' }).toUTC().toMillis();
const next = advanceReminderTimestamp(current, 'Asia/Tokyo', 7);
assert.equal(next, DateTime.fromISO('2026-03-22T09:00:00', { zone: 'Asia/Tokyo' }).toUTC().toMillis());

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'iris-smoke-'));
const databasePath = path.join(tempRoot, 'iris.db');
const database = createDatabase(databasePath);
const guildConfig = new GuildConfigService(
  new GuildSettingsRepository(database),
  new GuildRoleBindingsRepository(database),
);
const eventChannels = new EventChannelsRepository(database);
const cleanupJobs = new RoleCleanupJobsRepository(database);
const cleanupMembers = new RoleCleanupMembersRepository(database);

const ensured = await guildConfig.ensureGuildSettings('guild-1');
assert.equal(ensured.defaultTimezone, 'UTC');

await guildConfig.addRoleBinding('guild-1', 'admin', 'role-1');
await guildConfig.setChannels('guild-1', 'cat-active', 'cat-archive');
await guildConfig.setDefaultTimezone('guild-1', 'Asia/Tokyo');

const config = await guildConfig.getGuildConfig('guild-1');
assert.equal(config.defaultTimezone, 'Asia/Tokyo');
assert.deepEqual(config.roles.admin, ['role-1']);
assert.equal(config.eventCategoryId, 'cat-active');
assert.equal(config.archiveCategoryId, 'cat-archive');
assert.equal(config.language, 'en');

await guildConfig.setLanguage('guild-1', 'ja');
assert.equal(await guildConfig.getLanguage('guild-1'), 'ja');

eventChannels.insert('guild-1', 'channel-1', 'event-role-1', 'Spring Meetup', 'user-1');
const activeEvents = await eventChannels.listActiveByGuild('guild-1', 10, 0);
assert.equal(activeEvents.length, 1);
assert.equal(activeEvents[0]?.textChannelId, 'channel-1');
eventChannels.archiveById(activeEvents[0]!.id, Date.now());
assert.equal((await eventChannels.listActiveByGuild('guild-1', 10, 0)).length, 0);

const cleanupJobId = 'cleanup-test-1';
cleanupJobs.insert({
  id: cleanupJobId,
  guildId: 'guild-1',
  channelId: 'channel-1',
  messageId: 'message-1',
  roleId: 'role-1',
  emoji: '✅',
  deadlineAt: Date.now() - 1000,
  createdBy: 'user-1',
  status: 'active',
  retryCount: 0,
  errorCode: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  completedAt: null,
});
cleanupMembers.insertMany(cleanupJobId, ['user-1', 'user-2']);

const dueJobs = cleanupJobs.listDue(Date.now());
assert.equal(dueJobs.length, 1);
assert.equal(dueJobs[0]?.id, cleanupJobId);
assert.equal(cleanupMembers.listByJob(cleanupJobId).length, 2);

cleanupJobs.markProcessing(cleanupJobId);
assert.equal(cleanupJobs.findByGuildAndId('guild-1', cleanupJobId)?.status, 'processing');
cleanupJobs.rescheduleForRetry(cleanupJobId, Date.now());
assert.equal(cleanupJobs.findByGuildAndId('guild-1', cleanupJobId)?.status, 'active');
cleanupJobs.cancel(cleanupJobId);
assert.equal(cleanupJobs.findByGuildAndId('guild-1', cleanupJobId)?.status, 'cancelled');

database.close();

for (let attempt = 0; attempt < 5; attempt += 1) {
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    break;
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : null;
    if (code !== 'EBUSY' || attempt === 4) {
      throw error;
    }
    await Bun.sleep(50);
  }
}

console.log('smoke tests passed');
