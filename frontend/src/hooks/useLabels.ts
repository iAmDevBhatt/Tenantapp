import { useEffect, useState } from 'react'

let cache: Record<string, string> | null = null

async function loadLabels(): Promise<Record<string, string>> {
  if (cache) return cache
  const text = await fetch('/labels.properties').then(r => r.text())
  cache = Object.fromEntries(
    text.split('\n')
      .filter(line => line.includes('=') && !line.startsWith('#') && line.trim() !== '')
      .map(line => {
        const idx = line.indexOf('=')
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()] as [string, string]
      })
  )
  return cache
}

export function useLabels() {
  const [labels, setLabels] = useState<Record<string, string>>(cache ?? {})

  useEffect(() => {
    if (!cache) {
      loadLabels().then(setLabels)
    }
  }, [])

  return {
    l: (key: string, fallback: string) => labels[key] ?? fallback,
  }
}
