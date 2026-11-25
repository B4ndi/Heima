import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { Comment, Post } from '@/lib/types';
import { schemas } from '@/lib/validation';

export const REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '🙏'] as const;
export type Reaction = { emoji: string; user_id: string };
export type PostWithCount = Post & { post_comments: { count: number }[]; post_reactions: Reaction[] };

export function usePosts(hh: string) {
  return useQuery({
    queryKey: ['posts', hh],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('*, post_comments(count), post_reactions(emoji, user_id)')
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
    edit: useMutation({
      mutationFn: async ({ id, body }: { id: string; body: string }) => {
        const { error } = await supabase.from('posts').update({ body: schemas.postBody.parse(body) }).eq('id', id);
        if (error) throw error;
      },
      onSuccess: invalidate,
    }),
    react: useMutation({
      mutationFn: async ({ postId, emoji, mine }: { postId: string; emoji: string; mine: boolean }) => {
        // Toggle: RLS only lets you insert/delete your own reaction.
        const { error } = mine
          ? await supabase.from('post_reactions').delete().eq('post_id', postId).eq('emoji', emoji)
          : await supabase.from('post_reactions').insert({ post_id: postId, household_id: hh, emoji });
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
