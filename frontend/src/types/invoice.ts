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
}

export interface InvoiceCreateInput {
  tenantId: string
  invoiceDate: string
  roomStart: string
  roomEnd: string
  waterStart: string
  waterEnd: string
  previousDues: string
}
