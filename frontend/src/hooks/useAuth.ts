import { useAuthContext } from '@/store/AuthContext'

export function useAdminAuth() {
  const { adminAuthed, adminLogin, adminLogout } = useAuthContext()
  return { authed: adminAuthed, login: adminLogin, logout: adminLogout }
}

export function useTenantAuth() {
  const { tenantAuthed, tenantLogin, tenantRegister, tenantLogout } = useAuthContext()
  return { authed: tenantAuthed, login: tenantLogin, register: tenantRegister, logout: tenantLogout }
}
