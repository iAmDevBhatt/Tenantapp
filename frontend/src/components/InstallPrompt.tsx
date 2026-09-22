import { useEffect, useState } from 'react'
import { safeStorage } from '@/lib/safeStorage'
import { useLabels } from '@/hooks/useLabels'

const DISMISS_KEY = 'rentledger_install_dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
  } catch {
    return false
  }
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

/** Nudges the tenant to install the PWA to their home screen. Android/Chrome
 * gets a real one-tap install via `beforeinstallprompt`; iOS Safari has no
 * install API at all (Apple limitation), so it just gets static
 * instructions. Dismissal is remembered per-device via safeStorage. */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosHint, setShowIosHint] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const { l } = useLabels()

  useEffect(() => {
    if (isStandalone() || safeStorage.getItem(DISMISS_KEY) === '1') {
      setDismissed(true)
      return
    }
    if (isIOS()) {
      setShowIosHint(true)
      return
    }
    function handler(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    setDismissed(true)
    setDeferredPrompt(null)
    setShowIosHint(false)
    safeStorage.setItem(DISMISS_KEY, '1')
  }

  async function handleInstall() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    safeStorage.setItem(DISMISS_KEY, '1')
  }

  if (dismissed || (!deferredPrompt && !showIosHint)) return null

  return (
    <div className="card p-4 flex items-center justify-between gap-3 bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-800">
      <div className="min-w-0">
        <p className="text-sm font-medium">{l('install.title', 'Install this app')}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {showIosHint
            ? l('install.iosHint', 'Tap the Share icon, then "Add to Home Screen" for quick access.')
            : l('install.subtitle', 'Add it to your home screen for quick access, like a regular app.')}
        </p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        {!showIosHint && (
          <button className="btn-primary btn-compact" onClick={handleInstall}>
            {l('install.btn.install', 'Install')}
          </button>
        )}
        <button className="btn-secondary btn-compact" onClick={dismiss}>
          {l('btn.dismiss', 'Dismiss')}
        </button>
      </div>
    </div>
  )
}
