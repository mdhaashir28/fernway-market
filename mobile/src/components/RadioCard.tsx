import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';

/** A tappable card that behaves like a radio button (one choice in a group). */
export function RadioCard({
  selected,
  disabled,
  onPress,
  children,
  accessibilityLabel,
}: {
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.card,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && { opacity: 0.85 },
      ]}
    >
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={24}
        color={disabled ? colors.borderStrong : selected ? colors.primary : colors.textMuted}
      />
      <View style={{ flex: 1, gap: 2 }}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  disabled: { backgroundColor: colors.surfaceAlt },
});
