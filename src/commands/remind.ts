import {
  ActionRowBuilder,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { withDescriptionLocales } from '../lib/command-localizations.js';
import { buildErrorEmbed, buildInfoEmbed, makeReminderId } from '../lib/discord.js';
import { t } from '../lib/i18n.js';
import { formatDateForDisplay, isValidTimeZone, parseHumanTimeInput } from '../lib/time.js';
import type { CommandDefinition } from './types.js';

type PendingReminder = {
  guildId: string;
  channelId: string;
  creatorUserId: string;
  timezone: string;
  timezoneSource: 'user' | 'guild';
  nextRunAt: number;
  targetUserId: string | null;
  targetRoleId: string | null;
  repeatDays: number | null;
};

const pendingReminderInputs = new Map<string, PendingReminder>();
const REMIND_MODAL_ID = 'remind:set';

function pendingKey(guildId: string, userId: string) {
  return `${guildId}:${userId}`;
}

export const remindCommand: CommandDefinition = {
  data: withDescriptionLocales(
    new SlashCommandBuilder()
      .setName('remind')
      .setDescription('Create and manage reminders.')
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('timezone')
            .setDescription('Set your personal timezone.')
            .addStringOption((option) =>
              withDescriptionLocales(
                option
                  .setName('zone')
                  .setDescription('IANA timezone, for example America/New_York')
                  .setRequired(true),
                'IANA タイムゾーン。例: Asia/Tokyo',
                'IANA 时区，例如 Asia/Tokyo',
              ),
            ),
          '個人のタイムゾーンを設定します。',
          '设置你的个人时区。',
        ),
      )
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('set')
            .setDescription('Create a reminder.')
            .addStringOption((option) =>
              withDescriptionLocales(
                option
                  .setName('time')
                  .setDescription('YYYY-MM-DD HH:mm, HH:mm, tomorrow HH:mm, or in 10 minutes')
                  .setRequired(true),
                'YYYY-MM-DD HH:mm、HH:mm、tomorrow HH:mm、in 10 minutes 形式',
                '支持 YYYY-MM-DD HH:mm、HH:mm、tomorrow HH:mm、in 10 minutes',
              ),
            )
            .addUserOption((option) =>
              withDescriptionLocales(
                option
                  .setName('target_user')
                  .setDescription('Optional user to mention'),
                '任意のメンション対象ユーザー',
                '可选要提及的用户',
              ),
            )
            .addRoleOption((option) =>
              withDescriptionLocales(
                option
                  .setName('target_role')
                  .setDescription('Optional role to mention'),
                '任意のメンション対象ロール',
                '可选要提及的身份组',
              ),
            )
            .addIntegerOption((option) =>
              withDescriptionLocales(
                option
                  .setName('repeat_days')
                  .setDescription('Repeat interval in days')
                  .setMinValue(1),
                '繰り返し間隔（日）',
                '重复间隔（天）',
              ),
            ),
          'リマインダーを作成します。',
          '创建提醒。',
        ),
      )
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('list')
            .setDescription('List your active reminders.')
            .addIntegerOption((option) =>
              withDescriptionLocales(
                option
                  .setName('page')
                  .setDescription('Page number')
                  .setMinValue(1),
                'ページ番号',
                '页码',
              ),
            ),
          '有効なリマインダー一覧を表示します。',
          '列出你的有效提醒。',
        ),
      )
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('delete')
            .setDescription('Delete a reminder by id.')
            .addStringOption((option) =>
              withDescriptionLocales(
                option
                  .setName('id')
                  .setDescription('Reminder id')
                  .setRequired(true),
                'リマインダーID',
                '提醒 ID',
              ),
            ),
          'ID を指定してリマインダーを削除します。',
          '按 ID 删除提醒。',
        ),
      ),
    'リマインダーを作成・管理します。',
    '创建并管理提醒。',
  ),
  meta: {
    name: 'remind',
    summary: 'Timezone-aware reminders with optional mentions.',
    usage: '/remind timezone|set|list|delete',
    visibility: 'everyone',
  },
  async execute(ctx, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: t('en', 'common.useInGuild'), flags: MessageFlags.Ephemeral });
      return;
    }

    const locale = await ctx.services.guildConfig.getLanguage(interaction.guildId!);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'timezone') {
      const timezone = interaction.options.getString('zone', true);
      if (!isValidTimeZone(timezone)) {
        await interaction.reply({
          embeds: [buildErrorEmbed(t(locale, 'remind.invalidTimezoneTitle'), t(locale, 'remind.invalidTimezoneDescription'))],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await ctx.services.reminders.setUserTimezone(interaction.guildId!, interaction.user.id, timezone);
      await interaction.reply({
        embeds: [buildInfoEmbed(
          t(locale, 'remind.timezoneSavedTitle'),
          t(locale, 'remind.timezoneSavedDescription', { timezone }),
        )],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (subcommand === 'set') {
      const { timezone, source } = await ctx.services.reminders.getEffectiveTimezone(interaction.guildId!, interaction.user.id);
      const timeInput = interaction.options.getString('time', true);
      let parsed;
      try {
        parsed = parseHumanTimeInput(timeInput, timezone);
      } catch {
        await interaction.reply({
          embeds: [buildErrorEmbed(t(locale, 'remind.invalidTimeTitle'), t(locale, 'remind.invalidTimeDescription'))],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const key = pendingKey(interaction.guildId!, interaction.user.id);

      pendingReminderInputs.set(key, {
        guildId: interaction.guildId!,
        channelId: interaction.channelId,
        creatorUserId: interaction.user.id,
        timezone,
        timezoneSource: source,
        nextRunAt: parsed.utcMillis,
        targetUserId: interaction.options.getUser('target_user')?.id ?? null,
        targetRoleId: interaction.options.getRole('target_role')?.id ?? null,
        repeatDays: interaction.options.getInteger('repeat_days'),
      });

      const modal = new ModalBuilder()
        .setCustomId(REMIND_MODAL_ID)
        .setTitle(t(locale, 'remind.modalTitle'))
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('content')
              .setLabel(t(locale, 'remind.modalContentLabel'))
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(1000),
          ),
        );

      await interaction.showModal(modal);
      return;
    }

    if (subcommand === 'list') {
      const page = interaction.options.getInteger('page') ?? 1;
      const rows = await ctx.services.reminders.listUserReminders(interaction.guildId!, interaction.user.id, page);
      const embed = new EmbedBuilder()
        .setTitle(t(locale, 'remind.listTitle'))
        .setColor(0x5865f2)
        .setTimestamp();

      if (rows.length === 0) {
        embed.setDescription(t(locale, 'remind.noReminders'));
      } else {
        embed.setDescription(rows.map((row) => {
          const repeat = row.repeatDays ? t(locale, 'remind.repeatEveryDays', { days: row.repeatDays }) : '';
          return `**${row.id}**\n${formatDateForDisplay(row.nextRunAt, row.timezone)}${repeat}\n${row.content.slice(0, 120)}`;
        }).join('\n\n'));
      }

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    const reminderId = interaction.options.getString('id', true);
    try {
      const deleted = await ctx.services.reminders.deleteReminder(interaction.guildId!, interaction.user.id, reminderId);
      if (!deleted) {
        await interaction.reply({
          embeds: [buildErrorEmbed(
            t(locale, 'remind.notFoundTitle'),
            t(locale, 'remind.notFoundDescription', { id: reminderId }),
          )],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        embeds: [buildInfoEmbed(
          t(locale, 'remind.deletedTitle'),
          t(locale, 'remind.deletedDescription', { id: reminderId }),
        )],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      await interaction.reply({
        embeds: [buildErrorEmbed(
          t(locale, 'remind.deleteFailedTitle'),
          error instanceof Error && error.message === 'REMINDER_DELETE_FORBIDDEN'
            ? t(locale, 'remind.deleteForbidden')
            : t(locale, 'remind.deleteFailedDescription'),
        )],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
  async handleModal(ctx, interaction) {
    if (!interaction.inGuild() || interaction.customId !== REMIND_MODAL_ID) {
      return false;
    }

    const locale = await ctx.services.guildConfig.getLanguage(interaction.guildId!);
    const key = pendingKey(interaction.guildId!, interaction.user.id);
    const pending = pendingReminderInputs.get(key);
    if (!pending) {
      await interaction.reply({
        embeds: [buildErrorEmbed(t(locale, 'remind.expiredTitle'), t(locale, 'remind.expiredDescription'))],
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const content = interaction.fields.getTextInputValue('content').trim();
    if (!content) {
      await interaction.reply({
        embeds: [buildErrorEmbed(t(locale, 'remind.emptyContentTitle'), t(locale, 'remind.emptyContentDescription'))],
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await ctx.services.reminders.createReminder({
      id: makeReminderId(),
      guildId: pending.guildId,
      channelId: pending.channelId,
      creatorUserId: pending.creatorUserId,
      content,
      targetUserId: pending.targetUserId,
      targetRoleId: pending.targetRoleId,
      repeatDays: pending.repeatDays,
      nextRunAt: pending.nextRunAt,
      timezone: pending.timezone,
    });
    pendingReminderInputs.delete(key);

    const timezoneNote = pending.timezoneSource === 'guild'
      ? t(locale, 'remind.guildTimezoneUsed', { timezone: pending.timezone })
      : t(locale, 'remind.userTimezoneUsed', { timezone: pending.timezone });

    await interaction.reply({
      embeds: [
        buildInfoEmbed(
          t(locale, 'remind.createdTitle'),
          t(locale, 'remind.createdDescription', {
            nextRun: formatDateForDisplay(pending.nextRunAt, pending.timezone),
            timezoneNote,
          }),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  },
};
