import { describe, expect, it } from 'vitest'
import {
  getHostListCompactStatusLabel,
  getHostListCompactStatusPresentation,
  getHostListGroupId,
  getReservationLateDelayMinutes,
} from './reservationHostStatus'

describe('getHostListCompactStatusLabel', () => {
  it('maps long host statuses to compact list labels', () => {
    expect(getHostListCompactStatusLabel('Late Booking')).toBe('Late')
    expect(getHostListCompactStatusLabel('Checked In')).toBe('Seated')
    expect(getHostListCompactStatusLabel('Walk In')).toBe('Walk-in')
    expect(getHostListCompactStatusLabel('Waiting')).toBe('Arrived')
    expect(getHostListCompactStatusLabel('Not Shown')).toBe('No-show')
    expect(getHostListCompactStatusLabel('Checked Out')).toBe('Completed')
    expect(getHostListCompactStatusLabel('Confirmed')).toBe('Confirmed')
  })
})

describe('getHostListCompactStatusPresentation late duration', () => {
  it('shows late duration in minutes using workspace time helpers', () => {
    const reservation = {
      date: '2026-07-10',
      time: '18:00',
      status: 'Late Booking',
    }

    expect(getReservationLateDelayMinutes(reservation, 19 * 60 + 15, '2026-07-10')).toBe(75)
    expect(getHostListCompactStatusPresentation(reservation, 19 * 60 + 15, '2026-07-10')).toEqual({
      label: 'Late 75m',
      delayMinutes: 75,
      severity: 'severe',
    })
  })

  it('uses mild severity for short delays', () => {
    const reservation = {
      date: '2026-07-10',
      time: '19:00',
      status: 'Late Booking',
    }

    expect(getHostListCompactStatusPresentation(reservation, 19 * 60 + 8, '2026-07-10')).toEqual({
      label: 'Late 8m',
      delayMinutes: 8,
      severity: 'mild',
    })
  })

  it('falls back to Late when duration cannot be calculated safely', () => {
    const reservation = {
      date: '2026-07-10',
      time: '',
      status: 'Late Booking',
    }

    expect(getHostListCompactStatusPresentation(reservation, 19 * 60, '2026-07-10')).toEqual({
      label: 'Late',
      delayMinutes: null,
      severity: null,
    })
  })
})

describe('getHostListCompactStatusPresentation walk-in label', () => {
  it('shows Walk-in for Walk In status while keeping in-house grouping', () => {
    const reservation = {
      date: '2026-07-10',
      time: '19:00',
      status: 'Walk In',
    }

    expect(getHostListGroupId(reservation)).toBe('in-house')
    expect(getHostListCompactStatusPresentation(reservation, 19 * 60, '2026-07-10')).toEqual({
      label: 'Walk-in',
      delayMinutes: null,
      severity: null,
    })
    expect(getHostListCompactStatusLabel('Checked In')).toBe('Seated')
  })
})
