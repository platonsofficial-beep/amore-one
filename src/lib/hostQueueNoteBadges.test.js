import { describe, expect, it } from 'vitest'
import {
  deriveHostQueueNoteBadges,
  getReservationEditableNotesText,
  getReservationUserNotesText,
  summarizeHostQueueNoteBadges,
} from './hostQueueNoteBadges'

describe('hostQueueNoteBadges', () => {
  it('derives deterministic note badges from aliases', () => {
    const badges = deriveHostQueueNoteBadges({
      notes: 'Birthday dinner, guest has a nut allergy and needs a high chair',
    })

    expect(badges.map((badge) => badge.label)).toEqual([
      'Baby chair',
      '⚠ Allergy',
      '🎂 Birthday',
    ])
  })

  it('deduplicates equivalent badges', () => {
    const badges = deriveHostQueueNoteBadges({
      notes: 'VIP guest, very important VIP table please',
    })

    expect(badges.filter((badge) => badge.label === 'VIP')).toHaveLength(1)
  })

  it('suppresses note extra-chair badge when structured extra chairs exist', () => {
    const badges = deriveHostQueueNoteBadges(
      { notes: 'Need an extra chair near the window' },
      { extraChairs: 1, structuredBadgeIds: ['extra-chair'] },
    )

    expect(badges.some((badge) => badge.label === '🪑 Extra chair')).toBe(false)
    expect(badges.some((badge) => badge.label === 'Window')).toBe(true)
  })

  it('limits visible badges to two and exposes overflow count', () => {
    const badges = deriveHostQueueNoteBadges({
      notes: 'VIP birthday guest with allergy, wheelchair access, and window request',
    })
    const summary = summarizeHostQueueNoteBadges(badges)

    expect(summary.visible).toHaveLength(2)
    expect(summary.overflowCount).toBeGreaterThan(0)
  })

  it('strips serialized seating metadata from note search text', () => {
    const notes = 'Guest prefers patio\n@@SEATING@@{"assignedUnits":[{"id":"t10","label":"T10"}]}'
    expect(getReservationUserNotesText(notes)).toBe('Guest prefers patio')
  })

  it('strips internal customer and walk-in markers from editable notes', () => {
    const notes = 'Birthday table\nwalk-in\n@@CUSTOMER@@VIP'
    expect(getReservationEditableNotesText(notes)).toBe('Birthday table')
  })
})
