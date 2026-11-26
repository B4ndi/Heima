import { format, formatDistanceToNowStrict, isToday, isTomorrow, parseISO } from 'date-fns';

import { dateLocale, t } from '@/i18n';

const opts = { locale: dateLocale };

export const fmt = {
  relative: (iso: string) => formatDistanceToNowStrict(parseISO(iso), { addSuffix: true, ...opts }),
  dayLabel: (d: Date) =>
    isToday(d) ? t.calendar.today : isTomorrow(d) ? t.calendar.tomorrow : format(d, 'EEEE dd.MM.yyyy', opts),
  monthTitle: (d: Date) => format(d, 'LLLL yyyy', opts),
  weekdayShort: (d: Date) => format(d, 'EEEEEE', opts),
  time: (iso: string) => format(parseISO(iso), 'HH:mm', opts),
  /** All dates shown as DD.MM.YYYY (Norwegian convention). */
  date: (iso: string) => format(parseISO(iso), 'dd.MM.yyyy', opts),
  dateTime: (iso: string) => format(parseISO(iso), 'dd.MM.yyyy HH:mm', opts),
  monthShort: (iso: string) => format(parseISO(iso), 'MMM', opts),
  /** A Date as typed in date fields: DD.MM.YYYY. */
  inputDate: (d: Date) => format(d, 'dd.MM.yyyy'),
  isoDate: (d: Date) => format(d, 'yyyy-MM-dd'),
  hhmm: (d: Date) => format(d, 'HH:mm'),
};

/**
 * Parse a typed date "DD.MM.YYYY" into an ISO date "YYYY-MM-DD" (what the
 * database stores). Also accepts "-" or "/" as separator and one-digit day or
 * month, since people type "1.2.2026". Returns null for impossible dates.
 */
export function parseInputDate(input: string): string | null {
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(input.trim());
  if (!m) return null;
  const [day, month, year] = [+m[1], +m[2], +m[3]];
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** ISO date "YYYY-MM-DD" → "DD.MM.YYYY" for a date field. */
export function isoToInputDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Parse "DD.MM.YYYY" + "HH:MM" as local time (device time zone). */
export function parseLocal(date: string, time: string): Date | null {
  const iso = parseInputDate(date);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!iso || !tm || +tm[1] > 23 || +tm[2] > 59) return null;
  const [y, mo, d] = iso.split('-').map(Number);
  return new Date(y, mo - 1, d, +tm[1], +tm[2]);
}

/**
 * Today's date (YYYY-MM-DD) in the household's time zone, matching what the
 * database uses for chores. Falls back to the device's zone if the runtime
 * cannot resolve the zone.
 */
export function todayIn(timeZone: string | null | undefined, now: Date = new Date()): string {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
      const get = (type: string) => parts.find((p) => p.type === type)?.value;
      const [y, m, d] = [get('year'), get('month'), get('day')];
      if (y && m && d) return `${y}-${m}-${d}`;
    } catch {
      // unknown zone or no Intl time zone support: fall through
    }
  }
  return format(now, 'yyyy-MM-dd');
}
