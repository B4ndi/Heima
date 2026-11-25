import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Comment, Post } from '@/lib/types';
import { schemas } from '@/lib/validation';

type PostWithCount = Post & { post_comments: { count: number }[] };

export function usePosts(hh: string) {
  return useQuery({
    queryKey: ['posts', hh],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*, post_comments(count)')
        .eq('household_id', hh)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as PostWithCount[];
    },
  });
}

export function useComments(postId: string) {
  return useQuery({
    queryKey: ['comments', postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at')
        .limit(200);
      if (error) throw error;
      return data as Comment[];
    },
  });
}

export function useBoardMutations(hh: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['posts', hh] });
  return {
    create: useMutation({
      mutationFn: async (body: string) => {
        const { error } = await supabase.from('posts').insert({ household_id: hh, body: schemas.postBody.parse(body) });
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from('posts').delete().eq('id', id);
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    pin: useMutation({
      mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
        const { error } = await supabase.rpc('set_post_pinned', { p_post: id, p_pinned: pinned });
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    comment: useMutation({
      mutationFn: async ({ postId, body }: { postId: string; body: string }) => {
        const { error } = await supabase
          .from('post_comments')
          .insert({ post_id: postId, household_id: hh, body: schemas.commentBody.parse(body) });
        if (error) throw error;
      },
      onSuccess: (_d, v) => {
        qc.invalidateQueries({ queryKey: ['comments', v.postId] });
        invalidate();
      },
    }),
    removeComment: useMutation({
      mutationFn: async ({ id }: { id: string; postId: string }) => {
        const { error } = await supabase.from('post_comments').delete().eq('id', id);
        if (error) throw error;
      },
      onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['comments', v.postId] }),
    }),
  };
}
