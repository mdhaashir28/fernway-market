// Saved delivery addresses.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import type { Address } from '@/api/types';
import { EmptyState, ErrorView, LoadingView } from '@/components/states';
import { Badge, Button, Card } from '@/components/ui';
import { useStore } from '@/context/StoreContext';
import { useToast } from '@/context/ToastContext';
import { useT } from '@/i18n';
import { useErrorText } from '@/i18n/errors';
import { confirm } from '@/lib/confirm';
import { useApi } from '@/lib/useApi';
import { colors, font, spacing } from '@/theme';

export default function AddressesScreen() {
  const { money } = useStore();
  const { t } = useT();
  const toast = useToast();
  const errorText = useErrorText();
  const addresses = useApi(() => api.get<{ items: Address[] }>('/api/addresses').then((r) => r.items), [], { refetchOnFocus: true });

  async function remove(address: Address) {
    if (!(await confirm(t('Delete address?'), `${address.label}: ${address.line1}`, t('Delete'), true, t('Cancel')))) return;
    try {
      await api.delete(`/api/addresses/${address.id}`);
      toast(t('Address deleted'));
      addresses.reload();
    } catch (err) {
      toast(errorText(err), 'error');
    }
  }

  if (addresses.loading && !addresses.data) return <LoadingView />;
  if (addresses.error && !addresses.data) return <ErrorView error={addresses.error} onRetry={addresses.reload} />;

  return (
    <FlatList
      data={addresses.data ?? []}
      keyExtractor={(a) => String(a.id)}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      ListEmptyComponent={
        <EmptyState icon="location-outline" title={t('No saved addresses')} message={t('Add an address to get your shopping delivered.')} />
      }
      ListFooterComponent={
        <Button title={t('Add a new address')} icon="add" onPress={() => router.push('/addresses/edit')} style={{ marginTop: spacing.lg }} />
      }
      renderItem={({ item }) => (
        <Card style={{ gap: 4 }}>
          <View style={styles.titleRow}>
            <Text style={styles.label}>{item.label}</Text>
            {item.isDefault && <Badge label={t('Default')} background={colors.primarySoft} color={colors.primaryDark} icon="star" />}
          </View>
          <Text style={styles.body}>{item.recipientName}</Text>
          <Text style={styles.body}>
            {item.line1}
            {item.line2 ? `, ${item.line2}` : ''}
          </Text>
          <Text style={styles.body}>
            {item.city} {item.postcode}
          </Text>
          {item.deliveryAvailable && item.deliveryZone ? (
            <View style={styles.statusLine}>
              <Ionicons name="checkmark-circle" size={16} color={colors.primaryDark} />
              <Text style={styles.ok}>
                {t('We deliver here · {fee}', { fee: item.deliveryZone.feeCents ? money(item.deliveryZone.feeCents) : t('free') })}
              </Text>
            </View>
          ) : (
            <View style={styles.statusLine}>
              <Ionicons name="close-circle" size={16} color={colors.danger} />
              <Text style={styles.bad}>{t('Outside our delivery area (pickup is still available)')}</Text>
            </View>
          )}
          <View style={styles.actions}>
            <Button title={t('Edit')} size="small" variant="secondary" icon="pencil" onPress={() => router.push(`/addresses/edit?id=${item.id}`)} />
            <Button title={t('Delete')} size="small" variant="ghost" icon="trash-outline" onPress={() => remove(item)} />
          </View>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1, maxWidth: 640, width: '100%', alignSelf: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  label: { fontSize: font.large, fontWeight: '800', color: colors.text },
  body: { fontSize: font.body, color: colors.text },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  ok: { fontSize: 14, color: colors.primaryDark, fontWeight: '600', flexShrink: 1 },
  bad: { fontSize: 14, color: colors.danger, fontWeight: '600', flexShrink: 1 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
