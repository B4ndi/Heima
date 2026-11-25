import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { t } from '@/i18n';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { HouseholdProvider, useHousehold } from '@/providers/HouseholdProvider';

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { session, ready } = useAuth();
  const { active, loading } = useHousehold();
  const c = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const signedIn = !!session;
  const hasHousehold = !!active;

  useEffect(() => {
    if (ready && (!signedIn || !loading)) SplashScreen.hideAsync();
  }, [ready, signedIn, loading]);

  if (!ready || (signedIn && loading)) return null;

  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: c.background },
        headerTitleStyle: { fontWeight: '600' },
        headerTintColor: c.text,
        contentStyle: { backgroundColor: c.background },
      }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="logg-inn" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !hasHousehold}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && hasHousehold}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="oppslag/[id]" options={{ title: t.tabs.board }} />
        <Stack.Screen name="ny-avstemning" options={{ presentation: 'modal', title: t.polls.new }} />
        <Stack.Screen name="ny-hendelse" options={{ presentation: 'modal', title: t.calendar.new }} />
        <Stack.Screen name="ny-oppgave" options={{ presentation: 'modal', title: t.chores.new }} />
        <Stack.Screen name="rapporter" options={{ presentation: 'modal', title: t.moderation.reportTitle }} />
        <Stack.Screen name="innstillinger" options={{ title: t.settings.title }} />
        <Stack.Screen name="ny-husstand" options={{ presentation: 'modal', title: t.settings.newHousehold }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="bli-med/[kode]" options={{ title: t.join.title, presentation: 'modal' }} />
      </Stack.Protected>

      <Stack.Screen name="personvern" options={{ title: t.settings.privacy }} />
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <HouseholdProvider>
            <RootStack />
          </HouseholdProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
