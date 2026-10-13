// One order: live status, what was ordered, delivery/pickup details.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import type { Order, OrderStatus } from '@/api/types';
import { ProductImage } from '@/components/products';
import { EmptyState, ErrorView, LoadingView } from '@/components/states';
import { Badge, Banner, Button, Card, StatusBadge } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { useToast } from '@/context/ToastContext';
import { confirm } from '@/lib/confirm';
import { STATUS_LABELS, formatDateTime, formatSlot, statusMessage } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { colors, font, spacing } from '@/theme';

export default function OrderScreen() {
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const { store, money } = useStore();
  const toast = useToast();
  const [cancelling, setCancelling] = useState(false);

  const { user } = useAuth();
  const order = useApi(() => api.get<{ order: Order }>(`/api/orders/${id}`).then((r) => r.order), [id, user?.id], {
    enabled: Boolean(user),
    refetchOnFocus: true,
    pollMs: 20_000, // check for status updates from the store every 20 seconds
  });

  if (order.loading && !order.data) return <LoadingView message="Loading your order…" />;
  if (!user) {
    return (
      <EmptyState
        icon="receipt-outline"
        title="Log in to see this order"
        action={<Button title="Log in" onPress={() => router.push('/login')} />}
      />
    );
  }
  if (order.error && !order.data) return <ErrorView error={order.error} onRetry={order.reload} />;
  const o = order.data;
  if (!o) return null;

  async function cancel() {
    const ok = await confirm('Cancel this order?', 'Your items will be released and you will not be charged.', 'Cancel order', true);
    if (!ok) return;
    setCancelling(true);
    try {
      const result = await api.post<{ order: Order }>(`/api/orders/${o!.id}/cancel`, {});
      order.setData(result.order);
      toast('Your order was cancelled');
    } catch (err) {
      toast((err as Error).message, 'error');
      order.reload();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={order.refreshing} onRefresh={order.refresh} tintColor={colors.primary} />}
    >
      <Stack.Screen options={{ title: o.orderNumber }} />

      {placed === '1' && o.status === 'pending' && (
        <Banner kind="success" title="Thank you! Your order is placed 🎉">
          {`We'll let you know here as soon as it's being prepared. Order number: ${o.orderNumber}.`}
        </Banner>
      )}

      {/* Status ------------------------------------------------------------ */}
      <Card style={{ gap: spacing.md }}>
        <View style={styles.statusHeader}>
          <StatusBadge status={o.status} />
          <Text style={styles.muted}>Placed {formatDateTime(o.createdAt)}</Text>
        </View>
        <Text style={styles.statusMessage} accessibilityLiveRegion="polite">
          {statusMessage(o.status, o.fulfillmentType)}
        </Text>
        {o.status === 'cancelled' ? (
          <Banner kind="error" title={o.cancelledBy === 'customer' ? 'You cancelled this order' : 'The store cancelled this order'}>
            {`Reason: ${o.cancelReason ?? 'Not given'}`}
          </Banner>
        ) : (
          <Progress order={o} />
        )}
      </Card>

      {/* Delivery / pickup -------------------------------------------------- */}
      <Card style={{ gap: spacing.sm }}>
        <View style={styles.cardTitleRow}>
          <Ionicons name={o.fulfillmentType === 'delivery' ? 'bicycle' : 'storefront'} size={22} color={colors.primary} />
          <Text style={styles.cardTitle}>{o.fulfillmentType === 'delivery' ? 'Home delivery' : 'Store pickup'}</Text>
        </View>
        {o.delivery && (
          <>
            <Text style={styles.body}>{o.delivery.recipientName}</Text>
            <Text style={styles.body}>
              {o.delivery.line1}
              {o.delivery.line2 ? `, ${o.delivery.line2}` : ''}
            </Text>
            <Text style={styles.body}>
              {o.delivery.city} {o.delivery.postcode}
            </Text>
            {o.delivery.instructions && <Text style={styles.muted}>Note for driver: {o.delivery.instructions}</Text>}
          </>
        )}
        {o.pickup && (
          <>
            <Text style={styles.bodyStrong}>{formatSlot(o.pickup.startsAt, o.pickup.endsAt)}</Text>
            <Text style={styles.body}>{store?.address}</Text>
            <Text style={styles.muted}>Show your order number {o.orderNumber} at the counter.</Text>
          </>
        )}
      </Card>

      {/* Items ------------------------------------------------------------- */}
      <Card style={{ gap: spacing.md }}>
        <Text style={styles.cardTitle}>Items</Text>
        {o.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <ProductImage product={{ id: item.productId, imageUrl: item.imageUrl, icon: item.icon }} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bodyStrong}>{item.productName}</Text>
              <Text style={styles.muted}>
                {item.quantity} × {money(item.unitPriceCents)} · {item.unitLabel}
              </Text>
            </View>
            <Text style={styles.bodyStrong}>{money(item.lineTotalCents)}</Text>
          </View>
        ))}
        <View style={styles.divider} />
        <SummaryRow label="Subtotal" value={money(o.subtotalCents)} />
        {o.fulfillmentType === 'delivery' && (
          <SummaryRow label="Delivery" value={o.deliveryFeeCents ? money(o.deliveryFeeCents) : 'Free'} />
        )}
        <SummaryRow label="Total" value={money(o.totalCents)} bold />
        <View style={styles.paymentRow}>
          <Text style={styles.muted}>
            {o.paymentMethod === 'demo_card' ? 'Demo card payment' : o.fulfillmentType === 'pickup' ? 'Pay when you collect' : 'Pay on delivery'}
          </Text>
          <Badge
            label={o.paymentStatus === 'paid' ? 'Paid' : o.paymentStatus === 'refunded' ? 'Refunded' : 'Not paid yet'}
            background={o.paymentStatus === 'paid' ? colors.primarySoft : colors.surfaceAlt}
            color={o.paymentStatus === 'paid' ? colors.primaryDark : colors.textMuted}
          />
        </View>
        {o.notes && <Text style={styles.muted}>Your note: {o.notes}</Text>}
      </Card>

      {o.canCancel && (
        <Button title="Cancel order" variant="danger" icon="close-circle-outline" loading={cancelling} onPress={cancel} />
      )}
      {!o.canCancel && o.status !== 'cancelled' && o.status !== 'completed' && (
        <Text style={[styles.muted, { textAlign: 'center' }]}>
          Need to change something? Call us{store?.phone ? ` on ${store.phone}` : ''}.
        </Text>
      )}
    </ScrollView>
  );
}

/** The step-by-step progress: Order placed → Preparing → Ready / Out for delivery → Completed */
function Progress({ order }: { order: Order }) {
  const middle: OrderStatus = order.fulfillmentType === 'pickup' ? 'ready_for_pickup' : 'out_for_delivery';
  const steps: OrderStatus[] = ['pending', 'preparing', middle, 'completed'];
  const currentIndex = steps.indexOf(order.status);
  const timeFor = (status: OrderStatus) => order.history.find((h) => h.status === status)?.createdAt;

  return (
    <View style={styles.progress} accessibilityLabel={`Progress: ${STATUS_LABELS[order.status]}`}>
      {steps.map((step, index) => {
        const done = index <= currentIndex;
        const at = timeFor(step);
        return (
          <View key={step} style={styles.step}>
            <View style={styles.stepMarker}>
              <View style={[styles.dot, done && styles.dotDone]}>{done && <Ionicons name="checkmark" size={14} color="#fff" />}</View>
              {index < steps.length - 1 && <View style={[styles.line, index < currentIndex && styles.lineDone]} />}
            </View>
            <View style={styles.stepText}>
              <Text style={[styles.stepLabel, done && { color: colors.text }]}>{STATUS_LABELS[step]}</Text>
              {at && <Text style={styles.muted}>{formatDateTime(at)}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.body, bold && styles.bold]}>{label}</Text>
      <Text style={[styles.body, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  statusHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  statusMessage: { fontSize: font.large, fontWeight: '700', color: colors.text, lineHeight: 25 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { fontSize: font.large, fontWeight: '800', color: colors.text },
  body: { fontSize: font.body, color: colors.text, lineHeight: 22 },
  bodyStrong: { fontSize: font.body, color: colors.text, fontWeight: '700' },
  muted: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  bold: { fontWeight: '800', fontSize: font.large },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  divider: { height: 1, backgroundColor: colors.border },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },

  progress: { gap: 0 },
  step: { flexDirection: 'row', gap: spacing.md, minHeight: 52 },
  stepMarker: { alignItems: 'center', width: 24 },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  line: { flex: 1, width: 3, backgroundColor: colors.border, marginVertical: 2, borderRadius: 2 },
  lineDone: { backgroundColor: colors.primary },
  stepText: { flex: 1, paddingBottom: spacing.md },
  stepLabel: { fontSize: font.body, fontWeight: '700', color: colors.textMuted },
});
