// "My shopping lists": saved lists for regular shopping (e.g. monthly groceries).
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import type { ShoppingList, ShoppingListSummary } from '@/api/types';
import { EmptyState, ErrorView, LoadingView } from '@/components/states';
import { Banner, Button, Card, TextField } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useT } from '@/i18n';
import { useErrorText } from '@/i18n/errors';
import { useApi } from '@/lib/useApi';
import { useFormat } from '@/lib/useFormat';
import { colors, font, radius, spacing } from '@/theme';

export default function ListsScreen() {
  const { user, restoring } = useAuth();
  const { t } = useT();
  const format = useFormat();
  const errorText = useErrorText();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lists = useApi(() => api.get<{ items: ShoppingListSummary[] }>('/api/lists').then((r) => r.items), [user?.id], {
    enabled: Boolean(user),
    refetchOnFocus: true,
  });

  if (restoring) return <LoadingView />;
  if (!user) {
    return (
      <EmptyState
        icon="list-outline"
        title={t('Log in to use shopping lists')}
        message={t('Log in to save shopping lists you can reuse every month.')}
        action={<Button title={t('Log in')} onPress={() => router.push('/login')} />}
      />
    );
  }
  if (lists.loading && !lists.data) return <LoadingView />;
  if (lists.error && !lists.data) return <ErrorView error={lists.error} onRetry={lists.reload} />;

  async function create() {
    if (!name.trim()) return setError(t('Please give the list a name'));
    setCreating(true);
    setError(null);
    try {
      const { list } = await api.post<{ list: ShoppingList }>('/api/lists', { name: name.trim() });
      setName('');
      router.push(`/lists/${list.id}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <FlatList
      data={lists.data ?? []}
      keyExtractor={(l) => String(l.id)}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={lists.refreshing} onRefresh={lists.refresh} tintColor={colors.primary} />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      ListHeaderComponent={
        <Text style={styles.intro}>
          {t('Save the things you buy often, then add the whole list to your cart in one tap. Prices and stock are checked when you add them.')}
        </Text>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Ionicons name="list-outline" size={32} color={colors.primary} />
          <Text style={styles.emptyText}>{t('You have no lists yet. Create one below, or tap "Save to a shopping list" on any product.')}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          onPress={() => router.push(`/lists/${item.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${t(item.itemCount === 1 ? '{count} product' : '{count} products', { count: item.itemCount })}`}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
        >
          <View style={styles.rowIcon}>
            <Ionicons name="list" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{item.name}</Text>
            <Text style={styles.muted}>
              {t(item.itemCount === 1 ? '{count} product' : '{count} products', { count: item.itemCount })} ·{' '}
              {t('Updated {date}', { date: format.date(item.updatedAt) })}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
      )}
      ListFooterComponent={
        <Card style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Text style={styles.rowTitle}>{t('New list')}</Text>
          {error && <Banner kind="error">{error}</Banner>}
          <TextField label={t('List name')} placeholder={t('e.g. Monthly groceries')} value={name} onChangeText={setName} maxLength={60} />
          <Button title={t('Create list')} icon="add" variant="secondary" loading={creating} onPress={create} />
        </Card>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 700, width: '100%', alignSelf: 'center' },
  intro: { fontSize: 15, color: colors.textMuted, lineHeight: 21, marginBottom: spacing.md },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyText: { fontSize: 15, color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: font.body, fontWeight: '800', color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted },
});
