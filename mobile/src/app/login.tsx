import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextInput } from 'react-native';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Banner, Button, TextField } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useT } from '@/i18n';
import { useErrorText } from '@/i18n/errors';
import { goBack } from '@/lib/navigation';
import { colors, font, spacing } from '@/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const toast = useToast();
  const { t } = useT();
  const errorText = useErrorText();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    if (!email.trim() || !password) {
      setError(t('Please enter your email and password.'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      toast(t('Welcome back!'));
      goBack();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.languageRow}>
          <LanguageToggle compact />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {t('Welcome back')}
        </Text>
        <Text style={styles.subtitle}>{t('Log in to check out and track your orders.')}</Text>
        {error && <Banner kind="error">{error}</Banner>}
        <TextField
          label={t('Email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          label={t('Password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Button title={t('Log in')} onPress={submit} loading={submitting} />
        <Pressable onPress={() => router.replace('/signup')} accessibilityRole="link" style={styles.switch}>
          <Text style={styles.switchText}>
            {t('New here?')} <Text style={styles.switchLink}>{t('Create an account')}</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.sm, maxWidth: 480, width: '100%', alignSelf: 'center' },
  languageRow: { alignItems: 'flex-end' },
  title: { fontSize: font.hero, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: font.body, color: colors.textMuted, marginBottom: spacing.md },
  switch: { alignSelf: 'center', padding: spacing.md, marginTop: spacing.sm, minHeight: 44 },
  switchText: { fontSize: font.body, color: colors.textMuted },
  switchLink: { color: colors.primary, fontWeight: '700' },
});
