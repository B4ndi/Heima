import { addHours, endOfDay, parseISO, startOfDay } from 'date-fns';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Card, ErrorText, Input, Loading, Row, Screen, Toggle } from '@/components/ui';
import { useEvent, useEventMutations } from '@/features/calendar';
import { t } from '@/i18n';
import { fmt, parseLocal } from '@/lib/dates';
import { userMessage } from '@/lib/errors';
import type { CalendarEvent } from '@/lib/types';
import { useHouseholdId } from '@/providers/HouseholdProvider';

/** New event (optionally pre-filled with ?date=YYYY-MM-DD) or edit an existing one (?id=…). */
export default function EventForm() {
  const { id, date } = useLocalSearchParams<{ id?: string; date?: string }>();
  const existing = useEvent(id);
  if (id && !existing.data) return existing.error ? <ErrorText message={userMessage(existing.error)} /> : <Loading />;
  return <Form key={id ?? 'new'} existing={existing.data} date={date} />;
}

function Form({ existing, date }: { existing?: CalendarEvent; date?: string }) {
  const hh = useHouseholdId();
  const m = useEventMutations(hh);
  const start = existing ? parseISO(existing.starts_at) : null;
  const end = existing ? parseISO(existing.ends_at) : null;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [day, setDay] = useState(start ? fmt.isoDate(start) : (date ?? fmt.isoDate(new Date())));
  const [from, setFrom] = useState(start ? fmt.hhmm(start) : '18:00');
  const [to, setTo] = useState(end ? fmt.hhmm(end) : '20:00');
  const [allDay, setAllDay] = useState(existing?.all_day ?? false);
  const [location, setLocation] = useState(existing?.location ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const pending = m.create.isPending || m.update.isPending;

  async function submit() {
    setError(null);
    const s = parseLocal(day, allDay ? '00:00' : from);
    let e = parseLocal(day, allDay ? '00:00' : to);
    if (!s || !e) return setError(t.calendar.invalidDate);
    if (allDay) e = endOfDay(s);
    if (e < s) e = addHours(s, 1);
    const input = { title, location, description, starts_at: allDay ? startOfDay(s) : s, ends_at: e, all_day: allDay };
    try {
      if (existing) await m.update.mutateAsync({ id: existing.id, ...input });
      else await m.create.mutateAsync(input);
      router.back();
    } catch (err) {
      setError(userMessage(err));
    }
  }

  return (
    <Screen feature="calendar" edges={['bottom']}>
      <Stack.Screen options={{ title: existing ? t.calendar.editTitle : t.calendar.new }} />
      <Card style={{ gap: 14 }}>
        <Input label={t.calendar.title} value={title} onChangeText={setTitle} maxLength={120} />
        <Input label={t.calendar.date} value={day} onChangeText={setDay} maxLength={10} keyboardType="numbers-and-punctuation" />
        <Toggle label={t.calendar.allDay} value={allDay} onChange={setAllDay} />
        {!allDay ? (
          <Row style={{ gap: 12 }}>
            <Input label={t.calendar.start} value={from} onChangeText={setFrom} maxLength={5} containerStyle={{ flex: 1 }} />
            <Input label={t.calendar.end} value={to} onChangeText={setTo} maxLength={5} containerStyle={{ flex: 1 }} />
          </Row>
        ) : null}
      </Card>
      <Card style={{ gap: 14 }}>
        <Input label={t.calendar.location} value={location} onChangeText={setLocation} maxLength={120} />
        <Input label={t.calendar.description} value={description} onChangeText={setDescription} maxLength={1000} multiline />
      </Card>
      <ErrorText message={error} />
      <Button title={existing ? t.common.save : t.common.create} onPress={submit} loading={pending} disabled={!title.trim()} />
    </Screen>
  );
}
