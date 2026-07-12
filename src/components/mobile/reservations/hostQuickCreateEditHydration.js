import { createHostReservationEditForm } from '../../reservations/HostReservationEditPanel'
import { createHostQuickCreateFormState } from '../../../lib/hostQuickCreateForm'

export function splitGuestNameForQuickCreateEdit(guestName) {
  const trimmed = `${guestName ?? ''}`.trim()
  if (!trimmed) {
    return { firstName: '', lastName: '' }
  }

  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' }
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

export function buildQuickCreateEditHydration(reservation, layout, seatings = [], todayKey = '') {
  const editForm = createHostReservationEditForm(reservation, layout, seatings)
  if (!editForm) return null

  const { firstName, lastName } = splitGuestNameForQuickCreateEdit(editForm.guestName)
  const quickForm = createHostQuickCreateFormState({
    ...editForm,
    extraChairs: Math.min(1, Math.max(0, Number(editForm.extraChairs) || 0)),
    seatingManuallyOverridden: true,
  }, { todayKey, layout, seatings })

  return {
    quickForm: {
      ...quickForm,
      status: editForm.status,
      customerType: editForm.customerType,
      reservationPurpose: editForm.reservationPurpose,
      standingGuests: editForm.standingGuests ?? 0,
    },
    firstName,
    lastName,
    guestTitle: `${editForm.guestName ?? ''}`.trim() || 'Edit reservation',
  }
}
