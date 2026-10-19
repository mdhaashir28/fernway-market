import { ArrowLeft, ImageOff, LoaderCircle, Save, Trash, Upload } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ErrorState, Field, PageHeader, ProductThumb, Spinner, StockBadge } from '../components/ui'
import { useStore } from '../context/StoreContext'
import { useToast } from '../context/ToastContext'
import { ApiError, api } from '../lib/api'
import { centsToInput, inputToCents } from '../lib/format'
import type { Category, StaffProduct } from '../lib/types'
import { useAsync } from '../lib/useAsync'

interface FormState {
  name: string
  brand: string
  categoryId: string
  price: string
  unitLabel: string
  sku: string
  description: string
  icon: string
  isActive: boolean
  stockQuantity: string
  lowStockThreshold: string
}

const EMPTY: FormState = {
  name: '',
  brand: '',
  categoryId: '',
  price: '',
  unitLabel: 'each',
  sku: '',
  description: '',
  icon: '',
  isActive: true,
  stockQuantity: '0',
  lowStockThreshold: '10',
}

const toForm = (p: StaffProduct): FormState => ({
  name: p.name,
  brand: p.brand ?? '',
  categoryId: String(p.categoryId),
  price: centsToInput(p.priceCents),
  unitLabel: p.unitLabel,
  sku: p.sku ?? '',
  description: p.description,
  icon: p.icon ?? '',
  isActive: p.isActive,
  stockQuantity: String(p.stockQuantity),
  lowStockThreshold: String(p.lowStockThreshold),
})

const isWholeNumber = (value: string) => /^\d+$/.test(value.trim())

export function ProductFormPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const toast = useToast()
  const { store } = useStore()

  const categories = useAsync(() => api.get<{ items: Category[] }>('/api/staff/categories').then((r) => r.items), [])
  const product = useAsync(
    () => (isNew ? Promise.resolve(null) : api.get<{ product: StaffProduct }>(`/api/staff/products/${id}`).then((r) => r.product)),
    [id],
  )

  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingImage, setPendingImage] = useState<File | null>(null)

  useEffect(() => {
    if (product.data) setForm(toForm(product.data))
  }, [product.data])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))

  function validate(): Record<string, string> {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Name is required'
    if (!form.categoryId) e.categoryId = 'Choose a category'
    const cents = inputToCents(form.price)
    if (cents === null || cents <= 0) e.priceCents = 'Enter a price such as 45 or 45.50'
    if (!form.unitLabel.trim()) e.unitLabel = 'Pack size is required, e.g. "1 kg" or "each"'
    if (isNew && !isWholeNumber(form.stockQuantity)) e.stockQuantity = 'Enter a whole number (0 or more)'
    if (!isWholeNumber(form.lowStockThreshold)) e.lowStockThreshold = 'Enter a whole number (0 or more)'
    return e
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const clientErrors = validate()
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length) return

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      categoryId: Number(form.categoryId),
      priceCents: inputToCents(form.price),
      unitLabel: form.unitLabel.trim(),
      sku: form.sku.trim() || null,
      description: form.description.trim(),
      icon: form.icon.trim() || null,
      isActive: form.isActive,
      lowStockThreshold: Number(form.lowStockThreshold),
    }
    // Stock for existing products is changed with "Adjust stock" (safer while customers are ordering).
    if (isNew) body.stockQuantity = Number(form.stockQuantity)

    setSaving(true)
    try {
      if (isNew) {
        const { product: created } = await api.post<{ product: StaffProduct }>('/api/staff/products', body)
        if (pendingImage) await uploadImage(created.id, pendingImage)
        toast(`"${created.name}" was added`)
        navigate(`/products/${created.id}`, { replace: true })
      } else {
        const { product: updated } = await api.patch<{ product: StaffProduct }>(`/api/staff/products/${id}`, body)
        product.setData(updated)
        toast('Changes saved')
      }
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors)
      setFormError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function uploadImage(productId: number, file: File) {
    const form = new FormData()
    form.append('image', file)
    const result = await api.upload<{ product: StaffProduct }>(`/api/staff/products/${productId}/image`, form)
    return result.product
  }

  if (product.error) return <ErrorState error={product.error} onRetry={product.reload} />
  if (!isNew && !product.data) return <Spinner />
  const current = product.data

  return (
    <>
      <Link to="/products" className="back-link">
        <ArrowLeft size={16} aria-hidden /> All products
      </Link>
      <PageHeader
        title={isNew ? 'New product' : current?.name}
        subtitle={isNew ? 'Fill in the details below. You can add a photo now or later.' : `Last updated ${new Date(current!.updatedAt).toLocaleString()}`}
      />

      <form className="form-grid" onSubmit={handleSubmit} noValidate>
        <section className="card form-main">
          <h2>Details</h2>
          {formError && (
            <div className="alert alert-error" role="alert">
              {formError}
            </div>
          )}
          <Field label="Name" htmlFor="name" error={errors.name} required>
            <input id="name" value={form.name} maxLength={120} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Brand" htmlFor="brand" error={errors.brand} hint='Optional, e.g. "Surf Excel", "Maggi" or "Store packed"'>
            <input id="brand" value={form.brand} maxLength={60} onChange={(e) => set('brand', e.target.value)} />
          </Field>
          <div className="field-row">
            <Field label="Category" htmlFor="category" error={errors.categoryId} required>
              <select id="category" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                <option value="">Choose…</option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                    {c.isActive ? '' : ' (hidden)'}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Price (${store.currency})`} htmlFor="price" error={errors.priceCents} required hint="e.g. 45 or 45.50">
              <input id="price" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} />
            </Field>
          </div>
          <div className="field-row">
            <Field label="Pack size" htmlFor="unit" error={errors.unitLabel} required hint='What one item is, e.g. "1 kg", "500 ml", "4 × 100 g", "each"'>
              <input id="unit" value={form.unitLabel} maxLength={40} onChange={(e) => set('unitLabel', e.target.value)} />
            </Field>
            <Field label="SKU / barcode" htmlFor="sku" error={errors.sku} hint="Optional, must be unique">
              <input id="sku" value={form.sku} maxLength={40} onChange={(e) => set('sku', e.target.value)} />
            </Field>
          </div>
          <Field label="Description" htmlFor="description" error={errors.description}>
            <textarea
              id="description"
              rows={4}
              maxLength={2000}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </Field>
          <div className="field-row">
            {isNew && (
              <Field label="Starting stock" htmlFor="stock" error={errors.stockQuantity} hint="How many you have now">
                <input id="stock" inputMode="numeric" value={form.stockQuantity} onChange={(e) => set('stockQuantity', e.target.value)} />
              </Field>
            )}
            <Field
              label="Low-stock alert at"
              htmlFor="threshold"
              error={errors.lowStockThreshold}
              hint="Show a warning when stock falls to this number"
            >
              <input
                id="threshold"
                inputMode="numeric"
                value={form.lowStockThreshold}
                onChange={(e) => set('lowStockThreshold', e.target.value)}
              />
            </Field>
          </div>
          <label className="switch">
            <input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            <span>
              <strong>Visible to customers</strong>
              <span className="muted small">Untick to deactivate: the product is hidden from the app but kept for past orders.</span>
            </span>
          </label>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? <LoaderCircle className="spin" size={16} aria-hidden /> : <Save size={16} aria-hidden />}
              {isNew ? 'Add product' : 'Save changes'}
            </button>
            <Link to="/products" className="btn btn-secondary">
              Cancel
            </Link>
          </div>
        </section>

        <div className="side-stack">
          <ImageCard
            product={current ?? null}
            icon={form.icon}
            onIconChange={(value) => set('icon', value)}
            pendingImage={pendingImage}
            onPendingImage={setPendingImage}
            onUploaded={(updated) => product.setData(updated)}
            upload={uploadImage}
          />
          {current && <StockCard product={current} onUpdated={(updated) => product.setData(updated)} />}
        </div>
      </form>
    </>
  )
}

function ImageCard({
  product,
  icon,
  onIconChange,
  pendingImage,
  onPendingImage,
  onUploaded,
  upload,
}: {
  product: StaffProduct | null
  icon: string
  onIconChange: (value: string) => void
  pendingImage: File | null
  onPendingImage: (file: File | null) => void
  onUploaded: (product: StaffProduct) => void
  upload: (productId: number, file: File) => Promise<StaffProduct>
}) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingImage) return setPreviewUrl(null)
    const url = URL.createObjectURL(pendingImage)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingImage])

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast('Please choose a JPG, PNG or WebP image.', 'error')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('Images must be 5 MB or smaller.', 'error')
      return
    }
    if (!product) {
      onPendingImage(file) // uploaded after the product is created
      return
    }
    setBusy(true)
    try {
      onUploaded(await upload(product.id, file))
      toast('Photo updated')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function removeImage() {
    if (!product) return onPendingImage(null)
    setBusy(true)
    try {
      const result = await api.delete<{ product: StaffProduct }>(`/api/staff/products/${product.id}/image`)
      onUploaded(result.product)
      toast('Photo removed')
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const hasImage = Boolean(previewUrl || product?.imageUrl)

  return (
    <section className="card">
      <h2>Photo</h2>
      <div className="image-preview">
        {previewUrl ? (
          <img src={previewUrl} alt="Selected product" />
        ) : (
          <ProductThumb imageUrl={product?.imageUrl ?? null} icon={icon || product?.categoryIcon || '🛒'} size={160} />
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        id="image-input"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className="button-row">
        <button type="button" className="btn btn-secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={16} aria-hidden /> : <Upload size={16} aria-hidden />}
          {hasImage ? 'Replace photo' : 'Upload photo'}
        </button>
        {hasImage && (
          <button type="button" className="btn btn-ghost" onClick={removeImage} disabled={busy}>
            {product?.imageUrl ? <Trash size={16} aria-hidden /> : <ImageOff size={16} aria-hidden />} Remove
          </button>
        )}
      </div>
      {!hasImage && (
        <p className="alert alert-info" role="note">
          No photo yet — customers see a “Photo coming soon” placeholder. Use a photo you're allowed to use, such as one
          you take of the pack on your shelf.
        </p>
      )}
      <p className="hint">JPG, PNG or WebP up to 5 MB. Square photos look best.</p>
      <Field label="Emoji icon (used when there is no photo)" htmlFor="icon" hint="Optional, e.g. 🍎">
        <input id="icon" value={icon} maxLength={16} onChange={(e) => onIconChange(e.target.value)} className="emoji-input" />
      </Field>
    </section>
  )
}

function StockCard({ product, onUpdated }: { product: StaffProduct; onUpdated: (p: StaffProduct) => void }) {
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  async function adjust(mode: 'add' | 'remove' | 'set') {
    const value = Number(amount)
    if (!isWholeNumber(amount) || (mode !== 'set' && value === 0)) {
      toast('Enter a whole number first.', 'error')
      return
    }
    const body = mode === 'set' ? { quantity: value } : { adjustBy: mode === 'add' ? value : -value }
    setBusy(true)
    try {
      const result = await api.post<{ product: StaffProduct }>(`/api/staff/products/${product.id}/stock`, body)
      onUpdated(result.product)
      setAmount('')
      toast(`Stock is now ${result.product.stockQuantity}`)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>Stock</h2>
      <p className="stock-now">
        <span className="stock-number">{product.stockQuantity}</span>
        <StockBadge status={product.stockStatus} quantity={product.stockQuantity} />
      </p>
      <Field label="Quantity" htmlFor="stock-amount" hint="Add a delivery, remove damaged items, or set the exact count after a stock check.">
        <input id="stock-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 24" />
      </Field>
      <div className="button-row">
        <button type="button" className="btn btn-primary btn-sm" onClick={() => adjust('add')} disabled={busy}>
          + Add
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => adjust('remove')} disabled={busy}>
          − Remove
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => adjust('set')} disabled={busy}>
          Set exact count
        </button>
      </div>
    </section>
  )
}
