// The bottom tab bar: Shop, Search, Cart, Orders, Account.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '@/context/CartContext';
import { useNotifications } from '@/context/NotificationsContext';
import { useT } from '@/i18n';
import { colors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const icon =
  (outline: IconName, filled: IconName) =>
  ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={focused ? filled : outline} size={size} color={color} />
  );

export default function TabsLayout() {
  const { count } = useCart();
  const { unreadCount } = useNotifications();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const badgeStyle = { backgroundColor: colors.accent, color: colors.primaryDarker, fontWeight: '800' as const };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        // Room for Tamil letters, which reach further above and below the line than English.
        tabBarLabelStyle: { fontSize: 12, lineHeight: 18, minHeight: 18, flexShrink: 0, fontWeight: '600' },
        tabBarItemStyle: { paddingVertical: 4, paddingHorizontal: 0 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 72 + insets.bottom,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { fontWeight: '800', color: colors.text },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('Shop'), headerShown: false, tabBarIcon: icon('storefront-outline', 'storefront') }} />
      <Tabs.Screen name="search" options={{ title: t('Search'), tabBarIcon: icon('search-outline', 'search') }} />
      <Tabs.Screen
        name="cart"
        options={{
          title: t('Cart'),
          tabBarIcon: icon('basket-outline', 'basket'),
          tabBarBadge: count > 0 ? count : undefined,
          tabBarBadgeStyle: badgeStyle,
          tabBarAccessibilityLabel: count > 0 ? t('Cart, {count} items', { count }) : t('Cart'),
        }}
      />
      <Tabs.Screen name="orders" options={{ title: t('Orders'), tabBarIcon: icon('receipt-outline', 'receipt') }} />
      <Tabs.Screen
        name="account"
        options={{
          title: t('Account'),
          tabBarIcon: icon('person-circle-outline', 'person-circle'),
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: badgeStyle,
          tabBarAccessibilityLabel: unreadCount > 0 ? t('Account, {count} new updates', { count: unreadCount }) : t('Account'),
        }}
      />
    </Tabs>
  );
}
