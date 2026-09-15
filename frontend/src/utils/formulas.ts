/** Mirrors backend/services/invoice_service.py::compute_invoice_amounts for
 * the LIVE PREVIEW only, while the landlord is typing. The saved invoice's
 * numbers always come back from the server response after POST/PUT -- this
 * is never treated as the source of truth, only as instant on-screen
 * feedback before save. */
export interface InvoicePreviewInput {
  roomStart: number
  roomEnd: number
  waterStart: number
  waterEnd: number
  roomRate: number
  waterRate: number
  waterDivisor: number
  monthlyRent: number
  previousDues: number
}

export interface InvoicePreview {
  roomUsage: number
  roomAmount: number
  waterUsage: number
  waterAmount: number
  totalPayable: number
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function computeInvoicePreview(input: InvoicePreviewInput): InvoicePreview {
  const roomUsage = input.roomEnd - input.roomStart
  const roomAmount = round2(roomUsage * input.roomRate)

  const waterUsageRaw = input.waterEnd - input.waterStart
  const divisor = input.waterDivisor > 0 ? input.waterDivisor : 1
  const waterUsage = round2(waterUsageRaw / divisor)
  const waterAmount = round2(waterUsage * input.waterRate)

  const totalPayable = round2(roomAmount + waterAmount + input.monthlyRent + input.previousDues)

  return { roomUsage, roomAmount, waterUsage, waterAmount, totalPayable }
}

export function formatINR(value: number | string): string {
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (Number.isNaN(n)) return '₹0.00'
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
