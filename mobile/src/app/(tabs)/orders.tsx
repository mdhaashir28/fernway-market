// Order history.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import type { OrderSummary, Paginated } from '@/api/types';
import { EmptyState, ErrorView, LoadingView } from '@/components/states';
import { Button, StatusBadge } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { useT } from '@/i18n';
import { useAddToCart } from '@/lib/reorder';
import { useApi } from '@/lib/useApi';
import { useFormat } from '@/lib/useFormat';
import { colors, font, radius, spacing } from '@/theme';

export default function OrdersScreen() {
  const { user, restoring } = useAuth();
  const { money } = useStore();
  const { t } = useT();
  const format = useFormat();
  const { reorder, busy } = useAddToCart();
  const orders = useApi(() => api.get<Paginated<OrderSummary>>('/api/orders?pageSize=50').then((r) => r.items), [user?.id], {
    enabled: Boolean(user),
    refetchOnFocus: true,
  });

  if (restoring) return <LoadingView />;
  if (!user) {
    return (
      <EmptyState
        icon="receipt-outline"
        title={t('Your orders will appear here')}
        message={t('Log in to see your current orders and order history.')}
        action={
          <View style={{ gap: spacing.md, width: 260 }}>
            <Button title={t('Log in')} onPress={() => router.push('/login')} />
            <Button title={t('Create an account')} variant="secondary" onPress={() => router.push('/signup')} />
          </View>
        }
      />
    );
  }
  if (orders.loading && !orders.data) return <LoadingView message={t('Loading your orders…')} />;
  if (orders.error && !orders.data) return <ErrorView error={orders.error} onRetry={orders.reload} />;

  return (
    <FlatList
      data={orders.data ?? []}
      keyExtractor={(o) => String(o.id)}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={orders.refreshing} onRefresh={orders.refresh} tintColor={colors.primary} />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      ListEmptyComponent={
        <EmptyState
          icon="bag-handle-outline"
          title={t('No orders yet')}
          message={t('When you place an order, you can follow it here.')}
          action={<Button title={t('Start shopping')} icon="storefront" onPress={() => router.navigate('/')} />}
        />
      }
      renderItem={({ item }) => {
        const finished = item.status === 'completed' || item.status === 'cancelled';
        return (
          <View style={styles.card}>
            <Pressable
              onPress={() => router.push(`/order/${item.id}`)}
              accessibilityRole="button"
              accessibilityLabel={t('Order {number}, {status}, {amount}', {
                number: item.orderNumber,
                status: format.statusLabel(item.status),
                amount: money(item.totalCents),
              })}
              style={({ pressed }) => [styles.cardBody, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.cardTop}>
                <Text style={styles.number}>{item.orderNumber}</Text>
                <StatusBadge status={item.status} />
              </View>
              {item.status === 'awaiting_payment' && (
                <View style={styles.payNote}>
                  <Ionicons name="alert-circle" size={16} color={colors.accentText} />
                  <Text style={styles.payNoteText}>
                    {item.paymentDueBy
                      ? t('Pay before {time} to confirm this order', { time: format.time(item.paymentDueBy) })
                      : t('Waiting for your payment')}
                  </Text>
                </View>
              )}
              <Text style={styles.preview} numberOfLines={1}>
                {t(item.itemCount === 1 ? '{count} item' : '{count} items', { count: item.itemCount })}
                {item.itemPreview ? ` · ${item.itemPreview}` : ''}
              </Text>
              <View style={styles.meta}>
                <Ionicons name={item.fulfillmentType === 'delivery' ? 'bicycle-outline' : 'storefront-outline'} size={16} color={colors.textMuted} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {item.fulfillmentType === 'pickup' && item.pickupStartsAt && item.pickupEndsAt
                    ? t('Pickup {slot}', { slot: format.slot(item.pickupStartsAt, item.pickupEndsAt) })
                    : t('Delivery to {postcode}', { postcode: item.deliveryPostcode ?? t('your address') })}
                </Text>
              </View>
              <View style={styles.cardBottom}>
                <Text style={styles.metaText}>{format.dateTime(item.createdAt)}</Text>
                <Text style={styles.total}>{money(item.totalCents)}</Text>
              </View>
            </Pressable>
            {finished && (
              <Pressable
                onPress={() => reorder(item.id)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={t('Order {number} again', { number: item.orderNumber })}
                style={({ pressed }) => [styles.againButton, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="repeat" size={18} color={colors.primaryDark} />
                <Text style={styles.againText}>{t('Order again')}</Text>
              </Pressable>
            )}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1, maxWidth: 700, width: '100%', alignSelf: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardBody: { padding: spacing.lg, gap: 6 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  number: { fontSize: font.large, fontWeight: '800', color: colors.text },
  payNote: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accentSoft, padding: spacing.sm, borderRadius: radius.sm },
  payNoteText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.accentText },
  preview: { fontSize: 15, color: colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 14, color: colors.textMuted, flexShrink: 1 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  total: { fontSize: font.large, fontWeight: '800', color: colors.text },
  againButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.primaryTint,
  },
  againText: { fontSize: 15, fontWeight: '800', color: colors.primaryDark },
});
