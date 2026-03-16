import { DateTime } from 'luxon';

export type ParsedTimeInput = {
  timezone: string;
  localDateTime: unknown;
  utcMillis: number;
};

export function isValidTimeZone(timezone: string) {
  return DateTime.now().setZone(timezone).isValid;
}

export function requireValidTimeZone(timezone: string) {
  if (!isValidTimeZone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
}

export function parseHumanTimeInput(input: string, timezone: string, now = DateTime.now().setZone(timezone)): ParsedTimeInput {
  requireValidTimeZone(timezone);

  const normalized = input.trim();
  let localDateTime: any = null;

  const absoluteWithTime = normalized.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (absoluteWithTime) {
    const [, year, month, day, hour, minute] = absoluteWithTime.map(Number);
    localDateTime = DateTime.fromObject({ year, month, day, hour, minute }, { zone: timezone });
  }

  const absoluteDate = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!localDateTime && absoluteDate) {
    const [, year, month, day] = absoluteDate.map(Number);
    localDateTime = DateTime.fromObject({ year, month, day, hour: 9, minute: 0 }, { zone: timezone });
  }

  const tomorrowTime = normalized.match(/^tomorrow\s+(\d{2}):(\d{2})$/i);
  if (!localDateTime && tomorrowTime) {
    const [, hour, minute] = tomorrowTime.map(Number);
    localDateTime = now.plus({ days: 1 }).set({ hour, minute, second: 0, millisecond: 0 });
  }

  const relative = normalized.match(/^in\s+(\d+)\s*(minutes?|mins?|m|hours?|hrs?|h|days?|d)$/i);
  if (!localDateTime && relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    if (unit.startsWith('m')) {
      localDateTime = now.plus({ minutes: amount });
    } else if (unit.startsWith('h')) {
      localDateTime = now.plus({ hours: amount });
    } else {
      localDateTime = now.plus({ days: amount });
    }
  }

  const shortTime = normalized.match(/^(\d{2}):(\d{2})$/);
  if (!localDateTime && shortTime) {
    const [, hour, minute] = shortTime.map(Number);
    let candidate = now.set({ hour, minute, second: 0, millisecond: 0 });
    if (candidate <= now) {
      candidate = candidate.plus({ days: 1 });
    }
    localDateTime = candidate;
  }

  if (!localDateTime?.isValid) {
    throw new Error('Use YYYY-MM-DD HH:mm, YYYY-MM-DD, HH:mm, tomorrow HH:mm, or in 10 minutes.');
  }

  return {
    timezone,
    localDateTime,
    utcMillis: localDateTime.toUTC().toMillis(),
  };
}

export function formatDateForDisplay(timestamp: number, timezone: string) {
  return DateTime.fromMillis(timestamp, { zone: timezone }).toFormat('yyyy-LL-dd HH:mm ZZZZ');
}

export function advanceReminderTimestamp(currentUtcMillis: number, timezone: string, repeatDays: number) {
  return DateTime.fromMillis(currentUtcMillis, { zone: 'utc' })
    .setZone(timezone)
    .plus({ days: repeatDays })
    .toUTC()
    .toMillis();
}
