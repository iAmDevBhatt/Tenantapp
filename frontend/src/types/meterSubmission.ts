export interface MeterSubmission {
  id: string
  tenantId: string
  photoType: 'flat_meter' | 'water_meter' | 'property' | 'other'
  originalFilename: string
  contentType: string | null
  sizeBytes: number | null
  submittedAt: string
  status: 'pending' | 'approved' | 'applied' | 'rejected'
  appliedToInvoiceId: string | null
  notes: string | null
}
