import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Poll, PollVote } from '@/lib/types';
import { schemas } from '@/lib/validation';

export function usePolls(hh: string) {
  return useQuery({
    queryKey: ['polls', hh],
    queryFn: async () => {
      const [{ data: polls, error: e1 }, { data: votes, error: e2 }] = await Promise.all([
        supabase
          .from('polls')
          .select('*, poll_options(id, poll_id, label, position)')
          .eq('household_id', hh)
          .order('created_at', { ascending: false })
          .limit(50),
        // RLS returns only your own vote rows for anonymous polls
        supabase.from('poll_votes').select('poll_id, option_id, user_id').eq('household_id', hh),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { polls: (polls ?? []) as Poll[], votes: (votes ?? []) as PollVote[] };
    },
  });
}

export function usePollResults(pollId: string) {
  return useQuery({
    queryKey: ['poll_results', pollId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('poll_results', { p_poll: pollId });
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as { option_id: string; votes: number }[]) map[r.option_id] = Number(r.votes);
      return map;
    },
  });
}

export function usePollMutations(hh: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['polls', hh] });
    qc.invalidateQueries({ queryKey: ['poll_results'] });
  };
  return {
    create: useMutation({
      mutationFn: async (input: { question: string; options: string[]; multiple: boolean; anonymous: boolean }) => {
        const options = schemas.pollOptions.parse(input.options.filter((o) => o.trim()));
        const { error } = await supabase.rpc('create_poll', {
          p_household: hh,
          p_question: schemas.pollQuestion.parse(input.question),
          p_options: options,
          p_multiple_choice: input.multiple,
          p_anonymous: input.anonymous,
        });
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    vote: useMutation({
      mutationFn: async ({ pollId, optionIds }: { pollId: string; optionIds: string[] }) => {
        const { error } = await supabase.rpc('cast_vote', { p_poll: pollId, p_option_ids: optionIds });
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    close: useMutation({
      mutationFn: async (pollId: string) => {
        const { error } = await supabase.rpc('close_poll', { p_poll: pollId });
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (pollId: string) => {
        const { error } = await supabase.from('polls').delete().eq('id', pollId);
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
  };
}
