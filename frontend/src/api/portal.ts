import { portalClient } from './portalClient'
import { Invoice } from '@/types/invoice'
import { PortalMe } from '@/types/settings'
import { TenantDocument } from '@/types/tenant'

export const portalApi = {
  me: () => portalClient.get<PortalMe>('/portal/me').then((r) => r.data),

  listInvoices: () => portalClient.get<Invoice[]>('/portal/invoices').then((r) => r.data),

  getInvoice: (id: string) => portalClient.get<Invoice>(`/portal/invoices/${id}`).then((r) => r.data),

  listDocuments: () => portalClient.get<TenantDocument[]>('/portal/me/documents').then((r) => r.data),

  documentDownloadUrl: (docId: string) => `/portal/me/documents/${docId}/download`,

  profilePhotoUrl: () => `/portal/me/photo`,

  pdfUrl: (id: string) => `/portal/invoices/${id}/pdf`,
  qrUrl: (id: string) => `/portal/invoices/${id}/qr.png`,
  paymentReceiptUrl: (invoiceId: string, paymentId: string) =>
    `/portal/invoices/${invoiceId}/payments/${paymentId}/receipt.pdf`,
}
