import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { portalClient } from '@/api/portalClient'
import { portalApi } from '@/api/portal'
import { meterSubmissionsApi } from '@/api/meterSubmissions'
import { Invoice, MeterPhoto } from '@/types/invoice'
import { PortalMe } from '@/types/settings'
import { fetchAuthedBlob, triggerBlobDownload } from '@/utils/blob'
import InvoiceDocument from '@/components/invoice/InvoiceDocument'
import { useLabels } from '@/hooks/useLabels'

export default function PortalInvoiceViewPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [me, setMe] = useState<PortalMe | null>(null)
  const [qrSrc, setQrSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [photoSrcs, setPhotoSrcs] = useState<Map<string, string>>(new Map())
  const photoUrlsRef = useRef<Map<string, string>>(new Map())
  const { l } = useLabels()

  useEffect(() => {
    if (!invoiceId) return
    let qrUrl: string | null = null
    setLoading(true)
    Promise.all([portalApi.getInvoice(invoiceId), portalApi.me()]).then(async ([inv, m]) => {
      setInvoice(inv)
      setMe(m)
      qrUrl = await fetchAuthedBlob(portalClient, portalApi.qrUrl(inv.id))
      setQrSrc(qrUrl)
      // load meter photo blobs
      const srcMap = new Map<string, string>()
      await Promise.all(
        inv.meterPhotos.map(async (mp: MeterPhoto) => {
          const blobUrl = await fetchAuthedBlob(
            portalClient,
            meterSubmissionsApi.portalMeterPhotoUrl(inv.id, mp.id)
          )
          srcMap.set(mp.id, blobUrl)
          photoUrlsRef.current.set(mp.id, blobUrl)
        })
      )
      setPhotoSrcs(new Map(srcMap))
      setLoading(false)
    })
    return () => {
      if (qrUrl) URL.revokeObjectURL(qrUrl)
      photoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      photoUrlsRef.current.clear()
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

  if (loading || !invoice || !me) return <p className="text-slate-500">{l('status.loading', 'Loading…')}</p>

  return (
    <div className="space-y-4">
      <Link to="/portal" className="text-sm text-brand-600 hover:underline">{l('nav.yourInvoices', '← Your invoices')}</Link>

      <div className="max-w-lg mx-auto">
        <InvoiceDocument invoice={invoice} tenantName={me.name} tenantAddress={me.propertyAddress} qrSrc={qrSrc} />
      </div>

      {invoice.meterPhotos.length > 0 && (
        <div className="max-w-lg mx-auto card p-4 sm:p-6 space-y-3">
          <h3 className="font-semibold text-sm">{l('meter.photos', 'Meter Reading Photos')}</h3>
          <div className="flex flex-wrap gap-2">
            {invoice.meterPhotos.map((mp) => (
              <div key={mp.id} className="w-28 h-28 rounded overflow-hidden bg-slate-100 dark:bg-slate-800">
                {photoSrcs.get(mp.id) ? (
                  <img
                    src={photoSrcs.get(mp.id)}
                    alt={mp.originalFilename}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">…</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto">
        <button className="btn-primary w-full" onClick={handleDownload} disabled={downloading}>
          {downloading ? l('btn.preparing', 'Preparing…') : l('btn.downloadPdf', 'Download PDF')}
        </button>
      </div>
    </div>
  )
}
