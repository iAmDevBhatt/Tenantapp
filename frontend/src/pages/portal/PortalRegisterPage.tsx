import { FormEvent, useEffect, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { portalAuthApi } from '@/api/portalAuth'
import { errorMessage } from '@/api/client'
import { useTenantAuth } from '@/hooks/useAuth'
import { useLabels } from '@/hooks/useLabels'

export default function PortalRegisterPage() {
  const { authed, register } = useTenantAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const code = params.get('code') || ''
  const { l } = useLabels()

  const [checking, setChecking] = useState(true)
  const [valid, setValid] = useState(false)
  const [tenantName, setTenantName] = useState('')
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)
  const [existingLoginCount, setExistingLoginCount] = useState(0)

  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!code) {
      setChecking(false)
      return
    }
    portalAuthApi
      .validateCode(code)
      .then((r) => {
        setValid(r.valid)
        setTenantName(r.tenantName ?? '')
        setAlreadyRegistered(r.alreadyRegistered)
        setExistingLoginCount(r.existingLoginCount)
      })
      .finally(() => setChecking(false))
  }, [code])

  if (authed) return <Navigate to="/portal" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await register(code, username, password, fullName)
      navigate('/portal')
    } catch (err: any) {
      setError(errorMessage(err, l('error.createAccount', 'Could not create your account')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-800 to-brand-600 page-pad">
      <div className="card w-full max-w-sm p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="text-3xl mb-1">🏠</div>
          <h1 className="text-xl font-bold text-brand-800 dark:text-brand-200">{l('app.name', 'Rent Ledger')}</h1>
          <p className="text-sm text-slate-500">{l('register.subtitle', 'Set up your tenant portal login')}</p>
        </div>

        {checking ? (
          <p className="text-center text-slate-500 text-sm">{l('register.checkingInvite', 'Checking invite link…')}</p>
        ) : !code || !valid ? (
          <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">
            {l('error.invalidInvite', 'This invite link is invalid or has expired. Ask your landlord to send you a new one.')}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {tenantName && (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {l('register.welcome', 'Welcome, {tenantName}!').replace('{tenantName}', tenantName)}
              </p>
            )}
            {alreadyRegistered && (
              <div className="rounded-lg bg-amber-50 text-amber-700 px-3 py-2 text-sm">
                {l('register.alreadyRegisteredInfo', 'This flat already has {count} portal login(s). Registering below adds another, separate login sharing the same invoices.').replace('{count}', String(existingLoginCount))}{' '}
                <a className="underline" href="/portal/login">{l('register.signInInstead', 'Sign in instead')}</a>.
              </div>
            )}
            {error && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
            <div>
              <label className="field-label">{l('form.label.yourName', 'Your name')}</label>
              <input
                className="field-input"
                required
                autoFocus
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
              <p className="text-xs text-slate-500 mt-1">{l('form.hint.yourName', 'Shown to your landlord; only printed on the invoice if they choose to.')}</p>
            </div>
            <div>
              <label className="field-label">{l('form.label.chooseUsername', 'Choose a username')}</label>
              <input
                className="field-input"
                required
                minLength={3}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <p className="text-xs text-slate-500 mt-1">{l('form.hint.username', 'At least 3 characters.')}</p>
            </div>
            <div>
              <label className="field-label">{l('form.label.choosePassword', 'Choose a password')}</label>
              <input
                className="field-input"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-slate-500 mt-1">{l('form.hint.password', 'At least 8 characters.')}</p>
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? l('btn.creatingAccount', 'Creating account…') : l('btn.createAccount', 'Create Account')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
