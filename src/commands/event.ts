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
import { t } from '../lib/i18n.js';
import type { CommandDefinition } from './types.js';

const EVENT_ARCHIVE_CONFIRM_PREFIX = 'confirm:event-archive';
const EVENT_ARCHIVE_CANCEL_PREFIX = 'cancel:event-archive';

function mapEventError(locale: 'en' | 'ja' | 'zh-CN', error: unknown) {
  if (!(error instanceof Error)) {
    return {
      title: t(locale, 'event.operationFailedTitle'),
      description: t(locale, 'event.operationFailedDescription'),
    };
  }

  switch (error.message) {
    case 'EVENT_CATEGORY_NOT_CONFIGURED':
    case 'ARCHIVE_CATEGORY_NOT_CONFIGURED':
      return {
        title: t(locale, 'event.setupRequiredTitle'),
        description: t(locale, 'event.setupRequiredDescription'),
      };
    case 'EVENT_NOT_FOUND':
      return {
        title: t(locale, 'event.notFoundTitle'),
        description: t(locale, 'event.notFoundDescription'),
      };
    case 'EVENT_CHANNEL_NOT_FOUND':
      return {
        title: t(locale, 'event.channelMissingTitle'),
        description: t(locale, 'event.channelMissingDescription'),
      };
    default:
      return {
        title: t(locale, 'event.operationFailedTitle'),
        description: t(locale, 'event.operationFailedDescription'),
      };
  }
}

export const eventCommand: CommandDefinition = {
  data: withDescriptionLocales(
    new SlashCommandBuilder()
      .setName('event')
      .setDescription('Create and archive event channels.')
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('create')
            .setDescription('Create a new event channel and role.')
            .addStringOption((option) =>
              withDescriptionLocales(
                option
                  .setName('name')
                  .setDescription('Event name')
                  .setRequired(true),
                'イベント名',
                '活动名称',
              ),
            )
            .addStringOption((option) =>
              withDescriptionLocales(
                option
                  .setName('date')
                  .setDescription('Optional date prefix such as 0915 or 2026-09-15')
                  .setRequired(false),
                '0915 や 2026-09-15 のような任意の日付接頭辞',
                '可选日期前缀，例如 0915 或 2026-09-15',
              ),
            ),
          'イベント用チャンネルとロールを作成します。',
          '创建活动频道和身份组。',
        ),
      )
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('archive')
            .setDescription('Archive an existing event channel.')
            .addChannelOption((option) =>
              withDescriptionLocales(
                option
                  .setName('channel')
                  .setDescription('Event text channel to archive')
                  .addChannelTypes(ChannelType.GuildText)
                  .setRequired(true),
                'アーカイブするイベントチャンネル',
                '要归档的活动频道',
              ),
            ),
          '既存のイベントチャンネルをアーカイブします。',
          '归档现有活动频道。',
        ),
      )
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('list')
            .setDescription('List active event channels.')
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
          'アクティブなイベント一覧を表示します。',
          '显示活跃活动列表。',
        ),
      ),
    'イベントチャンネルを作成・アーカイブします。',
    '创建并归档活动频道。',
  ),
  meta: {
    name: 'event',
    summary: 'Create private event channels and archive them later.',
    usage: '/event create|archive|list',
    visibility: 'manager',
  },
  async execute(ctx, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: t('en', 'common.useInGuild'), flags: MessageFlags.Ephemeral });
      return;
    }

    const locale = await ctx.services.guildConfig.getLanguage(interaction.guildId!);
    const member = interaction.member as GuildMember;
    const allowed = await ctx.services.permissions.canRunManagerAction(interaction.guildId!, member);
    if (!allowed) {
      await interaction.reply({
        embeds: [buildErrorEmbed(t(locale, 'common.permissionDenied'), t(locale, 'event.permissionDenied'))],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'list') {
      const page = interaction.options.getInteger('page') ?? 1;
      const rows = await ctx.services.events.listActiveEvents(interaction.guildId!, page);
      const embed = new EmbedBuilder()
        .setTitle(t(locale, 'event.listTitle'))
        .setColor(0x5865f2)
        .setTimestamp();

      if (rows.length === 0) {
        embed.setDescription(t(locale, 'event.noActiveEvents'));
      } else {
        embed.setDescription(rows.map((row) => {
          const channel = interaction.guild!.channels.cache.get(row.textChannelId);
          const role = interaction.guild!.roles.cache.get(row.roleId);
          const stale = channel && role ? '' : ` (${t(locale, 'event.staleSuffix')})`;
          return `${channel ? `<#${row.textChannelId}>` : `#${row.textChannelId}`} / ${role ? `<@&${row.roleId}>` : `@${row.roleId}`}${stale}\n${row.displayName}\n<@${row.createdBy}> · <t:${Math.floor(row.createdAt / 1000)}:f>`;
        }).join('\n\n'));
      }

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (!member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({
        embeds: [buildErrorEmbed(t(locale, 'common.permissionDenied'), t(locale, 'event.permissionDenied'))],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const config = await ctx.services.guildConfig.getGuildConfig(interaction.guildId!);
    if (!config.eventCategoryId || !config.archiveCategoryId) {
      await interaction.reply({
        embeds: [buildErrorEmbed(t(locale, 'event.setupRequiredTitle'), t(locale, 'event.setupRequiredDescription'))],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === 'create') {
      const name = interaction.options.getString('name', true);
      const date = interaction.options.getString('date');
      try {
        const result = await ctx.services.events.createEvent(interaction.guild!, interaction.user.id, name, date);
        await interaction.reply({
          embeds: [
            buildInfoEmbed(
              t(locale, 'event.createdTitle'),
              t(locale, 'event.createdDescription', {
                channel: String(result.channel),
                role: String(result.role),
                displayName: result.displayName,
              }),
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        const message = mapEventError(locale, error);
        await interaction.reply({
          embeds: [buildErrorEmbed(message.title, message.description)],
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    const channel = interaction.options.getChannel('channel', true);
    const confirmId = `${EVENT_ARCHIVE_CONFIRM_PREFIX}:${channel.id}:${interaction.user.id}`;
    const cancelId = `${EVENT_ARCHIVE_CANCEL_PREFIX}:${interaction.user.id}`;
    await interaction.reply({
      embeds: [buildInfoEmbed(
        t(locale, 'event.confirmArchiveTitle'),
        t(locale, 'event.confirmArchiveDescription', { channel: String(channel) }),
      )],
      components: [buildConfirmRow(confirmId, cancelId, {
        confirm: t(locale, 'common.confirm'),
        cancel: t(locale, 'common.cancel'),
      })],
      flags: MessageFlags.Ephemeral,
    });
  },
  async handleButton(ctx, interaction) {
    if (!interaction.inGuild()) {
      return false;
    }

    const locale = await ctx.services.guildConfig.getLanguage(interaction.guildId!);
    if (interaction.customId.startsWith(EVENT_ARCHIVE_CANCEL_PREFIX)) {
      await interaction.update({
        embeds: [buildInfoEmbed(t(locale, 'event.cancelledTitle'), t(locale, 'event.cancelledDescription'))],
        components: [],
      });
      return true;
    }

    if (!interaction.customId.startsWith(EVENT_ARCHIVE_CONFIRM_PREFIX)) {
      return false;
    }

    const [, , channelId, ownerId] = interaction.customId.split(':');
    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        embeds: [buildErrorEmbed(t(locale, 'common.notAllowed'), t(locale, 'event.confirmOwnerOnly'))],
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    try {
      const archived = await ctx.services.events.archiveEvent(interaction.guild!, channelId);
      await interaction.update({
        embeds: [buildInfoEmbed(
          t(locale, 'event.archivedTitle'),
          t(locale, 'event.archivedDescription', { displayName: archived.displayName }),
        )],
        components: [],
      });
    } catch (error) {
      const message = mapEventError(locale, error);
      await interaction.update({
        embeds: [buildErrorEmbed(message.title, message.description)],
        components: [],
      });
    }
    return true;
  },
};
