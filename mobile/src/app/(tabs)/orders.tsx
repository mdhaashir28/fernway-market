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
import { formatDateTime, formatSlot } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { colors, font, radius, spacing } from '@/theme';

export default function OrdersScreen() {
  const { user, restoring } = useAuth();
  const { money } = useStore();
  const orders = useApi(() => api.get<Paginated<OrderSummary>>('/api/orders?pageSize=50').then((r) => r.items), [user?.id], {
    enabled: Boolean(user),
    refetchOnFocus: true,
  });

  if (restoring) return <LoadingView />;
  if (!user) {
    return (
      <EmptyState
        icon="receipt-outline"
        title="Your orders will appear here"
        message="Log in to see your current orders and order history."
        action={
          <View style={{ gap: spacing.md, width: 260 }}>
            <Button title="Log in" onPress={() => router.push('/login')} />
            <Button title="Create an account" variant="secondary" onPress={() => router.push('/signup')} />
          </View>
        }
      />
    );
  }
  if (orders.loading && !orders.data) return <LoadingView message="Loading your orders…" />;
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
          title="No orders yet"
          message="When you place an order, you can follow it here."
          action={<Button title="Start shopping" icon="storefront" onPress={() => router.navigate('/')} />}
        />
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/order/${item.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`Order ${item.orderNumber}, ${item.statusLabel}, ${money(item.totalCents)}`}
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.cardTop}>
            <Text style={styles.number}>{item.orderNumber}</Text>
            <StatusBadge status={item.status} />
          </View>
          <Text style={styles.preview} numberOfLines={1}>
            {item.itemCount} item{item.itemCount === 1 ? '' : 's'} · {item.itemPreview}
          </Text>
          <View style={styles.meta}>
            <Ionicons name={item.fulfillmentType === 'delivery' ? 'bicycle-outline' : 'storefront-outline'} size={16} color={colors.textMuted} />
            <Text style={styles.metaText} numberOfLines={1}>
              {item.fulfillmentType === 'pickup' && item.pickupStartsAt && item.pickupEndsAt
                ? `Pickup ${formatSlot(item.pickupStartsAt, item.pickupEndsAt)}`
                : `Delivery to ${item.deliveryPostcode ?? 'your address'}`}
            </Text>
          </View>
          <View style={styles.cardBottom}>
            <Text style={styles.metaText}>{formatDateTime(item.createdAt)}</Text>
            <Text style={styles.total}>{money(item.totalCents)}</Text>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1, maxWidth: 700, width: '100%', alignSelf: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { fontSize: font.large, fontWeight: '800', color: colors.text },
  preview: { fontSize: 15, color: colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 14, color: colors.textMuted, flexShrink: 1 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  total: { fontSize: font.large, fontWeight: '800', color: colors.text },
});
