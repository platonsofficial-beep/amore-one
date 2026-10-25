import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './mobileShell.css'
import { AuthProvider } from './context/AuthContext'
import { AuthGate } from './components/auth/AuthGate'
import { ManagerLandscapeGate } from './components/shell/ManagerLandscapeGate.jsx'
import { PwaShell } from './components/pwa/PwaShell.jsx'
import { registerPwaServiceWorker } from './pwaRegister.js'
import App from './App.jsx'

registerPwaServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <ManagerLandscapeGate>
          <PwaShell>
            <App />
          </PwaShell>
        </ManagerLandscapeGate>
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
)
