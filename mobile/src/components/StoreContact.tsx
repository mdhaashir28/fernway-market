// The store's address and phone numbers. Each number is a tap-to-call button.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PhoneNumber, StoreInfo } from '@/api/types';
import { useToast } from '@/context/ToastContext';
import { colors, font, radius, spacing } from '@/theme';

/** All store phone numbers (older API versions only sent a single `phone`). */
export function storePhones(store: Pick<StoreInfo, 'phone' | 'phones'> | null): PhoneNumber[] {
  if (!store) return [];
  if (store.phones) return store.phones;
  return store.phone ? [{ display: store.phone, tel: store.phone.replace(/[^\d+]/g, '') }] : [];
}

/** Address (optional) plus one tap-to-call row per phone number. */
export function StoreContact({ store, showAddress = true }: { store: StoreInfo; showAddress?: boolean }) {
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
    </View>
  );
}

/** Opens the phone app with the number filled in. Where calls aren't possible, shows the number. */
export function CallButton({ phone }: { phone: PhoneNumber }) {
  const toast = useToast();
  async function call() {
    try {
      await Linking.openURL(`tel:${phone.tel}`);
    } catch {
      toast(`Call us on ${phone.display}`);
    }
  }
  return (
    <Pressable
      onPress={call}
      accessibilityRole="link"
      accessibilityLabel={`Call ${phone.display}`}
      accessibilityHint="Opens your phone app to call the store"
      style={({ pressed }) => [styles.row, styles.callRow, pressed && { opacity: 0.75 }]}
    >
      <Ionicons name="call" size={20} color={colors.primary} />
      <Text style={styles.phone}>{phone.display}</Text>
      <Text style={styles.callLabel}>Call</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  address: { flex: 1, fontSize: font.body, color: colors.text, lineHeight: 22 },
  callRow: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  phone: { flex: 1, fontSize: font.large, fontWeight: '700', color: colors.primaryDark, letterSpacing: 0.3 },
  callLabel: { fontSize: font.small, fontWeight: '800', color: colors.primary, textTransform: 'uppercase' },
});
