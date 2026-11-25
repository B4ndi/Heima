import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startOfDay } from 'date-fns';

import { supabase } from '@/lib/supabase';
import type { CalendarEvent } from '@/lib/types';
import { schemas } from '@/lib/validation';

export function useEvents(hh: string) {
  return useQuery({
    queryKey: ['events', hh],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('household_id', hh)
        .gte('ends_at', startOfDay(new Date()).toISOString())
        .order('starts_at')
        .limit(200);
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
  return {
    create: useMutation({
      mutationFn: async (e: EventInput) => {
        const { error } = await supabase.from('events').insert({
          household_id: hh,
          title: schemas.eventTitle.parse(e.title),
          description: schemas.eventDescription.parse(e.description) || null,
          location: schemas.eventLocation.parse(e.location) || null,
          starts_at: e.starts_at.toISOString(),
          ends_at: e.ends_at.toISOString(),
          all_day: e.all_day,
        });
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
