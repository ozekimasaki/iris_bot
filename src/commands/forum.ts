import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type GuildMember,
} from 'discord.js';
import { withDescriptionLocales } from '../lib/command-localizations.js';
import { buildErrorEmbed, buildInfoEmbed } from '../lib/discord.js';
import { t } from '../lib/i18n.js';
import type { CommandDefinition } from './types.js';

export const forumCommand: CommandDefinition = {
  data: withDescriptionLocales(
    new SlashCommandBuilder()
      .setName('forum')
      .setDescription('Manage forum watch rules.')
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('watch')
            .setDescription('Watch a forum and notify a channel on new threads.')
            .addChannelOption((option) =>
              withDescriptionLocales(
                option
                  .setName('forum')
                  .setDescription('Forum channel to monitor')
                  .addChannelTypes(ChannelType.GuildForum)
                  .setRequired(true),
                '監視するフォーラムチャンネル',
                '要监控的论坛频道',
              ),
            )
            .addChannelOption((option) =>
              withDescriptionLocales(
                option
                  .setName('notification')
                  .setDescription('Text channel to notify')
                  .addChannelTypes(ChannelType.GuildText)
                  .setRequired(true),
                '通知先テキストチャンネル',
                '接收通知的文本频道',
              ),
            ),
          'フォーラムの新規スレッドを監視して通知します。',
          '监控论坛新帖子并发送通知。',
        ),
      )
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('unwatch')
            .setDescription('Remove a forum watch rule.')
            .addChannelOption((option) =>
              withDescriptionLocales(
                option
                  .setName('forum')
                  .setDescription('Forum channel to stop watching')
                  .addChannelTypes(ChannelType.GuildForum)
                  .setRequired(true),
                '監視をやめるフォーラムチャンネル',
                '停止监控的论坛频道',
              ),
            ),
          'フォーラム監視ルールを削除します。',
          '移除论坛监控规则。',
        ),
      )
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('list')
            .setDescription('List configured forum watch rules.'),
          '設定済みのフォーラム監視ルールを一覧表示します。',
          '列出已配置的论坛监控规则。',
        ),
      )
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('resync')
            .setDescription('Replay missed threads for a watched forum.')
            .addChannelOption((option) =>
              withDescriptionLocales(
                option
                  .setName('forum')
                  .setDescription('Watched forum channel to resync')
                  .addChannelTypes(ChannelType.GuildForum)
                  .setRequired(true),
                '再同期する監視済みフォーラム',
                '要重新同步的已监控论坛',
              ),
            )
            .addIntegerOption((option) =>
              withDescriptionLocales(
                option
                  .setName('lookback_hours')
                  .setDescription('Look back window in hours')
                  .setRequired(false)
                  .setMinValue(1)
                  .setMaxValue(168),
                '再通知対象を遡る時間数',
                '回溯通知的小时数',
              ),
            ),
          '監視済みフォーラムの未通知スレッドを再通知します。',
          '重新发送已监控论坛的遗漏帖子通知。',
        ),
      ),
    'フォーラム監視ルールを管理します。',
    '管理论坛监控规则。',
  ),
  meta: {
    name: 'forum',
    summary: 'Watch forum channels and notify on new threads.',
    usage: '/forum watch|unwatch|list|resync',
    visibility: 'admin',
  },
  async execute(ctx, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: t('en', 'common.useInGuild'), flags: MessageFlags.Ephemeral });
      return;
    }

    const locale = await ctx.services.guildConfig.getLanguage(interaction.guildId!);
    const member = interaction.member as GuildMember;
    const allowed = await ctx.services.permissions.canRunForumAdmin(interaction.guildId!, member);
    if (!allowed) {
      await interaction.reply({
        embeds: [buildErrorEmbed(t(locale, 'common.permissionDenied'), t(locale, 'forum.permissionDenied'))],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'watch') {
      const forum = interaction.options.getChannel('forum', true);
      const notification = interaction.options.getChannel('notification', true);
      if (forum.type !== ChannelType.GuildForum || notification.type !== ChannelType.GuildText) {
        await interaction.reply({
          embeds: [buildErrorEmbed(t(locale, 'forum.invalidChannelsTitle'), t(locale, 'forum.invalidChannelsDescription'))],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const lastSeen = await ctx.services.forums.primeLastSeen(forum as import('discord.js').ForumChannel);
      await ctx.services.forums.addWatch(interaction.guildId!, forum.id, notification.id, lastSeen);
      await interaction.reply({
        embeds: [buildInfoEmbed(
          t(locale, 'forum.watchSavedTitle'),
          t(locale, 'forum.watchSavedDescription', { forum: String(forum), notification: String(notification) }),
        )],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === 'unwatch') {
      const forum = interaction.options.getChannel('forum', true);
      await ctx.services.forums.removeWatch(interaction.guildId!, forum.id);
      await interaction.reply({
        embeds: [buildInfoEmbed(
          t(locale, 'forum.watchRemovedTitle'),
          t(locale, 'forum.watchRemovedDescription', { forum: String(forum) }),
        )],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === 'resync') {
      const forum = interaction.options.getChannel('forum', true);
      const lookbackHours = interaction.options.getInteger('lookback_hours') ?? 24;

      try {
        const result = await ctx.services.forums.resyncWatch(interaction.guild!, forum.id, lookbackHours);
        await interaction.reply({
          embeds: [buildInfoEmbed(
            t(locale, 'forum.resyncTitle'),
            t(locale, 'forum.resyncDescription', {
              forum: String(forum),
              delivered: result.delivered,
              remaining: result.remaining,
              cutoff: new Date(result.cutoff).toISOString(),
            }),
          )],
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        const description = error instanceof Error && error.message === 'FORUM_WATCH_NOT_FOUND'
          ? t(locale, 'forum.resyncNotFound')
          : t(locale, 'forum.resyncFailed');
        await interaction.reply({
          embeds: [buildErrorEmbed(t(locale, 'forum.resyncErrorTitle'), description)],
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    const rows = await ctx.services.forums.listWatches(interaction.guildId!);
    const embed = new EmbedBuilder()
      .setTitle(t(locale, 'forum.listTitle'))
      .setColor(0x5865f2)
      .setTimestamp();

    if (rows.length === 0) {
      embed.setDescription(t(locale, 'forum.noRules'));
    } else {
      embed.setDescription(rows.map((row) => t(locale, 'forum.listLine', {
        forumId: row.forumChannelId,
        notificationId: row.notificationChannelId,
      })).join('\n'));
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
