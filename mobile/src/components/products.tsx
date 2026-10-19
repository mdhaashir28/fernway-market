// Product picture, product card, quantity stepper and product grid.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { imageUrl } from '@/api/client';
import type { Product } from '@/api/types';
import { MAX_PER_ITEM, useCart } from '@/context/CartContext';
import { useStore } from '@/context/StoreContext';
import { useToast } from '@/context/ToastContext';
import { colors, radius, shadow, spacing } from '@/theme';

// Soft background colours for products without a photo (picked by product id).
const TINTS = ['#E3F1E8', '#FDF0D9', '#E3EEFD', '#EFE8FC', '#DFF4F8', '#FDE8E7', '#F1F3E4'];

/**
 * The product photo, or — when there's no photo yet — a clearly labelled
 * placeholder: the product's emoji on a soft coloured tile with
 * "Photo coming soon" (the label is left off small thumbnails).
 */
export function ProductImage({
  product,
  size,
  rounded = radius.md,
}: {
  product: { id?: number; productId?: number; imageUrl: string | null; icon: string | null; categoryIcon?: string };
  size: number | '100%';
  rounded?: number;
}) {
  const src = imageUrl(product.imageUrl);
  const id = product.id ?? product.productId ?? 0;
  const dimension = size === '100%' ? { width: '100%' as const, aspectRatio: 1 } : { width: size, height: size };
  const emojiSize = typeof size === 'number' ? size * 0.5 : 64;
  const showLabel = size === '100%' || size >= 120;
  return (
    <View
      style={[styles.imageBox, dimension, { borderRadius: rounded, backgroundColor: TINTS[id % TINTS.length] }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {src ? (
        <Image source={{ uri: src }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <>
          <Text style={{ fontSize: emojiSize }}>{product.icon || product.categoryIcon || '🛒'}</Text>
          {showLabel && (
            <View style={styles.placeholderLabel}>
              <Ionicons name="camera-outline" size={13} color={colors.textMuted} />
              <Text style={styles.placeholderText}>Photo coming soon</Text>
            </View>
          )}
        </>
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
  const size = compact ? 36 : 44;
  return (
    <View style={styles.stepper} accessibilityLabel={`${label}: quantity ${value}`}>
      <Pressable
        onPress={() => onChange(value - 1)}
        accessibilityRole="button"
        accessibilityLabel={value === 1 ? `Remove ${label}` : `Decrease ${label}`}
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
        accessibilityLabel={`Increase ${label}`}
        accessibilityState={{ disabled: value >= max }}
        hitSlop={6}
        style={({ pressed }) => [
          styles.stepButton,
          { width: size, height: size },
          pressed && { opacity: 0.7 },
          value >= max && { opacity: 0.4 },
        ]}
      >
        <Ionicons name="add" size={compact ? 18 : 22} color={colors.primaryDark} />
      </Pressable>
    </View>
  );
}

/** Short stock text: "Out of stock", "Only 3 left" or nothing. */
export function stockNote(product: Pick<Product, 'stockStatus' | 'availableQuantity'>): string | null {
  if (product.stockStatus === 'out_of_stock') return 'Out of stock';
  if (product.stockStatus === 'low_stock') return `Only ${product.availableQuantity} left`;
  return null;
}

export function ProductCard({ product, width }: { product: Product; width: number }) {
  const { money } = useStore();
  const cart = useCart();
  const toast = useToast();
  const inCart = cart.quantityOf(product.id);
  const outOfStock = product.availableQuantity <= 0;
  const note = stockNote(product);

  // The card has two separate actions (open details / add to cart) side by side,
  // rather than a button inside a button, which screen readers handle better.
  return (
    <View style={[styles.card, { width }]}>
      <Pressable
        onPress={() => router.push(`/product/${product.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${product.name}, ${product.unitLabel}, ${money(product.priceCents)}${note ? `, ${note}` : ''}`}
        accessibilityHint="Opens product details"
        style={({ pressed }) => pressed && { opacity: 0.85 }}
      >
        <View>
          <ProductImage product={product} size="100%" />
          {note && (
            <View style={[styles.stockTag, outOfStock && styles.stockTagOut]}>
              <Text style={[styles.stockTagText, outOfStock && { color: colors.danger }]}>{note}</Text>
            </View>
          )}
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
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
            label={product.name}
          />
        ) : (
          <Pressable
            onPress={() => {
              cart.add(product);
              toast(`${product.name} added to cart`);
            }}
            disabled={outOfStock}
            accessibilityRole="button"
            accessibilityLabel={outOfStock ? `${product.name} is out of stock` : `Add ${product.name} to cart`}
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
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  imageBox: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  placeholderLabel: {
    position: 'absolute',
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  placeholderText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },

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
