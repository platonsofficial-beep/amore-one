/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HOST_STATION_DESKTOP_MIN_WIDTH,
  isHostStationDesktopViewport,
  isMobileHostSplitViewport,
  shouldShowHostStationPortraitFallback,
} from './mobileHostReservationUtils'
import { shouldShowReservationsHostView } from './permissions'

const appSource = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
const mobileShellCss = readFileSync(resolve(process.cwd(), 'src/mobileShell.css'), 'utf8')
const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8')

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

describe('host station responsive routing', () => {
  beforeEach(() => {
    mockViewport({ width: 1024, height: 768, orientation: 'landscape' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('layout routing', () => {
    it('routes MacBook-sized desktop viewports to split Host Station', () => {
      mockViewport({ width: 1280, height: 800, orientation: 'landscape' })
      expect(isHostStationDesktopViewport()).toBe(true)
      expect(isMobileHostSplitViewport()).toBe(true)
    })

    it('routes Windows laptop-sized desktop viewports to split Host Station', () => {
      mockViewport({ width: 1366, height: 768, orientation: 'landscape' })
      expect(isMobileHostSplitViewport()).toBe(true)
    })

    it('routes large desktop monitors to split Host Station', () => {
      mockViewport({ width: 1920, height: 1080, orientation: 'landscape' })
      expect(isMobileHostSplitViewport()).toBe(true)
    })

    it('keeps iPad landscape on split Host Station', () => {
      mockViewport({ width: 1180, height: 820, orientation: 'landscape' })
      expect(isMobileHostSplitViewport()).toBe(true)
    })

    it('keeps Android tablet landscape on split Host Station', () => {
      mockViewport({ width: 960, height: 600, orientation: 'landscape' })
      expect(isMobileHostSplitViewport()).toBe(true)
    })

    it('keeps supported phone landscape on split Host Station', () => {
      mockViewport({ width: 844, height: 390, orientation: 'landscape' })
      expect(isMobileHostSplitViewport()).toBe(true)
    })

    it('shows portrait fallback on phone portrait instead of simplified host UI', () => {
      mockViewport({ width: 390, height: 844, orientation: 'portrait' })
      expect(shouldShowHostStationPortraitFallback()).toBe(true)
      expect(isMobileHostSplitViewport()).toBe(false)
    })

    it('does not require orientation detection on desktop-class viewports', () => {
      mockViewport({ width: 1440, height: 900, orientation: 'portrait' })
      expect(isHostStationDesktopViewport()).toBe(true)
      expect(isMobileHostSplitViewport()).toBe(true)
    })
  })

  describe('shouldShowReservationsHostView', () => {
    it('renders host view for host role on desktop', () => {
      expect(shouldShowReservationsHostView({
        role: 'host',
        useMobileExperience: false,
        mobileReservationsHostMode: false,
      })).toBe(true)
    })

    it('renders host view for manager role on desktop without mobile host mode', () => {
      expect(shouldShowReservationsHostView({
        role: 'manager',
        useMobileExperience: false,
        mobileReservationsHostMode: false,
      })).toBe(true)
    })

    it('does not select legacy desktop ReservationsView for host-capable roles', () => {
      expect(shouldShowReservationsHostView({
        role: 'owner',
        useMobileExperience: false,
        mobileReservationsHostMode: false,
      })).toBe(true)
      expect(shouldShowReservationsHostView({
        role: 'general_manager',
        useMobileExperience: false,
        mobileReservationsHostMode: false,
      })).toBe(true)
    })

    it('keeps staff on legacy reservations unless mobile host mode is active', () => {
      expect(shouldShowReservationsHostView({
        role: 'staff',
        useMobileExperience: false,
        mobileReservationsHostMode: true,
      })).toBe(false)
    })
  })

  describe('structural parity wiring', () => {
    it('uses one MobileReservationsHostShell for reservations host routing', () => {
      expect(appSource).toContain('shouldRenderReservationsHostView ? (')
      expect(appSource).toContain('<MobileReservationsHostShell')
      expect(appSource).toContain('<ReservationsView')
    })

    it('does not duplicate a separate desktop Host Station component', () => {
      expect(appSource).not.toMatch(/function\s+DesktopReservationsHost/)
      expect(appSource).not.toMatch(/function\s+DesktopHostStation/)
    })

    it('keeps canonical split Host Station classes in mobile shell CSS', () => {
      expect(mobileShellCss).toContain('.mobile-host-reservations-landscape')
      expect(mobileShellCss).toContain('.mobile-host-reservations-list-pane')
      expect(mobileShellCss).toContain('.mobile-host-reservations-detail-pane')
      expect(mobileShellCss).toContain('--host-station-shell-mode: desktop')
    })

    it('bounds desktop left pane width while letting floor plan fill remaining space', () => {
      expect(mobileShellCss).toMatch(/minmax\(280px, clamp\(320px, 34vw, 420px\)\) minmax\(0, 1fr\)/)
      expect(appCss).toContain('.main-panel-reservations .mobile-host-reservations.is-host-mode')
    })

    it('does not disable browser zoom in the HTML shell', () => {
      const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
      expect(indexHtml).not.toMatch(/user-scalable=no/i)
      expect(indexHtml).not.toMatch(/maximum-scale=1/i)
    })
  })

  describe('constants', () => {
    it('uses a desktop split breakpoint aligned with host station CSS', () => {
      expect(HOST_STATION_DESKTOP_MIN_WIDTH).toBe(721)
      expect(mobileShellCss).toContain('@media (min-width: 721px)')
    })
  })
})
