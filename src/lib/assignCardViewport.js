/** iOS form accessory (previous / next / Done) drawn over the visual viewport. */
export const ASSIGN_CARD_KEYBOARD_ACCESSORY_PX = 44

function isAssignFilterFocused(win) {
  const active = win.document?.activeElement
  if (!active || typeof active.closest !== 'function') return false
  return Boolean(active.closest('.schedule-assignment-modal .assignment-card-filters'))
}

/**
 * Place the assign card in the visible viewport.
 * A keyboard shrinks that viewport; the accessory bar needs extra clearance
 * so it does not cover names. A checkbox or a closed card does not.
 */
export function readAssignCardViewport(win = globalThis.window) {
  const innerWidth = Number(win?.innerWidth) || 0
  const innerHeight = Number(win?.innerHeight) || 0
  const visual = win?.visualViewport
  const width = Number(visual?.width) || innerWidth
  const height = Number(visual?.height) || innerHeight
  const offsetTop = Math.max(0, Number(visual?.offsetTop) || 0)
  const sameWidth = Math.abs(width - innerWidth) <= 2
  const below = sameWidth ? Math.max(0, Math.round(innerHeight - height - offsetTop)) : 0
  const keyboard = below >= 80 && sameWidth && isAssignFilterFocused(win)
  return {
    top: sameWidth ? Math.round(offsetTop) : 0,
    kb: below + (keyboard ? ASSIGN_CARD_KEYBOARD_ACCESSORY_PX : 0),
    keyboard,
  }
}
