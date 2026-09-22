import { portalClient } from './portalClient'
import { TokenResponse } from '@/types/auth'

export const portalAuthApi = {
  validateCode: (code: string) =>
    portalClient
      .get<{ valid: boolean; tenantName?: string; alreadyRegistered: boolean; existingLoginCount: number }>(
        '/portal/auth/validate-code',
        { params: { code } },
      )
      .then((r) => r.data),

  register: (code: string, username: string, password: string, fullName: string) =>
    portalClient
      .post<TokenResponse>('/portal/auth/register', { code, username, password, fullName })
      .then((r) => r.data),

  login: (username: string, password: string) =>
    portalClient.post<TokenResponse>('/portal/auth/login', { username, password }).then((r) => r.data),
}
