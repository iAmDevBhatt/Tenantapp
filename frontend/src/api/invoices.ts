import { adminClient } from './adminClient'
import { Invoice, InvoiceCreateInput, WriteOffCreateInput } from '@/types/invoice'

export const invoicesApi = {
  listForTenant: (tenantId: string) =>
    adminClient.get<Invoice[]>('/invoices', { params: { tenantId } }).then((r) => r.data),

  get: (id: string) => adminClient.get<Invoice>(`/invoices/${id}`).then((r) => r.data),

  create: (data: InvoiceCreateInput) =>
    adminClient.post<Invoice>('/invoices', data).then((r) => r.data),

  update: (id: string, data: Partial<InvoiceCreateInput>) =>
    adminClient.put<Invoice>(`/invoices/${id}`, data).then((r) => r.data),

  togglePaid: (id: string, paid: boolean, paidDate?: string) =>
    adminClient.post<Invoice>(`/invoices/${id}/toggle-paid`, { paid, paidDate }).then((r) => r.data),

  delete: (id: string) => adminClient.delete(`/invoices/${id}`),

  addWriteOff: (invoiceId: string, data: WriteOffCreateInput) =>
    adminClient.post<Invoice>(`/invoices/${invoiceId}/writeoffs`, data).then((r) => r.data),

  deleteWriteOff: (invoiceId: string, writeOffId: string) =>
    adminClient.delete<Invoice>(`/invoices/${invoiceId}/writeoffs/${writeOffId}`).then((r) => r.data),

  uploadMeterPhoto: (invoiceId: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return adminClient.post<Invoice>(`/invoices/${invoiceId}/photos`, fd).then((r) => r.data)
  },

  deleteMeterPhoto: (invoiceId: string, photoId: string) =>
    adminClient.delete<Invoice>(`/invoices/${invoiceId}/photos/${photoId}`).then((r) => r.data),

  meterPhotoDownloadUrl: (tenantId: string, photoId: string) =>
    `/tenants/${tenantId}/documents/${photoId}/download`,

  pdfUrl: (id: string) => `/invoices/${id}/pdf`,
  qrUrl: (id: string) => `/invoices/${id}/qr.png`,
}
