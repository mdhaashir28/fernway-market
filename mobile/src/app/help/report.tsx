// "Report a problem": choose a topic (and order), describe it, and the store replies in the app.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import type { OrderSummary, Paginated, SupportTopic } from '@/api/types';
import { RadioCard } from '@/components/RadioCard';
import { EmptyState } from '@/components/states';
import { Banner, Button, Chip, TextField } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useT } from '@/i18n';
import { useErrorText } from '@/i18n/errors';
import { SUPPORT_TOPICS } from '@/lib/support';
import { useApi } from '@/lib/useApi';
import { useFormat } from '@/lib/useFormat';
import { colors, font, spacing } from '@/theme';

export default function ReportProblemScreen() {
  const params = useLocalSearchParams<{ orderId?: string }>();
  const { user } = useAuth();
  const { t } = useT();
  const format = useFormat();
  const toast = useToast();
  const errorText = useErrorText();
  const [orderId, setOrderId] = useState<number | null>(params.orderId ? Number(params.orderId) : null);
  const [topic, setTopic] = useState<SupportTopic | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orders = useApi(() => api.get<Paginated<OrderSummary>>('/api/orders?pageSize=10').then((r) => r.items), [user?.id], {
    enabled: Boolean(user),
  });

  if (!user) {
    return (
      <EmptyState
        icon="chatbubble-ellipses-outline"
        title={t('Log in to report a problem')}
        action={<Button title={t('Log in')} onPress={() => router.replace('/login')} />}
      />
    );
  }

  async function send() {
    if (!topic) return setError(t('Choose what the problem is about'));
    if (message.trim().length < 5) return setError(t('Please describe the problem (at least 5 characters)'));
    setSending(true);
    setError(null);
    try {
      await api.post('/api/support', { orderId: orderId ?? undefined, topic, message: message.trim() });
      toast(t('Thank you. The store will reply in the app.'));
      router.back();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.sectionTitle}>{t('Which order?')}</Text>
          <View style={styles.chips}>
            <Chip label={t('Not about an order')} selected={orderId === null} onPress={() => setOrderId(null)} />
            {(orders.data ?? []).map((order) => (
              <Chip
                key={order.id}
                label={`${order.orderNumber} · ${format.date(order.createdAt)}`}
                selected={orderId === order.id}
                onPress={() => setOrderId(order.id)}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
          <Text style={styles.sectionTitle}>{t('What is the problem about?')}</Text>
          {SUPPORT_TOPICS.map((option) => (
            <RadioCard key={option.id} selected={topic === option.id} onPress={() => setTopic(option.id)} accessibilityLabel={t(option.label)}>
              <Text style={styles.optionText}>{t(option.label)}</Text>
            </RadioCard>
          ))}
        </View>

        <TextField
          label={t('Tell us what happened')}
          placeholder={t('e.g. The 1 kg sugar packet was torn')}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={1000}
          style={{ minHeight: 120, textAlignVertical: 'top' }}
        />

        {error && <Banner kind="error">{error}</Banner>}
        <Button title={t('Send to the store')} icon="send" loading={sending} onPress={send} />
        <Text style={styles.note}>{t('For anything urgent, please call the store.')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  sectionTitle: { fontSize: font.large, fontWeight: '800', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  optionText: { fontSize: font.body, fontWeight: '600', color: colors.text },
  note: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});
