import { Repeat } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Alert, DemoBadge, EmptyState, ErrorState, PageHeader, Pagination, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'
import { useToast } from '../context/ToastContext'
import { api, queryString } from '../lib/api'
import type { WhatsAppMessage } from '../lib/types'
import { useAsync } from '../lib/useAsync'

const STATUS_LABELS: Record<WhatsAppMessage['status'], string> = {
  demo_recorded: 'Demo — not sent',
  queued: 'Waiting to send',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed',
  skipped: 'Not sent',
}
const STATUS_CLASS: Record<WhatsAppMessage['status'], string> = {
  demo_recorded: 'badge-demo',
  queued: 'pay-pending',
  sent: 'pay-pending',
  delivered: 'pay-paid',
  read: 'pay-paid',
  failed: 'pay-failed',
  skipped: 'badge-muted',
}

interface MessagesResponse {
  mode: 'off' | 'demo' | 'cloud_api'
  items: WhatsAppMessage[]
  total: number
  page: number
  pageSize: number
}

/** Every WhatsApp order update: in DEMO mode these are previews of what would have been sent. */
export function MessagesPage() {
  const { dateTime } = useStore()
  const { isManager } = useAuth()
  const toast = useToast()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const messages = useAsync(() => api.get<MessagesResponse>(`/api/staff/messages${queryString({ status, page, pageSize: 30 })}`), [status, page], {
    refreshEveryMs: 60_000,
  })

  async function retry(id: number) {
    try {
      await api.post(`/api/staff/messages/${id}/retry`)
      toast('Sending again')
      messages.reload()
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  const mode = messages.data?.mode
  return (
    <>
      <PageHeader
        title="WhatsApp log"
        subtitle="Order updates sent to customers who asked for them. Phone numbers are partly hidden."
        actions={
          <label className="inline-field">
            <span>Show</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value)
                setPage(1)
              }}
            >
              <option value="">All messages</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        }
      />
      {mode === 'demo' && (
        <Alert kind="warning" title="DEMO mode — nothing is sent to WhatsApp">
          Below are previews of the messages customers would receive. To send real messages, set up the WhatsApp Business Platform (Cloud API)
          and approved message templates — see docs/INTEGRATIONS.md.
        </Alert>
      )}
      {mode === 'off' && <Alert kind="info">WhatsApp updates are switched off (WHATSAPP_MODE=off). Customers still get every update in the app.</Alert>}
      <section className="card">
        {messages.error && !messages.data ? (
          <ErrorState error={messages.error} onRetry={messages.reload} />
        ) : !messages.data ? (
          <Spinner />
        ) : messages.data.items.length === 0 ? (
          <EmptyState title="No messages yet" message="When a customer who asked for WhatsApp updates places an order, the messages appear here." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Customer</th>
                    <th>Message</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.data.items.map((m) => (
                    <tr key={m.id}>
                      <td className="small">
                        {dateTime(m.createdAt)}
                        {m.orderNumber && (
                          <div>
                            <Link to={`/orders/${m.orderId}`}>{m.orderNumber}</Link>
                          </div>
                        )}
                      </td>
                      <td className="small">
                        {m.customerName ?? '—'}
                        <div className="muted">{m.toPhone ?? 'no number'}</div>
                        <div className="muted">{m.language === 'ta' ? 'Tamil' : 'English'}</div>
                      </td>
                      <td>
                        <p className="preview-text" lang={m.language}>
                          {m.previewText}
                        </p>
                        <div className="muted small">Template: {m.templateName}</div>
                      </td>
                      <td>
                        {m.status === 'demo_recorded' ? (
                          <DemoBadge label={STATUS_LABELS[m.status]} />
                        ) : (
                          <span className={`badge ${STATUS_CLASS[m.status]}`}>{STATUS_LABELS[m.status]}</span>
                        )}
                        {m.skipReason && <div className="muted small">{m.skipReason}</div>}
                        {m.error && <div className="small error-text">{m.error}</div>}
                        {m.status === 'failed' && m.mode === 'cloud_api' && isManager && (
                          <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => retry(m.id)}>
                            <Repeat size={14} aria-hidden /> Send again
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={messages.data.page} pageSize={messages.data.pageSize} total={Number(messages.data.total)} onPage={setPage} />
          </>
        )}
      </section>
    </>
  )
}
