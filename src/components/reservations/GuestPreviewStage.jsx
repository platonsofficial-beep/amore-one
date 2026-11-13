import { GuestDirectory } from './GuestHistory'
import { MobileReservationQuickCreateSheet } from '../mobile/reservations/MobileReservationQuickCreateSheet'
import {
  buildGuestPreviewProfiles,
  buildGuestPreviewReservations,
  guestPreviewPhone,
  readGuestPreview,
} from '../../lib/guestHistoryPreview'

export function GuestPreviewStage() {
  const mode = readGuestPreview()
  if (!mode) return null
  const reservations = buildGuestPreviewReservations()
  const profiles = buildGuestPreviewProfiles()
  if (mode === 'list' || mode === 'history' || mode === 'blacklist') {
    return (
      <GuestDirectory
        reservations={reservations}
        profiles={profiles}
        role="owner"
        initialPhone={mode === 'list' ? '' : '+35799111222'}
        startWithBlacklist={mode === 'blacklist'}
        onClose={() => {}}
      />
    )
  }
  const role = mode === 'warning' || mode === 'walkin' ? 'host' : 'owner'
  return (
    <div className="guest-directory" data-testid="guest-preview-stage">
      <MobileReservationQuickCreateSheet
        isOpen
        mode={mode === 'walkin' ? 'walk-in' : 'create'}
        prefill={{ phone: guestPreviewPhone(mode), date: '2026-11-13', guests: '4' }}
        todayKey="2026-11-13"
        reservations={reservations}
        role={role}
        onClose={() => {}}
        onSubmit={() => {}}
      />
    </div>
  )
}
