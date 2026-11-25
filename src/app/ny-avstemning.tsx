import { router } from 'expo-router';
import { useState } from 'react';

import { Button, ErrorText, Input, Screen, Toggle } from '@/components/ui';
import { usePollMutations } from '@/features/polls';
import { nb } from '@/i18n/nb';
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
    if (options.filter((o) => o.trim()).length < 2) return setError(nb.polls.needOptions);
    try {
      await m.create.mutateAsync({ question, options, multiple, anonymous });
      router.back();
    } catch (e) {
      setError(userMessage(e));
    }
  }

  return (
    <Screen edges={['bottom']}>
      <Input label={nb.polls.question} value={question} onChangeText={setQuestion} maxLength={300} multiline />
      {options.map((o, i) => (
        <Input
          key={i}
          label={nb.polls.option(i + 1)}
          value={o}
          maxLength={100}
          onChangeText={(t) => setOptions((prev) => prev.map((p, j) => (j === i ? t : p)))}
        />
      ))}
      {options.length < 10 ? (
        <Button title={nb.polls.addOption} variant="secondary" icon="add" small onPress={() => setOptions((p) => [...p, ''])} />
      ) : null}
      <Toggle label={nb.polls.multiple} value={multiple} onChange={setMultiple} />
      <Toggle label={nb.polls.anonymous} value={anonymous} onChange={setAnonymous} />
      <ErrorText message={error} />
      <Button title={nb.common.create} onPress={submit} loading={m.create.isPending} disabled={!question.trim()} />
    </Screen>
  );
}
