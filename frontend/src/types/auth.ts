export type Role = 'admin' | 'tenant'

export interface TokenResponse {
  accessToken: string
  role: Role
}
