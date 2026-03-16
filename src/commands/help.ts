import { EmbedBuilder, MessageFlags, SlashCommandBuilder, type GuildMember } from 'discord.js';
import { withDescriptionLocales } from '../lib/command-localizations.js';
import { getHelpSummary, t } from '../lib/i18n.js';
import type { CommandDefinition } from './types.js';

export const helpCommand: CommandDefinition = {
  data: withDescriptionLocales(
    new SlashCommandBuilder()
      .setName('help')
      .setDescription('Show commands available to you.')
      .addStringOption((option) =>
        withDescriptionLocales(
          option
            .setName('topic')
            .setDescription('Filter by command name')
            .setRequired(false),
          'コマンド名で絞り込み',
          '按命令名筛选',
        ),
      ),
    '利用可能なコマンドを表示します。',
    '显示你可以使用的命令。',
  ),
  meta: {
    name: 'help',
    summary: 'Use permissions-aware help output.',
    usage: '/help [topic]',
    visibility: 'everyone',
  },
  async execute(ctx, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: t('en', 'common.useInGuild'), flags: MessageFlags.Ephemeral });
      return;
    }

    const locale = await ctx.services.guildConfig.getLanguage(interaction.guildId!);
    const member = interaction.member as GuildMember;
    const topic = interaction.options.getString('topic')?.toLowerCase();
    const visibleCommands: CommandDefinition[] = [];

    for (const command of ctx.commands) {
      if (topic && command.meta.name !== topic) {
        continue;
      }

      if (command.meta.visibility === 'admin') {
        const allowed = await ctx.services.permissions.canRunSetup(interaction.guildId!, member);
        if (!allowed) {
          continue;
        }
      }

      if (command.meta.visibility === 'manager') {
        const allowed = await ctx.services.permissions.canRunManagerAction(interaction.guildId!, member);
        if (!allowed) {
          continue;
        }
      }

      visibleCommands.push(command);
    }

    const embed = new EmbedBuilder()
      .setTitle(t(locale, 'help.title'))
      .setDescription(t(locale, 'help.description'))
      .setColor(0x5865f2)
      .setTimestamp();

    for (const command of visibleCommands) {
      embed.addFields({
        name: `/${command.meta.name}`,
        value: `${getHelpSummary(locale, command.meta.name, command.meta.summary)}\n${t(locale, 'help.usagePrefix')}: \`${command.meta.usage}\``,
      });
    }

    if (visibleCommands.length === 0) {
      embed.setDescription(t(locale, 'help.noMatch'));
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
