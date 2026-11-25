import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1B1B1F',
    textSecondary: '#5F6168',
    background: '#FAF8F5',
    card: '#FFFFFF',
    border: '#E4E1DC',
    primary: '#2F6B4F',
    primaryText: '#FFFFFF',
    danger: '#B3261E',
    accent: '#E9F2EC',
  },
  dark: {
    text: '#F2F1EE',
    textSecondary: '#A9ABB1',
    background: '#121314',
    card: '#1D1F21',
    border: '#2E3135',
    primary: '#7CC29D',
    primaryText: '#0D1F16',
    danger: '#F2B8B5',
    accent: '#1E2E25',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const Radius = { sm: 8, md: 12, lg: 16 } as const;
export const Mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
