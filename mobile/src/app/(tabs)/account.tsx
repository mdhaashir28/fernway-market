// Account: log in / sign up, addresses, store info, log out.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { API_URL } from '@/api/client';
import { StoreContact } from '@/components/StoreContact';
import { Button, Card } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { useToast } from '@/context/ToastContext';
import { confirm } from '@/lib/confirm';
import { colors, font, radius, spacing } from '@/theme';

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const { store, money } = useStore();
  const toast = useToast();

  async function handleLogout() {
    if (await confirm('Log out?', 'You can log back in at any time. Your cart stays on this phone.', 'Log out')) {
      await logout();
      toast('You have been logged out');
    }
  }

  const hours = store ? `${String(store.pickup.openHour).padStart(2, '0')}:00 – ${String(store.pickup.closeHour).padStart(2, '0')}:00` : '';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {user ? (
        <Card style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.muted}>{user.email}</Text>
          </View>
        </Card>
      ) : (
        <Card style={{ gap: spacing.md }}>
          <Text style={styles.welcomeTitle}>Welcome to {store?.name ?? 'Meeranji Supermarket'} 👋</Text>
          <Text style={styles.body}>Log in or create an account to check out, save addresses and track your orders.</Text>
          <Button title="Log in" onPress={() => router.push('/login')} />
          <Button title="Create an account" variant="secondary" onPress={() => router.push('/signup')} />
        </Card>
      )}

      {user && (
        <View style={styles.menu}>
          <MenuRow icon="location-outline" label="My addresses" onPress={() => router.push('/addresses')} />
          <MenuRow icon="receipt-outline" label="My orders" onPress={() => router.navigate('/orders')} />
        </View>
      )}

      {store && (
        <Card style={{ gap: spacing.md }}>
          <Text style={styles.sectionTitle}>Visit or call {store.name}</Text>
          <StoreContact store={store} />
          <InfoRow icon="time" text={`Pickup times ${hours}`} />
          {store.deliveryZones.length > 0 && (
            <View style={{ gap: 4 }}>
              <Text style={styles.subTitle}>Delivery areas</Text>
              {store.deliveryZones.map((zone) => (
                <Text key={zone.name} style={styles.muted}>
                  • {zone.name} (PIN codes {zone.postcodePrefixes.join(', ')}): {zone.feeCents ? money(zone.feeCents) : 'free'}
                  {zone.freeDeliveryThresholdCents ? `, free over ${money(zone.freeDeliveryThresholdCents)}` : ''}
                </Text>
              ))}
            </View>
          )}
        </Card>
      )}

      {user && <Button title="Log out" variant="danger" icon="log-out-outline" onPress={handleLogout} />}

      <Text style={styles.footer}>Connected to {API_URL}</Text>
    </ScrollView>
  );
}

function MenuRow({ icon, label, onPress }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.8 }]}>
      <Ionicons name={icon} size={22} color={colors.primary} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

function InfoRow({ icon, text }: { icon: ComponentProps<typeof Ionicons>['name']; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={[styles.body, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: font.title, fontWeight: '800', color: colors.primaryDarker },
  name: { fontSize: font.large + 1, fontWeight: '800', color: colors.text },
  welcomeTitle: { fontSize: font.title, fontWeight: '800', color: colors.text },
  sectionTitle: { fontSize: font.large, fontWeight: '800', color: colors.text },
  subTitle: { fontSize: font.body, fontWeight: '700', color: colors.text, marginTop: spacing.xs },
  body: { fontSize: font.body, color: colors.text, lineHeight: 22 },
  muted: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  menu: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuLabel: { flex: 1, fontSize: font.body, fontWeight: '600', color: colors.text },
  infoRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  footer: { textAlign: 'center', fontSize: 12, color: colors.textMuted },
});
