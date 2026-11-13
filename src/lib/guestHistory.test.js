import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  blacklistConfirmState,
  buildGuestDirectory,
  canBlacklistGuest,
  canEditGuestNotes,
  findGuestByPhone,
  guestPhoneKey,
  searchGuests,
  summarizeGuest,
  countLabel,
  formatGuestDate,
  formatGuestFavourite,
} from './guestHistory'
import { buildGuestPreviewProfiles, buildGuestPreviewReservations, readGuestPreview } from './guestHistoryPreview'

const reservations = buildGuestPreviewReservations()
const profiles = buildGuestPreviewProfiles()

describe('guest history', () => {
  it('normalizes a local number with the venue country code', () => {
    expect(guestPhoneKey('99 111 222', '+357')).toBe('+35799111222')
    expect(guestPhoneKey('+357 99 111 222', '+357')).toBe('+35799111222')
  })

  it('counts visits, no-shows, cancellations, and favourites from reservations', () => {
    const guest = summarizeGuest(reservations, '99111222', '+357')
    expect(guest.visits).toBe(3)
    expect(guest.noShows).toBe(1)
    expect(guest.cancellations).toBe(1)
    expect(guest.lastVisit).toBe('2026-11-01')
    expect(guest.favouriteTables).toContain('T4')
    expect(guest.favouriteArea).toBe('Main Dining')
    expect(formatGuestFavourite(guest)).toBe('T4 · Main Dining')
    expect(formatGuestDate(guest.lastVisit)).toBe('1 Nov 2026')
    expect(countLabel(1, 'visit', 'visits')).toBe('1 visit')
    expect(countLabel(1, 'no-show', 'no-shows')).toBe('1 no-show')
    expect(countLabel(1, 'cancellation', 'cancellations')).toBe('1 cancellation')
    expect(countLabel(3, 'visit', 'visits')).toBe('3 visits')
    expect(guest.usualPartySize).toBe(4)
    expect(guest.bookings[0].date).toBe('2026-11-01')
  })

  it('searches by name or phone and merges blacklist notes', () => {
    const directory = buildGuestDirectory(reservations, profiles, '+357')
    expect(searchGuests(directory, 'maria', '+357').map((guest) => guest.guestName)).toEqual(['Maria Costa'])
    expect(searchGuests(directory, '99222333', '+357')[0].blacklisted).toBe(true)
    expect(findGuestByPhone(directory, '+35799111222', '+357').notes).toContain('shellfish')
  })

  it('lets a manager override a blacklist and stops a host', () => {
    const guest = { blacklisted: true, blacklistReason: 'No-show without calling, twice', role: 'host' }
    expect(blacklistConfirmState(guest).warning).toBe('Blacklisted guest — No-show without calling, twice')
    expect(blacklistConfirmState(guest).blocked).toBe(true)
    expect(blacklistConfirmState({ ...guest, role: 'manager' }).blocked).toBe(false)
    expect(canEditGuestNotes('host')).toBe(true)
    expect(canEditGuestNotes('staff')).toBe(false)
    expect(canBlacklistGuest('owner')).toBe(true)
    expect(canBlacklistGuest('host')).toBe(false)
  })

  it('keeps the SQL unapplied and limited to the venue roles', () => {
    const sql = readFileSync(new URL('../../supabase/guest_history.sql', import.meta.url), 'utf8')
    expect(sql).toContain('NOT APPLIED')
    expect(sql).toContain('phone_e164')
    expect(sql).toContain('can_blacklist_guest')
    expect(sql).toContain("'host'")
    expect(sql).not.toContain("'staff'")
  })

  it('ignores the preview query unless local auth is disabled', () => {
    expect(readGuestPreview('?guestPreview=warning', { VITE_AUTH_DISABLED: 'false' })).toBeNull()
    expect(readGuestPreview('?guestPreview=warning', { VITE_AUTH_DISABLED: 'true' })).toBe('warning')
  })
})
