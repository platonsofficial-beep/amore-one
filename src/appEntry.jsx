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
import App from './App.jsx'
import './safeOverlay.css'

registerPwaServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AvatarDirectoryProvider>
        <AuthGate>
          <ManagerLandscapeGate>
            <PwaShell>
              <KeyboardInset />
              <App />
            </PwaShell>
          </ManagerLandscapeGate>
        </AuthGate>
      </AvatarDirectoryProvider>
    </AuthProvider>
  </StrictMode>,
)
