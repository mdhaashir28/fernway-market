// Saved delivery addresses.
import { router } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import type { Address } from '@/api/types';
import { EmptyState, ErrorView, LoadingView } from '@/components/states';
import { Badge, Button, Card } from '@/components/ui';
import { useStore } from '@/context/StoreContext';
import { useToast } from '@/context/ToastContext';
import { confirm } from '@/lib/confirm';
import { useApi } from '@/lib/useApi';
import { colors, font, spacing } from '@/theme';

export default function AddressesScreen() {
  const { money } = useStore();
  const toast = useToast();
  const addresses = useApi(() => api.get<{ items: Address[] }>('/api/addresses').then((r) => r.items), [], { refetchOnFocus: true });

  async function remove(address: Address) {
    if (!(await confirm('Delete address?', `${address.label}: ${address.line1}`, 'Delete', true))) return;
    try {
      await api.delete(`/api/addresses/${address.id}`);
      toast('Address deleted');
      addresses.reload();
    } catch (err) {
      toast((err as Error).message, 'error');
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
        <EmptyState icon="location-outline" title="No saved addresses" message="Add an address to get your shopping delivered." />
      }
      ListFooterComponent={
        <Button title="Add a new address" icon="add" onPress={() => router.push('/addresses/edit')} style={{ marginTop: spacing.lg }} />
      }
      renderItem={({ item }) => (
        <Card style={{ gap: 4 }}>
          <View style={styles.titleRow}>
            <Text style={styles.label}>{item.label}</Text>
            {item.isDefault && <Badge label="Default" background={colors.primarySoft} color={colors.primaryDark} />}
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
            <Text style={styles.ok}>
              ✓ We deliver here · {item.deliveryZone.feeCents ? money(item.deliveryZone.feeCents) : 'free'} delivery
            </Text>
          ) : (
            <Text style={styles.bad}>Outside our delivery area (pickup is still available)</Text>
          )}
          <View style={styles.actions}>
            <Button title="Edit" size="small" variant="secondary" icon="pencil" onPress={() => router.push(`/addresses/edit?id=${item.id}`)} />
            <Button title="Delete" size="small" variant="ghost" icon="trash-outline" onPress={() => remove(item)} />
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
  ok: { fontSize: 14, color: colors.primaryDark, fontWeight: '600', marginTop: 4 },
  bad: { fontSize: 14, color: colors.danger, fontWeight: '600', marginTop: 4 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
