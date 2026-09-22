export interface MeterPhoto {
  id: string
  tenantId: string
  originalFilename: string
  contentType: string | null
  sizeBytes: number | null
  docType: string
  invoiceId: string | null
  uploadedAt: string
}

export interface WriteOff {
  id: string
  invoiceId: string
  amount: string
  reason: string
  writtenOffBy: string | null
  writtenOffAt: string
}

export interface WriteOffCreateInput {
  amount: string
  reason: string
}

export interface Payment {
  id: string
  invoiceId: string
  amount: string
  paidDate: string
  method: string | null
  notes: string | null
  recordedBy: string | null
  createdAt: string
}

export interface PaymentCreateInput {
  amount: string
  paidDate?: string
  method?: string
  notes?: string
  paymentProofId?: string
}

export interface Invoice {
  id: string
  tenantId: string
  invoiceDate: string

  roomStart: string
  roomEnd: string
  waterStart: string
  waterEnd: string
  previousDues: string

  roomRate: string
  waterRate: string
  waterDivisor: number
  monthlyRent: string
  upiId: string | null
  payeeName: string | null
  dueDays: number

  roomUsage: string
  waterUsage: string
  roomAmount: string
  waterAmount: string
  totalPayable: string

  paid: boolean
  paidDate: string | null
  createdAt: string
  writeOffs: WriteOff[]
  payments: Payment[]
  additionalOccupants: string[]
  netPayable: string
  totalPaid: string
  outstanding: string
  meterPhotos: MeterPhoto[]
}

export interface InvoiceCreateInput {
  tenantId: string
  invoiceDate: string
  roomStart: string
  roomEnd: string
  waterStart: string
  waterEnd: string
  previousDues: string
  meterSubmissionIds?: string[]
}
