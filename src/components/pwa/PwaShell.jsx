import { useEffect, useState } from 'react'
import {
  canShowInstallPrompt,
  canShowIosInstallHint,
  dismissInstallPrompt,
  dismissIosInstallHint,
  isInstallPromptDismissed,
  isStandaloneDisplayMode,
  readNetworkStatus,
} from '../../lib/pwaUtils.js'

function OfflineStatusBanner({ isOnline }) {
  if (isOnline) return null

  return (
    <div className="pwa-offline-banner" role="status" aria-live="polite">
      <p className="pwa-offline-banner-copy">
        <strong>You're offline.</strong> ONE will open, but live data and saves need a connection. Changes won't sync until you're back online.
      </p>
    </div>
  )
}

function PwaInstallBanner({
  deferredPrompt,
  showIosHint,
  onDismiss,
  onInstall,
}) {
  if (!deferredPrompt && !showIosHint) return null

  return (
    <aside className="pwa-install-banner" aria-label="Install ONE">
      <div className="pwa-install-banner-copy">
        {deferredPrompt ? (
          <>
            <strong>Install ONE</strong>
            <span>Add ONE to your home screen or apps for faster access.</span>
          </>
        ) : (
          <>
            <strong>Install on iPhone</strong>
            <span>Tap Share, then Add to Home Screen to install ONE without browser chrome.</span>
          </>
        )}
      </div>
      <div className="pwa-install-banner-actions">
        {deferredPrompt ? (
          <button type="button" className="primary-btn pwa-install-btn" onClick={onInstall}>
            Install
          </button>
        ) : null}
        <button type="button" className="ghost-btn pwa-install-dismiss-btn" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </aside>
  )
}

export function PwaShell({ children }) {
  const [isOnline, setIsOnline] = useState(() => readNetworkStatus())
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showIosHint, setShowIosHint] = useState(() => canShowIosInstallHint())
  const [installDismissed, setInstallDismissed] = useState(() => isInstallPromptDismissed())

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      if (!canShowInstallPrompt(installDismissed)) return
      setDeferredPrompt(event)
    }

    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setShowIosHint(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [installDismissed])

  useEffect(() => {
    if (isStandaloneDisplayMode()) {
      setDeferredPrompt(null)
      setShowIosHint(false)
    }
  }, [])

  const handleDismissInstall = () => {
    if (deferredPrompt) {
      dismissInstallPrompt()
      setInstallDismissed(true)
      setDeferredPrompt(null)
      return
    }

    dismissIosInstallHint()
    setShowIosHint(false)
  }

  const handleInstall = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()

    try {
      await deferredPrompt.userChoice
    } catch {
      // Ignore prompt cancellation errors.
    } finally {
      setDeferredPrompt(null)
    }
  }

  const shouldShowInstall = canShowInstallPrompt(installDismissed)
    && (deferredPrompt || showIosHint)

  return (
    <>
      <OfflineStatusBanner isOnline={isOnline} />
      {shouldShowInstall ? (
        <PwaInstallBanner
          deferredPrompt={deferredPrompt}
          showIosHint={showIosHint && !deferredPrompt}
          onDismiss={handleDismissInstall}
          onInstall={handleInstall}
        />
      ) : null}
      {children}
    </>
  )
}
