import { LoaderCircle, Pencil, Plus, Trash, X } from 'lucide-react'
import { useState } from 'react'
import { Alert, EmptyState, ErrorState, Field, ManagerOnly, Modal, PageHeader, ProductThumb, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { useToast } from '../context/ToastContext'
import { ApiError, api, queryString } from '../lib/api'
import { centsToInput, inputToCents } from '../lib/format'
import type { Paginated, Promotion, SettingsResponse, StaffProduct } from '../lib/types'
import { useAsync, useDebounced } from '../lib/useAsync'

/** Bundle offers ("buy these together, save ₹20"). Optional — switched on or off for the whole store. */
export function OffersPage() {
  const { money } = useStore()
  const { isManager } = useAuth()
  const toast = useToast()
  const offers = useAsync(() => api.get<{ enabled: boolean; items: Promotion[] }>('/api/staff/promotions'), [])
  const [editing, setEditing] = useState<Promotion | 'new' | null>(null)
  const [toggling, setToggling] = useState(false)

  async function setEnabled(enabled: boolean) {
    setToggling(true)
    try {
      await api.put<SettingsResponse>('/api/staff/settings', { promotionsEnabled: enabled })
      toast(enabled ? 'Offers are switched on' : 'Offers are switched off')
      offers.reload()
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setToggling(false)
    }
  }

  async function remove(promotion: Promotion) {
    if (!window.confirm(`Delete the offer "${promotion.name}"? Past orders keep their discount.`)) return
    try {
      await api.delete(`/api/staff/promotions/${promotion.id}`)
      toast('Offer deleted')
      offers.reload()
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  const enabled = offers.data?.enabled
  return (
    <>
      <PageHeader
        title="Offers"
        subtitle="Bundle offers: when a customer buys all the products of a bundle together, they save the amount you set. The app applies them automatically."
        actions={
          isManager && (
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              <Plus size={16} aria-hidden /> New offer
            </button>
          )
        }
      />
      {offers.data && (
        <Alert kind={enabled ? 'success' : 'info'} title={enabled ? 'Offers are ON — customers see them in the app' : 'Offers are OFF — customers don’t see any offers'}>
          {isManager ? (
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} disabled={toggling} onClick={() => setEnabled(!enabled)}>
              {toggling && <LoaderCircle className="spin" size={14} aria-hidden />} {enabled ? 'Switch offers off' : 'Switch offers on'}
            </button>
          ) : (
            'A manager can switch offers on or off.'
          )}
        </Alert>
      )}
      {!isManager && <ManagerOnly>Only a manager can create or change offers.</ManagerOnly>}
      <section className="card">
        {offers.error && !offers.data ? (
          <ErrorState error={offers.error} onRetry={offers.reload} />
        ) : !offers.data ? (
          <Spinner />
        ) : offers.data.items.length === 0 ? (
          <EmptyState title="No offers yet" message="Create a bundle, for example everything for sambar, with a small saving." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Offer</th>
                  <th>Products</th>
                  <th className="num">Saving</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {offers.data.items.map((p) => (
                  <tr key={p.id} className={p.isRunning ? '' : 'row-muted'}>
                    <td>
                      <div className="strong">{p.name}</div>
                      {p.nameTa && (
                        <div className="small" lang="ta">
                          {p.nameTa}
                        </div>
                      )}
                      <div className="muted small">{p.description}</div>
                      {(p.startsAt || p.endsAt) && (
                        <div className="muted small">
                          {p.startsAt ? `From ${new Date(p.startsAt).toLocaleDateString()}` : ''}
                          {p.endsAt ? ` until ${new Date(p.endsAt).toLocaleDateString()}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="small">
                      {p.items.map((item) => (
                        <div key={item.productId}>
                          {item.quantity} × {item.name} {!item.isAvailable && <span className="badge stock-out badge-small">Not in stock</span>}
                        </div>
                      ))}
                    </td>
                    <td className="num">{money(p.discountCents)}</td>
                    <td>
                      {p.isRunning ? <span className="badge stock-ok">Running</span> : <span className="badge badge-muted">{p.isActive ? 'Not in dates' : 'Paused'}</span>}
                    </td>
                    <td className="num">
                      {isManager && (
                        <div className="button-row" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}>
                            <Pencil size={14} aria-hidden /> Edit
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => remove(p)} aria-label={`Delete ${p.name}`}>
                            <Trash size={14} aria-hidden />
                          </button>
                        </div>
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
        <OfferDialog
          promotion={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            offers.reload()
          }}
        />
      )}
    </>
  )
}

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

function OfferDialog({ promotion, onClose, onSaved }: { promotion: Promotion | null; onClose: () => void; onSaved: () => void }) {
  const { money, store } = useStore()
  const toast = useToast()
  const [name, setName] = useState(promotion?.name ?? '')
  const [nameTa, setNameTa] = useState(promotion?.nameTa ?? '')
  const [description, setDescription] = useState(promotion?.description ?? '')
  const [saving, setSaving] = useState(promotion ? centsToInput(promotion.discountCents) : '')
  const [isActive, setIsActive] = useState(promotion?.isActive ?? true)
  const [startsAt, setStartsAt] = useState(toDateInput(promotion?.startsAt ?? null))
  const [endsAt, setEndsAt] = useState(toDateInput(promotion?.endsAt ?? null))
  const [items, setItems] = useState(
    (promotion?.items ?? []).map((i) => ({ productId: i.productId, name: i.name, priceCents: i.priceCents, quantity: i.quantity })),
  )
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search.trim())
  const results = useAsync(
    () =>
      debounced
        ? api.get<Paginated<StaffProduct>>(`/api/staff/products${queryString({ search: debounced, status: 'active', pageSize: 8 })}`).then((r) => r.items)
        : Promise.resolve([] as StaffProduct[]),
    [debounced],
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const bundlePrice = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0)

  async function save() {
    setError(null)
    const discountCents = inputToCents(saving)
    if (!name.trim()) return setError('Give the offer a name.')
    if (discountCents === null || discountCents < 100) return setError('Enter a saving of at least ₹1.')
    if (items.length < 2) return setError('A bundle needs at least 2 products.')
    if (discountCents >= bundlePrice) return setError(`The saving must be less than the bundle price (${money(bundlePrice)}).`)
    const body = {
      name: name.trim(),
      nameTa: nameTa.trim() || null,
      description: description.trim(),
      discountCents,
      isActive,
      startsAt: startsAt || null,
      endsAt: endsAt || null,
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    }
    setBusy(true)
    try {
      if (promotion) await api.put(`/api/staff/promotions/${promotion.id}`, body)
      else await api.post('/api/staff/promotions', body)
      toast('Offer saved')
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? Object.values(err.fieldErrors)[0] ?? err.message : (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={promotion ? `Edit ${promotion.name}` : 'New offer'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy && <LoaderCircle className="spin" size={16} aria-hidden />} Save offer
          </button>
        </>
      }
    >
      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}
      <div className="field-row">
        <Field label="Name" htmlFor="offer-name" required>
          <input id="offer-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sambar combo" />
        </Field>
        <Field label="Tamil name" htmlFor="offer-name-ta">
          <input id="offer-name-ta" lang="ta" value={nameTa} maxLength={80} onChange={(e) => setNameTa(e.target.value)} />
        </Field>
      </div>
      <Field label="Description" htmlFor="offer-desc">
        <input id="offer-desc" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="field-row">
        <Field label={`Saving (${store.currency})`} htmlFor="offer-saving" required hint={items.length ? `Bundle price ${money(bundlePrice)}` : undefined}>
          <input id="offer-saving" inputMode="decimal" value={saving} onChange={(e) => setSaving(e.target.value)} placeholder="e.g. 20" />
        </Field>
        <Field label="Starts (optional)" htmlFor="offer-start">
          <input id="offer-start" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field label="Ends (optional)" htmlFor="offer-end">
          <input id="offer-end" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
      </div>
      <h3 className="small strong">Products in the bundle</h3>
      {items.length === 0 && <p className="muted small">Search below and add at least 2 products.</p>}
      <ul className="event-list" style={{ marginBottom: 12 }}>
        {items.map((item) => (
          <li key={item.productId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              aria-label={`Quantity of ${item.name}`}
              inputMode="numeric"
              style={{ width: 64 }}
              value={item.quantity}
              onChange={(e) => {
                const q = Math.max(1, Math.min(50, Number(e.target.value) || 1))
                setItems((list) => list.map((i) => (i.productId === item.productId ? { ...i, quantity: q } : i)))
              }}
            />
            <span style={{ flex: 1 }}>
              × {item.name} <span className="muted small">({money(item.priceCents)})</span>
            </span>
            <button className="icon-button" aria-label={`Remove ${item.name}`} onClick={() => setItems((list) => list.filter((i) => i.productId !== item.productId))}>
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
      <Field label="Add a product" htmlFor="offer-search">
        <input id="offer-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" />
      </Field>
      <div className="picker-results">
        {results.data
          ?.filter((p) => !items.some((i) => i.productId === p.id))
          .map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setItems((list) => [...list, { productId: p.id, name: p.name, priceCents: p.priceCents, quantity: 1 }])
                setSearch('')
              }}
            >
              <ProductThumb imageUrl={p.imageUrl} size={28} />
              <span style={{ flex: 1 }}>
                {p.name} <span className="muted small">· {p.unitLabel} · {money(p.priceCents)}</span>
              </span>
              <Plus size={16} aria-hidden />
            </button>
          ))}
      </div>
      <label className="switch">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <span>
          <strong>Active</strong>
          <span className="muted small">Untick to pause this offer without deleting it.</span>
        </span>
      </label>
    </Modal>
  )
}
