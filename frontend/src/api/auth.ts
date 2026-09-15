import { adminClient } from './adminClient'
import { TokenResponse } from '@/types/auth'

export const authApi = {
  login: (username: string, password: string) =>
    adminClient.post<TokenResponse>('/auth/login', { username, password }).then((r) => r.data),

  me: () => adminClient.get('/auth/me').then((r) => r.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    adminClient.post('/auth/change-password', { currentPassword, newPassword }).then((r) => r.data),
}
