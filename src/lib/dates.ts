import { format, formatDistanceToNowStrict, isToday, isTomorrow, parseISO } from 'date-fns';

import { dateLocale, t } from '@/i18n';

const opts = { locale: dateLocale };

export const fmt = {
  relative: (iso: string) => formatDistanceToNowStrict(parseISO(iso), { addSuffix: true, ...opts }),
  dayLabel: (d: Date) =>
    isToday(d) ? t.calendar.today : isTomorrow(d) ? t.calendar.tomorrow : format(d, 'EEEE d. MMMM', opts),
  monthTitle: (d: Date) => format(d, 'LLLL yyyy', opts),
  weekdayShort: (d: Date) => format(d, 'EEEEEE', opts),
  time: (iso: string) => format(parseISO(iso), 'HH:mm', opts),
  date: (iso: string) => format(parseISO(iso), 'd. MMM', opts),
  dateTime: (iso: string) => format(parseISO(iso), 'd. MMM HH:mm', opts),
  isoDate: (d: Date) => format(d, 'yyyy-MM-dd'),
  hhmm: (d: Date) => format(d, 'HH:mm'),
};

/** Parse "YYYY-MM-DD" + "HH:MM" as local time (device time zone). */
export function parseLocal(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!dm || !tm) return null;
  const d = new Date(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2]);
  if (Number.isNaN(d.getTime()) || d.getMonth() !== +dm[2] - 1 || +tm[1] > 23 || +tm[2] > 59) return null;
  return d;
}
