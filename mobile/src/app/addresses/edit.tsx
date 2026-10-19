// Add or edit a delivery address, with a live "do we deliver here?" check.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ApiError, api } from '@/api/client';
import type { Address } from '@/api/types';
import { ErrorView, LoadingView } from '@/components/states';
import { Banner, Button, TextField } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { useToast } from '@/context/ToastContext';
import { goBack } from '@/lib/navigation';
import { useApi, useDebounced } from '@/lib/useApi';
import { colors, font, spacing } from '@/theme';

interface DeliveryCheck {
  available: boolean;
  message: string;
  feeCents?: number;
}

export default function AddressEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isNew = !id;
  const { user } = useAuth();
  const { money } = useStore();
  const toast = useToast();

  const existing = useApi(
    () => api.get<{ items: Address[] }>('/api/addresses').then((r) => r.items.find((a) => a.id === Number(id)) ?? null),
    [id],
    { enabled: !isNew },
  );

  const [form, setForm] = useState({
    label: 'Home',
    recipientName: user?.name ?? '',
    phone: user?.phone ?? '',
    line1: '',
    line2: '',
    city: '',
    postcode: '',
    instructions: '',
    isDefault: isNew,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [check, setCheck] = useState<DeliveryCheck | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const a = existing.data;
    if (a) {
      setForm({
        label: a.label,
        recipientName: a.recipientName,
        phone: a.phone,
        line1: a.line1,
        line2: a.line2 ?? '',
        city: a.city,
        postcode: a.postcode,
        instructions: a.instructions ?? '',
        isDefault: a.isDefault,
      });
    }
  }, [existing.data]);

  // Check the service area as the postcode is typed.
  const postcode = useDebounced(form.postcode.trim(), 500);
  useEffect(() => {
    if (postcode.length < 3) {
      setCheck(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    api
      .get<DeliveryCheck>(`/api/delivery/check?postcode=${encodeURIComponent(postcode)}`)
      .then((result) => !cancelled && setCheck(result))
      .catch(() => !cancelled && setCheck(null))
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [postcode]);

  const set = (key: keyof typeof form) => (value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  function validate() {
    const e: Record<string, string> = {};
    if (!form.recipientName.trim()) e.recipientName = 'Please enter the recipient name';
    if (form.phone.trim().length < 6) e.phone = 'Please enter a phone number';
    if (!form.line1.trim()) e.line1 = 'Please enter the street address';
    if (!form.city.trim()) e.city = 'Please enter the town or city';
    if (form.postcode.trim().length < 3) e.postcode = 'Please enter a valid PIN code';
    return e;
  }

  async function save() {
    const clientErrors = validate();
    setErrors(clientErrors);
    setFormError(null);
    if (Object.keys(clientErrors).length) return;
    setSaving(true);
    const body = {
      ...form,
      label: form.label.trim() || 'Home',
      line2: form.line2.trim() || null,
      instructions: form.instructions.trim() || null,
    };
    try {
      if (isNew) await api.post('/api/addresses', body);
      else await api.put(`/api/addresses/${id}`, body);
      toast(isNew ? 'Address saved' : 'Address updated');
      goBack();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
      else setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!isNew && existing.loading) return <LoadingView />;
  if (!isNew && existing.error) return <ErrorView error={existing.error} onRetry={existing.reload} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: isNew ? 'New address' : 'Edit address' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {formError && <Banner kind="error">{formError}</Banner>}
        <TextField label="Address name" value={form.label} onChangeText={set('label')} hint='e.g. "Home" or "Work"' maxLength={40} />
        <TextField label="Recipient name" value={form.recipientName} onChangeText={set('recipientName')} error={errors.recipientName} autoComplete="name" />
        <TextField label="Phone" value={form.phone} onChangeText={set('phone')} error={errors.phone} keyboardType="phone-pad" autoComplete="tel" />
        <TextField label="Street address" value={form.line1} onChangeText={set('line1')} error={errors.line1} autoComplete="street-address" />
        <TextField label="Flat, floor, building (optional)" value={form.line2} onChangeText={set('line2')} error={errors.line2} />
        <TextField label="Town / city" value={form.city} onChangeText={set('city')} error={errors.city} />
        <TextField
          label="PIN code"
          value={form.postcode}
          onChangeText={set('postcode')}
          error={errors.postcode}
          autoCapitalize="characters"
          autoComplete="postal-code"
          keyboardType="number-pad"
          hint="6-digit PIN, e.g. 635810"
          maxLength={12}
        />
        <View style={styles.checkBox}>
          {checking ? (
            <ActivityIndicator color={colors.primary} />
          ) : check ? (
            <Banner kind={check.available ? 'success' : 'warning'}>
              {check.available && check.feeCents != null ? `${check.message} Delivery fee ${money(check.feeCents)}.` : check.message}
            </Banner>
          ) : null}
        </View>
        <TextField
          label="Delivery instructions (optional)"
          value={form.instructions}
          onChangeText={set('instructions')}
          multiline
          maxLength={300}
          placeholder="e.g. Blue door, please ring the bell"
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Use as my default address</Text>
          <Switch
            value={form.isDefault}
            onValueChange={set('isDefault')}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
            thumbColor="#fff"
            accessibilityLabel="Use as my default address"
          />
        </View>
        <Button title={isNew ? 'Save address' : 'Save changes'} icon="checkmark" loading={saving} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  checkBox: { marginTop: -spacing.sm, marginBottom: spacing.lg },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl },
  switchLabel: { fontSize: font.body, fontWeight: '600', color: colors.text, flex: 1 },
});
