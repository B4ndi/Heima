import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Card, Empty, ErrorText, Loading, Row, Screen, Txt, useColors } from '@/components/ui';
import { usePollMutations, usePollResults, usePolls } from '@/features/polls';
import { nb } from '@/i18n/nb';
import { fmt } from '@/lib/dates';
import { userMessage } from '@/lib/errors';
import type { Poll, PollVote } from '@/lib/types';
import { useUserId } from '@/providers/AuthProvider';
import { useHousehold, useHouseholdId } from '@/providers/HouseholdProvider';

export default function Polls() {
  const hh = useHouseholdId();
  const q = usePolls(hh);

  return (
    <Screen edges={[]}>
      <Button title={nb.polls.new} icon="add" onPress={() => router.push('/ny-avstemning')} />
      {q.isLoading ? <Loading /> : null}
      {q.error ? <ErrorText message={userMessage(q.error)} /> : null}
      {q.data?.polls.length === 0 ? <Empty text={nb.polls.empty} /> : null}
      {q.data?.polls.map((p) => <PollCard key={p.id} poll={p} votes={q.data.votes.filter((v) => v.poll_id === p.id)} />)}
    </Screen>
  );
}

function PollCard({ poll, votes }: { poll: Poll; votes: PollVote[] }) {
  const hh = useHouseholdId();
  const me = useUserId();
  const c = useColors();
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
        {poll.anonymous ? ` · ${nb.polls.anonymousBadge}` : ''}
        {closed ? ` · ${nb.polls.closed}` : ''}
      </Txt>
      <Txt variant="heading">{poll.question}</Txt>
      {options.map((o) => {
        const n = results.data?.[o.id] ?? 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        const isSel = selected.includes(o.id);
        const voters = poll.anonymous ? [] : votes.filter((v) => v.option_id === o.id).map((v) => nameOf(v.user_id));
        return (
          <Pressable
            key={o.id}
            onPress={() => toggle(o.id)}
            accessibilityRole={poll.multiple_choice ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: isSel, disabled: closed }}>
            <View style={{ borderWidth: 1, borderColor: isSel ? c.primary : c.border, borderRadius: 8, overflow: 'hidden' }}>
              <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct}%`, backgroundColor: c.accent }} />
              <Row style={{ justifyContent: 'space-between', padding: 10 }}>
                <Txt>{o.label}</Txt>
                <Txt variant="small">
                  {nb.polls.votes(n)} · {pct}%
                </Txt>
              </Row>
            </View>
            {voters.length ? <Txt variant="small">{voters.join(', ')}</Txt> : null}
          </Pressable>
        );
      })}
      <ErrorText message={error} />
      <Row>
        {!closed ? (
          <Button title={nb.polls.vote} onPress={vote} small disabled={selected.length === 0} loading={m.vote.isPending} />
        ) : null}
        {!closed && (poll.created_by === me || isAdmin) ? (
          <Button title={nb.polls.close} variant="ghost" small onPress={() => m.close.mutate(poll.id)} />
        ) : null}
        {poll.created_by === me || isAdmin ? (
          <Button title={nb.common.delete} variant="ghost" small onPress={() => m.remove.mutate(poll.id)} />
        ) : null}
      </Row>
    </Card>
  );
}
