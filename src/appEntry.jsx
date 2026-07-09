import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './mobileShell.css'
import { AuthProvider } from './context/AuthContext'
import { AuthGate } from './components/auth/AuthGate'
import { PwaShell } from './components/pwa/PwaShell.jsx'
import { registerPwaServiceWorker } from './pwaRegister.js'
import App from './App.jsx'

registerPwaServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        <PwaShell>
          <App />
        </PwaShell>
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
)
