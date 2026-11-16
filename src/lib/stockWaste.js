/**
 * Waste is a usage movement with a structured note.
 * No new stock_movements type: record_location_usage already
 * decreases the storage balance and refreshes current_quantity.
 */

export const WASTE_NOTE_PREFIX = 'Waste · '

export const WASTE_REASONS = Object.freeze([
  Object.freeze({ id: 'broken', label: 'Broken' }),
  Object.freeze({ id: 'spilled', label: 'Spilled' }),
  Object.freeze({ id: 'expired', label: 'Expired' }),
  Object.freeze({ id: 'comp', label: 'Comp / on the house' }),
  Object.freeze({ id: 'staff_drink', label: 'Staff drink' }),
  Object.freeze({ id: 'other', label: 'Other' }),
])

export function findWasteReason(reasonId) {
  const id = `${reasonId ?? ''}`.trim()
  return WASTE_REASONS.find((reason) => reason.id === id) ?? null
}

/**
 * @param {string} reasonId
 * @param {string} [note]
 */
export function formatWasteNote(reasonId, note = '') {
  const reason = findWasteReason(reasonId)
  if (!reason) {
    throw new Error('Choose a reason.')
  }
  const extra = `${note ?? ''}`.trim().replace(/\s+/g, ' ')
  if (!extra) return `${WASTE_NOTE_PREFIX}${reason.label}`
  return `${WASTE_NOTE_PREFIX}${reason.label} · ${extra}`
}

export function isWasteNote(note) {
  return `${note ?? ''}`.startsWith(WASTE_NOTE_PREFIX)
}

export function isWasteMovement(movement) {
  return movement?.type === 'usage' && isWasteNote(movement?.note)
}

/**
 * @param {string} note
 * @returns {{ reasonLabel: string, note: string }|null}
 */
export function parseWasteNote(note) {
  const text = `${note ?? ''}`.trim()
  if (!text.startsWith(WASTE_NOTE_PREFIX)) return null
  const body = text.slice(WASTE_NOTE_PREFIX.length)
  const splitAt = body.indexOf(' · ')
  if (splitAt === -1) {
    return { reasonLabel: body, note: '' }
  }
  return {
    reasonLabel: body.slice(0, splitAt),
    note: body.slice(splitAt + 3).trim(),
  }
}
