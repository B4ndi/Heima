import { enGB, nb as nbDate } from 'date-fns/locale';
import { getLocales } from 'expo-localization';

import { en } from './en';
import { nb, type Strings } from './nb';

/**
 * UI language follows the phone: Norwegian (nb/nn/no) → Norwegian, anything
 * else → English. Resolved once at startup; changing the phone's language
 * restarts the app on both iOS and Android.
 */
function phoneLanguage(): 'nb' | 'en' {
  try {
    const code = getLocales()[0]?.languageCode ?? 'nb';
    return ['nb', 'nn', 'no'].includes(code) ? 'nb' : 'en';
  } catch {
    return 'nb';
  }
}

export const lang = phoneLanguage();
export const t: Strings = lang === 'nb' ? nb : en;
export const dateLocale = lang === 'nb' ? nbDate : enGB;
export type { Strings };
