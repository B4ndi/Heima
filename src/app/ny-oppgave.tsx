import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, ErrorText, Input, Screen, Txt } from '@/components/ui';
import { useChoreMutations } from '@/features/chores';
import { nb } from '@/i18n/nb';
import { fmt } from '@/lib/dates';
import { userMessage } from '@/lib/errors';
import type { Recurrence } from '@/lib/types';
import { useHousehold, useHouseholdId } from '@/providers/HouseholdProvider';

const RECURRENCES: Recurrence[] = ['once', 'daily', 'weekly', 'biweekly', 'monthly'];

export default function NewChore() {
  const hh = useHouseholdId();
  const { members, nameOf } = useHousehold();
  const active = members.filter((m) => m.status === 'active');
  const m = useChoreMutations(hh);
  const [title, setTitle] = useState('');
  const [recurrence, setRecurrence] = useState<Recurrence>('weekly');
  const [rotation, setRotation] = useState<string[]>(active.map((a) => a.user_id));
  const [due, setDue] = useState(fmt.isoDate(new Date()));
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return setError(nb.calendar.invalidDate);
    try {
      await m.create.mutateAsync({ title, recurrence, rotation, next_due: due });
      router.back();
    } catch (e) {
      setError(userMessage(e));
    }
  }

  const toggle = (id: string) => setRotation((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));

  return (
    <Screen edges={['bottom']}>
      <Input label={nb.chores.title} value={title} onChangeText={setTitle} maxLength={100} />
      <Txt variant="small">{nb.chores.recurrence}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {RECURRENCES.map((r) => (
          <Chip key={r} label={nb.chores.rec[r]} selected={recurrence === r} onPress={() => setRecurrence(r)} />
        ))}
      </View>
      <Txt variant="small">{nb.chores.rotation}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {active.map((a) => (
          <Chip key={a.user_id} label={nameOf(a.user_id)} selected={rotation.includes(a.user_id)} onPress={() => toggle(a.user_id)} />
        ))}
      </View>
      <Input label={nb.calendar.date} value={due} onChangeText={setDue} maxLength={10} />
      <ErrorText message={error} />
      <Button title={nb.common.create} onPress={submit} loading={m.create.isPending} disabled={!title.trim()} />
    </Screen>
  );
}
