// The small web page the app opens to pay for an order (/pay/<token>).
//  • Razorpay mode: opens Razorpay's secure Checkout, limited to UPI. The
//    customer approves the payment in their UPI app; we never see their PIN.
//    With TEST keys (rzp_test_…) the page says so clearly: no real money moves.
//  • Demo mode: a clearly labelled practice page with buttons that simulate
//    each outcome. No money moves.
// Afterwards the page sends the customer back to the app (or shop website).

export interface PaymentPageData {
  token: string;
  mode: 'razorpay' | 'demo';
  /** Razorpay with test keys: Razorpay's real checkout, but no real money. */
  testMode: boolean;
  lang: 'en' | 'ta';
  storeName: string;
  orderNumber: string;
  amountText: string;
  amountCents: number;
  status: string; // payment attempt status
  orderStatus: string;
  returnUrl: string | null;
  razorpay?: { keyId: string; orderId: string; prefill: { name: string; email: string; contact: string } };
}

const TEXT = {
  en: {
    title: 'Pay with UPI',
    order: 'Order',
    amount: 'Amount',
    pay: 'Pay {amount} with UPI',
    secure: 'Payments are processed securely by Razorpay. You approve the payment in your UPI app — we never see your UPI PIN.',
    demoBanner: 'DEMO PAYMENT — practice only',
    demoText: 'No money moves and no UPI app opens. This page stands in for the secure Razorpay UPI checkout, so you can try every outcome.',
    demoSuccess: 'Simulate successful payment',
    demoFailure: 'Simulate failed payment',
    demoPending: 'Simulate pending payment (bank has not confirmed yet)',
    demoCancel: 'Cancel payment',
    testBanner: 'RAZORPAY TEST MODE — no real money',
    testText:
      "This is Razorpay's test checkout, so nothing is charged. Choose UPI and enter the test UPI ID success@razorpay (the payment succeeds) or failure@razorpay (the payment fails). Don't use your real UPI ID or PIN.",
    working: 'Please wait…',
    paid: 'Payment received. Your order is confirmed.',
    pending: 'We are waiting for your bank to confirm the payment. Your order will update by itself — you can check its status in the app.',
    failed: 'The payment did not go through. No money was taken. You can try again, or go back and choose pay on delivery.',
    cancelled: 'Payment cancelled. Your order is still waiting for payment.',
    tryAgain: 'Try again',
    back: 'Back to the app',
    closeHint: 'You can close this page and return to the app.',
    notNeeded: 'This order no longer needs a payment.',
    error: 'Something went wrong. Please check your connection and try again.',
  },
  ta: {
    title: 'UPI மூலம் பணம் செலுத்துங்கள்',
    order: 'ஆர்டர்',
    amount: 'தொகை',
    pay: 'UPI மூலம் {amount} செலுத்துங்கள்',
    secure: 'பணம் Razorpay மூலம் பாதுகாப்பாகச் செலுத்தப்படுகிறது. உங்கள் UPI செயலியில் அனுமதி தருவீர்கள் — உங்கள் UPI PIN எங்களுக்குத் தெரியாது.',
    demoBanner: 'டெமோ பணம் செலுத்துதல் — பயிற்சிக்கு மட்டும்',
    demoText: 'பணம் எதுவும் எடுக்கப்படாது, UPI செயலியும் திறக்காது. இது Razorpay UPI பக்கத்திற்குப் பதிலான பயிற்சிப் பக்கம்.',
    demoSuccess: 'வெற்றிகரமான பணம் செலுத்துதலைச் சோதி',
    demoFailure: 'தோல்வியடைந்த பணம் செலுத்துதலைச் சோதி',
    demoPending: 'நிலுவையில் உள்ள பணம் செலுத்துதலைச் சோதி (வங்கி இன்னும் உறுதிசெய்யவில்லை)',
    demoCancel: 'பணம் செலுத்துதலை ரத்துசெய்',
    testBanner: 'RAZORPAY சோதனை முறை — உண்மையான பணம் இல்லை',
    testText:
      'இது Razorpay-இன் சோதனைப் பக்கம், எனவே பணம் எதுவும் எடுக்கப்படாது. UPI-ஐத் தேர்ந்தெடுத்து success@razorpay (பணம் வெற்றி) அல்லது failure@razorpay (பணம் தோல்வி) என்ற சோதனை UPI ID-ஐ உள்ளிடவும். உங்கள் உண்மையான UPI ID அல்லது PIN-ஐப் பயன்படுத்த வேண்டாம்.',
    working: 'காத்திருக்கவும்…',
    paid: 'பணம் கிடைத்தது. உங்கள் ஆர்டர் உறுதிசெய்யப்பட்டது.',
    pending: 'உங்கள் வங்கி பணத்தை உறுதிசெய்யக் காத்திருக்கிறோம். ஆர்டர் தானாகவே புதுப்பிக்கப்படும் — செயலியில் நிலையைப் பார்க்கலாம்.',
    failed: 'பணம் செலுத்துதல் வெற்றியடையவில்லை. பணம் எதுவும் எடுக்கப்படவில்லை. மீண்டும் முயலலாம், அல்லது டெலிவரியின்போது பணம் செலுத்தலாம்.',
    cancelled: 'பணம் செலுத்துதல் ரத்துசெய்யப்பட்டது. உங்கள் ஆர்டர் இன்னும் பணத்திற்காகக் காத்திருக்கிறது.',
    tryAgain: 'மீண்டும் முயல்க',
    back: 'செயலிக்குத் திரும்பு',
    closeHint: 'இந்தப் பக்கத்தை மூடிவிட்டு செயலிக்குத் திரும்பலாம்.',
    notNeeded: 'இந்த ஆர்டருக்கு இனி பணம் செலுத்தத் தேவையில்லை.',
    error: 'ஏதோ தவறு நடந்தது. இணைப்பைச் சரிபார்த்து மீண்டும் முயலவும்.',
  },
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/** JSON that is safe to place inside a <script> tag. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

export function paymentPageCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' https://checkout.razorpay.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://checkout.razorpay.com",
    'frame-src https://api.razorpay.com https://checkout.razorpay.com',
    "form-action 'self' https://api.razorpay.com",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
}

export function renderPaymentPage(data: PaymentPageData, nonce: string): string {
  const t = TEXT[data.lang];
  const isDemo = data.mode === 'demo';
  const needsPayment = data.orderStatus === 'awaiting_payment' && data.status !== 'paid';
  const initialStatus = data.status === 'paid' ? 'paid' : 'cancelled';
  return `<!doctype html>
<html lang="${data.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(t.title)} · ${escapeHtml(data.storeName)}</title>
<style>
  :root { color-scheme: light; --green:#1B6B45; --green-dark:#134D32; --text:#18211C; --muted:#5B665F; --border:#E1E5E0; --bg:#F6F7F2; --amber:#8A5300; --amber-bg:#FDF0D9; --red:#B42318; --red-bg:#FDE8E7; }
  * { box-sizing: border-box; }
  body { margin:0; font:17px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Nirmala UI", "Noto Sans Tamil", sans-serif; background:var(--bg); color:var(--text); }
  main { max-width:480px; margin:0 auto; padding:24px 16px 40px; }
  h1 { font-size:1.4rem; margin:0 0 4px; }
  .store { color:var(--muted); margin:0 0 20px; }
  .card { background:#fff; border:1px solid var(--border); border-radius:16px; padding:20px; margin-bottom:16px; }
  .row { display:flex; justify-content:space-between; gap:12px; padding:6px 0; }
  .row strong { font-size:1.15rem; }
  .demo { background:var(--amber-bg); color:var(--amber); border:2px dashed var(--amber); border-radius:16px; padding:16px; margin-bottom:16px; }
  .demo strong { display:block; font-size:1.05rem; margin-bottom:4px; }
  button, .button { display:block; width:100%; min-height:52px; margin:10px 0 0; padding:12px 16px; border-radius:12px; border:2px solid var(--green); background:var(--green); color:#fff; font:inherit; font-weight:700; text-align:center; text-decoration:none; cursor:pointer; }
  button.secondary, .button.secondary { background:#fff; color:var(--green-dark); }
  button.danger { background:#fff; color:var(--red); border-color:var(--red); }
  button:disabled { opacity:.6; cursor:wait; }
  button:focus-visible, .button:focus-visible { outline:3px solid #175CD3; outline-offset:2px; }
  .note { color:var(--muted); font-size:.95rem; }
  .message { border-radius:12px; padding:14px 16px; margin:16px 0 0; font-weight:600; }
  .message.ok { background:#E3F1E8; color:var(--green-dark); }
  .message.warn { background:var(--amber-bg); color:var(--amber); }
  .message.error { background:var(--red-bg); color:var(--red); }
  [hidden] { display:none !important; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(t.title)}</h1>
  <p class="store">${escapeHtml(data.storeName)}</p>
  ${isDemo ? `<div class="demo" role="note"><strong>${escapeHtml(t.demoBanner)}</strong>${escapeHtml(t.demoText)}</div>` : ''}
  ${!isDemo && data.testMode ? `<div class="demo" role="note"><strong>${escapeHtml(t.testBanner)}</strong>${escapeHtml(t.testText)}</div>` : ''}
  <section class="card" aria-label="${escapeHtml(t.order)}">
    <div class="row"><span>${escapeHtml(t.order)}</span><span>${escapeHtml(data.orderNumber)}</span></div>
    <div class="row"><span>${escapeHtml(t.amount)}</span><strong>${escapeHtml(data.amountText)}</strong></div>
  </section>
  <div id="actions" ${needsPayment ? '' : 'hidden'}>
    ${
      isDemo
        ? `<button type="button" data-outcome="success">${escapeHtml(t.demoSuccess)}</button>
    <button type="button" class="danger" data-outcome="failure">${escapeHtml(t.demoFailure)}</button>
    <button type="button" class="secondary" data-outcome="pending">${escapeHtml(t.demoPending)}</button>
    <button type="button" class="secondary" data-outcome="cancel">${escapeHtml(t.demoCancel)}</button>`
        : `<button type="button" id="pay">${escapeHtml(t.pay.replace('{amount}', data.amountText))}</button>
    <p class="note">${escapeHtml(t.secure)}</p>`
    }
  </div>
  <p id="message" class="message" role="status" aria-live="polite" ${needsPayment ? 'hidden' : ''}>${
    needsPayment ? '' : escapeHtml(data.status === 'paid' ? t.paid : t.notNeeded)
  }</p>
  <div id="after" ${needsPayment ? 'hidden' : ''}>
    <button type="button" id="retry" class="secondary" hidden>${escapeHtml(t.tryAgain)}</button>
    ${data.returnUrl ? `<a id="back" class="button" href="#">${escapeHtml(t.back)}</a>` : `<p class="note">${escapeHtml(t.closeHint)}</p>`}
  </div>
</main>
${isDemo ? '' : `<script src="https://checkout.razorpay.com/v1/checkout.js" nonce="${nonce}"></script>`}
<script nonce="${nonce}">
(function () {
  var data = ${scriptJson({
    token: data.token,
    mode: data.mode,
    returnUrl: data.returnUrl,
    amountCents: data.amountCents,
    storeName: data.storeName,
    orderNumber: data.orderNumber,
    razorpay: data.razorpay ?? null,
    needsPayment,
    initialStatus,
  })};
  var t = ${scriptJson(t)};
  var message = document.getElementById('message');
  var actions = document.getElementById('actions');
  var after = document.getElementById('after');
  var retry = document.getElementById('retry');
  var back = document.getElementById('back');
  var finalStatus = data.initialStatus;

  function returnTo(status) {
    if (!data.returnUrl) return null;
    return data.returnUrl + (data.returnUrl.indexOf('?') === -1 ? '?' : '&') + 'payment=' + encodeURIComponent(status);
  }
  if (back) back.addEventListener('click', function (e) { e.preventDefault(); var url = returnTo(finalStatus); if (url) window.location.href = url; });

  function show(kind, text, status, canRetry) {
    finalStatus = status;
    message.textContent = text;
    message.className = 'message ' + kind;
    message.hidden = false;
    actions.hidden = true;
    after.hidden = false;
    retry.hidden = !canRetry;
    if (status === 'paid' || status === 'pending') {
      var url = returnTo(status);
      if (url) setTimeout(function () { window.location.href = url; }, 1500);
    }
  }
  function post(path, body) {
    return fetch('/api/payments/' + encodeURIComponent(data.token) + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {})
    }).then(function (res) { return res.json().then(function (json) { if (!res.ok) throw json; return json; }); });
  }
  function result(status) {
    if (status === 'paid') show('ok', t.paid, 'paid', false);
    else if (status === 'pending') show('warn', t.pending, 'pending', false);
    else if (status === 'failed') show('error', t.failed, 'failed', true);
    else show('warn', t.cancelled, 'cancelled', true);
  }
  function busy(on) { Array.prototype.forEach.call(document.querySelectorAll('#actions button'), function (b) { b.disabled = on; }); }
  retry.addEventListener('click', function () { window.location.reload(); });

  if (data.mode === 'demo') {
    Array.prototype.forEach.call(document.querySelectorAll('[data-outcome]'), function (button) {
      button.addEventListener('click', function () {
        busy(true);
        message.hidden = false; message.className = 'message'; message.textContent = t.working;
        post('/demo', { outcome: button.getAttribute('data-outcome') })
          .then(function (r) { result(r.status); })
          .catch(function () { busy(false); show('error', t.error, 'failed', true); });
      });
    });
    return;
  }

  if (!data.needsPayment || !data.razorpay) return;
  var rzp = new Razorpay({
    key: data.razorpay.keyId,
    amount: data.amountCents,
    currency: 'INR',
    name: data.storeName,
    description: data.orderNumber,
    order_id: data.razorpay.orderId,
    prefill: data.razorpay.prefill,
    theme: { color: '#1B6B45' },
    // UPI only.
    config: { display: { blocks: { upi: { name: t.title, instruments: [{ method: 'upi' }] } }, sequence: ['block.upi'], preferences: { show_default_blocks: false } } },
    handler: function (response) {
      message.hidden = false; message.className = 'message'; message.textContent = t.working; actions.hidden = true;
      post('/razorpay/verify', response).then(function (r) { result(r.status); }).catch(function () { show('warn', t.pending, 'pending', false); });
    },
    modal: {
      ondismiss: function () {
        if (finalStatus === 'paid' || finalStatus === 'pending') return;
        post('/dismissed').catch(function () {}).then(function () { result('cancelled'); });
      }
    }
  });
  rzp.on('payment.failed', function (response) {
    var err = response && response.error ? response.error : {};
    post('/razorpay/failed', { reason: err.description || err.reason || 'Payment failed' }).catch(function () {});
  });
  document.getElementById('pay').addEventListener('click', function () { rzp.open(); });
  rzp.open();
})();
</script>
</body>
</html>`;
}
