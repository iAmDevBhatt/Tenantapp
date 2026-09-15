import { useEffect, useRef, useState } from 'react'
import { adminClient } from '@/api/adminClient'
import { documentsApi } from '@/api/documents'
import { TenantDocument } from '@/types/tenant'
import { fetchAuthedBlob, triggerBlobDownload } from '@/utils/blob'
import { useLabels } from '@/hooks/useLabels'

function formatSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentList({ tenantId }: { tenantId: string }) {
  const [docs, setDocs] = useState<TenantDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [docType, setDocType] = useState('other')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { l } = useLabels()

  const DOC_TYPES = [
    { value: 'lease', label: l('document.type.lease', 'Lease agreement') },
    { value: 'id_proof', label: l('document.type.idProof', 'ID proof') },
    { value: 'photo', label: l('document.type.photo', 'Move-in photo') },
    { value: 'other', label: l('document.type.other', 'Other') },
  ]

  async function load() {
    setLoading(true)
    try {
      setDocs(await documentsApi.list(tenantId))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await documentsApi.upload(tenantId, file, docType)
      await load()
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDownload(doc: TenantDocument) {
    const url = await fetchAuthedBlob(adminClient, documentsApi.downloadUrl(tenantId, doc.id))
    triggerBlobDownload(url, doc.originalFilename)
    URL.revokeObjectURL(url)
  }

  async function handleDelete(doc: TenantDocument) {
    if (!confirm(`Delete "${doc.originalFilename}"?`)) return
    await documentsApi.delete(tenantId, doc.id)
    await load()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <select className="field-input w-auto min-h-[40px]" value={docType} onChange={(e) => setDocType(e.target.value)}>
          {DOC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <label className="btn-secondary btn-compact cursor-pointer">
          {uploading ? l('btn.uploading', 'Uploading…') : l('btn.uploadFile', 'Upload file')}
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} disabled={uploading} />
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">{l('status.loading', 'Loading…')}</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-slate-500">{l('document.empty', 'No documents uploaded yet.')}</p>
      ) : (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {docs.map((doc) => (
            <li key={doc.id} className="py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{doc.originalFilename}</p>
                <p className="text-xs text-slate-500">
                  {DOC_TYPES.find((t) => t.value === doc.docType)?.label ?? doc.docType} · {formatSize(doc.sizeBytes)}
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button className="btn-secondary btn-compact" onClick={() => handleDownload(doc)}>{l('btn.download', 'Download')}</button>
                <button className="btn-danger btn-compact" onClick={() => handleDelete(doc)}>{l('btn.delete', 'Delete')}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
