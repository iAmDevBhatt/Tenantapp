import { useEffect, useState } from 'react'
import { invitesApi } from '@/api/invites'
import { tenantsApi } from '@/api/tenants'
import { InviteStatus, Tenant, PortalUser } from '@/types/tenant'
import { useLabels } from '@/hooks/useLabels'
import { useAppConfig } from '@/hooks/useAppConfig'

interface Props {
  tenantId: string
  tenant?: Tenant
  onTenantUpdated?: (t: Tenant) => void
}

export default function InviteCodeCard({ tenantId, tenant, onTenantUpdated }: Props) {
  const [status, setStatus] = useState<InviteStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const { l } = useLabels()
  const { appOrigin } = useAppConfig()

  async function load() {
    setLoading(true)
    try {
      setStatus(await invitesApi.get(tenantId))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  function registerUrl(code: string) {
    return `${appOrigin()}/portal/register?code=${code}`
  }

  async function handleGenerate() {
    await invitesApi.generate(tenantId)
    setCopied(false)
    await load()
  }

  async function handleCopy(code: string) {
    try {
      await navigator.clipboard.writeText(registerUrl(code))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard may be unavailable (non-HTTPS, permissions)
    }
  }

  if (loading) return <p className="text-sm text-slate-500">{l('status.loading', 'Loading…')}</p>

  const portalUsers = tenant?.portalUsers ?? []
  const hasAnyLogin = portalUsers.length > 0

  return (
    <div className="space-y-4">
      {hasAnyLogin && (
        <div className="space-y-3">
          <p className="text-sm font-medium">{l('invite.portalLogins', 'Portal logins')}</p>
          {portalUsers.map((pu) => (
            <PortalUserRow
              key={pu.id}
              tenantId={tenantId}
              user={pu}
              onUpdated={(t) => onTenantUpdated?.(t)}
              l={l}
            />
          ))}
        </div>
      )}

      <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {hasAnyLogin
            ? l('invite.descriptionCoTenant', 'Generate another invite link to let a co-tenant sharing this flat create their own separate login.')
            : l('invite.description', 'Generate an invite link so this tenant can create their own portal login to view their invoices.')}
        </p>
        {status?.invite && (
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm break-all">
            {registerUrl(status.invite.code)}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary btn-compact" onClick={handleGenerate}>
            {status?.invite
              ? (hasAnyLogin ? l('btn.generateCoTenantInvite', 'Generate co-tenant invite link') : l('btn.regenerateInvite', 'Regenerate invite link'))
              : l('btn.generateInvite', 'Generate invite link')}
          </button>
          {status?.invite && (
            <button className="btn-secondary btn-compact" onClick={() => handleCopy(status.invite!.code)}>
              {copied ? l('btn.copied', 'Copied!') : l('btn.copyLink', 'Copy link')}
            </button>
          )}
        </div>
        {status?.invite && (
          <p className="text-xs text-slate-500">
            {l('invite.expires', 'Expires {date}.').replace('{date}', new Date(status.invite.expiresAt).toLocaleDateString())}
            {' '}{l('invite.regenerateNote', 'Regenerating replaces this link.')}
          </p>
        )}
      </div>
    </div>
  )
}

interface PortalUserRowProps {
  tenantId: string
  user: PortalUser
  onUpdated: (t: Tenant) => void
  l: (key: string, fallback: string) => string
}

function PortalUserRow({ tenantId, user, onUpdated, l }: PortalUserRowProps) {
  const [blocking, setBlocking] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [fullName, setFullName] = useState(user.fullName)
  const [newPassword, setNewPassword] = useState<string | null>(null)
  const [passwordCopied, setPasswordCopied] = useState(false)

  useEffect(() => {
    setFullName(user.fullName)
  }, [user.fullName])

  async function handleToggleBlock() {
    setBlocking(true)
    try {
      onUpdated(await tenantsApi.togglePortalBlock(tenantId, user.id))
    } finally {
      setBlocking(false)
    }
  }

  async function handleResetPassword() {
    setResetting(true)
    try {
      const { password } = await tenantsApi.resetPortalPassword(tenantId, user.id)
      setNewPassword(password)
      setPasswordCopied(false)
    } finally {
      setResetting(false)
    }
  }

  async function handleCopyPassword() {
    if (!newPassword) return
    try {
      await navigator.clipboard.writeText(newPassword)
      setPasswordCopied(true)
      setTimeout(() => setPasswordCopied(false), 2000)
    } catch {
      // clipboard may be unavailable (non-HTTPS, permissions)
    }
  }

  async function handleDelete() {
    if (!confirm(l('confirm.deletePortalAccount', "Delete this portal login? They will need to register again with a new invite link."))) return
    setDeleting(true)
    try {
      onUpdated(await tenantsApi.deletePortalAccount(tenantId, user.id))
    } finally {
      setDeleting(false)
    }
  }

  async function handleSaveName() {
    if (fullName === user.fullName) return
    setSavingName(true)
    try {
      onUpdated(await tenantsApi.updatePortalUser(tenantId, user.id, { fullName }))
    } finally {
      setSavingName(false)
    }
  }

  async function handleToggleShowOnInvoice() {
    onUpdated(await tenantsApi.updatePortalUser(tenantId, user.id, { showOnInvoice: !user.showOnInvoice }))
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium font-mono">{user.username}</p>
        </div>
        <span className={`text-xs rounded-full px-2 py-0.5 ${user.portalAccessBlocked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {user.portalAccessBlocked ? l('invite.statusBlocked', 'Blocked') : l('invite.statusActive', 'Active')}
        </span>
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="field-label">{l('invite.fullName', 'Name (for invoice)')}</label>
          <input
            className="field-input"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            onBlur={handleSaveName}
            placeholder={l('invite.fullNamePlaceholder', "This person's name")}
          />
        </div>
        {savingName && <span className="text-xs text-slate-400 pb-2">{l('btn.saving', 'Saving…')}</span>}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={user.showOnInvoice} onChange={handleToggleShowOnInvoice} />
        {l('invite.showOnInvoice', 'Show this name on the invoice')}
      </label>

      {newPassword && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 space-y-2">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {l('invite.newPassword', 'New password')}
          </p>
          <div className="rounded-lg bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono break-all">
            {newPassword}
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {l('invite.newPasswordNote', "Copy and share this now — it won't be shown again.")}
            </p>
            <button className="btn-secondary btn-compact shrink-0" onClick={handleCopyPassword}>
              {passwordCopied ? l('btn.copied', 'Copied!') : l('btn.copyPassword', 'Copy password')}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          className={`btn-compact ${user.portalAccessBlocked ? 'btn-primary' : 'btn-danger'}`}
          onClick={handleToggleBlock}
          disabled={blocking}
        >
          {blocking
            ? l('btn.saving', 'Saving…')
            : user.portalAccessBlocked
              ? l('btn.unblockAccess', 'Unblock access')
              : l('btn.blockAccess', 'Block access')}
        </button>
        <button className="btn-secondary btn-compact" onClick={handleResetPassword} disabled={resetting}>
          {resetting ? l('btn.saving', 'Saving…') : l('btn.resetPassword', 'Reset password')}
        </button>
        <button className="btn-danger btn-compact" onClick={handleDelete} disabled={deleting}>
          {deleting ? l('btn.saving', 'Saving…') : l('btn.deletePortalAccount', 'Delete portal account')}
        </button>
      </div>
    </div>
  )
}
