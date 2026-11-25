import { Ionicons } from '@expo/vector-icons';
import { isBefore, parseISO, startOfDay } from 'date-fns';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { MeButton } from '@/components/MeButton';
import { Button, Card, FeatureHeader, Row, Screen, Txt, useColors, useFeatureColors, type IconName } from '@/components/ui';
import type { Feature } from '@/constants/theme';
import { usePosts } from '@/features/board';
import { useEvents } from '@/features/calendar';
import { choreAssignee, useChoreMutations, useChores } from '@/features/chores';
import { usePolls } from '@/features/polls';
import { useOpenItemCount } from '@/features/shopping';
import { t } from '@/i18n';
import { fmt } from '@/lib/dates';
import { useUserId } from '@/providers/AuthProvider';
import { useHousehold, useHouseholdId } from '@/providers/HouseholdProvider';

/** Small heading with the feature's icon and a "see all" link to its tab. */
function Block({
  feature,
  icon,
  title,
  href,
  children,
}: {
  feature: Feature;
  icon: IconName;
  title: string;
  href: Href;
  children: ReactNode;
}) {
  const f = useFeatureColors(feature);
  return (
    <View style={{ gap: 10 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: f.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={15} color={f.fg} />
          </View>
          <Txt variant="label">{title}</Txt>
        </Row>
        <Pressable role="button" aria-label={`${t.common.seeAll}: ${title}`} onPress={() => router.navigate(href)} hitSlop={8}>
          <Txt style={{ color: f.fg, fontWeight: '600', fontSize: 14 }}>{t.common.seeAll}</Txt>
        </Pressable>
      </Row>
      {children}
    </View>
  );
}

export default function Home() {
  const hh = useHouseholdId();
  const me = useUserId();
  const c = useColors();
  const { active, profiles, nameOf } = useHousehold();
  const chores = useChores(hh);
  const choreM = useChoreMutations(hh);
  const events = useEvents(hh);
  const posts = usePosts(hh);
  const polls = usePolls(hh);
  const openItems = useOpenItemCount(hh);

  const fChores = useFeatureColors('chores');
  const fCal = useFeatureColors('calendar');
  const fShop = useFeatureColors('shopping');
  const fPolls = useFeatureColors('polls');

  const myChores = (chores.data ?? []).filter((ch) => choreAssignee(ch) === me).slice(0, 3); // already sorted by due date
  const nextEvents = (events.data ?? []).slice(0, 3);
  const latest = (posts.data ?? []).slice(0, 2);
  const now = new Date();
  const myVotes = new Set((polls.data?.votes ?? []).filter((v) => v.user_id === me).map((v) => v.poll_id));
  const openPolls = (polls.data?.polls ?? []).filter(
    (p) => !p.closed_at && !(p.closes_at && new Date(p.closes_at) <= now) && !myVotes.has(p.id),
  );
  const myName = profiles[me]?.display_name?.split(' ')[0];

  return (
    <Screen feature="home">
      <FeatureHeader
        icon="home"
        title={myName ? t.home.greeting(myName) : t.home.greetingAnon}
        subtitle={active?.households.name}
        right={<MeButton />}
      />

      {/* Shopping summary: one tappable strip */}
      <Card tint={fShop.bg} onPress={() => router.navigate('/handleliste')} label={t.tabs.shopping} style={{ paddingVertical: 14 }}>
        <Row>
          <Ionicons name="cart" size={20} color={fShop.fg} />
          <Txt style={{ flex: 1, fontWeight: '600', color: fShop.fg }}>
            {openItems.data ? t.home.shopping(openItems.data) : t.home.shoppingEmpty}
          </Txt>
          <Ionicons name="chevron-forward" size={18} color={fShop.fg} />
        </Row>
      </Card>

      <Block feature="chores" icon="sparkles" title={t.home.yourChores} href="/vaskeliste">
        {myChores.length === 0 ? (
          <Txt variant="muted">{t.home.noChores}</Txt>
        ) : (
          myChores.map((ch) => {
            const overdue = isBefore(parseISO(ch.next_due), startOfDay(now));
            return (
              <Card key={ch.id} style={{ borderLeftWidth: 4, borderLeftColor: fChores.fg }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="heading">{ch.title}</Txt>
                    <Txt variant={overdue ? 'error' : 'small'}>
                      {overdue ? `${t.chores.overdue} · ` : ''}
                      {t.chores.due(fmt.date(ch.next_due))}
                    </Txt>
                  </View>
                  <View>
                    <Button title={t.chores.done} icon="checkmark" small onPress={() => choreM.complete.mutate(ch.id)} />
                  </View>
                </Row>
              </Card>
            );
          })
        )}
      </Block>

      <Block feature="calendar" icon="calendar" title={t.home.upcoming} href="/kalender">
        {nextEvents.length === 0 ? (
          <Txt variant="muted">{t.home.noEvents}</Txt>
        ) : (
          <Card style={{ gap: 14 }}>
            {nextEvents.map((e) => {
              const d = parseISO(e.starts_at);
              return (
                <Row key={e.id} style={{ gap: 12 }}>
                  <View style={{ width: 46, borderRadius: 12, backgroundColor: fCal.bg, alignItems: 'center', paddingVertical: 6 }}>
                    <Txt style={{ color: fCal.fg, fontWeight: '700', fontSize: 18, lineHeight: 22 }}>{d.getDate()}</Txt>
                    <Txt style={{ color: fCal.fg, fontSize: 11, lineHeight: 14 }}>{fmt.date(e.starts_at).split(' ')[1]}</Txt>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt style={{ fontWeight: '600' }}>{e.title}</Txt>
                    <Txt variant="small">
                      {fmt.dayLabel(d)}
                      {e.all_day ? '' : ` · ${fmt.time(e.starts_at)}`}
                    </Txt>
                  </View>
                </Row>
              );
            })}
          </Card>
        )}
      </Block>

      {openPolls.length > 0 ? (
        <Block feature="polls" icon="stats-chart" title={t.home.openPolls} href="/avstemninger">
          {openPolls.slice(0, 2).map((p) => (
            <Card key={p.id} tint={fPolls.bg} onPress={() => router.navigate('/avstemninger')} label={p.question}>
              <Row>
                <Txt style={{ flex: 1, fontWeight: '600' }}>{p.question}</Txt>
                <Ionicons name="chevron-forward" size={18} color={fPolls.fg} />
              </Row>
            </Card>
          ))}
        </Block>
      ) : null}

      <Block feature="board" icon="chatbubbles" title={t.home.latestPosts} href="/oppslag">
        {latest.length === 0 ? (
          <Txt variant="muted">{t.home.noPosts}</Txt>
        ) : (
          latest.map((p) => (
            <Card key={p.id} onPress={() => router.push({ pathname: '/oppslag/[id]', params: { id: p.id } })} label={p.body}>
              <Row style={{ alignItems: 'flex-start', gap: 10 }}>
                <Avatar userId={p.author_id} size={30} />
                <View style={{ flex: 1 }}>
                  <Txt variant="small">
                    <Txt variant="small" style={{ fontWeight: '600', color: c.text }}>
                      {nameOf(p.author_id)}
                    </Txt>{' '}
                    · {fmt.relative(p.created_at)}
                  </Txt>
                  <Txt numberOfLines={2}>{p.body}</Txt>
                </View>
              </Row>
            </Card>
          ))
        )}
      </Block>
    </Screen>
  );
}
