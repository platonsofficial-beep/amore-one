/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isHostStationDesktopViewport,
  isHostTabletPanelViewport,
  isMobileHostSplitViewport,
  resolveHostReservationFormVariant,
  shouldShowHostStationPortraitFallback,
} from './mobileHostReservationUtils'
import {
  shouldUseHostStationLanding,
  shouldUseHostStationShell,
} from './permissions'

function mockViewport({ width, height, orientation = null }) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  })

  window.matchMedia = vi.fn((query) => ({
    matches: orientation
      ? query.includes(orientation)
      : (query.includes('landscape') ? width >= height : width < height),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

describe('mobileHostReservationUtils', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses inline create/edit forms on split tablet landscape', () => {
    expect(resolveHostReservationFormVariant({ isSplitLayout: true })).toBe('inline')
  })

  it('uses panel forms on tablet portrait widths', () => {
    expect(resolveHostReservationFormVariant({ isSplitLayout: false })).toBe(
      isHostTabletPanelViewport() ? 'panel' : 'sheet',
    )
  })

  it('treats desktop-class viewports as split Host Station without orientation checks', () => {
    mockViewport({ width: 1280, height: 800, orientation: 'portrait' })
    expect(isHostStationDesktopViewport()).toBe(true)
    expect(isMobileHostSplitViewport()).toBe(true)
  })

  it('shows portrait fallback only on narrow phone portrait', () => {
    mockViewport({ width: 390, height: 844, orientation: 'portrait' })
    expect(shouldShowHostStationPortraitFallback()).toBe(true)

    mockViewport({ width: 1280, height: 800, orientation: 'portrait' })
    expect(shouldShowHostStationPortraitFallback()).toBe(false)
  })
})

describe('host station shell', () => {
  it('forces host station shell for host role on any viewport', () => {
    expect(shouldUseHostStationShell('host')).toBe(true)
    expect(shouldUseHostStationShell('manager')).toBe(false)
    expect(shouldUseHostStationShell('staff')).toBe(false)
  })

  it('lands host accounts on host tab regardless of mobile breakpoint', () => {
    expect(shouldUseHostStationLanding('host')).toBe(true)
    expect(shouldUseHostStationLanding('staff')).toBe(false)
  })
})
