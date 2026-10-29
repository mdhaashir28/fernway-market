import { KeyRound, LoaderCircle, Plus } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, ErrorState, Field, ManagerOnly, Modal, PageHeader, Spinner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ApiError, api } from '../lib/api'
import type { StaffUser } from '../lib/types'
import { useAsync } from '../lib/useAsync'

/** Managers: add staff, change roles, reset passwords, switch accounts off. */
export function StaffUsersPage() {
  const { user, isManager } = useAuth()
  const toast = useToast()
  const users = useAsync(() => (isManager ? api.get<{ items: StaffUser[] }>('/api/staff/users').then((r) => r.items) : Promise.resolve([])), [isManager])
  const [dialog, setDialog] = useState<{ mode: 'new' } | { mode: 'password'; user: StaffUser } | null>(null)

  if (!isManager) return <ManagerOnly>Only managers can see and change staff accounts.</ManagerOnly>

  async function update(target: StaffUser, changes: Partial<Pick<StaffUser, 'role' | 'isActive'>>, message: string) {
    try {
      await api.patch(`/api/staff/users/${target.id}`, changes)
      toast(message)
      users.reload()
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  return (
    <>
      <PageHeader
        title="Staff accounts"
        subtitle="Staff run orders, stock, photos and customer help. Managers can also change prices, settings, delivery zones, offers, refunds and staff accounts."
        actions={
          <button className="btn btn-primary" onClick={() => setDialog({ mode: 'new' })}>
            <Plus size={16} aria-hidden /> Add staff member
          </button>
        }
      />
      <section className="card">
        {users.error && !users.data ? (
          <ErrorState error={users.error} onRetry={users.reload} />
        ) : !users.data ? (
          <Spinner />
        ) : users.data.length === 0 ? (
          <EmptyState title="No staff accounts" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.data.map((u) => {
                  const isMe = u.id === user?.id
                  return (
                    <tr key={u.id} className={u.isActive ? '' : 'row-muted'}>
                      <td>
                        <div className="strong">
                          {u.name} {isMe && <span className="muted small">(you)</span>}
                        </div>
                        <div className="muted small">{u.email}</div>
                      </td>
                      <td>
                        <select
                          aria-label={`Role of ${u.name}`}
                          value={u.role}
                          disabled={isMe}
                          onChange={(e) => update(u, { role: e.target.value as StaffUser['role'] }, `${u.name} is now ${e.target.value === 'manager' ? 'a manager' : 'staff'}`)}
                        >
                          <option value="staff">Staff</option>
                          <option value="manager">Manager</option>
                        </select>
                      </td>
                      <td>{u.isActive ? <span className="badge stock-ok">Active</span> : <span className="badge badge-muted">Switched off</span>}</td>
                      <td className="num">
                        <div className="button-row" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => setDialog({ mode: 'password', user: u })}>
                            <KeyRound size={14} aria-hidden /> New password
                          </button>
                          {!isMe && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => update(u, { isActive: !u.isActive }, u.isActive ? `${u.name} can no longer log in` : `${u.name} can log in again`)}
                            >
                              {u.isActive ? 'Switch off' : 'Switch on'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {dialog && (
        <UserDialog
          target={dialog.mode === 'password' ? dialog.user : null}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            users.reload()
          }}
        />
      )}
    </>
  )
}

function UserDialog({ target, onClose, onSaved }: { target: StaffUser | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'staff' | 'manager'>('staff')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (password.length < 10) return setErrors({ password: 'Use at least 10 characters' })
    setSaving(true)
    setErrors({})
    try {
      if (target) {
        await api.patch(`/api/staff/users/${target.id}`, { password })
        toast(`New password set for ${target.name}`)
      } else {
        await api.post('/api/staff/users', { name: name.trim(), email: email.trim(), role, password })
        toast(`${name.trim()} can now log in`)
      }
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
      title={target ? `New password for ${target.name}` : 'Add a staff member'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>
            {saving && <LoaderCircle className="spin" size={16} aria-hidden />} {target ? 'Set password' : 'Add'}
          </button>
        </>
      }
    >
      {errors.form && <div className="alert alert-error">{errors.form}</div>}
      {!target && (
        <>
          <Field label="Name" htmlFor="user-name" error={errors.name} required>
            <input id="user-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Email" htmlFor="user-email" error={errors.email} required>
            <input id="user-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Role" htmlFor="user-role">
            <select id="user-role" value={role} onChange={(e) => setRole(e.target.value as 'staff' | 'manager')}>
              <option value="staff">Staff — orders, stock, photos, customer help</option>
              <option value="manager">Manager — everything, including prices, settings and refunds</option>
            </select>
          </Field>
        </>
      )}
      <Field label="Password" htmlFor="user-password" error={errors.password} hint="At least 10 characters. Give it to them in person, not by message." required>
        <input id="user-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
    </Modal>
  )
}
