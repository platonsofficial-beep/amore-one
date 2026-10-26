export const SCHEDULE_ACTION_MENU_GAP = 6
export const SCHEDULE_ACTION_MENU_MARGIN = 8

export function placeScheduleActionMenu({
  anchorRect,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  gap = SCHEDULE_ACTION_MENU_GAP,
  margin = SCHEDULE_ACTION_MENU_MARGIN,
}) {
  const width = Math.max(0, Number(menuWidth) || 0)
  const height = Math.max(0, Number(menuHeight) || 0)
  const spaceBelow = viewportHeight - anchorRect.bottom - gap - margin
  const spaceAbove = anchorRect.top - gap - margin
  const placement = height > spaceBelow && spaceAbove > spaceBelow ? 'above' : 'below'
  const maxHeight = Math.max(0, viewportHeight - margin * 2)
  const fittedHeight = Math.min(height, maxHeight)

  let top = placement === 'above'
    ? anchorRect.top - fittedHeight - gap
    : anchorRect.bottom + gap
  const maxTop = Math.max(margin, viewportHeight - margin - fittedHeight)
  top = Math.min(Math.max(top, margin), maxTop)

  let left = anchorRect.right - width
  const maxLeft = Math.max(margin, viewportWidth - margin - width)
  left = Math.min(Math.max(left, margin), maxLeft)

  return { top, left, placement, maxHeight }
}

export function isScrollInsideMenu(event, panel) {
  if (!panel) return false
  const target = event.target
  if (target instanceof Node && panel.contains(target)) return true
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  return path.includes(panel)
}
