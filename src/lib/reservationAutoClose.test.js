import { describe, expect, it } from 'vitest'
import {
  AUTO_CLOSED_BADGE_LABEL,
  DEFAULT_RESERVATION_AUTO_CLOSE_TIME,
  isAutoClosedReservation,
  isMissingAutoClosedColumnError,
  resolveAutoCloseUndoStatus,
  normalizeReservationAutoCloseTime,
} from './reservationAutoClose'

describe('reservationAutoClose', () => {
  it('keeps a valid cutoff and falls back to 05:00', () => {
    expect(normalizeReservationAutoCloseTime('6:30')).toBe('06:30')
    expect(normalizeReservationAutoCloseTime('05:00:00')).toBe('05:00')
    expect(normalizeReservationAutoCloseTime('')).toBe(DEFAULT_RESERVATION_AUTO_CLOSE_TIME)
    expect(normalizeReservationAutoCloseTime('25:00')).toBe('05:00')
  })

  it('marks only checked-out rows that carry auto_closed_at', () => {
    expect(isAutoClosedReservation({
      status: 'Checked Out',
      autoClosedAt: '2026-10-27T02:00:00.000Z',
    })).toBe(true)
    expect(isAutoClosedReservation({
      status: 'Checked Out',
      autoClosedAt: null,
    })).toBe(false)
    expect(isAutoClosedReservation({
      status: 'Checked In',
      auto_closed_at: '2026-10-27T02:00:00.000Z',
    })).toBe(false)
    expect(AUTO_CLOSED_BADGE_LABEL).toBe('κλείστηκε αυτόματα / Auto-closed')
  })

  it('restores the in-house status the auto-close recorded', () => {
    expect(resolveAutoCloseUndoStatus({ autoClosedFromStatus: 'Walk In' })).toBe('Walk In')
    expect(resolveAutoCloseUndoStatus({ auto_closed_from_status: 'Checked In (Partial)' })).toBe('Checked In (Partial)')
    expect(resolveAutoCloseUndoStatus({ autoClosedFromStatus: null })).toBe('Checked In')
    expect(resolveAutoCloseUndoStatus({})).toBe('Checked In')
  })

  it('recognises a missing auto_closed_at column without treating every error as missing', () => {
    expect(isMissingAutoClosedColumnError({
      message: "Could not find the 'auto_closed_at' column of 'reservations' in the schema cache",
    })).toBe(true)
    expect(isMissingAutoClosedColumnError({
      message: 'Unable to update reservation right now.',
    })).toBe(false)
  })
})
