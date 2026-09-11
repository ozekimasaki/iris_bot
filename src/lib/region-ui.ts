import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import type { SupportedLocale } from '../db/types.js';
import { t } from './i18n.js';
import { getRegionName, getRegionPrefectures, isRegionKey, type RegionKey } from './regions.js';

export const REGION_ASSIGN_PREFIX = 'region:assign';
export const REGION_CLEAR_ID = 'region:clear';

const BUTTONS_PER_ROW = 5;

export function buildRegionAssignCustomId(regionKey: RegionKey) {
  return `${REGION_ASSIGN_PREFIX}:${regionKey}`;
}

export function parseRegionAssignCustomId(customId: string) {
  if (!customId.startsWith(`${REGION_ASSIGN_PREFIX}:`)) {
    return null;
  }

  const regionKey = customId.slice(`${REGION_ASSIGN_PREFIX}:`.length);
  return isRegionKey(regionKey) ? regionKey : null;
}

export function buildRegionGuideText(
  locale: SupportedLocale,
  introKey: string,
  regions: Array<{ key: RegionKey; roleId: string }>,
) {
  const lines = regions.map((region) => (
    t(locale, 'region.panelLine', {
      region: getRegionName(locale, region.key),
      prefectures: getRegionPrefectures(locale, region.key),
    })
  ));

  return [t(locale, introKey), '', ...lines].join('\n');
}

export function buildRegionButtonRows(
  locale: SupportedLocale,
  regions: Array<{ key: RegionKey; roleId: string }>,
) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let index = 0; index < regions.length; index += BUTTONS_PER_ROW) {
    const chunk = regions.slice(index, index + BUTTONS_PER_ROW);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...chunk.map((region) => (
          new ButtonBuilder()
            .setCustomId(buildRegionAssignCustomId(region.key))
            .setLabel(getRegionName(locale, region.key))
            .setStyle(ButtonStyle.Primary)
        )),
      ),
    );
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(REGION_CLEAR_ID)
        .setLabel(t(locale, 'region.clearButton'))
        .setStyle(ButtonStyle.Secondary),
    ),
  );

  return rows;
}

export function mapRegionError(
  locale: SupportedLocale,
  error: unknown,
  variables: { region?: string; role?: string } = {},
) {
  const code = error instanceof Error ? error.message : '';
  const region = variables.region ?? t(locale, 'common.notSet');
  const role = variables.role ?? t(locale, 'common.notSet');

  switch (code) {
    case 'REGION_NOT_CONFIGURED':
      return {
        title: t(locale, 'region.notConfiguredTitle'),
        description: t(locale, 'region.notConfiguredDescription', { region }),
      };
    case 'REGION_ROLE_MISSING':
      return {
        title: t(locale, 'region.roleMissingTitle'),
        description: t(locale, 'region.roleMissingDescription', { region }),
      };
    case 'REGION_BOT_HIERARCHY':
      return {
        title: t(locale, 'region.botHierarchyTitle'),
        description: t(locale, 'region.botHierarchyDescription'),
      };
    case 'REGION_ROLE_INVALID':
      return {
        title: t(locale, 'region.invalidRoleTitle'),
        description: t(locale, 'region.invalidRoleDescription'),
      };
    case 'REGION_ROLE_IN_USE':
      return {
        title: t(locale, 'region.roleInUseTitle'),
        description: t(locale, 'region.roleInUseDescription', { role, region }),
      };
    case 'REGION_UNKNOWN':
      return {
        title: t(locale, 'region.unknownRegionTitle'),
        description: t(locale, 'region.unknownRegionDescription'),
      };
    case 'REGION_MISSING_MANAGE_ROLES':
      return {
        title: t(locale, 'region.missingManageRolesTitle'),
        description: t(locale, 'region.missingManageRolesDescription'),
      };
    case 'REGION_NOT_SET':
      return {
        title: t(locale, 'region.notSetTitle'),
        description: t(locale, 'region.notSetDescription'),
      };
    default:
      return {
        title: t(locale, 'region.operationFailedTitle'),
        description: t(locale, 'region.operationFailedDescription'),
      };
  }
}
