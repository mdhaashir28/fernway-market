import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { ApiError } from '@/api/client';
import { Banner, Button, TextField } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { goBack } from '@/lib/navigation';
import { colors, font, spacing } from '@/theme';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignupScreen() {
  const { signup } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Please enter your name';
    if (!EMAIL_PATTERN.test(email.trim())) e.email = 'Please enter a valid email address';
    if (password.length < 8) e.password = 'Password must be at least 8 characters';
    return e;
  }

  async function submit() {
    const clientErrors = validate();
    setErrors(clientErrors);
    setFormError(null);
    if (Object.keys(clientErrors).length) return;
    setSubmitting(true);
    try {
      await signup({ name: name.trim(), email: email.trim(), password, phone: phone.trim() || undefined });
      toast('Account created — welcome!');
      goBack();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header">
          Create your account
        </Text>
        <Text style={styles.subtitle}>It takes less than a minute.</Text>
        {formError && <Banner kind="error">{formError}</Banner>}
        <TextField label="Full name" value={name} onChangeText={setName} error={errors.name} autoComplete="name" textContentType="name" />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <TextField
          label="Phone (optional)"
          value={phone}
          onChangeText={setPhone}
          error={errors.phone}
          keyboardType="phone-pad"
          autoComplete="tel"
          hint="So the store can contact you about your order"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          hint="At least 8 characters"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Button title="Create account" onPress={submit} loading={submitting} />
        <Pressable onPress={() => router.replace('/login')} accessibilityRole="link" style={styles.switch}>
          <Text style={styles.switchText}>
            Already have an account? <Text style={styles.switchLink}>Log in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.sm, maxWidth: 480, width: '100%', alignSelf: 'center' },
  title: { fontSize: font.hero, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: font.body, color: colors.textMuted, marginBottom: spacing.md },
  switch: { alignSelf: 'center', padding: spacing.md, marginTop: spacing.sm },
  switchText: { fontSize: font.body, color: colors.textMuted },
  switchLink: { color: colors.primary, fontWeight: '700' },
});
