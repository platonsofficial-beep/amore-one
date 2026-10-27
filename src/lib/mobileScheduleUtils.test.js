import { afterEach, describe, expect, it, vi } from 'vitest'

function mockViewport({
  width = 1280,
  height = 800,
  userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  platform = 'MacIntel',
  maxTouchPoints = 0,
  coarsePointer = false,
  forceMobileShell = false,
  landscape = false,
} = {}) {
  const storage = new Map()
  if (forceMobileShell) {
    storage.set('ONE_FORCE_MOBILE_SHELL', '1')
  }

  vi.stubGlobal('window', {
    innerWidth: width,
    innerHeight: height,
    matchMedia: vi.fn((query) => ({
      matches: query === '(pointer: coarse)'
        ? coarsePointer
        : query === '(orientation: landscape)'
          ? landscape
          : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })

  vi.stubGlobal('navigator', {
    userAgent,
    platform,
    maxTouchPoints,
  })

  vi.stubGlobal('sessionStorage', {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  })

  vi.stubGlobal('localStorage', {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  })
}

describe('mobileScheduleUtils', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('detects compact landscape for mobile shell phones in landscape', async () => {
    mockViewport({
      width: 844,
      height: 390,
      landscape: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })

    const { isMobileScheduleCompactLandscape } = await import('./mobileScheduleUtils')
    expect(isMobileScheduleCompactLandscape()).toBe(true)
  })

  it('treats a short wide phone as compact even when the orientation query is still portrait', async () => {
    mockViewport({
      width: 924,
      height: 412,
      landscape: false,
    })
    const { isMobileScheduleCompactLandscape, shouldUseShortScheduleDayNames } = await import('./mobileScheduleUtils')
    expect(isMobileScheduleCompactLandscape()).toBe(true)
    expect(shouldUseShortScheduleDayNames({
      isCompactLandscape: false,
      viewportWidth: 924,
      viewportHeight: 412,
    })).toBe(true)
  })

  it('keeps a short desktop window on full day names', async () => {
    mockViewport({ width: 1400, height: 400, landscape: true })
    const { isMobileScheduleCompactLandscape, shouldUseShortScheduleDayNames } = await import('./mobileScheduleUtils')
    expect(isMobileScheduleCompactLandscape()).toBe(false)
    expect(shouldUseShortScheduleDayNames({
      isCompactLandscape: false,
      viewportWidth: 1400,
      viewportHeight: 400,
    })).toBe(false)
  })

  it('does not use compact landscape on desktop widths', async () => {
    mockViewport({ width: 1440, height: 900, landscape: true })
    const { isMobileScheduleCompactLandscape } = await import('./mobileScheduleUtils')
    expect(isMobileScheduleCompactLandscape()).toBe(false)
  })

  it('does not use compact landscape for mobile shell portrait', async () => {
    mockViewport({
      width: 390,
      height: 844,
      landscape: false,
      maxTouchPoints: 5,
    })
    const { isMobileScheduleCompactLandscape } = await import('./mobileScheduleUtils')
    expect(isMobileScheduleCompactLandscape()).toBe(false)
  })

  it('fits day columns to the viewport when templates are collapsed', async () => {
    const { getScheduleGridDayColumnWidth, getScheduleGridTableMinWidth } = await import('./mobileScheduleUtils')

    const columnWidth = getScheduleGridDayColumnWidth({
      dayCount: 7,
      viewportWidth: 844,
      isCompactLandscape: true,
      isTemplatesPanelOpen: false,
    })

    expect(columnWidth).toBeGreaterThanOrEqual(96)
    expect(columnWidth).toBeLessThan(156)
    expect(getScheduleGridTableMinWidth(7, columnWidth)).toBeLessThanOrEqual(844)
  })

  it('fits seven day columns on iPad Landscape desktop-shell widths without compact mode', async () => {
    const {
      getScheduleGridDayColumnWidth,
      getScheduleGridTableMinWidth,
      shouldUseFluidScheduleDayColumns,
      SCHEDULE_GRID_DEFAULT_DAY_COLUMN_WIDTH,
    } = await import('./mobileScheduleUtils')

    const columnWidth = getScheduleGridDayColumnWidth({
      dayCount: 7,
      viewportWidth: 1024,
      isCompactLandscape: false,
      isTemplatesPanelOpen: false,
    })

    expect(columnWidth).toBeLessThan(SCHEDULE_GRID_DEFAULT_DAY_COLUMN_WIDTH)
    expect(shouldUseFluidScheduleDayColumns(columnWidth)).toBe(true)
    expect(getScheduleGridTableMinWidth(7, columnWidth)).toBeLessThanOrEqual(1024)
  })

  it('fills the schedule grid on wide landscape manager widths', async () => {
    const { shouldFillScheduleGridWidth } = await import('./mobileScheduleUtils')

    expect(shouldFillScheduleGridWidth({ viewportWidth: 1440, isCompactLandscape: false })).toBe(true)
    expect(shouldFillScheduleGridWidth({ viewportWidth: 1180, isCompactLandscape: true })).toBe(true)
  })

  it('keeps narrow portrait column sizing', async () => {
    const {
      getScheduleGridDayColumnWidth,
      shouldFillScheduleGridWidth,
      SCHEDULE_GRID_COMPACT_MIN_DAY_COLUMN_WIDTH,
    } = await import('./mobileScheduleUtils')

    expect(shouldFillScheduleGridWidth({ viewportWidth: 390, isCompactLandscape: false })).toBe(false)
    expect(getScheduleGridDayColumnWidth({
      dayCount: 7,
      viewportWidth: 390,
      isCompactLandscape: false,
      isTemplatesPanelOpen: false,
    })).toBeGreaterThanOrEqual(SCHEDULE_GRID_COMPACT_MIN_DAY_COLUMN_WIDTH)
  })

  it('hides the unpublished-changes banner only when the landscape pill already says so', async () => {
    const { shouldShowScheduleDraftChangesBanner } = await import('./mobileScheduleUtils')

    expect(shouldShowScheduleDraftChangesBanner({
      hasUnpublishedChanges: true,
      isWeekPublished: true,
      isCompactLandscape: true,
    })).toBe(false)
    expect(shouldShowScheduleDraftChangesBanner({
      hasUnpublishedChanges: true,
      isWeekPublished: true,
      isCompactLandscape: false,
    })).toBe(true)
    expect(shouldShowScheduleDraftChangesBanner({
      hasUnpublishedChanges: false,
      isWeekPublished: true,
      isCompactLandscape: false,
    })).toBe(false)
  })

  it('uses a single-line time separator on compact landscape cards', async () => {
    const { getScheduleShiftTimeSeparator } = await import('./mobileScheduleUtils')

    expect(getScheduleShiftTimeSeparator(true)).toBe('–')
    expect(getScheduleShiftTimeSeparator(false)).toBe(' - ')
  })

  it('keeps default column width when templates panel is open', async () => {
    const { getScheduleGridDayColumnWidth, SCHEDULE_GRID_DEFAULT_DAY_COLUMN_WIDTH } = await import('./mobileScheduleUtils')

    expect(getScheduleGridDayColumnWidth({
      dayCount: 7,
      viewportWidth: 844,
      isCompactLandscape: true,
      isTemplatesPanelOpen: true,
    })).toBe(SCHEDULE_GRID_DEFAULT_DAY_COLUMN_WIDTH)
  })
})
