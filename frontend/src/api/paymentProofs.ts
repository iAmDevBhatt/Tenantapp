import { adminClient } from './adminClient'
import { portalClient } from './portalClient'
import { PaymentProof } from '@/types/paymentProof'

export const paymentProofsApi = {
  // Portal (tenant)
  submitProof: (invoiceId: string, file: File): Promise<PaymentProof> => {
    const form = new FormData()
    form.append('file', file)
    return portalClient.post<PaymentProof>(`/portal/invoices/${invoiceId}/payment-proofs`, form).then((r) => r.data)
  },

  listForInvoice: (invoiceId: string): Promise<PaymentProof[]> =>
    portalClient.get<PaymentProof[]>(`/portal/invoices/${invoiceId}/payment-proofs`).then((r) => r.data),

  portalPhotoUrl: (invoiceId: string, proofId: string) =>
    `/portal/invoices/${invoiceId}/payment-proofs/${proofId}/photo`,

  // Admin
  listForInvoiceAdmin: (invoiceId: string): Promise<PaymentProof[]> =>
    adminClient.get<PaymentProof[]>(`/invoices/${invoiceId}/payment-proofs`).then((r) => r.data),

  previewPhotoUrl: (invoiceId: string, proofId: string) =>
    `/invoices/${invoiceId}/payment-proofs/${proofId}/photo`,

  review: (invoiceId: string, proofId: string, action: 'approve' | 'reject', notes?: string): Promise<PaymentProof> =>
    adminClient
      .post<PaymentProof>(`/invoices/${invoiceId}/payment-proofs/${proofId}/review`, { action, notes })
      .then((r) => r.data),
}
