import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Chip, ErrorText, Input, Loading, Screen, Txt } from '@/components/ui';
import { useChore, useChoreMutations } from '@/features/chores';
import { t } from '@/i18n';
import { todayIn } from '@/lib/dates';
import { userMessage } from '@/lib/errors';
import type { Chore, Recurrence } from '@/lib/types';
import { useHousehold, useHouseholdId } from '@/providers/HouseholdProvider';

const RECURRENCES: Recurrence[] = ['once', 'daily', 'weekly', 'biweekly', 'monthly'];

/** New chore, or edit an existing one with ?id=… */
export default function ChoreForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useChore(id);
  if (id && !existing.data) return existing.error ? <ErrorText message={userMessage(existing.error)} /> : <Loading />;
  return <Form key={id ?? 'new'} existing={existing.data} />;
}

function Form({ existing }: { existing?: Chore }) {
  const hh = useHouseholdId();
  const { members, nameOf, active: household } = useHousehold();
  const active = members.filter((m) => m.status === 'active');
  const m = useChoreMutations(hh);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [recurrence, setRecurrence] = useState<Recurrence>(existing?.recurrence ?? 'weekly');
  const [rotation, setRotation] = useState<string[]>(existing?.rotation ?? active.map((a) => a.user_id));
  const [due, setDue] = useState(existing?.next_due ?? todayIn(household?.households.timezone));
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return setError(t.calendar.invalidDate);
    const input = { title, recurrence, rotation, next_due: due };
    try {
      if (existing) await m.update.mutateAsync({ id: existing.id, ...input });
      else await m.create.mutateAsync(input);
      router.back();
    } catch (e) {
      setError(userMessage(e));
    }
  }

  const toggle = (id: string) => setRotation((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));

  return (
    <Screen feature="chores" edges={['bottom']}>
      <Stack.Screen options={{ title: existing ? t.chores.editTitle : t.chores.new }} />
      <Card style={{ gap: 14 }}>
        <Input label={t.chores.title} value={title} onChangeText={setTitle} maxLength={100} />
        <Input label={t.chores.nextDue} value={due} onChangeText={setDue} maxLength={10} keyboardType="numbers-and-punctuation" />
      </Card>
      <Card style={{ gap: 10 }}>
        <Txt variant="label">{t.chores.recurrence}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {RECURRENCES.map((r) => (
            <Chip key={r} label={t.chores.rec[r]} selected={recurrence === r} onPress={() => setRecurrence(r)} />
          ))}
        </View>
      </Card>
      <Card style={{ gap: 10 }}>
        <Txt variant="label">{t.chores.rotation}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {active.map((a) => (
            <Chip key={a.user_id} label={nameOf(a.user_id)} selected={rotation.includes(a.user_id)} onPress={() => toggle(a.user_id)} />
          ))}
        </View>
      </Card>
      <ErrorText message={error} />
      <Button
        title={existing ? t.common.save : t.common.create}
        onPress={submit}
        loading={m.create.isPending || m.update.isPending}
        disabled={!title.trim()}
      />
    </Screen>
  );
}
