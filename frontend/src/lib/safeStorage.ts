/** localStorage wrapper that never throws. Some browsers (Safari private
 * mode, WhatsApp/Instagram in-app WebViews with storage restrictions) throw
 * a SecurityError on any localStorage access. Since AuthContext reads a
 * token during the very first render with no error boundary in place, an
 * unguarded call there blanks the entire app before anything can mount. */
export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value)
    } catch {
      // storage unavailable — session just won't persist across reloads
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch {
      // no-op
    }
  },
}
