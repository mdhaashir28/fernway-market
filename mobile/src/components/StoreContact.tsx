// The store's address and phone numbers. Each number is a tap-to-call button,
// and customers can open a chat with the store in their own WhatsApp
// (WhatsApp's official "click to chat" link — nothing is sent automatically).
import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PhoneNumber, StoreInfo } from '@/api/types';
import { useToast } from '@/context/ToastContext';
import { useT } from '@/i18n';
import { colors, font, radius, spacing } from '@/theme';

/** All store phone numbers (older API versions only sent a single `phone`). */
export function storePhones(store: Pick<StoreInfo, 'phone' | 'phones'> | null): PhoneNumber[] {
  if (!store) return [];
  if (store.phones) return store.phones;
  return store.phone ? [{ display: store.phone, tel: store.phone.replace(/[^\d+]/g, '') }] : [];
}

/** Address (optional), one tap-to-call row per phone number, and (optionally) a WhatsApp chat link. */
export function StoreContact({ store, showAddress = true, showWhatsApp = false }: { store: StoreInfo; showAddress?: boolean; showWhatsApp?: boolean }) {
  return (
    <View style={styles.list}>
      {showAddress && store.address ? (
        <View style={styles.row}>
          <Ionicons name="location" size={20} color={colors.primary} />
          <Text style={styles.address} selectable>
            {store.address}
          </Text>
        </View>
      ) : null}
      {storePhones(store).map((phone) => (
        <CallButton key={phone.tel} phone={phone} />
      ))}
      {showWhatsApp && store.whatsappChatUrl ? <WhatsAppChatButton url={store.whatsappChatUrl} /> : null}
    </View>
  );
}

/** Opens the phone app with the number filled in. Where calls aren't possible, shows the number. */
export function CallButton({ phone }: { phone: PhoneNumber }) {
  const toast = useToast();
  const { t } = useT();
  async function call() {
    try {
      await Linking.openURL(`tel:${phone.tel}`);
    } catch {
      toast(t('Call us on {phone}', { phone: phone.display }));
    }
  }
  return (
    <Pressable
      onPress={call}
      accessibilityRole="link"
      accessibilityLabel={t('Call {phone}', { phone: phone.display })}
      accessibilityHint={t('Opens your phone app to call the store')}
      style={({ pressed }) => [styles.row, styles.actionRow, pressed && { opacity: 0.75 }]}
    >
      <Ionicons name="call" size={20} color={colors.primary} />
      <Text style={styles.phone}>{phone.display}</Text>
      <Text style={styles.actionLabel}>{t('Call')}</Text>
    </Pressable>
  );
}

export function WhatsAppChatButton({ url }: { url: string }) {
  const { t } = useT();
  return (
    <Pressable
      onPress={() => Linking.openURL(url).catch(() => {})}
      accessibilityRole="link"
      accessibilityLabel={t('Chat with the store on WhatsApp')}
      style={({ pressed }) => [styles.row, styles.actionRow, pressed && { opacity: 0.75 }]}
    >
      <Ionicons name="logo-whatsapp" size={20} color={colors.primary} />
      <Text style={[styles.phone, { fontSize: font.body }]}>{t('Chat with us on WhatsApp')}</Text>
      <Ionicons name="open-outline" size={18} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  address: { flex: 1, fontSize: font.body, color: colors.text, lineHeight: 22 },
  actionRow: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  phone: { flex: 1, fontSize: font.large, fontWeight: '700', color: colors.primaryDark, letterSpacing: 0.3 },
  actionLabel: { fontSize: font.small, fontWeight: '800', color: colors.primary, textTransform: 'uppercase' },
});
