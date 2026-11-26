import { Platform } from 'react-native';

// Light, airy base palette: off-white background, white cards without borders,
// soft shadows, one calm green as the brand colour.
export const Colors = {
  light: {
    text: '#1F2328',
    textSecondary: '#6B7079',
    background: '#F6F7F5',
    card: '#FFFFFF',
    border: '#ECEEEA',
    field: '#F2F3F1',
    primary: '#2A7F5F',
    primaryText: '#FFFFFF',
    accent: '#E5F3EC',
    danger: '#B42318',
    dangerBg: '#FDECEA',
  },
  dark: {
    text: '#EEF1EE',
    textSecondary: '#9AA39E',
    background: '#111413',
    card: '#1A1E1C',
    border: '#262B29',
    field: '#222725',
    primary: '#6FD0A6',
    primaryText: '#0B1F16',
    accent: '#1C2B25',
    danger: '#F2B8B5',
    dangerBg: '#3A1D1B',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

/**
 * Each part of the app has its own colour so the tabs feel distinct.
 * `fg` is for icons, accents and filled buttons (white text on top passes
 * WCAG AA); `bg` is a soft tint for headers and highlights.
 */
export type Feature = 'home' | 'board' | 'polls' | 'shopping' | 'calendar' | 'chores' | 'zoot';

export const FeatureColors: Record<'light' | 'dark', Record<Feature, { fg: string; bg: string; onFg: string }>> = {
  light: {
    home: { fg: '#2A7F5F', bg: '#E5F3EC', onFg: '#FFFFFF' },
    board: { fg: '#2F6FD6', bg: '#E8F0FD', onFg: '#FFFFFF' },
    polls: { fg: '#7650D6', bg: '#F0EBFC', onFg: '#FFFFFF' },
    shopping: { fg: '#C2570C', bg: '#FDF0E6', onFg: '#FFFFFF' },
    calendar: { fg: '#C23A6B', bg: '#FCEAF1', onFg: '#FFFFFF' },
    chores: { fg: '#0E7C86', bg: '#E3F4F5', onFg: '#FFFFFF' },
    zoot: { fg: '#A6E35A', bg: '#2C4C1D', onFg: '#10210A' },
  },
  dark: {
    home: { fg: '#6FD0A6', bg: '#1C2B25', onFg: '#0B1F16' },
    board: { fg: '#8DB4F5', bg: '#1B2433', onFg: '#0B1627' },
    polls: { fg: '#B9A2F5', bg: '#241E33', onFg: '#170F2B' },
    shopping: { fg: '#F5A86B', bg: '#2E2218', onFg: '#2A1505' },
    calendar: { fg: '#F29BBB', bg: '#2E1B23', onFg: '#2A0B17' },
    chores: { fg: '#6CCFD8', bg: '#16292B', onFg: '#05201F' },
    zoot: { fg: '#A6E35A', bg: '#2C4C1D', onFg: '#10210A' },
  },
};

/** Easter egg: chores called "Zoot" or "Påfyll" get a dark green 420 card (same in light and dark mode). */
export const Zoot = {
  card: '#1D3512',
  text: '#EAFBD7',
  muted: '#B9D99A',
  accent: '#A6E35A',
  leaf: '#4E8A2A',
  overdue: '#FFB4A9',
} as const;

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 32 } as const;
export const Radius = { sm: 12, md: 18, lg: 24, pill: 999 } as const;
export const Mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export const Shadow = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 4 } },
  android: { elevation: 1 },
  default: { boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)' },
}) as object;
