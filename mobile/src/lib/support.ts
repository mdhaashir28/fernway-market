import type { SupportTopic } from '@/api/types';

/** "Report a problem" topics (English keys — translate with t()). */
export const SUPPORT_TOPICS: { id: SupportTopic; label: string }[] = [
  { id: 'missing_item', label: 'An item is missing' },
  { id: 'damaged_item', label: 'An item is damaged or spoiled' },
  { id: 'wrong_item', label: 'I got the wrong item' },
  { id: 'late', label: 'My order is late' },
  { id: 'payment', label: 'A problem with payment' },
  { id: 'refund', label: 'A question about a refund' },
  { id: 'other', label: 'Something else' },
];

export const supportTopicLabel = (topic: SupportTopic) => SUPPORT_TOPICS.find((t) => t.id === topic)?.label ?? 'Something else';
