import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { t } from '@/i18n';
import { useUserId } from '@/providers/AuthProvider';

/** Your own avatar in the top-right of every tab; opens settings. */
export function MeButton() {
  const me = useUserId();
  return (
    <Pressable role="button" aria-label={t.settings.title} hitSlop={8} onPress={() => router.push('/innstillinger')}>
      <Avatar userId={me} size={38} />
    </Pressable>
  );
}
