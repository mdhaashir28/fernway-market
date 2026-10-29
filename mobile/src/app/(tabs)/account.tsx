// Account: language, profile and WhatsApp updates, loyalty points, menu, store info.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { API_URL, api } from '@/api/client';
import type { LoyaltyInfo } from '@/api/types';
import { LanguageToggle } from '@/components/LanguageToggle';
import { StoreContact } from '@/components/StoreContact';
import { Banner, Button, Card, DemoNote, TextField } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationsContext';
import { useStore } from '@/context/StoreContext';
import { useToast } from '@/context/ToastContext';
import { useT } from '@/i18n';
import { useErrorText } from '@/i18n/errors';
import { confirm } from '@/lib/confirm';
import { WEEKDAYS } from '@/lib/hours';
import { useApi } from '@/lib/useApi';
import { useFormat } from '@/lib/useFormat';
import { colors, font, radius, spacing } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export default function AccountScreen() {
  const { user, logout } = useAuth();
  const { store, money } = useStore();
  const { t } = useT();
  const toast = useToast();
  const { unreadCount } = useNotifications();
  const loyaltyOn = Boolean(store?.loyalty.enabled);
  const loyalty = useApi(() => api.get<LoyaltyInfo>('/api/loyalty'), [user?.id], { enabled: Boolean(user) && loyaltyOn, refetchOnFocus: true });

  async function handleLogout() {
    if (await confirm(t('Log out?'), t('You can log back in at any time. Your cart stays on this phone.'), t('Log out'), false, t('Cancel'))) {
      await logout();
      toast(t('You have been logged out'));
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: spacing.sm }}>
        <Text style={styles.sectionTitle}>{t('Language')}</Text>
        <LanguageToggle />
        <Text style={styles.muted}>{t('Order updates and messages are also sent in this language.')}</Text>
      </Card>

      {user ? (
        <ProfileCard />
      ) : (
        <Card style={{ gap: spacing.md }}>
          <Text style={styles.welcomeTitle}>{t('Welcome to {name}', { name: store?.name ?? 'Meeranji Supermarket' })}</Text>
          <Text style={styles.body}>{t('Log in or create an account to check out, save addresses and track your orders.')}</Text>
          <Button title={t('Log in')} onPress={() => router.push('/login')} />
          <Button title={t('Create an account')} variant="secondary" onPress={() => router.push('/signup')} />
        </Card>
      )}

      {user && loyaltyOn && loyalty.data?.enabled && (
        <Card style={styles.pointsCard}>
          <Ionicons name="star" size={28} color={colors.accentText} />
          <View style={{ flex: 1 }}>
            <Text style={styles.pointsValue}>{t('{points} points', { points: loyalty.data.balance })}</Text>
            <Text style={styles.muted}>
              {t('Earn {earn} points for every ₹100. Each point is worth {value} at checkout.', {
                earn: loyalty.data.pointsPer100,
                value: money(loyalty.data.pointValueCents),
              })}
            </Text>
          </View>
        </Card>
      )}

      {user && (
        <View style={styles.menu}>
          <MenuRow icon="notifications-outline" label={t('Updates')} count={unreadCount} onPress={() => router.push('/notifications')} />
          <MenuRow icon="receipt-outline" label={t('My orders')} onPress={() => router.navigate('/orders')} />
          <MenuRow icon="list-outline" label={t('My shopping lists')} onPress={() => router.push('/lists')} />
          <MenuRow icon="location-outline" label={t('My addresses')} onPress={() => router.push('/addresses')} />
          <MenuRow icon="help-buoy-outline" label={t('Help & support')} onPress={() => router.push('/help')} last />
        </View>
      )}
      {!user && (
        <View style={styles.menu}>
          <MenuRow icon="help-buoy-outline" label={t('Help & support')} onPress={() => router.push('/help')} last />
        </View>
      )}

      {store && <StoreCard />}

      {user && <Button title={t('Log out')} variant="danger" icon="log-out-outline" onPress={handleLogout} />}

      <Text style={styles.footer}>{t('Connected to {url}', { url: API_URL })}</Text>
    </ScrollView>
  );
}

function ProfileCard() {
  const { user, updateProfile } = useAuth();
  const { store } = useStore();
  const { t } = useT();
  const toast = useToast();
  const errorText = useErrorText();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(user?.name ?? '');
    setPhone(user?.phone ?? '');
  }, [user?.name, user?.phone]);

  if (!user) return null;

  async function save() {
    if (!name.trim()) return setError(t('Please enter your name'));
    setSaving(true);
    setError(null);
    try {
      await updateProfile({ name: name.trim(), phone: phone.trim() || null });
      setEditing(false);
      toast(t('Your details were saved'));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleWhatsApp(on: boolean) {
    if (on && !user!.phone) {
      setEditing(true);
      setError(t('Add your mobile number to get order updates on WhatsApp.'));
      return;
    }
    try {
      await updateProfile({ whatsappOptIn: on });
      toast(on ? t('WhatsApp updates turned on') : t('WhatsApp updates turned off'));
    } catch (err) {
      toast(errorText(err), 'error');
    }
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={styles.profile}>
        <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={styles.avatarText}>{user.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user.name}</Text>
          <Text style={styles.muted}>{user.email}</Text>
          {user.phone ? <Text style={styles.muted}>{user.phone}</Text> : null}
        </View>
        {!editing && (
          <Pressable onPress={() => setEditing(true)} accessibilityRole="button" accessibilityLabel={t('Edit my details')} style={styles.editButton}>
            <Ionicons name="create-outline" size={20} color={colors.primary} />
            <Text style={styles.editText}>{t('Edit')}</Text>
          </Pressable>
        )}
      </View>
      {editing && (
        <View style={{ gap: spacing.sm }}>
          {error && <Banner kind="error">{error}</Banner>}
          <TextField label={t('Name')} value={name} onChangeText={setName} maxLength={100} autoComplete="name" />
          <TextField
            label={t('Mobile number')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            maxLength={20}
            autoComplete="tel"
            hint={t('Used for delivery and, if you turn them on, WhatsApp order updates.')}
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button title={t('Cancel')} variant="secondary" style={{ flex: 1 }} onPress={() => (setEditing(false), setError(null))} />
            <Button title={t('Save')} style={{ flex: 1 }} loading={saving} onPress={save} />
          </View>
        </View>
      )}
      {store?.whatsappUpdatesAvailable && (
        <View style={styles.toggleRow}>
          <Ionicons name="logo-whatsapp" size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.bodyStrong}>{t('Order updates on WhatsApp')}</Text>
            <Text style={styles.muted}>{t('Confirmed, ready, out for delivery and refunds. You can turn this off any time.')}</Text>
            {store.whatsappIsDemo && (
              <View style={{ marginTop: 6 }}>
                <DemoNote>{t('DEMO: messages are previewed by the store, not sent')}</DemoNote>
              </View>
            )}
          </View>
          <Switch
            value={user.whatsappOptIn}
            onValueChange={toggleWhatsApp}
            accessibilityLabel={t('Send me order updates on WhatsApp')}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
          />
        </View>
      )}
    </Card>
  );
}

function StoreCard() {
  const { store, money } = useStore();
  const { t } = useT();
  const format = useFormat();
  if (!store) return null;
  const today = new Date().getDay();
  const upcomingClosures = store.closures.slice(0, 3);
  return (
    <Card style={{ gap: spacing.md }}>
      <Text style={styles.sectionTitle}>{t('Visit or call {name}', { name: store.name })}</Text>
      <StoreContact store={store} showWhatsApp />
      {store.openingHours.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={styles.subTitle}>{t('Opening hours')}</Text>
          {[1, 2, 3, 4, 5, 6, 0].map((weekday) => {
            const hours = store.openingHours.find((h) => h.weekday === weekday);
            const isToday = weekday === today;
            return (
              <View key={weekday} style={styles.hoursRow}>
                <Text style={[styles.hoursDay, isToday && styles.hoursToday]}>
                  {t(WEEKDAYS[weekday])}
                  {isToday ? ` (${t('today')})` : ''}
                </Text>
                <Text style={[styles.hoursTime, isToday && styles.hoursToday]}>
                  {!hours || hours.isClosed ? t('Closed') : `${hours.opensAt} – ${hours.closesAt}`}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      {upcomingClosures.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={styles.subTitle}>{t('Holidays')}</Text>
          {upcomingClosures.map((closure) => (
            <Text key={closure.date} style={styles.muted}>
              • {format.date(`${closure.date}T12:00:00`)}: {t('Closed')}
              {closure.reason ? ` (${closure.reason})` : ''}
            </Text>
          ))}
        </View>
      )}
      {store.deliveryZones.length > 0 && (
        <View style={{ gap: 4 }}>
          <Text style={styles.subTitle}>{t('Delivery areas')}</Text>
          {store.deliveryZones.map((zone) => (
            <Text key={zone.name} style={styles.muted}>
              • {t('{zone} (PIN codes {codes}): {fee}', {
                zone: zone.name,
                codes: zone.postcodePrefixes.join(', '),
                fee: zone.feeCents ? money(zone.feeCents) : t('free'),
              })}
              {zone.freeDeliveryThresholdCents ? `, ${t('free over {amount}', { amount: money(zone.freeDeliveryThresholdCents) })}` : ''}
            </Text>
          ))}
        </View>
      )}
    </Card>
  );
}

function MenuRow({ icon, label, onPress, count, last }: { icon: IconName; label: string; onPress: () => void; count?: number; last?: boolean }) {
  const { t } = useT();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${t('{count} new', { count })}` : label}
      style={({ pressed }) => [styles.menuRow, last && { borderBottomWidth: 0 }, pressed && { opacity: 0.8 }]}
    >
      <Ionicons name={icon} size={22} color={colors.primary} />
      <Text style={styles.menuLabel}>{label}</Text>
      {count ? (
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{t('{count} new', { count })}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
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
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: spacing.sm },
  editText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  welcomeTitle: { fontSize: font.title, fontWeight: '800', color: colors.text },
  sectionTitle: { fontSize: font.large, fontWeight: '800', color: colors.text },
  subTitle: { fontSize: font.body, fontWeight: '700', color: colors.text, marginTop: spacing.xs },
  body: { fontSize: font.body, color: colors.text, lineHeight: 22 },
  bodyStrong: { fontSize: font.body, color: colors.text, fontWeight: '700' },
  muted: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  pointsCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.accentSoft, borderColor: colors.accent },
  pointsValue: { fontSize: font.title, fontWeight: '800', color: colors.text },
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
  countBadge: { backgroundColor: colors.danger, borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  countText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  hoursDay: { fontSize: 15, color: colors.text },
  hoursTime: { fontSize: 15, color: colors.text, fontWeight: '600' },
  hoursToday: { fontWeight: '800', color: colors.primaryDark },
  footer: { textAlign: 'center', fontSize: 12, color: colors.textMuted },
});
