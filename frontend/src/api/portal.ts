import { portalClient } from './portalClient'
import { Invoice } from '@/types/invoice'
import { PortalMe } from '@/types/settings'

export const portalApi = {
  me: () => portalClient.get<PortalMe>('/portal/me').then((r) => r.data),

  listInvoices: () => portalClient.get<Invoice[]>('/portal/invoices').then((r) => r.data),

  getInvoice: (id: string) => portalClient.get<Invoice>(`/portal/invoices/${id}`).then((r) => r.data),

  pdfUrl: (id: string) => `/portal/invoices/${id}/pdf`,
  qrUrl: (id: string) => `/portal/invoices/${id}/qr.png`,
}
