// Filter chips shared by the Search and Category screens.
import { ScrollView, StyleSheet } from 'react-native';
import { useStore } from '@/context/StoreContext';
import { useT } from '@/i18n';
import type { SortOption } from '@/lib/useProductSearch';
import { spacing } from '@/theme';
import { Chip } from './ui';

export interface FilterState {
  inStock: boolean;
  sort: SortOption;
  maxPriceCents?: number;
}

const SORTS: { value: SortOption; label: string }[] = [
  { value: 'name', label: 'A–Z' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

// "Under …" price filters, in paise/cents. Rupee prices are much bigger numbers than dollars.
const PRICE_LIMITS: Record<string, number[]> = { INR: [5000, 10000], default: [200, 500] };

export function FilterChips({ value, onChange }: { value: FilterState; onChange: (next: FilterState) => void }) {
  const { money, store } = useStore();
  const { t } = useT();
  const limits = PRICE_LIMITS[store?.currency ?? 'INR'] ?? PRICE_LIMITS.default;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
      <Chip
        label={t('In stock')}
        icon={value.inStock ? 'checkmark' : undefined}
        selected={value.inStock}
        onPress={() => onChange({ ...value, inStock: !value.inStock })}
      />
      {limits.map((limit) => (
        <Chip
          key={limit}
          label={t('Under {amount}', { amount: money(limit) })}
          selected={value.maxPriceCents === limit}
          onPress={() => onChange({ ...value, maxPriceCents: value.maxPriceCents === limit ? undefined : limit })}
        />
      ))}
      {SORTS.map((sort) => (
        <Chip key={sort.value} label={t(sort.label)} selected={value.sort === sort.value} onPress={() => onChange({ ...value, sort: sort.value })} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.xs },
});
