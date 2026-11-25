import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable } from 'react-native';

import { Button, Card, Empty, ErrorText, IconButton, Input, Loading, Row, Screen, Txt, useColors } from '@/components/ui';
import { useBoardMutations, usePosts } from '@/features/board';
import { nb } from '@/i18n/nb';
import { fmt } from '@/lib/dates';
import { userMessage } from '@/lib/errors';
import { useUserId } from '@/providers/AuthProvider';
import { useHousehold, useHouseholdId } from '@/providers/HouseholdProvider';

export default function Board() {
  const hh = useHouseholdId();
  const me = useUserId();
  const c = useColors();
  const { nameOf, isAdmin } = useHousehold();
  const posts = usePosts(hh);
  const m = useBoardMutations(hh);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function publish() {
    setError(null);
    try {
      await m.create.mutateAsync(draft);
      setDraft('');
    } catch (e) {
      setError(userMessage(e));
    }
  }

  function confirmDelete(id: string) {
    Alert.alert(nb.board.deleteConfirm, undefined, [
      { text: nb.common.cancel, style: 'cancel' },
      { text: nb.common.delete, style: 'destructive', onPress: () => m.remove.mutate(id) },
    ]);
  }

  return (
    <Screen edges={[]}>
      <Card>
        <Input value={draft} onChangeText={setDraft} placeholder={nb.board.placeholder} multiline maxLength={4000} />
        <ErrorText message={error} />
        <Button title={nb.board.post} onPress={publish} loading={m.create.isPending} disabled={!draft.trim()} small />
      </Card>

      {posts.isLoading ? <Loading /> : null}
      {posts.error ? <ErrorText message={userMessage(posts.error)} /> : null}
      {posts.data?.length === 0 ? <Empty text={nb.board.empty} /> : null}

      {posts.data?.map((p) => {
        const count = p.post_comments?.[0]?.count ?? 0;
        return (
          <Pressable key={p.id} onPress={() => router.push({ pathname: '/oppslag/[id]', params: { id: p.id } })}>
            <Card style={p.pinned ? { borderColor: c.primary, borderWidth: 1 } : undefined}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt variant="small">
                  {p.pinned ? `📌 ${nb.board.pinned} · ` : ''}
                  {nameOf(p.author_id)} · {fmt.relative(p.created_at)}
                  {p.edited_at ? ` · ${nb.board.edited}` : ''}
                </Txt>
                <Row>
                  {isAdmin ? (
                    <IconButton
                      icon={p.pinned ? 'pin' : 'pin-outline'}
                      label={p.pinned ? nb.board.unpin : nb.board.pin}
                      onPress={() => m.pin.mutate({ id: p.id, pinned: !p.pinned })}
                    />
                  ) : null}
                  {p.author_id === me || isAdmin ? (
                    <IconButton icon="trash-outline" label={nb.common.delete} onPress={() => confirmDelete(p.id)} />
                  ) : null}
                </Row>
              </Row>
              <Txt selectable>{p.body}</Txt>
              <Txt variant="small">{nb.board.comments(count)}</Txt>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
