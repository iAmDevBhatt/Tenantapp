import { useEffect, useState } from 'react'
import axios from 'axios'

interface AppConfig {
  appUrl: string | null
}

let cached: AppConfig | null = null
let fetchPromise: Promise<AppConfig> | null = null

async function fetchConfig(): Promise<AppConfig> {
  if (cached) return cached
  if (!fetchPromise) {
    fetchPromise = axios.get<AppConfig>('/api/config').then((r) => {
      cached = r.data
      return cached
    })
  }
  return fetchPromise
}

export function useAppConfig() {
  const [config, setConfig] = useState<AppConfig | null>(cached)

  useEffect(() => {
    if (!config) {
      fetchConfig().then(setConfig)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function appOrigin(): string {
    return config?.appUrl ?? window.location.origin
  }

  return { appOrigin }
}
