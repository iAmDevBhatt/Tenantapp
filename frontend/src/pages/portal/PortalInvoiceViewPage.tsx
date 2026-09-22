import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { portalClient } from '@/api/portalClient'
import { portalApi } from '@/api/portal'
import { meterSubmissionsApi } from '@/api/meterSubmissions'
import { paymentProofsApi } from '@/api/paymentProofs'
import { Invoice, MeterPhoto, Payment } from '@/types/invoice'
import { PortalMe } from '@/types/settings'
import { PaymentProof } from '@/types/paymentProof'
import { formatINR } from '@/utils/formulas'
import { fetchAuthedBlob, triggerBlobDownload } from '@/utils/blob'
import InvoiceDocument from '@/components/invoice/InvoiceDocument'
import PhotoLightbox from '@/components/PhotoLightbox'
import { useLabels } from '@/hooks/useLabels'

const PROOF_STATUS_COLOURS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  approved: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  applied: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
}

export default function PortalInvoiceViewPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [me, setMe] = useState<PortalMe | null>(null)
  const [qrSrc, setQrSrc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [photoSrcs, setPhotoSrcs] = useState<Map<string, string>>(new Map())
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null)
  const [paymentProofs, setPaymentProofs] = useState<PaymentProof[]>([])
  const [proofPhotoSrcs, setProofPhotoSrcs] = useState<Map<string, string>>(new Map())
  const [expandedProofPhoto, setExpandedProofPhoto] = useState<{ src: string; alt: string } | null>(null)
  const [uploadingProof, setUploadingProof] = useState(false)
  const photoUrlsRef = useRef<Map<string, string>>(new Map())
  const proofInputRef = useRef<HTMLInputElement>(null)
  const { l } = useLabels()

  useEffect(() => {
    if (!invoiceId) return
    let qrUrl: string | null = null
    setLoading(true)
    Promise.all([portalApi.getInvoice(invoiceId), portalApi.me(), paymentProofsApi.listForInvoice(invoiceId)]).then(async ([inv, m, proofs]) => {
      setInvoice(inv)
      setMe(m)
      setPaymentProofs(proofs)
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
      // load payment-proof blobs
      const proofSrcMap = new Map<string, string>()
      await Promise.all(
        proofs.map(async (proof: PaymentProof) => {
          const blobUrl = await fetchAuthedBlob(portalClient, paymentProofsApi.portalPhotoUrl(inv.id, proof.id))
          proofSrcMap.set(proof.id, blobUrl)
          photoUrlsRef.current.set(`proof:${proof.id}`, blobUrl)
        })
      )
      setProofPhotoSrcs(new Map(proofSrcMap))
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

  async function handleUploadProof(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !invoice) return
    setUploadingProof(true)
    try {
      const proof = await paymentProofsApi.submitProof(invoice.id, file)
      const url = await fetchAuthedBlob(portalClient, paymentProofsApi.portalPhotoUrl(invoice.id, proof.id))
      setProofPhotoSrcs((prev) => new Map(prev).set(proof.id, url))
      setPaymentProofs((prev) => [proof, ...prev])
    } finally {
      setUploadingProof(false)
      if (proofInputRef.current) proofInputRef.current.value = ''
    }
  }

  async function handleDownloadReceipt(paymentId: string) {
    if (!invoice) return
    setDownloadingReceiptId(paymentId)
    try {
      const url = await fetchAuthedBlob(portalClient, portalApi.paymentReceiptUrl(invoice.id, paymentId))
      triggerBlobDownload(url, `receipt-${paymentId}.pdf`)
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingReceiptId(null)
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

      <div className="max-w-lg mx-auto card p-4 sm:p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">{l('proof.portal.title', 'Payment Proof')}</h3>
          {!invoice.paid && (
            <label className={`btn-secondary btn-compact cursor-pointer ${uploadingProof ? 'opacity-50 pointer-events-none' : ''}`}>
              {uploadingProof ? l('btn.uploading', 'Uploading...') : l('proof.btn.upload', 'Upload screenshot')}
              <input ref={proofInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleUploadProof} />
            </label>
          )}
        </div>
        {paymentProofs.length === 0 ? (
          <p className="text-sm text-slate-500">{l('proof.empty', 'No payment proof submitted yet.')}</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {paymentProofs.map((proof) => {
              const src = proofPhotoSrcs.get(proof.id)
              return (
                <div key={proof.id} className="space-y-1">
                  <div className="w-20 h-20 rounded overflow-hidden bg-slate-100 dark:bg-slate-800">
                    {src ? (
                      <img
                        src={src}
                        alt={proof.originalFilename}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setExpandedProofPhoto({ src, alt: proof.originalFilename })}
                        title={l('meter.viewFull', 'Click to view full size')}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">…</div>
                    )}
                  </div>
                  <span className={`block text-center text-xs rounded-full px-2 py-0.5 ${PROOF_STATUS_COLOURS[proof.status] ?? ''}`}>
                    {l(`proof.status.${proof.status}`, proof.status)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      {expandedProofPhoto && (
        <PhotoLightbox
          src={expandedProofPhoto.src}
          alt={expandedProofPhoto.alt}
          onClose={() => setExpandedProofPhoto(null)}
        />
      )}

      {invoice.payments.length > 0 && (
        <div className="max-w-lg mx-auto card p-4 sm:p-6 space-y-3">
          <h3 className="font-semibold text-sm">{l('payment.history', 'Payment History')}</h3>
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {invoice.payments.map((p: Payment) => (
              <li key={p.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{formatINR(p.amount)}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(p.paidDate).toLocaleDateString('en-IN')}
                    {p.method && ` · ${p.method}`}
                  </p>
                </div>
                <button
                  className="btn-secondary btn-compact flex-shrink-0"
                  onClick={() => handleDownloadReceipt(p.id)}
                  disabled={downloadingReceiptId === p.id}
                >
                  {downloadingReceiptId === p.id ? l('btn.preparing', 'Preparing…') : l('payment.btn.receipt', 'Receipt')}
                </button>
              </li>
            ))}
          </ul>
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
