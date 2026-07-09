import { normalizeReservationDateKey, normalizeReservationTimeValue } from './timeFormatUtils'

export function validateReservationFormFields(form, { dateFallback = '' } = {}) {
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

  if (!time) {
    return { ok: false, error: 'Please select a reservation time.', date, time: '', guestName }
  }

  return { ok: true, error: '', date, time, guestName }
}
