import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button, Card, Chip, Empty, ErrorText, IconButton, Input, Loading, Row, Screen, Txt, useColors } from '@/components/ui';
import { useShoppingItems, useShoppingLists, useShoppingMutations } from '@/features/shopping';
import { nb } from '@/i18n/nb';
import { userMessage } from '@/lib/errors';
import { useHousehold, useHouseholdId } from '@/providers/HouseholdProvider';

export default function Shopping() {
  const hh = useHouseholdId();
  const c = useColors();
  const { nameOf } = useHousehold();
  const lists = useShoppingLists(hh);
  const [selected, setListId] = useState<string | null>(null);
  // fall back to the first list if nothing (or a deleted list) is selected
  const listId = lists.data?.some((l) => l.id === selected) ? selected : (lists.data?.[0]?.id ?? null);
  const items = useShoppingItems(listId);
  const m = useShoppingMutations(hh);
  const [text, setText] = useState('');
  const [qty, setQty] = useState('');
  const [newList, setNewList] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function addItem() {
    if (!listId) return;
    setError(null);
    try {
      await m.addItem.mutateAsync({ listId, text, quantity: qty });
      setText('');
      setQty('');
    } catch (e) {
      setError(userMessage(e));
    }
  }

  async function addList() {
    setError(null);
    try {
      const id = await m.createList.mutateAsync(newList);
      setNewList('');
      setListId(id);
    } catch (e) {
      setError(userMessage(e));
    }
  }

  const checkedCount = items.data?.filter((i) => i.checked).length ?? 0;

  return (
    <Screen edges={[]}>
      {lists.isLoading ? <Loading /> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {lists.data?.map((l) => (
          <Chip key={l.id} label={l.name} selected={l.id === listId} onPress={() => setListId(l.id)} />
        ))}
      </ScrollView>

      <Row>
        <Input value={newList} onChangeText={setNewList} placeholder={nb.shopping.listName} maxLength={60} containerStyle={{ flex: 1 }} />
        <Button title={nb.shopping.newList} small variant="secondary" onPress={addList} disabled={!newList.trim()} />
      </Row>

      {lists.data?.length === 0 ? <Empty text={nb.shopping.noLists} /> : null}

      {listId ? (
        <Card>
          <Row>
            <Input
              value={text}
              onChangeText={setText}
              placeholder={nb.shopping.itemPlaceholder}
              maxLength={120}
              onSubmitEditing={addItem}
              containerStyle={{ flex: 1 }}
            />
            <Input value={qty} onChangeText={setQty} placeholder={nb.shopping.quantity} maxLength={30} containerStyle={{ width: 76 }} />
            <IconButton icon="add-circle" label={nb.common.add} color={c.primary} onPress={addItem} />
          </Row>
          <ErrorText message={error} />

          {items.data?.length === 0 ? <Empty text={nb.shopping.empty} /> : null}
          {items.data?.map((i) => (
            <Row key={i.id} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}
                onPress={() => m.toggle.mutate({ item: i })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: i.checked }}>
                <Ionicons name={i.checked ? 'checkbox' : 'square-outline'} size={22} color={i.checked ? c.primary : c.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Txt style={i.checked ? { textDecorationLine: 'line-through', color: c.textSecondary } : undefined}>
                    {i.text}
                    {i.quantity ? ` · ${i.quantity}` : ''}
                  </Txt>
                  {i.checked && i.checked_by ? <Txt variant="small">{nb.shopping.checkedBy(nameOf(i.checked_by))}</Txt> : null}
                </View>
              </Pressable>
              <IconButton icon="close" label={nb.common.delete} onPress={() => m.removeItem.mutate({ id: i.id, listId: i.list_id })} />
            </Row>
          ))}
          {checkedCount > 0 ? (
            <Button title={nb.shopping.clearChecked} small variant="ghost" onPress={() => m.clearChecked.mutate(listId)} />
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}
