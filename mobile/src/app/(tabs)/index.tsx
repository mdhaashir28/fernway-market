// Home screen: language, updates, search shortcut, delivery/pickup info,
// offers, categories, product rows and the store's contact details.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL, api } from '@/api/client';
import type { Category, Paginated, Product, Promotion } from '@/api/types';
import { CategoryTile } from '@/components/CategoryTile';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ProductCard, ProductImage } from '@/components/products';
import { ErrorView, LoadingView } from '@/components/states';
import { StoreContact } from '@/components/StoreContact';
import { Button, SectionTitle } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useNotifications } from '@/context/NotificationsContext';
import { useStore } from '@/context/StoreContext';
import { useToast } from '@/context/ToastContext';
import { useT } from '@/i18n';
import { todaysHours } from '@/lib/hours';
import { useApi } from '@/lib/useApi';
import { colors, font, radius, shadow, spacing } from '@/theme';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const { store, money, reload: reloadStore } = useStore();
  const { t } = useT();

  const home = useApi(async () => {
    const [{ items: categories }, promotions] = await Promise.all([
      api.get<{ items: Category[] }>('/api/categories'),
      api.get<{ enabled: boolean; items: Promotion[] }>('/api/promotions').catch(() => ({ enabled: false, items: [] })),
    ]);
    const featured = categories.filter((c) => c.productCount > 0).slice(0, 2);
    const rows = await Promise.all(
      featured.map((c) =>
        api.get<Paginated<Product>>(`/api/products?categoryId=${c.id}&inStock=true&pageSize=10`).then((r) => ({ category: c, products: r.items })),
      ),
    );
    return { categories, rows, promotions: promotions.items };
  }, []);

  const freeOver = store?.deliveryZones
    .map((z) => z.freeDeliveryThresholdCents)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b)[0];
  const contentWidth = Math.min(width, 700) - spacing.lg * 2;
  const columns = contentWidth >= 560 ? 4 : 3;
  const tileWidth = (contentWidth - spacing.md * (columns - 1)) / columns;
  const hours = store ? todaysHours(store) : null;

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
          <Text style={styles.brand} accessibilityRole="header" numberOfLines={2}>
            {store?.name ?? 'Meeranji Supermarket'}
          </Text>
          <Text style={styles.greeting}>
            {user ? t('Hi {name}, what do you need today?', { name: user.name.split(' ')[0] }) : t('Fresh groceries, delivered or ready to collect')}
          </Text>
        </View>
        {user && (
          <Pressable
            onPress={() => router.push('/notifications')}
            accessibilityRole="button"
            accessibilityLabel={unreadCount ? t('Updates, {count} new', { count: unreadCount }) : t('Updates')}
            hitSlop={6}
            style={styles.bell}
          >
            <Ionicons name={unreadCount ? 'notifications' : 'notifications-outline'} size={24} color={colors.primaryDark} />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </Pressable>
        )}
      </View>
      <LanguageToggle compact />

      {/* Search shortcut */}
      <Pressable
        onPress={() => router.navigate('/search')}
        accessibilityRole="search"
        accessibilityLabel={t('Search products')}
        style={({ pressed }) => [styles.searchBar, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <Text style={styles.searchText} numberOfLines={1}>
          {t('Search dal, rice, Maggi, soap…')}
        </Text>
      </Pressable>

      {/* Delivery or pickup */}
      <View style={styles.promo}>
        <View style={styles.promoRow}>
          <View style={styles.promoItem}>
            <Ionicons name="bicycle" size={26} color={colors.accent} />
            <Text style={styles.promoTitle}>{t('Home delivery')}</Text>
            <Text style={styles.promoText}>{freeOver ? t('Free over {amount}', { amount: money(freeOver) }) : t('To your door')}</Text>
          </View>
          <View style={styles.promoDivider} />
          <View style={styles.promoItem}>
            <Ionicons name="storefront" size={26} color={colors.accent} />
            <Text style={styles.promoTitle}>{t('Store pickup')}</Text>
            <Text style={styles.promoText}>{t('Always free · pick a time')}</Text>
          </View>
        </View>
        <Text style={styles.promoFoot}>{t('Choose delivery or pickup at checkout. Pay by UPI or on delivery.')}</Text>
      </View>

      {home.loading && !home.data ? (
        <LoadingView message={t('Loading the store…')} />
      ) : home.error && !home.data ? (
        <View>
          <ErrorView error={home.error} onRetry={home.reload} />
          <Text style={styles.debug}>{t('The app is trying to reach the store at {url}', { url: API_URL })}</Text>
        </View>
      ) : home.data ? (
        <>
          {home.data.promotions.length > 0 && (
            <View>
              <SectionTitle>{t('Offers')}</SectionTitle>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md, paddingRight: spacing.lg }} style={{ marginRight: -spacing.lg }}>
                {home.data.promotions.map((promotion) => (
                  <OfferCard key={promotion.id} promotion={promotion} />
                ))}
              </ScrollView>
            </View>
          )}

          <View>
            <SectionTitle>{t('Shop by category')}</SectionTitle>
            <View style={styles.categoryGrid}>
              {home.data.categories.map((category) => (
                <CategoryTile key={category.id} category={category} width={tileWidth} />
              ))}
            </View>
          </View>

          {home.data.rows.map(({ category, products }) =>
            products.length ? (
              <View key={category.id}>
                <SectionTitle
                  action={
                    <Pressable onPress={() => router.push(`/category/${category.id}`)} accessibilityRole="link" hitSlop={8} style={styles.seeAllButton}>
                      <Text style={styles.seeAll}>{t('See all')}</Text>
                    </Pressable>
                  }
                >
                  <CategoryName category={category} />
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

      {/* Store details footer */}
      {store && (
        <View style={styles.footer} accessibilityRole="summary">
          <Text style={styles.footerTitle}>{t('Visit or call us')}</Text>
          <Text style={styles.footerName}>{store.name}</Text>
          {hours && (
            <View style={styles.hoursRow}>
              <Ionicons name={hours.open ? 'time-outline' : 'close-circle-outline'} size={18} color={hours.open ? colors.primary : colors.danger} />
              <Text style={[styles.footerNote, !hours.open && { color: colors.danger }]}>
                {hours.open
                  ? t('Open today {hours}', { hours: hours.text })
                  : hours.reason
                    ? t('Closed today: {reason}', { reason: hours.reason })
                    : t('Closed today')}
              </Text>
            </View>
          )}
          <StoreContact store={store} showWhatsApp />
          <Button title={t('Help & support')} variant="secondary" icon="help-buoy-outline" onPress={() => router.push('/help')} />
        </View>
      )}
    </ScrollView>
  );
}

function CategoryName({ category }: { category: Category }) {
  const { localName } = useT();
  return <>{localName(category)}</>;
}

/** A bundle offer: what's in it, the saving, and "Add all to cart". */
function OfferCard({ promotion }: { promotion: Promotion }) {
  const { t, localName } = useT();
  const { money } = useStore();
  const cart = useCart();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const available = promotion.items.every((i) => i.isAvailable);

  async function addAll() {
    setAdding(true);
    try {
      const ids = promotion.items.map((i) => i.productId).join(',');
      const { items: products } = await api.get<Paginated<Product>>(`/api/products?ids=${ids}&pageSize=20`);
      const result = cart.addMany(
        promotion.items.map((i) => ({ product: products.find((p) => p.id === i.productId)!, quantity: i.quantity })).filter((l) => l.product),
      );
      toast(result.skipped ? t('Added {count} items — some are out of stock', { count: result.added }) : t('Offer items added to your cart'));
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setAdding(false);
    }
  }

  return (
    <View style={styles.offer}>
      <View style={styles.offerBadge}>
        <Text style={styles.offerBadgeText}>{t('Save {amount}', { amount: money(promotion.discountCents) })}</Text>
      </View>
      <Text style={styles.offerName}>{localName(promotion)}</Text>
      <View style={styles.offerItems}>
        {promotion.items.map((item) => (
          <View key={item.productId} style={styles.offerItem}>
            <ProductImage product={{ imageUrl: item.imageUrl, name: item.name, nameTa: item.nameTa }} size={44} rounded={radius.sm} />
            <Text style={styles.offerItemText} numberOfLines={2}>
              {item.quantity} × {localName(item)}
            </Text>
          </View>
        ))}
      </View>
      <Button
        title={available ? t('Add all to cart') : t('Some items are out of stock')}
        size="small"
        icon="basket"
        loading={adding}
        disabled={!available}
        onPress={addAll}
      />
    </View>
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
  greeting: { fontSize: 15, color: colors.textMuted, marginTop: 2, lineHeight: 21 },
  bell: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bellBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadgeText: { fontSize: 12, fontWeight: '800', color: colors.primaryDarker },

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
  searchText: { fontSize: font.body, color: colors.textMuted, flex: 1 },

  promo: { backgroundColor: colors.primaryDark, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, ...shadow },
  promoRow: { flexDirection: 'row', alignItems: 'stretch' },
  promoItem: { flex: 1, gap: 4 },
  promoDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: spacing.md },
  promoTitle: { color: '#fff', fontSize: font.body + 1, fontWeight: '800', marginTop: 4 },
  promoText: { color: '#D3EADB', fontSize: 14, lineHeight: 20 },
  promoFoot: { color: '#D3EADB', fontSize: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', paddingTop: spacing.sm, lineHeight: 20 },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  seeAllButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  seeAll: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  debug: { textAlign: 'center', color: colors.textMuted, fontSize: 13, marginTop: -spacing.lg },

  offer: {
    width: 280,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  offerBadge: { alignSelf: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  offerBadgeText: { fontSize: 13, fontWeight: '800', color: colors.accentText },
  offerName: { fontSize: font.large, fontWeight: '800', color: colors.text },
  offerItems: { gap: 6 },
  offerItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  offerItemText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 19 },

  footer: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  footerTitle: { fontSize: font.small, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  footerName: { fontSize: font.large, fontWeight: '800', color: colors.primaryDarker },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  footerNote: { fontSize: 15, color: colors.text, fontWeight: '600', flex: 1 },
});
