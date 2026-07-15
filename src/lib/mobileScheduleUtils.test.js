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

  it('keeps default column width on wide desktop viewports', async () => {
    const {
      getScheduleGridDayColumnWidth,
      shouldUseFluidScheduleDayColumns,
      SCHEDULE_GRID_DEFAULT_DAY_COLUMN_WIDTH,
    } = await import('./mobileScheduleUtils')

    const columnWidth = getScheduleGridDayColumnWidth({
      dayCount: 7,
      viewportWidth: 1440,
      isCompactLandscape: false,
      isTemplatesPanelOpen: false,
    })

    expect(columnWidth).toBe(SCHEDULE_GRID_DEFAULT_DAY_COLUMN_WIDTH)
    expect(shouldUseFluidScheduleDayColumns(columnWidth)).toBe(false)
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
