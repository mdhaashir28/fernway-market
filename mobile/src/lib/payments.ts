// Opens the store's secure payment page (UPI via the payment gateway).
// The app never sees or stores UPI PINs or bank details — the customer pays on
// the gateway's page, and the server checks the result with the gateway before
// the order is marked as paid.
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

export type PaymentOutcome = 'paid' | 'pending' | 'failed' | 'cancelled' | 'closed';

const OUTCOMES = ['paid', 'pending', 'failed', 'cancelled'] as const;

/** Reads the "?payment=…" result the payment page adds when it sends the customer back. */
export function parseOutcome(value: unknown): PaymentOutcome | null {
  return OUTCOMES.find((o) => o === value) ?? null;
}

/**
 * Where the payment page sends the customer back to: this order's screen.
 * Pass "__ORDER_ID__" while placing an order — the server fills in the id.
 */
export function paymentReturnUrl(orderId: number | '__ORDER_ID__'): string {
  return Linking.createURL(`/order/${orderId}`);
}

type Listener = (orderId: number, outcome: PaymentOutcome) => void;
const listeners = new Set<Listener>();

/** Order screens listen here to refresh when the customer comes back from paying. */
export function onPaymentReturn(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Opens the payment page. On a phone it opens in a secure browser tab and
 * resolves when the customer comes back. On the web the whole page moves to
 * the payment page (which comes back to the order screen), so it never resolves.
 */
export async function openPaymentPage(orderId: number, checkoutUrl: string): Promise<PaymentOutcome> {
  if (Platform.OS === 'web') {
    window.location.assign(checkoutUrl);
    return new Promise(() => {});
  }
  const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, paymentReturnUrl(orderId));
  const outcome = result.type === 'success' ? (parseOutcome(Linking.parse(result.url).queryParams?.payment) ?? 'closed') : 'closed';
  listeners.forEach((listener) => listener(orderId, outcome));
  return outcome;
}
