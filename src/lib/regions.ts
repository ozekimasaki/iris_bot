import type { APIApplicationCommandOptionChoice } from 'discord.js';
import type { SupportedLocale } from '../db/types.js';
import { t } from './i18n.js';

export const regionKeys = [
  'hokkaido',
  'tohoku',
  'kanto',
  'chubu',
  'kinki',
  'chugoku',
  'shikoku',
  'kyushu',
  'okinawa',
  'overseas',
] as const;

export type RegionKey = (typeof regionKeys)[number];

export const regionRoleColors: Record<RegionKey, number> = {
  hokkaido: 0x7ec8e3,
  tohoku: 0x3ba55d,
  kanto: 0xed4245,
  chubu: 0xfee75c,
  kinki: 0xeb459e,
  chugoku: 0x57f287,
  shikoku: 0x5865f2,
  kyushu: 0xe67e22,
  okinawa: 0x1abc9c,
  overseas: 0x99aab5,
};

export function isRegionKey(value: string): value is RegionKey {
  return (regionKeys as readonly string[]).includes(value);
}

export function getRegionName(locale: SupportedLocale, key: RegionKey) {
  return t(locale, `region.names.${key}`);
}

export function getRegionPrefectures(locale: SupportedLocale, key: RegionKey) {
  return t(locale, `region.prefectures.${key}`);
}

export function assertRegionKey(value: string): RegionKey {
  if (!isRegionKey(value)) {
    throw new Error('REGION_UNKNOWN');
  }

  return value;
}

export function buildRegionCommandChoices(): APIApplicationCommandOptionChoice<string>[] {
  return regionKeys.map((key) => ({
    name: t('en', `region.names.${key}`),
    value: key,
    name_localizations: {
      ja: t('ja', `region.names.${key}`),
      'zh-CN': t('zh-CN', `region.names.${key}`),
    },
  }));
}
