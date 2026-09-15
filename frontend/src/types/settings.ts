export interface AppSettings {
  ownerName: string
  defaultUpiId: string | null
  hasPropertyPhoto: boolean
  invoiceDueDays: number
}

export interface PortalMe {
  tenantId: string
  name: string
  propertyAddress: string
  active: boolean
  moveInDate: string
  moveOutDate: string | null
}

export interface Overview {
  activeTenantCount: number
  totalOutstandingDues: string
  unpaidInvoiceCount: number
  thisMonthCollected: string
}
