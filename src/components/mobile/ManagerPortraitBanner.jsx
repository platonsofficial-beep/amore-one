import { useState } from 'react'

const STORAGE_PREFIX = 'one.managerPortraitBanner.'

function readDismissed(area) {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(`${STORAGE_PREFIX}${area}`) === '1'
  } catch {
    return false
  }
}

export function ManagerPortraitBanner({ area = 'view' }) {
  const [dismissed, setDismissed] = useState(() => readDismissed(area))
  if (dismissed) return null

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(`${STORAGE_PREFIX}${area}`, '1')
    } catch {
      // The banner still closes for this visit.
    }
    setDismissed(true)
  }

  return (
    <div className="manager-portrait-banner" role="note">
      <span className="manager-portrait-banner-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <rect x="8" y="3" width="8" height="14" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M16.5 8.5c2.2.8 3.5 2.6 3.5 4.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M15.2 6.2l2.6.4-.4 2.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <p>Turn your phone sideways for the full view</p>
      <button type="button" className="manager-portrait-banner-dismiss" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
