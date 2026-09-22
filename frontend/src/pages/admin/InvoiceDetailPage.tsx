import { FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { adminClient } from '@/api/adminClient'
import { errorMessage } from '@/api/client'
import { invoicesApi } from '@/api/invoices'
import { tenantsApi } from '@/api/tenants'
import { settingsApi } from '@/api/settings'
import { Invoice, WriteOff, Payment, MeterPhoto } from '@/types/invoice'
import { Tenant } from '@/types/tenant'
import { formatINR } from '@/utils/formulas'
import { fetchAuthedBlob, triggerBlobDownload } from '@/utils/blob'
import InvoiceDocument from '@/components/invoice/InvoiceDocument'
import { useLabels } from '@/hooks/useLabels'

export default function InvoiceDetailPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const navigate = useNavigate()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [qrSrc, setQrSrc] = useState<string | null>(null)
  const [photoSrc, setPhotoSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [pdfDownloaded, setPdfDownloaded] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [photoSrcs, setPhotoSrcs] = useState<Map<string, string>>(new Map())
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const { l } = useLabels()

  useEffect(() => {
    if (!invoiceId) return
    let qrUrl: string | null = null
    let photoUrl: string | null = null
    const meterUrls: string[] = []

    setLoading(true)
    invoicesApi.get(invoiceId).then(async (inv) => {
      setInvoice(inv)
      const [t, settings] = await Promise.all([tenantsApi.get(inv.tenantId), settingsApi.get()])
      setTenant(t)
      qrUrl = await fetchAuthedBlob(adminClient, invoicesApi.qrUrl(inv.id))
      setQrSrc(qrUrl)
      if (settings.hasPropertyPhoto) {
        photoUrl = await fetchAuthedBlob(adminClient, '/settings/property-photo')
        setPhotoSrc(photoUrl)
      }
      const srcMap = new Map<string, string>()
      for (const mp of inv.meterPhotos) {
        const url = await fetchAuthedBlob(adminClient, invoicesApi.meterPhotoDownloadUrl(inv.tenantId, mp.id))
        meterUrls.push(url)
        srcMap.set(mp.id, url)
      }
      setPhotoSrcs(srcMap)
      setLoading(false)
    })

    return () => {
      if (qrUrl) URL.revokeObjectURL(qrUrl)
      if (photoUrl) URL.revokeObjectURL(photoUrl)
      meterUrls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [invoiceId])

  async function handleDownloadPdf() {
    if (!invoice || !tenant) return
    setDownloading(true)
    setPdfError(null)
    try {
      const url = await fetchAuthedBlob(adminClient, invoicesApi.pdfUrl(invoice.id))
      triggerBlobDownload(url, `invoice-${tenant.name.replace(/\s+/g, '_')}-${invoice.invoiceDate}.pdf`)
      URL.revokeObjectURL(url)
      setPdfDownloaded(true)
    } catch (err: any) {
      if (err?.response?.status === 501) {
        setPdfError(l('error.pdfUnavailable', "PDF generation isn't available in this environment yet (missing system libraries). Run the app via Docker to generate PDFs."))
      } else {
        setPdfError(l('error.pdfDownload', 'Could not download the PDF.'))
      }
    } finally {
      setDownloading(false)
    }
  }

  function handleSendWhatsApp() {
    if (!invoice || !tenant?.phone) return
    const monthLabel = new Date(invoice.invoiceDate).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    const due = new Date(invoice.invoiceDate)
    due.setDate(due.getDate() + invoice.dueDays)
    const dueLabel = due.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    const amount = parseFloat(invoice.netPayable) < parseFloat(invoice.totalPayable)
      ? invoice.netPayable
      : invoice.totalPayable
    const message = `Hi ${tenant.name}, your rent invoice for ${monthLabel} is ${formatINR(amount)}, due by ${dueLabel}.`
    const phone = tenant.phone.replace(/[^\d+]/g, '').replace(/^\+/, '')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')
  }

  async function handleTogglePaid() {
    if (!invoice) return
    const updated = await invoicesApi.togglePaid(invoice.id, !invoice.paid)
    setInvoice(updated)
  }

  async function handleDelete() {
    if (!invoice || !confirm(l('confirm.deleteInvoice', 'Delete this invoice? This cannot be undone.'))) return
    await invoicesApi.delete(invoice.id)
    navigate(`/tenants/${invoice.tenantId}`)
  }

  async function handleDeletePayment(paymentId: string) {
    if (!invoice || !confirm(l('confirm.deletePayment', 'Delete this payment? This cannot be undone.'))) return
    const updated = await invoicesApi.deletePayment(invoice.id, paymentId)
    setInvoice(updated)
  }

  async function handleDownloadReceipt(paymentId: string) {
    if (!invoice || !tenant) return
    setDownloadingReceiptId(paymentId)
    try {
      const url = await fetchAuthedBlob(adminClient, invoicesApi.paymentReceiptUrl(invoice.id, paymentId))
      triggerBlobDownload(url, `receipt-${tenant.name.replace(/\s+/g, '_')}-${paymentId}.pdf`)
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingReceiptId(null)
    }
  }

  async function handleDeleteWriteOff(writeOffId: string) {
    if (!invoice || !confirm(l('confirm.undoWriteOff', 'Undo this write-off?'))) return
    const updated = await invoicesApi.deleteWriteOff(invoice.id, writeOffId)
    setInvoice(updated)
  }

  async function handleUploadMeterPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !invoice || !tenant) return
    setUploadingPhoto(true)
    try {
      const updated = await invoicesApi.uploadMeterPhoto(invoice.id, file)
      const newPhoto = updated.meterPhotos[updated.meterPhotos.length - 1]
      const url = await fetchAuthedBlob(adminClient, invoicesApi.meterPhotoDownloadUrl(tenant.id, newPhoto.id))
      setPhotoSrcs((prev) => new Map(prev).set(newPhoto.id, url))
      setInvoice(updated)
    } finally {
      setUploadingPhoto(false)
      if (photoInputRef.current) photoInputRef.current.value = ''
    }
  }

  async function handleDeleteMeterPhoto(photoId: string) {
    if (!invoice) return
    const updated = await invoicesApi.deleteMeterPhoto(invoice.id, photoId)
    setPhotoSrcs((prev) => {
      const next = new Map(prev)
      const url = next.get(photoId)
      if (url) URL.revokeObjectURL(url)
      next.delete(photoId)
      return next
    })
    setInvoice(updated)
  }

  if (loading || !invoice || !tenant) return <p className="text-slate-500">{l('status.loading', 'Loading…')}</p>

  const hasWriteOffs = invoice.writeOffs.length > 0
  const hasPayments = invoice.payments.length > 0
  const netLessThanTotal = parseFloat(invoice.netPayable) < parseFloat(invoice.totalPayable)
  const isPartiallyPaid = !invoice.paid && hasPayments

  return (
    <div className="space-y-4">
      <Link to={`/tenants/${tenant.id}`} className="text-sm text-brand-600 hover:underline">&larr; {tenant.name}</Link>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs rounded-full px-3 py-1 ${invoice.paid ? 'bg-green-100 text-green-700' : isPartiallyPaid ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'}`}>
            {invoice.paid ? l('status.paid', 'Paid') : isPartiallyPaid ? l('status.partiallyPaid', 'Partially paid') : l('status.unpaid', 'Unpaid')}
          </span>
          {netLessThanTotal && (
            <span className="text-xs rounded-full px-3 py-1 bg-blue-100 text-blue-700">
              {l('status.partialWriteOff', 'Write-off applied')}
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary btn-compact" onClick={handleTogglePaid}>
            {invoice.paid ? l('btn.markUnpaid', 'Mark unpaid') : l('btn.markPaid', 'Mark paid')}
          </button>
          <button className="btn-danger btn-compact" onClick={handleDelete}>{l('btn.delete', 'Delete')}</button>
        </div>
      </div>

      <div className="max-w-lg mx-auto">
        <InvoiceDocument
          invoice={invoice}
          tenantName={tenant.name}
          tenantAddress={tenant.propertyAddress}
          qrSrc={qrSrc}
          propertyPhotoSrc={photoSrc}
        />
      </div>

      {/* Payments */}
      <div className="max-w-lg mx-auto card p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{l('payment.section.title', 'Payments Received')}</h2>
          {!invoice.paid && hasPayments && (
            <span className="text-sm">
              {l('payment.outstanding', 'Outstanding')}:{' '}
              <strong className="text-red-600 dark:text-red-400">{formatINR(invoice.outstanding)}</strong>
            </span>
          )}
        </div>

        {hasPayments && (
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {l('payment.receivedSoFar', 'Received so far')}:{' '}
            <strong className="text-green-700 dark:text-green-400">{formatINR(invoice.totalPaid)}</strong>
            {' '}
            <span className="text-slate-400">{l('payment.ofTotal', 'of')} {formatINR(invoice.netPayable)}</span>
          </div>
        )}

        {hasPayments && (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {invoice.payments.map((p: Payment) => (
              <li key={p.id} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{formatINR(p.amount)}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {new Date(p.paidDate).toLocaleDateString('en-IN')}
                    {p.method && ` · ${p.method}`}
                  </p>
                  {p.notes && <p className="text-xs text-slate-400">{p.notes}</p>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    className="btn-secondary btn-compact text-xs"
                    onClick={() => handleDownloadReceipt(p.id)}
                    disabled={downloadingReceiptId === p.id}
                  >
                    {downloadingReceiptId === p.id ? l('btn.preparing', 'Preparing…') : l('payment.btn.receipt', 'Receipt')}
                  </button>
                  <button className="btn-danger btn-compact text-xs" onClick={() => handleDeletePayment(p.id)}>
                    {l('btn.delete', 'Delete')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {!hasPayments && (
          <p className="text-sm text-slate-500">{l('payment.empty', 'No payments recorded yet.')}</p>
        )}

        {!invoice.paid && (
          <PaymentForm
            invoiceId={invoice.id}
            outstanding={invoice.outstanding}
            onAdded={setInvoice}
            l={l}
          />
        )}
        {invoice.paid && !hasPayments && (
          <p className="text-xs text-slate-400">{l('payment.noPaymentsOnPaid', 'Mark the invoice as unpaid to record payments.')}</p>
        )}
      </div>

      {/* Meter reading photos */}
      <div className="max-w-lg mx-auto card p-4 sm:p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{l('invoice.section.meterPhotos', 'Meter Reading Photos')}</h2>
          {invoice.meterPhotos.length < 3 && (
            <label className={`btn-secondary btn-compact cursor-pointer ${uploadingPhoto ? 'opacity-50 pointer-events-none' : ''}`}>
              {uploadingPhoto ? l('btn.uploading', 'Uploading…') : l('invoice.meterPhotos.upload', 'Upload photo')}
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadMeterPhoto} />
            </label>
          )}
          {invoice.meterPhotos.length >= 3 && (
            <span className="text-xs text-slate-500">{l('invoice.meterPhotos.maxReached', 'Maximum 3 photos uploaded')}</span>
          )}
        </div>
        {invoice.meterPhotos.length === 0 && (
          <p className="text-sm text-slate-500">{l('invoice.meterPhotos.empty', 'No meter photos yet.')}</p>
        )}
        {invoice.meterPhotos.length > 0 && (
          <div className="flex gap-3 flex-wrap">
            {invoice.meterPhotos.map((mp: MeterPhoto) => {
              const src = photoSrcs.get(mp.id)
              return (
                <div key={mp.id} className="relative group">
                  {src ? (
                    <img
                      src={src}
                      alt={mp.originalFilename}
                      className="w-28 h-28 object-cover rounded-lg border border-slate-200 dark:border-slate-700"
                    />
                  ) : (
                    <div className="w-28 h-28 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 flex items-center justify-center text-slate-400 text-xs">
                      {l('status.loading', 'Loading…')}
                    </div>
                  )}
                  <button
                    className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleDeleteMeterPhoto(mp.id)}
                    title={l('btn.delete', 'Delete')}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Write-offs section */}
      <div className="max-w-lg mx-auto card p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{l('writeoff.section.title', 'Write-offs')}</h2>
          {netLessThanTotal && (
            <span className="text-sm">
              {l('writeoff.netPayable', 'Net payable')}:{' '}
              <strong className="text-brand-700 dark:text-brand-300">{formatINR(invoice.netPayable)}</strong>
            </span>
          )}
        </div>

        {hasWriteOffs && (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {invoice.writeOffs.map((wo: WriteOff) => (
              <li key={wo.id} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{formatINR(wo.amount)}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{wo.reason}</p>
                  <p className="text-xs text-slate-400">
                    {wo.writtenOffBy && `${wo.writtenOffBy} · `}
                    {new Date(wo.writtenOffAt).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <button
                  className="btn-secondary btn-compact flex-shrink-0 text-xs"
                  onClick={() => handleDeleteWriteOff(wo.id)}
                >
                  {l('btn.undo', 'Undo')}
                </button>
              </li>
            ))}
          </ul>
        )}

        {!invoice.paid && (
          <WriteOffForm
            invoiceId={invoice.id}
            netPayable={invoice.netPayable}
            onAdded={setInvoice}
            l={l}
          />
        )}
        {invoice.paid && !hasWriteOffs && (
          <p className="text-xs text-slate-400">{l('writeoff.noWriteOffsOnPaid', 'Mark the invoice as unpaid to add write-offs.')}</p>
        )}
      </div>

      {pdfError && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm max-w-lg mx-auto">{pdfError}</div>}

      <div className="max-w-lg mx-auto flex flex-col sm:flex-row gap-3">
        <button className="btn-primary flex-1" onClick={handleDownloadPdf} disabled={downloading}>
          {downloading ? l('btn.preparing', 'Preparing…') : l('btn.downloadPdf', 'Download PDF')}
        </button>
        <button
          className="btn-secondary flex-1"
          onClick={handleSendWhatsApp}
          disabled={!tenant.phone}
          title={!tenant.phone ? l('tooltip.noPhone', 'Add a phone number to this tenant first') : !pdfDownloaded ? l('tooltip.whatsappTip', 'Tip: download the PDF first, then attach it in the opened chat') : undefined}
        >
          {l('btn.sendWhatsApp', 'Send via WhatsApp')}
        </button>
      </div>
      {!pdfDownloaded && tenant.phone && (
        <p className="max-w-lg mx-auto text-xs text-slate-500 text-center">
          {l('info.whatsappAttach', "WhatsApp links can't attach files automatically: download the PDF first, tap Send via WhatsApp, then attach the PDF in the chat that opens.")}
        </p>
      )}
    </div>
  )
}

interface WriteOffFormProps {
  invoiceId: string
  netPayable: string
  onAdded: (inv: Invoice) => void
  l: (key: string, fallback: string) => string
}

function WriteOffForm({ invoiceId, netPayable, onAdded, l }: WriteOffFormProps) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const net = parseFloat(netPayable) || 0

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0 || amt > net) {
      setError(l('writeoff.validation.exceedsNet', `Amount must be between 0.01 and ${netPayable}`).replace(netPayable, formatINR(netPayable)))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const updated = await invoicesApi.addWriteOff(invoiceId, { amount, reason })
      onAdded(updated)
      setAmount('')
      setReason('')
    } catch (err: any) {
      setError(errorMessage(err, l('error.generic', 'Something went wrong')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
      <p className="text-xs font-medium text-slate-500">{l('writeoff.addTitle', 'Add write-off')}</p>
      {error && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">{l('writeoff.label.amount', 'Amount (₹)')}</label>
          <input
            className="field-input" type="number" step="0.01" min="0.01" max={net}
            placeholder="0.00" required value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">{l('writeoff.label.reason', 'Reason')}</label>
          <input
            className="field-input" required
            placeholder={l('writeoff.placeholder.reason', 'e.g. Goodwill, repair deduction')}
            value={reason} onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
      <button type="submit" className="btn-primary btn-compact" disabled={saving}>
        {saving ? l('btn.saving', 'Saving…') : l('writeoff.btn.add', 'Write off amount')}
      </button>
    </form>
  )
}

interface PaymentFormProps {
  invoiceId: string
  outstanding: string
  onAdded: (inv: Invoice) => void
  l: (key: string, fallback: string) => string
}

function PaymentForm({ invoiceId, outstanding, onAdded, l }: PaymentFormProps) {
  const owed = parseFloat(outstanding) || 0
  const [amount, setAmount] = useState('')
  const [paidDate, setPaidDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (!amt || amt <= 0 || amt > owed) {
      setError(l('payment.validation.range', `Amount must be between 0.01 and ${outstanding}`).replace(outstanding, formatINR(outstanding)))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const updated = await invoicesApi.addPayment(invoiceId, {
        amount, paidDate, method: method || undefined, notes: notes || undefined,
      })
      onAdded(updated)
      setAmount('')
      setMethod('')
      setNotes('')
    } catch (err: any) {
      setError(errorMessage(err, l('error.generic', 'Something went wrong')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
      <p className="text-xs font-medium text-slate-500">{l('payment.addTitle', 'Record a payment')}</p>
      {error && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="field-label">{l('payment.label.amount', 'Amount received (₹)')}</label>
          <input
            className="field-input" type="number" step="0.01" min="0.01" max={owed}
            placeholder="0.00" required value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">{l('payment.label.date', 'Date')}</label>
          <input
            className="field-input" type="date" required value={paidDate}
            onChange={(e) => setPaidDate(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="field-label">{l('payment.label.method', 'Method (optional)')}</label>
        <input
          className="field-input"
          placeholder={l('payment.placeholder.method', 'e.g. UPI, Cash, Bank transfer')}
          value={method} onChange={(e) => setMethod(e.target.value)}
        />
      </div>
      <div>
        <label className="field-label">{l('payment.label.notes', 'Notes (optional)')}</label>
        <input className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button type="submit" className="btn-primary btn-compact" disabled={saving}>
        {saving ? l('btn.saving', 'Saving…') : l('payment.btn.add', 'Add payment')}
      </button>
    </form>
  )
}
