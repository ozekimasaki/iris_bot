import {
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
  type GuildMember,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { withDescriptionLocales } from '../lib/command-localizations.js';
import { buildConfirmRow, buildErrorEmbed, buildInfoEmbed } from '../lib/discord.js';
import { t } from '../lib/i18n.js';
import { buildRegionCommandChoices, getRegionName, getRegionPrefectures, isRegionKey, type RegionKey } from '../lib/regions.js';
import {
  REGION_CANCEL_PREFIX,
  REGION_PANEL_SELECT_ID,
  REGION_PICK_SELECT_ID,
  buildRegionCancelCustomId,
  buildRegionConfirmCustomId,
  buildRegionSelectRow,
  mapRegionError,
  parseRegionConfirmCustomId,
} from '../lib/region-ui.js';
import type { SupportedLocale } from '../db/types.js';
import type { CommandContext, CommandDefinition } from './types.js';

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

function buildConfirmPayload(locale: SupportedLocale, regionKey: RegionKey, userId: string) {
  return {
    embeds: [buildInfoEmbed(
      t(locale, 'region.confirmTitle'),
      t(locale, 'region.confirmDescription', {
        region: getRegionName(locale, regionKey),
        prefectures: getRegionPrefectures(locale, regionKey),
      }),
    )],
    components: [buildConfirmRow(
      buildRegionConfirmCustomId(regionKey, userId),
      buildRegionCancelCustomId(userId),
      {
        confirm: t(locale, 'common.confirm'),
        cancel: t(locale, 'common.cancel'),
        confirmStyle: ButtonStyle.Success,
      },
    )],
  };
}

async function resolveGuildMember(interaction: { guild: { members: { fetch: (id: string) => Promise<GuildMember> } } | null; user: { id: string } }) {
  return interaction.guild!.members.fetch(interaction.user.id);
}

export const regionCommand: CommandDefinition = {
  data: withDescriptionLocales(
    new SlashCommandBuilder()
      .setName('region')
      .setDescription('Confirm your Japanese region and receive the matching role.')
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('set')
            .setDescription('Confirm your region and receive the matching region role.')
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
          '地方を確認して、対応する地域ロールを付与します。',
          '确认所在地区并获得对应的地区身份组。',
        ),
      )
      .addSubcommand((sub) =>
        withDescriptionLocales(
          sub
            .setName('show')
            .setDescription('Show your currently confirmed region.'),
          '確認済みの地方を表示します。',
          '显示你已确认的地区。',
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
    '地方を確認して地域ロールを付与します。',
    '确认地区并分配地区身份组。',
  ),
  meta: {
    name: 'region',
    summary: 'Confirm your Japanese region and receive the matching region role.',
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
          embeds: [buildInfoEmbed(t(locale, 'region.promptTitle'), t(locale, 'region.promptDescription'))],
          components: [buildRegionSelectRow(locale, REGION_PICK_SELECT_ID, setup.regions)],
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

      if (!setup.regions.some((region) => region.key === selected)) {
        await interaction.reply({
          embeds: [buildErrorEmbed(
            t(locale, 'region.notConfiguredTitle'),
            t(locale, 'region.notConfiguredDescription', { region: getRegionName(locale, selected) }),
          )],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        ...buildConfirmPayload(locale, selected, interaction.user.id),
        flags: MessageFlags.Ephemeral,
      });
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
  async handleSelectMenu(ctx, interaction: StringSelectMenuInteraction) {
    if (!interaction.inGuild()) {
      return false;
    }

    const isPick = interaction.customId === REGION_PICK_SELECT_ID;
    const isPanel = interaction.customId === REGION_PANEL_SELECT_ID;
    if (!isPick && !isPanel) {
      return false;
    }

    const locale = await ctx.services.guildConfig.getLanguage(interaction.guildId!);
    const setup = configuredOrSetupError(ctx, interaction.guildId!, locale);
    if (!setup.regions) {
      const payload = {
        embeds: [buildErrorEmbed(setup.error.title, setup.error.description)],
        components: [],
      };
      if (isPanel) {
        await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.update(payload);
      }
      return true;
    }

    const selected = interaction.values[0];
    if (!selected || !isRegionKey(selected) || !setup.regions.some((region) => region.key === selected)) {
      const payload = {
        embeds: [buildErrorEmbed(
          t(locale, 'region.notConfiguredTitle'),
          t(locale, 'region.notConfiguredDescription', {
            region: selected && isRegionKey(selected) ? getRegionName(locale, selected) : t(locale, 'common.notSet'),
          }),
        )],
        components: [],
      };
      if (isPanel) {
        await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.update(payload);
      }
      return true;
    }

    const payload = buildConfirmPayload(locale, selected, interaction.user.id);
    if (isPanel) {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.update(payload);
    }
    return true;
  },
  async handleButton(ctx, interaction) {
    if (!interaction.inGuild()) {
      return false;
    }

    const locale = await ctx.services.guildConfig.getLanguage(interaction.guildId!);
    if (interaction.customId.startsWith(REGION_CANCEL_PREFIX)) {
      const ownerId = interaction.customId.split(':')[2];
      if (interaction.user.id !== ownerId) {
        await interaction.reply({
          embeds: [buildErrorEmbed(t(locale, 'common.notAllowed'), t(locale, 'region.confirmOwnerOnly'))],
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }

      await interaction.update({
        embeds: [buildInfoEmbed(t(locale, 'region.cancelledTitle'), t(locale, 'region.cancelledDescription'))],
        components: [],
      });
      return true;
    }

    const parsed = parseRegionConfirmCustomId(interaction.customId);
    if (!parsed) {
      return false;
    }

    if (interaction.user.id !== parsed.ownerId) {
      await interaction.reply({
        embeds: [buildErrorEmbed(t(locale, 'common.notAllowed'), t(locale, 'region.confirmOwnerOnly'))],
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (!isRegionKey(parsed.regionKey)) {
      await interaction.update({
        embeds: [buildErrorEmbed(t(locale, 'region.unknownRegionTitle'), t(locale, 'region.unknownRegionDescription'))],
        components: [],
      });
      return true;
    }

    try {
      const member = await resolveGuildMember(interaction);
      const result = await ctx.services.regions.assignRegion(interaction.guild!, member, parsed.regionKey);
      const roleLabel = `<@&${result.roleId}>`;
      const regionLabel = getRegionName(locale, result.regionKey);
      if (result.unchanged) {
        await interaction.update({
          embeds: [buildInfoEmbed(
            t(locale, 'region.unchangedTitle'),
            t(locale, 'region.unchangedDescription', { role: roleLabel, region: regionLabel }),
          )],
          components: [],
        });
        return true;
      }

      const description = [
        t(locale, 'region.assignedDescription', { role: roleLabel }),
        result.previousRegionKey && result.previousRegionKey !== result.regionKey
          ? t(locale, 'region.changedNote')
          : null,
      ].filter(Boolean).join('\n');

      await interaction.update({
        embeds: [buildInfoEmbed(t(locale, 'region.assignedTitle'), description)],
        components: [],
      });
    } catch (error) {
      const message = mapRegionError(locale, error, {
        region: getRegionName(locale, parsed.regionKey),
      });
      await interaction.update({
        embeds: [buildErrorEmbed(message.title, message.description)],
        components: [],
      });
    }

    return true;
  },
};
