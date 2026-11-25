import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import type { ShoppingItem, ShoppingList } from '@/lib/types';
import { schemas } from '@/lib/validation';

export function useShoppingLists(hh: string) {
  return useQuery({
    queryKey: ['shopping_lists', hh],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_lists')
        .select('id, household_id, name, archived')
        .eq('household_id', hh)
        .eq('archived', false)
        .order('created_at');
      if (error) throw error;
      return data as ShoppingList[];
    },
  });
}

export function useShoppingItems(listId: string | null) {
  return useQuery({
    queryKey: ['shopping_items', listId],
    enabled: !!listId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shopping_items')
        .select('*')
        .eq('list_id', listId!)
        .order('checked')
        .order('created_at')
        .limit(300);
      if (error) throw error;
      return data as ShoppingItem[];
    },
  });
}

export function useShoppingMutations(hh: string) {
  const qc = useQueryClient();
  const items = (listId: string) => qc.invalidateQueries({ queryKey: ['shopping_items', listId] });
  return {
    createList: useMutation({
      mutationFn: async (name: string) => {
        const { data, error } = await supabase
          .from('shopping_lists')
          .insert({ household_id: hh, name: schemas.listName.parse(name) })
          .select('id')
          .single();
        if (error) throw error;
        return data.id as string;
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping_lists', hh] }),
    }),
    archiveList: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from('shopping_lists').update({ archived: true }).eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ['shopping_lists', hh] }),
    }),
    addItem: useMutation({
      mutationFn: async ({ listId, text, quantity }: { listId: string; text: string; quantity?: string }) => {
        const q = schemas.quantity.parse(quantity);
        const { error } = await supabase.from('shopping_items').insert({
          list_id: listId,
          household_id: hh,
          text: schemas.itemText.parse(text),
          quantity: q ? q : null,
        });
        if (error) throw error;
      },
      onSuccess: (_d, v) => items(v.listId),
    }),
    toggle: useMutation({
      mutationFn: async ({ item }: { item: ShoppingItem }) => {
        const { error } = await supabase.from('shopping_items').update({ checked: !item.checked }).eq('id', item.id);
        if (error) throw error;
      },
      // optimistic update keeps ticking items off snappy in the shop
      onMutate: async ({ item }) => {
        const key = ['shopping_items', item.list_id];
        await qc.cancelQueries({ queryKey: key });
        const prev = qc.getQueryData<ShoppingItem[]>(key);
        qc.setQueryData<ShoppingItem[]>(key, (old) => old?.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)));
        return { prev, key };
      },
      onError: (_e, _v, ctx) => ctx && qc.setQueryData(ctx.key, ctx.prev),
      onSettled: (_d, _e, v) => items(v.item.list_id),
    }),
    editItem: useMutation({
      mutationFn: async ({ id, text, quantity }: { id: string; listId: string; text: string; quantity?: string }) => {
        const q = schemas.quantity.parse(quantity);
        const { error } = await supabase
          .from('shopping_items')
          .update({ text: schemas.itemText.parse(text), quantity: q ? q : null })
          .eq('id', id);
        if (error) throw error;
      },
      onSuccess: (_d, v) => items(v.listId),
    }),
    removeItem: useMutation({
      mutationFn: async ({ id }: { id: string; listId: string }) => {
        const { error } = await supabase.from('shopping_items').delete().eq('id', id);
        if (error) throw error;
      },
      onSuccess: (_d, v) => items(v.listId),
    }),
    clearChecked: useMutation({
      mutationFn: async (listId: string) => {
        const { error } = await supabase.from('shopping_items').delete().eq('list_id', listId).eq('checked', true);
        if (error) throw error;
      },
      onSuccess: (_d, listId) => items(listId),
    }),
  };
}

/** Number of unchecked items across all lists in the household (for the home screen). */
export function useOpenItemCount(hh: string) {
  return useQuery({
    queryKey: ['shopping_items', 'open-count', hh],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('shopping_items')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', hh)
        .eq('checked', false);
      if (error) throw error;
      return count ?? 0;
    },
  });
}
