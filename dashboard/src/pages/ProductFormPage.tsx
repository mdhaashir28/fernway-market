import { ArrowLeft, History, ImageOff, LoaderCircle, Save, Trash, Upload } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ErrorState, Field, ManagerOnly, PageHeader, PhotoCredit, ProductThumb, Spinner, StockBadge } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { useToast } from '../context/ToastContext'
import { ApiError, api } from '../lib/api'
import { centsToInput, inputToCents, MANUAL_STOCK_REASONS } from '../lib/format'
import type { Category, Paginated, StaffProduct, StockMovement } from '../lib/types'
import { useAsync } from '../lib/useAsync'

interface FormState {
  name: string
  nameTa: string
  brand: string
  categoryId: string
  price: string
  unitLabel: string
  sku: string
  description: string
  isActive: boolean
  stockQuantity: string
  lowStockThreshold: string
}

/** A photo chosen before the product exists, with where it came from. Uploaded once the product is saved. */
interface PendingImage {
  file: File
  source: string
}

const EMPTY: FormState = {
  name: '',
  nameTa: '',
  brand: '',
  categoryId: '',
  price: '',
  unitLabel: 'each',
  sku: '',
  description: '',
  isActive: true,
  stockQuantity: '0',
  lowStockThreshold: '10',
}

const toForm = (p: StaffProduct): FormState => ({
  name: p.name,
  nameTa: p.nameTa ?? '',
  brand: p.brand ?? '',
  categoryId: String(p.categoryId),
  price: centsToInput(p.priceCents),
  unitLabel: p.unitLabel,
  sku: p.sku ?? '',
  description: p.description,
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
  const { isManager } = useAuth()

  const categories = useAsync(() => api.get<{ items: Category[] }>('/api/staff/categories').then((r) => r.items), [])
  const product = useAsync(
    () => (isNew ? Promise.resolve(null) : api.get<{ product: StaffProduct }>(`/api/staff/products/${id}`).then((r) => r.product)),
    [id],
  )

  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)

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
      nameTa: form.nameTa.trim() || null,
      brand: form.brand.trim() || null,
      categoryId: Number(form.categoryId),
      priceCents: inputToCents(form.price),
      unitLabel: form.unitLabel.trim(),
      sku: form.sku.trim() || null,
      description: form.description.trim(),
      isActive: form.isActive,
      lowStockThreshold: Number(form.lowStockThreshold),
    }
    // Stock for existing products is changed with "Adjust stock" (safer while customers are ordering).
    if (isNew) body.stockQuantity = Number(form.stockQuantity)

    setSaving(true)
    try {
      if (isNew) {
        const { product: created } = await api.post<{ product: StaffProduct }>('/api/staff/products', body)
        if (pendingImage) await uploadImage(created.id, pendingImage.file, pendingImage.source)
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

  async function uploadImage(productId: number, file: File, source: string) {
    const form = new FormData()
    form.append('image', file)
    form.append('source', source)
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
      {!isManager && (
        <ManagerOnly>
          Only a manager can change names, prices and other details. You can update the photo and the stock (with a reason).
        </ManagerOnly>
      )}

      <form className="form-grid" onSubmit={handleSubmit} noValidate>
        <section className="card form-main">
          <h2>Details</h2>
          <fieldset disabled={!isManager} className="plain-fieldset">
          {formError && (
            <div className="alert alert-error" role="alert">
              {formError}
            </div>
          )}
          <Field label="Name" htmlFor="name" error={errors.name} required>
            <input id="name" value={form.name} maxLength={120} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Tamil name" htmlFor="name-ta" error={errors.nameTa} hint="Shown when customers use the app in Tamil, e.g. துவரம் பருப்பு">
            <input id="name-ta" lang="ta" value={form.nameTa} maxLength={120} onChange={(e) => set('nameTa', e.target.value)} />
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
                    {c.name}
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
          </fieldset>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={saving || !isManager}>
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
            pendingImage={pendingImage}
            onPendingImage={setPendingImage}
            onUploaded={(updated) => product.setData(updated)}
            upload={uploadImage}
          />
          {current && <StockCard product={current} onUpdated={(updated) => product.setData(updated)} />}
          {current && <StockHistoryCard product={current} />}
        </div>
      </form>
    </>
  )
}

function ImageCard({
  product,
  pendingImage,
  onPendingImage,
  onUploaded,
  upload,
}: {
  product: StaffProduct | null
  pendingImage: PendingImage | null
  onPendingImage: (image: PendingImage | null) => void
  onUploaded: (product: StaffProduct) => void
  upload: (productId: number, file: File, source: string) => Promise<StaffProduct>
}) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const sourceRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [source, setSource] = useState('')
  const [sourceError, setSourceError] = useState<string | undefined>()
  const pendingFile = pendingImage?.file

  useEffect(() => {
    if (!pendingFile) return setPreviewUrl(null)
    const url = URL.createObjectURL(pendingFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingFile])

  // We only show photos we may use, so staff say where each one is from before choosing it.
  function chooseFile() {
    if (!source.trim()) {
      setSourceError('Say where this photo is from before choosing it.')
      sourceRef.current?.focus()
      return
    }
    inputRef.current?.click()
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast('Please choose a JPG, PNG or WebP image.', 'error')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      toast('Images must be 8 MB or smaller.', 'error')
      return
    }
    if (!product) {
      onPendingImage({ file, source: source.trim() }) // uploaded after the product is created
      setSource('')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setBusy(true)
    try {
      onUploaded(await upload(product.id, file, source.trim()))
      setSource('')
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
          <ProductThumb imageUrl={product?.imageUrl ?? null} size={160} />
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
      {product?.imageUrl && !previewUrl && <PhotoCredit credit={product.imageCredit} />}
      {pendingImage && <p className="hint">Source: {pendingImage.source}</p>}
      <Field
        label={hasImage ? 'Where is the new photo from?' : 'Where is this photo from?'}
        htmlFor="image-source"
        hint="For example “Taken in our shop, Oct 2026” or “Supplier pack shot, used with permission”."
        error={sourceError}
      >
        <input
          ref={sourceRef}
          id="image-source"
          value={source}
          maxLength={200}
          onChange={(e) => {
            setSource(e.target.value)
            setSourceError(undefined)
          }}
        />
      </Field>
      <div className="button-row">
        <button type="button" className="btn btn-secondary" onClick={chooseFile} disabled={busy}>
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
          Image needed — customers see a clearly labelled “Image needed” placeholder until a photo is added. Take a photo
          of the pack on your shelf, or use one you have permission to use. Don't copy photos from Google or shopping
          websites.
        </p>
      )}
      <p className="hint">JPG, PNG or WebP up to 8 MB. It is resized and compressed automatically. Square photos look best.</p>
    </section>
  )
}

function StockCard({ product, onUpdated }: { product: StaffProduct; onUpdated: (p: StaffProduct) => void }) {
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState<(typeof MANUAL_STOCK_REASONS)[number]['value']>('delivery_received')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function adjust(mode: 'add' | 'remove' | 'set') {
    const value = Number(amount)
    if (!isWholeNumber(amount) || (mode !== 'set' && value === 0)) {
      toast('Enter a whole number first.', 'error')
      return
    }
    const why = mode === 'set' ? 'stock_count' : mode === 'remove' && reason === 'delivery_received' ? 'adjustment' : reason
    const body = {
      ...(mode === 'set' ? { quantity: value } : { adjustBy: mode === 'add' ? value : -value }),
      reason: why,
      note: note.trim() || undefined,
    }
    setBusy(true)
    try {
      const result = await api.post<{ product: StaffProduct }>(`/api/staff/products/${product.id}/stock`, body)
      onUpdated(result.product)
      setAmount('')
      setNote('')
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
      <Field label="Reason" htmlFor="stock-reason" hint="Every change is saved in the stock history with your name.">
        <select id="stock-reason" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
          {MANUAL_STOCK_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Note (optional)" htmlFor="stock-note" hint='e.g. "Invoice 1042" or "2 packets torn"'>
        <input id="stock-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
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

/** The last few stock changes for this product, with who made them and why. */
function StockHistoryCard({ product }: { product: StaffProduct }) {
  const { dateTime } = useStore()
  const history = useAsync(
    () => api.get<Paginated<StockMovement>>(`/api/staff/products/${product.id}/history?pageSize=8`),
    [product.id, product.stockQuantity],
  )
  return (
    <section className="card">
      <h2>
        <History size={16} aria-hidden /> Stock history
      </h2>
      {history.error && !history.data ? (
        <ErrorState error={history.error} onRetry={history.reload} />
      ) : !history.data ? (
        <Spinner />
      ) : history.data.items.length === 0 ? (
        <p className="muted small">No changes recorded yet.</p>
      ) : (
        <ul className="event-list">
          {history.data.items.map((m) => (
            <li key={m.id}>
              <span className="small">
                <strong className={m.change < 0 ? 'error-text' : ''}>
                  {m.change > 0 ? '+' : ''}
                  {m.change}
                </strong>{' '}
                → {m.quantityAfter} · {m.reasonLabel}
                {m.orderNumber && (
                  <>
                    {' '}
                    · <Link to={`/orders/${m.orderId}`}>{m.orderNumber}</Link>
                  </>
                )}
              </span>
              {m.note && <span className="small">{m.note}</span>}
              <span className="muted small">
                {m.userName ?? 'System'} · {dateTime(m.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link to={`/stock-history?productId=${product.id}`} className="btn btn-link">
        Full history →
      </Link>
    </section>
  )
}
