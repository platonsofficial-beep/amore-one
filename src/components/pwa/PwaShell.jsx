import { useEffect, useRef, useState } from 'react'
import {
  canShowInstallPrompt,
  canShowIosInstallHint,
  dismissInstallPrompt,
  dismissIosInstallHint,
  isInstallPromptDismissed,
  isStandaloneDisplayMode,
  readNetworkStatus,
} from '../../lib/pwaUtils.js'
import {
  isPwaUpdateAvailable,
  reloadPwaForUpdate,
  subscribePwaUpdateAvailable,
} from '../../lib/pwaUpdate.js'
import { t } from '../../i18n/i18n'

const ONLINE_BANNER_MS = 3200

function NetworkStatusBanner({ isOnline, showBackOnline }) {
  if (!isOnline) {
    return (
      <div className="pwa-offline-banner" role="status" aria-live="polite">
        <p className="pwa-offline-banner-copy">
          <strong>{t("You're offline.")}</strong> {t("ONE will open, but live data and saves need a connection. Changes won't sync until you're back online.")}
        </p>
      </div>
    )
  }

  if (!showBackOnline) return null

  return (
    <div className="pwa-offline-banner pwa-online-banner" role="status" aria-live="polite">
      <p className="pwa-offline-banner-copy">
        <strong>{t("Back online.")}</strong> {t("Live data and saves are available again.")}
      </p>
    </div>
  )
}

function PwaUpdateBanner({ onRefresh }) {
  return (
    <div className="pwa-update-banner" role="status" aria-live="polite">
      <p className="pwa-offline-banner-copy">
        <strong>{t("New version available — Refresh")}</strong>
      </p>
      <button
        type="button"
        className="primary-btn pwa-update-refresh-btn"
        data-pwa-update="refresh"
        onClick={onRefresh}
      >
        {t("Refresh")}
      </button>
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
    <aside className="pwa-install-banner" aria-label={t("Install ONE")}>
      <div className="pwa-install-banner-copy">
        {deferredPrompt ? (
          <>
            <strong>{t("Install ONE")}</strong>
            <span>{t("Add ONE to your home screen or apps for faster access.")}</span>
          </>
        ) : (
          <>
            <strong>{t("Install on iPhone")}</strong>
            <span>{t("Tap Share, then Add to Home Screen to install ONE without browser chrome.")}</span>
          </>
        )}
      </div>
      <div className="pwa-install-banner-actions">
        {deferredPrompt ? (
          <button type="button" className="primary-btn pwa-install-btn" onClick={onInstall}>
            {t("Install")}
          </button>
        ) : null}
        <button type="button" className="ghost-btn pwa-install-dismiss-btn" onClick={onDismiss}>
          {t("Dismiss")}
        </button>
      </div>
    </aside>
  )
}

export function PwaShell({ children }) {
  const [isOnline, setIsOnline] = useState(() => readNetworkStatus())
  const [showBackOnline, setShowBackOnline] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showIosHint, setShowIosHint] = useState(() => canShowIosInstallHint())
  const [installDismissed, setInstallDismissed] = useState(() => isInstallPromptDismissed())
  const [updateAvailable, setUpdateAvailable] = useState(() => isPwaUpdateAvailable())
  const wasOfflineRef = useRef(!readNetworkStatus())
  const onlineBannerTimerRef = useRef(null)

  useEffect(() => subscribePwaUpdateAvailable(setUpdateAvailable), [])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      if (wasOfflineRef.current) {
        setShowBackOnline(true)
        window.clearTimeout(onlineBannerTimerRef.current)
        onlineBannerTimerRef.current = window.setTimeout(() => {
          setShowBackOnline(false)
        }, ONLINE_BANNER_MS)
      }
      wasOfflineRef.current = false
    }
    const handleOffline = () => {
      window.clearTimeout(onlineBannerTimerRef.current)
      setShowBackOnline(false)
      setIsOnline(false)
      wasOfflineRef.current = true
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.clearTimeout(onlineBannerTimerRef.current)
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
  const showNetworkStatus = !isOnline || showBackOnline
  const showStatusStack = showNetworkStatus || updateAvailable

  const handlePwaRefresh = () => {
    reloadPwaForUpdate(window.location, window.sessionStorage, { force: true })
  }

  return (
    <>
      {showStatusStack ? (
        <div className="pwa-status-stack">
          <NetworkStatusBanner isOnline={isOnline} showBackOnline={showBackOnline} />
          {updateAvailable ? <PwaUpdateBanner onRefresh={handlePwaRefresh} /> : null}
        </div>
      ) : null}
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
