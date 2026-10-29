import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState, ErrorState, PageHeader, ProductThumb, Spinner, StockBadge } from '../components/ui'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'
import type { Paginated, StaffProduct } from '../lib/types'
import { useAsync } from '../lib/useAsync'

export function LowStockPage() {
  const products = useAsync(
    () => api.get<Paginated<StaffProduct>>('/api/staff/products?lowStock=true&status=active&sort=stock_asc&pageSize=200'),
    [],
  )

  return (
    <>
      <PageHeader
        title="Low stock"
        subtitle="Active products at or below their low-stock alert level, emptiest first. Restock them right here."
      />
      <section className="card">
        {products.error && !products.data ? (
          <ErrorState error={products.error} onRetry={products.reload} />
        ) : !products.data ? (
          <Spinner />
        ) : products.data.items.length === 0 ? (
          <EmptyState title="Everything is well stocked" message="No active products are below their alert level." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Stock</th>
                  <th className="num">Alert at</th>
                  <th>Receive stock</th>
                </tr>
              </thead>
              <tbody>
                {products.data.items.map((p) => (
                  <RestockRow key={p.id} product={p} onRestocked={products.reload} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function RestockRow({ product, onRestocked }: { product: StaffProduct; onRestocked: () => void }) {
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  async function restock() {
    const value = Number(amount)
    if (!/^\d+$/.test(amount) || value <= 0) {
      toast('Enter how many items arrived.', 'error')
      return
    }
    setBusy(true)
    try {
      const result = await api.post<{ product: StaffProduct }>(`/api/staff/products/${product.id}/stock`, { adjustBy: value, reason: 'delivery_received' })
      toast(`${product.name}: stock is now ${result.product.stockQuantity}`)
      setAmount('')
      onRestocked()
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr>
      <td>
        <div className="product-cell">
          <ProductThumb imageUrl={product.imageUrl} />
          <div>
            <Link to={`/products/${product.id}`} className="strong-link">
              {product.name}
            </Link>
            <div className="muted small">
              {product.categoryName} · {product.unitLabel}
            </div>
          </div>
        </div>
      </td>
      <td>
        <StockBadge status={product.stockStatus} quantity={product.stockQuantity} />
      </td>
      <td className="num">{product.lowStockThreshold}</td>
      <td>
        <form
          className="restock-form"
          onSubmit={(e) => {
            e.preventDefault()
            restock()
          }}
        >
          <input
            inputMode="numeric"
            aria-label={`Quantity received for ${product.name}`}
            placeholder="Qty"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button className="btn btn-primary btn-sm" disabled={busy}>
            {busy && <LoaderCircle className="spin" size={14} aria-hidden />} Add stock
          </button>
        </form>
      </td>
    </tr>
  )
}
