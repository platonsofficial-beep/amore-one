import { describe, expect, it } from 'vitest'
import { getHostListCompactStatusLabel } from './reservationHostStatus'

describe('getHostListCompactStatusLabel', () => {
  it('maps long host statuses to compact list labels', () => {
    expect(getHostListCompactStatusLabel('Late Booking')).toBe('Late')
    expect(getHostListCompactStatusLabel('Checked In')).toBe('Seated')
    expect(getHostListCompactStatusLabel('Waiting')).toBe('Arrived')
    expect(getHostListCompactStatusLabel('Not Shown')).toBe('No-show')
    expect(getHostListCompactStatusLabel('Checked Out')).toBe('Completed')
    expect(getHostListCompactStatusLabel('Confirmed')).toBe('Confirmed')
  })
})
