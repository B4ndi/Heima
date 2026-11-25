import { addHours, endOfDay, startOfDay } from 'date-fns';
import { router } from 'expo-router';
import { useState } from 'react';

import { Button, ErrorText, Input, Row, Screen, Toggle } from '@/components/ui';
import { useEventMutations } from '@/features/calendar';
import { nb } from '@/i18n/nb';
import { fmt, parseLocal } from '@/lib/dates';
import { userMessage } from '@/lib/errors';
import { useHouseholdId } from '@/providers/HouseholdProvider';

export default function NewEvent() {
  const hh = useHouseholdId();
  const m = useEventMutations(hh);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(fmt.isoDate(new Date()));
  const [start, setStart] = useState('18:00');
  const [end, setEnd] = useState('20:00');
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    const s = parseLocal(date, allDay ? '00:00' : start);
    let e = parseLocal(date, allDay ? '00:00' : end);
    if (!s || !e) return setError(nb.calendar.invalidDate);
    if (allDay) e = endOfDay(s);
    if (e < s) e = addHours(s, 1);
    try {
      await m.create.mutateAsync({
        title,
        location,
        description,
        starts_at: allDay ? startOfDay(s) : s,
        ends_at: e,
        all_day: allDay,
      });
      router.back();
    } catch (err) {
      setError(userMessage(err));
    }
  }

  return (
    <Screen edges={['bottom']}>
      <Input label={nb.calendar.title} value={title} onChangeText={setTitle} maxLength={120} />
      <Input label={nb.calendar.date} value={date} onChangeText={setDate} maxLength={10} keyboardType="numbers-and-punctuation" />
      <Toggle label={nb.calendar.allDay} value={allDay} onChange={setAllDay} />
      {!allDay ? (
        <Row>
          <Input label={nb.calendar.start} value={start} onChangeText={setStart} maxLength={5} containerStyle={{ flex: 1 }} />
          <Input label={nb.calendar.end} value={end} onChangeText={setEnd} maxLength={5} containerStyle={{ flex: 1 }} />
        </Row>
      ) : null}
      <Input label={nb.calendar.location} value={location} onChangeText={setLocation} maxLength={120} />
      <Input label={nb.calendar.description} value={description} onChangeText={setDescription} maxLength={1000} multiline />
      <ErrorText message={error} />
      <Button title={nb.common.create} onPress={submit} loading={m.create.isPending} disabled={!title.trim()} />
    </Screen>
  );
}
