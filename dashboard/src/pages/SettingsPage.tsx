import { LoaderCircle, Save, Trash } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Alert, DemoBadge, ErrorState, Field, ManagerOnly, PageHeader, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { useToast } from '../context/ToastContext'
import { ApiError, api } from '../lib/api'
import { centsToInput, inputToCents, WEEKDAYS } from '../lib/format'
import type { OpeningHours, SettingsResponse, StoreSettings, Summary } from '../lib/types'
import { useAsync } from '../lib/useAsync'

/** Opening hours, holidays, pickup slots, substitutions, loyalty points and offers. */
export function SettingsPage() {
  const { isManager } = useAuth()
  const data = useAsync(() => api.get<SettingsResponse>('/api/staff/settings'), [])
  const summary = useAsync(() => api.get<Summary>('/api/staff/summary'), [])

  if (data.error && !data.data) return <ErrorState error={data.error} onRetry={data.reload} />
  if (!data.data) return <Spinner />

  return (
    <>
      <PageHeader title="Store settings" subtitle={`Times are in the store's time zone (${data.data.timezone}).`} />
      {!isManager && <ManagerOnly>You can see the settings. Only a manager can change them.</ManagerOnly>}
      <div className="settings-grid">
        <HoursCard key={JSON.stringify(data.data.openingHours)} hours={data.data.openingHours} onSaved={data.setData} />
        <ClosuresCard closures={data.data.closures} onSaved={data.setData} />
        <SettingsCard
          title="Pickup time slots"
          key={`Pickup time slots ${data.data.settings.updatedAt}`}
          settings={data.data.settings}
          onSaved={data.setData}
          fields={[
            { key: 'pickupSlotMinutes', label: 'Slot length (minutes)', hint: 'e.g. 60 for one-hour slots' },
            { key: 'pickupSlotCapacity', label: 'Orders per slot', hint: 'How many pickup orders you can prepare per slot' },
            { key: 'pickupDaysAhead', label: 'Days customers can book ahead', hint: '0 = today only' },
            { key: 'pickupLeadTimeMinutes', label: 'Preparation time (minutes)', hint: 'The earliest slot starts at least this long after the order' },
          ]}
          note="Changing these rebuilds the future slots. Slots that already have orders are kept."
        />
        <SettingsCard
          title="Substitutions"
          key={`Substitutions ${data.data.settings.updatedAt}`}
          settings={data.data.settings}
          onSaved={data.setData}
          toggles={[
            {
              key: 'substitutionsEnabled',
              label: 'Let customers choose replacements',
              hint: 'Customers pick for each item: don’t replace, a similar item, or a product they choose.',
            },
          ]}
        />
        <SettingsCard
          title="Loyalty points"
          key={`Loyalty points ${data.data.settings.updatedAt}`}
          settings={data.data.settings}
          onSaved={data.setData}
          toggles={[{ key: 'loyaltyEnabled', label: 'Loyalty points are on', hint: 'Customers earn points on completed orders and can spend them at checkout.' }]}
          fields={[
            { key: 'loyaltyPointsPer100', label: 'Points earned per ₹100' },
            { key: 'loyaltyPointValueCents', label: 'Value of 1 point (₹)', money: true },
            { key: 'loyaltyMinRedeemPoints', label: 'Points needed before spending' },
            { key: 'loyaltyMaxRedeemPercent', label: 'Most of an order points can pay (%)' },
          ]}
        />
        <SettingsCard
          title="Offers"
          key={`Offers ${data.data.settings.updatedAt}`}
          settings={data.data.settings}
          onSaved={data.setData}
          toggles={[{ key: 'promotionsEnabled', label: 'Bundle offers are on', hint: 'Create and edit the offers on the Offers page.' }]}
          extra={
            <Link to="/offers" className="btn btn-link">
              Manage offers →
            </Link>
          }
        />
        <section className="card">
          <h2>Payments and WhatsApp</h2>
          {summary.data ? (
            <ul className="info-list">
              <li>
                UPI payments:{' '}
                {summary.data.paymentsMode === 'demo' ? (
                  <DemoBadge label="DEMO — no real money" />
                ) : summary.data.paymentsMode === 'test' ? (
                  <DemoBadge label="Razorpay TEST mode — no real money" />
                ) : (
                  <span className="badge pay-failed">Razorpay LIVE — real money</span>
                )}
              </li>
              <li>
                WhatsApp updates:{' '}
                {summary.data.whatsappMode === 'demo' ? (
                  <DemoBadge label="DEMO — not sent" />
                ) : summary.data.whatsappMode === 'off' ? (
                  <span className="badge badge-muted">Off</span>
                ) : (
                  <span className="badge stock-ok">WhatsApp Cloud API</span>
                )}
              </li>
            </ul>
          ) : (
            <Spinner />
          )}
          <p className="hint">These are set on the server (environment variables), not here. See docs/INTEGRATIONS.md.</p>
        </section>
      </div>
    </>
  )
}

function useSaver(onSaved: (data: SettingsResponse) => void) {
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function save(action: () => Promise<SettingsResponse>, message = 'Saved') {
    setSaving(true)
    setError(null)
    try {
      onSaved(await action())
      toast(message)
      return true
    } catch (err) {
      setError(err instanceof ApiError ? Object.values(err.fieldErrors)[0] ?? err.message : (err as Error).message)
      return false
    } finally {
      setSaving(false)
    }
  }
  return { save, saving, error }
}

function HoursCard({ hours, onSaved }: { hours: OpeningHours[]; onSaved: (data: SettingsResponse) => void }) {
  const { isManager } = useAuth()
  const [rows, setRows] = useState(hours)
  const { save, saving, error } = useSaver(onSaved)
  const update = (weekday: number, changes: Partial<OpeningHours>) => setRows((list) => list.map((r) => (r.weekday === weekday ? { ...r, ...changes } : r)))
  const ordered = [1, 2, 3, 4, 5, 6, 0].map((d) => rows.find((r) => r.weekday === d)!).filter(Boolean)

  return (
    <section className="card">
      <h2>Opening hours</h2>
      <p className="muted small">Customers see these in the app. Pickup slots are only offered while the store is open.</p>
      {error && <div className="alert alert-error">{error}</div>}
      <fieldset className="plain-fieldset" disabled={!isManager}>
        <div className="hours-grid">
          {ordered.map((row) => (
            <HoursRow key={row.weekday} row={row} onChange={(changes) => update(row.weekday, changes)} />
          ))}
        </div>
      </fieldset>
      {isManager && (
        <div className="form-actions">
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => save(() => api.put('/api/staff/settings/hours', { openingHours: rows }), 'Opening hours saved')}>
            {saving ? <LoaderCircle className="spin" size={14} aria-hidden /> : <Save size={14} aria-hidden />} Save hours
          </button>
        </div>
      )}
    </section>
  )
}

function HoursRow({ row, onChange }: { row: OpeningHours; onChange: (changes: Partial<OpeningHours>) => void }) {
  const day = WEEKDAYS[row.weekday]
  return (
    <>
      <strong>{day}</strong>
      <input type="time" aria-label={`${day} opens`} value={row.opensAt} disabled={row.isClosed} onChange={(e) => onChange({ opensAt: e.target.value })} />
      <input type="time" aria-label={`${day} closes`} value={row.closesAt} disabled={row.isClosed} onChange={(e) => onChange({ closesAt: e.target.value })} />
      <label className="checkbox">
        <input type="checkbox" checked={row.isClosed} onChange={(e) => onChange({ isClosed: e.target.checked })} /> Closed
      </label>
    </>
  )
}

function ClosuresCard({ closures, onSaved }: { closures: SettingsResponse['closures']; onSaved: (data: SettingsResponse) => void }) {
  const { isManager } = useAuth()
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const { save, saving, error } = useSaver(onSaved)

  return (
    <section className="card">
      <h2>Holidays and closed days</h2>
      <p className="muted small">On these dates no pickup slots are offered, and the app shows the store as closed.</p>
      {error && <div className="alert alert-error">{error}</div>}
      {closures.length === 0 ? (
        <p className="muted small">No upcoming closures.</p>
      ) : (
        <ul className="event-list" style={{ marginBottom: 12 }}>
          {closures.map((c) => (
            <li key={c.date} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }}>
                <strong>{new Date(`${c.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</strong> ·{' '}
                {c.reason}
              </span>
              {isManager && (
                <button
                  className="icon-button"
                  aria-label={`Remove closure on ${c.date}`}
                  disabled={saving}
                  onClick={() => save(() => api.delete(`/api/staff/settings/closures/${c.date}`), 'Closure removed')}
                >
                  <Trash size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isManager && (
        <>
          <div className="field-row">
            <Field label="Date" htmlFor="closure-date">
              <input id="closure-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Reason" htmlFor="closure-reason">
              <input id="closure-reason" value={reason} maxLength={100} placeholder="e.g. Pongal" onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            disabled={saving || !date || reason.trim().length < 2}
            onClick={async () => {
              if (await save(() => api.post('/api/staff/settings/closures', { date, reason: reason.trim() }), 'Closed day added')) {
                setDate('')
                setReason('')
              }
            }}
          >
            Add closed day
          </button>
        </>
      )}
    </section>
  )
}

type NumberKey = Exclude<{ [K in keyof StoreSettings]: StoreSettings[K] extends number ? K : never }[keyof StoreSettings], undefined>
type BoolKey = Exclude<{ [K in keyof StoreSettings]: StoreSettings[K] extends boolean ? K : never }[keyof StoreSettings], undefined>

function SettingsCard({
  title,
  settings,
  onSaved,
  fields = [],
  toggles = [],
  note,
  extra,
}: {
  title: string
  settings: StoreSettings
  onSaved: (data: SettingsResponse) => void
  fields?: { key: NumberKey; label: string; hint?: string; money?: boolean }[]
  toggles?: { key: BoolKey; label: string; hint?: string }[]
  note?: string
  extra?: ReactNode
}) {
  const { isManager } = useAuth()
  const { store } = useStore()
  const initial = () =>
    Object.fromEntries([
      ...fields.map((f) => [f.key, f.money ? centsToInput(settings[f.key]) : String(settings[f.key])]),
      ...toggles.map((t) => [t.key, settings[t.key]]),
    ]) as Record<string, string | boolean>
  const [values, setValues] = useState(initial)
  const { save, saving, error } = useSaver(onSaved)
  const [localError, setLocalError] = useState<string | null>(null)

  function submit() {
    setLocalError(null)
    const body: Record<string, number | boolean> = {}
    for (const f of fields) {
      const raw = String(values[f.key]).trim()
      const value = f.money ? inputToCents(raw) : /^\d+$/.test(raw) ? Number(raw) : null
      if (value === null) return setLocalError(`Check "${f.label}" — enter a number.`)
      body[f.key] = value
    }
    for (const t of toggles) body[t.key] = Boolean(values[t.key])
    void save(() => api.put('/api/staff/settings', body), `${title} saved`)
  }

  return (
    <section className="card">
      <h2>{title}</h2>
      {(error || localError) && <div className="alert alert-error">{error ?? localError}</div>}
      <fieldset className="plain-fieldset" disabled={!isManager}>
        {toggles.map((t) => (
          <label key={t.key} className="switch">
            <input type="checkbox" checked={Boolean(values[t.key])} onChange={(e) => setValues((v) => ({ ...v, [t.key]: e.target.checked }))} />
            <span>
              <strong>{t.label}</strong>
              {t.hint && <span className="muted small">{t.hint}</span>}
            </span>
          </label>
        ))}
        {fields.map((f) => (
          <Field key={f.key} label={f.money ? f.label.replace('₹', store.currency === 'INR' ? '₹' : store.currency) : f.label} htmlFor={`setting-${f.key}`} hint={f.hint}>
            <input
              id={`setting-${f.key}`}
              inputMode={f.money ? 'decimal' : 'numeric'}
              value={String(values[f.key])}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </Field>
        ))}
      </fieldset>
      {note && <p className="hint">{note}</p>}
      {isManager && (
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={submit}>
          {saving ? <LoaderCircle className="spin" size={14} aria-hidden /> : <Save size={14} aria-hidden />} Save
        </button>
      )}
      {extra}
      {title === 'Loyalty points' && !settings.loyaltyEnabled && (
        <Alert kind="info">Loyalty points are optional and switched off. Customers don’t see points until you switch them on.</Alert>
      )}
    </section>
  )
}
