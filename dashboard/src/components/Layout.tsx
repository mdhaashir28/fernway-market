import {
  BadgePercent,
  History,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MapPin,
  MessageCircle,
  Package,
  Settings,
  ShoppingBag,
  Tags,
  TriangleAlert,
  Users,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { useStore } from '../context/StoreContext'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/support', label: 'Customer help', icon: LifeBuoy },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/categories', label: 'Categories', icon: Tags },
  { to: '/low-stock', label: 'Low stock', icon: TriangleAlert },
  { to: '/stock-history', label: 'Stock history', icon: History },
  { to: '/delivery-zones', label: 'Delivery zones', icon: MapPin },
  { to: '/offers', label: 'Offers', icon: BadgePercent },
  { to: '/messages', label: 'WhatsApp log', icon: MessageCircle },
  { to: '/settings', label: 'Store settings', icon: Settings },
  { to: '/staff', label: 'Staff accounts', icon: Users, managerOnly: true },
]

export function Logo() {
  return (
    <svg viewBox="0 0 64 64" width="36" height="36" aria-hidden>
      <rect width="64" height="64" rx="16" fill="#F2A93B" />
      <path
        d="M46 16C30 16 18 26 18 42c0 2 .3 4 .8 6 2.2-9.6 9-17.6 18.2-21.6-7.2 5.6-12.4 13.6-14 22.6 2 .6 4 1 6 1 16 0 24-12 24-26 0-3-.4-6-1-8z"
        fill="#134D32"
      />
    </svg>
  )
}

export function Layout() {
  const { user, isManager, logout } = useAuth()
  const { store } = useStore()

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <Logo />
          <div>
            <strong>{store.name}</strong>
            <span>Staff dashboard</span>
          </div>
        </div>
        <nav aria-label="Main">
          {NAV.filter((item) => !item.managerOnly || isManager).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <Icon size={18} aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip" title={user?.email}>
            <span className="avatar" aria-hidden>
              {user?.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="user-name">
              {user?.name}
              <span className={`badge badge-small ${isManager ? 'badge-manager' : 'badge-muted'}`}>{isManager ? 'Manager' : 'Staff'}</span>
            </span>
          </div>
          <button className="nav-link logout" onClick={logout}>
            <LogOut size={18} aria-hidden />
            <span>Log out</span>
          </button>
        </div>
      </aside>
      <main id="main" className="main">
        <Outlet />
      </main>
    </div>
  )
}
