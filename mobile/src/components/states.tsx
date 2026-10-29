// Loading, error and empty states — every screen uses these so they look the same.
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useT } from '@/i18n';
import { useErrorText } from '@/i18n/errors';
import { colors, font, spacing } from '@/theme';
import { Button } from './ui';

export function LoadingView({ message }: { message?: string }) {
  const { t } = useT();
  const text = message ?? t('Loading…');
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={text}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const { t } = useT();
  const errorText = useErrorText();
  return (
    <View style={styles.center} accessibilityRole="alert">
      <View style={[styles.iconCircle, { backgroundColor: colors.dangerSoft }]}>
        <Ionicons name="cloud-offline-outline" size={34} color={colors.danger} />
      </View>
      <Text style={styles.title}>{t('Something went wrong')}</Text>
      <Text style={styles.message}>{errorText(error)}</Text>
      {onRetry && <Button title={t('Try again')} icon="refresh" onPress={onRetry} variant="secondary" style={styles.action} />}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ComponentProps<typeof Ionicons>['name'];
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.center}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon ?? 'basket-outline'} size={34} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.md,
    minHeight: 280,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: font.title - 2, fontWeight: '800', color: colors.text, textAlign: 'center' },
  message: { fontSize: font.body, color: colors.textMuted, textAlign: 'center', lineHeight: 24, maxWidth: 340 },
  muted: { fontSize: font.body, color: colors.textMuted },
  action: { marginTop: spacing.sm, alignSelf: 'center', minWidth: 200 },
});
