import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { tenantsApi } from '@/api/tenants'
import { settingsApi } from '@/api/settings'
import { Tenant } from '@/types/tenant'
import { Overview } from '@/types/settings'
import { formatINR } from '@/utils/formulas'
import TenantForm from '@/components/TenantForm'

export default function DashboardPage() {
  const [tab, setTab] = useState<'active' | 'inactive'>('active')
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [defaultUpiId, setDefaultUpiId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [tenantList, ov, settings] = await Promise.all([
        tenantsApi.list(tab === 'active' ? 'true' : 'false'),
        settingsApi.overview(),
        settingsApi.get(),
      ])
      setTenants(tenantList)
      setOverview(ov)
      setDefaultUpiId(settings.defaultUpiId)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function handleAddTenant(data: Parameters<typeof tenantsApi.create>[0]) {
    const tenant = await tenantsApi.create(data)
    setShowAddForm(false)
    setTab('active')
    setTenants((prev) => [...prev, tenant].sort((a, b) => a.name.localeCompare(b.name)))
  }

  return (
    <div className="space-y-6">
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Active tenants" value={String(overview.activeTenantCount)} />
          <StatCard label="Outstanding dues" value={formatINR(overview.totalOutstandingDues)} />
          <StatCard label="Unpaid invoices" value={String(overview.unpaidInvoiceCount)} />
          <StatCard label="Collected this month" value={formatINR(overview.thisMonthCollected)} />
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <button
            className={`btn-compact rounded-none ${tab === 'active' ? 'bg-brand-700 text-white' : 'bg-white dark:bg-slate-900'}`}
            onClick={() => setTab('active')}
          >
            Active
          </button>
          <button
            className={`btn-compact rounded-none ${tab === 'inactive' ? 'bg-brand-700 text-white' : 'bg-white dark:bg-slate-900'}`}
            onClick={() => setTab('inactive')}
          >
            Moved out
          </button>
        </div>
        <button className="btn-primary" onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? 'Close' : '+ Add tenant'}
        </button>
      </div>

      {showAddForm && (
        <div className="card p-4 sm:p-6">
          <h2 className="font-semibold mb-4">New tenant</h2>
          <TenantForm
            initial={{ upiId: defaultUpiId ?? '' }}
            submitLabel="Add tenant"
            onSubmit={handleAddTenant}
            onCancel={() => setShowAddForm(false)}
          />
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading…</p>
      ) : tenants.length === 0 ? (
        <p className="text-slate-500">No {tab === 'active' ? 'active' : 'moved-out'} tenants yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tenants.map((t) => (
            <Link key={t.id} to={`/tenants/${t.id}`} className="card p-4 hover:border-brand-400 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{t.name}</p>
                  <p className="text-sm text-slate-500 truncate">{t.propertyAddress}</p>
                </div>
                {!t.hasPortalAccount && t.active && (
                  <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 flex-shrink-0">
                    No portal login
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-2">Rent {formatINR(t.monthlyRent)}/mo</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-brand-700 dark:text-brand-300 truncate">{value}</p>
    </div>
  )
}
