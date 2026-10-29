// One order: live status, payment, what was ordered (and any replacements),
// refunds, updates from the store, and help.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import type { AppNotification, Order, OrderItem, OrderStatus, PaymentStart, PaymentStatus } from '@/api/types';
import { ProductImage } from '@/components/products';
import { EmptyState, ErrorView, LoadingView } from '@/components/states';
import { CallButton, StoreContact, storePhones } from '@/components/StoreContact';
import { Badge, Banner, Button, Card, StatusBadge } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationsContext';
import { useStore } from '@/context/StoreContext';
import { useToast } from '@/context/ToastContext';
import { useT } from '@/i18n';
import { useErrorText } from '@/i18n/errors';
import { confirm } from '@/lib/confirm';
import { onPaymentReturn, openPaymentPage, parseOutcome, paymentReturnUrl, type PaymentOutcome } from '@/lib/payments';
import { useAddToCart } from '@/lib/reorder';
import { supportTopicLabel } from '@/lib/support';
import { useApi } from '@/lib/useApi';
import { useFormat } from '@/lib/useFormat';
import { colors, font, radius, spacing } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export default function OrderScreen() {
  const params = useLocalSearchParams<{ id: string; placed?: string; payment?: string }>();
  const { id, placed } = params;
  const { store, money } = useStore();
  const { t, localName } = useT();
  const format = useFormat();
  const toast = useToast();
  const errorText = useErrorText();
  const notifications = useNotifications();
  const { reorder, busy: reordering } = useAddToCart();
  const [busy, setBusy] = useState<null | 'pay' | 'check' | 'switch' | 'cancel'>(null);
  const [outcome, setOutcome] = useState<PaymentOutcome | null>(parseOutcome(params.payment));

  const { user } = useAuth();
  const [awaiting, setAwaiting] = useState(false);
  const order = useApi(() => api.get<{ order: Order }>(`/api/orders/${id}`).then((r) => r.order), [id, user?.id], {
    enabled: Boolean(user),
    refetchOnFocus: true,
    // Check for updates from the store every 20 seconds (every 5 while we wait for a payment).
    pollMs: awaiting ? 5_000 : 20_000,
  });
  const updates = useApi(
    () => api.get<{ items: AppNotification[] }>(`/api/notifications?orderId=${id}&limit=30`).then((r) => r.items),
    [id, user?.id, order.data?.status, order.data?.paymentStatus, order.data?.refunds.length],
    { enabled: Boolean(user) },
  );

  useEffect(() => setAwaiting(order.data?.status === 'awaiting_payment'), [order.data?.status]);
  useEffect(() => setOutcome(parseOutcome(params.payment)), [params.payment]);

  // Coming back from the payment page on a phone: ask the server what happened.
  useEffect(
    () =>
      onPaymentReturn((orderId, result) => {
        if (String(orderId) !== String(id)) return;
        setOutcome(result);
        void checkPayment(true);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );

  // Mark this order's updates as read.
  useEffect(() => {
    const unread = (updates.data ?? []).filter((n) => !n.readAt).map((n) => n.id);
    if (!unread.length) return;
    api
      .post('/api/notifications/read', { ids: unread })
      .then(() => notifications.refresh())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updates.data]);

  if (order.loading && !order.data) return <LoadingView message={t('Loading your order…')} />;
  if (!user) {
    return (
      <EmptyState
        icon="receipt-outline"
        title={t('Log in to see this order')}
        action={<Button title={t('Log in')} onPress={() => router.push('/login')} />}
      />
    );
  }
  if (order.error && !order.data) return <ErrorView error={order.error} onRetry={order.reload} />;
  const o = order.data;
  if (!o) return null;

  async function run(kind: NonNullable<typeof busy>, action: () => Promise<void>) {
    setBusy(kind);
    try {
      await action();
    } catch (err) {
      toast(errorText(err), 'error');
      order.reload();
    } finally {
      setBusy(null);
    }
  }

  async function checkPayment(quiet = false) {
    try {
      const result = await api.post<{ order: Order }>(`/api/orders/${id}/payments/refresh`, {});
      order.setData(result.order);
      if (!quiet && result.order.status === 'awaiting_payment') toast(t('No payment has been received yet.'));
    } catch (err) {
      if (!quiet) toast(errorText(err), 'error');
    }
  }

  const pay = () =>
    run('pay', async () => {
      setOutcome(null);
      const { payment, order: updated } = await api.post<{ payment: PaymentStart; order: Order }>(`/api/orders/${o.id}/payments`, {
        returnUrl: paymentReturnUrl(o.id),
      });
      order.setData(updated);
      await openPaymentPage(o.id, payment.checkoutUrl);
    });

  const switchToPayOnDelivery = () =>
    run('switch', async () => {
      const result = await api.post<{ order: Order }>(`/api/orders/${o.id}/pay-on-delivery`, {});
      order.setData(result.order);
      setOutcome(null);
      toast(o.fulfillmentType === 'pickup' ? t("Done — you'll pay when you collect.") : t("Done — you'll pay on delivery."));
    });

  async function cancel() {
    const paid = o!.paidCents > 0;
    const ok = await confirm(
      t('Cancel this order?'),
      paid ? t('Your items will be released and your payment will be refunded automatically.') : t('Your items will be released and you will not be charged.'),
      t('Cancel order'),
      true,
      t('Keep order'),
    );
    if (!ok) return;
    await run('cancel', async () => {
      const result = await api.post<{ order: Order }>(`/api/orders/${o!.id}/cancel`, {});
      order.setData(result.order);
      toast(t('Your order was cancelled'));
    });
  }

  const awaitingPayment = o.status === 'awaiting_payment';
  const latest = o.payment.latestAttempt;
  const paymentNotice = awaitingPayment ? paymentNoticeFor(outcome, latest?.status, latest?.failureReason, t) : null;
  const finished = o.status === 'completed' || o.status === 'cancelled';
  const hasChanges = o.items.some((i) => i.fulfilmentStatus !== 'ordered');

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={order.refreshing} onRefresh={order.refresh} tintColor={colors.primary} />}
    >
      <Stack.Screen options={{ title: o.orderNumber }} />

      {placed === '1' && o.status === 'confirmed' && (
        <Banner kind="success" title={t('Thank you! Your order is placed')}>
          {t("We'll let you know here as soon as it's being prepared. Order number: {number}.", { number: o.orderNumber })}
        </Banner>
      )}
      {outcome === 'paid' && !awaitingPayment && o.paidCents > 0 && (
        <Banner kind="success" title={t('Payment received')}>
          {t('Thank you! Your payment of {amount} is confirmed.', { amount: money(o.paidCents) })}
        </Banner>
      )}

      {/* Waiting for payment ------------------------------------------------ */}
      {awaitingPayment && (
        <Card style={styles.payCard}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="time-outline" size={22} color={colors.accentText} />
            <Text style={styles.cardTitle}>{t('Waiting for your payment')}</Text>
            {o.payment.mode === 'demo' && <Badge label={t('DEMO')} background={colors.accentSoft} color={colors.accentText} icon="flask-outline" />}
            {o.payment.mode === 'test' && <Badge label={t('TEST MODE')} background={colors.accentSoft} color={colors.accentText} icon="flask-outline" />}
          </View>
          <Text style={styles.body}>
            {o.payment.dueBy
              ? t('Pay {amount} by UPI before {time} to confirm your order. Your items are held until then.', {
                  amount: money(o.totalCents),
                  time: format.time(o.payment.dueBy),
                })
              : t('Pay {amount} by UPI to confirm your order.', { amount: money(o.totalCents) })}
          </Text>
          {paymentNotice && (
            <Banner kind={paymentNotice.kind} title={paymentNotice.title}>
              {paymentNotice.message}
            </Banner>
          )}
          {o.payment.mode === 'demo' && <Text style={styles.muted}>{t('Demo mode: the payment screen is for practice. No money moves.')}</Text>}
          {o.payment.mode === 'test' && (
            <Text style={styles.muted}>{t('Razorpay test mode: no real money moves. Use the test UPI ID success@razorpay.')}</Text>
          )}
          <Button
            title={latest && latest.status !== 'created' ? t('Try paying again') : t('Pay now with UPI')}
            icon="lock-closed"
            loading={busy === 'pay'}
            disabled={busy !== null}
            onPress={pay}
          />
          <Button
            title={t('Check payment status')}
            icon="refresh"
            variant="secondary"
            loading={busy === 'check'}
            disabled={busy !== null}
            onPress={() => run('check', () => checkPayment())}
          />
          {o.canSwitchToPayOnDelivery && (
            <Button
              title={o.fulfillmentType === 'pickup' ? t('Pay when I collect instead') : t('Pay on delivery instead')}
              icon="cash-outline"
              variant="ghost"
              loading={busy === 'switch'}
              disabled={busy !== null}
              onPress={switchToPayOnDelivery}
            />
          )}
          <Text style={styles.muted}>{t('We never ask for your UPI PIN. Only enter it in your own UPI app.')}</Text>
        </Card>
      )}

      {/* Status ------------------------------------------------------------ */}
      <Card style={{ gap: spacing.md }}>
        <View style={styles.statusHeader}>
          <StatusBadge status={o.status} />
          <Text style={styles.muted}>{t('Placed {date}', { date: format.dateTime(o.createdAt) })}</Text>
        </View>
        <Text style={styles.statusMessage} accessibilityLiveRegion="polite">
          {format.statusMessage(o.status, o.fulfillmentType)}
        </Text>
        {o.status === 'cancelled' ? (
          <Banner kind="error" title={o.cancelledBy === 'customer' ? t('You cancelled this order') : t('The store cancelled this order')}>
            {t('Reason: {reason}', { reason: o.cancelReason ? t(o.cancelReason) : t('Not given') })}
          </Banner>
        ) : (
          !awaitingPayment && <Progress order={o} />
        )}
      </Card>

      {/* Refunds ----------------------------------------------------------- */}
      {o.refunds.length > 0 && (
        <Card style={{ gap: spacing.sm }}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="return-down-back" size={22} color={colors.primary} />
            <Text style={styles.cardTitle}>{t('Refunds')}</Text>
          </View>
          {o.refunds.map((refund) => (
            <View key={refund.id} style={styles.refundRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bodyStrong}>{money(refund.amountCents)}</Text>
                <Text style={styles.muted}>
                  {refund.status === 'processed'
                    ? t('Refunded on {date}. It can take 2–7 working days to show in your bank account.', {
                        date: format.date(refund.processedAt ?? refund.createdAt),
                      })
                    : refund.status === 'failed'
                      ? t('This refund is delayed. The store has been told and will sort it out — you can also call us.')
                      : t('Refund started on {date}. It usually reaches your bank account in 2–7 working days.', { date: format.date(refund.createdAt) })}
                </Text>
              </View>
              <Badge {...refundBadge(refund.status, t)} />
            </View>
          ))}
        </Card>
      )}

      {/* Delivery / pickup -------------------------------------------------- */}
      <Card style={{ gap: spacing.sm }}>
        <View style={styles.cardTitleRow}>
          <Ionicons name={o.fulfillmentType === 'delivery' ? 'bicycle' : 'storefront'} size={22} color={colors.primary} />
          <Text style={styles.cardTitle}>{o.fulfillmentType === 'delivery' ? t('Home delivery') : t('Store pickup')}</Text>
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
            {o.delivery.instructions && <Text style={styles.muted}>{t('Note for driver: {note}', { note: o.delivery.instructions })}</Text>}
          </>
        )}
        {o.pickup && (
          <>
            <Text style={styles.bodyStrong}>{format.slot(o.pickup.startsAt, o.pickup.endsAt)}</Text>
            {store && <StoreContact store={store} />}
            <Text style={styles.muted}>{t('Show your order number {number} at the counter.', { number: o.orderNumber })}</Text>
          </>
        )}
      </Card>

      {/* Items ------------------------------------------------------------- */}
      <Card style={{ gap: spacing.md }}>
        <Text style={styles.cardTitle}>{t('Items')}</Text>
        {hasChanges && (
          <Banner kind="info">{t("Some items were changed because they ran out. You're only charged for what you get.")}</Banner>
        )}
        {o.items.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
        <View style={styles.divider} />
        <SummaryRow label={t('Subtotal')} value={money(o.subtotalCents)} />
        {o.promotions.map((promo, index) => (
          <SummaryRow
            key={index}
            label={promo.timesApplied > 1 ? `${t(promo.name)} × ${promo.timesApplied}` : t(promo.name)}
            value={`− ${money(promo.discountCents)}`}
            saving
          />
        ))}
        {o.loyaltyDiscountCents > 0 && (
          <SummaryRow label={t('Loyalty points ({points})', { points: o.loyaltyPointsRedeemed })} value={`− ${money(o.loyaltyDiscountCents)}`} saving />
        )}
        {o.fulfillmentType === 'delivery' && <SummaryRow label={t('Delivery')} value={o.deliveryFeeCents ? money(o.deliveryFeeCents) : t('Free')} />}
        <SummaryRow label={t('Total')} value={money(o.totalCents)} bold />
        {o.refundedCents > 0 && <SummaryRow label={t('Refunded')} value={`− ${money(o.refundedCents)}`} saving />}
        <View style={styles.paymentRow}>
          <Text style={[styles.muted, { flex: 1 }]}>
            {o.paymentMethod === 'upi'
              ? t('UPI')
              : o.paymentMethod === 'demo_card'
                ? t('Demo payment (no money moved)')
                : o.fulfillmentType === 'pickup'
                  ? t('Pay when you collect')
                  : t('Pay on delivery')}
          </Text>
          <Badge {...paymentBadge(o.paymentStatus, o.paymentMethod === 'upi', t)} />
        </View>
        {o.loyaltyPointsEarned > 0 && (
          <View style={styles.pointsRow}>
            <Ionicons name="star" size={16} color={colors.accentText} />
            <Text style={styles.muted}>{t('You earned {points} loyalty points on this order.', { points: o.loyaltyPointsEarned })}</Text>
          </View>
        )}
        {o.notes && <Text style={styles.muted}>{t('Your note: {note}', { note: o.notes })}</Text>}
      </Card>

      {/* Updates ----------------------------------------------------------- */}
      {(updates.data?.length ?? 0) > 0 && (
        <Card style={{ gap: spacing.md }}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="notifications-outline" size={22} color={colors.primary} />
            <Text style={styles.cardTitle}>{t('Updates')}</Text>
            {o.whatsappUpdates && <Badge label={t('Also on WhatsApp')} background={colors.primarySoft} color={colors.primaryDark} icon="logo-whatsapp" />}
          </View>
          {updates.data!.map((n) => (
            <View key={n.id} style={styles.updateRow}>
              <View style={styles.updateDot} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.bodyStrong}>{n.title}</Text>
                <Text style={styles.body}>{n.body}</Text>
                <Text style={styles.muted}>{format.dateTime(n.createdAt)}</Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      {/* Problems reported -------------------------------------------------- */}
      {o.supportRequests.length > 0 && (
        <Card style={{ gap: spacing.md }}>
          <Text style={styles.cardTitle}>{t('Problems you reported')}</Text>
          {o.supportRequests.map((request) => (
            <View key={request.id} style={{ gap: 4 }}>
              <View style={styles.paymentRow}>
                <Text style={[styles.bodyStrong, { flex: 1 }]}>{t(supportTopicLabel(request.topic))}</Text>
                <Badge
                  label={request.status === 'resolved' ? t('Answered') : t('Waiting for the store')}
                  background={request.status === 'resolved' ? colors.primarySoft : colors.accentSoft}
                  color={request.status === 'resolved' ? colors.primaryDark : colors.accentText}
                  icon={request.status === 'resolved' ? 'checkmark-circle' : 'time-outline'}
                />
              </View>
              <Text style={styles.body}>{request.message}</Text>
              {request.staffReply && (
                <View style={styles.reply}>
                  <Text style={styles.replyLabel}>{t('Reply from the store')}</Text>
                  <Text style={styles.body}>{request.staffReply}</Text>
                </View>
              )}
            </View>
          ))}
        </Card>
      )}

      {/* Actions ----------------------------------------------------------- */}
      <View style={{ gap: spacing.sm }}>
        {finished && (
          <Button title={t('Order these items again')} icon="repeat" loading={reordering} onPress={() => reorder(o.id)} />
        )}
        <Button
          title={t('Report a problem with this order')}
          icon="chatbubble-ellipses-outline"
          variant="secondary"
          onPress={() => router.push(`/help/report?orderId=${o.id}`)}
        />
        {o.canCancel && (
          <Button title={t('Cancel order')} variant="danger" icon="close-circle-outline" loading={busy === 'cancel'} disabled={busy !== null} onPress={cancel} />
        )}
      </View>
      {!o.canCancel && !finished && !awaitingPayment && (
        <View style={{ gap: spacing.sm }}>
          <Text style={[styles.muted, { textAlign: 'center' }]}>
            {t('Need to change or cancel something? Call us and quote {number}.', { number: o.orderNumber })}
          </Text>
          {storePhones(store).map((phone) => (
            <CallButton key={phone.tel} phone={phone} />
          ))}
        </View>
      )}
    </ScrollView>
  );

  function ItemRow({ item }: { item: OrderItem }) {
    const name = localName({ name: item.productName, nameTa: item.productNameTa });
    const changed = item.chargedCents !== item.lineTotalCents;
    return (
      <View style={{ gap: 6 }}>
        <View style={styles.itemRow}>
          <ProductImage product={{ name: item.productName, nameTa: item.productNameTa, imageUrl: item.imageUrl }} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.bodyStrong, item.fulfilmentStatus === 'unavailable' && styles.struck]}>{name}</Text>
            <Text style={styles.muted}>
              {item.quantity} × {money(item.unitPriceCents)} · {item.unitLabel}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {changed && <Text style={[styles.muted, styles.struck]}>{money(item.lineTotalCents)}</Text>}
            <Text style={styles.bodyStrong}>{money(item.chargedCents)}</Text>
          </View>
        </View>
        {item.fulfilmentStatus === 'unavailable' ? (
          <ItemNote icon="close-circle" tone="danger" text={t('Out of stock — removed. You are not charged for it.')} />
        ) : item.fulfilmentStatus === 'substituted' ? (
          <ItemNote
            icon="swap-horizontal"
            tone="info"
            text={t('Replaced with {name} ({quantity} × {unit}). You pay {amount}.', {
              name: localName({ name: item.substituteName ?? '', nameTa: item.substituteNameTa }),
              quantity: item.substituteQuantity ?? item.quantity,
              unit: item.substituteUnitLabel ?? '',
              amount: money(item.chargedCents),
            })}
          />
        ) : !finished && item.substitutionPreference !== 'none' ? (
          <ItemNote
            icon="swap-horizontal-outline"
            tone="muted"
            text={
              item.substitutionPreference === 'specific' && item.preferredSubstituteName
                ? t('If unavailable: replace with {name}', {
                    name: localName({ name: item.preferredSubstituteName, nameTa: item.preferredSubstituteNameTa }),
                  })
                : t('If unavailable: replace with a similar item')
            }
          />
        ) : null}
      </View>
    );
  }
}

function ItemNote({ icon, text, tone }: { icon: IconName; text: string; tone: 'danger' | 'info' | 'muted' }) {
  const color = tone === 'danger' ? colors.danger : tone === 'info' ? colors.info : colors.textMuted;
  return (
    <View style={[styles.itemNote, tone === 'danger' && { backgroundColor: colors.dangerSoft }, tone === 'info' && { backgroundColor: colors.infoSoft }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.itemNoteText, { color: tone === 'muted' ? colors.textMuted : color }]}>{text}</Text>
    </View>
  );
}

type T = (text: string, params?: Record<string, string | number>) => string;

function paymentNoticeFor(
  outcome: PaymentOutcome | null,
  attemptStatus: string | undefined,
  failureReason: string | null | undefined,
  t: T,
): { kind: 'error' | 'warning' | 'info'; title: string; message: string } | null {
  const status = attemptStatus === 'pending' || outcome === 'pending' ? 'pending' : outcome && outcome !== 'paid' && outcome !== 'closed' ? outcome : attemptStatus;
  if (status === 'failed')
    return {
      kind: 'error',
      title: t('Payment failed'),
      message: failureReason
        ? t('{reason}. No money was taken. You can try again or choose another way to pay.', { reason: t(failureReason.replace(/\.$/, '')) })
        : t('No money was taken. You can try again or choose another way to pay.'),
    };
  if (status === 'cancelled')
    return { kind: 'warning', title: t('Payment cancelled'), message: t('You closed the payment screen before paying. Your order is still waiting.') };
  if (status === 'pending')
    return {
      kind: 'info',
      title: t('Payment pending'),
      message: t("Your bank hasn't confirmed the payment yet. This page updates by itself. Don't pay twice — if money was taken and the payment fails, it is refunded automatically."),
    };
  if (status === 'expired') return { kind: 'warning', title: t('Payment link expired'), message: t('Tap "Try paying again" to get a new one.') };
  return null;
}

function paymentBadge(status: PaymentStatus, isUpi: boolean, t: T): { label: string; background: string; color: string; icon: IconName } {
  switch (status) {
    case 'paid':
      return { label: t('Paid'), background: colors.primarySoft, color: colors.primaryDark, icon: 'checkmark-circle' };
    case 'pending':
      return { label: t('Payment pending'), background: colors.infoSoft, color: colors.info, icon: 'time-outline' };
    case 'failed':
      return { label: t('Payment failed'), background: colors.dangerSoft, color: colors.danger, icon: 'close-circle' };
    case 'refund_pending':
      return { label: t('Refund in progress'), background: colors.infoSoft, color: colors.info, icon: 'return-down-back' };
    case 'partially_refunded':
      return { label: t('Partly refunded'), background: colors.tealSoft, color: colors.teal, icon: 'return-down-back' };
    case 'refunded':
      return { label: t('Refunded'), background: colors.tealSoft, color: colors.teal, icon: 'return-down-back' };
    default:
      return { label: isUpi ? t('Not paid yet') : t('Pay on delivery'), background: colors.surfaceAlt, color: colors.textMuted, icon: 'wallet-outline' };
  }
}

function refundBadge(status: 'pending' | 'processed' | 'failed', t: T): { label: string; background: string; color: string; icon: IconName } {
  if (status === 'processed') return { label: t('Refunded'), background: colors.primarySoft, color: colors.primaryDark, icon: 'checkmark-circle' };
  if (status === 'failed') return { label: t('Delayed'), background: colors.accentSoft, color: colors.accentText, icon: 'alert-circle' };
  return { label: t('In progress'), background: colors.infoSoft, color: colors.info, icon: 'time-outline' };
}

/** The step-by-step progress: Order confirmed → Preparing → Ready / Out for delivery → Completed */
function Progress({ order }: { order: Order }) {
  const format = useFormat();
  const { t } = useT();
  const middle: OrderStatus = order.fulfillmentType === 'pickup' ? 'ready_for_pickup' : 'out_for_delivery';
  const steps: OrderStatus[] = ['confirmed', 'preparing', middle, 'completed'];
  const currentIndex = steps.indexOf(order.status);
  const timeFor = (status: OrderStatus) => [...order.history].reverse().find((h) => h.status === status)?.createdAt;

  return (
    <View style={styles.progress} accessibilityLabel={t('Progress: {status}', { status: format.statusLabel(order.status) })}>
      {steps.map((step, index) => {
        const done = index <= currentIndex;
        const current = index === currentIndex;
        const at = timeFor(step);
        return (
          <View key={step} style={styles.step}>
            <View style={styles.stepMarker}>
              <View style={[styles.dot, done && styles.dotDone]}>{done && <Ionicons name="checkmark" size={14} color="#fff" />}</View>
              {index < steps.length - 1 && <View style={[styles.line, index < currentIndex && styles.lineDone]} />}
            </View>
            <View style={styles.stepText}>
              <Text style={[styles.stepLabel, done && { color: colors.text }, current && { fontWeight: '800' }]}>
                {format.statusLabel(step)}
                {current ? ` · ${t('now')}` : ''}
              </Text>
              {at && <Text style={styles.muted}>{format.dateTime(at)}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SummaryRow({ label, value, bold, saving }: { label: string; value: string; bold?: boolean; saving?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.body, { flexShrink: 1 }, bold && styles.bold, saving && styles.saving]}>{label}</Text>
      <Text style={[styles.body, bold && styles.bold, saving && styles.saving]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  payCard: { gap: spacing.md, borderColor: colors.accent, borderWidth: 1.5 },
  statusHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  statusMessage: { fontSize: font.large, fontWeight: '700', color: colors.text, lineHeight: 25 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  cardTitle: { fontSize: font.large, fontWeight: '800', color: colors.text, flexShrink: 1 },
  body: { fontSize: font.body, color: colors.text, lineHeight: 22 },
  bodyStrong: { fontSize: font.body, color: colors.text, fontWeight: '700' },
  muted: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  bold: { fontWeight: '800', fontSize: font.large },
  saving: { color: colors.primaryDark, fontWeight: '700' },
  struck: { textDecorationLine: 'line-through' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginLeft: 48 + spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  itemNoteText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  pointsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  refundRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  updateRow: { flexDirection: 'row', gap: spacing.md },
  updateDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 7 },
  reply: { backgroundColor: colors.primaryTint, borderRadius: radius.sm, padding: spacing.sm, gap: 2, borderLeftWidth: 3, borderLeftColor: colors.primary },
  replyLabel: { fontSize: 13, fontWeight: '800', color: colors.primaryDark },

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
