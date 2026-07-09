const IOS_INSTALL_DISMISS_KEY = 'one_pwa_ios_install_dismissed'
const INSTALL_DISMISS_KEY = 'one_pwa_install_dismissed'

export function isStandaloneDisplayMode() {
  if (typeof window === 'undefined') return false

  return window.matchMedia?.('(display-mode: standalone)')?.matches === true
    || window.matchMedia?.('(display-mode: fullscreen)')?.matches === true
    || window.navigator?.standalone === true
}

export function isIosDevice() {
  if (typeof navigator === 'undefined') return false

  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''
  const maxTouchPoints = navigator.maxTouchPoints ?? 0

  return /iPad|iPhone|iPod/i.test(ua)
    || (platform === 'MacIntel' && maxTouchPoints > 1)
}

export function canShowIosInstallHint() {
  if (typeof window === 'undefined') return false
  if (isStandaloneDisplayMode()) return false
  if (!isIosDevice()) return false
  return window.localStorage?.getItem(IOS_INSTALL_DISMISS_KEY) !== '1'
}

export function dismissIosInstallHint() {
  window.localStorage?.setItem(IOS_INSTALL_DISMISS_KEY, '1')
}

export function canShowInstallPrompt(dismissed = false) {
  return !dismissed && !isStandaloneDisplayMode()
}

export function isInstallPromptDismissed() {
  if (typeof window === 'undefined') return false
  return window.localStorage?.getItem(INSTALL_DISMISS_KEY) === '1'
}

export function dismissInstallPrompt() {
  window.localStorage?.setItem(INSTALL_DISMISS_KEY, '1')
}

export function readNetworkStatus() {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}
