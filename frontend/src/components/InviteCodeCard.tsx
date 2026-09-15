import { useEffect, useState } from 'react'
import { invitesApi } from '@/api/invites'
import { InviteStatus } from '@/types/tenant'
import { useLabels } from '@/hooks/useLabels'

export default function InviteCodeCard({ tenantId }: { tenantId: string }) {
  const [status, setStatus] = useState<InviteStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const { l } = useLabels()

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
    return `${window.location.origin}/portal/register?code=${code}`
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
      // clipboard may be unavailable (non-HTTPS, permissions) -- link is still shown to copy manually
    }
  }

  if (loading) return <p className="text-sm text-slate-500">{l('status.loading', 'Loading…')}</p>

  if (status?.hasRegistered) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {l('invite.alreadyRegistered', 'This tenant already has a portal login. They can sign in at /portal/login.')}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {l('invite.description', 'Generate an invite link so this tenant can create their own portal login to view their invoices.')}
      </p>
      {status?.invite && (
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm break-all">
          {registerUrl(status.invite.code)}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary btn-compact" onClick={handleGenerate}>
          {status?.invite ? l('btn.regenerateInvite', 'Regenerate invite link') : l('btn.generateInvite', 'Generate invite link')}
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
  )
}
