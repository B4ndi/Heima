import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { Button, Card, ErrorText, Loading, Screen, Txt } from '@/components/ui';
import { joinHousehold, previewInvite } from '@/features/households';
import { nb } from '@/i18n/nb';
import { rpcErrorMessage, userMessage } from '@/lib/errors';
import { formatCode, schemas } from '@/lib/validation';
import { useHousehold } from '@/providers/HouseholdProvider';

/**
 * Reached from an invite link (heima://bli-med/CODE or the universal link) or
 * from the onboarding form. A link alone never joins anyone: the user always
 * sees which household it is and must confirm.
 */
export default function JoinHousehold() {
  const { kode } = useLocalSearchParams<{ kode: string }>();
  const { setActive, refresh } = useHousehold();
  const [preview, setPreview] = useState<{ name: string; members: number; approval: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parsed = schemas.inviteCode.safeParse(kode ?? '');
  const shownError = parsed.success ? error : nb.errors.invalidCode;

  useEffect(() => {
    if (!parsed.success) return;
    previewInvite(parsed.data)
      .then((r) => {
        if (r.ok) setPreview({ name: r.household_name ?? '', members: r.member_count ?? 0, approval: !!r.requires_approval });
        else setError(rpcErrorMessage(r.error));
      })
      .catch((e) => setError(userMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kode]);

  async function join() {
    if (!parsed.success) return;
    setBusy(true);
    try {
      const r = await joinHousehold(parsed.data);
      if (!r.ok) return setError(rpcErrorMessage(r.error));
      if (r.household_id && r.status === 'active') setActive(r.household_id);
      await refresh();
      router.dismissTo('/');
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={['bottom']}>
      {parsed.success ? <Txt variant="muted">{formatCode(parsed.data)}</Txt> : null}
      {!preview && !shownError ? <Loading /> : null}
      {preview ? (
        <Card>
          <Txt variant="heading">{nb.join.confirm(preview.name)}</Txt>
          <Txt variant="muted">{nb.join.members(preview.members)}</Txt>
          {preview.approval ? <Txt variant="small">{nb.join.approvalNote}</Txt> : null}
          <Button title={nb.join.join} onPress={join} loading={busy} />
          <Button title={nb.common.cancel} variant="ghost" onPress={() => router.back()} />
        </Card>
      ) : null}
      <ErrorText message={shownError} />
    </Screen>
  );
}
