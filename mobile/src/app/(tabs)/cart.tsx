// The shopping cart: change quantities, see totals, go to checkout.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import type { Paginated, Product } from '@/api/types';
import { ProductImage, QuantityStepper } from '@/components/products';
import { EmptyState } from '@/components/states';
import { Banner, Button } from '@/components/ui';
import { MAX_PER_ITEM, useCart, type CartItem } from '@/context/CartContext';
import { useStore } from '@/context/StoreContext';
import { confirm } from '@/lib/confirm';
import { colors, font, radius, spacing } from '@/theme';

export default function CartScreen() {
  const cart = useCart();
  const { money } = useStore();
  const [checking, setChecking] = useState(false);

  // Each time the cart is opened, refresh prices and stock from the store.
  const ids = cart.items.map((i) => i.productId).join(',');
  useFocusEffect(
    useCallback(() => {
      if (!ids) return;
      setChecking(true);
      api
        .get<Paginated<Product>>(`/api/products?ids=${ids}&pageSize=100`)
        .then((result) => cart.refreshFrom(result.items))
        .catch(() => {}) // offline: keep showing the saved cart
        .finally(() => setChecking(false));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ids]),
  );

  const problems = cart.items.filter((i) => i.quantity > i.availableQuantity);

  if (cart.items.length === 0) {
    return (
      <EmptyState
        icon="basket-outline"
        title="Your cart is empty"
        message="Browse the aisles and tap + to add products."
        action={<Button title="Start shopping" icon="storefront" onPress={() => router.navigate('/')} />}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={cart.items}
        keyExtractor={(item) => String(item.productId)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          problems.length > 0 ? (
            <View style={{ marginBottom: spacing.md }}>
              <Banner kind="warning" title="Some items need your attention">
                Stock has changed for {problems.length} item{problems.length === 1 ? '' : 's'}. Lower the quantity or remove
                them to continue.
              </Banner>
            </View>
          ) : null
        }
        renderItem={({ item }) => <CartRow item={item} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={
          <Pressable
            onPress={async () => {
              if (await confirm('Empty your cart?', 'This removes every item from your cart.', 'Empty cart', true)) cart.clear();
            }}
            accessibilityRole="button"
            style={styles.clearButton}
          >
            <Text style={styles.clearText}>Empty cart</Text>
          </Pressable>
        }
      />

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>
            Subtotal ({cart.count} item{cart.count === 1 ? '' : 's'})
          </Text>
          <Text style={styles.summaryValue}>{money(cart.subtotalCents)}</Text>
        </View>
        <Text style={styles.summaryHint}>
          {checking ? 'Checking the latest prices and stock…' : 'Delivery fee (if any) is shown at checkout. Pickup is free.'}
        </Text>
        <Button
          title={problems.length ? 'Fix the items above to continue' : 'Go to checkout'}
          icon={problems.length ? undefined : 'arrow-forward'}
          disabled={problems.length > 0}
          onPress={() => router.push('/checkout')}
        />
      </View>
    </View>
  );
}

function CartRow({ item }: { item: CartItem }) {
  const cart = useCart();
  const { money } = useStore();
  const unavailable = item.availableQuantity <= 0;
  const tooMany = !unavailable && item.quantity > item.availableQuantity;

  return (
    <View style={[styles.row, (unavailable || tooMany) && styles.rowProblem]}>
      <Pressable onPress={() => router.push(`/product/${item.productId}`)} accessibilityLabel={`View ${item.name}`}>
        <ProductImage product={item} size={72} />
      </Pressable>
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={styles.rowUnit}>
          {item.unitLabel} · {money(item.priceCents)} each
        </Text>
        {unavailable && <Text style={styles.problemText}>Out of stock — please remove</Text>}
        {tooMany && <Text style={styles.problemText}>Only {item.availableQuantity} available</Text>}
        <View style={styles.rowFooter}>
          {unavailable ? (
            <Pressable onPress={() => cart.remove(item.productId)} accessibilityRole="button" style={styles.removeButton}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
              <Text style={{ color: colors.danger, fontWeight: '700' }}>Remove</Text>
            </Pressable>
          ) : (
            <QuantityStepper
              compact
              value={item.quantity}
              max={Math.min(MAX_PER_ITEM, Math.max(item.availableQuantity, 1))}
              onChange={(q) => cart.setQuantity(item.productId, tooMany && q > item.quantity ? item.availableQuantity : q)}
              label={item.name}
            />
          )}
          <Text style={styles.lineTotal}>{money(item.priceCents * item.quantity)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xl, maxWidth: 700, width: '100%', alignSelf: 'center' },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowProblem: { borderColor: '#F0B4AE', backgroundColor: '#FFFBFA' },
  rowBody: { flex: 1, gap: 2 },
  rowName: { fontSize: font.body, fontWeight: '700', color: colors.text },
  rowUnit: { fontSize: 14, color: colors.textMuted },
  problemText: { fontSize: 14, color: colors.danger, fontWeight: '600', marginTop: 2 },
  rowFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  lineTotal: { fontSize: font.body + 1, fontWeight: '800', color: colors.text },
  removeButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 },
  clearButton: { alignSelf: 'center', padding: spacing.md, marginTop: spacing.md },
  clearText: { color: colors.textMuted, fontWeight: '600', textDecorationLine: 'underline', fontSize: 15 },
  summary: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  summaryLabel: { fontSize: font.body, color: colors.text, fontWeight: '600' },
  summaryValue: { fontSize: font.title, fontWeight: '800', color: colors.text },
  summaryHint: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.xs },
});
