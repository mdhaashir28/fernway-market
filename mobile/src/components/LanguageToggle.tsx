// English / தமிழ் switch.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT, type Lang } from '@/i18n';
import { colors, radius } from '@/theme';

const OPTIONS: { value: Lang; label: string; a11y: string }[] = [
  { value: 'en', label: 'English', a11y: 'English' },
  { value: 'ta', label: 'தமிழ்', a11y: 'Tamil, தமிழ்' },
];

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useT();
  return (
    <View style={[styles.group, compact && styles.compact]} accessibilityRole="radiogroup" accessibilityLabel={t('Language')}>
      {OPTIONS.map((option) => {
        const selected = option.value === lang;
        return (
          <Pressable
            key={option.value}
            onPress={() => setLang(option.value)}
            accessibilityRole="radio"
            aria-checked={selected}
            accessibilityLabel={option.a11y}
            style={[styles.option, compact && styles.optionCompact, selected && styles.selected]}
          >
            <Text style={[styles.text, compact && styles.textCompact, selected && styles.textSelected]}>
              {compact && option.value === 'en' ? 'EN' : option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 3, alignSelf: 'flex-start' },
  compact: { padding: 2 },
  option: { minHeight: 44, minWidth: 88, paddingHorizontal: 16, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  optionCompact: { minHeight: 40, minWidth: 48, paddingHorizontal: 10 },
  selected: { backgroundColor: colors.primary },
  text: { fontSize: 16, fontWeight: '700', color: colors.primaryDark },
  textCompact: { fontSize: 14 },
  textSelected: { color: '#fff' },
});
