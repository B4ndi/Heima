import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { useFeature } from '@/components/ui';
import { useHousehold } from '@/providers/HouseholdProvider';

/** Round avatar: the housemate's picture, or their initials on the feature colour. */
export function Avatar({ userId, size = 32 }: { userId: string | null | undefined; size?: number }) {
  const { avatarUrl, nameOf, profiles } = useHousehold();
  const f = useFeature();
  const url = avatarUrl(userId);
  // the real name, not "deg"/"you", so your own initials are right
  const name = (userId && profiles[userId]?.display_name) || nameOf(userId);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  const box = { width: size, height: size, borderRadius: size / 2 };

  if (url) {
    return <Image source={{ uri: url }} style={box} contentFit="cover" accessibilityLabel={name} transition={150} />;
  }
  return (
    <View style={[box, { backgroundColor: f.fg, alignItems: 'center', justifyContent: 'center' }]} accessibilityLabel={name}>
      <Text style={{ color: f.onFg, fontWeight: '700', fontSize: size * 0.4 }}>{initials || '?'}</Text>
    </View>
  );
}
