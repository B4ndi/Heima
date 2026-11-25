import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { MeButton } from '@/components/MeButton';
import { ReactionBar } from '@/components/ReactionBar';
import { Card, Empty, ErrorText, FeatureHeader, IconButton, Loading, Row, Screen, Txt, useColors, useFeatureColors } from '@/components/ui';
import { useBoardMutations, usePosts } from '@/features/board';
import { t } from '@/i18n';
import { fmt } from '@/lib/dates';
import { userMessage } from '@/lib/errors';
import { useUserId } from '@/providers/AuthProvider';
import { useHousehold, useHouseholdId } from '@/providers/HouseholdProvider';

export default function Board() {
  const hh = useHouseholdId();
  const me = useUserId();
  const c = useColors();
  const f = useFeatureColors('board');
  const { nameOf, isAdmin, active } = useHousehold();
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
    Alert.alert(t.board.deleteConfirm, undefined, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.common.delete, style: 'destructive', onPress: () => m.remove.mutate(id) },
    ]);
  }

  return (
    <Screen feature="board">
      <FeatureHeader icon="chatbubbles" title={t.tabs.board} subtitle={active?.households.name} right={<MeButton />} />

      {/* Composer: a rounded field with an inline send button */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <Avatar userId={me} size={36} />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: c.card, borderRadius: 22, paddingLeft: 16, paddingRight: 6, paddingVertical: 6 }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t.board.placeholder}
            placeholderTextColor={c.textSecondary}
            aria-label={t.board.placeholder}
            multiline
            maxLength={4000}
            style={{ flex: 1, minWidth: 0, color: c.text, fontSize: 16, paddingVertical: 8, maxHeight: 140 }}
          />
          <Pressable
            role="button"
            aria-label={t.board.post}
            disabled={!draft.trim() || m.create.isPending}
            onPress={publish}
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: draft.trim() ? f.fg : c.field }}>
            <Ionicons name="arrow-up" size={20} color={draft.trim() ? f.onFg : c.textSecondary} />
          </Pressable>
        </View>
      </View>
      <ErrorText message={error} />

      {posts.isLoading ? <Loading /> : null}
      {posts.error ? <ErrorText message={userMessage(posts.error)} /> : null}
      {posts.data?.length === 0 ? <Empty icon="chatbubbles-outline" text={t.board.empty} /> : null}

      {posts.data?.map((p) => {
        const count = p.post_comments?.[0]?.count ?? 0;
        const mine = p.author_id === me;
        return (
          <Card key={p.id} tint={p.pinned ? f.bg : undefined} style={{ gap: 12 }}>
            <Row style={{ gap: 10 }}>
              <Avatar userId={p.author_id} size={36} />
              <View style={{ flex: 1 }}>
                <Txt variant="heading" style={{ fontSize: 15 }}>
                  {nameOf(p.author_id)}
                </Txt>
                <Txt variant="small">
                  {p.pinned ? `📌 ${t.board.pinned} · ` : ''}
                  {fmt.relative(p.created_at)}
                  {p.edited_at ? ` · ${t.board.edited}` : ''}
                </Txt>
              </View>
              {isAdmin ? (
                <IconButton
                  icon={p.pinned ? 'pin' : 'pin-outline'}
                  label={p.pinned ? t.board.unpin : t.board.pin}
                  color={p.pinned ? f.fg : undefined}
                  size={20}
                  onPress={() => m.pin.mutate({ id: p.id, pinned: !p.pinned })}
                />
              ) : null}
              {mine ? (
                <IconButton
                  icon="create-outline"
                  label={t.common.edit}
                  size={20}
                  onPress={() => router.push({ pathname: '/oppslag/[id]', params: { id: p.id, edit: '1' } })}
                />
              ) : null}
              {mine || isAdmin ? (
                <IconButton icon="trash-outline" label={t.common.delete} size={20} onPress={() => confirmDelete(p.id)} />
              ) : null}
            </Row>

            <Txt selectable style={{ fontSize: 16, lineHeight: 24 }}>
              {p.body}
            </Txt>

            <ReactionBar
              reactions={p.post_reactions ?? []}
              onToggle={(emoji, isMine) => m.react.mutate({ postId: p.id, emoji, mine: isMine })}
            />

            <Pressable
              role="button"
              aria-label={t.board.comments(count)}
              onPress={() => router.push({ pathname: '/oppslag/[id]', params: { id: p.id } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="chatbubble-outline" size={16} color={f.fg} />
              <Txt style={{ color: f.fg, fontWeight: '600', fontSize: 14 }}>{t.board.comments(count)}</Txt>
            </Pressable>
          </Card>
        );
      })}
    </Screen>
  );
}
