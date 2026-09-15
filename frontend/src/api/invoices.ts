import { adminClient } from './adminClient'
import { Invoice, InvoiceCreateInput } from '@/types/invoice'

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

  pdfUrl: (id: string) => `/invoices/${id}/pdf`,
  qrUrl: (id: string) => `/invoices/${id}/qr.png`,
}
