import { shouldUseMobileShell } from './viewportUtils'

export const SCHEDULE_GRID_DAY_GAP_PX = 6
export const SCHEDULE_GRID_DEFAULT_DAY_COLUMN_WIDTH = 156
export const SCHEDULE_GRID_COMPACT_MIN_DAY_COLUMN_WIDTH = 96
export const SCHEDULE_GRID_COMPACT_MAX_DAY_COLUMN_WIDTH = 132

export function isMobileLandscapeOrientation() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(orientation: landscape)')?.matches
    ?? window.innerWidth > window.innerHeight
}

export function isMobileScheduleCompactLandscape() {
  if (typeof window === 'undefined') return false
  if (!shouldUseMobileShell()) return false
  return isMobileLandscapeOrientation()
}

export function getScheduleGridDayColumnWidth({
  dayCount = 7,
  viewportWidth = 0,
  isCompactLandscape = false,
  isTemplatesPanelOpen = false,
  horizontalPadding = 28,
  toggleReserve = 30,
} = {}) {
  if (!isCompactLandscape || isTemplatesPanelOpen) {
    return SCHEDULE_GRID_DEFAULT_DAY_COLUMN_WIDTH
  }

  const width = viewportWidth > 0
    ? viewportWidth
    : (typeof window !== 'undefined' ? window.innerWidth : 844)

  const available = Math.max(0, width - horizontalPadding - toggleReserve)
  const gaps = Math.max(0, dayCount - 1) * SCHEDULE_GRID_DAY_GAP_PX
  const fitted = Math.floor((available - gaps) / Math.max(1, dayCount))

  return Math.max(
    SCHEDULE_GRID_COMPACT_MIN_DAY_COLUMN_WIDTH,
    Math.min(SCHEDULE_GRID_COMPACT_MAX_DAY_COLUMN_WIDTH, fitted),
  )
}

export function getScheduleGridTableMinWidth(dayCount, columnWidth) {
  return dayCount * columnWidth + Math.max(0, dayCount - 1) * SCHEDULE_GRID_DAY_GAP_PX
}
