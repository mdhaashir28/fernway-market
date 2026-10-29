import {
  ArrowLeft,
  Ban,
  Clock,
  CreditCard,
  LoaderCircle,
  Mail,
  MapPin,
  MessageCircle,
  NotebookPen,
  PackageX,
  Phone,
  RefreshCw,
  Repeat,
  Store,
  User,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  Alert,
  DemoBadge,
  ErrorState,
  Field,
  FulfillmentBadge,
  ManagerOnly,
  Modal,
  PageHeader,
  PaymentBadge,
  ProductThumb,
  Spinner,
  StatusBadge,
} from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { useToast } from '../context/ToastContext'
import { api, queryString } from '../lib/api'
import { PAYMENT_METHOD_LABELS, STATUS_ACTIONS, STATUS_LABELS, SUPPORT_TOPIC_LABELS } from '../lib/format'
import type { OrderDetail, OrderItem, OrderStatus, Paginated, StaffProduct } from '../lib/types'
import { useAsync, useDebounced } from '../lib/useAsync'

const CANCEL_REASONS = [
  'Items out of stock',
  'Customer asked to cancel',
  'Could not deliver to the address',
  'Customer did not collect the order',
  'Payment problem',
]

const ATTEMPT_LABELS: Record<string, string> = {
  created: 'Started',
  pending: 'Pending',
  paid: 'Paid',
  failed: 'Failed',
  cancelled: 'Closed by customer',
  expired: 'Expired',
}

export function OrderDetailPage() {
  const { id } = useParams()
  const toast = useToast()
  const { isManager } = useAuth()
  const { money, dateTime, slot, store } = useStore()
  const order = useAsync(() => api.get<{ order: OrderDetail }>(`/api/staff/orders/${id}`).then((r) => r.order), [id], {
    refreshEveryMs: 30_000,
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [resolving, setResolving] = useState<OrderItem | null>(null)

  async function run(key: string, action: () => Promise<{ order: OrderDetail }>, success: (o: OrderDetail) => string) {
    setBusy(key)
    try {
      const result = await action()
      order.setData(result.order)
      toast(success(result.order))
    } catch (err) {
      toast((err as Error).message, 'error')
      order.reload()
    } finally {
      setBusy(null)
    }
  }

  if (order.error && !order.data) return <ErrorState error={order.error} onRetry={order.reload} />
  if (!order.data) return <Spinner />
  const o = order.data
  const isUpi = o.paymentMethod === 'upi'
  const changedItems = o.items.some((i) => i.fulfilmentStatus !== 'ordered')

  return (
    <>
      <Link to="/orders" className="back-link">
        <ArrowLeft size={16} aria-hidden /> All orders
      </Link>
      <PageHeader
        title={
          <span className="title-with-badges">
            Order {o.orderNumber} <StatusBadge status={o.status} /> <FulfillmentBadge type={o.fulfillmentType} />{' '}
            <PaymentBadge status={o.paymentStatus} />
            {isUpi && o.payment.mode === 'demo' && <DemoBadge label="DEMO payment" />}
            {isUpi && o.payment.mode === 'test' && <DemoBadge label="Razorpay TEST payment" />}
          </span>
        }
        subtitle={`Placed ${dateTime(o.createdAt)}`}
      />

      {o.status === 'awaiting_payment' && (
        <Alert kind="warning" title="Waiting for the customer to pay by UPI — don't pack this order yet">
          {o.payment.dueBy ? `If it isn't paid by ${dateTime(o.payment.dueBy)}, it is cancelled automatically and the stock is released.` : null}{' '}
          <button
            className="btn btn-secondary btn-sm"
            disabled={busy !== null}
            onClick={() =>
              run('refresh', () => api.post(`/api/staff/orders/${o.id}/payments/refresh`), (u) =>
                u.status === 'awaiting_payment' ? 'No payment yet' : `Payment received — order ${u.orderNumber} is confirmed`,
              )
            }
          >
            <RefreshCw size={14} aria-hidden className={busy === 'refresh' ? 'spin' : ''} /> Check with the payment gateway
          </button>
        </Alert>
      )}

      <ProgressSteps order={o} />

      {(o.allowedNextStatuses?.length || o.canCancel || o.cancelNeedsManager) && (
        <section className="card action-bar" aria-label="Order actions">
          <div>
            <strong>Next step</strong>
            <p className="muted small">
              {o.allowedNextStatuses?.length
                ? 'Update the status — the customer sees it in the app (and on WhatsApp if they asked for it).'
                : o.status === 'awaiting_payment'
                  ? 'This order is waiting for the customer to pay.'
                  : 'This order is waiting for the customer.'}
            </p>
          </div>
          <div className="action-buttons">
            {o.allowedNextStatuses?.map((next) => (
              <button
                key={next}
                className="btn btn-primary"
                disabled={busy !== null}
                onClick={() =>
                  run(next, () => api.patch(`/api/staff/orders/${id}/status`, { status: next }), (u) => `Order ${u.orderNumber} is now "${STATUS_LABELS[next]}"`)
                }
              >
                {busy === next && <LoaderCircle className="spin" size={16} aria-hidden />}
                {STATUS_ACTIONS[next]}
              </button>
            ))}
            {o.canCancel && (
              <button className="btn btn-danger-outline" disabled={busy !== null} onClick={() => setCancelOpen(true)}>
                <Ban size={16} aria-hidden /> Cancel order
              </button>
            )}
          </div>
          {o.cancelNeedsManager && <ManagerOnly>This order was paid online. Only a manager can cancel it (the money is refunded automatically).</ManagerOnly>}
        </section>
      )}

      {o.status === 'cancelled' && (
        <div className="alert alert-error">
          <strong>
            Cancelled
            {o.cancelledBy === 'customer' ? ' by the customer' : o.cancelledBy === 'manager' ? ' by a manager' : o.cancelledBy ? ' by staff' : ' automatically'}.
          </strong>{' '}
          Reason: {o.cancelReason}
          <br />
          <span className="small">
            Items were returned to stock automatically.
            {o.paidCents > 0 ? ' The online payment is refunded automatically — see Refunds.' : ''}
          </span>
        </div>
      )}

      <div className="detail-grid">
        <section className="card">
          <h2>Items</h2>
          {o.canResolveItems && (
            <p className="muted small">
              Can't find an item on the shelf? Use <strong>Can't find it</strong> to remove it or replace it. The customer's choice is shown under
              each item, and they never pay more than for what they ordered.
            </p>
          )}
          {changedItems && <Alert kind="info">Some items were changed. The total below is what the customer pays now.</Alert>}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Price</th>
                  <th className="num">Qty</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {o.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="product-cell">
                        <ProductThumb imageUrl={item.imageUrl} size={36} />
                        <div>
                          <div className={item.fulfilmentStatus === 'unavailable' ? 'struck' : ''}>{item.productName}</div>
                          <div className="muted small">{item.unitLabel}</div>
                          <SubstitutionLine item={item} money={money} />
                          {o.canResolveItems && item.fulfilmentStatus === 'ordered' && (
                            <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => setResolving(item)}>
                              <PackageX size={14} aria-hidden /> Can't find it
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="num">{money(item.unitPriceCents)}</td>
                    <td className="num">× {item.quantity}</td>
                    <td className="num">
                      {item.chargedCents !== item.lineTotalCents && <div className="struck small">{money(item.lineTotalCents)}</div>}
                      {money(item.chargedCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Subtotal</td>
                  <td className="num">{money(o.subtotalCents)}</td>
                </tr>
                {o.promotions.map((promo) => (
                  <tr key={promo.name}>
                    <td colSpan={3}>
                      Offer: {promo.name}
                      {promo.timesApplied > 1 ? ` × ${promo.timesApplied}` : ''}
                    </td>
                    <td className="num">− {money(promo.discountCents)}</td>
                  </tr>
                ))}
                {o.loyaltyDiscountCents > 0 && (
                  <tr>
                    <td colSpan={3}>Loyalty points ({o.loyaltyPointsRedeemed})</td>
                    <td className="num">− {money(o.loyaltyDiscountCents)}</td>
                  </tr>
                )}
                {o.fulfillmentType === 'delivery' && (
                  <tr>
                    <td colSpan={3}>Delivery fee</td>
                    <td className="num">{o.deliveryFeeCents ? money(o.deliveryFeeCents) : 'Free'}</td>
                  </tr>
                )}
                <tr className="total-row">
                  <td colSpan={3}>Total</td>
                  <td className="num">{money(o.totalCents)}</td>
                </tr>
                {o.refundedCents > 0 && (
                  <tr>
                    <td colSpan={3}>Refunded</td>
                    <td className="num">− {money(o.refundedCents)}</td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
          {o.notes && (
            <div className="note">
              <strong>Customer note:</strong> {o.notes}
            </div>
          )}
        </section>

        <div className="side-stack">
          <section className="card">
            <h2>Customer</h2>
            <ul className="info-list">
              <li>
                <User size={16} aria-hidden /> {o.customer?.name}
              </li>
              <li>
                <Mail size={16} aria-hidden /> <a href={`mailto:${o.customer?.email}`}>{o.customer?.email}</a>
              </li>
              {o.customer?.phone && (
                <li>
                  <Phone size={16} aria-hidden /> <a href={`tel:${o.customer.phone}`}>{o.customer.phone}</a>
                </li>
              )}
              <li className="muted small">
                <MessageCircle size={16} aria-hidden /> WhatsApp updates: {o.whatsappUpdates ? 'yes' : 'no'}
              </li>
            </ul>
          </section>

          <section className="card">
            <h2>{o.fulfillmentType === 'delivery' ? 'Delivery' : 'Store pickup'}</h2>
            {o.delivery && (
              <ul className="info-list">
                <li>
                  <MapPin size={16} aria-hidden />
                  <span>
                    {o.delivery.recipientName}
                    <br />
                    {o.delivery.line1}
                    {o.delivery.line2 && (
                      <>
                        <br />
                        {o.delivery.line2}
                      </>
                    )}
                    <br />
                    {o.delivery.city} {o.delivery.postcode}
                  </span>
                </li>
                <li>
                  <Phone size={16} aria-hidden /> <a href={`tel:${o.delivery.phone}`}>{o.delivery.phone}</a>
                </li>
                <li className="muted small">Zone: {o.delivery.zoneName}</li>
                {o.delivery.instructions && (
                  <li className="note">
                    <NotebookPen size={14} aria-hidden /> {o.delivery.instructions}
                  </li>
                )}
              </ul>
            )}
            {o.pickup && (
              <ul className="info-list">
                <li>
                  <Clock size={16} aria-hidden /> <strong>{slot(o.pickup.startsAt, o.pickup.endsAt)}</strong>
                </li>
                <li>
                  <Store size={16} aria-hidden /> {store.address}
                </li>
              </ul>
            )}
          </section>

          <section className="card">
            <h2>Payment</h2>
            <ul className="info-list">
              <li>
                <CreditCard size={16} aria-hidden /> {PAYMENT_METHOD_LABELS[o.paymentMethod] ?? o.paymentMethod}
              </li>
              <li>
                <PaymentBadge status={o.paymentStatus} />
                {isUpi && o.payment.mode === 'demo' && <DemoBadge />}
                {isUpi && o.payment.mode === 'test' && <DemoBadge label="TEST MODE" />}
              </li>
              {o.paidCents > 0 && <li className="small">Received {money(o.paidCents)}{o.payment.paidAt ? ` on ${dateTime(o.payment.paidAt)}` : ''}</li>}
              {isUpi && o.payment.mode === 'demo' && <li className="muted small">Demo payment — no real money moved.</li>}
              {isUpi && o.payment.mode === 'test' && <li className="muted small">Razorpay test mode — no real money moved.</li>}
              {o.paymentMethod === 'pay_on_fulfillment' && o.paymentStatus === 'unpaid' && o.status !== 'cancelled' && (
                <li className="muted small">Collect {money(o.totalCents)} when handing over the order.</li>
              )}
            </ul>
            {isUpi && (o.payment.attempts?.length ?? 0) > 0 && (
              <>
                <h3 className="small strong" style={{ marginTop: 12 }}>
                  Payment attempts
                </h3>
                <ul className="event-list">
                  {o.payment.attempts!.map((attempt) => (
                    <li key={attempt.id}>
                      <span className="small">
                        <strong>{ATTEMPT_LABELS[attempt.status] ?? attempt.status}</strong> · {money(attempt.amountCents)} ·{' '}
                        {attempt.provider === 'demo' ? 'DEMO' : attempt.testMode ? 'Razorpay TEST' : 'Razorpay'}
                      </span>
                      <span className="muted small">{dateTime(attempt.createdAt)}</span>
                      {attempt.providerPaymentId && <span className="muted small">Ref: {attempt.providerPaymentId}</span>}
                      {attempt.failureReason && <span className="small">{attempt.failureReason}</span>}
                    </li>
                  ))}
                </ul>
                {o.status !== 'awaiting_payment' && (
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: 10 }}
                    disabled={busy !== null}
                    onClick={() => run('refresh', () => api.post(`/api/staff/orders/${o.id}/payments/refresh`), () => 'Payment status checked')}
                  >
                    <RefreshCw size={14} aria-hidden className={busy === 'refresh' ? 'spin' : ''} /> Check with the payment gateway
                  </button>
                )}
              </>
            )}
          </section>

          {o.refunds.length > 0 && (
            <section className="card">
              <h2>Refunds</h2>
              <ul className="event-list">
                {o.refunds.map((refund) => (
                  <li key={refund.id}>
                    <span>
                      <strong>{money(refund.amountCents)}</strong>{' '}
                      <span className={`badge ${refund.status === 'processed' ? 'pay-paid' : refund.status === 'failed' ? 'pay-failed' : 'pay-pending'}`}>
                        {refund.status === 'processed' ? 'Refunded' : refund.status === 'failed' ? 'Failed' : 'In progress'}
                      </span>
                    </span>
                    <span className="small">{refund.reason}</span>
                    <span className="muted small">
                      Started {dateTime(refund.createdAt)}
                      {refund.processedAt ? ` · completed ${dateTime(refund.processedAt)}` : ''}
                    </span>
                    {refund.failureReason && <span className="small error-text">{refund.failureReason}</span>}
                    {refund.status === 'failed' &&
                      (isManager ? (
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={busy !== null}
                          onClick={() => run(`refund-${refund.id}`, () => api.post(`/api/staff/orders/${o.id}/refunds/${refund.id}/retry`), () => 'Refund sent again')}
                        >
                          <Repeat size={14} aria-hidden /> Retry refund
                        </button>
                      ) : (
                        <ManagerOnly>Ask a manager to retry this refund.</ManagerOnly>
                      ))}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {o.supportRequests.length > 0 && (
            <section className="card">
              <h2>Problems reported by the customer</h2>
              {o.supportRequests.map((request) => (
                <div key={request.id} className="request-card">
                  <div className="request-meta">
                    <strong>{SUPPORT_TOPIC_LABELS[request.topic]}</strong>
                    <span className={`badge ${request.status === 'resolved' ? 'stock-ok' : 'stock-low'}`}>{request.status === 'resolved' ? 'Resolved' : 'Open'}</span>
                  </div>
                  <span className="small">{request.message}</span>
                  {request.staffReply && <div className="reply-box small">Reply: {request.staffReply}</div>}
                </div>
              ))}
              <Link to="/support" className="btn btn-link">
                Reply in Customer help →
              </Link>
            </section>
          )}

          <ActivityCard order={o} onUpdated={(u) => order.setData(u)} />
        </div>
      </div>

      <CancelDialog
        open={cancelOpen}
        order={o}
        onClose={() => setCancelOpen(false)}
        onCancelled={(updated) => {
          order.setData(updated)
          setCancelOpen(false)
          toast(`Order ${updated.orderNumber} was cancelled`)
        }}
      />
      {resolving && (
        <ResolveDialog
          order={o}
          item={resolving}
          onClose={() => setResolving(null)}
          onResolved={(updated) => {
            order.setData(updated)
            setResolving(null)
            toast('Item updated — the customer has been told')
          }}
        />
      )}
    </>
  )
}

function SubstitutionLine({ item, money }: { item: OrderItem; money: (cents: number) => string }) {
  if (item.fulfilmentStatus === 'unavailable') return <div className="sub-line sub-unavailable">Not available — removed, not charged</div>
  if (item.fulfilmentStatus === 'substituted') {
    return (
      <div className="sub-line sub-substituted">
        Replaced with {item.substituteQuantity} × {item.substituteName} ({item.substituteUnitLabel}) · customer pays {money(item.chargedCents)}
      </div>
    )
  }
  return (
    <div className="sub-line sub-wish">
      If unavailable:{' '}
      {item.substitutionPreference === 'none'
        ? "don't replace"
        : item.substitutionPreference === 'similar'
          ? 'replace with a similar item'
          : `replace with ${item.preferredSubstituteName ?? 'the chosen product'}`}
    </div>
  )
}

function ProgressSteps({ order }: { order: OrderDetail }) {
  const middle: OrderStatus = order.fulfillmentType === 'pickup' ? 'ready_for_pickup' : 'out_for_delivery'
  const steps: OrderStatus[] = ['confirmed', 'preparing', middle, 'completed']
  const reached = new Set(order.history.map((h) => h.status))
  if (order.status === 'cancelled' || order.status === 'awaiting_payment') return null
  return (
    <ol className="progress" aria-label="Order progress">
      {steps.map((step) => (
        <li key={step} className={reached.has(step) || (step === 'confirmed' && reached.size > 0) ? 'done' : ''} aria-current={order.status === step ? 'step' : undefined}>
          <span className="dot" aria-hidden />
          {STATUS_LABELS[step]}
        </li>
      ))}
    </ol>
  )
}

/** Everything that happened to the order (the audit trail), plus private staff notes. */
function ActivityCard({ order, onUpdated }: { order: OrderDetail; onUpdated: (o: OrderDetail) => void }) {
  const { dateTime } = useStore()
  const toast = useToast()
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function addNote() {
    if (!note.trim()) return
    setSaving(true)
    try {
      const result = await api.post<{ order: OrderDetail }>(`/api/staff/orders/${order.id}/notes`, { note: note.trim() })
      onUpdated(result.order)
      setNote('')
      toast('Note added')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const who = (role: string | null, name: string | null) =>
    role === 'customer' ? 'Customer' : role === 'gateway' ? 'Payment gateway' : role === 'system' || !role ? 'System' : name ?? (role === 'manager' ? 'Manager' : 'Staff')

  return (
    <section className="card">
      <h2>Activity</h2>
      <ol className="event-list">
        {[...order.events].reverse().map((event) => (
          <li key={event.id} className={`event-${event.actorRole ?? 'system'}`}>
            <span className="small">{event.message}</span>
            <span className="muted small">
              {who(event.actorRole, event.actorName)} · {dateTime(event.createdAt)}
              {event.type === 'staff_note' ? ' · staff only' : ''}
            </span>
          </li>
        ))}
      </ol>
      <Field label="Add a note for other staff" htmlFor="staff-note" hint="Only staff see notes. Customers don't.">
        <textarea id="staff-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <button className="btn btn-secondary btn-sm" onClick={addNote} disabled={saving || !note.trim()}>
        {saving ? <LoaderCircle className="spin" size={14} aria-hidden /> : <NotebookPen size={14} aria-hidden />} Add note
      </button>
    </section>
  )
}

function ResolveDialog({
  order,
  item,
  onClose,
  onResolved,
}: {
  order: OrderDetail
  item: OrderItem
  onClose: () => void
  onResolved: (order: OrderDetail) => void
}) {
  const { money } = useStore()
  const [mode, setMode] = useState<'unavailable' | 'substitute'>(item.substitutionPreference === 'none' ? 'unavailable' : 'substitute')
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search.trim())
  const [chosen, setChosen] = useState<{ id: number; name: string; priceCents: number; unitLabel: string } | null>(null)
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [setStockToZero, setSetStockToZero] = useState(true)
  const [customerAgreed, setCustomerAgreed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const results = useAsync(
    () =>
      mode === 'substitute'
        ? api
            .get<Paginated<StaffProduct>>(`/api/staff/products${queryString({ search: debounced, status: 'active', pageSize: 12 })}`)
            .then((r) => r.items.filter((p) => p.id !== item.productId && p.stockQuantity > 0))
        : Promise.resolve([] as StaffProduct[]),
    [mode, debounced],
  )

  // Start with the customer's chosen replacement, if they picked one.
  useEffect(() => {
    if (item.substitutionPreference === 'specific' && item.preferredSubstituteId && item.preferredSubstituteName && !chosen) {
      api
        .get<{ product: StaffProduct }>(`/api/staff/products/${item.preferredSubstituteId}`)
        .then(({ product }) => setChosen({ id: product.id, name: product.name, priceCents: product.priceCents, unitLabel: product.unitLabel }))
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const againstWishes =
    mode === 'substitute' &&
    (item.substitutionPreference === 'none' || (item.substitutionPreference === 'specific' && chosen !== null && chosen.id !== item.preferredSubstituteId))
  const qty = Number(quantity)
  const charged = chosen && qty > 0 ? Math.min(chosen.priceCents * qty, item.lineTotalCents) : null

  async function submit() {
    setError(null)
    if (mode === 'substitute') {
      if (!chosen) return setError('Choose the replacement product.')
      if (!Number.isInteger(qty) || qty < 1 || qty > 50) return setError('Enter a quantity between 1 and 50.')
      if (againstWishes && !customerAgreed) return setError('Phone the customer first and tick "Customer agreed".')
    }
    setSaving(true)
    try {
      const body =
        mode === 'unavailable'
          ? { type: 'unavailable', setStockToZero }
          : { type: 'substitute', productId: chosen!.id, quantity: qty, setStockToZero, customerAgreed: againstWishes ? customerAgreed : undefined }
      const result = await api.post<{ order: OrderDetail }>(`/api/staff/orders/${order.id}/items/${item.id}/resolve`, body)
      onResolved(result.order)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title={`Can't find: ${item.quantity} × ${item.productName}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Back
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving && <LoaderCircle className="spin" size={16} aria-hidden />} {mode === 'unavailable' ? 'Remove item' : 'Use this replacement'}
          </button>
        </>
      }
    >
      <SubstitutionLine item={item} money={money} />
      {error && (
        <div className="alert alert-error" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
      <fieldset className="radio-list">
        <legend>What should happen?</legend>
        <label>
          <input type="radio" name="resolve" checked={mode === 'unavailable'} onChange={() => setMode('unavailable')} /> Remove it — the customer isn't
          charged for it
        </label>
        <label>
          <input type="radio" name="resolve" checked={mode === 'substitute'} onChange={() => setMode('substitute')} /> Replace it with another
          product
        </label>
      </fieldset>

      {mode === 'substitute' && (
        <>
          {chosen && (
            <div className="alert alert-success small" role="status">
              Replacement: <strong>{chosen.name}</strong> ({chosen.unitLabel}, {money(chosen.priceCents)})
              {chosen.id === item.preferredSubstituteId ? " — the customer's choice" : ''}
            </div>
          )}
          <Field label="Find the replacement" htmlFor="sub-search">
            <input id="sub-search" type="search" placeholder="Search products in stock" value={search} onChange={(e) => setSearch(e.target.value)} />
          </Field>
          <div className="picker-results" role="list">
            {results.data?.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={chosen?.id === p.id}
                onClick={() => setChosen({ id: p.id, name: p.name, priceCents: p.priceCents, unitLabel: p.unitLabel })}
              >
                <ProductThumb imageUrl={p.imageUrl} size={32} />
                <span style={{ flex: 1 }}>
                  {p.name}
                  <span className="muted small">
                    {' '}
                    · {p.unitLabel} · {money(p.priceCents)} · {p.stockQuantity} in stock
                  </span>
                </span>
                {p.id === item.preferredSubstituteId && <span className="badge stock-ok">Customer's choice</span>}
              </button>
            ))}
            {results.data?.length === 0 && <p className="muted small">No matching products in stock.</p>}
          </div>
          <div className="field-row">
            <Field label="Quantity" htmlFor="sub-qty">
              <input id="sub-qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
            <div className="field">
              <span className="small strong">Customer pays</span>
              <span>{charged !== null ? money(charged) : '—'}</span>
              <span className="muted small">Never more than the {money(item.lineTotalCents)} they ordered.</span>
            </div>
          </div>
          {againstWishes && (
            <label className="switch">
              <input type="checkbox" checked={customerAgreed} onChange={(e) => setCustomerAgreed(e.target.checked)} />
              <span>
                <strong>Customer agreed</strong>
                <span className="muted small">
                  {item.substitutionPreference === 'none'
                    ? "The customer asked not to replace this item. Only replace it if you phoned them and they agreed."
                    : 'This is not the replacement the customer chose. Only use it if you phoned them and they agreed.'}
                </span>
              </span>
            </label>
          )}
        </>
      )}
      <label className="switch">
        <input type="checkbox" checked={setStockToZero} onChange={(e) => setSetStockToZero(e.target.checked)} />
        <span>
          <strong>The shelf is empty — set {item.productName} stock to 0</strong>
          <span className="muted small">Stops other customers ordering it. Recorded in the stock history.</span>
        </span>
      </label>
      {order.paidCents > 0 && <p className="muted small">This order was paid online — any difference is refunded to the customer automatically.</p>}
    </Modal>
  )
}

function CancelDialog({
  open,
  order,
  onClose,
  onCancelled,
}: {
  open: boolean
  order: OrderDetail
  onClose: () => void
  onCancelled: (order: OrderDetail) => void
}) {
  const { money } = useStore()
  const [choice, setChoice] = useState(CANCEL_REASONS[0])
  const [other, setOther] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit() {
    const reason = choice === 'other' ? other.trim() : choice
    if (reason.length < 3) {
      setError('Please describe the reason (at least 3 characters).')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await api.post<{ order: OrderDetail }>(`/api/staff/orders/${order.id}/cancel`, { reason })
      onCancelled(result.order)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Cancel this order?"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Keep order
          </button>
          <button className="btn btn-danger" onClick={submit} disabled={saving}>
            {saving && <LoaderCircle className="spin" size={16} aria-hidden />} Cancel order
          </button>
        </>
      }
    >
      <p>The items will be put back into stock and the customer will see the reason in their app.</p>
      {order.paidCents > 0 && (
        <div className="alert alert-info">The customer paid {money(order.paidCents)} online. It will be refunded to them automatically.</div>
      )}
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <fieldset className="radio-list">
        <legend>Reason</legend>
        {CANCEL_REASONS.map((reason) => (
          <label key={reason}>
            <input type="radio" name="reason" checked={choice === reason} onChange={() => setChoice(reason)} /> {reason}
          </label>
        ))}
        <label>
          <input type="radio" name="reason" checked={choice === 'other'} onChange={() => setChoice('other')} /> Other reason
        </label>
      </fieldset>
      {choice === 'other' && (
        <Field label="Describe the reason" htmlFor="other-reason" required>
          <textarea id="other-reason" rows={3} maxLength={300} value={other} onChange={(e) => setOther(e.target.value)} />
        </Field>
      )}
    </Modal>
  )
}
