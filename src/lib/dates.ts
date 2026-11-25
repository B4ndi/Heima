import { format, formatDistanceToNowStrict, isToday, isTomorrow, parseISO } from 'date-fns';
import { nb as nbLocale } from 'date-fns/locale';

import { nb } from '@/i18n/nb';

export const fmt = {
  relative: (iso: string) => formatDistanceToNowStrict(parseISO(iso), { addSuffix: true, locale: nbLocale }),
  dayLabel: (d: Date) =>
    isToday(d) ? nb.calendar.today : isTomorrow(d) ? nb.calendar.tomorrow : format(d, 'EEEE d. MMMM', { locale: nbLocale }),
  time: (iso: string) => format(parseISO(iso), 'HH:mm', { locale: nbLocale }),
  date: (iso: string) => format(parseISO(iso), 'd. MMM', { locale: nbLocale }),
  dateTime: (iso: string) => format(parseISO(iso), "d. MMM 'kl.' HH:mm", { locale: nbLocale }),
  isoDate: (d: Date) => format(d, 'yyyy-MM-dd'),
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
