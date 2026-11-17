import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')
const overlayCss = readFileSync(new URL('../safeOverlay.css', import.meta.url), 'utf8')

describe('stock tab row on a short landscape phone', () => {
  it('keeps the row clear of the floating Help button and fades only when it overflows', () => {
    expect(appCss).not.toContain('width: calc(100% - 56px)')
    expect(appCss).toContain('padding-inline-end: calc(64px + var(--one-safe-area-right, env(safe-area-inset-right, 0px)))')
    expect(appCss).toContain(".module-section-tabs[data-overflow='true']")
    expect(appCss).toContain('linear-gradient(to left, transparent, black 32px)')
    expect(overlayCss).toContain('padding-inline-end: calc(64px + var(--one-safe-area-right, env(safe-area-inset-right, 0px)))')
    expect(overlayCss).not.toContain('padding-inline-end: 48px')
  })
})
