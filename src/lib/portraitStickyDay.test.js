import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatPortraitStickyDay } from '../components/mobile/MobileManagerReservationsView.jsx'

const css = readFileSync(new URL('../safeOverlay.css', import.meta.url), 'utf8')
const picker = readFileSync(new URL('../components/reservations/HostReservationStatusPicker.jsx', import.meta.url), 'utf8')

describe('portrait sticky day bar', () => {
  it('formats the day as "Mon 2 Nov"', () => {
    expect(formatPortraitStickyDay('2026-11-02')).toBe('Mon 2 Nov')
  })
  it('pins below the portrait band, portrait only', () => {
    expect(css).toMatch(/\.manager-portrait-sticky-day\s*\{\s*display:\s*none/)
    expect(css).toMatch(/top:\s*var\(--one-portrait-band/)
  })
})

describe('status picker', () => {
  it('keeps the anchor pill below the panel', () => {
    expect(picker).toMatch(/zIndex:\s*PICKER_Z_INDEX - 1/)
  })
  it('fits the panel to the viewport and lets the list scroll', () => {
    expect(css).toMatch(/\.host-status-picker\.is-portal[^{]*\{[^}]*max-height:\s*calc\(var\(--vvh, 100dvh\) - 16px\)/)
  })
})
