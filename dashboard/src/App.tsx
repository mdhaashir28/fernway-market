import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router'
import { Layout } from './components/Layout'
import { Spinner } from './components/ui'
import { AuthProvider, useAuth } from './context/AuthContext'
import { StoreProvider } from './context/StoreContext'
import { ToastProvider } from './context/ToastContext'
import { CategoriesPage } from './pages/CategoriesPage'
import { DeliveryZonesPage } from './pages/DeliveryZonesPage'
import { LoginPage } from './pages/LoginPage'
import { LowStockPage } from './pages/LowStockPage'
import { MessagesPage } from './pages/MessagesPage'
import { OffersPage } from './pages/OffersPage'
import { OrderDetailPage } from './pages/OrderDetailPage'
import { OrdersPage } from './pages/OrdersPage'
import { OverviewPage } from './pages/OverviewPage'
import { ProductFormPage } from './pages/ProductFormPage'
import { ProductsPage } from './pages/ProductsPage'
import { SettingsPage } from './pages/SettingsPage'
import { StaffUsersPage } from './pages/StaffUsersPage'
import { StockHistoryPage } from './pages/StockHistoryPage'
import { SupportPage } from './pages/SupportPage'

/** Only lets logged-in staff through; everyone else goes to the login page. */
function RequireStaff({ children }: { children: ReactNode }) {
  const { user, checking } = useAuth()
  const location = useLocation()
  if (checking) return <Spinner label="Checking your login…" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <RequireStaff>
                    <Layout />
                  </RequireStaff>
                }
              >
                <Route index element={<OverviewPage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="orders/:id" element={<OrderDetailPage />} />
                <Route path="products" element={<ProductsPage />} />
                <Route path="products/new" element={<ProductFormPage />} />
                <Route path="products/:id" element={<ProductFormPage />} />
                <Route path="categories" element={<CategoriesPage />} />
                <Route path="low-stock" element={<LowStockPage />} />
                <Route path="delivery-zones" element={<DeliveryZonesPage />} />
                <Route path="stock-history" element={<StockHistoryPage />} />
                <Route path="support" element={<SupportPage />} />
                <Route path="messages" element={<MessagesPage />} />
                <Route path="offers" element={<OffersPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="staff" element={<StaffUsersPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </StoreProvider>
    </BrowserRouter>
  )
}
