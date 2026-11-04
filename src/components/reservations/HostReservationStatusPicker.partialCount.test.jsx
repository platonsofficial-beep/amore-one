// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { HostReservationStatusPicker, getPartialSeatCountOptions } from './HostReservationStatusPicker'
import {
  formatPartialSeatLabel,
  formatPartialSeatRemaining,
  getHostListCompactStatusPresentation,
} from '../../lib/reservationHostStatus'
import { buildReservationUpdatePayload, isMissingSeatedGuestsColumnError, mapReservationRecord, serializeReservationForPersistence } from '../../services/reservationService'

Element.prototype.scrollIntoView ??= () => {}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const base = { id: 'r1', date: '2026-11-04', time: '13:00', guestName: 'Sofia Ioannou', guests: 4, status: 'Confirmed', notes: '' }

function openPicker(reservation, onSelectStatus, onClose = vi.fn()) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(
    <HostReservationStatusPicker
      reservation={reservation}
      currentStatusId={reservation.status}
      anchorRect={{ top: 100, bottom: 130, left: 10, right: 110, width: 100, height: 30 }}
      isOpen
      onClose={onClose}
      onSelectStatus={onSelectStatus}
    />,
  ))
  return { root, onClose }
}

const option = (text) => [...document.querySelectorAll('.host-status-picker-option')].find((b) => b.textContent.includes(text))

describe('Seated · partly count step (Platon t453u)', () => {
  it('offers 1..party-1 only; the whole party suggests plain Seated', () => {
    expect(getPartialSeatCountOptions(4)).toEqual([1, 2, 3])
    expect(getPartialSeatCountOptions(1)).toEqual([])
    const onSelectStatus = vi.fn()
    const { root } = openPicker(base, onSelectStatus)
    act(() => option('Seated · partly').click())
    expect(onSelectStatus).not.toHaveBeenCalled()
    const counts = [...document.querySelectorAll('.host-status-count-option')].map((b) => b.textContent)
    expect(counts).toEqual(['1', '2', '3'])
    act(() => document.querySelector('.host-status-count-all').click())
    expect(onSelectStatus).toHaveBeenCalledWith(base, 'Checked In', { seatedGuests: null })
    act(() => root.unmount())
  })

  it('saves the count together with the status', () => {
    const onSelectStatus = vi.fn()
    const { root } = openPicker(base, onSelectStatus)
    act(() => option('Seated · partly').click())
    act(() => [...document.querySelectorAll('.host-status-count-option')][1].click())
    expect(onSelectStatus).toHaveBeenCalledWith(base, 'Checked In (Partial)', { seatedGuests: 2 })
    act(() => root.unmount())
  })

  it('Back and close keep the old status', () => {
    const onSelectStatus = vi.fn()
    const { root, onClose } = openPicker(base, onSelectStatus)
    act(() => option('Seated · partly').click())
    act(() => document.querySelector('.host-status-count-back').click())
    expect(document.querySelector('.host-status-count-step')).toBeNull()
    expect(document.querySelector('.host-status-picker-option.is-active')?.textContent).toContain('Confirmed')
    act(() => option('Seated · partly').click())
    act(() => document.querySelector('.host-status-picker-close').click())
    expect(onClose).toHaveBeenCalled()
    expect(onSelectStatus).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('picking it again edits the saved count', () => {
    const partial = { ...base, status: 'Checked In (Partial)', seatedGuests: 3 }
    const onSelectStatus = vi.fn()
    const { root } = openPicker(partial, onSelectStatus)
    act(() => option('Seated · partly').click())
    expect(document.querySelector('.host-status-count-option.is-active')?.textContent).toBe('3')
    act(() => [...document.querySelectorAll('.host-status-count-option')][0].click())
    expect(onSelectStatus).toHaveBeenCalledWith(partial, 'Checked In (Partial)', { seatedGuests: 1 })
    act(() => root.unmount())
  })

  it('shows Seated 2/4 and 2 to come, and ignores counts >= party size', () => {
    const partial = { ...base, status: 'Checked In (Partial)', seatedGuests: 2 }
    expect(formatPartialSeatLabel(partial)).toBe('Seated 2/4')
    expect(formatPartialSeatRemaining(partial)).toBe('2 to come')
    expect(getHostListCompactStatusPresentation(partial, 13 * 60, '2026-11-04').label).toBe('Seated 2/4')
    expect(formatPartialSeatLabel({ ...partial, seatedGuests: 4 })).toBe('Seated · partly')
    expect(formatPartialSeatLabel({ ...partial, seatedGuests: 0 })).toBe('Seated · partly')
  })

  it('falls back to Seated · partly when the column is missing', () => {
    const fromOldDb = mapReservationRecord({ id: 'r1', guest_name: 'A', party_size: 4, status: 'Checked In (Partial)', notes: '' })
    expect(fromOldDb.seatedGuests).toBeUndefined()
    expect(formatPartialSeatLabel(fromOldDb)).toBe('Seated · partly')
    // Normal saves never send the column while it is unknown.
    expect(Object.hasOwn(serializeReservationForPersistence(fromOldDb), 'seated_guests')).toBe(false)
    expect(isMissingSeatedGuestsColumnError({ message: "Could not find the 'seated_guests' column of 'reservations' in the schema cache" })).toBe(true)
  })

  it('clears the count when the status moves on', () => {
    const partial = { ...base, status: 'Checked In (Partial)', seatedGuests: 2 }
    expect(buildReservationUpdatePayload(partial, { status: 'Checked In' }).seatedGuests).toBeNull()
    expect(buildReservationUpdatePayload(partial, { notes: 'x' }).seatedGuests).toBe(2)
    expect(serializeReservationForPersistence(buildReservationUpdatePayload(partial, { status: 'Checked In (Partial)', seatedGuests: 3 })).seated_guests).toBe(3)
  })
})
