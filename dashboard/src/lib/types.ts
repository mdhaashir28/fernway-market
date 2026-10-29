// Shapes of the data the API sends back. See docs/API.md for full examples.

export type Role = 'customer' | 'staff' | 'manager'
export type OrderStatus =
  | 'awaiting_payment'
  | 'confirmed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled'
export type FulfillmentType = 'delivery' | 'pickup'
/** `demo_card` only appears on orders placed with an older demo version of the app. */
export type PaymentMethod = 'pay_on_fulfillment' | 'upi' | 'demo_card'
export type PaymentStatus = 'unpaid' | 'pending' | 'failed' | 'paid' | 'refund_pending' | 'partially_refunded' | 'refunded'
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock'
export type SubstitutionPreference = 'none' | 'similar' | 'specific'

export interface User {
  id: number
  email: string
  name: string
  phone: string | null
  role: Role
}

export type PaymentsMode = 'demo' | 'test' | 'live'

/** Where a catalogue photo comes from. */
export interface ImageCredit {
  kind: 'licensed' | 'store'
  author: string | null
  licence: string | null
  licenceUrl: string | null
  sourceUrl: string | null
  note: string | null
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface PhoneNumber {
  /** e.g. "+91 97895 62928" */
  display: string
  /** e.g. "+919789562928", for tel: links */
  tel: string
}

export interface StoreInfo {
  name: string
  address: string
  /** The first phone number (see `phones` for all of them). */
  phone: string
  phones: PhoneNumber[]
  currency: string
  timezone: string
}

export interface Summary {
  orders: {
    awaitingPayment: number
    confirmed: number
    preparing: number
    readyForPickup: number
    outForDelivery: number
    ordersToday: number
    salesTodayCents: number
  }
  stock: { lowStock: number; outOfStock: number; missingPhoto: number }
  attention: { openSupportRequests: number; failedRefunds: number; failedWhatsApp: number }
  /** demo = practice page · test = Razorpay test keys (no real money) · live = real money */
  paymentsMode: PaymentsMode
  whatsappMode: 'off' | 'demo' | 'cloud_api'
}

export interface OrderSummary {
  id: number
  orderNumber: string
  status: OrderStatus
  statusLabel: string
  fulfillmentType: FulfillmentType
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  totalCents: number
  itemCount: number
  itemPreview: string | null
  deliveryPostcode: string | null
  pickupStartsAt: string | null
  pickupEndsAt: string | null
  paymentDueBy: string | null
  createdAt: string
  customer?: { id: number; name: string; email: string }
}

export interface OrderItem {
  id: number
  productId: number
  productName: string
  productNameTa: string | null
  unitLabel: string
  unitPriceCents: number
  quantity: number
  lineTotalCents: number
  chargedCents: number
  imageUrl: string | null
  substitutionPreference: SubstitutionPreference
  preferredSubstituteId: number | null
  preferredSubstituteName: string | null
  fulfilmentStatus: 'ordered' | 'substituted' | 'unavailable'
  substituteProductId: number | null
  substituteName: string | null
  substituteUnitLabel: string | null
  substituteUnitPriceCents: number | null
  substituteQuantity: number | null
  substituteImageUrl: string | null
}

export interface PaymentAttempt {
  id: number
  provider: 'demo' | 'razorpay'
  /** Razorpay with test keys: no real money moved. */
  testMode: boolean
  status: 'created' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired'
  amountCents: number
  failureReason: string | null
  providerPaymentId: string | null
  createdAt: string
  paidAt: string | null
}

export interface Refund {
  id: number
  amountCents: number
  status: 'pending' | 'processed' | 'failed'
  reason: string
  failureReason?: string | null
  createdAt: string
  processedAt: string | null
}

export interface OrderEvent {
  id: number
  type: string
  message: string
  actorRole: 'customer' | 'staff' | 'manager' | 'system' | 'gateway' | null
  actorName: string | null
  createdAt: string
}

export interface OrderSupportRequest {
  id: number
  topic: SupportTopic
  message: string
  status: 'open' | 'resolved'
  staffReply: string | null
  createdAt: string
  resolvedAt: string | null
}

export interface OrderDetail {
  id: number
  orderNumber: string
  status: OrderStatus
  statusLabel: string
  fulfillmentType: FulfillmentType
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  subtotalCents: number
  deliveryFeeCents: number
  discountCents: number
  loyaltyDiscountCents: number
  loyaltyPointsRedeemed: number
  loyaltyPointsEarned: number
  totalCents: number
  paidCents: number
  refundedCents: number
  promotions: { name: string; timesApplied: number; discountCents: number }[]
  notes: string | null
  cancelReason: string | null
  cancelledBy: Role | null
  whatsappUpdates: boolean
  createdAt: string
  updatedAt: string
  items: OrderItem[]
  delivery: {
    zoneName: string
    recipientName: string
    phone: string
    line1: string
    line2: string | null
    city: string
    postcode: string
    instructions: string | null
  } | null
  pickup: { slotId: number; startsAt: string; endsAt: string } | null
  history: { status: OrderStatus; note: string | null; createdAt: string; changedByRole: Role | null }[]
  events: OrderEvent[]
  payment: {
    /** No real money moves (demo page or Razorpay test mode). */
    isDemo: boolean
    mode: PaymentsMode
    dueBy: string | null
    paidAt: string | null
    latestAttempt: { status: PaymentAttempt['status']; failureReason: string | null; createdAt: string } | null
    attempts?: PaymentAttempt[]
  }
  refunds: Refund[]
  supportRequests: OrderSupportRequest[]
  customer?: { id: number; name: string; email: string; phone: string | null }
  allowedNextStatuses?: OrderStatus[]
  canCancel: boolean
  canResolveItems: boolean
  cancelNeedsManager: boolean
}

export interface StaffProduct {
  id: number
  sku: string | null
  name: string
  nameTa: string | null
  brand: string | null
  description: string
  priceCents: number
  unitLabel: string
  imageUrl: string | null
  /** What staff typed about where an uploaded photo came from. */
  imageSource: string | null
  imageCredit: ImageCredit | null
  isActive: boolean
  categoryId: number
  categoryName: string
  categoryNameTa: string | null
  categoryIsActive: boolean
  stockQuantity: number
  lowStockThreshold: number
  stockStatus: StockStatus
  isLowStock: boolean
  createdAt: string
  updatedAt: string
}

export interface Category {
  id: number
  name: string
  nameTa: string | null
  slug: string
  description: string
  imageUrl: string | null
  imageSource: string | null
  imageCredit: ImageCredit | null
  sortOrder: number
  isActive: boolean
  productCount: number
}

export interface DeliveryZone {
  id: number
  name: string
  postcodePrefixes: string[]
  feeCents: number
  freeDeliveryThresholdCents: number | null
  minOrderCents: number
  isActive: boolean
}

export type StockReason =
  | 'order_placed'
  | 'order_cancelled'
  | 'payment_expired'
  | 'substitution'
  | 'item_unavailable'
  | 'delivery_received'
  | 'damaged'
  | 'stock_count'
  | 'adjustment'
  | 'new_product'
  | 'sample_data'
  | 'opening_balance'

export interface StockMovement {
  id: number
  productId?: number
  productName?: string
  sku?: string | null
  change: number
  quantityAfter: number
  reason: StockReason
  reasonLabel: string
  orderId: number | null
  orderNumber: string | null
  note: string | null
  userName: string | null
  createdAt: string
}

export type SupportTopic = 'missing_item' | 'damaged_item' | 'wrong_item' | 'late' | 'payment' | 'refund' | 'other'

export interface SupportRequest extends OrderSupportRequest {
  orderId: number | null
  orderNumber: string | null
  customerName: string
  customerEmail: string
  customerPhone: string | null
  resolvedByName: string | null
}

export interface WhatsAppMessage {
  id: number
  orderId: number | null
  orderNumber: string | null
  event: string
  toPhone: string | null
  language: 'en' | 'ta'
  templateName: string
  previewText: string
  mode: 'demo' | 'cloud_api'
  status: 'demo_recorded' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped'
  skipReason: string | null
  error: string | null
  attempts: number
  customerName: string | null
  createdAt: string
  updatedAt: string
}

export interface Promotion {
  id: number
  name: string
  nameTa: string | null
  description: string
  discountCents: number
  isActive: boolean
  isRunning: boolean
  startsAt: string | null
  endsAt: string | null
  items: { productId: number; quantity: number; name: string; nameTa: string | null; unitLabel: string; priceCents: number; imageUrl: string | null; isAvailable: boolean }[]
}

export interface StoreSettings {
  pickupSlotMinutes: number
  pickupSlotCapacity: number
  pickupDaysAhead: number
  pickupLeadTimeMinutes: number
  substitutionsEnabled: boolean
  loyaltyEnabled: boolean
  loyaltyPointsPer100: number
  loyaltyPointValueCents: number
  loyaltyMinRedeemPoints: number
  loyaltyMaxRedeemPercent: number
  promotionsEnabled: boolean
  updatedAt: string
}

export interface OpeningHours {
  weekday: number
  opensAt: string
  closesAt: string
  isClosed: boolean
}

export interface SettingsResponse {
  settings: StoreSettings
  openingHours: OpeningHours[]
  closures: { date: string; reason: string }[]
  timezone: string
}

export interface StaffUser {
  id: number
  name: string
  email: string
  phone: string | null
  role: 'staff' | 'manager'
  isActive: boolean
  createdAt: string
}
