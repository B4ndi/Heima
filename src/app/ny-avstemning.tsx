import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Card, ErrorText, Input, Screen, Toggle } from '@/components/ui';
import { usePollMutations } from '@/features/polls';
import { t } from '@/i18n';
import { userMessage } from '@/lib/errors';
import { useHouseholdId } from '@/providers/HouseholdProvider';

export default function NewPoll() {
  const hh = useHouseholdId();
  const m = usePollMutations(hh);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (options.filter((o) => o.trim()).length < 2) return setError(t.polls.needOptions);
    try {
      await m.create.mutateAsync({ question, options, multiple, anonymous });
      router.back();
    } catch (e) {
      setError(userMessage(e));
    }
  }

  return (
    <Screen feature="polls" edges={['bottom']}>
      <Card>
        <Input label={t.polls.question} value={question} onChangeText={setQuestion} maxLength={300} multiline />
      </Card>
      <Card style={{ gap: 12 }}>
      {options.map((o, i) => (
        <Input
          key={i}
          label={t.polls.option(i + 1)}
          value={o}
          maxLength={100}
          onChangeText={(v) => setOptions((prev) => prev.map((p, j) => (j === i ? v : p)))}
        />
      ))}
      {options.length < 10 ? (
        <Button title={t.polls.addOption} variant="secondary" icon="add" small onPress={() => setOptions((p) => [...p, ''])} />
      ) : null}
      </Card>
      <Card style={{ gap: 12 }}>
        <Toggle label={t.polls.multiple} value={multiple} onChange={setMultiple} />
        <Toggle label={t.polls.anonymous} value={anonymous} onChange={setAnonymous} />
      </Card>
      <ErrorText message={error} />
      <Button title={t.common.create} onPress={submit} loading={m.create.isPending} disabled={!question.trim()} />
    </Screen>
  );
}
