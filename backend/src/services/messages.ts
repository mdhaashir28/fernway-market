// Customer-facing notification texts, in English and Tamil.
//
// In-app updates use inAppMessage(). WhatsApp uses pre-approved TEMPLATES: the
// template bodies below are exactly what you submit for approval in WhatsApp
// Manager (see docs/INTEGRATIONS.md). Only the {{1}}, {{2}} … values are sent
// with each message; the app renders the same body locally for previews.
// Tamil texts: please have a native speaker review them before going live.
import { config } from '../config.js';
import { formatMoney } from '../lib/money.js';

export type Lang = 'en' | 'ta';

export type NotificationEvent =
  | 'order_confirmed'
  | 'order_preparing'
  | 'order_ready_for_pickup'
  | 'order_out_for_delivery'
  | 'order_completed'
  | 'order_cancelled'
  | 'payment_failed'
  | 'refund_initiated'
  | 'refund_processed'
  | 'order_updated'
  | 'support_reply'
  | 'points_earned';

export interface MessageVars {
  name: string; // customer's first name
  orderNumber: string;
  storeName: string;
  total: string; // formatted money
  pickupTime: string;
  reason: string;
  amount: string; // formatted money
  details: string;
  reply: string;
  points: string;
  balance: string;
  refundNote: string;
}

type Texts = Record<Lang, { title: string; body: string }>;

const IN_APP: Record<NotificationEvent, Texts> = {
  order_confirmed: {
    en: { title: 'Order confirmed', body: "Your order {orderNumber} is confirmed. Total {total}. We'll let you know when we start preparing it." },
    ta: { title: 'ஆர்டர் உறுதிசெய்யப்பட்டது', body: 'உங்கள் ஆர்டர் {orderNumber} உறுதிசெய்யப்பட்டது. மொத்தம் {total}. தயாரிக்கத் தொடங்கியதும் உங்களுக்குத் தெரிவிப்போம்.' },
  },
  order_preparing: {
    en: { title: 'Preparing your order', body: "We're now picking and packing your order {orderNumber}." },
    ta: { title: 'உங்கள் ஆர்டர் தயாராகிறது', body: 'உங்கள் ஆர்டர் {orderNumber}-க்கான பொருட்களை இப்போது எடுத்து பேக் செய்கிறோம்.' },
  },
  order_ready_for_pickup: {
    en: { title: 'Ready for pickup', body: 'Your order {orderNumber} is ready. Collect it at {storeName}, {pickupTime}. Show your order number at the counter.' },
    ta: { title: 'பிக்கப்புக்குத் தயார்', body: 'உங்கள் ஆர்டர் {orderNumber} தயார். {storeName}-இல் {pickupTime} நேரத்தில் பெற்றுக்கொள்ளுங்கள். கவுண்டரில் ஆர்டர் எண்ணைக் காட்டுங்கள்.' },
  },
  order_out_for_delivery: {
    en: { title: 'Out for delivery', body: 'Your order {orderNumber} is on its way to you.' },
    ta: { title: 'டெலிவரிக்கு அனுப்பப்பட்டது', body: 'உங்கள் ஆர்டர் {orderNumber} உங்களிடம் வந்துகொண்டிருக்கிறது.' },
  },
  order_completed: {
    en: { title: 'Order completed', body: 'Your order {orderNumber} is complete. Thank you for shopping at {storeName}!' },
    ta: { title: 'ஆர்டர் நிறைவடைந்தது', body: 'உங்கள் ஆர்டர் {orderNumber} நிறைவடைந்தது. {storeName}-இல் வாங்கியதற்கு நன்றி!' },
  },
  order_cancelled: {
    en: { title: 'Order cancelled', body: 'Your order {orderNumber} was cancelled. Reason: {reason}.{refundNote}' },
    ta: { title: 'ஆர்டர் ரத்துசெய்யப்பட்டது', body: 'உங்கள் ஆர்டர் {orderNumber} ரத்துசெய்யப்பட்டது. காரணம்: {reason}.{refundNote}' },
  },
  payment_failed: {
    en: {
      title: 'Payment not completed',
      body: "We couldn't confirm the UPI payment for order {orderNumber}. You can try again, pay on delivery instead, or cancel the order.",
    },
    ta: {
      title: 'பணம் செலுத்துதல் முடியவில்லை',
      body: 'ஆர்டர் {orderNumber}-க்கான UPI பணம் செலுத்துதலை உறுதிசெய்ய முடியவில்லை. மீண்டும் முயலலாம், டெலிவரியின்போது பணம் செலுத்தலாம், அல்லது ஆர்டரை ரத்துசெய்யலாம்.',
    },
  },
  refund_initiated: {
    en: { title: 'Refund started', body: "We've started a refund of {amount} for order {orderNumber}. Banks usually take 2–7 working days." },
    ta: { title: 'பணம் திருப்பி அனுப்பப்படுகிறது', body: 'ஆர்டர் {orderNumber}-க்கு {amount} பணத்தைத் திருப்பி அனுப்பத் தொடங்கியுள்ளோம். வங்கிகள் பொதுவாக 2–7 வேலை நாட்கள் எடுத்துக்கொள்ளும்.' },
  },
  refund_processed: {
    en: { title: 'Refund processed', body: 'Your refund of {amount} for order {orderNumber} has been processed. It should reach your account within 2–7 working days.' },
    ta: { title: 'பணம் திருப்பி அனுப்பப்பட்டது', body: 'ஆர்டர் {orderNumber}-க்கான {amount} பணம் திருப்பி அனுப்பப்பட்டது. 2–7 வேலை நாட்களுக்குள் உங்கள் கணக்கில் வந்துசேரும்.' },
  },
  order_updated: {
    en: { title: 'Your order was updated', body: '{details} New total: {total}.' },
    ta: { title: 'உங்கள் ஆர்டர் மாற்றப்பட்டது', body: '{details} புதிய மொத்தம்: {total}.' },
  },
  support_reply: {
    en: { title: 'Reply from {storeName}', body: '{reply}' },
    ta: { title: '{storeName}-இலிருந்து பதில்', body: '{reply}' },
  },
  points_earned: {
    en: { title: 'You earned {points} points', body: 'Thanks for order {orderNumber}. Your points balance is {balance}.' },
    ta: { title: 'நீங்கள் {points} புள்ளிகள் பெற்றீர்கள்', body: 'ஆர்டர் {orderNumber}-க்கு நன்றி. உங்கள் புள்ளி இருப்பு {balance}.' },
  },
};

/** Small pieces used inside messages. */
export const PHRASES = {
  refundNote: {
    en: (amount: string) => ` Your refund of ${amount} has been started.`,
    ta: (amount: string) => ` உங்கள் ${amount} பணத்தைத் திருப்பி அனுப்பும் செயல்முறை தொடங்கப்பட்டது.`,
  },
  substituted: {
    en: (original: string, substitute: string) => `${original} was replaced with ${substitute}.`,
    ta: (original: string, substitute: string) => `${original}-க்குப் பதிலாக ${substitute} வழங்கப்பட்டது.`,
  },
  unavailable: {
    en: (original: string) => `${original} was not available and has been removed — you won't be charged for it.`,
    ta: (original: string) => `${original} கிடைக்கவில்லை, அதனால் நீக்கப்பட்டது — அதற்குக் கட்டணம் இல்லை.`,
  },
  paymentNotCompleted: {
    en: 'Payment was not completed in time',
    ta: 'குறிப்பிட்ட நேரத்தில் பணம் செலுத்தப்படவில்லை',
  },
} as const;

const fill = (text: string, vars: Partial<MessageVars>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key as keyof MessageVars] ?? ''));

export function inAppMessage(event: NotificationEvent, lang: Lang, vars: Partial<MessageVars>) {
  const texts = IN_APP[event][lang] ?? IN_APP[event].en;
  return { title: fill(texts.title, vars), body: fill(texts.body, vars) };
}

// ---------------------------------------------------------------------------
// WhatsApp templates (submit these in WhatsApp Manager → Message templates,
// category "Utility", one English and one Tamil version of each).
// ---------------------------------------------------------------------------
export interface WhatsAppTemplate {
  /** Template name in WhatsApp Manager (WHATSAPP_TEMPLATE_PREFIX is added in front). */
  name: string;
  body: Record<Lang, string>;
  /** The values for {{1}}, {{2}}, … in order. */
  params: (vars: Partial<MessageVars>) => string[];
  /** Example values (WhatsApp Manager asks for them when you submit a template). */
  example: string[];
}

export const WHATSAPP_TEMPLATES: Partial<Record<NotificationEvent, WhatsAppTemplate>> = {
  order_confirmed: {
    name: 'order_confirmed',
    body: {
      en: 'Hello {{1}}, your order {{2}} at {{3}} is confirmed. Total: {{4}}. We will message you when it is being prepared.',
      ta: 'வணக்கம் {{1}}, {{3}}-இல் உங்கள் ஆர்டர் {{2}} உறுதிசெய்யப்பட்டது. மொத்தம்: {{4}}. தயாரிக்கத் தொடங்கியதும் உங்களுக்குச் செய்தி அனுப்புவோம்.',
    },
    params: (v) => [v.name ?? '', v.orderNumber ?? '', v.storeName ?? '', v.total ?? ''],
    example: ['Priya', 'MS-00012', 'Meeranji Supermarket', '₹482'],
  },
  order_preparing: {
    name: 'order_preparing',
    body: {
      en: 'Hello {{1}}, {{3}} has started preparing your order {{2}}. We will let you know when it is ready.',
      ta: 'வணக்கம் {{1}}, {{3}} உங்கள் ஆர்டர் {{2}}-ஐத் தயாரிக்கத் தொடங்கியுள்ளது. தயாரானதும் தெரிவிப்போம்.',
    },
    params: (v) => [v.name ?? '', v.orderNumber ?? '', v.storeName ?? ''],
    example: ['Priya', 'MS-00012', 'Meeranji Supermarket'],
  },
  order_ready_for_pickup: {
    name: 'order_ready_for_pickup',
    body: {
      en: 'Hello {{1}}, your order {{2}} is ready for pickup at {{3}}. Collection time: {{4}}. Please show your order number at the counter.',
      ta: 'வணக்கம் {{1}}, உங்கள் ஆர்டர் {{2}} {{3}}-இல் பிக்கப்புக்குத் தயாராக உள்ளது. பெற்றுக்கொள்ளும் நேரம்: {{4}}. கவுண்டரில் உங்கள் ஆர்டர் எண்ணைக் காட்டவும்.',
    },
    params: (v) => [v.name ?? '', v.orderNumber ?? '', v.storeName ?? '', v.pickupTime ?? ''],
    example: ['Priya', 'MS-00012', 'Meeranji Supermarket', 'Tue 21 Oct, 10:00 – 11:00'],
  },
  order_out_for_delivery: {
    name: 'order_out_for_delivery',
    body: {
      en: 'Hello {{1}}, your order {{2}} from {{3}} is out for delivery and will reach you soon.',
      ta: 'வணக்கம் {{1}}, {{3}}-இலிருந்து உங்கள் ஆர்டர் {{2}} டெலிவரிக்கு அனுப்பப்பட்டது, விரைவில் உங்களை வந்தடையும்.',
    },
    params: (v) => [v.name ?? '', v.orderNumber ?? '', v.storeName ?? ''],
    example: ['Priya', 'MS-00012', 'Meeranji Supermarket'],
  },
  order_completed: {
    name: 'order_completed',
    body: {
      en: 'Hello {{1}}, your order {{2}} is complete. Thank you for shopping at {{3}}, we hope to see you again soon.',
      ta: 'வணக்கம் {{1}}, உங்கள் ஆர்டர் {{2}} நிறைவடைந்தது. {{3}}-இல் வாங்கியதற்கு நன்றி, மீண்டும் வருக.',
    },
    params: (v) => [v.name ?? '', v.orderNumber ?? '', v.storeName ?? ''],
    example: ['Priya', 'MS-00012', 'Meeranji Supermarket'],
  },
  order_cancelled: {
    name: 'order_cancelled',
    body: {
      en: 'Hello {{1}}, your order {{2}} at {{3}} has been cancelled. Reason: {{4}}. Any payment you made will be refunded to your original payment method.',
      ta: 'வணக்கம் {{1}}, {{3}}-இல் உங்கள் ஆர்டர் {{2}} ரத்துசெய்யப்பட்டது. காரணம்: {{4}}. நீங்கள் செலுத்திய பணம் ஏதேனும் இருந்தால், அது நீங்கள் செலுத்திய வழியிலேயே திருப்பி அனுப்பப்படும்.',
    },
    params: (v) => [v.name ?? '', v.orderNumber ?? '', v.storeName ?? '', v.reason ?? ''],
    example: ['Priya', 'MS-00012', 'Meeranji Supermarket', 'Item out of stock'],
  },
  refund_processed: {
    name: 'refund_processed',
    body: {
      en: 'Hello {{1}}, a refund of {{2}} for order {{3}} has been processed. It usually reaches your account within 2–7 working days.',
      ta: 'வணக்கம் {{1}}, ஆர்டர் {{3}}-க்கான {{2}} பணம் திருப்பி அனுப்பப்பட்டது. பொதுவாக 2–7 வேலை நாட்களுக்குள் உங்கள் கணக்கில் வந்துசேரும்.',
    },
    params: (v) => [v.name ?? '', v.amount ?? '', v.orderNumber ?? ''],
    example: ['Priya', '₹120', 'MS-00012'],
  },
};

export const templateName = (template: WhatsAppTemplate) => `${config.WHATSAPP_TEMPLATE_PREFIX}${template.name}`;
export const templateLanguage = (lang: Lang) => (lang === 'ta' ? config.WHATSAPP_TEMPLATE_LANG_TA : config.WHATSAPP_TEMPLATE_LANG_EN);

/** The message exactly as the customer would read it. */
export const renderTemplate = (body: string, params: string[]) => body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => params[Number(n) - 1] ?? '');

export const money = formatMoney;

/** "Tue 21 Oct, 10:00 – 11:00" in the store's time zone, in English or Tamil. */
export function formatSlotTime(startsAt: Date, endsAt: Date, lang: Lang): string {
  const locale = lang === 'ta' ? 'ta-IN' : 'en-IN';
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: config.STORE_TIMEZONE }).format(startsAt);
  const time = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: config.STORE_TIMEZONE });
  return `${day}, ${time.format(startsAt)} – ${time.format(endsAt)}`;
}
