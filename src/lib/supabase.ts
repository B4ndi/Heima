import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env } from './env';
import { secureSessionStorage } from './secureStorage';

export const supabase = createClient(env.supabaseUrl, env.supabaseKey, {
  auth: {
    storage: secureSessionStorage,
    storageKey: 'heima.auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // sign-in uses OTP codes, never tokens in URLs
    flowType: 'pkce',
  },
  global: {
    headers: { 'x-client-info': 'heima-app' },
  },
});

// Only refresh tokens while the app is in the foreground.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
