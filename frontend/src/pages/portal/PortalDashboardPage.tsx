import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { portalApi } from '@/api/portal'
import { Invoice } from '@/types/invoice'
import { PortalMe } from '@/types/settings'
import { formatINR } from '@/utils/formulas'
import { useLabels } from '@/hooks/useLabels'

export default function PortalDashboardPage() {
  const [me, setMe] = useState<PortalMe | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const { l } = useLabels()

  useEffect(() => {
    Promise.all([portalApi.me(), portalApi.listInvoices()])
      .then(([m, inv]) => {
        setMe(m)
        setInvoices(inv)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading || !me) return <p className="text-slate-500">{l('status.loading', 'Loading…')}</p>

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">
          {l('portal.greeting', 'Hi, {name}').replace('{name}', me.name)}
        </h1>
        <p className="text-slate-500 text-sm">{me.propertyAddress}</p>
        {!me.active && (
          <span className="inline-block mt-2 text-xs bg-slate-200 dark:bg-slate-700 rounded-full px-2 py-0.5">
            {l('status.movedOut', 'Moved out')}
          </span>
        )}
      </div>

      <h2 className="font-semibold">{l('portal.invoices.title', 'Your Invoices')}</h2>
      {invoices.length === 0 ? (
        <p className="text-slate-500 text-sm">{l('invoice.empty', 'No invoices yet.')}</p>
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
                {inv.paid ? l('status.paid', 'Paid') : l('status.unpaid', 'Unpaid')}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
