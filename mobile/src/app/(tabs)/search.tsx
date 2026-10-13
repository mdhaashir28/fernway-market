// Search and filter the whole catalogue.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '@/api/client';
import type { Category } from '@/api/types';
import { FilterChips, type FilterState } from '@/components/filters';
import { ProductGrid } from '@/components/products';
import { EmptyState, ErrorView, LoadingView } from '@/components/states';
import { Button, Chip } from '@/components/ui';
import { useApi, useDebounced } from '@/lib/useApi';
import { useProductSearch } from '@/lib/useProductSearch';
import { colors, font, radius, spacing } from '@/theme';

const DEFAULT_FILTERS: FilterState = { inStock: false, sort: 'name' };

export default function SearchScreen() {
  const [text, setText] = useState('');
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const search = useDebounced(text.trim());

  const categories = useApi(() => api.get<{ items: Category[] }>('/api/categories').then((r) => r.items), []);
  const results = useProductSearch({
    search: search || undefined,
    categoryId,
    inStock: filters.inStock || undefined,
    maxPriceCents: filters.maxPriceCents,
    // When searching, show the best matches first unless the shopper picked a price sort.
    sort: search && filters.sort === 'name' ? 'relevance' : filters.sort,
  });

  const hasFilters = Boolean(search || categoryId || filters.inStock || filters.maxPriceCents || filters.sort !== 'name');
  const clearAll = () => {
    setText('');
    setCategoryId(undefined);
    setFilters(DEFAULT_FILTERS);
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Search products"
          placeholderTextColor="#8A948D"
          accessibilityLabel="Search products"
          returnKeyType="search"
          autoCorrect={false}
          style={styles.searchInput}
        />
        {text ? (
          <Pressable onPress={() => setText('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10}>
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
        <Chip label="All" selected={!categoryId} onPress={() => setCategoryId(undefined)} />
        {categories.data?.map((c) => (
          <Chip
            key={c.id}
            label={`${c.icon} ${c.name}`}
            selected={categoryId === c.id}
            onPress={() => setCategoryId(categoryId === c.id ? undefined : c.id)}
          />
        ))}
      </ScrollView>
      <FilterChips value={filters} onChange={setFilters} />

      <View style={styles.countRow}>
        <Text style={styles.count} accessibilityLiveRegion="polite">
          {results.loading ? 'Searching…' : `${results.total} product${results.total === 1 ? '' : 's'}`}
        </Text>
        {hasFilters && (
          <Pressable onPress={clearAll} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.clear}>Clear all</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <ProductGrid
        products={results.loading ? [] : results.items}
        header={header}
        refreshing={results.refreshing}
        onRefresh={results.refresh}
        onEndReached={results.loadMore}
        footer={results.loadingMore ? <ActivityIndicator color={colors.primary} style={{ margin: spacing.lg }} /> : null}
        empty={
          results.loading ? (
            <LoadingView message="Finding products…" />
          ) : results.error ? (
            <ErrorView error={results.error} onRetry={results.retry} />
          ) : (
            <EmptyState
              icon="search"
              title={search ? `No results for “${search}”` : 'No products match'}
              message="Try a different word or remove some filters."
              action={hasFilters ? <Button title="Clear filters" variant="secondary" onPress={clearAll} /> : undefined}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  searchInput: { flex: 1, fontSize: font.body, color: colors.text, paddingVertical: spacing.sm },
  chipRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  count: { fontSize: 15, color: colors.textMuted, fontWeight: '600' },
  clear: { fontSize: 15, color: colors.primary, fontWeight: '700' },
});
