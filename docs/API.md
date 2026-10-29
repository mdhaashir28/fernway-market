# Meeranji Supermarket API reference

Base URL (local): `http://localhost:4000`

- Requests and responses are JSON (`Content-Type: application/json`), except image uploads.
- **Money is always in paise**, the smallest unit of the store currency (`CURRENCY`, default INR): `4550` = ₹45.50.
- Times are ISO 8601 in UTC, e.g. `"2026-10-13T04:30:00.000Z"`. Apps show them in local time.
- 🔒 = needs a login token: `Authorization: Bearer <token>` (from sign up / log in).
- 👷 = staff accounts only.

## Errors

Every error has the same shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Please enter a valid email address", "details": { "fields": [ { "field": "email", "message": "Please enter a valid email address" } ] } } }
```

| Status | Typical `code` | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR`, `BAD_REQUEST`, `INVALID_JSON`, `UPLOAD_ERROR` | Something in the request is wrong; `details.fields` lists each field |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` | Not logged in, token expired, or wrong email/password |
| 403 | `FORBIDDEN`, `ACCOUNT_DISABLED` | Logged in but not allowed (e.g. a customer calling a staff endpoint) |
| 404 | `NOT_FOUND` | No such item (also used for other customers' orders) |
| 409 | `EMAIL_TAKEN`, `CHECKOUT_PROBLEM`, `INVALID_STATUS_CHANGE`, `CANNOT_CANCEL`, `INSUFFICIENT_STOCK`, `ALREADY_EXISTS` | The request conflicts with the current state |
| 429 | `TOO_MANY_ATTEMPTS` | Too many login/sign-up attempts; wait a few minutes |
| 500 | `INTERNAL_ERROR` | Unexpected server problem (details are in the API terminal) |

---

## Health

### `GET /api/health`
```json
{ "status": "ok", "database": "ok", "payments": "test", "whatsapp": "demo", "version": "3163266", "time": "2026-10-13T02:07:21.973Z" }
```
`503` with `"status": "error", "database": "unreachable"` when the database can't be reached. `payments` is `demo`,
`test` (Razorpay test keys, no real money) or `live`. `whatsapp` is `off`, `demo` or `cloud_api`. `version` is the
deployed commit on Render, otherwise `null`.

---

## Accounts

### `POST /api/auth/signup`
```json
{ "name": "Priya Sharma", "email": "priya@example.com", "password": "at-least-8-chars", "phone": "+91 98765 11111" }
```
`201 Created`
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs…",
  "user": { "id": 3, "email": "priya@example.com", "name": "Priya Sharma", "phone": "+91 98765 11111", "role": "customer" }
}
```
Errors: `400 VALIDATION_ERROR`, `409 EMAIL_TAKEN`.

### `POST /api/auth/login`
```json
{ "email": "priya@example.com", "password": "at-least-8-chars" }
```
`200 OK`: same shape as sign up. Wrong email or password → `401 INVALID_CREDENTIALS`.
The staff dashboard uses this too and only lets in users with `"role": "staff"` or `"role": "manager"`.

### `GET /api/auth/me` 🔒
```json
{ "user": { "id": 2, "email": "customer@fernway.local", "name": "Alex Shopper", "phone": "+91 98765 01234", "role": "customer",
             "preferredLanguage": "ta", "whatsappOptIn": true, "loyaltyPoints": 42 } }
```

### `PATCH /api/auth/me` 🔒
Change your own details. Send only what changes:
`{ "name": "Alex", "phone": "98765 01234", "preferredLanguage": "ta", "whatsappOptIn": true }`.
`preferredLanguage` (`en`/`ta`) is used for in-app updates and WhatsApp messages. Turning on `whatsappOptIn`
without a phone number gives `400 PHONE_REQUIRED`.

**Logging out:** the app simply deletes its token. Tokens expire after `JWT_EXPIRES_IN` (default 7 days).

---

## Store & catalogue (no login needed)

### `GET /api/store`
Store details, delivery zones and payment options.
```json
{
  "name": "Meeranji Supermarket",
  "address": "#78/153 Bazaar Street, Pernambut - 635 810, Vellore District, Tamil Nadu",
  "phone": "+91 97895 62928",
  "phones": [
    { "display": "+91 97895 62928", "tel": "+919789562928" },
    { "display": "+91 90030 71616", "tel": "+919003071616" }
  ],
  "currency": "INR",
  "timezone": "Asia/Kolkata",
  "pickup": { "openHour": 9, "closeHour": 20, "slotMinutes": 60, "leadTimeMinutes": 60 },
  "deliveryZones": [
    { "name": "Pernambut", "postcodePrefixes": ["635810"], "feeCents": 3000, "freeDeliveryThresholdCents": 50000, "minOrderCents": 0 }
  ],
  "openingHours": [ { "weekday": 1, "opensAt": "09:00", "closesAt": "21:00", "isClosed": false } ],
  "closures": [ { "date": "2027-01-15", "reason": "Pongal" } ],
  "whatsappChatUrl": "https://wa.me/919789562928",
  "paymentsMode": "demo",
  "paymentMethods": [
    { "id": "upi", "label": "UPI (DEMO)", "description": "DEMO ONLY — practice payment screen, no money moves.", "isDemo": true, "mode": "demo" },
    { "id": "pay_on_fulfillment", "label": "Pay on delivery or collection", "description": "Pay by UPI, card or cash when you receive your order.", "isDemo": false }
  ],
  "paymentTimeoutMinutes": 15,
  "substitutionsEnabled": true,
  "whatsappUpdatesAvailable": true,
  "whatsappIsDemo": true,
  "loyalty": { "enabled": false },
  "promotionsEnabled": false
}
```
`phones` comes from `STORE_PHONE` (one or more numbers separated by commas). Use `tel` for tap-to-call links
(`tel:+919789562928`) and `display` to show the number. `phone` is the first number, kept for older apps.

### `GET /api/categories`
Visible categories with how many active products each has.
```json
{ "items": [ { "id": 10, "name": "Rice, Dals & Grains", "nameTa": "அரிசி, பருப்பு & தானியங்கள்", "slug": "rice-dals", "description": "Ponni, idli and dosa rice, dals and ragi", "imageUrl": "/sample-images/categories/rice-dals.jpg", "productCount": 12 } ] }
```

### `GET /api/products`
Search and filter active products. All query parameters are optional:

| Parameter | Example | Meaning |
| --- | --- | --- |
| `search` | `dal` | Matches name, brand, description, category or SKU. Accents are ignored (`nescafe` finds Nescafé). Names that start with the text come first, then name/brand matches, then the rest |
| `categoryId` | `3` | Only this category |
| `inStock` | `true` | Hide out-of-stock products |
| `minPriceCents` / `maxPriceCents` | `5000` | Price range in paise |
| `sort` | `relevance` \| `name` \| `price_asc` \| `price_desc` \| `newest` | Defaults to `relevance` when searching, else `name` |
| `ids` | `1,4,15` | Only these products (the cart uses this to refresh prices) |
| `page`, `pageSize` | `1`, `24` | Paging (max 100 per page) |

`GET /api/products?search=banana`
```json
{
  "items": [
    {
      "id": 1,
      "name": "Bananas",
      "brand": null,
      "description": "Ripe, sweet bananas — perfect for breakfast, smoothies or baking.",
      "priceCents": 4500,
      "unitLabel": "6 pcs",
      "imageUrl": "/sample-images/FV-001.jpg",
      "imageCredit": {
        "kind": "licensed",
        "author": "…",
        "licence": "CC BY-SA 4.0",
        "licenceUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
        "sourceUrl": "https://commons.wikimedia.org/wiki/File:…",
        "note": null
      },
      "categoryId": 1,
      "categoryName": "Fruit & Veg",
      "availableQuantity": 79,
      "stockStatus": "in_stock"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 24
}
```
`stockStatus` is `in_stock`, `low_stock` (at or below the store's alert level) or `out_of_stock`.
`brand` is the brand on the pack (e.g. "Surf Excel", "Maggi", or "Store packed" for staples the store packs itself),
or `null`. `unitLabel` is the pack size (e.g. "1 kg", "4 × 100 g").
`imageUrl` is relative to the API: load it from `http://localhost:4000/…`. If it's `null` there's no photo yet: the
apps show a clearly labelled "Image needed" placeholder (never an emoji or a stand-in picture).
`imageCredit` says where the photo is from: `kind: "licensed"` for the freely licensed sample photos (author, licence and
source page), or `kind: "store"` with a `note` for photos staff uploaded (what they typed as the source). It is `null`
when there is no photo, or the source of an uploaded photo was not recorded. Categories carry the same `imageCredit`.

### `GET /api/products/:id`
`{ "product": { …same fields as above… } }`. Inactive products return `404`.

---

## Delivery & pickup

### `GET /api/delivery/check?postcode=635810&subtotalCents=9000`
`subtotalCents` is optional; when given, `feeCents` takes free delivery into account.
```json
{
  "postcode": "635810",
  "available": true,
  "zone": { "id": 1, "name": "Pernambut" },
  "feeCents": 3000,
  "standardFeeCents": 3000,
  "freeDeliveryThresholdCents": 50000,
  "minOrderCents": 0,
  "message": "Great news — we deliver to 635810 (Pernambut). Free delivery on orders over ₹500."
}
```
Outside the area:
```json
{ "postcode": "600001", "available": false, "message": "Sorry, we don't deliver to 600001 yet. You can still order for store pickup." }
```

### `GET /api/pickup-slots`
Collection times for today and the next few days (full slots included, so apps can show "Full").
```json
{
  "timezone": "Asia/Kolkata",
  "storeAddress": "#78/153 Bazaar Street, Pernambut - 635 810, Vellore District, Tamil Nadu",
  "items": [
    { "id": 2, "startsAt": "2026-10-13T04:30:00.000Z", "endsAt": "2026-10-13T05:30:00.000Z", "capacity": 6, "bookedCount": 1, "remaining": 5, "isAvailable": true }
  ]
}
```

---

## Addresses 🔒

Fields: `label` (e.g. "Home"), `recipientName`, `phone`, `line1`, `line2` (optional), `city`, `postcode` (the PIN code),
`instructions` (optional), `isDefault`.

| Method & path | What it does |
| --- | --- |
| `GET /api/addresses` | Your saved addresses, each with `deliveryAvailable` and `deliveryZone` |
| `POST /api/addresses` | Add one (`201`). Your first address becomes the default |
| `PUT /api/addresses/:id` | Replace one |
| `DELETE /api/addresses/:id` | Delete one (`204`) |

```json
{
  "id": 1, "label": "Home", "recipientName": "Alex Shopper", "phone": "+91 98765 01234",
  "line1": "10 Sample Street", "line2": null, "city": "Pernambut", "postcode": "635810",
  "instructions": "Demo address — please call before delivering", "isDefault": true,
  "deliveryAvailable": true,
  "deliveryZone": { "id": 1, "name": "Pernambut", "feeCents": 3000, "freeDeliveryThresholdCents": 50000, "minOrderCents": 0 }
}
```

---

## Checkout & orders 🔒

### `POST /api/checkout/quote`
Works out the real totals **without saving anything**. Send product ids and quantities only; prices
always come from the database.

Delivery to a saved address:
```json
{ "items": [ { "productId": 1, "quantity": 2, "substitution": { "preference": "specific", "productId": 4 } },
             { "productId": 15, "quantity": 1, "substitution": { "preference": "similar" } } ],
  "fulfillment": { "type": "delivery", "addressId": 1 },
  "useLoyaltyPoints": false }
```
`substitution` is optional for each item: what to do if it's unavailable when the order is packed — `none`
(default: remove it), `similar` (staff choose), or `specific` with the replacement's `productId`.
Or a one-off address: `"fulfillment": { "type": "delivery", "address": { "recipientName": "…", "phone": "…", "line1": "…", "city": "…", "postcode": "635810" } }`
Or pickup: `"fulfillment": { "type": "pickup", "pickupSlotId": 2 }`

```json
{
  "items": [
    { "productId": 1, "name": "Bananas", "unitLabel": "6 pcs", "unitPriceCents": 4500, "quantity": 2, "lineTotalCents": 9000, "availableQuantity": 79, "isAvailable": true, "imageUrl": "/sample-images/FV-001.jpg" },
    { "productId": 15, "name": "Full Cream Milk", "unitLabel": "1 L", "unitPriceCents": 6800, "quantity": 1, "lineTotalCents": 6800, "availableQuantity": 58, "isAvailable": true, "imageUrl": "/sample-images/DE-001.jpg" }
  ],
  "subtotalCents": 15800,
  "discountCents": 0,
  "promotions": [],
  "loyalty": { "enabled": false, "balance": 0, "pointsAvailable": 0, "pointsUsed": 0, "discountCents": 0 },
  "deliveryFeeCents": 3000,
  "totalCents": 18800,
  "fulfillment": {
    "type": "delivery",
    "postcode": "635810",
    "zone": { "id": 1, "name": "Pernambut", "feeCents": 3000, "freeDeliveryThresholdCents": 50000, "minOrderCents": 0 },
    "amountToFreeDeliveryCents": 34200
  },
  "issues": [],
  "canPlaceOrder": true
}
```
If something needs fixing, `canPlaceOrder` is `false` and `issues` explains why. Possible issue codes:
`OUT_OF_STOCK`, `INSUFFICIENT_STOCK`, `PRODUCT_UNAVAILABLE`, `ADDRESS_REQUIRED`, `ADDRESS_NOT_FOUND`,
`OUTSIDE_SERVICE_AREA`, `BELOW_MINIMUM_ORDER`, `PICKUP_SLOT_REQUIRED`, `PICKUP_SLOT_UNAVAILABLE`,
`SUBSTITUTE_UNAVAILABLE`, `UPI_MINIMUM`.

### `POST /api/orders`
Same body as the quote, plus:

| Field | Required | Meaning |
| --- | --- | --- |
| `paymentMethod` | yes | `pay_on_fulfillment` or `upi` |
| `whatsappUpdates` | no | `true` = also send order updates on WhatsApp (the customer needs a phone number) |
| `returnUrl` | for UPI | Where the payment page sends the customer back to. `__ORDER_ID__` is replaced with the new order's id, e.g. `fernway://order/__ORDER_ID__`. Only the app's own addresses are accepted |
| `notes` | no | Message for the store (max 500 characters) |
| `idempotencyKey` | recommended | Any random string (8–100 chars) created once per checkout. Sending the same request again returns the **same** order instead of a duplicate |

`201 Created` (or `200 OK` with `"created": false` if the idempotency key was already used):
```json
{
  "created": true,
  "payment": { "paymentId": 7, "checkoutUrl": "http://localhost:4000/pay/Vt3k…" },
  "order": {
    "id": 5, "orderNumber": "MS-00005",
    "status": "awaiting_payment", "statusLabel": "Awaiting payment",
    "fulfillmentType": "pickup", "paymentMethod": "upi", "paymentStatus": "pending",
    "subtotalCents": 9000, "deliveryFeeCents": 0, "discountCents": 0, "loyaltyDiscountCents": 0, "totalCents": 9000,
    "paidCents": 0, "refundedCents": 0, "whatsappUpdates": true,
    "items": [ { "id": 9, "productId": 1, "productName": "Bananas", "productNameTa": "வாழைப்பழம்", "unitLabel": "6 pcs",
                 "unitPriceCents": 4500, "quantity": 2, "lineTotalCents": 9000, "chargedCents": 9000,
                 "substitutionPreference": "none", "fulfilmentStatus": "ordered", "imageUrl": "/sample-images/FV-001.jpg" } ],
    "pickup": { "slotId": 2, "startsAt": "2026-10-13T04:30:00.000Z", "endsAt": "2026-10-13T05:30:00.000Z" },
    "payment": { "isDemo": true, "mode": "demo", "dueBy": "2026-10-13T03:07:10.120Z", "paidAt": null, "latestAttempt": { "status": "created", "failureReason": null } },
    "refunds": [], "events": [], "supportRequests": [],
    "canPay": true, "canSwitchToPayOnDelivery": true, "canCancel": true
  }
}
```
- **Pay on delivery** orders start as `confirmed`.
- **UPI** orders start as `awaiting_payment`. Their items and slot are held until `payment.dueBy`. Open `payment.checkoutUrl` (the secure payment page) to pay. The order becomes `confirmed` only after the server has verified the payment with the gateway.
- Unpaid UPI orders are cancelled automatically after `PAYMENT_TIMEOUT_MINUTES`.

Problems → `409 CHECKOUT_PROBLEM` with the same `issues` list as the quote:
```json
{ "error": { "code": "CHECKOUT_PROBLEM", "message": "Strawberries is out of stock.",
  "details": { "issues": [ { "code": "OUT_OF_STOCK", "productId": 7, "availableQuantity": 0, "message": "Strawberries is out of stock." } ] } } }
```

### `GET /api/orders?page=1&pageSize=20`
Your order history, newest first. Each item has `id`, `orderNumber`, `status`, `statusLabel`, `fulfillmentType`,
`paymentMethod`, `paymentStatus`, `totalCents`, `itemCount`, `itemPreview`, `deliveryPostcode`, `pickupStartsAt`,
`pickupEndsAt`, `paymentDueBy` and `createdAt`.

### `GET /api/orders/:id`
`{ "order": { … } }`, the same shape as when the order was placed. Other people's orders return `404`.

### More order actions

| Method & path | What it does |
| --- | --- |
| `POST /api/orders/:id/payments` | Start a new UPI payment attempt: `{ "returnUrl": "fernway://order/5" }` → `{ "payment": { "checkoutUrl" }, "order" }`. `409` if the order isn't waiting for payment |
| `POST /api/orders/:id/payments/refresh` | "Check payment status": asks the gateway what happened |
| `POST /api/orders/:id/pay-on-delivery` | Give up on UPI and pay on delivery or collection instead |
| `POST /api/orders/:id/cancel` | Body (optional): `{ "reason": "Ordered by mistake" }`. Allowed until the store starts preparing (otherwise `409 CANNOT_CANCEL`). Stock is returned, the slot freed, and any payment **refunded automatically** |
| `GET /api/orders/:id/reorder` | "Order again": `{ "items": [ { "productId", "quantity", "requestedQuantity", "available" } ] }` with today's stock |

---

## Payments (UPI)

| Path | Who | What it does |
| --- | --- | --- |
| `GET /pay/:token` | the customer's browser | The secure payment page. The token is random, one per attempt. In `razorpay` mode it opens Razorpay Checkout (UPI only); in `demo` mode it shows practice buttons marked **DEMO** |
| `POST /api/payments/:token/razorpay/verify` | the payment page | Sends Razorpay's `razorpay_payment_id`, `razorpay_order_id` and `razorpay_signature`. The server checks the signature **and** fetches the payment from Razorpay (amount, currency, order, status) before marking the order paid |
| `POST /api/payments/:token/razorpay/failed` | the payment page | Records a failed attempt (no money taken) |
| `POST /api/payments/:token/dismissed` | the payment page | The customer closed the payment screen |
| `POST /api/payments/:token/demo` | the payment page, demo mode only | `{ "outcome": "success" \| "failure" \| "pending" \| "cancel" }` |
| `POST /api/webhooks/razorpay` | Razorpay | Signed with `RAZORPAY_WEBHOOK_SECRET` (`X-Razorpay-Signature`). Handles `payment.authorized`, `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed`. Each event is processed once |
| `GET`/`POST /api/webhooks/whatsapp` | Meta | Webhook verification (`hub.verify_token`) and delivery receipts, signed with `WHATSAPP_APP_SECRET` (`X-Hub-Signature-256`) |

After paying, the page sends the customer back to the `returnUrl` with `?payment=paid|pending|failed|cancelled`.
That value is only a hint for the screen. The order's real state always comes from the server.

---

## Customer features 🔒

| Method & path | What it does |
| --- | --- |
| `GET /api/notifications?limit=50&orderId=5` | In-app order updates in the customer's language: `{ "items": [ { "id", "orderId", "event", "title", "body", "createdAt", "readAt" } ], "unreadCount" }`. `orderId` is optional |
| `POST /api/notifications/read` | `{ "ids": [1, 2] }`, or `{}` for all |
| `GET /api/lists` / `POST /api/lists` | Shopping lists: `{ "name": "Monthly groceries", "items": [ { "productId": 1, "quantity": 2 } ] }` (up to 20 lists, 100 products each) |
| `GET`/`PATCH`/`DELETE /api/lists/:id` | One list (with today's product details and availability); rename; delete |
| `PUT`/`DELETE /api/lists/:id/items/:productId` | Add or change a product's quantity `{ "quantity": 3 }`; remove it |
| `GET /api/support` / `POST /api/support` | Help requests: `{ "orderId": 5, "topic": "damaged_item", "message": "The sugar packet was torn" }`. Topics: `missing_item`, `damaged_item`, `wrong_item`, `late`, `payment`, `refund`, `other` |
| `GET /api/loyalty` | Points balance, the rules and recent history (when loyalty is switched on) |
| `GET /api/promotions` | Running bundle offers (no login needed; empty when offers are switched off) |

---

## Staff endpoints 🔒👷

All of these need a **staff** or **manager** token. Customers get `403 FORBIDDEN`. Endpoints marked **(manager)**
return `403` for staff.

### `GET /api/staff/summary`
```json
{
  "orders": { "awaitingPayment": 1, "confirmed": 2, "preparing": 1, "readyForPickup": 1, "outForDelivery": 0, "ordersToday": 4, "salesTodayCents": 152300 },
  "stock": { "lowStock": 7, "outOfStock": 1, "missingPhoto": 12 },
  "attention": { "openSupportRequests": 1, "failedRefunds": 0, "failedWhatsApp": 0 },
  "currency": "INR",
  "timezone": "Asia/Kolkata",
  "paymentsMode": "demo",
  "whatsappMode": "demo"
}
```

### Orders

| Method & path | What it does |
| --- | --- |
| `GET /api/staff/orders` | List and filter orders (see parameters below) |
| `GET /api/staff/orders/:id` | One order, plus `customer`, `allowedNextStatuses`, all payment attempts, refunds and the full `events` audit trail |
| `PATCH /api/staff/orders/:id/status` | Move to the next status: `{ "status": "preparing", "note": "optional" }` |
| `POST /api/staff/orders/:id/cancel` | Cancel with a **required** reason: `{ "reason": "Items out of stock" }`. Orders paid online can only be cancelled by a **manager** (refunded automatically) |
| `POST /api/staff/orders/:id/items/:itemId/resolve` | Item not on the shelf: `{ "type": "unavailable", "setStockToZero": true }` or `{ "type": "substitute", "productId": 12, "quantity": 2, "customerAgreed": true }`. The customer pays at most the original line price. Replacing against the customer's choice needs `customerAgreed` (else `409 CUSTOMER_CHOICE`) |
| `POST /api/staff/orders/:id/notes` | A note only staff see: `{ "note": "Customer will collect at 6" }` |
| `POST /api/staff/orders/:id/payments/refresh` | Ask the gateway about the order's payments |
| `POST /api/staff/orders/:id/refunds/:refundId/retry` | **(manager)** Try a failed refund again |

List parameters: `status` (`open` = not completed/cancelled, or one status), `fulfillmentType` (`delivery`/`pickup`),
`search` (order number like `MS-00012`, customer name or email), `from`/`to` (`YYYY-MM-DD`, store time zone), `page`, `pageSize`.

Allowed status changes:
`confirmed → preparing → ready_for_pickup` (pickup orders) **or** `out_for_delivery` (delivery orders) `→ completed`.
`awaiting_payment` orders become `confirmed` only when the payment is verified.
Anything else → `409 INVALID_STATUS_CHANGE` with `details.allowedNextStatuses`.

### Products

| Method & path | What it does |
| --- | --- |
| `GET /api/staff/products` | All products, including inactive. Parameters: `search`, `categoryId`, `status` (`all`/`active`/`inactive`), `lowStock=true`, `missingPhoto=true` (products without a photo), `sort` (`name`, `price_asc`, `price_desc`, `newest`, `stock_asc`), `page`, `pageSize` (max 200) |
| `GET /api/staff/products/:id` | One product |
| `POST /api/staff/products` | **(manager)** Create (`201`) |
| `PATCH /api/staff/products/:id` | **(manager)** Change only the fields you send. **Deactivate** with `{ "isActive": false }`. Stock is not changed here |
| `POST /api/staff/products/:id/stock` | Always with a reason: `{ "adjustBy": 24, "reason": "delivery_received", "note": "Invoice 42" }`, `{ "adjustBy": -2, "reason": "damaged" }`, or `{ "quantity": 40, "reason": "stock_count" }`. Reasons: `delivery_received`, `damaged`, `stock_count`, `adjustment` |
| `GET /api/staff/products/:id/history` | Every stock change for this product: `change`, `quantityAfter`, `reason`, `reasonLabel`, `orderNumber`, `note`, `userName`, `createdAt` |
| `POST /api/staff/products/:id/image` | Upload a photo as `multipart/form-data`, field name `image` (JPG/PNG/WebP, max 8 MB; resized to fit 1000 px and saved as JPEG), plus an optional text field `source` saying where the photo is from (max 200 characters; the dashboard requires it) |
| `DELETE /api/staff/products/:id/image` | Remove the photo |

Create body:
```json
{ "name": "Oat Milk", "nameTa": "ஓட்ஸ் பால்", "brand": "Example Brand", "categoryId": 3, "priceCents": 24900, "unitLabel": "1 L", "sku": "DE-099",
  "description": "Creamy oat drink.", "isActive": true, "stockQuantity": 24, "lowStockThreshold": 5 }
```
Response (`{ "product": … }`) includes staff-only fields: `sku`, `isActive`, `categoryIsActive`,
`stockQuantity`, `lowStockThreshold`, `isLowStock`, `createdAt`, `updatedAt`.

Upload with curl:
```bash
curl -X POST http://localhost:4000/api/staff/products/1/image -H "Authorization: Bearer YOUR_TOKEN" -F "image=@bananas.jpg" -F "source=Taken in our shop, Oct 2026"
```

### Categories

| Method & path | Body |
| --- | --- |
| `GET /api/staff/categories` | (includes hidden categories and `productCount`) |
| `POST /api/staff/categories` | **(manager)** `{ "name": "Baby & Toddler", "nameTa": "குழந்தைப் பொருட்கள்", "description": "…", "sortOrder": 10, "isActive": true }` |
| `PATCH /api/staff/categories/:id` | **(manager)** Any of the fields above. `{ "isActive": false }` hides the category **and its products** |
| `POST`/`DELETE /api/staff/categories/:id/image` | **(manager)** Upload (field `image`, optional `source`) or remove the category photo |

### Delivery zones

| Method & path | Body |
| --- | --- |
| `GET /api/staff/delivery-zones` | |
| `POST /api/staff/delivery-zones` | **(manager)** `{ "name": "Pernambut", "postcodePrefixes": ["635810"], "feeCents": 3000, "freeDeliveryThresholdCents": 50000, "minOrderCents": 0, "isActive": true }` |
| `PATCH /api/staff/delivery-zones/:id` | **(manager)** Any of the fields above. Send `"freeDeliveryThresholdCents": null` to remove free delivery |

PIN codes and prefixes are stored without spaces (`"635 810"` → `"635810"`). A PIN code matches the zone with the
**longest** matching prefix.

### Store administration

| Method & path | What it does |
| --- | --- |
| `GET /api/staff/settings` | `{ settings, openingHours, closures, timezone }` — pickup slots, substitutions, loyalty and offers switches |
| `PUT /api/staff/settings` | **(manager)** Any of: `pickupSlotMinutes`, `pickupSlotCapacity`, `pickupDaysAhead`, `pickupLeadTimeMinutes`, `substitutionsEnabled`, `loyaltyEnabled`, `loyaltyPointsPer100`, `loyaltyPointValueCents`, `loyaltyMinRedeemPoints`, `loyaltyMaxRedeemPercent`, `promotionsEnabled` |
| `PUT /api/staff/settings/hours` | **(manager)** `{ "openingHours": [ { "weekday": 0, "opensAt": "09:00", "closesAt": "13:00", "isClosed": false }, … all 7 days ] }` |
| `POST /api/staff/settings/closures` / `DELETE …/closures/:date` | **(manager)** Closed days: `{ "date": "2027-01-15", "reason": "Pongal" }` |
| `GET /api/staff/promotions` | Bundle offers, including paused ones |
| `POST` / `PUT /api/staff/promotions/:id` / `DELETE` | **(manager)** `{ "name", "nameTa", "description", "discountCents", "isActive", "startsAt", "endsAt", "items": [ { "productId", "quantity" } ] }` (at least 2 products) |
| `GET /api/staff/support?status=open` | Customer help requests (`open`, `resolved` or `all`) |
| `PATCH /api/staff/support/:id` | `{ "reply": "Sorry! We'll refund the sugar.", "status": "resolved" }` — the reply appears in the customer's app |
| `GET /api/staff/messages?status=failed` | WhatsApp log: each message's text, template, status and the last 4 digits of the number. In demo mode, these are the previews |
| `POST /api/staff/messages/:id/retry` | **(manager)** Send a failed Cloud API message again |
| `GET /api/staff/stock-history?productId=&reason=` | Every stock change for all products |
| `GET /api/staff/users` / `POST` / `PATCH /api/staff/users/:id` | **(manager)** Staff accounts: `{ "name", "email", "password", "role": "staff" \| "manager" }`; `PATCH` can change `role`, `isActive` or `password` |

---

## Product images

Photos are served as files:

- Sample photos that ship with the code: `GET /sample-images/<SKU>.jpg` (e.g. `http://localhost:4000/sample-images/FV-001.jpg`),
  and category photos at `GET /sample-images/categories/<slug>.jpg`.
  Credits, and the list of sample products that still need a photo, are in `backend/seed-images/CREDITS.md`.
- `GET /api/image-credits`: `{ "categories": [...], "products": [...] }`, every active category and product that has a
  photo, with its `imageCredit`. The customer app's **Photo credits** screen uses it.
- Photos uploaded by staff with `IMAGE_STORAGE=disk`: `GET /uploads/products/<file>`.
- Photos uploaded by staff with `IMAGE_STORAGE=database`: `GET /api/images/<id>`.
