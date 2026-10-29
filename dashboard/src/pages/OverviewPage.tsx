import { ImageOff, LifeBuoy, MessageCircleWarning, RefreshCw, Undo2 } from 'lucide-react'
import { Link } from 'react-router'
import { Alert, EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui'
import { OrdersTable } from './OrdersPage'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { api } from '../lib/api'
import type { OrderSummary, Paginated, Summary } from '../lib/types'
import { useAsync } from '../lib/useAsync'

export function OverviewPage() {
  const { user } = useAuth()
  const { money } = useStore()
  const summary = useAsync(() => api.get<Summary>('/api/staff/summary'), [], { refreshEveryMs: 30_000 })
  const openOrders = useAsync(() => api.get<Paginated<OrderSummary>>('/api/staff/orders?status=open&pageSize=8'), [], {
    refreshEveryMs: 30_000,
  })

  const s = summary.data
  const n = (value: number | string | undefined) => Number(value ?? 0)
  const tiles = s
    ? [
        { label: 'New orders', value: n(s.orders.confirmed), to: '/orders?status=confirmed', tone: 'amber', hint: 'Confirmed — start preparing' },
        { label: 'Preparing', value: n(s.orders.preparing), to: '/orders?status=preparing', tone: 'blue', hint: 'Being picked and packed' },
        { label: 'Ready for pickup', value: n(s.orders.readyForPickup), to: '/orders?status=ready_for_pickup', tone: 'violet', hint: 'Waiting for the customer' },
        { label: 'Out for delivery', value: n(s.orders.outForDelivery), to: '/orders?status=out_for_delivery', tone: 'teal', hint: 'On the road' },
        { label: 'Awaiting payment', value: n(s.orders.awaitingPayment), to: '/orders?status=awaiting_payment', tone: 'amber', hint: 'UPI not paid yet — do not pack' },
        { label: 'Orders today', value: n(s.orders.ordersToday), to: '/orders?status=', tone: 'green', hint: `${money(n(s.orders.salesTodayCents))} in sales` },
        { label: 'Low stock', value: n(s.stock.lowStock), to: '/low-stock', tone: n(s.stock.lowStock) ? 'red' : 'green', hint: `${n(s.stock.outOfStock)} out of stock` },
      ]
    : []

  const attention = s
    ? [
        { count: n(s.attention.openSupportRequests), label: 'customer help requests waiting for a reply', to: '/support', icon: LifeBuoy },
        { count: n(s.attention.failedRefunds), label: 'refunds failed — a manager needs to retry them', to: '/orders?status=cancelled', icon: Undo2 },
        { count: n(s.attention.failedWhatsApp), label: 'WhatsApp messages failed this week', to: '/messages', icon: MessageCircleWarning },
        { count: n(s.stock.missingPhoto), label: 'products need an image (customers see "Image needed")', to: '/products?missingPhoto=true', icon: ImageOff },
      ].filter((item) => item.count > 0)
    : []

  return (
    <>
      <PageHeader
        title={`Hello, ${user?.name.split(' ')[0] ?? 'there'}`}
        subtitle="Here's what's happening in the store right now. This page refreshes every 30 seconds."
        actions={
          <button
            className="btn btn-secondary"
            onClick={() => {
              summary.reload()
              openOrders.reload()
            }}
          >
            <RefreshCw size={16} aria-hidden className={summary.loading ? 'spin' : ''} /> Refresh
          </button>
        }
      />

      {s && s.paymentsMode === 'demo' && (
        <Alert kind="warning" title="UPI payments are in DEMO mode">
          Customers see a practice payment screen and no money moves. To try Razorpay's own checkout, add Razorpay TEST
          keys — see docs/INTEGRATIONS.md.
        </Alert>
      )}
      {s && s.paymentsMode === 'test' && (
        <Alert kind="warning" title="UPI payments use Razorpay TEST mode — no real money">
          Customers see Razorpay's test checkout (test UPI ID success@razorpay). Nothing is charged and no money reaches
          the store. Live payments stay off until they are switched on deliberately.
        </Alert>
      )}
      {s && s.paymentsMode === 'live' && (
        <Alert kind="error" title="UPI payments are LIVE — customers are charged real money">
          Razorpay live keys are in use. If this is a demo, remove them and set RAZORPAY_ALLOW_LIVE_PAYMENTS back to false.
        </Alert>
      )}
      {s && s.whatsappMode === 'demo' && (
        <Alert kind="info" title="WhatsApp updates are in DEMO mode">
          Messages are only recorded, not sent. You can read them under <Link to="/messages">WhatsApp log</Link>.
        </Alert>
      )}

      {summary.error && !s ? (
        <ErrorState error={summary.error} onRetry={summary.reload} />
      ) : !s ? (
        <Spinner />
      ) : (
        <div className="tiles">
          {tiles.map((tile) => (
            <Link key={tile.label} to={tile.to} className={`tile tone-${tile.tone}`}>
              <span className="tile-label">{tile.label}</span>
              <span className="tile-value">{tile.value}</span>
              <span className="tile-hint">{tile.hint}</span>
            </Link>
          ))}
        </div>
      )}

      {attention.length > 0 && (
        <section className="card">
          <h2>Needs attention</h2>
          <ul className="attention-list">
            {attention.map(({ count, label, to, icon: Icon }) => (
              <li key={label}>
                <Link to={to}>
                  <Icon size={18} aria-hidden />
                  <span>
                    <strong>{count}</strong> {label}
                  </span>
                  <span className="count" aria-hidden>
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="card-header">
          <h2>Orders that need attention</h2>
          <Link to="/orders" className="btn btn-link">
            View all orders →
          </Link>
        </div>
        {openOrders.error && !openOrders.data ? (
          <ErrorState error={openOrders.error} onRetry={openOrders.reload} />
        ) : !openOrders.data ? (
          <Spinner />
        ) : openOrders.data.items.length === 0 ? (
          <EmptyState title="All caught up" message="There are no open orders right now." />
        ) : (
          <OrdersTable orders={openOrders.data.items} />
        )}
      </section>
    </>
  )
}
