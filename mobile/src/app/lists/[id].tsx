// One shopping list: change quantities, remove products, add everything to the cart.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import type { ShoppingList } from '@/api/types';
import { ProductImage, QuantityStepper } from '@/components/products';
import { EmptyState, ErrorView, LoadingView } from '@/components/states';
import { Badge, Button, TextField } from '@/components/ui';
import { useStore } from '@/context/StoreContext';
import { useToast } from '@/context/ToastContext';
import { useT } from '@/i18n';
import { useErrorText } from '@/i18n/errors';
import { confirm } from '@/lib/confirm';
import { useAddToCart } from '@/lib/reorder';
import { useApi } from '@/lib/useApi';
import { colors, font, radius, spacing } from '@/theme';

export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { money } = useStore();
  const { t, localName } = useT();
  const toast = useToast();
  const errorText = useErrorText();
  const { addLines, busy } = useAddToCart();
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const list = useApi(() => api.get<{ list: ShoppingList }>(`/api/lists/${id}`).then((r) => r.list), [id], { refetchOnFocus: true });

  if (list.loading && !list.data) return <LoadingView />;
  if (list.error && !list.data) return <ErrorView error={list.error} onRetry={list.reload} />;
  const l = list.data;
  if (!l) return null;

  async function update(action: () => Promise<{ list: ShoppingList }>) {
    try {
      const result = await action();
      list.setData(result.list);
    } catch (err) {
      toast(errorText(err), 'error');
      list.reload();
    }
  }

  async function remove() {
    if (!(await confirm(t('Delete this list?'), t('"{name}" will be deleted. Products stay in the shop.', { name: l!.name }), t('Delete'), true, t('Cancel'))))
      return;
    try {
      await api.delete(`/api/lists/${l!.id}`);
      toast(t('List deleted'));
      router.back();
    } catch (err) {
      toast(errorText(err), 'error');
    }
  }

  const available = l.items.filter((i) => i.available);
  const estimate = available.reduce((sum, i) => sum + i.product.priceCents * Math.min(i.quantity, i.product.availableQuantity), 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: l.name }} />
      <FlatList
        data={l.items}
        keyExtractor={(i) => String(i.product.id)}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          renaming ? (
            <View style={styles.renameBox}>
              <TextField label={t('List name')} value={newName} onChangeText={setNewName} maxLength={60} autoFocus />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button title={t('Cancel')} variant="secondary" style={{ flex: 1 }} onPress={() => setRenaming(false)} />
                <Button
                  title={t('Save')}
                  style={{ flex: 1 }}
                  onPress={async () => {
                    await update(() => api.patch(`/api/lists/${l.id}`, { name: newName.trim() }));
                    setRenaming(false);
                  }}
                />
              </View>
            </View>
          ) : (
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => (setNewName(l.name), setRenaming(true))}
                accessibilityRole="button"
                style={styles.headerButton}
              >
                <Ionicons name="create-outline" size={18} color={colors.primary} />
                <Text style={styles.headerButtonText}>{t('Rename')}</Text>
              </Pressable>
              <Pressable onPress={remove} accessibilityRole="button" style={styles.headerButton}>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                <Text style={[styles.headerButtonText, { color: colors.danger }]}>{t('Delete list')}</Text>
              </Pressable>
            </View>
          )
        }
        ListEmptyComponent={
          <EmptyState
            icon="list-outline"
            title={t('This list is empty')}
            message={t('Open any product and tap "Save to a shopping list".')}
            action={<Button title={t('Browse products')} icon="storefront" onPress={() => router.navigate('/')} />}
          />
        }
        renderItem={({ item }) => {
          const name = localName(item.product);
          return (
            <View style={[styles.row, !item.available && styles.rowUnavailable]}>
              <Pressable onPress={() => router.push(`/product/${item.product.id}`)} accessibilityRole="link" accessibilityLabel={t('View {name}', { name })}>
                <ProductImage product={item.product} size={60} />
              </Pressable>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.name} numberOfLines={2}>
                  {name}
                </Text>
                <Text style={styles.muted}>
                  {item.product.unitLabel} · {money(item.product.priceCents)}
                </Text>
                {!item.available && <Badge label={t('Out of stock')} background={colors.dangerSoft} color={colors.danger} icon="close-circle" />}
                <View style={styles.rowFooter}>
                  <QuantityStepper
                    compact
                    value={item.quantity}
                    max={50}
                    onChange={(q) =>
                      q <= 0
                        ? update(() => api.delete(`/api/lists/${l.id}/items/${item.product.id}`))
                        : update(() => api.put(`/api/lists/${l.id}/items/${item.product.id}`, { quantity: q }))
                    }
                    label={name}
                  />
                  <Pressable
                    onPress={() => update(() => api.delete(`/api/lists/${l.id}/items/${item.product.id}`))}
                    accessibilityRole="button"
                    accessibilityLabel={t('Remove {name}', { name })}
                    style={styles.removeButton}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                </View>
              </View>
            </View>
          );
        }}
      />
      {l.items.length > 0 && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.muted}>
            {available.length < l.items.length
              ? t('{available} of {total} products in stock · about {amount}', { available: available.length, total: l.items.length, amount: money(estimate) })
              : t('About {amount} at today’s prices', { amount: money(estimate) })}
          </Text>
          <Button
            title={t('Add all to cart')}
            icon="basket"
            loading={busy}
            disabled={available.length === 0}
            onPress={() => addLines(available.map((i) => ({ productId: i.product.id, quantity: i.quantity })))}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: 160, flexGrow: 1, maxWidth: 700, width: '100%', alignSelf: 'center' },
  headerActions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  headerButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: spacing.xs },
  headerButtonText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  renameBox: { gap: spacing.sm, marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowUnavailable: { backgroundColor: colors.surfaceAlt },
  name: { fontSize: font.body, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted },
  rowFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  removeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
