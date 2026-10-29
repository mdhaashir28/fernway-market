// "Save to list": pick one of your shopping lists (or create one) for some products.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import type { ShoppingList, ShoppingListSummary } from '@/api/types';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useT } from '@/i18n';
import { useErrorText } from '@/i18n/errors';
import { colors, font, radius, spacing } from '@/theme';
import { Banner, Button, TextField } from './ui';

export function ListPicker({
  visible,
  onClose,
  items,
}: {
  visible: boolean;
  onClose: () => void;
  items: { productId: number; quantity: number }[];
}) {
  const { t } = useT();
  const { user } = useAuth();
  const toast = useToast();
  const errorText = useErrorText();
  const insets = useSafeAreaInsets();
  const [lists, setLists] = useState<ShoppingListSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !user) return;
    setError(null);
    api
      .get<{ items: ShoppingListSummary[] }>('/api/lists')
      .then((r) => setLists(r.items))
      .catch((err) => setError(errorText(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, user]);

  async function saveTo(list: ShoppingListSummary) {
    setSaving(true);
    try {
      for (const item of items) await api.put<{ list: ShoppingList }>(`/api/lists/${list.id}/items/${item.productId}`, { quantity: item.quantity });
      toast(t('Saved to “{name}”', { name: list.name }));
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function createList() {
    if (!newName.trim()) return setError(t('Please give the list a name'));
    setSaving(true);
    try {
      await api.post('/api/lists', { name: newName.trim(), items });
      toast(t('Saved to “{name}”', { name: newName.trim() }));
      setNewName('');
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('Close')} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {t('Save to a shopping list')}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('Close')} style={styles.close}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        {!user ? (
          <View style={{ gap: spacing.md }}>
            <Text style={styles.body}>{t('Log in to save shopping lists you can reuse every month.')}</Text>
            <Button
              title={t('Log in')}
              onPress={() => {
                onClose();
                router.push('/login');
              }}
            />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ gap: spacing.sm }} keyboardShouldPersistTaps="handled">
            {error && <Banner kind="error">{error}</Banner>}
            {lists === null && !error ? <ActivityIndicator color={colors.primary} /> : null}
            {lists?.map((list) => (
              <Pressable
                key={list.id}
                onPress={() => saveTo(list)}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={t('Save to {name}', { name: list.name })}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
              >
                <Ionicons name="list" size={22} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{list.name}</Text>
                  <Text style={styles.muted}>{t(list.itemCount === 1 ? '{count} product' : '{count} products', { count: list.itemCount })}</Text>
                </View>
                <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
              </Pressable>
            ))}
            <View style={styles.newList}>
              <TextField label={t('New list')} placeholder={t('e.g. Monthly groceries')} value={newName} onChangeText={setNewName} maxLength={60} />
              <Button title={t('Create and save')} icon="add" variant="secondary" loading={saving} onPress={createList} />
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    maxHeight: '80%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: font.large, fontWeight: '800', color: colors.text },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: font.body, color: colors.text, lineHeight: 22 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTitle: { fontSize: font.body, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted },
  newList: { marginTop: spacing.md },
});
