import { Navigate, Route, Routes } from 'react-router-dom'
import { useAdminAuth, useTenantAuth } from '@/hooks/useAuth'

import AdminLayout from '@/components/layout/AdminLayout'
import PortalLayout from '@/components/layout/PortalLayout'

import LoginPage from '@/pages/admin/LoginPage'
import DashboardPage from '@/pages/admin/DashboardPage'
import TenantDetailPage from '@/pages/admin/TenantDetailPage'
import NewInvoicePage from '@/pages/admin/NewInvoicePage'
import InvoiceDetailPage from '@/pages/admin/InvoiceDetailPage'
import SettingsPage from '@/pages/admin/SettingsPage'

import PortalLoginPage from '@/pages/portal/PortalLoginPage'
import PortalRegisterPage from '@/pages/portal/PortalRegisterPage'
import PortalDashboardPage from '@/pages/portal/PortalDashboardPage'
import PortalInvoiceViewPage from '@/pages/portal/PortalInvoiceViewPage'

function RequireAdmin({ children }: { children: JSX.Element }) {
  const { authed } = useAdminAuth()
  return authed ? children : <Navigate to="/login" replace />
}

function RequireTenant({ children }: { children: JSX.Element }) {
  const { authed } = useTenantAuth()
  return authed ? children : <Navigate to="/portal/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="tenants/:tenantId" element={<TenantDetailPage />} />
        <Route path="tenants/:tenantId/new-invoice" element={<NewInvoicePage />} />
        <Route path="invoices/:invoiceId" element={<InvoiceDetailPage />} />
      </Route>

      <Route path="/portal/login" element={<PortalLoginPage />} />
      <Route path="/portal/register" element={<PortalRegisterPage />} />

      <Route
        path="/portal"
        element={
          <RequireTenant>
            <PortalLayout />
          </RequireTenant>
        }
      >
        <Route index element={<PortalDashboardPage />} />
        <Route path="invoices/:invoiceId" element={<PortalInvoiceViewPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
