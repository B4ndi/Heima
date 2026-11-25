import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Chore, Recurrence } from '@/lib/types';
import { schemas } from '@/lib/validation';

export function useChores(hh: string) {
  return useQuery({
    queryKey: ['chores', hh],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('chores')
        .select('*')
        .eq('household_id', hh)
        .eq('archived', false)
        .order('next_due');
      if (error) throw error;
      return data as Chore[];
    },
  });
}

export function choreAssignee(c: Chore): string | null {
  return c.rotation.length ? c.rotation[c.rotation_index % c.rotation.length] : null;
}

export function useChoreMutations(hh: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['chores', hh] });
  return {
    create: useMutation({
      mutationFn: async (input: { title: string; recurrence: Recurrence; rotation: string[]; next_due: string }) => {
        const { error } = await supabase.from('chores').insert({
          household_id: hh,
          title: schemas.choreTitle.parse(input.title),
          recurrence: input.recurrence,
          rotation: input.rotation,
          next_due: input.next_due,
        });
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...input }: { id: string; title: string; recurrence: Recurrence; rotation: string[]; next_due: string }) => {
        const { error } = await supabase
          .from('chores')
          .update({
            title: schemas.choreTitle.parse(input.title),
            recurrence: input.recurrence,
            rotation: input.rotation,
            next_due: input.next_due,
          })
          .eq('id', id);
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    complete: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.rpc('complete_chore', { p_chore: id });
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from('chores').delete().eq('id', id);
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
  };
}

export function useChore(id: string | undefined) {
  return useQuery({
    queryKey: ['chores', 'one', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('chores').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as Chore;
    },
  });
}
