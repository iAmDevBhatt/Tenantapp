import axios, { AxiosInstance } from 'axios'
import { safeStorage } from '@/lib/safeStorage'

/** Creates an axios instance bound to a specific localStorage token key and a
 * specific redirect target on 401. Two independent instances (admin + portal)
 * let an admin tab and a tenant-portal tab coexist in the same browser
 * without clobbering each other's session. */
export function createApiClient(tokenKey: string, loginPath: string, redirectOn403 = false): AxiosInstance {
  const instance = axios.create({ baseURL: '/api' })

  instance.interceptors.request.use((config) => {
    const token = safeStorage.getItem(tokenKey)
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  instance.interceptors.response.use(
    (res) => res,
    (error) => {
      const status = error.response?.status
      if (status === 401 || (redirectOn403 && status === 403)) {
        safeStorage.removeItem(tokenKey)
        if (window.location.pathname !== loginPath) {
          window.location.href = loginPath
        }
      }
      return Promise.reject(error)
    },
  )

  return instance
}

/** FastAPI returns `detail` as a plain string for business-logic errors (400/404/...)
 * but as an array of {loc,msg,type} objects for Pydantic validation failures (422).
 * Rendering that array directly as a React child throws, so this always normalizes
 * to a string. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail
    if (typeof detail === 'string' && detail) return detail
    if (Array.isArray(detail)) {
      const msgs = detail.map((d) => (d && typeof d === 'object' ? d.msg : null)).filter(Boolean)
      if (msgs.length) return msgs.join(', ')
    }
    return err.message || fallback
  }
  return fallback
}
