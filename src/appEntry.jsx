import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './mobileShell.css'
import './uiScale.css'
import { KeyboardInset } from './lib/KeyboardInset.jsx'
import { AuthProvider } from './context/AuthContext'
import { AvatarDirectoryProvider } from './context/AvatarDirectoryContext'
import { AuthGate } from './components/auth/AuthGate'
import { ManagerLandscapeGate } from './components/shell/ManagerLandscapeGate.jsx'
import { PwaShell } from './components/pwa/PwaShell.jsx'
import { registerPwaServiceWorker } from './pwaRegister.js'
import { bindPhoneLandscapeClass } from './lib/phoneLandscapeClass.js'
import { bindOrientationSettle } from './lib/orientationSettle.js'
import { WorkspaceKeyedApp } from './components/workspace/WorkspaceKeyedApp.jsx'
import './safeOverlay.css'
import './mobileTabBarLow.css'
import './countLandscapePhone.css'
import './activeCountPhonePortrait.css'
import { ColdStartSplash } from './components/shell/ColdStartSplash.jsx'
import { useEffect } from 'react'
import { applyGreekUppercase, subscribeLocale, useLocale } from './i18n/i18n'

function LocaleRoot() {
  // Own this tree. Passing the app in as an unchanged child element lets React
  // skip the screen, so t() stays in the previous language.
  useLocale()
  useEffect(() => {
    let frame = 0
    const run = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => applyGreekUppercase(document.body))
    }
    run()
    const stopLocale = subscribeLocale(run)
    const observer = new MutationObserver(run)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => {
      cancelAnimationFrame(frame)
      stopLocale()
      observer.disconnect()
    }
  }, [])
  return (
    <>
      <AuthGate>
        <ManagerLandscapeGate>
          <PwaShell>
            <KeyboardInset />
            <WorkspaceKeyedApp />
          </PwaShell>
        </ManagerLandscapeGate>
      </AuthGate>
      <ColdStartSplash />
    </>
  )
}

bindPhoneLandscapeClass()
bindOrientationSettle()
registerPwaServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AvatarDirectoryProvider>
        <LocaleRoot />
      </AvatarDirectoryProvider>
    </AuthProvider>
  </StrictMode>,
)
