import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useColors, useFeature } from '@/components/ui';
import { REACTIONS, type Reaction } from '@/features/board';
import { t } from '@/i18n';
import { useUserId } from '@/providers/AuthProvider';
import { useHousehold } from '@/providers/HouseholdProvider';

/** Emoji reactions under a post: tap a pill to toggle yours, "+" to add a new one. */
export function ReactionBar({
  reactions,
  onToggle,
}: {
  reactions: Reaction[];
  onToggle: (emoji: string, mine: boolean) => void;
}) {
  const me = useUserId();
  const c = useColors();
  const f = useFeature();
  const { nameOf } = useHousehold();
  const [picking, setPicking] = useState(false);

  const counts = REACTIONS.map((emoji) => {
    const who = reactions.filter((r) => r.emoji === emoji);
    return { emoji, count: who.length, mine: who.some((r) => r.user_id === me), names: who.map((r) => nameOf(r.user_id)) };
  }).filter((r) => r.count > 0);

  const pill = (selected: boolean) => ({
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: selected ? f.bg : c.field,
    borderWidth: 1,
    borderColor: selected ? f.fg : 'transparent',
  });

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {counts.map((r) => (
        <Pressable
          key={r.emoji}
          role="button"
          aria-label={`${r.emoji} ${r.count}. ${t.board.reactedBy(r.names.join(', '))}`}
          aria-pressed={r.mine}
          onPress={() => onToggle(r.emoji, r.mine)}
          style={pill(r.mine)}>
          <Text style={{ fontSize: 15 }}>{r.emoji}</Text>
          <Text style={{ color: r.mine ? f.fg : c.textSecondary, fontWeight: '600', fontSize: 13 }}>{r.count}</Text>
        </Pressable>
      ))}

      {picking ? (
        REACTIONS.filter((e) => !counts.some((r) => r.emoji === e)).map((emoji) => (
          <Pressable
            key={emoji}
            role="button"
            aria-label={emoji}
            onPress={() => {
              setPicking(false);
              onToggle(emoji, false);
            }}
            style={pill(false)}>
            <Text style={{ fontSize: 15 }}>{emoji}</Text>
          </Pressable>
        ))
      ) : (
        <Pressable role="button" aria-label={t.board.react} onPress={() => setPicking(true)} style={pill(false)}>
          <Text style={{ fontSize: 14, color: c.textSecondary }}>☺︎ +</Text>
        </Pressable>
      )}
    </View>
  );
}
