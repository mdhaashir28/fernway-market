// Customer notifications: an in-app "Updates" list, plus WhatsApp messages
// through the official WhatsApp Business Platform (Cloud API).
//
//   WHATSAPP_MODE=demo       messages are recorded and previewed in the staff
//                            dashboard (Messages page) — nothing is sent. Default.
//   WHATSAPP_MODE=cloud_api  messages are sent with Meta's Cloud API using
//                            pre-approved templates (see docs/INTEGRATIONS.md).
//   WHATSAPP_MODE=off        no WhatsApp messages.
//
// Notifications are saved inside the same database transaction as the change
// that caused them (so a rolled-back change never notifies anyone). WhatsApp
// messages wait in an outbox and are sent by flushWhatsAppQueue() afterwards.
import crypto from 'node:crypto';
import { logError } from '../lib/logger.js';
import { config } from '../config.js';
import { pool, type Db } from '../db/pool.js';
import { orderNumber } from '../lib/order-number.js';
import {
  inAppMessage,
  renderTemplate,
  templateLanguage,
  templateName,
  WHATSAPP_TEMPLATES,
  type Lang,
  type MessageVars,
  type NotificationEvent,
} from './messages.js';

/** Indian mobile numbers in the international format WhatsApp uses (digits only), e.g. 919789562928. */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  const indian = digits.match(/^(?:91|0)?([6-9]\d{9})$/);
  if (indian) return `91${indian[1]}`;
  return digits.length >= 11 && digits.length <= 15 ? digits : null;
}

export interface NotifyOptions {
  userId: number;
  orderId?: number | null;
  event: NotificationEvent;
  /** Values for the message. Customer name, store name and order number are filled in automatically. */
  vars?: Partial<MessageVars> | ((lang: Lang) => Partial<MessageVars>);
}

/**
 * Saves an in-app notification and (when there is a WhatsApp template for the
 * event and the customer asked for WhatsApp updates on this order) queues or
 * records a WhatsApp message. Call inside the transaction that made the change.
 */
export async function notifyCustomer(db: Db, options: NotifyOptions): Promise<void> {
  const { rows } = await db.query<{ name: string; lang: Lang; phone: string | null; optIn: boolean; whatsappUpdates: boolean | null }>(
    `SELECT u.name, u.preferred_language AS lang, u.phone, u.whatsapp_opt_in AS "optIn",
            o.whatsapp_updates AS "whatsappUpdates"
     FROM users u LEFT JOIN orders o ON o.id = $2
     WHERE u.id = $1`,
    [options.userId, options.orderId ?? null],
  );
  const user = rows[0];
  if (!user) return;

  const lang: Lang = user.lang === 'ta' ? 'ta' : 'en';
  const extra = typeof options.vars === 'function' ? options.vars(lang) : (options.vars ?? {});
  const vars: Partial<MessageVars> = {
    name: user.name.split(/\s+/)[0],
    storeName: config.STORE_NAME,
    orderNumber: options.orderId ? orderNumber(options.orderId) : '',
    ...extra,
  };

  const message = inAppMessage(options.event, lang, vars);
  await db.query('INSERT INTO notifications (user_id, order_id, event, title, body) VALUES ($1, $2, $3, $4, $5)', [
    options.userId,
    options.orderId ?? null,
    options.event,
    message.title,
    message.body,
  ]);

  const template = WHATSAPP_TEMPLATES[options.event];
  if (!template || config.WHATSAPP_MODE === 'off') return;
  // Only for orders where the customer ticked "Send me updates on WhatsApp".
  if (!options.orderId || !user.whatsappUpdates) return;

  const params = template.params(vars);
  const to = toWhatsAppNumber(user.phone);
  let status: 'demo_recorded' | 'queued' | 'skipped';
  let skipReason: string | null = null;
  if (!user.optIn) {
    status = 'skipped';
    skipReason = 'Customer has not agreed to WhatsApp messages';
  } else if (!to) {
    status = 'skipped';
    skipReason = 'No valid mobile number on the customer account';
  } else {
    status = config.WHATSAPP_MODE === 'demo' ? 'demo_recorded' : 'queued';
  }

  await db.query(
    `INSERT INTO whatsapp_messages
       (user_id, order_id, event, to_phone, language, template_name, template_params, preview_text, mode, status, skip_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      options.userId,
      options.orderId,
      options.event,
      to,
      templateLanguage(lang),
      templateName(template),
      JSON.stringify(params),
      renderTemplate(template.body[lang], params),
      config.WHATSAPP_MODE === 'demo' ? 'demo' : 'cloud_api',
      status,
      skipReason,
    ],
  );
}

// ---------------------------------------------------------------------------
// Sending (Cloud API)
// ---------------------------------------------------------------------------
interface QueuedMessage {
  id: number;
  toPhone: string;
  language: string;
  templateName: string;
  templateParams: string[];
  attempts: number;
}

const MAX_ATTEMPTS = 3;

/** Sends one template message with the Cloud API. Returns the WhatsApp message id. */
async function sendTemplate(message: QueuedMessage): Promise<string> {
  const url = `https://graph.facebook.com/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: message.toPhone,
      type: 'template',
      template: {
        name: message.templateName,
        language: { code: message.language },
        components: [{ type: 'body', parameters: message.templateParams.map((text) => ({ type: 'text', text })) }],
      },
    }),
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
  if (!res.ok || !data.messages?.[0]?.id) {
    throw new Error(data.error?.message ? `${data.error.message} (code ${data.error.code ?? res.status})` : `HTTP ${res.status}`);
  }
  return data.messages[0].id;
}

/**
 * Sends queued WhatsApp messages (Cloud API mode). Safe to call often and from
 * several places at once: each message is claimed before it is sent, and
 * failed messages are retried up to 3 times.
 */
export async function flushWhatsAppQueue(db: Db = pool, limit = 20): Promise<number> {
  if (config.WHATSAPP_MODE !== 'cloud_api') return 0;
  const { rows } = await db.query<QueuedMessage>(
    `UPDATE whatsapp_messages SET attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM whatsapp_messages
       WHERE status = 'queued' AND attempts < $1 AND (attempts = 0 OR updated_at < now() - interval '1 minute')
       ORDER BY id LIMIT $2
       FOR UPDATE SKIP LOCKED)
     RETURNING id, to_phone AS "toPhone", language, template_name AS "templateName",
               template_params AS "templateParams", attempts`,
    [MAX_ATTEMPTS, limit],
  );
  let sent = 0;
  for (const message of rows) {
    try {
      const providerId = await sendTemplate(message);
      await db.query(`UPDATE whatsapp_messages SET status = 'sent', provider_message_id = $2, error = NULL WHERE id = $1`, [message.id, providerId]);
      sent++;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await db.query(`UPDATE whatsapp_messages SET status = CASE WHEN $3 THEN 'failed' ELSE 'queued' END, error = $2 WHERE id = $1`, [
        message.id,
        error.slice(0, 500),
        message.attempts >= MAX_ATTEMPTS,
      ]);
    }
  }
  return sent;
}

/** Sends the outbox in the background without making the caller wait or fail. */
export function flushWhatsAppQueueSoon(): void {
  if (config.WHATSAPP_MODE !== 'cloud_api') return;
  flushWhatsAppQueue().catch((err) => logError('Sending WhatsApp messages', err));
}

// ---------------------------------------------------------------------------
// Webhook (delivery receipts from Meta)
// ---------------------------------------------------------------------------
/** Checks the X-Hub-Signature-256 header (HMAC-SHA256 of the raw body with the App Secret). */
export function verifyWhatsAppSignature(rawBody: Buffer, header: string | undefined): boolean {
  if (!config.WHATSAPP_APP_SECRET || !header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', config.WHATSAPP_APP_SECRET).update(rawBody).digest('hex');
  const given = header.slice('sha256='.length);
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

interface StatusUpdate {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  errors?: { title?: string; message?: string; code?: number }[];
}

const STATUS_RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3 };

/** Applies delivery receipts. Statuses only move forward (a late "delivered" never overwrites "read"). */
export async function applyWhatsAppStatuses(payload: unknown): Promise<number> {
  const entries = (payload as { entry?: { changes?: { value?: { statuses?: StatusUpdate[] } }[] }[] })?.entry ?? [];
  let updated = 0;
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (status.status === 'failed') {
          const error = status.errors?.map((e) => `${e.title ?? e.message ?? 'Error'} (code ${e.code ?? '?'})`).join('; ') ?? 'Failed';
          const { rowCount } = await pool.query(`UPDATE whatsapp_messages SET status = 'failed', error = $2 WHERE provider_message_id = $1`, [status.id, error]);
          updated += rowCount ?? 0;
        } else if (STATUS_RANK[status.status] !== undefined) {
          const { rowCount } = await pool.query(
            `UPDATE whatsapp_messages SET status = $2
             WHERE provider_message_id = $1
               AND (CASE status WHEN 'queued' THEN 0 WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 ELSE 9 END) < $3`,
            [status.id, status.status, STATUS_RANK[status.status]],
          );
          updated += rowCount ?? 0;
        }
      }
    }
  }
  return updated;
}
