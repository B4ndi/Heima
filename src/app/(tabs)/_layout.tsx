import { Ionicons } from '@expo/vector-icons';
import { Tabs, router } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { IconButton, useColors } from '@/components/ui';
import { nb } from '@/i18n/nb';
import { useHousehold } from '@/providers/HouseholdProvider';

type IconName = ComponentProps<typeof Ionicons>['name'];

export default function TabsLayout() {
  const c = useColors();
  const { active } = useHousehold();

  const tab = (title: string, icon: IconName) => ({
    title,
    tabBarLabel: title,
    tabBarIcon: ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={icon} color={color as string} size={size} />,
  });

  return (
    <Tabs
      screenOptions={{
        headerTitle: active?.households.name ?? nb.appName,
        headerRight: () => (
          <IconButton icon="settings-outline" label={nb.settings.title} onPress={() => router.push('/innstillinger')} />
        ),
        headerRightContainerStyle: { paddingRight: 16 },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textSecondary,
        sceneStyle: { backgroundColor: c.background },
      }}>
      <Tabs.Screen name="index" options={tab(nb.tabs.board, 'chatbubbles-outline')} />
      <Tabs.Screen name="avstemninger" options={tab(nb.tabs.polls, 'stats-chart-outline')} />
      <Tabs.Screen name="handleliste" options={tab(nb.tabs.shopping, 'cart-outline')} />
      <Tabs.Screen name="kalender" options={tab(nb.tabs.calendar, 'calendar-outline')} />
      <Tabs.Screen name="vaskeliste" options={tab(nb.tabs.chores, 'checkbox-outline')} />
    </Tabs>
  );
}
