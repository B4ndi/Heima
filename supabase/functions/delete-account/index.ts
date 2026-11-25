// Delete the caller's own account (GDPR art. 17).
//
// Security:
//  * The caller is identified ONLY from their verified JWT, never from the
//    request body, so a user can delete nobody but themselves.
//  * The service-role key is read from the function's environment (set by
//    Supabase) and never leaves the server.
//  * Household handover (promote a successor admin, drop empty households) is
//    done by the before-delete trigger on auth.users in the database, so it
//    is identical however an account is deleted.
//  * Requires an explicit confirmation word in the body (defence against CSRF-
//    like accidental calls) and a session issued within the last 24 hours.
import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return json(401, { error: 'unauthorized' });

  let body: { confirm?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'bad_request' });
  }
  if (body.confirm !== 'SLETT') return json(400, { error: 'confirmation_required' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Verifies the JWT signature and expiry with Supabase Auth.
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return json(401, { error: 'unauthorized' });

  const lastSignIn = data.user.last_sign_in_at ? Date.parse(data.user.last_sign_in_at) : 0;
  if (Date.now() - lastSignIn > 24 * 60 * 60 * 1000) {
    return json(403, { error: 'reauthentication_required' });
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(data.user.id);
  if (delErr) {
    console.error('delete-account failed', { code: delErr.code });   // no PII in logs
    return json(500, { error: 'delete_failed' });
  }
  return json(200, { ok: true });
});
