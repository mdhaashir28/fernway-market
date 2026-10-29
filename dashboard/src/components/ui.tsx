// Small building blocks used across the dashboard.
import {
  Ban,
  Bike,
  CircleCheck,
  CircleCheckBig,
  ChevronLeft,
  ChevronRight,
  Clock,
  FlaskConical,
  ImageOff,
  Inbox,
  LoaderCircle,
  Lock,
  PackageCheck,
  ShoppingBasket,
  Store,
  TriangleAlert,
  Undo2,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { imageSrc } from '../lib/api'
import { PAYMENT_STATUS_LABELS, STATUS_LABELS } from '../lib/format'
import type { FulfillmentType, ImageCredit, OrderStatus, PaymentStatus, StockStatus } from '../lib/types'

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

// Every status has its own colour AND icon AND words, so it never relies on colour alone.
const STATUS_ICONS: Record<OrderStatus, LucideIcon> = {
  awaiting_payment: Clock,
  confirmed: CircleCheck,
  preparing: ShoppingBasket,
  ready_for_pickup: Store,
  out_for_delivery: Bike,
  completed: CircleCheckBig,
  cancelled: Ban,
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const Icon = STATUS_ICONS[status] ?? CircleCheck
  return (
    <span className={`badge status-${status}`}>
      <Icon size={13} aria-hidden /> {STATUS_LABELS[status] ?? status}
    </span>
  )
}

export function FulfillmentBadge({ type }: { type: FulfillmentType }) {
  const Icon = type === 'delivery' ? Bike : Store
  return (
    <span className={`badge type-${type}`}>
      <Icon size={13} aria-hidden /> {type === 'delivery' ? 'Delivery' : 'Pickup'}
    </span>
  )
}

const PAYMENT_ICONS: Record<PaymentStatus, LucideIcon> = {
  unpaid: Wallet,
  pending: Clock,
  failed: TriangleAlert,
  paid: CircleCheck,
  refund_pending: Undo2,
  partially_refunded: Undo2,
  refunded: Undo2,
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const Icon = PAYMENT_ICONS[status] ?? Wallet
  return (
    <span className={`badge pay-${status}`}>
      <Icon size={13} aria-hidden /> {PAYMENT_STATUS_LABELS[status] ?? status}
    </span>
  )
}

/** Marks anything that is only a demo (no real money / no real WhatsApp messages). */
export function DemoBadge({ label = 'DEMO' }: { label?: string }) {
  return (
    <span className="badge badge-demo">
      <FlaskConical size={13} aria-hidden /> {label}
    </span>
  )
}

/** Shown to staff next to things only a manager can change. */
export function ManagerOnly({ children = 'Only a manager can change this.' }: { children?: ReactNode }) {
  return (
    <p className="manager-only">
      <Lock size={14} aria-hidden /> {children}
    </p>
  )
}

export function Alert({ kind = 'info', title, children }: { kind?: 'info' | 'warning' | 'error' | 'success'; title?: string; children?: ReactNode }) {
  const Icon = kind === 'success' ? PackageCheck : kind === 'info' ? Inbox : TriangleAlert
  return (
    <div className={`alert alert-flex alert-${kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <Icon size={18} aria-hidden className="alert-icon" />
      <div>
        {title && <strong>{title}</strong>}
        {title && children ? <br /> : null}
        {children}
      </div>
    </div>
  )
}

export function StockBadge({ status, quantity }: { status: StockStatus; quantity: number }) {
  if (status === 'out_of_stock') return <span className="badge stock-out">Out of stock</span>
  if (status === 'low_stock') return <span className="badge stock-low">Low · {quantity}</span>
  return <span className="badge stock-ok">{quantity} in stock</span>
}

/**
 * Product or category photo. Without a photo (or if it fails to load) it shows a
 * clearly labelled "Image needed" placeholder — never an emoji or a stand-in picture.
 */
export function ProductThumb({ imageUrl, size = 44 }: { imageUrl: string | null; size?: number }) {
  const src = imageSrc(imageUrl)
  // Remember which address failed, so a new photo is tried again.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = failedSrc !== null && failedSrc === src
  return (
    <span className={`thumb ${src && !failed ? '' : 'thumb-empty'}`} style={{ width: size, height: size }} aria-hidden>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailedSrc(src)} />
      ) : (
        <>
          <ImageOff size={Math.max(14, Math.round(size * 0.32))} />
          {size >= 80 && <span className="thumb-label">Image needed</span>}
        </>
      )}
    </span>
  )
}

/** Who made a catalogue photo and its licence, or the source staff noted when uploading it. */
export function PhotoCredit({ credit }: { credit: ImageCredit | null }) {
  if (!credit) return <p className="hint">Source not recorded — replace the photo and say where it is from.</p>
  if (credit.kind === 'store') return <p className="hint">Source: {credit.note}</p>
  return (
    <p className="hint">
      Photo: {credit.author ?? 'unknown author'}
      {credit.licence && (
        <>
          {' · '}
          {credit.licenceUrl ? (
            <a href={credit.licenceUrl} target="_blank" rel="noreferrer">
              {credit.licence}
            </a>
          ) : (
            credit.licence
          )}
        </>
      )}
      {credit.sourceUrl && (
        <>
          {' · '}
          <a href={credit.sourceUrl} target="_blank" rel="noreferrer">
            original
          </a>
        </>
      )}
    </p>
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
