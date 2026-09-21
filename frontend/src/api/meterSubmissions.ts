import { adminClient } from './adminClient'
import { portalClient } from './portalClient'
import { MeterSubmission } from '@/types/meterSubmission'

export const meterSubmissionsApi = {
  // Portal (tenant)
  submitPhoto: (file: File, photoType: string): Promise<MeterSubmission> => {
    const form = new FormData()
    form.append('file', file)
    form.append('photo_type', photoType)
    return portalClient.post<MeterSubmission>('/portal/meter-submissions', form).then((r) => r.data)
  },

  listMine: (): Promise<MeterSubmission[]> =>
    portalClient.get<MeterSubmission[]>('/portal/meter-submissions').then((r) => r.data),

  portalMeterPhotoUrl: (invoiceId: string, photoId: string) =>
    `/portal/invoices/${invoiceId}/meter-photos/${photoId}`,

  // Admin
  listForTenant: (tenantId: string, status?: string): Promise<MeterSubmission[]> => {
    const params = status ? `?status=${status}` : ''
    return adminClient
      .get<MeterSubmission[]>(`/tenants/${tenantId}/meter-submissions${params}`)
      .then((r) => r.data)
  },

  previewPhotoUrl: (tenantId: string, msId: string) =>
    `/tenants/${tenantId}/meter-submissions/${msId}/photo`,

  review: (
    tenantId: string,
    msId: string,
    action: 'approve' | 'reject',
    notes?: string
  ): Promise<MeterSubmission> =>
    adminClient
      .post<MeterSubmission>(`/tenants/${tenantId}/meter-submissions/${msId}/review`, {
        action,
        notes,
      })
      .then((r) => r.data),
}
