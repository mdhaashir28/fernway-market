import { LoaderCircle, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState, ErrorState, Field, Modal, PageHeader, Spinner } from '../components/ui'
import { useToast } from '../context/ToastContext'
import { ApiError, api } from '../lib/api'
import type { Category } from '../lib/types'
import { useAsync } from '../lib/useAsync'

export function CategoriesPage() {
  const categories = useAsync(() => api.get<{ items: Category[] }>('/api/staff/categories').then((r) => r.items), [])
  const [editing, setEditing] = useState<Category | 'new' | null>(null)

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Categories group products in the customer app. Hiding a category hides all of its products."
        actions={
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus size={16} aria-hidden /> New category
          </button>
        }
      />
      <section className="card">
        {categories.error && !categories.data ? (
          <ErrorState error={categories.error} onRetry={categories.reload} />
        ) : !categories.data ? (
          <Spinner />
        ) : categories.data.length === 0 ? (
          <EmptyState title="No categories yet" message="Create your first category to start adding products." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="num">Products</th>
                  <th className="num">Order</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {categories.data.map((c) => (
                  <tr key={c.id} className={c.isActive ? '' : 'row-muted'}>
                    <td>
                      <div className="product-cell">
                        <span className="thumb" style={{ width: 40, height: 40, fontSize: 22 }} aria-hidden>
                          {c.icon}
                        </span>
                        <div>
                          <div className="strong">{c.name}</div>
                          <div className="muted small">{c.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num">
                      <Link to={`/products?categoryId=${c.id}`}>{c.productCount}</Link>
                    </td>
                    <td className="num">{c.sortOrder}</td>
                    <td>{c.isActive ? <span className="badge stock-ok">Visible</span> : <span className="badge badge-muted">Hidden</span>}</td>
                    <td className="num">
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                        <Pencil size={14} aria-hidden /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editing && (
        <CategoryDialog
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            categories.reload()
          }}
        />
      )}
    </>
  )
}

function CategoryDialog({ category, onClose, onSaved }: { category: Category | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [sortOrder, setSortOrder] = useState(category ? String(category.sortOrder) : '')
  const [isActive, setIsActive] = useState(category?.isActive ?? true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return setErrors({ name: 'Name is required' })
    if (sortOrder && !/^\d+$/.test(sortOrder)) return setErrors({ sortOrder: 'Enter a whole number' })
    const body = {
      name: name.trim(),
      icon: icon.trim() || null,
      description: description.trim(),
      sortOrder: sortOrder ? Number(sortOrder) : undefined,
      isActive,
    }
    setSaving(true)
    try {
      if (category) await api.patch(`/api/staff/categories/${category.id}`, body)
      else await api.post('/api/staff/categories', body)
      toast(category ? 'Category saved' : 'Category created')
      onSaved()
    } catch (err) {
      setErrors(err instanceof ApiError && Object.keys(err.fieldErrors).length ? err.fieldErrors : { form: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title={category ? `Edit ${category.name}` : 'New category'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving && <LoaderCircle className="spin" size={16} aria-hidden />} Save
          </button>
        </>
      }
    >
      {errors.form && (
        <div className="alert alert-error" role="alert">
          {errors.form}
        </div>
      )}
      <div className="field-row">
        <Field label="Name" htmlFor="cat-name" error={errors.name} required>
          <input id="cat-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Emoji icon" htmlFor="cat-icon" hint="e.g. 🥦" error={errors.icon}>
          <input id="cat-icon" value={icon} maxLength={16} onChange={(e) => setIcon(e.target.value)} className="emoji-input" />
        </Field>
      </div>
      <Field label="Description" htmlFor="cat-desc" error={errors.description}>
        <input id="cat-desc" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Display order" htmlFor="cat-order" hint="Lower numbers appear first in the app" error={errors.sortOrder}>
        <input id="cat-order" inputMode="numeric" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
      </Field>
      <label className="switch">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <span>
          <strong>Visible to customers</strong>
        </span>
      </label>
    </Modal>
  )
}
