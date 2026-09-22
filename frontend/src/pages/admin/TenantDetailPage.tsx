import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { adminClient } from '@/api/adminClient'
import { tenantsApi } from '@/api/tenants'
import { invoicesApi } from '@/api/invoices'
import { meterSubmissionsApi } from '@/api/meterSubmissions'
import { Tenant } from '@/types/tenant'
import { Invoice } from '@/types/invoice'
import { MeterSubmission } from '@/types/meterSubmission'
import { formatINR } from '@/utils/formulas'
import { fetchAuthedBlob, triggerBlobDownload } from '@/utils/blob'
import TenantForm from '@/components/TenantForm'
import TenantAvatar from '@/components/TenantAvatar'
import DocumentList from '@/components/DocumentList'
import InviteCodeCard from '@/components/InviteCodeCard'
import { useLabels } from '@/hooks/useLabels'

type Tab = 'profile' | 'documents' | 'invoices' | 'invite' | 'meter'

const PHOTO_TYPE_LABELS: Record<string, string> = {
  flat_meter: 'Flat Meter',
  water_meter: 'Water Meter',
  property: 'Whole Property',
  other: 'Other',
}

export default function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [tab, setTab] = useState<Tab>('profile')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [downloadingAll, setDownloadingAll] = useState(false)
  const { l } = useLabels()

  const [submissions, setSubmissions] = useState<MeterSubmission[]>([])
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')

  const TAB_LABELS: Record<Tab, string> = {
    profile: l('tab.profile', 'Profile'),
    documents: l('tab.documents', 'Documents'),
    invoices: l('tab.invoices', 'Invoices'),
    invite: l('tab.invite', 'Invite'),
    meter: l('tab.meterPhotos', 'Meter Photos'),
  }

  async function load() {
    if (!tenantId) return
    setLoading(true)
    try {
      const [t, inv, subs] = await Promise.all([
        tenantsApi.get(tenantId),
        invoicesApi.listForTenant(tenantId),
        meterSubmissionsApi.listForTenant(tenantId),
      ])
      setTenant(t)
      setInvoices(inv)
      setSubmissions(subs)
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(ms: MeterSubmission) {
    if (!tenantId) return
    const updated = await meterSubmissionsApi.review(tenantId, ms.id, 'approve')
    setSubmissions((prev) => prev.map((s) => (s.id === ms.id ? updated : s)))
  }

  async function handleReject(ms: MeterSubmission) {
    if (!tenantId) return
    const updated = await meterSubmissionsApi.review(tenantId, ms.id, 'reject', rejectNotes || undefined)
    setSubmissions((prev) => prev.map((s) => (s.id === ms.id ? updated : s)))
    setRejectingId(null)
    setRejectNotes('')
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  async function handleUpdate(data: Parameters<typeof tenantsApi.update>[1]) {
    if (!tenantId) return
    const t = await tenantsApi.update(tenantId, data)
    setTenant(t)
    setEditing(false)
  }

  async function handleDeactivate() {
    if (!tenantId || !confirm(l('confirm.deactivate', 'Mark this tenant as moved out? Their invoice history is kept.'))) return
    setTenant(await tenantsApi.deactivate(tenantId))
  }

  async function handleReactivate() {
    if (!tenantId) return
    setTenant(await tenantsApi.reactivate(tenantId))
  }

  async function handleDeleteTenant() {
    if (!tenantId || !tenant) return
    const message = l(
      'confirm.deleteTenant',
      'Permanently delete {name}? This removes all their invoices, documents, photos, and portal login. This cannot be undone.',
    ).replace('{name}', tenant.name)
    if (!confirm(message)) return
    await tenantsApi.delete(tenantId)
    navigate('/')
  }

  async function handleProfilePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !tenantId) return
    const updated = await tenantsApi.uploadProfilePhoto(tenantId, file)
    setTenant(updated)
  }

  async function handleDeleteProfilePhoto() {
    if (!tenantId) return
    const updated = await tenantsApi.deleteProfilePhoto(tenantId)
    setTenant(updated)
  }

  async function handleDownloadAll() {
    if (!tenant) return
    setDownloadingAll(true)
    try {
      const url = await fetchAuthedBlob(adminClient, tenantsApi.downloadAllDocsUrl(tenant.id))
      triggerBlobDownload(url, `${tenant.name.replace(/\s+/g, '_')}-documents.zip`)
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingAll(false)
    }
  }

  if (loading || !tenant) return <p className="text-slate-500">{l('status.loading', 'Loading…')}</p>

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-brand-600 hover:underline">{l('nav.allTenants', '← All tenants')}</Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <TenantAvatar tenantId={tenant.id} hasProfilePhoto={tenant.hasProfilePhoto} name={tenant.name} size="lg" />
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              {tenant.name}
              {!tenant.active && (
                <span className="text-xs bg-slate-200 dark:bg-slate-700 rounded-full px-2 py-0.5">
                  {l('status.movedOut', 'Moved out')}
                </span>
              )}
            </h1>
            <p className="text-slate-500 text-sm">{tenant.propertyAddress}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to={`/tenants/${tenant.id}/new-invoice`} className="btn-primary">{l('btn.newInvoice', '+ New invoice')}</Link>
          {tenant.active ? (
            <button className="btn-secondary" onClick={handleDeactivate}>{l('btn.markMovedOut', 'Mark moved out')}</button>
          ) : (
            <button className="btn-secondary" onClick={handleReactivate}>{l('btn.reactivate', 'Reactivate')}</button>
          )}
          <button className="btn-danger" onClick={handleDeleteTenant}>{l('btn.deleteTenant', 'Delete tenant')}</button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {(['profile', 'documents', 'invoices', 'invite', 'meter'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`btn-compact rounded-none border-b-2 ${tab === t ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-500'}`}
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="card p-4 sm:p-6">
          {editing ? (
            <TenantForm
              initial={tenant}
              submitLabel={l('btn.saveChanges', 'Save changes')}
              onSubmit={handleUpdate}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <TenantAvatar tenantId={tenant.id} hasProfilePhoto={tenant.hasProfilePhoto} name={tenant.name} size="lg" />
                <div className="flex gap-2 flex-wrap">
                  <label className="btn-secondary btn-compact cursor-pointer">
                    {tenant.hasProfilePhoto ? l('btn.replacePhoto', 'Replace photo') : l('btn.uploadPhoto', 'Upload photo')}
                    <input type="file" accept="image/*" className="hidden" onChange={handleProfilePhotoUpload} />
                  </label>
                  {tenant.hasProfilePhoto && (
                    <button className="btn-danger btn-compact" onClick={handleDeleteProfilePhoto}>
                      {l('btn.remove', 'Remove')}
                    </button>
                  )}
                </div>
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <Field label={l('field.phone', 'Phone')} value={tenant.phone || '—'} />
                <Field label={l('field.monthlyRent', 'Monthly Rent')} value={formatINR(tenant.monthlyRent)} />
                <Field label={l('field.roomRate', 'Room Rate')} value={`${formatINR(tenant.roomRate)}/unit`} />
                <Field label={l('field.waterRate', 'Water Rate')} value={`${formatINR(tenant.waterRate)}/unit`} />
                <Field label={l('field.waterSharedBy', 'Water Shared By')} value={String(tenant.waterDivisor)} />
                <Field label={l('field.upiId', 'UPI ID')} value={tenant.upiId || '—'} />
                <Field label={l('field.moveInDate', 'Move-in Date')} value={tenant.moveInDate} />
                {tenant.moveOutDate && <Field label={l('field.moveOutDate', 'Move-out Date')} value={tenant.moveOutDate} />}
                {tenant.permanentAddress && (
                  <div className="sm:col-span-2">
                    <Field label={l('field.permanentAddress', 'Permanent Address')} value={tenant.permanentAddress} />
                  </div>
                )}
                {tenant.emergencyContactName && (
                  <Field label={l('field.emergencyContactName', 'Emergency Contact')} value={tenant.emergencyContactName} />
                )}
                {tenant.emergencyContactPhone && (
                  <Field label={l('field.emergencyContactPhone', 'Emergency Phone')} value={tenant.emergencyContactPhone} />
                )}
              </dl>
              <button className="btn-secondary" onClick={() => setEditing(true)}>{l('btn.editDetails', 'Edit details')}</button>
            </div>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div className="card p-4 sm:p-6 space-y-3">
          <div className="flex justify-end">
            <button className="btn-secondary btn-compact" onClick={handleDownloadAll} disabled={downloadingAll}>
              {downloadingAll ? l('btn.preparing', 'Preparing…') : l('btn.downloadAll', 'Download all (zip)')}
            </button>
          </div>
          <DocumentList tenantId={tenant.id} />
        </div>
      )}

      {tab === 'invoices' && (
        <div className="card divide-y divide-slate-200 dark:divide-slate-800">
          {invoices.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">{l('invoice.empty', 'No invoices yet.')}</p>
          ) : (
            invoices.map((inv) => (
              <button
                key={inv.id}
                onClick={() => navigate(`/invoices/${inv.id}`)}
                className="w-full text-left p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <div>
                  <p className="font-medium">{new Date(inv.invoiceDate).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
                  <p className="text-sm text-slate-500">{formatINR(inv.totalPayable)}</p>
                </div>
                <span className={`text-xs rounded-full px-2 py-0.5 ${inv.paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {inv.paid ? l('status.paid', 'Paid') : l('status.unpaid', 'Unpaid')}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {tab === 'invite' && (
        <div className="card p-4 sm:p-6">
          <InviteCodeCard tenantId={tenant.id} tenant={tenant} onTenantUpdated={setTenant} />
        </div>
      )}

      {tab === 'meter' && (
        <div className="space-y-4">
          {/* Pending */}
          {(() => {
            const pending = submissions.filter((s) => s.status === 'pending')
            if (pending.length === 0) return null
            return (
              <div className="card p-4 sm:p-6 space-y-3">
                <h3 className="font-semibold text-sm">{l('meter.pendingReview', 'Pending Review')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {pending.map((ms) => (
                    <MeterSubmissionCard
                      key={ms.id}
                      ms={ms}
                      tenantId={tenant.id}
                      rejectingId={rejectingId}
                      rejectNotes={rejectNotes}
                      setRejectingId={setRejectingId}
                      setRejectNotes={setRejectNotes}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      l={l}
                    />
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Approved */}
          {(() => {
            const approved = submissions.filter((s) => s.status === 'approved')
            if (approved.length === 0) return null
            return (
              <div className="card p-4 sm:p-6 space-y-3">
                <h3 className="font-semibold text-sm">{l('meter.approvedReady', 'Approved — Ready to Tag')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {approved.map((ms) => (
                    <MeterSubmissionCard
                      key={ms.id}
                      ms={ms}
                      tenantId={tenant.id}
                      rejectingId={rejectingId}
                      rejectNotes={rejectNotes}
                      setRejectingId={setRejectingId}
                      setRejectNotes={setRejectNotes}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      l={l}
                    />
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Applied / rejected history */}
          {(() => {
            const history = submissions.filter((s) => s.status === 'applied' || s.status === 'rejected')
            if (history.length === 0) return null
            return (
              <div className="card p-4 sm:p-6 space-y-3">
                <h3 className="font-semibold text-sm text-slate-500">History</h3>
                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {history.map((ms) => (
                    <li key={ms.id} className="py-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{PHOTO_TYPE_LABELS[ms.photoType] ?? ms.photoType}</p>
                        <p className="text-xs text-slate-500">
                          {new Date(ms.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {ms.notes && <span className="ml-1 text-red-500">· {ms.notes}</span>}
                        </p>
                      </div>
                      <span className={`text-xs rounded-full px-2 py-0.5 ${ms.status === 'applied' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {ms.status === 'applied' ? 'Used' : 'Rejected'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })()}

          {submissions.filter((s) => ['pending', 'approved'].includes(s.status)).length === 0 &&
            submissions.filter((s) => ['applied', 'rejected'].includes(s.status)).length === 0 && (
              <p className="text-sm text-slate-500">{l('meter.noSubmissions', 'No photos submitted yet')}</p>
            )}
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500 text-xs">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

function MeterSubmissionCard({
  ms, tenantId, rejectingId, rejectNotes,
  setRejectingId, setRejectNotes, onApprove, onReject, l,
}: {
  ms: MeterSubmission
  tenantId: string
  rejectingId: string | null
  rejectNotes: string
  setRejectingId: (id: string | null) => void
  setRejectNotes: (v: string) => void
  onApprove: (ms: MeterSubmission) => void
  onReject: (ms: MeterSubmission) => void
  l: (key: string, fallback: string) => string
}) {
  const [photoSrc, setPhotoSrc] = useState<string | null>(null)

  useEffect(() => {
    let url: string | null = null
    fetchAuthedBlob(adminClient, meterSubmissionsApi.previewPhotoUrl(tenantId, ms.id))
      .then((u) => {
        url = u
        setPhotoSrc(u)
      })
      .catch(() => setPhotoSrc(null))
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [tenantId, ms.id])

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <div className="relative bg-slate-100 dark:bg-slate-800 h-40">
        {photoSrc ? (
          <img
            src={photoSrc}
            alt={ms.originalFilename}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
            {l('status.loading', 'Loading…')}
          </div>
        )}
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{PHOTO_TYPE_LABELS[ms.photoType] ?? ms.photoType}</p>
            <p className="text-xs text-slate-500">
              {new Date(ms.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>
          {ms.status === 'approved' && (
            <span className="text-xs rounded-full px-2 py-0.5 bg-blue-100 text-blue-700">
              {l('meter.status.approved', 'Approved')}
            </span>
          )}
        </div>
        {ms.status === 'pending' && rejectingId !== ms.id && (
          <div className="flex gap-2">
            <button className="btn-primary btn-compact flex-1" onClick={() => onApprove(ms)}>
              Approve
            </button>
            <button className="btn-danger btn-compact flex-1" onClick={() => { setRejectingId(ms.id); setRejectNotes('') }}>
              Reject
            </button>
          </div>
        )}
        {ms.status === 'pending' && rejectingId === ms.id && (
          <div className="space-y-2">
            <textarea
              className="input w-full text-sm"
              rows={2}
              placeholder={l('meter.rejectNotes', 'Reason for rejection (optional)')}
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
            />
            <div className="flex gap-2">
              <button className="btn-danger btn-compact flex-1" onClick={() => onReject(ms)}>
                {l('meter.confirm.reject', 'Confirm rejection')}
              </button>
              <button className="btn-secondary btn-compact" onClick={() => setRejectingId(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
