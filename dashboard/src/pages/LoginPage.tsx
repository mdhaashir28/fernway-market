import { Eye, EyeOff, LoaderCircle, MapPin, Phone } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { Logo } from '../components/Layout'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'

export function LoginPage() {
  const { user, login } = useAuth()
  const { store } = useStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/'
  if (user) return <Navigate to={from} replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <section className="login-brand" aria-label="Store details">
        <Logo />
        <h2>{store.name}</h2>
        <p>Manage orders, products and stock — all in one place.</p>
        {(store.address || store.phones.length > 0) && (
          <ul className="login-contact">
            {store.address && (
              <li>
                <MapPin size={18} aria-hidden /> {store.address}
              </li>
            )}
            {store.phones.map((phone) => (
              <li key={phone.tel}>
                <Phone size={18} aria-hidden /> <a href={`tel:${phone.tel}`}>{phone.display}</a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="login-panel">
        <form className="login-form card" onSubmit={handleSubmit} noValidate>
          <h1>Staff login</h1>
          <p className="muted">Sign in with your store staff account.</p>

          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="input-with-button">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
            {submitting && <LoaderCircle className="spin" size={18} aria-hidden />}
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="hint">
            {import.meta.env.DEV ? (
              <>
                First time? The sample staff login for this computer is in your project's <code>.env</code> file
                (SEED_STAFF_EMAIL / SEED_STAFF_PASSWORD).
              </>
            ) : (
              <>
                Demo site: the staff login for this live site is in <code>.env.vercel.local</code> in your project folder
                (or in Vercel → API project → Settings → Environment Variables). It is different from your local login.
              </>
            )}
          </p>
        </form>
      </section>
    </div>
  )
}
