import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Card, ErrorText, Input, Screen, Txt } from '@/components/ui';
import { createHousehold, updateDisplayName } from '@/features/households';
import { nb } from '@/i18n/nb';
import { userMessage } from '@/lib/errors';
import { schemas } from '@/lib/validation';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useHousehold } from '@/providers/HouseholdProvider';

export function HouseholdSetup({ standalone = true }: { standalone?: boolean }) {
  const { signOut, userId } = useAuth();
  const { memberships, setActive, refresh } = useHousehold();
  const [displayName, setDisplayName] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = memberships.filter((m) => m.status === 'pending');

  // New users get a placeholder name from the DB trigger; ask for a real one first.
  async function saveName(): Promise<boolean> {
    if (!standalone || !userId) return true;
    if (!displayName.trim()) {
      const { data } = await supabase.from('profiles').select('display_name').eq('id', userId).single();
      if (data && data.display_name !== 'Ny beboer') return true;
      setError(nb.onboarding.nameRequired);
      return false;
    }
    await updateDisplayName(userId, displayName);
    return true;
  }

  async function create() {
    setError(null);
    setBusy(true);
    try {
      if (!(await saveName())) return;
      const id = await createHousehold(name);
      setActive(id);
      await refresh();
      if (!standalone) router.dismissTo('/');
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    setError(null);
    const parsed = schemas.inviteCode.safeParse(code);
    if (!parsed.success) return setError(nb.errors.invalidCode);
    try {
      if (!(await saveName())) return;
    } catch (e) {
      return setError(userMessage(e));
    }
    router.push({ pathname: '/bli-med/[kode]', params: { kode: parsed.data } });
  }

  return (
    <Screen edges={standalone ? ['top', 'bottom'] : ['bottom']}>
      {standalone ? (
        <Txt variant="title" style={{ marginTop: 32 }}>
          {nb.onboarding.title}
        </Txt>
      ) : null}

      {standalone ? (
        <Card>
          <Txt variant="heading">{nb.onboarding.nameTitle}</Txt>
          <Input value={displayName} onChangeText={setDisplayName} placeholder={nb.settings.displayName} maxLength={50} autoComplete="name" />
        </Card>
      ) : null}

      {pending.length > 0 ? (
        <Card>
          <Txt>{nb.onboarding.pending}</Txt>
          <Button title={nb.common.retry} variant="secondary" onPress={refresh} />
        </Card>
      ) : null}

      <Card>
        <Txt variant="heading">{nb.onboarding.joinTitle}</Txt>
        <Input
          value={code}
          onChangeText={setCode}
          placeholder={nb.onboarding.joinPlaceholder}
          autoCapitalize="characters"
          maxLength={13}
        />
        <Button title={nb.onboarding.join} onPress={join} variant="secondary" />
      </Card>

      <Card>
        <Txt variant="heading">{nb.onboarding.createTitle}</Txt>
        <Input value={name} onChangeText={setName} placeholder={nb.onboarding.createPlaceholder} maxLength={60} />
        <Button title={nb.common.create} onPress={create} loading={busy} disabled={!name.trim()} />
      </Card>

      <ErrorText message={error} />
      {standalone ? <Button title={nb.auth.signOut} variant="ghost" onPress={signOut} /> : null}
    </Screen>
  );
}
