import { isBefore, parseISO, startOfDay } from 'date-fns';
import { router } from 'expo-router';

import { Button, Card, Empty, ErrorText, IconButton, Loading, Row, Screen, Txt, useColors } from '@/components/ui';
import { choreAssignee, useChoreMutations, useChores } from '@/features/chores';
import { nb } from '@/i18n/nb';
import { fmt } from '@/lib/dates';
import { userMessage } from '@/lib/errors';
import { useUserId } from '@/providers/AuthProvider';
import { useHousehold, useHouseholdId } from '@/providers/HouseholdProvider';

export default function Chores() {
  const hh = useHouseholdId();
  const me = useUserId();
  const c = useColors();
  const { nameOf, isAdmin } = useHousehold();
  const chores = useChores(hh);
  const m = useChoreMutations(hh);

  return (
    <Screen edges={[]}>
      <Button title={nb.chores.new} icon="add" onPress={() => router.push('/ny-oppgave')} />
      {chores.isLoading ? <Loading /> : null}
      {chores.error ? <ErrorText message={userMessage(chores.error)} /> : null}
      {m.complete.error ? <ErrorText message={userMessage(m.complete.error)} /> : null}
      {chores.data?.length === 0 ? <Empty text={nb.chores.empty} /> : null}

      {chores.data?.map((ch) => {
        const who = choreAssignee(ch);
        const mine = who === me;
        const overdue = isBefore(parseISO(ch.next_due), startOfDay(new Date()));
        return (
          <Card key={ch.id} style={mine ? { borderColor: c.primary, borderWidth: 1 } : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt variant="heading">{ch.title}</Txt>
              {ch.created_by === me || isAdmin ? (
                <IconButton icon="trash-outline" label={nb.common.delete} onPress={() => m.remove.mutate(ch.id)} />
              ) : null}
            </Row>
            <Txt variant="muted">
              {who ? (mine ? nb.chores.yourTurn : nb.chores.whoseTurn(nameOf(who))) : '—'} · {nb.chores.rec[ch.recurrence]}
            </Txt>
            <Txt variant={overdue ? 'error' : 'small'}>
              {overdue ? `${nb.chores.overdue} · ` : ''}
              {nb.chores.due(fmt.date(ch.next_due))}
            </Txt>
            <Button
              title={nb.chores.done}
              icon="checkmark"
              small
              variant={mine ? 'primary' : 'secondary'}
              onPress={() => m.complete.mutate(ch.id)}
              loading={m.complete.isPending && m.complete.variables === ch.id}
            />
          </Card>
        );
      })}
    </Screen>
  );
}
