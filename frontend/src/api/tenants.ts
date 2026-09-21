import { adminClient } from './adminClient'
import { Tenant, TenantInput, NextInvoiceDefaults } from '@/types/tenant'

export const tenantsApi = {
  list: (active: 'true' | 'false' | 'all' = 'true') =>
    adminClient.get<Tenant[]>('/tenants', { params: { active } }).then((r) => r.data),

  get: (id: string) => adminClient.get<Tenant>(`/tenants/${id}`).then((r) => r.data),

  create: (data: TenantInput) => adminClient.post<Tenant>('/tenants', data).then((r) => r.data),

  update: (id: string, data: Partial<TenantInput>) =>
    adminClient.put<Tenant>(`/tenants/${id}`, data).then((r) => r.data),

  deactivate: (id: string, moveOutDate?: string) =>
    adminClient.post<Tenant>(`/tenants/${id}/deactivate`, { moveOutDate }).then((r) => r.data),

  reactivate: (id: string) => adminClient.post<Tenant>(`/tenants/${id}/reactivate`).then((r) => r.data),

  nextInvoiceDefaults: (id: string) =>
    adminClient.get<NextInvoiceDefaults>(`/tenants/${id}/next-invoice-defaults`).then((r) => r.data),

  uploadProfilePhoto: (tenantId: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return adminClient
      .post<Tenant>(`/tenants/${tenantId}/profile-photo`, form)
      .then((r) => r.data)
  },

  deleteProfilePhoto: (tenantId: string) =>
    adminClient.delete<Tenant>(`/tenants/${tenantId}/profile-photo`).then((r) => r.data),

  profilePhotoUrl: (tenantId: string) => `/tenants/${tenantId}/profile-photo`,

  downloadAllDocsUrl: (tenantId: string) => `/tenants/${tenantId}/documents/download-all`,

  togglePortalBlock: (tenantId: string) =>
    adminClient.patch<Tenant>(`/tenants/${tenantId}/portal-block`).then((r) => r.data),
}
