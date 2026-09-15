import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { tenantsApi } from '@/api/tenants'
import { invoicesApi } from '@/api/invoices'
import { Tenant } from '@/types/tenant'
import { Invoice } from '@/types/invoice'
import { formatINR } from '@/utils/formulas'
import TenantForm from '@/components/TenantForm'
import DocumentList from '@/components/DocumentList'
import InviteCodeCard from '@/components/InviteCodeCard'

type Tab = 'profile' | 'documents' | 'invoices' | 'invite'

export default function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [tab, setTab] = useState<Tab>('profile')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!tenantId) return
    setLoading(true)
    try {
      const [t, inv] = await Promise.all([tenantsApi.get(tenantId), invoicesApi.listForTenant(tenantId)])
      setTenant(t)
      setInvoices(inv)
    } finally {
      setLoading(false)
    }
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
    if (!tenantId || !confirm('Mark this tenant as moved out? Their invoice history is kept.')) return
    setTenant(await tenantsApi.deactivate(tenantId))
  }

  async function handleReactivate() {
    if (!tenantId) return
    setTenant(await tenantsApi.reactivate(tenantId))
  }

  if (loading || !tenant) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="space-y-4">
      <Link to="/" className="text-sm text-brand-600 hover:underline">&larr; All tenants</Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            {tenant.name}
            {!tenant.active && (
              <span className="text-xs bg-slate-200 dark:bg-slate-700 rounded-full px-2 py-0.5">Moved out</span>
            )}
          </h1>
          <p className="text-slate-500 text-sm">{tenant.propertyAddress}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to={`/tenants/${tenant.id}/new-invoice`} className="btn-primary">+ New invoice</Link>
          {tenant.active ? (
            <button className="btn-secondary" onClick={handleDeactivate}>Mark moved out</button>
          ) : (
            <button className="btn-secondary" onClick={handleReactivate}>Reactivate</button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {(['profile', 'documents', 'invoices', 'invite'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`btn-compact rounded-none border-b-2 ${tab === t ? 'border-brand-600 text-brand-700 dark:text-brand-300' : 'border-transparent text-slate-500'}`}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="card p-4 sm:p-6">
          {editing ? (
            <TenantForm
              initial={tenant}
              submitLabel="Save changes"
              onSubmit={handleUpdate}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="space-y-3">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <Field label="Phone" value={tenant.phone || '—'} />
                <Field label="Monthly Rent" value={formatINR(tenant.monthlyRent)} />
                <Field label="Room Rate" value={`${formatINR(tenant.roomRate)}/unit`} />
                <Field label="Water Rate" value={`${formatINR(tenant.waterRate)}/unit`} />
                <Field label="Water Shared By" value={String(tenant.waterDivisor)} />
                <Field label="UPI ID" value={tenant.upiId || '—'} />
                <Field label="Move-in Date" value={tenant.moveInDate} />
                {tenant.moveOutDate && <Field label="Move-out Date" value={tenant.moveOutDate} />}
              </dl>
              <button className="btn-secondary" onClick={() => setEditing(true)}>Edit details</button>
            </div>
          )}
        </div>
      )}

      {tab === 'documents' && (
        <div className="card p-4 sm:p-6">
          <DocumentList tenantId={tenant.id} />
        </div>
      )}

      {tab === 'invoices' && (
        <div className="card divide-y divide-slate-200 dark:divide-slate-800">
          {invoices.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No invoices yet.</p>
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
                  {inv.paid ? 'Paid' : 'Unpaid'}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {tab === 'invite' && (
        <div className="card p-4 sm:p-6">
          <InviteCodeCard tenantId={tenant.id} />
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
