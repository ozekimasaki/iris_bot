import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type GuildMember,
} from 'discord.js';
import { withDescriptionLocales } from '../lib/command-localizations.js';
import { getLanguageName, getScopeName, t } from '../lib/i18n.js';
import type { RoleScope, SupportedLocale } from '../db/types.js';
import { buildErrorEmbed, buildInfoEmbed } from '../lib/discord.js';
import { isValidTimeZone } from '../lib/time.js';
import type { CommandDefinition } from './types.js';

const scopeChoices: { name: string; value: RoleScope }[] = [
  { name: 'admin', value: 'admin' },
  { name: 'manager', value: 'manager' },
  { name: 'forum_notice', value: 'forum_notice' },
];

const languageChoices: { name: string; value: SupportedLocale }[] = [
  { name: 'English', value: 'en' },
  { name: '日本語', value: 'ja' },
  { name: '简体中文', value: 'zh-CN' },
];

export const setupCommand: CommandDefinition = {
  data: withDescriptionLocales(
    new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Configure guild-scoped Iris settings.')
      .addSubcommandGroup((group) =>
        withDescriptionLocales(
          group
            .setName('role')
            .setDescription('Manage configured role scopes.')
            .addSubcommand((sub) =>
              withDescriptionLocales(
                sub
                  .setName('add')
                  .setDescription('Add a role to a scope.')
                  .addStringOption((option) =>
                    withDescriptionLocales(
                      option
                        .setName('scope')
                        .setDescription('Scope to add the role to')
                        .setRequired(true)
                        .addChoices(...scopeChoices),
                      '追加先のスコープ',
                      '要添加到的范围',
                    ),
                  )
                  .addRoleOption((option) =>
                    withDescriptionLocales(
                      option
                        .setName('role')
                        .setDescription('Role to add')
                        .setRequired(true),
                      '追加するロール',
                      '要添加的身份组',
                    ),
                  ),
                'ロールをスコープに追加します。',
                '将身份组添加到范围中。',
              ),
            )
            .addSubcommand((sub) =>
              withDescriptionLocales(
                sub
                  .setName('remove')
                  .setDescription('Remove a role from a scope.')
                  .addStringOption((option) =>
                    withDescriptionLocales(
                      option
                        .setName('scope')
                        .setDescription('Scope to remove the role from')
                        .setRequired(true)
                        .addChoices(...scopeChoices),
                      '削除元のスコープ',
                      '要移除自的范围',
                    ),
                  )
                  .addRoleOption((option) =>
                    withDescriptionLocales(
                      option
                        .setName('role')
                        .setDescription('Role to remove')
                        .setRequired(true),
                      '削除するロール',
                      '要移除的身份组',
                    ),
                  ),
                'スコープからロールを削除します。',
                '从范围中移除身份组。',
              ),
            )
            .addSubcommand((sub) =>
              withDescriptionLocales(
                sub
                  .setName('list')
                  .setDescription('List configured roles by scope.')
                  .addStringOption((option) =>
                    withDescriptionLocales(
                      option
                        .setName('scope')
                        .setDescription('Optional scope filter')
                        .setRequired(false)
                        .addChoices(...scopeChoices),
                      '任意のスコープ絞り込み',
                      '可选范围筛选',
                    ),
                  ),
                '設定済みロールをスコープごとに表示します。',
                '按范围列出已配置的身份组。',
              ),
            ),
          '設定済みロールスコープを管理します。',
          '管理已配置的角色范围。',
        ),
      )
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('event_categories')
            .setDescription('Configure event and archive categories.')
            .addChannelOption((option) =>
              withDescriptionLocales(
                option
                  .setName('event_category')
                  .setDescription('Category used for active events')
                  .addChannelTypes(ChannelType.GuildCategory)
                  .setRequired(true),
                '開催中イベント用カテゴリ',
                '进行中活动使用的分类',
              ),
            )
            .addChannelOption((option) =>
              withDescriptionLocales(
                option
                  .setName('archive_category')
                  .setDescription('Category used for archived events')
                  .addChannelTypes(ChannelType.GuildCategory)
                  .setRequired(true),
                'アーカイブ済みイベント用カテゴリ',
                '已归档活动使用的分类',
              ),
            ),
          'イベント作成先とアーカイブ先のカテゴリを設定します。',
          '配置活动创建分类和归档分类。',
        ),
      )
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('timezone')
            .setDescription('Configure the guild default timezone.')
            .addStringOption((option) =>
              withDescriptionLocales(
                option
                  .setName('zone')
                  .setDescription('IANA timezone, for example Asia/Tokyo')
                  .setRequired(true),
                'IANA タイムゾーン。例: Asia/Tokyo',
                'IANA 时区，例如 Asia/Tokyo',
              ),
            ),
          'サーバーのデフォルトタイムゾーンを設定します。',
          '配置服务器默认时区。',
        ),
      )
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('language')
            .setDescription('Configure the guild language.')
            .addStringOption((option) =>
              withDescriptionLocales(
                option
                  .setName('language')
                  .setDescription('Guild language')
                  .setRequired(true)
                  .addChoices(...languageChoices),
                'サーバー言語',
                '服务器语言',
              ),
            ),
          'サーバーの言語を設定します。',
          '配置服务器语言。',
        ),
      )
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('show')
            .setDescription('Show current setup state.'),
          '現在の設定状態を表示します。',
          '显示当前设置状态。',
        ),
      )
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('validate')
            .setDescription('Validate the current guild setup and runtime references.'),
          '現在のサーバー設定と参照状態を検証します。',
          '验证当前服务器设置和运行时引用。',
        ),
      ),
    'サーバー単位の Iris 設定を構成します。',
    '配置服务器级 Iris 设置。',
  ),
  meta: {
    name: 'setup',
    summary: 'Configure guild roles, categories, timezone, and language.',
    usage: '/setup role add|remove|list, /setup event_categories, /setup timezone, /setup language, /setup show|validate',
    visibility: 'admin',
  },
  async execute(ctx, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: t('en', 'common.useInGuild'), flags: MessageFlags.Ephemeral });
      return;
    }

    const locale = await ctx.services.guildConfig.getLanguage(interaction.guildId!);
    const member = interaction.member as GuildMember;
    const allowed = await ctx.services.permissions.canRunSetup(interaction.guildId!, member);
    if (!allowed) {
      await interaction.reply({
        embeds: [buildErrorEmbed(t(locale, 'common.permissionDenied'), t(locale, 'setup.permissionDenied'))],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const group = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();

    if (group === 'role') {
      const scope = interaction.options.getString('scope', subcommand !== 'list') as RoleScope | null;
      if (subcommand === 'add') {
        const role = interaction.options.getRole('role', true);
        await ctx.services.guildConfig.addRoleBinding(interaction.guildId!, scope!, role.id);
        await interaction.reply({
          embeds: [buildInfoEmbed(
            t(locale, 'setup.roleAddedTitle'),
            t(locale, 'setup.roleAddedDescription', { role: String(role), scope: getScopeName(scope!, locale) }),
          )],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (subcommand === 'remove') {
        const role = interaction.options.getRole('role', true);
        await ctx.services.guildConfig.removeRoleBinding(interaction.guildId!, scope!, role.id);
        await interaction.reply({
          embeds: [buildInfoEmbed(
            t(locale, 'setup.roleRemovedTitle'),
            t(locale, 'setup.roleRemovedDescription', { role: String(role), scope: getScopeName(scope!, locale) }),
          )],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const rows = await ctx.services.guildConfig.listRoleBindings(interaction.guildId!, scope ?? undefined);
      const embed = new EmbedBuilder()
        .setTitle(t(locale, 'setup.configuredRolesTitle'))
        .setColor(0x5865f2)
        .setTimestamp();

      if (rows.length === 0) {
        embed.setDescription(t(locale, 'setup.noConfiguredRoles'));
      } else {
        const grouped = new Map<RoleScope, string[]>();
        for (const row of rows) {
          const items = grouped.get(row.scope) ?? [];
          items.push(`<@&${row.roleId}>`);
          grouped.set(row.scope, items);
        }
        for (const [currentScope, roleMentions] of grouped.entries()) {
          embed.addFields({ name: getScopeName(currentScope, locale), value: roleMentions.join('\n') });
        }
      }

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === 'event_categories') {
      const eventCategory = interaction.options.getChannel('event_category', true);
      const archiveCategory = interaction.options.getChannel('archive_category', true);
      await ctx.services.guildConfig.setChannels(interaction.guildId!, eventCategory.id, archiveCategory.id);
      await interaction.reply({
        embeds: [buildInfoEmbed(
          t(locale, 'setup.channelsUpdatedTitle'),
          t(locale, 'setup.channelsUpdatedDescription', {
            eventCategory: String(eventCategory),
            archiveCategory: String(archiveCategory),
          }),
        )],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === 'timezone') {
      const timezone = interaction.options.getString('zone', true);
      if (!isValidTimeZone(timezone)) {
        await interaction.reply({
          embeds: [buildErrorEmbed(
            t(locale, 'setup.invalidTimezoneTitle'),
            t(locale, 'setup.invalidTimezoneDescription'),
          )],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await ctx.services.guildConfig.setDefaultTimezone(interaction.guildId!, timezone);
      await interaction.reply({
        embeds: [buildInfoEmbed(
          t(locale, 'setup.timezoneUpdatedTitle'),
          t(locale, 'setup.timezoneUpdatedDescription', { timezone }),
        )],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === 'language') {
      const language = interaction.options.getString('language', true) as SupportedLocale;
      await ctx.services.guildConfig.setLanguage(interaction.guildId!, language);
      await interaction.reply({
        embeds: [buildInfoEmbed(
          t(language, 'setup.languageUpdatedTitle'),
          t(language, 'setup.languageUpdatedDescription', {
            language: getLanguageName(language, language),
          }),
        )],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === 'validate') {
      const report = await ctx.services.health.validateGuild(interaction.guild!);
      const embed = new EmbedBuilder()
        .setTitle(t(locale, 'setup.validationTitle'))
        .setColor(report.blocking.length > 0 ? 0xed4245 : 0x57f287)
        .setTimestamp();

      if (report.blocking.length === 0 && report.warnings.length === 0) {
        embed.setDescription(t(locale, 'setup.validationHealthy'));
      } else {
        if (report.blocking.length > 0) {
          embed.addFields({
            name: t(locale, 'setup.validationBlockingField'),
            value: report.blocking.map((item) => `- ${item}`).join('\n').slice(0, 1024),
          });
        }

        if (report.warnings.length > 0) {
          embed.addFields({
            name: t(locale, 'setup.validationWarningsField'),
            value: report.warnings.map((item) => `- ${item}`).join('\n').slice(0, 1024),
          });
        }
      }

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    const { config, missing } = await ctx.services.guildConfig.getSetupMissing(interaction.guildId!);
    const embed = new EmbedBuilder()
      .setTitle(t(locale, 'setup.guildSetupTitle'))
      .setColor(0x5865f2)
      .setTimestamp()
      .addFields(
        { name: t(locale, 'setup.defaultTimezoneField'), value: config.defaultTimezone || t(locale, 'common.notSet') },
        { name: t(locale, 'setup.eventCategoryField'), value: config.eventCategoryId ? `<#${config.eventCategoryId}>` : t(locale, 'common.notSet') },
        { name: t(locale, 'setup.archiveCategoryField'), value: config.archiveCategoryId ? `<#${config.archiveCategoryId}>` : t(locale, 'common.notSet') },
        { name: t(locale, 'setup.languageField'), value: getLanguageName(config.language, locale) },
        { name: t(locale, 'setup.adminRolesField'), value: config.roles.admin.length ? config.roles.admin.map((roleId) => `<@&${roleId}>`).join('\n') : t(locale, 'common.none') },
        { name: t(locale, 'setup.managerRolesField'), value: config.roles.manager.length ? config.roles.manager.map((roleId) => `<@&${roleId}>`).join('\n') : t(locale, 'common.none') },
        { name: t(locale, 'setup.forumNoticeRolesField'), value: config.roles.forum_notice.length ? config.roles.forum_notice.map((roleId) => `<@&${roleId}>`).join('\n') : t(locale, 'common.none') },
      );

    if (missing.length > 0) {
      embed.addFields({
        name: t(locale, 'setup.missingSetupField'),
        value: missing.join('\n'),
      });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
