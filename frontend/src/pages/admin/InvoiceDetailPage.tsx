import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { adminClient } from '@/api/adminClient'
import { invoicesApi } from '@/api/invoices'
import { tenantsApi } from '@/api/tenants'
import { settingsApi } from '@/api/settings'
import { Invoice } from '@/types/invoice'
import { Tenant } from '@/types/tenant'
import { formatINR } from '@/utils/formulas'
import { fetchAuthedBlob, triggerBlobDownload } from '@/utils/blob'
import InvoiceDocument from '@/components/invoice/InvoiceDocument'

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

  useEffect(() => {
    if (!invoiceId) return
    let qrUrl: string | null = null
    let photoUrl: string | null = null

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
      setLoading(false)
    })

    return () => {
      if (qrUrl) URL.revokeObjectURL(qrUrl)
      if (photoUrl) URL.revokeObjectURL(photoUrl)
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
        setPdfError('PDF generation isn’t available in this environment yet (missing system libraries). Run the app via Docker to generate PDFs.')
      } else {
        setPdfError('Could not download the PDF.')
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
    const message = `Hi ${tenant.name}, your rent invoice for ${monthLabel} is ${formatINR(invoice.totalPayable)}, due by ${dueLabel}.`
    const phone = tenant.phone.replace(/[^\d+]/g, '').replace(/^\+/, '')
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank')
  }

  async function handleTogglePaid() {
    if (!invoice) return
    const updated = await invoicesApi.togglePaid(invoice.id, !invoice.paid)
    setInvoice(updated)
  }

  async function handleDelete() {
    if (!invoice || !confirm('Delete this invoice? This cannot be undone.')) return
    await invoicesApi.delete(invoice.id)
    navigate(`/tenants/${invoice.tenantId}`)
  }

  if (loading || !invoice || !tenant) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="space-y-4">
      <Link to={`/tenants/${tenant.id}`} className="text-sm text-brand-600 hover:underline">&larr; {tenant.name}</Link>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className={`text-xs rounded-full px-3 py-1 ${invoice.paid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {invoice.paid ? 'Paid' : 'Unpaid'}
        </span>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary btn-compact" onClick={handleTogglePaid}>
            Mark {invoice.paid ? 'unpaid' : 'paid'}
          </button>
          <button className="btn-danger btn-compact" onClick={handleDelete}>Delete</button>
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

      {pdfError && <div className="rounded-lg bg-red-50 text-red-700 px-3 py-2 text-sm max-w-lg mx-auto">{pdfError}</div>}

      <div className="max-w-lg mx-auto flex flex-col sm:flex-row gap-3">
        <button className="btn-primary flex-1" onClick={handleDownloadPdf} disabled={downloading}>
          {downloading ? 'Preparing…' : 'Download PDF'}
        </button>
        <button
          className="btn-secondary flex-1"
          onClick={handleSendWhatsApp}
          disabled={!tenant.phone}
          title={!tenant.phone ? 'Add a phone number to this tenant first' : !pdfDownloaded ? 'Tip: download the PDF first, then attach it in the opened chat' : undefined}
        >
          Send via WhatsApp
        </button>
      </div>
      {!pdfDownloaded && tenant.phone && (
        <p className="max-w-lg mx-auto text-xs text-slate-500 text-center">
          WhatsApp links can’t attach files automatically: download the PDF first, tap Send via WhatsApp, then attach the PDF in the chat that opens.
        </p>
      )}
    </div>
  )
}
