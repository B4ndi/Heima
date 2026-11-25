import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { ActionSheet, Button, Card, Chip, ErrorText, Input, Row, Screen, Toggle, Txt } from '@/components/ui';
import { supportMailto, SUPPORT_EMAIL } from '@/constants/support';
import {
  deleteMyAccount,
  exportMyData,
  pickAndUploadAvatar,
  removeAvatar,
  updateDisplayName,
  useHouseholdAdmin,
  useInvites,
} from '@/features/households';
import { useBlocks, useModeration, useReports } from '@/features/moderation';
import { t } from '@/i18n';
import { fmt } from '@/lib/dates';
import type { Report } from '@/lib/types';
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
  const reports = useReports(hh, isAdmin);
  const blocks = useBlocks(hh);
  const mod = useModeration(hh);
  const [timezone, setTimezone] = useState<string | null>(null); // null = untouched, show the saved value
  const [removeTarget, setRemoveTarget] = useState<Report | null>(null);
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
  const isCurrentMember = (uid: string) => members.some((m) => m.user_id === uid);
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
        {isAdmin ? (
          <>
            <Input
              label={t.settings.timezone}
              value={timezone ?? active?.households.timezone ?? ''}
              onChangeText={setTimezone}
              autoCapitalize="none"
              maxLength={64}
            />
            <Txt variant="small">{t.settings.timezoneHelp}</Txt>
            {timezone != null && timezone !== active?.households.timezone ? (
              <Button
                title={t.common.save}
                small
                variant="secondary"
                onPress={() =>
                  run(async () => {
                    await admin.setTimezone.mutateAsync(timezone);
                    setTimezone(null);
                  }, t.settings.timezoneSaved)
                }
              />
            ) : null}
          </>
        ) : (
          <Txt variant="small">
            {t.settings.timezone}: {active?.households.timezone}
          </Txt>
        )}
        <Button title={t.settings.newHousehold} small variant="ghost" onPress={() => router.push('/ny-husstand')} />
      </Card>

      {/* ------------------------------------------------------- rapporter */}
      {isAdmin ? (
        <Card style={{ gap: 14 }}>
          <Txt variant="heading">{t.settings.reports}</Txt>
          {reports.error ? <ErrorText message={userMessage(reports.error)} /> : null}
          {reports.data?.length === 0 ? <Txt variant="small">{t.settings.noReports}</Txt> : null}
          {reports.data?.map((r) => {
            const body = r.posts?.body ?? r.post_comments?.body;
            return (
              <View key={r.id} style={{ gap: 6 }}>
                <Txt variant="small">
                  <Txt variant="small" style={{ fontWeight: '600' }}>
                    {t.moderation.reasons[r.reason]}
                  </Txt>
                  {' · '}
                  {t.settings.reportAbout(r.post_id ? 'post' : 'comment', nameOf(r.reported_user_id))} · {fmt.relative(r.created_at)}
                </Txt>
                <Txt numberOfLines={6}>{body ?? t.settings.contentGone}</Txt>
                {r.details ? <Txt variant="small">«{r.details}»</Txt> : null}
                <Row style={{ flexWrap: 'wrap' }}>
                  <Button small variant="secondary" title={t.settings.dismiss} onPress={() => run(() => mod.resolve.mutateAsync({ id: r.id, action: 'dismiss' }))} />
                  <Button
                    small
                    variant="danger"
                    title={t.settings.deleteContent}
                    onPress={() => run(() => mod.resolve.mutateAsync({ id: r.id, action: 'delete_content' }))}
                  />
                  {isCurrentMember(r.reported_user_id) ? (
                    <Button small variant="ghost" title={t.settings.removeMember} onPress={() => setRemoveTarget(r)} />
                  ) : null}
                </Row>
              </View>
            );
          })}
        </Card>
      ) : null}
      <ActionSheet
        visible={!!removeTarget}
        title={t.settings.removeMemberConfirm(nameOf(removeTarget?.reported_user_id))}
        message={t.settings.removeMemberBody}
        onClose={() => setRemoveTarget(null)}
        actions={[
          {
            label: t.settings.removeMember,
            icon: 'person-remove-outline',
            destructive: true,
            onPress: () => {
              const r = removeTarget;
              setRemoveTarget(null);
              if (r) run(() => mod.resolve.mutateAsync({ id: r.id, action: 'remove_member' }));
            },
          },
        ]}
      />

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

      {/* ------------------------------------------------------ blokkerte */}
      <Card>
        <Txt variant="heading">{t.settings.blocked}</Txt>
        {blocks.data?.length === 0 ? <Txt variant="small">{t.settings.noBlocked}</Txt> : null}
        {blocks.data?.map((b) => (
          <Row key={b.blocked_id} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <Row>
              <Avatar userId={b.blocked_id} size={32} />
              <Txt>{nameOf(b.blocked_id)}</Txt>
            </Row>
            <Button
              small
              variant="ghost"
              title={t.settings.unblockFor(nameOf(b.blocked_id))}
              onPress={() => run(() => mod.unblock.mutateAsync(b.blocked_id))}
            />
          </Row>
        ))}
      </Card>

      <Button title={t.settings.leave} variant="secondary" onPress={leave} />

      {/* ---------------------------------------------------------- hjelp */}
      <Card>
        <Txt variant="heading">{t.settings.support}</Txt>
        <Txt variant="small">{t.settings.supportBody}</Txt>
        <Button
          title={t.settings.contactSupport}
          small
          variant="secondary"
          icon="mail-outline"
          onPress={() => Linking.openURL(supportMailto('Heimvis'))}
        />
        <Txt variant="small" selectable>
          {SUPPORT_EMAIL}
        </Txt>
      </Card>

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
