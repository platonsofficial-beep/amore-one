import { normalizeReservationDateKey, normalizeReservationTimeValue } from './timeFormatUtils'

/**
 * minDateKey: earliest date allowed (today for a new booking). Leave it empty
 * to allow any date, e.g. when an existing past booking is edited in place.
 */
export function validateReservationFormFields(form, { dateFallback = '', minDateKey = '' } = {}) {
  const guestName = `${form?.guestName ?? ''}`.trim()
  const date = normalizeReservationDateKey(form?.date)
    || normalizeReservationDateKey(dateFallback)
  const time = normalizeReservationTimeValue(form?.time)

  if (!guestName) {
    return { ok: false, error: 'Please provide the guest name.', date, time, guestName }
  }

  if (!date) {
    return { ok: false, error: 'Please select a reservation date.', date: '', time, guestName }
  }

  const earliestDate = normalizeReservationDateKey(minDateKey)
  if (earliestDate && date < earliestDate) {
    return { ok: false, error: 'That date has passed. Pick today or a later date.', date, time, guestName }
  }

  if (!time) {
    return { ok: false, error: 'Please select a reservation time.', date, time: '', guestName }
  }

  // Party size is checked only when the form has the field (0 used to save as 2).
  if (form?.guests !== undefined && form?.guests !== null) {
    const guests = Number(form.guests)
    if (!Number.isInteger(guests) || guests < 1) {
      return { ok: false, error: 'Party size must be at least 1.', date, time, guestName }
    }
  }

  return { ok: true, error: '', date, time, guestName }
}
