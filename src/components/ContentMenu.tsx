import { router } from 'expo-router';
import { useState } from 'react';

import { ActionSheet, IconButton } from '@/components/ui';
import { useModeration } from '@/features/moderation';
import { t } from '@/i18n';
import { userMessage } from '@/lib/errors';
import { useHousehold, useHouseholdId } from '@/providers/HouseholdProvider';

/**
 * "…" menu on someone else's post or comment: report it, or block its author.
 * Your own content has edit/delete instead, so the menu is not shown for it.
 */
export function ContentMenu({ kind, id, authorId }: { kind: 'post' | 'comment'; id: string; authorId: string }) {
  const hh = useHouseholdId();
  const { nameOf } = useHousehold();
  const m = useModeration(hh);
  const [open, setOpen] = useState<'menu' | 'block' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = nameOf(authorId);

  const close = () => {
    setOpen(null);
    setError(null);
  };

  async function block() {
    setError(null);
    try {
      await m.block.mutateAsync(authorId);
      close();
    } catch (e) {
      setError(userMessage(e));
    }
  }

  return (
    <>
      <IconButton icon="ellipsis-horizontal" label={t.moderation.moreFor(name)} size={20} onPress={() => setOpen('menu')} />
      <ActionSheet
        visible={open === 'menu'}
        title={t.moderation.more}
        onClose={close}
        actions={[
          {
            label: t.moderation.report,
            icon: 'flag-outline',
            onPress: () => {
              close();
              // iOS refuses to present a modal route while an RN <Modal> is still dismissing
              setTimeout(() => router.push({ pathname: '/rapporter', params: { kind, id } }), 300);
            },
          },
          { label: t.moderation.block(name), icon: 'remove-circle-outline', destructive: true, onPress: () => setOpen('block') },
        ]}
      />
      <ActionSheet
        visible={open === 'block'}
        title={t.moderation.blockTitle(name)}
        message={t.moderation.blockBody}
        onClose={close}
        error={error}
        actions={[{ label: t.moderation.blockConfirm, icon: 'remove-circle-outline', destructive: true, onPress: block }]}
      />
    </>
  );
}
