import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { portalApi } from '@/api/portal'
import { Invoice } from '@/types/invoice'
import { PortalMe } from '@/types/settings'
import { formatINR } from '@/utils/formulas'

export default function PortalDashboardPage() {
  const [me, setMe] = useState<PortalMe | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([portalApi.me(), portalApi.listInvoices()])
      .then(([m, inv]) => {
        setMe(m)
        setInvoices(inv)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading || !me) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Hi, {me.name}</h1>
        <p className="text-slate-500 text-sm">{me.propertyAddress}</p>
        {!me.active && (
          <span className="inline-block mt-2 text-xs bg-slate-200 dark:bg-slate-700 rounded-full px-2 py-0.5">
            Moved out
          </span>
        )}
      </div>

      <h2 className="font-semibold">Your Invoices</h2>
      {invoices.length === 0 ? (
        <p className="text-slate-500 text-sm">No invoices yet.</p>
      ) : (
        <div className="card divide-y divide-slate-200 dark:divide-slate-800">
          {invoices.map((inv) => (
            <Link
              key={inv.id}
              to={`/portal/invoices/${inv.id}`}
              className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <div>
                <p className="font-medium">
                  {new Date(inv.invoiceDate).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                </p>
                <p className="text-sm text-slate-500">{formatINR(inv.totalPayable)}</p>
              </div>
              <span className={`text-xs rounded-full px-2 py-0.5 ${inv.paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                {inv.paid ? 'Paid' : 'Unpaid'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
