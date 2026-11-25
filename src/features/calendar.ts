import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startOfDay } from 'date-fns';

import { supabase } from '@/lib/supabase';
import type { CalendarEvent } from '@/lib/types';
import { schemas } from '@/lib/validation';

/** Events overlapping [from, to). Without a range: upcoming events from today. */
export function useEvents(hh: string, from?: Date, to?: Date) {
  const start = from ?? startOfDay(new Date());
  return useQuery({
    queryKey: ['events', hh, start.toISOString(), to?.toISOString() ?? null],
    queryFn: async () => {
      let q = supabase.from('events').select('*').eq('household_id', hh).gte('ends_at', start.toISOString());
      if (to) q = q.lt('starts_at', to.toISOString());
      const { data, error } = await q.order('starts_at').limit(300);
      if (error) throw error;
      return data as CalendarEvent[];
    },
  });
}

export interface EventInput {
  title: string;
  description?: string;
  location?: string;
  starts_at: Date;
  ends_at: Date;
  all_day: boolean;
}

export function useEventMutations(hh: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['events', hh] });
  const row = (e: EventInput) => ({
    title: schemas.eventTitle.parse(e.title),
    description: schemas.eventDescription.parse(e.description) || null,
    location: schemas.eventLocation.parse(e.location) || null,
    starts_at: e.starts_at.toISOString(),
    ends_at: e.ends_at.toISOString(),
    all_day: e.all_day,
  });
  return {
    create: useMutation({
      mutationFn: async (e: EventInput) => {
        const { error } = await supabase.from('events').insert({ household_id: hh, ...row(e) });
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...e }: EventInput & { id: string }) => {
        const { error } = await supabase.from('events').update(row(e)).eq('id', id);
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from('events').delete().eq('id', id);
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
  };
}

export function useEvent(id: string | undefined) {
  return useQuery({
    queryKey: ['events', 'one', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('events').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as CalendarEvent;
    },
  });
}
