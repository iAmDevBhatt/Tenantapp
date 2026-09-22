export interface Tenant {
  id: string
  name: string
  phone: string | null
  propertyAddress: string
  monthlyRent: string
  roomRate: string
  waterRate: string
  waterDivisor: number
  upiId: string | null
  active: boolean
  moveInDate: string
  moveOutDate: string | null
  hasPortalAccount: boolean
  portalUsername: string | null
  hasProfilePhoto: boolean
  portalAccessBlocked: boolean
  flatId: string | null
  permanentAddress: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  createdAt: string
}

export interface TenantInput {
  name: string
  phone: string | null
  propertyAddress: string
  monthlyRent: string
  roomRate: string
  waterRate: string
  waterDivisor: number
  upiId: string | null
  moveInDate: string
  flatId?: string | null
  permanentAddress?: string | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
}

export interface NextInvoiceDefaults {
  roomStart: string
  waterStart: string
  previousDues: string
}

export interface TenantDocument {
  id: string
  tenantId: string
  originalFilename: string
  contentType: string | null
  sizeBytes: number | null
  docType: string
  tenantVisible: boolean
  invoiceId: string | null
  uploadedAt: string
}

export interface Invite {
  code: string
  expiresAt: string
  usedAt: string | null
}

export interface InviteStatus {
  invite: Invite | null
  hasRegistered: boolean
}
