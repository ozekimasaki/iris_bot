import { MessageFlags, SlashCommandBuilder, type ButtonInteraction, type GuildMember } from 'discord.js';
import { withDescriptionLocales } from '../lib/command-localizations.js';
import { buildErrorEmbed, buildInfoEmbed } from '../lib/discord.js';
import { t } from '../lib/i18n.js';
import { buildRegionCommandChoices, getRegionName, isRegionKey, type RegionKey } from '../lib/regions.js';
import {
  REGION_CLEAR_ID,
  buildRegionButtonRows,
  buildRegionGuideText,
  mapRegionError,
  parseRegionAssignCustomId,
} from '../lib/region-ui.js';
import type { SupportedLocale } from '../db/types.js';
import type { CommandContext, CommandDefinition } from './types.js';
import type { RegionAssignmentResult } from '../domain/region-service.js';

function configuredOrSetupError(ctx: CommandContext, guildId: string, locale: SupportedLocale):
  | { regions: Array<{ key: RegionKey; roleId: string }>; error: null }
  | { regions: null; error: { title: string; description: string } } {
  const regions = ctx.services.regions.listConfiguredRegions(guildId);
  if (regions.length === 0) {
    return {
      regions: null,
      error: {
        title: t(locale, 'region.setupRequiredTitle'),
        description: t(locale, 'region.setupRequiredDescription'),
      },
    };
  }

  return { regions, error: null };
}

function buildPickerPayload(locale: SupportedLocale, introKey: string, regions: Array<{ key: RegionKey; roleId: string }>) {
  return {
    embeds: [buildInfoEmbed(t(locale, 'region.promptTitle'), buildRegionGuideText(locale, introKey, regions))],
    components: buildRegionButtonRows(locale, regions),
  };
}

function buildAssignmentEmbed(locale: SupportedLocale, result: RegionAssignmentResult) {
  const roleLabel = `<@&${result.roleId}>`;
  const regionLabel = getRegionName(locale, result.regionKey);
  if (result.unchanged) {
    return buildInfoEmbed(
      t(locale, 'region.unchangedTitle'),
      t(locale, 'region.unchangedDescription', { role: roleLabel, region: regionLabel }),
    );
  }

  const description = [
    t(locale, 'region.assignedDescription', { role: roleLabel, region: regionLabel }),
    result.previousRegionKey && result.previousRegionKey !== result.regionKey
      ? t(locale, 'region.changedNote')
      : null,
  ].filter(Boolean).join('\n');

  return buildInfoEmbed(t(locale, 'region.assignedTitle'), description);
}

async function resolveGuildMember(interaction: { guild: { members: { fetch: (id: string) => Promise<GuildMember> } } | null; user: { id: string } }) {
  return interaction.guild!.members.fetch(interaction.user.id);
}

async function replyToRegionButton(
  interaction: ButtonInteraction,
  payload: { embeds: ReturnType<typeof buildInfoEmbed | typeof buildErrorEmbed>[] },
) {
  if (interaction.message.flags.has(MessageFlags.Ephemeral)) {
    await interaction.update(payload);
    return;
  }

  await interaction.reply({
    ...payload,
    flags: MessageFlags.Ephemeral,
  });
}

export const regionCommand: CommandDefinition = {
  data: withDescriptionLocales(
    new SlashCommandBuilder()
      .setName('region')
      .setDescription('Press a region button to get the matching role.')
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('set')
            .setDescription('Press a region button to get the matching role.')
            .addStringOption((option) =>
              withDescriptionLocales(
                option
                  .setName('region')
                  .setDescription('Japanese region (not prefecture)')
                  .setRequired(false)
                  .addChoices(...buildRegionCommandChoices()),
                '地方（都道府県ではなく地方）',
                '日本地区（不是都道府县）',
              ),
            ),
          '地方ボタンを押して地域ロールを付けます。',
          '按下地区按钮即可获得对应身份组。',
        ),
      )
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('show')
            .setDescription('Show your current region role.'),
          '現在の地域ロールを表示します。',
          '显示你当前的地区身份组。',
        ),
      )
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('clear')
            .setDescription('Remove your region role.'),
          '地域ロールを外します。',
          '移除你的地区身份组。',
        ),
      ),
    '地方ボタンを押して地域ロールを付けます。',
    '按下地区按钮即可获得对应身份组。',
  ),
  meta: {
    name: 'region',
    summary: 'Press a region button to get the matching region role.',
    usage: '/region set [region], /region show, /region clear',
    visibility: 'everyone',
  },
  async execute(ctx, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({ content: t('en', 'common.useInGuild'), flags: MessageFlags.Ephemeral });
      return;
    }

    const locale = await ctx.services.guildConfig.getLanguage(interaction.guildId!);
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'set') {
      const setup = configuredOrSetupError(ctx, interaction.guildId!, locale);
      if (!setup.regions) {
        await interaction.reply({
          embeds: [buildErrorEmbed(setup.error.title, setup.error.description)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const selected = interaction.options.getString('region');
      if (!selected) {
        await interaction.reply({
          ...buildPickerPayload(locale, 'region.promptDescription', setup.regions),
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (!isRegionKey(selected)) {
        await interaction.reply({
          embeds: [buildErrorEmbed(t(locale, 'region.unknownRegionTitle'), t(locale, 'region.unknownRegionDescription'))],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      try {
        const member = await resolveGuildMember(interaction);
        const result = await ctx.services.regions.assignRegion(interaction.guild!, member, selected);
        await interaction.reply({
          embeds: [buildAssignmentEmbed(locale, result)],
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        const message = mapRegionError(locale, error, { region: getRegionName(locale, selected) });
        await interaction.reply({
          embeds: [buildErrorEmbed(message.title, message.description)],
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    if (subcommand === 'show') {
      const current = ctx.services.regions.getMemberRegion(interaction.guildId!, interaction.user.id);
      if (!current || !isRegionKey(current.regionKey)) {
        await interaction.reply({
          embeds: [buildInfoEmbed(t(locale, 'region.notSetTitle'), t(locale, 'region.notSetDescription'))],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const member = await resolveGuildMember(interaction);
      const hasRole = member.roles.cache.has(current.roleId);
      const description = [
        t(locale, 'region.currentDescription', {
          region: getRegionName(locale, current.regionKey),
          role: `<@&${current.roleId}>`,
        }),
        hasRole ? null : t(locale, 'region.staleNote'),
      ].filter(Boolean).join('\n');

      await interaction.reply({
        embeds: [buildInfoEmbed(t(locale, 'region.currentTitle'), description)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      const member = await resolveGuildMember(interaction);
      await ctx.services.regions.clearRegion(interaction.guild!, member);
      await interaction.reply({
        embeds: [buildInfoEmbed(t(locale, 'region.clearedTitle'), t(locale, 'region.clearedDescription'))],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      const message = mapRegionError(locale, error);
      await interaction.reply({
        embeds: [buildErrorEmbed(message.title, message.description)],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
  async handleButton(ctx, interaction) {
    if (!interaction.inGuild()) {
      return false;
    }

    const locale = await ctx.services.guildConfig.getLanguage(interaction.guildId!);
    if (interaction.customId === REGION_CLEAR_ID) {
      try {
        const member = await resolveGuildMember(interaction);
        await ctx.services.regions.clearRegion(interaction.guild!, member);
        await replyToRegionButton(interaction, {
          embeds: [buildInfoEmbed(t(locale, 'region.clearedTitle'), t(locale, 'region.clearedDescription'))],
        });
      } catch (error) {
        const message = mapRegionError(locale, error);
        await replyToRegionButton(interaction, {
          embeds: [buildErrorEmbed(message.title, message.description)],
        });
      }
      return true;
    }

    const regionKey = parseRegionAssignCustomId(interaction.customId);
    if (!regionKey) {
      return false;
    }

    try {
      const member = await resolveGuildMember(interaction);
      const result = await ctx.services.regions.assignRegion(interaction.guild!, member, regionKey);
      await replyToRegionButton(interaction, {
        embeds: [buildAssignmentEmbed(locale, result)],
      });
    } catch (error) {
      const message = mapRegionError(locale, error, { region: getRegionName(locale, regionKey) });
      await replyToRegionButton(interaction, {
        embeds: [buildErrorEmbed(message.title, message.description)],
      });
    }

    return true;
  },
};
