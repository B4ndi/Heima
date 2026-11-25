import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

import { nb } from '@/i18n/nb';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { HouseholdProvider, useHousehold } from '@/providers/HouseholdProvider';

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { session, ready } = useAuth();
  const { active, loading } = useHousehold();
  const signedIn = !!session;
  const hasHousehold = !!active;

  useEffect(() => {
    if (ready && (!signedIn || !loading)) SplashScreen.hideAsync();
  }, [ready, signedIn, loading]);

  if (!ready || (signedIn && loading)) return null;

  return (
    <Stack screenOptions={{ headerBackTitle: 'Tilbake' }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="logg-inn" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !hasHousehold}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && hasHousehold}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="oppslag/[id]" options={{ title: nb.tabs.board }} />
        <Stack.Screen name="ny-avstemning" options={{ presentation: 'modal', title: nb.polls.new }} />
        <Stack.Screen name="ny-hendelse" options={{ presentation: 'modal', title: nb.calendar.new }} />
        <Stack.Screen name="ny-oppgave" options={{ presentation: 'modal', title: nb.chores.new }} />
        <Stack.Screen name="innstillinger" options={{ title: nb.settings.title }} />
        <Stack.Screen name="ny-husstand" options={{ presentation: 'modal', title: nb.settings.newHousehold }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="bli-med/[kode]" options={{ title: nb.join.title, presentation: 'modal' }} />
      </Stack.Protected>

      <Stack.Screen name="personvern" options={{ title: nb.settings.privacy }} />
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
