// The root of the app: shared state (language, login, cart, store info) + screen stack.
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { CartProvider, useCart } from '@/context/CartContext';
import { NotificationsProvider } from '@/context/NotificationsContext';
import { StoreProvider } from '@/context/StoreContext';
import { ToastProvider } from '@/context/ToastContext';
import { LanguageProvider, useT } from '@/i18n';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Keeps the splash screen up until the saved language, login and cart have loaded. */
function SplashGate() {
  const { restoring } = useAuth();
  const { loaded } = useCart();
  const { loaded: languageLoaded } = useT();
  useEffect(() => {
    if (!restoring && loaded && languageLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [restoring, loaded, languageLoaded]);
  return null;
}

function AppStack() {
  const { t } = useT();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.primaryDark,
        headerTitleStyle: { fontWeight: '700', color: colors.text },
        headerShadowVisible: false,
        headerBackTitle: t('Back'),
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ title: '' }} />
      <Stack.Screen name="category/[id]" options={{ title: t('Category') }} />
      <Stack.Screen name="checkout" options={{ title: t('Checkout') }} />
      <Stack.Screen name="order/[id]" options={{ title: t('Order') }} />
      <Stack.Screen name="addresses/index" options={{ title: t('My addresses') }} />
      <Stack.Screen name="addresses/edit" options={{ title: t('Address') }} />
      <Stack.Screen name="notifications" options={{ title: t('Updates') }} />
      <Stack.Screen name="lists/index" options={{ title: t('My shopping lists') }} />
      <Stack.Screen name="lists/[id]" options={{ title: t('Shopping list') }} />
      <Stack.Screen name="help/index" options={{ title: t('Help & support') }} />
      <Stack.Screen name="credits" options={{ title: t('Photo credits') }} />
      <Stack.Screen name="help/report" options={{ title: t('Report a problem'), presentation: 'modal' }} />
      <Stack.Screen name="login" options={{ title: t('Log in'), presentation: 'modal' }} />
      <Stack.Screen name="signup" options={{ title: t('Create account'), presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <StoreProvider>
          <AuthProvider>
            <NotificationsProvider>
              <CartProvider>
                <ToastProvider>
                  <SplashGate />
                  <StatusBar style="dark" />
                  <AppStack />
                </ToastProvider>
              </CartProvider>
            </NotificationsProvider>
          </AuthProvider>
        </StoreProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
