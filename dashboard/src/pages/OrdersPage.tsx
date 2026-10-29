import { RefreshCw, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { EmptyState, ErrorState, FulfillmentBadge, PageHeader, Pagination, PaymentBadge, Spinner, StatusBadge } from '../components/ui'
import { useStore } from '../context/StoreContext'
import { api, queryString } from '../lib/api'
import { STATUS_LABELS, timeAgo } from '../lib/format'
import type { OrderStatus, OrderSummary, Paginated } from '../lib/types'
import { useAsync, useDebounced } from '../lib/useAsync'

const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'open', label: 'Open' },
  ...(['confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'awaiting_payment', 'completed', 'cancelled'] as OrderStatus[]).map((s) => ({
    value: s,
    label: STATUS_LABELS[s],
  })),
  { value: '', label: 'All' },
]

export function OrdersPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'open'
  const type = params.get('type') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const page = Number(params.get('page') ?? 1)

  const [searchText, setSearchText] = useState(params.get('q') ?? '')
  const search = useDebounced(searchText.trim())

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) next.set(key, value)
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }

  // Keep the search box in the URL so the page can be bookmarked or refreshed.
  useEffect(() => {
    if ((params.get('q') ?? '') !== search) update({ q: search })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const orders = useAsync(
    () =>
      api.get<Paginated<OrderSummary>>(
        `/api/staff/orders${queryString({ status, fulfillmentType: type, search, from, to, page, pageSize: 25 })}`,
      ),
    [status, type, search, from, to, page],
    { refreshEveryMs: 30_000 },
  )

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="New orders appear automatically (every 30 seconds)."
        actions={
          <button className="btn btn-secondary" onClick={orders.reload}>
            <RefreshCw size={16} aria-hidden className={orders.loading ? 'spin' : ''} /> Refresh
          </button>
        }
      />

      <div className="tabs" role="tablist" aria-label="Order status">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value || 'all'}
            role="tab"
            aria-selected={status === tab.value}
            className={`tab ${status === tab.value ? 'active' : ''}`}
            onClick={() => update({ status: tab.value })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="toolbar card">
        <div className="search-input">
          <Search size={16} aria-hidden />
          <input
            type="search"
            placeholder="Order number, customer name or email"
            aria-label="Search orders"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <label className="inline-field">
          <span>Type</span>
          <select value={type} onChange={(e) => update({ type: e.target.value })}>
            <option value="">Delivery & pickup</option>
            <option value="delivery">Delivery only</option>
            <option value="pickup">Pickup only</option>
          </select>
        </label>
        <label className="inline-field">
          <span>From</span>
          <input type="date" value={from} onChange={(e) => update({ from: e.target.value })} />
        </label>
        <label className="inline-field">
          <span>To</span>
          <input type="date" value={to} onChange={(e) => update({ to: e.target.value })} />
        </label>
      </div>

      <section className="card">
        {orders.error && !orders.data ? (
          <ErrorState error={orders.error} onRetry={orders.reload} />
        ) : !orders.data ? (
          <Spinner />
        ) : orders.data.items.length === 0 ? (
          <EmptyState title="No orders found" message="Try a different status, date or search." />
        ) : (
          <>
            <OrdersTable orders={orders.data.items} />
            <Pagination
              page={orders.data.page}
              pageSize={orders.data.pageSize}
              total={orders.data.total}
              onPage={(p) => update({ page: String(p) })}
            />
          </>
        )}
      </section>
    </>
  )
}

/** The orders table (also used on the Overview page). Click a row to open the order. */
export function OrdersTable({ orders }: { orders: OrderSummary[] }) {
  const { money, dateTime, slot } = useStore()
  const navigate = useNavigate()

  return (
    <div className="table-wrap">
      <table className="table table-clickable">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Type</th>
            <th>Items</th>
            <th className="num">Total</th>
            <th>Payment</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)}>
              <td>
                <Link to={`/orders/${order.id}`} className="strong-link" onClick={(e) => e.stopPropagation()}>
                  {order.orderNumber}
                </Link>
                <div className="muted small" title={dateTime(order.createdAt)}>
                  {timeAgo(order.createdAt)}
                </div>
              </td>
              <td>
                <div>{order.customer?.name}</div>
                <div className="muted small">{order.customer?.email}</div>
              </td>
              <td>
                <FulfillmentBadge type={order.fulfillmentType} />
                <div className="muted small">
                  {order.fulfillmentType === 'pickup' && order.pickupStartsAt && order.pickupEndsAt
                    ? slot(order.pickupStartsAt, order.pickupEndsAt)
                    : order.deliveryPostcode}
                </div>
              </td>
              <td>
                <div>{order.itemCount} item{order.itemCount === 1 ? '' : 's'}</div>
                <div className="muted small truncate">{order.itemPreview}</div>
              </td>
              <td className="num">{money(order.totalCents)}</td>
              <td>
                <PaymentBadge status={order.paymentStatus} />
                <div className="muted small">{order.paymentMethod === 'upi' ? 'UPI' : order.paymentMethod === 'demo_card' ? 'Demo card' : 'On delivery / collection'}</div>
                {order.status === 'awaiting_payment' && order.paymentDueBy && (
                  <div className="muted small">Pay by {new Date(order.paymentDueBy).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                )}
              </td>
              <td>
                <StatusBadge status={order.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
