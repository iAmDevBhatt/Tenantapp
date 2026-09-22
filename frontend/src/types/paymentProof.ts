export interface PaymentProof {
  id: string
  tenantId: string
  invoiceId: string
  originalFilename: string
  contentType: string | null
  sizeBytes: number | null
  submittedAt: string
  status: 'pending' | 'approved' | 'applied' | 'rejected'
  notes: string | null
  appliedToPaymentId: string | null
}
