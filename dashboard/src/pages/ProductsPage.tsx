import { ImageOff, Pencil, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { EmptyState, ErrorState, PageHeader, Pagination, ProductThumb, Spinner, StockBadge } from '../components/ui'
import { useStore } from '../context/StoreContext'
import { api, queryString } from '../lib/api'
import type { Category, Paginated, StaffProduct } from '../lib/types'
import { useAsync, useDebounced } from '../lib/useAsync'

export function ProductsPage() {
  const { money } = useStore()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const categoryId = params.get('categoryId') ?? ''
  const status = params.get('status') ?? 'all'
  const lowStock = params.get('lowStock') === 'true'
  const missingPhoto = params.get('missingPhoto') === 'true'
  const page = Number(params.get('page') ?? 1)
  const [searchText, setSearchText] = useState(params.get('q') ?? '')
  const search = useDebounced(searchText.trim())

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) next.set(key, value)
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }

  useEffect(() => {
    if ((params.get('q') ?? '') !== search) update({ q: search })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const categories = useAsync(() => api.get<{ items: Category[] }>('/api/staff/categories').then((r) => r.items), [])
  const products = useAsync(
    () =>
      api.get<Paginated<StaffProduct>>(
        `/api/staff/products${queryString({ search, categoryId, status, lowStock, missingPhoto, page, pageSize: 50 })}`,
      ),
    [search, categoryId, status, lowStock, missingPhoto, page],
  )

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Add products, change prices and photos, and hide items you no longer sell."
        actions={
          <Link to="/products/new" className="btn btn-primary">
            <Plus size={16} aria-hidden /> New product
          </Link>
        }
      />

      <div className="toolbar card">
        <div className="search-input">
          <Search size={16} aria-hidden />
          <input
            type="search"
            placeholder="Search by name, brand, description or SKU"
            aria-label="Search products"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <label className="inline-field">
          <span>Category</span>
          <select value={categoryId} onChange={(e) => update({ categoryId: e.target.value })}>
            <option value="">All categories</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field">
          <span>Status</span>
          <select value={status} onChange={(e) => update({ status: e.target.value })}>
            <option value="all">Active & inactive</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={lowStock} onChange={(e) => update({ lowStock: String(e.target.checked) })} />
          Low stock only
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={missingPhoto} onChange={(e) => update({ missingPhoto: String(e.target.checked) })} />
          Missing photo only
        </label>
      </div>

      <section className="card">
        {products.error && !products.data ? (
          <ErrorState error={products.error} onRetry={products.reload} />
        ) : !products.data ? (
          <Spinner />
        ) : products.data.items.length === 0 ? (
          <EmptyState
            title="No products found"
            message="Try a different search or filter, or add a new product."
            action={
              <Link to="/products/new" className="btn btn-primary">
                <Plus size={16} aria-hidden /> New product
              </Link>
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table table-clickable">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th className="num">Price</th>
                    <th>Stock</th>
                    <th>Visible to customers</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {products.data.items.map((p) => (
                    <tr key={p.id} onClick={() => navigate(`/products/${p.id}`)} className={p.isActive ? '' : 'row-muted'}>
                      <td>
                        <div className="product-cell">
                          <ProductThumb imageUrl={p.imageUrl} icon={p.icon || p.categoryIcon} />
                          <div>
                            <div className="strong">{p.name}</div>
                            <div className="muted small">
                              {p.brand && `${p.brand} · `}
                              {p.unitLabel}
                              {p.sku && ` · ${p.sku}`}
                            </div>
                            {!p.imageUrl && (
                              <span className="badge badge-muted badge-small" title="Customers see a “Photo coming soon” placeholder">
                                <ImageOff size={12} aria-hidden /> No photo
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{p.categoryName}</td>
                      <td className="num">{money(p.priceCents)}</td>
                      <td>
                        <StockBadge status={p.stockStatus} quantity={p.stockQuantity} />
                      </td>
                      <td>
                        {p.isActive && p.categoryIsActive ? (
                          <span className="badge stock-ok">Active</span>
                        ) : (
                          <span className="badge badge-muted">{p.isActive ? 'Category hidden' : 'Inactive'}</span>
                        )}
                      </td>
                      <td className="num">
                        <Link
                          to={`/products/${p.id}`}
                          className="btn btn-secondary btn-sm"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Edit ${p.name}`}
                        >
                          <Pencil size={14} aria-hidden /> Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={products.data.page}
              pageSize={products.data.pageSize}
              total={products.data.total}
              onPage={(p) => update({ page: String(p) })}
            />
          </>
        )}
      </section>
    </>
  )
}
