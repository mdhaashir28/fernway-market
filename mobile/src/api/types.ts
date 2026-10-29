// Shapes of the data the API sends back. See docs/API.md for examples.

export type OrderStatus =
  | 'awaiting_payment'
  | 'confirmed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled';
export type FulfillmentType = 'delivery' | 'pickup';
/** `demo_card` only appears on orders placed with an older demo version of the app. */
export type PaymentMethod = 'pay_on_fulfillment' | 'upi' | 'demo_card';
export type PaymentStatus = 'unpaid' | 'pending' | 'failed' | 'paid' | 'refund_pending' | 'partially_refunded' | 'refunded';
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';
export type SubstitutionPreference = 'none' | 'similar' | 'specific';

export interface User {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: 'customer' | 'staff' | 'manager';
  preferredLanguage: 'en' | 'ta';
  whatsappOptIn: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PhoneNumber {
  /** e.g. "+91 97895 62928" */
  display: string;
  /** e.g. "+919789562928", for tel: links */
  tel: string;
}

export interface OpeningHours {
  weekday: number; // 0 = Sunday
  opensAt: string; // "09:00"
  closesAt: string;
  isClosed: boolean;
}

export interface StoreInfo {
  name: string;
  address: string;
  /** The first phone number (see `phones` for all of them). */
  phone: string;
  phones: PhoneNumber[];
  whatsappChatUrl: string | null;
  currency: string;
  timezone: string;
  openingHours: OpeningHours[];
  closures: { date: string; reason: string }[];
  pickup: { openHour: number; closeHour: number; slotMinutes: number; leadTimeMinutes: number; daysAhead: number };
  deliveryZones: {
    name: string;
    postcodePrefixes: string[];
    feeCents: number;
    freeDeliveryThresholdCents: number | null;
    minOrderCents: number;
  }[];
  paymentMethods: { id: PaymentMethod; label: string; description: string; isDemo: boolean }[];
  paymentTimeoutMinutes: number;
  /** demo = practice page · test = Razorpay test mode (no real money) · live = real money. */
  paymentsMode: PaymentsMode;
  substitutionsEnabled: boolean;
  whatsappUpdatesAvailable: boolean;
  whatsappIsDemo: boolean;
  loyalty: { enabled: false } | { enabled: true; pointsPer100: number; pointValueCents: number; minRedeemPoints: number; maxRedeemPercent: number };
  promotionsEnabled: boolean;
}

export type PaymentsMode = 'demo' | 'test' | 'live';

/** Where a catalogue photo comes from (shown with the photo). */
export interface ImageCredit {
  kind: 'licensed' | 'store';
  author: string | null;
  licence: string | null;
  licenceUrl: string | null;
  sourceUrl: string | null;
  note: string | null;
}

export interface Category {
  id: number;
  name: string;
  nameTa: string | null;
  slug: string;
  description: string;
  imageUrl: string | null;
  imageCredit: ImageCredit | null;
  productCount: number;
}

export interface Product {
  id: number;
  name: string;
  nameTa: string | null;
  brand: string | null;
  description: string;
  priceCents: number;
  unitLabel: string;
  imageUrl: string | null;
  imageCredit: ImageCredit | null;
  categoryId: number;
  categoryName: string;
  categoryNameTa: string | null;
  availableQuantity: number;
  stockStatus: StockStatus;
}

export interface Address {
  id: number;
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  instructions: string | null;
  isDefault: boolean;
  deliveryAvailable: boolean;
  deliveryZone: {
    id: number;
    name: string;
    feeCents: number;
    freeDeliveryThresholdCents: number | null;
    minOrderCents: number;
  } | null;
}

export interface PickupSlot {
  id: number;
  startsAt: string;
  endsAt: string;
  capacity: number;
  bookedCount: number;
  remaining: number;
  isAvailable: boolean;
}

export interface CheckoutIssue {
  code: string;
  message: string;
  productId?: number;
  availableQuantity?: number;
}

export interface AppliedPromotion {
  promotionId: number;
  name: string;
  nameTa: string | null;
  timesApplied: number;
  discountCents: number;
}

export interface Quote {
  items: {
    productId: number;
    name: string;
    nameTa: string | null;
    unitLabel: string;
    unitPriceCents: number;
    quantity: number;
    lineTotalCents: number;
    availableQuantity: number;
    isAvailable: boolean;
  }[];
  subtotalCents: number;
  discountCents: number;
  promotions: AppliedPromotion[];
  deliveryFeeCents: number;
  loyalty: { enabled: boolean; balance: number; pointsAvailable: number; pointsUsed: number; discountCents: number };
  totalCents: number;
  fulfillment:
    | { type: 'pickup'; slot: { id: number; startsAt: string; endsAt: string; remaining: number } | null }
    | {
        type: 'delivery';
        postcode: string | null;
        zone: { id: number; name: string; feeCents: number; freeDeliveryThresholdCents: number | null; minOrderCents: number } | null;
        amountToFreeDeliveryCents: number | null;
      };
  issues: CheckoutIssue[];
  canPlaceOrder: boolean;
}

export interface OrderSummary {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  fulfillmentType: FulfillmentType;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  totalCents: number;
  itemCount: number;
  itemPreview: string | null;
  deliveryPostcode: string | null;
  pickupStartsAt: string | null;
  pickupEndsAt: string | null;
  paymentDueBy: string | null;
  createdAt: string;
}

export interface OrderItem {
  id: number;
  productId: number;
  productName: string;
  productNameTa: string | null;
  unitLabel: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  chargedCents: number;
  imageUrl: string | null;
  substitutionPreference: SubstitutionPreference;
  preferredSubstituteId: number | null;
  preferredSubstituteName: string | null;
  preferredSubstituteNameTa: string | null;
  fulfilmentStatus: 'ordered' | 'substituted' | 'unavailable';
  substituteProductId: number | null;
  substituteName: string | null;
  substituteNameTa: string | null;
  substituteUnitLabel: string | null;
  substituteUnitPriceCents: number | null;
  substituteQuantity: number | null;
  substituteImageUrl: string | null;
}

export interface SupportRequest {
  id: number;
  orderId: number | null;
  topic: SupportTopic;
  message: string;
  status: 'open' | 'resolved';
  staffReply: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export type SupportTopic = 'missing_item' | 'damaged_item' | 'wrong_item' | 'late' | 'payment' | 'refund' | 'other';

export interface Order {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  fulfillmentType: FulfillmentType;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  loyaltyDiscountCents: number;
  loyaltyPointsRedeemed: number;
  loyaltyPointsEarned: number;
  totalCents: number;
  paidCents: number;
  refundedCents: number;
  promotions: { name: string; timesApplied: number; discountCents: number }[];
  notes: string | null;
  cancelReason: string | null;
  cancelledBy: 'customer' | 'staff' | 'manager' | null;
  whatsappUpdates: boolean;
  createdAt: string;
  items: OrderItem[];
  delivery: {
    zoneName: string;
    recipientName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    postcode: string;
    instructions: string | null;
  } | null;
  pickup: { slotId: number; startsAt: string; endsAt: string } | null;
  history: { status: OrderStatus; note: string | null; createdAt: string }[];
  events: { id: number; type: string; message: string; createdAt: string }[];
  payment: {
    /** No real money moves (demo page or Razorpay test mode). */
    isDemo: boolean;
    mode: PaymentsMode;
    dueBy: string | null;
    paidAt: string | null;
    latestAttempt: { status: 'created' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired'; failureReason: string | null; createdAt: string } | null;
  };
  refunds: { id: number; amountCents: number; status: 'pending' | 'processed' | 'failed'; reason: string; createdAt: string; processedAt: string | null }[];
  supportRequests: SupportRequest[];
  canPay: boolean;
  canSwitchToPayOnDelivery: boolean;
  canCancel: boolean;
}

export interface PaymentStart {
  paymentId: number;
  checkoutUrl: string;
}

export interface AppNotification {
  id: number;
  orderId: number | null;
  event: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface ShoppingListSummary {
  id: number;
  name: string;
  itemCount: number;
  updatedAt: string;
}

export interface ShoppingList {
  id: number;
  name: string;
  items: { quantity: number; product: Product; available: boolean }[];
}

export interface Promotion {
  id: number;
  name: string;
  nameTa: string | null;
  description: string;
  discountCents: number;
  items: { productId: number; quantity: number; name: string; nameTa: string | null; unitLabel: string; priceCents: number; imageUrl: string | null; isAvailable: boolean }[];
}

export interface LoyaltyInfo {
  enabled: boolean;
  balance: number;
  pointsPer100: number;
  pointValueCents: number;
  minRedeemPoints: number;
  maxRedeemPercent: number;
  history: { points: number; reason: string; orderId: number | null; createdAt: string }[];
}
