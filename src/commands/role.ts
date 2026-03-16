import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildMember,
} from 'discord.js';
import { withDescriptionLocales } from '../lib/command-localizations.js';
import { buildConfirmRow, buildErrorEmbed, buildInfoEmbed } from '../lib/discord.js';
import { getGrantableRoleSourceName, t } from '../lib/i18n.js';
import { isValidTimeZone, parseHumanTimeInput } from '../lib/time.js';
import type { CommandDefinition } from './types.js';

const ROLE_REMOVE_CONFIRM_PREFIX = 'confirm:role-remove';
const ROLE_REMOVE_CANCEL_PREFIX = 'cancel:role-remove';

function mapCleanupError(locale: 'en' | 'ja' | 'zh-CN', error: unknown) {
  if (!(error instanceof Error)) {
    return {
      title: t(locale, 'role.cleanupErrorTitle'),
      description: t(locale, 'role.cleanupErrorDescription'),
    };
  }

  switch (error.message) {
    case 'CLEANUP_ROLE_MANAGED':
      return {
        title: t(locale, 'role.cleanupErrorTitle'),
        description: t(locale, 'role.cleanupManagedRole'),
      };
    case 'CLEANUP_ROLE_ADMIN_SCOPE':
      return {
        title: t(locale, 'role.cleanupErrorTitle'),
        description: t(locale, 'role.cleanupAdminScope'),
      };
    case 'CLEANUP_ROLE_BOT_HIERARCHY':
      return {
        title: t(locale, 'role.botHierarchyTitle'),
        description: t(locale, 'role.botHierarchyDescription'),
      };
    case 'CLEANUP_ROLE_USER_HIERARCHY':
      return {
        title: t(locale, 'role.userHierarchyTitle'),
        description: t(locale, 'role.userHierarchyDescription'),
      };
    case 'CLEANUP_DEADLINE_PAST':
      return {
        title: t(locale, 'role.cleanupErrorTitle'),
        description: t(locale, 'role.cleanupDeadlinePast'),
      };
    case 'CLEANUP_CHANNEL_INVALID':
      return {
        title: t(locale, 'role.cleanupErrorTitle'),
        description: t(locale, 'role.cleanupInvalidChannel'),
      };
    case 'CLEANUP_CHANNEL_NOT_VISIBLE_TO_TARGETS':
      return {
        title: t(locale, 'role.cleanupErrorTitle'),
        description: t(locale, 'role.cleanupChannelNotVisibleToTargets'),
      };
    case 'CLEANUP_REACTION_INIT_FAILED':
      return {
        title: t(locale, 'role.cleanupErrorTitle'),
        description: t(locale, 'role.cleanupReactionInitFailed'),
      };
    case 'CLEANUP_JOB_NOT_FOUND':
      return {
        title: t(locale, 'role.cleanupErrorTitle'),
        description: t(locale, 'role.cleanupJobNotFound'),
      };
    case 'CLEANUP_JOB_NOT_ACTIVE':
      return {
        title: t(locale, 'role.cleanupErrorTitle'),
        description: t(locale, 'role.cleanupJobNotActive'),
      };
    case 'CLEANUP_JOB_NOT_RETRYABLE':
      return {
        title: t(locale, 'role.cleanupErrorTitle'),
        description: t(locale, 'role.cleanupJobNotRetryable'),
      };
    case 'CLEANUP_JOB_NOT_RESTORABLE':
      return {
        title: t(locale, 'role.cleanupErrorTitle'),
        description: t(locale, 'role.cleanupJobNotRestorable'),
      };
    case 'CLEANUP_ROLE_MISSING':
      return {
        title: t(locale, 'role.cleanupErrorTitle'),
        description: t(locale, 'role.cleanupRoleMissing'),
      };
    default:
      return {
        title: t(locale, 'role.cleanupErrorTitle'),
        description: t(locale, 'role.cleanupErrorDescription'),
      };
  }
}

export const roleCommand: CommandDefinition = {
  data: withDescriptionLocales(
    new SlashCommandBuilder()
      .setName('role')
      .setDescription('Grant and manage grantable roles.')
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('grant')
            .setDescription('Grant an allowed role to a user.')
            .addUserOption((option) =>
              withDescriptionLocales(
                option
                  .setName('user')
                  .setDescription('Target member')
                  .setRequired(true),
                '対象メンバー',
                '目标成员',
              ),
            )
            .addStringOption((option) =>
              withDescriptionLocales(
                option
                  .setName('role_id')
                  .setDescription('Grantable role')
                  .setRequired(true)
                  .setAutocomplete(true),
                '付与可能ロール',
                '可分配身份组',
              ),
            ),
          '許可済みロールをユーザーに付与します。',
          '将允许的身份组分配给用户。',
        ),
      )
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('revoke')
            .setDescription('Revoke an allowed role from a user.')
            .addUserOption((option) =>
              withDescriptionLocales(
                option
                  .setName('user')
                  .setDescription('Target member')
                  .setRequired(true),
                '対象メンバー',
                '目标成员',
              ),
            )
            .addStringOption((option) =>
              withDescriptionLocales(
                option
                  .setName('role_id')
                  .setDescription('Grantable role')
                  .setRequired(true)
                  .setAutocomplete(true),
                '剥奪する付与可能ロール',
                '要移除的可分配身份组',
              ),
            ),
          '許可済みロールをユーザーから剥奪します。',
          '从用户移除允许的身份组。',
        ),
      )
      .addSubcommandGroup((group) =>
        withDescriptionLocales(
          group
            .setName('allow')
            .setDescription('Manage the grantable role allow-list.')
            .addSubcommand((sub) =>
              withDescriptionLocales(
                sub
                  .setName('add')
                  .setDescription('Add a role to the allow-list.')
                  .addRoleOption((option) =>
                    withDescriptionLocales(
                      option
                        .setName('role')
                        .setDescription('Role to allow')
                        .setRequired(true),
                      '許可するロール',
                      '允许的身份组',
                    ),
                  ),
                'ロールを許可リストへ追加します。',
                '将身份组添加到允许列表。',
              ),
            )
            .addSubcommand((sub) =>
              withDescriptionLocales(
                sub
                  .setName('remove')
                  .setDescription('Remove a role from the allow-list.')
                  .addStringOption((option) =>
                    withDescriptionLocales(
                      option
                        .setName('role_id')
                        .setDescription('Allowed role to remove')
                        .setRequired(true)
                        .setAutocomplete(true),
                      '削除する許可済みロール',
                      '要移除的已允许身份组',
                    ),
                  ),
                'ロールを許可リストから削除します。',
                '将身份组从允许列表中移除。',
              ),
            )
            .addSubcommand((sub) =>
              withDescriptionLocales(
                sub
                  .setName('list')
                  .setDescription('List currently allowed roles.'),
                '現在の許可済みロールを表示します。',
                '列出当前已允许的身份组。',
              ),
            ),
          '付与可能ロールの許可リストを管理します。',
          '管理可分配身份组的允许列表。',
        ),
      )
      .addSubcommandGroup((group) =>
        withDescriptionLocales(
          group
            .setName('cleanup')
            .setDescription('Start and manage role confirmation cleanups.')
            .addSubcommand((sub) =>
              withDescriptionLocales(
                sub
                  .setName('start')
                  .setDescription('Start a confirmation cleanup for a role.')
                  .addRoleOption((option) =>
                    withDescriptionLocales(
                      option
                        .setName('role')
                        .setDescription('Role to clean up')
                        .setRequired(true),
                      '整頓対象のロール',
                      '要整理的身份组',
                    ),
                  )
                  .addStringOption((option) =>
                    withDescriptionLocales(
                      option
                        .setName('deadline')
                        .setDescription('YYYY-MM-DD HH:mm, HH:mm, tomorrow HH:mm, or in 10 minutes')
                        .setRequired(true),
                      'YYYY-MM-DD HH:mm、HH:mm、tomorrow HH:mm、in 10 minutes 形式',
                      '支持 YYYY-MM-DD HH:mm、HH:mm、tomorrow HH:mm、in 10 minutes',
                    ),
                  )
                  .addChannelOption((option) =>
                    withDescriptionLocales(
                      option
                        .setName('channel')
                        .setDescription('Optional text channel for the prompt')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(false),
                      '確認メッセージを送るテキストチャンネル',
                      '发送确认消息的文本频道',
                    ),
                  ),
                'リアクション確認付きのロール整頓を開始します。',
                '开始带反应确认的身份组整理。',
              ),
            )
            .addSubcommand((sub) =>
              withDescriptionLocales(
                sub
                  .setName('list')
                  .setDescription('List recent cleanup jobs.')
                  .addIntegerOption((option) =>
                    withDescriptionLocales(
                      option
                        .setName('page')
                        .setDescription('Page number')
                        .setRequired(false)
                        .setMinValue(1),
                      'ページ番号',
                      '页码',
                    ),
                  ),
                '最近のロール整頓ジョブを表示します。',
                '显示最近的身份组整理任务。',
              ),
            )
            .addSubcommand((sub) =>
              withDescriptionLocales(
                sub
                  .setName('cancel')
                  .setDescription('Cancel an active cleanup job.')
                  .addStringOption((option) =>
                    withDescriptionLocales(
                      option
                        .setName('job_id')
                        .setDescription('Cleanup job id')
                        .setRequired(true),
                      'ジョブID',
                      '任务 ID',
                    ),
                  ),
                'アクティブな整頓ジョブをキャンセルします。',
                '取消活跃的整理任务。',
              ),
            )
            .addSubcommand((sub) =>
              withDescriptionLocales(
                sub
                  .setName('restore')
                  .setDescription('Restore members removed by a cleanup job.')
                  .addStringOption((option) =>
                    withDescriptionLocales(
                      option
                        .setName('job_id')
                        .setDescription('Cleanup job id')
                        .setRequired(true),
                      'ジョブID',
                      '任务 ID',
                    ),
                  ),
                '整頓で剥奪したロールを復旧します。',
                '恢复整理中移除的身份组。',
              ),
            )
            .addSubcommand((sub) =>
              withDescriptionLocales(
                sub
                  .setName('retry')
                  .setDescription('Retry failed or pending removals in a cleanup job.')
                  .addStringOption((option) =>
                    withDescriptionLocales(
                      option
                        .setName('job_id')
                        .setDescription('Cleanup job id')
                        .setRequired(true),
                      'ジョブID',
                      '任务 ID',
                    ),
                  ),
                '整頓ジョブの未処理・失敗分を再実行します。',
                '重试整理任务中的未处理或失败项。',
              ),
            ),
          'ロール整頓ジョブを管理します。',
          '管理身份组整理任务。',
        ),
      ),
    '付与可能ロールを管理します。',
    '管理可分配身份组。',
  ),
  meta: {
    name: 'role',
    summary: 'Grant approved roles and manage the allow-list.',
    usage: '/role grant|revoke, /role allow add|remove|list, /role cleanup start|list|cancel|restore|retry',
    visibility: 'manager',
  },
  async execute(ctx, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: t('en', 'common.useInGuild'), flags: MessageFlags.Ephemeral });
      return;
    }

    const locale = await ctx.services.guildConfig.getLanguage(interaction.guildId!);
    const member = interaction.member as GuildMember;
    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();

    if (!subcommandGroup && (subcommand === 'grant' || subcommand === 'revoke')) {
      const allowed = await ctx.services.permissions.canRunManagerAction(interaction.guildId!, member);
      if (!allowed || !member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({
          embeds: [buildErrorEmbed(t(locale, 'common.permissionDenied'), t(locale, 'role.grantPermissionDenied'))],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const targetUser = interaction.options.getUser('user', true);
      const targetMember = await interaction.guild!.members.fetch(targetUser.id);
      const targetRoleId = interaction.options.getString('role_id', true);
      const targetRole = interaction.guild!.roles.cache.get(targetRoleId);

      if (!targetMember || !targetRole) {
        await interaction.reply({
          embeds: [buildErrorEmbed(t(locale, 'role.invalidTargetTitle'), t(locale, 'role.invalidTargetDescription'))],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const allowedRole = await ctx.services.roles.resolveGrantableRoleId(interaction.guildId!, targetRole.id);
      if (!allowedRole) {
        await interaction.reply({
          embeds: [buildErrorEmbed(t(locale, 'role.notAllowedTitle'), t(locale, 'role.notAllowedDescription'))],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const botMember = interaction.guild!.members.me;
      if (!botMember || targetRole.position >= botMember.roles.highest.position) {
        await interaction.reply({
          embeds: [buildErrorEmbed(t(locale, 'role.botHierarchyTitle'), t(locale, 'role.botHierarchyDescription'))],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.guild!.ownerId !== interaction.user.id && targetRole.position >= member.roles.highest.position) {
        await interaction.reply({
          embeds: [buildErrorEmbed(t(locale, 'role.userHierarchyTitle'), t(locale, 'role.userHierarchyDescription'))],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (subcommand === 'grant') {
        await targetMember.roles.add(targetRole);
        await interaction.reply({
          embeds: [buildInfoEmbed(
            t(locale, 'role.grantedTitle'),
            t(locale, 'role.grantedDescription', { role: String(targetRole), member: String(targetMember) }),
          )],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (!targetMember.roles.cache.has(targetRole.id)) {
        await interaction.reply({
          embeds: [buildInfoEmbed(
            t(locale, 'role.revokeNoopTitle'),
            t(locale, 'role.revokeNoopDescription', { role: String(targetRole), member: String(targetMember) }),
          )],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await targetMember.roles.remove(targetRole);
      await interaction.reply({
        embeds: [buildInfoEmbed(
          t(locale, 'role.revokedTitle'),
          t(locale, 'role.revokedDescription', { role: String(targetRole), member: String(targetMember) }),
        )],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommandGroup === 'cleanup') {
      const allowed = await ctx.services.permissions.canRunForumAdmin(interaction.guildId!, member);
      if (!allowed || !member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await interaction.reply({
          embeds: [buildErrorEmbed(t(locale, 'common.permissionDenied'), t(locale, 'role.cleanupPermissionDenied'))],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (subcommand === 'start') {
        const config = await ctx.services.guildConfig.getGuildConfig(interaction.guildId!);
        if (!isValidTimeZone(config.defaultTimezone)) {
          await interaction.reply({
            embeds: [buildErrorEmbed(t(locale, 'role.cleanupErrorTitle'), t(locale, 'role.cleanupTimezoneRequired'))],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const selectedRole = interaction.options.getRole('role', true);
        const role = interaction.guild!.roles.cache.get(selectedRole.id);
        if (!role) {
          await interaction.reply({
            embeds: [buildErrorEmbed(t(locale, 'role.invalidTargetTitle'), t(locale, 'role.invalidTargetDescription'))],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const deadlineInput = interaction.options.getString('deadline', true);
        let parsed;
        try {
          parsed = parseHumanTimeInput(deadlineInput, config.defaultTimezone);
        } catch {
          await interaction.reply({
            embeds: [buildErrorEmbed(t(locale, 'role.cleanupErrorTitle'), t(locale, 'role.cleanupInvalidDeadline'))],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const selectedChannel = interaction.options.getChannel('channel');
        const targetChannel = selectedChannel
          ? await interaction.guild!.channels.fetch(selectedChannel.id)
          : interaction.channel;
        try {
          const result = await ctx.services.roleCleanup.startCleanup(
            interaction.guild!,
            member,
            role,
            targetChannel,
            parsed.utcMillis,
          );
          await interaction.reply({
            embeds: [buildInfoEmbed(
              t(locale, 'role.cleanupStartedTitle'),
              t(locale, 'role.cleanupStartedDescription', {
                jobId: result.jobId,
                targetCount: result.targetCount,
                messageUrl: result.messageUrl,
              }),
            )],
            flags: MessageFlags.Ephemeral,
          });
        } catch (error) {
          const message = mapCleanupError(locale, error);
          await interaction.reply({
            embeds: [buildErrorEmbed(message.title, message.description)],
            flags: MessageFlags.Ephemeral,
          });
        }
        return;
      }

      if (subcommand === 'list') {
        const page = interaction.options.getInteger('page') ?? 1;
        const jobs = await ctx.services.roleCleanup.listJobs(interaction.guildId!, page);
        const embed = new EmbedBuilder()
          .setTitle(t(locale, 'role.cleanupListTitle'))
          .setColor(0x5865f2)
          .setTimestamp();

        embed.addFields(
          {
            name: t(locale, 'role.cleanupActiveField'),
            value: jobs.active.length
              ? jobs.active.map((job) => `${job.id} | <@&${job.roleId}> | ${job.status} | ${new Date(job.deadlineAt).toISOString()}`).join('\n').slice(0, 1024)
              : t(locale, 'common.none'),
          },
          {
            name: t(locale, 'role.cleanupRecentField'),
            value: jobs.recent.length
              ? jobs.recent.map((job) => `${job.id} | <@&${job.roleId}> | ${job.status} | ${job.errorCode ?? 'OK'}`).join('\n').slice(0, 1024)
              : t(locale, 'common.none'),
          },
        );

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        return;
      }

      const jobId = interaction.options.getString('job_id', true);

      if (subcommand === 'cancel') {
        try {
          await ctx.services.roleCleanup.cancelJob(interaction.guildId!, jobId);
          await interaction.reply({
            embeds: [buildInfoEmbed(
              t(locale, 'role.cleanupCancelledTitle'),
              t(locale, 'role.cleanupCancelledDescription', { jobId }),
            )],
            flags: MessageFlags.Ephemeral,
          });
        } catch (error) {
          const message = mapCleanupError(locale, error);
          await interaction.reply({
            embeds: [buildErrorEmbed(message.title, message.description)],
            flags: MessageFlags.Ephemeral,
          });
        }
        return;
      }

      if (subcommand === 'restore') {
        try {
          const result = await ctx.services.roleCleanup.restoreJob(interaction.guild!, member, jobId);
          await interaction.reply({
            embeds: [buildInfoEmbed(
              t(locale, 'role.cleanupRestoredTitle'),
              t(locale, 'role.cleanupRestoredDescription', {
                jobId,
                restored: result.restored,
                failed: result.failed,
              }),
            )],
            flags: MessageFlags.Ephemeral,
          });
        } catch (error) {
          const message = mapCleanupError(locale, error);
          await interaction.reply({
            embeds: [buildErrorEmbed(message.title, message.description)],
            flags: MessageFlags.Ephemeral,
          });
        }
        return;
      }

      try {
        await ctx.services.roleCleanup.retryJob(interaction.guildId!, jobId);
        await interaction.reply({
          embeds: [buildInfoEmbed(
            t(locale, 'role.cleanupRetriedTitle'),
            t(locale, 'role.cleanupRetriedDescription', { jobId }),
          )],
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        const message = mapCleanupError(locale, error);
        await interaction.reply({
          embeds: [buildErrorEmbed(message.title, message.description)],
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    const canManageAllowList = await ctx.services.permissions.canRunForumAdmin(interaction.guildId!, member);
    if (!canManageAllowList) {
      await interaction.reply({
        embeds: [buildErrorEmbed(t(locale, 'common.permissionDenied'), t(locale, 'role.allowPermissionDenied'))],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === 'add') {
      const role = interaction.options.getRole('role', true);
      await ctx.services.roles.addGrantableRole(interaction.guildId!, role.id, 'manual');
      await interaction.reply({
        embeds: [buildInfoEmbed(
          t(locale, 'role.allowUpdatedTitle'),
          t(locale, 'role.allowAddDescription', { role: String(role) }),
        )],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === 'remove') {
      const roleId = interaction.options.getString('role_id', true);
      const role = interaction.guild!.roles.cache.get(roleId);
      const confirmId = `${ROLE_REMOVE_CONFIRM_PREFIX}:${roleId}:${interaction.user.id}`;
      const cancelId = `${ROLE_REMOVE_CANCEL_PREFIX}:${interaction.user.id}`;
      await interaction.reply({
        embeds: [buildInfoEmbed(
          t(locale, 'role.confirmRemovalTitle'),
          t(locale, 'role.confirmRemovalDescription', { role: String(role ?? t(locale, 'role.roleFallback', { roleId })) }),
        )],
        components: [buildConfirmRow(confirmId, cancelId, {
          confirm: t(locale, 'common.confirm'),
          cancel: t(locale, 'common.cancel'),
        })],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const rows = await ctx.services.roles.listGrantableRoles(interaction.guildId!);
    const embed = new EmbedBuilder()
      .setTitle(t(locale, 'role.listTitle'))
      .setColor(0x5865f2)
      .setTimestamp();

    if (rows.length === 0) {
      embed.setDescription(t(locale, 'role.noGrantableRoles'));
    } else {
      embed.setDescription(rows.map((row) => `<@&${row.roleId}> (${getGrantableRoleSourceName(row.source, locale)})`).join('\n'));
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
  async autocomplete(ctx, interaction) {
    if (!interaction.inGuild() || interaction.commandName !== 'role') {
      return false;
    }

    const focused = interaction.options.getFocused(true);
    if (focused.name !== 'role_id') {
      return false;
    }

    const choices = await ctx.services.roles.buildGrantableRoleChoices(interaction.guild!, String(focused.value ?? ''));
    await interaction.respond(choices);
    return true;
  },
  async handleButton(ctx, interaction) {
    if (!interaction.inGuild()) {
      return false;
    }

    const locale = await ctx.services.guildConfig.getLanguage(interaction.guildId!);
    if (interaction.customId.startsWith(ROLE_REMOVE_CANCEL_PREFIX)) {
      await interaction.update({
        embeds: [buildInfoEmbed(t(locale, 'role.cancelledTitle'), t(locale, 'role.cancelledDescription'))],
        components: [],
      });
      return true;
    }

    if (!interaction.customId.startsWith(ROLE_REMOVE_CONFIRM_PREFIX)) {
      return false;
    }

    const [, , roleId, ownerId] = interaction.customId.split(':');
    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        embeds: [buildErrorEmbed(t(locale, 'common.notAllowed'), t(locale, 'role.confirmOwnerOnly'))],
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await ctx.services.roles.deactivateGrantableRole(interaction.guildId!, roleId);
    await interaction.update({
      embeds: [buildInfoEmbed(
        t(locale, 'role.allowUpdatedTitle'),
        t(locale, 'role.removedDescription', { roleId }),
      )],
      components: [],
    });
    return true;
  },
};
