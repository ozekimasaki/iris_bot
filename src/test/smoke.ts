import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ChannelType, Collection, PermissionFlagsBits, type Guild, type GuildMember, type Role } from 'discord.js';
import { DateTime } from 'luxon';
import type { Logger } from 'pino';
import { createDatabase } from '../db/client.js';
import { EventChannelsRepository } from '../db/repositories/event-channels-repository.js';
import { GuildRoleBindingsRepository } from '../db/repositories/guild-role-bindings-repository.js';
import { HoneypotBansRepository } from '../db/repositories/honeypot-bans-repository.js';
import { GuildSettingsRepository } from '../db/repositories/guild-settings-repository.js';
import { EventService } from '../domain/event-service.js';
import { RoleCleanupJobsRepository } from '../db/repositories/role-cleanup-jobs-repository.js';
import { RoleCleanupMembersRepository } from '../db/repositories/role-cleanup-members-repository.js';
import { advanceReminderTimestamp, parseHumanTimeInput } from '../lib/time.js';
import { GuildConfigService } from '../domain/guild-config-service.js';
import { RegionService } from '../domain/region-service.js';
import type { RoleService } from '../domain/role-service.js';
import { getRegionName, getRegionPrefectures, isRegionKey, regionKeys } from '../lib/regions.js';
import { parseRegionAssignCustomId } from '../lib/region-ui.js';
import { MemberRegionsRepository } from '../db/repositories/member-regions-repository.js';
import { RegionRoleBindingsRepository } from '../db/repositories/region-role-bindings-repository.js';
import { buildMemberCsv } from '../lib/csv.js';
import { buildCommands } from '../commands/index.js';

const now = DateTime.fromISO('2026-03-15T18:30:00', { zone: 'Asia/Tokyo' });
const nextDay = parseHumanTimeInput('18:00', 'Asia/Tokyo', now);
const expectedNextDay = DateTime.fromISO('2026-03-16T18:00:00', { zone: 'Asia/Tokyo' }).toUTC().toMillis();
assert.equal(nextDay.utcMillis, expectedNextDay);

const relative = parseHumanTimeInput('in 10 minutes', 'UTC', DateTime.fromISO('2026-03-15T18:30:00Z'));
assert.equal(relative.utcMillis, DateTime.fromISO('2026-03-15T18:40:00Z').toMillis());

const current = DateTime.fromISO('2026-03-15T09:00:00', { zone: 'Asia/Tokyo' }).toUTC().toMillis();
const next = advanceReminderTimestamp(current, 'Asia/Tokyo', 7);
assert.equal(next, DateTime.fromISO('2026-03-22T09:00:00', { zone: 'Asia/Tokyo' }).toUTC().toMillis());

const memberCsv = buildMemberCsv([
  { userId: 'user-1', displayName: '=HYPERLINK("https://example.com")', globalName: '+SUM(1,1)', username: '@mention' },
  { userId: 'user-2', displayName: 'normal', globalName: 'safe', username: 'plain' },
]);
assert.match(memberCsv, /"'=HYPERLINK\(""https:\/\/example\.com""\)"/);
assert.match(memberCsv, /"'\+SUM\(1,1\)"/);
assert.match(memberCsv, /"'@mention"/);

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

await guildConfig.setHoneypotChannel('guild-1', 'honeypot-channel');
assert.equal(await guildConfig.getHoneypotChannelId('guild-1'), 'honeypot-channel');
assert.equal((await guildConfig.getGuildConfig('guild-1')).honeypotChannelId, 'honeypot-channel');

await guildConfig.clearHoneypotChannel('guild-1');
assert.equal(await guildConfig.getHoneypotChannelId('guild-1'), null);

const honeypotBans = new HoneypotBansRepository(database);
const bannedAt = Date.UTC(2026, 5, 10, 6, 0, 0);
honeypotBans.insert('guild-1', 'user-trap', 'message-1', 'honeypot-channel', bannedAt);
honeypotBans.insert('guild-1', 'user-trap-2', null, 'honeypot-channel', bannedAt + 1000);
const bans = honeypotBans.listByGuild('guild-1', 10);
assert.equal(bans.length, 2);
assert.equal(bans[0]?.userId, 'user-trap-2');
assert.equal(bans[1]?.messageId, 'message-1');

eventChannels.insert('guild-1', 'channel-1', 'event-role-1', 'Spring Meetup', 'user-1');
const activeEvents = await eventChannels.listActiveByGuild('guild-1', 10, 0);
assert.equal(activeEvents.length, 1);
assert.equal(activeEvents[0]?.textChannelId, 'channel-1');
eventChannels.archiveById(activeEvents[0]!.id, Date.now());
assert.equal((await eventChannels.listActiveByGuild('guild-1', 10, 0)).length, 0);

class FakeRoleService {
  deactivated: Array<{ guildId: string; roleId: string }> = [];

  async addGrantableRole() {}

  async deactivateGrantableRole(guildId: string, roleId: string) {
    this.deactivated.push({ guildId, roleId });
  }
}

function createFakeTextChannel(id: string, name: string, parentId: string | null) {
  return {
    id,
    name,
    parentId,
    type: ChannelType.GuildText,
    async setParent(nextParentId: string) {
      this.parentId = nextParentId;
      return this;
    },
  };
}

const trackedChannel = createFakeTextChannel('channel-2', 'tracked-event', 'cat-active');
const manualChannel = createFakeTextChannel('channel-3', 'manual-event', 'cat-active');
const unrelatedChannel = createFakeTextChannel('channel-4', 'general-chat', 'cat-other');
const channels = new Map([
  [trackedChannel.id, trackedChannel],
  [manualChannel.id, manualChannel],
  [unrelatedChannel.id, unrelatedChannel],
]);
const fakeGuild = {
  id: 'guild-1',
  channels: {
    fetch: async (channelId: string) => channels.get(channelId) ?? null,
  },
} as unknown as Guild;

eventChannels.insert('guild-1', trackedChannel.id, 'event-role-2', 'Tracked Event', 'user-2');
const roleService = new FakeRoleService();
const eventService = new EventService(eventChannels, guildConfig, roleService as unknown as RoleService);

const trackedArchived = await eventService.archiveEvent(fakeGuild, trackedChannel.id);
assert.equal(trackedArchived.displayName, 'Tracked Event');
assert.equal(trackedChannel.parentId, 'cat-archive');
assert.deepEqual(roleService.deactivated, [{ guildId: 'guild-1', roleId: 'event-role-2' }]);
assert.equal(eventChannels.findActiveByGuildAndChannel('guild-1', trackedChannel.id), null);

const manualArchived = await eventService.archiveEvent(fakeGuild, manualChannel.id);
assert.equal(manualArchived.displayName, 'manual-event');
assert.equal(manualChannel.parentId, 'cat-archive');
assert.deepEqual(roleService.deactivated, [{ guildId: 'guild-1', roleId: 'event-role-2' }]);

await assert.rejects(() => eventService.archiveEvent(fakeGuild, unrelatedChannel.id), /EVENT_NOT_FOUND/);

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

assert.equal(regionKeys.length, 10);
assert.equal(isRegionKey('kanto'), true);
assert.equal(isRegionKey('tokyo'), false);
assert.match(getRegionPrefectures('ja', 'kinki'), /三重/);
assert.doesNotMatch(getRegionPrefectures('ja', 'chubu'), /三重/);
assert.match(getRegionPrefectures('ja', 'kanto'), /東京/);
assert.equal(getRegionName('ja', 'overseas'), '海外');
assert.equal(parseRegionAssignCustomId('region:assign:kanto'), 'kanto');
assert.equal(parseRegionAssignCustomId('region:assign:tokyo'), null);
assert.equal(buildCommands().some((command) => command.meta.name === 'region'), true);

const silentLogger = {
  error() {},
  info() {},
  warn() {},
} as unknown as Logger;

const regionBindings = new RegionRoleBindingsRepository(database);
const memberRegions = new MemberRegionsRepository(database);
const regionService = new RegionService(regionBindings, memberRegions, silentLogger);

type FakeRole = {
  id: string;
  name: string;
  position: number;
  managed: boolean;
};

function createFakeRole(id: string, name: string, position: number, managed = false): FakeRole {
  return { id, name, position, managed };
}

function createFakeRegionGuild(roleList: FakeRole[], guildId = 'guild-1') {
  const cache = new Collection<string, FakeRole>(roleList.map((role) => [role.id, role]));
  const guild = {
    id: guildId,
    members: {
      me: {
        permissions: {
          has(flag: bigint) {
            return flag === PermissionFlagsBits.ManageRoles;
          },
        },
        roles: {
          highest: { position: 50 },
        },
      },
    },
    roles: {
      cache,
      fetch: async (roleId: string) => cache.get(roleId) ?? null,
      async create(options: { name: string }) {
        const created = createFakeRole(`created-${options.name}`, options.name, 1);
        cache.set(created.id, created);
        return created;
      },
    },
  };

  return { guild: guild as unknown as Guild, cache };
}

function createFakeMember(roleIds: string[]) {
  const cache = new Collection<string, { id: string }>(roleIds.map((roleId) => [roleId, { id: roleId }]));
  return {
    id: 'user-1',
    roles: {
      cache,
      async add(role: { id: string } | string) {
        const roleId = typeof role === 'string' ? role : role.id;
        cache.set(roleId, { id: roleId });
        return this;
      },
      async remove(roleOrIds: string | string[]) {
        const ids = Array.isArray(roleOrIds) ? roleOrIds : [roleOrIds];
        for (const roleId of ids) {
          cache.delete(roleId);
        }
        return this;
      },
    },
  } as unknown as GuildMember;
}

const kantoRole = createFakeRole('role-kanto', '関東', 1);
const tohokuRole = createFakeRole('role-tohoku', '東北', 1);
const everyoneRole = createFakeRole('guild-1', '@everyone', 0);
const managedRole = createFakeRole('role-managed', 'boost', 1, true);
const { guild: regionGuild } = createFakeRegionGuild([kantoRole, tohokuRole, everyoneRole, managedRole]);

regionService.bindRole(regionGuild, 'kanto', kantoRole as unknown as Role);
assert.equal(regionService.getBinding('guild-1', 'kanto')?.roleId, 'role-kanto');
assert.throws(() => regionService.bindRole(regionGuild, 'tohoku', kantoRole as unknown as Role), /REGION_ROLE_IN_USE/);
assert.throws(() => regionService.bindRole(regionGuild, 'kanto', everyoneRole as unknown as Role), /REGION_ROLE_INVALID/);
assert.throws(() => regionService.bindRole(regionGuild, 'tohoku', managedRole as unknown as Role), /REGION_ROLE_INVALID/);

regionService.bindRole(regionGuild, 'tohoku', tohokuRole as unknown as Role);

const member = createFakeMember(['role-tohoku']);
const assigned = await regionService.assignRegion(regionGuild, member, 'kanto');
assert.equal(assigned.regionKey, 'kanto');
assert.equal(assigned.unchanged, false);
assert.equal(assigned.previousRegionKey, null);
assert.equal(member.roles.cache.has('role-kanto'), true);
assert.equal(member.roles.cache.has('role-tohoku'), false);
assert.equal(regionService.getMemberRegion('guild-1', 'user-1')?.regionKey, 'kanto');

const reassigned = await regionService.assignRegion(regionGuild, member, 'kanto');
assert.equal(reassigned.unchanged, true);

const switched = await regionService.assignRegion(regionGuild, member, 'tohoku');
assert.equal(switched.previousRegionKey, 'kanto');
assert.equal(member.roles.cache.has('role-kanto'), false);
assert.equal(member.roles.cache.has('role-tohoku'), true);

await regionService.clearRegion(regionGuild, member);
assert.equal(member.roles.cache.has('role-tohoku'), false);
assert.equal(regionService.getMemberRegion('guild-1', 'user-1'), null);
await assert.rejects(() => regionService.clearRegion(regionGuild, member), /REGION_NOT_SET/);

const { guild: createGuild, cache: createdRoleCache } = createFakeRegionGuild([], 'guild-2');
const createdResults = await regionService.createMissingRoles(createGuild, 'ja');
assert.equal(createdResults.filter((row) => row.status === 'created').length, 10);
assert.equal(createdRoleCache.size, 10);
assert.equal(regionService.listConfiguredRegions('guild-2').length, 10);

const alreadyCreated = await regionService.createMissingRoles(createGuild, 'ja');
assert.equal(alreadyCreated.every((row) => row.status === 'already_bound'), true);

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
