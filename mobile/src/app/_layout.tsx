// The root of the app: shared state (login, cart, store info) + screen stack.
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { CartProvider, useCart } from '@/context/CartContext';
import { StoreProvider } from '@/context/StoreContext';
import { ToastProvider } from '@/context/ToastContext';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Keeps the splash screen up until the saved login and cart have loaded. */
function SplashGate() {
  const { restoring } = useAuth();
  const { loaded } = useCart();
  useEffect(() => {
    if (!restoring && loaded) SplashScreen.hideAsync().catch(() => {});
  }, [restoring, loaded]);
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <AuthProvider>
          <CartProvider>
            <ToastProvider>
              <SplashGate />
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: colors.surface },
                  headerTintColor: colors.primaryDark,
                  headerTitleStyle: { fontWeight: '700', color: colors.text },
                  headerShadowVisible: false,
                  headerBackTitle: 'Back',
                  contentStyle: { backgroundColor: colors.background },
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="product/[id]" options={{ title: '' }} />
                <Stack.Screen name="category/[id]" options={{ title: 'Category' }} />
                <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
                <Stack.Screen name="order/[id]" options={{ title: 'Order' }} />
                <Stack.Screen name="addresses/index" options={{ title: 'My addresses' }} />
                <Stack.Screen name="addresses/edit" options={{ title: 'Address' }} />
                <Stack.Screen name="login" options={{ title: 'Log in', presentation: 'modal' }} />
                <Stack.Screen name="signup" options={{ title: 'Create account', presentation: 'modal' }} />
              </Stack>
            </ToastProvider>
          </CartProvider>
        </AuthProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
