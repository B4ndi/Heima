import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';

import { MeButton } from '@/components/MeButton';
import { Button, Card, Chip, Empty, ErrorText, FeatureHeader, IconButton, Loading, Row, Screen, Txt, useColors, useFeatureColors } from '@/components/ui';
import { useShoppingItems, useShoppingLists, useShoppingMutations } from '@/features/shopping';
import { t } from '@/i18n';
import { userMessage } from '@/lib/errors';
import type { ShoppingItem } from '@/lib/types';
import { useHousehold, useHouseholdId } from '@/providers/HouseholdProvider';

export default function Shopping() {
  const hh = useHouseholdId();
  const c = useColors();
  const f = useFeatureColors('shopping');
  const { nameOf } = useHousehold();
  const lists = useShoppingLists(hh);
  const [selected, setListId] = useState<string | null>(null);
  // fall back to the first list if nothing (or a deleted list) is selected
  const listId = lists.data?.some((l) => l.id === selected) ? selected : (lists.data?.[0]?.id ?? null);
  const items = useShoppingItems(listId);
  const m = useShoppingMutations(hh);
  const [text, setText] = useState('');
  const [qty, setQty] = useState('');
  const [newList, setNewList] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string; quantity: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(userMessage(e));
    }
  };

  async function addItem() {
    if (!listId || !text.trim()) return;
    await run(async () => {
      await m.addItem.mutateAsync({ listId, text, quantity: qty });
      setText('');
      setQty('');
    });
  }

  const open = items.data?.filter((i) => !i.checked) ?? [];
  const done = items.data?.filter((i) => i.checked) ?? [];

  const itemRow = (i: ShoppingItem) =>
    editing?.id === i.id ? (
      <View key={i.id} style={{ gap: 8, paddingVertical: 6 }}>
        <Row>
          <TextInput
            value={editing.text}
            onChangeText={(v) => setEditing({ ...editing, text: v })}
            aria-label={t.common.edit}
            maxLength={120}
            autoFocus
            style={{ flex: 1, minWidth: 0, backgroundColor: c.field, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: c.text, fontSize: 16 }}
          />
          <TextInput
            value={editing.quantity}
            onChangeText={(v) => setEditing({ ...editing, quantity: v })}
            placeholder={t.shopping.quantity}
            placeholderTextColor={c.textSecondary}
            aria-label={t.shopping.quantity}
            maxLength={30}
            style={{ width: 72, backgroundColor: c.field, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: c.text, fontSize: 16 }}
          />
        </Row>
        <Row>
          <Button
            title={t.common.save}
            small
            onPress={() =>
              run(async () => {
                await m.editItem.mutateAsync({ id: i.id, listId: i.list_id, text: editing.text, quantity: editing.quantity });
                setEditing(null);
              })
            }
          />
          <Button title={t.common.cancel} small variant="ghost" onPress={() => setEditing(null)} />
          <View style={{ flex: 1 }} />
          <IconButton icon="trash-outline" label={t.common.delete} onPress={() => m.removeItem.mutate({ id: i.id, listId: i.list_id })} />
        </Row>
      </View>
    ) : (
      <Row key={i.id} style={{ paddingVertical: 8, gap: 12 }}>
        <Pressable
          role="checkbox"
          aria-checked={i.checked}
          aria-label={i.text}
          hitSlop={8}
          onPress={() => m.toggle.mutate({ item: i })}
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            borderWidth: 2,
            borderColor: i.checked ? f.fg : c.border,
            backgroundColor: i.checked ? f.fg : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          {i.checked ? <Ionicons name="checkmark" size={16} color={f.onFg} /> : null}
        </Pressable>
        <Pressable
          style={{ flex: 1 }}
          role="button"
          aria-label={`${t.common.edit}: ${i.text}`}
          onPress={() => setEditing({ id: i.id, text: i.text, quantity: i.quantity ?? '' })}>
          <Txt style={i.checked ? { textDecorationLine: 'line-through', color: c.textSecondary } : { fontSize: 17 }}>{i.text}</Txt>
          {i.checked && i.checked_by ? <Txt variant="small">{t.shopping.checkedBy(nameOf(i.checked_by))}</Txt> : null}
        </Pressable>
        {i.quantity ? (
          <View style={{ backgroundColor: f.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Txt style={{ color: f.fg, fontWeight: '600', fontSize: 13 }}>{i.quantity}</Txt>
          </View>
        ) : null}
      </Row>
    );

  return (
    <Screen feature="shopping">
      <FeatureHeader icon="cart" title={t.tabs.shopping} subtitle={open.length ? t.shopping.remaining(open.length) : undefined} right={<MeButton />} />

      {lists.isLoading ? <Loading /> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {lists.data?.map((l) => <Chip key={l.id} label={l.name} selected={l.id === listId} onPress={() => setListId(l.id)} />)}
        <Chip label={`+ ${t.shopping.newList}`} selected={false} onPress={() => setNewList('')} />
      </ScrollView>

      {newList !== null ? (
        <Card>
          <TextInput
            value={newList}
            onChangeText={setNewList}
            placeholder={t.shopping.listName}
            placeholderTextColor={c.textSecondary}
            aria-label={t.shopping.listName}
            maxLength={60}
            autoFocus
            style={{ backgroundColor: c.field, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: c.text, fontSize: 16 }}
          />
          <Row>
            <Button
              title={t.common.create}
              small
              disabled={!newList.trim()}
              onPress={() =>
                run(async () => {
                  const id = await m.createList.mutateAsync(newList);
                  setNewList(null);
                  setListId(id);
                })
              }
            />
            <Button title={t.common.cancel} small variant="ghost" onPress={() => setNewList(null)} />
          </Row>
        </Card>
      ) : null}

      {lists.data?.length === 0 && newList === null ? <Empty icon="cart-outline" text={t.shopping.noLists} /> : null}

      {listId ? (
        <>
          {/* Quick-add bar */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 18, paddingLeft: 16, paddingRight: 6, paddingVertical: 6, gap: 8 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t.shopping.itemPlaceholder}
              placeholderTextColor={c.textSecondary}
              aria-label={t.shopping.itemPlaceholder}
              maxLength={120}
              onSubmitEditing={addItem}
              returnKeyType="done"
              style={{ flex: 1, minWidth: 0, color: c.text, fontSize: 16, paddingVertical: 8 }}
            />
            <TextInput
              value={qty}
              onChangeText={setQty}
              placeholder={t.shopping.quantity}
              placeholderTextColor={c.textSecondary}
              aria-label={t.shopping.quantity}
              maxLength={30}
              style={{ width: 56, minWidth: 0, color: c.text, fontSize: 15, paddingVertical: 8 }}
            />
            <Pressable
              role="button"
              aria-label={t.common.add}
              onPress={addItem}
              style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: text.trim() ? f.fg : c.field }}>
              <Ionicons name="add" size={22} color={text.trim() ? f.onFg : c.textSecondary} />
            </Pressable>
          </View>
          <ErrorText message={error} />

          <Card style={{ gap: 0, paddingVertical: 10 }}>
            {items.data && open.length === 0 && done.length === 0 ? <Empty text={t.shopping.empty} /> : null}
            {open.map(itemRow)}
            {done.length > 0 ? (
              <>
                {open.length > 0 ? <View style={{ height: 1, backgroundColor: c.border, marginVertical: 8 }} /> : null}
                {done.map(itemRow)}
                <Button title={t.shopping.clearChecked} small variant="ghost" onPress={() => m.clearChecked.mutate(listId)} />
              </>
            ) : null}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
