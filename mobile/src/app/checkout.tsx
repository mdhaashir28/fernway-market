// Checkout: delivery or pickup → address or time slot → payment → place order.
// Totals come from the server (/api/checkout/quote), which re-checks every
// price, stock level, offer, delivery area and slot.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, api } from '@/api/client';
import type { Address, CheckoutIssue, FulfillmentType, Order, PaymentMethod, PaymentStart, PickupSlot, Quote } from '@/api/types';
import { RadioCard } from '@/components/RadioCard';
import { EmptyState, LoadingView } from '@/components/states';
import { StoreContact } from '@/components/StoreContact';
import { Badge, Banner, Button, Card, Chip, DemoNote, SectionTitle, TextField } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useStore } from '@/context/StoreContext';
import { useT } from '@/i18n';
import { useErrorText, useIssueText } from '@/i18n/errors';
import { openPaymentPage, paymentReturnUrl } from '@/lib/payments';
import { useApi } from '@/lib/useApi';
import { useFormat } from '@/lib/useFormat';
import { colors, font, radius, spacing } from '@/theme';

// "Choose an address" style problems are steps still to do, not errors.
const TODO_CODES = new Set(['ADDRESS_REQUIRED', 'PICKUP_SLOT_REQUIRED']);

const newIdempotencyKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const { user, restoring, updateProfile } = useAuth();
  const cart = useCart();
  const { store, money } = useStore();
  const { t, localName } = useT();
  const format = useFormat();
  const errorText = useErrorText();
  const issueText = useIssueText();

  const [type, setType] = useState<FulfillmentType>('delivery');
  const [addressId, setAddressId] = useState<number | null>(null);
  const [slotId, setSlotId] = useState<number | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pay_on_fulfillment');
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(false);
  const [whatsappUpdates, setWhatsappUpdates] = useState(Boolean(user?.whatsappOptIn));
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  // One key per checkout: if the request is sent twice, the server returns the same order.
  const [idempotencyKey] = useState(newIdempotencyKey);

  const loggedIn = Boolean(user);
  const addresses = useApi(() => api.get<{ items: Address[] }>('/api/addresses').then((r) => r.items), [user?.id], {
    enabled: loggedIn,
    refetchOnFocus: true,
  });
  const slots = useApi(() => api.get<{ items: PickupSlot[] }>('/api/pickup-slots').then((r) => r.items), [], {
    enabled: loggedIn && type === 'pickup',
  });

  // Pick a sensible address automatically: a newly added one, else the default deliverable one.
  const knownAddressIds = useRef<Set<number> | null>(null);
  useEffect(() => {
    const list = addresses.data;
    if (!list) return;
    const known = knownAddressIds.current;
    const added = known ? list.find((a) => !known.has(a.id) && a.deliveryAvailable) : undefined;
    knownAddressIds.current = new Set(list.map((a) => a.id));
    if (added) return setAddressId(added.id);
    if (addressId && list.some((a) => a.id === addressId)) return;
    const preferred = list.find((a) => a.isDefault && a.deliveryAvailable) ?? list.find((a) => a.deliveryAvailable);
    setAddressId(preferred?.id ?? null);
  }, [addresses.data, addressId]);

  // Group pickup slots by day.
  const days = useMemo(() => {
    const groups = new Map<string, PickupSlot[]>();
    for (const slot of slots.data ?? []) {
      const key = new Date(slot.startsAt).toDateString();
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return [...groups.entries()].map(([key, list]) => ({ key, list, hasSpace: list.some((s) => s.isAvailable) }));
  }, [slots.data]);

  useEffect(() => {
    if (!day && days.length) setDay((days.find((d) => d.hasSpace) ?? days[0]).key);
  }, [days, day]);

  // Ask the server for the real totals whenever the choices change.
  const items = cart.items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
    substitution:
      i.substitution.preference === 'specific' && i.substitution.productId
        ? { preference: 'specific' as const, productId: i.substitution.productId }
        : { preference: i.substitution.preference === 'similar' ? ('similar' as const) : ('none' as const) },
  }));
  const fulfillment =
    type === 'delivery' ? { type, addressId: addressId ?? undefined } : { type, pickupSlotId: slotId ?? undefined };
  const quoteBody = JSON.stringify({ items, fulfillment, useLoyaltyPoints });
  const quote = useApi(() => api.post<Quote>('/api/checkout/quote', JSON.parse(quoteBody)), [quoteBody], {
    enabled: loggedIn && items.length > 0,
  });

  // ------------------------------------------------------------------------
  if (restoring) return <LoadingView />;
  if (!user) {
    return (
      <EmptyState
        icon="person-circle-outline"
        title={t('Log in to check out')}
        message={t('You need an account so you can track your order and see it in your order history.')}
        action={
          <View style={{ gap: spacing.md, width: 260 }}>
            <Button title={t('Log in')} onPress={() => router.push('/login')} />
            <Button title={t('Create an account')} variant="secondary" onPress={() => router.push('/signup')} />
          </View>
        }
      />
    );
  }

  if (cart.items.length === 0) {
    return (
      <EmptyState
        icon="basket-outline"
        title={t('Your cart is empty')}
        message={t('Add some products before checking out.')}
        action={<Button title={t('Start shopping')} onPress={() => router.navigate('/')} />}
      />
    );
  }

  const q = quote.data;
  const issues: CheckoutIssue[] = q?.issues ?? [];
  const problems = issues.filter((i) => !TODO_CODES.has(i.code));
  const todo = issues.find((i) => TODO_CODES.has(i.code));
  const needsPhone = whatsappUpdates && !user.phone;
  const canPlace = Boolean(q?.canPlaceOrder) && !quote.loading && !placing && !(needsPhone && !whatsappPhone.trim());
  const upiMethod = store?.paymentMethods.find((m) => m.id === 'upi');
  // demo = practice page · test = Razorpay test mode (no real money) · live = real money
  const paymentsMode = store?.paymentsMode ?? (upiMethod?.isDemo ? 'demo' : 'live');
  const selectedDay = days.find((d) => d.key === day);
  const loyalty = store?.loyalty.enabled ? store.loyalty : null;
  const productName = (productId?: number) => {
    const item = cart.items.find((i) => i.productId === productId);
    return item ? localName(item) : t('An item');
  };
  const issueContext = {
    productName,
    postcode: q?.fulfillment.type === 'delivery' ? q.fulfillment.postcode : null,
    minOrderText: q?.fulfillment.type === 'delivery' && q.fulfillment.zone ? money(q.fulfillment.zone.minOrderCents) : undefined,
  };

  async function placeOrder() {
    setPlacing(true);
    setPlaceError(null);
    try {
      if (needsPhone) await updateProfile({ phone: whatsappPhone.trim() });
      const { order, payment } = await api.post<{ order: Order; payment: PaymentStart | null }>('/api/orders', {
        items,
        fulfillment,
        paymentMethod,
        useLoyaltyPoints,
        whatsappUpdates,
        notes: notes.trim() || undefined,
        idempotencyKey,
        returnUrl: paymentMethod === 'upi' ? paymentReturnUrl('__ORDER_ID__') : undefined,
      });
      cart.clear();
      router.replace(`/order/${order.id}?placed=1`);
      // UPI: go straight to the secure payment page. If it couldn't be started,
      // the order screen offers "Pay now" and "Pay on delivery instead".
      if (order.status === 'awaiting_payment' && payment) void openPaymentPage(order.id, payment.checkoutUrl);
    } catch (err) {
      setPlaceError(errorText(err));
      // Something changed (stock, slot…) — refresh so the screen shows what to fix.
      quote.reload();
      if (err instanceof ApiError && type === 'pickup') slots.reload();
    } finally {
      setPlacing(false);
    }
  }

  const deliveryValue =
    type === 'pickup'
      ? t('Free')
      : q?.fulfillment.type === 'delivery' && q.fulfillment.zone
        ? q.deliveryFeeCents
          ? money(q.deliveryFeeCents)
          : t('Free')
        : '—';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* 1. Delivery or pickup ------------------------------------------- */}
        <View>
          <SectionTitle>{t('How would you like your order?')}</SectionTitle>
          <View style={styles.segment} accessibilityRole="radiogroup">
            {(
              [
                { value: 'delivery', label: t('Delivery'), icon: 'bicycle', hint: t('To your door') },
                { value: 'pickup', label: t('Pickup'), icon: 'storefront', hint: t('Free · collect in store') },
              ] as const
            ).map((option) => {
              const selected = type === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setType(option.value)}
                  accessibilityRole="radio"
                  aria-checked={selected}
                  accessibilityLabel={`${option.label}, ${option.hint}`}
                  style={[styles.segmentOption, selected && styles.segmentSelected]}
                >
                  <Ionicons name={selected ? 'checkmark-circle' : option.icon} size={26} color={selected ? '#fff' : colors.primaryDark} />
                  <Text style={[styles.segmentLabel, selected && { color: '#fff' }]}>{option.label}</Text>
                  <Text style={[styles.segmentHint, selected && { color: '#D3EADB' }]}>{option.hint}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 2a. Delivery address ------------------------------------------- */}
        {type === 'delivery' && (
          <View style={styles.section}>
            <SectionTitle
              action={
                <Pressable onPress={() => router.push('/addresses/edit')} accessibilityRole="button" hitSlop={8} style={styles.linkButton}>
                  <Text style={styles.link}>{t('+ New address')}</Text>
                </Pressable>
              }
            >
              {t('Delivery address')}
            </SectionTitle>
            {addresses.loading && !addresses.data ? (
              <ActivityIndicator color={colors.primary} />
            ) : addresses.error && !addresses.data ? (
              <Banner kind="error" title={t("Couldn't load your addresses")}>
                {errorText(addresses.error)}
              </Banner>
            ) : addresses.data?.length === 0 ? (
              <Card style={{ gap: spacing.md }}>
                <Text style={styles.body}>{t("Add the address we should deliver to. We'll check that it's in our delivery area.")}</Text>
                <Button title={t('Add delivery address')} icon="add" onPress={() => router.push('/addresses/edit')} />
              </Card>
            ) : (
              addresses.data?.map((address) => (
                <RadioCard
                  key={address.id}
                  selected={addressId === address.id}
                  disabled={!address.deliveryAvailable}
                  onPress={() => setAddressId(address.id)}
                  accessibilityLabel={`${address.label}: ${address.line1}, ${address.city} ${address.postcode}${
                    address.deliveryAvailable ? '' : `, ${t('Outside our delivery area')}`
                  }`}
                >
                  <Text style={styles.optionTitle}>{address.label}</Text>
                  <Text style={styles.body}>
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ''}, {address.city} {address.postcode}
                  </Text>
                  {address.deliveryAvailable && address.deliveryZone ? (
                    <View style={styles.statusLine}>
                      <Ionicons name="checkmark-circle" size={16} color={colors.primaryDark} />
                      <Text style={styles.okText}>
                        {t('We deliver here · {fee}', {
                          fee: address.deliveryZone.feeCents ? money(address.deliveryZone.feeCents) : t('free'),
                        })}
                        {address.deliveryZone.freeDeliveryThresholdCents
                          ? ` ${t('(free over {amount})', { amount: money(address.deliveryZone.freeDeliveryThresholdCents) })}`
                          : ''}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.statusLine}>
                      <Ionicons name="close-circle" size={16} color={colors.danger} />
                      <Text style={styles.badText}>{t('Outside our delivery area — choose Pickup instead')}</Text>
                    </View>
                  )}
                </RadioCard>
              ))
            )}
            {q?.fulfillment.type === 'delivery' && q.fulfillment.amountToFreeDeliveryCents ? (
              <Banner kind="info">{t('Add {amount} more to get free delivery.', { amount: money(q.fulfillment.amountToFreeDeliveryCents) })}</Banner>
            ) : null}
          </View>
        )}

        {/* 2b. Pickup time ------------------------------------------------- */}
        {type === 'pickup' && (
          <View style={styles.section}>
            <SectionTitle>{t('Collection time')}</SectionTitle>
            <Card style={{ gap: spacing.sm }}>
              <View style={styles.storeCard}>
                <Ionicons name="storefront" size={22} color={colors.primary} />
                <Text style={[styles.optionTitle, { flex: 1 }]}>{t('Collect from {name}', { name: store?.name ?? t('our store') })}</Text>
              </View>
              {store && <StoreContact store={store} />}
            </Card>
            {slots.loading && !slots.data ? (
              <ActivityIndicator color={colors.primary} />
            ) : slots.error && !slots.data ? (
              <Banner kind="error" title={t("Couldn't load collection times")}>
                {errorText(slots.error)}
              </Banner>
            ) : days.length === 0 ? (
              <Banner kind="warning">{t('No collection times are available right now. Please try delivery or check back later.')}</Banner>
            ) : (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                  {days.map((d) => (
                    <Chip
                      key={d.key}
                      label={format.day(d.list[0].startsAt) + (d.hasSpace ? '' : ` (${t('full')})`)}
                      selected={day === d.key}
                      onPress={() => setDay(d.key)}
                    />
                  ))}
                </ScrollView>
                <View style={styles.slotGrid} accessibilityRole="radiogroup">
                  {selectedDay?.list.map((slot) => {
                    const selected = slotId === slot.id;
                    const label = `${format.time(slot.startsAt)} – ${format.time(slot.endsAt)}`;
                    return (
                      <Pressable
                        key={slot.id}
                        disabled={!slot.isAvailable}
                        onPress={() => setSlotId(slot.id)}
                        accessibilityRole="radio"
                        aria-checked={selected}
                        aria-disabled={!slot.isAvailable}
                        accessibilityLabel={`${label}${slot.isAvailable ? '' : `, ${t('Full')}`}`}
                        style={[styles.slot, selected && styles.slotSelected, !slot.isAvailable && styles.slotFull]}
                      >
                        <Text style={[styles.slotText, selected && { color: '#fff' }, !slot.isAvailable && { color: colors.textMuted }]}>{label}</Text>
                        {!slot.isAvailable ? (
                          <Text style={styles.slotNote}>{t('Full')}</Text>
                        ) : slot.remaining <= 2 ? (
                          <Text style={[styles.slotNote, selected && { color: '#D3EADB' }]}>{t('{count} left', { count: slot.remaining })}</Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        )}

        {/* 3. Payment ------------------------------------------------------ */}
        <View style={styles.section}>
          <SectionTitle>{t('Payment')}</SectionTitle>
          {upiMethod && (
            <RadioCard
              selected={paymentMethod === 'upi'}
              onPress={() => setPaymentMethod('upi')}
              accessibilityLabel={`${t('Pay now with UPI')}${paymentsMode === 'demo' ? `, ${t('Demo')}` : paymentsMode === 'test' ? `, ${t('TEST MODE')}` : ''}`}
            >
              <View style={styles.methodTitle}>
                <Text style={styles.optionTitle}>{t('Pay now with UPI')}</Text>
                {paymentsMode === 'demo' && <Badge label={t('DEMO')} background={colors.accentSoft} color={colors.accentText} icon="flask-outline" />}
                {paymentsMode === 'test' && <Badge label={t('TEST MODE')} background={colors.accentSoft} color={colors.accentText} icon="flask-outline" />}
              </View>
              <Text style={styles.body}>
                {paymentsMode === 'demo'
                  ? t('Demo mode: you will see a practice payment screen. No money moves and no UPI app opens.')
                  : paymentsMode === 'test'
                    ? t("Razorpay test mode: you'll see Razorpay's test checkout and no real money moves. Use the test UPI ID success@razorpay.")
                    : t('Google Pay, PhonePe, Paytm, BHIM or any UPI app, on the secure Razorpay page. We never see your UPI PIN.')}
              </Text>
            </RadioCard>
          )}
          <RadioCard
            selected={paymentMethod === 'pay_on_fulfillment'}
            onPress={() => setPaymentMethod('pay_on_fulfillment')}
            accessibilityLabel={type === 'pickup' ? t('Pay when you collect') : t('Pay on delivery')}
          >
            <Text style={styles.optionTitle}>{type === 'pickup' ? t('Pay when you collect') : t('Pay on delivery')}</Text>
            <Text style={styles.body}>{t('Pay by UPI, card or cash when you receive your order.')}</Text>
          </RadioCard>
          {paymentMethod === 'upi' && store && (
            <Text style={styles.hint}>
              {t('After you place the order you have {minutes} minutes to pay. Your items are held for you meanwhile.', {
                minutes: store.paymentTimeoutMinutes,
              })}
            </Text>
          )}
        </View>

        {/* 4. Loyalty points ----------------------------------------------- */}
        {loyalty && q?.loyalty.enabled && (
          <Card style={{ gap: spacing.sm }}>
            <View style={styles.toggleRow}>
              <Ionicons name="star" size={22} color={colors.accentText} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>{t('Loyalty points')}</Text>
                <Text style={styles.body}>{t('You have {points} points.', { points: q.loyalty.balance })}</Text>
              </View>
              <Switch
                value={useLoyaltyPoints}
                onValueChange={setUseLoyaltyPoints}
                disabled={q.loyalty.pointsAvailable <= 0 && !useLoyaltyPoints}
                accessibilityLabel={t('Use my loyalty points')}
                trackColor={{ true: colors.primary, false: colors.borderStrong }}
              />
            </View>
            {q.loyalty.pointsAvailable > 0 || useLoyaltyPoints ? (
              <Text style={styles.hint}>
                {useLoyaltyPoints && q.loyalty.pointsUsed > 0
                  ? t('Using {points} points: {amount} off.', { points: q.loyalty.pointsUsed, amount: money(q.loyalty.discountCents) })
                  : t('Use my loyalty points')}
              </Text>
            ) : (
              <Text style={styles.hint}>{t('You can use points once you have {points}.', { points: loyalty.minRedeemPoints })}</Text>
            )}
          </Card>
        )}

        {/* 5. WhatsApp updates --------------------------------------------- */}
        {store?.whatsappUpdatesAvailable && (
          <Card style={{ gap: spacing.sm }}>
            <View style={styles.toggleRow}>
              <Ionicons name="logo-whatsapp" size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.optionTitle}>{t('Order updates on WhatsApp')}</Text>
                <Text style={styles.body}>{t("We'll message you when your order is confirmed, ready or on its way. You always see updates in the app too.")}</Text>
              </View>
              <Switch
                value={whatsappUpdates}
                onValueChange={setWhatsappUpdates}
                accessibilityLabel={t('Send me order updates on WhatsApp')}
                trackColor={{ true: colors.primary, false: colors.borderStrong }}
              />
            </View>
            {store.whatsappIsDemo && whatsappUpdates && (
              <DemoNote>{t('DEMO: messages are previewed by the store, not sent')}</DemoNote>
            )}
            {needsPhone && (
              <TextField
                label={t('WhatsApp mobile number')}
                placeholder="98765 43210"
                keyboardType="phone-pad"
                value={whatsappPhone}
                onChangeText={setWhatsappPhone}
                maxLength={20}
                hint={t('Saved to your profile. You can turn updates off any time in Account.')}
              />
            )}
          </Card>
        )}

        {/* 6. Notes -------------------------------------------------------- */}
        <TextField
          label={t('Notes for the store (optional)')}
          placeholder={t('e.g. Please pack the vegetables separately')}
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={500}
        />

        {/* 7. Summary ------------------------------------------------------ */}
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.optionTitle}>{t('Order summary')}</Text>
          {quote.loading && !q ? (
            <ActivityIndicator color={colors.primary} />
          ) : q ? (
            <>
              <Row label={t('Items ({count})', { count: cart.count })} value={money(q.subtotalCents)} />
              {q.promotions.map((promo) => (
                <Row
                  key={promo.promotionId}
                  label={promo.timesApplied > 1 ? `${localName(promo)} × ${promo.timesApplied}` : localName(promo)}
                  value={`− ${money(promo.discountCents)}`}
                  saving
                />
              ))}
              {q.loyalty.discountCents > 0 && (
                <Row label={t('Loyalty points ({points})', { points: q.loyalty.pointsUsed })} value={`− ${money(q.loyalty.discountCents)}`} saving />
              )}
              <Row label={type === 'delivery' ? t('Delivery') : t('Store pickup')} value={deliveryValue} />
              <View style={styles.divider} />
              <Row label={t('Total')} value={money(q.totalCents)} bold />
              {q.discountCents + q.loyalty.discountCents > 0 && (
                <Text style={styles.savingNote}>{t('You save {amount} on this order', { amount: money(q.discountCents + q.loyalty.discountCents) })}</Text>
              )}
            </>
          ) : quote.error ? (
            <Text style={styles.badText}>{errorText(quote.error)}</Text>
          ) : null}
        </Card>

        {problems.length > 0 && (
          <Banner kind="error" title={t('Please check your order')}>
            <View style={{ gap: 4 }}>
              {problems.map((issue, index) => (
                <Text key={index} style={styles.issueText}>
                  • {issueText(issue, issueContext)}
                </Text>
              ))}
              {problems.some((i) => i.productId) && (
                <Pressable onPress={() => router.navigate('/cart')} accessibilityRole="link" style={styles.linkButton}>
                  <Text style={[styles.issueText, { textDecorationLine: 'underline', fontWeight: '700' }]}>{t('Edit cart')}</Text>
                </Pressable>
              )}
            </View>
          </Banner>
        )}
        {placeError && !problems.length && <Banner kind="error">{placeError}</Banner>}
      </ScrollView>

      {/* Sticky "Place order" bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          title={
            placing
              ? t('Placing your order…')
              : todo
                ? issueText(todo, issueContext)
                : needsPhone && !whatsappPhone.trim()
                  ? t('Add your WhatsApp number')
                  : q
                    ? paymentMethod === 'upi'
                      ? t('Place order and pay · {amount}', { amount: money(q.totalCents) })
                      : t('Place order · {amount}', { amount: money(q.totalCents) })
                    : t('Place order')
          }
          icon={todo ? undefined : paymentMethod === 'upi' ? 'lock-closed' : 'checkmark-circle'}
          loading={placing}
          disabled={!canPlace}
          onPress={placeOrder}
        />
        <Text style={styles.secureNote}>
          {paymentMethod === 'upi'
            ? paymentsMode === 'demo'
              ? t('Demo payment: nothing will be charged.')
              : paymentsMode === 'test'
                ? t('Razorpay test mode: nothing will be charged.')
                : t('You pay on the secure Razorpay page. We never see your UPI PIN.')
            : type === 'pickup'
              ? t("You'll pay when you collect.")
              : t("You'll pay on delivery.")}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value, bold, saving }: { label: string; value: string; bold?: boolean; saving?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.rowBold, saving && styles.rowSaving]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowBold, saving && styles.rowSaving]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: 170, maxWidth: 640, width: '100%', alignSelf: 'center' },
  section: { gap: spacing.md },
  segment: { flexDirection: 'row', gap: spacing.md },
  segmentOption: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  segmentSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentLabel: { fontSize: font.large, fontWeight: '800', color: colors.primaryDark, textAlign: 'center' },
  segmentHint: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  linkButton: { minHeight: 44, justifyContent: 'center' },
  link: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  optionTitle: { fontSize: font.body + 1, fontWeight: '700', color: colors.text },
  methodTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  body: { fontSize: 15, color: colors.textMuted, lineHeight: 21 },
  hint: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  okText: { fontSize: 14, color: colors.primaryDark, fontWeight: '600', flexShrink: 1 },
  badText: { fontSize: 14, color: colors.danger, fontWeight: '600', flexShrink: 1 },
  storeCard: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  toggleRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    flexBasis: '45%', // two equal columns
    flexGrow: 1,
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  slotSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotFull: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
  slotText: { fontSize: 15, fontWeight: '700', color: colors.primaryDark },
  slotNote: { fontSize: 12, color: colors.accentText, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  rowLabel: { fontSize: font.body, color: colors.textMuted, flexShrink: 1 },
  rowValue: { fontSize: font.body, color: colors.text, fontWeight: '600' },
  rowBold: { fontSize: font.large, color: colors.text, fontWeight: '800' },
  rowSaving: { color: colors.primaryDark, fontWeight: '700' },
  savingNote: { fontSize: 14, color: colors.primaryDark, fontWeight: '700', textAlign: 'right' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  issueText: { color: colors.danger, fontSize: 15, lineHeight: 21 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 6,
  },
  secureNote: { textAlign: 'center', color: colors.textMuted, fontSize: 13 },
});
