// Basic building blocks: buttons, text fields, cards, chips, banners, badges.
import Ionicons from '@expo/vector-icons/Ionicons';
import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import type { OrderStatus } from '@/api/types';
import { STATUS_LABELS } from '@/lib/format';
import { colors, font, radius, shadow, spacing } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

// ---------------------------------------------------------------------------
export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'large',
  icon,
  loading = false,
  disabled = false,
  style,
  accessibilityHint,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'large' | 'small';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const isDisabled = disabled || loading;
  const textColor =
    variant === 'primary' ? colors.textOnPrimary : variant === 'danger' ? colors.danger : colors.primaryDark;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.button,
        size === 'small' && styles.buttonSmall,
        styles[`button_${variant}`],
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        icon && <Ionicons name={icon} size={size === 'small' ? 16 : 20} color={textColor} />
      )}
      <Text style={[styles.buttonText, size === 'small' && styles.buttonTextSmall, { color: textColor }]}>{title}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
export const TextField = forwardRef<TextInput, TextInputProps & { label: string; error?: string; hint?: string }>(
  function TextField({ label, error, hint, style, ...inputProps }, ref) {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          ref={ref}
          placeholderTextColor="#8A948D"
          accessibilityLabel={label}
          style={[styles.input, error ? styles.inputError : null, inputProps.multiline && styles.inputMultiline, style]}
          {...inputProps}
        />
        {error ? (
          <Text style={styles.errorText} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : hint ? (
          <Text style={styles.hint}>{hint}</Text>
        ) : null}
      </View>
    );
  },
);

// ---------------------------------------------------------------------------
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {children}
      </Text>
      {action}
    </View>
  );
}

// ---------------------------------------------------------------------------
export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}
    >
      {icon && <Ionicons name={icon} size={16} color={selected ? '#fff' : colors.primaryDark} />}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
const BANNER_STYLES = {
  info: { bg: colors.infoSoft, fg: '#133F8F', icon: 'information-circle' },
  success: { bg: colors.primarySoft, fg: colors.primaryDarker, icon: 'checkmark-circle' },
  warning: { bg: colors.accentSoft, fg: '#5C3B00', icon: 'warning' },
  error: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle' },
} as const;

export function Banner({
  kind = 'info',
  title,
  children,
}: {
  kind?: keyof typeof BANNER_STYLES;
  title?: string;
  children?: ReactNode;
}) {
  const s = BANNER_STYLES[kind];
  return (
    <View style={[styles.banner, { backgroundColor: s.bg }]} accessibilityRole={kind === 'error' ? 'alert' : undefined}>
      <Ionicons name={s.icon} size={22} color={s.fg} />
      <View style={{ flex: 1, gap: 2 }}>
        {title && <Text style={[styles.bannerTitle, { color: s.fg }]}>{title}</Text>}
        {typeof children === 'string' ? <Text style={[styles.bannerText, { color: s.fg }]}>{children}</Text> : children}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
const STATUS_COLORS: Record<OrderStatus, { bg: string; fg: string }> = {
  pending: { bg: colors.accentSoft, fg: colors.accentText },
  preparing: { bg: colors.infoSoft, fg: colors.info },
  ready_for_pickup: { bg: colors.violetSoft, fg: colors.violet },
  out_for_delivery: { bg: colors.tealSoft, fg: colors.teal },
  completed: { bg: colors.primarySoft, fg: colors.primaryDark },
  cancelled: { bg: colors.dangerSoft, fg: colors.danger },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const c = STATUS_COLORS[status];
  return <Badge label={STATUS_LABELS[status]} background={c.bg} color={c.fg} />;
}

export function Badge({ label, background, color }: { label: string; background: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },

  button: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonSmall: { minHeight: 40, paddingHorizontal: spacing.lg },
  button_primary: { backgroundColor: colors.primary },
  button_secondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  button_ghost: { backgroundColor: 'transparent' },
  button_danger: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: '#F0B4AE' },
  buttonText: { fontSize: font.body + 1, fontWeight: '700' },
  buttonTextSmall: { fontSize: 15 },

  field: { gap: 6, marginBottom: spacing.lg },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: font.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputMultiline: { minHeight: 90, paddingTop: spacing.md, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 14, fontWeight: '500' },
  hint: { color: colors.textMuted, fontSize: 14 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },

  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: font.large + 1, fontWeight: '800', color: colors.text },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 15, fontWeight: '600', color: colors.primaryDark },
  chipTextSelected: { color: '#fff' },

  banner: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'flex-start',
  },
  bannerTitle: { fontSize: font.body, fontWeight: '700' },
  bannerText: { fontSize: 15, lineHeight: 21 },

  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: 13, fontWeight: '700' },
});
