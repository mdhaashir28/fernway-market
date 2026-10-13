// Small building blocks used across the dashboard.
import { ChevronLeft, ChevronRight, Inbox, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { imageSrc } from '../lib/api'
import { STATUS_LABELS } from '../lib/format'
import type { FulfillmentType, OrderStatus, StockStatus } from '../lib/types'

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state state-loading" role="status">
      <LoaderCircle className="spin" size={22} aria-hidden />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <TriangleAlert size={22} aria-hidden />
      <div>
        <strong>Something went wrong</strong>
        <p>{error.message}</p>
      </div>
      {onRetry && (
        <button className="btn btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="state state-empty">
      <Inbox size={28} aria-hidden />
      <strong>{title}</strong>
      {message && <p className="muted">{message}</p>}
      {action}
    </div>
  )
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge status-${status}`}>{STATUS_LABELS[status]}</span>
}

export function FulfillmentBadge({ type }: { type: FulfillmentType }) {
  return <span className={`badge type-${type}`}>{type === 'delivery' ? '🚚 Delivery' : '🏪 Pickup'}</span>
}

export function StockBadge({ status, quantity }: { status: StockStatus; quantity: number }) {
  if (status === 'out_of_stock') return <span className="badge stock-out">Out of stock</span>
  if (status === 'low_stock') return <span className="badge stock-low">Low · {quantity}</span>
  return <span className="badge stock-ok">{quantity} in stock</span>
}

/** Product photo, or its emoji on a tinted square when there is no photo. */
export function ProductThumb({ imageUrl, icon, size = 44 }: { imageUrl: string | null; icon: string | null; size?: number }) {
  const src = imageSrc(imageUrl)
  return (
    <span className="thumb" style={{ width: size, height: size, fontSize: size * 0.55 }} aria-hidden>
      {src ? <img src={src} alt="" /> : icon || '🛒'}
    </span>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav className="pagination" aria-label="Pages">
      <span className="muted">
        {from}–{to} of {total}
      </span>
      <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft size={16} aria-hidden /> Previous
      </button>
      <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next <ChevronRight size={16} aria-hidden />
      </button>
    </nav>
  )
}

/** A pop-up dialog using the browser's built-in <dialog> (handles focus and the Esc key). */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog ref={ref} className="modal" onClose={onClose} aria-labelledby="modal-title">
      {open && (
        <>
          <div className="modal-header">
            <h2 id="modal-title">{title}</h2>
            <button className="icon-button" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-footer">{footer}</div>}
        </>
      )}
    </dialog>
  )
}

/** A labelled form field with an optional hint and error message. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  required,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: ReactNode
  required?: boolean
}) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={htmlFor}>
        {label}
        {required && <span className="required" aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && <p className="hint">{hint}</p>}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
