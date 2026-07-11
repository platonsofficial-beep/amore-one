import { stripCustomerTypeFromNotes } from './reservationCustomerType'
import { stripSeatingAssignmentFromNotes } from './seatingAssignment'

const NOTE_BADGE_RULES = [
  { id: 'extra-chair-note', label: '🪑 Extra chair', patterns: [/extra\s+chair/i, /additional\s+chair/i] },
  { id: 'baby-chair', label: 'Baby chair', patterns: [/high\s+chair/i, /baby\s+chair/i] },
  { id: 'allergy', label: '⚠ Allergy', patterns: [/allerg/i] },
  { id: 'birthday', label: '🎂 Birthday', patterns: [/birthday/i] },
  { id: 'anniversary', label: 'Occasion', patterns: [/anniversary/i] },
  { id: 'accessibility', label: '♿ Accessibility', patterns: [/wheelchair/i, /accessibility/i, /accessible/i] },
  { id: 'window', label: 'Window', patterns: [/\bwindow\b/i] },
  { id: 'vip', label: 'VIP', patterns: [/\bvip\b/i, /\bv\.v\.i\.p\b/i] },
]

export const HOST_QUEUE_NOTE_BADGE_MAX_VISIBLE = 2

const STRUCTURED_BADGE_SUPPRESSION = {
  'extra-chair-note': 'extra-chair',
  'baby-chair': 'baby-chair',
  'allergy': 'allergy',
  'birthday': 'birthday',
  'anniversary': 'occasion',
  'accessibility': 'accessibility',
  'window': 'window',
  'vip': 'vip',
}

export function getReservationUserNotesText(notes = '') {
  return stripCustomerTypeFromNotes(stripSeatingAssignmentFromNotes(notes)).trim()
}

export function deriveHostQueueNoteBadges(
  reservation,
  {
    extraChairs = 0,
    standingGuests = 0,
    structuredBadgeIds = [],
  } = {},
) {
  const userNotes = getReservationUserNotesText(reservation?.notes ?? '')
  const matched = []
  const seenLabels = new Set()

  NOTE_BADGE_RULES.forEach((rule) => {
    const suppressedBy = STRUCTURED_BADGE_SUPPRESSION[rule.id]
    if (suppressedBy && structuredBadgeIds.includes(suppressedBy)) return
    if (!rule.patterns.some((pattern) => pattern.test(userNotes))) return
    if (seenLabels.has(rule.label)) return

    seenLabels.add(rule.label)
    matched.push({ id: rule.id, label: rule.label })
  })

  if (extraChairs > 0 && !structuredBadgeIds.includes('extra-chair')) {
    matched.unshift({ id: 'structured-extra-chair', label: '🪑 Extra chair' })
  }

  if (standingGuests > 0 && !structuredBadgeIds.includes('standing-guests')) {
    matched.unshift({ id: 'structured-standing', label: `Standing +${standingGuests}` })
  }

  const deduped = []
  const used = new Set()
  matched.forEach((badge) => {
    if (used.has(badge.label)) return
    used.add(badge.label)
    deduped.push(badge)
  })

  return deduped
}

export function summarizeHostQueueNoteBadges(badges = [], maxVisible = HOST_QUEUE_NOTE_BADGE_MAX_VISIBLE) {
  const visible = badges.slice(0, maxVisible)
  const overflowCount = Math.max(0, badges.length - visible.length)
  return { visible, overflowCount }
}
