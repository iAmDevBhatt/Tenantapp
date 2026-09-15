import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { tenantsApi } from '@/api/tenants'
import { invoicesApi } from '@/api/invoices'
import { Tenant } from '@/types/tenant'
import { computeInvoicePreview, formatINR } from '@/utils/formulas'
import { useLabels } from '@/hooks/useLabels'

export default function NewInvoicePage() {
  const { tenantId } = useParams<{ tenantId: string }>()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState<Tenant | null>(null)
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
    Promise.all([tenantsApi.get(tenantId), tenantsApi.nextInvoiceDefaults(tenantId)])
      .then(([t, defaults]) => {
        setTenant(t)
        setRoomStart(defaults.roomStart)
        setWaterStart(defaults.waterStart)
        setPreviousDues(defaults.previousDues)
      })
      .finally(() => setLoading(false))
  }, [tenantId])

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
      })
      navigate(`/invoices/${invoice.id}`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || l('error.saveInvoice', 'Could not save invoice'))
    } finally {
      setSaving(false)
    }
  }

  if (loading || !tenant) return <p className="text-slate-500">{l('status.loading', 'Loading…')}</p>

  return (
    <div className="space-y-4">
      <Link to={`/tenants/${tenant.id}`} className="text-sm text-brand-600 hover:underline">&larr; {tenant.name}</Link>
      <h1 className="text-xl font-bold">{tenant.name}</h1>

      {error && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-4 sm:p-6 space-y-4">
          <div>
            <label className="field-label">{l('form.label.invoiceDate', 'Invoice Date')}</label>
            <input className="field-input" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">{l('form.label.roomStart', 'Room Start')}</label>
              <input className="field-input" type="number" step="0.01" value={roomStart} onChange={(e) => setRoomStart(e.target.value)} />
            </div>
            <div>
              <label className="field-label">{l('form.label.roomEnd', 'Room End')}</label>
              <input className="field-input" type="number" step="0.01" autoFocus value={roomEnd} onChange={(e) => setRoomEnd(e.target.value)} />
            </div>
            <div>
              <label className="field-label">{l('form.label.waterStart', 'Water Start')}</label>
              <input className="field-input" type="number" step="0.01" value={waterStart} onChange={(e) => setWaterStart(e.target.value)} />
            </div>
            <div>
              <label className="field-label">{l('form.label.waterEnd', 'Water End')}</label>
              <input className="field-input" type="number" step="0.01" value={waterEnd} onChange={(e) => setWaterEnd(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="field-label">{l('form.label.previousDues', 'Previous Dues (₹)')}</label>
            <input className="field-input" type="number" step="0.01" value={previousDues} onChange={(e) => setPreviousDues(e.target.value)} />
          </div>

          <button className="btn-primary w-full" onClick={handleSave} disabled={saving || !roomEnd || !waterEnd}>
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
