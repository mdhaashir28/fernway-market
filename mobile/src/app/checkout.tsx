// Checkout: delivery or pickup → address or time slot → payment → place order.
// Totals come from the server (/api/checkout/quote), which re-checks every
// price, stock level, delivery area and slot.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, api } from '@/api/client';
import type { Address, CheckoutIssue, FulfillmentType, Order, PaymentMethod, PickupSlot, Quote } from '@/api/types';
import { RadioCard } from '@/components/RadioCard';
import { EmptyState, LoadingView } from '@/components/states';
import { StoreContact } from '@/components/StoreContact';
import { Badge, Banner, Button, Card, Chip, SectionTitle, TextField } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useStore } from '@/context/StoreContext';
import { formatDay, formatTime } from '@/lib/format';
import { useApi } from '@/lib/useApi';
import { colors, font, radius, spacing } from '@/theme';

const FALLBACK_PAYMENT_METHODS = [
  { id: 'pay_on_fulfillment' as const, label: 'Pay on delivery or collection', description: 'Pay by card or cash when you receive your order.', isDemo: false },
  { id: 'demo_card' as const, label: 'Demo card payment', description: 'DEMO ONLY — no card details are collected and no money is taken.', isDemo: true },
];

// "Choose an address" style problems are steps still to do, not errors.
const TODO_CODES = new Set(['ADDRESS_REQUIRED', 'PICKUP_SLOT_REQUIRED']);

const newIdempotencyKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const { user, restoring } = useAuth();
  const cart = useCart();
  const { store, money } = useStore();

  const [type, setType] = useState<FulfillmentType>('delivery');
  const [addressId, setAddressId] = useState<number | null>(null);
  const [slotId, setSlotId] = useState<number | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pay_on_fulfillment');
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
  const items = cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
  const fulfillment =
    type === 'delivery' ? { type, addressId: addressId ?? undefined } : { type, pickupSlotId: slotId ?? undefined };
  const quoteBody = JSON.stringify({ items, fulfillment });
  const quote = useApi(() => api.post<Quote>('/api/checkout/quote', JSON.parse(quoteBody)), [quoteBody], {
    enabled: loggedIn && items.length > 0,
  });

  // ------------------------------------------------------------------------
  if (restoring) return <LoadingView />;
  if (!user) {
    return (
      <EmptyState
        icon="person-circle-outline"
        title="Log in to check out"
        message="You need an account so you can track your order and see it in your order history."
        action={
          <View style={{ gap: spacing.md, width: 260 }}>
            <Button title="Log in" onPress={() => router.push('/login')} />
            <Button title="Create an account" variant="secondary" onPress={() => router.push('/signup')} />
          </View>
        }
      />
    );
  }

  if (cart.items.length === 0) {
    return (
      <EmptyState
        icon="basket-outline"
        title="Your cart is empty"
        message="Add some products before checking out."
        action={<Button title="Start shopping" onPress={() => router.navigate('/')} />}
      />
    );
  }

  const q = quote.data;
  const issues: CheckoutIssue[] = q?.issues ?? [];
  const problems = issues.filter((i) => !TODO_CODES.has(i.code));
  const todo = issues.find((i) => TODO_CODES.has(i.code));
  const canPlace = Boolean(q?.canPlaceOrder) && !quote.loading && !placing;
  const paymentMethods = store?.paymentMethods ?? FALLBACK_PAYMENT_METHODS;
  const selectedDay = days.find((d) => d.key === day);

  async function placeOrder() {
    setPlacing(true);
    setPlaceError(null);
    try {
      const { order } = await api.post<{ order: Order }>('/api/orders', {
        items,
        fulfillment,
        paymentMethod,
        notes: notes.trim() || undefined,
        idempotencyKey,
      });
      cart.clear();
      router.replace(`/order/${order.id}?placed=1`);
    } catch (err) {
      setPlaceError((err as Error).message);
      // Something changed (stock, slot…) — refresh so the screen shows what to fix.
      quote.reload();
      if (err instanceof ApiError && type === 'pickup') slots.reload();
    } finally {
      setPlacing(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* 1. Delivery or pickup ------------------------------------------- */}
        <View>
          <SectionTitle>How would you like your order?</SectionTitle>
          <View style={styles.segment} accessibilityRole="radiogroup">
            {(
              [
                { value: 'delivery', label: 'Delivery', icon: 'bicycle', hint: 'To your door' },
                { value: 'pickup', label: 'Pickup', icon: 'storefront', hint: 'Free · collect in store' },
              ] as const
            ).map((option) => {
              const selected = type === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setType(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  style={[styles.segmentOption, selected && styles.segmentSelected]}
                >
                  <Ionicons name={option.icon} size={26} color={selected ? '#fff' : colors.primaryDark} />
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
                <Pressable onPress={() => router.push('/addresses/edit')} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.link}>+ New address</Text>
                </Pressable>
              }
            >
              Delivery address
            </SectionTitle>
            {addresses.loading && !addresses.data ? (
              <ActivityIndicator color={colors.primary} />
            ) : addresses.error && !addresses.data ? (
              <Banner kind="error" title="Couldn't load your addresses">
                {addresses.error.message}
              </Banner>
            ) : addresses.data?.length === 0 ? (
              <Card style={{ gap: spacing.md }}>
                <Text style={styles.body}>Add the address we should deliver to. We'll check that it's in our delivery area.</Text>
                <Button title="Add delivery address" icon="add" onPress={() => router.push('/addresses/edit')} />
              </Card>
            ) : (
              addresses.data?.map((address) => (
                <RadioCard
                  key={address.id}
                  selected={addressId === address.id}
                  disabled={!address.deliveryAvailable}
                  onPress={() => setAddressId(address.id)}
                  accessibilityLabel={`${address.label}: ${address.line1}, ${address.city} ${address.postcode}${
                    address.deliveryAvailable ? '' : ', outside our delivery area'
                  }`}
                >
                  <Text style={styles.optionTitle}>{address.label}</Text>
                  <Text style={styles.body}>
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ''}, {address.city} {address.postcode}
                  </Text>
                  {address.deliveryAvailable && address.deliveryZone ? (
                    <Text style={styles.okText}>
                      ✓ We deliver here · {address.deliveryZone.feeCents ? money(address.deliveryZone.feeCents) : 'free'}
                      {address.deliveryZone.freeDeliveryThresholdCents
                        ? ` (free over ${money(address.deliveryZone.freeDeliveryThresholdCents)})`
                        : ''}
                    </Text>
                  ) : (
                    <Text style={styles.badText}>Outside our delivery area — choose Pickup instead</Text>
                  )}
                </RadioCard>
              ))
            )}
            {q?.fulfillment.type === 'delivery' && q.fulfillment.amountToFreeDeliveryCents ? (
              <Banner kind="info">{`Add ${money(q.fulfillment.amountToFreeDeliveryCents)} more to get free delivery.`}</Banner>
            ) : null}
          </View>
        )}

        {/* 2b. Pickup time ------------------------------------------------- */}
        {type === 'pickup' && (
          <View style={styles.section}>
            <SectionTitle>Collection time</SectionTitle>
            <Card style={{ gap: spacing.sm }}>
              <View style={styles.storeCard}>
                <Ionicons name="storefront" size={22} color={colors.primary} />
                <Text style={[styles.optionTitle, { flex: 1 }]}>Collect from {store?.name ?? 'our store'}</Text>
              </View>
              {store && <StoreContact store={store} />}
            </Card>
            {slots.loading && !slots.data ? (
              <ActivityIndicator color={colors.primary} />
            ) : slots.error && !slots.data ? (
              <Banner kind="error" title="Couldn't load collection times">
                {slots.error.message}
              </Banner>
            ) : days.length === 0 ? (
              <Banner kind="warning">No collection times are available right now. Please try delivery or check back later.</Banner>
            ) : (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                  {days.map((d) => (
                    <Chip
                      key={d.key}
                      label={formatDay(d.list[0].startsAt) + (d.hasSpace ? '' : ' (full)')}
                      selected={day === d.key}
                      onPress={() => setDay(d.key)}
                    />
                  ))}
                </ScrollView>
                <View style={styles.slotGrid} accessibilityRole="radiogroup">
                  {selectedDay?.list.map((slot) => {
                    const selected = slotId === slot.id;
                    return (
                      <Pressable
                        key={slot.id}
                        disabled={!slot.isAvailable}
                        onPress={() => setSlotId(slot.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected, disabled: !slot.isAvailable }}
                        accessibilityLabel={`${formatTime(slot.startsAt)} to ${formatTime(slot.endsAt)}${slot.isAvailable ? '' : ', full'}`}
                        style={[styles.slot, selected && styles.slotSelected, !slot.isAvailable && styles.slotFull]}
                      >
                        <Text style={[styles.slotText, selected && { color: '#fff' }, !slot.isAvailable && { color: colors.textMuted }]}>
                          {formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}
                        </Text>
                        {!slot.isAvailable ? (
                          <Text style={styles.slotNote}>Full</Text>
                        ) : slot.remaining <= 2 ? (
                          <Text style={[styles.slotNote, selected && { color: '#D3EADB' }]}>{slot.remaining} left</Text>
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
          <SectionTitle>Payment</SectionTitle>
          {paymentMethods.map((method) => (
            <RadioCard
              key={method.id}
              selected={paymentMethod === method.id}
              onPress={() => setPaymentMethod(method.id)}
              accessibilityLabel={`${method.label}. ${method.description}`}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                <Text style={styles.optionTitle}>
                  {method.id === 'pay_on_fulfillment' ? (type === 'pickup' ? 'Pay when you collect' : 'Pay on delivery') : method.label}
                </Text>
                {method.isDemo && <Badge label="DEMO" background={colors.accentSoft} color={colors.accentText} />}
              </View>
              <Text style={styles.body}>{method.description}</Text>
            </RadioCard>
          ))}
        </View>

        {/* 4. Notes -------------------------------------------------------- */}
        <TextField
          label="Notes for the store (optional)"
          placeholder="e.g. Please choose ripe avocados"
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={500}
        />

        {/* 5. Summary ------------------------------------------------------ */}
        <Card style={{ gap: spacing.sm }}>
          <Text style={styles.optionTitle}>Order summary</Text>
          {quote.loading && !q ? (
            <ActivityIndicator color={colors.primary} />
          ) : q ? (
            <>
              <Row label={`Items (${cart.count})`} value={money(q.subtotalCents)} />
              <Row
                label={type === 'delivery' ? 'Delivery' : 'Store pickup'}
                value={
                  type === 'pickup'
                    ? 'Free'
                    : q.fulfillment.type === 'delivery' && q.fulfillment.zone
                      ? q.deliveryFeeCents
                        ? money(q.deliveryFeeCents)
                        : 'Free'
                      : '—'
                }
              />
              <View style={styles.divider} />
              <Row label="Total" value={money(q.totalCents)} bold />
            </>
          ) : quote.error ? (
            <Text style={styles.badText}>{quote.error.message}</Text>
          ) : null}
        </Card>

        {problems.length > 0 && (
          <Banner kind="error" title="Please check your order">
            <View style={{ gap: 4 }}>
              {problems.map((issue, index) => (
                <Text key={index} style={styles.issueText}>
                  • {issue.message}
                </Text>
              ))}
              {problems.some((i) => i.productId) && (
                <Pressable onPress={() => router.navigate('/cart')} accessibilityRole="link">
                  <Text style={[styles.issueText, { textDecorationLine: 'underline', fontWeight: '700' }]}>Edit cart</Text>
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
              ? 'Placing your order…'
              : todo
                ? todo.message.replace(/^Please c/, 'C').replace(/\.$/, '')
                : q
                  ? `Place order · ${money(q.totalCents)}`
                  : 'Place order'
          }
          icon={todo ? undefined : 'checkmark-circle'}
          loading={placing}
          disabled={!canPlace}
          onPress={placeOrder}
        />
        <Text style={styles.secureNote}>
          {paymentMethod === 'demo_card'
            ? 'Demo payment: nothing will be charged.'
            : `You'll pay ${type === 'pickup' ? 'when you collect' : 'on delivery'}.`}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && styles.rowBold]}>{label}</Text>
      <Text style={[styles.rowValue, bold && styles.rowBold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: 160, maxWidth: 640, width: '100%', alignSelf: 'center' },
  section: { gap: spacing.md },
  segment: { flexDirection: 'row', gap: spacing.md },
  segmentOption: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  segmentSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentLabel: { fontSize: font.large, fontWeight: '800', color: colors.primaryDark },
  segmentHint: { fontSize: 13, color: colors.textMuted },
  link: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  optionTitle: { fontSize: font.body + 1, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.textMuted, lineHeight: 21 },
  okText: { fontSize: 14, color: colors.primaryDark, fontWeight: '600', marginTop: 4 },
  badText: { fontSize: 14, color: colors.danger, fontWeight: '600', marginTop: 4 },
  storeCard: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
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
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  rowLabel: { fontSize: font.body, color: colors.textMuted },
  rowValue: { fontSize: font.body, color: colors.text, fontWeight: '600' },
  rowBold: { fontSize: font.large, color: colors.text, fontWeight: '800' },
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
