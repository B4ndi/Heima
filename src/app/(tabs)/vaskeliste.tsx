import { router } from 'expo-router';
import { View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { MeButton } from '@/components/MeButton';
import { AddButton, Button, Card, Empty, ErrorText, FeatureHeader, FeatureScope, IconButton, Loading, Row, Screen, Txt, useFeatureColors } from '@/components/ui';
import { ZootBackdrop, ZootTagline } from '@/components/Zoot';
import { Zoot } from '@/constants/theme';
import { choreAssignee, isZootChore, useChoreMutations, useChores } from '@/features/chores';
import { t } from '@/i18n';
import { fmt, todayIn } from '@/lib/dates';
import { userMessage } from '@/lib/errors';
import { useUserId } from '@/providers/AuthProvider';
import { useHousehold, useHouseholdId } from '@/providers/HouseholdProvider';

export default function Chores() {
  const hh = useHouseholdId();
  const me = useUserId();
  const f = useFeatureColors('chores');
  const { nameOf, isAdmin, active } = useHousehold();
  const today = todayIn(active?.households.timezone); // the database's "today" for chores
  const chores = useChores(hh);
  const m = useChoreMutations(hh);

  // Your turn first, then by due date
  const sorted = [...(chores.data ?? [])].sort(
    (a, b) => Number(choreAssignee(b) === me) - Number(choreAssignee(a) === me) || a.next_due.localeCompare(b.next_due),
  );

  return (
    <Screen feature="chores">
      <FeatureHeader
        icon="sparkles"
        title={t.tabs.chores}
        right={
          <Row style={{ gap: 10 }}>
            <AddButton label={t.chores.new} onPress={() => router.push('/ny-oppgave')} />
            <MeButton />
          </Row>
        }
      />
      {chores.isLoading ? <Loading /> : null}
      {chores.error ? <ErrorText message={userMessage(chores.error)} /> : null}
      {m.complete.error ? <ErrorText message={userMessage(m.complete.error)} /> : null}
      {chores.data?.length === 0 ? <Empty icon="sparkles-outline" text={t.chores.empty} /> : null}

      {sorted.map((ch) => {
        const who = choreAssignee(ch);
        const mine = who === me;
        const overdue = ch.next_due < today;
        const zoot = isZootChore(ch.title);
        const accent = zoot ? Zoot.accent : f.fg;
        return (
          <FeatureScope key={ch.id} feature={zoot ? 'zoot' : 'chores'}>
            <Card tint={zoot ? Zoot.card : mine ? f.bg : undefined} style={{ gap: 12, overflow: 'hidden' }}>
              {zoot ? <ZootBackdrop /> : null}
              <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="heading" style={[{ fontSize: 18 }, zoot && { color: Zoot.text }]}>
                    {ch.title}
                  </Txt>
                  <Txt variant={overdue ? 'error' : 'small'} style={zoot ? { color: overdue ? Zoot.overdue : Zoot.muted } : undefined}>
                    {t.chores.rec[ch.recurrence]} · {overdue ? `${t.chores.overdue} · ` : ''}
                    {t.chores.due(fmt.date(ch.next_due))}
                  </Txt>
                  {zoot ? <ZootTagline seed={ch.id} /> : null}
                </View>
                <Row style={{ gap: 14 }}>
                  <IconButton
                    icon="create-outline"
                    label={t.common.edit}
                    size={20}
                    color={zoot ? Zoot.muted : undefined}
                    onPress={() => router.push({ pathname: '/ny-oppgave', params: { id: ch.id } })}
                  />
                  {ch.created_by === me || isAdmin ? (
                    <IconButton
                      icon="trash-outline"
                      label={t.common.delete}
                      size={20}
                      color={zoot ? Zoot.muted : undefined}
                      onPress={() => m.remove.mutate(ch.id)}
                    />
                  ) : null}
                </Row>
              </Row>

              {/* Rotation: everyone in order, the current person ringed */}
              {ch.rotation.length ? (
                <Row style={{ gap: 6 }}>
                  {ch.rotation.map((uid, i) => {
                    const current = i === ch.rotation_index % ch.rotation.length;
                    return (
                      <View
                        key={uid}
                        style={{ padding: 2, borderRadius: 20, borderWidth: 2, borderColor: current ? accent : 'transparent', opacity: current ? 1 : 0.55 }}>
                        <Avatar userId={uid} size={30} />
                      </View>
                    );
                  })}
                  <Txt style={{ marginLeft: 4, fontWeight: '600', color: accent, flexShrink: 1 }} numberOfLines={1}>
                    {who ? (mine ? t.chores.yourTurn : t.chores.whoseTurn(nameOf(who))) : ''}
                  </Txt>
                </Row>
              ) : null}

              <Button
                title={zoot ? t.chores.zoot.done : t.chores.done}
                icon={zoot ? 'leaf' : 'checkmark'}
                small
                variant={mine || zoot ? 'primary' : 'secondary'}
                onPress={() => m.complete.mutate(ch.id)}
                loading={m.complete.isPending && m.complete.variables === ch.id}
              />
            </Card>
          </FeatureScope>
        );
      })}
    </Screen>
  );
}
