// The shopping cart: change quantities, choose substitutions, see totals, go to checkout.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import type { Paginated, Product } from '@/api/types';
import { ListPicker } from '@/components/ListPicker';
import { ProductImage, QuantityStepper } from '@/components/products';
import { EmptyState } from '@/components/states';
import { SubstitutionSheet, useSubstitutionLabel } from '@/components/SubstitutionSheet';
import { Banner, Button } from '@/components/ui';
import { MAX_PER_ITEM, useCart, type CartItem } from '@/context/CartContext';
import { useStore } from '@/context/StoreContext';
import { useT } from '@/i18n';
import { confirm } from '@/lib/confirm';
import { colors, font, radius, spacing } from '@/theme';

export default function CartScreen() {
  const cart = useCart();
  const { money, store } = useStore();
  const { t } = useT();
  const [checking, setChecking] = useState(false);
  const [listOpen, setListOpen] = useState(false);

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
  const substitutions = store?.substitutionsEnabled ?? true;

  if (cart.items.length === 0) {
    return (
      <EmptyState
        icon="basket-outline"
        title={t('Your cart is empty')}
        message={t('Browse the aisles and tap + to add products.')}
        action={<Button title={t('Start shopping')} icon="storefront" onPress={() => router.navigate('/')} />}
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
          <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
            {problems.length > 0 && (
              <Banner kind="warning" title={t('Some items need your attention')}>
                {t(
                  problems.length === 1
                    ? 'Stock has changed for {count} item. Lower the quantity or remove it to continue.'
                    : 'Stock has changed for {count} items. Lower the quantity or remove them to continue.',
                  { count: problems.length },
                )}
              </Banner>
            )}
            {substitutions && (
              <Text style={styles.intro}>{t('For each item, choose what we should do if it runs out before we pack your order.')}</Text>
            )}
          </View>
        }
        renderItem={({ item }) => <CartRow item={item} substitutions={substitutions} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListFooterComponent={
          <View style={styles.footerActions}>
            <Pressable onPress={() => setListOpen(true)} accessibilityRole="button" style={({ pressed }) => [styles.listButton, pressed && { opacity: 0.8 }]}>
              <Ionicons name="bookmark-outline" size={20} color={colors.primary} />
              <Text style={styles.listButtonText}>{t('Save cart as a shopping list')}</Text>
            </Pressable>
            <Pressable
              onPress={async () => {
                if (await confirm(t('Empty your cart?'), t('This removes every item from your cart.'), t('Empty cart'), true, t('Cancel'))) cart.clear();
              }}
              accessibilityRole="button"
              style={styles.clearButton}
            >
              <Text style={styles.clearText}>{t('Empty cart')}</Text>
            </Pressable>
          </View>
        }
      />

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{t(cart.count === 1 ? 'Subtotal ({count} item)' : 'Subtotal ({count} items)', { count: cart.count })}</Text>
          <Text style={styles.summaryValue}>{money(cart.subtotalCents)}</Text>
        </View>
        <Text style={styles.summaryHint}>
          {checking ? t('Checking the latest prices and stock…') : t('Offers and any delivery fee are shown at checkout. Pickup is free.')}
        </Text>
        <Button
          title={problems.length ? t('Fix the items above to continue') : t('Go to checkout')}
          icon={problems.length ? undefined : 'arrow-forward'}
          disabled={problems.length > 0}
          onPress={() => router.push('/checkout')}
        />
      </View>
      <ListPicker visible={listOpen} onClose={() => setListOpen(false)} items={cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity }))} />
    </View>
  );
}

function CartRow({ item, substitutions }: { item: CartItem; substitutions: boolean }) {
  const cart = useCart();
  const { money } = useStore();
  const { t, localName } = useT();
  const substitutionLabel = useSubstitutionLabel();
  const [sheetOpen, setSheetOpen] = useState(false);
  const unavailable = item.availableQuantity <= 0;
  const tooMany = !unavailable && item.quantity > item.availableQuantity;
  const name = localName(item);

  return (
    <View style={[styles.row, (unavailable || tooMany) && styles.rowProblem]}>
      <View style={styles.rowTop}>
        <Pressable onPress={() => router.push(`/product/${item.productId}`)} accessibilityRole="link" accessibilityLabel={t('View {name}', { name })}>
          <ProductImage product={item} size={72} />
        </Pressable>
        <View style={styles.rowBody}>
          <Text style={styles.rowName} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.rowUnit}>{t('{unit} · {price} each', { unit: item.unitLabel, price: money(item.priceCents) })}</Text>
          {unavailable && (
            <View style={styles.problemRow}>
              <Ionicons name="close-circle" size={16} color={colors.danger} />
              <Text style={styles.problemText}>{t('Out of stock — please remove')}</Text>
            </View>
          )}
          {tooMany && (
            <View style={styles.problemRow}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <Text style={styles.problemText}>{t('Only {count} available', { count: item.availableQuantity })}</Text>
            </View>
          )}
          <View style={styles.rowFooter}>
            {unavailable ? (
              <Pressable onPress={() => cart.remove(item.productId)} accessibilityRole="button" accessibilityLabel={t('Remove {name}', { name })} style={styles.removeButton}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                <Text style={{ color: colors.danger, fontWeight: '700' }}>{t('Remove')}</Text>
              </Pressable>
            ) : (
              <QuantityStepper
                compact
                value={item.quantity}
                max={Math.min(MAX_PER_ITEM, Math.max(item.availableQuantity, 1))}
                onChange={(q) => cart.setQuantity(item.productId, tooMany && q > item.quantity ? item.availableQuantity : q)}
                label={name}
              />
            )}
            <Text style={styles.lineTotal}>{money(item.priceCents * item.quantity)}</Text>
          </View>
        </View>
      </View>
      {substitutions && !unavailable && (
        <Pressable
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${t('If unavailable')}: ${substitutionLabel(item.substitution)}. ${t('Change')}`}
          style={({ pressed }) => [styles.subRow, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="swap-horizontal" size={18} color={colors.primaryDark} />
          <View style={{ flex: 1 }}>
            <Text style={styles.subLabel}>{t('If unavailable')}</Text>
            <Text style={styles.subValue} numberOfLines={2}>
              {substitutionLabel(item.substitution)}
            </Text>
          </View>
          <Text style={styles.subChange}>{t('Change')}</Text>
        </Pressable>
      )}
      {sheetOpen && (
        <SubstitutionSheet item={item} visible={sheetOpen} onClose={() => setSheetOpen(false)} onChoose={(choice) => cart.setSubstitution(item.productId, choice)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xl, maxWidth: 700, width: '100%', alignSelf: 'center' },
  intro: { fontSize: 15, color: colors.textMuted, lineHeight: 21 },
  row: {
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTop: { flexDirection: 'row', gap: spacing.md },
  rowProblem: { borderColor: '#F0B4AE', backgroundColor: '#FFFBFA' },
  rowBody: { flex: 1, gap: 2 },
  rowName: { fontSize: font.body, fontWeight: '700', color: colors.text },
  rowUnit: { fontSize: 14, color: colors.textMuted },
  problemRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  problemText: { fontSize: 14, color: colors.danger, fontWeight: '600', flexShrink: 1 },
  rowFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  lineTotal: { fontSize: font.body + 1, fontWeight: '800', color: colors.text },
  removeButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingRight: spacing.sm },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  subLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  subValue: { fontSize: 15, color: colors.text, fontWeight: '600' },
  subChange: { fontSize: 15, color: colors.primaryDark, fontWeight: '800', textDecorationLine: 'underline' },
  footerActions: { gap: spacing.sm, marginTop: spacing.lg },
  listButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  listButtonText: { fontSize: font.body, fontWeight: '700', color: colors.primaryDark },
  clearButton: { alignSelf: 'center', padding: spacing.md, minHeight: 44 },
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
