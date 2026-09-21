import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { portalApi } from '@/api/portal'
import { portalClient } from '@/api/portalClient'
import { Invoice } from '@/types/invoice'
import { TenantDocument } from '@/types/tenant'
import { PortalMe } from '@/types/settings'
import { formatINR } from '@/utils/formulas'
import { fetchAuthedBlob, triggerBlobDownload } from '@/utils/blob'
import { useLabels } from '@/hooks/useLabels'

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm text-right">{value}</span>
    </div>
  )
}

export default function PortalDashboardPage() {
  const [me, setMe] = useState<PortalMe | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [documents, setDocuments] = useState<TenantDocument[]>([])
  const [photoSrc, setPhotoSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const { l } = useLabels()

  const DOC_TYPE_LABELS: Record<string, string> = {
    lease: l('document.type.lease', 'Lease agreement'),
    rental_agreement: l('document.type.rentalAgreement', 'Rental agreement'),
    id_proof: l('document.type.idProof', 'ID proof'),
    photo: l('document.type.photo', 'Move-in photo'),
    other: l('document.type.other', 'Other'),
  }

  useEffect(() => {
    let photoUrl: string | null = null
    Promise.all([portalApi.me(), portalApi.listInvoices(), portalApi.listDocuments()])
      .then(async ([m, inv, docs]) => {
        setMe(m)
        setInvoices(inv)
        setDocuments(docs)
        if (m.hasProfilePhoto) {
          photoUrl = await fetchAuthedBlob(portalClient, portalApi.profilePhotoUrl())
          setPhotoSrc(photoUrl)
        }
      })
      .finally(() => setLoading(false))
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    }
  }, [])

  async function handleDownloadDoc(doc: TenantDocument) {
    const url = await fetchAuthedBlob(portalClient, portalApi.documentDownloadUrl(doc.id))
    triggerBlobDownload(url, doc.originalFilename)
    URL.revokeObjectURL(url)
  }

  if (loading || !me) return <p className="text-slate-500">{l('status.loading', 'Loading…')}</p>

  const unpaidCount = invoices.filter((i) => !i.paid).length
  const totalOutstanding = invoices
    .filter((i) => !i.paid)
    .reduce((sum, i) => sum + parseFloat(i.outstanding || i.netPayable), 0)

  return (
    <div className="space-y-6">

      {/* Greeting */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4">
          {/* Profile photo / initials avatar */}
          <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 bg-brand-100 dark:bg-brand-900 flex items-center justify-center">
            {photoSrc ? (
              <img src={photoSrc} alt={me.name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-brand-700 dark:text-brand-300 font-semibold text-lg">
                {me.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold">
              {l('portal.greeting', 'Hi, {name}').replace('{name}', me.name)}
            </h1>
            <p className="text-slate-500 text-sm">{me.propertyAddress}</p>
          </div>
        </div>
        {!me.active && (
          <span className="text-xs bg-slate-200 dark:bg-slate-700 rounded-full px-3 py-1">
            {l('status.movedOut', 'Moved out')}
          </span>
        )}
      </div>

      {/* Quick summary */}
      {unpaidCount > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300 px-4 py-3 text-sm">
          {unpaidCount === 1
            ? l('portal.summary.oneUnpaid', '1 unpaid invoice')
            : l('portal.summary.manyUnpaid', '{n} unpaid invoices').replace('{n}', String(unpaidCount))}
          {' — '}
          <strong>{formatINR(totalOutstanding)}</strong> {l('portal.summary.outstanding', 'outstanding')}
        </div>
      )}

      {/* Profile card */}
      <div className="card p-4 sm:p-6 space-y-1">
        <h2 className="font-semibold mb-2">{l('portal.profile.title', 'My Profile')}</h2>
        <ProfileRow
          label={l('portal.profile.moveInDate', 'Move-in date')}
          value={new Date(me.moveInDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        />
        {me.moveOutDate && (
          <ProfileRow
            label={l('portal.profile.moveOutDate', 'Move-out date')}
            value={new Date(me.moveOutDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          />
        )}
        <ProfileRow
          label={l('portal.profile.monthlyRent', 'Monthly rent')}
          value={formatINR(me.monthlyRent)}
        />
        <ProfileRow
          label={l('portal.profile.roomRate', 'Room rate (per unit)')}
          value={formatINR(me.roomRate)}
        />
        <ProfileRow
          label={l('portal.profile.waterRate', 'Water rate (per unit)')}
          value={formatINR(me.waterRate)}
        />
        <ProfileRow
          label={l('portal.profile.phone', 'Phone')}
          value={me.phone || '—'}
        />
        {me.permanentAddress && (
          <ProfileRow label={l('portal.profile.permanentAddress', 'Permanent address')} value={me.permanentAddress} />
        )}
        {me.emergencyContactName && (
          <ProfileRow
            label={l('portal.profile.emergencyContact', 'Emergency contact')}
            value={me.emergencyContactName + (me.emergencyContactPhone ? ` · ${me.emergencyContactPhone}` : '')}
          />
        )}
      </div>

      {/* Documents */}
      <div className="card p-4 sm:p-6 space-y-2">
        <h2 className="font-semibold mb-2">{l('portal.documents.title', 'My Documents')}</h2>
        {documents.length === 0 ? (
          <p className="text-sm text-slate-500">{l('portal.documents.empty', 'No documents shared with you yet.')}</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {documents.map((doc) => (
              <li key={doc.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">{doc.originalFilename}</p>
                  <p className="text-xs text-slate-500">
                    {DOC_TYPE_LABELS[doc.docType] ?? doc.docType}
                  </p>
                </div>
                <button
                  className="btn-secondary btn-compact flex-shrink-0"
                  onClick={() => handleDownloadDoc(doc)}
                >
                  {l('btn.download', 'Download')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Invoice list */}
      <div>
        <h2 className="font-semibold mb-2">{l('portal.invoices.title', 'Your Invoices')}</h2>
        {invoices.length === 0 ? (
          <p className="text-slate-500 text-sm">{l('invoice.empty', 'No invoices yet.')}</p>
        ) : (
          <div className="card divide-y divide-slate-200 dark:divide-slate-800">
            {invoices.map((inv) => {
              const outstanding = parseFloat(inv.outstanding || '0')
              const isPartial = !inv.paid && inv.amountPaid !== null
              return (
                <Link
                  key={inv.id}
                  to={`/portal/invoices/${inv.id}`}
                  className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <div>
                    <p className="font-medium">
                      {new Date(inv.invoiceDate).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatINR(inv.totalPayable)}
                      {isPartial && outstanding > 0 && (
                        <span className="ml-2 text-red-600 dark:text-red-400">
                          · {formatINR(outstanding)} {l('portal.invoices.outstanding', 'due')}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className={`text-xs rounded-full px-2 py-0.5 ${
                    inv.paid
                      ? 'bg-green-100 text-green-700'
                      : isPartial
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {inv.paid
                      ? l('status.paid', 'Paid')
                      : isPartial
                      ? l('status.partiallyPaid', 'Partially paid')
                      : l('status.unpaid', 'Unpaid')}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
