import { adminClient } from './adminClient'
import { TenantDocument } from '@/types/tenant'


export const documentsApi = {
  list: (tenantId: string) =>
    adminClient.get<TenantDocument[]>(`/tenants/${tenantId}/documents`).then((r) => r.data),

  upload: (tenantId: string, file: File, docType: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('docType', docType)
    return adminClient
      .post<TenantDocument>(`/tenants/${tenantId}/documents`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  toggleVisibility: (tenantId: string, documentId: string) =>
    adminClient.patch<TenantDocument>(`/tenants/${tenantId}/documents/${documentId}/visibility`).then((r) => r.data),

  delete: (tenantId: string, documentId: string) =>
    adminClient.delete(`/tenants/${tenantId}/documents/${documentId}`),

  downloadUrl: (tenantId: string, documentId: string) =>
    `/tenants/${tenantId}/documents/${documentId}/download`,
}
