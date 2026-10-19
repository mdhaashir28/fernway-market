// Shapes of the data the API sends back. See docs/API.md for examples.

export type OrderStatus = 'pending' | 'preparing' | 'ready_for_pickup' | 'out_for_delivery' | 'completed' | 'cancelled';
export type FulfillmentType = 'delivery' | 'pickup';
export type PaymentMethod = 'pay_on_fulfillment' | 'demo_card';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface User {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: 'customer' | 'staff';
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

export interface StoreInfo {
  name: string;
  address: string;
  /** The first phone number (see `phones` for all of them). */
  phone: string;
  phones: PhoneNumber[];
  currency: string;
  timezone: string;
  pickup: { openHour: number; closeHour: number; slotMinutes: number; leadTimeMinutes: number };
  deliveryZones: {
    name: string;
    postcodePrefixes: string[];
    feeCents: number;
    freeDeliveryThresholdCents: number | null;
    minOrderCents: number;
  }[];
  paymentMethods: { id: PaymentMethod; label: string; description: string; isDemo: boolean }[];
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  productCount: number;
}

export interface Product {
  id: number;
  name: string;
  brand: string | null;
  description: string;
  priceCents: number;
  unitLabel: string;
  imageUrl: string | null;
  icon: string | null;
  categoryId: number;
  categoryName: string;
  categoryIcon: string;
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

export interface Quote {
  items: {
    productId: number;
    name: string;
    unitLabel: string;
    unitPriceCents: number;
    quantity: number;
    lineTotalCents: number;
    availableQuantity: number;
    isAvailable: boolean;
  }[];
  subtotalCents: number;
  deliveryFeeCents: number;
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
  createdAt: string;
}

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
  totalCents: number;
  notes: string | null;
  cancelReason: string | null;
  cancelledBy: 'customer' | 'staff' | null;
  createdAt: string;
  items: {
    id: number;
    productId: number;
    productName: string;
    unitLabel: string;
    unitPriceCents: number;
    quantity: number;
    lineTotalCents: number;
    imageUrl: string | null;
    icon: string | null;
  }[];
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
  canCancel: boolean;
}
