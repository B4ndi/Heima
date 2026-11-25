import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { t } from '@/i18n';
import { supabase } from '@/lib/supabase';
import type { Household, Member, Profile } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

// Only the *id* of the selected household is stored (not sensitive).
const ACTIVE_KEY = 'heima.activeHousehold';

interface Membership extends Member {
  households: Household;
}

interface HouseholdState {
  memberships: Membership[];
  loading: boolean;
  active: Membership | null;
  isAdmin: boolean;
  setActive: (id: string) => void;
  members: Member[];
  profiles: Record<string, Profile>;
  nameOf: (userId: string | null | undefined) => string;
  /** Short-lived signed URL of a housemate's avatar, if they have one. */
  avatarUrl: (userId: string | null | undefined) => string | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<HouseholdState | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ACTIVE_KEY).then(setActiveId).catch(() => setActiveId(null));
  }, []);

  const membershipsQ = useQuery({
    queryKey: ['memberships', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household_members')
        .select('household_id, user_id, role, status, joined_at, households(id, name, created_at)')
        .eq('user_id', userId!)
        .order('joined_at');
      if (error) throw error;
      return (data ?? []) as unknown as Membership[];
    },
  });

  const memberships = useMemo(() => membershipsQ.data ?? [], [membershipsQ.data]);
  const activeMemberships = memberships.filter((m) => m.status === 'active' && m.households);
  const active = activeMemberships.find((m) => m.household_id === activeId) ?? activeMemberships[0] ?? null;
  const hh = active?.household_id ?? null;

  const rosterQ = useQuery({
    queryKey: ['roster', hh],
    enabled: !!hh,
    queryFn: async () => {
      const [{ data: members, error: e1 }, { data: profiles, error: e2 }] = await Promise.all([
        supabase.from('household_members').select('household_id, user_id, role, status, joined_at').eq('household_id', hh!),
        supabase.from('profiles').select('id, display_name, avatar_path'),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const map: Record<string, Profile> = {};
      for (const p of profiles ?? []) map[p.id] = p as Profile;

      // Avatars live in a private bucket; storage RLS only lets housemates
      // sign them. URLs expire after an hour and the roster refreshes before that.
      const paths = Object.values(map).map((p) => p.avatar_path).filter((x): x is string => !!x);
      const avatars: Record<string, string> = {};
      if (paths.length) {
        const { data: signed } = await supabase.storage.from('avatars').createSignedUrls(paths, 3600);
        for (const s of signed ?? []) if (s.path && s.signedUrl) avatars[s.path] = s.signedUrl;
      }
      return { members: (members ?? []) as Member[], profiles: map, avatars };
    },
    refetchInterval: 50 * 60 * 1000,
  });

  // Realtime: private, RLS-authorised channel. Payloads only say *what*
  // changed; data is always re-fetched through RLS.
  useEffect(() => {
    if (!hh) return;
    let cancelled = false;
    const channel = supabase.channel(`household:${hh}`, { config: { private: true } });
    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel
        .on('broadcast', { event: 'change' }, ({ payload }) => {
          const table = (payload as { table?: string })?.table;
          const keys: Record<string, string[][]> = {
            posts: [['posts', hh]],
            post_reactions: [['posts', hh]],
            post_comments: [['comments'], ['posts', hh]],
            polls: [['polls', hh]],
            poll_votes: [['polls', hh], ['poll_results']],
            shopping_lists: [['shopping_lists', hh]],
            shopping_items: [['shopping_items']],
            events: [['events', hh]],
            chores: [['chores', hh]],
            chore_completions: [['chores', hh]],
            household_members: [['roster', hh], ['memberships']],
          };
          for (const k of keys[table ?? ''] ?? []) qc.invalidateQueries({ queryKey: k });
        })
        .subscribe();
    })();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [hh, qc]);

  const setActive = useCallback((id: string) => {
    setActiveId(id);
    AsyncStorage.setItem(ACTIVE_KEY, id).catch(() => undefined);
  }, []);

  const value = useMemo<HouseholdState>(() => {
    const profiles = rosterQ.data?.profiles ?? {};
    return {
      memberships,
      loading: membershipsQ.isLoading || activeId === undefined,
      active,
      isAdmin: active?.role === 'admin',
      setActive,
      members: rosterQ.data?.members ?? [],
      profiles,
      avatarUrl: (id) => {
        const path = id ? profiles[id]?.avatar_path : null;
        return path ? (rosterQ.data?.avatars[path] ?? null) : null;
      },
      nameOf: (id) => (id ? (id === userId ? t.common.you : profiles[id]?.display_name ?? t.common.deletedUser) : t.common.deletedUser),
      refresh: async () => {
        await qc.invalidateQueries({ queryKey: ['memberships'] });
        await qc.invalidateQueries({ queryKey: ['roster'] });
      },
    };
  }, [memberships, membershipsQ.isLoading, activeId, active, setActive, rosterQ.data, userId, qc]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHousehold(): HouseholdState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useHousehold outside HouseholdProvider');
  return ctx;
}

/** Active household id; screens under (tabs) are only rendered when one exists. */
export function useHouseholdId(): string {
  const { active } = useHousehold();
  if (!active) throw new Error('No active household');
  return active.household_id;
}
