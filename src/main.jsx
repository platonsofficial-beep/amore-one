import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import { DeploySetupError } from './components/DeploySetupError.jsx'
import { getSupabaseSetupError } from './lib/supabaseEnv.js'
import { bindIslandSide } from './lib/islandInsets.js'
import { applySignupHandoff } from './lib/signupHandoff.js'
import { parsePublicBookingPath } from './lib/publicBooking.js'

bindIslandSide()
applySignupHandoff()

const LEGAL_PATHS = ['/privacy', '/terms', '/dpa', '/cookies', '/delete-account']
const legalPath = LEGAL_PATHS.find((path) => window.location.pathname.replace(/\/+$/, '') === path)
const bookingPath = parsePublicBookingPath(window.location.pathname)
const isAuthDisabled = import.meta.env.VITE_AUTH_DISABLED === 'true'
const supabaseSetupError = bookingPath ? null : getSupabaseSetupError()

if (bookingPath) {
  import('./publicBooking/publicBookingEntry.jsx')
    .then(({ mountPublicBooking }) => mountPublicBooking(bookingPath))
    .catch(() => {
      const root = document.getElementById('root')
      if (root) root.textContent = 'Online reservations are not available right now.'
    })
} else if (legalPath) {
  import('./legalEntry.jsx').then(({ mountLegalPage }) => mountLegalPage(legalPath))
} else if (supabaseSetupError && !isAuthDisabled) {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <DeploySetupError message={supabaseSetupError} />
    </StrictMode>,
  )
} else {
  import('./appEntry.jsx')
}
