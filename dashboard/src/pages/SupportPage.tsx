import { CheckCircle2, LoaderCircle, Mail, Phone, RotateCcw, Send } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState, ErrorState, PageHeader, Spinner } from '../components/ui'
import { useStore } from '../context/StoreContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'
import { SUPPORT_TOPIC_LABELS, timeAgo } from '../lib/format'
import type { SupportRequest } from '../lib/types'
import { useAsync } from '../lib/useAsync'

const TABS = [
  { value: 'open', label: 'Waiting for a reply' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
] as const

/** "Report a problem" requests from the app. Replies appear in the customer's app (and on WhatsApp if they asked). */
export function SupportPage() {
  const [status, setStatus] = useState<(typeof TABS)[number]['value']>('open')
  const requests = useAsync(() => api.get<{ items: SupportRequest[] }>(`/api/staff/support?status=${status}`).then((r) => r.items), [status], {
    refreshEveryMs: 60_000,
  })

  return (
    <>
      <PageHeader
        title="Customer help"
        subtitle="Problems customers reported in the app: missing or damaged items, late orders, payments and refunds. Your reply appears in their app."
      />
      <div className="tabs" role="tablist" aria-label="Request status">
        {TABS.map((tab) => (
          <button key={tab.value} role="tab" aria-selected={status === tab.value} className={`tab ${status === tab.value ? 'active' : ''}`} onClick={() => setStatus(tab.value)}>
            {tab.label}
          </button>
        ))}
      </div>
      <section className="card">
        {requests.error && !requests.data ? (
          <ErrorState error={requests.error} onRetry={requests.reload} />
        ) : !requests.data ? (
          <Spinner />
        ) : requests.data.length === 0 ? (
          <EmptyState title={status === 'open' ? 'No open requests' : 'Nothing here'} message="New requests from the app appear here automatically." />
        ) : (
          requests.data.map((request) => <RequestCard key={request.id} request={request} onChanged={requests.reload} />)
        )}
      </section>
    </>
  )
}

function RequestCard({ request, onChanged }: { request: SupportRequest; onChanged: () => void }) {
  const { dateTime } = useStore()
  const toast = useToast()
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  async function send(body: { reply?: string; status?: 'open' | 'resolved' }, message: string) {
    setBusy(true)
    try {
      await api.patch(`/api/staff/support/${request.id}`, body)
      toast(message)
      setReply('')
      onChanged()
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="request-card">
      <div className="request-meta">
        <strong>{SUPPORT_TOPIC_LABELS[request.topic] ?? request.topic}</strong>
        <span className={`badge ${request.status === 'resolved' ? 'stock-ok' : 'stock-low'}`}>{request.status === 'resolved' ? 'Resolved' : 'Open'}</span>
        {request.orderNumber && (
          <Link to={`/orders/${request.orderId}`} className="strong-link">
            {request.orderNumber}
          </Link>
        )}
        <span className="muted small" title={dateTime(request.createdAt)}>
          {timeAgo(request.createdAt)}
        </span>
      </div>
      <div className="small">
        {request.customerName} · <Mail size={12} aria-hidden /> <a href={`mailto:${request.customerEmail}`}>{request.customerEmail}</a>
        {request.customerPhone && (
          <>
            {' '}
            · <Phone size={12} aria-hidden /> <a href={`tel:${request.customerPhone}`}>{request.customerPhone}</a>
          </>
        )}
      </div>
      <p style={{ margin: 0 }}>{request.message}</p>
      {request.staffReply && (
        <div className="reply-box small">
          <strong>Your reply:</strong> {request.staffReply}
          {request.resolvedByName && <span className="muted"> · resolved by {request.resolvedByName}</span>}
        </div>
      )}
      <label className="sr-only" htmlFor={`reply-${request.id}`}>
        Reply to {request.customerName}
      </label>
      <textarea
        id={`reply-${request.id}`}
        rows={2}
        maxLength={1000}
        placeholder="Write a reply the customer will see in the app"
        value={reply}
        onChange={(e) => setReply(e.target.value)}
      />
      <div className="button-row">
        <button className="btn btn-primary btn-sm" disabled={busy || !reply.trim()} onClick={() => send({ reply: reply.trim(), status: 'resolved' }, 'Reply sent and marked resolved')}>
          {busy ? <LoaderCircle className="spin" size={14} aria-hidden /> : <Send size={14} aria-hidden />} Reply and resolve
        </button>
        <button className="btn btn-secondary btn-sm" disabled={busy || !reply.trim()} onClick={() => send({ reply: reply.trim() }, 'Reply sent')}>
          Reply, keep open
        </button>
        {request.status === 'open' ? (
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => send({ status: 'resolved' }, 'Marked resolved')}>
            <CheckCircle2 size={14} aria-hidden /> Mark resolved
          </button>
        ) : (
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => send({ status: 'open' }, 'Opened again')}>
            <RotateCcw size={14} aria-hidden /> Open again
          </button>
        )}
      </div>
    </article>
  )
}
