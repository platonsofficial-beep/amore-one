import { shouldUseMobileShell } from './viewportUtils'

export const SCHEDULE_GRID_DAY_GAP_PX = 6
export const SCHEDULE_GRID_DEFAULT_DAY_COLUMN_WIDTH = 156
export const SCHEDULE_GRID_COMPACT_MIN_DAY_COLUMN_WIDTH = 96
export const SCHEDULE_GRID_COMPACT_MAX_DAY_COLUMN_WIDTH = 132

/** Chrome reserved when fitting columns to a full-window Schedule focus layout. */
export const SCHEDULE_GRID_FIT_HORIZONTAL_PADDING_PX = 56
export const SCHEDULE_GRID_FIT_TOGGLE_RESERVE_PX = 12

export function isMobileLandscapeOrientation() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(orientation: landscape)')?.matches
    ?? window.innerWidth > window.innerHeight
}

export function isMobileScheduleCompactLandscape() {
  if (typeof window === 'undefined') return false
  const width = window.innerWidth || 0
  const height = window.innerHeight || 0
  // A short wide phone is compact even when the orientation media query is
  // still portrait, and even when the manager is on the workspace shell.
  if (height > 0 && height <= 460 && width > height && width <= 1100) return true
  if (!shouldUseMobileShell()) return false
  return isMobileLandscapeOrientation()
}

export function shouldUseShortScheduleDayNames({
  isCompactLandscape = false,
  viewportWidth = 0,
  viewportHeight = 0,
} = {}) {
  if (isCompactLandscape) return true
  if (viewportWidth > 0 && viewportWidth <= 900) return true
  return viewportWidth > 0
    && viewportWidth <= 1100
    && viewportHeight > 0
    && viewportHeight <= 460
}

function resolveViewportWidth(viewportWidth = 0) {
  if (viewportWidth > 0) return viewportWidth
  if (typeof window !== 'undefined') return window.innerWidth
  return 844
}

function fitDayColumnWidth(dayCount, availableWidth) {
  const gaps = Math.max(0, dayCount - 1) * SCHEDULE_GRID_DAY_GAP_PX
  return Math.floor((Math.max(0, availableWidth) - gaps) / Math.max(1, dayCount))
}

/**
 * Presentational day-column width for the Schedule grid.
 * Fits seven equal columns into the available viewport whenever the default
 * width would force horizontal overflow (iPad Landscape golden target).
 */
export function getScheduleGridDayColumnWidth({
  dayCount = 7,
  viewportWidth = 0,
  isCompactLandscape = false,
  isTemplatesPanelOpen = false,
  horizontalPadding = SCHEDULE_GRID_FIT_HORIZONTAL_PADDING_PX,
  toggleReserve = SCHEDULE_GRID_FIT_TOGGLE_RESERVE_PX,
} = {}) {
  if (isTemplatesPanelOpen) {
    return SCHEDULE_GRID_DEFAULT_DAY_COLUMN_WIDTH
  }

  const width = resolveViewportWidth(viewportWidth)
  const available = Math.max(0, width - horizontalPadding - toggleReserve)
  const gaps = Math.max(0, dayCount - 1) * SCHEDULE_GRID_DAY_GAP_PX
  const defaultTableWidth = dayCount * SCHEDULE_GRID_DEFAULT_DAY_COLUMN_WIDTH + gaps
  const fitted = fitDayColumnWidth(dayCount, available)

  if (isCompactLandscape) {
    return Math.max(
      SCHEDULE_GRID_COMPACT_MIN_DAY_COLUMN_WIDTH,
      Math.min(SCHEDULE_GRID_COMPACT_MAX_DAY_COLUMN_WIDTH, fitted),
    )
  }

  // Desktop / iPad Landscape (desktop shell): shrink columns only when needed.
  if (available > 0 && defaultTableWidth > available) {
    return Math.max(
      SCHEDULE_GRID_COMPACT_MIN_DAY_COLUMN_WIDTH,
      Math.min(SCHEDULE_GRID_DEFAULT_DAY_COLUMN_WIDTH, fitted),
    )
  }

  return SCHEDULE_GRID_DEFAULT_DAY_COLUMN_WIDTH
}

export function getScheduleGridTableMinWidth(dayCount, columnWidth) {
  return dayCount * columnWidth + Math.max(0, dayCount - 1) * SCHEDULE_GRID_DAY_GAP_PX
}

/**
 * True when the schedule grid should use fluid equal columns that fill the
 * scrollport (no forced horizontal overflow for a standard week).
 */
export function shouldUseFluidScheduleDayColumns(columnWidth) {
  return Number(columnWidth) < SCHEDULE_GRID_DEFAULT_DAY_COLUMN_WIDTH
}

/**
 * Landscape manager and desktop schedule grids grow to the available width.
 * A narrow portrait width keeps the existing column sizing so the staff
 * portrait schedule is unchanged.
 */
export function shouldFillScheduleGridWidth({
  viewportWidth = 0,
  isCompactLandscape = false,
} = {}) {
  if (isCompactLandscape) return true
  if (!(viewportWidth > 0)) return true
  return viewportWidth >= 760
}

/** Phone/tablet landscape already shows a Draft changes pill, so the banner is redundant. */
export function shouldShowScheduleDraftChangesBanner({
  hasUnpublishedChanges = false,
  isWeekPublished = false,
  isCompactLandscape = false,
} = {}) {
  return Boolean(hasUnpublishedChanges && isWeekPublished && !isCompactLandscape)
}

/** En dash keeps the range on one card line. Desktop keeps the spaced hyphen. */
export function getScheduleShiftTimeSeparator(isCompactLandscape = false) {
  return isCompactLandscape ? '–' : ' - '
}
