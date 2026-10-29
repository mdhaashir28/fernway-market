// Help & support: contact the store, common questions, and problems you've reported.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '@/api/client';
import type { SupportRequest } from '@/api/types';
import { StoreContact } from '@/components/StoreContact';
import { Badge, Button, Card } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/context/StoreContext';
import { useT } from '@/i18n';
import { todaysHours } from '@/lib/hours';
import { supportTopicLabel } from '@/lib/support';
import { useApi } from '@/lib/useApi';
import { useFormat } from '@/lib/useFormat';
import { colors, font, radius, spacing } from '@/theme';

/** Common questions (English keys — translated with t()). {minutes} is the time allowed to pay by UPI. */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I track my order?',
    a: 'Open Orders to see each step: Order confirmed, Preparing, Ready for pickup or Out for delivery, and Completed. We also show every change under Updates, and on WhatsApp if you turned that on.',
  },
  {
    q: 'How does UPI payment work?',
    a: 'After you place the order, a secure Razorpay page opens where you pay with any UPI app. We never ask for or see your UPI PIN. You have {minutes} minutes to pay; after that the order is cancelled and the items go back on the shelf.',
  },
  {
    q: 'My payment is pending or failed. What now?',
    a: 'Open the order and tap "Check payment status". If money left your account but the payment failed, it is refunded automatically. Please don\'t pay twice — if you do, the extra payment is refunded too.',
  },
  {
    q: 'Can I cancel my order?',
    a: 'Yes, in the app, until the store starts preparing it. After that, please call the store. If you already paid by UPI, the money is refunded automatically.',
  },
  {
    q: 'When will I get my refund?',
    a: 'We start refunds straight away. Banks usually take 2–7 working days to show the money in your account. You can see the refund status on the order.',
  },
  {
    q: 'What if a product is out of stock?',
    a: 'In your cart you choose for each item: don\'t replace it, replace it with a similar item, or replace it with a product you pick. You never pay more than for the item you ordered, and you\'re not charged for items we couldn\'t supply.',
  },
  {
    q: 'Where do you deliver?',
    a: 'Check the delivery areas under Account. If your address is outside them, you can choose free store pickup.',
  },
];

export default function HelpScreen() {
  const { user } = useAuth();
  const { store } = useStore();
  const { t } = useT();
  const format = useFormat();
  const [open, setOpen] = useState<number | null>(null);
  const requests = useApi(() => api.get<{ items: SupportRequest[] }>('/api/support').then((r) => r.items), [user?.id], {
    enabled: Boolean(user),
    refetchOnFocus: true,
  });
  const today = store ? todaysHours(store) : null;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {store && (
        <Card style={{ gap: spacing.md }}>
          <Text style={styles.sectionTitle}>{t('Talk to us')}</Text>
          {today && (
            <View style={styles.hoursRow}>
              <Ionicons name={today.open ? 'time-outline' : 'moon-outline'} size={18} color={today.open ? colors.primaryDark : colors.textMuted} />
              <Text style={styles.muted}>{today.open ? t('Open today {hours}', { hours: today.text }) : t('Closed today')}</Text>
            </View>
          )}
          <StoreContact store={store} showAddress={false} showWhatsApp />
          <Text style={styles.muted}>
            {t('WhatsApp chat opens your own WhatsApp app with our number. Please mention your order number.')}
          </Text>
        </Card>
      )}

      <Card style={{ gap: spacing.md }}>
        <Text style={styles.sectionTitle}>{t('Something wrong with an order?')}</Text>
        <Text style={styles.body}>{t('Missing, damaged or wrong items, late orders, payments or refunds — tell us and the store will reply here.')}</Text>
        <Button
          title={t('Report a problem')}
          icon="chatbubble-ellipses-outline"
          onPress={() => (user ? router.push('/help/report') : router.push('/login'))}
        />
      </Card>

      {user && (requests.data?.length ?? 0) > 0 && (
        <View style={{ gap: spacing.sm }}>
          <Text style={styles.sectionTitle}>{t('Your requests')}</Text>
          {requests.data!.map((request) => (
            <Card key={request.id} style={{ gap: 6 }}>
              <View style={styles.requestHeader}>
                <Text style={[styles.bodyStrong, { flex: 1 }]}>{t(supportTopicLabel(request.topic))}</Text>
                <Badge
                  label={request.status === 'resolved' ? t('Answered') : t('Waiting for the store')}
                  background={request.status === 'resolved' ? colors.primarySoft : colors.accentSoft}
                  color={request.status === 'resolved' ? colors.primaryDark : colors.accentText}
                  icon={request.status === 'resolved' ? 'checkmark-circle' : 'time-outline'}
                />
              </View>
              <Text style={styles.muted}>{format.dateTime(request.createdAt)}</Text>
              <Text style={styles.body}>{request.message}</Text>
              {request.staffReply && (
                <View style={styles.reply}>
                  <Text style={styles.replyLabel}>{t('Reply from the store')}</Text>
                  <Text style={styles.body}>{request.staffReply}</Text>
                </View>
              )}
              {request.orderId && (
                <Pressable onPress={() => router.push(`/order/${request.orderId}`)} accessibilityRole="link" style={styles.link}>
                  <Text style={styles.linkText}>{t('View order')}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </Pressable>
              )}
            </Card>
          ))}
        </View>
      )}

      <View style={{ gap: spacing.sm }}>
        <Text style={styles.sectionTitle}>{t('Common questions')}</Text>
        <View style={styles.faq}>
          {FAQ.map((item, index) => {
            const expanded = open === index;
            return (
              <View key={item.q} style={[styles.faqItem, index === FAQ.length - 1 && { borderBottomWidth: 0 }]}>
                <Pressable
                  onPress={() => setOpen(expanded ? null : index)}
                  accessibilityRole="button"
                  aria-expanded={expanded}
                  style={styles.faqQuestion}
                >
                  <Text style={styles.faqQuestionText}>{t(item.q)}</Text>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
                </Pressable>
                {expanded && <Text style={styles.faqAnswer}>{t(item.a, { minutes: store?.paymentTimeoutMinutes ?? 15 })}</Text>}
              </View>
            );
          })}
        </View>
      </View>

      <Pressable onPress={() => router.push('/credits')} accessibilityRole="link" style={styles.link}>
        <Ionicons name="camera-outline" size={18} color={colors.primary} />
        <Text style={styles.linkText}>{t('Photo credits')}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  sectionTitle: { fontSize: font.large, fontWeight: '800', color: colors.text },
  body: { fontSize: font.body, color: colors.text, lineHeight: 22 },
  bodyStrong: { fontSize: font.body, color: colors.text, fontWeight: '700' },
  muted: { fontSize: 14, color: colors.textMuted, lineHeight: 20, flexShrink: 1 },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  requestHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  reply: { backgroundColor: colors.primaryTint, borderRadius: radius.sm, padding: spacing.sm, gap: 2, borderLeftWidth: 3, borderLeftColor: colors.primary },
  replyLabel: { fontSize: 13, fontWeight: '800', color: colors.primaryDark },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  linkText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  faq: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  faqItem: { borderBottomWidth: 1, borderBottomColor: colors.border },
  faqQuestion: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  faqQuestionText: { flex: 1, fontSize: font.body, fontWeight: '700', color: colors.text },
  faqAnswer: { fontSize: 15, color: colors.text, lineHeight: 22, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
});
