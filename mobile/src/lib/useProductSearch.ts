import { useCallback, useEffect, useRef, useState } from 'react';
import { api, queryString } from '@/api/client';
import type { Paginated, Product } from '@/api/types';

export type SortOption = 'name' | 'price_asc' | 'price_desc' | 'relevance';

export interface ProductFilters {
  search?: string;
  categoryId?: number;
  inStock?: boolean;
  maxPriceCents?: number;
  sort?: SortOption;
}

const PAGE_SIZE = 24;

/** Loads products page by page for the given filters (used by Search and Category screens). */
export function useProductSearch(filters: ProductFilters) {
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  const requestId = useRef(0);
  const key = JSON.stringify(filters);

  const fetchPage = useCallback(
    async (pageToLoad: number, mode: 'initial' | 'more' | 'refresh') => {
      const id = ++requestId.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'more') setLoadingMore(true);
      if (mode === 'refresh') setRefreshing(true);
      try {
        const f: ProductFilters = JSON.parse(key);
        const result = await api.get<Paginated<Product>>(
          `/api/products${queryString({
            search: f.search,
            categoryId: f.categoryId,
            inStock: f.inStock,
            maxPriceCents: f.maxPriceCents,
            sort: f.sort,
            page: pageToLoad,
            pageSize: PAGE_SIZE,
          })}`,
        );
        if (id !== requestId.current) return; // a newer search has started
        setItems((current) => (pageToLoad === 1 ? result.items : [...current, ...result.items]));
        setTotal(result.total);
        setPage(pageToLoad);
        setError(undefined);
      } catch (err) {
        if (id === requestId.current) setError(err as Error);
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [key],
  );

  useEffect(() => {
    fetchPage(1, 'initial');
  }, [fetchPage]);

  const hasMore = items.length < total;

  return {
    items,
    total,
    loading,
    loadingMore,
    refreshing,
    error,
    hasMore,
    loadMore: () => {
      if (hasMore && !loadingMore && !loading) fetchPage(page + 1, 'more');
    },
    refresh: () => fetchPage(1, 'refresh'),
    retry: () => fetchPage(1, 'initial'),
  };
}
