# Payments and WhatsApp — setup guide

The app talks to two outside services:

| Service | What it's for | Setting | Default |
| --- | --- | --- | --- |
| **Razorpay** | UPI payments in the app | `PAYMENTS_MODE` + Razorpay keys | `demo` |
| **WhatsApp Business Platform (Cloud API)** | Order updates on WhatsApp | `WHATSAPP_MODE` | `demo` |

Both start in a **clearly labelled demo mode**, so you can run and test the whole app with no accounts, no keys and no real money:

- **Payments demo:** after placing a UPI order, the customer sees a practice payment page marked **DEMO PAYMENT**. It has buttons for *success*, *failure*, *pending* and *cancel*. No money moves and no UPI app opens. The app and the staff dashboard show a **DEMO** badge on these orders.
- **Payments test mode:** with Razorpay **test** keys (`rzp_test_…`), customers see Razorpay's real checkout, but in test mode: nothing is charged. The checkout, the app and the dashboard are marked **Razorpay TEST mode**. See [Razorpay test mode](#razorpay-test-mode-for-the-demo).
- **Live payments are locked:** **live** keys (`rzp_live_…`) charge real customers real money. The API refuses to start with live keys unless `RAZORPAY_ALLOW_LIVE_PAYMENTS=true`, which nothing sets by default.
- **WhatsApp demo:** nothing is sent. Every message that *would* have been sent is saved, and staff can read it in the dashboard under **WhatsApp log** (marked "Demo — not sent").

Customers always see every order update **inside the app** (Account → Updates, and on the order screen), whatever the WhatsApp setting.

> **Important:** neither Razorpay (test or live) nor the WhatsApp Cloud API has been tried with a real account yet. The server-side checks (signature, amount, order, webhooks, refunds) are covered by automated tests against a *fake* Razorpay server. Treat each integration as unverified until you have run the test steps below with your own credentials. Don't take real payments until you've completed the [go-live checklist](#go-live-checklist-for-real-payments).

---

## 1. UPI payments with Razorpay

### How a payment works

1. The customer chooses **Pay now with UPI** and places the order.
   - The order is saved as **Awaiting payment**.
   - Its items and pickup slot are held for `PAYMENT_TIMEOUT_MINUTES` (15 by default). Staff see "don't pack yet".
2. The server creates a Razorpay order for the exact amount and opens our secure payment page, `/pay/<one-time-link>`.
   - On a phone it opens in a secure browser tab.
   - The page opens **Razorpay Standard Checkout**, limited to UPI. The customer pays in their own UPI app (Google Pay, PhonePe, Paytm, BHIM and so on).
   - The customer types their **UPI PIN only in their UPI app**. The app and our server never see it.
3. Razorpay returns a payment ID and a signature. **The server, not the app, checks the result:**
   - it checks the signature `HMAC-SHA256(order_id|payment_id, key_secret)`;
   - it asks Razorpay's API for the payment and confirms the amount, the currency, the Razorpay order and the status;
   - only then is the order marked **Paid → Order confirmed**. It is captured if needed.
4. **Webhooks** from Razorpay (`payment.captured`, `payment.failed`, `order.paid` and others) do the same checks. That covers a customer who closes the tab before coming back.
   - Each webhook is processed only once.
   - Staff and customers can also press **Check payment status**, which asks Razorpay directly.

| What happens | What the customer sees | What the store sees |
| --- | --- | --- |
| Paid | "Payment received", order confirmed | Paid, order in the *New orders* list |
| Failed | "Payment failed — no money was taken", **Try paying again** | Payment failed, attempt listed |
| Closed the payment screen | "Payment cancelled — your order is still waiting" | Attempt "Closed by customer" |
| Pending (bank hasn't confirmed) | "Payment pending — this page updates by itself. Don't pay twice." | Payment pending |
| Not paid in time | Order cancelled, items released | Cancelled automatically, stock back |
| Paid twice, or paid after the order was cancelled | — | Extra payment **refunded automatically** |

Customers can also switch to **Pay on delivery instead** while an order is waiting for payment.

**Refunds:**

- Refunds are started automatically when a paid order is cancelled, or when an item is removed or swapped for something cheaper.
- They show on the order with their status. Customers are told they usually take **2–7 working days** to reach the bank.
- A failed refund appears on the dashboard Overview, and a manager can retry it.

### What is stored (and what is not)

- **Stored, per payment attempt:**
  - Razorpay's order ID and payment ID;
  - the status, amount and currency;
  - the failure reason, if any;
  - the time created, paid and refunded.
- **Never stored or seen:**
  - UPI PIN;
  - UPI ID, card numbers or bank account details;
  - any other payment credentials.
- Webhook bodies are not kept. Only the event ID is saved, so each event is processed once.

### Setting up a Razorpay account (merchant onboarding)

1. Sign up at [razorpay.com](https://razorpay.com) with the store's business details.
2. Complete **KYC / account activation** in the Razorpay Dashboard. Razorpay usually asks for:
   - business type and business PAN, or the owner's PAN for a proprietorship;
   - the owner's ID and address proof;
   - a bank account in the business's (or proprietor's) name for settlements;
   - GSTIN if you have one;
   - your website or app details.
3. Razorpay reviews the **website or app** before activating payments. Have public pages ready with:
   - contact details (address, phone, email);
   - terms and conditions;
   - a **cancellation and refund policy**;
   - a privacy policy;
   - a shipping/delivery policy (delivery areas, pickup).

   These pages are **not in the app yet** — see "Information still needed" below.
4. In the dashboard, open **Account & Settings → API Keys**.
   - Generate **Test** keys first (`rzp_test_…`).
   - Live keys (`rzp_live_…`) are only available after activation.
5. Check that **UPI** is enabled as a payment method for your account.

### Razorpay test mode (for the demo)

Test mode needs only a Razorpay sign-up. You don't need KYC or account activation, and **no real money moves**.

1. Sign up at [razorpay.com](https://razorpay.com) and open the Razorpay Dashboard.
2. Switch the dashboard to **Test Mode** (the toggle at the top).
3. Go to **Account & Settings → API Keys → Generate Test Key**. Copy the **Key ID** (`rzp_test_…`) and the **Key Secret**. Razorpay shows the secret only once.
4. Put them in the API's environment variables, as in the table below (on Render: `meeranji-api` → **Environment**). Never put them in the code, in `.env.example` or in git.
5. Still in Test Mode, add the [webhook](#webhook) with its own secret, and put that secret in `RAZORPAY_WEBHOOK_SECRET`.
6. Redeploy or restart the API. Check the mode at `https://<your API address>/api/health`, which should show `"payments":"test"`.

**What to try** (customer app → add items → checkout → **Pay now with UPI**):

| Case | How | Expected result |
| --- | --- | --- |
| Success | Choose UPI and enter `success@razorpay` | "Payment received". The order is **Order confirmed**; the dashboard shows Paid with a **Razorpay TEST** badge |
| Failure | Enter `failure@razorpay` | "Payment failed — no money was taken". **Try paying again** is offered |
| Closed before paying | Close the Razorpay checkout window without paying | "Payment cancelled — your order is still waiting". The dashboard lists the attempt as "Closed by customer" |
| Not paid in time | Leave the order unpaid for `PAYMENT_TIMEOUT_MINUTES` | The order is cancelled and its stock released |
| Cancelled inside the UPI payment | Can't be tested: Razorpay test mode records a cancelled UPI payment as successful | Covered by the automated tests; on the demo payment page use *cancel* |
| Pending | Can't be triggered reliably in Razorpay test mode | Use the demo payment page's *pending* button, or rely on the automated tests |

The test UPI IDs come from Razorpay's [test UPI details](https://razorpay.com/docs/payments/payments/test-upi-details/). Never enter a real UPI ID or PIN on a test checkout.

Run these tests in a computer's web browser (the customer web shop). On Android phones Razorpay may show only UPI apps or a QR code instead of a box for typing a UPI ID, and the test UPI IDs need that box.

### Environment variables

Put these in `.env` on your computer. On Render or Vercel, add them to the API's environment variables. Never put them in the code or in git.

| Variable | Example (placeholder) | Notes |
| --- | --- | --- |
| `PAYMENTS_MODE` | `razorpay` | `demo` = practice page. `razorpay` = Razorpay checkout (falls back to demo while keys are missing) |
| `RAZORPAY_KEY_ID` | `rzp_test_…` | Public key ID (shown to the checkout). `rzp_test_` = test mode, `rzp_live_` = real money |
| `RAZORPAY_KEY_SECRET` | *(secret)* | Used only on the server |
| `RAZORPAY_WEBHOOK_SECRET` | *(secret you choose)* | Same text as in the webhook settings |
| `RAZORPAY_ALLOW_LIVE_PAYMENTS` | `false` | Must stay `false` for demos. With `false`, the API refuses to start with live keys |
| `PAYMENT_TIMEOUT_MINUTES` | `15` | How long unpaid UPI orders are held |
| `PUBLIC_API_URL` | `https://meeranji-api.vercel.app` | Used to build payment page links. Not needed on Render, which provides its own address |

### Webhook

In the Razorpay Dashboard, go to **Account & Settings → Webhooks → Add new webhook**:

- **URL:** `https://<your API address>/api/webhooks/razorpay`, for example `https://meeranji-api.onrender.com/api/webhooks/razorpay` (Render) or `https://meeranji-api.vercel.app/api/webhooks/razorpay` (Vercel)
- **Secret:** a long random text. Put the same text in `RAZORPAY_WEBHOOK_SECRET`.
- **Active events:** `payment.authorized`, `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`

Unsigned or wrongly signed webhooks are rejected. Test-mode and live-mode webhooks are configured separately, each with its own secret.

On Render's free plan the API sleeps when nobody uses it. A webhook that wakes it may time out once; Razorpay retries it, and each payment is also checked when the customer comes back from the checkout.

### Costs

These are Razorpay's published rates for the standard plan. Check [razorpay.com/pricing](https://razorpay.com/pricing/) before going live, because offers and rates change.

- **UPI:** RBI rules mean there is no MDR on UPI. Razorpay charges a **2% platform fee** per successful payment, plus **18% GST on that fee**. On a ₹500 order that is ₹10 + ₹1.80 GST.
- **No setup fee and no annual maintenance charge.**
- Razorpay sometimes runs introductory offers for new merchants. Confirm the current terms in your dashboard.
- Refunds: the original fee is generally not returned when you refund. Check your agreement.

Customers pay nothing extra.

### Go-live checklist for real payments

Live UPI payments **charge customers real money**. Turn them on only deliberately, after the merchant account and the whole payment flow are verified. Use **live** keys and set `RAZORPAY_ALLOW_LIVE_PAYMENTS=true` only after **all** of these are done:

1. [ ] Razorpay account activated (KYC approved) and the settlement bank account verified.
2. [ ] Policy pages published (contact, terms, refunds and cancellations, privacy, delivery).
3. [ ] **Test mode run end to end** with `rzp_test_` keys on the live website and on a real Android phone:
   - successful payment;
   - failed payment;
   - closing the payment screen;
   - paying after the timeout, which should be refunded automatically;
   - cancelling a paid order, which should be refunded;
   - removing an item from a paid order, which should give a partial refund.
4. [ ] Test webhook added, and you've seen events arrive. The Razorpay Dashboard shows each delivery attempt.
5. [ ] Tried "Check payment status" in the app and in the dashboard.
6. [ ] Live webhook added with its own secret. Live keys and the secret set **only** in the hosting provider's environment variables.
7. [ ] One small real payment, for example ₹1, paid and then refunded from the dashboard by cancelling the order.
8. [ ] Staff know that **Awaiting payment** orders must not be packed.

### Known limits

- **Phones:** the payment page opens in a secure browser tab, not inside the app.
  - On Android, Chrome hands over to installed UPI apps.
  - Razorpay recommends its native SDK for the smoothest in-app UPI experience. That needs a custom development build of the phone app, so it is not used yet.
  - iOS behaviour has not been tested.
- **UPI ID (collect requests):** NPCI is withdrawing "type your UPI ID" collect requests for most person-to-merchant payments. Customers should pay with their UPI app or a QR code, which is what Razorpay Checkout shows. Some Razorpay test-mode shortcuts use collect requests and may not behave like real payments.

---

## 2. WhatsApp order updates (official WhatsApp Business Platform)

The app uses **only Meta's official WhatsApp Cloud API**. It does not use unofficial WhatsApp automation, WhatsApp Web scripts or "bulk sender" tools; those break WhatsApp's terms and can get the store's number banned.

### Who gets messages

- Only customers who turn on **Order updates on WhatsApp**, at checkout or in Account, **and** have a mobile number saved. The time they opted in is recorded.
- They can turn it off at any time in Account.
- Messages go out in the customer's chosen language, English or Tamil.
- Messages are sent for:
  - order confirmed;
  - preparing;
  - ready for pickup;
  - out for delivery;
  - completed;
  - cancelled (with the reason);
  - refund processed.

The **Chat with us on WhatsApp** button is separate. It is WhatsApp's own [click-to-chat link](https://faq.whatsapp.com/5913398998672934) (`wa.me`), which just opens the customer's WhatsApp with the store's number. Nothing is sent automatically.

### Setting up the WhatsApp Business Platform

1. Create a **Meta Business portfolio** at [business.facebook.com](https://business.facebook.com) and verify the business (Business Settings → Security Center).
2. At [developers.facebook.com](https://developers.facebook.com), create an app of type **Business** and add the **WhatsApp** product. This creates a WhatsApp Business Account.
3. **Add the store's phone number** (WhatsApp Manager → Phone numbers):
   - It must receive an SMS or voice call for verification.
   - A number already used in the WhatsApp or WhatsApp Business **app** must be moved off it first, or connected using Meta's "coexistence" option if your number qualifies.
   - Choose a display name such as "Meeranji Supermarket". Meta reviews it.
4. Add a **payment method** in WhatsApp Manager. Meta charges per delivered message (see Costs), and service messages stop if no payment method is on file.
5. Create a **System User** (Business Settings → Users → System users):
   - give it the app and the WhatsApp Business Account;
   - generate a **permanent token** with `whatsapp_business_messaging` and `whatsapp_business_management`.
   - Don't use the 24-hour temporary token from the API Setup page.
6. Note down:
   - the **Phone number ID**, from WhatsApp → API Setup;
   - the **App secret**, from App → Settings → Basic.
7. Submit the **message templates** below and wait for approval, which is usually quick for utility messages.
8. Set up the **webhook** (below), then switch `WHATSAPP_MODE=cloud_api`.

### Environment variables

| Variable | What to put |
| --- | --- |
| `WHATSAPP_MODE` | `cloud_api` (or `demo` / `off`) |
| `WHATSAPP_ACCESS_TOKEN` | The System User's permanent token (secret) |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID from API Setup |
| `WHATSAPP_APP_SECRET` | App secret, used to check webhook signatures (secret) |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Any random text; type the same text in Meta's webhook settings |
| `WHATSAPP_API_VERSION` | `v26.0` (Graph API version) |
| `WHATSAPP_TEMPLATE_PREFIX` | Optional prefix if your template names differ, e.g. `meeranji_` |
| `WHATSAPP_TEMPLATE_LANG_EN` / `_TA` | Template language codes, `en` and `ta` |
| `STORE_WHATSAPP_NUMBER` | Number for the "Chat with us" button (defaults to the first `STORE_PHONE`) |

### Message templates

Order updates are sent as **template messages**, category **Utility**, because they can arrive more than 24 hours after the customer last wrote to the store.

- In **WhatsApp Manager → Message templates**, create each template below **twice**: once in English (`en`) and once in Tamil (`ta`).
- Use exactly these names and the same numbered variables.
- The dashboard's WhatsApp log shows each message filled in, exactly as the customer would see it.

| Name | English body | Tamil body | Example values |
| --- | --- | --- | --- |
| `order_confirmed` | Hello {{1}}, your order {{2}} at {{3}} is confirmed. Total: {{4}}. We will message you when it is being prepared. | வணக்கம் {{1}}, {{3}}-இல் உங்கள் ஆர்டர் {{2}} உறுதிசெய்யப்பட்டது. மொத்தம்: {{4}}. தயாரிக்கத் தொடங்கியதும் உங்களுக்குச் செய்தி அனுப்புவோம். | Priya, MS-00012, Meeranji Supermarket, ₹482 |
| `order_preparing` | Hello {{1}}, {{3}} has started preparing your order {{2}}. We will let you know when it is ready. | வணக்கம் {{1}}, {{3}} உங்கள் ஆர்டர் {{2}}-ஐத் தயாரிக்கத் தொடங்கியுள்ளது. தயாரானதும் தெரிவிப்போம். | Priya, MS-00012, Meeranji Supermarket |
| `order_ready_for_pickup` | Hello {{1}}, your order {{2}} is ready for pickup at {{3}}. Collection time: {{4}}. Please show your order number at the counter. | வணக்கம் {{1}}, உங்கள் ஆர்டர் {{2}} {{3}}-இல் பிக்கப்புக்குத் தயாராக உள்ளது. பெற்றுக்கொள்ளும் நேரம்: {{4}}. கவுண்டரில் உங்கள் ஆர்டர் எண்ணைக் காட்டவும். | Priya, MS-00012, Meeranji Supermarket, Tue 21 Oct, 10:00 – 11:00 |
| `order_out_for_delivery` | Hello {{1}}, your order {{2}} from {{3}} is out for delivery and will reach you soon. | வணக்கம் {{1}}, {{3}}-இலிருந்து உங்கள் ஆர்டர் {{2}} டெலிவரிக்கு அனுப்பப்பட்டது, விரைவில் உங்களை வந்தடையும். | Priya, MS-00012, Meeranji Supermarket |
| `order_completed` | Hello {{1}}, your order {{2}} is complete. Thank you for shopping at {{3}}, we hope to see you again soon. | வணக்கம் {{1}}, உங்கள் ஆர்டர் {{2}} நிறைவடைந்தது. {{3}}-இல் வாங்கியதற்கு நன்றி, மீண்டும் வருக. | Priya, MS-00012, Meeranji Supermarket |
| `order_cancelled` | Hello {{1}}, your order {{2}} at {{3}} has been cancelled. Reason: {{4}}. Any payment you made will be refunded to your original payment method. | வணக்கம் {{1}}, {{3}}-இல் உங்கள் ஆர்டர் {{2}} ரத்துசெய்யப்பட்டது. காரணம்: {{4}}. நீங்கள் செலுத்திய பணம் ஏதேனும் இருந்தால், அது நீங்கள் செலுத்திய வழியிலேயே திருப்பி அனுப்பப்படும். | Priya, MS-00012, Meeranji Supermarket, Item out of stock |
| `refund_processed` | Hello {{1}}, a refund of {{2}} for order {{3}} has been processed. It usually reaches your account within 2–7 working days. | வணக்கம் {{1}}, ஆர்டர் {{3}}-க்கான {{2}} பணம் திருப்பி அனுப்பப்பட்டது. பொதுவாக 2–7 வேலை நாட்களுக்குள் உங்கள் கணக்கில் வந்துசேரும். | Priya, ₹120, MS-00012 |

The template texts live in `backend/src/services/messages.ts`. If you change a template there, submit the same change in WhatsApp Manager.

### Trying it before going live

- **Demo mode (no Meta account):** place an order with **Order updates on WhatsApp** turned on, then move it through Preparing → Ready for pickup (or Out for delivery) → Completed in the dashboard. Each message appears in **WhatsApp log**, filled in and marked "Demo — not sent".
- **Meta's test number:** Meta's API Setup page offers a free test phone number that can message up to five verified recipient numbers. Use `WHATSAPP_MODE=cloud_api` with it **only** on a private test deployment, never on a demo that other people can use.

### Webhook (delivery receipts)

In the Meta app, go to **WhatsApp → Configuration → Webhook**:

- **Callback URL:** `https://<your API address>/api/webhooks/whatsapp`
- **Verify token:** the same text as `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- Subscribe to the **messages** field.

Webhook calls are checked with the `X-Hub-Signature-256` header and `WHATSAPP_APP_SECRET`; unsigned calls are rejected. Delivery statuses (*sent*, *delivered*, *read*, *failed*) then appear in the dashboard's WhatsApp log. A manager can resend a failed message.

### Costs

These figures come from Meta's [pricing page](https://developers.facebook.com/docs/whatsapp/pricing). Check the current **INR rate card** there, because Meta updates rates.

- **Pricing model:** since 1 July 2025 Meta charges **per delivered template message**, depending on the category and the customer's country. Customers pay nothing to message the store.
- **India, utility templates** (all order updates here): about **₹0.115 per delivered message** at the list rate, before GST. **Marketing** templates cost far more, about ₹0.86, but this app doesn't send any.
- **Change from 1 October 2026:** utility messages sent inside the 24-hour customer service window are **no longer free**, and service (non-template) replies are charged after the first 1,000 per phone number each month. A payment method must be on file.
- **Example:** 300 orders a month × about 4 updates (confirmed, preparing, ready or out for delivery, completed) ≈ 1,200 messages ≈ **₹140 a month plus GST**.
- **Provider fees:** using Meta's Cloud API directly, as this app does, has no provider fee. Third-party "BSP" dashboards add their own per-message or monthly fees.
- **Billing currency:** Meta is moving Indian businesses to **INR billing**. Accounts must be migrated by 31 December 2026.

---

## 3. Checking which mode is running

- **API health check:** `https://<your API address>/api/health` shows `"payments"` (`demo`, `test` or `live`) and `"whatsapp"` (`off`, `demo` or `cloud_api`).
- **API logs:** the modes are printed when the API starts, e.g. `UPI payments: Razorpay TEST mode (test keys — no real money)`.
- **Staff dashboard → Overview** shows a banner for demo, test and live payments, and for demo WhatsApp.
- **Store settings → Payments and WhatsApp** shows the current modes.
- In the app, the UPI option carries a **DEMO** or **TEST MODE** badge, and the WhatsApp switch says "DEMO: messages are previewed by the store, not sent".

## Sources

- Razorpay pricing: <https://razorpay.com/pricing/>
- Razorpay webhooks: <https://razorpay.com/docs/webhooks/>
- Razorpay test UPI details: <https://razorpay.com/docs/payments/payments/test-upi-details/>
- Razorpay payment signature verification: <https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/>
- WhatsApp Business Platform pricing: <https://developers.facebook.com/docs/whatsapp/pricing>
- WhatsApp Cloud API: <https://developers.facebook.com/docs/whatsapp/cloud-api>
- WhatsApp message templates: <https://developers.facebook.com/docs/whatsapp/message-templates>
- Third-party summary of the India rate card (₹0.115 utility, ₹0.8631 marketing): <https://dev.to/preciousky_45d956626d31c3/whatsapp-business-platform-pricing-in-rupees-and-the-two-things-that-change-on-1-october-2026-4ko0>
