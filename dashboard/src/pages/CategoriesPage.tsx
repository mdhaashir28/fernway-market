import { ImageOff, LoaderCircle, Pencil, Plus, Trash, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { EmptyState, ErrorState, Field, ManagerOnly, Modal, PageHeader, PhotoCredit, ProductThumb, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ApiError, api } from '../lib/api'
import type { Category } from '../lib/types'
import { useAsync } from '../lib/useAsync'

export function CategoriesPage() {
  const { isManager } = useAuth()
  const categories = useAsync(() => api.get<{ items: Category[] }>('/api/staff/categories').then((r) => r.items), [])
  const [editing, setEditing] = useState<Category | 'new' | null>(null)

  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Categories group products in the customer app. Hiding a category hides all of its products."
        actions={
          isManager && (
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              <Plus size={16} aria-hidden /> New category
            </button>
          )
        }
      />
      {!isManager && <ManagerOnly>Only a manager can add or change categories and their photos.</ManagerOnly>}
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
                        <ProductThumb imageUrl={c.imageUrl} size={48} />
                        <div>
                          <div className="strong">{c.name}</div>
                          {c.nameTa && (
                            <div className="small" lang="ta">
                              {c.nameTa}
                            </div>
                          )}
                          <div className="muted small">{c.description}</div>
                          {!c.imageUrl && (
                            <span className="badge badge-muted badge-small">
                              <ImageOff size={12} aria-hidden /> Image needed
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="num">
                      <Link to={`/products?categoryId=${c.id}`}>{c.productCount}</Link>
                    </td>
                    <td className="num">{c.sortOrder}</td>
                    <td>{c.isActive ? <span className="badge stock-ok">Visible</span> : <span className="badge badge-muted">Hidden</span>}</td>
                    <td className="num">
                      {isManager && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}>
                          <Pencil size={14} aria-hidden /> Edit
                        </button>
                      )}
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
          onPhotoChanged={categories.reload}
        />
      )}
    </>
  )
}

function CategoryDialog({
  category,
  onClose,
  onSaved,
  onPhotoChanged,
}: {
  category: Category | null
  onClose: () => void
  onSaved: () => void
  onPhotoChanged: () => void
}) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const sourceRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(category?.name ?? '')
  const [nameTa, setNameTa] = useState(category?.nameTa ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [sortOrder, setSortOrder] = useState(category ? String(category.sortOrder) : '')
  const [isActive, setIsActive] = useState(category?.isActive ?? true)
  const [imageUrl, setImageUrl] = useState(category?.imageUrl ?? null)
  const [imageCredit, setImageCredit] = useState(category?.imageCredit ?? null)
  const [imageSource, setImageSource] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function save() {
    if (!name.trim()) return setErrors({ name: 'Name is required' })
    if (sortOrder && !/^\d+$/.test(sortOrder)) return setErrors({ sortOrder: 'Enter a whole number' })
    const body = {
      name: name.trim(),
      nameTa: nameTa.trim() || null,
      description: description.trim(),
      sortOrder: sortOrder ? Number(sortOrder) : undefined,
      isActive,
    }
    setSaving(true)
    try {
      if (category) await api.patch(`/api/staff/categories/${category.id}`, body)
      else await api.post('/api/staff/categories', body)
      toast(category ? 'Category saved' : 'Category created — open it again to add a photo')
      onSaved()
    } catch (err) {
      setErrors(err instanceof ApiError && Object.keys(err.fieldErrors).length ? err.fieldErrors : { form: (err as Error).message })
    } finally {
      setSaving(false)
    }
  }

  // We only show photos we may use, so staff say where each one is from before choosing it.
  function chooseFile() {
    if (!imageSource.trim()) {
      setErrors({ imageSource: 'Say where this photo is from before choosing it.' })
      sourceRef.current?.focus()
      return
    }
    inputRef.current?.click()
  }

  async function upload(file: File | undefined) {
    if (!file || !category) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return toast('Please choose a JPG, PNG or WebP image.', 'error')
    if (file.size > 8 * 1024 * 1024) return toast('Images must be 8 MB or smaller.', 'error')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('image', file)
      form.append('source', imageSource.trim())
      const result = await api.upload<{ category: Category }>(`/api/staff/categories/${category.id}/image`, form)
      setImageUrl(result.category.imageUrl)
      setImageCredit(result.category.imageCredit)
      setImageSource('')
      onPhotoChanged()
      toast('Photo updated')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function removePhoto() {
    if (!category) return
    setUploading(true)
    try {
      const result = await api.delete<{ category: Category }>(`/api/staff/categories/${category.id}/image`)
      setImageUrl(result.category.imageUrl)
      setImageCredit(result.category.imageCredit)
      onPhotoChanged()
      toast('Photo removed')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setUploading(false)
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
        <Field label="Tamil name" htmlFor="cat-name-ta" error={errors.nameTa} hint="Shown when the app is in Tamil">
          <input id="cat-name-ta" lang="ta" value={nameTa} maxLength={60} onChange={(e) => setNameTa(e.target.value)} />
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

      <h3 className="small strong" style={{ marginTop: 16 }}>
        Photo
      </h3>
      {category ? (
        <>
          <div className="product-cell" style={{ margin: '8px 0' }}>
            <ProductThumb imageUrl={imageUrl} size={96} />
            <div className="button-row">
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                id="cat-image"
                onChange={(e) => upload(e.target.files?.[0])}
              />
              <button type="button" className="btn btn-secondary btn-sm" onClick={chooseFile} disabled={uploading}>
                {uploading ? <LoaderCircle className="spin" size={14} aria-hidden /> : <Upload size={14} aria-hidden />}
                {imageUrl ? 'Replace photo' : 'Upload photo'}
              </button>
              {imageUrl && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={removePhoto} disabled={uploading}>
                  <Trash size={14} aria-hidden /> Remove
                </button>
              )}
            </div>
          </div>
          {imageUrl && <PhotoCredit credit={imageCredit} />}
          <Field
            label={imageUrl ? 'Where is the new photo from?' : 'Where is this photo from?'}
            htmlFor="cat-image-source"
            hint="For example “Taken in our shop, Oct 2026”."
            error={errors.imageSource}
          >
            <input
              ref={sourceRef}
              id="cat-image-source"
              value={imageSource}
              maxLength={200}
              onChange={(e) => {
                setImageSource(e.target.value)
                setErrors((current) => ({ ...current, imageSource: '' }))
              }}
            />
          </Field>
          <p className="hint">
            A real photo of the products in this category (for example your own shelf). Use only photos you're allowed to use — never
            copied from Google or shopping websites. Without a photo the app shows a clearly labelled “Image needed” tile.
          </p>
        </>
      ) : (
        <p className="hint">Save the category first, then open it again to add a photo.</p>
      )}
    </Modal>
  )
}
