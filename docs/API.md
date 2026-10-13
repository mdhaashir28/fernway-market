# Fernway Market API reference

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
{ "status": "ok", "database": "ok", "time": "2026-10-13T02:07:21.973Z" }
```

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
The staff dashboard uses this too and only lets in users with `"role": "staff"`.

### `GET /api/auth/me` 🔒
```json
{ "user": { "id": 2, "email": "customer@fernway.local", "name": "Alex Shopper", "phone": "+91 98765 01234", "role": "customer" } }
```

**Logging out:** the app simply deletes its token. Tokens expire after `JWT_EXPIRES_IN` (default 7 days).

---

## Store & catalogue (no login needed)

### `GET /api/store`
Store details, delivery zones and payment options.
```json
{
  "name": "Fernway Market",
  "address": "12 Market Street, Springfield",
  "phone": "+91 98765 43210",
  "currency": "INR",
  "timezone": "Asia/Kolkata",
  "pickup": { "openHour": 9, "closeHour": 20, "slotMinutes": 60, "leadTimeMinutes": 60 },
  "deliveryZones": [
    { "name": "Central", "postcodePrefixes": ["1000"], "feeCents": 3000, "freeDeliveryThresholdCents": 50000, "minOrderCents": 0 }
  ],
  "paymentMethods": [
    { "id": "pay_on_fulfillment", "label": "Pay on delivery or collection", "description": "Pay by card or cash when you receive your order.", "isDemo": false },
    { "id": "demo_card", "label": "Demo card payment", "description": "DEMO ONLY — no card details are collected and no money is taken.", "isDemo": true }
  ]
}
```

### `GET /api/categories`
Visible categories with how many active products each has.
```json
{ "items": [ { "id": 1, "name": "Fruit & Veg", "slug": "fruit-veg", "description": "Fresh fruit, vegetables and salad", "icon": "🥦", "productCount": 9 } ] }
```

### `GET /api/products`
Search and filter active products. All query parameters are optional:

| Parameter | Example | Meaning |
| --- | --- | --- |
| `search` | `milk` | Matches name, description, category or SKU |
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
      "description": "Ripe, sweet bananas — perfect for breakfast, smoothies or baking.",
      "priceCents": 4500,
      "unitLabel": "6 pcs",
      "imageUrl": "/uploads/products/sample-fv-001.jpg",
      "icon": "🍌",
      "categoryId": 1,
      "categoryName": "Fruit & Veg",
      "categoryIcon": "🥦",
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
`imageUrl` is relative to the API: load it from `http://localhost:4000/uploads/…`. If it's `null`, show `icon`
(or `categoryIcon`) instead.

### `GET /api/products/:id`
`{ "product": { …same fields as above… } }`. Inactive products return `404`.

---

## Delivery & pickup

### `GET /api/delivery/check?postcode=10001&subtotalCents=9000`
`subtotalCents` is optional; when given, `feeCents` takes free delivery into account.
```json
{
  "postcode": "10001",
  "available": true,
  "zone": { "id": 1, "name": "Central" },
  "feeCents": 3000,
  "standardFeeCents": 3000,
  "freeDeliveryThresholdCents": 50000,
  "minOrderCents": 0,
  "message": "Great news — we deliver to 10001 (Central). Free delivery on orders over ₹500."
}
```
Outside the area:
```json
{ "postcode": "560001", "available": false, "message": "Sorry, we don't deliver to 560001 yet. You can still order for store pickup." }
```

### `GET /api/pickup-slots`
Collection times for today and the next few days (full slots included, so apps can show "Full").
```json
{
  "timezone": "Asia/Kolkata",
  "storeAddress": "12 Market Street, Springfield",
  "items": [
    { "id": 2, "startsAt": "2026-10-13T04:30:00.000Z", "endsAt": "2026-10-13T05:30:00.000Z", "capacity": 6, "bookedCount": 1, "remaining": 5, "isAvailable": true }
  ]
}
```

---

## Addresses 🔒

Fields: `label` (e.g. "Home"), `recipientName`, `phone`, `line1`, `line2` (optional), `city`, `postcode`,
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
  "line1": "24 Elm Street", "line2": null, "city": "Springfield", "postcode": "10001",
  "instructions": "Blue door — please ring the bell", "isDefault": true,
  "deliveryAvailable": true,
  "deliveryZone": { "id": 1, "name": "Central", "feeCents": 3000, "freeDeliveryThresholdCents": 50000, "minOrderCents": 0 }
}
```

---

## Checkout & orders 🔒

### `POST /api/checkout/quote`
Works out the real totals **without saving anything**. Send product ids and quantities only; prices
always come from the database.

Delivery to a saved address:
```json
{ "items": [ { "productId": 1, "quantity": 2 }, { "productId": 15, "quantity": 1 } ],
  "fulfillment": { "type": "delivery", "addressId": 1 } }
```
Or a one-off address: `"fulfillment": { "type": "delivery", "address": { "recipientName": "…", "phone": "…", "line1": "…", "city": "…", "postcode": "10001" } }`
Or pickup: `"fulfillment": { "type": "pickup", "pickupSlotId": 2 }`

```json
{
  "items": [
    { "productId": 1, "name": "Bananas", "unitLabel": "6 pcs", "unitPriceCents": 4500, "quantity": 2, "lineTotalCents": 9000, "availableQuantity": 79, "isAvailable": true, "imageUrl": "/uploads/products/sample-fv-001.jpg", "icon": "🍌", "categoryIcon": "🥦" },
    { "productId": 15, "name": "Full Cream Milk", "unitLabel": "1 L", "unitPriceCents": 6800, "quantity": 1, "lineTotalCents": 6800, "availableQuantity": 58, "isAvailable": true, "imageUrl": "/uploads/products/sample-de-001.jpg", "icon": "🥛", "categoryIcon": "🧀" }
  ],
  "subtotalCents": 15800,
  "deliveryFeeCents": 3000,
  "totalCents": 18800,
  "fulfillment": {
    "type": "delivery",
    "postcode": "10001",
    "zone": { "id": 1, "name": "Central", "feeCents": 3000, "freeDeliveryThresholdCents": 50000, "minOrderCents": 0 },
    "amountToFreeDeliveryCents": 34200
  },
  "issues": [],
  "canPlaceOrder": true
}
```
If something needs fixing, `canPlaceOrder` is `false` and `issues` explains why. Possible issue codes:
`OUT_OF_STOCK`, `INSUFFICIENT_STOCK`, `PRODUCT_UNAVAILABLE`, `ADDRESS_REQUIRED`, `ADDRESS_NOT_FOUND`,
`OUTSIDE_SERVICE_AREA`, `BELOW_MINIMUM_ORDER`, `PICKUP_SLOT_REQUIRED`, `PICKUP_SLOT_UNAVAILABLE`.

### `POST /api/orders`
Same body as the quote, plus:

| Field | Required | Meaning |
| --- | --- | --- |
| `paymentMethod` | yes | `pay_on_fulfillment` or `demo_card` (demo: marked paid, nothing charged) |
| `notes` | no | Message for the store (max 500 characters) |
| `idempotencyKey` | recommended | Any random string (8–100 chars) created once per checkout. Sending the same request again returns the **same** order instead of a duplicate |

```json
{
  "items": [ { "productId": 1, "quantity": 2 } ],
  "fulfillment": { "type": "pickup", "pickupSlotId": 2 },
  "paymentMethod": "demo_card",
  "notes": "Please pick ripe bananas",
  "idempotencyKey": "mgq3z1-4k2j9x7b1c"
}
```
`201 Created` (or `200 OK` with `"created": false` if the idempotency key was already used):
```json
{
  "created": true,
  "order": {
    "id": 5,
    "orderNumber": "FW-00005",
    "status": "pending",
    "statusLabel": "Pending",
    "fulfillmentType": "pickup",
    "paymentMethod": "demo_card",
    "paymentStatus": "paid",
    "subtotalCents": 9000,
    "deliveryFeeCents": 0,
    "totalCents": 9000,
    "notes": "Please pick ripe bananas",
    "cancelReason": null,
    "cancelledBy": null,
    "createdAt": "2026-10-13T02:52:10.120Z",
    "updatedAt": "2026-10-13T02:52:10.120Z",
    "items": [ { "id": 9, "productId": 1, "productName": "Bananas", "unitLabel": "6 pcs", "unitPriceCents": 4500, "quantity": 2, "lineTotalCents": 9000, "imageUrl": "/uploads/products/sample-fv-001.jpg", "icon": "🍌" } ],
    "delivery": null,
    "pickup": { "slotId": 2, "startsAt": "2026-10-13T04:30:00.000Z", "endsAt": "2026-10-13T05:30:00.000Z" },
    "history": [ { "status": "pending", "note": "Order placed", "createdAt": "2026-10-13T02:52:10.120Z", "changedByRole": "customer" } ],
    "canCancel": true
  }
}
```
Problems → `409 CHECKOUT_PROBLEM` with the same `issues` list as the quote:
```json
{ "error": { "code": "CHECKOUT_PROBLEM", "message": "Strawberries is out of stock.",
  "details": { "issues": [ { "code": "OUT_OF_STOCK", "productId": 7, "availableQuantity": 0, "message": "Strawberries is out of stock." } ] } } }
```

### `GET /api/orders?page=1&pageSize=20`
Your order history, newest first.
```json
{
  "items": [
    { "id": 4, "orderNumber": "FW-00004", "status": "completed", "statusLabel": "Completed", "fulfillmentType": "delivery",
      "paymentMethod": "pay_on_fulfillment", "paymentStatus": "paid", "totalCents": 91700, "itemCount": 4,
      "itemPreview": "Gala Apples, Free-Range Eggs, Toilet Tissue", "deliveryPostcode": "10001",
      "pickupStartsAt": null, "pickupEndsAt": null, "createdAt": "2026-10-13T03:00:25.563Z" }
  ],
  "total": 4, "page": 1, "pageSize": 20
}
```

### `GET /api/orders/:id`
`{ "order": { … } }`, the same shape as when the order was placed. Other people's orders return `404`.

### `POST /api/orders/:id/cancel`
Body (optional): `{ "reason": "Ordered by mistake" }`. Customers can cancel only while the order is
**Pending** (otherwise `409 CANNOT_CANCEL`). Stock is returned and the pickup slot is freed.

---

## Staff endpoints 🔒👷

All of these need a **staff** token. Customers get `403 FORBIDDEN`.

### `GET /api/staff/summary`
```json
{
  "orders": { "pending": 1, "preparing": 1, "readyForPickup": 1, "outForDelivery": 0, "ordersToday": 4, "salesTodayCents": 152300 },
  "stock": { "lowStock": 7, "outOfStock": 1 },
  "currency": "INR",
  "timezone": "Asia/Kolkata"
}
```

### Orders

| Method & path | What it does |
| --- | --- |
| `GET /api/staff/orders` | List and filter orders (see parameters below) |
| `GET /api/staff/orders/:id` | One order, plus `customer` and `allowedNextStatuses` |
| `PATCH /api/staff/orders/:id/status` | Move to the next status: `{ "status": "preparing", "note": "optional" }` |
| `POST /api/staff/orders/:id/cancel` | Cancel with a **required** reason: `{ "reason": "Items out of stock" }` |

List parameters: `status` (`open` = not completed/cancelled, or one status), `fulfillmentType` (`delivery`/`pickup`),
`search` (order number like `FW-00012`, customer name or email), `from`/`to` (`YYYY-MM-DD`, store time zone), `page`, `pageSize`.

Allowed status changes:
`pending → preparing → ready_for_pickup` (pickup orders) **or** `out_for_delivery` (delivery orders) `→ completed`.
Anything else → `409 INVALID_STATUS_CHANGE` with `details.allowedNextStatuses`.

### Products

| Method & path | What it does |
| --- | --- |
| `GET /api/staff/products` | All products, including inactive. Parameters: `search`, `categoryId`, `status` (`all`/`active`/`inactive`), `lowStock=true`, `sort` (`name`, `price_asc`, `price_desc`, `newest`, `stock_asc`), `page`, `pageSize` (max 200) |
| `GET /api/staff/products/:id` | One product |
| `POST /api/staff/products` | Create (`201`) |
| `PATCH /api/staff/products/:id` | Change only the fields you send. **Deactivate** with `{ "isActive": false }` |
| `POST /api/staff/products/:id/stock` | `{ "adjustBy": 24 }` (delivery received), `{ "adjustBy": -2 }` (damaged), or `{ "quantity": 40 }` (exact count) |
| `POST /api/staff/products/:id/image` | Upload a photo as `multipart/form-data`, field name `image` (JPG/PNG/WebP, max 5 MB) |
| `DELETE /api/staff/products/:id/image` | Remove the photo |

Create body:
```json
{ "name": "Oat Milk", "categoryId": 3, "priceCents": 24900, "unitLabel": "1 L", "sku": "DE-006",
  "description": "Creamy oat drink.", "icon": "🥛", "isActive": true, "stockQuantity": 24, "lowStockThreshold": 5 }
```
Response (`{ "product": … }`) includes staff-only fields: `sku`, `isActive`, `categoryIsActive`,
`stockQuantity`, `lowStockThreshold`, `isLowStock`, `createdAt`, `updatedAt`.

Upload with curl:
```bash
curl -X POST http://localhost:4000/api/staff/products/1/image -H "Authorization: Bearer YOUR_TOKEN" -F "image=@bananas.jpg"
```

### Categories

| Method & path | Body |
| --- | --- |
| `GET /api/staff/categories` | (includes hidden categories and `productCount`) |
| `POST /api/staff/categories` | `{ "name": "Baby & Toddler", "icon": "🍼", "description": "…", "sortOrder": 10, "isActive": true }` |
| `PATCH /api/staff/categories/:id` | Any of the fields above. `{ "isActive": false }` hides the category **and its products** |

### Delivery zones

| Method & path | Body |
| --- | --- |
| `GET /api/staff/delivery-zones` | |
| `POST /api/staff/delivery-zones` | `{ "name": "Koramangala", "postcodePrefixes": ["560034", "560095"], "feeCents": 3000, "freeDeliveryThresholdCents": 50000, "minOrderCents": 0, "isActive": true }` |
| `PATCH /api/staff/delivery-zones/:id` | Any of the fields above. Send `"freeDeliveryThresholdCents": null` to remove free delivery |

Prefixes are stored in upper case without spaces (`"sw1 a"` → `"SW1A"`). A postcode matches the zone with the
**longest** matching prefix.

---

## Product images

Uploaded and sample photos are served as static files:
`GET /uploads/products/<file>` (e.g. `http://localhost:4000/uploads/products/sample-fv-001.jpg`).
