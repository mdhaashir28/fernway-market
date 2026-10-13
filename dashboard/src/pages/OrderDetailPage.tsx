import { ArrowLeft, Ban, Clock, CreditCard, LoaderCircle, Mail, MapPin, Phone, Store, User } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { ErrorState, Field, FulfillmentBadge, Modal, PageHeader, ProductThumb, Spinner, StatusBadge } from '../components/ui'
import { useStore } from '../context/StoreContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, STATUS_ACTIONS, STATUS_LABELS } from '../lib/format'
import type { OrderDetail, OrderStatus } from '../lib/types'
import { useAsync } from '../lib/useAsync'

const CANCEL_REASONS = [
  'Items out of stock',
  'Customer asked to cancel',
  'Could not deliver to the address',
  'Customer did not collect the order',
  'Payment problem',
]

export function OrderDetailPage() {
  const { id } = useParams()
  const toast = useToast()
  const { money, dateTime, slot, store } = useStore()
  const order = useAsync(() => api.get<{ order: OrderDetail }>(`/api/staff/orders/${id}`).then((r) => r.order), [id], {
    refreshEveryMs: 30_000,
  })
  const [busy, setBusy] = useState<OrderStatus | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)

  async function changeStatus(status: OrderStatus) {
    setBusy(status)
    try {
      const result = await api.patch<{ order: OrderDetail }>(`/api/staff/orders/${id}/status`, { status })
      order.setData(result.order)
      toast(`Order ${result.order.orderNumber} is now "${STATUS_LABELS[status]}"`)
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

  return (
    <>
      <Link to="/orders" className="back-link">
        <ArrowLeft size={16} aria-hidden /> All orders
      </Link>
      <PageHeader
        title={
          <span className="title-with-badges">
            Order {o.orderNumber} <StatusBadge status={o.status} /> <FulfillmentBadge type={o.fulfillmentType} />
          </span>
        }
        subtitle={`Placed ${dateTime(o.createdAt)}`}
      />

      <ProgressSteps order={o} />

      {(o.allowedNextStatuses?.length || o.canCancel) && (
        <section className="card action-bar" aria-label="Order actions">
          <div>
            <strong>Next step</strong>
            <p className="muted small">
              {o.allowedNextStatuses?.length
                ? 'Update the status so the customer can see the progress in their app.'
                : 'This order is waiting for the customer.'}
            </p>
          </div>
          <div className="action-buttons">
            {o.allowedNextStatuses?.map((next) => (
              <button key={next} className="btn btn-primary" disabled={busy !== null} onClick={() => changeStatus(next)}>
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
        </section>
      )}

      {o.status === 'cancelled' && (
        <div className="alert alert-error">
          <strong>Cancelled{o.cancelledBy === 'customer' ? ' by the customer' : ' by staff'}.</strong> Reason: {o.cancelReason}
          <br />
          <span className="small">Items were returned to stock automatically.</span>
        </div>
      )}

      <div className="detail-grid">
        <section className="card">
          <h2>Items</h2>
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
                        <ProductThumb imageUrl={item.imageUrl} icon={item.icon} size={36} />
                        <div>
                          <div>{item.productName}</div>
                          <div className="muted small">{item.unitLabel}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num">{money(item.unitPriceCents)}</td>
                    <td className="num">× {item.quantity}</td>
                    <td className="num">{money(item.lineTotalCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Subtotal</td>
                  <td className="num">{money(o.subtotalCents)}</td>
                </tr>
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
                {o.delivery.instructions && <li className="note">📝 {o.delivery.instructions}</li>}
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
                <CreditCard size={16} aria-hidden /> {PAYMENT_METHOD_LABELS[o.paymentMethod]}
              </li>
              <li>
                <span className={`badge pay-${o.paymentStatus}`}>{PAYMENT_STATUS_LABELS[o.paymentStatus]}</span>
              </li>
              {o.paymentMethod === 'demo_card' && (
                <li className="muted small">Demo only — no real money was taken.</li>
              )}
              {o.paymentMethod === 'pay_on_fulfillment' && o.paymentStatus === 'unpaid' && (
                <li className="muted small">Collect {money(o.totalCents)} when handing over the order.</li>
              )}
            </ul>
          </section>

          <section className="card">
            <h2>Timeline</h2>
            <ol className="timeline">
              {o.history.map((event, index) => (
                <li key={index}>
                  <StatusBadge status={event.status} />
                  <span className="muted small">{dateTime(event.createdAt)}</span>
                  {event.note && <span className="small">{event.note}</span>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <CancelDialog
        open={cancelOpen}
        orderId={o.id}
        onClose={() => setCancelOpen(false)}
        onCancelled={(updated) => {
          order.setData(updated)
          setCancelOpen(false)
          toast(`Order ${updated.orderNumber} was cancelled`)
        }}
      />
    </>
  )
}

function ProgressSteps({ order }: { order: OrderDetail }) {
  const middle: OrderStatus = order.fulfillmentType === 'pickup' ? 'ready_for_pickup' : 'out_for_delivery'
  const steps: OrderStatus[] = ['pending', 'preparing', middle, 'completed']
  const reached = new Set(order.history.map((h) => h.status))
  if (order.status === 'cancelled') return null
  return (
    <ol className="progress" aria-label="Order progress">
      {steps.map((step) => (
        <li key={step} className={reached.has(step) ? 'done' : ''} aria-current={order.status === step ? 'step' : undefined}>
          <span className="dot" aria-hidden />
          {STATUS_LABELS[step]}
        </li>
      ))}
    </ol>
  )
}

function CancelDialog({
  open,
  orderId,
  onClose,
  onCancelled,
}: {
  open: boolean
  orderId: number
  onClose: () => void
  onCancelled: (order: OrderDetail) => void
}) {
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
      const result = await api.post<{ order: OrderDetail }>(`/api/staff/orders/${orderId}/cancel`, { reason })
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
