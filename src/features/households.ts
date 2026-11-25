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
    setTimezone: useMutation({
      mutationFn: async (tz: string) => {
        const { error } = await supabase.from('households').update({ timezone: schemas.timezone.parse(tz) }).eq('id', hh);
        if (error) throw error;
      },
      onSuccess: () => {
        roster();
        qc.invalidateQueries({ queryKey: ['chores', hh] });
      },
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

/**
 * Pick, shrink and upload a profile picture.
 * Re-encoding to a 512 px JPEG strips EXIF metadata (GPS position, camera
 * serial numbers) before anything leaves the phone. Each upload gets a new
 * file name so cached signed URLs never show a stale picture; the old file
 * is deleted. Storage RLS only allows writes to the user's own folder.
 */
export async function pickAndUploadAvatar(userId: string, oldPath: string | null): Promise<boolean> {
  const ImagePicker = await import('expo-image-picker');
  const { ImageManipulator, SaveFormat } = await import('expo-image-manipulator');

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
    exif: false,
  });
  if (picked.canceled || !picked.assets?.[0]) return false;

  const image = await ImageManipulator.manipulate(picked.assets[0].uri).resize({ width: 512 }).renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const bytes = await (await fetch(result.uri)).arrayBuffer();
  if (bytes.byteLength > 2 * 1024 * 1024) throw Object.assign(new Error('too large'), { code: 'image_too_large' });

  const path = `${userId}/avatar-${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage.from('avatars').upload(path, bytes, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (upErr) throw upErr;

  const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);
  if (error) throw error;
  if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
  return true;
}

export async function removeAvatar(userId: string, oldPath: string | null): Promise<void> {
  const { error } = await supabase.from('profiles').update({ avatar_path: null }).eq('id', userId);
  if (error) throw error;
  if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
}
