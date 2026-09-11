import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import type { SupportedLocale } from '../db/types.js';
import { t } from './i18n.js';
import { getRegionName, getRegionPrefectures, type RegionKey } from './regions.js';

export const REGION_PICK_SELECT_ID = 'region:pick';
export const REGION_PANEL_SELECT_ID = 'region:panel';
export const REGION_CONFIRM_PREFIX = 'confirm:region';
export const REGION_CANCEL_PREFIX = 'cancel:region';

const SELECT_DESCRIPTION_MAX = 100;

export function buildRegionSelectRow(
  locale: SupportedLocale,
  customId: string,
  regions: Array<{ key: RegionKey; roleId: string }>,
) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(t(locale, 'region.selectPlaceholder'))
    .setMinValues(1)
    .setMaxValues(1);

  for (const region of regions) {
    const description = getRegionPrefectures(locale, region.key).slice(0, SELECT_DESCRIPTION_MAX);
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(getRegionName(locale, region.key))
        .setValue(region.key)
        .setDescription(description),
    );
  }

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function buildRegionConfirmCustomId(regionKey: RegionKey, userId: string) {
  return `${REGION_CONFIRM_PREFIX}:${regionKey}:${userId}`;
}

export function buildRegionCancelCustomId(userId: string) {
  return `${REGION_CANCEL_PREFIX}:${userId}`;
}

export function parseRegionConfirmCustomId(customId: string) {
  if (!customId.startsWith(`${REGION_CONFIRM_PREFIX}:`)) {
    return null;
  }

  const [, , regionKey, ownerId] = customId.split(':');
  if (!regionKey || !ownerId) {
    return null;
  }

  return { regionKey, ownerId };
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
