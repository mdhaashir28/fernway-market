// "Photo credits": who took the photos in the app, and under which licence.
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import type { ImageCredit } from '@/api/types';
import { PhotoCredit } from '@/components/PhotoCredit';
import { ErrorView, LoadingView } from '@/components/states';
import { Card } from '@/components/ui';
import { useT } from '@/i18n';
import { useApi } from '@/lib/useApi';
import { colors, font, spacing } from '@/theme';

interface CreditRow {
  name: string;
  nameTa: string | null;
  credit: ImageCredit;
}

export default function CreditsScreen() {
  const { t, localName } = useT();
  const credits = useApi(() => api.get<{ categories: CreditRow[]; products: CreditRow[] }>('/api/image-credits'), []);

  if (credits.loading && !credits.data) return <LoadingView />;
  if (credits.error && !credits.data) return <ErrorView error={credits.error} onRetry={credits.reload} />;
  const data = credits.data!;

  const section = (title: string, rows: CreditRow[]) =>
    rows.length > 0 && (
      <Card style={{ gap: spacing.sm }}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {rows.map((row, index) => (
          <View key={`${row.name}-${index}`} style={styles.row}>
            <Text style={styles.name}>{localName(row)}</Text>
            <PhotoCredit credit={row.credit} />
          </View>
        ))}
      </Card>
    );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        {t(
          'Most photos in this app come from Wikimedia Commons and are used under free licences. Tap a credit to see the original photo and its licence. Products marked "Image needed" are waiting for a photo from the store.',
        )}
      </Text>
      {section(t('Categories'), data.categories)}
      {section(t('Products'), data.products)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  intro: { fontSize: 15, color: colors.textMuted, lineHeight: 21 },
  sectionTitle: { fontSize: font.large, fontWeight: '800', color: colors.text },
  row: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  name: { fontSize: font.body, fontWeight: '700', color: colors.text },
});
