import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ContentMenu } from '@/components/ContentMenu';
import { ReactionBar } from '@/components/ReactionBar';
import { Button, Card, Empty, ErrorText, IconButton, Input, Loading, Row, Screen, Txt } from '@/components/ui';
import { useBoardMutations, useComments, usePosts } from '@/features/board';
import { t } from '@/i18n';
import { fmt } from '@/lib/dates';
import { userMessage } from '@/lib/errors';
import { useUserId } from '@/providers/AuthProvider';
import { useHousehold, useHouseholdId } from '@/providers/HouseholdProvider';

export default function PostDetail() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>();
  const hh = useHouseholdId();
  const me = useUserId();
  const { nameOf, isAdmin } = useHousehold();
  const posts = usePosts(hh);
  const post = posts.data?.find((p) => p.id === id);
  const comments = useComments(id);
  const m = useBoardMutations(hh);
  const [draft, setDraft] = useState('');
  // editText stays null until the user types; the field then falls back to the post's current text.
  const [editText, setEditText] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(edit === '1');
  const [error, setError] = useState<string | null>(null);

  function closeEdit() {
    setEditText(null);
    setEditOpen(false);
  }

  async function send() {
    setError(null);
    try {
      await m.comment.mutateAsync({ postId: id, body: draft });
      setDraft('');
    } catch (e) {
      setError(userMessage(e));
    }
  }

  async function saveEdit() {
    if (editText == null) return closeEdit(); // nothing changed
    setError(null);
    try {
      await m.edit.mutateAsync({ id, body: editText });
      closeEdit();
    } catch (e) {
      setError(userMessage(e));
    }
  }

  if (!post) {
    // deleted, or its author was blocked while the screen was open
    return posts.isLoading ? (
      <Loading />
    ) : (
      <Screen feature="board" edges={['bottom']}>
        <Empty icon="chatbubbles-outline" text={t.settings.contentGone} />
      </Screen>
    );
  }
  const mine = post.author_id === me;

  return (
    <Screen feature="board" edges={['bottom']}>
      <Stack.Screen options={{ title: editOpen ? t.board.editTitle : t.tabs.board }} />
      <Card style={{ gap: 12 }}>
        <Row style={{ gap: 10 }}>
          <Avatar userId={post.author_id} size={36} />
          <View style={{ flex: 1 }}>
            <Txt variant="heading" style={{ fontSize: 15 }}>
              {nameOf(post.author_id)}
            </Txt>
            <Txt variant="small">{fmt.dateTime(post.created_at)}</Txt>
          </View>
          {mine && !editOpen ? <IconButton icon="create-outline" label={t.common.edit} size={20} onPress={() => setEditOpen(true)} /> : null}
          {mine ? null : <ContentMenu kind="post" id={post.id} authorId={post.author_id} />}
        </Row>

        {editOpen && mine ? (
          <>
            <Input value={editText ?? post.body} onChangeText={setEditText} multiline maxLength={4000} aria-label={t.board.editTitle} />
            <Row>
              <Button title={t.common.save} small onPress={saveEdit} loading={m.edit.isPending} />
              <Button
                title={t.common.cancel}
                small
                variant="ghost"
                onPress={closeEdit}
              />
            </Row>
          </>
        ) : (
          <Txt selectable style={{ fontSize: 16, lineHeight: 24 }}>
            {post.body}
          </Txt>
        )}

        <ReactionBar
          reactions={post.post_reactions ?? []}
          onToggle={(emoji, isMine) => m.react.mutate({ postId: post.id, emoji, mine: isMine })}
        />
      </Card>

      {comments.data?.map((cm) => (
        <Row key={cm.id} style={{ alignItems: 'flex-start', gap: 10 }}>
          <Avatar userId={cm.author_id} size={30} />
          <Card style={{ flex: 1, paddingVertical: 12, gap: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="small">
                <Txt variant="small" style={{ fontWeight: '600' }}>
                  {nameOf(cm.author_id)}
                </Txt>{' '}
                · {fmt.relative(cm.created_at)}
              </Txt>
              <Row style={{ gap: 12 }}>
                {cm.author_id === me || isAdmin ? (
                  <IconButton
                    icon="trash-outline"
                    label={t.common.delete}
                    size={18}
                    onPress={() => m.removeComment.mutate({ id: cm.id, postId: id })}
                  />
                ) : null}
                {cm.author_id === me ? null : <ContentMenu kind="comment" id={cm.id} authorId={cm.author_id} />}
              </Row>
            </Row>
            <Txt selectable>{cm.body}</Txt>
          </Card>
        </Row>
      ))}

      <Input value={draft} onChangeText={setDraft} placeholder={t.board.commentPlaceholder} multiline maxLength={1000} />
      <ErrorText message={error} />
      <Button title={t.board.post} onPress={send} loading={m.comment.isPending} disabled={!draft.trim()} />
    </Screen>
  );
}
