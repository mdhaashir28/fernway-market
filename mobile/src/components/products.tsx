// Product picture, product card, quantity stepper and product grid.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState, type ReactElement } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { imageUrl } from '@/api/client';
import type { Product } from '@/api/types';
import { MAX_PER_ITEM, useCart } from '@/context/CartContext';
import { useStore } from '@/context/StoreContext';
import { useToast } from '@/context/ToastContext';
import { useT } from '@/i18n';
import { colors, radius, shadow, spacing } from '@/theme';

interface ImageSubject {
  imageUrl: string | null;
  name?: string;
  nameTa?: string | null;
  brand?: string | null;
}

/**
 * The product photo. Products without a photo (or whose photo fails to load)
 * get a clearly labelled "Image needed" placeholder — never a made-up picture,
 * an emoji or an unrelated photo:
 *  • large tiles: the brand and name with an "Image needed" label;
 *  • small thumbnails: a dashed box with a picture outline (and the label when it fits).
 */
export function ProductImage({ product, size, rounded = radius.md }: { product: ImageSubject; size: number | '100%'; rounded?: number }) {
  const { t, localName } = useT();
  const src = imageUrl(product.imageUrl);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  const dimension = size === '100%' ? { width: '100%' as const, aspectRatio: 1 } : { width: size, height: size };
  const large = size === '100%' || size >= 120;
  const name = product.name ? localName({ name: product.name, nameTa: product.nameTa }) : '';

  return (
    <View
      style={[styles.imageBox, dimension, { borderRadius: rounded }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {src && !failed ? (
        <Image
          source={{ uri: src }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={src}
          onError={() => setFailed(true)}
        />
      ) : large ? (
        <View style={styles.placeholder}>
          {product.brand ? (
            <Text style={styles.placeholderBrand} numberOfLines={1}>
              {product.brand}
            </Text>
          ) : null}
          <Text style={styles.placeholderName} numberOfLines={3}>
            {name}
          </Text>
          <View style={styles.placeholderLabel}>
            <Ionicons name="camera-outline" size={13} color={colors.textMuted} />
            <Text style={styles.placeholderText}>{t('Image needed')}</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.smallPlaceholder, { borderRadius: rounded }]}>
          <Ionicons name="image-outline" size={typeof size === 'number' ? Math.max(16, Math.round(size * 0.3)) : 20} color={colors.textMuted} />
          {typeof size === 'number' && size >= 64 ? (
            <Text style={styles.smallPlaceholderText} numberOfLines={2}>
              {t('Image needed')}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

export function QuantityStepper({
  value,
  onChange,
  max = MAX_PER_ITEM,
  compact = false,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  max?: number;
  compact?: boolean;
  label: string;
}) {
  const { t } = useT();
  const size = compact ? 40 : 44;
  return (
    <View style={styles.stepper} accessibilityLabel={t('{name}: quantity {count}', { name: label, count: value })}>
      <Pressable
        onPress={() => onChange(value - 1)}
        accessibilityRole="button"
        accessibilityLabel={value === 1 ? t('Remove {name}', { name: label }) : t('Decrease {name}', { name: label })}
        hitSlop={6}
        style={({ pressed }) => [styles.stepButton, { width: size, height: size }, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name={value === 1 ? 'trash-outline' : 'remove'} size={compact ? 18 : 22} color={colors.primaryDark} />
      </Pressable>
      <Text style={[styles.stepValue, compact && { minWidth: 28, fontSize: 16 }]}>{value}</Text>
      <Pressable
        onPress={() => onChange(value + 1)}
        disabled={value >= max}
        accessibilityRole="button"
        accessibilityLabel={t('Increase {name}', { name: label })}
        aria-disabled={value >= max}
        hitSlop={6}
        style={({ pressed }) => [styles.stepButton, { width: size, height: size }, pressed && { opacity: 0.7 }, value >= max && { opacity: 0.4 }]}
      >
        <Ionicons name="add" size={compact ? 18 : 22} color={colors.primaryDark} />
      </Pressable>
    </View>
  );
}

/** Short stock text: "Out of stock", "Only 3 left" or nothing. */
export function useStockNote() {
  const { t } = useT();
  return (product: Pick<Product, 'stockStatus' | 'availableQuantity'>): string | null => {
    if (product.stockStatus === 'out_of_stock') return t('Out of stock');
    if (product.stockStatus === 'low_stock') return t('Only {count} left', { count: product.availableQuantity });
    return null;
  };
}

export function ProductCard({ product, width }: { product: Product; width: number }) {
  const { money } = useStore();
  const { t, localName } = useT();
  const cart = useCart();
  const toast = useToast();
  const stockNote = useStockNote();
  const inCart = cart.quantityOf(product.id);
  const outOfStock = product.availableQuantity <= 0;
  const note = stockNote(product);
  const name = localName(product);

  // The card has two separate actions (open details / add to cart) side by side,
  // rather than a button inside a button, which screen readers handle better.
  return (
    <View style={[styles.card, { width }]}>
      <Pressable
        onPress={() => router.push(`/product/${product.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${product.unitLabel}, ${money(product.priceCents)}${note ? `, ${note}` : ''}`}
        accessibilityHint={t('Opens product details')}
        style={({ pressed }) => pressed && { opacity: 0.85 }}
      >
        <View>
          <ProductImage product={product} size="100%" />
          {note && (
            <View style={[styles.stockTag, outOfStock && styles.stockTagOut]}>
              <Ionicons name={outOfStock ? 'close-circle' : 'alert-circle'} size={13} color={outOfStock ? colors.danger : colors.accentText} />
              <Text style={[styles.stockTagText, outOfStock && { color: colors.danger }]}>{note}</Text>
            </View>
          )}
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.unit} numberOfLines={1}>
          {product.unitLabel}
        </Text>
      </Pressable>
      <View style={styles.cardFooter}>
        <Text style={styles.price}>{money(product.priceCents)}</Text>
        {inCart > 0 ? (
          <QuantityStepper
            compact
            value={inCart}
            max={Math.min(MAX_PER_ITEM, product.availableQuantity)}
            onChange={(q) => cart.setQuantity(product.id, q)}
            label={name}
          />
        ) : (
          <Pressable
            onPress={() => {
              cart.add(product);
              toast(t('{name} added to cart', { name }));
            }}
            disabled={outOfStock}
            accessibilityRole="button"
            accessibilityLabel={outOfStock ? t('{name} is out of stock', { name }) : t('Add {name} to cart', { name })}
            hitSlop={6}
            style={({ pressed }) => [styles.addButton, outOfStock && styles.addButtonDisabled, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="add" size={24} color={outOfStock ? colors.textMuted : '#fff'} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** A 2-column (or wider on tablets) grid of products with pull-to-refresh. */
export function ProductGrid({
  products,
  header,
  empty,
  refreshing,
  onRefresh,
  onEndReached,
  footer,
}: {
  products: Product[];
  header?: ReactElement | null;
  empty?: ReactElement | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  onEndReached?: () => void;
  footer?: ReactElement | null;
}) {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 1100);
  const columns = contentWidth >= 900 ? 4 : contentWidth >= 600 ? 3 : 2;
  const cardWidth = (contentWidth - spacing.lg * 2 - spacing.md * (columns - 1)) / columns;

  return (
    <FlatList
      key={columns}
      data={products}
      numColumns={columns}
      keyExtractor={(p) => String(p.id)}
      renderItem={({ item }) => <ProductCard product={item} width={cardWidth} />}
      columnWrapperStyle={{ gap: spacing.md }}
      contentContainerStyle={[styles.grid, { maxWidth: 1100, width: '100%', alignSelf: 'center' }]}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      initialNumToRender={8}
      windowSize={7}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  imageBox: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  placeholder: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', padding: spacing.md, gap: 4 },
  placeholderBrand: { fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  placeholderName: { fontSize: 15, fontWeight: '700', color: '#3F4A43', textAlign: 'center', lineHeight: 20 },
  placeholderLabel: {
    position: 'absolute',
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholderText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  smallPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  smallPlaceholderText: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textAlign: 'center', lineHeight: 12 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  stockTag: {
    position: 'absolute',
    left: 6,
    top: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  stockTagOut: { backgroundColor: colors.dangerSoft },
  stockTagText: { fontSize: 12, fontWeight: '700', color: colors.accentText },
  name: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: spacing.sm, minHeight: 42, lineHeight: 21 },
  unit: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    minHeight: 44,
    flexWrap: 'wrap',
    gap: 4,
  },
  price: { fontSize: 17, fontWeight: '800', color: colors.text },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: { backgroundColor: colors.surfaceAlt },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
  },
  stepButton: { alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  stepValue: { minWidth: 32, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.primaryDarker },

  grid: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
});
