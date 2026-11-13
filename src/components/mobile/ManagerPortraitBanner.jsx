import { useState } from 'react'
import { t } from '../../i18n/i18n'

const STORAGE_PREFIX = 'one.managerPortraitBanner.'
/** P-01: one dismiss hides the hint on every manager portrait screen on this device. */
export const PORTRAIT_BANNER_ALL_KEY = `${STORAGE_PREFIX}all`

function readDismissed(area) {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(PORTRAIT_BANNER_ALL_KEY) === '1'
      || window.localStorage.getItem(`${STORAGE_PREFIX}${area}`) === '1'
  } catch {
    return false
  }
}

// S-26: dismissal is remembered on this device (was per tab session).
export function ManagerPortraitBanner({ area = 'view' }) {
  const [dismissed, setDismissed] = useState(() => readDismissed(area))
  if (dismissed) return null

  const dismiss = () => {
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${area}`, '1')
      window.localStorage.setItem(PORTRAIT_BANNER_ALL_KEY, '1')
    } catch {
      // The banner still closes for this visit.
    }
    setDismissed(true)
  }

  return (
    <button type="button" className="manager-portrait-banner" onClick={dismiss} aria-label={t("Dismiss")}>
      <span className="manager-portrait-banner-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <rect x="8" y="3" width="8" height="14" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M16.5 8.5c2.2.8 3.5 2.6 3.5 4.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M15.2 6.2l2.6.4-.4 2.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="manager-portrait-banner-copy">{t("Turn your phone sideways for the full view")}</span>
      <span className="manager-portrait-banner-dismiss" aria-hidden="true">×</span>
    </button>
  )
}
