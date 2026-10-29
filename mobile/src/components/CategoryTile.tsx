// A category on the Home screen: its photo with the name underneath.
// Categories without a photo show a clearly labelled "Image needed" box (no emoji, no stand-in).
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { imageUrl } from '@/api/client';
import type { Category } from '@/api/types';
import { useT } from '@/i18n';
import { colors, radius, spacing } from '@/theme';

export function CategoryTile({ category, width }: { category: Category; width: number }) {
  const { t, localName } = useT();
  const src = imageUrl(category.imageUrl);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const name = localName(category);

  return (
    <Pressable
      onPress={() => router.push(`/category/${category.id}`)}
      accessibilityRole="button"
      accessibilityLabel={t('{name}, {count} products', { name, count: category.productCount })}
      style={({ pressed }) => [styles.tile, { width }, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.photo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {src && !failed ? (
          <Image source={{ uri: src }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" onError={() => setFailed(true)} />
        ) : (
          <View style={styles.missing}>
            <Ionicons name="image-outline" size={22} color={colors.textMuted} />
            <Text style={styles.missingText}>{t('Image needed')}</Text>
          </View>
        )}
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  photo: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.surfaceAlt },
  missing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    margin: 6,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
  },
  missingText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    minHeight: 54,
    lineHeight: 19,
  },
});
