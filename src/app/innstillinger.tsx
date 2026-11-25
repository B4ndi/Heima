import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Share } from 'react-native';

import { Button, Card, Chip, ErrorText, Input, Row, Screen, Toggle, Txt } from '@/components/ui';
import {
  deleteMyAccount,
  exportMyData,
  updateDisplayName,
  useHouseholdAdmin,
  useInvites,
} from '@/features/households';
import { nb } from '@/i18n/nb';
import { fmt } from '@/lib/dates';
import { userMessage } from '@/lib/errors';
import { useAuth, useUserId } from '@/providers/AuthProvider';
import { useHousehold, useHouseholdId } from '@/providers/HouseholdProvider';

export default function Settings() {
  const me = useUserId();
  const hh = useHouseholdId();
  const { signOut } = useAuth();
  const { active, memberships, setActive, members, profiles, nameOf, isAdmin, refresh } = useHousehold();
  const admin = useHouseholdAdmin(hh);
  const invites = useInvites(hh, isAdmin);
  const [displayName, setDisplayName] = useState(profiles[me]?.display_name ?? '');
  const [requireApproval, setRequireApproval] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError(null);
    setInfo(null);
    try {
      await fn();
      if (ok) setInfo(ok);
    } catch (e) {
      setError(userMessage(e));
    }
  };

  const activeMembers = members.filter((m) => m.status === 'active');
  const pendingMembers = members.filter((m) => m.status === 'pending');
  const others = memberships.filter((m) => m.status === 'active' && m.household_id !== hh);

  async function createInvite() {
    await run(async () => {
      const inv = await admin.createInvite.mutateAsync(requireApproval);
      setNewCode(inv.code);
    });
  }

  function share(code: string) {
    const link = Linking.createURL(`bli-med/${code.replace('-', '')}`);
    Share.share({ message: nb.settings.shareMessage(active?.households.name ?? '', code, link) });
  }

  function leave() {
    Alert.alert(nb.settings.leaveConfirm, undefined, [
      { text: nb.common.cancel, style: 'cancel' },
      {
        text: nb.settings.leave,
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await admin.leave.mutateAsync();
            await refresh();
            router.dismissTo('/');
          }),
      },
    ]);
  }

  return (
    <Screen edges={['bottom']}>
      {/* ---------------------------------------------------------- profil */}
      <Card>
        <Txt variant="heading">{nb.settings.profile}</Txt>
        <Input label={nb.settings.displayName} value={displayName} onChangeText={setDisplayName} maxLength={50} />
        <Button
          title={nb.common.save}
          small
          variant="secondary"
          onPress={() => run(async () => { await updateDisplayName(me, displayName); await refresh(); })}
        />
      </Card>

      {/* -------------------------------------------------------- husstand */}
      <Card>
        <Txt variant="heading">
          {nb.settings.household}: {active?.households.name}
        </Txt>
        {others.length ? (
          <>
            <Txt variant="small">{nb.settings.switchHousehold}</Txt>
            <Row style={{ flexWrap: 'wrap' }}>
              {others.map((m) => (
                <Chip key={m.household_id} label={m.households.name} selected={false} onPress={() => setActive(m.household_id)} />
              ))}
            </Row>
          </>
        ) : null}
        <Button title={nb.settings.newHousehold} small variant="ghost" onPress={() => router.push('/ny-husstand')} />
      </Card>

      {/* --------------------------------------------------------- beboere */}
      <Card>
        <Txt variant="heading">{nb.settings.members}</Txt>
        {activeMembers.map((m) => (
          <Row key={m.user_id} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Txt>
              {nameOf(m.user_id)}
              {m.role === 'admin' ? ` · ${nb.settings.admin}` : ''}
            </Txt>
            {isAdmin && m.user_id !== me ? (
              <Row>
                <Button
                  small
                  variant="ghost"
                  title={m.role === 'admin' ? nb.settings.makeMember : nb.settings.makeAdmin}
                  onPress={() => run(() => admin.setRole.mutateAsync({ user: m.user_id, role: m.role === 'admin' ? 'member' : 'admin' }))}
                />
                <Button small variant="ghost" title={nb.settings.remove} onPress={() => run(() => admin.remove.mutateAsync(m.user_id))} />
              </Row>
            ) : null}
          </Row>
        ))}
        {isAdmin && pendingMembers.length ? (
          <>
            <Txt variant="small">{nb.settings.pending}</Txt>
            {pendingMembers.map((m) => (
              <Row key={m.user_id} style={{ justifyContent: 'space-between' }}>
                <Txt>{nameOf(m.user_id)}</Txt>
                <Row>
                  <Button small title={nb.settings.approve} onPress={() => run(() => admin.approve.mutateAsync(m.user_id))} />
                  <Button small variant="ghost" title={nb.settings.decline} onPress={() => run(() => admin.remove.mutateAsync(m.user_id))} />
                </Row>
              </Row>
            ))}
          </>
        ) : null}
      </Card>

      {/* ------------------------------------------------------ invitasjon */}
      {isAdmin ? (
        <Card>
          <Txt variant="heading">{nb.settings.invite}</Txt>
          <Toggle label={nb.settings.inviteRequireApproval} value={requireApproval} onChange={setRequireApproval} />
          <Button title={nb.settings.invite} icon="person-add-outline" onPress={createInvite} loading={admin.createInvite.isPending} />
          {newCode ? (
            <>
              <Txt variant="title" selectable style={{ textAlign: 'center', letterSpacing: 2 }}>
                {newCode}
              </Txt>
              <Txt variant="small">{nb.settings.inviteCreated}</Txt>
              <Row>
                <Button small variant="secondary" title={nb.settings.share} icon="share-outline" onPress={() => share(newCode)} />
                <Button
                  small
                  variant="secondary"
                  title={nb.settings.copy}
                  icon="copy-outline"
                  onPress={() => Clipboard.setStringAsync(newCode).then(() => setInfo(nb.settings.copied))}
                />
              </Row>
            </>
          ) : null}
          {invites.data?.length ? <Txt variant="small">{nb.settings.activeInvites}</Txt> : null}
          {invites.data?.map((i) => (
            <Row key={i.id} style={{ justifyContent: 'space-between' }}>
              <Txt variant="small">
                {nb.settings.uses(i.uses, i.max_uses)} · {nb.settings.expires(fmt.dateTime(i.expires_at))}
              </Txt>
              <Button small variant="ghost" title={nb.settings.revoke} onPress={() => run(() => admin.revokeInvite.mutateAsync(i.id))} />
            </Row>
          ))}
        </Card>
      ) : null}

      <Button title={nb.settings.leave} variant="secondary" onPress={leave} />

      {/* ------------------------------------------------------ personvern */}
      <Card>
        <Txt variant="heading">{nb.settings.privacy}</Txt>
        <Button title={nb.auth.privacyLink} small variant="ghost" onPress={() => router.push('/personvern')} />
        <Button
          title={nb.settings.export}
          small
          variant="secondary"
          onPress={() =>
            run(async () => {
              const data = await exportMyData();
              await Clipboard.setStringAsync(JSON.stringify(data, null, 2));
            }, nb.settings.exportDone)
          }
        />
        <Txt variant="small">{nb.settings.deleteConfirm}</Txt>
        <Input value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" maxLength={10} />
        <Button
          title={nb.settings.deleteAccount}
          variant="danger"
          disabled={confirmText !== nb.settings.deleteWord}
          onPress={() => run(deleteMyAccount)}
        />
      </Card>

      <ErrorText message={error} />
      {info ? <Txt variant="small">{info}</Txt> : null}
      <Button title={nb.auth.signOut} variant="ghost" onPress={signOut} />
    </Screen>
  );
}
