import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Block, Report, ReportAction, ReportReason } from '@/lib/types';
import { schemas } from '@/lib/validation';

export const REPORT_REASONS: ReportReason[] = ['harassment', 'hate', 'sexual', 'violence', 'spam', 'other'];

// reporter_id is not granted to clients, so never select '*'.
const REPORT_COLUMNS =
  'id, household_id, reported_user_id, post_id, comment_id, reason, details, status, created_at, posts(body), post_comments(body, post_id)';

/** Open reports an admin may act on (RLS hides reports about the admin themself). */
export function useReports(hh: string, enabled: boolean) {
  return useQuery({
    queryKey: ['reports', hh],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_reports')
        .select(REPORT_COLUMNS)
        .eq('household_id', hh)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as Report[];
    },
  });
}

/** Housemates the current user has blocked (only the blocker can see these rows). */
export function useBlocks(hh: string) {
  return useQuery({
    queryKey: ['blocks', hh],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_blocks')
        .select('blocked_id, created_at')
        .eq('household_id', hh)
        .order('created_at');
      if (error) throw error;
      return data as Block[];
    },
  });
}

export function useModeration(hh: string) {
  const qc = useQueryClient();
  const refreshContent = () => {
    qc.invalidateQueries({ queryKey: ['posts', hh] });
    qc.invalidateQueries({ queryKey: ['comments'] });
  };
  return {
    report: useMutation({
      mutationFn: async (input: { kind: 'post' | 'comment'; id: string; reason: ReportReason; details: string }) => {
        const details = schemas.reportDetails.parse(input.details);
        const { error } = await supabase.rpc('report_content', {
          p_kind: input.kind,
          p_target: input.id,
          p_reason: input.reason,
          p_details: details || null,
        });
        if (error) throw error;
      },
    }),
    resolve: useMutation({
      mutationFn: async ({ id, action }: { id: string; action: ReportAction }) => {
        const { error } = await supabase.rpc('resolve_report', { p_report: id, p_action: action });
        if (error) throw error;
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['reports', hh] });
        qc.invalidateQueries({ queryKey: ['roster', hh] });
        refreshContent();
      },
    }),
    block: useMutation({
      mutationFn: async (userId: string) => {
        const { error } = await supabase.from('user_blocks').insert({ household_id: hh, blocked_id: userId });
        if (error && error.code !== '23505') throw error; // already blocked is fine
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['blocks', hh] });
        refreshContent();
      },
    }),
    unblock: useMutation({
      mutationFn: async (userId: string) => {
        const { error } = await supabase.from('user_blocks').delete().eq('household_id', hh).eq('blocked_id', userId);
        if (error) throw error;
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['blocks', hh] });
        refreshContent();
      },
    }),
  };
}
