// "If this item is unavailable…" — the customer's substitution choice for one cart item.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, queryString } from '@/api/client';
import type { Paginated, Product } from '@/api/types';
import type { CartItem, SubstitutionChoice } from '@/context/CartContext';
import { useStore } from '@/context/StoreContext';
import { useT } from '@/i18n';
import { useDebounced } from '@/lib/useApi';
import { colors, font, radius, spacing } from '@/theme';
import { RadioCard } from './RadioCard';
import { ProductImage } from './products';
import { Button } from './ui';

/** Short label for a choice, e.g. "Don't replace" / "Similar item" / "Replace with: Moong Dal". */
export function useSubstitutionLabel() {
  const { t, localName } = useT();
  return (choice: SubstitutionChoice) =>
    choice.preference === 'specific'
      ? t('Replace with: {name}', { name: localName({ name: choice.productName ?? '', nameTa: choice.productNameTa }) })
      : choice.preference === 'similar'
        ? t('Replace with a similar item')
        : t("Don't replace — remove it");
}

export function SubstitutionSheet({
  item,
  visible,
  onClose,
  onChoose,
}: {
  item: CartItem;
  visible: boolean;
  onClose: () => void;
  onChoose: (choice: SubstitutionChoice) => void;
}) {
  const { t, localName } = useT();
  const { money } = useStore();
  const insets = useSafeAreaInsets();
  const [preference, setPreference] = useState(item.substitution.preference);
  const [chosen, setChosen] = useState<{ id: number; name: string; nameTa: string | null } | null>(
    item.substitution.productId
      ? { id: item.substitution.productId, name: item.substitution.productName ?? '', nameTa: item.substitution.productNameTa ?? null }
      : null,
  );
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const [results, setResults] = useState<Product[] | null>(null);

  useEffect(() => {
    if (!visible || preference !== 'specific') return;
    setResults(null);
    api
      .get<Paginated<Product>>(
        `/api/products${queryString({ search: debounced || undefined, categoryId: debounced ? undefined : item.categoryId, inStock: true, pageSize: 20 })}`,
      )
      .then((r) => setResults(r.items.filter((p) => p.id !== item.productId)))
      .catch(() => setResults([]));
  }, [visible, preference, debounced, item.categoryId, item.productId]);

  const name = localName(item);
  const canSave = preference !== 'specific' || chosen !== null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('Close')} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} accessibilityViewIsModal>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {t('If {name} is unavailable', { name })}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('Close')} style={styles.close}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: spacing.sm }} keyboardShouldPersistTaps="handled">
          <RadioCard selected={preference === 'none'} onPress={() => setPreference('none')} accessibilityLabel={t("Don't replace — remove it")}>
            <Text style={styles.optionTitle}>{t("Don't replace — remove it")}</Text>
            <Text style={styles.body}>{t("We'll remove it from your order and you won't be charged for it.")}</Text>
          </RadioCard>
          <RadioCard selected={preference === 'similar'} onPress={() => setPreference('similar')} accessibilityLabel={t('Replace with a similar item')}>
            <Text style={styles.optionTitle}>{t('Replace with a similar item')}</Text>
            <Text style={styles.body}>{t("Our staff pick the closest match. You'll never pay more than for the item you ordered.")}</Text>
          </RadioCard>
          <RadioCard selected={preference === 'specific'} onPress={() => setPreference('specific')} accessibilityLabel={t('Replace with a product I choose')}>
            <Text style={styles.optionTitle}>{t('Replace with a product I choose')}</Text>
            <Text style={styles.body}>
              {chosen ? t('Chosen: {name}', { name: localName(chosen) }) : t('Pick the replacement below. You never pay more than for the item you ordered.')}
            </Text>
          </RadioCard>

          {preference === 'specific' && (
            <View style={styles.pickArea}>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={18} color={colors.textMuted} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t('Search for a replacement')}
                  placeholderTextColor="#8A948D"
                  accessibilityLabel={t('Search for a replacement')}
                  style={styles.searchInput}
                />
              </View>
              {results === null ? (
                <ActivityIndicator color={colors.primary} />
              ) : results.length === 0 ? (
                <Text style={styles.body}>{t('No matching products in stock.')}</Text>
              ) : (
                results.map((product) => {
                  const selected = chosen?.id === product.id;
                  return (
                    <Pressable
                      key={product.id}
                      onPress={() => setChosen({ id: product.id, name: product.name, nameTa: product.nameTa })}
                      accessibilityRole="radio"
                      aria-checked={selected}
                      accessibilityLabel={`${localName(product)}, ${product.unitLabel}, ${money(product.priceCents)}`}
                      style={[styles.productRow, selected && styles.productRowSelected]}
                    >
                      <ProductImage product={product} size={48} rounded={radius.sm} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.productName} numberOfLines={2}>
                          {localName(product)}
                        </Text>
                        <Text style={styles.body}>
                          {product.unitLabel} · {money(product.priceCents)}
                        </Text>
                      </View>
                      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={selected ? colors.primary : colors.borderStrong} />
                    </Pressable>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>
        <Button
          title={t('Save choice')}
          disabled={!canSave}
          onPress={() => {
            onChoose(
              preference === 'specific' && chosen
                ? { preference, productId: chosen.id, productName: chosen.name, productNameTa: chosen.nameTa }
                : { preference },
            );
            onClose();
          }}
        />
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
    maxHeight: '88%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1, fontSize: font.large, fontWeight: '800', color: colors.text },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { fontSize: font.body, fontWeight: '700', color: colors.text },
  body: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  pickArea: { gap: spacing.sm, marginTop: spacing.xs },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontSize: font.body, color: colors.text, paddingVertical: spacing.sm },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    minHeight: 60,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  productRowSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  productName: { fontSize: 15, fontWeight: '700', color: colors.text },
});
