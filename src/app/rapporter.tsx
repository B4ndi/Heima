import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Chip, ErrorText, Input, Screen, Txt } from '@/components/ui';
import { SUPPORT_EMAIL, supportMailto } from '@/constants/support';
import { REPORT_REASONS, useModeration } from '@/features/moderation';
import { t } from '@/i18n';
import { userMessage } from '@/lib/errors';
import type { ReportReason } from '@/lib/types';
import { useHouseholdId } from '@/providers/HouseholdProvider';

/** Report a post or a comment: ?kind=post|comment&id=… */
export default function ReportContent() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const hh = useHouseholdId();
  const m = useModeration(hh);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = (kind === 'post' || kind === 'comment') && !!id;

  async function submit() {
    if (!valid || !reason) return;
    setError(null);
    try {
      await m.report.mutateAsync({ kind, id, reason, details });
      setSent(true);
    } catch (e) {
      setError(userMessage(e));
    }
  }

  if (sent) {
    return (
      <Screen feature="board" edges={['bottom']}>
        <Card>
          <Txt variant="heading" role="alert">
            {t.moderation.sent}
          </Txt>
        </Card>
        <Button title={t.common.close} onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen feature="board" edges={['bottom']}>
      {!valid ? <ErrorText message={t.errors.generic} /> : null}
      <Card style={{ gap: 12 }}>
        <Txt variant="heading">{t.moderation.reportQuestion(kind === 'comment' ? 'comment' : 'post')}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {REPORT_REASONS.map((r) => (
            <Chip key={r} label={t.moderation.reasons[r]} selected={reason === r} onPress={() => setReason(r)} />
          ))}
        </View>
        <Input label={t.moderation.details} value={details} onChangeText={setDetails} multiline maxLength={500} />
      </Card>
      <ErrorText message={error} />
      <Button title={t.moderation.send} onPress={submit} loading={m.report.isPending} disabled={!valid || !reason} />
      <Txt variant="small">{t.moderation.note}</Txt>
      <Button
        title={SUPPORT_EMAIL}
        small
        variant="ghost"
        icon="mail-outline"
        onPress={() => Linking.openURL(supportMailto(t.moderation.reportTitle))}
      />
    </Screen>
  );
}
