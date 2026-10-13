// Home screen: search shortcut, delivery/pickup info, categories, product rows.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL, api } from '@/api/client';
import type { Category, Paginated, Product } from '@/api/types';
import { ProductCard } from '@/components/products';
import { ErrorView, LoadingView } from '@/components/states';
import { SectionTitle } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { useApi } from '@/lib/useApi';
import { colors, font, radius, shadow, spacing } from '@/theme';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const { store, money, reload: reloadStore } = useStore();

  const home = useApi(async () => {
    const { items: categories } = await api.get<{ items: Category[] }>('/api/categories');
    const featured = categories.filter((c) => c.productCount > 0).slice(0, 2);
    const rows = await Promise.all(
      featured.map((c) =>
        api.get<Paginated<Product>>(`/api/products?categoryId=${c.id}&inStock=true&pageSize=10`).then((r) => ({ category: c, products: r.items })),
      ),
    );
    return { categories, rows };
  }, []);

  const freeOver = store?.deliveryZones
    .map((z) => z.freeDeliveryThresholdCents)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b)[0];
  const tileWidth = (Math.min(width, 700) - spacing.lg * 2 - spacing.md * 2) / 3;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      refreshControl={
        <RefreshControl
          refreshing={home.refreshing}
          onRefresh={() => {
            home.refresh();
            reloadStore();
          }}
          tintColor={colors.primary}
        />
      }
    >
      {/* Brand header */}
      <View style={styles.header}>
        <View style={styles.logo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name="leaf" size={24} color={colors.primaryDark} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand} accessibilityRole="header">
            {store?.name ?? 'Fernway Market'}
          </Text>
          <Text style={styles.greeting}>{user ? `Hi ${user.name.split(' ')[0]}, what do you need today?` : 'Fresh groceries, delivered or ready to collect'}</Text>
        </View>
      </View>

      {/* Search shortcut */}
      <Pressable
        onPress={() => router.navigate('/search')}
        accessibilityRole="search"
        accessibilityLabel="Search products"
        style={({ pressed }) => [styles.searchBar, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <Text style={styles.searchText}>Search milk, bread, apples…</Text>
      </Pressable>

      {/* Delivery or pickup */}
      <View style={styles.promo}>
        <View style={styles.promoRow}>
          <View style={styles.promoItem}>
            <Ionicons name="bicycle" size={26} color={colors.accent} />
            <Text style={styles.promoTitle}>Home delivery</Text>
            <Text style={styles.promoText}>{freeOver ? `Free over ${money(freeOver)}` : 'To your door'}</Text>
          </View>
          <View style={styles.promoDivider} />
          <View style={styles.promoItem}>
            <Ionicons name="storefront" size={26} color={colors.accent} />
            <Text style={styles.promoTitle}>Store pickup</Text>
            <Text style={styles.promoText}>Always free · pick a time</Text>
          </View>
        </View>
        <Text style={styles.promoFoot}>Choose delivery or pickup at checkout.</Text>
      </View>

      {home.loading && !home.data ? (
        <LoadingView message="Loading the store…" />
      ) : home.error && !home.data ? (
        <View>
          <ErrorView error={home.error} onRetry={home.reload} />
          <Text style={styles.debug}>The app is trying to reach the API at {API_URL}</Text>
        </View>
      ) : home.data ? (
        <>
          <SectionTitle>Shop by category</SectionTitle>
          <View style={styles.categoryGrid}>
            {home.data.categories.map((category) => (
              <Pressable
                key={category.id}
                onPress={() => router.push(`/category/${category.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${category.name}, ${category.productCount} products`}
                style={({ pressed }) => [styles.categoryTile, { width: tileWidth }, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.categoryIcon}>{category.icon}</Text>
                <Text style={styles.categoryName} numberOfLines={2}>
                  {category.name}
                </Text>
              </Pressable>
            ))}
          </View>

          {home.data.rows.map(({ category, products }) =>
            products.length ? (
              <View key={category.id} style={styles.row}>
                <SectionTitle
                  action={
                    <Pressable onPress={() => router.push(`/category/${category.id}`)} accessibilityRole="link" hitSlop={8}>
                      <Text style={styles.seeAll}>See all</Text>
                    </Pressable>
                  }
                >
                  {category.icon} {category.name}
                </SectionTitle>
                <FlatList
                  horizontal
                  data={products}
                  keyExtractor={(p) => String(p.id)}
                  renderItem={({ item }) => <ProductCard product={item} width={168} />}
                  contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.lg, paddingVertical: 4 }}
                  showsHorizontalScrollIndicator={false}
                  style={{ marginRight: -spacing.lg }}
                />
              </View>
            ) : null,
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg, maxWidth: 700, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontSize: font.title + 2, fontWeight: '800', color: colors.primaryDarker },
  greeting: { fontSize: 15, color: colors.textMuted, marginTop: 2 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  searchText: { fontSize: font.body, color: colors.textMuted },

  promo: { backgroundColor: colors.primaryDark, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, ...shadow },
  promoRow: { flexDirection: 'row', alignItems: 'stretch' },
  promoItem: { flex: 1, gap: 4 },
  promoDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: spacing.md },
  promoTitle: { color: '#fff', fontSize: font.body + 1, fontWeight: '800', marginTop: 4 },
  promoText: { color: '#D3EADB', fontSize: 14 },
  promoFoot: { color: '#D3EADB', fontSize: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', paddingTop: spacing.sm },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: -spacing.sm },
  categoryTile: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 104,
  },
  categoryIcon: { fontSize: 34 },
  categoryName: { fontSize: 14, fontWeight: '700', color: colors.text, textAlign: 'center' },

  row: { gap: 0 },
  seeAll: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  debug: { textAlign: 'center', color: colors.textMuted, fontSize: 13, marginTop: -spacing.lg },
});
