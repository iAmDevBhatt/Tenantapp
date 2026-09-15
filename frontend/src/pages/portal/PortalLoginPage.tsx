import { FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useTenantAuth } from '@/hooks/useAuth'

export default function PortalLoginPage() {
  const { authed, login } = useTenantAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  if (authed) return <Navigate to="/portal" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login(username, password)
      navigate('/portal')
    } catch {
      setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-800 to-brand-600 page-pad">
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="text-3xl mb-1">🏠</div>
          <h1 className="text-xl font-bold text-brand-800 dark:text-brand-200">Rent Ledger</h1>
          <p className="text-sm text-slate-500">Tenant portal</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
          <div>
            <label className="field-label">Username</label>
            <input className="field-input" required autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Password</label>
            <input className="field-input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="text-center text-xs text-slate-400 mt-6">
          No account yet? Ask your landlord for an invite link.
        </p>
      </div>
    </div>
  )
}
