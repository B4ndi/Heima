import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { MeButton } from '@/components/MeButton';
import { AddButton, Button, Card, Empty, ErrorText, FeatureHeader, Loading, Row, Screen, Txt, useColors, useFeatureColors } from '@/components/ui';
import { usePollMutations, usePollResults, usePolls } from '@/features/polls';
import { t } from '@/i18n';
import { fmt } from '@/lib/dates';
import { userMessage } from '@/lib/errors';
import type { Poll, PollVote } from '@/lib/types';
import { useUserId } from '@/providers/AuthProvider';
import { useHousehold, useHouseholdId } from '@/providers/HouseholdProvider';

export default function Polls() {
  const hh = useHouseholdId();
  const q = usePolls(hh);

  return (
    <Screen feature="polls">
      <FeatureHeader
        icon="stats-chart"
        title={t.tabs.polls}
        right={
          <Row style={{ gap: 10 }}>
            <AddButton label={t.polls.new} onPress={() => router.push('/ny-avstemning')} />
            <MeButton />
          </Row>
        }
      />
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorText message={userMessage(q.error)} /> : null}
      {q.data?.polls.length === 0 ? <Empty icon="stats-chart-outline" text={t.polls.empty} /> : null}
      {q.data?.polls.map((p) => <PollCard key={p.id} poll={p} votes={q.data.votes.filter((v) => v.poll_id === p.id)} />)}
    </Screen>
  );
}

function PollCard({ poll, votes }: { poll: Poll; votes: PollVote[] }) {
  const hh = useHouseholdId();
  const me = useUserId();
  const c = useColors();
  const f = useFeatureColors('polls');
  const { nameOf, isAdmin } = useHousehold();
  const results = usePollResults(poll.id);
  const m = usePollMutations(hh);
  const mine = votes.filter((v) => v.user_id === me).map((v) => v.option_id);
  const [selected, setSelected] = useState<string[]>(mine);
  const [error, setError] = useState<string | null>(null);
  const closed = !!poll.closed_at || (!!poll.closes_at && new Date(poll.closes_at) <= new Date());
  const total = Object.values(results.data ?? {}).reduce((a, b) => a + b, 0);
  const options = [...poll.poll_options].sort((a, b) => a.position - b.position);

  function toggle(id: string) {
    if (closed) return;
    setSelected((s) => (poll.multiple_choice ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : [id]));
  }

  async function vote() {
    setError(null);
    try {
      await m.vote.mutateAsync({ pollId: poll.id, optionIds: selected });
    } catch (e) {
      setError(userMessage(e));
    }
  }

  return (
    <Card>
      <Txt variant="small">
        {nameOf(poll.created_by)} · {fmt.relative(poll.created_at)}
        {poll.anonymous ? ` · ${t.polls.anonymousBadge}` : ''}
        {closed ? ` · ${t.polls.closed}` : ''}
      </Txt>
      <Txt variant="heading" style={{ fontSize: 19, lineHeight: 25 }}>{poll.question}</Txt>
      {options.map((o) => {
        const n = results.data?.[o.id] ?? 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        const isSel = selected.includes(o.id);
        const voters = poll.anonymous ? [] : votes.filter((v) => v.option_id === o.id).map((v) => nameOf(v.user_id));
        return (
          <Pressable
            key={o.id}
            onPress={() => toggle(o.id)}
            role={poll.multiple_choice ? 'checkbox' : 'radio'}
            aria-label={o.label}
            aria-checked={isSel}
            aria-disabled={closed}>
            <View
              style={{
                borderWidth: 2,
                borderColor: isSel ? f.fg : 'transparent',
                backgroundColor: c.field,
                borderRadius: 14,
                overflow: 'hidden',
              }}>
              <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct}%`, backgroundColor: f.bg }} />
              <Row style={{ justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 }}>
                <Txt style={{ fontWeight: isSel ? '600' : '400', flex: 1 }}>{o.label}</Txt>
                <Txt style={{ color: f.fg, fontWeight: '700', fontSize: 14 }}>{pct}%</Txt>
              </Row>
            </View>
            <Txt variant="small" style={{ marginTop: 2, marginLeft: 4 }}>
              {t.polls.votes(n)}
              {voters.length ? ` · ${voters.join(', ')}` : ''}
            </Txt>
          </Pressable>
        );
      })}
      <ErrorText message={error} />
      <Row>
        {!closed ? (
          <Button title={t.polls.vote} onPress={vote} small disabled={selected.length === 0} loading={m.vote.isPending} />
        ) : null}
        {!closed && (poll.created_by === me || isAdmin) ? (
          <Button title={t.polls.close} variant="ghost" small onPress={() => m.close.mutate(poll.id)} />
        ) : null}
        {poll.created_by === me || isAdmin ? (
          <Button title={t.common.delete} variant="ghost" small onPress={() => m.remove.mutate(poll.id)} />
        ) : null}
      </Row>
    </Card>
  );
}
