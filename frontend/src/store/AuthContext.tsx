import { createContext, useCallback, useContext, useState, ReactNode } from 'react'
import { ADMIN_TOKEN_KEY } from '@/api/adminClient'
import { TENANT_TOKEN_KEY } from '@/api/portalClient'
import { authApi } from '@/api/auth'
import { portalAuthApi } from '@/api/portalAuth'

interface AuthContextValue {
  adminAuthed: boolean
  adminLogin: (username: string, password: string) => Promise<void>
  adminLogout: () => void

  tenantAuthed: boolean
  tenantLogin: (username: string, password: string) => Promise<void>
  tenantRegister: (code: string, username: string, password: string) => Promise<void>
  tenantLogout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [adminAuthed, setAdminAuthed] = useState<boolean>(!!localStorage.getItem(ADMIN_TOKEN_KEY))
  const [tenantAuthed, setTenantAuthed] = useState<boolean>(!!localStorage.getItem(TENANT_TOKEN_KEY))

  const adminLogin = useCallback(async (username: string, password: string) => {
    const { accessToken } = await authApi.login(username, password)
    localStorage.setItem(ADMIN_TOKEN_KEY, accessToken)
    setAdminAuthed(true)
  }, [])

  const adminLogout = useCallback(() => {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
    setAdminAuthed(false)
  }, [])

  const tenantLogin = useCallback(async (username: string, password: string) => {
    const { accessToken } = await portalAuthApi.login(username, password)
    localStorage.setItem(TENANT_TOKEN_KEY, accessToken)
    setTenantAuthed(true)
  }, [])

  const tenantRegister = useCallback(async (code: string, username: string, password: string) => {
    const { accessToken } = await portalAuthApi.register(code, username, password)
    localStorage.setItem(TENANT_TOKEN_KEY, accessToken)
    setTenantAuthed(true)
  }, [])

  const tenantLogout = useCallback(() => {
    localStorage.removeItem(TENANT_TOKEN_KEY)
    setTenantAuthed(false)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        adminAuthed, adminLogin, adminLogout,
        tenantAuthed, tenantLogin, tenantRegister, tenantLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}
