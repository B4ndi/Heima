import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { MeButton } from '@/components/MeButton';
import { AddButton, Card, Empty, ErrorText, FeatureHeader, IconButton, Row, Screen, Txt, useColors, useFeatureColors } from '@/components/ui';
import { useEventMutations, useEvents } from '@/features/calendar';
import { t } from '@/i18n';
import { fmt } from '@/lib/dates';
import { userMessage } from '@/lib/errors';
import type { CalendarEvent } from '@/lib/types';
import { useUserId } from '@/providers/AuthProvider';
import { useHousehold, useHouseholdId } from '@/providers/HouseholdProvider';

const WEEK = { weekStartsOn: 1 as const };

export default function Calendar() {
  const hh = useHouseholdId();
  const me = useUserId();
  const c = useColors();
  const f = useFeatureColors('calendar');
  const { nameOf, isAdmin } = useHousehold();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));

  const gridStart = startOfWeek(month, WEEK);
  const gridEnd = endOfWeek(endOfMonth(month), WEEK);
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const events = useEvents(hh, gridStart, addDays(gridEnd, 1));
  const m = useEventMutations(hh);

  // Which events touch which day (multi-day events show on every day they span)
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events.data ?? []) {
    const span = eachDayOfInterval({ start: startOfDay(parseISO(e.starts_at)), end: startOfDay(parseISO(e.ends_at)) });
    for (const d of span.slice(0, 31)) {
      const k = fmt.isoDate(d);
      byDay.set(k, [...(byDay.get(k) ?? []), e]);
    }
  }
  const dayEvents = byDay.get(fmt.isoDate(selected)) ?? [];

  return (
    <Screen feature="calendar">
      <FeatureHeader
        icon="calendar"
        title={t.tabs.calendar}
        right={
          <Row style={{ gap: 10 }}>
            <AddButton
              label={t.calendar.new}
              onPress={() => router.push({ pathname: '/ny-hendelse', params: { date: fmt.isoDate(selected) } })}
            />
            <MeButton />
          </Row>
        }
      />

      <Card style={{ gap: 12 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <IconButton icon="chevron-back" label={t.calendar.prevMonth} color={f.fg} onPress={() => setMonth(addMonths(month, -1))} />
          <Txt variant="heading" style={{ textTransform: 'capitalize' }}>
            {fmt.monthTitle(month)}
          </Txt>
          <IconButton icon="chevron-forward" label={t.calendar.nextMonth} color={f.fg} onPress={() => setMonth(addMonths(month, 1))} />
        </Row>

        <View style={{ flexDirection: 'row' }}>
          {days.slice(0, 7).map((d) => (
            <Text key={d.toISOString()} style={{ flex: 1, textAlign: 'center', color: c.textSecondary, fontSize: 12, fontWeight: '600' }}>
              {fmt.weekdayShort(d)}
            </Text>
          ))}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {days.map((d) => {
            const k = fmt.isoDate(d);
            const count = byDay.get(k)?.length ?? 0;
            const sel = isSameDay(d, selected);
            const inMonth = isSameMonth(d, month);
            const today = isToday(d);
            return (
              <Pressable
                key={k}
                role="button"
                aria-label={`${fmt.dayLabel(d)}${count ? `, ${count}` : ''}`}
                aria-selected={sel}
                onPress={() => {
                  setSelected(d);
                  if (!inMonth) setMonth(startOfMonth(d));
                }}
                style={{ width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 }}>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: sel ? f.fg : today ? f.bg : 'transparent',
                  }}>
                  <Text
                    style={{
                      color: sel ? f.onFg : inMonth ? (today ? f.fg : c.text) : c.textSecondary,
                      opacity: inMonth ? 1 : 0.5,
                      fontWeight: sel || today ? '700' : '500',
                      fontSize: 15,
                    }}>
                    {d.getDate()}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 3, height: 6, marginTop: 2 }}>
                  {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                    <View key={i} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: f.fg }} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Txt variant="label" style={{ marginTop: 4 }}>
        {fmt.dayLabel(selected)}
      </Txt>
      {events.error ? <ErrorText message={userMessage(events.error)} /> : null}
      {dayEvents.length === 0 ? <Empty icon="calendar-clear-outline" text={t.calendar.empty} /> : null}

      {dayEvents.map((e) => {
        const canEdit = e.created_by === me || isAdmin;
        return (
          <Card key={e.id} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
            <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: f.fg }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt style={{ color: f.fg, fontWeight: '700', fontSize: 13 }}>
                {e.all_day ? t.calendar.allDay : `${fmt.time(e.starts_at)}–${fmt.time(e.ends_at)}`}
              </Txt>
              <Txt variant="heading">{e.title}</Txt>
              {e.location ? <Txt variant="small">📍 {e.location}</Txt> : null}
              {e.description ? <Txt variant="muted">{e.description}</Txt> : null}
              <Txt variant="small">{nameOf(e.created_by)}</Txt>
            </View>
            {canEdit ? (
              <View style={{ gap: 14 }}>
                <IconButton
                  icon="create-outline"
                  label={t.common.edit}
                  size={20}
                  onPress={() => router.push({ pathname: '/ny-hendelse', params: { id: e.id } })}
                />
                <IconButton icon="trash-outline" label={t.common.delete} size={20} onPress={() => m.remove.mutate(e.id)} />
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
