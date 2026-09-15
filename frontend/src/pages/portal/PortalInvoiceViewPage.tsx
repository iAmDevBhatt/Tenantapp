import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { portalClient } from '@/api/portalClient'
import { portalApi } from '@/api/portal'
import { Invoice } from '@/types/invoice'
import { PortalMe } from '@/types/settings'
import { fetchAuthedBlob, triggerBlobDownload } from '@/utils/blob'
import InvoiceDocument from '@/components/invoice/InvoiceDocument'

export default function PortalInvoiceViewPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [me, setMe] = useState<PortalMe | null>(null)
  const [qrSrc, setQrSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!invoiceId) return
    let qrUrl: string | null = null
    setLoading(true)
    Promise.all([portalApi.getInvoice(invoiceId), portalApi.me()]).then(async ([inv, m]) => {
      setInvoice(inv)
      setMe(m)
      qrUrl = await fetchAuthedBlob(portalClient, portalApi.qrUrl(inv.id))
      setQrSrc(qrUrl)
      setLoading(false)
    })
    return () => {
      if (qrUrl) URL.revokeObjectURL(qrUrl)
    }
  }, [invoiceId])

  async function handleDownload() {
    if (!invoice) return
    setDownloading(true)
    try {
      const url = await fetchAuthedBlob(portalClient, portalApi.pdfUrl(invoice.id))
      triggerBlobDownload(url, `invoice-${invoice.invoiceDate}.pdf`)
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  if (loading || !invoice || !me) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="space-y-4">
      <Link to="/portal" className="text-sm text-brand-600 hover:underline">&larr; Your invoices</Link>

      <div className="max-w-lg mx-auto">
        <InvoiceDocument invoice={invoice} tenantName={me.name} tenantAddress={me.propertyAddress} qrSrc={qrSrc} />
      </div>

      <div className="max-w-lg mx-auto">
        <button className="btn-primary w-full" onClick={handleDownload} disabled={downloading}>
          {downloading ? 'Preparing…' : 'Download PDF'}
        </button>
      </div>
    </div>
  )
}
