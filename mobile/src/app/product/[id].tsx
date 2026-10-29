// Product details: picture, price, availability, details, add to cart, save to a list.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import type { Product } from '@/api/types';
import { ListPicker } from '@/components/ListPicker';
import { PhotoCredit } from '@/components/PhotoCredit';
import { ProductImage, QuantityStepper } from '@/components/products';
import { ErrorView, LoadingView } from '@/components/states';
import { Badge, Button } from '@/components/ui';
import { MAX_PER_ITEM, useCart } from '@/context/CartContext';
import { useStore } from '@/context/StoreContext';
import { useToast } from '@/context/ToastContext';
import { useT } from '@/i18n';
import { useApi } from '@/lib/useApi';
import { colors, font, radius, spacing } from '@/theme';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { money } = useStore();
  const { t, localName } = useT();
  const cart = useCart();
  const toast = useToast();
  const [quantity, setQuantity] = useState(1);
  const [listOpen, setListOpen] = useState(false);

  const { data: product, error, loading, reload } = useApi(
    () => api.get<{ product: Product }>(`/api/products/${id}`).then((r) => r.product),
    [id],
    { refetchOnFocus: true },
  );

  if (loading && !product) return <LoadingView />;
  if (error && !product) {
    const gone = (error as { status?: number }).status === 404;
    return <ErrorView error={gone ? new Error(t('This product is no longer available.')) : error} onRetry={gone ? undefined : reload} />;
  }
  if (!product) return null;

  const name = localName(product);
  const inCart = cart.quantityOf(product.id);
  const maxCanAdd = Math.max(0, Math.min(MAX_PER_ITEM, product.availableQuantity) - inCart);
  const outOfStock = product.availableQuantity <= 0;
  const qty = Math.min(quantity, Math.max(1, maxCanAdd));

  const availability =
    product.stockStatus === 'out_of_stock'
      ? { label: t('Out of stock'), bg: colors.dangerSoft, fg: colors.danger, icon: 'close-circle' as const }
      : product.stockStatus === 'low_stock'
        ? { label: t('Only {count} left', { count: product.availableQuantity }), bg: colors.accentSoft, fg: colors.accentText, icon: 'alert-circle' as const }
        : { label: t('In stock'), bg: colors.primarySoft, fg: colors.primaryDark, icon: 'checkmark-circle' as const };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: localName({ name: product.categoryName, nameTa: product.categoryNameTa }) }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <ProductImage product={product} size="100%" rounded={radius.lg} />
          <PhotoCredit credit={product.imageCredit} />
        </View>
        <View style={styles.titleBlock}>
          <Badge label={availability.label} background={availability.bg} color={availability.fg} icon={availability.icon} />
          <Text style={styles.name} accessibilityRole="header">
            {name}
          </Text>
          {name !== product.name && <Text style={styles.altName}>{product.name}</Text>}
          <Text style={styles.unit}>{product.unitLabel}</Text>
          <Text style={styles.price}>{money(product.priceCents)}</Text>
        </View>

        {product.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('About this product')}</Text>
            <Text style={styles.description}>{product.description}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Product details')}</Text>
          {product.brand ? <DetailRow label={t('Brand')} value={product.brand} /> : null}
          <DetailRow label={t('Pack size')} value={product.unitLabel} />
          <DetailRow label={t('Category')} value={localName({ name: product.categoryName, nameTa: product.categoryNameTa })} />
        </View>

        <View style={styles.section}>
          <View style={styles.infoRow}>
            <Ionicons name="bicycle-outline" size={20} color={colors.primary} />
            <Text style={styles.infoText}>{t('Home delivery or free store pickup')}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="swap-horizontal-outline" size={20} color={colors.primary} />
            <Text style={styles.infoText}>{t('In your cart you can choose what we do if this item is unavailable')}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="pricetag-outline" size={20} color={colors.primary} />
            <Text style={styles.infoText}>{t('Price checked again when you place your order')}</Text>
          </View>
        </View>

        <Pressable onPress={() => setListOpen(true)} accessibilityRole="button" style={({ pressed }) => [styles.listButton, pressed && { opacity: 0.8 }]}>
          <Ionicons name="bookmark-outline" size={20} color={colors.primary} />
          <Text style={styles.listButtonText}>{t('Save to a shopping list')}</Text>
        </Pressable>
      </ScrollView>

      {/* Sticky add-to-cart bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
        {outOfStock ? (
          <Button title={t('Out of stock')} disabled style={{ flex: 1 }} />
        ) : maxCanAdd === 0 ? (
          <Button title={t('{count} in cart — view cart', { count: inCart })} icon="basket" variant="secondary" style={{ flex: 1 }} onPress={() => router.navigate('/cart')} />
        ) : (
          <>
            <QuantityStepper value={qty} max={maxCanAdd} onChange={(q) => setQuantity(Math.max(1, q))} label={name} />
            <Button
              title={t('Add · {amount}', { amount: money(product.priceCents * qty) })}
              icon="basket"
              style={{ flex: 1 }}
              onPress={() => {
                cart.add(product, qty);
                setQuantity(1);
                toast(t('{count} × {name} added to cart', { count: qty, name }));
              }}
            />
          </>
        )}
      </View>
      {inCart > 0 && maxCanAdd > 0 && (
        <Text style={[styles.inCartNote, { bottom: insets.bottom + 92 }]}>{t('{count} already in your cart', { count: inCart })}</Text>
      )}
      <ListPicker visible={listOpen} onClose={() => setListOpen(false)} items={[{ productId: product.id, quantity: Math.max(qty, 1) }]} />
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  detailRow: { flexDirection: 'row', gap: spacing.md },
  detailLabel: { width: 100, fontSize: 15, color: colors.textMuted },
  detailValue: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  content: { padding: spacing.lg, paddingBottom: 150, gap: spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
  titleBlock: { gap: 6 },
  name: { fontSize: font.hero, fontWeight: '800', color: colors.text, lineHeight: 36 },
  altName: { fontSize: 15, color: colors.textMuted },
  unit: { fontSize: font.body, color: colors.textMuted },
  price: { fontSize: font.title + 4, fontWeight: '800', color: colors.primaryDark, marginTop: 4 },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: { fontSize: font.body + 1, fontWeight: '800', color: colors.text },
  description: { fontSize: font.body, lineHeight: 24, color: colors.text },
  infoRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  infoText: { fontSize: 15, color: colors.textMuted, flex: 1, lineHeight: 21 },
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
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inCartNote: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: colors.primarySoft,
    color: colors.primaryDarker,
    fontWeight: '700',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
});
