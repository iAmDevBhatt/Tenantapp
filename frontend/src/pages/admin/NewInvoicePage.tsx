import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { adminClient } from '@/api/adminClient'
import { tenantsApi } from '@/api/tenants'
import { errorMessage } from '@/api/client'
import { invoicesApi } from '@/api/invoices'
import { meterSubmissionsApi } from '@/api/meterSubmissions'
import { Tenant } from '@/types/tenant'
import { Invoice } from '@/types/invoice'
import { MeterSubmission } from '@/types/meterSubmission'
import { computeInvoicePreview, formatINR } from '@/utils/formulas'
import { fetchAuthedBlob } from '@/utils/blob'
import { useLabels } from '@/hooks/useLabels'

const PHOTO_TYPE_LABELS: Record<string, string> = {
  flat_meter: 'Flat Meter',
  water_meter: 'Water Meter',
  property: 'Whole Property',
  other: 'Other',
}

export default function NewInvoicePage() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [blockingInvoice, setBlockingInvoice] = useState<Invoice | null>(null)
  const [approvedPhotos, setApprovedPhotos] = useState<MeterSubmission[]>([])
  const [photoSrcs, setPhotoSrcs] = useState<Map<string, string>>(new Map())
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { l } = useLabels()

  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10))
  const [roomStart, setRoomStart] = useState('0')
  const [roomEnd, setRoomEnd] = useState('')
  const [waterStart, setWaterStart] = useState('0')
  const [waterEnd, setWaterEnd] = useState('')
  const [previousDues, setPreviousDues] = useState('0')

  useEffect(() => {
    if (!tenantId) return
    setLoading(true)
    const photoUrls: string[] = []
    Promise.all([
      tenantsApi.get(tenantId),
      tenantsApi.nextInvoiceDefaults(tenantId),
      invoicesApi.listForTenant(tenantId),
      meterSubmissionsApi.listForTenant(tenantId, 'approved'),
    ])
      .then(async ([t, defaults, invoices, photos]) => {
        setTenant(t)
        setRoomStart(defaults.roomStart)
        setWaterStart(defaults.waterStart)
        setPreviousDues(defaults.previousDues)
        setApprovedPhotos(photos)

        const srcMap = new Map<string, string>()
        for (const ms of photos) {
          const url = await fetchAuthedBlob(adminClient, meterSubmissionsApi.previewPhotoUrl(tenantId, ms.id))
          photoUrls.push(url)
          srcMap.set(ms.id, url)
        }
        setPhotoSrcs(srcMap)

        // Detect if the most recent invoice blocks creation (no payment, not paid, no write-offs)
        if (invoices.length > 0) {
          const last = invoices[0]
          const isBlocked = !last.paid && last.payments.length === 0 && last.writeOffs.length === 0
          setBlockingInvoice(isBlocked ? last : null)
        }
      })
      .finally(() => setLoading(false))

    return () => {
      photoUrls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [tenantId])

  function togglePhoto(id: string) {
    setSelectedPhotoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const preview = tenant
    ? computeInvoicePreview({
        roomStart: parseFloat(roomStart) || 0,
        roomEnd: parseFloat(roomEnd) || 0,
        waterStart: parseFloat(waterStart) || 0,
        waterEnd: parseFloat(waterEnd) || 0,
        roomRate: parseFloat(tenant.roomRate),
        waterRate: parseFloat(tenant.waterRate),
        waterDivisor: tenant.waterDivisor,
        monthlyRent: parseFloat(tenant.monthlyRent),
        previousDues: parseFloat(previousDues) || 0,
      })
    : null

  async function handleSave() {
    if (!tenantId) return
    setSaving(true)
    setError(null)
    try {
      const invoice = await invoicesApi.create({
        tenantId, invoiceDate, roomStart, roomEnd, waterStart, waterEnd, previousDues,
        meterSubmissionIds: selectedPhotoIds,
      })
      navigate(`/invoices/${invoice.id}`)
    } catch (err: any) {
      setError(errorMessage(err, l('error.saveInvoice', 'Could not save invoice')))
    } finally {
      setSaving(false)
    }
  }

  if (loading || !tenant) return <p className="text-slate-500">{l('status.loading', 'Loading…')}</p>

  return (
    <div className="space-y-4">
      <Link to={`/tenants/${tenant.id}`} className="text-sm text-brand-600 hover:underline">&larr; {tenant.name}</Link>
      <h1 className="text-xl font-bold">{tenant.name}</h1>

      {blockingInvoice && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 text-sm space-y-1">
          <p className="font-semibold">{l('newInvoice.blocked.title', 'Previous invoice needs a payment record')}</p>
          <p>
            {l('newInvoice.blocked.body', 'Record how much was received on the previous invoice before creating a new one.')}{' '}
            <Link to={`/invoices/${blockingInvoice.id}`} className="underline font-medium">
              {l('newInvoice.blocked.link', 'Go to previous invoice →')}
            </Link>
          </p>
        </div>
      )}

      {error && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      {/* Meter photo picker */}
      <div className="card p-4 sm:p-6 space-y-3">
        <h2 className="font-semibold text-sm">{l('meter.photoPicker', 'Select meter photos to attach')}</h2>
        {approvedPhotos.length === 0 ? (
          <p className="text-sm text-slate-500">{l('meter.noApproved', 'No approved meter photos available')}</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {approvedPhotos.map((ms) => {
              const selected = selectedPhotoIds.includes(ms.id)
              return (
                <button
                  key={ms.id}
                  type="button"
                  onClick={() => togglePhoto(ms.id)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
                    selected
                      ? 'border-brand-600 ring-2 ring-brand-300'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'
                  }`}
                >
                  {photoSrcs.get(ms.id) ? (
                    <img
                      src={photoSrcs.get(ms.id)}
                      alt={ms.originalFilename}
                      className="w-24 h-24 object-cover"
                    />
                  ) : (
                    <div className="w-24 h-24 flex items-center justify-center text-slate-400 text-xs">
                      {l('status.loading', 'Loading…')}
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs text-center py-0.5 truncate px-1">
                    {PHOTO_TYPE_LABELS[ms.photoType] ?? ms.photoType}
                  </div>
                  {selected && (
                    <div className="absolute top-1 right-1 w-5 h-5 bg-brand-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                      ✓
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 sm:p-6 space-y-4">
          <div>
            <label className="field-label">{l('form.label.invoiceDate', 'Invoice Date')}</label>
            <input className="field-input" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">{l('form.label.roomStart', 'Room Start')}</label>
              <input className="field-input" type="number" step="1" value={roomStart} onChange={(e) => setRoomStart(e.target.value)} />
            </div>
            <div>
              <label className="field-label">{l('form.label.roomEnd', 'Room End')}</label>
              <input className="field-input" type="number" step="1" autoFocus value={roomEnd} onChange={(e) => setRoomEnd(e.target.value)} />
            </div>
            <div>
              <label className="field-label">{l('form.label.waterStart', 'Water Start')}</label>
              <input className="field-input" type="number" step="1" value={waterStart} onChange={(e) => setWaterStart(e.target.value)} />
            </div>
            <div>
              <label className="field-label">{l('form.label.waterEnd', 'Water End')}</label>
              <input className="field-input" type="number" step="1" value={waterEnd} onChange={(e) => setWaterEnd(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="field-label">{l('form.label.previousDues', 'Previous Dues (₹)')}</label>
            <input className="field-input" type="number" step="0.01" value={previousDues} onChange={(e) => setPreviousDues(e.target.value)} />
          </div>

          <button
            className="btn-primary w-full"
            onClick={handleSave}
            disabled={saving || !roomEnd || !waterEnd || !!blockingInvoice}
            title={blockingInvoice ? l('newInvoice.blocked.btnTooltip', 'Record a payment on the previous invoice first') : undefined}
          >
            {saving ? l('btn.saving', 'Saving…') : l('btn.saveInvoice', 'Save Invoice')}
          </button>
        </div>

        <div className="card p-4 sm:p-6">
          <h2 className="font-semibold mb-3">{l('invoice.preview.title', 'Live Preview')}</h2>
          {preview && (
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <td className="py-2">{l('invoice.preview.roomUsage', 'Room usage')}</td>
                  <td className="py-2 text-right">{preview.roomUsage} {l('invoice.preview.units', 'units')}</td>
                </tr>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <td className="py-2">{l('invoice.preview.roomAmount', 'Room amount (A)')}</td>
                  <td className="py-2 text-right">{formatINR(preview.roomAmount)}</td>
                </tr>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <td className="py-2">{l('invoice.preview.waterUsage', 'Water usage')} {tenant.waterDivisor > 1 && `(÷${tenant.waterDivisor})`}</td>
                  <td className="py-2 text-right">{preview.waterUsage} {l('invoice.preview.units', 'units')}</td>
                </tr>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <td className="py-2">{l('invoice.preview.waterAmount', 'Water amount (B)')}</td>
                  <td className="py-2 text-right">{formatINR(preview.waterAmount)}</td>
                </tr>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <td className="py-2">{l('invoice.preview.monthlyRent', 'Monthly rent (C)')}</td>
                  <td className="py-2 text-right">{formatINR(tenant.monthlyRent)}</td>
                </tr>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <td className="py-2">{l('invoice.preview.previousDues', 'Previous dues (D)')}</td>
                  <td className="py-2 text-right">{formatINR(parseFloat(previousDues) || 0)}</td>
                </tr>
                <tr>
                  <td className="py-2 font-bold text-brand-700 dark:text-brand-300">{l('invoice.preview.totalPayable', 'Total Payable')}</td>
                  <td className="py-2 text-right font-bold text-lg text-brand-700 dark:text-brand-300">
                    {formatINR(preview.totalPayable)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
