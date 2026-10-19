// Shapes of the data the API sends back. See docs/API.md for full examples.

export type Role = 'customer' | 'staff'
export type OrderStatus = 'pending' | 'preparing' | 'ready_for_pickup' | 'out_for_delivery' | 'completed' | 'cancelled'
export type FulfillmentType = 'delivery' | 'pickup'
export type PaymentMethod = 'pay_on_fulfillment' | 'demo_card'
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded'
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock'

export interface User {
  id: number
  email: string
  name: string
  phone: string | null
  role: Role
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
    pending: number
    preparing: number
    readyForPickup: number
    outForDelivery: number
    ordersToday: number
    salesTodayCents: number
  }
  stock: { lowStock: number; outOfStock: number }
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
  createdAt: string
  customer?: { id: number; name: string; email: string }
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
  totalCents: number
  notes: string | null
  cancelReason: string | null
  cancelledBy: Role | null
  createdAt: string
  updatedAt: string
  items: {
    id: number
    productId: number
    productName: string
    unitLabel: string
    unitPriceCents: number
    quantity: number
    lineTotalCents: number
    imageUrl: string | null
    icon: string | null
  }[]
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
  customer?: { id: number; name: string; email: string; phone: string | null }
  allowedNextStatuses?: OrderStatus[]
  canCancel: boolean
}

export interface StaffProduct {
  id: number
  sku: string | null
  name: string
  brand: string | null
  description: string
  priceCents: number
  unitLabel: string
  imageUrl: string | null
  icon: string | null
  isActive: boolean
  categoryId: number
  categoryName: string
  categoryIcon: string
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
  slug: string
  description: string
  icon: string
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
