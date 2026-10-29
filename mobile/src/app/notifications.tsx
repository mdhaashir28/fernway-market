// "Updates": order confirmations, status changes, refunds and replies from the store.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, type ComponentProps } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import type { AppNotification } from '@/api/types';
import { EmptyState, ErrorView, LoadingView } from '@/components/states';
import { Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationsContext';
import { useT } from '@/i18n';
import { useApi } from '@/lib/useApi';
import { useFormat } from '@/lib/useFormat';
import { colors, font, radius, spacing } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const EVENT_ICONS: Record<string, { icon: IconName; color: string; bg: string }> = {
  order_confirmed: { icon: 'checkmark-circle-outline', color: colors.info, bg: colors.infoSoft },
  order_preparing: { icon: 'basket-outline', color: colors.violet, bg: colors.violetSoft },
  order_ready_for_pickup: { icon: 'storefront-outline', color: colors.teal, bg: colors.tealSoft },
  order_out_for_delivery: { icon: 'bicycle-outline', color: colors.teal, bg: colors.tealSoft },
  order_completed: { icon: 'checkmark-done-outline', color: colors.primaryDark, bg: colors.primarySoft },
  order_cancelled: { icon: 'close-circle-outline', color: colors.danger, bg: colors.dangerSoft },
  payment_failed: { icon: 'alert-circle-outline', color: colors.danger, bg: colors.dangerSoft },
  refund_initiated: { icon: 'return-down-back', color: colors.info, bg: colors.infoSoft },
  refund_processed: { icon: 'return-down-back', color: colors.primaryDark, bg: colors.primarySoft },
  order_updated: { icon: 'swap-horizontal', color: colors.accentText, bg: colors.accentSoft },
  support_reply: { icon: 'chatbubble-ellipses-outline', color: colors.primaryDark, bg: colors.primarySoft },
  points_earned: { icon: 'star-outline', color: colors.accentText, bg: colors.accentSoft },
};
const DEFAULT_ICON = { icon: 'notifications-outline' as IconName, color: colors.primary, bg: colors.primarySoft };

export default function NotificationsScreen() {
  const { user, restoring } = useAuth();
  const { t } = useT();
  const format = useFormat();
  const notifications = useNotifications();
  const list = useApi(() => api.get<{ items: AppNotification[] }>('/api/notifications?limit=100').then((r) => r.items), [user?.id], {
    enabled: Boolean(user),
    refetchOnFocus: true,
    pollMs: 30_000,
  });

  // Opening this screen marks everything as read (new ones stay highlighted until you leave).
  const unread = (list.data ?? []).some((n) => !n.readAt);
  useEffect(() => {
    if (!unread) return;
    api
      .post('/api/notifications/read', {})
      .then(() => notifications.refresh())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);

  if (restoring) return <LoadingView />;
  if (!user) {
    return (
      <EmptyState
        icon="notifications-outline"
        title={t('Log in to see your updates')}
        action={<Button title={t('Log in')} onPress={() => router.push('/login')} />}
      />
    );
  }
  if (list.loading && !list.data) return <LoadingView />;
  if (list.error && !list.data) return <ErrorView error={list.error} onRetry={list.reload} />;

  return (
    <FlatList
      data={list.data ?? []}
      keyExtractor={(n) => String(n.id)}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.primary} />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      ListEmptyComponent={
        <EmptyState
          icon="notifications-outline"
          title={t('No updates yet')}
          message={t("When you place an order, we'll tell you here as it's confirmed, prepared and ready.")}
        />
      }
      renderItem={({ item }) => {
        const style = EVENT_ICONS[item.event] ?? DEFAULT_ICON;
        const isNew = !item.readAt;
        return (
          <Pressable
            onPress={() => item.orderId && router.push(`/order/${item.orderId}`)}
            disabled={!item.orderId}
            accessibilityRole={item.orderId ? 'button' : undefined}
            accessibilityLabel={`${isNew ? `${t('New')}: ` : ''}${item.title}. ${item.body}`}
            style={({ pressed }) => [styles.card, isNew && styles.cardNew, pressed && { opacity: 0.85 }]}
          >
            <View style={[styles.icon, { backgroundColor: style.bg }]}>
              <Ionicons name={style.icon} size={22} color={style.color} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{item.title}</Text>
                {isNew && (
                  <View style={styles.newPill}>
                    <Text style={styles.newText}>{t('New')}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.body}>{item.body}</Text>
              <Text style={styles.time}>{format.dateTime(item.createdAt)}</Text>
            </View>
            {item.orderId ? <Ionicons name="chevron-forward" size={20} color={colors.textMuted} /> : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1, maxWidth: 700, width: '100%', alignSelf: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardNew: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  title: { fontSize: font.body, fontWeight: '800', color: colors.text, flexShrink: 1 },
  newPill: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 1 },
  newText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  time: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
});
