import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button, Card, Chip, ErrorText, Input, Row, Screen, Toggle, Txt } from '@/components/ui';
import {
  deleteMyAccount,
  exportMyData,
  pickAndUploadAvatar,
  removeAvatar,
  updateDisplayName,
  useHouseholdAdmin,
  useInvites,
} from '@/features/households';
import { t } from '@/i18n';
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
    Share.share({ message: t.settings.shareMessage(active?.households.name ?? '', code, link) });
  }

  function leave() {
    Alert.alert(t.settings.leaveConfirm, undefined, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.settings.leave,
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
      <Card style={{ gap: 14 }}>
        <Txt variant="heading">{t.settings.profile}</Txt>
        <Row style={{ gap: 16 }}>
          <Avatar userId={me} size={72} />
          <View style={{ gap: 6, flex: 1, alignItems: 'flex-start' }}>
            <Button
              title={t.settings.chooseAvatar}
              icon="image-outline"
              small
              variant="secondary"
              onPress={() => run(async () => { if (await pickAndUploadAvatar(me, profiles[me]?.avatar_path ?? null)) await refresh(); })}
            />
            {profiles[me]?.avatar_path ? (
              <Button
                title={t.settings.removeAvatar}
                small
                variant="ghost"
                onPress={() => run(async () => { await removeAvatar(me, profiles[me]?.avatar_path ?? null); await refresh(); })}
              />
            ) : null}
          </View>
        </Row>
        <Input label={t.settings.displayName} value={displayName} onChangeText={setDisplayName} maxLength={50} />
        <Button
          title={t.common.save}
          small
          variant="secondary"
          onPress={() => run(async () => { await updateDisplayName(me, displayName); await refresh(); })}
        />
      </Card>

      {/* -------------------------------------------------------- husstand */}
      <Card>
        <Txt variant="heading">
          {t.settings.household}: {active?.households.name}
        </Txt>
        {others.length ? (
          <>
            <Txt variant="small">{t.settings.switchHousehold}</Txt>
            <Row style={{ flexWrap: 'wrap' }}>
              {others.map((m) => (
                <Chip key={m.household_id} label={m.households.name} selected={false} onPress={() => setActive(m.household_id)} />
              ))}
            </Row>
          </>
        ) : null}
        <Button title={t.settings.newHousehold} small variant="ghost" onPress={() => router.push('/ny-husstand')} />
      </Card>

      {/* --------------------------------------------------------- beboere */}
      <Card>
        <Txt variant="heading">{t.settings.members}</Txt>
        {activeMembers.map((m) => (
          <Row key={m.user_id} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Row>
              <Avatar userId={m.user_id} size={32} />
              <Txt>
                {nameOf(m.user_id)}
                {m.role === 'admin' ? ` · ${t.settings.admin}` : ''}
              </Txt>
            </Row>
            {isAdmin && m.user_id !== me ? (
              <Row>
                <Button
                  small
                  variant="ghost"
                  title={m.role === 'admin' ? t.settings.makeMember : t.settings.makeAdmin}
                  onPress={() => run(() => admin.setRole.mutateAsync({ user: m.user_id, role: m.role === 'admin' ? 'member' : 'admin' }))}
                />
                <Button small variant="ghost" title={t.settings.remove} onPress={() => run(() => admin.remove.mutateAsync(m.user_id))} />
              </Row>
            ) : null}
          </Row>
        ))}
        {isAdmin && pendingMembers.length ? (
          <>
            <Txt variant="small">{t.settings.pending}</Txt>
            {pendingMembers.map((m) => (
              <Row key={m.user_id} style={{ justifyContent: 'space-between' }}>
                <Txt>{nameOf(m.user_id)}</Txt>
                <Row>
                  <Button small title={t.settings.approve} onPress={() => run(() => admin.approve.mutateAsync(m.user_id))} />
                  <Button small variant="ghost" title={t.settings.decline} onPress={() => run(() => admin.remove.mutateAsync(m.user_id))} />
                </Row>
              </Row>
            ))}
          </>
        ) : null}
      </Card>

      {/* ------------------------------------------------------ invitasjon */}
      {isAdmin ? (
        <Card>
          <Txt variant="heading">{t.settings.invite}</Txt>
          <Toggle label={t.settings.inviteRequireApproval} value={requireApproval} onChange={setRequireApproval} />
          <Button title={t.settings.invite} icon="person-add-outline" onPress={createInvite} loading={admin.createInvite.isPending} />
          {newCode ? (
            <>
              <Txt variant="title" selectable style={{ textAlign: 'center', letterSpacing: 2 }}>
                {newCode}
              </Txt>
              <Txt variant="small">{t.settings.inviteCreated}</Txt>
              <Row>
                <Button small variant="secondary" title={t.settings.share} icon="share-outline" onPress={() => share(newCode)} />
                <Button
                  small
                  variant="secondary"
                  title={t.settings.copy}
                  icon="copy-outline"
                  onPress={() => Clipboard.setStringAsync(newCode).then(() => setInfo(t.settings.copied))}
                />
              </Row>
            </>
          ) : null}
          {invites.data?.length ? <Txt variant="small">{t.settings.activeInvites}</Txt> : null}
          {invites.data?.map((i) => (
            <Row key={i.id} style={{ justifyContent: 'space-between' }}>
              <Txt variant="small">
                {t.settings.uses(i.uses, i.max_uses)} · {t.settings.expires(fmt.dateTime(i.expires_at))}
              </Txt>
              <Button small variant="ghost" title={t.settings.revoke} onPress={() => run(() => admin.revokeInvite.mutateAsync(i.id))} />
            </Row>
          ))}
        </Card>
      ) : null}

      <Button title={t.settings.leave} variant="secondary" onPress={leave} />

      {/* ------------------------------------------------------ personvern */}
      <Card>
        <Txt variant="heading">{t.settings.privacy}</Txt>
        <Button title={t.auth.privacyLink} small variant="ghost" onPress={() => router.push('/personvern')} />
        <Button
          title={t.settings.export}
          small
          variant="secondary"
          onPress={() =>
            run(async () => {
              const data = await exportMyData();
              await Clipboard.setStringAsync(JSON.stringify(data, null, 2));
            }, t.settings.exportDone)
          }
        />
        <Txt variant="small">{t.settings.deleteConfirm}</Txt>
        <Input value={confirmText} onChangeText={setConfirmText} autoCapitalize="characters" maxLength={10} />
        <Button
          title={t.settings.deleteAccount}
          variant="danger"
          disabled={confirmText !== t.settings.deleteWord}
          onPress={() => run(deleteMyAccount)}
        />
      </Card>

      <ErrorText message={error} />
      {info ? <Txt variant="small">{info}</Txt> : null}
      <Button title={t.auth.signOut} variant="ghost" onPress={signOut} />
    </Screen>
  );
}
