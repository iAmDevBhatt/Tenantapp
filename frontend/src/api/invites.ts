import { adminClient } from './adminClient'
import { Invite, InviteStatus } from '@/types/tenant'

export const invitesApi = {
  get: (tenantId: string) =>
    adminClient.get<InviteStatus>(`/tenants/${tenantId}/invite`).then((r) => r.data),

  generate: (tenantId: string) =>
    adminClient.post<Invite>(`/tenants/${tenantId}/invite`).then((r) => r.data),

  revoke: (tenantId: string) => adminClient.delete(`/tenants/${tenantId}/invite`),
}
