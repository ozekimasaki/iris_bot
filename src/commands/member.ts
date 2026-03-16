import {
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildMember,
} from 'discord.js';
import { withDescriptionLocales } from '../lib/command-localizations.js';
import { buildErrorEmbed } from '../lib/discord.js';
import { buildMemberCsv } from '../lib/csv.js';
import { t } from '../lib/i18n.js';
import type { CommandDefinition } from './types.js';

export const memberCommand: CommandDefinition = {
  data: withDescriptionLocales(
    new SlashCommandBuilder()
      .setName('member')
      .setDescription('Export members as CSV.')
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('export')
            .setDescription('Export all members or a single role subset.')
            .addRoleOption((option) =>
              withDescriptionLocales(
                option
                  .setName('role')
                  .setDescription('Optional role filter')
                  .setRequired(false),
                '任意のロール絞り込み',
                '可选的身份组筛选',
              ),
            ),
          '全メンバーまたは特定ロールのメンバーを出力します。',
          '导出全部成员或指定身份组成员。',
        ),
      ),
    'メンバーを CSV で出力します。',
    '将成员导出为 CSV。',
  ),
  meta: {
    name: 'member',
    summary: 'Export guild members to CSV.',
    usage: '/member export [role]',
    visibility: 'admin',
  },
  async execute(ctx, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: t('en', 'common.useInGuild'), flags: MessageFlags.Ephemeral });
      return;
    }

    const locale = await ctx.services.guildConfig.getLanguage(interaction.guildId!);
    const member = interaction.member as GuildMember;
    const hasPermission = member.permissions.has(PermissionFlagsBits.ManageGuild) ||
      await ctx.services.permissions.canRunForumAdmin(interaction.guildId!, member);

    if (!hasPermission) {
      await interaction.reply({
        embeds: [buildErrorEmbed(t(locale, 'common.permissionDenied'), t(locale, 'member.permissionDenied'))],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const filterRole = interaction.options.getRole('role');
    const members = await interaction.guild!.members.fetch();
    const rows = members
      .filter((candidate) => !filterRole || candidate.roles.cache.has(filterRole.id))
      .map((candidate) => ({
        userId: candidate.id,
        displayName: candidate.displayName,
        globalName: candidate.user.globalName ?? '',
        username: candidate.user.username,
      }));

    const attachment = new AttachmentBuilder(Buffer.from(buildMemberCsv(rows), 'utf8'), {
      name: `members-${interaction.guildId}.csv`,
    });

    await interaction.editReply({
      files: [attachment],
    });
  },
};
