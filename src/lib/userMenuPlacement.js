export const USER_MENU_GAP = 8
export const USER_MENU_MARGIN = 8
export const USER_MENU_MAX_WIDTH = 320

function numberOrZero(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Anchor the avatar menu to the trigger and keep it inside the viewport.
 * The side with more free space is used so a tall page header cannot clip Logout.
 */
export function placeUserMenuPanel(triggerRect, viewport, options = {}) {
  const gap = options.gap ?? USER_MENU_GAP
  const margin = options.margin ?? USER_MENU_MARGIN
  const maxWidth = options.maxWidth ?? USER_MENU_MAX_WIDTH
  const width = Math.max(0, numberOrZero(viewport?.width))
  const height = Math.max(0, numberOrZero(viewport?.height))
  const safeTop = Math.max(0, numberOrZero(viewport?.safeTop))
  const safeBottom = Math.max(0, numberOrZero(viewport?.safeBottom))
  const safeLeft = Math.max(0, numberOrZero(viewport?.safeLeft))
  const safeRight = Math.max(0, numberOrZero(viewport?.safeRight))
  const topEdge = margin + safeTop
  const bottomEdge = Math.max(topEdge, height - margin - safeBottom)
  const leftEdge = Math.max(margin, safeLeft)
  const rightEdge = Math.max(margin, safeRight)
  const triggerTop = numberOrZero(triggerRect?.top)
  const triggerBottom = numberOrZero(triggerRect?.bottom ?? triggerTop)
  const triggerRight = numberOrZero(triggerRect?.right ?? width)
  const spaceBelow = Math.max(0, bottomEdge - triggerBottom - gap)
  const spaceAbove = Math.max(0, triggerTop - topEdge - gap)
  const placeBelow = spaceBelow >= spaceAbove
  const viewportCap = Math.max(0, height - (margin * 2) - safeTop - safeBottom)
  const maxHeight = Math.min(placeBelow ? spaceBelow : spaceAbove, viewportCap)
  const menuWidth = Math.min(maxWidth, Math.max(0, width - leftEdge - rightEdge))
  const minLeft = leftEdge
  const maxLeft = Math.max(minLeft, width - rightEdge - menuWidth)
  const left = Math.min(Math.max(triggerRight - menuWidth, minLeft), maxLeft)
  const top = placeBelow
    ? Math.min(triggerBottom + gap, Math.max(topEdge, bottomEdge - maxHeight))
    : Math.max(topEdge, triggerTop - gap - maxHeight)

  return {
    top: Math.round(top),
    left: Math.round(left),
    width: Math.round(menuWidth),
    maxHeight: Math.max(0, Math.round(maxHeight)),
    placement: placeBelow ? 'below' : 'above',
  }
}
