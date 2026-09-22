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

export function errorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return err.response?.data?.detail || err.message
  }
  return String(err)
}
