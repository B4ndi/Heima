import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Invite, RpcResult } from '@/lib/types';
import { schemas } from '@/lib/validation';

export function useInvites(hh: string, enabled: boolean) {
  return useQuery({
    queryKey: ['invites', hh],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invites')
        .select('id, household_id, created_at, expires_at, max_uses, uses, requires_approval, revoked_at')
        .eq('household_id', hh)
        .is('revoked_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as Invite[]).filter((i) => i.uses < i.max_uses);
    },
  });
}

export async function createHousehold(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_household', { p_name: schemas.householdName.parse(name) });
  if (error) throw error;
  return data as string;
}

export async function previewInvite(code: string): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('preview_invite', { p_code: schemas.inviteCode.parse(code) });
  if (error) throw error;
  return data as RpcResult;
}

export async function joinHousehold(code: string): Promise<RpcResult> {
  const { data, error } = await supabase.rpc('join_household', { p_code: schemas.inviteCode.parse(code) });
  if (error) throw error;
  return data as RpcResult;
}

export function useHouseholdAdmin(hh: string) {
  const qc = useQueryClient();
  const roster = () => {
    qc.invalidateQueries({ queryKey: ['roster', hh] });
    qc.invalidateQueries({ queryKey: ['memberships'] });
  };
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw error;
    return data;
  };
  return {
    createInvite: useMutation({
      mutationFn: async (requiresApproval: boolean) => {
        const rows = (await rpc('create_invite', {
          p_household: hh,
          p_max_uses: 5,
          p_valid_hours: 48,
          p_requires_approval: requiresApproval,
        })) as { invite_id: string; code: string; expires_at: string }[];
        return rows[0];
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ['invites', hh] }),
    }),
    revokeInvite: useMutation({
      mutationFn: (id: string) => rpc('revoke_invite', { p_invite: id }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['invites', hh] }),
    }),
    approve: useMutation({ mutationFn: (u: string) => rpc('approve_member', { p_household: hh, p_user: u }), onSuccess: roster }),
    remove: useMutation({ mutationFn: (u: string) => rpc('remove_member', { p_household: hh, p_user: u }), onSuccess: roster }),
    setRole: useMutation({
      mutationFn: ({ user, role }: { user: string; role: 'admin' | 'member' }) =>
        rpc('set_member_role', { p_household: hh, p_user: user, p_role: role }),
      onSuccess: roster,
    }),
    leave: useMutation({ mutationFn: () => rpc('leave_household', { p_household: hh }), onSuccess: roster }),
    rename: useMutation({
      mutationFn: async (name: string) => {
        const { error } = await supabase.from('households').update({ name: schemas.householdName.parse(name) }).eq('id', hh);
        if (error) throw error;
      },
      onSuccess: roster,
    }),
  };
}

export async function updateDisplayName(userId: string, name: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: schemas.displayName.parse(name) })
    .eq('id', userId);
  if (error) throw error;
}

export async function exportMyData(): Promise<unknown> {
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) throw error;
  return data;
}

export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST', body: { confirm: 'SLETT' } });
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' });
}
