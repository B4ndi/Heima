import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Card, ErrorText, IconButton, Input, Loading, Row, Screen, Txt } from '@/components/ui';
import { useBoardMutations, useComments, usePosts } from '@/features/board';
import { nb } from '@/i18n/nb';
import { fmt } from '@/lib/dates';
import { userMessage } from '@/lib/errors';
import { useUserId } from '@/providers/AuthProvider';
import { useHousehold, useHouseholdId } from '@/providers/HouseholdProvider';

export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const hh = useHouseholdId();
  const me = useUserId();
  const { nameOf, isAdmin } = useHousehold();
  const post = usePosts(hh).data?.find((p) => p.id === id);
  const comments = useComments(id);
  const m = useBoardMutations(hh);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setError(null);
    try {
      await m.comment.mutateAsync({ postId: id, body: draft });
      setDraft('');
    } catch (e) {
      setError(userMessage(e));
    }
  }

  if (!post) return <Loading />;

  return (
    <Screen edges={['bottom']}>
      <Card>
        <Txt variant="small">
          {nameOf(post.author_id)} · {fmt.dateTime(post.created_at)}
        </Txt>
        <Txt selectable>{post.body}</Txt>
      </Card>

      {comments.data?.map((cm) => (
        <Card key={cm.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="small">
              {nameOf(cm.author_id)} · {fmt.relative(cm.created_at)}
            </Txt>
            {cm.author_id === me || isAdmin ? (
              <IconButton
                icon="trash-outline"
                label={nb.common.delete}
                onPress={() => m.removeComment.mutate({ id: cm.id, postId: id })}
              />
            ) : null}
          </Row>
          <Txt selectable>{cm.body}</Txt>
        </Card>
      ))}

      <Card>
        <Input value={draft} onChangeText={setDraft} placeholder={nb.board.commentPlaceholder} multiline maxLength={1000} />
        <ErrorText message={error} />
        <Button title={nb.board.post} onPress={send} small loading={m.comment.isPending} disabled={!draft.trim()} />
      </Card>
    </Screen>
  );
}
