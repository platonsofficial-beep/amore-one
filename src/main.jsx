import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import { DeploySetupError } from './components/DeploySetupError.jsx'
import { getSupabaseSetupError } from './lib/supabaseEnv.js'

const LEGAL_PATHS = ['/privacy', '/terms', '/delete-account']
const legalPath = LEGAL_PATHS.find((path) => window.location.pathname.replace(/\/+$/, '') === path)
const isAuthDisabled = import.meta.env.VITE_AUTH_DISABLED === 'true'
const supabaseSetupError = getSupabaseSetupError()

if (legalPath) {
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
