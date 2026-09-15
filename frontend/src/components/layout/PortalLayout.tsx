import { Outlet, useNavigate } from 'react-router-dom'
import { useTenantAuth } from '@/hooks/useAuth'

export default function PortalLayout() {
  const { logout } = useTenantAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/portal/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-700 text-white sticky top-0 z-20">
        <div className="page-pad flex items-center justify-between max-w-3xl mx-auto w-full">
          <div className="flex items-center gap-2 font-bold text-lg">
            <span>🏠</span> Rent Ledger
          </div>
          <button className="btn-compact rounded-lg px-3 py-2 hover:bg-brand-600" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>
      <main className="flex-1 page-pad max-w-3xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
