import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useColorScheme, type ColorValue } from 'react-native';

import { useColors, type IconName } from '@/components/ui';
import { FeatureColors, type Feature } from '@/constants/theme';
import { t } from '@/i18n';

const TABS: { name: string; feature: Feature; title: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'index', feature: 'home', title: t.tabs.home, icon: 'home-outline', iconActive: 'home' },
  { name: 'oppslag', feature: 'board', title: t.tabs.board, icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
  { name: 'avstemninger', feature: 'polls', title: t.tabs.polls, icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  { name: 'handleliste', feature: 'shopping', title: t.tabs.shopping, icon: 'cart-outline', iconActive: 'cart' },
  { name: 'kalender', feature: 'calendar', title: t.tabs.calendar, icon: 'calendar-outline', iconActive: 'calendar' },
  { name: 'vaskeliste', feature: 'chores', title: t.tabs.chores, icon: 'sparkles-outline', iconActive: 'sparkles' },
];

export default function TabsLayout() {
  const c = useColors();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  return (
    <Tabs
      screenOptions={{
        headerShown: false, // each tab draws its own coloured header
        tabBarInactiveTintColor: c.textSecondary,
        tabBarStyle: { backgroundColor: c.card, borderTopWidth: 0, elevation: 0 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        sceneStyle: { backgroundColor: c.background },
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarActiveTintColor: FeatureColors[scheme][tab.feature].fg,
            tabBarIcon: ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
              <Ionicons name={focused ? tab.iconActive : tab.icon} color={color as string} size={size - 2} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
