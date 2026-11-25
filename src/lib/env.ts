import { z } from 'zod';

/**
 * Public, build-time configuration. Only the Supabase URL and the publishable
 * (anon) key may ever be shipped in the app. Both are safe to expose because
 * every authorisation decision is enforced by RLS in the database.
 *
 * The service-role / secret key must NEVER be set as an EXPO_PUBLIC_ variable:
 * anything prefixed EXPO_PUBLIC_ is inlined into the JavaScript bundle.
 */
const schema = z.object({
  supabaseUrl: z
    .url()
    .refine(
      (u) => u.startsWith('https://') || (__DEV__ && /^http:\/\/(127\.0\.0\.1|localhost|10\.0\.2\.2)(:\d+)?/.test(u)),
      'Supabase-URL må bruke https (http er bare tillatt mot lokal utvikling)',
    ),
  supabaseKey: z
    .string()
    .min(20)
    .refine((k) => !k.startsWith('sb_secret_') && !isServiceRoleJwt(k), 'Hemmelig nøkkel funnet i appen. Bruk publishable/anon-nøkkelen.'),
});

function isServiceRoleJwt(key: string): boolean {
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(globalThis.atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

export const env = schema.parse({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_KEY,
});
