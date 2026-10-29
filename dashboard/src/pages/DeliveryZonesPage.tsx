import { LoaderCircle, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, ErrorState, Field, ManagerOnly, Modal, PageHeader, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { useToast } from '../context/ToastContext'
import { ApiError, api } from '../lib/api'
import { centsToInput, inputToCents } from '../lib/format'
import type { DeliveryZone } from '../lib/types'
import { useAsync } from '../lib/useAsync'

export function DeliveryZonesPage() {
  const { money } = useStore()
  const { isManager } = useAuth()
  const zones = useAsync(() => api.get<{ items: DeliveryZone[] }>('/api/staff/delivery-zones').then((r) => r.items), [])
  const [editing, setEditing] = useState<DeliveryZone | 'new' | null>(null)

  return (
    <>
      <PageHeader
        title="Delivery zones"
        subtitle="Where you deliver and what it costs. A customer's PIN code must start with one of a zone's PIN codes or prefixes."
        actions={
          isManager && (
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              <Plus size={16} aria-hidden /> New zone
            </button>
          )
        }
      />
      {!isManager && <ManagerOnly>Only a manager can add or change delivery zones and fees.</ManagerOnly>}
      <div className="alert alert-info">
        Enter full 6-digit PIN codes (for example <code>635810</code> for Pernambut), or a shorter prefix to cover several:{' '}
        <code>6358</code> covers every PIN code from 635800 to 635899. If a PIN code matches several zones, the longest match
        wins.
      </div>
      <section className="card">
        {zones.error && !zones.data ? (
          <ErrorState error={zones.error} onRetry={zones.reload} />
        ) : !zones.data ? (
          <Spinner />
        ) : zones.data.length === 0 ? (
          <EmptyState title="No delivery zones" message="Customers can only choose store pickup until you add a zone." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>PIN codes</th>
                  <th className="num">Fee</th>
                  <th className="num">Free delivery over</th>
                  <th className="num">Minimum order</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {zones.data.map((z) => (
                  <tr key={z.id} className={z.isActive ? '' : 'row-muted'}>
                    <td className="strong">{z.name}</td>
                    <td>
                      <div className="chips">
                        {z.postcodePrefixes.map((p) => (
                          <span key={p} className="chip">
                            {p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="num">{money(z.feeCents)}</td>
                    <td className="num">{z.freeDeliveryThresholdCents ? money(z.freeDeliveryThresholdCents) : '—'}</td>
                    <td className="num">{z.minOrderCents ? money(z.minOrderCents) : '—'}</td>
                    <td>{z.isActive ? <span className="badge stock-ok">Active</span> : <span className="badge badge-muted">Paused</span>}</td>
                    <td className="num">
                      {isManager && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(z)} aria-label={`Edit ${z.name}`}>
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
        <ZoneDialog
          zone={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            zones.reload()
          }}
        />
      )}
    </>
  )
}

function ZoneDialog({ zone, onClose, onSaved }: { zone: DeliveryZone | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const { store } = useStore()
  const [name, setName] = useState(zone?.name ?? '')
  const [prefixes, setPrefixes] = useState(zone?.postcodePrefixes.join(', ') ?? '')
  const [fee, setFee] = useState(centsToInput(zone?.feeCents ?? null))
  const [freeOver, setFreeOver] = useState(centsToInput(zone?.freeDeliveryThresholdCents ?? null))
  const [minOrder, setMinOrder] = useState(centsToInput(zone?.minOrderCents ?? null))
  const [isActive, setIsActive] = useState(zone?.isActive ?? true)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function save() {
    const e: Record<string, string> = {}
    const prefixList = prefixes
      .split(/[,\n]/)
      .map((p) => p.trim())
      .filter(Boolean)
    const feeCents = inputToCents(fee)
    const freeCents = freeOver.trim() ? inputToCents(freeOver) : null
    const minCents = minOrder.trim() ? inputToCents(minOrder) : 0
    if (!name.trim()) e.name = 'Name is required'
    if (!prefixList.length) e.postcodePrefixes = 'Add at least one postcode prefix'
    if (feeCents === null) e.feeCents = 'Enter a fee such as 30 (or 0 for free)'
    if (freeOver.trim() && !freeCents) e.freeDeliveryThresholdCents = 'Enter an amount such as 500, or leave empty'
    if (minCents === null) e.minOrderCents = 'Enter an amount such as 199, or leave empty'
    setErrors(e)
    if (Object.keys(e).length) return

    const body = {
      name: name.trim(),
      postcodePrefixes: prefixList,
      feeCents,
      freeDeliveryThresholdCents: freeCents,
      minOrderCents: minCents,
      isActive,
    }
    setSaving(true)
    try {
      if (zone) await api.patch(`/api/staff/delivery-zones/${zone.id}`, body)
      else await api.post('/api/staff/delivery-zones', body)
      toast(zone ? 'Zone saved' : 'Zone created')
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
      title={zone ? `Edit ${zone.name}` : 'New delivery zone'}
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
      <Field label="Zone name" htmlFor="zone-name" error={errors.name} required>
        <input id="zone-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field
        label="PIN codes or prefixes"
        htmlFor="zone-prefixes"
        error={errors.postcodePrefixes}
        required
        hint="Separate with commas, e.g. 635810, 635802"
      >
        <textarea id="zone-prefixes" rows={2} value={prefixes} onChange={(e) => setPrefixes(e.target.value)} />
      </Field>
      <div className="field-row">
        <Field label={`Delivery fee (${store.currency})`} htmlFor="zone-fee" error={errors.feeCents} required>
          <input id="zone-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="30" />
        </Field>
        <Field label="Free delivery over" htmlFor="zone-free" error={errors.freeDeliveryThresholdCents} hint="Leave empty for never">
          <input id="zone-free" inputMode="decimal" value={freeOver} onChange={(e) => setFreeOver(e.target.value)} placeholder="500" />
        </Field>
        <Field label="Minimum order" htmlFor="zone-min" error={errors.minOrderCents} hint="Leave empty for none">
          <input id="zone-min" inputMode="decimal" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} placeholder="0" />
        </Field>
      </div>
      <label className="switch">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <span>
          <strong>Active</strong>
          <span className="muted small">Untick to pause deliveries to this zone.</span>
        </span>
      </label>
    </Modal>
  )
}
