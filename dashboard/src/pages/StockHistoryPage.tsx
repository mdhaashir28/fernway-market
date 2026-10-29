import { Link, useSearchParams } from 'react-router'
import { EmptyState, ErrorState, PageHeader, Pagination, Spinner } from '../components/ui'
import { useStore } from '../context/StoreContext'
import { api, queryString } from '../lib/api'
import type { Paginated, StockMovement } from '../lib/types'
import { useAsync } from '../lib/useAsync'

const REASONS: { value: string; label: string }[] = [
  { value: '', label: 'All reasons' },
  { value: 'order_placed', label: 'Order placed' },
  { value: 'order_cancelled', label: 'Order cancelled' },
  { value: 'payment_expired', label: 'Unpaid order released' },
  { value: 'substitution', label: 'Used as a substitute' },
  { value: 'item_unavailable', label: 'Not found on the shelf' },
  { value: 'delivery_received', label: 'Delivery received' },
  { value: 'damaged', label: 'Damaged / expired' },
  { value: 'stock_count', label: 'Stock count' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'new_product', label: 'New product' },
]

/** Every stock change, with who made it and why (recorded automatically by the database). */
export function StockHistoryPage() {
  const { dateTime } = useStore()
  const [params, setParams] = useSearchParams()
  const productId = params.get('productId') ?? ''
  const reason = params.get('reason') ?? ''
  const page = Number(params.get('page') ?? 1)
  const history = useAsync(
    () => api.get<Paginated<StockMovement>>(`/api/staff/stock-history${queryString({ productId, reason, page, pageSize: 50 })}`),
    [productId, reason, page],
  )

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }

  const productName = productId && history.data?.items[0]?.productName

  return (
    <>
      <PageHeader
        title={productName ? `Stock history: ${productName}` : 'Stock history'}
        subtitle="Every change to stock — orders, cancellations, deliveries, damaged items and stock counts — with who did it and why."
        actions={
          <label className="inline-field">
            <span>Reason</span>
            <select value={reason} onChange={(e) => update({ reason: e.target.value })}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        }
      />
      {productId && (
        <p>
          <button className="btn btn-link" onClick={() => update({ productId: '' })}>
            Show all products
          </button>
        </p>
      )}
      <section className="card">
        {history.error && !history.data ? (
          <ErrorState error={history.error} onRetry={history.reload} />
        ) : !history.data ? (
          <Spinner />
        ) : history.data.items.length === 0 ? (
          <EmptyState title="No stock changes found" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Product</th>
                    <th className="num">Change</th>
                    <th className="num">Stock after</th>
                    <th>Why</th>
                    <th>Who</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.items.map((m) => (
                    <tr key={m.id}>
                      <td className="small">{dateTime(m.createdAt)}</td>
                      <td>
                        <Link to={`/products/${m.productId}`}>{m.productName}</Link>
                        {m.sku && <div className="muted small">{m.sku}</div>}
                      </td>
                      <td className={`num strong ${m.change < 0 ? 'error-text' : ''}`}>
                        {m.change > 0 ? '+' : ''}
                        {m.change}
                      </td>
                      <td className="num">{m.quantityAfter}</td>
                      <td className="small">
                        {m.reasonLabel}
                        {m.orderNumber && (
                          <>
                            {' · '}
                            <Link to={`/orders/${m.orderId}`}>{m.orderNumber}</Link>
                          </>
                        )}
                        {m.note && <div className="muted">{m.note}</div>}
                      </td>
                      <td className="small">{m.userName ?? 'System'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={history.data.page} pageSize={history.data.pageSize} total={Number(history.data.total)} onPage={(p) => update({ page: String(p) })} />
          </>
        )}
      </section>
    </>
  )
}
