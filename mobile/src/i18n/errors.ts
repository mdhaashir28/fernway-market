// Error messages and checkout problems in the app's language.
// The API sends English; known problems are re-worded here (with product
// names, amounts, …), and other messages are translated when ta.ts has them.
import type { CheckoutIssue } from '@/api/types';
import { useT } from './index';

const CODE_MESSAGES: Record<string, string> = {
  NETWORK_ERROR: "We couldn't reach the store. Check your internet connection and try again.",
  TOO_MANY_ATTEMPTS: 'Too many attempts. Please wait a few minutes and try again.',
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  EMAIL_TAKEN: 'An account with this email already exists. Try logging in instead.',
  PAYMENT_START_FAILED: "We couldn't start the UPI payment just now. Please try again in a moment, or choose pay on delivery.",
  PAYMENT_EXPIRED: 'The time to pay for this order has run out. Please place the order again.',
  CANNOT_CANCEL: 'The store has already started preparing this order, so it can no longer be cancelled in the app. Please call the store.',
};

export function useErrorText() {
  const { t } = useT();
  return (err: unknown): string => {
    const e = err as { code?: string; message?: string } | undefined;
    if (e?.code && CODE_MESSAGES[e.code]) return t(CODE_MESSAGES[e.code]);
    return t(e?.message || 'Something went wrong. Please try again.');
  };
}

export interface IssueContext {
  productName: (productId?: number) => string;
  postcode?: string | null;
  minOrderText?: string;
}

export function useIssueText() {
  const { t } = useT();
  return (issue: CheckoutIssue, ctx: IssueContext): string => {
    const name = ctx.productName(issue.productId);
    switch (issue.code) {
      case 'OUT_OF_STOCK':
        return t('{name} is out of stock.', { name });
      case 'INSUFFICIENT_STOCK':
        return t('Only {count} × {name} left — please lower the quantity.', { count: issue.availableQuantity ?? 0, name });
      case 'PRODUCT_UNAVAILABLE':
        return t('{name} is no longer available.', { name });
      case 'OUTSIDE_SERVICE_AREA':
        return t("Sorry, we don't deliver to {postcode} yet. You can choose store pickup instead.", { postcode: ctx.postcode ?? '' });
      case 'BELOW_MINIMUM_ORDER':
        return t('Delivery to this area needs a minimum order of {amount}.', { amount: ctx.minOrderText ?? '' });
      case 'ADDRESS_REQUIRED':
        return t('Choose a delivery address');
      case 'ADDRESS_NOT_FOUND':
        return t('That saved address could not be found.');
      case 'PICKUP_SLOT_REQUIRED':
        return t('Choose a collection time');
      case 'PICKUP_SLOT_UNAVAILABLE':
        return t('That collection time is no longer available. Please choose another.');
      case 'SUBSTITUTE_UNAVAILABLE':
        return t('The replacement you chose for {name} is no longer available. Please choose another option.', { name });
      case 'UPI_MINIMUM':
        return t('UPI payments need a total of at least ₹1. Please choose pay on delivery.');
      default:
        return t(issue.message);
    }
  };
}
