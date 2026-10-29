// "Photo: author · licence · Wikimedia Commons" — the credit that free-licence
// photos require. Tapping it opens the original photo's page.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import type { ImageCredit } from '@/api/types';
import { useT } from '@/i18n';
import { colors, spacing } from '@/theme';

export function usePhotoCreditText() {
  const { t } = useT();
  return (credit: ImageCredit) =>
    credit.kind === 'store'
      ? t('Photo: {source}', { source: credit.note ?? '' })
      : t('Photo: {author} · {licence} · Wikimedia Commons', { author: credit.author ?? '', licence: credit.licence ?? '' });
}

export function PhotoCredit({ credit }: { credit: ImageCredit | null | undefined }) {
  const { t } = useT();
  const text = usePhotoCreditText();
  if (!credit) return null;
  const url = credit.sourceUrl;
  return (
    <Pressable
      onPress={url ? () => Linking.openURL(url).catch(() => {}) : undefined}
      disabled={!url}
      accessibilityRole={url ? 'link' : 'text'}
      accessibilityHint={url ? t('Opens where this photo comes from') : undefined}
      style={styles.row}
      hitSlop={6}
    >
      <Ionicons name="camera-outline" size={14} color={colors.textMuted} />
      <Text style={[styles.text, url ? styles.link : null]} numberOfLines={2}>
        {text(credit)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingVertical: spacing.xs },
  text: { flex: 1, fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  link: { textDecorationLine: 'underline' },
});
