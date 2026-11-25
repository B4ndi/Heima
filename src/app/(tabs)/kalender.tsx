import { parseISO, startOfDay } from 'date-fns';
import { router } from 'expo-router';

import { Button, Card, Empty, ErrorText, IconButton, Loading, Row, Screen, Txt } from '@/components/ui';
import { useEventMutations, useEvents } from '@/features/calendar';
import { nb } from '@/i18n/nb';
import { fmt } from '@/lib/dates';
import { userMessage } from '@/lib/errors';
import type { CalendarEvent } from '@/lib/types';
import { useUserId } from '@/providers/AuthProvider';
import { useHousehold, useHouseholdId } from '@/providers/HouseholdProvider';

export default function Calendar() {
  const hh = useHouseholdId();
  const me = useUserId();
  const { nameOf, isAdmin } = useHousehold();
  const events = useEvents(hh);
  const m = useEventMutations(hh);

  const groups = new Map<number, CalendarEvent[]>();
  for (const e of events.data ?? []) {
    const day = Math.max(startOfDay(parseISO(e.starts_at)).getTime(), startOfDay(new Date()).getTime());
    groups.set(day, [...(groups.get(day) ?? []), e]);
  }

  return (
    <Screen edges={[]}>
      <Button title={nb.calendar.new} icon="add" onPress={() => router.push('/ny-hendelse')} />
      {events.isLoading ? <Loading /> : null}
      {events.error ? <ErrorText message={userMessage(events.error)} /> : null}
      {events.data?.length === 0 ? <Empty text={nb.calendar.empty} /> : null}

      {[...groups.entries()].map(([day, list]) => (
        <Card key={day}>
          <Txt variant="heading" style={{ textTransform: 'capitalize' }}>
            {fmt.dayLabel(new Date(day))}
          </Txt>
          {list.map((e) => (
            <Row key={e.id} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Txt variant="muted" style={{ width: 92 }}>
                {e.all_day ? nb.calendar.allDay : `${fmt.time(e.starts_at)}–${fmt.time(e.ends_at)}`}
              </Txt>
              <Txt style={{ flex: 1 }}>
                {e.title}
                {e.location ? `\n📍 ${e.location}` : ''}
                {e.description ? `\n${e.description}` : ''}
                {`\n`}
                <Txt variant="small">{nameOf(e.created_by)}</Txt>
              </Txt>
              {e.created_by === me || isAdmin ? (
                <IconButton icon="trash-outline" label={nb.common.delete} onPress={() => m.remove.mutate(e.id)} />
              ) : null}
            </Row>
          ))}
        </Card>
      ))}
    </Screen>
  );
}
