// All products in one category, with filters.
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import type { Category } from '@/api/types';
import { FilterChips, type FilterState } from '@/components/filters';
import { ProductGrid } from '@/components/products';
import { EmptyState, ErrorView, LoadingView } from '@/components/states';
import { useT } from '@/i18n';
import { useApi } from '@/lib/useApi';
import { useProductSearch } from '@/lib/useProductSearch';
import { colors, spacing } from '@/theme';

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const categoryId = Number(id);
  const [filters, setFilters] = useState<FilterState>({ inStock: false, sort: 'name' });
  const { t, localName } = useT();

  const categories = useApi(() => api.get<{ items: Category[] }>('/api/categories').then((r) => r.items), []);
  const category = categories.data?.find((c) => c.id === categoryId);
  const results = useProductSearch({
    categoryId,
    inStock: filters.inStock || undefined,
    maxPriceCents: filters.maxPriceCents,
    sort: filters.sort,
  });

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: category ? localName(category) : t('Category') }} />
      <ProductGrid
        products={results.loading ? [] : results.items}
        refreshing={results.refreshing}
        onRefresh={results.refresh}
        onEndReached={results.loadMore}
        header={
          <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
            {category?.description ? <Text style={styles.description}>{category.description}</Text> : null}
            <FilterChips value={filters} onChange={setFilters} />
          </View>
        }
        footer={results.loadingMore ? <ActivityIndicator color={colors.primary} style={{ margin: spacing.lg }} /> : null}
        empty={
          results.loading ? (
            <LoadingView />
          ) : results.error ? (
            <ErrorView error={results.error} onRetry={results.retry} />
          ) : (
            <EmptyState icon="leaf-outline" title={t('Nothing here right now')} message={t('Try removing a filter, or check back soon.')} />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  description: { fontSize: 15, color: colors.textMuted },
});
