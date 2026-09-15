import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAdminAuth } from '@/hooks/useAuth'

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/settings', label: 'Settings', end: true },
]

export default function AdminLayout() {
  const { logout } = useAdminAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-700 text-white sticky top-0 z-20">
        <div className="page-pad flex items-center justify-between max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-2 font-bold text-lg">
            <span>🏠</span> Rent Ledger
          </div>

          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `btn-compact rounded-lg px-3 py-2 ${isActive ? 'bg-brand-800' : 'hover:bg-brand-600'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button className="btn-compact rounded-lg px-3 py-2 hover:bg-brand-600" onClick={handleLogout}>
              Log out
            </button>
          </nav>

          <button
            className="lg:hidden btn-compact rounded-lg px-3 hover:bg-brand-600"
            aria-label="Toggle menu"
            onClick={() => setMenuOpen((v) => !v)}
          >
            ☰
          </button>
        </div>

        {menuOpen && (
          <div className="lg:hidden border-t border-brand-600 flex flex-col">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className="px-4 py-3 min-h-[44px] flex items-center hover:bg-brand-600"
              >
                {item.label}
              </NavLink>
            ))}
            <button
              className="px-4 py-3 min-h-[44px] flex items-center text-left hover:bg-brand-600"
              onClick={handleLogout}
            >
              Log out
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 page-pad max-w-5xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}
