import { describe, expect, it } from 'vitest'
import { formatHostListMetaLine } from '../components/reservations/hostReservationListHelpers'

describe('formatHostListMetaLine', () => {
  it('formats assigned tables as count • table label', () => {
    expect(formatHostListMetaLine(4, 'T15 + T16')).toBe('4 • T15 + T16')
  })

  it('formats unassigned rows as count • Unassigned', () => {
    expect(formatHostListMetaLine(4, '—')).toBe('4 • Unassigned')
    expect(formatHostListMetaLine(4, '')).toBe('4 • Unassigned')
  })
})
