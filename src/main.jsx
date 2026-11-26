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
const previewParams = import.meta.env.DEV ? new URLSearchParams(window.location.search) : null
const hoursShot = previewParams?.get('preview') === 'hours'
  ? (previewParams.get('shot') || 'list')
  : ''
const staffHoursShot = previewParams?.get('preview') === 'staff-hours'
  ? (previewParams.get('shot') || 'settings')
  : ''
const teamTabShot = previewParams?.get('preview') === 'team-tab'
  ? (previewParams.get('shot') || 'today')
  : ''
const supabaseSetupError = hoursShot || staffHoursShot || teamTabShot || bookingPath ? null : getSupabaseSetupError()

if (hoursShot) {
  const { HoursReviewPreview } = await import('./hoursReviewPreview.jsx')
  createRoot(document.getElementById('root')).render(
    <HoursReviewPreview shot={hoursShot} />,
  )
} else if (staffHoursShot) {
  const { StaffHoursSettingsPreview } = await import('./staffHoursSettingsPreview.jsx')
  createRoot(document.getElementById('root')).render(
    <StaffHoursSettingsPreview shot={staffHoursShot} />,
  )
} else if (teamTabShot) {
  const { TeamTabPreview } = await import('./teamTabPreview.jsx')
  createRoot(document.getElementById('root')).render(
    <TeamTabPreview shot={teamTabShot} />,
  )
} else if (bookingPath) {
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
