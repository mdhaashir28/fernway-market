import { RefreshCw } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui'
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
  const tiles = s
    ? [
        { label: 'Pending', value: s.orders.pending, to: '/orders?status=pending', tone: 'amber', hint: 'New orders to accept' },
        { label: 'Preparing', value: s.orders.preparing, to: '/orders?status=preparing', tone: 'blue', hint: 'Being picked and packed' },
        { label: 'Ready for pickup', value: s.orders.readyForPickup, to: '/orders?status=ready_for_pickup', tone: 'violet', hint: 'Waiting for the customer' },
        { label: 'Out for delivery', value: s.orders.outForDelivery, to: '/orders?status=out_for_delivery', tone: 'teal', hint: 'On the road' },
        { label: 'Orders today', value: s.orders.ordersToday, to: '/orders?status=', tone: 'green', hint: `${money(s.orders.salesTodayCents)} in sales` },
        { label: 'Low stock', value: s.stock.lowStock, to: '/low-stock', tone: s.stock.lowStock ? 'red' : 'green', hint: `${s.stock.outOfStock} out of stock` },
      ]
    : []

  return (
    <>
      <PageHeader
        title={`Hello, ${user?.name.split(' ')[0] ?? 'there'} 👋`}
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
          <EmptyState title="All caught up!" message="There are no open orders right now." />
        ) : (
          <OrdersTable orders={openOrders.data.items} />
        )}
      </section>
    </>
  )
}
